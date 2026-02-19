// marketplace-ui.js — Marketplace UI rendering, event handling, modal management
// Depends on: marketplace.js (state + logic), game.js (playerCoins, SKINS, etc.)

'use strict';

// ════════════════════════════════════════════════════════════
//  UI STATE
// ════════════════════════════════════════════════════════════

let _mpRefreshTimer     = null;
let _mpRefreshCountdown = 0;
let _mpInitialized      = false;
let _mpSearchQuery      = '';   // current text search filter

// ════════════════════════════════════════════════════════════
//  INITIALIZATION
//  Called once — wires up all static event listeners.
// ════════════════════════════════════════════════════════════

function initMarketplaceUI() {
  if (_mpInitialized) return;
  _mpInitialized = true;

  _on('mpRefreshBtn',      'click',  () => mpRefresh(true));
  _on('mpLoadMoreBtn',     'click',  mpLoadMore);
  _on('mpSellModalClose',  'click',  closeSellModal);
  _on('mpSellConfirmBtn',  'click',  handleSellConfirm);
  _on('mpSellPrice',       'input',  validateSellPrice);
  _on('mpSellSkinSelect',  'change', onSkinSelectChange);

  // Search input — live filter with 150ms debounce so it doesn't rerender on every keystroke
  const searchInput = document.getElementById('mpSearchInput');
  if (searchInput) {
    let _searchDebounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(_searchDebounce);
      _searchDebounce = setTimeout(() => {
        _mpSearchQuery = searchInput.value.trim().toLowerCase();
        renderMarketplaceListings();
      }, 150);
    });
  }

  // Rarity filter buttons
  document.querySelectorAll('.mp-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mp-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      marketplaceState.currentFilter = btn.dataset.rarity;
      renderMarketplaceListings();
    });
  });

  // Sort buttons
  document.querySelectorAll('.mp-sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mp-sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      marketplaceState.currentSort = btn.dataset.sort;
      renderMarketplaceListings();
    });
  });

  // Close buy confirm modal on backdrop click
  const buyModal = document.getElementById('mpBuyModal');
  if (buyModal) {
    buyModal.addEventListener('click', (e) => {
      if (e.target === buyModal) closeBuyModal();
    });
  }

  // Close sell modal on backdrop click
  const sellModal = document.getElementById('mpSellModal');
  if (sellModal) {
    sellModal.addEventListener('click', (e) => {
      if (e.target === sellModal) closeSellModal();
    });
  }

  console.log('🏪 Marketplace UI initialized');
}

// Shorthand to attach a listener by element ID
function _on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

// ════════════════════════════════════════════════════════════
//  TAB ACTIVATION
//  Called when the Marketplace shop tab is clicked.
// ════════════════════════════════════════════════════════════

async function openMarketplaceTab() {
  initMarketplaceUI();
  syncCoinsDisplays();

  // Load eligibility data (cached after first call)
  await loadMarketplaceAccountData();

  const eligibility = await checkMarketplaceEligibility();
  const lockedEl    = document.getElementById('mpLocked');
  const contentEl   = document.getElementById('mpContent');

  if (!eligibility.eligible) {
    if (lockedEl) {
      lockedEl.classList.remove('hidden');
      const reasonEl = document.getElementById('mpLockedReason');
      if (reasonEl) reasonEl.textContent = eligibility.reason;
    }
    if (contentEl) contentEl.classList.add('hidden');
    return;
  }

  if (lockedEl)  lockedEl.classList.add('hidden');
  if (contentEl) contentEl.classList.remove('hidden');

  // Parallel initial load
  await Promise.all([
    mpRefresh(true),
    fetchMyListings(),
    renderRecentTrades(),
  ]);

  renderMyListings();
}

// ════════════════════════════════════════════════════════════
//  COINS DISPLAY SYNC
//  Call this whenever playerCoins changes to keep all displays
//  in the UI in sync. No more scattered element updates.
// ════════════════════════════════════════════════════════════

function syncCoinsDisplays() {
  const formatted = (typeof playerCoins !== 'undefined') ? playerCoins.toLocaleString() : '0';
  ['mpCoinsDisplay', 'shopCoinsVal', 'homeCoinsVal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = formatted;
  });
}

// ════════════════════════════════════════════════════════════
//  REFRESH WITH COOLDOWN
// ════════════════════════════════════════════════════════════

async function mpRefresh(reset = false) {
  const grid = document.getElementById('mpListingsGrid');
  if (grid && reset) {
    grid.innerHTML = '<div class="mp-loading">Loading marketplace...</div>';
  }

  const result = await fetchMarketplaceListings(reset);

  if (result.status === 'cooldown') {
    showMpMessage(`Refresh cooldown: ${result.remaining}s remaining`, true);
    return;
  }
  if (result.status === 'error') {
    showMpMessage('Error loading marketplace. Try again.', true);
    return;
  }

  renderMarketplaceListings();

  const refreshBtn = document.getElementById('mpRefreshBtn');
  startRefreshCooldown(refreshBtn);
}

async function mpLoadMore() {
  const btn = document.getElementById('mpLoadMoreBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'LOADING...'; }

  await fetchMarketplaceListings(false);
  renderMarketplaceListings();

  if (btn) { btn.disabled = false; btn.textContent = 'LOAD MORE'; }
}

function startRefreshCooldown(btn) {
  if (!btn) return;
  _mpRefreshCountdown = MARKETPLACE_CONFIG.REFRESH_COOLDOWN_MS / 1000;
  btn.disabled = true;
  btn.textContent = `REFRESH (${_mpRefreshCountdown}s)`;

  clearInterval(_mpRefreshTimer);
  _mpRefreshTimer = setInterval(() => {
    _mpRefreshCountdown--;
    if (_mpRefreshCountdown <= 0) {
      clearInterval(_mpRefreshTimer);
      btn.disabled    = false;
      btn.textContent = 'REFRESH';
    } else {
      btn.textContent = `REFRESH (${_mpRefreshCountdown}s)`;
    }
  }, 1000);
}

// ════════════════════════════════════════════════════════════
//  RENDER LISTINGS GRID
// ════════════════════════════════════════════════════════════

function renderMarketplaceListings() {
  const grid       = document.getElementById('mpListingsGrid');
  const loadMoreBtn = document.getElementById('mpLoadMoreBtn');
  const countEl    = document.getElementById('mpListingCount');
  if (!grid) return;

  let filtered = getFilteredListings();

  // Apply text search — matches skin name or seller name
  if (_mpSearchQuery) {
    filtered = filtered.filter(l =>
      (l.skinName  || '').toLowerCase().includes(_mpSearchQuery) ||
      (l.sellerName|| '').toLowerCase().includes(_mpSearchQuery)
    );
  }

  if (countEl) {
    countEl.textContent = `${filtered.length} listing${filtered.length !== 1 ? 's' : ''}`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="mp-empty">
        <div class="mp-empty-icon">🏪</div>
        <div class="mp-empty-text">No listings found</div>
        <div class="mp-empty-sub">Try a different filter or check back later</div>
      </div>`;
    if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
    return;
  }

  // Use a DocumentFragment for a single DOM insertion (no repeated reflows)
  const frag = document.createDocumentFragment();
  for (const listing of filtered) {
    frag.appendChild(createListingCard(listing));
  }
  grid.innerHTML = '';
  grid.appendChild(frag);

  if (loadMoreBtn) {
    loadMoreBtn.classList.toggle('hidden', !marketplaceState.hasMore);
  }
}

function createListingCard(listing) {
  const rarity   = RARITY_PRICING[listing.rarity] || RARITY_PRICING.common;
  const skinInfo = getSkinInfo(listing.skinId);

  // Time remaining display
  const expiresMs  = listing.expiresAt?.seconds ? listing.expiresAt.seconds * 1000 : 0;
  const hoursLeft  = Math.max(0, Math.floor((expiresMs - Date.now()) / 3600000));
  const timeText   = hoursLeft > 24 ? `${Math.floor(hoursLeft / 24)}d left` : `${hoursLeft}h left`;

  const canAfford  = typeof playerCoins !== 'undefined' && playerCoins >= listing.price;
  const isOwn      = currentUser && listing.sellerId === currentUser.uid;
  const canBuy     = !isOwn && canAfford;

  const btnLabel   = isOwn ? 'YOUR LISTING' : !canAfford ? 'NOT ENOUGH' : 'BUY';

  const card = document.createElement('div');
  card.className   = 'mp-listing-card';
  card.style.setProperty('--rarity-color', rarity.color);
  card.style.borderColor = rarity.color + '40';

  card.innerHTML = `
    ${buildSkinPreview(skinInfo, rarity, 'mp-listing-preview')}
    <div class="mp-listing-info">
      <div class="mp-listing-name">${_esc(listing.skinName || listing.skinId)}</div>
      <div class="mp-listing-rarity" style="color:${rarity.color}">${rarity.label}</div>
      <div class="mp-listing-seller">by ${_esc(listing.sellerName || 'Unknown')}</div>
      <div class="mp-listing-time">${timeText}</div>
    </div>
    <div class="mp-listing-bottom">
      <div class="mp-listing-price">${listing.price.toLocaleString()}</div>
      <button class="mp-buy-btn${canBuy ? '' : ' disabled'}"
              ${canBuy ? '' : 'disabled'}
              data-listing-id="${listing.id}">
        ${btnLabel}
      </button>
    </div>
  `;

  if (canBuy) {
    card.querySelector('.mp-buy-btn').addEventListener('click', () => openBuyModal(listing));
  }

  return card;
}

// Renders a skin preview circle using the skin's own color/gradient if available,
// falling back to the rarity color so it looks less generic.
function buildSkinPreview(skinInfo, rarity, className) {
  let bg;
  if (skinInfo && skinInfo.color) {
    // Solid color skin
    bg = skinInfo.color;
  } else if (skinInfo && skinInfo.gradient) {
    // Some skins expose a gradient array
    const stops = skinInfo.gradient.map((c, i, arr) => `${c} ${Math.round((i / (arr.length - 1)) * 100)}%`).join(', ');
    bg = `linear-gradient(135deg, ${stops})`;
  } else {
    bg = rarity.color;
  }

  const glow = (skinInfo?.color || rarity.color) + '50';
  return `<div class="${className}" style="background:${bg};box-shadow:0 0 14px ${glow};"></div>`;
}

// ════════════════════════════════════════════════════════════
//  RENDER MY LISTINGS
// ════════════════════════════════════════════════════════════

function renderMyListings() {
  const container = document.getElementById('mpMyListings');
  if (!container) return;

  if (marketplaceState.myListings.length === 0) {
    container.innerHTML = '<div class="mp-my-empty">You have no active listings</div>';
    return;
  }

  const frag = document.createDocumentFragment();

  for (const listing of marketplaceState.myListings) {
    const rarity    = RARITY_PRICING[listing.rarity] || RARITY_PRICING.common;
    const skinInfo  = getSkinInfo(listing.skinId);
    const expiresMs = listing.expiresAt?.seconds ? listing.expiresAt.seconds * 1000 : 0;
    const hoursLeft = Math.max(0, Math.floor((expiresMs - Date.now()) / 3600000));
    const timeText  = hoursLeft > 24 ? `${Math.floor(hoursLeft / 24)}d` : `${hoursLeft}h`;

    const row = document.createElement('div');
    row.className = 'mp-my-listing';
    row.style.borderColor = rarity.color + '30';

    row.innerHTML = `
      ${buildSkinPreview(skinInfo, rarity, 'mp-my-preview')}
      <div class="mp-my-info">
        <div class="mp-my-name">${_esc(listing.skinName || listing.skinId)}</div>
        <div class="mp-my-price">${listing.price.toLocaleString()} coins · ${timeText} left</div>
      </div>
      <button class="mp-cancel-btn">CANCEL</button>
    `;

    row.querySelector('.mp-cancel-btn').addEventListener('click',
      () => handleCancel(listing.id, listing.skinName)
    );

    frag.appendChild(row);
  }

  container.innerHTML = '';
  container.appendChild(frag);
}

// ════════════════════════════════════════════════════════════
//  BUY CONFIRM MODAL
//  Custom modal instead of window.confirm() — non-blocking,
//  styled to match the game UI, works on mobile.
// ════════════════════════════════════════════════════════════

function openBuyModal(listing) {
  const modal    = document.getElementById('mpBuyModal');
  const rarity   = RARITY_PRICING[listing.rarity] || RARITY_PRICING.common;
  const tax      = Math.floor(listing.price * MARKETPLACE_CONFIG.TAX_RATE);
  const afterBal = (typeof playerCoins !== 'undefined' ? playerCoins : 0) - listing.price;

  if (!modal) {
    // Fallback if modal HTML isn't present
    const confirmed = confirm(
      `Buy "${listing.skinName}" for ${listing.price.toLocaleString()} coins?\n` +
      `Tax: ${tax.toLocaleString()} · Balance after: ${afterBal.toLocaleString()}`
    );
    if (confirmed) _executeBuy(listing.id, listing.skinName);
    return;
  }

  // _set() uses textContent which is already XSS-safe — no _esc() needed here
  _set('mpBuyModalSkinName',   listing.skinName || listing.skinId);
  _set('mpBuyModalRarity',     rarity.label);
  _set('mpBuyModalSeller',     listing.sellerName || 'Unknown');
  _set('mpBuyModalPrice',      listing.price.toLocaleString());
  _set('mpBuyModalTax',        tax.toLocaleString());
  _set('mpBuyModalAfter',      afterBal.toLocaleString());

  const rarityEl = document.getElementById('mpBuyModalRarity');
  if (rarityEl) rarityEl.style.color = rarity.color;

  // Build a preview inside the modal
  const previewContainer = document.getElementById('mpBuyModalPreview');
  if (previewContainer) {
    const skinInfo = getSkinInfo(listing.skinId);
    previewContainer.innerHTML = buildSkinPreview(skinInfo, rarity, 'mp-buy-modal-preview');
  }

  // Wire up confirm button (replace to avoid duplicate listeners)
  const confirmBtn = document.getElementById('mpBuyConfirmBtn');
  if (confirmBtn) {
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    newBtn.addEventListener('click', () => _executeBuy(listing.id, listing.skinName));
  }

  const cancelBtn = document.getElementById('mpBuyModalCancelBtn');
  if (cancelBtn) {
    const newBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newBtn, cancelBtn);
    newBtn.addEventListener('click', closeBuyModal);
  }

  modal.classList.remove('hidden');
}

function closeBuyModal() {
  const modal = document.getElementById('mpBuyModal');
  if (modal) modal.classList.add('hidden');
}

// Hard lock: prevents any buy from firing while one is already in flight
// (covers rapid modal re-opens, double-clicks, and async race conditions)
let _buyInFlight = false;

async function _executeBuy(listingId, skinName) {
  if (_buyInFlight) {
    showMpMessage('A purchase is already in progress — please wait.', true);
    return;
  }
  _buyInFlight = true;
  closeBuyModal();

  // Disable all buy buttons while the transaction is in flight
  document.querySelectorAll('.mp-buy-btn').forEach(b => { b.disabled = true; });

  showMpMessage('Processing purchase…');
  let result;
  try {
    result = await buyListing(listingId);
  } finally {
    _buyInFlight = false;
  }

  if (result.success) {
    syncCoinsDisplays();
    showMpMessage(`Purchased "${_esc(result.skinName)}" for ${result.price.toLocaleString()} coins! 🎉`);
    // Refresh everything — listing is now gone, balance changed
    await Promise.all([ mpRefresh(true), fetchMyListings(), renderRecentTrades() ]);
    renderMyListings();
  } else {
    showMpMessage(result.error || 'Purchase failed.', true);
  }

  // Re-enable buy buttons (renderMarketplaceListings will rebuild them with correct state)
  renderMarketplaceListings();
}

// ════════════════════════════════════════════════════════════
//  SELL MODAL
// ════════════════════════════════════════════════════════════

async function openSellModal() {
  const modal = document.getElementById('mpSellModal');
  if (!modal) return;

  const eligibility = await checkMarketplaceEligibility();
  if (!eligibility.eligible) { showMpMessage(eligibility.reason, true); return; }

  if (marketplaceState.myListings.length >= MARKETPLACE_CONFIG.MAX_LISTINGS_PER_PLAYER) {
    showMpMessage(`Maximum ${MARKETPLACE_CONFIG.MAX_LISTINGS_PER_PLAYER} active listings reached.`, true);
    return;
  }

  // Populate dropdown: owned, tradeable, not equipped, not already listed, no cooldown
  const select      = document.getElementById('mpSellSkinSelect');
  const listedSkins = new Set(marketplaceState.myListings.map(l => l.skinId));

  if (select) {
    select.innerHTML = '<option value="">— Select a skin —</option>';

    for (const skinId of ownedSkins) {
      const blockReason = getSkinListingBlockReason(skinId);
      if (blockReason) continue;
      if (listedSkins.has(skinId)) continue;

      const info       = getSkinInfo(skinId);
      const rarity     = getSkinRarity(skinId);
      const rarityInfo = RARITY_PRICING[rarity];
      if (!info || !rarityInfo) continue;

      const opt       = document.createElement('option');
      opt.value       = skinId;
      opt.textContent = `${info.name} (${rarityInfo.label})`;
      opt.dataset.rarity = rarity;
      select.appendChild(opt);
    }

    // Restore previously selected skin if still available
    const prevSelected = select._lastSelected;
    if (prevSelected && select.querySelector(`option[value="${prevSelected}"]`)) {
      select.value = prevSelected;
      onSkinSelectChange();
    } else {
      select.value = '';
    }
  }

  _set('mpSellPriceHint', 'Select a skin first');
  _setInput('mpSellPrice', '');
  _set('mpSellTax', '');
  _hide('mpSellError');

  modal.classList.remove('hidden');
}

function closeSellModal() {
  const modal = document.getElementById('mpSellModal');
  if (modal) modal.classList.add('hidden');
}

function onSkinSelectChange() {
  const select = document.getElementById('mpSellSkinSelect');
  const skinId = select?.value;

  // Remember for next open
  if (select && skinId) select._lastSelected = skinId;

  _hide('mpSellError');

  if (!skinId) {
    _set('mpSellPriceHint', 'Select a skin first');
    _set('mpSellTax', '');
    _setInput('mpSellPrice', '');
    return;
  }

  const rarity = getSkinRarity(skinId);
  const limits = RARITY_PRICING[rarity];
  if (!limits) return;

  _set('mpSellPriceHint', `${limits.label}: ${limits.floor.toLocaleString()}–${limits.ceiling.toLocaleString()} coins`);

  const priceInput = document.getElementById('mpSellPrice');
  if (priceInput) {
    priceInput.min   = limits.floor;
    priceInput.max   = limits.ceiling;
    priceInput.value = limits.floor;
  }

  validateSellPrice();
}

function validateSellPrice() {
  const skinId     = document.getElementById('mpSellSkinSelect')?.value;
  const priceInput = document.getElementById('mpSellPrice');
  const taxEl      = document.getElementById('mpSellTax');
  const errorEl    = document.getElementById('mpSellError');

  if (!skinId || !priceInput?.value) {
    if (taxEl) taxEl.textContent = '';
    return;
  }

  const rarity = getSkinRarity(skinId);
  const limits = RARITY_PRICING[rarity];
  const price  = parseInt(priceInput.value) || 0;

  if (price < limits.floor || price > limits.ceiling) {
    if (errorEl) {
      errorEl.textContent = `Price: ${limits.floor.toLocaleString()}–${limits.ceiling.toLocaleString()}`;
      errorEl.classList.remove('hidden');
    }
    if (taxEl) taxEl.textContent = '';
    return;
  }

  _hide('mpSellError');
  const tax     = Math.floor(price * MARKETPLACE_CONFIG.TAX_RATE);
  const receive = price - tax;
  if (taxEl) taxEl.textContent = `Tax: ${tax.toLocaleString()} · You receive: ${receive.toLocaleString()} coins`;
}

async function handleSellConfirm() {
  const skinId     = document.getElementById('mpSellSkinSelect')?.value;
  const price      = parseInt(document.getElementById('mpSellPrice')?.value) || 0;
  const errorEl    = document.getElementById('mpSellError');
  const confirmBtn = document.getElementById('mpSellConfirmBtn');

  if (!skinId) {
    if (errorEl) { errorEl.textContent = 'Select a skin to list.'; errorEl.classList.remove('hidden'); }
    return;
  }

  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'LISTING…'; }

  const result = await createListing(skinId, price);

  if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'LIST FOR SALE'; }

  if (result.success) {
    closeSellModal();
    showMpMessage('Skin listed successfully!');
    renderMyListings();
    await mpRefresh(true);
  } else {
    if (errorEl) { errorEl.textContent = result.error; errorEl.classList.remove('hidden'); }
  }
}

// ════════════════════════════════════════════════════════════
//  CANCEL LISTING
// ════════════════════════════════════════════════════════════

async function handleCancel(listingId, skinName) {
  // Use the styled buy modal as a confirm dialog rather than window.confirm()
  const modal = document.getElementById('mpBuyModal');
  if (!modal) {
    // bare fallback
    if (!confirm(`Cancel listing for "${skinName}"?\nThe skin will be returned to your inventory.`)) return;
    await _doCancel(listingId);
    return;
  }

  // Reuse the buy modal structure with cancel-specific copy
  document.getElementById('mpBuyModalSkinName').textContent = skinName;
  const rarityEl = document.getElementById('mpBuyModalRarity');
  if (rarityEl) { rarityEl.textContent = 'Cancel Listing'; rarityEl.style.color = '#ff9f43'; }
  document.getElementById('mpBuyModalSeller').textContent = 'you';
  document.getElementById('mpBuyModalPrice').textContent = '—';
  document.getElementById('mpBuyModalTax').textContent = '0';
  document.getElementById('mpBuyModalAfter').textContent = 'Skin returned to inventory';

  const preview = document.getElementById('mpBuyModalPreview');
  if (preview) preview.innerHTML = '<div style="width:52px;height:52px;border-radius:50%;background:rgba(255,159,67,0.2);display:flex;align-items:center;justify-content:center;font-size:24px;">↩</div>';

  const titleEl = modal.querySelector('.mp-sell-title');
  if (titleEl) titleEl.textContent = 'CANCEL LISTING?';

  const confirmBtn = document.getElementById('mpBuyConfirmBtn');
  if (confirmBtn) {
    const newBtn = confirmBtn.cloneNode(true);
    newBtn.textContent = '↩ CANCEL LISTING';
    newBtn.style.color = '#ff9f43';
    newBtn.style.borderColor = 'rgba(255,159,67,0.35)';
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    newBtn.addEventListener('click', async () => {
      closeBuyModal();
      if (titleEl) titleEl.textContent = 'CONFIRM PURCHASE'; // restore
      await _doCancel(listingId);
    });
  }

  const cancelBtn = document.getElementById('mpBuyModalCancelBtn');
  if (cancelBtn) {
    const newBtn = cancelBtn.cloneNode(true);
    newBtn.textContent = 'KEEP LISTING';
    cancelBtn.parentNode.replaceChild(newBtn, cancelBtn);
    newBtn.addEventListener('click', () => {
      closeBuyModal();
      if (titleEl) titleEl.textContent = 'CONFIRM PURCHASE'; // restore
    });
  }

  modal.classList.remove('hidden');
}

async function _doCancel(listingId) {
  const result = await cancelListing(listingId);
  if (result.success) {
    showMpMessage('Listing cancelled. Skin returned to inventory.');
    syncCoinsDisplays();
    renderMyListings();
    await mpRefresh(true);
  } else {
    showMpMessage(result.error || 'Cancellation failed.', true);
  }
}

// ════════════════════════════════════════════════════════════
//  MESSAGE BANNER
// ════════════════════════════════════════════════════════════

function showMpMessage(text, isError = false) {
  const el = document.getElementById('mpMessage');
  if (!el) return;

  el.textContent = text;
  el.className   = `mp-message ${isError ? 'mp-msg-error' : 'mp-msg-success'}`;
  el.classList.remove('hidden');

  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.add('hidden'), isError ? 5000 : 3500);
}

// ════════════════════════════════════════════════════════════
//  SHOP TAB INTEGRATION
//  NOTE: game.js already calls openMarketplaceTab() when the
//  marketplace tab is clicked (see shop tab switching block).
//  We only need to wire up the Sell button here.
// ════════════════════════════════════════════════════════════

function setupMarketplaceShopTab() {
  // game.js owns the tab-click → openMarketplaceTab() call.
  // We just attach the sell button listener here.
  const sellBtn = document.getElementById('mpSellBtn');
  if (sellBtn) sellBtn.addEventListener('click', openSellModal);
}

window.addEventListener('load', setupMarketplaceShopTab);

// ════════════════════════════════════════════════════════════
//  RECENT TRADES
//  Shows the last 5 completed trades so players can gauge
//  realistic prices. Read from tradeLogs (public read).
// ════════════════════════════════════════════════════════════

async function renderRecentTrades() {
  const container = document.getElementById('mpRecentTrades');
  if (!container) return;

  container.innerHTML = '<div class="mp-recent-loading">Loading recent trades…</div>';

  try {
    const snap = await db.collection('tradeLogs')
      .orderBy('timestamp', 'desc').limit(5).get();

    if (snap.empty) {
      container.innerHTML = '<div class="mp-recent-empty">No trades yet — be the first!</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    snap.forEach(doc => {
      const d         = doc.data();
      const rarity    = RARITY_PRICING[d.rarity] || RARITY_PRICING.common;
      const timeAgo   = _timeAgo(d.timestamp?.seconds ? d.timestamp.seconds * 1000 : Date.now());
      const row       = document.createElement('div');
      row.className   = 'mp-recent-row';
      row.innerHTML = `
        <span class="mp-recent-dot" style="background:${rarity.color};box-shadow:0 0 6px ${rarity.color}80;"></span>
        <span class="mp-recent-name">${_esc(d.skinName || d.skinId)}</span>
        <span class="mp-recent-price">🪙 ${(d.price||0).toLocaleString()}</span>
        <span class="mp-recent-time">${timeAgo}</span>
      `;
      frag.appendChild(row);
    });
    container.innerHTML = '';
    container.appendChild(frag);
  } catch (err) {
    container.innerHTML = '<div class="mp-recent-empty">Could not load trades.</div>';
  }
}

function _timeAgo(ms) {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60)   return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400)return `${Math.floor(sec/3600)}h ago`;
  return `${Math.floor(sec/86400)}d ago`;
}

// ════════════════════════════════════════════════════════════
//  DOM HELPERS
// ════════════════════════════════════════════════════════════

function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function _set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _setInput(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function _hide(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

console.log('🏪 Marketplace UI module loaded');