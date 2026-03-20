// routes/chat.js
// Chat access request system — users request access, admin approves or denies.

const express = require('express');
const router  = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { query } = require('../config/db');

// ─── POST /api/chat/request  ─────────────────────────────────
// Logged-in user submits (or re-opens) a chat access request.
router.post('/request', requireAuth, async (req, res) => {
  try {
    const { rows: userRows } = await query(
      'SELECT is_banned FROM users WHERE uid = $1',
      [req.user.uid]
    );
    if (!userRows[0] || userRows[0].is_banned) {
      return res.status(403).json({ error: 'Account not eligible for chat' });
    }

    // Upsert: insert new or re-open a previously denied request.
    // Already-approved requests are left untouched.
    const { rows } = await query(`
      INSERT INTO chat_requests (uid, username)
      VALUES ($1, $2)
      ON CONFLICT (uid) DO UPDATE
        SET status     = CASE WHEN chat_requests.status = 'approved' THEN 'approved' ELSE 'pending' END,
            created_at = CASE WHEN chat_requests.status = 'denied'   THEN NOW()      ELSE chat_requests.created_at END,
            username   = EXCLUDED.username
      RETURNING status
    `, [req.user.uid, req.user.username]);

    return res.json({ status: rows[0].status });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to submit request' });
  }
});

// ─── GET /api/chat/my-request  ───────────────────────────────
// Logged-in user checks the status of their own request.
router.get('/my-request', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT status FROM chat_requests WHERE uid = $1',
      [req.user.uid]
    );
    return res.json({ status: rows[0]?.status || 'none' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to check status' });
  }
});

// ─── GET /api/chat/requests  (admin) ─────────────────────────
// Returns all pending access requests.
router.get('/requests', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT cr.id, cr.uid, cr.username, cr.status, cr.created_at,
             u.high_score, u.created_at AS joined_at
      FROM   chat_requests cr
      JOIN   users u ON u.uid = cr.uid
      WHERE  cr.status = 'pending'
      ORDER  BY cr.created_at ASC
    `);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load requests' });
  }
});

// ─── POST /api/chat/requests/:id/approve  (admin) ────────────
router.post('/requests/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      UPDATE chat_requests
      SET    status = 'approved', reviewed_by = $2, reviewed_at = NOW()
      WHERE  id = $1 AND status = 'pending'
      RETURNING uid, username
    `, [req.params.id, req.user.uid]);

    if (!rows[0]) return res.status(404).json({ error: 'Request not found or already reviewed' });

    // Real-time notification to connected clients
    const io = req.app.get('io');
    if (io) io.emit('chat:request-result', { uid: rows[0].uid, approved: true });

    return res.json({ success: true, username: rows[0].username });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to approve' });
  }
});

// ─── POST /api/chat/requests/:id/deny  (admin) ───────────────
router.post('/requests/:id/deny', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      UPDATE chat_requests
      SET    status = 'denied', reviewed_by = $2, reviewed_at = NOW()
      WHERE  id = $1 AND status = 'pending'
      RETURNING uid, username
    `, [req.params.id, req.user.uid]);

    if (!rows[0]) return res.status(404).json({ error: 'Request not found or already reviewed' });

    const io = req.app.get('io');
    if (io) io.emit('chat:request-result', { uid: rows[0].uid, approved: false });

    return res.json({ success: true, username: rows[0].username });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to deny' });
  }
});

module.exports = router;
