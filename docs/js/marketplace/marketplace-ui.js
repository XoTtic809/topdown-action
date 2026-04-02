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
      const prev = marketplaceState.currentFilter;
      document.querySelectorAll('.mp-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      marketplaceState.currentFilter = btn.dataset.rarity;

      // Re-fetch from server when switching to/from 'crate' filter (server-side type filter)
      const switchedCrate = (prev === 'crate') !== (btn.dataset.rarity === 'crate');
      if (switchedCrate) {
        mpRefresh(true);
      } else {
        renderMarketplaceListings();
      }
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

  // Price range inputs
  const priceMinInput = document.getElementById('mpPriceMin');
  const priceMaxInput = document.getElementById('mpPriceMax');
  if (priceMinInput) {
    priceMinInput.addEventListener('input', () => {
      const v = parseInt(priceMinInput.value);
      marketplaceState.priceMin = isNaN(v) || v === 0 ? null : v;
      renderMarketplaceListings();
    });
  }
  if (priceMaxInput) {
    priceMaxInput.addEventListener('input', () => {
      const v = parseInt(priceMaxInput.value);
      marketplaceState.priceMax = isNaN(v) || v === 0 ? null : v;
      renderMarketplaceListings();
    });
  }

  // Trending filter button
  const trendingBtn = document.getElementById('mpTrendingFilterBtn');
  if (trendingBtn) {
    trendingBtn.addEventListener('click', () => {
      marketplaceState.showTrendingOnly = !marketplaceState.showTrendingOnly;
      trendingBtn.classList.toggle('active', marketplaceState.showTrendingOnly);
      renderMarketplaceListings();
    });
  }

  // Seller mini-card hover
  let _miniCardTimer = null;
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('.mp-seller-hover');
    if (!el || !el.dataset.uid) return;
    clearTimeout(_miniCardTimer);
    _miniCardTimer = setTimeout(() => {
      if (typeof showMiniProfileCard === 'function') showMiniProfileCard(el.dataset.uid, el);
    }, 200);
  });
  document.addEventListener('mouseleave', e => {
    if (!e.target.closest?.('.mp-seller-hover') && !e.target.closest?.('.pc-mini-card')) return;
    clearTimeout(_miniCardTimer);
    _miniCardTimer = setTimeout(() => {
      if (typeof hideMiniProfileCard === 'function') hideMiniProfileCard();
    }, 200);
  }, true);

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
    grid.innerHTML = Array(8).fill(`
      <div class="mp-listing-card" style="pointer-events:none;border-color:rgba(88,166,255,0.08)">
        <div class="sk-shimmer sk-circle" style="width:38px;height:38px;margin:0 auto 8px"></div>
        <div class="sk-shimmer sk-line-sm" style="width:75%;margin:0 auto 4px"></div>
        <div class="sk-shimmer sk-line-sm" style="width:55%;margin:0 auto 4px"></div>
        <div class="sk-shimmer sk-line" style="width:60%;margin:0 auto 8px"></div>
        <div class="sk-shimmer sk-box" style="height:28px;border-radius:6px"></div>
      </div>`).join('');
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

  // Apply text search — matches skin name, crate name, or seller name
  if (_mpSearchQuery) {
    const CRATE_NAMES_LOWER = {
      'common-crate': 'common crate', 'rare-crate': 'rare crate', 'epic-crate': 'epic crate',
      'legendary-crate': 'legendary crate', 'icon-crate': 'icon crate', 'oblivion-crate': 'oblivion crate',
    };
    filtered = filtered.filter(l => {
      const name   = (l.skinName   || '').toLowerCase();
      const seller = (l.sellerName || '').toLowerCase();
      const crate  = l.crateId ? (CRATE_NAMES_LOWER[l.crateId] || l.crateId) : '';
      return name.includes(_mpSearchQuery) || seller.includes(_mpSearchQuery) || crate.includes(_mpSearchQuery);
    });
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

  // Async: fetch stats for all visible items and update badges in-place (fire-and-forget)
  _batchUpdateListingBadges(filtered);
}

function createListingCard(listing) {
  // ── Crate listing card ──
  if (listing.listingType === 'crate') {
    return _createCrateListingCard(listing);
  }

  const rarity   = RARITY_PRICING[listing.rarity] || RARITY_PRICING.common;
  const skinInfo = getSkinInfo(listing.skinId);
  const { mutation } = typeof parseMutatedSkinId === 'function' ? parseMutatedSkinId(listing.skinId) : { mutation: null };
  const mc = mutation && typeof MUTATION_CONFIG !== 'undefined' ? MUTATION_CONFIG[mutation] : null;

  // Time remaining display
  const expiresMs  = listing.expiresAt?.seconds ? listing.expiresAt.seconds * 1000 : 0;
  const hoursLeft  = Math.max(0, Math.floor((expiresMs - Date.now()) / 3600000));
  const timeText   = hoursLeft > 24 ? `${Math.floor(hoursLeft / 24)}d left` : `${hoursLeft}h left`;

  const canAfford  = typeof playerCoins !== 'undefined' && playerCoins >= listing.price;
  const isOwn      = currentUser && listing.sellerId === currentUser.uid;
  const canBuy     = !isOwn && canAfford;

  const btnLabel   = isOwn ? 'YOUR LISTING' : !canAfford ? 'NOT ENOUGH' : 'BUY';
  const mutTag     = mc ? `<span class="mp-mutation-tag" style="color:${mc.color};text-shadow:0 0 8px ${mc.glowColor}">${mc.label}</span>` : '';
  const rarityLabel = mc ? `${rarity.label} <span style="color:${mc.color}">[${mc.label}]</span>` : rarity.label;

  const itemId = (listing.skinId || '').split('__')[0]; // base skin ID for stats lookup

  const card = document.createElement('div');
  card.className   = 'mp-listing-card';
  card.dataset.itemId   = itemId;
  card.dataset.itemType = 'skin';
  card.style.setProperty('--rarity-color', mc ? mc.color : rarity.color);
  card.style.borderColor = (mc ? mc.color : rarity.color) + '40';

  card.innerHTML = `
    ${buildSkinPreview(skinInfo, rarity, 'mp-listing-preview', mutation)}
    <div class="mp-listing-info">
      <div class="mp-listing-name">${_esc(listing.skinName || listing.skinId)}${mutTag}</div>
      <div class="mp-listing-rarity" style="color:${mc ? mc.color : rarity.color}">${rarityLabel}</div>
      <div class="mp-listing-seller">by <span class="mp-seller-hover" data-uid="${_esc(listing.sellerId || '')}" data-username="${_esc(listing.sellerName || 'Unknown')}">${_esc(listing.sellerName || 'Unknown')}</span></div>
      <div class="mp-listing-time">${timeText}</div>
      <div class="mp-stats-badges" style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;"></div>
      <div class="mp-supply-row" style="font-size:11px;color:#888;margin-top:3px;"></div>
    </div>
    <div class="mp-listing-bottom">
      <div class="mp-listing-price">${listing.price.toLocaleString()}</div>
      <div style="display:flex;gap:4px;align-items:center;">
        <button class="mp-history-btn" data-item-id="${_esc(itemId)}" title="Price History"
          style="background:none;border:1px solid #555;border-radius:4px;color:#aaa;
                 padding:4px 6px;cursor:pointer;font-size:11px;">📊</button>
        <button class="mp-buy-btn${canBuy ? '' : ' disabled'}"
                ${canBuy ? '' : 'disabled'}
                data-listing-id="${listing.id}">
          ${btnLabel}
        </button>
      </div>
    </div>
  `;

  if (canBuy) {
    card.querySelector('.mp-buy-btn').addEventListener('click', () => openBuyModal(listing));
  }
  card.querySelector('.mp-history-btn').addEventListener('click', () => showPriceHistoryModal(itemId, 'skin'));

  return card;
}

// Crate-specific listing card
const CRATE_CARD_ICONS = {
  'common-crate': '📦', 'rare-crate': '🎁', 'epic-crate': '🎭',
  'legendary-crate': '⭐', 'icon-crate': '🎯', 'oblivion-crate': '🌑',
};
const CRATE_CARD_COLORS = {
  'common-crate': '#78b7ff', 'rare-crate': '#9d7aff', 'epic-crate': '#ff6bcb',
  'legendary-crate': '#ffd700', 'icon-crate': '#00e5ff', 'oblivion-crate': '#8a2be2',
};

function _createCrateListingCard(listing) {
  const crateIcon  = CRATE_CARD_ICONS[listing.crateId]  || '📦';
  const crateColor = CRATE_CARD_COLORS[listing.crateId] || '#4a9eff';

  const expiresMs = listing.expiresAt?.seconds ? listing.expiresAt.seconds * 1000 : 0;
  const hoursLeft = Math.max(0, Math.floor((expiresMs - Date.now()) / 3600000));
  const timeText  = hoursLeft > 24 ? `${Math.floor(hoursLeft / 24)}d left` : `${hoursLeft}h left`;

  const canAfford = typeof playerCoins !== 'undefined' && playerCoins >= listing.price;
  const isOwn     = currentUser && listing.sellerId === currentUser.uid;
  const canBuy    = !isOwn && canAfford;
  const btnLabel  = isOwn ? 'YOUR LISTING' : !canAfford ? 'NOT ENOUGH' : 'BUY';

  const card = document.createElement('div');
  card.className = 'mp-listing-card';
  card.dataset.itemId   = listing.crateId || '';
  card.dataset.itemType = 'crate';
  card.style.setProperty('--rarity-color', crateColor);
  card.style.borderColor = crateColor + '40';

  card.innerHTML = `
    <div class="mp-listing-preview" style="
      display:flex;align-items:center;justify-content:center;
      font-size:40px;
      background:radial-gradient(circle, ${crateColor}15, transparent);
    ">${crateIcon}</div>
    <div class="mp-listing-info">
      <div class="mp-listing-name">${_esc(listing.skinName || listing.crateId)}</div>
      <div class="mp-listing-rarity" style="color:${crateColor}">Crate</div>
      <div class="mp-listing-seller">by <span class="mp-seller-hover" data-uid="${_esc(listing.sellerId || '')}" data-username="${_esc(listing.sellerName || 'Unknown')}">${_esc(listing.sellerName || 'Unknown')}</span></div>
      <div class="mp-listing-time">${timeText}</div>
      <div class="mp-stats-badges" style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;"></div>
      <div class="mp-supply-row" style="font-size:11px;color:#888;margin-top:3px;"></div>
    </div>
    <div class="mp-listing-bottom">
      <div class="mp-listing-price">${listing.price.toLocaleString()}</div>
      <div style="display:flex;gap:4px;align-items:center;">
        <button class="mp-history-btn" title="Price History"
          style="background:none;border:1px solid #555;border-radius:4px;color:#aaa;
                 padding:4px 6px;cursor:pointer;font-size:11px;">📊</button>
        <button class="mp-buy-btn${canBuy ? '' : ' disabled'}"
                ${canBuy ? '' : 'disabled'}
                data-listing-id="${listing.id}">
          ${btnLabel}
        </button>
      </div>
    </div>
  `;

  if (canBuy) {
    card.querySelector('.mp-buy-btn').addEventListener('click', () => openBuyModal(listing));
  }
  card.querySelector('.mp-history-btn').addEventListener('click', () => showPriceHistoryModal(listing.crateId, 'crate'));

  return card;
}

// Delegates to single source of truth in skin-previews.js
function getSkinPreviewStyle(skinId) {
  return getSkinPreview(skinId);
}

// Delegates to buildSkinPreviewHTML in skin-previews.js
function buildSkinPreview(skinInfo, rarity, className, mutation) {
  const skinId = skinInfo?.id || '';
  return buildSkinPreviewHTML(skinId, className, {
    mutation: mutation,
    skinInfo: skinInfo,
    rarityColor: rarity?.color
  });
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
    const { mutation: myMut } = typeof parseMutatedSkinId === 'function' ? parseMutatedSkinId(listing.skinId) : { mutation: null };
    const myMc = myMut && typeof MUTATION_CONFIG !== 'undefined' ? MUTATION_CONFIG[myMut] : null;
    const expiresMs = listing.expiresAt?.seconds ? listing.expiresAt.seconds * 1000 : 0;
    const hoursLeft = Math.max(0, Math.floor((expiresMs - Date.now()) / 3600000));
    const timeText  = hoursLeft > 24 ? `${Math.floor(hoursLeft / 24)}d` : `${hoursLeft}h`;

    const row = document.createElement('div');
    row.className = 'mp-my-listing';
    row.style.borderColor = (myMc ? myMc.color : rarity.color) + '30';

    row.innerHTML = `
      ${buildSkinPreview(skinInfo, rarity, 'mp-my-preview', myMut)}
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
    const { mutation: modalMut } = typeof parseMutatedSkinId === 'function' ? parseMutatedSkinId(listing.skinId) : { mutation: null };
    previewContainer.innerHTML = buildSkinPreview(skinInfo, rarity, 'mp-buy-modal-preview', modalMut);
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
    // Always re-render to re-enable buttons, even on network error
    renderMarketplaceListings();
  }

  if (!result) return; // network error threw before we got a response
  if (result.success) {
    syncCoinsDisplays();
    showMpMessage(`Purchased "${_esc(result.skinName)}" for ${result.price.toLocaleString()} coins! 🎉`);
    // Refresh everything — listing is now gone, balance changed
    await Promise.all([ mpRefresh(true), fetchMyListings(), renderRecentTrades() ]);
    renderMyListings();
  } else {
    showMpMessage(result.error || 'Purchase failed.', true);
  }
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

    // Count owned copies and listed copies per skin, then show available copies
    const ownedCounts  = {};
    const listedCounts = {};
    for (const s of ownedSkins) ownedCounts[s] = (ownedCounts[s] || 0) + 1;
    for (const s of marketplaceState.myListings.map(l => l.skinId)) {
      listedCounts[s] = (listedCounts[s] || 0) + 1;
    }

    const seen = new Set();
    for (const skinId of ownedSkins) {
      if (seen.has(skinId)) continue; // deduplicate loop
      seen.add(skinId);

      const available = (ownedCounts[skinId] || 0) - (listedCounts[skinId] || 0);
      if (available <= 0) continue;

      const blockReason = getSkinListingBlockReason(skinId);
      if (blockReason) continue;

      const info       = getSkinInfo(skinId);
      const rarity     = getSkinRarity(skinId);
      const rarityInfo = RARITY_PRICING[rarity];
      if (!info || !rarityInfo) continue;

      const { mutation } = typeof parseMutatedSkinId === 'function' ? parseMutatedSkinId(skinId) : { mutation: null };
      const mc = mutation && typeof MUTATION_CONFIG !== 'undefined' ? MUTATION_CONFIG[mutation] : null;
      const mutLabel = mc ? ` [${mc.label}]` : '';
      const countLabel = available > 1 ? ` ×${available}` : '';

      const opt       = document.createElement('option');
      opt.value       = skinId;
      opt.textContent = `${info.name}${mutLabel}${countLabel} (${rarityInfo.label})`;
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

async function openSellCrateModal() {
  const eligibility = await checkMarketplaceEligibility();
  if (!eligibility.eligible) { showMpMessage(eligibility.reason, true); return; }

  if (marketplaceState.myListings.length >= MARKETPLACE_CONFIG.MAX_LISTINGS_PER_PLAYER) {
    showMpMessage(`Maximum ${MARKETPLACE_CONFIG.MAX_LISTINGS_PER_PLAYER} active listings reached.`, true);
    return;
  }

  // Get owned crates
  const owned = typeof ownedCratesCache !== 'undefined' ? ownedCratesCache : [];
  if (!owned.length) {
    showMpMessage('You don\'t own any cases to sell.', true);
    return;
  }

  // Count owned crates by type
  const counts = {};
  for (const c of owned) counts[c] = (counts[c] || 0) + 1;

  // Build a picker overlay
  const existing = document.getElementById('crateSellPickerOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'crateSellPickerOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.75);
    display:flex;align-items:center;justify-content:center;
    z-index:10000;backdrop-filter:blur(4px);
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    background:linear-gradient(135deg,#0d1525 0%,#0a0f1e 100%);
    border:1px solid rgba(255,167,38,0.4);
    border-radius:16px;padding:28px 32px;text-align:center;
    max-width:380px;width:90%;
    box-shadow:0 0 40px rgba(255,167,38,0.15);
    font-family:'Orbitron',sans-serif;
  `;

  const unique = Object.keys(counts);
  const btns = unique.map(crateId => {
    const info = typeof CRATE_PRICING_CLIENT !== 'undefined' ? CRATE_PRICING_CLIENT[crateId] : null;
    const name = info ? info.name : crateId;
    const cnt = counts[crateId];
    return `<button class="crate-sell-pick-btn" data-crate="${crateId}" style="
      display:block;width:100%;background:rgba(255,167,38,0.08);
      border:1px solid rgba(255,167,38,0.25);color:#ffa726;
      padding:12px 16px;border-radius:10px;cursor:pointer;
      font-family:'Orbitron',sans-serif;font-size:12px;font-weight:700;
      letter-spacing:1px;margin-bottom:8px;text-align:left;
    ">${name}${cnt > 1 ? ` <span style="color:rgba(219,231,255,0.5)">×${cnt}</span>` : ''}</button>`;
  }).join('');

  box.innerHTML = `
    <div style="font-size:14px;font-weight:700;color:#dbe7ff;letter-spacing:1px;margin-bottom:16px">
      Select a Case to Sell
    </div>
    <div style="max-height:300px;overflow-y:auto">${btns}</div>
    <button id="crateSellPickerClose" style="
      margin-top:14px;background:rgba(255,255,255,0.04);
      border:1px solid rgba(255,255,255,0.12);
      color:rgba(219,231,255,0.55);padding:9px 28px;border-radius:8px;cursor:pointer;
      font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;
    ">CANCEL</button>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById('crateSellPickerClose').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // Wire up each crate button
  box.querySelectorAll('.crate-sell-pick-btn').forEach(btn => {
    btn.onclick = () => {
      const crateId = btn.dataset.crate;
      close();
      if (typeof openMarketplaceCrateListingFlow === 'function') {
        openMarketplaceCrateListingFlow(crateId);
      }
    };
  });
}

// Tracks the market-average suggested price for the currently selected sell skin
let _sellSuggestedPrice = null;

async function onSkinSelectChange() {
  const select = document.getElementById('mpSellSkinSelect');
  const skinId = select?.value;

  // Remember for next open
  if (select && skinId) select._lastSelected = skinId;

  _hide('mpSellError');
  _sellSuggestedPrice = null;

  if (!skinId) {
    _set('mpSellPriceHint', 'Select a skin first');
    _set('mpSellTax', '');
    _setInput('mpSellPrice', '');
    return;
  }

  const rarity = getSkinRarity(skinId);
  const limits = RARITY_PRICING[rarity];
  if (!limits) return;

  const baseId = skinId.split('__')[0];

  // Set range hint and default to floor while stats load
  _set('mpSellPriceHint', `${limits.label}: ${limits.floor.toLocaleString()}–${limits.ceiling.toLocaleString()} coins`);
  const priceInput = document.getElementById('mpSellPrice');
  if (priceInput) {
    priceInput.min   = limits.floor;
    priceInput.max   = limits.ceiling;
    priceInput.value = limits.floor;
  }
  validateSellPrice();

  // Async: fetch market stats and update suggested price
  const stats = await fetchListingStats(baseId);
  if (stats && stats.suggestedPrice) {
    _sellSuggestedPrice = stats.suggestedPrice;
    const clamped = Math.max(limits.floor, Math.min(limits.ceiling, stats.suggestedPrice));
    if (priceInput && document.getElementById('mpSellSkinSelect')?.value === skinId) {
      priceInput.value = clamped;
      _set('mpSellPriceHint',
        `${limits.label}: ${limits.floor.toLocaleString()}–${limits.ceiling.toLocaleString()} · ` +
        `Market avg: 💰 ${stats.suggestedPrice.toLocaleString()} (7d)`
      );
      validateSellPrice();
    }
  }
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

  // Warn if price is 30%+ below market average
  if (_sellSuggestedPrice && price < _sellSuggestedPrice * 0.70) {
    if (errorEl) {
      errorEl.textContent = `⚠ Price is ${Math.round((1 - price / _sellSuggestedPrice) * 100)}% below market average (💰 ${_sellSuggestedPrice.toLocaleString()})`;
      errorEl.classList.remove('hidden');
      errorEl.style.color = '#f39c12';
    }
  } else {
    if (errorEl) errorEl.style.color = '';
  }

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
  const sellCrateBtn = document.getElementById('mpSellCrateBtn');
  if (sellCrateBtn) sellCrateBtn.addEventListener('click', openSellCrateModal);
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
    const trades = await apiGet('/marketplace/recent-trades');

    if (!Array.isArray(trades) || trades.length === 0) {
      container.innerHTML = '<div class="mp-recent-empty">No trades yet — be the first!</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    trades.forEach(d => {
      const rarity  = RARITY_PRICING[d.rarity] || RARITY_PRICING.common;
      const timeAgo = _timeAgo(d.timestamp ? new Date(d.timestamp).getTime() : Date.now());
      const row     = document.createElement('div');
      row.className = 'mp-recent-row';
      row.innerHTML = `
        <span class="mp-recent-dot" style="background:${rarity.color};box-shadow:0 0 6px ${rarity.color}80;"></span>
        <span class="mp-recent-name">${_esc(d.skin_name || d.skin_id)}</span>
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

// ════════════════════════════════════════════════════════════
//  LISTING STATS: BADGES + SUPPLY/DEMAND
// ════════════════════════════════════════════════════════════

async function _batchUpdateListingBadges(listings) {
  // Deduplicate item IDs
  const seen = new Set();
  const unique = listings.filter(l => {
    const id = l.listingType === 'crate' ? l.crateId : (l.skinId || '').split('__')[0];
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  await Promise.all(unique.map(async (listing) => {
    const itemId = listing.listingType === 'crate' ? listing.crateId : (listing.skinId || '').split('__')[0];
    const stats = await fetchListingStats(itemId);
    if (!stats) return;

    // Find all cards for this item ID and update them
    document.querySelectorAll(`.mp-listing-card[data-item-id="${CSS.escape(itemId)}"]`).forEach(card => {
      _applyStatsBadges(card, stats);
    });
  }));
}

function _applyStatsBadges(card, stats) {
  const badgesEl   = card.querySelector('.mp-stats-badges');
  const supplyEl   = card.querySelector('.mp-supply-row');
  if (!badgesEl) return;

  // Trending badge
  badgesEl.innerHTML = '';
  if (stats.avgPrice24h && stats.avgPrice7d && stats.avgPrice7d > 0) {
    const ratio = stats.avgPrice24h / stats.avgPrice7d;
    if (ratio >= 1.05) {
      const badge = document.createElement('span');
      badge.textContent = '📈 TRENDING UP';
      badge.style.cssText = 'background:#145214;color:#6bff7b;border:1px solid #6bff7b;border-radius:3px;padding:2px 5px;font-size:10px;font-weight:700;';
      badgesEl.appendChild(badge);
    } else if (ratio <= 0.95) {
      const badge = document.createElement('span');
      badge.textContent = '📉 PRICE DROP';
      badge.style.cssText = 'background:#521414;color:#ff6b6b;border:1px solid #ff6b6b;border-radius:3px;padding:2px 5px;font-size:10px;font-weight:700;';
      badgesEl.appendChild(badge);
    }
  }
  if (stats.activeListings <= 3 && stats.activeListings > 0) {
    const badge = document.createElement('span');
    badge.textContent = '⚠ LOW STOCK';
    badge.style.cssText = 'background:#7b5800;color:#ffc107;border:1px solid #ffc107;border-radius:3px;padding:2px 5px;font-size:10px;font-weight:700;';
    badgesEl.appendChild(badge);
  }

  // Supply/demand row
  if (supplyEl) {
    const parts = [];
    if (stats.activeListings != null) parts.push(`${stats.activeListings} listed`);
    if (stats.totalSold7d) parts.push(`${stats.totalSold7d} sold this week`);
    supplyEl.textContent = parts.join(' · ');
  }
}

// ════════════════════════════════════════════════════════════
//  PRICE HISTORY CHART MODAL
// ════════════════════════════════════════════════════════════

async function showPriceHistoryModal(itemId, itemType) {
  const existing = document.getElementById('priceHistoryModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'priceHistoryModal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:10000;
    display:flex;align-items:center;justify-content:center;
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    background:#0f0f1a;border:1px solid #333;border-radius:12px;
    padding:20px;width:660px;max-width:96vw;color:#fff;font-family:inherit;
  `;

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="font-size:1rem;font-weight:700;">📊 Price History — ${_esc(itemId)}</div>
      <button id="phCloseBtn" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:1.2rem;">✕</button>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:10px;">
      <button class="ph-tab active" data-period="7d"  style="padding:5px 12px;border-radius:6px;cursor:pointer;background:#1a3a5c;border:1px solid #4a9eff;color:#4a9eff;font-size:12px;">7D</button>
      <button class="ph-tab"        data-period="30d" style="padding:5px 12px;border-radius:6px;cursor:pointer;background:#111;border:1px solid #555;color:#aaa;font-size:12px;">30D</button>
      <button class="ph-tab"        data-period="all" style="padding:5px 12px;border-radius:6px;cursor:pointer;background:#111;border:1px solid #555;color:#aaa;font-size:12px;">ALL</button>
    </div>
    <canvas id="priceHistoryCanvas" style="width:100%;border-radius:6px;background:#0a0a14;display:block;"></canvas>
    <div id="phStatsRow" style="display:flex;gap:16px;margin-top:10px;font-size:12px;color:#aaa;flex-wrap:wrap;"></div>
    <div id="phTooltip" style="position:absolute;background:#1a1a2e;border:1px solid #4a9eff;border-radius:4px;padding:4px 8px;font-size:11px;pointer-events:none;display:none;"></div>
  `;

  modal.appendChild(box);
  document.body.appendChild(modal);

  const canvas = box.querySelector('#priceHistoryCanvas');
  const statsRow = box.querySelector('#phStatsRow');
  const tooltip  = box.querySelector('#phTooltip');
  let currentPrices = [];

  async function loadChart(period) {
    canvas.textContent = 'Loading…';
    const [histData, statsData] = await Promise.all([
      fetchPriceHistory(itemId, period),
      fetchListingStats(itemId),
    ]);
    currentPrices = (histData.prices || []).map(p => ({
      price: p.price,
      date:  new Date(p.soldAt),
    }));

    // Set canvas actual pixel dimensions
    const W = canvas.offsetWidth || 620;
    const H = 200;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    _drawPriceChart(ctx, currentPrices, W, H);

    // Stats row
    if (statsData) {
      const fmt = n => n != null ? `💰 ${n.toLocaleString()}` : '—';
      statsRow.innerHTML = `
        <span>Avg 7d: ${fmt(statsData.avgPrice7d)}</span>
        <span>Avg 24h: ${fmt(statsData.avgPrice24h)}</span>
        <span>Sold 7d: ${statsData.totalSold7d || 0}</span>
        <span>Listed: ${statsData.activeListings || 0}</span>
      `;
    }

    // Hover tooltip
    canvas.onmousemove = (e) => {
      if (currentPrices.length < 2) return;
      const rect = canvas.getBoundingClientRect();
      const mx   = (e.clientX - rect.left) * (canvas.width / rect.width);
      const pad  = 40;
      const chartW = canvas.width - pad - 10;
      const idx  = Math.min(currentPrices.length - 1,
        Math.max(0, Math.round((mx - pad) / chartW * (currentPrices.length - 1))));
      const pt = currentPrices[idx];
      tooltip.textContent = `${pt.date.toLocaleDateString()} · 💰 ${pt.price.toLocaleString()}`;
      tooltip.style.display = 'block';
      tooltip.style.left = `${e.clientX - box.getBoundingClientRect().left + 8}px`;
      tooltip.style.top  = `${e.clientY - box.getBoundingClientRect().top  - 28}px`;
    };
    canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
  }

  // Tab switching
  box.querySelectorAll('.ph-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      box.querySelectorAll('.ph-tab').forEach(t => {
        t.style.background = '#111'; t.style.borderColor = '#555'; t.style.color = '#aaa';
      });
      tab.style.background = '#1a3a5c'; tab.style.borderColor = '#4a9eff'; tab.style.color = '#4a9eff';
      loadChart(tab.dataset.period);
    });
  });

  box.querySelector('#phCloseBtn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  await loadChart('7d');
}

function _drawPriceChart(ctx, pricePoints, W, H) {
  ctx.clearRect(0, 0, W, H);

  if (pricePoints.length === 0) {
    ctx.fillStyle = '#555';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No sales data yet', W / 2, H / 2);
    return;
  }

  const padL = 52, padR = 10, padT = 10, padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const prices = pricePoints.map(p => p.price);
  const minP   = Math.min(...prices);
  const maxP   = Math.max(...prices);
  const range  = maxP - minP || 1;

  const scaleX = i => padL + (i / (pricePoints.length - 1 || 1)) * chartW;
  const scaleY = v => padT + chartH - ((v - minP) / range) * chartH;

  // Grid lines
  ctx.strokeStyle = '#222';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    const val = maxP - (i / 4) * range;
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val >= 1000 ? `${(val/1000).toFixed(1)}k` : Math.round(val).toString(), padL - 4, y + 3);
  }

  // Filled area
  const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  grad.addColorStop(0,   'rgba(74,158,255,0.35)');
  grad.addColorStop(1,   'rgba(74,158,255,0)');
  ctx.beginPath();
  ctx.moveTo(scaleX(0), padT + chartH);
  pricePoints.forEach((p, i) => ctx.lineTo(scaleX(i), scaleY(p.price)));
  ctx.lineTo(scaleX(pricePoints.length - 1), padT + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = '#4a9eff';
  ctx.lineWidth   = 2;
  pricePoints.forEach((p, i) => {
    i === 0 ? ctx.moveTo(scaleX(i), scaleY(p.price))
             : ctx.lineTo(scaleX(i), scaleY(p.price));
  });
  ctx.stroke();

  // Dots on endpoints
  [[0, pricePoints[0]], [pricePoints.length - 1, pricePoints[pricePoints.length - 1]]].forEach(([i, p]) => {
    ctx.beginPath();
    ctx.arc(scaleX(i), scaleY(p.price), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#4a9eff';
    ctx.fill();
  });

  // X-axis date labels (first + last)
  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  if (pricePoints[0].date) {
    ctx.fillText(pricePoints[0].date.toLocaleDateString(), scaleX(0), H - 6);
    ctx.fillText(pricePoints[pricePoints.length - 1].date.toLocaleDateString(), scaleX(pricePoints.length - 1), H - 6);
  }
}