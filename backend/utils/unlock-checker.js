// utils/unlock-checker.js
// Checks and grants card unlockables based on player stats/rank/inventory.
// Called after game submissions, crate opens, trades, and rank changes.

const { query } = require('../config/db');

const TIER_ORDER = ['bronze','silver','gold','platinum','diamond','master','grandmaster','apex','sovereign'];

// Map unlockable ID → condition function(user, stats, ranked, context) → bool
const UNLOCK_CONDITIONS = {
  // Defaults — always unlocked
  'bg_default':    () => true,
  'border_default':() => true,
  'title_newcomer':() => true,

  // Rank-based backgrounds
  'bg_bronze':    (u,s,r) => TIER_ORDER.indexOf(r.peak_tier||'bronze') >= TIER_ORDER.indexOf('bronze'),
  'bg_silver':    (u,s,r) => TIER_ORDER.indexOf(r.peak_tier||'bronze') >= TIER_ORDER.indexOf('silver'),
  'bg_gold':      (u,s,r) => TIER_ORDER.indexOf(r.peak_tier||'bronze') >= TIER_ORDER.indexOf('gold'),
  'bg_platinum':  (u,s,r) => TIER_ORDER.indexOf(r.peak_tier||'bronze') >= TIER_ORDER.indexOf('platinum'),
  'bg_diamond':   (u,s,r) => TIER_ORDER.indexOf(r.peak_tier||'bronze') >= TIER_ORDER.indexOf('diamond'),
  'bg_galaxy':    (u,s,r) => ['apex','sovereign'].includes(r.peak_tier),
  'bg_sovereign': (u,s,r) => r.peak_tier === 'sovereign',

  // Achievement backgrounds
  'bg_inferno':   (u,s,r,ctx) => (ctx.wavesCleared||0) >= 30,
  'bg_collector': (u,s,r) => (u.owned_skins||[]).length >= 50,
  'bg_whale':     (u,s,r) => (s.total_coins_spent||0) >= 100000,
  'bg_veteran':   (u,s,r) => (s.total_games||0) >= 500,
  // bg_seasonal_s1: admin-granted only, not in conditions

  // Rank-based borders
  'border_silver':  (u,s,r) => TIER_ORDER.indexOf(r.peak_tier||'bronze') >= TIER_ORDER.indexOf('silver'),
  'border_gold':    (u,s,r) => TIER_ORDER.indexOf(r.peak_tier||'bronze') >= TIER_ORDER.indexOf('gold'),
  'border_diamond': (u,s,r) => TIER_ORDER.indexOf(r.peak_tier||'bronze') >= TIER_ORDER.indexOf('diamond'),

  // Achievement borders
  'border_animated_pulse': (u,s,r) => (s.best_win_streak||0) >= 10,
  'border_prismatic':      (u,s,r) => (u.owned_skins||[]).some(id => id.includes('__PRISMATIC')),
  'border_oblivion':       (u,s,r) => (u.owned_skins||[]).some(id => id.startsWith('ob_')),
  // border_champion: admin-granted only

  // Titles
  'title_grinder':      (u,s,r) => (s.total_waves_cleared||0) >= 500,
  'title_trader':       (u,s,r) => (s.total_trades_completed||0) >= 50,
  'title_collector':    (u,s,r) => (u.owned_skins||[]).length >= 100,
  'title_apex_predator':(u,s,r) => ['apex','sovereign'].includes(r.peak_tier),
  'title_sovereign':    (u,s,r) => r.peak_tier === 'sovereign',
  'title_whale':        (u,s,r) => (s.total_coins_spent||0) >= 500000,
  'title_lucky':        (u,s,r,ctx) => ctx.rolledRarity === 'mythic',
  'title_dedicated':    (u,s,r) => (s.total_games||0) >= 1000,
  'title_unbreakable':  (u,s,r) => (s.best_win_streak||0) >= 20,
  // title_number_one: reconcileNumberOneTitle() only
  // title_custom: admin-granted only

  // Badges — ranked
  'badge_rank_silver':    (u,s,r) => TIER_ORDER.indexOf(r.peak_tier||'bronze') >= TIER_ORDER.indexOf('silver'),
  'badge_rank_gold':      (u,s,r) => TIER_ORDER.indexOf(r.peak_tier||'bronze') >= TIER_ORDER.indexOf('gold'),
  'badge_rank_platinum':  (u,s,r) => TIER_ORDER.indexOf(r.peak_tier||'bronze') >= TIER_ORDER.indexOf('platinum'),
  'badge_rank_diamond':   (u,s,r) => TIER_ORDER.indexOf(r.peak_tier||'bronze') >= TIER_ORDER.indexOf('diamond'),
  'badge_rank_apex':      (u,s,r) => ['apex','sovereign'].includes(r.peak_tier),
  // New backgrounds
  'bg_neon':     (u,s,r) => (u.owned_skins||[]).some(id => id.startsWith('neon_')),
  'bg_frost':    (u,s,r) => (u.owned_skins||[]).some(id => id.startsWith('frost_')),
  'bg_void':     (u,s,r) => (u.owned_skins||[]).some(id => id.startsWith('void_')),
  'bg_midnight': (u,s,r) => (s.total_games||0) >= 100,
  'bg_crimson':  (u,s,r) => (s.total_coins_spent||0) >= 25000,
  'bg_ocean':    (u,s,r) => (s.total_trades_completed||0) >= 15,

  // New borders
  'border_neon': (u,s,r) => (u.owned_skins||[]).some(id => id.startsWith('neon_')),
  'border_fire': (u,s,r,ctx) => (ctx.wavesCleared||0) >= 20,
  'border_ice':  (u,s,r) => (u.owned_skins||[]).some(id => id.startsWith('frost_')),
  'border_void': (u,s,r) => (u.owned_skins||[]).some(id => id.startsWith('void_')),

  // Badges — achievement
  'badge_wave_master':    (u,s,r,ctx) => (ctx.wavesCleared||0) >= 30,
  'badge_mythic_pull':    (u,s,r,ctx) => ctx.rolledRarity === 'mythic',
  'badge_oblivion_club':  (u,s,r) => (u.owned_skins||[]).some(id => id.startsWith('ob_')),
  'badge_skin_collector': (u,s,r) => (u.owned_skins||[]).length >= 25,
  'badge_market_shark':   (u,s,r) => (s.total_trades_completed||0) >= 10,
  'badge_century':        (u,s,r) => (s.total_games||0) >= 100,
  'badge_hot_streak':     (u,s,r) => (s.best_win_streak||0) >= 5,
  // badge_s1_champion: granted via battle pass claiming
};

/**
 * Check all auto-grantable unlocks for a user.
 * Returns array of newly-unlocked unlockable IDs.
 * @param {string} uid
 * @param {object} context — { wavesCleared?, rolledRarity? }
 */
async function checkUnlocks(uid, context = {}) {
  try {
    const [userRes, statsRes, rankedRes, unlocksRes] = await Promise.all([
      query('SELECT owned_skins FROM users WHERE uid = $1', [uid]),
      query('SELECT * FROM player_stats WHERE uid = $1', [uid]),
      query('SELECT peak_tier, wins, losses FROM ranked_profiles WHERE uid = $1', [uid]),
      query('SELECT unlockable_id FROM player_unlocks WHERE uid = $1', [uid]),
    ]);

    const user   = userRes.rows[0] || { owned_skins: [] };
    const stats  = statsRes.rows[0] || {};
    const ranked = rankedRes.rows[0] || { peak_tier: 'bronze' };
    const alreadyUnlocked = new Set(unlocksRes.rows.map(r => r.unlockable_id));

    const newUnlocks = [];

    for (const [id, check] of Object.entries(UNLOCK_CONDITIONS)) {
      if (alreadyUnlocked.has(id)) continue;
      try {
        if (check(user, stats, ranked, context)) {
          await query(
            'INSERT INTO player_unlocks (uid, unlockable_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [uid, id]
          );
          newUnlocks.push(id);
        }
      } catch (_) {
        // Skip individual condition errors
      }
    }

    return newUnlocks;
  } catch (err) {
    console.error('[Unlocks] checkUnlocks error:', err.message);
    return [];
  }
}

/**
 * Ensures whichever player has the #1 high_score gets title_override='title_number_one'.
 * Called after each POST /api/auth/progress.
 */
async function reconcileNumberOneTitle() {
  try {
    // Find current #1 score holder
    const { rows: topRows } = await query(
      `SELECT uid FROM users WHERE is_banned = false ORDER BY high_score DESC LIMIT 1`
    );
    const newHolder = topRows[0]?.uid || null;

    // Find current "Him." override holder
    const { rows: curRows } = await query(
      `SELECT uid FROM player_profiles WHERE title_override = 'title_number_one' LIMIT 1`
    );
    const oldHolder = curRows[0]?.uid || null;

    if (newHolder === oldHolder) return;

    // Revoke from old holder
    if (oldHolder) {
      await query(
        `UPDATE player_profiles SET title_override = NULL, updated_at = NOW() WHERE uid = $1`,
        [oldHolder]
      );
    }

    // Grant to new holder
    if (newHolder) {
      await query(`
        INSERT INTO player_profiles (uid, title_override, updated_at)
        VALUES ($1, 'title_number_one', NOW())
        ON CONFLICT (uid) DO UPDATE SET title_override = 'title_number_one', updated_at = NOW()
      `, [newHolder]);
      // Ensure the unlock record exists
      await query(
        `INSERT INTO player_unlocks (uid, unlockable_id) VALUES ($1, 'title_number_one') ON CONFLICT DO NOTHING`,
        [newHolder]
      );
    }
  } catch (err) {
    console.error('[Unlocks] reconcileNumberOneTitle error:', err.message);
  }
}

module.exports = { checkUnlocks, reconcileNumberOneTitle };
