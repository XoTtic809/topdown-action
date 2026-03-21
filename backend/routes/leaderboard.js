// routes/leaderboard.js

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// ─── Classic leaderboards ────────────────────────────────────────────────────

// GET /api/leaderboard/scores?limit=50
router.get('/scores', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  try {
    const { rows } = await query(`
      SELECT uid, username, high_score, created_at
      FROM users WHERE is_banned = FALSE
      ORDER BY high_score DESC LIMIT $1
    `, [limit]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// GET /api/leaderboard/coins?limit=50
router.get('/coins', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  try {
    const { rows } = await query(`
      SELECT uid, username, total_coins
      FROM users WHERE is_banned = FALSE
      ORDER BY total_coins DESC LIMIT $1
    `, [limit]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load coins leaderboard' });
  }
});

// GET /api/leaderboard/levels?limit=50
router.get('/levels', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  try {
    const { rows } = await query(`
      SELECT uid, username, current_xp
      FROM users WHERE is_banned = FALSE
      ORDER BY current_xp DESC LIMIT $1
    `, [limit]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load level leaderboard' });
  }
});

// ─── Game mode leaderboards (GET) ───────────────────────────────────────────


// GET /api/leaderboard/horde
router.get('/horde', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  try {
    const { rows } = await query(`
      SELECT uid, username, horde_best_kills
      FROM users WHERE is_banned = FALSE AND horde_best_kills > 0
      ORDER BY horde_best_kills DESC LIMIT $1
    `, [limit]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load horde leaderboard' });
  }
});

// GET /api/leaderboard/timeattack
router.get('/timeattack', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  try {
    const { rows } = await query(`
      SELECT uid, username, ta_best_kills
      FROM users WHERE is_banned = FALSE AND ta_best_kills > 0
      ORDER BY ta_best_kills DESC LIMIT $1
    `, [limit]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load time attack leaderboard' });
  }
});

// GET /api/leaderboard/bossrush
router.get('/bossrush', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  try {
    const { rows } = await query(`
      SELECT uid, username, br_bosses_beaten
      FROM users WHERE is_banned = FALSE AND br_bosses_beaten > 0
      ORDER BY br_bosses_beaten DESC LIMIT $1
    `, [limit]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load boss rush leaderboard' });
  }
});


// ─── Game mode score submission (POST) ──────────────────────────────────────


// POST /api/leaderboard/submit/horde  { kills }
router.post('/submit/horde', requireAuth, async (req, res) => {
  const { kills } = req.body;
  if (typeof kills !== 'number' || kills < 0 || kills > 50000) return res.status(400).json({ error: 'Invalid kills' });
  try {
    await query(`
      UPDATE users SET horde_best_kills = GREATEST(horde_best_kills, $1), updated_at = NOW()
      WHERE uid = $2
    `, [kills, req.user.uid]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to submit score' });
  }
});

// POST /api/leaderboard/submit/timeattack  { kills }
router.post('/submit/timeattack', requireAuth, async (req, res) => {
  const { kills } = req.body;
  if (typeof kills !== 'number' || kills < 0 || kills > 10000) return res.status(400).json({ error: 'Invalid kills' });
  try {
    await query(`
      UPDATE users SET ta_best_kills = GREATEST(ta_best_kills, $1), updated_at = NOW()
      WHERE uid = $2
    `, [kills, req.user.uid]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to submit score' });
  }
});

// POST /api/leaderboard/submit/bossrush  { bosses }
router.post('/submit/bossrush', requireAuth, async (req, res) => {
  const { bosses } = req.body;
  if (typeof bosses !== 'number' || bosses < 0 || bosses > 500) return res.status(400).json({ error: 'Invalid bosses' });
  try {
    await query(`
      UPDATE users SET br_bosses_beaten = GREATEST(br_bosses_beaten, $1), updated_at = NOW()
      WHERE uid = $2
    `, [bosses, req.user.uid]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to submit score' });
  }
});


module.exports = router;
