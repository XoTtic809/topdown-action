// routes/reports.js
const express = require('express');
const router  = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { query } = require('../config/db');

const ALLOWED_TYPES    = ['bug', 'cheater', 'abuse', 'suggestion', 'other'];
const ALLOWED_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'];

// POST /api/reports — submit a report (logged-in users only)
router.post('/', requireAuth, async (req, res) => {
  const { type, subject, description } = req.body;

  if (!type || !subject || !description)
    return res.status(400).json({ error: 'type, subject, and description are required' });
  if (!ALLOWED_TYPES.includes(type))
    return res.status(400).json({ error: 'Invalid report type' });
  if (typeof subject !== 'string' || subject.trim().length === 0 || subject.length > 100)
    return res.status(400).json({ error: 'Subject must be 1–100 characters' });
  if (typeof description !== 'string' || description.trim().length === 0 || description.length > 1000)
    return res.status(400).json({ error: 'Description must be 1–1000 characters' });

  try {
    // Rate limit: max 3 reports per 24 hours per user
    const { rows: recent } = await query(
      `SELECT COUNT(*) FROM reports WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [req.user.uid]
    );
    if (parseInt(recent[0].count) >= 3)
      return res.status(429).json({ error: 'You have submitted too many reports in the last 24 hours. Please wait before sending another.' });

    const { rows: userRows } = await query('SELECT username FROM users WHERE uid = $1', [req.user.uid]);
    const username = userRows[0]?.username || 'Unknown';

    await query(
      `INSERT INTO reports (user_id, username, type, subject, description) VALUES ($1, $2, $3, $4, $5)`,
      [req.user.uid, username, type, subject.trim(), description.trim()]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('[Reports] Submit error:', err);
    return res.status(500).json({ error: 'Failed to submit report' });
  }
});

// GET /api/reports/admin/list — admin only, returns up to 200 most recent
router.get('/admin/list', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM reports
      ORDER BY
        CASE status WHEN 'open' THEN 1 WHEN 'reviewing' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT 200
    `);
    return res.json(rows);
  } catch (err) {
    console.error('[Reports] List error:', err);
    return res.status(500).json({ error: 'Failed to load reports' });
  }
});

// PATCH /api/reports/admin/:id — update status
router.patch('/admin/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, admin_note } = req.body;

  if (!ALLOWED_STATUSES.includes(status))
    return res.status(400).json({ error: 'Invalid status' });

  try {
    const { rows: adminRows } = await query('SELECT username FROM users WHERE uid = $1', [req.user.uid]);
    const adminName = adminRows[0]?.username || 'admin';

    const { rowCount } = await query(
      `UPDATE reports SET status = $2, admin_note = $3, resolved_by = $4, updated_at = NOW() WHERE id = $1`,
      [id, status, admin_note || null, adminName]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Report not found' });

    return res.json({ success: true });
  } catch (err) {
    console.error('[Reports] Update error:', err);
    return res.status(500).json({ error: 'Failed to update report' });
  }
});

module.exports = router;
