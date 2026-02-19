// marketplace.js — Core marketplace logic, Firestore transactions, anti-abuse
// Coin-based P2P skin trading with 10% tax, atomic transactions, rarity pricing
//
// Module boundaries:
//   marketplace.js     → all Firestore reads/writes, validation, state
//   marketplace-ui.js  → all DOM rendering and event handling
//   game.js            → provides: db, auth, currentUser, isGuest, isAdmin,
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
  TAX_RATE:                0.10,   // 10% of sale price is removed from economy
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
    // price 0  = default skin  |  -1 = champion reward
    // price -3 = battle pass
    // icon_the_creator is a secret/dev skin — always non-tradeable
    // Champion skins are EXPLICITLY blocked regardless of price field.
    // This is belt-and-suspenders: even if someone edits the SKINS array
    // price to something non -1, champion skins still can't be traded.
    if (CHAMPION_SKIN_IDS.has(skin.id) ||
        skin.price === 0 || skin.price === -1 || skin.price === -3 ||
        skin.id === 'icon_the_creator') {
      NON_TRADEABLE_SKINS.add(skin.id);
      continue;
    }

    // Icon skins: own 'icon' tier so they can be filtered separately in the marketplace
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
  return MARKETPLACE_RARITY_MAP[skinId] || null;
}

function isSkinTradeable(skinId) {
  return !NON_TRADEABLE_SKINS.has(skinId) && !!MARKETPLACE_RARITY_MAP[skinId];
}

function getSkinInfo(skinId) {
  if (typeof SKINS === 'undefined') return null;
  return SKINS.find(s => s.id === skinId) || null;
}

// ════════════════════════════════════════════════════════════
//  MARKETPLACE STATE
//  Single source of truth for all marketplace data in memory.
//  Never trust this for security — always re-verify in Firestore.
// ════════════════════════════════════════════════════════════

const marketplaceState = {
  listings:          [],
  lastDoc:           null,         // Pagination cursor
  hasMore:           true,
  loading:           false,
  lastRefresh:       0,

  myListings:        [],

  currentFilter:     'all',        // 'all' | 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
  currentSort:       'price_asc',  // 'price_asc' | 'price_desc'

  // Eligibility data — loaded once when marketplace opens, refreshed on login
  accountCreatedAt:  null,
  skinReceivedTimes: {},
  isWhitelisted:     false,
  eligibilityLoaded: false,
};

// ════════════════════════════════════════════════════════════
//  ELIGIBILITY
//  Client-side pre-checks only — the transaction is the final authority.
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

// Loads account age, skin cooldowns, and whitelist status in two Firestore reads.
// Called once when the marketplace tab opens; cached until forceRefresh=true.
async function loadMarketplaceAccountData(forceRefresh = false) {
  if (!currentUser || isGuest) return;
  if (marketplaceState.eligibilityLoaded && !forceRefresh) return;

  try {
    const [userDoc, whitelistDoc] = await Promise.all([
      db.collection('users').doc(currentUser.uid).get(),
      db.collection('marketplaceWhitelist').doc(currentUser.uid).get(),
    ]);

    if (userDoc.exists) {
      const data = userDoc.data();
      marketplaceState.accountCreatedAt  = data.createdAt         || null;
      marketplaceState.skinReceivedTimes = data.skinReceivedTimes || {};
    }

    marketplaceState.isWhitelisted    = whitelistDoc.exists;
    marketplaceState.eligibilityLoaded = true;
  } catch (err) {
    console.error('[MP] loadMarketplaceAccountData failed:', err);
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
  // New accounts created after the launch date must still wait 7 days.
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
    const ms       = receivedAt.seconds ? receivedAt.seconds * 1000 : receivedAt;
    const hoursAgo = (Date.now() - ms) / 3600000;
    if (hoursAgo < MARKETPLACE_CONFIG.SKIN_COOLDOWN_HOURS) {
      const remaining = Math.ceil(MARKETPLACE_CONFIG.SKIN_COOLDOWN_HOURS - hoursAgo);
      return `Trade cooldown: ${remaining}h remaining on this skin.`;
    }
  }

  return null;
}

// ════════════════════════════════════════════════════════════
//  FIRESTORE QUERIES (pull-based, no real-time listeners)
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
    marketplaceState.listings = [];
    marketplaceState.lastDoc  = null;
    marketplaceState.hasMore  = true;
  }

  if (!marketplaceState.hasMore) return { status: 'done' };

  marketplaceState.loading = true;

  try {
    // Composite index required: expiresAt ASC + price ASC  (see firestore-indexes.json)
    const nowTs = firebase.firestore.Timestamp.now();
    let query   = db.collection('marketplace')
      .where('expiresAt', '>', nowTs)
      .orderBy('expiresAt', 'asc')
      .orderBy('price', 'asc')
      .limit(MARKETPLACE_CONFIG.PAGE_SIZE);

    if (marketplaceState.lastDoc) query = query.startAfter(marketplaceState.lastDoc);

    const snap = await query.get();

    if (snap.empty) {
      marketplaceState.hasMore = false;
    } else {
      marketplaceState.listings.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
      marketplaceState.lastDoc = snap.docs[snap.docs.length - 1];
      marketplaceState.hasMore = snap.docs.length === MARKETPLACE_CONFIG.PAGE_SIZE;
    }

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
    const snap = await db.collection('marketplace')
      .where('sellerId', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .limit(MARKETPLACE_CONFIG.MAX_LISTINGS_PER_PLAYER + 1)
      .get();
    marketplaceState.myListings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[MP] fetchMyListings failed:', err);
  }
}

// ════════════════════════════════════════════════════════════
//  CREATE LISTING
//
//  1. Client-side pre-checks (fast UX feedback)
//  2. Atomic Firestore transaction:
//       a. Read + verify ownership (server inventory)
//       b. Verify skin not equipped
//       c. Verify account age (unless admin/whitelisted)
//       d. Remove skin from inventory
//       e. Create listing document
//
//  NOTE: whitelist + listing count checks are done OUTSIDE the
//  transaction (pre-flight) to avoid non-transactional reads
//  inside the transaction callback.
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
  const limits = RARITY_PRICING[rarity];
  if (price < limits.floor || price > limits.ceiling) {
    return {
      success: false,
      error: `${limits.label} skins: ${limits.floor.toLocaleString()}–${limits.ceiling.toLocaleString()} coins.`,
    };
  }

  if (marketplaceState.myListings.length >= MARKETPLACE_CONFIG.MAX_LISTINGS_PER_PLAYER) {
    return { success: false, error: `Maximum ${MARKETPLACE_CONFIG.MAX_LISTINGS_PER_PLAYER} active listings.` };
  }

  const isUserAdmin   = typeof isAdmin !== 'undefined' && isAdmin;
  const isWhitelisted = marketplaceState.isWhitelisted;
  const skinInfo      = getSkinInfo(skinId);
  const expiresAt     = firebase.firestore.Timestamp.fromMillis(
    Date.now() + MARKETPLACE_CONFIG.LISTING_EXPIRY_DAYS * 86400000
  );

  try {
    await db.runTransaction(async (t) => {
      const userRef = db.collection('users').doc(currentUser.uid);
      const userDoc = await t.get(userRef);   // ← proper transactional read

      if (!userDoc.exists) throw new Error('User account not found.');

      const data        = userDoc.data();
      const serverSkins = data.ownedSkins || [];

      // Server-side verification — client inventory is never trusted
      if (!serverSkins.includes(skinId))       throw new Error('You do not own this skin.');
      if ((data.activeSkin || 'agent') === skinId) throw new Error('Cannot list your equipped skin.');

      // ── Hard block: champion skins can NEVER be traded regardless of any other check ──
      // This is the server-side enforcement layer — cannot be bypassed by client manipulation.
      if (CHAMPION_SKIN_IDS.has(skinId)) {
        throw new Error('Champion skins are achievement rewards and cannot be traded.');
      }

      // Account age check (admins + whitelisted bypass; legacy accounts pre-dating the
      // Marketplace launch also bypass; checked pre-flight too but re-verified here)
      if (!isUserAdmin && !isWhitelisted && data.createdAt) {
        const createdMs = data.createdAt.toMillis();
        const isLegacy  = createdMs < SHOP_UPDATE_TIMESTAMP_MS;
        if (!isLegacy) {
          const ageDays = (Date.now() - createdMs) / 86400000;
          if (ageDays < MARKETPLACE_CONFIG.MIN_ACCOUNT_AGE_DAYS) {
            throw new Error('Account too new for Marketplace. Please wait 7 days after registration.');
          }
        }
      }

      // Write 1: remove skin from seller's inventory
      t.update(userRef, { ownedSkins: serverSkins.filter(s => s !== skinId) });

      // Write 2: create the listing
      t.set(db.collection('marketplace').doc(), {
        sellerId:   currentUser.uid,
        sellerName: currentUser.displayName || 'Anonymous',
        skinId,
        skinName:   skinInfo ? skinInfo.name : skinId,
        rarity,
        price,
        createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
        expiresAt,
      });
    });

    // Sync local inventory after successful commit, then refresh the shop skin grid
    ownedSkins = ownedSkins.filter(s => s !== skinId);
    if (typeof saveSkins    === 'function') saveSkins();
    if (typeof initShopUI   === 'function') initShopUI();   // refreshes skin grid + coin display

    await fetchMyListings();
    return { success: true };

  } catch (err) {
    console.error('[MP] createListing failed:', err);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  CANCEL LISTING
//  Returns the skin to the seller atomically.
// ════════════════════════════════════════════════════════════

async function cancelListing(listingId) {
  if (!currentUser || isGuest) return { success: false, error: 'Must be logged in.' };

  const localListing = marketplaceState.myListings.find(l => l.id === listingId);

  try {
    await db.runTransaction(async (t) => {
      const listingRef = db.collection('marketplace').doc(listingId);
      const listingDoc = await t.get(listingRef);

      if (!listingDoc.exists)                           throw new Error('Listing no longer exists.');
      if (listingDoc.data().sellerId !== currentUser.uid) throw new Error('Not your listing.');

      const listing  = listingDoc.data();
      const userRef  = db.collection('users').doc(currentUser.uid);
      const userDoc  = await t.get(userRef);
      const currSkins = userDoc.exists ? (userDoc.data().ownedSkins || []) : [];

      // Guard against double-return
      const updatedSkins = currSkins.includes(listing.skinId)
        ? currSkins
        : [...currSkins, listing.skinId];

      t.update(userRef, { ownedSkins: updatedSkins });
      t.delete(listingRef);
    });

    const returnedSkinId = localListing?.skinId;
    if (returnedSkinId && !ownedSkins.includes(returnedSkinId)) ownedSkins.push(returnedSkinId);
    if (typeof saveSkins  === 'function') saveSkins();
    if (typeof initShopUI === 'function') initShopUI();   // refreshes skin grid + coin display

    await fetchMyListings();
    return { success: true, skinId: returnedSkinId };

  } catch (err) {
    console.error('[MP] cancelListing failed:', err);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  BUY LISTING — THE CRITICAL SECURITY PATH
//
//  Everything happens inside one atomic Firestore transaction.
//  All reads use transaction.get() for full consistency.
//  The client is never trusted for coins or inventory.
//
//  Reads:
//    - Listing (existence, expiry, seller, price)
//    - Buyer user doc (coins, owned skins, eligibility)
//    - Seller user doc (current coin balance)
//
//  Writes (all atomic, all-or-nothing):
//    - Buyer:  deduct coins, add skin, set skinReceivedTime, lastTradeAt
//    - Seller: add payout (price minus tax), lastTradeAt
//    - Listing: delete
//    - tradeLogs: create audit record
//
//  Tax simply vanishes — it is the coin sink.
// ════════════════════════════════════════════════════════════

async function buyListing(listingId) {
  if (!currentUser || isGuest) return { success: false, error: 'Must be logged in.' };

  const eligibility = await checkMarketplaceEligibility();
  if (!eligibility.eligible) return { success: false, error: eligibility.reason };

  const isUserAdmin   = typeof isAdmin !== 'undefined' && isAdmin;
  const isWhitelisted = marketplaceState.isWhitelisted;

  let purchasedSkinId = null;
  let finalPrice      = 0;
  let finalTax        = 0;
  let skinName        = '';

  try {
    await db.runTransaction(async (t) => {

      // ── Read 1: Listing ──
      const listingRef = db.collection('marketplace').doc(listingId);
      const listingDoc = await t.get(listingRef);

      if (!listingDoc.exists) {
        throw new Error('Listing no longer exists — it may have just been bought or cancelled.');
      }

      const listing = listingDoc.data();
      const nowTs   = firebase.firestore.Timestamp.now();

      if (listing.expiresAt && listing.expiresAt.toMillis() < nowTs.toMillis()) {
        throw new Error('This listing has expired.');
      }
      if (listing.sellerId === currentUser.uid) {
        throw new Error('You cannot buy your own listing.');
      }

      // ── Read 2: Buyer ──
      const buyerRef = db.collection('users').doc(currentUser.uid);
      const buyerDoc = await t.get(buyerRef);

      if (!buyerDoc.exists) throw new Error('Your account was not found.');

      const buyer      = buyerDoc.data();
      const buyerCoins = buyer.totalCoins || 0;

      if (buyerCoins < listing.price) {
        throw new Error(
          `Not enough coins. Need ${listing.price.toLocaleString()}, ` +
          `have ${buyerCoins.toLocaleString()}.`
        );
      }

      // Hard block: refuse to complete a purchase of a champion skin even if it
      // somehow got into the marketplace (defence-in-depth against stale listings).
      if (CHAMPION_SKIN_IDS.has(listing.skinId)) {
        throw new Error('Champion skins cannot be traded. This listing will be purged.');
      }

      // Buyer account age check — legacy accounts (pre-launch) bypass the wait.
      if (!isUserAdmin && !isWhitelisted && buyer.createdAt) {
        const createdMs  = buyer.createdAt.toMillis();
        const isLegacy   = createdMs < SHOP_UPDATE_TIMESTAMP_MS;
        if (!isLegacy) {
          const ageDays = (Date.now() - createdMs) / 86400000;
          if (ageDays < MARKETPLACE_CONFIG.MIN_ACCOUNT_AGE_DAYS) {
            throw new Error('Account too new for Marketplace. Please wait 7 days after registration.');
          }
        }
      }

      // ── Read 3: Seller ──
      const sellerRef = db.collection('users').doc(listing.sellerId);
      const sellerDoc = await t.get(sellerRef);

      if (!sellerDoc.exists) throw new Error('Seller account no longer exists.');

      const sellerCoins = sellerDoc.data().totalCoins || 0;

      // ── Calculate ──
      const price          = listing.price;
      const tax            = Math.floor(price * MARKETPLACE_CONFIG.TAX_RATE);
      const sellerReceives = price - tax;

      // ── Writes ──
      t.update(buyerRef, {
        totalCoins:    buyerCoins - price,
        ownedSkins:    [...(buyer.ownedSkins || []), listing.skinId],
        [`skinReceivedTimes.${listing.skinId}`]: firebase.firestore.FieldValue.serverTimestamp(),
        lastTradeAt:   firebase.firestore.FieldValue.serverTimestamp(),
      });

      t.update(sellerRef, {
        totalCoins:  sellerCoins + sellerReceives,
        lastTradeAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      t.delete(listingRef);

      t.set(db.collection('tradeLogs').doc(), {
        buyerId:        currentUser.uid,
        buyerName:      currentUser.displayName || 'Anonymous',
        sellerId:       listing.sellerId,
        sellerName:     listing.sellerName,
        skinId:         listing.skinId,
        skinName:       listing.skinName,
        rarity:         listing.rarity,
        price,
        tax,
        sellerReceived: sellerReceives,
        timestamp:      firebase.firestore.FieldValue.serverTimestamp(),
      });

      // Capture for return value (transaction scope ends here)
      purchasedSkinId = listing.skinId;
      skinName        = listing.skinName;
      finalPrice      = price;
      finalTax        = tax;
    });

    // Sync local state after successful transaction commit
    playerCoins -= finalPrice;
    if (!ownedSkins.includes(purchasedSkinId)) ownedSkins.push(purchasedSkinId);
    marketplaceState.skinReceivedTimes[purchasedSkinId] = { seconds: Math.floor(Date.now() / 1000) };

    if (typeof initShopUI === 'function') initShopUI();   // refreshes skin grid + coin display

    return { success: true, skinId: purchasedSkinId, skinName, price: finalPrice, tax: finalTax };

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

  if (marketplaceState.currentFilter !== 'all') {
    filtered = filtered.filter(l => l.rarity === marketplaceState.currentFilter);
  }

  switch (marketplaceState.currentSort) {
    case 'price_asc':  filtered.sort((a, b) => a.price - b.price); break;
    case 'price_desc': filtered.sort((a, b) => b.price - a.price); break;
  }

  return filtered;
}

// ════════════════════════════════════════════════════════════
//  WHITELIST HELPER
// ════════════════════════════════════════════════════════════

async function isMarketplaceWhitelisted(userId) {
  try {
    return (await db.collection('marketplaceWhitelist').doc(userId).get()).exists;
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
    await db.collection('marketplaceWhitelist').doc(userId).set({
      whitelistedBy: currentUser.uid,
      whitelistedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
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
    await db.collection('marketplaceWhitelist').doc(userId).delete();
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
    const snap = await db.collection('marketplaceWhitelist').get();
    if (snap.empty) { listEl.innerHTML = '<div class="loading-spinner">No whitelisted users</div>'; return; }
    listEl.innerHTML = '';
    snap.forEach(doc => {
      const time = doc.data().whitelistedAt
        ? new Date(doc.data().whitelistedAt.seconds * 1000).toLocaleDateString()
        : 'N/A';
      const el = document.createElement('div');
      el.className = 'admin-log-entry';
      el.innerHTML = `
        <div class="admin-log-action" style="font-family:monospace;font-size:11px;">${doc.id}</div>
        <div class="admin-log-meta">Added: ${time}</div>
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
    const snap = await db.collection('marketplace').orderBy('createdAt', 'desc').limit(50).get();
    if (snap.empty) { listEl.innerHTML = '<div class="loading-spinner">No listings</div>'; return; }
    listEl.innerHTML = '';
    snap.forEach(doc => {
      const d       = doc.data();
      const expired = d.expiresAt && d.expiresAt.toMillis() < Date.now();
      const created = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString() : 'N/A';
      const el      = document.createElement('div');
      el.className  = 'admin-score-entry';
      el.style.borderColor = expired ? 'rgba(255,71,87,0.3)' : 'rgba(88,166,255,0.12)';
      el.innerHTML = `
        <div class="admin-score-info" style="flex:1;">
          <div class="admin-score-name">
            ${d.skinName || d.skinId}
            ${expired ? '<span style="color:var(--danger)"> (EXPIRED)</span>' : ''}
          </div>
          <div class="admin-score-val">🪙 ${(d.price||0).toLocaleString()} · ${d.rarity} · ${d.sellerName||'?'}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px;">
            ${doc.id.substring(0, 12)}... · Seller: ${d.sellerId?.substring(0,8)}... · ${created}
          </div>
        </div>
        <button class="admin-action-btn delete"
                onclick="adminMpRemoveListing('${doc.id}')">🗑️</button>
      `;
      listEl.appendChild(el);
    });
  } catch (err) {
    listEl.innerHTML = '<div class="loading-spinner">Error: ' + err.message + '</div>';
  }
}

async function adminMpRemoveListing(listingId) {
  if (!isAdmin) return;
  if (!confirm(`Remove listing ${listingId.substring(0, 12)}...?\nSkin will be returned to seller.`)) return;
  try {
    await db.runTransaction(async (t) => {
      const listingRef = db.collection('marketplace').doc(listingId);
      const listingDoc = await t.get(listingRef);
      if (!listingDoc.exists) throw new Error('Already removed.');
      const listing   = listingDoc.data();
      const sellerRef = db.collection('users').doc(listing.sellerId);
      const sellerDoc = await t.get(sellerRef);
      if (sellerDoc.exists) {
        const skins = sellerDoc.data().ownedSkins || [];
        if (!skins.includes(listing.skinId)) t.update(sellerRef, { ownedSkins: [...skins, listing.skinId] });
      }
      t.delete(listingRef);
    });
    showAdminMessage('Listing removed, skin returned.');
    adminMpLoadListings();
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminMpRemoveExpired() {
  if (!isAdmin) return;
  if (!confirm('Remove all expired listings and return skins to sellers?')) return;
  try {
    const snap = await db.collection('marketplace')
      .where('expiresAt', '<', firebase.firestore.Timestamp.now()).get();
    if (snap.empty) { showAdminMessage('No expired listings found.'); return; }

    let removed = 0;
    for (const doc of snap.docs) {
      const listing = doc.data();
      try {
        await db.runTransaction(async (t) => {
          const sellerRef = db.collection('users').doc(listing.sellerId);
          const sellerDoc = await t.get(sellerRef);
          if (sellerDoc.exists) {
            const skins = sellerDoc.data().ownedSkins || [];
            if (!skins.includes(listing.skinId)) t.update(sellerRef, { ownedSkins: [...skins, listing.skinId] });
          }
          t.delete(db.collection('marketplace').doc(doc.id));
        });
        removed++;
      } catch (e) { console.error('[MP Admin] Expired purge failed for', doc.id, e); }
    }
    showAdminMessage(`Purged ${removed} expired listing${removed !== 1 ? 's' : ''}.`);
    adminMpLoadListings();
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminMpRemoveAll() {
  if (!isAdmin) return;
  if (!confirm('⚠️ Remove ALL marketplace listings? All skins will be returned.')) return;
  if (!confirm('This cannot be undone. Continue?')) return;
  try {
    const snap = await db.collection('marketplace').get();
    let removed = 0;
    for (const doc of snap.docs) {
      const listing = doc.data();
      try {
        await db.runTransaction(async (t) => {
          const sellerRef = db.collection('users').doc(listing.sellerId);
          const sellerDoc = await t.get(sellerRef);
          if (sellerDoc.exists) {
            const skins = sellerDoc.data().ownedSkins || [];
            if (!skins.includes(listing.skinId)) t.update(sellerRef, { ownedSkins: [...skins, listing.skinId] });
          }
          t.delete(db.collection('marketplace').doc(doc.id));
        });
        removed++;
      } catch (e) { console.error('[MP Admin] Remove all failed for', doc.id, e); }
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
    const snap = await db.collection('tradeLogs').orderBy('timestamp', 'desc').limit(50).get();
    if (snap.empty) { listEl.innerHTML = '<div class="loading-spinner">No trades yet</div>'; return; }
    listEl.innerHTML = '';
    snap.forEach(doc => {
      const d    = doc.data();
      const time = d.timestamp ? new Date(d.timestamp.seconds * 1000).toLocaleString() : 'N/A';
      const el   = document.createElement('div');
      el.className = 'admin-log-entry';
      el.innerHTML = `
        <div class="admin-log-action">
          <strong style="color:var(--gold);">${d.skinName || d.skinId}</strong>
          <span style="color:var(--muted);"> · ${d.rarity || '?'} · </span>
          🪙 ${(d.price || 0).toLocaleString()}
          <span style="color:var(--danger);"> (−${(d.tax || 0).toLocaleString()} tax)</span>
        </div>
        <div class="admin-log-meta">${d.buyerName || '?'} ← ${d.sellerName || '?'} · ${time}</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.2);margin-top:2px;">
          Buyer: ${d.buyerId?.substring(0,8)}... · Seller: ${d.sellerId?.substring(0,8)}...
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
    const [listingsSnap, tradesSnap] = await Promise.all([
      db.collection('marketplace').get(),
      db.collection('tradeLogs').get(),
    ]);
    let vol = 0, tax = 0;
    tradesSnap.forEach(doc => { vol += doc.data().price || 0; tax += doc.data().tax || 0; });
    set('mpStatActiveListings', listingsSnap.size);
    set('mpStatTotalTrades',    tradesSnap.size);
    set('mpStatTotalVolume',    vol.toLocaleString());
    set('mpStatTotalTax',       tax.toLocaleString());
  } catch (err) { showAdminMessage('Stats error: ' + err.message, true); }
}

async function adminMpGrantSkin() {
  if (!isAdmin) return;
  const userId = document.getElementById('mpGrantUserId')?.value.trim();
  const skinId = document.getElementById('mpGrantSkinSelect')?.value;
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  if (!skinId) { showAdminMessage('Select a skin', true);   return; }
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists)                              { showAdminMessage('User not found', true); return; }
    if ((userDoc.data().ownedSkins || []).includes(skinId)) { showAdminMessage('Already owns this skin', true); return; }
    await userRef.update({ ownedSkins: [...(userDoc.data().ownedSkins || []), skinId] });
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
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) { showAdminMessage('User not found', true); return; }
    const before = userDoc.data().totalCoins || 0;
    await userRef.update({ totalCoins: before + amount });
    showAdminMessage(
      `Granted ${amount.toLocaleString()} coins to ${userId.substring(0,12)}... ` +
      `(→ ${(before + amount).toLocaleString()})`
    );
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminMpResetCooldowns() {
  if (!isAdmin) return;
  const userId = document.getElementById('mpResetCooldownUserId')?.value.trim();
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  try {
    await db.collection('users').doc(userId).update({ skinReceivedTimes: {}, lastTradeAt: null });
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

// Called by firebase-auth.js onAuthStateChanged whenever the user changes
// (login, logout, or account switch). Clears all cached eligibility and
// listing data so the next marketplace open fetches fresh from Firestore.
// Without this, user B inherits user A's whitelist/cooldown data in the same tab.
function resetMarketplaceState() {
  marketplaceState.listings          = [];
  marketplaceState.myListings        = [];
  marketplaceState.lastDoc           = null;
  marketplaceState.hasMore           = true;
  marketplaceState.loading           = false;
  marketplaceState.lastRefresh       = 0;
  marketplaceState.accountCreatedAt  = null;
  marketplaceState.skinReceivedTimes = {};
  marketplaceState.isWhitelisted     = false;
  marketplaceState.eligibilityLoaded = false;  // forces fresh Firestore read on next open
}
console.log('🏪 Marketplace module loaded');