// routes/blackjack.js
// Server-authoritative single-deck blackjack using in-game coins.
//
// Hidden by default — gated by the `blackjack` feature flag in feature_flags.
// All deck/shuffle/hand state lives in an in-memory Map keyed by handId so
// the client cannot fabricate winning hands. Losing the Map on a server
// restart simply voids in-flight hands, which is acceptable for a hidden
// novelty mode.

const express = require('express');
const router  = express.Router();
const { query, withTransaction } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// ── Config ────────────────────────────────────────────────────
const MIN_BET = 10;
const MAX_BET = 50_000;
const HAND_TTL_MS = 5 * 60 * 1000;

// ── In-memory hand store ──────────────────────────────────────
// handId -> { uid, bet, deck, player, dealer, doubled, state, createdAt }
const HANDS = new Map();

setInterval(() => {
  const cutoff = Date.now() - HAND_TTL_MS;
  for (const [id, h] of HANDS) if (h.createdAt < cutoff) HANDS.delete(id);
}, 60_000).unref?.();

// ── Card helpers ──────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function freshDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  // Fisher-Yates
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.r === 'A') { total += 11; aces++; }
    else if (c.r === 'K' || c.r === 'Q' || c.r === 'J') total += 10;
    else total += parseInt(c.r, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards) === 21;
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
    if (io) io.to('user:' + uid).emit('user:balance-updated', { reason: 'blackjack' });
  } catch (e) { /* non-fatal */ }
}

// ── POST /api/blackjack/start ─────────────────────────────────
// Body: { bet }
// Atomically deducts the bet from the user's balance and deals.
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
    const player = [deck.pop(), deck.pop()];
    const dealer = [deck.pop(), deck.pop()];

    const handId = makeId();
    const hand = {
      uid: req.user.uid,
      bet,
      deck,
      player,
      dealer,
      doubled: false,
      state: 'player',
      createdAt: Date.now(),
    };
    HANDS.set(handId, hand);

    // Natural blackjack — auto-resolve immediately
    if (isBlackjack(player) || isBlackjack(dealer)) {
      return res.json(await resolveHand(handId, hand, req));
    }

    return res.json({
      handId,
      state: hand.state,
      player: hand.player,
      dealerUp: [hand.dealer[0]],
      bet,
      newBalance,
    });
  } catch (err) {
    if (err.code === 'COINS') return res.status(409).json({ error: err.message });
    if (err.code === 'NF')    return res.status(404).json({ error: err.message });
    console.error('[Blackjack] start error:', err);
    return res.status(500).json({ error: 'Failed to start hand' });
  }
});

// ── POST /api/blackjack/action ────────────────────────────────
// Body: { handId, action: 'hit'|'stand'|'double' }
router.post('/action', requireAuth, async (req, res) => {
  const { handId, action } = req.body || {};
  const hand = HANDS.get(handId);
  if (!hand) return res.status(404).json({ error: 'Hand not found' });
  if (hand.uid !== req.user.uid) return res.status(403).json({ error: 'Not your hand' });
  if (hand.state !== 'player') return res.status(409).json({ error: 'Hand already resolved' });

  if (action === 'hit') {
    hand.player.push(hand.deck.pop());
    if (handValue(hand.player) >= 21) {
      return res.json(await resolveHand(handId, hand, req));
    }
    return res.json({ handId, state: 'player', player: hand.player, dealerUp: [hand.dealer[0]] });
  }

  if (action === 'stand') {
    return res.json(await resolveHand(handId, hand, req));
  }

  if (action === 'double') {
    if (hand.player.length !== 2) return res.status(409).json({ error: 'Can only double on first action' });
    // Charge the additional bet atomically
    try {
      await withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT total_coins FROM users WHERE uid = $1 FOR UPDATE`, [req.user.uid]
        );
        if (!rows[0] || rows[0].total_coins < hand.bet) {
          throw Object.assign(new Error('Insufficient coins to double'), { code: 'COINS' });
        }
        await client.query(
          `UPDATE users SET total_coins = total_coins - $2, updated_at = NOW() WHERE uid = $1`,
          [req.user.uid, hand.bet]
        );
      });
    } catch (e) {
      if (e.code === 'COINS') return res.status(409).json({ error: e.message });
      throw e;
    }
    hand.doubled = true;
    hand.player.push(hand.deck.pop());
    return res.json(await resolveHand(handId, hand, req));
  }

  return res.status(400).json({ error: 'Unknown action' });
});

// ── Resolution ────────────────────────────────────────────────
async function resolveHand(handId, hand, req) {
  // Dealer plays — but only if the player didn't bust
  const playerTotal = handValue(hand.player);
  if (playerTotal <= 21) {
    while (handValue(hand.dealer) < 17) {
      hand.dealer.push(hand.deck.pop());
    }
  }
  const dealerTotal = handValue(hand.dealer);
  const totalBet = hand.bet * (hand.doubled ? 2 : 1);

  let outcome, payout;
  if (playerTotal > 21) { outcome = 'bust';        payout = 0; }
  else if (isBlackjack(hand.player) && !isBlackjack(hand.dealer)) {
    outcome = 'blackjack'; payout = Math.floor(totalBet * 2.5); // 3:2 + original bet back
  } else if (dealerTotal > 21) { outcome = 'dealer_bust'; payout = totalBet * 2; }
  else if (playerTotal > dealerTotal)  { outcome = 'win';  payout = totalBet * 2; }
  else if (playerTotal === dealerTotal){ outcome = 'push'; payout = totalBet; }
  else                                  { outcome = 'lose'; payout = 0; }

  let newBalance = null;
  if (payout > 0) {
    const { rows } = await query(
      `UPDATE users SET total_coins = total_coins + $2, updated_at = NOW()
       WHERE uid = $1 RETURNING total_coins`, [hand.uid, payout]
    );
    newBalance = rows[0]?.total_coins ?? null;
    emitBalance(req, hand.uid);
  } else {
    const { rows } = await query(`SELECT total_coins FROM users WHERE uid = $1`, [hand.uid]);
    newBalance = rows[0]?.total_coins ?? null;
  }

  hand.state = 'done';
  HANDS.delete(handId);

  return {
    handId,
    state: 'done',
    outcome,
    player: hand.player,
    dealer: hand.dealer,
    playerTotal,
    dealerTotal,
    bet: totalBet,
    payout,
    newBalance,
  };
}

module.exports = router;
