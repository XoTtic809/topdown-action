// routes/shop.js — Public shop endpoints
'use strict';

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');

// Template prices (must stay in sync with CRATES in crates.js)
const CRATE_TEMPLATE_PRICES = {
  'common-crate':    300,
  'rare-crate':      750,
  'epic-crate':      1500,
  'legendary-crate': 4000,
  'icon-crate':      750,
  'oblivion-crate':  10000,
  'neon-crate':      2000,
  'frost-crate':     2500,
  'infernal-crate':  2500,
  'void-crate':      6000,
};

// ── GET /api/shop/crates ──────────────────────────────────────────────────────
// Public. Returns all active, non-retired crates with discount-applied prices.
router.get('/crates', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM crate_rotation WHERE active = true AND retired = false`
    );

    const crates = rows.map(row => {
      const templatePrice = CRATE_TEMPLATE_PRICES[row.crate_id] ?? 0;
      const effectivePrice = row.price_override ?? templatePrice;
      const discountPct = row.discount_percent || 0;
      const finalPrice = Math.floor(effectivePrice * (1 - discountPct / 100));

      const entry = {
        crateId:       row.crate_id,
        price:         finalPrice,
        stockRemaining: row.stock_remaining,   // null = unlimited
        stockLimit:    row.stock_limit,
        timerVisible:  row.timer_visible,
        endsAt:        row.ends_at ? row.ends_at.toISOString() : null,
        rotationLabel: row.rotation_label,
        weekendOnly:   row.weekend_only,
        discountPercent: discountPct,
      };

      if (discountPct > 0) {
        entry.originalPrice = effectivePrice;
      }

      return entry;
    });

    // Weekly rotation countdown info
    let weeklyRotation = null;
    try {
      const { rows: [wrc] } = await query(
        `SELECT enabled, next_rotation_at FROM weekly_rotation_config WHERE id = 1`
      );
      if (wrc && wrc.enabled && wrc.next_rotation_at) {
        weeklyRotation = { enabled: true, nextRotationAt: wrc.next_rotation_at.toISOString() };
      }
    } catch (_) { /* table may not exist yet */ }

    return res.json({ crates, weeklyRotation });
  } catch (err) {
    console.error('[Shop] GET /crates error:', err.message);
    return res.status(500).json({ error: 'Failed to load shop' });
  }
});

module.exports = router;
