// routes/ridethebus.js
// Server-authoritative Ride the Bus (classic 4-round card game).
// Gated by the 'casino' feature flag.

const express = require('express');
const router  = express.Router();
const { query, withTransaction } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const MIN_BET = 10;
const MAX_BET = 50_000;
const GAME_TTL_MS = 5 * 60 * 1000;

// Progressive payout multipliers per round (applied to original bet)
// Players can cash out after any correct round 1-3, or ride for the big win
const ROUND_MULTIPLIERS = { 1: 2, 2: 4, 3: 8, 4: 25 };

const GAMES = new Map();

setInterval(() => {
  const cutoff = Date.now() - GAME_TTL_MS;
  for (const [id, g] of GAMES) if (g.createdAt < cutoff) GAMES.delete(id);
}, 60_000).unref?.();

// ── Card helpers ──────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

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
  if (r === 'A') return 1;
  if (r === 'J') return 11;
  if (r === 'Q') return 12;
  if (r === 'K') return 13;
  return parseInt(r, 10);
}

function isRed(s) { return s === '♥' || s === '♦'; }

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

// ── POST /api/ridethebus/start ────────────────────────────────
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
    const firstCard = deck.pop();
    const gameId = makeId();

    GAMES.set(gameId, {
      uid: req.user.uid,
      bet,
      deck,
      cards: [firstCard],
      round: 1,
      createdAt: Date.now(),
    });

    return res.json({
      gameId,
      round: 1,
      card: firstCard,
      previousCards: [],
      bet,
      newBalance,
    });
  } catch (err) {
    if (err.code === 'COINS') return res.status(409).json({ error: err.message });
    if (err.code === 'NF')    return res.status(404).json({ error: err.message });
    console.error('[RTB] start error:', err);
    return res.status(500).json({ error: 'Failed to start game' });
  }
});

// ── POST /api/ridethebus/guess ────────────────────────────────
router.post('/guess', requireAuth, async (req, res) => {
  const { gameId, guess } = req.body || {};
  const game = GAMES.get(gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.uid !== req.user.uid) return res.status(403).json({ error: 'Not your game' });

  const round = game.round;
  const newCard = game.deck.pop();
  if (!newCard) {
    GAMES.delete(gameId);
    return res.status(500).json({ error: 'Deck exhausted' });
  }

  let correct = false;
  const lastCard = game.cards[game.cards.length - 1];

  if (round === 1) {
    // Red or Black?
    if (guess !== 'red' && guess !== 'black') return res.status(400).json({ error: 'Guess must be red or black' });
    correct = isRed(newCard.s) === (guess === 'red');
  } else if (round === 2) {
    // Higher or Lower?
    if (guess !== 'higher' && guess !== 'lower') return res.status(400).json({ error: 'Guess must be higher or lower' });
    const newVal = cardValue(newCard.r);
    const lastVal = cardValue(lastCard.r);
    if (newVal === lastVal) {
      correct = false; // tie = house wins
    } else {
      correct = guess === 'higher' ? newVal > lastVal : newVal < lastVal;
    }
  } else if (round === 3) {
    // Inside or Outside the range of previous cards?
    if (guess !== 'inside' && guess !== 'outside') return res.status(400).json({ error: 'Guess must be inside or outside' });
    const vals = game.cards.map(c => cardValue(c.r));
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const nv = cardValue(newCard.r);
    if (nv === lo || nv === hi) {
      correct = false; // on boundary = house wins
    } else {
      const inside = nv > lo && nv < hi;
      correct = guess === 'inside' ? inside : !inside;
    }
  } else if (round === 4) {
    // Guess the suit
    const suitMap = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
    if (!suitMap[guess]) return res.status(400).json({ error: 'Guess must be spades, hearts, diamonds, or clubs' });
    correct = newCard.s === suitMap[guess];
  } else {
    GAMES.delete(gameId);
    return res.status(409).json({ error: 'Game already finished' });
  }

  game.cards.push(newCard);

  if (!correct) {
    // Lose — game over
    GAMES.delete(gameId);
    return res.json({
      gameId,
      round,
      card: newCard,
      previousCards: game.cards,
      correct: false,
      done: true,
      payout: 0,
      newBalance: null, // client can pull fresh
    });
  }

  if (round < 4) {
    // Advance to next round — player can cash out or continue
    game.round = round + 1;
    const currentMultiplier = ROUND_MULTIPLIERS[round];
    const nextMultiplier = ROUND_MULTIPLIERS[round + 1];
    return res.json({
      gameId,
      round: game.round,
      card: newCard,
      previousCards: game.cards,
      correct: true,
      done: false,
      cashoutValue: game.bet * currentMultiplier,
      nextMultiplier,
    });
  }

  // Round 4 correct — big win!
  const payout = game.bet * ROUND_MULTIPLIERS[4];
  GAMES.delete(gameId);

  const { rows } = await query(
    `UPDATE users SET total_coins = total_coins + $2, updated_at = NOW()
     WHERE uid = $1 RETURNING total_coins`, [game.uid, payout]
  );
  emitBalance(req, game.uid);

  return res.json({
    gameId,
    round,
    card: newCard,
    previousCards: game.cards,
    correct: true,
    done: true,
    payout,
    newBalance: rows[0]?.total_coins ?? null,
  });
});

// ── POST /api/ridethebus/cashout ──────────────────────────────
// Cash out after a correct round 1-3 instead of continuing
router.post('/cashout', requireAuth, async (req, res) => {
  const { gameId } = req.body || {};
  const game = GAMES.get(gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.uid !== req.user.uid) return res.status(403).json({ error: 'Not your game' });

  // Can only cash out if the current round > 1 (meaning at least round 1 was correct)
  // game.round is the NEXT round to play, so the last completed round is game.round - 1
  const completedRound = game.round - 1;
  if (completedRound < 1) return res.status(409).json({ error: 'No rounds completed yet' });

  const payout = game.bet * ROUND_MULTIPLIERS[completedRound];
  GAMES.delete(gameId);

  const { rows } = await query(
    `UPDATE users SET total_coins = total_coins + $2, updated_at = NOW()
     WHERE uid = $1 RETURNING total_coins`, [game.uid, payout]
  );
  emitBalance(req, game.uid);

  return res.json({
    gameId,
    cashout: true,
    round: completedRound,
    payout,
    newBalance: rows[0]?.total_coins ?? null,
  });
});

module.exports = router;
