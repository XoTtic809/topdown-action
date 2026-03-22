// marketplace.js — Core marketplace logic, REST API (no Firestore)
// Coin-based P2P skin trading with 8% tax + 2% listing fee, atomic server-side transactions.
//
// Module boundaries:
//   marketplace.js     → all API calls, validation, state
//   marketplace-ui.js  → all DOM rendering and event handling
//   game.js            → provides: currentUser, isGuest, isAdmin,
//                        ownedSkins, activeSkin, playerCoins, SKINS, SKIN_RARITIES,
//                        saveSkins(), initShopUI(), battlePassData, calculateTrueLevel()

'use strict';

// ════════════════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════════════════

// Champion skins are achievement rewards — permanently blocked from trading.
// Hardcoded here as the first line of defence (server transaction is the second).
const CHAMPION_SKIN_IDS = new Set(['gold-champion', 'silver-champion', 'bronze-champion']);

// Timestamp of the v4.2.0 marketplace 7-day restriction update (Feb 18, 2026).
// Accounts created BEFORE this date get immediate access (legacy bypass).
// Accounts created AFTER must wait MIN_ACCOUNT_AGE_DAYS days.
const SHOP_UPDATE_TIMESTAMP_MS = new Date('2026-02-18T12:45:00Z').getTime();

// ════════════════════════════════════════════════════════════
//  CONFIGURATION
// ════════════════════════════════════════════════════════════

const MARKETPLACE_CONFIG = Object.freeze({
  TAX_RATE:                0.08,   // 8% of sale price is removed from economy
  LISTING_FEE_RATE:        0.02,   // 2% non-refundable listing fee (deducted at list time)
  MAX_LISTINGS_PER_PLAYER: 5,
  LISTING_EXPIRY_DAYS:     7,
  MIN_ACCOUNT_AGE_DAYS:    7,
  MIN_LEVEL:               15,
  SKIN_COOLDOWN_HOURS:     24,     // Must wait 24h after receiving a skin before re-listing
  REFRESH_COOLDOWN_MS:     30000,  // 30s between manual refreshes
  PAGE_SIZE:               20,
});

// Rarity tiers — price floor/ceiling enforced both client + server side.
// Icon skins come from a 1,000-coin crate so their trade range is 500–4,000.
const RARITY_PRICING = Object.freeze({
  common:    { floor: 100,   ceiling: 500,   label: 'Common',    color: '#78b7ff' },
  uncommon:  { floor: 200,   ceiling: 1000,  label: 'Uncommon',  color: '#a4d65e' },
  rare:      { floor: 500,   ceiling: 2000,  label: 'Rare',      color: '#ff78b7' },
  epic:      { floor: 2000,  ceiling: 8000,  label: 'Epic',      color: '#ff9d47' },
  legendary: { floor: 8000,  ceiling: 25000, label: 'Legendary', color: '#ffd700' },
  mythic:    { floor: 25000, ceiling: 100000,label: 'Mythic',    color: '#ff69ff' },
  icon:      { floor: 500,   ceiling: 4000,  label: 'Icon',      color: '#00e5ff' },
});

// ════════════════════════════════════════════════════════════
//  SKIN RARITY MAP
//  Built once at startup from the SKINS array and SKIN_RARITIES.
// ════════════════════════════════════════════════════════════

const MARKETPLACE_RARITY_MAP = {};
const NON_TRADEABLE_SKINS    = new Set();

function buildSkinRarityMap() {
  if (typeof SKINS === 'undefined') return;

  for (const skin of SKINS) {
    // price 0   = default skin  |  -1 = champion reward
    // price -3  = battle pass   |  -99 = achievement-only
    // icon_the_creator is a secret/dev skin — always non-tradeable
    // Champion skins are EXPLICITLY blocked regardless of price field.
    if (CHAMPION_SKIN_IDS.has(skin.id) ||
        skin.price === 0 || skin.price === -1 || skin.price === -3 || skin.price === -99 ||
        skin.id === 'icon_the_creator') {
      NON_TRADEABLE_SKINS.add(skin.id);
      continue;
    }

    // Icon skins: own 'icon' tier so they can be filtered separately
    if (skin.iconSkin) {
      MARKETPLACE_RARITY_MAP[skin.id] = 'icon';
      continue;
    }

    // Oblivion crate skins: map to marketplace tiers
    if (skin.crateOnly && skin.id.startsWith('ob_') && typeof OBLIVION_SKIN_RARITIES !== 'undefined') {
      for (const [obRarity, ids] of Object.entries(OBLIVION_SKIN_RARITIES)) {
        if (!ids.includes(skin.id)) continue;
        const obTierMap = {
          ob_epic: 'epic', ob_legendary: 'legendary',
          ob_mythic: 'mythic', ob_ultra: 'mythic',
        };
        const tier = obTierMap[obRarity];
        if (tier) MARKETPLACE_RARITY_MAP[skin.id] = tier;
        break;
      }
      continue;
    }

    // Crate-exclusive: map crate rarity bucket → marketplace tier
    if (skin.crateOnly && typeof SKIN_RARITIES !== 'undefined') {
      for (const [crateRarity, ids] of Object.entries(SKIN_RARITIES)) {
        if (!ids.includes(skin.id)) continue;
        const tierMap = {
          common: 'common', uncommon: 'common',
          rare: 'rare', epic: 'epic',
          legendary: 'legendary', mythic: 'mythic',
        };
        const tier = tierMap[crateRarity];
        if (tier) MARKETPLACE_RARITY_MAP[skin.id] = tier;
        break;
      }
      continue;
    }

    // Shop skins: derive marketplace tier from their coin price
    if (skin.price > 0) {
      if      (skin.price <= 500)   MARKETPLACE_RARITY_MAP[skin.id] = 'common';
      else if (skin.price <= 2000)  MARKETPLACE_RARITY_MAP[skin.id] = 'rare';
      else if (skin.price <= 8000)  MARKETPLACE_RARITY_MAP[skin.id] = 'epic';
      else if (skin.price <= 25000) MARKETPLACE_RARITY_MAP[skin.id] = 'legendary';
      else                          MARKETPLACE_RARITY_MAP[skin.id] = 'mythic';
    }
  }
}

function getSkinRarity(skinId) {
  const { baseSkinId } = typeof parseMutatedSkinId === 'function' ? parseMutatedSkinId(skinId) : { baseSkinId: skinId };
  return MARKETPLACE_RARITY_MAP[baseSkinId] || null;
}

function isSkinTradeable(skinId) {
  const { baseSkinId } = typeof parseMutatedSkinId === 'function' ? parseMutatedSkinId(skinId) : { baseSkinId: skinId };
  return !NON_TRADEABLE_SKINS.has(baseSkinId) && !!MARKETPLACE_RARITY_MAP[baseSkinId];
}

function getSkinInfo(skinId) {
  if (typeof SKINS === 'undefined') return null;
  const { baseSkinId } = typeof parseMutatedSkinId === 'function' ? parseMutatedSkinId(skinId) : { baseSkinId: skinId };
  return SKINS.find(s => s.id === baseSkinId) || null;
}

// Returns mutation-adjusted price limits for a skin.
function getMutatedPriceLimits(skinId) {
  const { mutation } = typeof parseMutatedSkinId === 'function' ? parseMutatedSkinId(skinId) : { mutation: null };
  const rarity = getSkinRarity(skinId);
  if (!rarity) return null;
  const base = RARITY_PRICING[rarity];
  if (!mutation || typeof MUTATION_CONFIG === 'undefined' || !MUTATION_CONFIG[mutation]) return base;
  const mult = MUTATION_CONFIG[mutation].priceMultiplier;
  return {
    floor:   Math.floor(base.floor   * mult),
    ceiling: Math.floor(base.ceiling * Math.min(mult, 3.0)),
    label:   `${base.label} [${MUTATION_CONFIG[mutation].label}]`,
    color:   MUTATION_CONFIG[mutation].color,
  };
}

// ════════════════════════════════════════════════════════════
//  MARKETPLACE STATE
//  Single source of truth for all marketplace data in memory.
//  Never trust this for security — always re-verify server-side.
// ════════════════════════════════════════════════════════════

const marketplaceState = {
  listings:          [],
  currentPage:       0,        // Page-based pagination (0 = nothing loaded yet)
  hasMore:           true,
  loading:           false,
  lastRefresh:       0,

  myListings:        [],

  currentFilter:     'all',        // 'all' | 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
  currentSort:       'price_asc',  // 'price_asc' | 'price_desc'

  // Eligibility data — populated from _applyUserData on login, refresh on forceRefresh
  accountCreatedAt:  null,
  skinReceivedTimes: {},
  isWhitelisted:     false,
  eligibilityLoaded: false,

  // Filter state
  priceMin:          null,
  priceMax:          null,
  showTrendingOnly:  false,
};

// ════════════════════════════════════════════════════════════
//  LISTING STATS CACHE  (price history, trending, supply/demand)
// ════════════════════════════════════════════════════════════

var _listingStatsCache = {};   // keyed by itemId

async function fetchListingStats(itemId) {
  if (_listingStatsCache[itemId]) return _listingStatsCache[itemId];
  try {
    const data = await apiGet(`/marketplace/stats/${encodeURIComponent(itemId)}`);
    _listingStatsCache[itemId] = data;
    return data;
  } catch (_) { return null; }
}

async function fetchPriceHistory(itemId, period = '7d') {
  try {
    return await apiGet(`/marketplace/history/${encodeURIComponent(itemId)}?period=${period}`);
  } catch (_) { return { prices: [] }; }
}

// ════════════════════════════════════════════════════════════
//  LISTING NORMALISATION  (snake_case DB rows → camelCase)
// ════════════════════════════════════════════════════════════

function _normalizeListing(row) {
  return {
    id:          row.id,
    sellerId:    row.seller_id,
    sellerName:  row.seller_name,
    skinId:      row.skin_id,
    skinName:    row.skin_name,
    rarity:      row.rarity,
    price:       row.price,
    listingType: row.listing_type || 'skin',
    crateId:     row.crate_id || null,
    expiresAt:   row.expires_at
      ? { seconds: Math.floor(new Date(row.expires_at).getTime() / 1000) }
      : null,
    createdAt:   row.created_at
      ? { seconds: Math.floor(new Date(row.created_at).getTime() / 1000) }
      : null,
  };
}

// ════════════════════════════════════════════════════════════
//  ELIGIBILITY
//  Client-side pre-checks only — the server is the final authority.
//  Admins and whitelisted players bypass age + level requirements.
// ════════════════════════════════════════════════════════════

function getPlayerLevel() {
  if (typeof battlePassData !== 'undefined' && typeof calculateTrueLevel === 'function') {
    return calculateTrueLevel(battlePassData.currentXP || 0);
  }
  return 0;
}

function getAccountAgeDays() {
  if (!marketplaceState.accountCreatedAt) return 0;
  const ts      = marketplaceState.accountCreatedAt;
  const created = ts.seconds ? ts.seconds * 1000 : new Date(ts).getTime();
  return (Date.now() - created) / 86400000;
}

// Loads account age, skin cooldowns, and whitelist status.
// On first call after login, data is already in state (set by _applyUserData).
// Pass forceRefresh=true to re-fetch fresh data from the server.
async function loadMarketplaceAccountData(forceRefresh = false) {
  if (!currentUser || isGuest) return;
  if (marketplaceState.eligibilityLoaded && !forceRefresh) return;

  try {
    const data = await apiGet('/auth/me');
    if (!data.error) {
      marketplaceState.accountCreatedAt  = data.createdAt         || null;
      marketplaceState.skinReceivedTimes = data.skinReceivedTimes || {};
      marketplaceState.isWhitelisted     = data.isWhitelisted     || false;
    }
  } catch (err) {
    console.error('[MP] loadMarketplaceAccountData failed:', err);
  } finally {
    marketplaceState.eligibilityLoaded = true;
  }
}

async function checkMarketplaceEligibility() {
  if (!currentUser || isGuest) {
    return { eligible: false, reason: 'You must be logged in to use the Marketplace.' };
  }

  if (typeof isAdmin !== 'undefined' && isAdmin) return { eligible: true };
  if (marketplaceState.isWhitelisted)             return { eligible: true };

  // Legacy account bypass: accounts that existed before the Marketplace
  // launched (before SHOP_UPDATE_TIMESTAMP_MS) skip the age requirement.
  const isLegacyAccount = marketplaceState.accountCreatedAt &&
    (() => {
      const ts = marketplaceState.accountCreatedAt;
      const created = ts.seconds ? ts.seconds * 1000 : new Date(ts).getTime();
      return created < SHOP_UPDATE_TIMESTAMP_MS;
    })();

  const ageDays = getAccountAgeDays();
  if (!isLegacyAccount && ageDays < MARKETPLACE_CONFIG.MIN_ACCOUNT_AGE_DAYS) {
    const left = Math.ceil(MARKETPLACE_CONFIG.MIN_ACCOUNT_AGE_DAYS - ageDays);
    return {
      eligible: false,
      reason: `Account must be at least 7 days old. ${left} day${left !== 1 ? 's' : ''} remaining.`,
    };
  }

  const level = getPlayerLevel();
  if (level < MARKETPLACE_CONFIG.MIN_LEVEL) {
    return {
      eligible: false,
      reason: `Level ${MARKETPLACE_CONFIG.MIN_LEVEL}+ required. You are Level ${level}.`,
    };
  }

  return { eligible: true };
}

// Returns a human-readable error if this skin cannot currently be listed, or null if it's fine.
function getSkinListingBlockReason(skinId) {
  if (!isSkinTradeable(skinId))     return 'This skin cannot be traded.';
  if (!ownedSkins.includes(skinId)) return 'You do not own this skin.';
  if (activeSkin === skinId)        return 'Unequip this skin before listing it.';

  if (marketplaceState.myListings.some(l => l.skinId === skinId)) {
    return 'This skin is already listed.';
  }

  const receivedAt = marketplaceState.skinReceivedTimes[skinId];
  if (receivedAt) {
    // Handle all timestamp formats: Firestore {seconds}, number (ms), or ISO string
    let ms;
    if (typeof receivedAt === 'object' && receivedAt !== null && receivedAt.seconds) {
      ms = receivedAt.seconds * 1000;
    } else if (typeof receivedAt === 'number') {
      ms = receivedAt;
    } else {
      ms = new Date(receivedAt).getTime();
    }
    const hoursAgo = (Date.now() - ms) / 3600000;
    if (hoursAgo < MARKETPLACE_CONFIG.SKIN_COOLDOWN_HOURS) {
      const remaining = Math.ceil(MARKETPLACE_CONFIG.SKIN_COOLDOWN_HOURS - hoursAgo);
      return `Trade cooldown: ${remaining}h remaining on this skin.`;
    }
  }

  return null;
}

// ════════════════════════════════════════════════════════════
//  REST API QUERIES
// ════════════════════════════════════════════════════════════

// Fetch the next page of public listings.
// reset=true starts from the beginning (used on manual refresh).
async function fetchMarketplaceListings(reset = false) {
  if (marketplaceState.loading) return { status: 'busy' };

  const now = Date.now();
  if (!reset && (now - marketplaceState.lastRefresh) < MARKETPLACE_CONFIG.REFRESH_COOLDOWN_MS) {
    const remaining = Math.ceil(
      (MARKETPLACE_CONFIG.REFRESH_COOLDOWN_MS - (now - marketplaceState.lastRefresh)) / 1000
    );
    return { status: 'cooldown', remaining };
  }

  if (reset) {
    marketplaceState.listings    = [];
    marketplaceState.currentPage = 0;
    marketplaceState.hasMore     = true;
  }

  if (!marketplaceState.hasMore) return { status: 'done' };

  marketplaceState.loading = true;

  try {
    const nextPage = marketplaceState.currentPage + 1;
    const typeParam = marketplaceState.currentFilter === 'crate' ? '&type=crate' : '';
    const data = await apiGet(`/marketplace/listings?page=${nextPage}${typeParam}`);

    if (data.error) {
      return { status: 'error', error: data.error };
    }

    const normalized = (data.listings || []).map(_normalizeListing);
    marketplaceState.listings.push(...normalized);
    marketplaceState.currentPage = nextPage;
    marketplaceState.hasMore     = data.hasMore === true;

    marketplaceState.lastRefresh = Date.now();
    return { status: 'ok' };
  } catch (err) {
    console.error('[MP] fetchMarketplaceListings failed:', err);
    return { status: 'error', error: err.message };
  } finally {
    marketplaceState.loading = false;
  }
}

// Fetch this player's own active listings for the My Listings panel.
async function fetchMyListings() {
  if (!currentUser || isGuest) return;
  try {
    const data = await apiGet('/marketplace/my-listings');
    if (!data.error) {
      marketplaceState.myListings = (data.listings || []).map(_normalizeListing);
    }
  } catch (err) {
    console.error('[MP] fetchMyListings failed:', err);
  }
}

// ════════════════════════════════════════════════════════════
//  CREATE LISTING
//
//  1. Client-side pre-checks (fast UX feedback)
//  2. POST /api/marketplace/list — server runs the atomic transaction:
//       a. Verify ownership + eligibility
//       b. Remove skin from inventory
//       c. Create listing row
// ════════════════════════════════════════════════════════════

async function createListing(skinId, price) {
  if (!currentUser || isGuest) return { success: false, error: 'Must be logged in.' };

  const eligibility = await checkMarketplaceEligibility();
  if (!eligibility.eligible) return { success: false, error: eligibility.reason };

  const blockReason = getSkinListingBlockReason(skinId);
  if (blockReason) return { success: false, error: blockReason };

  const rarity = getSkinRarity(skinId);
  if (!rarity) return { success: false, error: 'Unknown skin rarity.' };

  price = Math.floor(price);
  const limits = getMutatedPriceLimits(skinId);
  if (price < limits.floor || price > limits.ceiling) {
    return {
      success: false,
      error: `${limits.label} skins: ${limits.floor.toLocaleString()}–${limits.ceiling.toLocaleString()} coins.`,
    };
  }

  if (marketplaceState.myListings.length >= MARKETPLACE_CONFIG.MAX_LISTINGS_PER_PLAYER) {
    return { success: false, error: `Maximum ${MARKETPLACE_CONFIG.MAX_LISTINGS_PER_PLAYER} active listings.` };
  }

  const skinInfo = getSkinInfo(skinId);
  const { mutation } = typeof parseMutatedSkinId === 'function' ? parseMutatedSkinId(skinId) : { mutation: null };
  const mutLabel = mutation && typeof MUTATION_CONFIG !== 'undefined' && MUTATION_CONFIG[mutation]
    ? ` [${MUTATION_CONFIG[mutation].label}]` : '';
  const displayName = skinInfo ? `${skinInfo.name}${mutLabel}` : skinId;

  try {
    const result = await apiPost('/marketplace/list', {
      skinId,
      skinName: displayName,
      rarity,
      price,
    });

    if (result.error) return { success: false, error: result.error };

    // Sync local inventory after successful listing
    ownedSkins = ownedSkins.filter(s => s !== skinId);
    if (typeof saveSkins  === 'function') saveSkins();
    if (typeof initShopUI === 'function') initShopUI();

    await fetchMyListings();
    return { success: true };

  } catch (err) {
    console.error('[MP] createListing failed:', err);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  CREATE CRATE LISTING
// ════════════════════════════════════════════════════════════

const CRATE_PRICING_CLIENT = {
  'common-crate':    { floor: 200,  ceiling: 600,    name: 'Common Crate'    },
  'rare-crate':      { floor: 500,  ceiling: 1200,   name: 'Rare Crate'      },
  'epic-crate':      { floor: 1000, ceiling: 2500,   name: 'Epic Crate'      },
  'legendary-crate': { floor: 3000, ceiling: 8000,   name: 'Legendary Crate' },
  'icon-crate':      { floor: 500,  ceiling: 1200,   name: 'Icon Crate'      },
  'oblivion-crate':  { floor: 8000, ceiling: 20000,  name: 'Oblivion Crate'  },
};

async function createCrateListing(crateId, price) {
  if (!currentUser || isGuest) return { success: false, error: 'Must be logged in.' };

  const eligibility = await checkMarketplaceEligibility();
  if (!eligibility.eligible) return { success: false, error: eligibility.reason };

  const limits = CRATE_PRICING_CLIENT[crateId];
  if (!limits) return { success: false, error: 'Invalid crate type.' };

  price = Math.floor(price);
  if (price < limits.floor || price > limits.ceiling) {
    return {
      success: false,
      error: `${limits.name}: ${limits.floor.toLocaleString()}–${limits.ceiling.toLocaleString()} coins.`,
    };
  }

  if (marketplaceState.myListings.length >= MARKETPLACE_CONFIG.MAX_LISTINGS_PER_PLAYER) {
    return { success: false, error: `Maximum ${MARKETPLACE_CONFIG.MAX_LISTINGS_PER_PLAYER} active listings.` };
  }

  try {
    const result = await apiPost('/marketplace/list', {
      listingType: 'crate',
      crateId,
      price,
    });

    if (result.error) return { success: false, error: result.error };

    // Remove crate from local cache
    if (typeof ownedCratesCache !== 'undefined') {
      const idx = ownedCratesCache.indexOf(crateId);
      if (idx !== -1) ownedCratesCache.splice(idx, 1);
      if (typeof renderCrateInventorySection === 'function') renderCrateInventorySection();
    }

    await fetchMyListings();
    return { success: true };

  } catch (err) {
    console.error('[MP] createCrateListing failed:', err);
    return { success: false, error: err.message };
  }
}

// Opens a price-input dialog for listing a crate on the marketplace.
// Called from the crate inventory "SELL" button.
async function openMarketplaceCrateListingFlow(crateId) {
  const limits = CRATE_PRICING_CLIENT[crateId];
  if (!limits) return;

  // Remove any existing dialog
  const existing = document.getElementById('crateListingOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'crateListingOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.75);
    display:flex;align-items:center;justify-content:center;
    z-index:10000;backdrop-filter:blur(4px);
  `;

  const crate = typeof CRATES !== 'undefined' ? CRATES.find(c => c.id === crateId) : null;
  const crateName = limits.name;
  const crateIcon = crate ? crate.icon : '📦';

  const box = document.createElement('div');
  box.style.cssText = `
    background:linear-gradient(135deg,#0d1525 0%,#0a0f1e 100%);
    border:1px solid rgba(255,167,38,0.4);
    border-radius:16px;padding:28px 32px;text-align:center;
    max-width:340px;width:90%;
    box-shadow:0 0 40px rgba(255,167,38,0.15);
    font-family:'Orbitron',sans-serif;
  `;

  box.innerHTML = `
    <div style="font-size:32px;margin-bottom:10px">${crateIcon}</div>
    <div style="font-size:14px;font-weight:700;color:#dbe7ff;letter-spacing:1px;margin-bottom:6px">
      List ${crateName}
    </div>
    <div style="font-size:11px;color:rgba(219,231,255,0.55);margin-bottom:4px">
      Price range: ${limits.floor.toLocaleString()} – ${limits.ceiling.toLocaleString()} coins
    </div>
    <div id="crateListingMarketHint" style="font-size:11px;color:#4a9eff;margin-bottom:10px;min-height:14px;"></div>
    <div style="margin-bottom:16px">
      <input type="number" id="crateListingPrice" min="${limits.floor}" max="${limits.ceiling}"
        value="${limits.floor}" style="
        background:rgba(255,255,255,0.06);border:1px solid rgba(255,167,38,0.3);
        color:#dbe7ff;padding:10px 14px;border-radius:8px;width:120px;
        font-family:'Orbitron',sans-serif;font-size:13px;text-align:center;
      "/>
    </div>
    <div id="crateListingPriceWarn" style="font-size:10px;color:#f39c12;margin-bottom:8px;min-height:12px;"></div>
    <div style="font-size:10px;color:rgba(219,231,255,0.4);margin-bottom:14px">
      2% listing fee deducted on list
    </div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button id="crateListConfirm" style="
        background:rgba(255,167,38,0.15);border:1px solid #ffa726;
        color:#ffa726;padding:9px 28px;border-radius:8px;cursor:pointer;
        font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;
      ">LIST</button>
      <button id="crateListCancel" style="
        background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);
        color:rgba(219,231,255,0.55);padding:9px 28px;border-radius:8px;cursor:pointer;
        font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;
      ">CANCEL</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  // Async: fetch market stats and prefill suggested price
  let _crateSuggestedPrice = null;
  fetchListingStats(crateId).then(stats => {
    if (!stats || !stats.suggestedPrice) return;
    _crateSuggestedPrice = stats.suggestedPrice;
    const priceInput = document.getElementById('crateListingPrice');
    const hintEl     = document.getElementById('crateListingMarketHint');
    if (priceInput) {
      const clamped = Math.max(limits.floor, Math.min(limits.ceiling, stats.suggestedPrice));
      priceInput.value = clamped;
    }
    if (hintEl) hintEl.textContent = `Market avg: 💰 ${stats.suggestedPrice.toLocaleString()} (7d)`;
  });

  // Live price warning
  const priceInputEl = document.getElementById('crateListingPrice');
  const warnEl       = document.getElementById('crateListingPriceWarn');
  if (priceInputEl) {
    priceInputEl.addEventListener('input', () => {
      if (!_crateSuggestedPrice || !warnEl) return;
      const p = parseInt(priceInputEl.value) || 0;
      warnEl.textContent = p < _crateSuggestedPrice * 0.70
        ? `⚠ Price is ${Math.round((1 - p / _crateSuggestedPrice) * 100)}% below market average`
        : '';
    });
  }

  document.getElementById('crateListConfirm').onclick = async () => {
    const price = parseInt(document.getElementById('crateListingPrice').value);
    if (isNaN(price)) return;

    const result = await createCrateListing(crateId, price);
    close();

    if (result.success) {
      if (typeof showCrateMessage === 'function') showCrateMessage(`${crateName} listed for ${price.toLocaleString()} coins!`);
    } else {
      if (typeof showCrateMessage === 'function') showCrateMessage(result.error || 'Failed to list crate', true);
    }
  };

  document.getElementById('crateListCancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

// ════════════════════════════════════════════════════════════
//  CANCEL LISTING
//  Returns the skin to the seller atomically.
// ════════════════════════════════════════════════════════════

async function cancelListing(listingId) {
  if (!currentUser || isGuest) return { success: false, error: 'Must be logged in.' };

  const localListing = marketplaceState.myListings.find(l => l.id === listingId);

  try {
    const result = await apiPost('/marketplace/cancel', { listingId });

    if (result.error) return { success: false, error: result.error };

    if (result.listingType === 'crate' || localListing?.listingType === 'crate') {
      // Crate was returned — refresh crate inventory cache
      const crateId = result.crateId || localListing?.crateId;
      if (crateId && typeof ownedCratesCache !== 'undefined') {
        ownedCratesCache.push(crateId);
        if (typeof renderCrateInventorySection === 'function') renderCrateInventorySection();
      }
    } else {
      const returnedSkinId = result.skinId || localListing?.skinId;
      if (returnedSkinId && !ownedSkins.includes(returnedSkinId)) ownedSkins.push(returnedSkinId);
      if (typeof saveSkins  === 'function') saveSkins();
    }
    if (typeof initShopUI === 'function') initShopUI();

    await fetchMyListings();
    return { success: true, skinId: result.skinId };

  } catch (err) {
    console.error('[MP] cancelListing failed:', err);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  BUY LISTING — THE CRITICAL SECURITY PATH
//
//  The server runs the full atomic transaction.
//  The client just calls POST /api/marketplace/buy and syncs
//  local state from the server's response.
// ════════════════════════════════════════════════════════════

async function buyListing(listingId) {
  if (!currentUser || isGuest) return { success: false, error: 'Must be logged in.' };

  const eligibility = await checkMarketplaceEligibility();
  if (!eligibility.eligible) return { success: false, error: eligibility.reason };

  try {
    const result = await apiPost('/marketplace/buy', { listingId });

    if (result.error) return { success: false, error: result.error };

    // Sync local state from authoritative server response
    playerCoins = result.newBuyerBalance;

    // Check if this was a crate listing by looking at the listing we just bought
    const boughtListing = marketplaceState.listings.find(l => l.id === listingId);
    if (boughtListing && boughtListing.listingType === 'crate') {
      // Crate purchase — add to crate inventory cache
      if (typeof ownedCratesCache !== 'undefined' && boughtListing.crateId) {
        ownedCratesCache.push(boughtListing.crateId);
        if (typeof renderCrateInventorySection === 'function') renderCrateInventorySection();
      }
    } else {
      // Skin purchase
      if (!ownedSkins.includes(result.skinId)) ownedSkins.push(result.skinId);
      marketplaceState.skinReceivedTimes[result.skinId] = { seconds: Math.floor(Date.now() / 1000) };
    }

    if (typeof initShopUI === 'function') initShopUI();

    return {
      success:  true,
      skinId:   result.skinId,
      skinName: result.skinName,
      price:    result.price,
      tax:      result.tax,
    };

  } catch (err) {
    console.error('[MP] buyListing failed:', err);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  FILTERING & SORTING (client-side on fetched data)
// ════════════════════════════════════════════════════════════

function getFilteredListings() {
  const now = Date.now();

  let filtered = marketplaceState.listings.filter(l => {
    if (currentUser && l.sellerId === currentUser.uid) return false;
    const expMs = l.expiresAt?.seconds ? l.expiresAt.seconds * 1000 : 0;
    return expMs > now;
  });

  if (marketplaceState.currentFilter === 'crate') {
    filtered = filtered.filter(l => l.listingType === 'crate');
  } else if (marketplaceState.currentFilter !== 'all') {
    filtered = filtered.filter(l => l.rarity === marketplaceState.currentFilter && l.listingType !== 'crate');
  }

  // Price range filter
  if (marketplaceState.priceMin != null) {
    filtered = filtered.filter(l => l.price >= marketplaceState.priceMin);
  }
  if (marketplaceState.priceMax != null) {
    filtered = filtered.filter(l => l.price <= marketplaceState.priceMax);
  }

  // Trending filter — uses cached stats
  if (marketplaceState.showTrendingOnly && typeof _listingStatsCache !== 'undefined') {
    filtered = filtered.filter(l => {
      const itemId = l.listingType === 'crate' ? l.crateId : (l.skinId || '').split('__')[0];
      const stats  = _listingStatsCache[itemId];
      if (!stats || !stats.avgPrice24h || !stats.avgPrice7d || stats.avgPrice7d === 0) return false;
      const ratio = stats.avgPrice24h / stats.avgPrice7d;
      return ratio >= 1.05 || ratio <= 0.95;
    });
  }

  switch (marketplaceState.currentSort) {
    case 'price_asc':  filtered.sort((a, b) => a.price - b.price); break;
    case 'price_desc': filtered.sort((a, b) => b.price - a.price); break;
  }

  return filtered;
}

// ════════════════════════════════════════════════════════════
//  WHITELIST HELPER  (admin-only usage)
// ════════════════════════════════════════════════════════════

async function isMarketplaceWhitelisted(userId) {
  try {
    const rows = await apiGet('/users/admin/whitelist');
    if (!Array.isArray(rows)) return false;
    return rows.some(r => r.uid === userId);
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════
//  ADMIN FUNCTIONS
// ════════════════════════════════════════════════════════════

async function adminMpWhitelistUser() {
  if (!isAdmin) return;
  const userId = document.getElementById('mpWhitelistUserId')?.value.trim();
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  try {
    const result = await apiPost('/users/admin/whitelist/add', { targetUid: userId });
    if (result.error) { showAdminMessage('Error: ' + result.error, true); return; }
    document.getElementById('mpWhitelistUserId').value = '';
    showAdminMessage(`${userId.substring(0, 12)}... whitelisted`);
    adminMpLoadWhitelist();
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminMpUnwhitelistUser() {
  if (!isAdmin) return;
  const userId = document.getElementById('mpUnwhitelistUserId')?.value.trim();
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  try {
    const result = await apiPost('/users/admin/whitelist/remove', { targetUid: userId });
    if (result.error) { showAdminMessage('Error: ' + result.error, true); return; }
    document.getElementById('mpUnwhitelistUserId').value = '';
    showAdminMessage(`${userId.substring(0, 12)}... removed from whitelist`);
    adminMpLoadWhitelist();
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminMpLoadWhitelist() {
  if (!isAdmin) return;
  const listEl = document.getElementById('mpWhitelistedList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  try {
    const rows = await apiGet('/users/admin/whitelist');
    if (rows.error) { listEl.innerHTML = '<div class="loading-spinner">Error: ' + rows.error + '</div>'; return; }
    if (!rows.length) { listEl.innerHTML = '<div class="loading-spinner">No whitelisted users</div>'; return; }
    listEl.innerHTML = '';
    rows.forEach(row => {
      const time = row.whitelisted_at
        ? new Date(row.whitelisted_at).toLocaleDateString()
        : 'N/A';
      const el = document.createElement('div');
      el.className = 'admin-log-entry';
      el.innerHTML = `
        <div class="admin-log-action" style="font-family:monospace;font-size:11px;">${row.uid}</div>
        <div class="admin-log-meta">Added: ${time}${row.username ? ' · ' + row.username : ''}</div>
      `;
      listEl.appendChild(el);
    });
  } catch (err) {
    listEl.innerHTML = '<div class="loading-spinner">Error: ' + err.message + '</div>';
  }
}

async function adminMpLoadListings() {
  if (!isAdmin) return;
  const listEl = document.getElementById('mpAdminListings');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  try {
    const rows = await apiGet('/marketplace/admin/listings');
    if (rows.error) { listEl.innerHTML = '<div class="loading-spinner">Error: ' + rows.error + '</div>'; return; }
    if (!rows.length) { listEl.innerHTML = '<div class="loading-spinner">No listings</div>'; return; }
    listEl.innerHTML = '';
    rows.forEach(row => {
      const expired = row.expires_at && new Date(row.expires_at) < new Date();
      const created = row.created_at ? new Date(row.created_at).toLocaleString() : 'N/A';
      const el      = document.createElement('div');
      el.className  = 'admin-score-entry';
      el.style.borderColor = expired ? 'rgba(255,71,87,0.3)' : 'rgba(88,166,255,0.12)';
      el.innerHTML = `
        <div class="admin-score-info" style="flex:1;">
          <div class="admin-score-name">
            ${row.skin_name || row.skin_id}
            ${expired ? '<span style="color:var(--danger)"> (EXPIRED)</span>' : ''}
          </div>
          <div class="admin-score-val">🪙 ${(row.price||0).toLocaleString()} · ${row.rarity} · ${row.seller_name||'?'}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px;">
            ${String(row.id).substring(0, 12)}... · Seller: ${row.seller_id?.substring(0,8)}... · ${created}
          </div>
        </div>
        <button class="admin-action-btn delete"
                onclick="adminMpRemoveListing('${row.id}')">🗑️</button>
      `;
      listEl.appendChild(el);
    });
  } catch (err) {
    listEl.innerHTML = '<div class="loading-spinner">Error: ' + err.message + '</div>';
  }
}

async function adminMpRemoveListing(listingId) {
  if (!isAdmin) return;
  if (!confirm(`Remove listing ${String(listingId).substring(0, 12)}...?\nSkin will be returned to seller.`)) return;
  try {
    const result = await apiDelete(`/marketplace/admin/listings/${listingId}`);
    if (result.error) { showAdminMessage('Error: ' + result.error, true); return; }
    showAdminMessage('Listing removed, skin returned.');
    adminMpLoadListings();
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminMpRemoveExpired() {
  if (!isAdmin) return;
  if (!confirm('Remove all expired listings and return skins to sellers?')) return;
  try {
    const result = await apiPost('/marketplace/admin/purge-expired', {});
    if (result.error) { showAdminMessage('Error: ' + result.error, true); return; }
    const n = result.purged || 0;
    showAdminMessage(`Purged ${n} expired listing${n !== 1 ? 's' : ''}.`);
    adminMpLoadListings();
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminMpRemoveAll() {
  if (!isAdmin) return;
  if (!confirm('⚠️ Remove ALL marketplace listings? All skins will be returned.')) return;
  if (!confirm('This cannot be undone. Continue?')) return;
  try {
    const rows = await apiGet('/marketplace/admin/listings');
    if (rows.error) { showAdminMessage('Error: ' + rows.error, true); return; }
    let removed = 0;
    for (const row of rows) {
      try {
        const result = await apiDelete(`/marketplace/admin/listings/${row.id}`);
        if (!result.error) removed++;
      } catch (e) { console.error('[MP Admin] Remove all failed for', row.id, e); }
    }
    showAdminMessage(`Removed all ${removed} listing${removed !== 1 ? 's' : ''}.`);
    adminMpLoadListings();
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminMpLoadTrades() {
  if (!isAdmin) return;
  const listEl = document.getElementById('mpAdminTrades');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  try {
    const rows = await apiGet('/marketplace/admin/trades');
    if (rows.error) { listEl.innerHTML = '<div class="loading-spinner">Error: ' + rows.error + '</div>'; return; }
    if (!rows.length) { listEl.innerHTML = '<div class="loading-spinner">No trades yet</div>'; return; }
    listEl.innerHTML = '';
    rows.forEach(row => {
      const time = row.timestamp ? new Date(row.timestamp).toLocaleString() : 'N/A';
      const el   = document.createElement('div');
      el.className = 'admin-log-entry';
      el.innerHTML = `
        <div class="admin-log-action">
          <strong style="color:var(--gold);">${row.skin_name || row.skin_id}</strong>
          <span style="color:var(--muted);"> · ${row.rarity || '?'} · </span>
          🪙 ${(row.price || 0).toLocaleString()}
          <span style="color:var(--danger);"> (−${(row.tax || 0).toLocaleString()} tax)</span>
        </div>
        <div class="admin-log-meta">${row.buyer_name || '?'} ← ${row.seller_name || '?'} · ${time}</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.2);margin-top:2px;">
          Buyer: ${row.buyer_id?.substring(0,8)}... · Seller: ${row.seller_id?.substring(0,8)}...
        </div>
      `;
      listEl.appendChild(el);
    });
  } catch (err) {
    listEl.innerHTML = '<div class="loading-spinner">Error: ' + err.message + '</div>';
  }
}

async function adminMpLoadEconomyStats() {
  if (!isAdmin) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('mpStatActiveListings', '…'); set('mpStatTotalTrades', '…');
  set('mpStatTotalVolume', '…');    set('mpStatTotalTax', '…');
  try {
    const stats = await apiGet('/marketplace/admin/stats');
    if (stats.error) { showAdminMessage('Stats error: ' + stats.error, true); return; }
    set('mpStatActiveListings', stats.activeListings);
    set('mpStatTotalTrades',    stats.totalTrades);
    set('mpStatTotalVolume',    (stats.totalVolume || 0).toLocaleString());
    set('mpStatTotalTax',       (stats.totalTax    || 0).toLocaleString());
  } catch (err) { showAdminMessage('Stats error: ' + err.message, true); }
}

async function adminMpGrantSkin() {
  if (!isAdmin) return;
  const userId = document.getElementById('mpGrantUserId')?.value.trim();
  const skinId = document.getElementById('mpGrantSkinSelect')?.value;
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  if (!skinId) { showAdminMessage('Select a skin', true);   return; }
  try {
    const result = await apiPost('/users/admin/grant-skin', { targetUid: userId, skinId });
    if (result.error) { showAdminMessage('Error: ' + result.error, true); return; }
    showAdminMessage(`Granted "${getSkinInfo(skinId)?.name || skinId}" to ${userId.substring(0, 12)}...`);
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminMpGrantCoins() {
  if (!isAdmin) return;
  const userId = document.getElementById('mpGrantCoinsUserId')?.value.trim();
  const amount = parseInt(document.getElementById('mpGrantCoinsAmount')?.value) || 0;
  if (!userId)                        { showAdminMessage('Enter a User ID', true);  return; }
  if (amount <= 0 || amount > 100000) { showAdminMessage('Amount: 1–100,000', true); return; }
  try {
    const result = await apiPost('/users/admin/grant-coins', { targetUid: userId, amount });
    if (result.error) { showAdminMessage('Error: ' + result.error, true); return; }
    showAdminMessage(`Granted ${amount.toLocaleString()} coins to ${userId.substring(0,12)}...`);
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminMpResetCooldowns() {
  if (!isAdmin) return;
  const userId = document.getElementById('mpResetCooldownUserId')?.value.trim();
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  try {
    const result = await apiPost('/users/admin/reset-cooldowns', { targetUid: userId });
    if (result.error) { showAdminMessage('Error: ' + result.error, true); return; }
    showAdminMessage(`Cooldowns reset for ${userId.substring(0, 12)}...`);
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

function adminMpInitSkinDropdown() {
  const select = document.getElementById('mpGrantSkinSelect');
  if (!select || select.options.length > 1 || typeof SKINS === 'undefined') return;
  select.innerHTML = '<option value="">-- Select skin --</option>';
  for (const skin of SKINS) {
    if (!isSkinTradeable(skin.id)) continue;
    const rarityInfo = RARITY_PRICING[getSkinRarity(skin.id)];
    if (!rarityInfo) continue;
    const opt = document.createElement('option');
    opt.value       = skin.id;
    opt.textContent = `${skin.name} (${rarityInfo.label})`;
    select.appendChild(opt);
  }
}

// ════════════════════════════════════════════════════════════
//  INITIALIZE
// ════════════════════════════════════════════════════════════

if (typeof SKINS !== 'undefined') {
  buildSkinRarityMap();
} else {
  window.addEventListener('load', buildSkinRarityMap);
}

// Called by api-auth.js onAuthStateChanged whenever the user changes.
// Clears all cached eligibility and listing data so the next marketplace
// open fetches fresh data. Without this, user B inherits user A's state.
function resetMarketplaceState() {
  marketplaceState.listings          = [];
  marketplaceState.myListings        = [];
  marketplaceState.currentPage       = 0;
  marketplaceState.hasMore           = true;
  marketplaceState.loading           = false;
  marketplaceState.lastRefresh       = 0;
  marketplaceState.accountCreatedAt  = null;
  marketplaceState.skinReceivedTimes = {};
  marketplaceState.isWhitelisted     = false;
  marketplaceState.eligibilityLoaded = false;
}

console.log('🏪 Marketplace module loaded');
