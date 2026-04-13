// routes/slots.js
// Server-authoritative 3-reel slot machine. Stateless — one spin per request.
// Gated by the 'casino' feature flag.

const express = require('express');
const router  = express.Router();
const { query, withTransaction } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const MIN_BET = 10;
const MAX_BET = 50_000;

// Weighted symbol pool (total = 100)
const SYMBOLS = [
  { id: 'cherry',  weight: 25, emoji: '🍒' },
  { id: 'lemon',   weight: 22, emoji: '🍋' },
  { id: 'bar',     weight: 20, emoji: '🍫' },
  { id: 'star',    weight: 15, emoji: '⭐' },
  { id: 'seven',   weight: 10, emoji: '7️⃣' },
  { id: 'diamond', weight: 8,  emoji: '💎' },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((s, sym) => s + sym.weight, 0);

// Payout multipliers (applied to bet)
const TRIPLE_PAYOUTS = {
  diamond: 50,
  seven:   25,
  star:    15,
  bar:     10,
  lemon:   5,
  cherry:  3,
};

function pickSymbol() {
  let r = Math.floor(Math.random() * TOTAL_WEIGHT);
  for (const sym of SYMBOLS) {
    r -= sym.weight;
    if (r < 0) return sym;
  }
  return SYMBOLS[0];
}

function computePayout(symbols, bet) {
  const [a, b, c] = symbols.map(s => s.id);

  // Three of a kind
  if (a === b && b === c) {
    return bet * (TRIPLE_PAYOUTS[a] || 3);
  }

  // Two of a kind (any position) — pays 1.5x
  if (a === b || b === c || a === c) {
    return Math.floor(bet * 1.5);
  }

  // No match — lose bet
  return 0;
}

async function isEnabled() {
  const { rows } = await query(`SELECT enabled FROM feature_flags WHERE key = 'casino'`);
  return !!rows[0]?.enabled;
}

function emitBalance(req, uid) {
  try {
    const io = req.app.get('io');
    if (io) io.to('user:' + uid).emit('user:balance-updated', { reason: 'casino' });
  } catch (e) { /* non-fatal */ }
}

// ── POST /api/slots/spin ──────────────────────────────────────
router.post('/spin', requireAuth, async (req, res) => {
  if (!(await isEnabled())) return res.status(403).json({ error: 'Not available' });

  const bet = Math.floor(Number(req.body?.bet));
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
    return res.status(400).json({ error: `Bet must be ${MIN_BET}-${MAX_BET}` });
  }

  try {
    // Atomic deduction
    let balance = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT total_coins FROM users WHERE uid = $1 FOR UPDATE`, [req.user.uid]
      );
      if (!rows[0]) throw Object.assign(new Error('User not found'), { code: 'NF' });
      if (rows[0].total_coins < bet) throw Object.assign(new Error('Insufficient coins'), { code: 'COINS' });
      const upd = await client.query(
        `UPDATE users SET total_coins = total_coins - $2, updated_at = NOW()
         WHERE uid = $1 RETURNING total_coins`, [req.user.uid, bet]
      );
      return upd.rows[0].total_coins;
    });

    // Pick 3 symbols
    const symbols = [pickSymbol(), pickSymbol(), pickSymbol()];
    const payout = computePayout(symbols, bet);

    // Credit payout if any
    if (payout > 0) {
      const { rows } = await query(
        `UPDATE users SET total_coins = total_coins + $2, updated_at = NOW()
         WHERE uid = $1 RETURNING total_coins`, [req.user.uid, payout]
      );
      balance = rows[0]?.total_coins ?? balance;
      emitBalance(req, req.user.uid);
    }

    return res.json({
      symbols: symbols.map(s => ({ id: s.id, emoji: s.emoji })),
      bet,
      payout,
      newBalance: balance,
    });
  } catch (err) {
    if (err.code === 'COINS') return res.status(409).json({ error: err.message });
    if (err.code === 'NF')    return res.status(404).json({ error: err.message });
    console.error('[Slots] spin error:', err);
    return res.status(500).json({ error: 'Failed to spin' });
  }
});

module.exports = router;
