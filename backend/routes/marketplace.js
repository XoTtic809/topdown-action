// routes/marketplace.js
// All critical paths (list, buy, cancel) run inside PostgreSQL transactions.
// The client is NEVER trusted for coin balances or skin ownership.

const express = require('express');
const router  = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { withTransaction, query }    = require('../config/db');
const { getUserById, isWhitelisted } = require('../models/user');
const { removeSkin, addSkin }       = require('../models/inventory');
const {
  getListings, getListingById, countActiveListingsBySeller,
  getListingsBySeller, createListing, deleteListing, getExpiredListings,
} = require('../models/listing');
const { logTrade, getRecentTrades, getEconomyStats } = require('../models/transaction');

// ─────────────────────────────────────────────────────────────
// CONSTANTS — kept in sync with your frontend marketplace.js
// ─────────────────────────────────────────────────────────────
const TAX_RATE                = 0.08;
const LISTING_FEE_RATE        = 0.02;
const MAX_LISTINGS_PER_PLAYER = 5;
const MIN_ACCOUNT_AGE_DAYS    = 7;
const MIN_LEVEL               = 15;
const SKIN_COOLDOWN_HOURS     = 24;

// Accounts created before the v4.2.0 launch bypass the 7-day wait
const SHOP_UPDATE_TIMESTAMP_MS = new Date('2026-02-18T12:45:00Z').getTime();

const CHAMPION_SKIN_IDS = new Set(['gold-champion', 'silver-champion', 'bronze-champion']);
// Skin IDs permanently blocked from the marketplace (server-authoritative)
const NON_TRADEABLE_SKIN_IDS = new Set([
  'agent', 'transcendence', 'icon_the_creator',
  'gold-champion', 'silver-champion', 'bronze-champion',
]);
// Returns true if this skin ID is allowed to be listed (base ID before mutation suffix)
function isMarketplaceTradeableSkinId(skinId) {
  const base = (skinId || '').split('__')[0];
  if (NON_TRADEABLE_SKIN_IDS.has(base)) return false;
  if (/^bp\d+_/.test(base)) return false; // battle pass seasons (bp1_, bp2_, …)
  return true;
}

// Mutation price multipliers — must stay in sync with MUTATION_CONFIG in game.js
const MUTATION_PRICE_MULTIPLIERS = {
  corrupted: 1.5,
  gilded:    2.0,
  void:      3.0,
  prismatic: 5.0,
};

// Splits "baseSkinId__mutationType" into its parts (server-side mirror of frontend helper).
function parseMutatedSkinId(skinId) {
  const sep = (skinId || '').indexOf('__');
  if (sep === -1) return { baseSkinId: skinId, mutation: null };
  return { baseSkinId: skinId.slice(0, sep), mutation: skinId.slice(sep + 2) };
}

const RARITY_PRICING = {
  common:    { floor: 100,    ceiling: 500    },
  uncommon:  { floor: 200,    ceiling: 1000   },
  rare:      { floor: 500,    ceiling: 2000   },
  epic:      { floor: 2000,   ceiling: 8000   },
  legendary: { floor: 8000,   ceiling: 25000  },
  mythic:    { floor: 25000,  ceiling: 100000 },
  icon:      { floor: 500,    ceiling: 4000   },
};

// XP → level formula — matches the battle pass tier system in battlepass-system.js.
// CUMULATIVE_XP[i] is the total XP needed to reach tier (i+1).
const CUMULATIVE_XP = [
    250,  500,  750,  1000,  1250,  // tiers  1– 5 (250 XP each)
   1650, 2050, 2450,  2850,  3250,  // tiers  6–10 (400 XP each)
   3850, 4450, 5050,  5650,  6250,  // tiers 11–15 (600 XP each)
   6850, 7450, 8050,  8650,  9250,  // tiers 16–20 (600 XP each)
  10100, 10950, 11800, 12650, 13500, // tiers 21–25 (850 XP each)
  14600, 15700, 16800, 17900, 19000, // tiers 26–30 (1100 XP each)
  20400, 21800, 23200, 24600, 26000, // tiers 31–35 (1400 XP each)
  27800, 29600, 31400, 33200, 35000, // tiers 36–40 (1800 XP each)
  37200, 39400, 41600, 43800, 46000, // tiers 41–45 (2200 XP each)
  48800, 51600, 54400, 57200, 60000, // tiers 46–50 (2800 XP each)
];

function calculateTrueLevel(xp) {
  if (xp <= 0) return 0;
  for (let i = 0; i < CUMULATIVE_XP.length; i++) {
    if (xp < CUMULATIVE_XP[i]) return i;
  }
  // Beyond tier 50: 3500 XP per level
  return 50 + Math.floor((xp - CUMULATIVE_XP[49]) / 3500);
}

// ─────────────────────────────────────────────────────────────
// ELIGIBILITY CHECK  (called on list + buy)
// ─────────────────────────────────────────────────────────────
async function checkEligibility(user, userIsAdmin, userIsWhitelisted) {
  if (userIsAdmin || userIsWhitelisted) return { eligible: true };

  const createdMs  = new Date(user.created_at).getTime();
  const isLegacy   = createdMs < SHOP_UPDATE_TIMESTAMP_MS;
  const ageDays    = (Date.now() - createdMs) / 86400000;

  if (!isLegacy && ageDays < MIN_ACCOUNT_AGE_DAYS) {
    const left = Math.ceil(MIN_ACCOUNT_AGE_DAYS - ageDays);
    return {
      eligible: false,
      reason: `Account must be at least 7 days old. ${left} day${left !== 1 ? 's' : ''} remaining.`,
    };
  }

  const level = calculateTrueLevel(user.current_xp);
  if (level < MIN_LEVEL) {
    return {
      eligible: false,
      reason: `Level ${MIN_LEVEL}+ required. You are Level ${level}.`,
    };
  }

  return { eligible: true };
}

// ─────────────────────────────────────────────────────────────
// GET /api/marketplace/listings
// Query params: rarity, sort, page
// ─────────────────────────────────────────────────────────────
router.get('/listings', async (req, res) => {
  try {
    const { rarity = 'all', sort = 'price_asc', page = 1 } = req.query;
    const listings = await getListings({ rarity, sort, page: parseInt(page) });
    return res.json({ listings, hasMore: listings.length === 20 });
  } catch (err) {
    console.error('[MP] GET /listings error:', err.message);
    return res.status(500).json({ error: 'Failed to load listings' });
  }
});

// GET /api/marketplace/my-listings  (auth required)
router.get('/my-listings', requireAuth, async (req, res) => {
  try {
    const listings = await getListingsBySeller(req.user.uid);
    return res.json({ listings });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load your listings' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/marketplace/list
// Body: { skinId, skinName, rarity, price }
// ─────────────────────────────────────────────────────────────
router.post('/list', requireAuth, async (req, res) => {
  const { skinId, skinName, rarity, price: rawPrice } = req.body;

  if (!skinId || !skinName || !rarity || rawPrice == null) {
    return res.status(400).json({ error: 'skinId, skinName, rarity, and price are required' });
  }

  const { baseSkinId, mutation } = parseMutatedSkinId(skinId);

  // Non-tradeable skins — absolute block
  if (!isMarketplaceTradeableSkinId(baseSkinId)) {
    return res.status(403).json({ error: 'This skin cannot be listed on the marketplace.' });
  }

  const price = Math.floor(Number(rawPrice));
  const baseLimits = RARITY_PRICING[rarity];
  if (!baseLimits) return res.status(400).json({ error: 'Invalid rarity tier' });

  const mutMult = (mutation && MUTATION_PRICE_MULTIPLIERS[mutation]) || 1;
  const limits = {
    floor:   Math.floor(baseLimits.floor   * mutMult),
    ceiling: Math.floor(baseLimits.ceiling * Math.min(mutMult, 3.0)),
  };

  if (price < limits.floor || price > limits.ceiling) {
    const mutLabel = mutation ? ` [${mutation.toUpperCase()}]` : '';
    return res.status(400).json({
      error: `${rarity}${mutLabel} skins: ${limits.floor.toLocaleString()}–${limits.ceiling.toLocaleString()} coins.`,
    });
  }

  try {
    const result = await withTransaction(async (client) => {
      const { rows: userRows } = await client.query(
        'SELECT * FROM users WHERE uid = $1 FOR UPDATE',
        [req.user.uid]
      );
      const user = userRows[0];
      if (!user) throw new Error('User account not found.');

      const userIsAdmin      = user.is_admin;
      const userIsWhitelisted = await isWhitelisted(req.user.uid);

      const elig = await checkEligibility(user, userIsAdmin, userIsWhitelisted);
      if (!elig.eligible) throw new Error(elig.reason);

      if (!user.owned_skins.includes(skinId)) throw new Error('You do not own this skin.');
      if (user.active_skin === skinId)        throw new Error('Cannot list your equipped skin.');

      if (!isMarketplaceTradeableSkinId(baseSkinId)) {
        throw new Error('This skin cannot be listed on the marketplace.');
      }

      const receivedRaw = user.skin_received_times?.[skinId];
      if (receivedRaw) {
        const receivedMs = new Date(receivedRaw).getTime();
        const hoursAgo   = (Date.now() - receivedMs) / 3600000;
        if (hoursAgo < SKIN_COOLDOWN_HOURS) {
          const remaining = Math.ceil(SKIN_COOLDOWN_HOURS - hoursAgo);
          throw new Error(`Trade cooldown: ${remaining}h remaining on this skin.`);
        }
      }

      const activeCount = await countActiveListingsBySeller(req.user.uid);
      if (activeCount >= MAX_LISTINGS_PER_PLAYER) {
        throw new Error(`Maximum ${MAX_LISTINGS_PER_PLAYER} active listings.`);
      }

      // Non-refundable listing fee (2% of asking price)
      const listingFee = Math.floor(price * LISTING_FEE_RATE);
      if (listingFee > 0) {
        if (user.total_coins < listingFee) {
          throw new Error(`Not enough coins for listing fee (${listingFee.toLocaleString()} coins).`);
        }
        await client.query(
          'UPDATE users SET total_coins = total_coins - $2, updated_at = NOW() WHERE uid = $1',
          [req.user.uid, listingFee]
        );
      }

      await removeSkin(req.user.uid, skinId, client);

      const listing = await createListing(client, {
        sellerId:   req.user.uid,
        sellerName: user.username,
        skinId,
        skinName,
        rarity,
        price,
      });

      return listing;
    });

    return res.json({ success: true, listing: result });
  } catch (err) {
    console.error('[MP] /list error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/marketplace/cancel
// Body: { listingId }
// ─────────────────────────────────────────────────────────────
router.post('/cancel', requireAuth, async (req, res) => {
  const { listingId } = req.body;
  if (!listingId) return res.status(400).json({ error: 'listingId required' });

  try {
    const returnedSkinId = await withTransaction(async (client) => {
      const listing = await getListingById(listingId, client);
      if (!listing)                            throw new Error('Listing no longer exists.');
      if (listing.seller_id !== req.user.uid)  throw new Error('Not your listing.');

      await addSkin(req.user.uid, listing.skin_id, client);

      await deleteListing(client, listingId);
      return listing.skin_id;
    });

    return res.json({ success: true, skinId: returnedSkinId });
  } catch (err) {
    console.error('[MP] /cancel error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/marketplace/buy  — THE CRITICAL SECURITY PATH
// Body: { listingId }
// ─────────────────────────────────────────────────────────────
router.post('/buy', requireAuth, async (req, res) => {
  const { listingId } = req.body;
  if (!listingId) return res.status(400).json({ error: 'listingId required' });

  try {
    const receipt = await withTransaction(async (client) => {
      const { rows: listingRows } = await client.query(
        'SELECT * FROM listings WHERE id = $1 FOR UPDATE',
        [listingId]
      );
      const listing = listingRows[0];
      if (!listing)                    throw new Error('Listing no longer exists — it may have just been bought or cancelled.');
      if (new Date(listing.expires_at) < new Date()) throw new Error('This listing has expired.');
      if (listing.seller_id === req.user.uid) throw new Error('You cannot buy your own listing.');

      if (!isMarketplaceTradeableSkinId(listing.skin_id)) {
        throw new Error('This skin cannot be traded. This listing will be purged.');
      }

      const { rows: buyerRows } = await client.query(
        'SELECT * FROM users WHERE uid = $1 FOR UPDATE',
        [req.user.uid]
      );
      const buyer = buyerRows[0];
      if (!buyer) throw new Error('Your account was not found.');

      const buyerIsAdmin      = buyer.is_admin;
      const buyerIsWhitelisted = await isWhitelisted(req.user.uid);
      const elig = await checkEligibility(buyer, buyerIsAdmin, buyerIsWhitelisted);
      if (!elig.eligible) throw new Error(elig.reason);

      if (buyer.total_coins < listing.price) {
        throw new Error(
          `Not enough coins. Need ${listing.price.toLocaleString()}, ` +
          `have ${buyer.total_coins.toLocaleString()}.`
        );
      }

      const { rows: sellerRows } = await client.query(
        'SELECT * FROM users WHERE uid = $1 FOR UPDATE',
        [listing.seller_id]
      );
      const seller = sellerRows[0];
      if (!seller) throw new Error('Seller account no longer exists.');

      const price          = listing.price;
      const tax            = Math.floor(price * TAX_RATE);
      const sellerReceives = price - tax;

      const { rows: buyerAfter } = await client.query(`
        UPDATE users SET
          total_coins = total_coins - $2,
          owned_skins = array_append(owned_skins, $3),
          skin_received_times = skin_received_times || jsonb_build_object($3, NOW()::TEXT),
          last_trade_at = NOW(),
          updated_at = NOW()
        WHERE uid = $1
        RETURNING total_coins
      `, [req.user.uid, price, listing.skin_id]);

      await client.query(`
        UPDATE users SET
          total_coins = total_coins + $2,
          last_trade_at = NOW(),
          updated_at = NOW()
        WHERE uid = $1
      `, [listing.seller_id, sellerReceives]);

      await deleteListing(client, listingId);

      await logTrade(client, {
        buyerId:        req.user.uid,
        buyerName:      buyer.username,
        sellerId:       listing.seller_id,
        sellerName:     listing.seller_name,
        skinId:         listing.skin_id,
        skinName:       listing.skin_name,
        rarity:         listing.rarity,
        price,
        tax,
        sellerReceived: sellerReceives,
      });

      return {
        skinId:          listing.skin_id,
        skinName:        listing.skin_name,
        price,
        tax,
        sellerReceives,
        newBuyerBalance: buyerAfter[0].total_coins, // fresh value from RETURNING
      };
    });

    return res.json({ success: true, ...receipt });
  } catch (err) {
    console.error('[MP] /buy error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/marketplace/recent-trades  (public — no auth required)
// Returns the 5 most recent completed trades for the price-guide panel.
// ─────────────────────────────────────────────────────────────
router.get('/recent-trades', async (req, res) => {
  try {
    const trades = await getRecentTrades(5);
    return res.json(trades);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load recent trades' });
  }
});

// ─────────────────────────────────────────────────────────────
// ADMIN MARKETPLACE ROUTES
// ─────────────────────────────────────────────────────────────

// GET /api/marketplace/admin/listings
router.get('/admin/listings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM listings ORDER BY created_at DESC LIMIT 100`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load listings' });
  }
});

// DELETE /api/marketplace/admin/listings/:id
router.delete('/admin/listings/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await withTransaction(async (client) => {
      const listing = await getListingById(req.params.id, client);
      if (!listing) throw new Error('Listing not found.');

      const { rows } = await client.query(
        'SELECT owned_skins FROM users WHERE uid = $1', [listing.seller_id]
      );
      if (rows[0] && !rows[0].owned_skins.includes(listing.skin_id)) {
        await addSkin(listing.seller_id, listing.skin_id, client);
      }
      await deleteListing(client, req.params.id);
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/marketplace/admin/purge-expired
router.post('/admin/purge-expired', requireAuth, requireAdmin, async (req, res) => {
  try {
    const expired = await getExpiredListings();
    let purged = 0;
    for (const listing of expired) {
      try {
        await withTransaction(async (client) => {
          const { rows } = await client.query(
            'SELECT owned_skins FROM users WHERE uid = $1', [listing.seller_id]
          );
          if (rows[0] && !rows[0].owned_skins.includes(listing.skin_id)) {
            await addSkin(listing.seller_id, listing.skin_id, client);
          }
          await deleteListing(client, listing.id);
        });
        purged++;
      } catch (e) {
        console.error('[MP Admin] purge failed for', listing.id, e.message);
      }
    }
    return res.json({ success: true, purged });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/marketplace/admin/trades
router.get('/admin/trades', requireAuth, requireAdmin, async (req, res) => {
  try {
    const trades = await getRecentTrades(100);
    return res.json(trades);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load trades' });
  }
});

// GET /api/marketplace/admin/stats
router.get('/admin/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    return res.json(await getEconomyStats());
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load stats' });
  }
});

module.exports = router;
