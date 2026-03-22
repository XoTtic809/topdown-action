// routes/profile.js
const express  = require('express');
const router   = express.Router();
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// Rarity ranking for computing "rarest skin owned"
const RARITY_RANK = { common:0, uncommon:1, rare:2, epic:3, legendary:4, mythic:5 };

// Skin → rarity lookup (covers all crate/shop skins with non-common rarity)
const SKIN_RARITY = {
  // Legendary / Mythic shop skins
  rainbow:'mythic', galaxy:'mythic', void:'mythic', quantum:'mythic',
  celestial:'mythic', sovereign_skin:'mythic',
  sunset:'legendary', phoenix:'legendary', diamond_skin:'legendary',
  // Champion skins
  'gold-champion':'legendary', 'silver-champion':'epic', 'bronze-champion':'rare',
  // Icon skins (epic)
  icon_noah_brown:'epic', icon_keegan_baseball:'epic', icon_dpoe_fade:'epic',
  icon_caden_curly:'epic', icon_jake_tall:'epic', icon_shawn_black:'epic',
  icon_damien_box:'epic', icon_mason_fade:'epic', icon_evan_bald:'epic',
  // Oblivion crate (legendary / mythic)
  ob_duskblade:'legendary', ob_soulreaper:'legendary',
  ob_worldeater:'mythic', ob_eternium:'mythic',
  // Legendary crate skins
  c_aurora:'legendary', c_neon:'legendary', c_glitch:'legendary',
  // Epic crate skins
  c_static:'epic', c_rust:'epic', c_prism:'epic', c_lava:'epic',
  // Battle pass
  bp1_striker:'epic', bp1_guardian:'epic', bp1_phantom:'legendary',
  transcendence:'mythic',
};

function getSkinRarity(skinId) {
  // Strip mutation suffix (e.g. skinId__PRISMATIC → skinId)
  const base = skinId.split('__')[0];
  return SKIN_RARITY[base] || 'common';
}

function computeRarestSkin(ownedSkins) {
  let bestRank = -1;
  let bestId   = null;
  for (const s of ownedSkins) {
    const rank = RARITY_RANK[getSkinRarity(s)] ?? 0;
    if (rank > bestRank) { bestRank = rank; bestId = s; }
  }
  return bestId;
}

function computeFavoriteSkin(skinPlayCounts) {
  const entries = Object.entries(skinPlayCounts || {});
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

// Strip HTML tags + enforce max length for bio
function sanitizeBio(raw) {
  if (!raw) return null;
  return String(raw).replace(/<[^>]*>/g, '').trim().slice(0, 120) || null;
}

// ─── Ensure profile row + default unlocks exist ───────────────────────────────
async function ensureProfileExists(uid) {
  await query(
    `INSERT INTO player_profiles (uid) VALUES ($1) ON CONFLICT DO NOTHING`,
    [uid]
  );
  await query(`
    INSERT INTO player_unlocks (uid, unlockable_id) VALUES
      ($1,'bg_default'), ($1,'border_default'), ($1,'title_newcomer')
    ON CONFLICT DO NOTHING
  `, [uid]);
}

// ─── Build full profile response ──────────────────────────────────────────────
async function buildProfileResponse(uid, isOwn) {
  const [userRes, profileRes, statsRes, rankedRes, unlocksRes] = await Promise.all([
    query(`SELECT uid, username, owned_skins, active_skin, created_at FROM users WHERE uid = $1`, [uid]),
    query(`SELECT * FROM player_profiles WHERE uid = $1`, [uid]),
    query(`SELECT * FROM player_stats WHERE uid = $1`, [uid]),
    query(`SELECT tier, division, rp, peak_tier, peak_division, wins, losses, streak FROM ranked_profiles WHERE uid = $1`, [uid]),
    isOwn
      ? query(`SELECT unlockable_id FROM player_unlocks WHERE uid = $1`, [uid])
      : Promise.resolve({ rows: [] }),
  ]);

  const user = userRes.rows[0];
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const profile = profileRes.rows[0] || {
    card_background: 'bg_default', card_border: 'border_default',
    card_accent_color: '#4a9eff', card_title: null, title_override: null,
    showcase_skin: null, showcase_badge_1: null, showcase_badge_2: null,
    showcase_badge_3: null, bio: null, custom_title_text: null,
    card_visibility: 'public',
  };

  const stats  = statsRes.rows[0] || {};
  const ranked = rankedRes.rows[0] || {
    tier: 'bronze', division: 5, rp: 0,
    peak_tier: 'bronze', peak_division: 5,
    wins: 0, losses: 0, streak: 0,
  };

  const ownedSkins      = user.owned_skins || [];
  const ownedSkinsCount = ownedSkins.length;
  const rarestSkin      = computeRarestSkin(ownedSkins);
  const favoriteSkin    = computeFavoriteSkin(stats.skin_play_counts);
  const accountAgeDays  = Math.floor((Date.now() - new Date(user.created_at)) / 86400000);
  const totalGames      = (ranked.wins || 0) + (ranked.losses || 0);
  const winRate         = totalGames > 0
    ? Math.round((ranked.wins / totalGames) * 100) : 0;

  // Effective title: override (Him.) takes priority, then chosen title
  let displayTitle = profile.title_override || profile.card_title || 'title_newcomer';
  // For custom title, also send the display text
  const displayTitleText = displayTitle === 'title_custom' ? (profile.custom_title_text || 'Custom') : null;

  return {
    uid,
    username: user.username,
    profile: {
      cardBackground:  profile.card_background,
      cardBorder:      profile.card_border,
      cardAccentColor: profile.card_accent_color,
      cardTitle:       profile.card_title,
      titleOverride:   profile.title_override,
      displayTitle,
      displayTitleText,
      showcaseSkin:    profile.showcase_skin,
      showcaseBadge1:  profile.showcase_badge_1,
      showcaseBadge2:  profile.showcase_badge_2,
      showcaseBadge3:  profile.showcase_badge_3,
      bio:             profile.bio,
      cardVisibility:  profile.card_visibility,
    },
    stats: {
      totalGames:          stats.total_games || 0,
      totalWavesCleared:   stats.total_waves_cleared || 0,
      totalKills:          stats.total_kills || 0,
      totalCoinsEarned:    stats.total_coins_earned || 0,
      totalCoinsSpent:     stats.total_coins_spent || 0,
      totalCratesOpened:   stats.total_crates_opened || 0,
      totalTradesCompleted:stats.total_trades_completed || 0,
      bestWinStreak:       stats.best_win_streak || 0,
      ownedSkinsCount,
      rarestSkin,
      favoriteSkin,
      accountAgeDays,
      rankedWins:     ranked.wins   || 0,
      rankedLosses:   ranked.losses || 0,
      winRate,
      currentStreak:  ranked.streak || 0,
      currentRank:    { tier: ranked.tier, division: ranked.division, rp: ranked.rp },
      peakRank:       { tier: ranked.peak_tier, division: ranked.peak_division },
    },
    ...(isOwn ? { unlocks: unlocksRes.rows.map(r => r.unlockable_id) } : {}),
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/profile/me — own profile (always full access)
router.get('/me', requireAuth, async (req, res) => {
  try {
    await ensureProfileExists(req.user.uid);
    const data = await buildProfileResponse(req.user.uid, true);
    return res.json(data);
  } catch (err) {
    console.error('[Profile] /me error:', err.message);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to load profile' });
  }
});

// GET /api/profile/unlockables — current user's unlockables with locked/unlocked status
router.get('/unlockables', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT cu.id, cu.type, cu.name, cu.unlock_condition, cu.preview_css,
             (pu.unlockable_id IS NOT NULL) AS unlocked
      FROM card_unlockables cu
      LEFT JOIN player_unlocks pu ON pu.unlockable_id = cu.id AND pu.uid = $1
      ORDER BY cu.type, cu.id
    `, [req.user.uid]);
    return res.json(rows);
  } catch (err) {
    console.error('[Profile] /unlockables error:', err.message);
    return res.status(500).json({ error: 'Failed to load unlockables' });
  }
});

// GET /api/profile/:uid — public profile view
router.get('/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    // Determine if requester is the owner (optional auth)
    const token = req.headers.authorization?.split(' ')[1];
    let requesterId = null;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        requesterId = decoded.uid;
      } catch (_) {}
    }

    const isOwn = requesterId === uid;

    // Check profile exists and visibility
    const { rows: profileRows } = await query(
      `SELECT card_visibility FROM player_profiles WHERE uid = $1`, [uid]
    );
    const visibility = profileRows[0]?.card_visibility || 'public';

    if (visibility === 'private' && !isOwn) {
      return res.json({ hidden: true, uid });
    }

    const data = await buildProfileResponse(uid, isOwn);
    return res.json(data);
  } catch (err) {
    console.error('[Profile] /:uid error:', err.message);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to load profile' });
  }
});

// POST /api/profile/update — update own profile card
router.post('/update', requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const {
    cardBackground, cardBorder, cardAccentColor, cardTitle,
    showcaseSkin, showcaseBadges, bio, cardVisibility,
  } = req.body;

  try {
    // Load user's owned skins + unlocks for validation
    const [userRes, unlocksRes] = await Promise.all([
      query('SELECT owned_skins FROM users WHERE uid = $1', [uid]),
      query('SELECT unlockable_id FROM player_unlocks WHERE uid = $1', [uid]),
    ]);

    const ownedSkins    = userRes.rows[0]?.owned_skins || [];
    const unlocked      = new Set(unlocksRes.rows.map(r => r.unlockable_id));

    // Validate cardBackground
    if (cardBackground !== undefined) {
      if (!unlocked.has(cardBackground)) {
        return res.status(403).json({ error: 'Background not unlocked' });
      }
    }

    // Validate cardBorder
    if (cardBorder !== undefined) {
      if (!unlocked.has(cardBorder)) {
        return res.status(403).json({ error: 'Border not unlocked' });
      }
    }

    // Validate cardTitle
    if (cardTitle !== undefined && cardTitle !== null) {
      if (cardTitle === 'title_number_one') {
        return res.status(403).json({ error: 'This title is assigned automatically' });
      }
      if (!unlocked.has(cardTitle)) {
        return res.status(403).json({ error: 'Title not unlocked' });
      }
    }

    // Validate showcaseSkin
    if (showcaseSkin !== undefined && showcaseSkin !== null) {
      if (!ownedSkins.includes(showcaseSkin)) {
        return res.status(403).json({ error: 'Showcase skin not owned' });
      }
    }

    // Validate accent color
    if (cardAccentColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(cardAccentColor)) {
      return res.status(400).json({ error: 'Invalid accent color' });
    }

    // Validate visibility
    const validVisibility = ['public', 'friends', 'private'];
    if (cardVisibility !== undefined && !validVisibility.includes(cardVisibility)) {
      return res.status(400).json({ error: 'Invalid visibility option' });
    }

    // Sanitize bio
    const cleanBio = bio !== undefined ? sanitizeBio(bio) : undefined;

    // Validate badge IDs (placeholder — no real unlockable badges yet)
    const [b1, b2, b3] = Array.isArray(showcaseBadges) ? showcaseBadges : [null, null, null];

    // Build SET clause dynamically for only provided fields
    const setClauses = ['updated_at = NOW()'];
    const values     = [uid];
    let   i          = 2;

    const addField = (col, val) => {
      setClauses.push(`${col} = $${i++}`);
      values.push(val);
    };

    if (cardBackground  !== undefined) addField('card_background',   cardBackground);
    if (cardBorder      !== undefined) addField('card_border',        cardBorder);
    if (cardAccentColor !== undefined) addField('card_accent_color',  cardAccentColor);
    if (cardTitle       !== undefined) addField('card_title',         cardTitle);
    if (showcaseSkin    !== undefined) addField('showcase_skin',      showcaseSkin);
    if (showcaseBadges  !== undefined) {
      addField('showcase_badge_1', b1 || null);
      addField('showcase_badge_2', b2 || null);
      addField('showcase_badge_3', b3 || null);
    }
    if (cleanBio        !== undefined) addField('bio',                cleanBio);
    if (cardVisibility  !== undefined) addField('card_visibility',    cardVisibility);

    await query(`
      INSERT INTO player_profiles (uid) VALUES ($1) ON CONFLICT DO NOTHING
    `, [uid]);

    await query(
      `UPDATE player_profiles SET ${setClauses.join(', ')} WHERE uid = $1`,
      values
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('[Profile] /update error:', err.message);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
