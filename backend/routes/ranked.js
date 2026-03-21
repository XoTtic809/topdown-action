// routes/ranked.js
const express = require('express');
const router  = express.Router();
const { query, withTransaction } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const TIER_ORDER = ['bronze','silver','gold','platinum','diamond','master','grandmaster','apex','sovereign'];
const TIER_CONFIG = {
  bronze:      { rpPerDiv: 25,   hasDivisions: true  },
  silver:      { rpPerDiv: 30,   hasDivisions: true  },
  gold:        { rpPerDiv: 40,   hasDivisions: true  },
  platinum:    { rpPerDiv: 50,   hasDivisions: true  },
  diamond:     { rpPerDiv: 75,   hasDivisions: true  },
  master:      { rpPerDiv: 150,  hasDivisions: false },
  grandmaster: { rpPerDiv: 200,  hasDivisions: false },
  apex:        { rpPerDiv: null,  hasDivisions: false },
  sovereign:   { rpPerDiv: null,  hasDivisions: false },
};

// GET /api/ranked/profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM ranked_profiles WHERE uid = $1', [req.user.uid]);
    if (rows.length === 0) {
      return res.json({ tier:'bronze', division:5, rp:0, peak_tier:'bronze', peak_division:5, wins:0, losses:0, streak:0, promo_protect:false });
    }
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load ranked profile' });
  }
});

// POST /api/ranked/submit
router.post('/submit', requireAuth, async (req, res) => {
  const { wavesCleared, rpDelta, won } = req.body;
  if (typeof wavesCleared !== 'number' || typeof rpDelta !== 'number' || typeof won !== 'boolean') {
    return res.status(400).json({ error: 'Invalid submission' });
  }
  if (Math.abs(rpDelta) > 500) return res.status(400).json({ error: 'RP delta out of range' });

  try {
    const uid = req.user.uid;
    const result = await withTransaction(async (client) => {
      let { rows } = await client.query('SELECT * FROM ranked_profiles WHERE uid = $1', [uid]);
      let profile;
      if (rows.length === 0) {
        await client.query('INSERT INTO ranked_profiles (uid) VALUES ($1)', [uid]);
        profile = { tier:'bronze', division:5, rp:0, peak_tier:'bronze', peak_division:5, wins:0, losses:0, streak:0, promo_protect:false };
      } else {
        profile = rows[0];
      }

      let { tier, division, rp, peak_tier, peak_division, wins, losses, streak, promo_protect } = profile;
      const prevTier     = tier;
      const prevDivision = division;

      // Sovereign players are treated as Apex for RP math
      const effectiveTier = tier === 'sovereign' ? 'apex' : tier;

      // Promotion protection: first loss after promotion costs 0 RP
      let actualDelta = rpDelta;
      if (!won && promo_protect) {
        actualDelta = 0;
        promo_protect = false;
      }

      rp = Math.round(rp + actualDelta);
      const cfg = TIER_CONFIG[effectiveTier] || TIER_CONFIG.bronze;
      let tierChanged     = false;
      let divisionChanged = false;

      // ── Promotion ─────────────────────────────────────────────
      // Sovereign is never reached via normal promotion — capped at Apex.
      if (cfg.rpPerDiv !== null && rp >= cfg.rpPerDiv) {
        rp -= cfg.rpPerDiv;
        if (cfg.hasDivisions && division > 1) {
          division--;           // e.g. V(5) → IV(4)
          divisionChanged = true;
        } else {
          const idx = TIER_ORDER.indexOf(effectiveTier);
          // Cap promotion at Apex (index 7). Sovereign (index 8) is auto-assigned.
          if (idx < TIER_ORDER.indexOf('apex')) {
            const nextTier = TIER_ORDER[idx + 1];
            tier      = nextTier;
            const nc  = TIER_CONFIG[nextTier];
            division  = nc.hasDivisions ? 5 : 1;
            rp        = 0;
            tierChanged     = true;
            divisionChanged = true;
            promo_protect   = true;
          } else {
            rp = Math.min(rp + cfg.rpPerDiv, 9999); // Apex: accumulate
          }
        }
      }

      // ── Demotion ──────────────────────────────────────────────
      if (rp < 0) {
        // Sovereign demotes to Apex (not Grandmaster)
        if (tier === 'sovereign') {
          tier = 'apex';
          rp   = 75;
          tierChanged     = true;
          divisionChanged = true;
        } else if (tier === 'bronze' && division === 5) {
          rp = 0; // floor: Bronze V cannot demote
        } else if (cfg.hasDivisions && division < 5) {
          division++;   // e.g. III(3) → IV(4)
          rp = 75;
          divisionChanged = true;
        } else {
          // At lowest division of this tier OR no-division tier → drop to previous tier
          const idx = TIER_ORDER.indexOf(effectiveTier);
          if (idx > 0) {
            tier     = TIER_ORDER[idx - 1];
            const pc = TIER_CONFIG[tier];
            division = pc.hasDivisions ? 1 : 1; // land at highest division of prev tier
            rp       = 75;
            tierChanged     = true;
            divisionChanged = true;
          } else {
            rp = 0;
          }
        }
      }

      // ── Wins / losses / streak ────────────────────────────────
      if (won) { wins++; streak++; } else { losses++; streak = 0; }

      // ── Peak rank ─────────────────────────────────────────────
      const newIdx  = TIER_ORDER.indexOf(tier);
      const peakIdx = TIER_ORDER.indexOf(peak_tier);
      let peakUpdated = false;
      if (newIdx > peakIdx || (newIdx === peakIdx && TIER_CONFIG[tier]?.hasDivisions && division < peak_division)) {
        peak_tier     = tier;
        peak_division = division;
        peakUpdated   = true;
      }

      await client.query(`
        INSERT INTO ranked_profiles
          (uid, tier, division, rp, peak_tier, peak_division, wins, losses, streak, promo_protect, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (uid) DO UPDATE SET
          tier=$2, division=$3, rp=$4, peak_tier=$5, peak_division=$6,
          wins=$7, losses=$8, streak=$9, promo_protect=$10, updated_at=NOW()
      `, [uid, tier, division, rp, peak_tier, peak_division, wins, losses, streak, promo_protect]);

      // ── Sovereign reconciliation ────────────────────────────────
      // Only #1 Apex player (by RP) gets Sovereign. Runs after every submit.
      // 1. Find current sovereign (if any)
      // 2. Find #1 apex player by RP
      // 3. If #1 apex has more RP than current sovereign, swap them
      const { rows: sovRows } = await client.query(
        `SELECT uid, rp FROM ranked_profiles WHERE tier = 'sovereign' LIMIT 1`
      );
      const currentSovereign = sovRows[0] || null;

      const { rows: topApex } = await client.query(
        `SELECT uid, rp FROM ranked_profiles WHERE tier = 'apex' ORDER BY rp DESC LIMIT 1`
      );
      const topApexPlayer = topApex[0] || null;

      // Determine who should be sovereign
      if (topApexPlayer) {
        const topApexRp = topApexPlayer.rp;
        const sovRp     = currentSovereign ? currentSovereign.rp : -1;

        if (!currentSovereign) {
          // No sovereign exists — promote #1 apex
          await client.query(`UPDATE ranked_profiles SET tier = 'sovereign' WHERE uid = $1`, [topApexPlayer.uid]);
          if (topApexPlayer.uid === uid) { tier = 'sovereign'; tierChanged = true; }
        } else if (topApexRp > sovRp) {
          // An apex player overtook the current sovereign
          await client.query(`UPDATE ranked_profiles SET tier = 'apex' WHERE uid = $1`, [currentSovereign.uid]);
          await client.query(`UPDATE ranked_profiles SET tier = 'sovereign' WHERE uid = $1`, [topApexPlayer.uid]);
          if (topApexPlayer.uid === uid) { tier = 'sovereign'; tierChanged = true; }
          if (currentSovereign.uid === uid) { tier = 'apex'; tierChanged = true; }
        }
      } else if (currentSovereign && !topApexPlayer) {
        // Sovereign is the only one at the top — they stay sovereign
      }

      return {
        tier, division, rp, peak_tier, peak_division, wins, losses, streak,
        tier_changed: tierChanged, division_changed: divisionChanged,
        peak_updated: peakUpdated, promo_protect,
        prev_tier: prevTier, prev_division: prevDivision,
        rp_delta: actualDelta,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('[Ranked] submit error:', err.message);
    return res.status(500).json({ error: 'Failed to submit ranked result' });
  }
});

// ── ADMIN ROUTES ──────────────────────────────────────────────────────────────

const { requireAdmin } = require('../middleware/auth');

// GET /api/ranked/admin/profile/:uid  (admin)
router.get('/admin/profile/:uid', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT rp.*, u.username
      FROM ranked_profiles rp
      JOIN users u ON u.uid = rp.uid
      WHERE rp.uid = $1
    `, [req.params.uid]);
    if (rows.length === 0) return res.json(null);
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch ranked profile' });
  }
});

// POST /api/ranked/admin/set  (admin)  body: { uid, tier, division, rp }
router.post('/admin/set', requireAuth, requireAdmin, async (req, res) => {
  const { uid, tier, division, rp } = req.body;
  if (!uid || !TIER_ORDER.includes(tier)) return res.status(400).json({ error: 'Invalid fields' });
  const safeDiv = Math.max(1, Math.min(5, parseInt(division) || 1));
  const safeRp  = Math.max(0, Math.min(9999, parseInt(rp) || 0));
  try {
    await query(`
      INSERT INTO ranked_profiles (uid, tier, division, rp, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (uid) DO UPDATE SET tier=$2, division=$3, rp=$4, updated_at=NOW()
    `, [uid, tier, safeDiv, safeRp]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to set ranked profile' });
  }
});

// DELETE /api/ranked/admin/reset/:uid  (admin)
router.delete('/admin/reset/:uid', requireAuth, requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM ranked_profiles WHERE uid = $1', [req.params.uid]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset ranked profile' });
  }
});

// GET /api/ranked/admin/leaderboard  (admin – includes banned users)
router.get('/admin/leaderboard', requireAuth, requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const { rows } = await query(`
      SELECT rp.uid, u.username, u.is_banned, rp.tier, rp.division, rp.rp,
             rp.wins, rp.losses, rp.streak, rp.peak_tier, rp.peak_division, rp.updated_at
      FROM ranked_profiles rp
      JOIN users u ON u.uid = rp.uid
      ORDER BY
        ARRAY_POSITION(ARRAY['bronze','silver','gold','platinum','diamond','master','grandmaster','apex','sovereign']::TEXT[], rp.tier) DESC,
        rp.division ASC,
        rp.rp DESC
      LIMIT $1
    `, [limit]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load ranked leaderboard' });
  }
});

// GET /api/ranked/leaderboard?limit=50
router.get('/leaderboard', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  try {
    const { rows } = await query(`
      SELECT rp.uid, u.username, rp.tier, rp.division, rp.rp,
             rp.wins, rp.losses, rp.peak_tier, rp.peak_division
      FROM ranked_profiles rp
      JOIN users u ON u.uid = rp.uid
      WHERE u.is_banned = FALSE
      ORDER BY
        ARRAY_POSITION(ARRAY['bronze','silver','gold','platinum','diamond','master','grandmaster','apex','sovereign']::TEXT[], rp.tier) DESC,
        rp.division ASC,
        rp.rp DESC
      LIMIT $1
    `, [limit]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load ranked leaderboard' });
  }
});

module.exports = router;
