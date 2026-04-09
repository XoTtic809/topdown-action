// routes/auth.js
// Complete self-hosted authentication.
// No Firebase — passwords hashed with bcrypt, sessions via JWT.

const express    = require('express');
const router     = express.Router();
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { validateUsername } = require('../middleware/validation');
const { updateProgress, isWhitelisted } = require('../models/user');
const { syncSkins } = require('../models/inventory');
const { isValidSkinId } = require('./crates');
const { checkUnlocks, reconcileNumberOneTitle } = require('../utils/unlock-checker');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

const SALT_ROUNDS = 12;
const MAX_COIN_DELTA_PER_SAVE  = 6000;   // flag if delta > this (~max from a long wave session)
const MAX_COIN_DELTA_HARD_REJECT = 15000; // reject if delta > this
const MAX_XP_DELTA_PER_SAVE   = 20000;   // reject if XP increase > this per save

function signToken(uid, username, isAdmin = false) {
  return jwt.sign(
    { uid, username, isAdmin },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// ─── POST /api/auth/signup ────────────────────────────────────
// Body: { username, email, password }
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required' });
  }
  if (username.trim().length < 3 || username.trim().length > 20) {
    return res.status(400).json({ error: 'Username must be 3–20 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Server-side profanity + format filter (mirrors client anticheat.js)
  const nameCheck = validateUsername(username);
  if (!nameCheck.ok) {
    return res.status(400).json({ error: nameCheck.reason });
  }

  try {
    // Check username and email are not already taken
    const { rows: existing } = await query(
      'SELECT uid FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
      [username.trim(), email.trim()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const { rows } = await query(`
      INSERT INTO users (username, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING uid, username, email, is_admin, total_coins, high_score,
                current_xp, owned_skins, active_skin, created_at
    `, [username.trim(), email.trim().toLowerCase(), passwordHash]);

    const user       = rows[0];
    const token      = signToken(user.uid, user.username, user.is_admin);
    const whitelisted = await isWhitelisted(user.uid);

    return res.status(201).json({
      token,
      uid:          user.uid,
      username:     user.username,
      isAdmin:      user.is_admin,
      totalCoins:   user.total_coins,
      highScore:    user.high_score,
      currentXp:    user.current_xp,
      ownedSkins:   user.owned_skins,
      activeSkin:   user.active_skin,
      createdAt:    user.created_at,
      isWhitelisted: whitelisted,
    });
  } catch (err) {
    console.error('[Auth] /signup error:', err.message);
    return res.status(500).json({ error: 'Signup failed' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────
// Body: { email, password }
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const { rows } = await query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );
    const user = rows[0];

    if (!user) {
      // Generic message — don't reveal whether email exists
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.is_banned) {
      return res.status(403).json({
        error: 'Account banned',
        reason: user.ban_reason || 'No reason provided',
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token       = signToken(user.uid, user.username, user.is_admin);
    const whitelisted = await isWhitelisted(user.uid);

    return res.json({
      token,
      uid:               user.uid,
      username:          user.username,
      isAdmin:           user.is_admin,
      totalCoins:        user.total_coins,
      highScore:         user.high_score,
      currentXp:         user.current_xp,
      ownedSkins:        user.owned_skins,
      activeSkin:        user.active_skin,
      skinReceivedTimes: user.skin_received_times,
      createdAt:         user.created_at,
      isWhitelisted:     whitelisted,
    });
  } catch (err) {
    console.error('[Auth] /login error:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────
// Returns current user profile. Requires Authorization: Bearer <token>
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE uid = $1', [req.user.uid]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.is_banned) {
      return res.status(403).json({ error: 'Account banned', reason: user.ban_reason });
    }

    const whitelisted = await isWhitelisted(user.uid);
    const freshToken  = signToken(user.uid, user.username, user.is_admin);

    return res.json({
      token:             freshToken,
      uid:               user.uid,
      username:          user.username,
      email:             user.email,
      isAdmin:           user.is_admin,
      totalCoins:        user.total_coins,
      highScore:         user.high_score,
      currentXp:         user.current_xp,
      ownedSkins:        user.owned_skins,
      activeSkin:        user.active_skin,
      skinReceivedTimes: user.skin_received_times,
      createdAt:         user.created_at,
      isWhitelisted:     whitelisted,
    });
  } catch (err) {
    console.error('[Auth] /me error:', err.message);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

// ─── POST /api/auth/progress ──────────────────────────────────
// Saves score/coins/XP after each game round.
// Body: { highScore, totalCoins, currentXp, kills?, wavesCleared?, activeSkin? }
router.post('/progress', requireAuth, async (req, res) => {
  try {
    const { highScore = 0, totalCoins = 0, currentXp = 0, ownedSkins,
            kills = 0, wavesCleared = 0, activeSkin } = req.body;

    if (highScore < 0 || highScore > 9_999_999)     return res.status(400).json({ error: 'Invalid score' });
    if (totalCoins < 0 || totalCoins > 10_000_000)  return res.status(400).json({ error: 'Invalid coins' });
    if (currentXp  < 0 || currentXp  > 10_000_000) return res.status(400).json({ error: 'Invalid XP' });

    // ── Coin + XP delta validation ────────────────────────────────
    // Prevents client-side manipulation via DevTools.
    const { rows: currentRows } = await query(
      'SELECT total_coins, current_xp FROM users WHERE uid = $1', [req.user.uid]
    );
    // Compute deltas against authoritative server values
    const isAdminCaller = req.user.isAdmin === true;
    let safeCoinDelta = 0;
    if (currentRows[0]) {
      const coinDelta = Math.floor(totalCoins) - currentRows[0].total_coins;
      if (!isAdminCaller && coinDelta > MAX_COIN_DELTA_HARD_REJECT) {
        console.warn(`[Auth] COIN DELTA REJECT: uid=${req.user.uid} delta=${coinDelta} (max=${MAX_COIN_DELTA_HARD_REJECT})`);
        return res.status(400).json({ error: 'Coin delta too large' });
      }
      if (!isAdminCaller && coinDelta > MAX_COIN_DELTA_PER_SAVE) {
        console.warn(`[Auth] COIN DELTA FLAG: uid=${req.user.uid} delta=${coinDelta}`);
      }
      // Non-admins: only allow positive deltas — marketplace/crate endpoints handle decreases.
      // Admins: allow signed deltas so devSetCoins can both increase and decrease balances.
      safeCoinDelta = isAdminCaller ? coinDelta : Math.max(0, coinDelta);

      const xpDelta = Math.floor(currentXp) - (currentRows[0].current_xp || 0);
      if (!isAdminCaller && xpDelta > MAX_XP_DELTA_PER_SAVE) {
        console.warn(`[Auth] XP DELTA REJECT: uid=${req.user.uid} delta=${xpDelta} (max=${MAX_XP_DELTA_PER_SAVE})`);
        return res.status(400).json({ error: 'XP delta too large' });
      }
    }

    const updated = await updateProgress(req.user.uid, {
      highScore:  Math.floor(highScore),
      coinDelta:  safeCoinDelta,
      currentXp:  Math.floor(currentXp),
    });

    if (!updated) return res.status(404).json({ error: 'User not found' });

    // Sync client-side skins to the DB — with whitelist validation.
    // Only appends — never removes — so marketplace/admin grants are never lost.
    // Reject any skin ID that doesn't match a known valid skin.
    if (Array.isArray(ownedSkins) && ownedSkins.length > 0) {
      const valid = ownedSkins.filter(s =>
        typeof s === 'string' && s.length > 0 && s.length <= 120 && isValidSkinId(s)
      );
      const rejected = ownedSkins.length - valid.length;
      if (rejected > 0) {
        console.warn(`[Auth] Skin whitelist rejected ${rejected} invalid skin IDs for uid=${req.user.uid}`);
      }
      if (valid.length > 0) {
        try {
          await syncSkins(req.user.uid, valid);
        } catch (syncErr) {
          console.error('[Auth] syncSkins error (non-fatal):', syncErr.message, '\n', syncErr.stack);
        }
      }
    }

    // ── Stats tracking ────────────────────────────────────────────
    const uid      = req.user.uid;
    const coinDelta = Math.max(0, Math.floor(totalCoins) - (currentRows[0]?.total_coins || 0));
    const safeKills = Math.max(0, Math.floor(kills) || 0);
    const safeWaves = Math.max(0, Math.floor(wavesCleared) || 0);

    // Upsert player_stats row (fire and forget — don't block response)
    query(`
      INSERT INTO player_stats (uid, total_games, total_kills, total_waves_cleared, total_coins_earned)
      VALUES ($1, 1, $2, $3, $4)
      ON CONFLICT (uid) DO UPDATE SET
        total_games         = player_stats.total_games + 1,
        total_kills         = player_stats.total_kills + $2,
        total_waves_cleared = player_stats.total_waves_cleared + $3,
        total_coins_earned  = player_stats.total_coins_earned + $4
    `, [uid, safeKills, safeWaves, coinDelta]).catch(err =>
      console.error('[Stats] progress upsert error:', err.message)
    );

    // Track skin play count for favorite skin
    const skinToTrack = activeSkin || (currentRows[0]?.active_skin) || null;
    if (skinToTrack && typeof skinToTrack === 'string' && skinToTrack.length <= 120) {
      query(`
        INSERT INTO player_stats (uid, skin_play_counts) VALUES ($1, jsonb_build_object($2::text, 1))
        ON CONFLICT (uid) DO UPDATE SET
          skin_play_counts = jsonb_set(
            player_stats.skin_play_counts,
            ARRAY[$2::text],
            (COALESCE((player_stats.skin_play_counts->>$2::text)::int, 0) + 1)::text::jsonb
          )
      `, [uid, skinToTrack]).catch(err =>
        console.error('[Stats] skin_play_counts error:', err.message)
      );
    }

    // Check for new unlocks + reconcile #1 title (both async, non-blocking)
    const newUnlocksPromise = checkUnlocks(uid, { wavesCleared: safeWaves });
    reconcileNumberOneTitle().catch(err => console.error('[Unlocks] reconcile error:', err.message));

    const newUnlocks = await newUnlocksPromise;

    return res.json({ ...updated, newUnlocks });
  } catch (err) {
    console.error('[Auth] /progress error:', err.message, '\n', err.stack);
    return res.status(500).json({ error: 'Failed to save progress' });
  }
});

// ─── POST /api/auth/change-password ───────────────────────────
// Body: { currentPassword, newPassword }
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  try {
    const { rows } = await query('SELECT password_hash FROM users WHERE uid = $1', [req.user.uid]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await query('UPDATE users SET password_hash = $2 WHERE uid = $1', [req.user.uid, newHash]);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
