// routes/trades.js — peer-to-peer trading (live sessions + offline offers)
'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');

// ── Constants ────────────────────────────────────────────────────────────────
const ONLINE_THRESHOLD_MS  = 60_000;   // presence heartbeat: 60s
const SESSION_TIMEOUT_MINS = 10;
const OFFER_EXPIRE_DAYS    = 7;
const MAX_SKINS_PER_OFFER  = 6;        // each side can offer up to 6 skins
const MAX_COINS_PER_OFFER  = 100_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

// Validate skin array: each entry must be a non-empty string ≤ 120 chars
function validSkinList(arr) {
  if (!Array.isArray(arr)) return false;
  if (arr.length > MAX_SKINS_PER_OFFER) return false;
  return arr.every(s => typeof s === 'string' && s.length > 0 && s.length <= 120);
}

// Count occurrences of each value in an array
function countMap(arr) {
  const m = {};
  for (const v of arr) m[v] = (m[v] || 0) + 1;
  return m;
}

// True if userOwnedSkins contains every item in offerSkins (accounting for duplicates)
function ownsAllSkins(userOwnedSkins, offerSkins) {
  const owned  = countMap(userOwnedSkins);
  const needed = countMap(offerSkins);
  return Object.entries(needed).every(([s, n]) => (owned[s] || 0) >= n);
}

// Remove one copy of each skin in `toRemove` from `owned` array
function removeSkinsCopy(owned, toRemove) {
  const result = [...owned];
  for (const s of toRemove) {
    const idx = result.indexOf(s);
    if (idx !== -1) result.splice(idx, 1);
  }
  return result;
}

// ── Presence ─────────────────────────────────────────────────────────────────

// POST /api/trades/heartbeat — called every 30s by frontend
router.post('/heartbeat', requireAuth, async (req, res) => {
  try {
    await query(`
      INSERT INTO user_presence (uid, username, last_seen)
      VALUES ($1, $2, NOW())
      ON CONFLICT (uid) DO UPDATE SET last_seen = NOW(), username = $2
    `, [req.user.uid, req.user.username]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Heartbeat failed' });
  }
});

// GET /api/trades/presence/:uid — is a specific user online?
router.get('/presence/:uid', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT last_seen FROM user_presence WHERE uid = $1`,
      [req.params.uid]
    );
    if (!rows[0]) return res.json({ online: false });
    const online = Date.now() - new Date(rows[0].last_seen).getTime() < ONLINE_THRESHOLD_MS;
    return res.json({ online });
  } catch (err) {
    return res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/trades/online-users — list recently-online users (for browsing)
router.get('/online-users', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT p.uid, p.username, p.last_seen
      FROM user_presence p
      WHERE p.last_seen > NOW() - INTERVAL '${ONLINE_THRESHOLD_MS / 1000} seconds'
        AND p.uid <> $1
      ORDER BY p.last_seen DESC
      LIMIT 30
    `, [req.user.uid]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed' });
  }
});

// ── Notifications ─────────────────────────────────────────────────────────────

// GET /api/trades/notifications — pending sessions + unread offers for self
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    // Incoming live trade invites (sessions where I'm the target, status=pending)
    const { rows: sessions } = await query(`
      SELECT id, initiator_id, initiator_name, created_at, expires_at
      FROM trade_sessions
      WHERE target_id = $1 AND status = 'pending' AND expires_at > NOW()
      ORDER BY created_at DESC
    `, [uid]);

    // Pending offline offers sent TO me
    const { rows: offers } = await query(`
      SELECT id, sender_id, sender_name, sender_skins, receiver_skins,
             sender_coins, receiver_coins, message, created_at, expires_at
      FROM trade_offers
      WHERE receiver_id = $1 AND status = 'pending' AND expires_at > NOW()
      ORDER BY created_at DESC
    `, [uid]);

    return res.json({ sessions, offers });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// ── Live Trade Sessions ───────────────────────────────────────────────────────

// POST /api/trades/session/request — initiate a live trade
// Body: { targetUid: string }
router.post('/session/request', requireAuth, async (req, res) => {
  const { targetUid } = req.body;
  if (!targetUid) return res.status(400).json({ error: 'targetUid required' });
  if (targetUid === req.user.uid) return res.status(400).json({ error: 'Cannot trade with yourself' });

  try {
    // Check target exists
    const { rows: userRows } = await query(`SELECT uid, username FROM users WHERE uid = $1`, [targetUid]);
    if (!userRows[0]) return res.status(404).json({ error: 'User not found' });

    // Cancel any existing pending sessions between these two users
    await query(`
      UPDATE trade_sessions SET status = 'cancelled', updated_at = NOW()
      WHERE status IN ('pending','active')
        AND ((initiator_id = $1 AND target_id = $2) OR (initiator_id = $2 AND target_id = $1))
    `, [req.user.uid, targetUid]);

    const { rows } = await query(`
      INSERT INTO trade_sessions (initiator_id, initiator_name, target_id, target_name, expires_at)
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${SESSION_TIMEOUT_MINS} minutes')
      RETURNING *
    `, [req.user.uid, req.user.username, targetUid, userRows[0].username]);

    return res.json({ session: rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create session' });
  }
});

// POST /api/trades/session/:id/respond — accept or decline a session invite
// Body: { accept: boolean }
router.post('/session/:id/respond', requireAuth, async (req, res) => {
  const { accept } = req.body;
  try {
    const { rows } = await query(
      `SELECT * FROM trade_sessions WHERE id = $1`, [req.params.id]
    );
    const session = rows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.target_id !== req.user.uid) return res.status(403).json({ error: 'Not your invite' });
    if (session.status !== 'pending') return res.status(409).json({ error: 'Session already responded to' });
    if (new Date(session.expires_at) < new Date()) return res.status(410).json({ error: 'Session expired' });

    const newStatus = accept ? 'active' : 'cancelled';
    const { rows: updated } = await query(`
      UPDATE trade_sessions SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *
    `, [req.params.id, newStatus]);

    return res.json({ session: updated[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to respond' });
  }
});

// GET /api/trades/session/:id — poll session state
router.get('/session/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM trade_sessions WHERE id = $1`, [req.params.id]);
    const session = rows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Only parties involved can poll
    if (session.initiator_id !== req.user.uid && session.target_id !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Auto-expire
    if (session.status === 'active' || session.status === 'pending') {
      if (new Date(session.expires_at) < new Date()) {
        await query(`UPDATE trade_sessions SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [req.params.id]);
        session.status = 'cancelled';
      }
    }

    return res.json({ session });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// POST /api/trades/session/:id/offer — update your offer (skins + coins)
// Body: { skins: string[], coins: number }
router.post('/session/:id/offer', requireAuth, async (req, res) => {
  const { skins = [], coins = 0 } = req.body;
  if (!validSkinList(skins)) return res.status(400).json({ error: 'Invalid skins list' });
  if (typeof coins !== 'number' || coins < 0 || coins > MAX_COINS_PER_OFFER) {
    return res.status(400).json({ error: `Coins must be 0–${MAX_COINS_PER_OFFER}` });
  }

  try {
    const { rows } = await query(`SELECT * FROM trade_sessions WHERE id = $1`, [req.params.id]);
    const session = rows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.initiator_id !== req.user.uid && session.target_id !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (session.status !== 'active') return res.status(409).json({ error: 'Session not active' });
    if (new Date(session.expires_at) < new Date()) return res.status(410).json({ error: 'Session expired' });

    const isInitiator = session.initiator_id === req.user.uid;

    // Verify user owns the skins they're offering
    const { rows: userRows } = await query(`SELECT owned_skins, total_coins FROM users WHERE uid = $1`, [req.user.uid]);
    const user = userRows[0];
    if (!ownsAllSkins(user.owned_skins, skins)) return res.status(409).json({ error: 'You don\'t own all offered skins' });
    if (coins > user.total_coins) return res.status(409).json({ error: 'Not enough coins' });

    const skinsCol = isInitiator ? 'initiator_skins' : 'target_skins';
    const coinsCol = isInitiator ? 'initiator_coins' : 'target_coins';

    // Changing the offer resets both ready flags
    const { rows: updated } = await query(`
      UPDATE trade_sessions
      SET ${skinsCol} = $2, ${coinsCol} = $3,
          initiator_ready = FALSE, target_ready = FALSE,
          updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id, skins, Math.floor(coins)]);

    return res.json({ session: updated[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update offer' });
  }
});

// POST /api/trades/session/:id/ready — toggle your ready state
router.post('/session/:id/ready', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM trade_sessions WHERE id = $1`, [req.params.id]);
    const session = rows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.initiator_id !== req.user.uid && session.target_id !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (session.status !== 'active') return res.status(409).json({ error: 'Session not active' });
    if (new Date(session.expires_at) < new Date()) return res.status(410).json({ error: 'Session expired' });

    const isInitiator = session.initiator_id === req.user.uid;
    const readyCol    = isInitiator ? 'initiator_ready' : 'target_ready';
    const newReady    = !(isInitiator ? session.initiator_ready : session.target_ready);

    // Update ready flag
    const { rows: updated } = await query(`
      UPDATE trade_sessions SET ${readyCol} = $2, updated_at = NOW() WHERE id = $1 RETURNING *
    `, [req.params.id, newReady]);
    const s = updated[0];

    // If BOTH are ready, commit the trade atomically
    if (s.initiator_ready && s.target_ready) {
      return await _commitLiveTrade(req.params.id, s, res);
    }

    return res.json({ session: s });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update ready state' });
  }
});

// POST /api/trades/session/:id/cancel — cancel a session
router.post('/session/:id/cancel', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM trade_sessions WHERE id = $1`, [req.params.id]);
    const session = rows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.initiator_id !== req.user.uid && session.target_id !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!['pending','active'].includes(session.status)) {
      return res.status(409).json({ error: 'Session already ended' });
    }
    await query(`UPDATE trade_sessions SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to cancel session' });
  }
});

// ── Atomic live trade commit ──────────────────────────────────────────────────
async function _commitLiveTrade(sessionId, session, res) {
  try {
    await withTransaction(async (client) => {
      // Lock both user rows in alphabetical uid order to prevent deadlocks
      const [lockFirst, lockSecond] = [session.initiator_id, session.target_id].sort();
      await client.query(`SELECT uid FROM users WHERE uid IN ($1,$2) ORDER BY uid FOR UPDATE`,
        [lockFirst, lockSecond]);

      // Re-read current state of both users
      const { rows: userRows } = await client.query(
        `SELECT uid, owned_skins, total_coins FROM users WHERE uid IN ($1,$2)`,
        [session.initiator_id, session.target_id]
      );
      const initiatorUser = userRows.find(u => u.uid === session.initiator_id);
      const targetUser    = userRows.find(u => u.uid === session.target_id);

      // Re-read session (may have been cancelled)
      const { rows: sessionRows } = await client.query(
        `SELECT * FROM trade_sessions WHERE id = $1`, [sessionId]
      );
      const s = sessionRows[0];
      if (!s || s.status !== 'active' || !s.initiator_ready || !s.target_ready) {
        throw Object.assign(new Error('Trade no longer valid'), { code: 'STALE' });
      }

      // Validate ownership
      if (!ownsAllSkins(initiatorUser.owned_skins, s.initiator_skins)) {
        throw Object.assign(new Error('Initiator no longer owns offered skins'), { code: 'OWNS' });
      }
      if (!ownsAllSkins(targetUser.owned_skins, s.target_skins)) {
        throw Object.assign(new Error('Target no longer owns offered skins'), { code: 'OWNS' });
      }
      if (s.initiator_coins > initiatorUser.total_coins) {
        throw Object.assign(new Error('Initiator lacks coins'), { code: 'COINS' });
      }
      if (s.target_coins > targetUser.total_coins) {
        throw Object.assign(new Error('Target lacks coins'), { code: 'COINS' });
      }

      // Remove offered skins from each user
      const newInitiatorSkins = removeSkinsCopy(initiatorUser.owned_skins, s.initiator_skins);
      const newTargetSkins    = removeSkinsCopy(targetUser.owned_skins, s.target_skins);
      // Add received skins
      const initiatorsNewSkins = [...newInitiatorSkins, ...s.target_skins];
      const targetsNewSkins    = [...newTargetSkins, ...s.initiator_skins];

      // Apply skin swap — reset active_skin to 'agent' if the equipped skin was traded away
      await client.query(
        `UPDATE users SET owned_skins = $2, total_coins = total_coins - $3 + $4,
         active_skin = CASE WHEN NOT (active_skin = ANY($2::text[])) THEN 'agent' ELSE active_skin END,
         updated_at = NOW()
         WHERE uid = $1`,
        [session.initiator_id, initiatorsNewSkins, s.initiator_coins, s.target_coins]
      );
      await client.query(
        `UPDATE users SET owned_skins = $2, total_coins = total_coins - $3 + $4,
         active_skin = CASE WHEN NOT (active_skin = ANY($2::text[])) THEN 'agent' ELSE active_skin END,
         updated_at = NOW()
         WHERE uid = $1`,
        [session.target_id, targetsNewSkins, s.target_coins, s.initiator_coins]
      );

      // Mark session done
      await client.query(
        `UPDATE trade_sessions SET status = 'done', updated_at = NOW() WHERE id = $1`, [sessionId]
      );

      // Log it
      await client.query(`
        INSERT INTO peer_trade_logs
          (trade_type, user_a_id, user_a_name, user_b_id, user_b_name,
           a_gave_skins, b_gave_skins, a_gave_coins, b_gave_coins)
        VALUES ('live', $1,$2,$3,$4,$5,$6,$7,$8)
      `, [session.initiator_id, session.initiator_name,
          session.target_id,    session.target_name,
          s.initiator_skins,    s.target_skins,
          s.initiator_coins,    s.target_coins]);
    });

    // Re-fetch final session state
    const { rows } = await query(`SELECT * FROM trade_sessions WHERE id = $1`, [sessionId]);
    return res.json({ session: rows[0], traded: true });

  } catch (err) {
    if (err.code === 'STALE') return res.status(409).json({ error: err.message });
    if (err.code === 'OWNS')  return res.status(409).json({ error: err.message });
    if (err.code === 'COINS') return res.status(409).json({ error: err.message });
    console.error('[Trades] Commit error:', err);
    return res.status(500).json({ error: 'Trade commit failed' });
  }
}

// ── Offline Trade Offers ──────────────────────────────────────────────────────

// POST /api/trades/offer/send
// Body: { receiverUid, senderSkins[], receiverSkins[], senderCoins, receiverCoins, message }
router.post('/offer/send', requireAuth, async (req, res) => {
  const {
    receiverUid,
    senderSkins   = [],
    receiverSkins = [],
    senderCoins   = 0,
    receiverCoins = 0,
    message       = '',
  } = req.body;

  if (!receiverUid) return res.status(400).json({ error: 'receiverUid required' });
  if (receiverUid === req.user.uid) return res.status(400).json({ error: 'Cannot trade with yourself' });
  if (!validSkinList(senderSkins))   return res.status(400).json({ error: 'Invalid sender skins' });
  if (!validSkinList(receiverSkins)) return res.status(400).json({ error: 'Invalid receiver skins' });
  if (typeof senderCoins !== 'number' || senderCoins < 0 || senderCoins > MAX_COINS_PER_OFFER) {
    return res.status(400).json({ error: 'Invalid sender coins' });
  }
  if (typeof receiverCoins !== 'number' || receiverCoins < 0 || receiverCoins > MAX_COINS_PER_OFFER) {
    return res.status(400).json({ error: 'Invalid receiver coins' });
  }

  try {
    // Check receiver exists
    const { rows: receiverRows } = await query(
      `SELECT uid, username FROM users WHERE uid = $1`, [receiverUid]
    );
    if (!receiverRows[0]) return res.status(404).json({ error: 'Receiver not found' });

    // Validate sender ownership
    const { rows: senderRows } = await query(
      `SELECT owned_skins, total_coins FROM users WHERE uid = $1`, [req.user.uid]
    );
    const sender = senderRows[0];
    if (!ownsAllSkins(sender.owned_skins, senderSkins)) {
      return res.status(409).json({ error: 'You don\'t own all offered skins' });
    }
    if (senderCoins > sender.total_coins) {
      return res.status(409).json({ error: 'Not enough coins' });
    }

    // Limit active pending offers (prevent spam)
    const { rows: existingOffers } = await query(
      `SELECT COUNT(*) FROM trade_offers WHERE sender_id = $1 AND status = 'pending' AND expires_at > NOW()`,
      [req.user.uid]
    );
    if (parseInt(existingOffers[0].count) >= 10) {
      return res.status(429).json({ error: 'You have too many pending offers (max 10)' });
    }

    const { rows } = await query(`
      INSERT INTO trade_offers
        (sender_id, sender_name, receiver_id, receiver_name,
         sender_skins, receiver_skins, sender_coins, receiver_coins,
         message, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW() + INTERVAL '${OFFER_EXPIRE_DAYS} days')
      RETURNING *
    `, [req.user.uid, req.user.username,
        receiverUid, receiverRows[0].username,
        senderSkins, receiverSkins,
        Math.floor(senderCoins), Math.floor(receiverCoins),
        message.slice(0, 200)]);

    return res.json({ offer: rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send offer' });
  }
});

// POST /api/trades/offer/:id/respond — accept or decline
// Body: { accept: boolean }
router.post('/offer/:id/respond', requireAuth, async (req, res) => {
  const { accept } = req.body;

  try {
    const { rows } = await query(`SELECT * FROM trade_offers WHERE id = $1`, [req.params.id]);
    const offer = rows[0];
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.receiver_id !== req.user.uid) return res.status(403).json({ error: 'Not your offer' });
    if (offer.status !== 'pending') return res.status(409).json({ error: 'Offer already resolved' });
    if (new Date(offer.expires_at) < new Date()) return res.status(410).json({ error: 'Offer expired' });

    if (!accept) {
      await query(`UPDATE trade_offers SET status = 'declined' WHERE id = $1`, [req.params.id]);
      return res.json({ ok: true, status: 'declined' });
    }

    // Accept: commit atomically
    return await _commitOfferTrade(req.params.id, offer, res);

  } catch (err) {
    return res.status(500).json({ error: 'Failed to respond to offer' });
  }
});

// POST /api/trades/offer/:id/cancel — sender cancels
router.post('/offer/:id/cancel', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM trade_offers WHERE id = $1`, [req.params.id]);
    const offer = rows[0];
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.sender_id !== req.user.uid) return res.status(403).json({ error: 'Not your offer' });
    if (offer.status !== 'pending') return res.status(409).json({ error: 'Offer already resolved' });
    await query(`UPDATE trade_offers SET status = 'cancelled' WHERE id = $1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to cancel offer' });
  }
});

// ── Atomic offer commit ───────────────────────────────────────────────────────
async function _commitOfferTrade(offerId, offer, res) {
  try {
    await withTransaction(async (client) => {
      // Lock in alphabetical order
      const [lockFirst, lockSecond] = [offer.sender_id, offer.receiver_id].sort();
      await client.query(`SELECT uid FROM users WHERE uid IN ($1,$2) ORDER BY uid FOR UPDATE`,
        [lockFirst, lockSecond]);

      // Re-read users
      const { rows: userRows } = await client.query(
        `SELECT uid, owned_skins, total_coins FROM users WHERE uid IN ($1,$2)`,
        [offer.sender_id, offer.receiver_id]
      );
      const senderUser   = userRows.find(u => u.uid === offer.sender_id);
      const receiverUser = userRows.find(u => u.uid === offer.receiver_id);

      // Re-read offer
      const { rows: offerRows } = await client.query(
        `SELECT * FROM trade_offers WHERE id = $1`, [offerId]
      );
      const o = offerRows[0];
      if (!o || o.status !== 'pending' || new Date(o.expires_at) < new Date()) {
        throw Object.assign(new Error('Offer no longer valid'), { code: 'STALE' });
      }

      // Validate
      if (!ownsAllSkins(senderUser.owned_skins, o.sender_skins)) {
        throw Object.assign(new Error('Sender no longer owns offered skins'), { code: 'OWNS' });
      }
      if (!ownsAllSkins(receiverUser.owned_skins, o.receiver_skins)) {
        throw Object.assign(new Error('You no longer own the requested skins'), { code: 'OWNS' });
      }
      if (o.sender_coins > senderUser.total_coins) {
        throw Object.assign(new Error('Sender no longer has enough coins'), { code: 'COINS' });
      }
      if (o.receiver_coins > receiverUser.total_coins) {
        throw Object.assign(new Error('You don\'t have enough coins'), { code: 'COINS' });
      }

      // Compute new skin arrays
      const newSenderSkins   = [...removeSkinsCopy(senderUser.owned_skins, o.sender_skins), ...o.receiver_skins];
      const newReceiverSkins = [...removeSkinsCopy(receiverUser.owned_skins, o.receiver_skins), ...o.sender_skins];

      await client.query(
        `UPDATE users SET owned_skins = $2, total_coins = total_coins - $3 + $4,
         active_skin = CASE WHEN NOT (active_skin = ANY($2::text[])) THEN 'agent' ELSE active_skin END,
         updated_at = NOW() WHERE uid = $1`,
        [offer.sender_id, newSenderSkins, o.sender_coins, o.receiver_coins]
      );
      await client.query(
        `UPDATE users SET owned_skins = $2, total_coins = total_coins - $3 + $4,
         active_skin = CASE WHEN NOT (active_skin = ANY($2::text[])) THEN 'agent' ELSE active_skin END,
         updated_at = NOW() WHERE uid = $1`,
        [offer.receiver_id, newReceiverSkins, o.receiver_coins, o.sender_coins]
      );

      await client.query(`UPDATE trade_offers SET status = 'accepted' WHERE id = $1`, [offerId]);

      await client.query(`
        INSERT INTO peer_trade_logs
          (trade_type, user_a_id, user_a_name, user_b_id, user_b_name,
           a_gave_skins, b_gave_skins, a_gave_coins, b_gave_coins)
        VALUES ('offer', $1,$2,$3,$4,$5,$6,$7,$8)
      `, [offer.sender_id, offer.sender_name,
          offer.receiver_id, offer.receiver_name,
          o.sender_skins, o.receiver_skins,
          o.sender_coins, o.receiver_coins]);
    });

    return res.json({ ok: true, status: 'accepted' });

  } catch (err) {
    if (err.code === 'STALE') return res.status(409).json({ error: err.message });
    if (err.code === 'OWNS')  return res.status(409).json({ error: err.message });
    if (err.code === 'COINS') return res.status(409).json({ error: err.message });
    console.error('[Trades] Offer commit error:', err);
    return res.status(500).json({ error: 'Trade commit failed' });
  }
}

// ── Offer Inboxes ─────────────────────────────────────────────────────────────

// GET /api/trades/offers/inbox
router.get('/offers/inbox', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM trade_offers
      WHERE receiver_id = $1 AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 50
    `, [req.user.uid]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load inbox' });
  }
});

// GET /api/trades/offers/sent
router.get('/offers/sent', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM trade_offers
      WHERE sender_id = $1 AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 50
    `, [req.user.uid]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load sent offers' });
  }
});

// ── Profile / Inventory lookup ────────────────────────────────────────────────

// GET /api/trades/profile/:uid — public inventory for trading
router.get('/profile/:uid', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT uid, username, owned_skins, active_skin, high_score
       FROM users WHERE uid = $1`,
      [req.params.uid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];

    // Check if online
    const { rows: presRows } = await query(
      `SELECT last_seen FROM user_presence WHERE uid = $1`, [req.params.uid]
    );
    const online = presRows[0]
      ? Date.now() - new Date(presRows[0].last_seen).getTime() < ONLINE_THRESHOLD_MS
      : false;

    return res.json({
      uid:        u.uid,
      username:   u.username,
      activeSkin: u.active_skin,
      highScore:  u.high_score,
      ownedSkins: u.owned_skins,
      online,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

// ── Trade History ──────────────────────────────────────────────────────────────

// GET /api/trades/history
router.get('/history', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { rows } = await query(`
      SELECT * FROM peer_trade_logs
      WHERE user_a_id = $1 OR user_b_id = $1
      ORDER BY timestamp DESC LIMIT 50
    `, [uid]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load trade history' });
  }
});

module.exports = router;
