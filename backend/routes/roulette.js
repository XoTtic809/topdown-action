// routes/roulette.js
// Server-authoritative European Roulette (single zero).
// Stateless — one spin per request.
// Gated by the 'casino' feature flag.

const express = require('express');
const router  = express.Router();
const { query, withTransaction } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const MIN_BET = 10;
const MAX_BET = 50_000;

// European roulette: 0-36 (37 pockets)
const POCKETS = [];
for (let i = 0; i <= 36; i++) POCKETS.push(i);

// Standard roulette colors
const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function pocketColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

// ── Bet validation & payout ──────────────────────────────────
// Supported bet types and their payouts:
const BET_TYPES = {
  // Inside bets
  straight:  { payout: 35, validate: (v) => Number.isInteger(v) && v >= 0 && v <= 36 },
  split:     { payout: 17, validate: (v) => Array.isArray(v) && v.length === 2 && v.every(n => n >= 0 && n <= 36) },
  // Outside bets
  red:       { payout: 1, validate: () => true },
  black:     { payout: 1, validate: () => true },
  odd:       { payout: 1, validate: () => true },
  even:      { payout: 1, validate: () => true },
  low:       { payout: 1, validate: () => true },   // 1-18
  high:      { payout: 1, validate: () => true },   // 19-36
  dozen1:    { payout: 2, validate: () => true },   // 1-12
  dozen2:    { payout: 2, validate: () => true },   // 13-24
  dozen3:    { payout: 2, validate: () => true },   // 25-36
  col1:      { payout: 2, validate: () => true },   // 1,4,7,...,34
  col2:      { payout: 2, validate: () => true },   // 2,5,8,...,35
  col3:      { payout: 2, validate: () => true },   // 3,6,9,...,36
};

function doesBetWin(type, value, result) {
  if (result === 0) return false; // 0 loses all outside bets, only straight/split on 0 wins

  switch (type) {
    case 'straight': return result === value;
    case 'split':    return value.includes(result);
    case 'red':      return RED_NUMBERS.has(result);
    case 'black':    return !RED_NUMBERS.has(result) && result !== 0;
    case 'odd':      return result % 2 === 1;
    case 'even':     return result % 2 === 0 && result !== 0;
    case 'low':      return result >= 1 && result <= 18;
    case 'high':     return result >= 19 && result <= 36;
    case 'dozen1':   return result >= 1 && result <= 12;
    case 'dozen2':   return result >= 13 && result <= 24;
    case 'dozen3':   return result >= 25 && result <= 36;
    case 'col1':     return result % 3 === 1;
    case 'col2':     return result % 3 === 2;
    case 'col3':     return result % 3 === 0;
    default: return false;
  }
}

// Special case: straight on 0
function doesBetWinZero(type, value) {
  if (type === 'straight' && value === 0) return true;
  if (type === 'split' && Array.isArray(value) && value.includes(0)) return true;
  return false;
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

// ── POST /api/roulette/spin ──────────────────────────────────
// Body: { bets: [{ type, value?, amount }] }
// Allows multiple bets per spin (e.g. red + straight on 17)
router.post('/spin', requireAuth, async (req, res) => {
  if (!(await isEnabled())) return res.status(403).json({ error: 'Not available' });

  const { bets } = req.body || {};
  if (!Array.isArray(bets) || bets.length === 0 || bets.length > 20) {
    return res.status(400).json({ error: 'Provide 1-20 bets' });
  }

  // Validate each bet
  let totalBet = 0;
  const parsedBets = [];
  for (const b of bets) {
    const betType = BET_TYPES[b.type];
    if (!betType) return res.status(400).json({ error: `Unknown bet type: ${b.type}` });
    const amount = Math.floor(Number(b.amount));
    if (!Number.isFinite(amount) || amount < MIN_BET || amount > MAX_BET) {
      return res.status(400).json({ error: `Each bet must be ${MIN_BET}-${MAX_BET}` });
    }
    if (!betType.validate(b.value)) {
      return res.status(400).json({ error: `Invalid value for bet type ${b.type}` });
    }
    totalBet += amount;
    parsedBets.push({ type: b.type, value: b.value, amount });
  }

  if (totalBet > MAX_BET) {
    return res.status(400).json({ error: `Total bet cannot exceed ${MAX_BET}` });
  }

  try {
    // Atomic deduction of total bet
    let balance = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT total_coins FROM users WHERE uid = $1 FOR UPDATE`, [req.user.uid]
      );
      if (!rows[0]) throw Object.assign(new Error('User not found'), { code: 'NF' });
      if (rows[0].total_coins < totalBet) throw Object.assign(new Error('Insufficient coins'), { code: 'COINS' });
      const upd = await client.query(
        `UPDATE users SET total_coins = total_coins - $2, updated_at = NOW()
         WHERE uid = $1 RETURNING total_coins`, [req.user.uid, totalBet]
      );
      return upd.rows[0].total_coins;
    });

    // Spin the wheel — uniform random 0-36
    const result = Math.floor(Math.random() * 37);
    const color = pocketColor(result);

    // Evaluate bets
    let totalPayout = 0;
    const betResults = parsedBets.map(b => {
      const won = (result === 0) ? doesBetWinZero(b.type, b.value) : doesBetWin(b.type, b.value, result);
      const payout = won ? b.amount + b.amount * BET_TYPES[b.type].payout : 0;
      totalPayout += payout;
      return { type: b.type, value: b.value, amount: b.amount, won, payout };
    });

    // Credit payout
    if (totalPayout > 0) {
      const { rows } = await query(
        `UPDATE users SET total_coins = total_coins + $2, updated_at = NOW()
         WHERE uid = $1 RETURNING total_coins`, [req.user.uid, totalPayout]
      );
      balance = rows[0]?.total_coins ?? balance;
      emitBalance(req, req.user.uid);
    }

    return res.json({
      result,
      color,
      bets: betResults,
      totalBet,
      totalPayout,
      netGain: totalPayout - totalBet,
      newBalance: balance,
    });
  } catch (err) {
    if (err.code === 'COINS') return res.status(409).json({ error: err.message });
    if (err.code === 'NF')    return res.status(404).json({ error: err.message });
    console.error('[Roulette] spin error:', err);
    return res.status(500).json({ error: 'Failed to spin' });
  }
});

module.exports = router;
