// routes/poker.js
// Server-authoritative 5-Card Draw Poker vs Dealer.
// Gated by the 'casino' feature flag.

const express = require('express');
const router  = express.Router();
const { query, withTransaction } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const MIN_BET = 10;
const MAX_BET = 50_000;
const GAME_TTL_MS = 5 * 60 * 1000;

const GAMES = new Map();

setInterval(() => {
  const cutoff = Date.now() - GAME_TTL_MS;
  for (const [id, g] of GAMES) if (g.createdAt < cutoff) GAMES.delete(id);
}, 60_000).unref?.();

// ── Card helpers ──────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

function freshDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardValue(r) {
  const idx = RANKS.indexOf(r);
  return idx >= 0 ? idx + 2 : 0; // 2=2 ... A=14
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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

// ═══════════════════════════════════════════════════════════════
// HAND EVALUATION ENGINE
// ═══════════════════════════════════════════════════════════════
// Returns { rank: 1-9, name: string, kickers: number[] }
// Higher rank = better hand. Kickers for tiebreaking (descending).

const HAND_NAMES = {
  9: 'Straight Flush',
  8: 'Four of a Kind',
  7: 'Full House',
  6: 'Flush',
  5: 'Straight',
  4: 'Three of a Kind',
  3: 'Two Pair',
  2: 'One Pair',
  1: 'High Card',
};

function evaluateHand(cards) {
  const vals = cards.map(c => cardValue(c.r)).sort((a, b) => b - a);
  const suits = cards.map(c => c.s);

  // Count rank frequencies
  const freq = {};
  for (const v of vals) freq[v] = (freq[v] || 0) + 1;
  const groups = Object.entries(freq)
    .map(([v, c]) => ({ val: parseInt(v), count: c }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  const isFlush = new Set(suits).size === 1;
  const isStraight = _checkStraight(vals);
  // Special case: A-2-3-4-5 (wheel)
  const isWheel = vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2;

  if (isFlush && (isStraight || isWheel)) {
    const high = isWheel ? 5 : vals[0]; // wheel's high card is 5
    return { rank: 9, name: HAND_NAMES[9], kickers: [high] };
  }
  if (groups[0].count === 4) {
    return { rank: 8, name: HAND_NAMES[8], kickers: [groups[0].val, groups[1].val] };
  }
  if (groups[0].count === 3 && groups[1].count === 2) {
    return { rank: 7, name: HAND_NAMES[7], kickers: [groups[0].val, groups[1].val] };
  }
  if (isFlush) {
    return { rank: 6, name: HAND_NAMES[6], kickers: vals };
  }
  if (isStraight || isWheel) {
    const high = isWheel ? 5 : vals[0];
    return { rank: 5, name: HAND_NAMES[5], kickers: [high] };
  }
  if (groups[0].count === 3) {
    const rest = groups.slice(1).map(g => g.val).sort((a, b) => b - a);
    return { rank: 4, name: HAND_NAMES[4], kickers: [groups[0].val, ...rest] };
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairVals = [groups[0].val, groups[1].val].sort((a, b) => b - a);
    const kicker = groups[2].val;
    return { rank: 3, name: HAND_NAMES[3], kickers: [...pairVals, kicker] };
  }
  if (groups[0].count === 2) {
    const rest = groups.slice(1).map(g => g.val).sort((a, b) => b - a);
    return { rank: 2, name: HAND_NAMES[2], kickers: [groups[0].val, ...rest] };
  }
  return { rank: 1, name: HAND_NAMES[1], kickers: vals };
}

function _checkStraight(sortedDesc) {
  for (let i = 0; i < sortedDesc.length - 1; i++) {
    if (sortedDesc[i] - sortedDesc[i + 1] !== 1) return false;
  }
  return true;
}

// Compare two evaluated hands. Returns >0 if a wins, <0 if b wins, 0 if tie.
function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
    const ak = a.kickers[i] || 0;
    const bk = b.kickers[i] || 0;
    if (ak !== bk) return ak - bk;
  }
  return 0;
}

// Payout multipliers (on player win, applied to bet)
const WIN_PAYOUTS = {
  1: 1,   // High Card → 1x (just get bet back, essentially a push)
  2: 2,   // Pair → 2x
  3: 3,   // Two Pair → 3x
  4: 4,   // Three of a Kind → 4x
  5: 6,   // Straight → 6x
  6: 8,   // Flush → 8x
  7: 10,  // Full House → 10x
  8: 25,  // Four of a Kind → 25x
  9: 50,  // Straight Flush → 50x
};

// ── Dealer AI ─────────────────────────────────────────────────
// Decides which cards to keep. Returns indices (0-4) to hold.
function dealerStrategy(hand) {
  const ev = evaluateHand(hand);

  // Keep everything if straight or better
  if (ev.rank >= 5) return [0, 1, 2, 3, 4];

  const vals = hand.map(c => cardValue(c.r));
  const suits = hand.map(c => c.s);
  const freq = {};
  for (const v of vals) freq[v] = (freq[v] || 0) + 1;

  // Keep cards that contribute to pairs/trips/quads
  const pairHold = [];
  for (let i = 0; i < hand.length; i++) {
    if (freq[vals[i]] >= 2) pairHold.push(i);
  }
  if (pairHold.length > 0) return pairHold;

  // Check for 4-to-a-flush (4 cards same suit) — hold those 4
  const suitCount = {};
  for (const s of suits) suitCount[s] = (suitCount[s] || 0) + 1;
  for (const s in suitCount) {
    if (suitCount[s] >= 4) {
      const flushHold = [];
      for (let i = 0; i < hand.length; i++) {
        if (suits[i] === s) flushHold.push(i);
      }
      return flushHold; // hold the 4 (or 5) suited cards
    }
  }

  // Check for 4-to-a-straight (4 consecutive values) — hold those 4
  const sorted = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const unique = [];
  for (const s of sorted) {
    if (unique.length === 0 || s.v !== unique[unique.length - 1].v) unique.push(s);
  }
  for (let start = 0; start <= unique.length - 4; start++) {
    if (unique[start + 3].v - unique[start].v === 3) {
      const straightVals = new Set();
      for (let j = start; j < start + 4; j++) straightVals.add(unique[j].v);
      const straightHold = [];
      for (let i = 0; i < hand.length; i++) {
        if (straightVals.has(vals[i]) && straightHold.length < 4) straightHold.push(i);
      }
      return straightHold;
    }
  }

  // High card only — keep the two highest cards, discard 3
  const indexed = vals.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  return [indexed[0].i, indexed[1].i];
}

function applyDraw(hand, holdIndices, deck) {
  const newHand = [...hand];
  for (let i = 0; i < 5; i++) {
    if (!holdIndices.includes(i)) {
      newHand[i] = deck.pop();
    }
  }
  return newHand;
}

// ── POST /api/poker/start ─────────────────────────────────────
router.post('/start', requireAuth, async (req, res) => {
  if (!(await isEnabled())) return res.status(403).json({ error: 'Not available' });

  const bet = Math.floor(Number(req.body?.bet));
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
    return res.status(400).json({ error: `Bet must be ${MIN_BET}-${MAX_BET}` });
  }

  try {
    const newBalance = await withTransaction(async (client) => {
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

    const deck = freshDeck();
    const playerHand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];

    const gameId = makeId();
    GAMES.set(gameId, {
      uid: req.user.uid,
      bet,
      deck,
      playerHand,
      dealerHand,
      phase: 'draw',
      createdAt: Date.now(),
    });

    return res.json({
      gameId,
      bet,
      hand: playerHand,
      newBalance,
    });
  } catch (err) {
    if (err.code === 'COINS') return res.status(409).json({ error: err.message });
    if (err.code === 'NF')    return res.status(404).json({ error: err.message });
    console.error('[Poker] start error:', err);
    return res.status(500).json({ error: 'Failed to start hand' });
  }
});

// ── POST /api/poker/draw ──────────────────────────────────────
// Body: { gameId, hold: [0,1,4] }  — indices of cards to KEEP
router.post('/draw', requireAuth, async (req, res) => {
  const { gameId, hold } = req.body || {};
  const game = GAMES.get(gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.uid !== req.user.uid) return res.status(403).json({ error: 'Not your game' });
  if (game.phase !== 'draw') return res.status(409).json({ error: 'Already resolved' });

  // Validate hold array
  if (!Array.isArray(hold) || hold.some(i => !Number.isInteger(i) || i < 0 || i > 4)) {
    return res.status(400).json({ error: 'hold must be array of indices 0-4' });
  }
  const uniqueHold = [...new Set(hold)];

  // Player draws
  game.playerHand = applyDraw(game.playerHand, uniqueHold, game.deck);

  // Dealer draws
  const dealerHold = dealerStrategy(game.dealerHand);
  game.dealerHand = applyDraw(game.dealerHand, dealerHold, game.deck);

  // Evaluate
  const playerEval = evaluateHand(game.playerHand);
  const dealerEval = evaluateHand(game.dealerHand);
  const cmp = compareHands(playerEval, dealerEval);

  let outcome, payout;
  if (cmp > 0) {
    outcome = 'win';
    payout = game.bet * (WIN_PAYOUTS[playerEval.rank] || 1);
  } else if (cmp === 0) {
    outcome = 'push';
    payout = game.bet; // return ante
  } else {
    outcome = 'lose';
    payout = 0;
  }

  game.phase = 'done';
  GAMES.delete(gameId);

  let newBalance = null;
  if (payout > 0) {
    const { rows } = await query(
      `UPDATE users SET total_coins = total_coins + $2, updated_at = NOW()
       WHERE uid = $1 RETURNING total_coins`, [game.uid, payout]
    );
    newBalance = rows[0]?.total_coins ?? null;
    emitBalance(req, game.uid);
  } else {
    const { rows } = await query(`SELECT total_coins FROM users WHERE uid = $1`, [game.uid]);
    newBalance = rows[0]?.total_coins ?? null;
  }

  return res.json({
    gameId,
    playerHand: game.playerHand,
    dealerHand: game.dealerHand,
    playerRank: playerEval.name,
    dealerRank: dealerEval.name,
    outcome,
    payout,
    newBalance,
  });
});

module.exports = router;
