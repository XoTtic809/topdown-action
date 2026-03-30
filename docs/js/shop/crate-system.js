// crate-system.js

const _crateAudioCtx = (() => {
  try { return new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return null; }
})();

function cratePlaySound(type) {
  if (!_crateAudioCtx) return;
  // Resume context on first user gesture (browser autoplay policy)
  if (_crateAudioCtx.state === 'suspended') _crateAudioCtx.resume();

  const ctx = _crateAudioCtx;
  const now = ctx.currentTime;

  function tone(freq, gainVal, duration, waveType = 'sine', endFreq = null) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = waveType;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) osc.frequency.linearRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration);
  }

  switch (type) {
    case 'tick':
      tone(600, 0.08, 0.04, 'square');
      break;
    case 'spin_start':
      // Rising sweep
      tone(200, 0.12, 0.4, 'sawtooth', 600);
      break;
    case 'land':
      tone(440, 0.25, 0.15, 'sine');
      setTimeout(() => tone(550, 0.2, 0.2, 'sine'), 80);
      break;
    case 'epic_land':
      tone(350, 0.3, 0.2, 'sine', 700);
      setTimeout(() => tone(700, 0.25, 0.3, 'sine'), 100);
      setTimeout(() => tone(880, 0.2, 0.4, 'sine'), 220);
      break;
    case 'legendary_land':
      tone(300, 0.35, 0.25, 'sine', 900);
      setTimeout(() => tone(600, 0.3, 0.3, 'sine'), 80);
      setTimeout(() => tone(900, 0.28, 0.4, 'sine'), 180);
      setTimeout(() => tone(1200, 0.22, 0.5, 'sine'), 300);
      break;
    case 'win':
      // Happy chord
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.4, 'sine'), i * 80));
      break;
    case 'coin':
      tone(880, 0.15, 0.1, 'sine');
      setTimeout(() => tone(1100, 0.12, 0.15, 'sine'), 80);
      break;
  }
}

const CRATES = [
  {
    id: 'common-crate',
    name: 'Common Case',
    price: 300,
    color: '#78b7ff',
    desc: 'Contains 1 random skin from the common pool',
    icon: '📦',
    rarityWeights: {
      common: 0.67,    // 67% chance
      uncommon: 0.25,  // 25% chance
      rare: 0.08       // 8% chance
    }
  },
  {
    id: 'rare-crate',
    name: 'Rare Case',
    price: 750,
    color: '#9d7aff',
    desc: 'Better odds! Contains 1 skin with higher rarity chances',
    icon: '🎁',
    rarityWeights: {
      common: 0.37,    // 37% chance
      uncommon: 0.40,  // 40% chance
      rare: 0.15,      // 15% chance
      epic: 0.08       // 8% chance
    }
  },
  {
    id: 'epic-crate',
    name: 'Epic Case',
    price: 1500,
    color: '#ff78b7',
    desc: 'Premium case with guaranteed epic or better!',
    icon: '🎭',
    rarityWeights: {
      uncommon: 0.30,  // 30% chance
      rare: 0.40,      // 40% chance
      epic: 0.25,      // 25% chance
      legendary: 0.05  // 5% chance
    }
  },
  {
    id: 'legendary-crate',
    name: 'Legendary Case',
    price: 4000,
    color: '#ffd700',
    desc: 'Ultimate case! Guaranteed legendary or mythic skin!',
    icon: '⭐',
    rarityWeights: {
      rare: 0.20,      // 20% chance
      epic: 0.55,      // 55% chance
      legendary: 0.20, // 20% chance
      mythic: 0.05     // 5% chance
    }
  },
  {
    id: 'icon-crate',
    name: 'Icon Skins Case',
    price: 750,
    color: '#00ff9d',
    desc: 'Exclusive friend skins! 8 regular + 1 ultra-rare secret!',
    icon: '🎯',
    rarityWeights: {
      icon: 0.995,   // 99.5% chance - shared among 8 skins (12.4375% each)
      creator: 0.005 // 0.5% chance - THE CREATOR only
    }
  },
  {
    id: 'oblivion-crate',
    name: 'Oblivion Case',
    price: 10000,
    color: '#1a0a2e',
    glowColor: '#8a2be2',
    desc: 'The darkest case. Only high-tier skins. Two ultra-rare exclusives.',
    icon: '🌑',
    rarityWeights: {
      ob_epic: 0.50,      // 50% — Oblivion Epics
      ob_legendary: 0.30, // 30% — Oblivion Legendaries
      ob_mythic: 0.15,    // 15% — Oblivion Mythics
      ob_ultra: 0.05      // 5%  — WORLDEATER / ETERNIUM
    }
  },
  {
    id: 'neon-crate',
    name: 'Neon Case',
    price: 2000,
    color: '#00e5ff',
    glowColor: '#00e5ff',
    desc: 'Electric cyberpunk exclusives — always in rotation.',
    icon: '⚡',
    rarityWeights: {
      uncommon: 0.30,
      rare: 0.40,
      epic: 0.25,
      legendary: 0.05
    }
  },
  {
    id: 'frost-crate',
    name: 'Frost Case',
    price: 2500,
    color: '#a8d8ea',
    glowColor: '#7fdbff',
    desc: 'Ice & winter exclusives — seasonal rotation.',
    icon: '❄️',
    rarityWeights: {
      uncommon: 0.30,
      rare: 0.40,
      epic: 0.25,
      legendary: 0.05
    }
  },
  {
    id: 'infernal-crate',
    name: 'Infernal Case',
    price: 2500,
    color: '#ff4500',
    glowColor: '#ff6600',
    desc: 'Fire & heat exclusives — seasonal rotation.',
    icon: '🔥',
    rarityWeights: {
      uncommon: 0.30,
      rare: 0.40,
      epic: 0.25,
      legendary: 0.05
    }
  },
  {
    id: 'void-crate',
    name: 'Void Case',
    price: 6000,
    color: '#1a0040',
    glowColor: '#6600cc',
    desc: 'Premium dark/space exclusives — limited stock.',
    icon: '🌀',
    rarityWeights: {
      rare: 0.25,
      epic: 0.40,
      legendary: 0.30,
      mythic: 0.05
    }
  }
];

const SKIN_RARITIES = {
  // common/uncommon crate skins (map to 'common' marketplace tier)
  common:    ['c_static', 'c_rust', 'c_slate', 'c_olive', 'c_maroon', 'inferno', 'venom', 'ice', 'c_moss', 'c_ash', 'c_dusk', 'c_clay'],
  uncommon:  ['c_cobalt', 'c_teal', 'c_coral', 'c_sand', 'c_chrome', 'shadow', 'amber', 'crimson', 'gold', 'ocean', 'toxic', 'c_sapphire', 'c_mint', 'c_bronze_skin', 'c_storm_grey'],
  // rare crate skins (map to 'rare' marketplace tier)
  rare:      ['c_prism', 'c_aurora', 'c_lava', 'c_storm', 'c_neon', 'magma', 'plasma', 'emerald', 'frost', 'midnight', 'sakura', 'c_bloodmoon', 'c_frostfire', 'c_vortex', 'c_toxic_waste'],
  // epic crate skins (map to 'epic' marketplace tier)
  epic:      ['c_glitch', 'c_nebula', 'c_biohazard', 'c_arctic', 'c_wildfire', 'c_spectre', 'electric', 'ruby', 'lime', 'violet', 'rainbow', 'copper', 'cyber', 'sunset', 'c_blackhole', 'c_dragonscale', 'c_hologram', 'c_thunderstrike'],
  // legendary crate skins (map to 'legendary' marketplace tier)
  legendary: ['c_supernova', 'c_wraith', 'c_titan', 'c_astral', 'galaxy', 'phoenix', 'void', 'diamond', 'c_eclipse', 'c_abyssal_flame', 'c_zero_point'],
  // mythic crate skins (map to 'mythic' marketplace tier)
  mythic:    ['c_omnichrome', 'c_singularity', 'c_ultraviolet', 'c_godmode', 'c_rift', 'quantum', 'celestial', 'c_entropy', 'c_dimension_rift', 'c_eternal']
};

// Oblivion Crate - Premium exclusive pools
const OBLIVION_SKIN_RARITIES = {
  ob_epic:      ['ob_duskblade', 'ob_voidborn', 'ob_ashwalker', 'ob_nightcrawler', 'ob_ironwraith'],
  ob_legendary: ['ob_soulreaper', 'ob_eclipsar', 'ob_phantomking', 'ob_hellforge', 'ob_gravemind'],
  ob_mythic:    ['ob_abyssal', 'ob_eventide', 'ob_voidwalker', 'ob_deathbloom'],
  ob_ultra:     ['ob_worldeater', 'ob_eternium', 'ob_apocalypse']
};

// Themed Crate - Exclusive pools
const NEON_SKIN_RARITIES = {
  uncommon:  ['neon_pulse', 'neon_grid'],
  rare:      ['neon_surge', 'neon_cipher'],
  epic:      ['neon_overload'],
  legendary: ['neon_synthwave']
};
const FROST_SKIN_RARITIES = {
  uncommon:  ['frost_snowdrift', 'frost_icicle'],
  rare:      ['frost_blizzard', 'frost_permafrost'],
  epic:      ['frost_avalanche'],
  legendary: ['frost_absolute_zero']
};
const INFERNAL_SKIN_RARITIES = {
  uncommon:  ['infernal_ember', 'infernal_cinder'],
  rare:      ['infernal_wildfire', 'infernal_eruption'],
  epic:      ['infernal_hellstorm'],
  legendary: ['infernal_solar_flare']
};
const VOID_SKIN_RARITIES = {
  rare:      ['void_hollow'],
  epic:      ['void_nebula_core', 'void_dark_matter'],
  legendary: ['void_event_horizon'],
  mythic:    ['void_big_bang']
};

// Icon Skins - Split into regular and ultra-rare creator
const ICON_SKIN_RARITIES = {
  icon: ['icon_noah_brown', 'icon_keegan_baseball', 'icon_dpoe_fade', 'icon_evan_watermelon', 'icon_gavin_tzl', 'icon_carter_cosmic', 'icon_brody_flag', 'icon_sterling', 'icon_justin_clover', 'icon_profe_spain', 'icon_kayden_duck', 'icon_troy_puck'], // shared among these 12
  creator: ['icon_the_creator'] // 0.5% chance - ultra rare
};

function getRarityColor(rarity) {
  const colors = {
    common: '#78b7ff',
    uncommon: '#9d7aff',
    rare: '#ff78b7',
    epic: '#ff9d47',
    legendary: '#ffd700',
    mythic: '#ff69ff',
    icon: '#00ff9d',
    creator: '#ffd700',
    ob_epic: '#9055ff',
    ob_legendary: '#c44dff',
    ob_mythic: '#e040fb',
    ob_ultra: '#ff2060'
  };
  return colors[rarity] || '#78b7ff';
}

function getRarityName(rarity) {
  const names = {
    common: 'COMMON',
    uncommon: 'UNCOMMON',
    rare: 'RARE',
    epic: 'EPIC',
    legendary: 'LEGENDARY',
    mythic: 'MYTHIC',
    icon: 'ICON',
    creator: 'DIVINE',
    ob_epic: 'EPIC',
    ob_legendary: 'LEGENDARY',
    ob_mythic: 'MYTHIC',
    ob_ultra: 'ULTRA RARE'
  };
  return names[rarity] || 'COMMON';
}

function rollRarity(crate) {
  const rand = Math.random();
  let cumulative = 0;
  
  for (const [rarity, weight] of Object.entries(crate.rarityWeights)) {
    cumulative += weight;
    if (rand < cumulative) {
      return rarity;
    }
  }
  
  // Fallback
  return Object.keys(crate.rarityWeights)[0];
}

function getRandomSkinFromRarity(rarity, crateId) {
  let pool;
  if (crateId === 'icon-crate') {
    pool = ICON_SKIN_RARITIES[rarity] || ICON_SKIN_RARITIES.icon;
  } else if (crateId === 'oblivion-crate') {
    pool = OBLIVION_SKIN_RARITIES[rarity] || OBLIVION_SKIN_RARITIES.ob_epic;
  } else if (crateId === 'neon-crate')      { pool = NEON_SKIN_RARITIES[rarity]     || []; }
  else if (crateId === 'frost-crate')       { pool = FROST_SKIN_RARITIES[rarity]    || []; }
  else if (crateId === 'infernal-crate')    { pool = INFERNAL_SKIN_RARITIES[rarity] || []; }
  else if (crateId === 'void-crate')        { pool = VOID_SKIN_RARITIES[rarity]     || []; }
  else {
    pool = SKIN_RARITIES[rarity] || SKIN_RARITIES.common;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Pity Timer System ───────────────────────────────────────
// Tracks consecutive opens without high-rarity drops.
// Legendary Crate: after 20 opens without legendary+, guarantee legendary.
// Any crate: after 50 opens without mythic, double mythic chance for next 10.
const _pityState = JSON.parse(localStorage.getItem('cratePityState') || '{}');
function _savePityState() { localStorage.setItem('cratePityState', JSON.stringify(_pityState)); }

function _checkPityOverride(crateId, rolledRarity) {
  if (!_pityState[crateId]) _pityState[crateId] = { sinceHighRarity: 0, sinceMythic: 0 };
  const ps = _pityState[crateId];

  // Legendary Crate pity: guarantee legendary after 20 opens without legendary+
  if (crateId === 'legendary-crate') {
    const isHighRarity = (rolledRarity === 'legendary' || rolledRarity === 'mythic');
    if (isHighRarity) { ps.sinceHighRarity = 0; }
    else {
      ps.sinceHighRarity++;
      if (ps.sinceHighRarity >= 20) { ps.sinceHighRarity = 0; _savePityState(); return 'legendary'; }
    }
  }

  // Global mythic pity: double mythic chance after 50 opens of any type
  const isMythic = (rolledRarity === 'mythic' || rolledRarity === 'ob_mythic' || rolledRarity === 'ob_ultra');
  if (isMythic) { ps.sinceMythic = 0; }
  else { ps.sinceMythic++; }

  _savePityState();
  return null; // no override
}

function _updatePityCounters(crateId, rarity) {
  if (!_pityState[crateId]) _pityState[crateId] = { sinceHighRarity: 0, sinceMythic: 0 };
  const ps = _pityState[crateId];
  const isHighRarity = (rarity === 'legendary' || rarity === 'mythic');
  if (isHighRarity) ps.sinceHighRarity = 0; else ps.sinceHighRarity++;
  const isMythic = (rarity === 'mythic' || rarity === 'ob_mythic' || rarity === 'ob_ultra');
  if (isMythic) ps.sinceMythic = 0; else ps.sinceMythic++;
  _savePityState();
}

async function openCrate(crateId) {
  const crate = CRATES.find(c => c.id === crateId);
  if (!crate) return null;

  // Check if player has free crates from battle pass
  let hasFreeCrate = false;
  if (typeof battlePassData !== 'undefined' && battlePassData.crateInventory) {
    if (battlePassData.crateInventory[crateId] > 0) {
      hasFreeCrate = true;
    }
  }

  if (!hasFreeCrate && playerCoins < crate.price) {
    showCrateMessage('Not enough coins!', true);
    return null;
  }

  const isLoggedIn = typeof currentUser !== 'undefined' && currentUser
    && !(typeof isGuest !== 'undefined' && isGuest);

  // ── Server-authoritative crate open for logged-in paid crates ──
  if (isLoggedIn && !hasFreeCrate) {
    try {
      const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('topdown_token');
      const resp = await fetch(`${API_BASE}/crates/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ crateId }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        showCrateMessage(err.error || 'Failed to open case', true);
        return null;
      }
      const data = await resp.json();

      // Update local state from server response
      playerCoins = data.newBalance;
      if (!ownedSkins.includes(data.skinId)) ownedSkins.push(data.skinId);
      saveCoins();

      // Update pity tracking from server result
      _updatePityCounters(crateId, data.rarity);

      const skin = SKINS.find(s => s.id === data.baseSkinId);
      return {
        crate,
        rewards: [{
          skin: skin || { id: data.baseSkinId, name: data.baseSkinId, color: '#888' },
          skinId: data.skinId,
          rarity: data.rarity,
          isDuplicate: data.isDuplicate || false,
          coinValue: data.coinRefund || 0,
          mutation: data.mutation || null,
        }],
      };
    } catch (e) {
      showCrateMessage('Network error opening case', true);
      return null;
    }
  }

  // ── Client-side fallback for guests / free BP crates ──
  if (hasFreeCrate) {
    battlePassData.crateInventory[crateId]--;
    console.log(`📦 Using free ${crateId} from inventory`);
    if (typeof saveBattlePassData === 'function') saveBattlePassData();
  } else {
    playerCoins -= crate.price;
    saveCoins();
  }

  // Roll for exactly 1 item
  const rewards = [];
  let rarity, skinId;

  if (crateId === 'icon-crate' && typeof devForceCreatorFlag !== 'undefined' && devForceCreatorFlag) {
    rarity = 'creator';
    skinId = 'icon_the_creator';
    devForceCreatorFlag = false;
  } else {
    rarity = rollRarity(crate);
    const pityOverride = _checkPityOverride(crateId, rarity);
    if (pityOverride) rarity = pityOverride;
    skinId = getRandomSkinFromRarity(rarity, crateId);
  }

  const skin = SKINS.find(s => s.id === skinId);

  if (skin) {
    let mutation = null;
    if (typeof MUTATION_CONFIG !== 'undefined' && !skin.iconSkin && skinId !== 'icon_the_creator') {
      const roll = Math.random();
      let cumulative = 0;
      for (const [type, cfg] of Object.entries(MUTATION_CONFIG)) {
        cumulative += cfg.chance;
        if (roll < cumulative) { mutation = type; break; }
      }
    }

    const finalSkinId = mutation ? `${skinId}__${mutation}` : skinId;
    const isDuplicate = ownedSkins.includes(finalSkinId);
    let coinValue = 0;
    if (isDuplicate) {
      const DUPE_REFUND_RATES = {
        common: 0.25, uncommon: 0.25, rare: 0.35,
        epic: 0.50, ob_epic: 0.50,
        legendary: 0.60, ob_legendary: 0.60,
        mythic: 0.60, ob_mythic: 0.60, ob_ultra: 0.60,
      };
      coinValue = Math.floor(crate.price * (DUPE_REFUND_RATES[rarity] || 0.25));
      playerCoins += coinValue;
    }

    ownedSkins.push(finalSkinId);
    rewards.push({ skin, skinId: finalSkinId, rarity, isDuplicate, coinValue, mutation });
  }

  saveCoins();
  saveSkins();
  return { crate, rewards };
}

let isOpeningCrate = false;

// ── Confirmation dialog before opening a crate ───────────────────────────────
function showCrateConfirm(crate, costText, onConfirm) {
  // Remove any existing confirm dialog
  const existing = document.getElementById('crateConfirmOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'crateConfirmOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.75);
    display:flex;align-items:center;justify-content:center;
    z-index:10000;backdrop-filter:blur(4px);
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    background:linear-gradient(135deg,#0d1525 0%,#0a0f1e 100%);
    border:1px solid ${crate.color || '#4a9eff'}60;
    border-radius:16px;padding:28px 32px;text-align:center;
    max-width:320px;width:90%;
    box-shadow:0 0 40px ${crate.color || '#4a9eff'}30;
    font-family:'Orbitron',sans-serif;
  `;

  box.innerHTML = `
    <div style="font-size:32px;margin-bottom:10px">${crate.icon || '📦'}</div>
    <div style="font-size:15px;font-weight:700;color:#dbe7ff;letter-spacing:1px;margin-bottom:6px">
      Open ${crate.name}?
    </div>
    <div style="font-size:12px;color:${crate.color || '#4a9eff'};margin-bottom:22px;letter-spacing:0.5px">
      Cost: ${costText}
    </div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button id="crateConfirmYes" style="
        background:${crate.color || '#4a9eff'}22;border:1px solid ${crate.color || '#4a9eff'};
        color:#dbe7ff;padding:9px 28px;border-radius:8px;cursor:pointer;
        font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;
        transition:background 0.15s;
      ">OPEN</button>
      <button id="crateConfirmNo" style="
        background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);
        color:rgba(219,231,255,0.55);padding:9px 28px;border-radius:8px;cursor:pointer;
        font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;
      ">CANCEL</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById('crateConfirmYes').onclick = () => { close(); onConfirm(); };
  document.getElementById('crateConfirmNo').onclick  = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

async function showCrateOpeningAnimation(crateId) {
  if (isOpeningCrate) return;

  const result = await openCrate(crateId);
  if (!result) return;
  
  isOpeningCrate = true;
  const modal = document.getElementById('crateOpenModal');
  const animation = document.getElementById('crateOpenAnimation');
  const results = document.getElementById('crateResults');
  
  modal.classList.remove('hidden');
  animation.classList.remove('hidden');
  results.classList.add('hidden');
  
  const reel = document.getElementById('crateReel');
  reel.innerHTML = '';
  
  const winningItem = result.rewards[0];

  // CS2 Style: Generate more items for longer scroll (80 items, winner at position 70)
  const totalItems = 80;
  const winningPosition = 70;
  const reelItems = [];
  
  for (let i = 0; i < totalItems; i++) {
    if (i === winningPosition) {
      // Place the ACTUAL winning item here
      reelItems[i] = {
        skin: winningItem.skin,
        rarity: winningItem.rarity,
        isDuplicate: winningItem.isDuplicate,
        coinValue: winningItem.coinValue,
        mutation: winningItem.mutation,
      };
    } else {
      // Generate random items for other positions
      const randomRarity = rollRarity(result.crate);
      const randomSkin = getRandomSkinFromRarity(randomRarity, result.crate.id);
      const skin = SKINS.find(s => s.id === randomSkin);
      reelItems[i] = { skin, rarity: randomRarity };
    }
  }

  reelItems.forEach((item, index) => {
    const reelItem = document.createElement('div');
    reelItem.className = 'crate-reel-item';
    
    // Mark the winning item
    if (index === winningPosition) {
      reelItem.classList.add('winning-item');
      reelItem.setAttribute('data-winner', 'true');
    }
    
    reelItem.style.background = `linear-gradient(135deg, ${getRarityColor(item.rarity)}55, ${getRarityColor(item.rarity)}22)`;
    reelItem.style.borderColor = getRarityColor(item.rarity);
    
    const preview = document.createElement('div');
    preview.className = 'crate-item-preview';

    // Delegate to single source of truth in skin-previews.js
    applySkinPreview(preview, item.skin.id, item.skin.color || getRarityColor(item.rarity));
    // Apply mutation visual on winning reel item
    if (item.mutation && typeof MUTATION_CONFIG !== 'undefined' && MUTATION_CONFIG[item.mutation]) {
      const mc = MUTATION_CONFIG[item.mutation];
      preview.classList.add(mc.cssClass);
      if (mc.cssFilter) preview.style.filter = mc.cssFilter;
    }

    const name = document.createElement('div');
    name.className = 'crate-item-name';
    name.textContent = item.mutation && typeof MUTATION_CONFIG !== 'undefined' && MUTATION_CONFIG[item.mutation]
      ? `${item.skin.name} [${MUTATION_CONFIG[item.mutation].label}]`
      : item.skin.name;
    
    const rarityTag = document.createElement('div');
    rarityTag.className = 'crate-item-rarity';
    rarityTag.textContent = getRarityName(item.rarity);
    rarityTag.style.color = getRarityColor(item.rarity);
    
    reelItem.appendChild(preview);
    reelItem.appendChild(name);
    reelItem.appendChild(rarityTag);
    reel.appendChild(reelItem);
  });
  
  // Play opening animation sound
  cratePlaySound('spin_start');
  
  // Animate the reel - CS2 style
  // Measure actual rendered item size (accounts for padding/border/CSS)
  const firstReelItem = reel.querySelector('.crate-reel-item');
  const actualItemWidth = firstReelItem ? firstReelItem.offsetWidth : 120;
  const reelGap = 20; // must match CSS gap on .crate-reel
  const itemSlotWidth = actualItemWidth + reelGap;
  
  // CS2 Style: Perfect centering (no random offset)
  // The reel starts at left:50% in CSS, so item 0's left edge is at container center.
  // To center the winning item: translate = -(winningPosition * slotWidth + itemWidth/2)
  const targetPosition = -(winningPosition * itemSlotWidth + actualItemWidth / 2);
  
  // CS2 Style: Longer spin duration with slight variance (7-9 seconds)
  const spinDuration = 7000 + Math.random() * 2000; // 7-9 seconds
  
  // Start slow
  reel.style.transition = 'none';
  reel.style.transform = 'translateX(0)';
  
  // CS2 Style: Smooth deceleration with custom easing
  // cubic-bezier for that signature CS2 slow-down feel
  setTimeout(() => {
    reel.style.transition = `transform ${spinDuration}ms cubic-bezier(0.1, 0.6, 0.2, 1)`;
    reel.style.transform = `translateX(${targetPosition}px)`;
  }, 50);
  
  // CS2 Style: Tick sounds during spin with realistic deceleration
  let tickInterval = 60; // Start faster than before
  let lastTickTime = Date.now();
  
  function playTicksDeceleratingCS2(elapsed, duration) {
    if (elapsed >= duration - 300) return; // Stop ticking near the end
    
    const now = Date.now();
    if (now - lastTickTime >= tickInterval) {
      cratePlaySound('tick');
      lastTickTime = now;
      
      // CS2 Style: Gradual slowdown curve
      const progress = elapsed / duration;
      // Exponential slowdown for that CS2 feel
      tickInterval = 60 + Math.floor(Math.pow(progress, 2.5) * 400);
    }
    
    requestAnimationFrame(() => playTicksDeceleratingCS2(elapsed + 16, duration));
  }
  setTimeout(() => playTicksDeceleratingCS2(0, spinDuration), 100);
  
  // CS2 Style: Landing animation triggers just before stop
  const landingTime = spinDuration - 400; // 400ms before completion
  setTimeout(() => {
    // Play special landing sound based on rarity
    const reward = winningItem;
    if (reward.rarity === 'legendary' || reward.rarity === 'mythic' || reward.rarity === 'ob_legendary' || reward.rarity === 'ob_mythic' || reward.rarity === 'ob_ultra') {
      cratePlaySound('legendary_land');
    } else if (reward.rarity === 'epic' || reward.rarity === 'ob_epic') {
      cratePlaySound('epic_land');
    } else {
      cratePlaySound('land');
    }
    
    // Add glow effect to winning item
    const winningItemEl = document.querySelector('.winning-item');
    if (winningItemEl) {
      winningItemEl.classList.add('item-landed');
    }
  }, landingTime);
  
  // CS2 Style: Show results after full animation completes
  const totalAnimationTime = spinDuration + 600; // Extra 600ms for impact
  setTimeout(() => {
    animation.classList.add('hidden');
    results.classList.remove('hidden');
    displayCrateResults(result);
    
    // Final celebration sound
    cratePlaySound('win');
  }, totalAnimationTime);
}

function displayCrateResults(result) {
  const container = document.getElementById('crateRewardsList');
  container.innerHTML = '';
  
  const reward = result.rewards[0]; // Only 1 item now
  
  const card = document.createElement('div');
  card.className = 'crate-reward-card single-reward';
  card.style.borderColor = getRarityColor(reward.rarity);
  card.style.background = `linear-gradient(135deg, ${getRarityColor(reward.rarity)}33, ${getRarityColor(reward.rarity)}11)`;
  card.style.boxShadow = `0 0 40px ${getRarityColor(reward.rarity)}77`;
  
  const preview = document.createElement('div');
  preview.className = 'crate-reward-preview large-preview';
  // Delegate to single source of truth in skin-previews.js
  applySkinPreview(preview, reward.skin.id, reward.skin.color || getRarityColor(reward.rarity));
  if (reward.mutation && typeof MUTATION_CONFIG !== 'undefined' && MUTATION_CONFIG[reward.mutation]) {
    const mc = MUTATION_CONFIG[reward.mutation];
    preview.classList.add(mc.cssClass);
    if (mc.cssFilter) preview.style.filter = mc.cssFilter;
    preview.style.boxShadow = (preview.style.boxShadow ? preview.style.boxShadow + ', ' : '') + `0 0 40px ${mc.glowColor}`;
  }

  const info = document.createElement('div');
  info.className = 'crate-reward-info';

  const name = document.createElement('div');
  name.className = 'crate-reward-name large-name';
  name.textContent = reward.mutation && MUTATION_CONFIG?.[reward.mutation]
    ? `${reward.skin.name} [${MUTATION_CONFIG[reward.mutation].label}]`
    : reward.skin.name;
  if (reward.mutation && MUTATION_CONFIG?.[reward.mutation]) {
    name.style.color = MUTATION_CONFIG[reward.mutation].color;
    name.style.textShadow = `0 0 12px ${MUTATION_CONFIG[reward.mutation].color}`;
  }

  const rarity = document.createElement('div');
  rarity.className = 'crate-reward-rarity large-rarity';

  // Special handling for THE CREATOR - no rarity, custom message
  if (reward.skin.id === 'icon_the_creator') {
    rarity.textContent = '✨ DIVINE CREATION ✨';
    rarity.style.color = '#ffd700';
    rarity.style.textShadow = '0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 255, 255, 0.6)';
    rarity.style.fontSize = '16px';
    rarity.style.fontWeight = '900';
    rarity.style.letterSpacing = '3px';
  } else {
    rarity.textContent = getRarityName(reward.rarity);
    rarity.style.color = getRarityColor(reward.rarity);
  }

  // Mutation reveal badge
  let mutationReveal = null;
  if (reward.mutation && typeof MUTATION_CONFIG !== 'undefined' && MUTATION_CONFIG[reward.mutation]) {
    const mc = MUTATION_CONFIG[reward.mutation];
    mutationReveal = document.createElement('div');
    mutationReveal.className = `crate-mutation-reveal ${mc.cssClass}`;
    mutationReveal.textContent = `✦ ${mc.label} MUTATION ✦`;
    mutationReveal.style.color = mc.color;
    mutationReveal.style.textShadow = `0 0 14px ${mc.glowColor}`;
  }
  
  const status = document.createElement('div');
  status.className = 'crate-reward-status large-status';
  // Special unlock message for THE CREATOR
  if (reward.skin.id === 'icon_the_creator') {
    status.innerHTML = `<div style="font-size: 36px; margin-bottom: 12px;">👑</div><div style="font-size: 20px; font-weight: 900; margin-bottom: 6px; background: linear-gradient(90deg, #ffd700, #ffffff, #ff69b4, #00ffff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">YOU HAVE UNLOCKED THE CREATOR!</div><div style="font-size: 14px; color: rgba(255,255,255,0.8); margin-top: 8px;">The ultimate power has been bestowed upon you.</div>`;
    status.style.textAlign = 'center';
  } else {
    if (reward.isDuplicate && reward.coinValue > 0) {
      status.innerHTML = `<div style="font-size: 32px; margin-bottom: 8px;">🔁</div>DUPLICATE — +${reward.coinValue.toLocaleString()} coins refunded!`;
      status.style.color = '#ffbb33';
    } else {
      status.innerHTML = `<div style="font-size: 32px; margin-bottom: 8px;">✨</div>SKIN ADDED TO INVENTORY!`;
      status.style.color = '#6bff7b';
    }
    status.style.fontWeight = '700';
    status.style.fontSize = '18px';
  }
  
  info.appendChild(name);
  info.appendChild(rarity);
  if (mutationReveal) info.appendChild(mutationReveal);
  info.appendChild(status);
  
  card.appendChild(preview);
  card.appendChild(info);
  container.appendChild(card);
  
  // Update summary
  const summary = document.getElementById('crateSummary');
  const rerollCost = Math.floor((result.crate.price || 0) * 0.5);
  const canReroll  = !result._rerolled && rerollCost > 0;

  summary.innerHTML = `
      <div class="crate-summary-stat">
        <span class="crate-summary-label">Result:</span>
        <span class="crate-summary-value" style="color: #6bff7b;">New Skin!</span>
      </div>
      <div class="crate-summary-stat">
        <span class="crate-summary-label">Rarity:</span>
        <span class="crate-summary-value" style="color: ${getRarityColor(reward.rarity)};">${getRarityName(reward.rarity)}</span>
      </div>
      <div class="crate-summary-stat">
        <span class="crate-summary-label">Your Balance:</span>
        <span class="crate-summary-value">🪙 ${playerCoins.toLocaleString()}</span>
      </div>
    `;

  // Re-roll button — one-time offer per crate open at 50% of crate price
  if (canReroll) {
    const rerollBtn = document.createElement('button');
    rerollBtn.className = 'crate-reroll-btn';
    rerollBtn.textContent = `🔄 Re-roll (${rerollCost.toLocaleString()} coins)`;
    rerollBtn.style.cssText = 'margin-top:12px;padding:10px 24px;background:linear-gradient(135deg,#ff9800,#f44336);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:15px;';
    if (typeof playerCoins === 'undefined' || playerCoins < rerollCost) {
      rerollBtn.disabled = true;
      rerollBtn.style.opacity = '0.5';
      rerollBtn.title = 'Not enough coins';
    }
    rerollBtn.onclick = async () => {
      if (typeof playerCoins === 'undefined' || playerCoins < rerollCost) return;
      rerollBtn.disabled = true;
      rerollBtn.style.opacity = '0.5';

      const originalSkinId = reward.skinId || (reward.mutation
        ? `${reward.skin.id}__${reward.mutation}` : reward.skin.id);

      const isLoggedIn = typeof currentUser !== 'undefined' && currentUser
        && !(typeof isGuest !== 'undefined' && isGuest);

      let newResult = null;

      if (isLoggedIn) {
        // Server-authoritative reroll — charges 50% server-side
        try {
          const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('topdown_token');
          const resp = await fetch(`${API_BASE}/crates/reroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ crateId: result.crate.id, originalSkinId }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            showCrateMessage(err.error || 'Re-roll failed', true);
            rerollBtn.disabled = false;
            rerollBtn.style.opacity = '1';
            return;
          }
          const data = await resp.json();
          playerCoins = data.newBalance;
          // Sync local skin list: remove old, add new
          const idx = ownedSkins.lastIndexOf(originalSkinId);
          if (idx !== -1) ownedSkins.splice(idx, 1);
          if (!ownedSkins.includes(data.skinId)) ownedSkins.push(data.skinId);
          if (typeof saveCoins === 'function') saveCoins();

          const skin = typeof SKINS !== 'undefined' && SKINS.find(s => s.id === data.baseSkinId);
          newResult = {
            crate: result.crate,
            rewards: [{
              skin: skin || { id: data.baseSkinId, name: data.baseSkinId, color: '#888' },
              skinId: data.skinId,
              rarity: data.rarity,
              isDuplicate: data.isDuplicate || false,
              coinValue: data.coinRefund || 0,
              mutation: data.mutation || null,
            }],
          };
        } catch (e) {
          showCrateMessage('Network error during re-roll', true);
          rerollBtn.disabled = false;
          rerollBtn.style.opacity = '1';
          return;
        }
      } else {
        // Guest/offline path: remove skin locally, deduct cost, open client-side
        const idx = ownedSkins.lastIndexOf(originalSkinId);
        if (idx !== -1) ownedSkins.splice(idx, 1);
        playerCoins -= rerollCost;
        if (typeof saveCoins === 'function') saveCoins();
        newResult = await openCrate(result.crate.id);
      }

      if (newResult) {
        newResult._rerolled = true;
        displayCrateResults(newResult);
      }
    };
    summary.appendChild(rerollBtn);
  }
}

function closeCrateModal() {
  const modal = document.getElementById('crateOpenModal');
  modal.classList.add('hidden');
  isOpeningCrate = false;
  
  // Refresh shop UI to show new skins
  if (typeof initShopUI === 'function') {
    initShopUI();
  }
}

function showCrateMessage(msg, isError = false) {
  const msgEl = document.getElementById('crateMessage');
  if (!msgEl) return;
  
  msgEl.textContent = msg;
  msgEl.style.color = isError ? '#ff4757' : '#6bff7b';
  msgEl.classList.remove('hidden');
  
  setTimeout(() => {
    msgEl.classList.add('hidden');
  }, 3000);
}

// CRATE INDEX / BROWSE CONTENTS

function showCrateIndex(crateId) {
  const crate = CRATES.find(c => c.id === crateId);
  if (!crate) return;

  const modal = document.getElementById('crateIndexModal');
  const title = document.getElementById('crateIndexTitle');
  const body  = document.getElementById('crateIndexBody');

  title.textContent = `${crate.icon} ${crate.name} — Contents`;
  title.style.color = crate.color;
  body.innerHTML = '';

  // Determine which pool to use
  const isIcon = crateId === 'icon-crate';
  const isOblivion = crateId === 'oblivion-crate';
  const pool = crateId === 'oblivion-crate'  ? OBLIVION_SKIN_RARITIES
    : crateId === 'icon-crate'               ? ICON_SKIN_RARITIES
    : crateId === 'neon-crate'               ? NEON_SKIN_RARITIES
    : crateId === 'frost-crate'              ? FROST_SKIN_RARITIES
    : crateId === 'infernal-crate'           ? INFERNAL_SKIN_RARITIES
    : crateId === 'void-crate'               ? VOID_SKIN_RARITIES
    : SKIN_RARITIES;

  // Build a section for each rarity this crate can drop
  Object.entries(crate.rarityWeights).forEach(([rarity, weight]) => {
    // Hide creator rarity unless player owns it
    if (rarity === 'creator' && !ownedSkins.includes('icon_the_creator')) return;

    const skins = pool[rarity];
    if (!skins || skins.length === 0) return;

    const pct = (weight * 100).toFixed(1).replace(/\.0$/, '');

    // Section wrapper
    const section = document.createElement('div');
    section.className = 'crate-index-section';

    // Header with rarity name + drop chance
    const header = document.createElement('div');
    header.className = 'crate-index-section-header';
    header.innerHTML = `<span class="crate-index-rarity" style="color:${getRarityColor(rarity)}">${getRarityName(rarity)}</span>`
      + `<span class="crate-index-chance" style="color:${getRarityColor(rarity)}">${pct}% drop chance</span>`;
    section.appendChild(header);

    // Grid of skins
    const grid = document.createElement('div');
    grid.className = 'crate-index-grid';

    skins.forEach(skinId => {
      const skinData = SKINS.find(s => s.id === skinId);
      if (!skinData) return;

      const owned = ownedSkins.includes(skinId);

      const card = document.createElement('div');
      card.className = 'crate-index-item' + (owned ? ' owned' : '');
      card.style.borderColor = getRarityColor(rarity);

      // Skin preview swatch (reuse reel preview styles)
      const swatch = document.createElement('div');
      swatch.className = 'crate-index-swatch';

      // Try to apply the rich preview style if available
      const reelStyles = getCratePreviewStyle(skinId);
      if (reelStyles) {
        swatch.style.background = reelStyles.bg;
        if (reelStyles.anim) swatch.style.animation = reelStyles.anim;
        if (reelStyles.border) swatch.style.border = reelStyles.border;
      } else {
        swatch.style.background = skinData.color || getRarityColor(rarity);
      }

      const label = document.createElement('div');
      label.className = 'crate-index-label';
      label.textContent = skinData.name;

      const status = document.createElement('div');
      status.className = 'crate-index-status';
      status.textContent = owned ? 'OWNED' : '';
      status.style.color = owned ? '#6bff7b' : 'transparent';

      card.appendChild(swatch);
      card.appendChild(label);
      card.appendChild(status);
      grid.appendChild(card);
    });

    section.appendChild(grid);
    body.appendChild(section);
  });

  modal.classList.remove('hidden');
}

function closeCrateIndex() {
  document.getElementById('crateIndexModal').classList.add('hidden');
}

// Helper: return the rich preview style object for a skin ID (reuses reel styles)
function getCratePreviewStyle(skinId) {
  const styles = {
        c_static:    { bg: 'radial-gradient(circle, #c8c8dc 0%, #808090 60%, #404050 100%)' },
    c_rust:      { bg: 'radial-gradient(circle, #c06030 0%, #8b4513 55%, #4a2008 100%)' },
    c_slate:     { bg: 'radial-gradient(circle, #8090a0 0%, #607080 55%, #303840 100%)' },
    c_olive:     { bg: 'radial-gradient(circle, #9ab040 0%, #6b8e23 55%, #344010 100%)' },
    c_maroon:    { bg: 'radial-gradient(circle, #cc3050 0%, #9b2335 55%, #4a0f1a 100%)' },
        c_cobalt:    { bg: 'radial-gradient(circle, #3080ff 0%, #0047ab 55%, #001a60 100%)' },
    c_teal:      { bg: 'radial-gradient(circle, #00c8b0 0%, #00897b 55%, #003830 100%)' },
    c_coral:     { bg: 'radial-gradient(circle, #ff9080 0%, #ff6f61 55%, #a02010 100%)' },
    c_sand:      { bg: 'radial-gradient(circle, #e0c870 0%, #c2a25a 55%, #6a5020 100%)' },
    c_chrome:    { bg: 'linear-gradient(135deg, #666 0%, #ddd 25%, #999 50%, #fff 75%, #888 100%)', anim: 'quantumSpin 3s linear infinite' },
        c_prism:     { bg: 'conic-gradient(red,orange,yellow,green,cyan,blue,violet,red)', anim: 'quantumSpin 2s linear infinite' },
    c_aurora:    { bg: 'linear-gradient(180deg,#00ff99 0%,#00aaff 40%,#9900cc 100%)', anim: 'galaxyShimmer 2.5s ease-in-out infinite' },
    c_lava:      { bg: 'radial-gradient(circle,#ffcc00 0%,#ff4500 45%,#cc0000 75%,#440000 100%)', anim: 'voidPulse 1.5s ease-in-out infinite' },
    c_storm:     { bg: 'radial-gradient(circle,#c0d8ff 0%,#4080ff 35%,#0020a0 65%,#000820 100%)', anim: 'voidPulse 2s ease-in-out infinite' },
    c_neon:      { bg: 'linear-gradient(135deg,#ff00cc 0%,#00ffff 50%,#ff00cc 100%)', anim: 'quantumSpin 3s linear infinite' },
        c_glitch:    { bg: 'conic-gradient(#ff0080,#00ffff,#ff0000,#00ff00,#ff00ff,#0000ff,#ff0080)', anim: 'quantumSpin 0.6s linear infinite' },
    c_nebula:    { bg: 'radial-gradient(circle at 40% 35%,#ff80cc 0%,#9922cc 35%,#220066 65%,#110033 100%)', anim: 'galaxyShimmer 2s ease-in-out infinite' },
    c_biohazard: { bg: 'radial-gradient(circle,#ccff00 0%,#39ff14 30%,#006600 65%,#001a00 100%)', anim: 'voidPulse 1.2s ease-in-out infinite' },
    c_arctic:    { bg: 'radial-gradient(circle,#ffffff 0%,#aaeeff 25%,#00c8ff 55%,#004466 100%)', anim: 'galaxyShimmer 3s ease-in-out infinite' },
    c_wildfire:  { bg: 'radial-gradient(circle,#ffffff 0%,#ffff00 20%,#ff6600 50%,#cc0000 75%,#300000 100%)', anim: 'voidPulse 0.9s ease-in-out infinite' },
    c_spectre:   { bg: 'radial-gradient(circle,rgba(255,255,255,0.95) 0%,rgba(180,180,255,0.8) 35%,rgba(80,80,200,0.5) 65%,rgba(20,20,80,0.3) 100%)', anim: 'voidPulse 2.5s ease-in-out infinite' },
        c_supernova: { bg: 'conic-gradient(white,yellow,orange,red,magenta,blue,cyan,white)', anim: 'quantumSpin 1.5s linear infinite' },
    c_wraith:    { bg: 'radial-gradient(circle,#8800ff 0%,#440088 30%,#1a0033 60%,#000000 100%)', anim: 'voidPulse 2s ease-in-out infinite' },
    c_titan:     { bg: 'radial-gradient(circle,#ffe080 0%,#f5a623 30%,#b87333 60%,#3c1a00 100%)', anim: 'celestialGlow 2.5s ease-in-out infinite' },
    c_astral:    { bg: 'linear-gradient(135deg,#00e5ff 0%,#7b2ff7 35%,#ff00aa 65%,#00e5ff 100%)', anim: 'quantumSpin 4s linear infinite' },
        c_omnichrome:  { bg: 'conic-gradient(red,orange,yellow,lime,cyan,blue,violet,magenta,red)', anim: 'quantumSpin 0.7s linear infinite' },
    c_singularity: { bg: 'conic-gradient(#ff0080,#00ffff,#8000ff,#ff0080)', anim: 'quantumSpin 2s linear infinite' },
    c_ultraviolet: { bg: 'radial-gradient(circle,#ff88ff 0%,#cc00ff 30%,#6600cc 60%,#200033 100%)', anim: 'voidPulse 1.5s ease-in-out infinite' },
    c_godmode:     { bg: 'radial-gradient(circle,#ffffff 0%,#fffdd0 20%,#fff59d 50%,#ffd700 80%,#fff 100%)', anim: 'diamondShine 1.8s ease-in-out infinite' },
    c_rift:        { bg: 'linear-gradient(135deg,#000 0%,#1a0044 25%,#ff00aa 50%,#00ffff 75%,#000 100%)', anim: 'quantumSpin 2.5s linear infinite' },
        icon_noah_brown:      { bg: '#6b4423' },
    icon_keegan_baseball: { bg: 'radial-gradient(circle,#ffffff 0%,#f9f9f9 35%,#f5f5f5 70%,#e8e8e8 100%)' },
    icon_dpoe_fade:       { bg: 'linear-gradient(135deg, #ff69b4 0%, #ff9ec4 35%, #a8d8ea 65%, #89cff0 100%)' },
    icon_evan_watermelon: { bg: 'radial-gradient(circle, #ff6b9d 0%, #ff4466 30%, #ff1744 50%, #4caf50 70%, #2e7d32 100%)', anim: 'voidPulse 2s ease-in-out infinite' },
    icon_gavin_tzl:       { bg: 'linear-gradient(135deg, #dc143c 0%, #ffffff 50%, #0047ab 100%)', anim: 'quantumSpin 3s linear infinite', border: '2px solid rgba(255, 255, 255, 0.5)' },
    icon_carter_cosmic:   { bg: 'radial-gradient(circle, #ff2020 0%, #cc0000 40%, #660000 70%, #1a0000 100%)' },
    icon_brody_flag:      { bg: 'linear-gradient(to bottom, #b22234 0%, #b22234 15%, #fff 15%, #fff 30%, #b22234 30%, #b22234 46%, #fff 46%, #fff 61%, #b22234 61%, #b22234 77%, #fff 77%, #fff 92%, #b22234 92%, #b22234 100%)', anim: 'flagWave 2s ease-in-out infinite' },
    icon_sterling:        { bg: 'radial-gradient(circle at 30% 30%, #0064ff 0%, #0050cc 30%, #003399 60%, #000000 100%)', anim: 'sterlingPulse 3s ease-in-out infinite' },
    icon_justin_clover:   { bg: 'radial-gradient(circle, #39ff14 0%, #1a8c2e 40%, #0d5c1a 70%, #042b0a 100%)', anim: 'voidPulse 2s ease-in-out infinite' },
    icon_profe_spain:     { bg: 'linear-gradient(to bottom, #c60b1e 0%, #c60b1e 25%, #ffc400 25%, #ffc400 75%, #c60b1e 75%, #c60b1e 100%)', anim: 'voidPulse 1.2s ease-in-out infinite', border: '2px solid rgba(255,196,0,0.7)' },
    icon_kayden_duck:     { bg: 'conic-gradient(from 20deg, #5a6b2a 0deg, #c4a265 40deg, #3d2b0e 90deg, #7a5c28 140deg, #5a6b2a 190deg, #c4a265 230deg, #3d2b0e 280deg, #4a5c1e 320deg, #c4a265 360deg)', border: '2px solid rgba(90,107,42,0.6)' },
    icon_troy_puck:       { bg: 'radial-gradient(circle at 35% 35%, #3a3a3a 0%, #1a1a1a 50%, #050505 100%)', border: '3px solid rgba(160,160,160,0.4)' },
    icon_the_creator:     { bg: 'conic-gradient(from 0deg, #ffd700, #ffffff, #ff69b4, #00ffff, #9d4edd, #ffd700)', anim: 'creatorDivine 4s linear infinite', border: '2px solid rgba(255, 255, 255, 0.8)' },
    ob_duskblade:  { bg: 'radial-gradient(circle, #9055ff 0%, #5a2d8c 40%, #1a0a2e 100%)', anim: 'voidPulse 2s ease-in-out infinite' },
    ob_voidborn:   { bg: 'radial-gradient(circle, #3355cc 0%, #1a2266 40%, #060618 100%)', anim: 'voidPulse 2.5s ease-in-out infinite' },
    ob_ashwalker:  { bg: 'radial-gradient(circle, #8a6040 0%, #4a3020 40%, #1a0f08 100%)', anim: 'voidPulse 3s ease-in-out infinite' },
    ob_soulreaper: { bg: 'radial-gradient(circle, #ff3366 0%, #991133 35%, #330011 70%, #0a0003 100%)', anim: 'voidPulse 1.5s ease-in-out infinite' },
    ob_eclipsar:   { bg: 'radial-gradient(circle, #ffd700 0%, #664400 30%, #0d1133 60%, #000 100%)', anim: 'galaxyShimmer 3s ease-in-out infinite' },
    ob_phantomking:{ bg: 'radial-gradient(circle, #bb88ff 0%, #6633aa 35%, #220055 70%, #0a0018 100%)', anim: 'voidPulse 2s ease-in-out infinite' },
    ob_abyssal:    { bg: 'radial-gradient(circle, #2244aa 0%, #0d1133 40%, #020208 100%)', anim: 'voidPulse 3s ease-in-out infinite', border: '2px solid rgba(34, 68, 170, 0.5)' },
    ob_eventide:   { bg: 'conic-gradient(from 0deg, #1a0a2e, #2a1a4e, #3a2a6e, #2a1a4e, #1a0a2e)', anim: 'quantumSpin 5s linear infinite', border: '2px solid rgba(100, 60, 160, 0.4)' },
    ob_worldeater: { bg: 'radial-gradient(circle, #ff0000 0%, #660000 30%, #1a0000 60%, #000 100%)', anim: 'voidPulse 0.8s ease-in-out infinite', border: '2px solid rgba(255, 0, 0, 0.6)' },
    ob_eternium:   { bg: 'conic-gradient(from 0deg, #ff2060, #8a2be2, #00ccff, #39ff14, #ffd700, #ff2060)', anim: 'quantumSpin 1.2s linear infinite', border: '2px solid rgba(255, 255, 255, 0.6)' },
  };
  return styles[skinId] || null;
}

// ══════════════════════════════════════════════════════════════
// POST-GAME CRATE DROPS
// ══════════════════════════════════════════════════════════════

const CRATE_DROP_ICONS = {
  'common-crate':    '📦',
  'rare-crate':      '💠',
  'epic-crate':      '🟣',
  'legendary-crate': '🌟',
  'icon-crate':      '👑',
  'oblivion-crate':  '🌑',
};
const CRATE_DROP_NAMES = {
  'common-crate':    'Common Case',
  'rare-crate':      'Rare Case',
  'epic-crate':      'Epic Case',
  'legendary-crate': 'Legendary Case',
  'icon-crate':      'Icon Case',
  'oblivion-crate':  'Oblivion Case',
};

async function _triggerPostGameDrop(mode, tier) {
  const isLoggedIn = typeof currentUser !== 'undefined' && currentUser
    && !(typeof isGuest !== 'undefined' && isGuest);
  if (!isLoggedIn) return;
  try {
    const data = await apiPost('/crates/drop', { mode, tier: tier || 'bronze' });
    if (data && data.dropped) {
      if (!ownedCratesCache.includes(data.crateId)) ownedCratesCache.push(data.crateId);
      _showCrateDropNotification(data.crateId, data.weeklyDrops);
    }
  } catch (_) { /* silent — drops are best-effort */ }
}

function _showCrateDropNotification(crateId, weekCount) {
  const existing = document.getElementById('crateDropBanner');
  if (existing) existing.remove();

  const icon = CRATE_DROP_ICONS[crateId] || '📦';
  const name = CRATE_DROP_NAMES[crateId] || crateId;

  const banner = document.createElement('div');
  banner.id = 'crateDropBanner';
  banner.style.cssText = `
    position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(20px);
    background:linear-gradient(135deg,#1a1a2e,#16213e); border:2px solid #f39c12;
    border-radius:12px; padding:16px 24px; z-index:99999; color:#fff;
    font-family:inherit; text-align:center; min-width:260px; box-shadow:0 8px 32px rgba(0,0,0,.6);
    opacity:0; transition:all .4s ease;
  `;
  banner.innerHTML = `
    <div style="font-size:2rem;margin-bottom:6px;">${icon}</div>
    <div style="font-size:1rem;font-weight:700;color:#f39c12;">🎁 Case Drop!</div>
    <div style="font-size:.85rem;margin-top:4px;">${name}</div>
    <div style="font-size:.75rem;color:#aaa;margin-top:4px;">${weekCount}/${5} drops this week</div>
  `;
  document.body.appendChild(banner);
  // Animate in
  requestAnimationFrame(() => {
    banner.style.opacity = '1';
    banner.style.transform = 'translateX(-50%) translateY(0)';
  });
  // Auto-dismiss after 4s
  setTimeout(() => {
    banner.style.opacity = '0';
    banner.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => banner.remove(), 400);
  }, 4000);
}

// ══════════════════════════════════════════════════════════════
// CRATE INVENTORY (owned unopened crates)
// ══════════════════════════════════════════════════════════════

// Crate shop status cache (stock levels, availability)
var crateShopStatus = { stock: {}, soldCount: {}, discontinued: [], oblivionAvailableNow: true };

async function fetchCrateShopStatus() {
  try {
    const resp = await fetch(`${API_BASE}/crates/shop`);
    if (!resp.ok) return crateShopStatus;
    const data = await resp.json();
    crateShopStatus = data;
    return data;
  } catch (_) { return crateShopStatus; }
}

// ── New shop API (rotation-driven) ───────────────────────────────────────────
var shopCratesData = [];

async function fetchShopCrates() {
  try {
    const resp = await fetch(`${API_BASE}/shop/crates`);
    if (!resp.ok) return shopCratesData;
    const data = await resp.json();
    shopCratesData = data.crates || [];
    return shopCratesData;
  } catch (_) { return shopCratesData; }
}

function createCountdownTimer(endsAt) {
  const el = document.createElement('div');
  el.className = 'crate-countdown';
  el.style.cssText = 'font-size:11px;color:#f90;font-weight:700;letter-spacing:1px;margin-top:4px;';
  const endMs = new Date(endsAt).getTime();
  const update = () => {
    const ms = endMs - Date.now();
    if (ms <= 0) { el.textContent = 'EXPIRED'; clearInterval(el._timer); return; }
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    el.textContent = d > 0 ? `⏱ Leaves in: ${d}d ${h}h ${m}m` : `⏱ ${h}h ${m}m ${s}s`;
  };
  update();
  if (el._timer) clearInterval(el._timer);
  el._timer = setInterval(update, 1000);
  return el;
}

var _shopPollTimer = null;

function startShopPoll() {
  if (_shopPollTimer) return;
  _shopPollTimer = setInterval(async () => {
    const prev = JSON.stringify(shopCratesData);
    const fresh = await fetchShopCrates();
    if (JSON.stringify(fresh) !== prev) {
      await initCratesTab();
      showCrateMessage('🔄 Shop updated!');
    }
  }, 60000);
}

// Local cache of owned crates — refreshed on buy/open/load
var ownedCratesCache = [];

async function fetchOwnedCrates() {
  const isLoggedIn = typeof currentUser !== 'undefined' && currentUser
    && !(typeof isGuest !== 'undefined' && isGuest);
  if (!isLoggedIn) { ownedCratesCache = []; return []; }

  try {
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('topdown_token');
    const resp = await fetch(`${API_BASE}/crates/owned`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return ownedCratesCache;
    const data = await resp.json();
    ownedCratesCache = data.ownedCrates || [];
    return ownedCratesCache;
  } catch (e) {
    return ownedCratesCache;
  }
}

async function buyCrateToInventory(crate) {
  const isLoggedIn = typeof currentUser !== 'undefined' && currentUser
    && !(typeof isGuest !== 'undefined' && isGuest);
  if (!isLoggedIn) {
    showCrateMessage('Log in to buy cases to inventory', true);
    return;
  }
  if (playerCoins < crate.price) {
    showCrateMessage('Not enough coins!', true);
    return;
  }

  // Confirmation dialog
  showCrateConfirm(
    { ...crate, name: `Buy ${crate.name} to Inventory` },
    `${crate.price.toLocaleString()} coins`,
    async () => {
      try {
        const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('topdown_token');
        const resp = await fetch(`${API_BASE}/crates/buy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ crateId: crate.id }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          showCrateMessage(err.error || 'Failed to buy case', true);
          return;
        }
        const data = await resp.json();
        playerCoins = data.newBalance;
        if (typeof saveCoins === 'function') saveCoins();

        // Refresh crate inventory cache + UI
        if (!ownedCratesCache.includes(crate.id)) ownedCratesCache.push(crate.id);
        renderCrateInventorySection();
        initCratesTab(); // refresh button disabled states

        showCrateMessage(`${crate.name} added to inventory!`);
      } catch (e) {
        showCrateMessage('Network error buying case', true);
      }
    }
  );
}

async function openOwnedCrate(crateId) {
  const crate = CRATES.find(c => c.id === crateId);
  if (!crate) return;

  const isLoggedIn = typeof currentUser !== 'undefined' && currentUser
    && !(typeof isGuest !== 'undefined' && isGuest);
  if (!isLoggedIn) return;

  try {
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('topdown_token');
    const resp = await fetch(`${API_BASE}/crates/open-owned`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ crateId }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      showCrateMessage(err.error || 'Failed to open case', true);
      return null;
    }
    const data = await resp.json();

    // Update local state
    playerCoins = data.newBalance;
    if (!ownedSkins.includes(data.skinId)) ownedSkins.push(data.skinId);
    if (typeof saveCoins === 'function') saveCoins();
    ownedCratesCache = data.ownedCrates || [];

    _updatePityCounters(crateId, data.rarity);

    const skin = SKINS.find(s => s.id === data.baseSkinId);
    return {
      crate,
      rewards: [{
        skin: skin || { id: data.baseSkinId, name: data.baseSkinId, color: '#888' },
        skinId: data.skinId,
        rarity: data.rarity,
        isDuplicate: data.isDuplicate || false,
        coinValue: data.coinRefund || 0,
        mutation: data.mutation || null,
      }],
    };
  } catch (e) {
    showCrateMessage('Network error opening case', true);
    return null;
  }
}

async function openOwnedCrateWithAnimation(crateId) {
  if (isOpeningCrate) return;

  const result = await openOwnedCrate(crateId);
  if (!result) return;

  // Reuse the crate opening animation display
  isOpeningCrate = true;
  const modal     = document.getElementById('crateOpenModal');
  const animation = document.getElementById('crateOpenAnimation');
  const results   = document.getElementById('crateResults');
  if (modal)      modal.classList.remove('hidden');
  if (animation)  animation.classList.add('hidden');
  if (results)    results.classList.remove('hidden');

  displayCrateResults(result);
  renderCrateInventorySection();
  isOpeningCrate = false;
}

function renderCrateInventorySection() {
  const section = document.getElementById('crateInventorySection');
  if (!section) return;

  const isLoggedIn = typeof currentUser !== 'undefined' && currentUser
    && !(typeof isGuest !== 'undefined' && isGuest);
  if (!isLoggedIn || ownedCratesCache.length === 0) {
    section.innerHTML = '';
    return;
  }

  // Group crates by type
  const counts = {};
  for (const id of ownedCratesCache) counts[id] = (counts[id] || 0) + 1;

  const crateEntries = Object.entries(counts).sort((a, b) => {
    const ai = CRATES.findIndex(c => c.id === a[0]);
    const bi = CRATES.findIndex(c => c.id === b[0]);
    return ai - bi;
  });

  const totalCount = ownedCratesCache.length;

  section.innerHTML = `
    <div style="
      background: linear-gradient(135deg, rgba(255,167,38,0.08), rgba(255,167,38,0.02));
      border: 1px solid rgba(255,167,38,0.25);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 16px;
    ">
      <div style="
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 12px;
      ">
        <span style="
          font-family: 'Orbitron', sans-serif;
          font-size: 12px; font-weight: 700;
          color: #ffa726; letter-spacing: 1px;
        ">MY CRATE INVENTORY (${totalCount})</span>
      </div>
      <div id="crateInvGrid" style="
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 10px;
      "></div>
    </div>
  `;

  const grid = document.getElementById('crateInvGrid');

  for (const [crateId, count] of crateEntries) {
    const crate = CRATES.find(c => c.id === crateId);
    if (!crate) continue;

    const item = document.createElement('div');
    item.style.cssText = `
      background: rgba(0,0,0,0.3);
      border: 1px solid ${crate.color || '#4a9eff'}40;
      border-radius: 8px;
      padding: 12px;
      text-align: center;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
    `;

    item.innerHTML = `
      <div style="font-size: 28px;">${crate.icon}</div>
      <div style="font-size: 11px; font-weight: 600; color: #dbe7ff; font-family: 'Orbitron', sans-serif;">
        ${crate.name} <span style="color: ${crate.color}; font-size: 13px;">x${count}</span>
      </div>
      <div style="display: flex; gap: 6px; margin-top: 4px;">
        <button class="crate-inv-open-btn" style="
          background: ${crate.color || '#4a9eff'}22;
          border: 1px solid ${crate.color || '#4a9eff'};
          color: #dbe7ff; padding: 5px 14px; border-radius: 6px; cursor: pointer;
          font-family: 'Orbitron', sans-serif; font-size: 9px; font-weight: 700;
          letter-spacing: 0.5px;
        ">OPEN</button>
        <button class="crate-inv-sell-btn" style="
          background: rgba(255,167,38,0.12);
          border: 1px solid rgba(255,167,38,0.5);
          color: #ffa726; padding: 5px 14px; border-radius: 6px; cursor: pointer;
          font-family: 'Orbitron', sans-serif; font-size: 9px; font-weight: 700;
          letter-spacing: 0.5px;
        ">SELL</button>
      </div>
    `;

    const openBtn = item.querySelector('.crate-inv-open-btn');
    openBtn.onclick = () => {
      showCrateConfirm(
        { ...crate, name: `Open ${crate.name} from Inventory` },
        'FREE (already owned)',
        () => openOwnedCrateWithAnimation(crateId)
      );
    };

    const sellBtn = item.querySelector('.crate-inv-sell-btn');
    sellBtn.onclick = () => {
      // Switch to marketplace tab and trigger crate listing flow
      if (typeof openMarketplaceCrateListingFlow === 'function') {
        openMarketplaceCrateListingFlow(crateId);
      } else {
        showCrateMessage('Marketplace not available', true);
      }
    };

    grid.appendChild(item);
  }
}

async function initCratesTab() {
  const grid = document.getElementById('cratesGrid');
  if (!grid) return;

  // Show skeleton crate cards while fetching
  grid.innerHTML = [1,2,3].map(() => `
    <div class="crate-card" style="border-color:rgba(88,166,255,0.12)">
      <div class="sk-shimmer sk-circle" style="width:64px;height:64px;margin:0 auto 14px"></div>
      <div class="sk-shimmer sk-line-lg" style="width:55%;margin:0 auto 10px"></div>
      <div class="sk-shimmer sk-line-sm" style="width:80%;margin:0 auto 6px"></div>
      <div class="sk-shimmer sk-line-sm" style="width:55%;margin:0 auto 14px"></div>
      <div class="sk-shimmer sk-box" style="height:38px;border-radius:10px;margin-top:8px"></div>
    </div>`).join('');

  // Fetch active shop crates + owned crates in parallel
  const [shopEntries] = await Promise.all([
    fetchShopCrates(),
    fetchOwnedCrates().then(() => renderCrateInventorySection()),
  ]);

  grid.innerHTML = '';

  shopEntries.forEach(entry => {
    // Merge API entry with static crate display data
    const crateData = CRATES.find(c => c.id === entry.crateId);
    if (!crateData) return; // unknown crate — skip
    const crate = { ...crateData, price: entry.price };

    const card = document.createElement('div');
    card.className = 'crate-card';
    card.style.borderColor = crate.glowColor || crate.color;
    if (crate.id === 'oblivion-crate') {
      card.style.background = 'linear-gradient(145deg, rgba(26, 10, 46, 0.95), rgba(10, 4, 20, 0.98))';
      card.style.borderWidth = '2px';
      card.style.borderStyle = 'solid';
      card.style.borderImage = 'linear-gradient(135deg, #8a2be2, #ff2060, #8a2be2) 1';
      card.style.boxShadow = '0 0 20px rgba(138, 43, 226, 0.3), inset 0 0 30px rgba(138, 43, 226, 0.05)';
    }

    // Rotation label banner
    if (entry.rotationLabel) {
      const banner = document.createElement('div');
      banner.textContent = entry.rotationLabel;
      banner.style.cssText = `
        background:linear-gradient(90deg,#f90,#ff5500); color:#000; font-weight:700;
        font-size:9px; letter-spacing:2px; text-align:center; padding:4px 8px;
        border-radius:4px 4px 0 0; margin-bottom:4px;
      `;
      card.appendChild(banner);
    }

    const icon = document.createElement('div');
    icon.className = 'crate-icon';
    icon.textContent = crate.icon;
    icon.style.textShadow = `0 0 20px ${crate.color}`;

    const name = document.createElement('div');
    name.className = 'crate-name';
    name.textContent = crate.name;

    const desc = document.createElement('div');
    desc.className = 'crate-desc';
    desc.textContent = crate.desc;

    const preview = document.createElement('div');
    preview.className = 'crate-preview';

    // Show possible rewards
    const rarities = Object.keys(crate.rarityWeights);
    rarities.forEach(rarity => {
      if (rarity === 'creator' && !ownedSkins.includes('icon_the_creator')) return;
      const tag = document.createElement('span');
      tag.className = 'crate-rarity-tag';
      tag.textContent = getRarityName(rarity);
      tag.style.background = getRarityColor(rarity) + '33';
      tag.style.borderColor = getRarityColor(rarity);
      tag.style.color = getRarityColor(rarity);
      preview.appendChild(tag);
    });

    // Check if player has free crates from battle pass
    let freeCount = 0;
    if (typeof battlePassData !== 'undefined' && battlePassData.crateInventory) {
      freeCount = battlePassData.crateInventory[crate.id] || 0;
    }

    const price = document.createElement('div');
    price.className = 'crate-price';

    if (freeCount > 0) {
      price.innerHTML = `<span style="color:#6bff7b;font-weight:600;">🎁 ${freeCount} FREE</span> <span style="opacity:0.5;">/ 🪙 ${crate.price.toLocaleString()}</span>`;
    } else if (entry.originalPrice && entry.originalPrice !== crate.price) {
      price.innerHTML = `🪙 ${crate.price.toLocaleString()} <span style="text-decoration:line-through;opacity:0.5;font-size:11px;">🪙 ${entry.originalPrice.toLocaleString()}</span>`;
    } else {
      price.textContent = `🪙 ${crate.price.toLocaleString()}`;
    }

    // Browse contents button
    const browseBtn = document.createElement('button');
    browseBtn.className = 'crate-browse-btn';
    browseBtn.textContent = 'BROWSE CONTENTS';
    browseBtn.onclick = () => showCrateIndex(crate.id);

    const btn = document.createElement('button');
    btn.className = 'crate-btn';

    if (freeCount > 0) {
      btn.textContent = 'OPEN FREE CASE';
      btn.disabled = false;
      btn.style.background = 'linear-gradient(135deg, #6bff7b, #48bb78)';
      btn.style.color = '#000';
      btn.style.fontWeight = '600';
    } else {
      btn.textContent = 'OPEN CASE';
      btn.disabled = playerCoins < crate.price;
    }

    btn.onclick = () => {
      const isFree = typeof battlePassData !== 'undefined'
        && battlePassData.crateInventory?.[crate.id] > 0;
      const costText = isFree ? 'FREE' : `${crate.price.toLocaleString()} coins`;
      showCrateConfirm(crate, costText, () => showCrateOpeningAnimation(crate.id));
    };

    // Buy to inventory button (logged-in only)
    const buyInvBtn = document.createElement('button');
    buyInvBtn.className = 'crate-btn crate-buy-inv-btn';
    buyInvBtn.textContent = 'BUY TO INVENTORY';
    buyInvBtn.style.cssText = `
      background: linear-gradient(135deg, #ffa726, #fb8c00);
      color: #000; font-weight: 700; margin-top: 6px;
      border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;
      font-family: 'Orbitron', sans-serif; font-size: 11px; letter-spacing: 1px;
      width: 100%; transition: opacity 0.15s;
    `;
    buyInvBtn.disabled = playerCoins < crate.price;
    if (buyInvBtn.disabled) buyInvBtn.style.opacity = '0.4';
    buyInvBtn.onclick = () => buyCrateToInventory(crate);

    // ── Shop status badges (API-driven) ──────────────────────────────────────
    const stockRemaining = entry.stockRemaining;
    const isSoldOut      = typeof stockRemaining === 'number' && stockRemaining === 0;

    // Collect extra elements to insert between price and browseBtn
    const extraEls = [];

    if (isSoldOut) {
      btn.disabled = true;
      buyInvBtn.disabled = true;
      btn.style.opacity = '0.4';
      buyInvBtn.style.opacity = '0.4';
      const soldBadge = document.createElement('div');
      soldBadge.textContent = 'SOLD OUT';
      soldBadge.style.cssText = `
        display:inline-block; background:#c0392b33; color:#e74c3c; border:1px solid #e74c3c;
        border-radius:4px; padding:3px 8px; font-size:10px; font-weight:700;
        letter-spacing:1px; margin-top:4px;
      `;
      extraEls.push(soldBadge);
    } else if (entry.weekendOnly) {
      const weBadge = document.createElement('div');
      weBadge.textContent = '⏳ WEEKEND ONLY';
      weBadge.style.cssText = `
        display:inline-block; background:#6c3483; color:#c39bd3; border:1px solid #c39bd3;
        border-radius:4px; padding:3px 8px; font-size:10px; font-weight:700;
        letter-spacing:1px; margin-top:4px;
      `;
      extraEls.push(weBadge);
    } else if (typeof stockRemaining === 'number') {
      const stockBadge = document.createElement('div');
      const lowStock = stockRemaining <= 20;
      stockBadge.textContent = `🎲 ${stockRemaining} left`;
      stockBadge.style.cssText = `
        display:inline-block; background:${lowStock ? '#7b241c33' : '#1a5276'};
        color:${lowStock ? '#e74c3c' : '#85c1e9'}; border:1px solid ${lowStock ? '#e74c3c' : '#85c1e9'};
        border-radius:4px; padding:3px 8px; font-size:10px; font-weight:700;
        letter-spacing:1px; margin-top:4px;
      `;
      extraEls.push(stockBadge);
    }

    // Countdown timer
    if (entry.timerVisible && entry.endsAt) {
      extraEls.push(createCountdownTimer(entry.endsAt));
    }

    card.appendChild(icon);
    card.appendChild(name);
    card.appendChild(desc);
    card.appendChild(preview);
    card.appendChild(price);
    extraEls.forEach(el => card.appendChild(el));
    card.appendChild(browseBtn);
    card.appendChild(btn);
    card.appendChild(buyInvBtn);
    grid.appendChild(card);
  });

  // Render crate inventory section above the grid
  renderCrateInventorySection();

  // Start polling for shop updates
  startShopPoll();
}

// ══════════════════════════════════════════════════════════════
// TRADE-UP SYSTEM
// ══════════════════════════════════════════════════════════════

const TRADEUP_RARITY_NEXT = {
  common:    'uncommon',
  uncommon:  'rare',
  rare:      'epic',
  epic:      'legendary',
  legendary: 'mythic',
};

// Coin cost to perform a trade-up at each rarity tier
const TRADEUP_COSTS = {
  common:    200,
  uncommon:  500,
  rare:      1500,
  epic:      4000,
  legendary: 10000,
};

// All skins that belong to each rarity tier (for outputs)
function getSkinsForRarity(rarity) {
  const pool = SKIN_RARITIES[rarity] || [];
  return pool;
}

// Get the rarity of a skin id (base, no mutation)
function tuGetRarity(skinId) {
  const base = skinId.includes('__') ? skinId.split('__')[0] : skinId;
  for (const [r, ids] of Object.entries(SKIN_RARITIES)) {
    if (ids.includes(base)) return r;
  }
  return null;
}

let _tuSelectedRarity = 'common';
let _tuSlots = new Array(10).fill(null); // each entry: skinId string or null
let _tuOpenSlotIndex = null; // which slot is being filled

function initTradeUpTab() {
  _tuSlots = new Array(10).fill(null);
  _renderTuSlots();
  _renderTuRarityBtns();
  _updateTuBtn();

  // Rarity buttons
  document.getElementById('tuRarityBtns').querySelectorAll('.tu-rarity-btn').forEach(btn => {
    btn.onclick = () => {
      _tuSelectedRarity = btn.dataset.rarity;
      _tuSlots = new Array(10).fill(null);
      document.querySelectorAll('.tu-rarity-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _renderTuSlots();
      _updateTuBtn();
      _updateTuOutput();
    };
  });

  // Trade Up button
  document.getElementById('tuBtn').onclick = () => _executeTuTradeUp();

  // Picker close
  document.getElementById('tuPickerClose').onclick = _closeTuPicker;
  document.getElementById('tuPickerOverlay').onclick = e => {
    if (e.target === document.getElementById('tuPickerOverlay')) _closeTuPicker();
  };

  _updateTuOutput();
}

function _renderTuSlots() {
  const container = document.getElementById('tuSlots');
  if (!container) return;
  container.innerHTML = '';
  _tuSlots.forEach((skinId, i) => {
    const slot = document.createElement('div');
    slot.className = 'tu-slot' + (skinId ? ' filled' : '');

    if (skinId) {
      const base = skinId.includes('__') ? skinId.split('__')[0] : skinId;
      const skin = (typeof SKINS !== 'undefined') ? SKINS.find(s => s.id === base) : null;
      const mut  = skinId.includes('__') ? skinId.split('__')[1] : null;
      const mc   = (mut && typeof MUTATION_CONFIG !== 'undefined') ? MUTATION_CONFIG[mut] : null;

      const preview = document.createElement('div');
      preview.className = 'tu-slot-preview';
      if (mc) preview.classList.add(mc.cssClass);
      if (typeof applyRichSkinPreview === 'function') {
        applyRichSkinPreview(preview, base, skin ? skin.color : null);
      } else if (skin && skin.color) {
        preview.style.background = skin.color;
      }
      if (mc && mc.cssFilter) preview.style.filter = mc.cssFilter;

      const name = document.createElement('div');
      name.className = 'tu-slot-name';
      name.textContent = mc ? `${skin?.name || base} [${mc.label}]` : (skin?.name || base);
      if (mc) name.style.color = mc.color;

      const rm = document.createElement('div');
      rm.className = 'tu-slot-remove';
      rm.textContent = '✕';
      rm.onclick = (e) => { e.stopPropagation(); _tuSlots[i] = null; _renderTuSlots(); _updateTuBtn(); _updateTuMutation(); };

      slot.appendChild(preview);
      slot.appendChild(name);
      slot.appendChild(rm);
    } else {
      const plus = document.createElement('div');
      plus.className = 'tu-slot-plus';
      plus.textContent = '+';
      slot.appendChild(plus);
      slot.onclick = () => _openTuPicker(i);
    }

    container.appendChild(slot);
  });
}

function _renderTuRarityBtns() {
  document.querySelectorAll('.tu-rarity-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.rarity === _tuSelectedRarity);
  });
}

function _updateTuOutput() {
  const nextRarity = TRADEUP_RARITY_NEXT[_tuSelectedRarity];
  const rarityNames = {
    common: 'COMMON', uncommon: 'UNCOMMON', rare: 'RARE',
    epic: 'EPIC', legendary: 'LEGENDARY', mythic: 'MYTHIC'
  };
  const rarityColors = {
    common: '#78b7ff', uncommon: '#9d7aff', rare: '#ff78b7',
    epic: '#ff9d47', legendary: '#ffd700', mythic: '#ff69ff'
  };
  const el = document.getElementById('tuOutputRarity');
  if (el && nextRarity) {
    el.textContent = rarityNames[nextRarity] || nextRarity;
    el.style.color  = rarityColors[nextRarity] || '#fff';
  }
}

function _updateTuMutation() {
  const mutatedCount = _tuSlots.filter(s => s && s.includes('__')).length;
  const boostPct = mutatedCount * 3; // +3% per mutated input, max 30%
  const fill = document.getElementById('tuMutationFill');
  const pct  = document.getElementById('tuMutationPct');
  if (fill) fill.style.width = `${boostPct}%`;
  if (pct)  pct.textContent  = `+${boostPct}%`;
}

function _updateTuBtn() {
  const filled = _tuSlots.filter(Boolean).length;
  const btn    = document.getElementById('tuBtn');
  const msg    = document.getElementById('tuMsg');
  if (!btn) return;

  const nextRarity = TRADEUP_RARITY_NEXT[_tuSelectedRarity];
  if (!nextRarity) {
    btn.textContent = 'MAX RARITY';
    btn.className   = 'tu-btn';
    btn.disabled    = true;
    return;
  }

  const cost = TRADEUP_COSTS[_tuSelectedRarity] || 0;

  if (filled < 10) {
    btn.textContent = `SELECT ${10 - filled} MORE`;
    btn.className   = 'tu-btn';
    btn.disabled    = true;
  } else if (cost > 0 && (typeof playerCoins === 'undefined' || playerCoins < cost)) {
    btn.textContent = `⬆ TRADE UP (${cost.toLocaleString()} coins — not enough!)`;
    btn.className   = 'tu-btn';
    btn.disabled    = true;
  } else {
    btn.textContent = cost > 0 ? `⬆ TRADE UP (${cost.toLocaleString()} coins)` : '⬆ TRADE UP';
    btn.className   = 'tu-btn ready';
    btn.disabled    = false;
  }
  if (msg) msg.textContent = '';
  _updateTuMutation();
}

function _openTuPicker(slotIndex) {
  _tuOpenSlotIndex = slotIndex;
  const overlay = document.getElementById('tuPickerOverlay');
  const grid    = document.getElementById('tuPickerGrid');
  if (!overlay || !grid) return;

  // Build count map of owned skins
  const countMap = {};
  for (const id of ownedSkins) countMap[id] = (countMap[id] || 0) + 1;

  // Get unique skins of the selected rarity that are available (not already in slots)
  const inSlots = _tuSlots.filter(Boolean);
  const pool    = SKIN_RARITIES[_tuSelectedRarity] || [];

  // Collect unique owned skins matching this rarity
  const seen = new Set();
  const available = [];
  for (const id of ownedSkins) {
    const base = id.includes('__') ? id.split('__')[0] : id;
    if (!pool.includes(base)) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    // How many are available after accounting for slots already using this id
    const usedInSlots = inSlots.filter(s => s === id).length;
    const availCount  = (countMap[id] || 0) - usedInSlots;
    if (availCount > 0) available.push({ skinId: id, count: availCount });
  }

  grid.innerHTML = '';
  if (available.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,0.4);padding:20px;font-size:11px;">No eligible skins.<br>Open crates or trade up from lower tiers!</div>';
  }

  available.forEach(({ skinId, count }) => {
    const base = skinId.includes('__') ? skinId.split('__')[0] : skinId;
    const skin = (typeof SKINS !== 'undefined') ? SKINS.find(s => s.id === base) : null;
    const mut  = skinId.includes('__') ? skinId.split('__')[1] : null;
    const mc   = (mut && typeof MUTATION_CONFIG !== 'undefined') ? MUTATION_CONFIG[mut] : null;

    const item = document.createElement('div');
    item.className = 'tu-picker-item';

    const dot = document.createElement('div');
    dot.className = 'tu-picker-dot';
    if (mc) dot.classList.add(mc.cssClass);
    if (typeof applyRichSkinPreview === 'function') {
      applyRichSkinPreview(dot, base, skin ? skin.color : null);
    } else if (skin && skin.color) { dot.style.background = skin.color; }
    if (mc && mc.cssFilter) dot.style.filter = mc.cssFilter;

    const name = document.createElement('div');
    name.className = 'tu-picker-name';
    name.textContent = mc ? `${skin?.name || base} [${mc.label}]` : (skin?.name || base);
    if (mc) name.style.color = mc.color;

    const cnt = document.createElement('div');
    cnt.className = 'tu-picker-count';
    cnt.textContent = `×${count}`;

    item.appendChild(dot);
    item.appendChild(name);
    item.appendChild(cnt);
    item.onclick = () => {
      _tuSlots[_tuOpenSlotIndex] = skinId;
      _closeTuPicker();
      _renderTuSlots();
      _updateTuBtn();
    };
    grid.appendChild(item);
  });

  overlay.classList.remove('hidden');
}

function _closeTuPicker() {
  document.getElementById('tuPickerOverlay')?.classList.add('hidden');
  _tuOpenSlotIndex = null;
}

async function _executeTuTradeUp() {
  const filled = _tuSlots.filter(Boolean);
  if (filled.length < 10) return;

  const nextRarity = TRADEUP_RARITY_NEXT[_tuSelectedRarity];
  if (!nextRarity) return;

  const cost = TRADEUP_COSTS[_tuSelectedRarity] || 0;
  if (cost > 0 && (typeof playerCoins === 'undefined' || playerCoins < cost)) {
    const msg = document.getElementById('tuMsg');
    if (msg) { msg.textContent = `Not enough coins! Need ${cost.toLocaleString()}`; msg.style.color = '#ff4444'; }
    return;
  }

  const isLoggedIn = typeof currentUser !== 'undefined' && currentUser
    && !(typeof isGuest !== 'undefined' && isGuest);

  let outputBase, mutation, finalId;

  // ── Server-authoritative trade-up for logged-in users ──
  if (isLoggedIn) {
    try {
      const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('topdown_token');
      const resp = await fetch(`${API_BASE}/crates/tradeup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ inputSkins: [..._tuSlots], inputRarity: _tuSelectedRarity }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        const msg = document.getElementById('tuMsg');
        if (msg) { msg.textContent = err.error || 'Trade-up failed'; msg.style.color = '#ff4444'; }
        return;
      }
      const data = await resp.json();

      // Update local state from server response
      playerCoins = data.newBalance;
      outputBase = data.outputBase;
      mutation = data.mutation || null;
      finalId = data.outputSkinId;

      // Rebuild local ownedSkins: remove inputs, add output
      const toRemove = [..._tuSlots];
      const newOwned = [...ownedSkins];
      for (const skinId of toRemove) {
        const idx = newOwned.indexOf(skinId);
        if (idx !== -1) newOwned.splice(idx, 1);
      }
      newOwned.push(finalId);
      ownedSkins.length = 0;
      ownedSkins.push(...newOwned);
      saveCoins();
    } catch (e) {
      const msg = document.getElementById('tuMsg');
      if (msg) { msg.textContent = 'Network error'; msg.style.color = '#ff4444'; }
      return;
    }
  } else {
    // ── Client-side fallback for guests ──
    if (cost > 0) {
      playerCoins -= cost;
      if (typeof saveCoins === 'function') saveCoins();
    }

    const toRemove = [..._tuSlots];
    const newOwned = [...ownedSkins];
    for (const skinId of toRemove) {
      const idx = newOwned.indexOf(skinId);
      if (idx !== -1) newOwned.splice(idx, 1);
    }
    ownedSkins.length = 0;
    ownedSkins.push(...newOwned);

    const pool = SKIN_RARITIES[nextRarity] || [];
    if (pool.length === 0) return;
    outputBase = pool[Math.floor(Math.random() * pool.length)];

    const mutatedCount = _tuSlots.filter(s => s && s.includes('__')).length;
    const boostFlat = mutatedCount * 0.03;
    mutation = null;
    if (typeof MUTATION_CONFIG !== 'undefined') {
      const roll = Math.random();
      let cumulative = 0;
      for (const [type, cfg] of Object.entries(MUTATION_CONFIG)) {
        cumulative += cfg.chance + boostFlat / Object.keys(MUTATION_CONFIG).length;
        if (roll < cumulative) { mutation = type; break; }
      }
    }

    finalId = mutation ? `${outputBase}__${mutation}` : outputBase;
    ownedSkins.push(finalId);

    if (typeof saveUserDataToFirebase === 'function') saveUserDataToFirebase('critical');
    else if (typeof saveCoins === 'function') saveCoins();
  }

  // Show result message
  const skin = (typeof SKINS !== 'undefined') ? SKINS.find(s => s.id === outputBase) : null;
  const mc = mutation && typeof MUTATION_CONFIG !== 'undefined' ? MUTATION_CONFIG[mutation] : null;
  const skinName = mc ? `${skin?.name || outputBase} [${mc.label}]` : (skin?.name || outputBase);
  const msg = document.getElementById('tuMsg');
  if (msg) {
    msg.textContent = `✨ Got: ${skinName}!`;
    msg.style.color = mc ? mc.color : '#6bff7b';
  }

  _tuSlots = new Array(10).fill(null);
  _renderTuSlots();
  _updateTuBtn();
  if (typeof _renderInventory === 'function') _renderInventory();
}

console.log('✅ Crate system loaded');