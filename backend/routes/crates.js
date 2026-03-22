// routes/crates.js — Server-side crate opening & trade-up validation
// Prevents client-side skin injection by making all RNG server-authoritative.
'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { withTransaction, query } = require('../config/db');
const { addSkin } = require('../models/inventory');
const { addCrate, removeCrate, getOwnedCrates } = require('../models/crate-inventory');

// ── Crate definitions (must stay in sync with frontend crate-system.js) ──────
const CRATES = [
  { id: 'common-crate', price: 300, rarityWeights: { common: 0.70, uncommon: 0.25, rare: 0.05 } },
  { id: 'rare-crate', price: 750, rarityWeights: { common: 0.40, uncommon: 0.40, rare: 0.15, epic: 0.05 } },
  { id: 'epic-crate', price: 1500, rarityWeights: { uncommon: 0.30, rare: 0.40, epic: 0.25, legendary: 0.05 } },
  { id: 'legendary-crate', price: 4000, rarityWeights: { rare: 0.20, epic: 0.50, legendary: 0.25, mythic: 0.05 } },
  { id: 'icon-crate', price: 750, rarityWeights: { icon: 0.995, creator: 0.005 } },
  { id: 'oblivion-crate', price: 10000, rarityWeights: { ob_epic: 0.50, ob_legendary: 0.30, ob_mythic: 0.15, ob_ultra: 0.05 } },
];

const SKIN_RARITIES = {
  common:    ['c_static', 'c_rust', 'c_slate', 'c_olive', 'c_maroon', 'inferno', 'venom', 'ice'],
  uncommon:  ['c_cobalt', 'c_teal', 'c_coral', 'c_sand', 'c_chrome', 'shadow', 'amber', 'crimson', 'gold', 'ocean', 'toxic'],
  rare:      ['c_prism', 'c_aurora', 'c_lava', 'c_storm', 'c_neon', 'magma', 'plasma', 'emerald', 'frost', 'midnight', 'sakura'],
  epic:      ['c_glitch', 'c_nebula', 'c_biohazard', 'c_arctic', 'c_wildfire', 'c_spectre', 'electric', 'ruby', 'lime', 'violet', 'rainbow', 'copper', 'cyber', 'sunset'],
  legendary: ['c_supernova', 'c_wraith', 'c_titan', 'c_astral', 'galaxy', 'phoenix', 'void', 'diamond'],
  mythic:    ['c_omnichrome', 'c_singularity', 'c_ultraviolet', 'c_godmode', 'c_rift', 'quantum', 'celestial'],
};

const OBLIVION_SKIN_RARITIES = {
  ob_epic:      ['ob_duskblade', 'ob_voidborn', 'ob_ashwalker'],
  ob_legendary: ['ob_soulreaper', 'ob_eclipsar', 'ob_phantomking'],
  ob_mythic:    ['ob_abyssal', 'ob_eventide'],
  ob_ultra:     ['ob_worldeater', 'ob_eternium'],
};

const ICON_SKIN_RARITIES = {
  icon:    ['icon_noah_brown', 'icon_keegan_baseball', 'icon_dpoe_fade', 'icon_evan_watermelon', 'icon_gavin_tzl', 'icon_carter_cosmic', 'icon_brody_flag', 'icon_sterling', 'icon_justin_clover', 'icon_profe_spain', 'icon_kayden_duck', 'icon_troy_puck'],
  creator: ['icon_the_creator'],
};

const MUTATION_CONFIG = {
  corrupted: { chance: 0.008, priceMultiplier: 1.5 },
  gilded:    { chance: 0.006, priceMultiplier: 2.0 },
  void:      { chance: 0.004, priceMultiplier: 3.0 },
  prismatic: { chance: 0.002, priceMultiplier: 5.0 },
};

// DISCONTINUED_CRATES kept for backward-compat references (retirement now handled by DB)
const DISCONTINUED_CRATES = new Set([]);

// Post-game drop weights (sum = 100)
const DROP_WEIGHTS = [
  { id: 'common-crate',    weight: 55 },
  { id: 'rare-crate',      weight: 25 },
  { id: 'epic-crate',      weight: 12 },
  { id: 'legendary-crate', weight:  5 },
  { id: 'icon-crate',      weight:  2 },
  { id: 'oblivion-crate',  weight:  1 },
];
const DROP_TOTAL_WEIGHT = DROP_WEIGHTS.reduce((s, d) => s + d.weight, 0);
const TIER_DROP_BONUS = { bronze: 0, silver: 0.02, gold: 0.04, platinum: 0.06, diamond: 0.08, elite: 0.10 };
const BASE_DROP_CHANCE = 0.15;
const MAX_WEEKLY_DROPS = 5;

const TRADEUP_RARITY_NEXT = {
  common: 'uncommon', uncommon: 'rare', rare: 'epic', epic: 'legendary', legendary: 'mythic',
};

const TRADEUP_COSTS = {
  common: 200, uncommon: 500, rare: 1500, epic: 4000, legendary: 10000,
};

// Build complete whitelist of all valid skin IDs (base + mutations)
const ALL_VALID_BASE_SKINS = new Set();
for (const pool of Object.values(SKIN_RARITIES)) pool.forEach(s => ALL_VALID_BASE_SKINS.add(s));
for (const pool of Object.values(OBLIVION_SKIN_RARITIES)) pool.forEach(s => ALL_VALID_BASE_SKINS.add(s));
for (const pool of Object.values(ICON_SKIN_RARITIES)) pool.forEach(s => ALL_VALID_BASE_SKINS.add(s));
// Special skins not from crates but still valid to own
['agent', 'transcendence', 'gold-champion', 'silver-champion', 'bronze-champion',
 'bp1_striker', 'bp1_guardian', 'bp1_phantom', 'bp1_tempest', 'bp1_eclipse', 'bp1_sovereign', 'bp1_apex',
].forEach(s => ALL_VALID_BASE_SKINS.add(s));
const VALID_MUTATIONS = new Set(Object.keys(MUTATION_CONFIG));

// ── Helpers ──────────────────────────────────────────────────────────────────

function rollRarity(crate) {
  const rand = Math.random();
  let cumulative = 0;
  for (const [rarity, weight] of Object.entries(crate.rarityWeights)) {
    cumulative += weight;
    if (rand < cumulative) return rarity;
  }
  return Object.keys(crate.rarityWeights)[0];
}

function getRandomSkin(rarity, crateId) {
  let pool;
  if (crateId === 'icon-crate') pool = ICON_SKIN_RARITIES[rarity] || ICON_SKIN_RARITIES.icon;
  else if (crateId === 'oblivion-crate') pool = OBLIVION_SKIN_RARITIES[rarity] || OBLIVION_SKIN_RARITIES.ob_epic;
  else pool = SKIN_RARITIES[rarity] || SKIN_RARITIES.common;
  return pool[Math.floor(Math.random() * pool.length)];
}

function rollMutation(skinId) {
  // Icon skins don't get mutations
  if (skinId.startsWith('icon_')) return null;
  const roll = Math.random();
  let cumulative = 0;
  for (const [type, cfg] of Object.entries(MUTATION_CONFIG)) {
    cumulative += cfg.chance;
    if (roll < cumulative) return type;
  }
  return null;
}

/** Returns true if today (UTC) is Saturday or Sunday. */
function isOblivionWeekend() {
  const day = new Date().getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Fetch rotation state for a crate from the DB.
 */
async function getRotationState(crateId) {
  const { rows } = await query(
    'SELECT * FROM crate_rotation WHERE crate_id = $1',
    [crateId]
  );
  return rows[0] || null;
}

/**
 * Decrement stock for a crate using crate_rotation.
 * Returns true if decrement succeeded, false if sold out (stock_remaining = 0).
 * NULL stock_remaining = unlimited (always succeeds).
 */
async function decrementStock(client, crateId) {
  const { rowCount } = await client.query(
    `UPDATE crate_rotation
        SET stock_remaining = CASE
              WHEN stock_remaining > 0 THEN stock_remaining - 1
              ELSE stock_remaining
            END,
            updated_at = NOW()
      WHERE crate_id = $1
        AND (stock_remaining IS NULL OR stock_remaining > 0)`,
    [crateId]
  );
  return rowCount > 0;
}

/** Weighted random crate selection for post-game drops. */
function rollDropCrate() {
  let roll = Math.floor(Math.random() * DROP_TOTAL_WEIGHT);
  for (const { id, weight } of DROP_WEIGHTS) {
    if (roll < weight) return id;
    roll -= weight;
  }
  return 'common-crate';
}

/** Returns the start-of-week (Monday 00:00 UTC) as a Date. */
function getWeekStart() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day); // days back to Monday
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return monday;
}

/** Validate that a skin ID is a known valid skin (base or mutated). */
function isValidSkinId(skinId) {
  if (!skinId || typeof skinId !== 'string') return false;
  const sep = skinId.indexOf('__');
  if (sep === -1) return ALL_VALID_BASE_SKINS.has(skinId);
  const base = skinId.slice(0, sep);
  const mut  = skinId.slice(sep + 2);
  return ALL_VALID_BASE_SKINS.has(base) && VALID_MUTATIONS.has(mut);
}

// ── POST /api/crates/open ────────────────────────────────────────────────────
// Body: { crateId }
// Server-authoritative crate opening. Deducts coins, rolls skin, adds to inventory.
router.post('/open', requireAuth, async (req, res) => {
  const { crateId } = req.body;
  const crate = CRATES.find(c => c.id === crateId);
  if (!crate) return res.status(400).json({ error: 'Invalid crate ID' });

  const rotation = await getRotationState(crateId);
  if (!rotation || rotation.retired) {
    return res.status(403).json({ error: 'This crate is no longer available.' });
  }
  if (!rotation.active) {
    return res.status(403).json({ error: 'This crate is not currently in the shop.' });
  }

  const templatePrice = crate.price;
  const basePrice     = rotation.price_override ?? templatePrice;
  const finalPrice    = Math.floor(basePrice * (1 - (rotation.discount_percent || 0) / 100));

  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM users WHERE uid = $1 FOR UPDATE', [req.user.uid]);
      const user = rows[0];
      if (!user) throw new Error('User not found');

      if (user.total_coins < finalPrice) throw new Error('Not enough coins');

      // Check and decrement stock
      const inStock = await decrementStock(client, crateId);
      if (!inStock) throw new Error('This crate is sold out.');

      // Deduct coins (using rotation-adjusted finalPrice)
      await client.query(
        'UPDATE users SET total_coins = total_coins - $2, updated_at = NOW() WHERE uid = $1',
        [req.user.uid, finalPrice]
      );

      // Roll rarity + skin
      const rarity = rollRarity(crate);
      const skinId = getRandomSkin(rarity, crateId);
      const mutation = rollMutation(skinId);
      const finalSkinId = mutation ? `${skinId}__${mutation}` : skinId;

      // Check for duplicate
      const isDuplicate = user.owned_skins.includes(finalSkinId);
      let coinRefund = 0;
      if (isDuplicate) {
        const DUPE_RATES = { common: 0.25, uncommon: 0.25, rare: 0.35, epic: 0.50, ob_epic: 0.50, legendary: 0.60, ob_legendary: 0.60, mythic: 0.60, ob_mythic: 0.60, ob_ultra: 0.60 };
        coinRefund = Math.floor(finalPrice * (DUPE_RATES[rarity] || 0.25));
        if (coinRefund > 0) {
          await client.query('UPDATE users SET total_coins = total_coins + $2 WHERE uid = $1', [req.user.uid, coinRefund]);
        }
      }

      // Add skin
      await addSkin(req.user.uid, finalSkinId, client);

      // Get updated balance
      const { rows: updated } = await client.query('SELECT total_coins FROM users WHERE uid = $1', [req.user.uid]);

      return {
        skinId: finalSkinId,
        baseSkinId: skinId,
        rarity,
        mutation,
        isDuplicate,
        coinRefund,
        newBalance: updated[0].total_coins,
      };
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Crates] /open error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ── POST /api/crates/buy ─────────────────────────────────────────────────────
// Body: { crateId }
// Buy a crate to inventory without opening it. Deducts coins, stores in owned_crates.
router.post('/buy', requireAuth, async (req, res) => {
  const { crateId } = req.body;
  const crate = CRATES.find(c => c.id === crateId);
  if (!crate) return res.status(400).json({ error: 'Invalid crate ID' });

  const rotation = await getRotationState(crateId);
  if (!rotation || rotation.retired) {
    return res.status(403).json({ error: 'This crate is no longer available.' });
  }
  if (!rotation.active) {
    return res.status(403).json({ error: 'This crate is not currently in the shop.' });
  }

  const templatePrice = crate.price;
  const basePrice     = rotation.price_override ?? templatePrice;
  const finalPrice    = Math.floor(basePrice * (1 - (rotation.discount_percent || 0) / 100));

  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM users WHERE uid = $1 FOR UPDATE', [req.user.uid]);
      const user = rows[0];
      if (!user) throw new Error('User not found');

      if (user.total_coins < finalPrice) throw new Error('Not enough coins');

      // Check and decrement stock
      const inStock = await decrementStock(client, crateId);
      if (!inStock) throw new Error('This crate is sold out.');

      // Deduct coins
      await client.query(
        'UPDATE users SET total_coins = total_coins - $2, updated_at = NOW() WHERE uid = $1',
        [req.user.uid, finalPrice]
      );

      // Add crate to inventory
      await addCrate(req.user.uid, crateId, client);

      // Get updated balance
      const { rows: updated } = await client.query('SELECT total_coins FROM users WHERE uid = $1', [req.user.uid]);

      return { crateId, newBalance: updated[0].total_coins };
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Crates] /buy error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ── POST /api/crates/open-owned ──────────────────────────────────────────────
// Body: { crateId }
// Open a crate from inventory. Removes from owned_crates, rolls skin, adds to owned_skins.
router.post('/open-owned', requireAuth, async (req, res) => {
  const { crateId } = req.body;
  const crate = CRATES.find(c => c.id === crateId);
  if (!crate) return res.status(400).json({ error: 'Invalid crate ID' });

  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM users WHERE uid = $1 FOR UPDATE', [req.user.uid]);
      const user = rows[0];
      if (!user) throw new Error('User not found');

      // Verify user owns at least one of this crate
      if (!user.owned_crates || !user.owned_crates.includes(crateId)) {
        throw new Error('You do not own this crate');
      }

      // Remove one crate from inventory
      await removeCrate(req.user.uid, crateId, client);

      // Roll rarity + skin (same logic as /open)
      const rarity = rollRarity(crate);
      const skinId = getRandomSkin(rarity, crateId);
      const mutation = rollMutation(skinId);
      const finalSkinId = mutation ? `${skinId}__${mutation}` : skinId;

      // Check for duplicate
      const isDuplicate = user.owned_skins.includes(finalSkinId);
      let coinRefund = 0;
      if (isDuplicate) {
        const DUPE_RATES = { common: 0.25, uncommon: 0.25, rare: 0.35, epic: 0.50, ob_epic: 0.50, legendary: 0.60, ob_legendary: 0.60, mythic: 0.60, ob_mythic: 0.60, ob_ultra: 0.60 };
        coinRefund = Math.floor(crate.price * (DUPE_RATES[rarity] || 0.25));
        if (coinRefund > 0) {
          await client.query('UPDATE users SET total_coins = total_coins + $2 WHERE uid = $1', [req.user.uid, coinRefund]);
        }
      }

      // Add skin
      await addSkin(req.user.uid, finalSkinId, client);

      // Get updated balance + crates
      const { rows: updated } = await client.query('SELECT total_coins, owned_crates FROM users WHERE uid = $1', [req.user.uid]);

      return {
        skinId: finalSkinId,
        baseSkinId: skinId,
        rarity,
        mutation,
        isDuplicate,
        coinRefund,
        newBalance: updated[0].total_coins,
        ownedCrates: updated[0].owned_crates,
      };
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Crates] /open-owned error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ── GET /api/crates/owned ────────────────────────────────────────────────────
// Returns the user's owned (unopened) crates array.
router.get('/owned', requireAuth, async (req, res) => {
  try {
    const crates = await getOwnedCrates(req.user.uid);
    return res.json({ ownedCrates: crates });
  } catch (err) {
    console.error('[Crates] /owned error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch owned crates' });
  }
});

// ── POST /api/crates/tradeup ─────────────────────────────────────────────────
// Body: { inputSkins: string[10], inputRarity: string }
// Server-authoritative trade-up. Validates ownership, removes 10 skins, rolls output.
router.post('/tradeup', requireAuth, async (req, res) => {
  const { inputSkins, inputRarity } = req.body;

  if (!Array.isArray(inputSkins) || inputSkins.length !== 10) {
    return res.status(400).json({ error: 'Exactly 10 skins required' });
  }
  const nextRarity = TRADEUP_RARITY_NEXT[inputRarity];
  if (!nextRarity) return res.status(400).json({ error: 'Invalid input rarity' });

  const cost = TRADEUP_COSTS[inputRarity] || 0;

  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM users WHERE uid = $1 FOR UPDATE', [req.user.uid]);
      const user = rows[0];
      if (!user) throw new Error('User not found');

      if (cost > 0 && user.total_coins < cost) throw new Error('Not enough coins for trade-up');

      // Validate ownership of all 10 skins
      const owned = [...user.owned_skins];
      for (const skinId of inputSkins) {
        const idx = owned.indexOf(skinId);
        if (idx === -1) throw new Error(`You don't own: ${skinId}`);
        owned.splice(idx, 1); // Remove from working copy to handle duplicates
      }

      // Deduct cost
      if (cost > 0) {
        await client.query('UPDATE users SET total_coins = total_coins - $2 WHERE uid = $1', [req.user.uid, cost]);
      }

      // Remove input skins
      let currentSkins = user.owned_skins;
      for (const skinId of inputSkins) {
        const idx = currentSkins.indexOf(skinId);
        if (idx !== -1) currentSkins = [...currentSkins.slice(0, idx), ...currentSkins.slice(idx + 1)];
      }

      // Roll output skin
      const pool = SKIN_RARITIES[nextRarity] || [];
      if (pool.length === 0) throw new Error('No skins in target pool');
      const outputBase = pool[Math.floor(Math.random() * pool.length)];

      // Mutation roll (boosted by mutated inputs)
      const mutatedCount = inputSkins.filter(s => s.includes('__')).length;
      const boostFlat = mutatedCount * 0.03;
      let mutation = null;
      const roll = Math.random();
      let cumulative = 0;
      for (const [type, cfg] of Object.entries(MUTATION_CONFIG)) {
        cumulative += cfg.chance + boostFlat / Object.keys(MUTATION_CONFIG).length;
        if (roll < cumulative) { mutation = type; break; }
      }

      const finalId = mutation ? `${outputBase}__${mutation}` : outputBase;
      currentSkins.push(finalId);

      // Write updated skins array
      await client.query(
        'UPDATE users SET owned_skins = $2, updated_at = NOW() WHERE uid = $1',
        [req.user.uid, currentSkins]
      );

      const { rows: updated } = await client.query('SELECT total_coins FROM users WHERE uid = $1', [req.user.uid]);

      return {
        outputSkinId: finalId,
        outputBase,
        outputRarity: nextRarity,
        mutation,
        newBalance: updated[0].total_coins,
      };
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Crates] /tradeup error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ── GET /api/crates/shop ─────────────────────────────────────────────────────
// Public. Backward-compat endpoint — now reads from crate_rotation.
router.get('/shop', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM crate_rotation');
    const stock = {};
    const soldCount = {};
    const discontinued = [];
    let oblivionAvailableNow = false;

    for (const row of rows) {
      stock[row.crate_id]     = row.stock_remaining ?? -1;
      soldCount[row.crate_id] = 0; // sold_count no longer tracked separately
      if (row.retired) discontinued.push(row.crate_id);
      if (row.crate_id === 'oblivion-crate' && row.active) oblivionAvailableNow = true;
    }

    return res.json({
      stock,
      soldCount,
      discontinued,
      oblivionWeekendOnly: true,
      oblivionAvailableNow,
    });
  } catch (err) {
    console.error('[Crates] /shop error:', err.message);
    return res.status(500).json({ error: 'Failed to load shop status' });
  }
});

// ── POST /api/crates/drop ────────────────────────────────────────────────────
// Body: { mode: 'classic'|'ranked', tier?: string }
// Post-game crate drop. Called by client after every match.
// 15% base chance (+2% per tier above Bronze). Cap: 5 drops/week.
router.post('/drop', requireAuth, async (req, res) => {
  const { mode, tier = 'bronze' } = req.body;
  if (!mode) return res.status(400).json({ error: 'mode required' });

  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM users WHERE uid = $1 FOR UPDATE', [req.user.uid]);
      const user = rows[0];
      if (!user) throw new Error('User not found');

      // Reset weekly counter if needed
      const weekStart = getWeekStart();
      const needsReset = !user.crate_drops_week_start || new Date(user.crate_drops_week_start) < weekStart;
      const currentDrops = needsReset ? 0 : (user.weekly_crate_drops || 0);

      if (currentDrops >= MAX_WEEKLY_DROPS) {
        return { dropped: false, reason: 'cap', weeklyDrops: currentDrops };
      }

      // Roll drop chance
      const bonus = TIER_DROP_BONUS[tier] || 0;
      const chance = BASE_DROP_CHANCE + bonus;
      if (Math.random() > chance) {
        // No drop — still reset counter if needed
        if (needsReset) {
          await client.query(
            'UPDATE users SET weekly_crate_drops = 0, crate_drops_week_start = $2 WHERE uid = $1',
            [req.user.uid, weekStart]
          );
        }
        return { dropped: false, weeklyDrops: currentDrops };
      }

      // Select crate
      const crateId = rollDropCrate();

      // Award crate + update drop counter
      await addCrate(req.user.uid, crateId, client);
      const newDrops = currentDrops + 1;
      await client.query(
        `UPDATE users
            SET weekly_crate_drops = $2,
                crate_drops_week_start = $3,
                updated_at = NOW()
          WHERE uid = $1`,
        [req.user.uid, newDrops, needsReset ? weekStart : user.crate_drops_week_start]
      );

      return { dropped: true, crateId, weeklyDrops: newDrops };
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Crates] /drop error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ── GET /api/crates/validate-skin/:skinId ────────────────────────────────────
// Quick endpoint to check if a skin ID is valid (used by admin tools)
router.get('/validate-skin/:skinId', requireAuth, (req, res) => {
  return res.json({ valid: isValidSkinId(req.params.skinId) });
});

// Export the validator for use in auth.js skin sync
router.isValidSkinId = isValidSkinId;

module.exports = router;
