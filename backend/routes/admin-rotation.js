// routes/admin-rotation.js — Admin API for crate rotation & schedule management
'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { query } = require('../config/db');

// Template prices (must stay in sync with CRATES array in crates.js)
const CRATE_TEMPLATE_PRICES = {
  'common-crate':    300,
  'rare-crate':      750,
  'epic-crate':      1500,
  'legendary-crate': 4000,
  'icon-crate':      750,
  'oblivion-crate':  10000,
};

const VALID_ACTIONS = new Set(['activate', 'deactivate', 'restock', 'price_change', 'retire']);

// ── GET /api/admin/rotation ───────────────────────────────────────────────────
// Returns all crate_rotation rows with pending schedules + recent history.
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT cr.*,
             COALESCE(cr.price_override, $1::jsonb->>cr.crate_id) AS effective_price_str,
             (SELECT json_agg(cs ORDER BY cs.scheduled_at)
                FROM crate_schedule cs
               WHERE cs.crate_id = cr.crate_id AND cs.executed = false) AS pending_schedules,
             (SELECT json_agg(sub ORDER BY sub.scheduled_at DESC)
                FROM (SELECT * FROM crate_schedule cs2
                       WHERE cs2.crate_id = cr.crate_id AND cs2.executed = true
                       ORDER BY cs2.scheduled_at DESC LIMIT 5) sub) AS recent_history
        FROM crate_rotation cr
       ORDER BY cr.crate_id
    `, [JSON.stringify(Object.fromEntries(
      Object.entries(CRATE_TEMPLATE_PRICES).map(([k, v]) => [k, String(v)])
    ))]);

    // Attach numeric effective_price
    const enriched = rows.map(row => ({
      ...row,
      effectivePrice: row.price_override
        ?? CRATE_TEMPLATE_PRICES[row.crate_id]
        ?? null,
      templatePrice: CRATE_TEMPLATE_PRICES[row.crate_id] ?? null,
    }));

    return res.json({ rotation: enriched });
  } catch (err) {
    console.error('[AdminRotation] GET / error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch rotation data' });
  }
});

// ── POST /api/admin/rotation/update ──────────────────────────────────────────
// Upsert a crate_rotation row. Supports partial updates.
router.post('/update', requireAuth, requireAdmin, async (req, res) => {
  const {
    crateId,
    active,
    priceOverride,
    stockLimit,
    stockRemaining,
    discountPercent,
    marketplaceFloorOverride,
    marketplaceCeilingOverride,
    startsAt,
    endsAt,
    weekendOnly,
    timerVisible,
    rotationLabel,
  } = req.body;

  if (!crateId || typeof crateId !== 'string') {
    return res.status(400).json({ error: 'crateId required' });
  }
  if (discountPercent != null && (discountPercent < 0 || discountPercent > 100)) {
    return res.status(400).json({ error: 'discountPercent must be 0–100' });
  }
  if (priceOverride != null && priceOverride <= 0) {
    return res.status(400).json({ error: 'priceOverride must be > 0' });
  }
  if (marketplaceFloorOverride != null && marketplaceFloorOverride <= 0) {
    return res.status(400).json({ error: 'marketplaceFloorOverride must be > 0' });
  }
  if (marketplaceCeilingOverride != null && marketplaceCeilingOverride <= 0) {
    return res.status(400).json({ error: 'marketplaceCeilingOverride must be > 0' });
  }

  try {
    await query(`
      INSERT INTO crate_rotation (crate_id, active, price_override, stock_limit, stock_remaining,
        marketplace_floor_override, marketplace_ceiling_override, discount_percent,
        starts_at, ends_at, weekend_only, timer_visible, rotation_label, updated_at)
      VALUES ($1,
        COALESCE($2, false),
        $3, $4, $5, $6, $7,
        COALESCE($8, 0),
        $9, $10,
        COALESCE($11, false),
        COALESCE($12, false),
        $13,
        NOW()
      )
      ON CONFLICT (crate_id) DO UPDATE SET
        active                       = COALESCE($2, crate_rotation.active),
        price_override               = CASE WHEN $3::integer IS NOT NULL THEN $3::integer ELSE crate_rotation.price_override END,
        stock_limit                  = CASE WHEN $4::integer IS NOT NULL THEN $4::integer ELSE crate_rotation.stock_limit END,
        stock_remaining              = CASE WHEN $5::integer IS NOT NULL THEN $5::integer ELSE crate_rotation.stock_remaining END,
        marketplace_floor_override   = CASE WHEN $6::integer IS NOT NULL THEN $6::integer ELSE crate_rotation.marketplace_floor_override END,
        marketplace_ceiling_override = CASE WHEN $7::integer IS NOT NULL THEN $7::integer ELSE crate_rotation.marketplace_ceiling_override END,
        discount_percent             = COALESCE($8, crate_rotation.discount_percent),
        starts_at                    = CASE WHEN $9::timestamptz IS NOT NULL THEN $9::timestamptz ELSE crate_rotation.starts_at END,
        ends_at                      = CASE WHEN $10::timestamptz IS NOT NULL THEN $10::timestamptz ELSE crate_rotation.ends_at END,
        weekend_only                 = COALESCE($11, crate_rotation.weekend_only),
        timer_visible                = COALESCE($12, crate_rotation.timer_visible),
        rotation_label               = CASE WHEN $13::text IS NOT NULL THEN $13::text ELSE crate_rotation.rotation_label END,
        updated_at                   = NOW()
    `, [
      crateId,
      active ?? null,
      priceOverride ?? null,
      stockLimit ?? null,
      stockRemaining ?? null,
      marketplaceFloorOverride ?? null,
      marketplaceCeilingOverride ?? null,
      discountPercent ?? null,
      startsAt ?? null,
      endsAt ?? null,
      weekendOnly ?? null,
      timerVisible ?? null,
      rotationLabel ?? null,
    ]);

    return res.json({ success: true });
  } catch (err) {
    console.error('[AdminRotation] POST /update error:', err.message);
    return res.status(500).json({ error: 'Failed to update rotation' });
  }
});

// ── POST /api/admin/rotation/restock ─────────────────────────────────────────
// Add stock to a crate (stock_remaining += amount).
router.post('/restock', requireAuth, requireAdmin, async (req, res) => {
  const { crateId, amount } = req.body;
  if (!crateId) return res.status(400).json({ error: 'crateId required' });
  const amt = parseInt(amount, 10);
  if (!Number.isInteger(amt) || amt <= 0) {
    return res.status(400).json({ error: 'amount must be a positive integer' });
  }

  try {
    const { rowCount } = await query(
      `UPDATE crate_rotation
          SET stock_remaining = COALESCE(stock_remaining, 0) + $2,
              updated_at = NOW()
        WHERE crate_id = $1`,
      [crateId, amt]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Crate not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[AdminRotation] POST /restock error:', err.message);
    return res.status(500).json({ error: 'Failed to restock' });
  }
});

// ── POST /api/admin/rotation/retire ──────────────────────────────────────────
// Retire a crate: sets retired=true, active=false.
router.post('/retire', requireAuth, requireAdmin, async (req, res) => {
  const { crateId } = req.body;
  if (!crateId) return res.status(400).json({ error: 'crateId required' });

  try {
    const { rowCount } = await query(
      `UPDATE crate_rotation SET retired = true, active = false, updated_at = NOW()
        WHERE crate_id = $1`,
      [crateId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Crate not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[AdminRotation] POST /retire error:', err.message);
    return res.status(500).json({ error: 'Failed to retire crate' });
  }
});

// ── POST /api/admin/rotation/sellout ─────────────────────────────────────────
// Force a crate to 0 remaining stock.
router.post('/sellout', requireAuth, requireAdmin, async (req, res) => {
  const { crateId } = req.body;
  if (!crateId) return res.status(400).json({ error: 'crateId required' });

  try {
    const { rowCount } = await query(
      `UPDATE crate_rotation SET stock_remaining = 0, updated_at = NOW() WHERE crate_id = $1`,
      [crateId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Crate not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[AdminRotation] POST /sellout error:', err.message);
    return res.status(500).json({ error: 'Failed to sell out crate' });
  }
});

// ── GET /api/admin/schedule ───────────────────────────────────────────────────
// Returns all pending (unexecuted) schedule rows.
router.get('/schedule', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM crate_schedule WHERE executed = false ORDER BY scheduled_at ASC`
    );
    return res.json({ schedules: rows });
  } catch (err) {
    console.error('[AdminRotation] GET /schedule error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// ── POST /api/admin/schedule/add ─────────────────────────────────────────────
// Schedule a future action on a crate.
router.post('/schedule/add', requireAuth, requireAdmin, async (req, res) => {
  const { crateId, action, scheduledAt, payload } = req.body;

  if (!crateId) return res.status(400).json({ error: 'crateId required' });
  if (!VALID_ACTIONS.has(action)) {
    return res.status(400).json({ error: `action must be one of: ${[...VALID_ACTIONS].join(', ')}` });
  }
  if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt required' });
  if (new Date(scheduledAt) <= new Date()) {
    return res.status(400).json({ error: 'scheduledAt must be in the future' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO crate_schedule (crate_id, action, scheduled_at, payload)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [crateId, action, scheduledAt, payload ? JSON.stringify(payload) : null]
    );
    return res.json({ success: true, scheduleId: rows[0].id });
  } catch (err) {
    console.error('[AdminRotation] POST /schedule/add error:', err.message);
    return res.status(500).json({ error: 'Failed to add schedule' });
  }
});

// ── POST /api/admin/schedule/cancel ──────────────────────────────────────────
// Cancel a pending schedule row by ID.
router.post('/schedule/cancel', requireAuth, requireAdmin, async (req, res) => {
  const { scheduleId } = req.body;
  if (!scheduleId) return res.status(400).json({ error: 'scheduleId required' });

  try {
    const { rowCount } = await query(
      `DELETE FROM crate_schedule WHERE id = $1 AND executed = false`,
      [scheduleId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Schedule not found or already executed' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[AdminRotation] POST /schedule/cancel error:', err.message);
    return res.status(500).json({ error: 'Failed to cancel schedule' });
  }
});

// ─── POST /api/admin/profile/custom-title ─────────────────────────────────────
// Grant a custom title to a specific player.
// Grant all profile unlockables to self (or a target user)
router.post('/profile/grant-all-unlocks', requireAuth, requireAdmin, async (req, res) => {
  const uid  = req.body.targetUid || req.user.uid;
  const type = req.body.type || null;
  try {
    const { rows: unlockables } = type
      ? await query('SELECT id FROM card_unlockables WHERE type = $1', [type])
      : await query('SELECT id FROM card_unlockables');
    await Promise.all(unlockables.map(u =>
      query('INSERT INTO player_unlocks (uid, unlockable_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, u.id])
    ));
    await query(
      `INSERT INTO activity_logs (admin_id, admin_name, action, target_uid, details, created_at)
       VALUES ($1,$2,'grant_all_unlocks',$3,$4,NOW())`,
      [req.user.uid, req.user.username, uid, `Granted all ${unlockables.length} profile unlockables`]
    );
    return res.json({ success: true, granted: unlockables.length });
  } catch (err) {
    console.error('[Admin] grant-all-unlocks error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Grant a single specific unlockable to self (or a target user)
router.post('/profile/grant-unlock', requireAuth, requireAdmin, async (req, res) => {
  const { unlockableId, targetUid } = req.body;
  const uid = targetUid || req.user.uid;
  if (!unlockableId) return res.status(400).json({ error: 'unlockableId required' });
  try {
    const { rows } = await query('SELECT id, name FROM card_unlockables WHERE id = $1', [unlockableId]);
    if (!rows.length) return res.status(404).json({ error: 'Unlockable not found: ' + unlockableId });
    await query('INSERT INTO player_unlocks (uid, unlockable_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, unlockableId]);
    await query(
      `INSERT INTO activity_logs (admin_id, admin_name, action, target_uid, details, created_at)
       VALUES ($1,$2,'grant_unlock',$3,$4,NOW())`,
      [req.user.uid, req.user.username, uid, `Granted unlock: ${rows[0].name} (${unlockableId})`]
    );
    return res.json({ success: true, unlockableId, name: rows[0].name });
  } catch (err) {
    console.error('[Admin] grant-unlock error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Revoke a single unlockable from self (or target user)
router.post('/profile/revoke-unlock', requireAuth, requireAdmin, async (req, res) => {
  const { unlockableId, targetUid } = req.body;
  const uid = targetUid || req.user.uid;
  if (!unlockableId) return res.status(400).json({ error: 'unlockableId required' });
  try {
    const { rowCount } = await query(
      'DELETE FROM player_unlocks WHERE uid = $1 AND unlockable_id = $2',
      [uid, unlockableId]
    );
    await query(
      `INSERT INTO activity_logs (admin_id, admin_name, action, target_uid, details, created_at)
       VALUES ($1,$2,'revoke_unlock',$3,$4,NOW())`,
      [req.user.uid, req.user.username, uid, `Revoked unlock: ${unlockableId}`]
    );
    return res.json({ success: true, removed: rowCount });
  } catch (err) {
    console.error('[Admin] revoke-unlock error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Revoke ALL unlockables from self (or target user)
router.post('/profile/revoke-all-unlocks', requireAuth, requireAdmin, async (req, res) => {
  const uid = req.body.targetUid || req.user.uid;
  try {
    const { rowCount } = await query(
      'DELETE FROM player_unlocks WHERE uid = $1',
      [uid]
    );
    await query(
      `INSERT INTO activity_logs (admin_id, admin_name, action, target_uid, details, created_at)
       VALUES ($1,$2,'revoke_all_unlocks',$3,$4,NOW())`,
      [req.user.uid, req.user.username, uid, `Revoked all ${rowCount} profile unlockables`]
    );
    return res.json({ success: true, removed: rowCount });
  } catch (err) {
    console.error('[Admin] revoke-all-unlocks error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/profile/custom-title', requireAuth, requireAdmin, async (req, res) => {
  const { targetUid, customTitleText } = req.body;
  if (!targetUid) return res.status(400).json({ error: 'targetUid required' });
  if (!customTitleText || typeof customTitleText !== 'string') {
    return res.status(400).json({ error: 'customTitleText required' });
  }

  const clean = customTitleText.replace(/<[^>]*>/g, '').trim().slice(0, 40);
  if (!clean) return res.status(400).json({ error: 'Custom title text is empty after sanitization' });

  try {
    // Verify target user exists
    const { rows: userRows } = await query('SELECT uid, username FROM users WHERE uid = $1', [targetUid]);
    if (!userRows.length) return res.status(404).json({ error: 'User not found' });

    await query(`
      INSERT INTO player_profiles (uid, card_title, custom_title_text, updated_at)
      VALUES ($1, 'title_custom', $2, NOW())
      ON CONFLICT (uid) DO UPDATE SET
        card_title = 'title_custom',
        custom_title_text = $2,
        updated_at = NOW()
    `, [targetUid, clean]);

    await query(`
      INSERT INTO player_unlocks (uid, unlockable_id)
      VALUES ($1, 'title_custom') ON CONFLICT DO NOTHING
    `, [targetUid]);

    await query(`
      INSERT INTO activity_logs (admin_id, admin_name, action, target_uid, details, created_at)
      VALUES ($1, $2, 'grant_custom_title', $3, $4, NOW())
    `, [req.user.uid, req.user.username, targetUid, `Custom title: "${clean}" granted to ${userRows[0].username}`]);

    return res.json({ success: true, username: userRows[0].username, customTitleText: clean });
  } catch (err) {
    console.error('[Admin] POST /profile/custom-title error:', err.message);
    return res.status(500).json({ error: 'Failed to grant custom title' });
  }
});

module.exports = router;
