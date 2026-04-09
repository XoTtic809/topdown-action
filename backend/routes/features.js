// routes/features.js
// Generic feature flag CRUD. Currently used for the hidden blackjack mode
// kill switch, but the table is generic so any future hidden/experimental
// feature can reuse it without schema changes.

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /api/features/:key  — public read (so the client can decide whether
// to even render an entry point). Returns { key, enabled }.
router.get('/:key', async (req, res) => {
  const { key } = req.params;
  if (!key || key.length > 64) return res.status(400).json({ error: 'Invalid key' });
  try {
    const { rows } = await query(
      `SELECT key, enabled FROM feature_flags WHERE key = $1`, [key]
    );
    if (!rows[0]) return res.json({ key, enabled: false });
    return res.json({ key: rows[0].key, enabled: rows[0].enabled });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load flag' });
  }
});

// POST /api/features/:key  — admin only. Body: { enabled: bool }.
router.post('/:key', requireAuth, requireAdmin, async (req, res) => {
  const { key } = req.params;
  const { enabled } = req.body || {};
  if (!key || key.length > 64) return res.status(400).json({ error: 'Invalid key' });
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be boolean' });
  try {
    await query(
      `INSERT INTO feature_flags (key, enabled, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
      [key, enabled]
    );
    await query(
      `INSERT INTO activity_logs (admin_id, admin_name, action, target_uid, details)
       VALUES ($1, $2, 'FEATURE_FLAG', NULL, $3)`,
      [req.user.uid, req.user.username, `${key}=${enabled}`]
    );
    return res.json({ key, enabled });
  } catch (err) {
    console.error('[Features] Save error:', err.message);
    return res.status(500).json({ error: 'Failed to save flag' });
  }
});

module.exports = router;
