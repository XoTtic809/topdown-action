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

// Returns rich CSS style values for any skin ID — gradients, glows, animations.
// Matches the visual quality of the crates/skins tabs.
function getSkinPreviewStyle(skinId) {
  const S = {
    // ── Special shop skins ──────────────────────────────────────────────────
    rainbow:    { bg: 'conic-gradient(red,orange,yellow,green,cyan,blue,violet,red)', sh: '0 0 22px rgba(255,150,0,0.7)', an: 'quantumSpin 3s linear infinite' },
    galaxy:     { bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)', sh: '0 0 25px #764ba2', an: 'galaxyShimmer 2s ease-in-out infinite' },
    void:       { bg: 'radial-gradient(circle at 40% 40%, #1a0033 0%, #0d001a 40%, #000000 100%)', sh: '0 0 35px #9900ff, 0 0 60px rgba(153,0,255,0.5)', an: 'voidPulse 3s ease-in-out infinite' },
    sunset:     { bg: 'linear-gradient(135deg, #ff6b6b 0%, #ffd93d 50%, #ff69b4 100%)', sh: '0 0 20px #ff8c00' },
    phoenix:    { bg: 'radial-gradient(circle, #ff4500 0%, #ff6347 50%, #ffa500 100%)', sh: '0 0 22px #ff4500', an: 'voidPulse 2s ease-in-out infinite' },
    diamond:    { bg: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #f0f8ff 20%, #ffe6f0 40%, #fff5e6 60%, #f0f0ff 80%, #ffffff 100%)', sh: '0 0 40px rgba(255,255,255,1), 0 0 70px rgba(255,255,255,0.7)', an: 'diamondShine 2.5s ease-in-out infinite' },
    quantum:    { bg: 'conic-gradient(from 0deg, #ff0080, #00ffff, #8000ff, #ffff00, #ff0080)', sh: '0 0 35px rgba(255,0,255,0.8)', an: 'quantumSpin 3s linear infinite' },
    celestial:  { bg: 'radial-gradient(circle at 30% 40%, #b794f6 0%, #4a90e2 30%, #50c9ce 50%, #ffd700 70%, #b794f6 100%)', sh: '0 0 45px rgba(183,148,246,1)', an: 'celestialGlow 4s ease-in-out infinite' },
    // ── Champion skins ──────────────────────────────────────────────────────
    'gold-champion':   { bg: 'radial-gradient(circle, #ffd700 0%, #ffed4e 40%, #ffffff 60%, #ffd700 100%)', sh: '0 0 30px #ffd700', an: 'championPulse 2s ease-in-out infinite' },
    'silver-champion': { bg: 'radial-gradient(circle, #c0c0c0 0%, #e8e8e8 40%, #ffffff 60%, #c0c0c0 100%)', sh: '0 0 30px #c0c0c0', an: 'championPulse 2.2s ease-in-out infinite' },
    'bronze-champion': { bg: 'radial-gradient(circle, #cd7f32 0%, #e8a87c 40%, #f5d0a9 60%, #cd7f32 100%)', sh: '0 0 30px #cd7f32', an: 'championPulse 2.4s ease-in-out infinite' },
    // ── Icon skins ──────────────────────────────────────────────────────────
    icon_noah_brown:      { bg: 'radial-gradient(circle, #9a6033 0%, #6b4423 50%, #3a2010 100%)', sh: '0 0 18px #6b4423' },
    icon_keegan_baseball: { bg: 'radial-gradient(circle, #f5f5f5 0%, #e0e0d0 50%, #c8c8b0 100%)', sh: '0 0 14px #ddd' },
    icon_dpoe_fade:       { bg: 'linear-gradient(135deg, #ff69b4 0%, #ff9ec4 50%, #89cff0 100%)', sh: '0 0 22px #ff9ec4' },
    icon_evan_watermelon: { bg: 'radial-gradient(circle, #ff6b9d 0%, #ff4466 30%, #ff1744 50%, #4caf50 70%, #2e7d32 100%)', sh: '0 0 20px #ff4466' },
    icon_gavin_tzl:       { bg: 'linear-gradient(135deg, #dc143c 0%, #ffffff 50%, #0047ab 100%)', sh: '0 0 25px #0047ab' },
    icon_carter_cosmic:   { bg: 'radial-gradient(circle, #ff2020 0%, #cc0000 40%, #660000 70%, #1a0000 100%)', sh: '0 0 25px #cc0000' },
    icon_brody_flag:      { bg: 'repeating-linear-gradient(to bottom, #b22234 0px, #b22234 8%, #fff 8%, #fff 16%)', sh: '0 0 22px #3c3b6e' },
    icon_sterling:        { bg: 'radial-gradient(circle at 30% 30%, #0064ff 0%, #0050cc 30%, #003399 60%, #000000 100%)', sh: '0 0 25px #0064ff, 0 0 40px rgba(0,100,255,0.5)' },
    icon_profe_spain:     { bg: 'linear-gradient(to bottom, #c60b1e 0%, #c60b1e 25%, #ffc400 25%, #ffc400 75%, #c60b1e 75%, #c60b1e 100%)', sh: '0 0 25px #c60b1e, 0 0 40px rgba(255,196,0,0.6)' },
    icon_kayden_duck:     { bg: 'conic-gradient(from 20deg, #5a6b2a, #c4a265, #3d2b0e, #7a5c28, #5a6b2a)', sh: '0 0 18px rgba(90,107,42,0.7)' },
    icon_troy_puck:       { bg: 'radial-gradient(circle at 35% 35%, #3a3a3a 0%, #1a1a1a 50%, #050505 100%)', sh: '0 0 20px rgba(200,232,255,0.5)' },
    icon_justin_clover:   { bg: 'radial-gradient(circle, #39ff14 0%, #1a8c2e 40%, #0d5c1a 70%, #042b0a 100%)', sh: '0 0 25px #39ff14' },
    icon_the_creator:     { bg: 'conic-gradient(from 0deg, #ff0080, #00ffff, #8000ff, #ffff00, #ff0080)', sh: '0 0 45px white, 0 0 80px rgba(255,215,0,0.6)', an: 'quantumSpin 1.5s linear infinite' },
    // ── BP Season 1 ─────────────────────────────────────────────────────────
    bp1_striker:    { bg: 'radial-gradient(circle, #ff8050 0%, #ff6b35 50%, #883010 100%)', sh: '0 0 18px #ff6b35' },
    bp1_guardian:   { bg: 'radial-gradient(circle, #70ffee 0%, #4ecdc4 50%, #1a6060 100%)', sh: '0 0 18px #4ecdc4' },
    bp1_phantom:    { bg: 'radial-gradient(circle, #cc88ff 0%, #9b59b6 50%, #4a1a66 100%)', sh: '0 0 20px #9b59b6' },
    bp1_tempest:    { bg: 'radial-gradient(circle, #80aaff 0%, #3498db 50%, #103055 100%)', sh: '0 0 20px #3498db' },
    bp1_eclipse:    { bg: 'radial-gradient(circle, #404060 0%, #2c3e50 50%, #0d1520 100%)', sh: '0 0 18px #2c3e50' },
    bp1_sovereign:  { bg: 'radial-gradient(circle, #ffd060 0%, #f39c12 50%, #6a3a00 100%)', sh: '0 0 22px #f39c12', an: 'celestialGlow 3s ease-in-out infinite' },
    bp1_apex:       { bg: 'radial-gradient(circle, #ff8888 0%, #e74c3c 40%, #660000 100%)', sh: '0 0 28px #e74c3c', an: 'voidPulse 2s ease-in-out infinite' },
    // ── Achievement ─────────────────────────────────────────────────────────
    transcendence:  { bg: 'conic-gradient(from 0deg, #ff0080, #00ffff, #8000ff, #ffff00, #ff0080)', sh: '0 0 55px white, 0 0 90px rgba(255,255,255,0.6)', an: 'quantumSpin 2s linear infinite' },
    // ── Crate-exclusive (c_) skins ──────────────────────────────────────────
    c_static:     { bg: 'radial-gradient(circle, #c8c8dc 0%, #808090 60%, #404050 100%)', sh: '0 0 10px #b8b8cc' },
    c_rust:       { bg: 'radial-gradient(circle, #c06030 0%, #8b4513 55%, #4a2008 100%)', sh: '0 0 12px #8b4513' },
    c_slate:      { bg: 'radial-gradient(circle, #8090a0 0%, #607080 55%, #303840 100%)', sh: '0 0 10px #708090' },
    c_olive:      { bg: 'radial-gradient(circle, #9ab040 0%, #6b8e23 55%, #344010 100%)', sh: '0 0 12px #6b8e23' },
    c_maroon:     { bg: 'radial-gradient(circle, #cc3050 0%, #9b2335 55%, #4a0f1a 100%)', sh: '0 0 12px #9b2335' },
    c_cobalt:     { bg: 'radial-gradient(circle, #3080ff 0%, #0047ab 55%, #001a60 100%)', sh: '0 0 18px #3080ff' },
    c_teal:       { bg: 'radial-gradient(circle, #00c8b0 0%, #00897b 55%, #003830 100%)', sh: '0 0 18px #00c8b0' },
    c_coral:      { bg: 'radial-gradient(circle, #ff9080 0%, #ff6f61 55%, #a02010 100%)', sh: '0 0 18px #ff6f61' },
    c_sand:       { bg: 'radial-gradient(circle, #e0c870 0%, #c2a25a 55%, #6a5020 100%)', sh: '0 0 16px #c2a25a' },
    c_chrome:     { bg: 'linear-gradient(135deg, #666 0%, #ddd 25%, #999 50%, #fff 75%, #888 100%)', sh: '0 0 22px #ccc', an: 'quantumSpin 3s linear infinite' },
    c_prism:      { bg: 'conic-gradient(red,orange,yellow,green,cyan,blue,violet,red)', sh: '0 0 28px white', an: 'quantumSpin 2s linear infinite' },
    c_aurora:     { bg: 'linear-gradient(180deg, #00ff99 0%, #00aaff 40%, #9900cc 100%)', sh: '0 0 28px #00ff99', an: 'galaxyShimmer 2.5s ease-in-out infinite' },
    c_lava:       { bg: 'radial-gradient(circle, #ffcc00 0%, #ff4500 45%, #cc0000 75%, #440000 100%)', sh: '0 0 28px #ff4500', an: 'voidPulse 1.5s ease-in-out infinite' },
    c_storm:      { bg: 'radial-gradient(circle, #c0d8ff 0%, #4080ff 35%, #0020a0 65%, #000820 100%)', sh: '0 0 28px #4080ff', an: 'voidPulse 2s ease-in-out infinite' },
    c_neon:       { bg: 'linear-gradient(135deg, #ff00cc 0%, #00ffff 50%, #ff00cc 100%)', sh: '0 0 28px #ff00cc, 0 0 50px rgba(0,255,255,0.5)', an: 'quantumSpin 3s linear infinite' },
    c_glitch:     { bg: 'conic-gradient(#ff0080,#00ffff,#ff0000,#00ff00,#ff00ff,#0000ff,#ff0080)', sh: '0 0 35px #ff0080, 0 0 60px rgba(0,255,255,0.5)', an: 'quantumSpin 0.6s linear infinite' },
    c_nebula:     { bg: 'radial-gradient(circle at 40% 35%, #ff80cc 0%, #9922cc 35%, #220066 65%, #110033 100%)', sh: '0 0 35px #9922cc', an: 'galaxyShimmer 2s ease-in-out infinite' },
    c_biohazard:  { bg: 'radial-gradient(circle, #ccff00 0%, #39ff14 30%, #006600 65%, #001a00 100%)', sh: '0 0 35px #39ff14', an: 'voidPulse 1.2s ease-in-out infinite' },
    c_arctic:     { bg: 'radial-gradient(circle, #ffffff 0%, #aaeeff 25%, #00c8ff 55%, #004466 100%)', sh: '0 0 35px #00e5ff', an: 'galaxyShimmer 3s ease-in-out infinite' },
    c_wildfire:   { bg: 'radial-gradient(circle, #ffffff 0%, #ffff00 20%, #ff6600 50%, #cc0000 75%, #300000 100%)', sh: '0 0 35px #ff6600', an: 'voidPulse 0.9s ease-in-out infinite' },
    c_spectre:    { bg: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(180,180,255,0.8) 35%, rgba(80,80,200,0.5) 65%, rgba(20,20,80,0.3) 100%)', sh: '0 0 35px rgba(160,160,255,0.9)', an: 'voidPulse 2.5s ease-in-out infinite' },
    c_supernova:  { bg: 'conic-gradient(white,yellow,orange,red,magenta,blue,cyan,white)', sh: '0 0 45px white, 0 0 80px rgba(255,200,0,0.6)', an: 'quantumSpin 1.5s linear infinite' },
    c_wraith:     { bg: 'radial-gradient(circle, #8800ff 0%, #440088 30%, #1a0033 60%, #000000 100%)', sh: '0 0 45px #8800ff, 0 0 80px rgba(100,0,255,0.5)', an: 'voidPulse 2s ease-in-out infinite' },
    c_titan:      { bg: 'radial-gradient(circle, #ffe080 0%, #f5a623 30%, #b87333 60%, #3c1a00 100%)', sh: '0 0 45px #f5a623', an: 'celestialGlow 2.5s ease-in-out infinite' },
    c_astral:     { bg: 'linear-gradient(135deg, #00e5ff 0%, #7b2ff7 35%, #ff00aa 65%, #00e5ff 100%)', sh: '0 0 45px #7b2ff7', an: 'quantumSpin 4s linear infinite' },
    c_omnichrome: { bg: 'conic-gradient(red,orange,yellow,lime,cyan,blue,violet,magenta,red)', sh: '0 0 55px white, 0 0 90px rgba(255,255,255,0.7)', an: 'quantumSpin 0.7s linear infinite' },
    c_singularity:{ bg: 'conic-gradient(#ff0080,#00ffff,#8000ff,#ff0080)', sh: '0 0 55px #7700ff', an: 'quantumSpin 2s linear infinite', fi: 'brightness(0.3) contrast(3)' },
    c_ultraviolet:{ bg: 'radial-gradient(circle, #ff88ff 0%, #cc00ff 30%, #6600cc 60%, #200033 100%)', sh: '0 0 55px #cc00ff', an: 'voidPulse 1.5s ease-in-out infinite' },
    c_godmode:    { bg: 'radial-gradient(circle, #ffffff 0%, #fffdd0 20%, #fff59d 50%, #ffd700 80%, #fff 100%)', sh: '0 0 55px white, 0 0 90px rgba(255,215,0,0.8)', an: 'diamondShine 1.8s ease-in-out infinite' },
    c_rift:       { bg: 'linear-gradient(135deg, #000 0%, #1a0044 25%, #ff00aa 50%, #00ffff 75%, #000 100%)', sh: '0 0 55px #ff00aa', an: 'quantumSpin 2.5s linear infinite' },
    // ── Oblivion skins ──────────────────────────────────────────────────────
    ob_duskblade:   { bg: 'radial-gradient(circle, #9055ff 0%, #5a2d8c 40%, #1a0a2e 100%)', sh: '0 0 20px rgba(144,85,255,0.5)', an: 'voidPulse 2s ease-in-out infinite' },
    ob_voidborn:    { bg: 'radial-gradient(circle, #3355cc 0%, #1a2266 40%, #060618 100%)', sh: '0 0 20px rgba(51,85,204,0.5)', an: 'voidPulse 2.5s ease-in-out infinite' },
    ob_ashwalker:   { bg: 'radial-gradient(circle, #8a6040 0%, #4a3020 40%, #1a0f08 100%)', sh: '0 0 18px rgba(138,96,64,0.4)' },
    ob_soulreaper:  { bg: 'radial-gradient(circle, #ff3366 0%, #991133 35%, #330011 70%, #0a0003 100%)', sh: '0 0 25px rgba(255,51,102,0.6)', an: 'voidPulse 1.5s ease-in-out infinite' },
    ob_eclipsar:    { bg: 'radial-gradient(circle, #ffd700 0%, #664400 30%, #0d1133 60%, #000 100%)', sh: '0 0 25px rgba(255,215,0,0.4)', an: 'galaxyShimmer 3s ease-in-out infinite' },
    ob_phantomking: { bg: 'radial-gradient(circle, #bb88ff 0%, #6633aa 35%, #220055 70%, #0a0018 100%)', sh: '0 0 25px rgba(187,136,255,0.5)', an: 'voidPulse 2s ease-in-out infinite' },
    ob_abyssal:     { bg: 'radial-gradient(circle, #2244aa 0%, #0d1133 40%, #020208 100%)', sh: '0 0 30px rgba(34,68,170,0.5)', an: 'voidPulse 3s ease-in-out infinite' },
    ob_eventide:    { bg: 'conic-gradient(from 0deg, #1a0a2e, #2a1a4e, #3a2a6e, #2a1a4e, #1a0a2e)', sh: '0 0 30px rgba(100,60,160,0.4)', an: 'quantumSpin 5s linear infinite' },
    ob_worldeater:  { bg: 'radial-gradient(circle, #ff0000 0%, #660000 30%, #1a0000 60%, #000 100%)', sh: '0 0 35px rgba(255,0,0,0.7)', an: 'voidPulse 0.8s ease-in-out infinite' },
    ob_eternium:    { bg: 'conic-gradient(from 0deg, #ff2060, #8a2be2, #00ccff, #39ff14, #ffd700, #ff2060)', sh: '0 0 35px rgba(138,43,226,0.6)', an: 'quantumSpin 1.2s linear infinite' },
  };
  return S[skinId] || null;
}

// Renders a rich skin preview circle matching the look of the crates/skins tabs.
// mutation: optional mutation key (e.g. 'corrupted') to apply mutation visual effects.
function buildSkinPreview(skinInfo, rarity, className, mutation) {
  const skinId  = skinInfo?.id || '';
  const special = getSkinPreviewStyle(skinId);

  let bg, sh, an = '', fi = '';

  if (special) {
    bg = special.bg;
    sh = special.sh || 'none';
    if (special.an) an = `animation:${special.an};`;
    if (special.fi) fi = `filter:${special.fi};`;
  } else if (skinInfo?.color) {
    // Convert flat color to a radial gradient orb
    const c = skinInfo.color;
    bg = `radial-gradient(circle at 35% 35%, ${c}ee 0%, ${c} 55%, ${c}88 100%)`;
    sh = `0 0 16px ${c}80, 0 0 30px ${c}40`;
  } else {
    bg = rarity.color;
    sh = rarity.color + '60';
  }

  let extraClass = '';
  if (mutation && typeof MUTATION_CONFIG !== 'undefined' && MUTATION_CONFIG[mutation]) {
    const mc = MUTATION_CONFIG[mutation];
    extraClass = ` ${mc.cssClass}`;
    if (mc.cssFilter) fi = `filter:${mc.cssFilter};`;
    sh = (sh && sh !== 'none' ? sh + ', ' : '') + `0 0 20px ${mc.glowColor}`;
  }

  return `<div class="${className}${extraClass}" style="background:${bg};box-shadow:${sh};${an}${fi}"></div>`;
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