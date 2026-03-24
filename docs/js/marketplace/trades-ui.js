// trades-ui.js — DOM rendering for the trades tab
'use strict';

// ─── Tab entry point ──────────────────────────────────────────────────────────
function initTradesTab() {
  if (!currentUser || isGuest) {
    document.getElementById('tradesLoginGate').classList.remove('hidden');
    document.getElementById('tradesMain').classList.add('hidden');
    return;
  }
  document.getElementById('tradesLoginGate').classList.add('hidden');
  document.getElementById('tradesMain').classList.remove('hidden');

  // Default to the notifications sub-tab
  _switchTradeSubTab('notifications');
  _loadTradeNotifications();
}

// ─── Sub-tab switcher ────────────────────────────────────────────────────────
function _switchTradeSubTab(name) {
  document.querySelectorAll('.trade-sub-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sub === name);
  });
  document.querySelectorAll('.trade-sub-content').forEach(el => {
    el.classList.toggle('hidden', el.dataset.sub !== name);
  });
}

// ─── Notification sub-tab ────────────────────────────────────────────────────
async function _loadTradeNotifications() {
  const el = document.getElementById('tradeNotifList');
  if (!el) return;
  el.innerHTML = [1,2,3].map(() => `<div class="trade-notif-card" style="pointer-events:none;display:flex;gap:10px;align-items:center;padding:12px">
    <div class="sk-shimmer sk-circle" style="width:32px;height:32px;flex-shrink:0"></div>
    <div style="flex:1"><div class="sk-shimmer sk-line" style="width:60%;margin-bottom:6px"></div><div class="sk-shimmer sk-line-sm" style="width:40%"></div></div>
    <div style="display:flex;gap:6px"><div class="sk-shimmer sk-box" style="width:60px;height:28px"></div><div class="sk-shimmer sk-box" style="width:60px;height:28px"></div></div>
  </div>`).join('');
  try {
    const data = await tradeGetNotifications();
    renderTradeNotifications(data);
  } catch (_) {
    el.innerHTML = '<div class="trade-empty">Failed to load notifications.</div>';
  }
}

function renderTradeNotifications(data) {
  const el = document.getElementById('tradeNotifList');
  if (!el) return;
  const sessions = data.sessions || [];
  const offers   = data.offers   || [];
  if (sessions.length === 0 && offers.length === 0) {
    el.innerHTML = '<div class="trade-empty">No pending notifications.</div>';
    return;
  }
  let html = '';
  for (const s of sessions) {
    html += `
      <div class="trade-notif-card">
        <div class="trade-notif-icon">⚔️</div>
        <div class="trade-notif-body">
          <div class="trade-notif-title"><strong>${escapeHtmlUI(s.initiator_name)}</strong> wants to trade with you live</div>
          <div class="trade-notif-meta">Sent ${formatTradeDate(s.created_at)} · Expires ${formatTradeDate(s.expires_at)}</div>
        </div>
        <div class="trade-notif-actions">
          <button class="trade-btn trade-btn-accept" onclick="acceptLiveInvite('${escapeHtmlUI(s.id)}')">Accept</button>
          <button class="trade-btn trade-btn-decline" onclick="declineLiveInvite('${escapeHtmlUI(s.id)}', this)">Decline</button>
        </div>
      </div>`;
  }
  for (const o of offers) {
    const skinsSent     = (o.sender_skins || []).map(tradeGetSkinLabel).join(', ') || '—';
    const skinsWanted   = (o.receiver_skins || []).map(tradeGetSkinLabel).join(', ') || '—';
    const coinsSent     = o.sender_coins   > 0 ? ` + ${o.sender_coins} coins`   : '';
    const coinsWanted   = o.receiver_coins > 0 ? ` + ${o.receiver_coins} coins` : '';
    html += `
      <div class="trade-notif-card">
        <div class="trade-notif-icon">📬</div>
        <div class="trade-notif-body">
          <div class="trade-notif-title">Offer from <strong>${escapeHtmlUI(o.sender_name)}</strong></div>
          <div class="trade-offer-row">
            <span class="trade-offer-label">They give:</span>
            <span>${escapeHtmlUI(skinsSent)}${escapeHtmlUI(coinsSent)}</span>
          </div>
          <div class="trade-offer-row">
            <span class="trade-offer-label">You give:</span>
            <span>${escapeHtmlUI(skinsWanted)}${escapeHtmlUI(coinsWanted)}</span>
          </div>
          ${o.message ? `<div class="trade-offer-msg">"${escapeHtmlUI(o.message)}"</div>` : ''}
          <div class="trade-notif-meta">Expires ${formatTradeDate(o.expires_at)}</div>
        </div>
        <div class="trade-notif-actions">
          <button class="trade-btn trade-btn-accept" onclick="acceptOffer('${escapeHtmlUI(o.id)}', this)">Accept</button>
          <button class="trade-btn trade-btn-decline" onclick="declineOffer('${escapeHtmlUI(o.id)}', this)">Decline</button>
        </div>
      </div>`;
  }
  el.innerHTML = html;
}

// Accept/decline live invite
async function acceptLiveInvite(sessionId) {
  try {
    const data = await tradeRespondSession(sessionId, true);
    if (data.error) { _tradeToast(data.error, 'error'); return; }
    _tradeToast('Trade accepted! Opening session...', 'success');
    _openLiveSession(data.session);
  } catch (_) { _tradeToast('Failed to accept invite', 'error'); }
}

async function declineLiveInvite(sessionId, btn) {
  btn.disabled = true;
  try {
    await tradeRespondSession(sessionId, false);
    btn.closest('.trade-notif-card').remove();
  } catch (_) { btn.disabled = false; _tradeToast('Failed to decline', 'error'); }
}

// Accept/decline offline offer
async function acceptOffer(offerId, btn) {
  btn.disabled = true;
  try {
    const data = await tradeRespondOffer(offerId, true);
    if (data.error) { _tradeToast(data.error, 'error'); btn.disabled = false; return; }
    _tradeToast('Trade accepted! Your inventory has been updated.', 'success');
    btn.closest('.trade-notif-card').innerHTML = '<div class="trade-notif-done">✅ Trade completed!</div>';
    // Refresh game inventory state
    if (typeof refreshInventoryFromServer === 'function') refreshInventoryFromServer();
    else if (typeof executeSave === 'function') executeSave();
  } catch (_) { btn.disabled = false; _tradeToast('Failed to accept offer', 'error'); }
}

async function declineOffer(offerId, btn) {
  btn.disabled = true;
  try {
    await tradeRespondOffer(offerId, false);
    btn.closest('.trade-notif-card').remove();
  } catch (_) { btn.disabled = false; _tradeToast('Failed to decline offer', 'error'); }
}

// ─── Find Players sub-tab ────────────────────────────────────────────────────
async function loadOnlineUsers() {
  const el = document.getElementById('tradeOnlineList');
  if (!el) return;
  el.innerHTML = [1,2,3,4].map(() => `<div class="trade-player-card" style="pointer-events:none;display:flex;align-items:center;gap:10px;padding:10px">
    <div class="sk-shimmer sk-line" style="flex:1;height:13px"></div>
    <div class="sk-shimmer sk-circle" style="width:8px;height:8px;flex-shrink:0"></div>
    <div class="sk-shimmer sk-box" style="width:60px;height:28px"></div>
    <div class="sk-shimmer sk-box" style="width:60px;height:28px"></div>
  </div>`).join('');
  try {
    const rows = await tradeGetOnlineUsers();
    if (!rows.length) {
      el.innerHTML = '<div class="trade-empty">No other players online right now.</div>';
      return;
    }
    el.innerHTML = rows.map(u => `
      <div class="trade-player-card">
        <div class="trade-player-name">${escapeHtmlUI(u.username)}</div>
        <div class="trade-player-dot online"></div>
        <div class="trade-player-actions">
          <button class="trade-btn trade-btn-sm" onclick="viewPlayerInventory('${u.uid}', '${escapeHtmlUI(u.username)}')">View</button>
          <button class="trade-btn trade-btn-sm trade-btn-primary" onclick="initiateLiveTrade('${u.uid}', '${escapeHtmlUI(u.username)}')">Trade</button>
        </div>
      </div>`).join('');
  } catch (_) {
    el.innerHTML = '<div class="trade-empty">Failed to load online players.</div>';
  }
}

// Search by username
async function searchTradePlayer() {
  const input = document.getElementById('tradeSearchInput');
  if (!input || !input.value.trim()) return;
  const el = document.getElementById('tradeSearchResult');
  if (!el) return;
  el.innerHTML = '<div class="trade-loading">Searching...</div>';
  try {
    const data = await apiGet('/users/search?username=' + encodeURIComponent(input.value.trim()));
    if (data.error || !data.uid) {
      el.innerHTML = '<div class="trade-empty">Player not found. Try their exact username.</div>';
      return;
    }
    _renderSearchResult(el, data);
  } catch (_) {
    el.innerHTML = '<div class="trade-empty">Search failed.</div>';
  }
}

function _renderSearchResult(el, user) {
  el.innerHTML = `
    <div class="trade-player-card">
      <div class="trade-player-name">${escapeHtmlUI(user.username)}</div>
      <div class="trade-player-dot ${user.online ? 'online' : 'offline'}"></div>
      <div class="trade-player-actions">
        <button class="trade-btn trade-btn-sm" onclick="viewPlayerInventory('${user.uid}', '${escapeHtmlUI(user.username)}')">View Inv</button>
        ${user.online
          ? `<button class="trade-btn trade-btn-sm trade-btn-primary" onclick="initiateLiveTrade('${user.uid}', '${escapeHtmlUI(user.username)}')">Live Trade</button>`
          : `<button class="trade-btn trade-btn-sm trade-btn-primary" onclick="openSendOffer('${user.uid}', '${escapeHtmlUI(user.username)}')">Send Offer</button>`
        }
      </div>
    </div>`;
}

// ─── View player inventory ────────────────────────────────────────────────────
async function viewPlayerInventory(uid, username) {
  const modal = document.getElementById('tradeViewInventoryModal');
  if (!modal) return;
  document.getElementById('tradeViewInventoryTitle').textContent = username + "'s Inventory";
  const el = document.getElementById('tradeViewInventoryGrid');
  el.innerHTML = '<div class="trade-loading">Loading...</div>';
  modal.classList.remove('hidden');

  try {
    const data = await tradeGetProfile(uid);
    if (data.error) { el.innerHTML = `<div class="trade-empty">${escapeHtmlUI(data.error)}</div>`; return; }

    const skins = data.ownedSkins || [];
    if (skins.length === 0) {
      el.innerHTML = '<div class="trade-empty">No skins in inventory.</div>';
      return;
    }

    // Deduplicate + count
    const counts = {};
    for (const s of skins) counts[s] = (counts[s] || 0) + 1;
    const unique = [...new Set(skins)];

    el.innerHTML = unique.map(skinId => {
      const label = tradeGetSkinLabel(skinId);
      const count = counts[skinId];
      const skinInfo = typeof getSkinInfo === 'function' ? getSkinInfo(skinId.split('__')[0]) : null;
      const special = typeof getSkinPreviewStyle === 'function' ? getSkinPreviewStyle(skinId.split('__')[0]) : null;
      let dotStyle = '';
      if (special) {
        dotStyle = `background:${special.bg};box-shadow:${special.sh || 'none'};${special.an ? `animation:${special.an};` : ''}`;
      } else if (skinInfo?.color) {
        const c = skinInfo.color;
        dotStyle = `background:radial-gradient(circle at 35% 35%,${c}ee 0%,${c} 55%,${c}88 100%);box-shadow:0 0 10px ${c}80`;
      } else {
        dotStyle = 'background:#4a9eff44;box-shadow:0 0 8px #4a9eff40';
      }
      return `
        <div class="trade-inv-card">
          <div class="trade-inv-dot" style="${dotStyle}"></div>
          <div class="trade-inv-name">${escapeHtmlUI(label)}</div>
          ${count > 1 ? `<div class="trade-inv-count">×${count}</div>` : ''}
        </div>`;
    }).join('');

    // Show send offer button
    const offerBtn = document.getElementById('tradeViewOfferBtn');
    if (offerBtn) {
      offerBtn.onclick = () => {
        closeTradeViewInventory();
        openSendOffer(uid, username);
      };
    }

    const liveBtn = document.getElementById('tradeViewLiveBtn');
    if (liveBtn) {
      const online = data.online;
      liveBtn.style.display = online ? 'inline-flex' : 'none';
      liveBtn.onclick = () => {
        closeTradeViewInventory();
        initiateLiveTrade(uid, username);
      };
    }
  } catch (_) {
    el.innerHTML = '<div class="trade-empty">Failed to load inventory.</div>';
  }
}

function closeTradeViewInventory() {
  const modal = document.getElementById('tradeViewInventoryModal');
  if (modal) modal.classList.add('hidden');
}

// ─── Live Trade ───────────────────────────────────────────────────────────────
async function initiateLiveTrade(targetUid, targetName) {
  _tradeToast(`Sending trade request to ${targetName}...`);
  try {
    const data = await tradeRequestSession(targetUid);
    if (data.error) { _tradeToast(data.error, 'error'); return; }
    _tradeToast('Request sent! Waiting for ' + targetName + ' to accept...', 'success');
    _openLiveSession(data.session);
  } catch (_) { _tradeToast('Failed to send request', 'error'); }
}

function _openLiveSession(session) {
  tradeState.activeSession   = session;
  tradeState.activeSessionId = session.id;

  // Switch to live session sub-tab
  _switchTradeSubTab('live');
  renderLiveSession(session);
  startSessionPoll(session.id);
}

function renderLiveSession(session) {
  const el = document.getElementById('tradeLivePanel');
  if (!el) return;

  const myUid       = currentUser?.uid;
  const isInitiator = session.initiator_id === myUid;
  const myName      = isInitiator ? session.initiator_name : session.target_name;
  const theirName   = isInitiator ? session.target_name    : session.initiator_name;
  const mySkins     = isInitiator ? session.initiator_skins  : session.target_skins;
  const theirSkins  = isInitiator ? session.target_skins     : session.initiator_skins;
  const myCoins     = isInitiator ? session.initiator_coins  : session.target_coins;
  const theirCoins  = isInitiator ? session.target_coins     : session.initiator_coins;
  const myCrates    = isInitiator ? (session.initiator_crates || []) : (session.target_crates || []);
  const theirCrates = isInitiator ? (session.target_crates || [])    : (session.initiator_crates || []);
  const myReady     = isInitiator ? session.initiator_ready  : session.target_ready;
  const theirReady  = isInitiator ? session.target_ready     : session.initiator_ready;
  const theirUid    = isInitiator ? session.target_id        : session.initiator_id;

  if (session.status === 'done') {
    el.innerHTML = `<div class="trade-live-done">
      <div class="trade-live-done-icon">✅</div>
      <div>Trade complete!</div>
      <button class="trade-btn trade-btn-primary" onclick="closeLiveSession()">Close</button>
    </div>`;
    return;
  }

  if (session.status === 'cancelled') {
    el.innerHTML = `<div class="trade-live-done">
      <div class="trade-live-done-icon">❌</div>
      <div>Trade cancelled.</div>
      <button class="trade-btn" onclick="closeLiveSession()">Close</button>
    </div>`;
    return;
  }

  if (session.status === 'pending') {
    el.innerHTML = `<div class="trade-live-waiting">
      <div class="trade-spinner"></div>
      <div>Waiting for <strong>${escapeHtmlUI(theirName)}</strong> to accept...</div>
      <button class="trade-btn trade-btn-danger" onclick="cancelLiveSession()">Cancel</button>
    </div>`;
    return;
  }

  // Status = 'active'
  const skinOptions  = _buildMySkinsOptions(mySkins);
  const crateOptions = _buildMyCratesOptions('trade-crate-check', myCrates);

  // Format crate chips for display
  const myCrateChips = myCrates.length > 0
    ? myCrates.map(c => `<div class="trade-skin-chip" style="border-color:rgba(255,167,38,0.4);color:#ffa726">${TRADE_CRATE_NAMES[c] || c}</div>`).join('')
    : '';
  const theirCrateChips = theirCrates.length > 0
    ? theirCrates.map(c => `<div class="trade-skin-chip" style="border-color:rgba(255,167,38,0.4);color:#ffa726">${TRADE_CRATE_NAMES[c] || c}</div>`).join('')
    : '';

  const myHasNothing = mySkins.length === 0 && myCrates.length === 0 && myCoins === 0;
  const theirHasNothing = theirSkins.length === 0 && theirCrates.length === 0 && theirCoins === 0;

  el.innerHTML = `
    <div class="trade-live-header">
      <span class="trade-live-vs">⚔️ Trade with <span class="trade-profile-link" data-uid="${theirUid}" style="cursor:pointer;text-decoration:underline dotted"><strong>${escapeHtmlUI(theirName)}</strong></span></span>
      <button class="trade-btn trade-btn-danger trade-btn-sm" onclick="cancelLiveSession()">Cancel</button>
    </div>

    <div class="trade-live-split">
      <!-- My offer -->
      <div class="trade-live-side ${myReady ? 'trade-side-ready' : ''}">
        <div class="trade-side-header">
          <span>${escapeHtmlUI(myName)} (You)</span>
          ${myReady ? '<span class="trade-ready-badge">✓ READY</span>' : ''}
        </div>
        <div class="trade-side-body">
          <div class="trade-offer-skins">
            ${mySkins.length > 0
              ? mySkins.map(s => `<div class="trade-skin-chip">${escapeHtmlUI(tradeGetSkinLabel(s))}</div>`).join('')
              : ''}
            ${myCrateChips}
            ${myHasNothing ? '<div class="trade-skin-placeholder">Nothing offered</div>' : ''}
          </div>
          ${myCoins > 0 ? `<div class="trade-coins-chip">🪙 ${myCoins.toLocaleString()} coins</div>` : ''}
        </div>
        <div class="trade-side-controls">
          <label class="trade-label">Offer skins (up to 6):</label>
          <div id="tradeMySkinChecks" class="trade-skin-checks">
            ${skinOptions}
          </div>
          ${crateOptions ? `<div id="tradeMyCrateChecks" class="trade-skin-checks">${crateOptions}</div>` : ''}
          <label class="trade-label">Offer coins:</label>
          <input type="number" id="tradeMyCoins" min="0" max="100000" value="${myCoins}"
                 class="trade-coins-input" placeholder="0" />
          <button class="trade-btn trade-btn-primary trade-btn-sm" onclick="submitLiveOffer()">Update Offer</button>
        </div>
      </div>

      <!-- Their offer -->
      <div class="trade-live-side ${theirReady ? 'trade-side-ready' : ''}">
        <div class="trade-side-header">
          <span class="trade-profile-link" data-uid="${theirUid}" style="cursor:pointer;text-decoration:underline dotted">${escapeHtmlUI(theirName)}</span>
          ${theirReady ? '<span class="trade-ready-badge">✓ READY</span>' : '<span class="trade-not-ready">Editing...</span>'}
        </div>
        <div class="trade-side-body">
          <div class="trade-offer-skins">
            ${theirSkins.length > 0
              ? theirSkins.map(s => `<div class="trade-skin-chip">${escapeHtmlUI(tradeGetSkinLabel(s))}</div>`).join('')
              : ''}
            ${theirCrateChips}
            ${theirHasNothing ? '<div class="trade-skin-placeholder">Nothing offered</div>' : ''}
          </div>
          ${theirCoins > 0 ? `<div class="trade-coins-chip">🪙 ${theirCoins.toLocaleString()} coins</div>` : ''}
        </div>
      </div>
    </div>

    <div class="trade-live-footer">
      <button id="tradeLiveReadyBtn"
              class="trade-btn ${myReady ? 'trade-btn-danger' : 'trade-btn-accept'}"
              onclick="toggleLiveReady()">
        ${myReady ? 'Unready' : '✓ Ready to Trade'}
      </button>
      ${myReady && theirReady ? '<div class="trade-both-ready">Both ready — confirming trade...</div>' : ''}
    </div>`;
}

function _buildMySkinsOptions(currentlyOffered) {
  if (!Array.isArray(ownedSkins) || ownedSkins.length === 0) return '<em>No skins owned</em>';
  const counts = {};
  for (const s of ownedSkins) counts[s] = (counts[s] || 0) + 1;
  const canTrade = typeof isSkinTradeable === 'function' ? isSkinTradeable : () => true;
  const unique = [...new Set(ownedSkins)].filter(s => s !== 'agent' && canTrade(s));
  if (unique.length === 0) return '<em>No tradeable skins</em>';

  return unique.map(skinId => {
    const count   = counts[skinId];
    const label   = tradeGetSkinLabel(skinId);
    const checked = currentlyOffered.includes(skinId) ? 'checked' : '';
    return `<label class="trade-skin-check-label">
      <input type="checkbox" class="trade-skin-check" value="${skinId}" ${checked}
             onchange="updateLiveOfferCount(event)">
      <span>${escapeHtmlUI(label)}${count > 1 ? ` ×${count}` : ''}</span>
    </label>`;
  }).join('');
}

function updateLiveOfferCount(e) {
  const checked = document.querySelectorAll('.trade-skin-check:checked');
  if (checked.length > 6) {
    if (e && e.target) e.target.checked = false;
    _tradeToast('Max 6 skins per trade', 'error');
  }
}

// ─── Crate options for trades ─────────────────────────────────────────────────
const TRADE_CRATE_NAMES = {
  'common-crate': '📦 Common Crate', 'rare-crate': '🎁 Rare Crate',
  'epic-crate': '🎭 Epic Crate', 'legendary-crate': '⭐ Legendary Crate',
  'icon-crate': '🎯 Icon Crate', 'oblivion-crate': '🌑 Oblivion Crate',
};

function _buildMyCratesOptions(cssClass, currentlyOffered) {
  if (typeof ownedCratesCache === 'undefined' || !Array.isArray(ownedCratesCache) || ownedCratesCache.length === 0) {
    return '';
  }
  const counts = {};
  for (const c of ownedCratesCache) counts[c] = (counts[c] || 0) + 1;
  const unique = [...new Set(ownedCratesCache)];
  if (unique.length === 0) return '';

  const offered = currentlyOffered || [];
  let html = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,167,38,0.2);font-size:10px;color:#ffa726;font-weight:600;margin-bottom:4px;letter-spacing:0.5px;">YOUR CRATES</div>';
  html += unique.map(crateId => {
    const count = counts[crateId];
    const label = TRADE_CRATE_NAMES[crateId] || crateId;
    const checked = offered.includes(crateId) ? 'checked' : '';
    return `<label class="trade-skin-check-label">
      <input type="checkbox" class="${cssClass}" value="${crateId}" ${checked}
             onchange="updateLiveCrateOfferCount(event, '${cssClass}')">
      <span>${label}${count > 1 ? ` ×${count}` : ''}</span>
    </label>`;
  }).join('');
  return html;
}

function _buildTheirCratesOptions(ownedCrates, cssClass) {
  if (!Array.isArray(ownedCrates) || ownedCrates.length === 0) return '';
  const counts = {};
  for (const c of ownedCrates) counts[c] = (counts[c] || 0) + 1;
  const unique = [...new Set(ownedCrates)];
  if (unique.length === 0) return '';

  let html = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,167,38,0.2);font-size:10px;color:#ffa726;font-weight:600;margin-bottom:4px;letter-spacing:0.5px;">THEIR CRATES</div>';
  html += unique.map(crateId => {
    const count = counts[crateId];
    const label = TRADE_CRATE_NAMES[crateId] || crateId;
    return `<label class="trade-skin-check-label">
      <input type="checkbox" class="${cssClass}" value="${crateId}">
      <span>${label}${count > 1 ? ` ×${count}` : ''}</span>
    </label>`;
  }).join('');
  return html;
}

function updateLiveCrateOfferCount(e, cssClass) {
  const checked = document.querySelectorAll(`.${cssClass}:checked`);
  if (checked.length > 6) {
    if (e && e.target) e.target.checked = false;
    _tradeToast('Max 6 crates per trade', 'error');
  }
}

async function submitLiveOffer() {
  if (!tradeState.activeSessionId) return;
  const checkedSkins  = [...document.querySelectorAll('.trade-skin-check:checked')].map(cb => cb.value);
  const checkedCrates = [...document.querySelectorAll('.trade-crate-check:checked')].map(cb => cb.value);
  const coins = parseInt(document.getElementById('tradeMyCoins')?.value || '0', 10) || 0;
  try {
    const data = await tradeSetOffer(tradeState.activeSessionId, checkedSkins, coins, checkedCrates);
    if (data.error) { _tradeToast(data.error, 'error'); return; }
    tradeState.activeSession = data.session;
    renderLiveSession(data.session);
    _tradeToast('Offer updated', 'success');
  } catch (_) { _tradeToast('Failed to update offer', 'error'); }
}

async function toggleLiveReady() {
  if (!tradeState.activeSessionId) return;
  const btn = document.getElementById('tradeLiveReadyBtn');
  if (btn) btn.disabled = true;
  try {
    const data = await tradeToggleReady(tradeState.activeSessionId);
    if (data.error) { _tradeToast(data.error, 'error'); if (btn) btn.disabled = false; return; }
    if (data.traded) {
      _tradeToast('Trade complete! Inventory updated.', 'success');
      if (typeof refreshInventoryFromServer === 'function') refreshInventoryFromServer();
    }
    tradeState.activeSession = data.session;
    renderLiveSession(data.session);
  } catch (_) {
    _tradeToast('Failed to update ready state', 'error');
    if (btn) btn.disabled = false;
  }
}

async function cancelLiveSession() {
  if (!tradeState.activeSessionId) return;
  try {
    await tradeCancelSession(tradeState.activeSessionId);
    stopSessionPoll();
    tradeState.activeSessionId = null;
    tradeState.activeSession   = null;
    closeLiveSession();
    _tradeToast('Trade cancelled');
  } catch (_) { _tradeToast('Failed to cancel', 'error'); }
}

function closeLiveSession() {
  stopSessionPoll();
  tradeState.activeSessionId = null;
  tradeState.activeSession   = null;
  _switchTradeSubTab('notifications');
  _loadTradeNotifications();
}

// ─── Send Offline Offer ───────────────────────────────────────────────────────
function openSendOffer(receiverUid, receiverName) {
  const modal = document.getElementById('tradeSendOfferModal');
  if (!modal) return;
  document.getElementById('tradeSendOfferTitle').textContent = 'Send Offer to ' + receiverName;
  document.getElementById('tradeSendOfferReceiverId').value  = receiverUid;
  document.getElementById('tradeSendOfferReceiverName').value = receiverName;

  // Populate my skins checkboxes
  const el = document.getElementById('tradeSendMySkinsChecks');
  if (el) {
    if (!Array.isArray(ownedSkins) || ownedSkins.length === 0) {
      el.innerHTML = '<em>No skins owned</em>';
    } else {
      const counts = {};
      for (const s of ownedSkins) counts[s] = (counts[s] || 0) + 1;
      const canTrade = typeof isSkinTradeable === 'function' ? isSkinTradeable : () => true;
      const unique = [...new Set(ownedSkins)].filter(s => s !== 'agent' && canTrade(s));
      el.innerHTML = unique.map(skinId => {
        const label = tradeGetSkinLabel(skinId);
        const count = counts[skinId];
        return `<label class="trade-skin-check-label">
          <input type="checkbox" class="trade-offer-my-skin" value="${skinId}">
          <span>${escapeHtmlUI(label)}${count > 1 ? ` ×${count}` : ''}</span>
        </label>`;
      }).join('');
    }
  }

  // Populate my crates checkboxes
  const crateEl = document.getElementById('tradeSendMyCratesChecks');
  if (crateEl) {
    crateEl.innerHTML = _buildMyCratesOptions('trade-offer-my-crate', []);
  }

  // Load receiver's inventory for their side
  _loadReceiverSkins(receiverUid);

  // Clear coins + message
  const myCoinsEl   = document.getElementById('tradeSendMyCoins');
  const theirCoinsEl = document.getElementById('tradeSendTheirCoins');
  const msgEl = document.getElementById('tradeSendMessage');
  if (myCoinsEl)    myCoinsEl.value   = '';
  if (theirCoinsEl) theirCoinsEl.value = '';
  if (msgEl)        msgEl.value        = '';

  modal.classList.remove('hidden');
}

async function _loadReceiverSkins(uid) {
  const el = document.getElementById('tradeSendTheirSkinsChecks');
  if (!el) return;
  el.innerHTML = '<div class="trade-loading">Loading...</div>';
  try {
    const data = await tradeGetProfile(uid);
    const canTrade = typeof isSkinTradeable === 'function' ? isSkinTradeable : () => true;
    const skins = (data.ownedSkins || []).filter(s => s !== 'agent' && canTrade(s));

    let html = '';
    if (skins.length === 0) {
      html = '<em>No tradeable skins</em>';
    } else {
      const counts = {};
      for (const s of skins) counts[s] = (counts[s] || 0) + 1;
      const unique = [...new Set(skins)];
      html = unique.map(skinId => {
        const label = tradeGetSkinLabel(skinId);
        const count = counts[skinId];
        return `<label class="trade-skin-check-label">
          <input type="checkbox" class="trade-offer-their-skin" value="${skinId}">
          <span>${escapeHtmlUI(label)}${count > 1 ? ` ×${count}` : ''}</span>
        </label>`;
      }).join('');
    }
    el.innerHTML = html;

    // Load their crates
    const theirCrateEl = document.getElementById('tradeSendTheirCratesChecks');
    if (theirCrateEl) {
      theirCrateEl.innerHTML = _buildTheirCratesOptions(data.ownedCrates || [], 'trade-offer-their-crate');
    }
  } catch (_) {
    el.innerHTML = '<em>Failed to load</em>';
  }
}

function closeTradeOfferModal() {
  const modal = document.getElementById('tradeSendOfferModal');
  if (modal) modal.classList.add('hidden');
}

async function submitSendOffer() {
  const receiverUid  = document.getElementById('tradeSendOfferReceiverId')?.value;
  const mySkins      = [...document.querySelectorAll('.trade-offer-my-skin:checked')].map(cb => cb.value);
  const theirSkins   = [...document.querySelectorAll('.trade-offer-their-skin:checked')].map(cb => cb.value);
  const myCrates     = [...document.querySelectorAll('.trade-offer-my-crate:checked')].map(cb => cb.value);
  const theirCrates  = [...document.querySelectorAll('.trade-offer-their-crate:checked')].map(cb => cb.value);
  const myCoins      = parseInt(document.getElementById('tradeSendMyCoins')?.value   || '0', 10) || 0;
  const theirCoins   = parseInt(document.getElementById('tradeSendTheirCoins')?.value || '0', 10) || 0;
  const message      = document.getElementById('tradeSendMessage')?.value || '';

  if (!receiverUid) return;
  if (mySkins.length === 0 && theirSkins.length === 0 && myCrates.length === 0 && theirCrates.length === 0 && myCoins === 0 && theirCoins === 0) {
    _tradeToast('Add something to the offer', 'error');
    return;
  }

  const submitBtn = document.getElementById('tradeSendOfferSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const data = await tradeSendOffer(receiverUid, mySkins, theirSkins, myCoins, theirCoins, message, myCrates, theirCrates);
    if (data.error) {
      _tradeToast(data.error, 'error');
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    _tradeToast('Offer sent!', 'success');
    closeTradeOfferModal();
  } catch (_) {
    _tradeToast('Failed to send offer', 'error');
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ─── Inbox sub-tab ────────────────────────────────────────────────────────────
async function loadTradeInbox() {
  const el = document.getElementById('tradeInboxList');
  if (!el) return;
  el.innerHTML = [1,2,3].map(() => `<div class="trade-notif-card" style="pointer-events:none;display:flex;gap:10px;align-items:center;padding:12px">
    <div class="sk-shimmer sk-circle" style="width:32px;height:32px;flex-shrink:0"></div>
    <div style="flex:1"><div class="sk-shimmer sk-line" style="width:65%;margin-bottom:6px"></div><div class="sk-shimmer sk-line-sm" style="width:45%"></div></div>
    <div style="display:flex;gap:6px"><div class="sk-shimmer sk-box" style="width:60px;height:28px"></div><div class="sk-shimmer sk-box" style="width:60px;height:28px"></div></div>
  </div>`).join('');
  try {
    const rows = await tradeGetInbox();
    if (!rows.length) { el.innerHTML = '<div class="trade-empty">No offers in your inbox.</div>'; return; }
    el.innerHTML = rows.map(o => _renderOfferCard(o, 'inbox')).join('');
  } catch (_) {
    el.innerHTML = '<div class="trade-empty">Failed to load inbox.</div>';
  }
}

async function loadTradeSent() {
  const el = document.getElementById('tradeSentList');
  if (!el) return;
  el.innerHTML = [1,2,3].map(() => `<div class="trade-notif-card" style="pointer-events:none;display:flex;gap:10px;align-items:center;padding:12px">
    <div class="sk-shimmer sk-circle" style="width:32px;height:32px;flex-shrink:0"></div>
    <div style="flex:1"><div class="sk-shimmer sk-line" style="width:65%;margin-bottom:6px"></div><div class="sk-shimmer sk-line-sm" style="width:45%"></div></div>
    <div style="display:flex;gap:6px"><div class="sk-shimmer sk-box" style="width:60px;height:28px"></div><div class="sk-shimmer sk-box" style="width:60px;height:28px"></div></div>
  </div>`).join('');
  try {
    const rows = await tradeGetSent();
    if (!rows.length) { el.innerHTML = '<div class="trade-empty">No sent offers.</div>'; return; }
    el.innerHTML = rows.map(o => _renderOfferCard(o, 'sent')).join('');
  } catch (_) {
    el.innerHTML = '<div class="trade-empty">Failed to load sent offers.</div>';
  }
}

function _formatCrateList(crates) {
  if (!crates || crates.length === 0) return '';
  return crates.map(c => TRADE_CRATE_NAMES[c] || c).join(', ');
}

function _renderOfferCard(o, mode) {
  const skinsSent   = (o.sender_skins   || []).map(tradeGetSkinLabel).join(', ') || '';
  const cratesSent  = _formatCrateList(o.sender_crates);
  const skinsWanted = (o.receiver_skins || []).map(tradeGetSkinLabel).join(', ') || '';
  const cratesWanted = _formatCrateList(o.receiver_crates);
  const sentItems   = [skinsSent, cratesSent].filter(Boolean).join(', ') || '—';
  const wantedItems = [skinsWanted, cratesWanted].filter(Boolean).join(', ') || '—';
  const coinsSent   = o.sender_coins   > 0 ? ` + ${o.sender_coins} coins`   : '';
  const coinsWanted = o.receiver_coins > 0 ? ` + ${o.receiver_coins} coins` : '';

  const statusClass = { pending: 'trade-status-pending', accepted: 'trade-status-accepted',
    declined: 'trade-status-declined', cancelled: 'trade-status-cancelled',
    expired:  'trade-status-cancelled' }[o.status] || '';

  const actionBtns = mode === 'inbox' && o.status === 'pending'
    ? `<button class="trade-btn trade-btn-accept" onclick="acceptOffer('${o.id}', this)">Accept</button>
       <button class="trade-btn trade-btn-decline" onclick="declineOffer('${o.id}', this)">Decline</button>`
    : mode === 'sent' && o.status === 'pending'
      ? `<button class="trade-btn trade-btn-danger" onclick="cancelSentOffer('${o.id}', this)">Cancel</button>`
      : '';

  return `
    <div class="trade-offer-card">
      <div class="trade-offer-header">
        <span>${mode === 'inbox' ? 'From' : 'To'}: <strong>${escapeHtmlUI(mode === 'inbox' ? o.sender_name : o.receiver_name)}</strong></span>
        <span class="trade-status ${statusClass}">${o.status.toUpperCase()}</span>
      </div>
      <div class="trade-offer-row"><span class="trade-offer-label">They give:</span><span>${escapeHtmlUI(sentItems)}${escapeHtmlUI(coinsSent)}</span></div>
      <div class="trade-offer-row"><span class="trade-offer-label">You give:</span><span>${escapeHtmlUI(wantedItems)}${escapeHtmlUI(coinsWanted)}</span></div>
      ${o.message ? `<div class="trade-offer-msg">"${escapeHtmlUI(o.message)}"</div>` : ''}
      <div class="trade-offer-meta">Sent ${formatTradeDate(o.created_at)} · Expires ${formatTradeDate(o.expires_at)}</div>
      ${actionBtns ? `<div class="trade-notif-actions">${actionBtns}</div>` : ''}
    </div>`;
}

async function cancelSentOffer(offerId, btn) {
  btn.disabled = true;
  try {
    await tradeCancelOffer(offerId);
    btn.closest('.trade-offer-card').querySelector('.trade-status').textContent = 'CANCELLED';
    btn.remove();
  } catch (_) { btn.disabled = false; _tradeToast('Failed to cancel', 'error'); }
}

// ─── History sub-tab ──────────────────────────────────────────────────────────
async function loadTradeHistory() {
  const el = document.getElementById('tradeHistoryList');
  if (!el) return;
  el.innerHTML = [1,2,3].map(() => `<div class="trade-notif-card" style="pointer-events:none;display:flex;gap:10px;align-items:center;padding:12px">
    <div class="sk-shimmer sk-circle" style="width:32px;height:32px;flex-shrink:0"></div>
    <div style="flex:1"><div class="sk-shimmer sk-line" style="width:65%;margin-bottom:6px"></div><div class="sk-shimmer sk-line-sm" style="width:45%"></div></div>
    <div style="display:flex;gap:6px"><div class="sk-shimmer sk-box" style="width:80px;height:28px"></div></div>
  </div>`).join('');
  try {
    const rows = await tradeGetHistory();
    if (!rows.length) { el.innerHTML = '<div class="trade-empty">No trade history yet.</div>'; return; }
    const myUid = currentUser?.uid;
    el.innerHTML = rows.map(t => {
      const iAmA   = t.user_a_id === myUid;
      const meName = iAmA ? t.user_a_name : t.user_b_name;
      const thName = iAmA ? t.user_b_name : t.user_a_name;
      const meSkinsList = (iAmA ? t.a_gave_skins : t.b_gave_skins).map(tradeGetSkinLabel).join(', ') || '';
      const thSkinsList = (iAmA ? t.b_gave_skins : t.a_gave_skins).map(tradeGetSkinLabel).join(', ') || '';
      const meCratesList = _formatCrateList(iAmA ? t.a_gave_crates : t.b_gave_crates);
      const thCratesList = _formatCrateList(iAmA ? t.b_gave_crates : t.a_gave_crates);
      const meItems = [meSkinsList, meCratesList].filter(Boolean).join(', ') || '—';
      const thItems = [thSkinsList, thCratesList].filter(Boolean).join(', ') || '—';
      const meCoins = iAmA ? t.a_gave_coins : t.b_gave_coins;
      const thCoins = iAmA ? t.b_gave_coins : t.a_gave_coins;
      return `
        <div class="trade-history-card">
          <div class="trade-history-header">
            <span>Trade with <strong>${escapeHtmlUI(thName)}</strong></span>
            <span class="trade-history-type">${t.trade_type === 'live' ? '⚔️ Live' : '📬 Offer'}</span>
            <span class="trade-history-date">${formatTradeDate(t.timestamp)}</span>
          </div>
          <div class="trade-offer-row"><span class="trade-offer-label">You gave:</span><span>${escapeHtmlUI(meItems)}${meCoins > 0 ? ` + ${meCoins} coins` : ''}</span></div>
          <div class="trade-offer-row"><span class="trade-offer-label">You received:</span><span>${escapeHtmlUI(thItems)}${thCoins > 0 ? ` + ${thCoins} coins` : ''}</span></div>
        </div>`;
    }).join('');
  } catch (_) {
    el.innerHTML = '<div class="trade-empty">Failed to load history.</div>';
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escapeHtmlUI(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function _tradeToast(msg, type) {
  const el = document.getElementById('tradeToast');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'trade-toast' + (type === 'error' ? ' trade-toast-error' : type === 'success' ? ' trade-toast-success' : '');
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// Trade opponent name → profile popup
document.addEventListener('click', e => {
  const link = e.target.closest('.trade-profile-link');
  if (link && typeof openProfilePopup === 'function') openProfilePopup(link.dataset.uid);
});

// Refresh player's local skin state after a completed trade
async function refreshInventoryFromServer() {
  if (!currentUser || isGuest) return;
  try {
    const data = await apiGet('/auth/me');
    if (!data.error && Array.isArray(data.ownedSkins)) {
      ownedSkins = data.ownedSkins;
      activeSkin = data.activeSkin || activeSkin;
      if (typeof updateSkinsDisplay === 'function') updateSkinsDisplay();
      if (typeof _renderInventory   === 'function') _renderInventory();
    }
  } catch (_) {}
}
