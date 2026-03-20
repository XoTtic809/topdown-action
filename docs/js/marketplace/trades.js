// trades.js — peer-to-peer trading API wrapper + state manager
'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
var tradeState = {
  // Live session
  activeSessionId:   null,
  activeSession:     null,
  sessionPollTimer:  null,

  // Notification badge count
  pendingCount: 0,

  // Heartbeat
  heartbeatTimer: null,
};

// How often to poll the active session (ms)
const TRADE_POLL_INTERVAL = 3000;
// How often to send a presence heartbeat (ms)
const TRADE_HEARTBEAT_INTERVAL = 30_000;
// How often to check for new notifications (ms)
const TRADE_NOTIF_INTERVAL = 30_000;

var _notifPollTimer = null;

// ─── API helpers (re-use api-auth.js globals) ─────────────────────────────────
async function _tradeGet(path) {
  return apiGet('/trades' + path);
}
async function _tradePost(path, body) {
  return apiPost('/trades' + path, body || {});
}

// ─── Presence / heartbeat ────────────────────────────────────────────────────
function startTradeHeartbeat() {
  if (tradeState.heartbeatTimer) return;
  _sendHeartbeat();
  tradeState.heartbeatTimer = setInterval(_sendHeartbeat, TRADE_HEARTBEAT_INTERVAL);
}

function stopTradeHeartbeat() {
  clearInterval(tradeState.heartbeatTimer);
  tradeState.heartbeatTimer = null;
}

async function _sendHeartbeat() {
  if (!currentUser || isGuest) return;
  try { await _tradePost('/heartbeat'); } catch (_) {}
}

async function tradeGetPresence(uid) {
  return _tradeGet('/presence/' + uid);
}

async function tradeGetOnlineUsers() {
  return _tradeGet('/online-users');
}

// ─── Notifications ────────────────────────────────────────────────────────────
function startTradeNotifPolling() {
  if (_notifPollTimer) return;
  _pollNotifications();
  _notifPollTimer = setInterval(_pollNotifications, TRADE_NOTIF_INTERVAL);
}

function stopTradeNotifPolling() {
  clearInterval(_notifPollTimer);
  _notifPollTimer = null;
}

async function _pollNotifications() {
  if (!currentUser || isGuest) return;
  try {
    const data = await _tradeGet('/notifications');
    const total = (data.sessions || []).length + (data.offers || []).length;
    if (total !== tradeState.pendingCount) {
      tradeState.pendingCount = total;
      _updateTradeBadge(total);
      if (total > 0 && typeof renderTradeNotifications === 'function') {
        renderTradeNotifications(data);
      }
    }
  } catch (_) {}
}

async function tradeGetNotifications() {
  return _tradeGet('/notifications');
}

function _updateTradeBadge(count) {
  const badge = document.getElementById('tradeBadge');
  if (!badge) return;
  badge.textContent = count > 9 ? '9+' : String(count);
  badge.style.display = count > 0 ? 'flex' : 'none';
}

// ─── Live Sessions ────────────────────────────────────────────────────────────
async function tradeRequestSession(targetUid) {
  return _tradePost('/session/request', { targetUid });
}

async function tradeRespondSession(sessionId, accept) {
  return _tradePost(`/session/${sessionId}/respond`, { accept });
}

async function tradeGetSession(sessionId) {
  return _tradeGet(`/session/${sessionId}`);
}

async function tradeSetOffer(sessionId, skins, coins) {
  return _tradePost(`/session/${sessionId}/offer`, { skins, coins });
}

async function tradeToggleReady(sessionId) {
  return _tradePost(`/session/${sessionId}/ready`, {});
}

async function tradeCancelSession(sessionId) {
  return _tradePost(`/session/${sessionId}/cancel`, {});
}

// ─── Session polling ──────────────────────────────────────────────────────────
function startSessionPoll(sessionId) {
  stopSessionPoll();
  tradeState.activeSessionId = sessionId;
  tradeState.sessionPollTimer = setInterval(async () => {
    if (!tradeState.activeSessionId) { stopSessionPoll(); return; }
    try {
      const data = await tradeGetSession(tradeState.activeSessionId);
      if (data.session) {
        tradeState.activeSession = data.session;
        if (typeof renderLiveSession === 'function') renderLiveSession(data.session);
        // Stop polling if session ended
        if (['done','cancelled'].includes(data.session.status)) {
          stopSessionPoll();
          tradeState.activeSessionId = null;
        }
      }
    } catch (_) {}
  }, TRADE_POLL_INTERVAL);
}

function stopSessionPoll() {
  clearInterval(tradeState.sessionPollTimer);
  tradeState.sessionPollTimer = null;
}

// ─── Offline Offers ───────────────────────────────────────────────────────────
async function tradeSendOffer(receiverUid, senderSkins, receiverSkins, senderCoins, receiverCoins, message) {
  return _tradePost('/offer/send', {
    receiverUid,
    senderSkins:   senderSkins   || [],
    receiverSkins: receiverSkins || [],
    senderCoins:   senderCoins   || 0,
    receiverCoins: receiverCoins || 0,
    message:       message       || '',
  });
}

async function tradeRespondOffer(offerId, accept) {
  return _tradePost(`/offer/${offerId}/respond`, { accept });
}

async function tradeCancelOffer(offerId) {
  return _tradePost(`/offer/${offerId}/cancel`, {});
}

async function tradeGetInbox() {
  return _tradeGet('/offers/inbox');
}

async function tradeGetSent() {
  return _tradeGet('/offers/sent');
}

// ─── Profile lookup ───────────────────────────────────────────────────────────
async function tradeGetProfile(uid) {
  return _tradeGet('/profile/' + uid);
}

// ─── History ──────────────────────────────────────────────────────────────────
async function tradeGetHistory() {
  return _tradeGet('/history');
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function formatTradeDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Build a skin display name from a skin ID, using SKINS_DATA + MUTATION_CONFIG if available
function tradeGetSkinLabel(skinId) {
  if (!skinId) return 'Unknown';
  const parts = skinId.split('__');
  const baseSkinId = parts[0];
  const mutation   = parts[1] || null;

  let name = baseSkinId;
  if (typeof SKINS_DATA !== 'undefined') {
    const found = SKINS_DATA.find(s => s.id === baseSkinId);
    if (found) name = found.name;
  }

  if (mutation && typeof MUTATION_CONFIG !== 'undefined' && MUTATION_CONFIG[mutation]) {
    name += ` [${MUTATION_CONFIG[mutation].label}]`;
  }
  return name;
}
