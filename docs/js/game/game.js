// game.js — main game engine
'use strict';

console.log('🎮 Game loading...');

// --- canvas & UI refs ---

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// shadow state cache (avoids redundant canvas API calls)
let currentShadowBlur = 0;
let currentShadowColor = '';

function setShadow(blur, color) {
  // Shadows are the single most expensive canvas operation — skip entirely in perf mode
  if (gameSettings.perfMode) { resetShadow(); return; }
  if (blur !== currentShadowBlur) {
    ctx.shadowBlur = blur;
    currentShadowBlur = blur;
  }
  if (color !== currentShadowColor) {
    ctx.shadowColor = color;
    currentShadowColor = color;
  }
}

function resetShadow() {
  if (currentShadowBlur !== 0 || currentShadowColor !== '') {
    ctx.shadowBlur = 0;
    ctx.shadowColor = '';
    currentShadowBlur = 0;
    currentShadowColor = '';
  }
}

const scoreEl = document.getElementById('scoreVal');
const hpEl = document.getElementById('hpVal');
const waveEl = document.getElementById('waveVal');
const comboEl = document.getElementById('combo');
const comboValEl = document.getElementById('comboVal');
const scorePopupsContainer = document.getElementById('scorePopups');
const dashAbility = document.getElementById('dashAbility');
const dashCooldownEl = dashAbility?.querySelector('.ability-cooldown');
const dashTimerEl = dashAbility?.querySelector('.ability-timer');
const buffsDisplayEl = document.getElementById('buffsDisplay');
const killsValEl_cached = document.getElementById('killsVal');

// --- resize ---

let canvasRect = { left: 0, top: 0 };
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvasRect    = canvas.getBoundingClientRect();
  // Resizing resets all context state — re-apply this every time
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

// --- custom cursor ---
const customCursor = document.createElement('div');
customCursor.className = 'custom-cursor';

// use real child divs for the lines so JS can style them directly
// (::before/::after can't be targeted from JS, breaks on some Chromebook Chrome versions)
const cursorH = document.createElement('div');
const cursorV = document.createElement('div');
const cursorDot = document.createElement('div');
cursorDot.className = 'custom-cursor-dot';

Object.assign(cursorH.style, {
  position: 'absolute', left: '0', top: '50%',
  width: '100%', height: '3px',
  transform: 'translateY(-50%)', pointerEvents: 'none'
});
Object.assign(cursorV.style, {
  position: 'absolute', left: '50%', top: '0',
  width: '3px', height: '100%',
  transform: 'translateX(-50%)', pointerEvents: 'none'
});

customCursor.appendChild(cursorH);
customCursor.appendChild(cursorV);
customCursor.appendChild(cursorDot);
document.body.appendChild(customCursor);

document.addEventListener('mousemove', (e) => {
  // translate3d uses the GPU compositor — no layout reflow, no jitter
  customCursor.style.transform = `translate3d(${e.clientX - 20}px,${e.clientY - 20}px,0)`;
});

document.addEventListener('mouseleave', () => {
  customCursor.style.opacity = '0';
});

document.addEventListener('mouseenter', () => {
  customCursor.style.opacity = '1';
});

// --- input ---

const keys = {};
const mouse = { x: canvas.width / 2, y: canvas.height / 2, down: false };

window.addEventListener('keydown', (e) => {
  if (!e.key) return;
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ' && running && !paused) {
    e.preventDefault();
    player.dash();
  }
  if (e.key === 'Escape' && running) {
    e.preventDefault();
    togglePause();
  }
 // ~ key toggles dev overlay (admin only)
  if ((e.key === '`' || e.key === '~') && running && isAdmin) {
    e.preventDefault();
    devOverlayToggle();
  }
});

window.addEventListener('keyup', (e) => {
  if (!e.key) return;
  keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousedown', () => {
  mouse.down = true;
});

canvas.addEventListener('mouseup', () => {
  mouse.down = false;
});

canvas.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX - canvasRect.left;
  mouse.y = e.clientY - canvasRect.top;
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  mouse.down = true;
  mouse.x = e.touches[0].clientX - canvasRect.left;
  mouse.y = e.touches[0].clientY - canvasRect.top;
});

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  mouse.down = false;
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  mouse.x = e.touches[0].clientX - canvasRect.left;
  mouse.y = e.touches[0].clientY - canvasRect.top;
});

// --- audio ---

let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      console.log('🔊 Audio initialized');
    } catch(e) {
      console.log('🔇 Audio not available');
    }
  }
}

function playSound(freq, duration, type) {
  if (!audioCtx || !gameSettings.masterSound) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    osc.type = type || 'sine';
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
  } catch(e) {}
}

const sounds = {
  shoot: () => { if (gameSettings.shootSound) playSound(800, 0.1, 'square'); },
  hit: () => playSound(150, 0.15, 'sawtooth'),
  powerUp: () => {
    playSound(600, 0.2, 'sine');
    setTimeout(() => playSound(800, 0.2, 'sine'), 50);
  },
  damage: () => playSound(100, 0.3, 'sawtooth'),
  dash: () => playSound(1200, 0.15, 'sine'),
  bossSpawn: () => {
    playSound(80, 0.5, 'sawtooth');
    setTimeout(() => playSound(100, 0.5, 'sawtooth'), 100);
    setTimeout(() => playSound(120, 0.5, 'sawtooth'), 200);
  },
  coin: () => playSound(1400, 0.05, 'sine'),
};

// --- settings ---

const defaultSettings = {
  masterSound: true,
  shootSound: true,
  screenShake: true,
  particles: true,
  showFPS: false,
  autoShoot: false,
  perfMode: false,
};

const gameSettings = Object.assign({}, defaultSettings,
  JSON.parse(localStorage.getItem('gameSettings') || '{}'));

function saveSettings() {
  localStorage.setItem('gameSettings', JSON.stringify(gameSettings));
}

function applyCursorColor(color) {
  gameSettings.cursorColor = color;
  saveSettings();

  // gradient strings for the crosshair lines
  const hGrad = `linear-gradient(to right, transparent 0%, ${color} 45%, #fff 50%, ${color} 55%, transparent 100%)`;
  const vGrad = `linear-gradient(to bottom, transparent 0%, ${color} 45%, #fff 50%, ${color} 55%, transparent 100%)`;
  const glow  = `0 0 6px ${color}, 0 0 3px rgba(255,255,255,0.9)`;

  cursorH.style.background = hGrad;
  cursorH.style.boxShadow  = glow;
  cursorV.style.background = vGrad;
  cursorV.style.boxShadow  = glow;
  cursorDot.style.border   = `2px solid ${color}`;
  cursorDot.style.boxShadow = `0 0 8px ${color}, 0 0 4px rgba(255,255,255,1)`;
  customCursor.style.filter = `drop-shadow(0 0 8px ${color}) drop-shadow(0 0 14px ${color}80)`;
}

// apply saved color on load
applyCursorColor(gameSettings.cursorColor || '#58a6ff');

// --- coins & skins ---

let playerCoins = Number(localStorage.getItem('playerCoins') || 0);

function saveCoins() {
  if (typeof achOnCoinsChanged === 'function') achOnCoinsChanged();
  if (isGuest || !currentUser) {
    localStorage.setItem('playerCoins', playerCoins);
  } else if (typeof saveUserDataToFirebase === 'function') {
    // Throttled via scheduleSave — safe to call on every kill
    saveUserDataToFirebase();
  }
  // Keep HUD in sync whenever coins change
  const coinsHUD = document.getElementById('coinsHUD');
  if (coinsHUD) coinsHUD.textContent = `🪙 ${playerCoins}`;
}

// true level from XP (continues past tier 50)
function calculateTrueLevel(xp) {
  if (typeof getCumulativeXP === 'undefined') return 0;
  
  const cumulativeXP = getCumulativeXP();
  
  for (let i = 0; i < 50; i++) {
    if (xp < cumulativeXP[i]) {
      return i;
    }
  }
  
 // beyond 50: 3500 XP per level
  const tier50XP = cumulativeXP[49];
  const xpBeyond50 = xp - tier50XP;
  const xpPerLevelAfter50 = 3500;
  const levelsAfter50 = Math.floor(xpBeyond50 / xpPerLevelAfter50);
  
  return 50 + levelsAfter50;
}

function updateXPDisplay() {
  if (typeof battlePassData === 'undefined' || typeof getCumulativeXP === 'undefined') return;

  const cumulativeXP = getCumulativeXP();
  const currentTier = battlePassData.currentTier;
  const currentXP = battlePassData.currentXP;
  const trueLevel = calculateTrueLevel(currentXP);

  const currentTierXP = currentTier > 0 ? cumulativeXP[currentTier - 1] : 0;
  const nextTierXP = currentTier < 50 ? cumulativeXP[currentTier] : cumulativeXP[49];
  const xpInCurrentTier = currentXP - currentTierXP;
  const xpNeededForNextTier = nextTierXP - currentTierXP;
  const progress = currentTier >= 50 ? 100 : (xpInCurrentTier / xpNeededForNextTier) * 100;

 // in-game HUD
  const xpLevelEl = document.getElementById('xpLevelVal');
  const xpCurrentEl = document.getElementById('xpCurrentVal');
  const xpNeededEl = document.getElementById('xpNeededVal');
  const xpBarFill = document.getElementById('xpBarFill');

  if (xpLevelEl) {
    xpLevelEl.textContent = trueLevel;
    
    if (trueLevel > 50) {
      const xpBeyond50 = currentXP - cumulativeXP[49];
      const xpPerLevelAfter50 = 3500;
      const xpIntoCurrentLevel = xpBeyond50 % xpPerLevelAfter50;
      const progressBeyond50 = (xpIntoCurrentLevel / xpPerLevelAfter50) * 100;

      xpCurrentEl.textContent = xpIntoCurrentLevel.toLocaleString();
      xpNeededEl.textContent = xpPerLevelAfter50.toLocaleString();
      xpBarFill.style.width = Math.max(0, Math.min(100, progressBeyond50)) + '%';
    } else {
      xpCurrentEl.textContent = xpInCurrentTier;
      xpNeededEl.textContent = xpNeededForNextTier;
      xpBarFill.style.width = Math.max(0, Math.min(100, progress)) + '%';
    }
  }

 // home screen
  const homeXPLevel = document.getElementById('homeXPLevel');
  const homeXPCurrent = document.getElementById('homeXPCurrent');
  const homeXPNeeded = document.getElementById('homeXPNeeded');
  const homeXPBar = document.getElementById('homeXPBar');

  if (homeXPLevel) {
    homeXPLevel.textContent = trueLevel;
    if (trueLevel > 50) {
      const xpBeyond50 = currentXP - cumulativeXP[49];
      const xpPerLevelAfter50 = 3500;
      const xpIntoCurrentLevel = xpBeyond50 % xpPerLevelAfter50;
      const progressBeyond50 = (xpIntoCurrentLevel / xpPerLevelAfter50) * 100;

      homeXPCurrent.textContent = xpIntoCurrentLevel.toLocaleString();
      homeXPNeeded.textContent = xpPerLevelAfter50.toLocaleString();
      homeXPBar.style.width = Math.max(0, Math.min(100, progressBeyond50)) + '%';
    } else {
      homeXPCurrent.textContent = xpInCurrentTier;
      homeXPNeeded.textContent = xpNeededForNextTier;
      homeXPBar.style.width = Math.max(0, Math.min(100, progress)) + '%';
    }
  }
}

const SKINS = [
  { id: 'agent',    name: 'Agent',       color: '#9be7ff', price: 0,    desc: 'The original' },
  { id: 'inferno',  name: 'Inferno',     color: '#ff6b35', price: 150,  desc: 'Burns bright' },
  { id: 'venom',    name: 'Venom',       color: '#6bff7b', price: 200,  desc: 'Deadly green' },
  { id: 'ice',      name: 'Ice',         color: '#00d9ff', price: 300,  desc: 'Cold as ice' },
  { id: 'shadow',   name: 'Shadow',      color: '#9966ff', price: 350,  desc: 'Dark energy' },
  { id: 'amber',    name: 'Amber',       color: '#ffaa00', price: 400,  desc: 'Warm glow' },
  { id: 'crimson',  name: 'Crimson',     color: '#dc143c', price: 450,  desc: 'Blood red' },
  { id: 'gold',     name: 'Gold Rush',   color: '#ffd700', price: 500,  desc: 'Rich shooter' },
  { id: 'ocean',    name: 'Ocean',       color: '#006994', price: 600,  desc: 'Deep blue' },
  { id: 'toxic',    name: 'Toxic',       color: '#9afd2e', price: 650,  desc: 'Radioactive' },
  { id: 'magma',    name: 'Magma',       color: '#ff4500', price: 700,  desc: 'Molten hot' },
  { id: 'plasma',   name: 'Plasma',      color: '#ff69d9', price: 750,  desc: 'Hot pink rage' },
  { id: 'emerald',  name: 'Emerald',     color: '#50c878', price: 800,  desc: 'Precious gem' },
  { id: 'frost',    name: 'Frost',       color: '#b0e0e6', price: 850,  desc: 'Frozen solid' },
  { id: 'midnight', name: 'Midnight',    color: '#1a1aff', price: 900,  desc: 'Dark blue aura' },
  { id: 'sakura',   name: 'Sakura',      color: '#ffb7c5', price: 1000, desc: 'Cherry blossom' },
  { id: 'electric', name: 'Electric',    color: '#00ffff', price: 1100, desc: 'High voltage' },
  { id: 'ruby',     name: 'Ruby',        color: '#e0115f', price: 1200, desc: 'Red jewel' },
  { id: 'lime',     name: 'Lime',        color: '#ccff00', price: 1300, desc: 'Neon green' },
  { id: 'violet',   name: 'Violet',      color: '#8f00ff', price: 1400, desc: 'Royal purple' },
  { id: 'rainbow',  name: 'Rainbow',     color: null,      price: 1500, desc: 'All the vibes' },
  { id: 'copper',   name: 'Copper',      color: '#b87333', price: 1650, desc: 'Metallic shine' },
  { id: 'cyber',    name: 'Cyber',       color: '#00ff41', price: 1800, desc: 'Matrix vibes' },
  { id: 'sunset',   name: 'Sunset',      color: null,      price: 2000, desc: '🌅 Animated gradient' },
  { id: 'galaxy',   name: 'Galaxy',      color: null,      price: 2500, desc: '⭐ SECRET: Cosmic power' },
  { id: 'phoenix',  name: 'Phoenix',     color: null,      price: 3000, desc: '🔥 SECRET: Fire wings' },
  { id: 'void',     name: 'Void Walker', color: null,      price: 3500, desc: '☠ SECRET: Pure darkness' },
  { id: 'diamond',  name: 'Diamond',     color: null,      price: 5000, desc: '💎 ULTRA SECRET: Ultimate flex' },
  { id: 'quantum',  name: 'Quantum Flux', color: null,      price: 10000, desc: '⚛️ LEGENDARY: Reality bender' },
  { id: 'celestial', name: 'Celestial Nexus', color: null,   price: 25000, desc: '✨ MYTHIC: Universal convergence' },
 // leaderboard-exclusive skins (earned only)
  { id: 'bronze-champion', name: '🥉 Bronze Champion', color: null, price: -1, leaderboardRank: 3, desc: '🏆 EXCLUSIVE: 3rd Place Global Rank' },
  { id: 'silver-champion', name: '🥈 Silver Champion', color: null, price: -1, leaderboardRank: 2, desc: '🏆 EXCLUSIVE: 2nd Place Global Rank' },
  { id: 'gold-champion',   name: '🥇 Gold Champion',   color: null, price: -1, leaderboardRank: 1, desc: '🏆 EXCLUSIVE: 1st Place Global Rank' },

 // crate-exclusive skins (price: -2)
 // common
  { id: 'c_static',   name: 'Static',      color: '#b8b8cc', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Common' },
  { id: 'c_rust',     name: 'Rust',         color: '#8b4513', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Common' },
  { id: 'c_slate',    name: 'Slate',        color: '#708090', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Common' },
  { id: 'c_olive',    name: 'Olive Drab',   color: '#6b8e23', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Common' },
  { id: 'c_maroon',   name: 'Maroon',       color: '#9b2335', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Common' },
 // uncommon
  { id: 'c_cobalt',   name: 'Cobalt',       color: '#0047ab', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Uncommon' },
  { id: 'c_teal',     name: 'Teal',         color: '#00897b', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Uncommon' },
  { id: 'c_coral',    name: 'Coral',        color: '#ff6f61', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Uncommon' },
  { id: 'c_sand',     name: 'Sandstorm',    color: '#c2a25a', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Uncommon' },
  { id: 'c_chrome',   name: 'Chrome',       color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Uncommon' },
 // rare
  { id: 'c_prism',    name: 'Prism',        color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Rare' },
  { id: 'c_aurora',   name: 'Aurora',       color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Rare' },
  { id: 'c_lava',     name: 'Lava Flow',    color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Rare' },
  { id: 'c_storm',    name: 'Stormcloud',   color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Rare' },
  { id: 'c_neon',     name: 'Neon Sign',    color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Rare' },
 // epic
  { id: 'c_glitch',   name: 'Glitch',       color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Epic' },
  { id: 'c_nebula',   name: 'Nebula',       color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Epic' },
  { id: 'c_biohazard',name: 'Biohazard',    color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Epic' },
  { id: 'c_arctic',   name: 'Arctic Blast', color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Epic' },
  { id: 'c_wildfire', name: 'Wildfire',     color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Epic' },
  { id: 'c_spectre',  name: 'Spectre',      color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Epic' },
 // legendary
  { id: 'c_supernova',name: 'Supernova',    color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Legendary' },
  { id: 'c_wraith',   name: 'Wraith',       color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Legendary' },
  { id: 'c_titan',    name: 'Titan',        color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Legendary' },
  { id: 'c_astral',   name: 'Astral',       color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Legendary' },
 // mythic
  { id: 'c_omnichrome',  name: 'Omnichrome',   color: null,   price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Mythic' },
  { id: 'c_singularity', name: 'Singularity',  color: null,   price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Mythic' },
  { id: 'c_ultraviolet', name: 'Ultraviolet',  color: null,   price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Mythic' },
  { id: 'c_godmode',     name: 'God Mode',     color: null,   price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Mythic' },
  { id: 'c_rift',        name: 'Rift',         color: null,   price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Mythic' },

 // oblivion crate exclusives
 // epic
  { id: 'ob_duskblade',  name: 'Duskblade',     color: null, price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Epic' },
  { id: 'ob_voidborn',   name: 'Voidborn',      color: null, price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Epic' },
  { id: 'ob_ashwalker',  name: 'Ashwalker',     color: null, price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Epic' },
 // legendary
  { id: 'ob_soulreaper', name: 'Soulreaper',    color: null, price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Legendary' },
  { id: 'ob_eclipsar',   name: 'Eclipsar',      color: null, price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Legendary' },
  { id: 'ob_phantomking',name: 'Phantom King',  color: null, price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Legendary' },
 // mythic
  { id: 'ob_abyssal',    name: 'Abyssal',       color: null, price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Mythic' },
  { id: 'ob_eventide',   name: 'Eventide',      color: null, price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Mythic' },
 // oblivion-exclusive ultra rares
  { id: 'ob_worldeater', name: 'WORLDEATER',    color: null, price: -2, crateOnly: true, desc: '🌑 Oblivion Exclusive · Ultra Rare' },
  { id: 'ob_eternium',   name: 'ETERNIUM',      color: null, price: -2, crateOnly: true, desc: '🌑 Oblivion Exclusive · Ultra Rare' },
 // new oblivion skins
  { id: 'ob_nightcrawler', name: 'Nightcrawler',  color: '#0a1030', price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Epic' },
  { id: 'ob_ironwraith',   name: 'Iron Wraith',   color: '#3d2820', price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Epic' },
  { id: 'ob_hellforge',    name: 'Hellforge',     color: null,      price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Legendary' },
  { id: 'ob_gravemind',    name: 'Gravemind',     color: '#e8e0d0', price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Legendary' },
  { id: 'ob_voidwalker',   name: 'Voidwalker',    color: null,      price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Mythic' },
  { id: 'ob_deathbloom',   name: 'Deathbloom',    color: null,      price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Mythic' },
  { id: 'ob_apocalypse',   name: 'Apocalypse',    color: null,      price: -2, crateOnly: true, desc: '🌑 Oblivion Crate · Ultra' },
 // new standard crate skins
  { id: 'c_moss',          name: 'Moss',          color: '#3d6e3d', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Common' },
  { id: 'c_ash',           name: 'Ash',           color: '#c8c0b8', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Common' },
  { id: 'c_dusk',          name: 'Dusk',          color: '#2d2050', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Common' },
  { id: 'c_clay',          name: 'Clay',          color: '#b5651d', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Common' },
  { id: 'c_sapphire',      name: 'Sapphire',      color: '#1560bd', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Uncommon' },
  { id: 'c_mint',          name: 'Mint',          color: '#4dffc3', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Uncommon' },
  { id: 'c_bronze_skin',   name: 'Bronze',        color: '#c07830', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Uncommon' },
  { id: 'c_storm_grey',    name: 'Storm Grey',    color: '#4a5568', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Uncommon' },
  { id: 'c_bloodmoon',     name: 'Blood Moon',    color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Rare' },
  { id: 'c_frostfire',     name: 'Frost Fire',    color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Rare' },
  { id: 'c_vortex',        name: 'Vortex',        color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Rare' },
  { id: 'c_toxic_waste',   name: 'Toxic Waste',   color: '#39ff14', price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Rare' },
  { id: 'c_blackhole',     name: 'Black Hole',    color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Epic' },
  { id: 'c_dragonscale',   name: 'Dragon Scale',  color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Epic' },
  { id: 'c_hologram',      name: 'Hologram',      color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Epic' },
  { id: 'c_thunderstrike', name: 'Thunderstrike', color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Epic' },
  { id: 'c_eclipse',       name: 'Eclipse',       color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Legendary' },
  { id: 'c_abyssal_flame', name: 'Abyssal Flame', color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Legendary' },
  { id: 'c_zero_point',    name: 'Zero Point',    color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Legendary' },
  { id: 'c_entropy',       name: 'Entropy',       color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Mythic' },
  { id: 'c_dimension_rift',name: 'Dimension Rift',color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Mythic' },
  { id: 'c_eternal',       name: 'Eternal',       color: null,      price: -2, crateOnly: true, desc: '📦 Crate Exclusive · Mythic' },
 // neon crate exclusives
  { id: 'neon_pulse',    name: 'Neon Pulse',    color: '#00b4ff', price: -2, crateOnly: true, desc: '⚡ Neon Crate · Uncommon' },
  { id: 'neon_grid',     name: 'Neon Grid',     color: '#00ffcc', price: -2, crateOnly: true, desc: '⚡ Neon Crate · Uncommon' },
  { id: 'neon_surge',    name: 'Neon Surge',    color: null,      price: -2, crateOnly: true, desc: '⚡ Neon Crate · Rare' },
  { id: 'neon_cipher',   name: 'Neon Cipher',   color: null,      price: -2, crateOnly: true, desc: '⚡ Neon Crate · Rare' },
  { id: 'neon_overload', name: 'Neon Overload', color: null,      price: -2, crateOnly: true, desc: '⚡ Neon Crate · Epic' },
  { id: 'neon_synthwave',name: 'Synthwave',     color: null,      price: -2, crateOnly: true, desc: '⚡ Neon Crate · Legendary' },
 // frost crate exclusives
  { id: 'frost_snowdrift',    name: 'Snowdrift',     color: '#e8f4fd', price: -2, crateOnly: true, desc: '❄️ Frost Crate · Uncommon' },
  { id: 'frost_icicle',       name: 'Icicle',        color: '#a8d8ea', price: -2, crateOnly: true, desc: '❄️ Frost Crate · Uncommon' },
  { id: 'frost_blizzard',     name: 'Blizzard',      color: null,      price: -2, crateOnly: true, desc: '❄️ Frost Crate · Rare' },
  { id: 'frost_permafrost',   name: 'Permafrost',    color: null,      price: -2, crateOnly: true, desc: '❄️ Frost Crate · Rare' },
  { id: 'frost_avalanche',    name: 'Avalanche',     color: null,      price: -2, crateOnly: true, desc: '❄️ Frost Crate · Epic' },
  { id: 'frost_absolute_zero',name: 'Absolute Zero', color: null,      price: -2, crateOnly: true, desc: '❄️ Frost Crate · Legendary' },
 // infernal crate exclusives
  { id: 'infernal_ember',       name: 'Ember',       color: '#ff6600', price: -2, crateOnly: true, desc: '🔥 Infernal Crate · Uncommon' },
  { id: 'infernal_cinder',      name: 'Cinder',      color: '#555244', price: -2, crateOnly: true, desc: '🔥 Infernal Crate · Uncommon' },
  { id: 'infernal_wildfire',    name: 'Wildfire',    color: null,      price: -2, crateOnly: true, desc: '🔥 Infernal Crate · Rare' },
  { id: 'infernal_eruption',    name: 'Eruption',    color: null,      price: -2, crateOnly: true, desc: '🔥 Infernal Crate · Rare' },
  { id: 'infernal_hellstorm',   name: 'Hellstorm',   color: null,      price: -2, crateOnly: true, desc: '🔥 Infernal Crate · Epic' },
  { id: 'infernal_solar_flare', name: 'Solar Flare', color: null,      price: -2, crateOnly: true, desc: '🔥 Infernal Crate · Legendary' },
 // void crate exclusives
  { id: 'void_hollow',        name: 'Hollow',        color: '#050505', price: -2, crateOnly: true, desc: '🌀 Void Crate · Rare' },
  { id: 'void_nebula_core',   name: 'Nebula Core',   color: null,      price: -2, crateOnly: true, desc: '🌀 Void Crate · Epic' },
  { id: 'void_dark_matter',   name: 'Dark Matter',   color: null,      price: -2, crateOnly: true, desc: '🌀 Void Crate · Epic' },
  { id: 'void_event_horizon', name: 'Event Horizon', color: null,      price: -2, crateOnly: true, desc: '🌀 Void Crate · Legendary' },
  { id: 'void_big_bang',      name: 'Big Bang',      color: null,      price: -2, crateOnly: true, desc: '🌀 Void Crate · Mythic' },

 // icon skins (friend collection, crate only)
  { id: 'icon_noah_brown',      name: 'Noah - IYKYK',           color: '#6b4423', price: -2, crateOnly: true, iconSkin: true, desc: '🎯 Icon Skins Exclusive' },
  { id: 'icon_keegan_baseball', name: 'Keegan - Baseball',    color: null,      price: -2, crateOnly: true, iconSkin: true, desc: '🎯 Icon Skins Exclusive' },
  { id: 'icon_dpoe_fade',       name: 'Dpoe',                 color: null,      price: -2, crateOnly: true, iconSkin: true, desc: '🎯 Icon Skins Exclusive' },
  { id: 'icon_evan_watermelon', name: 'Evan - Watermelon',    color: null,      price: -2, crateOnly: true, iconSkin: true, desc: '🎯 Icon Skins Exclusive' },
  { id: 'icon_gavin_tzl',       name: 'Gavin - TZL',          color: null,      price: -2, crateOnly: true, iconSkin: true, desc: '🎯 Icon Skins Exclusive' },
  { id: 'icon_carter_cosmic',   name: 'Carter', color: null,      price: -2, crateOnly: true, iconSkin: true, desc: '🎯 Icon Skins Exclusive' },
  { id: 'icon_brody_flag',      name: 'Brody - Old Glory',    color: null,      price: -2, crateOnly: true, iconSkin: true, desc: '🎯 Icon Skins Exclusive' },
  { id: 'icon_sterling',        name: 'Sterling',             color: null,      price: -2, crateOnly: true, iconSkin: true, desc: '🎯 Icon Skins Exclusive' },
  { id: 'icon_justin_clover',   name: 'Justin - Clover', color: null,      price: -2, crateOnly: true, iconSkin: true, desc: '🎯 Icon Skins Exclusive' },
  { id: 'icon_profe_spain',     name: 'Profe',                color: '#aa151b', price: -2, crateOnly: true, iconSkin: true, desc: '🎯 Icon Skins Exclusive' },
  { id: 'icon_kayden_duck',     name: 'Kayden',               color: null,      price: -2, crateOnly: true, iconSkin: true, desc: '🎯 Icon Skins Exclusive' },
  { id: 'icon_troy_puck',       name: 'Troy',                 color: null,      price: -2, crateOnly: true, iconSkin: true, desc: '🎯 Icon Skins Exclusive' },
  { id: 'icon_the_creator',     name: 'THE CREATOR',          color: null,      price: -2, crateOnly: true, iconSkin: true, hideUntilUnlocked: true, desc: '✨ Secret Skin' },

 // battle pass season 1
  { id: 'bp1_striker',   name: 'Striker',         color: '#ff6b35', price: -3, battlePassTier: 5,  desc: '🎫 Battle Pass S1 · Tier 5' },
  { id: 'bp1_guardian',  name: 'Guardian',        color: '#4ecdc4', price: -3, battlePassTier: 10, desc: '🎫 Battle Pass S1 · Tier 10' },
  { id: 'bp1_phantom',   name: 'Phantom',         color: '#9b59b6', price: -3, battlePassTier: 20, desc: '🎫 Battle Pass S1 · Tier 20' },
  { id: 'bp1_tempest',   name: 'Tempest',         color: '#3498db', price: -3, battlePassTier: 30, desc: '🎫 Battle Pass S1 · Tier 30' },
  { id: 'bp1_eclipse',   name: 'Eclipse',         color: '#2c3e50', price: -3, battlePassTier: 40, desc: '🎫 Battle Pass S1 · Tier 40' },
  { id: 'bp1_sovereign', name: 'Sovereign',       color: '#f39c12', price: -3, battlePassTier: 45, desc: '🎫 Battle Pass S1 · Tier 45 · Epic' },
  { id: 'bp1_apex',      name: 'Apex Predator',   color: '#e74c3c', price: -3, battlePassTier: 50, desc: '🎫 Battle Pass S1 · Tier 50 · LEGENDARY' },

// achievement exclusive — cannot be bought, earned, or traded
  { id: 'transcendence', name: 'TRANSCENDENCE', color: null, price: -99, achievementOnly: true, desc: '✨ Achievement Reward · Complete all 12 achievements' },
];

let ownedSkins = JSON.parse(localStorage.getItem('ownedSkins') || '["agent"]');
let activeSkin = localStorage.getItem('activeSkin') || 'agent';

// ── Mutation system ──────────────────────────────────────────
// Skins from crates have a small chance to be "mutated" — a rare
// cosmetic variant stored as baseSkinId__mutationType.
const MUTATION_CONFIG = {
  corrupted: {
    label: 'CORRUPTED', color: '#ff3333',
    chance: 0.008,           // 0.8% per pull (1 in 125)
    priceMultiplier: 1.5,
    cssFilter: 'hue-rotate(180deg) saturate(2.2) brightness(0.8)',
    glowColor: 'rgba(255,50,50,0.75)',
    cssClass: 'mutation-corrupted',
  },
  gilded: {
    label: 'GILDED', color: '#ffd700',
    chance: 0.006,           // 0.6% per pull (1 in 167)
    priceMultiplier: 2.0,
    cssFilter: 'sepia(0.8) saturate(2.5) brightness(1.2) hue-rotate(5deg)',
    glowColor: 'rgba(255,215,0,0.8)',
    cssClass: 'mutation-gilded',
  },
  void: {
    label: 'VOID', color: '#9933ff',
    chance: 0.004,           // 0.4% per pull (1 in 250)
    priceMultiplier: 3.0,
    cssFilter: 'hue-rotate(265deg) saturate(3) brightness(0.65)',
    glowColor: 'rgba(153,0,255,0.8)',
    cssClass: 'mutation-void',
  },
  prismatic: {
    label: 'PRISMATIC', color: '#ff69ff',
    chance: 0.002,           // 0.2% per pull (1 in 500)
    priceMultiplier: 5.0,
    cssFilter: null,         // handled by CSS keyframe animation
    glowColor: 'rgba(255,255,255,0.9)',
    cssClass: 'mutation-prismatic',
  },
};

// Splits "phantom__corrupted" → { baseSkinId: "phantom", mutation: "corrupted" }
function parseMutatedSkinId(skinId) {
  const sep = (skinId || '').indexOf('__');
  if (sep === -1) return { baseSkinId: skinId, mutation: null };
  return { baseSkinId: skinId.slice(0, sep), mutation: skinId.slice(sep + 2) };
}

function getMutationConfig(mutation) {
  return (mutation && MUTATION_CONFIG[mutation]) || null;
}

function saveSkins() {
  if (typeof achOnSkinsChanged === 'function') achOnSkinsChanged();
  if (isGuest || !currentUser) {
    localStorage.setItem('ownedSkins', JSON.stringify(ownedSkins));
    localStorage.setItem('activeSkin', activeSkin);
  } else if (currentUser && typeof saveUserDataToFirebase === 'function') {
    saveUserDataToFirebase('critical');
  }
}

function getActiveSkinColor() {
  if (activeSkin === 'transcendence') {
    // Full-spectrum ultra-fast cycling
    const hue = (Date.now() / 3) % 360;
    return `hsl(${hue},100%,72%)`;
  }
  if (activeSkin === 'rainbow') {
    const hue = (Date.now() / 20) % 360;
    return `hsl(${hue},100%,70%)`;
  }
  if (activeSkin === 'galaxy') {
    const time = Date.now() / 50;
    const hue = (time % 120) + 240; // Range from 240 (blue) to 360 (magenta)
    return `hsl(${hue},90%,65%)`;
  }
  if (activeSkin === 'void') {
    const time = Date.now() / 300;
    const pulse = Math.sin(time) * 0.4 + 0.6;
    const hueShift = Math.sin(time / 2) * 20;
    const brightness = 10 + pulse * 30;
    return `hsl(${270 + hueShift},100%,${brightness}%)`;
  }
  if (activeSkin === 'sunset') {
    const time = Date.now() / 40;
    const hue = ((time % 60) + 0);
    return `hsl(${hue},100%,65%)`;
  }
  if (activeSkin === 'phoenix') {
    const time = Date.now() / 30;
    const hue = ((time % 40) + 0);
    const brightness = 60 + Math.sin(time / 5) * 10;
    return `hsl(${hue},100%,${brightness}%)`;
  }
  if (activeSkin === 'diamond') {
    const time = Date.now() / 15;
    const hue = (time * 3) % 360;
    const saturation = 25 + Math.sin(time / 3) * 25;
    const brightness = 93 + Math.sin(time / 4) * 5;
    return `hsl(${hue},${saturation}%,${brightness}%)`;
  }
  if (activeSkin === 'quantum') {
    const time = Date.now() / 8;
    const hue = (time * 5) % 360;
    const saturation = 90 + Math.sin(time / 2) * 10;
    const brightness = 60 + Math.sin(time / 3) * 15;
    return `hsl(${hue},${saturation}%,${brightness}%)`;
  }
  if (activeSkin === 'celestial') {
    const time = Date.now() / 10;
    const phase = Math.sin(time / 80);

    let hue, saturation, brightness;
    if (phase < -0.33) {
 // purple zone
      hue = 280 + Math.sin(time / 20) * 30;
      saturation = 95 + Math.sin(time / 15) * 5;
      brightness = 65 + Math.sin(time / 12) * 15;
    } else if (phase < 0.33) {
 // cyan zone
      hue = 190 + Math.sin(time / 18) * 25;
      saturation = 90 + Math.sin(time / 13) * 10;
      brightness = 70 + Math.sin(time / 10) * 12;
    } else {
 // gold zone
      hue = 45 + Math.sin(time / 22) * 20;
      saturation = 100;
      brightness = 75 + Math.sin(time / 14) * 15;
    }
    
    return `hsl(${hue},${saturation}%,${brightness}%)`;
  }
 // champion skins
  if (activeSkin === 'gold-champion') {
    const time = Date.now() / 5;
    const mainGold = 45 + Math.sin(time / 3) * 5;
    const brightness = 85 + Math.sin(time / 2) * 12;
    const chromatic = (time * 8) % 360;
    const glitch = Math.sin(time / 1.5) * 3;
    return `hsl(${mainGold + glitch},100%,${brightness}%)`;
  }
  if (activeSkin === 'silver-champion') {
    const time = Date.now() / 6;
    const metalBase = 200 + Math.sin(time / 4) * 20;
    const plasma = Math.sin(time / 2) * 30 + 70;
    const holographic = (time * 6) % 60;
    const shimmer = Math.sin(time * 3) * 5;
    return `hsl(${metalBase + holographic + shimmer},25%,${plasma}%)`;
  }
  if (activeSkin === 'bronze-champion') {
    const time = Date.now() / 7;
    const bronzeBase = 25 + Math.sin(time / 3) * 8;
    const lavaGlow = 50 + Math.sin(time / 2) * 20;
    const goldShift = Math.sin(time / 4) * 10;
    const molten = Math.sin(time * 2) * 5;
    return `hsl(${bronzeBase + goldShift + molten},85%,${lavaGlow}%)`;
  }
 // crate skin animations
 // common
  if (activeSkin === 'c_static') {
    const t = Date.now() / 150;
    const b = 60 + Math.sin(t) * 15;
    return `hsl(240,8%,${b}%)`;
  }
  if (activeSkin === 'c_rust') {
    const t = Date.now() / 180;
    const h = 18 + Math.sin(t) * 5;
    const b = 38 + Math.sin(t * 1.3) * 10;
    return `hsl(${h},70%,${b}%)`;
  }
  if (activeSkin === 'c_slate') {
    const t = Date.now() / 200;
    const b = 42 + Math.sin(t) * 12;
    return `hsl(210,18%,${b}%)`;
  }
  if (activeSkin === 'c_olive') {
    const t = Date.now() / 170;
    const h = 78 + Math.sin(t) * 8;
    const b = 35 + Math.sin(t * 1.2) * 10;
    return `hsl(${h},55%,${b}%)`;
  }
  if (activeSkin === 'c_maroon') {
    const t = Date.now() / 190;
    const h = 348 + Math.sin(t) * 8;
    const b = 35 + Math.sin(t * 1.1) * 12;
    return `hsl(${h},65%,${b}%)`;
  }
 // uncommon
  if (activeSkin === 'c_cobalt') {
    const t = Date.now() / 120;
    const h = 215 + Math.sin(t) * 15;
    const b = 45 + Math.sin(t * 1.4) * 18;
    return `hsl(${h},85%,${b}%)`;
  }
  if (activeSkin === 'c_teal') {
    const t = Date.now() / 110;
    const h = 170 + Math.sin(t / 1.3) * 20;
    const b = 42 + Math.sin(t) * 16;
    return `hsl(${h},80%,${b}%)`;
  }
  if (activeSkin === 'c_coral') {
    const t = Date.now() / 130;
    const h = 14 + Math.sin(t / 1.5) * 12;
    const b = 55 + Math.sin(t) * 18;
    return `hsl(${h},90%,${b}%)`;
  }
  if (activeSkin === 'c_sand') {
    const t = Date.now() / 140;
    const h = 38 + Math.sin(t / 1.2) * 10;
    const b = 52 + Math.sin(t) * 16;
    return `hsl(${h},65%,${b}%)`;
  }
  if (activeSkin === 'c_chrome') {
    const t = Date.now() / 80;
    const h = 220 + Math.sin(t / 3) * 20;
    const s = 10 + Math.sin(t / 2) * 10;
    const b = 55 + Math.sin(t) * 35;  // 20–90%: metallic flash
    return `hsl(${h},${s}%,${b}%)`;
  }
 // rare
  if (activeSkin === 'c_prism') {
    const t = Date.now() / 18;
    return `hsl(${(t * 5) % 360},100%,68%)`;
  }
  if (activeSkin === 'c_aurora') {
    const t = Date.now() / 40;
    const h = 130 + Math.sin(t / 6) * 90; // green↔violet
    const b = 55 + Math.sin(t / 4) * 18;
    return `hsl(${h},85%,${b}%)`;
  }
  if (activeSkin === 'c_lava') {
    const t = Date.now() / 20;
    const h = 8 + Math.sin(t / 5) * 12;  // red–orange
    const b = 52 + Math.sin(t / 3) * 20;
    return `hsl(${h},100%,${b}%)`;
  }
  if (activeSkin === 'c_storm') {
    const t = Date.now() / 35;
    const h = 215 + Math.sin(t / 5) * 25;
    const b = 25 + Math.sin(t / 3) * 25; // dark to bright blue-white
    return `hsl(${h},75%,${b}%)`;
  }
  if (activeSkin === 'c_neon') {
    const t = Date.now() / 15;
    const h = 170 + Math.sin(t / 4) * 150; // cyan↔magenta
    return `hsl(${h},100%,62%)`;
  }
 // epic
  if (activeSkin === 'c_glitch') {
    const t = Date.now();
    const h = (t / 6 + Math.sin(t / 23) * 120) % 360;
    const b = 45 + Math.sin(t / 11) * 30;
    return `hsl(${h},100%,${b}%)`;
  }
  if (activeSkin === 'c_nebula') {
    const t = Date.now() / 30;
    const h = 265 + Math.sin(t / 7) * 55; // deep purple↔pink
    const s = 85 + Math.sin(t / 4) * 12;
    const b = 42 + Math.sin(t / 5) * 22;
    return `hsl(${h},${s}%,${b}%)`;
  }
  if (activeSkin === 'c_biohazard') {
    const t = Date.now() / 22;
    const h = 95 + Math.sin(t / 6) * 25;
    const b = 42 + Math.sin(t / 3) * 25;
    return `hsl(${h},100%,${b}%)`;
  }
  if (activeSkin === 'c_arctic') {
    const t = Date.now() / 35;
    const h = 190 + Math.sin(t / 5) * 20;
    const s = 70 + Math.sin(t / 4) * 25;
    const b = 70 + Math.sin(t / 6) * 20;  // bright ice
    return `hsl(${h},${s}%,${b}%)`;
  }
  if (activeSkin === 'c_wildfire') {
    const t = Date.now() / 12;
    const h = Math.sin(t / 5) * 22 + 22; // red→yellow
    const b = 52 + Math.sin(t / 4) * 25;
    return `hsl(${h},100%,${b}%)`;
  }
  if (activeSkin === 'c_spectre') {
    const t = Date.now() / 55;
    const h = 235 + Math.sin(t / 6) * 45;
    const s = 15 + Math.sin(t / 4) * 35; // nearly white↔saturated
    const b = 72 + Math.sin(t / 5) * 22;
    return `hsl(${h},${s}%,${b}%)`;
  }
 // legendary
  if (activeSkin === 'c_supernova') {
    const t = Date.now() / 8;
    const h = (t * 7) % 360;
    const b = 78 + Math.sin(t / 3) * 18; // very bright
    return `hsl(${h},100%,${b}%)`;
  }
  if (activeSkin === 'c_wraith') {
    const t = Date.now() / 60;
    const h = 265 + Math.sin(t / 5) * 35;
    const b = 12 + Math.sin(t / 3) * 14; // dark void pulse
    return `hsl(${h},90%,${b}%)`;
  }
  if (activeSkin === 'c_titan') {
    const t = Date.now() / 45;
    const h = 32 + Math.sin(t / 5) * 18;  // bronze↔gold
    const s = 82 + Math.sin(t / 4) * 15;
    const b = 38 + Math.sin(t / 3) * 22;
    return `hsl(${h},${s}%,${b}%)`;
  }
  if (activeSkin === 'c_astral') {
    const t = Date.now() / 28;
    const h = 195 + Math.sin(t / 7) * 70;  // cyan↔violet
    const b = 62 + Math.sin(t / 4) * 25;
    return `hsl(${h},90%,${b}%)`;
  }
 // mythic
  if (activeSkin === 'c_omnichrome') {
    const t = Date.now() / 4;
    return `hsl(${(t * 11) % 360},100%,68%)`;
  }
  if (activeSkin === 'c_singularity') {
    const t = Date.now() / 18;
    const h = (t * 4) % 360;
    const b = 8 + Math.sin(t / 3) * 10; // near-black with color
    return `hsl(${h},95%,${b}%)`;
  }
  if (activeSkin === 'c_ultraviolet') {
    const t = Date.now() / 22;
    const h = 272 + Math.sin(t / 4) * 22;
    const b = 55 + Math.sin(t / 3) * 28;
    return `hsl(${h},100%,${b}%)`;
  }
  if (activeSkin === 'c_godmode') {
    const t = Date.now() / 14;
    const h = 48 + Math.sin(t / 4) * 8;
    const s = 20 + Math.sin(t / 3) * 22;
    const b = 88 + Math.sin(t / 5) * 10; // 78–98%: blinding white-gold
    return `hsl(${h},${s}%,${b}%)`;
  }
  if (activeSkin === 'c_rift') {
    const t = Date.now() / 14;
    const phase = Math.sin(t / 5);
    if (phase > 0.3) {
 // Chromatic tear: full-spectrum flash
      return `hsl(${(t * 8) % 360},100%,68%)`;
    }
 // Dark void base
    const h = 258 + Math.sin(t / 4) * 40;
    return `hsl(${h},85%,14%)`;
  }

 // oblivion crate skins
  if (activeSkin === 'ob_duskblade') {
    const t = Date.now() / 1000;
    const h = 270 + Math.sin(t * 0.8) * 20;
    return `hsl(${h}, 60%, ${35 + Math.sin(t * 1.5) * 8}%)`;
  }
  if (activeSkin === 'ob_voidborn') {
    const t = Date.now() / 1000;
    const h = 220 + Math.sin(t * 0.6) * 30;
    return `hsl(${h}, 70%, ${18 + Math.sin(t * 1.2) * 6}%)`;
  }
  if (activeSkin === 'ob_ashwalker') {
    const t = Date.now() / 1000;
    const l = 28 + Math.sin(t * 2) * 8;
    return `hsl(15, 30%, ${l}%)`;
  }
  if (activeSkin === 'ob_soulreaper') {
    const t = Date.now() / 1000;
    const h = 340 + Math.sin(t * 0.7) * 15;
    return `hsl(${h}, 80%, ${30 + Math.sin(t * 1.8) * 10}%)`;
  }
  if (activeSkin === 'ob_eclipsar') {
    const t = Date.now() / 1000;
    const phase = Math.sin(t * 0.5);
    const h = phase > 0 ? 45 + phase * 15 : 220 - phase * 30;
    return `hsl(${h}, 70%, ${22 + Math.abs(phase) * 18}%)`;
  }
  if (activeSkin === 'ob_phantomking') {
    const t = Date.now() / 1000;
    const h = 265 + Math.sin(t * 0.9) * 25;
    return `hsl(${h}, 55%, ${40 + Math.sin(t * 1.4) * 12}%)`;
  }
  if (activeSkin === 'ob_abyssal') {
    const t = Date.now() / 1000;
    const h = 200 + Math.sin(t * 0.4) * 40;
    return `hsl(${h}, 90%, ${12 + Math.sin(t * 1.6) * 5}%)`;
  }
  if (activeSkin === 'ob_eventide') {
    const t = Date.now() / 1000;
    const h = (t * 15) % 360;
    return `hsl(${h}, 50%, ${20 + Math.sin(t * 0.8) * 8}%)`;
  }
  if (activeSkin === 'ob_worldeater') {
    const t = Date.now() / 1000;
    const pulse = Math.sin(t * 2.5);
    if (pulse > 0.7) return `hsl(0, 100%, ${55 + pulse * 15}%)`;
    const h = 0 + Math.sin(t * 0.5) * 10;
    return `hsl(${h}, 80%, ${10 + Math.sin(t * 1.2) * 5}%)`;
  }
  if (activeSkin === 'ob_eternium') {
    const t = Date.now() / 1000;
    const h = (t * 25) % 360;
    const l = 60 + Math.sin(t * 1.5) * 15;
    return `hsl(${h}, 100%, ${l}%)`;
  }

 // icon skins
  if (activeSkin === 'icon_noah_brown') return '#6b4423';
  if (activeSkin === 'icon_keegan_baseball') return '#f5f5f5';
  if (activeSkin === 'icon_dpoe_fade') return '#ff9ec4';
  if (activeSkin === 'icon_evan_watermelon') return '#ff4466';
  if (activeSkin === 'icon_gavin_tzl') return '#ffffff';
  if (activeSkin === 'icon_carter_cosmic') return '#8b0000';
  if (activeSkin === 'icon_brody_flag') return '#b22234';
  if (activeSkin === 'icon_sterling') return '#0064ff';
  if (activeSkin === 'icon_justin_clover') return '#1a8c2e';
  if (activeSkin === 'icon_profe_spain')  return '#aa151b';
  if (activeSkin === 'icon_kayden_duck')  return '#1a6b1a';
  if (activeSkin === 'icon_troy_puck')    return '#1a1a1a';
  if (activeSkin === 'icon_the_creator') {
    const t = Date.now() / 1000;
    const pulse = 0.5 + Math.sin(t * 1.2) * 0.15;
    const hue = 42 + Math.sin(t * 0.8) * 8;
    return `hsl(${hue}, 100%, ${78 + pulse * 12}%)`;
  }

 // fallback
  const skin = SKINS.find(s => s.id === activeSkin);
  return skin ? skin.color : '#9be7ff';

}

// --- game state ---

let player;
let bullets = [];
let enemies = [];
let enemyBullets = [];
let particles = [];
let powerups = [];
let spatialGrid; // Initialized after SpatialGrid class is defined
let running = false;
let paused = false;
let lastTime = 0;
let skipNextFrame = false;
let score = 0;
let _sessionStartCoins = 0;
let wave = 1;
let enemiesThisWave = 0;
let enemiesKilledThisWave = 0;
let totalKills = 0;
let runStartTime = 0;
let spawnTimer = 0;

// ── Game modes ──────────────────────────────────────────────
let currentGameMode = 'classic'; // classic | timeattack | bossrush | ranked
let modeRunActive   = false;     // true while a mode run is in progress; guards endModeRun

// Time Attack
const TIME_ATTACK_DURATION = 180; // 3 minutes in seconds
let taTimeLeft = TIME_ATTACK_DURATION;

// Boss Rush
let brBossesBeaten = 0;
let brRestTimer = 0;          // countdown between bosses
const BR_REST_TIME = 4;

let combo = 0;
let comboTimer = 0;
let screenShakeAmt = 0;
let boss = null;
let waveClearTimer = 0;
const WAVE_BREAK_TIME = 2;
let bossCountdownTimer = 0; // Timer for boss spawn countdown
let pendingBossType = null; // Store which boss type to spawn (1=Boss, 2=Mega, 3=Ultra, 4=Legendary)
const BOSS_COUNTDOWN_TIME = 3; // 3-second countdown before boss spawns
let fpsDisplay = 0;
let fpsTimer = 0;
let fpsSamples = [];

// fix large dt spikes when tab is hidden/refocused
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) skipNextFrame = true;
});

let high = Number(localStorage.getItem('highscore') || 0);

// --- score popup ---

function createScorePopup(x, y, points) {
  const popup = document.createElement('div');
  popup.className = 'score-popup';
  popup.textContent = `+${points}`;
  popup.style.left = x + 'px';
  popup.style.top = y + 'px';
  scorePopupsContainer.appendChild(popup);
  
  setTimeout(() => popup.remove(), 1000);
}

// --- spatial grid (collision optimization) ---

class SpatialGrid {
  constructor(cellSize = 100) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  clear() {
    this.grid.clear();
  }

  getCellKey(x, y) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  insert(entity, x, y) {
    const key = this.getCellKey(x, y);
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key).push(entity);
  }

  getNearby(x, y, radius) {
    const nearby = [];
    const cells = Math.ceil(radius / this.cellSize);

    for (let dx = -cells; dx <= cells; dx++) {
      for (let dy = -cells; dy <= cells; dy++) {
        const cx = Math.floor(x / this.cellSize) + dx;
        const cy = Math.floor(y / this.cellSize) + dy;
        const key = `${cx},${cy}`;
        if (this.grid.has(key)) {
          nearby.push(...this.grid.get(key));
        }
      }
    }
    return nearby;
  }
}

spatialGrid = new SpatialGrid(150);

// --- player ---

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 14;
    this.speed = 250;
    this.baseSpeed = 250; // Store base speed for percentage upgrades
    this.hp = 100;
    this.maxHp = 100;
    this.cooldown = 0;
    this.rapidFire = 0;
    this.speedBoost = 0;
    this.shield = 0;
    this.pierce = 0; // Pierce shot timer
    this.explosive = 0; // Explosive bullets timer
    this.weaponLevel = 1;
    this.maxHpLevel = 1; // Max HP upgrade level (1-3)
    this.speedLevel = 1;  // Speed upgrade level (1-3)
    this.dashCooldown = 0;
    this.dashDuration = 0;
    this.dashDir = { x: 0, y: 0 };
  }

  update(dt) {
    let dx = 0;
    let dy = 0;

    if (keys['w'] || keys['arrowup']) dy--;
    if (keys['s'] || keys['arrowdown']) dy++;
    if (keys['a'] || keys['arrowleft']) dx--;
    if (keys['d'] || keys['arrowright']) dx++;

    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    
 // Calculate speed with permanent speed upgrades (15% per level)
    const permanentSpeedMultiplier = 1 + (this.speedLevel - 1) * 0.15;
    const temporarySpeedMultiplier = this.speedBoost > 0 ? 1.5 : 1;
    let speed = this.baseSpeed * permanentSpeedMultiplier * temporarySpeedMultiplier;
    
 // Dash movement
    if (this.dashDuration > 0) {
      this.dashDuration -= dt;
      speed *= 6; // Dash is 6x faster
      dx = this.dashDir.x;
      dy = this.dashDir.y;
      
 // Dash trail particles
      if (Math.random() < 0.5) {
        particles.push(acquireParticle(
          this.x + (Math.random() - 0.5) * 20,
          this.y + (Math.random() - 0.5) * 20,
          0, 0,
          getActiveSkinColor(),
          0.3
        ));
      }
    }
    
    this.x += (dx / len) * speed * dt;
    this.y += (dy / len) * speed * dt;

    this.x = Math.max(20, Math.min(canvas.width - 20, this.x));
    this.y = Math.max(20, Math.min(canvas.height - 20, this.y));

    this.cooldown -= dt;
    this.rapidFire = Math.max(0, this.rapidFire - dt);
    this.speedBoost = Math.max(0, this.speedBoost - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.pierce = Math.max(0, this.pierce - dt);
    this.explosive = Math.max(0, this.explosive - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    
 // Update dash ability UI
    if (dashCooldownEl) {
      const cooldownPercent = (this.dashCooldown / 3) * 100;
      dashCooldownEl.style.height = cooldownPercent + '%';
    }
 // Show cooldown timer text
    if (this.dashCooldown > 0) {
      if (dashTimerEl) { dashTimerEl.textContent = Math.ceil(this.dashCooldown); dashTimerEl.style.display = 'block'; }
      if (dashAbility) dashAbility.classList.remove('ready');
    } else {
      if (dashTimerEl) dashTimerEl.style.display = 'none';
      if (dashAbility) dashAbility.classList.add('ready');
    }

    const fireRate = this.rapidFire > 0 ? 0.05 : 0.12;

 // Shoot if mouse is down OR auto-shoot is enabled
    if ((mouse.down || gameSettings.autoShoot) && this.cooldown <= 0) {
      this.cooldown = fireRate;
      this.shoot();
    }
  }
  
  dash() {
    if (this.dashCooldown > 0 || this.dashDuration > 0) return;
    
 // Get direction
    let dx = 0;
    let dy = 0;
    if (keys['w'] || keys['arrowup']) dy--;
    if (keys['s'] || keys['arrowdown']) dy++;
    if (keys['a'] || keys['arrowleft']) dx--;
    if (keys['d'] || keys['arrowright']) dx++;
    
    if (dx === 0 && dy === 0) {
 // Default to mouse direction
      const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
      dx = Math.cos(angle);
      dy = Math.sin(angle);
    }
    
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    this.dashDir = { x: dx / len, y: dy / len };
    this.dashDuration = 0.15;
    this.dashCooldown = 3;
    
    sounds.dash();
    
 // Create dash effect particles
    for (let i = 0; i < 15; i++) {
      particles.push(new Particle(
        this.x,
        this.y,
        Math.random() * Math.PI * 2,
        Math.random() * 150 + 100,
        '#9be7ff',
        0.4
      ));
    }
  }

  shoot() {
    const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
    const speed = 650;

    if (this.weaponLevel === 1) {
 // Single shot
      bullets.push(new Bullet(this.x, this.y, Math.cos(angle) * speed, Math.sin(angle) * speed));

    } else if (this.weaponLevel === 2) {
 // Level 2: Parallel twin shot — both bullets go straight, offset perpendicular to aim
      const perpX = Math.cos(angle + Math.PI / 2);
      const perpY = Math.sin(angle + Math.PI / 2);
      const offset = 7; // pixels apart from center
      bullets.push(new Bullet(
        this.x + perpX * offset, this.y + perpY * offset,
        Math.cos(angle) * speed, Math.sin(angle) * speed
      ));
      bullets.push(new Bullet(
        this.x - perpX * offset, this.y - perpY * offset,
        Math.cos(angle) * speed, Math.sin(angle) * speed
      ));

    } else if (this.weaponLevel >= 3) {
 // Level 3: Classic V-spread (triple shot with angle spread)
      const spread = 0.18;
      bullets.push(new Bullet(this.x, this.y, Math.cos(angle) * speed, Math.sin(angle) * speed));
      bullets.push(new Bullet(this.x, this.y, Math.cos(angle - spread) * speed, Math.sin(angle - spread) * speed));
      bullets.push(new Bullet(this.x, this.y, Math.cos(angle + spread) * speed, Math.sin(angle + spread) * speed));
    }

    sounds.shoot();
  }

  draw() {
 // Dash effect
    if (this.dashDuration > 0) {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = `rgba(155, 231, 255, ${0.4 - i * 0.1})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 6 + i * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
 // Shield effect
    if (this.shield > 0) {
      ctx.strokeStyle = `rgba(107, 255, 123, ${0.3 + Math.sin(Date.now() / 100) * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 10, 0, Math.PI * 2);
      ctx.stroke();
    }

 // Speed boost effect
    if (this.speedBoost > 0) {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = `rgba(255, 230, 107, ${0.3 - i * 0.1})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 4 + i * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
 // Weapon level indicator
    if (this.weaponLevel > 1) {
      for (let i = 0; i < this.weaponLevel - 1; i++) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(this.x - 8 + i * 8, this.y - this.r - 10, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

 // Player
    const skinColor = getActiveSkinColor();
    
 // Special skin effects
    if (activeSkin === 'galaxy') {
 // Galaxy: Sparkle effect with multiple colored orbs
      ctx.shadowBlur = 20;
      ctx.shadowColor = skinColor;
      ctx.fillStyle = skinColor;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      
 // Add sparkles
      const time = Date.now() / 100;
      for (let i = 0; i < 5; i++) {
        const angle = (time + i * 73) % (Math.PI * 2);
        const dist = this.r * 0.6;
        const sparkleX = this.x + Math.cos(angle) * dist;
        const sparkleY = this.y + Math.sin(angle) * dist;
        const sparkleHue = ((time * 10 + i * 70) % 120) + 240;
        ctx.fillStyle = `hsla(${sparkleHue},100%,70%,0.6)`;
        ctx.beginPath();
        ctx.arc(sparkleX, sparkleY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    } else if (activeSkin === 'void') {
      // void walker skin
      const time = Date.now();
      
      // void tear rifts
 // Reality tears showing the void beyond
      ctx.globalAlpha = 0.35;
      for (let ring = 0; ring < 4; ring++) {
        const ringRadius = this.r + 25 + ring * 15 + Math.sin(time / 95 + ring * 0.8) * 8;
        const voidHue = 270 + Math.sin(time / 105 + ring) * 30; // Deep purple to magenta
        const darkness = 12 - ring * 2; // Very dark
        ctx.strokeStyle = `hsla(${voidHue},95%,${darkness}%,${0.5 - ring * 0.08})`;
        ctx.lineWidth = 3 - ring * 0.6;
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#9900ff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      
      // shadow tendrils
 // Writhing darkness tentacles
      const tendrilCount = 8;
      ctx.globalAlpha = 0.6;
      for (let tendril = 0; tendril < tendrilCount; tendril++) {
        const baseAngle = (time / 45 + tendril * (360 / tendrilCount)) * Math.PI / 180;
        const tendrilLength = this.r + 30;
        
        ctx.beginPath();
        for (let segment = 0; segment < 8; segment++) {
          const segmentRatio = segment / 7;
          const angle = baseAngle + Math.sin(time / 60 + segment + tendril) * 0.4;
          const dist = this.r + 8 + segmentRatio * tendrilLength + Math.sin(time / 55 + segment) * 10;
          const x = this.x + Math.cos(angle) * dist;
          const y = this.y + Math.sin(angle) * dist;
          
          if (segment === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        
        const tendrilHue = 270 + (time / 25 + tendril * 45) % 60;
        const alpha = 0.7 - (tendril % 3) * 0.15;
        ctx.strokeStyle = `hsla(${tendrilHue},90%,20%,${alpha})`;
        ctx.lineWidth = 2.8;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsl(${tendrilHue},90%,30%)`;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      
      // void particle swarm
 // Dark energy particles orbiting
      const voidParticleCount = 24;
      ctx.globalAlpha = 0.65;
      for (let i = 0; i < voidParticleCount; i++) {
        const angle = (time / 35 + i * (360 / voidParticleCount)) * Math.PI / 180;
        const dist = this.r + 18 + Math.sin(time / 50 + i * 2) * 8;
        const particleX = this.x + Math.cos(angle) * dist;
        const particleY = this.y + Math.sin(angle) * dist;
        const particleHue = 270 + (time / 18 + i * 15) % 60;
        const particleSize = 3.5 + Math.sin(time / 45 + i * 2.5) * 1.5;
        
 // Outer dark glow
        ctx.fillStyle = `hsla(${particleHue},100%,15%,0.5)`;
        ctx.shadowBlur = 18;
        ctx.shadowColor = `hsl(${particleHue},100%,30%)`;
        ctx.beginPath();
        ctx.arc(particleX, particleY, particleSize + 2, 0, Math.PI * 2);
        ctx.fill();
        
 // Bright purple core
        ctx.fillStyle = `hsla(${particleHue},100%,55%,0.9)`;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // shadow dimension portal
 // Rotating dark portal geometry
      const portalPoints = 6;
      const portalRadius = this.r + 22 + Math.sin(time / 100) * 5;
      
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = `hsla(270,100%,25%,0.8)`;
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#9900ff';
      
 // Hexagon portal
      ctx.beginPath();
      for (let i = 0; i <= portalPoints; i++) {
        const angle = (time / 55 + i * (360 / portalPoints)) * Math.PI / 180;
        const x = this.x + Math.cos(angle) * portalRadius;
        const y = this.y + Math.sin(angle) * portalRadius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      
 // Portal runes at corners
      for (let i = 0; i < portalPoints; i++) {
        const angle = (time / 55 + i * (360 / portalPoints)) * Math.PI / 180;
        const x = this.x + Math.cos(angle) * portalRadius;
        const y = this.y + Math.sin(angle) * portalRadius;
        
        const runeHue = 270 + i * 15;
        ctx.fillStyle = `hsla(${runeHue},100%,55%,${0.85 + Math.sin(time / 65 + i) * 0.15})`;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `hsl(${runeHue},100%,55%)`;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // orbiting void orbs
 // Dark energy spheres
      const orbCount = 3;
      for (let orb = 0; orb < orbCount; orb++) {
        const orbAngle = (time / 42 + orb * (360 / orbCount)) * Math.PI / 180;
        const orbDist = this.r + 20 + Math.sin(time / 82 + orb * 2.5) * 6;
        const orbX = this.x + Math.cos(orbAngle) * orbDist;
        const orbY = this.y + Math.sin(orbAngle) * orbDist;
        const orbSize = 5.5 + Math.sin(time / 65 + orb) * 2.2;
        
 // Dark outer void
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = `hsla(270,100%,8%,0.8)`;
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#9900ff';
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbSize + 5, 0, Math.PI * 2);
        ctx.fill();
        
 // Purple energy core
        ctx.globalAlpha = 1;
        const orbHue = 270 + (time / 20 + orb * 120) % 60;
        ctx.fillStyle = `hsla(${orbHue},100%,45%,0.95)`;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `hsl(${orbHue},100%,55%)`;
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbSize, 0, Math.PI * 2);
        ctx.fill();
        
 // Bright center
        ctx.fillStyle = `hsla(${orbHue},100%,70%,${0.75 + Math.sin(time / 58 + orb) * 0.25})`;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbSize * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // dark essence storm
 // Dense dark particle field
      const essenceCount = 36;
      for (let i = 0; i < essenceCount; i++) {
        const angle = (time / 30 + i * (360 / essenceCount)) * Math.PI / 180;
        const dist = this.r + 12 + (i % 4) * 6 + Math.sin(time / 48 + i * 2.3) * 5;
        const particleX = this.x + Math.cos(angle) * dist;
        const particleY = this.y + Math.sin(angle) * dist;
        const particleHue = 270 + (time / 12 + i * 10) % 60;
        const particleSize = 1.8 + Math.sin(time / 40 + i) * 0.9;
        const particleAlpha = 0.6 + Math.sin(time / 55 + i * 3.5) * 0.3;
        
        ctx.globalAlpha = particleAlpha;
        ctx.fillStyle = `hsla(${particleHue},100%,40%,${particleAlpha})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `hsl(${particleHue},100%,50%)`;
        ctx.beginPath();
        ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // core void heart
 // Multi-layer dark core
      
 // Outer void aura - extremely dark
      ctx.globalAlpha = 0.6;
      const outerVoidRadius = this.r + 9 + Math.sin(time / 85) * 4;
      ctx.fillStyle = `hsla(270,100%,5%,0.8)`;
      ctx.shadowBlur = 40;
      ctx.shadowColor = '#9900ff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, outerVoidRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      
 // Main void core - very dark
      ctx.fillStyle = skinColor; // Uses the pulsing dark purple from color function
      ctx.shadowBlur = 35;
      ctx.shadowColor = '#9900ff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      
 // Inner purple energy
      const innerPulse = Math.sin(time / 90) * 0.2 + 0.8;
      ctx.fillStyle = `hsla(270,100%,${25 * innerPulse}%,${0.85 + Math.sin(time / 88) * 0.15})`;
      ctx.shadowBlur = 28;
      ctx.shadowColor = '#b300ff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.65, 0, Math.PI * 2);
      ctx.fill();
      
 // Bright void center
      ctx.fillStyle = `hsla(270,100%,55%,${0.7 + Math.sin(time / 92) * 0.3})`;
      ctx.shadowBlur = 22;
      ctx.shadowColor = '#dd00ff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      
 // Purple outline ring
      ctx.strokeStyle = `hsla(270,100%,50%,${0.8 + Math.sin(time / 95) * 0.2})`;
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#9900ff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 4, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.shadowBlur = 0;
    } else if (activeSkin === 'phoenix') {
 // Phoenix: Fire wings effect
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#ff4500';
      
      const time = Date.now() / 50;
      
 // Fire wings on sides
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 6; i++) {
          const wingAngle = side * (Math.PI / 3 + i * 0.2);
          const wingDist = this.r + 8 + i * 4 + Math.sin(time + i) * 3;
          const wingX = this.x + Math.cos(wingAngle) * wingDist;
          const wingY = this.y + Math.sin(wingAngle) * wingDist;
          const opacity = 0.6 - i * 0.08;
          const hue = 15 + Math.sin(time + i) * 15; // Orange-red flicker
          ctx.fillStyle = `hsla(${hue},100%,60%,${opacity})`;
          ctx.beginPath();
          ctx.arc(wingX, wingY, 4 - i * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
 // Core
      ctx.fillStyle = skinColor;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (activeSkin === 'diamond') {
      // diamond skin
      const time = Date.now();
      
      // prismatic light beams
 // Massive refracted light beams emanating outward
      ctx.globalAlpha = 0.35;
      const beamCount = 12;
      for (let beam = 0; beam < beamCount; beam++) {
        const beamAngle = (time / 40 + beam * (360 / beamCount)) * Math.PI / 180;
        const beamLength = this.r + 35 + Math.sin(time / 70 + beam) * 12;
        const beamHue = (time / 8 + beam * (360 / beamCount)) % 360;
        const beamAlpha = 0.6 + Math.sin(time / 55 + beam) * 0.3;
        
 // Create gradient beam
        const gradient = ctx.createLinearGradient(
          this.x, this.y,
          this.x + Math.cos(beamAngle) * beamLength,
          this.y + Math.sin(beamAngle) * beamLength
        );
        gradient.addColorStop(0, `hsla(${beamHue},100%,95%,${beamAlpha})`);
        gradient.addColorStop(0.5, `hsla(${beamHue},100%,85%,${beamAlpha * 0.6})`);
        gradient.addColorStop(1, `hsla(${beamHue},100%,75%,0)`);
        
        ctx.fillStyle = gradient;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `hsl(${beamHue},100%,90%)`;
        
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.arc(this.x, this.y, beamLength, beamAngle - 0.15, beamAngle + 0.15);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // crystalline structure rings
 // Faceted crystal rings
      ctx.globalAlpha = 0.4;
      for (let ring = 0; ring < 5; ring++) {
        const ringRadius = this.r + 28 + ring * 16 + Math.sin(time / 90 + ring * 0.9) * 7;
        const facetCount = 8;
        
        for (let facet = 0; facet < facetCount; facet++) {
          const startAngle = (time / 50 + facet * (360 / facetCount) + ring * 45) * Math.PI / 180;
          const endAngle = startAngle + (Math.PI * 2 / facetCount) * 0.7;
          const facetHue = (time / 12 + facet * (360 / facetCount) + ring * 72) % 360;
          
          ctx.strokeStyle = `hsla(${facetHue},100%,90%,${0.5 - ring * 0.07})`;
          ctx.lineWidth = 2.5 - ring * 0.4;
          ctx.shadowBlur = 18;
          ctx.shadowColor = `hsl(${facetHue},100%,95%)`;
          ctx.beginPath();
          ctx.arc(this.x, this.y, ringRadius, startAngle, endAngle);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      
      // rainbow sparkle cloud
 // Dense field of prismatic sparkles
      const sparkleCount = 32;
      for (let i = 0; i < sparkleCount; i++) {
        const angle = (time / 30 + i * (360 / sparkleCount)) * Math.PI / 180;
        const dist = this.r + 18 + Math.sin(time / 45 + i * 2.2) * 9;
        const sparkleX = this.x + Math.cos(angle) * dist;
        const sparkleY = this.y + Math.sin(angle) * dist;
        const sparkleHue = (time / 10 + i * (360 / sparkleCount)) % 360;
        const sparkleSize = 3.5 + Math.sin(time / 40 + i * 3) * 1.8;
        const sparkleAlpha = 0.75 + Math.sin(time / 50 + i * 2.5) * 0.25;
        
 // Outer glow
        ctx.globalAlpha = sparkleAlpha * 0.5;
        ctx.fillStyle = `hsla(${sparkleHue},100%,90%,0.6)`;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `hsl(${sparkleHue},100%,90%)`;
        ctx.beginPath();
        ctx.arc(sparkleX, sparkleY, sparkleSize + 3, 0, Math.PI * 2);
        ctx.fill();
        
 // Bright core
        ctx.globalAlpha = sparkleAlpha;
        ctx.fillStyle = `hsla(${sparkleHue},100%,95%,0.95)`;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // refractive star burst
 // 8-point star with light refraction
      const starPoints = 8;
      const starRadius = this.r + 24 + Math.sin(time / 95) * 5;
      
      ctx.globalAlpha = 0.5;
      for (let point = 0; point < starPoints; point++) {
        const angle1 = (time / 48 + point * (360 / starPoints)) * Math.PI / 180;
        const angle2 = (time / 48 + point * (360 / starPoints) + (360 / starPoints) / 2) * Math.PI / 180;
        
        const x1 = this.x + Math.cos(angle1) * starRadius;
        const y1 = this.y + Math.sin(angle1) * starRadius;
        const x2 = this.x + Math.cos(angle1) * (starRadius + 12);
        const y2 = this.y + Math.sin(angle1) * (starRadius + 12);
        
        const starHue = (time / 15 + point * (360 / starPoints)) % 360;
        
 // Create star point gradient
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, `hsla(${starHue},100%,95%,0.8)`);
        gradient.addColorStop(1, `hsla(${starHue},100%,90%,0)`);
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 18;
        ctx.shadowColor = `hsl(${starHue},100%,95%)`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
 // Star tip jewel
        ctx.fillStyle = `hsla(${starHue},100%,98%,0.9)`;
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.arc(x2, y2, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // orbiting gemstones
 // Large prismatic gemstone orbs
      const gemCount = 4;
      for (let gem = 0; gem < gemCount; gem++) {
        const gemAngle = (time / 38 + gem * (360 / gemCount)) * Math.PI / 180;
        const gemDist = this.r + 20 + Math.sin(time / 75 + gem * 2.7) * 6;
        const gemX = this.x + Math.cos(gemAngle) * gemDist;
        const gemY = this.y + Math.sin(gemAngle) * gemDist;
        const gemSize = 6.5 + Math.sin(time / 60 + gem) * 2.5;
        
 // Gem outer refraction
        ctx.globalAlpha = 0.45;
        const gemHue = (time / 10 + gem * 90) % 360;
        ctx.fillStyle = `hsla(${gemHue},100%,85%,0.7)`;
        ctx.shadowBlur = 35;
        ctx.shadowColor = `hsl(${gemHue},100%,90%)`;
        ctx.beginPath();
        ctx.arc(gemX, gemY, gemSize + 6, 0, Math.PI * 2);
        ctx.fill();
        
 // Gem prismatic core
        ctx.globalAlpha = 1;
        const gemGradient = ctx.createRadialGradient(
          gemX - gemSize * 0.3, gemY - gemSize * 0.3, 0,
          gemX, gemY, gemSize
        );
        gemGradient.addColorStop(0, `hsla(${gemHue},100%,98%,1)`);
        gemGradient.addColorStop(0.6, `hsla(${gemHue + 30},100%,90%,0.95)`);
        gemGradient.addColorStop(1, `hsla(${gemHue + 60},100%,85%,0.9)`);
        
        ctx.fillStyle = gemGradient;
        ctx.shadowBlur = 22;
        ctx.shadowColor = `hsl(${gemHue},100%,95%)`;
        ctx.beginPath();
        ctx.arc(gemX, gemY, gemSize, 0, Math.PI * 2);
        ctx.fill();
        
 // Bright highlight
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffffff';
        ctx.beginPath();
        ctx.arc(gemX - gemSize * 0.25, gemY - gemSize * 0.25, gemSize * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // luxury particle shimmer
 // Super dense particle field
      const luxuryCount = 24;
      for (let i = 0; i < luxuryCount; i++) {
        const angle = (time / 28 + i * (360 / luxuryCount)) * Math.PI / 180;
        const dist = this.r + 13 + (i % 3) * 5 + Math.sin(time / 42 + i * 2.8) * 4.5;
        const particleX = this.x + Math.cos(angle) * dist;
        const particleY = this.y + Math.sin(angle) * dist;
        const particleHue = (time / 11 + i * 15) % 360;
        const particleSize = 2 + Math.sin(time / 38 + i) * 1;
        const particleAlpha = 0.7 + Math.sin(time / 52 + i * 3.8) * 0.3;
        
        ctx.globalAlpha = particleAlpha;
        ctx.fillStyle = `hsla(${particleHue},100%,95%,${particleAlpha})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = `hsl(${particleHue},100%,95%)`;
        ctx.beginPath();
        ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // rotating luxury rings
 // Triple crystalline ring system
      for (let ring = 0; ring < 3; ring++) {
        const ringRad = this.r + 11 + ring * 5 + Math.sin(time / 85 + ring) * 2.8;
        const ringRotation = (time / (38 + ring * 6)) * (ring % 2 === 0 ? 1 : -1);
        const ringHue = (time / 20 + ring * 120) % 360;
        
        ctx.strokeStyle = `hsla(${ringHue},100%,95%,${0.75 - ring * 0.15})`;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `hsl(${ringHue},100%,95%)`;
        
 // Segmented crystalline rings
        const segments = 6;
        for (let seg = 0; seg < segments; seg++) {
          const startAngle = (ringRotation + seg * (360 / segments)) * Math.PI / 180;
          const endAngle = (ringRotation + seg * (360 / segments) + (360 / segments) * 0.8) * Math.PI / 180;
          ctx.beginPath();
          ctx.arc(this.x, this.y, ringRad, startAngle, endAngle);
          ctx.stroke();
        }
      }
      
      // core brilliant diamond
 // Multi-faceted diamond core
      
 // Outer radiance aura
      ctx.globalAlpha = 0.55;
      const outerRadianceRadius = this.r + 10 + Math.sin(time / 80) * 4;
      const outerRadianceGradient = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, outerRadianceRadius
      );
      outerRadianceGradient.addColorStop(0, 'hsla(0,0%,100%,0.7)');
      outerRadianceGradient.addColorStop(0.5, `hsla(${(time / 20) % 360},100%,95%,0.5)`);
      outerRadianceGradient.addColorStop(1, `hsla(${(time / 20 + 180) % 360},100%,90%,0)`);
      
      ctx.fillStyle = outerRadianceGradient;
      ctx.shadowBlur = 40;
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, outerRadianceRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      
 // Main diamond core with prismatic gradient
      const coreGradient = ctx.createRadialGradient(
        this.x - this.r * 0.3, this.y - this.r * 0.3, 0,
        this.x, this.y, this.r
      );
      const coreHue = (time / 15) % 360;
      coreGradient.addColorStop(0, 'hsla(0,0%,100%,1)');
      coreGradient.addColorStop(0.3, `hsla(${coreHue},50%,98%,1)`);
      coreGradient.addColorStop(0.6, `hsla(${coreHue + 120},60%,95%,1)`);
      coreGradient.addColorStop(1, `hsla(${coreHue + 240},70%,92%,1)`);
      
      ctx.fillStyle = coreGradient;
      ctx.shadowBlur = 38;
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      
 // Inner brilliant light
      ctx.fillStyle = `hsla(${(time / 18) % 360},30%,98%,${0.9 + Math.sin(time / 85) * 0.1})`;
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.65, 0, Math.PI * 2);
      ctx.fill();
      
 // Ultra bright center
      ctx.fillStyle = `rgba(255,255,255,${0.95 + Math.sin(time / 90) * 0.05})`;
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      
 // Brilliant highlight spot
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x - this.r * 0.2, this.y - this.r * 0.2, this.r * 0.25, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
    } else if (activeSkin === 'quantum') {
 // Quantum Flux: Reality-bending chromatic aberration with glitch particles
      const time = Date.now();
      
 // Chromatic aberration effect - 3 offset circles in RGB
      ctx.globalAlpha = 0.6;
      const offset = 4 + Math.sin(time / 100) * 2;
      
 // Red channel
      ctx.fillStyle = `hsl(0,100%,60%)`;
      ctx.shadowBlur = 15;
      ctx.shadowColor = `hsl(0,100%,60%)`;
      ctx.beginPath();
      ctx.arc(this.x - offset, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      
 // Green channel
      ctx.fillStyle = `hsl(120,100%,60%)`;
      ctx.shadowColor = `hsl(120,100%,60%)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y - offset * 0.7, this.r, 0, Math.PI * 2);
      ctx.fill();
      
 // Blue channel
      ctx.fillStyle = `hsl(240,100%,60%)`;
      ctx.shadowColor = `hsl(240,100%,60%)`;
      ctx.beginPath();
      ctx.arc(this.x + offset, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.globalAlpha = 1;
      
 // Core - cycling through spectrum rapidly
      ctx.fillStyle = skinColor;
      ctx.shadowBlur = 20;
      ctx.shadowColor = skinColor;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      
 // Orbiting quantum particles
      const particleCount = 12;
      for (let i = 0; i < particleCount; i++) {
        const angle = (time / 30 + i * (360 / particleCount)) * Math.PI / 180;
        const dist = this.r + 12 + Math.sin(time / 50 + i) * 4;
        const particleX = this.x + Math.cos(angle) * dist;
        const particleY = this.y + Math.sin(angle) * dist;
        const particleHue = (time / 8 + i * 30) % 360;
        const particleSize = 2.5 + Math.sin(time / 40 + i * 2) * 1;
        
        ctx.fillStyle = `hsla(${particleHue},100%,70%,0.9)`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `hsl(${particleHue},100%,70%)`;
        ctx.beginPath();
        ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
        ctx.fill();
      }
      
 // Glitch lines effect
      if (Math.random() < 0.15) { // Random glitch
        ctx.globalAlpha = 0.7;
        const glitchHue = Math.random() * 360;
        ctx.strokeStyle = `hsl(${glitchHue},100%,70%)`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const glitchAngle = Math.random() * Math.PI * 2;
          const glitchDist = this.r + Math.random() * 15;
          const gx = this.x + Math.cos(glitchAngle) * glitchDist;
          const gy = this.y + Math.sin(glitchAngle) * glitchDist;
          ctx.beginPath();
          ctx.moveTo(this.x, this.y);
          ctx.lineTo(gx, gy);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      
 // Pulsing ring
      const ringRadius = this.r + 6 + Math.sin(time / 80) * 3;
      ctx.strokeStyle = skinColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      
      ctx.shadowBlur = 0;
    } else if (activeSkin === 'gold-champion') {
      // gold champion skin
      const time = Date.now();

      // floating crown
 // Drawn in screen-space above the player, bobbing gently
      {
        const cr = this.r;
        const cw = cr * 2.8;                              // crown total width
        const bobY = Math.sin(time / 700) * 3.5;          // gentle float
        const baseY = this.y - cr - 13 + bobY;            // bottom of crown shape
        const cx = this.x;

 // 5-point crown: [x-offset, height] pairs
        const pts = [
          [-cw / 2,      cr * 0.70],   // outer left
          [-cw / 4,      cr * 0.34],   // inner left
          [0,            cr * 1.10],   // center — tallest
          [ cw / 4,      cr * 0.34],   // inner right
          [ cw / 2,      cr * 0.70],   // outer right
        ];

 // Crown fill — gradient from bright top to deep gold base
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx - cw / 2, baseY);
        for (const [dx, h] of pts) ctx.lineTo(cx + dx, baseY - h);
        ctx.lineTo(cx + cw / 2, baseY);
        ctx.closePath();
        const grad = ctx.createLinearGradient(cx, baseY - cr * 1.1, cx, baseY);
        grad.addColorStop(0,   'rgba(255,252,210,0.97)');
        grad.addColorStop(0.35,'rgba(255,215,0,0.95)');
        grad.addColorStop(1,   'rgba(160,110,0,0.90)');
        ctx.fillStyle = grad;
        ctx.shadowBlur = 26;
        ctx.shadowColor = '#ffd700';
        ctx.fill();

 // Crown outline — light gold edge
        ctx.strokeStyle = 'rgba(255,248,180,0.85)';
        ctx.lineWidth = 1.3;
        ctx.shadowBlur = 8;
        ctx.stroke();

 // Base bar
        ctx.fillStyle = 'rgba(150,100,0,0.92)';
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#ffd700';
        ctx.fillRect(cx - cw / 2, baseY - 5, cw, 5);

 // Gems at the 3 tall points: ruby (left), sapphire (center), emerald (right)
        const gemDefs = [[pts[0], 0], [pts[2], 215], [pts[4], 145]]; // hues: red, blue, green
        for (const [[dx, h], gemHue] of gemDefs) {
          const gx = cx + dx, gy = baseY - h;
          const gemPulse = Math.sin(time / 400 + gemHue) * 0.15;
          ctx.fillStyle = `hsl(${gemHue},100%,${62 + gemPulse * 20}%)`;
          ctx.shadowBlur = 16;
          ctx.shadowColor = `hsl(${gemHue},100%,70%)`;
          ctx.beginPath(); ctx.arc(gx, gy, cr * 0.21, 0, Math.PI * 2); ctx.fill();
 // Gem specular highlight
          ctx.fillStyle = 'rgba(255,255,255,0.78)';
          ctx.shadowBlur = 0;
          ctx.beginPath(); ctx.arc(gx - cr * 0.07, gy - cr * 0.07, cr * 0.08, 0, Math.PI * 2); ctx.fill();
        }

 // Small circular gems along the base bar (3 gems: ruby, white, ruby)
        const baseGemHues = [0, 0, 0]; // warm gold/white
        for (let i = 0; i < 3; i++) {
          const bgx = cx - cw / 4 + i * (cw / 4);
          ctx.fillStyle = i === 1 ? 'rgba(255,252,220,0.9)' : `hsl(35,100%,65%)`;
          ctx.shadowBlur = 8;
          ctx.shadowColor = i === 1 ? '#ffffff' : '#ffa500';
          ctx.beginPath(); ctx.arc(bgx, baseY - 2.5, cr * 0.115, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // 3 clean gold rings
      ctx.globalAlpha = 0.38;
      for (let ring = 0; ring < 3; ring++) {
        const rr = this.r + 22 + ring * 16 + Math.sin(time / 120 + ring * 0.8) * 6;
        ctx.strokeStyle = `hsla(45,100%,${78 - ring * 8}%,${0.55 - ring * 0.1})`;
        ctx.lineWidth = 2.8 - ring * 0.6;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ffd700';
        ctx.beginPath(); ctx.arc(this.x, this.y, rr, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 8 golden sun rays
      ctx.globalAlpha = 0.42;
      for (let i = 0; i < 8; i++) {
        const angle = (time / 2800 + i * Math.PI / 4) % (Math.PI * 2);
        const len = this.r + 30 + Math.sin(time / 350 + i) * 8;
        ctx.strokeStyle = `hsla(45,100%,78%,${0.65 - (i % 2) * 0.2})`;
        ctx.lineWidth = 3 - (i % 2) * 0.8;
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#ffd700';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(angle) * len, this.y + Math.sin(angle) * len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // hexagram sacred geometry
      const hexR = this.r + 22 + Math.sin(time / 600) * 4;
      ctx.globalAlpha = 0.42;
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#ffd700';
      for (let tri = 0; tri < 2; tri++) {
        ctx.strokeStyle = `hsla(45,100%,${82 - tri * 10}%,0.75)`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i <= 3; i++) {
          const a = (time / 3000 * (tri === 0 ? 1 : -1) + i * 120 + tri * 60) * Math.PI / 180;
          const x = this.x + Math.cos(a) * hexR, y = this.y + Math.sin(a) * hexR;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 4 large golden orbs
      for (let orb = 0; orb < 4; orb++) {
        const oa = (time / 1800 + orb * Math.PI / 2) % (Math.PI * 2);
        const od = this.r + 24 + Math.sin(time / 500 + orb * 2) * 5;
        const ox = this.x + Math.cos(oa) * od, oy = this.y + Math.sin(oa) * od;
        const os = 6 + Math.sin(time / 400 + orb) * 2;
        const oH = 42 + Math.sin(time / 600 + orb) * 8; // warm gold only

        ctx.globalAlpha = 0.42;
        ctx.fillStyle = `hsla(${oH},100%,68%,0.55)`;
        ctx.shadowBlur = 28; ctx.shadowColor = '#ffd700';
        ctx.beginPath(); ctx.arc(ox, oy, os + 5, 0, Math.PI * 2); ctx.fill();

        ctx.globalAlpha = 1;
        ctx.fillStyle = `hsl(${oH},100%,85%)`;
        ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(ox, oy, os, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.shadowBlur = 10; ctx.shadowColor = '#ffffff';
        ctx.beginPath(); ctx.arc(ox, oy, os * 0.42, 0, Math.PI * 2); ctx.fill();
      }

      // 20 tight gold / white particles
      for (let i = 0; i < 20; i++) {
        const a = (time / 1400 + i * Math.PI * 0.1) % (Math.PI * 2);
        const d = this.r + 12 + (i % 3) * 5.5 + Math.sin(time / 300 + i * 1.8) * 3.5;
        const px = this.x + Math.cos(a) * d, py = this.y + Math.sin(a) * d;
        const pH = 42 + Math.sin(time / 600 + i) * 8; // gold to warm white
        const pS = 1.8 + Math.sin(time / 250 + i) * 0.8;
        ctx.globalAlpha = 0.72 + Math.sin(time / 320 + i * 2) * 0.2;
        ctx.fillStyle = `hsl(${pH},100%,${80 + (i % 4) * 5}%)`;
        ctx.shadowBlur = 9; ctx.shadowColor = '#ffd700';
        ctx.beginPath(); ctx.arc(px, py, pS, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 2 segmented rotating rings
      for (let ring = 0; ring < 2; ring++) {
        const rr = this.r + 11 + ring * 6 + Math.sin(time / 550 + ring) * 2.5;
        const rot = time / (1600 + ring * 400) * (ring % 2 === 0 ? 1 : -1);
        ctx.strokeStyle = `hsla(45,100%,${78 - ring * 12}%,${0.78 - ring * 0.18})`;
        ctx.lineWidth = 2.8;
        ctx.shadowBlur = 18; ctx.shadowColor = '#ffd700';
        for (let seg = 0; seg < 8; seg++) {
          const sa = rot + seg * Math.PI / 4;
          ctx.beginPath(); ctx.arc(this.x, this.y, rr, sa, sa + Math.PI * 0.33); ctx.stroke();
        }
      }

      // multi-layer golden core
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'hsla(45,100%,68%,0.5)';
      ctx.shadowBlur = 44; ctx.shadowColor = '#ffd700';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 10 + Math.sin(time / 500) * 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = skinColor;
      ctx.shadowBlur = 38; ctx.shadowColor = '#ffd700';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = `hsla(48,100%,88%,${0.88 + Math.sin(time / 550) * 0.12})`;
      ctx.shadowBlur = 26; ctx.shadowColor = '#ffed4e';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.66, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = `rgba(255,255,255,${0.88 + Math.sin(time / 580) * 0.12})`;
      ctx.shadowBlur = 20; ctx.shadowColor = '#ffffff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.38, 0, Math.PI * 2); ctx.fill();

      ctx.shadowBlur = 0;
    } else if (activeSkin === 'silver-champion') {
      // silver champion skin
      const time = Date.now();

      // 3 silver rings
      ctx.globalAlpha = 0.35;
      for (let ring = 0; ring < 3; ring++) {
        const rr = this.r + 20 + ring * 16 + Math.sin(time / 110 + ring * 0.7) * 7;
        const rH = 200 + Math.sin(time / 600 + ring) * 15;
        ctx.strokeStyle = `hsla(${rH},55%,${78 - ring * 7}%,${0.52 - ring * 0.1})`;
        ctx.lineWidth = 2.6 - ring * 0.5;
        ctx.shadowBlur = 20; ctx.shadowColor = '#00bfff';
        ctx.beginPath(); ctx.arc(this.x, this.y, rr, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // counter-rotating shield crescents
 // Two thick semi-arc segments orbit in opposite directions,
 // forming a shield silhouette that rotates
      for (let shield = 0; shield < 2; shield++) {
        const rot = time / (2000 + shield * 400) * (shield === 0 ? 1 : -1);
        const sr = this.r + 26 + Math.sin(time / 450 + shield) * 4;

 // Each crescent = thick arc covering ~160°
        const arcStart = rot + shield * Math.PI;
        const arcEnd = arcStart + Math.PI * 0.9;

        const sH = 195 + shield * 15; // cyan to sky blue
        ctx.strokeStyle = `hsla(${sH},85%,72%,0.82)`;
        ctx.lineWidth = 5 + Math.sin(time / 400 + shield) * 1.2;
        ctx.shadowBlur = 24; ctx.shadowColor = `hsl(${sH},100%,72%)`;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(this.x, this.y, sr, arcStart, arcEnd); ctx.stroke();

 // Inner edge arc (slightly smaller, brighter)
        ctx.strokeStyle = `hsla(${sH},100%,88%,0.55)`;
        ctx.lineWidth = 1.8;
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(this.x, this.y, sr - 3, arcStart, arcEnd); ctx.stroke();

 // Bright endpoint tips
        for (const tipA of [arcStart, arcEnd]) {
          const tx = this.x + Math.cos(tipA) * sr;
          const ty = this.y + Math.sin(tipA) * sr;
          ctx.fillStyle = `hsl(${sH},100%,90%)`;
          ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.arc(tx, ty, 3.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.lineCap = 'butt';

      // electric arc network
      const arcPts = 8, arcR = this.r + 26;
      const arcPos = [];
      for (let i = 0; i < arcPts; i++) {
        const a = (time / 1400 + i * Math.PI * 2 / arcPts) % (Math.PI * 2);
        arcPos.push({ x: this.x + Math.cos(a) * arcR, y: this.y + Math.sin(a) * arcR });
      }
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < arcPts; i++) {
        const j = (i + 3) % arcPts;
        const arcH = 188 + (time / 800 + i * 20) % 50;
        ctx.strokeStyle = `hsla(${arcH},85%,74%,0.65)`;
        ctx.lineWidth = 1.8; ctx.shadowBlur = 14; ctx.shadowColor = `hsl(${arcH},85%,74%)`;
        ctx.beginPath(); ctx.moveTo(arcPos[i].x, arcPos[i].y); ctx.lineTo(arcPos[j].x, arcPos[j].y); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 3 tech orbs
      for (let orb = 0; orb < 3; orb++) {
        const oa = (time / 2000 + orb * Math.PI * 2 / 3) % (Math.PI * 2);
        const od = this.r + 22 + Math.sin(time / 480 + orb * 2) * 5;
        const ox = this.x + Math.cos(oa) * od, oy = this.y + Math.sin(oa) * od;
        const os = 5.5 + Math.sin(time / 380 + orb) * 1.8;
        const oH = 192 + orb * 12;

        ctx.globalAlpha = 0.4;
        ctx.fillStyle = `hsla(${oH},80%,68%,0.55)`;
        ctx.shadowBlur = 26; ctx.shadowColor = '#00bfff';
        ctx.beginPath(); ctx.arc(ox, oy, os + 4, 0, Math.PI * 2); ctx.fill();

        ctx.globalAlpha = 1;
        ctx.fillStyle = `hsl(${oH},85%,82%)`;
        ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(ox, oy, os, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = 'rgba(200,245,255,0.85)';
        ctx.shadowBlur = 10; ctx.shadowColor = '#00ffff';
        ctx.beginPath(); ctx.arc(ox, oy, os * 0.42, 0, Math.PI * 2); ctx.fill();
      }

      // 20 silver/cyan particles
      for (let i = 0; i < 20; i++) {
        const a = (time / 1200 + i * Math.PI * 0.1) % (Math.PI * 2);
        const d = this.r + 10 + (i % 3) * 5 + Math.sin(time / 280 + i * 1.8) * 3;
        const pH = 190 + (i % 6) * 8;
        ctx.globalAlpha = 0.65 + Math.sin(time / 300 + i * 2) * 0.22;
        ctx.fillStyle = `hsl(${pH},70%,80%)`;
        ctx.shadowBlur = 8; ctx.shadowColor = `hsl(${pH},80%,80%)`;
        ctx.beginPath(); ctx.arc(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d,
          1.7 + Math.sin(time / 240 + i) * 0.7, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 2 segmented rotating rings
      for (let ring = 0; ring < 2; ring++) {
        const rr = this.r + 10 + ring * 5.5 + Math.sin(time / 520 + ring) * 2.5;
        const rot = time / (1400 + ring * 300) * (ring % 2 === 0 ? 1 : -1);
        ctx.strokeStyle = `hsla(205,55%,${80 - ring * 14}%,${0.74 - ring * 0.16})`;
        ctx.lineWidth = 2.6;
        ctx.shadowBlur = 18; ctx.shadowColor = '#c0c0c0';
        for (let seg = 0; seg < 6; seg++) {
          const sa = rot + seg * Math.PI / 3;
          ctx.beginPath(); ctx.arc(this.x, this.y, rr, sa, sa + Math.PI * 0.36); ctx.stroke();
        }
      }

      // multi-layer silver core
      ctx.globalAlpha = 0.48;
      ctx.fillStyle = 'hsla(200,58%,76%,0.52)';
      ctx.shadowBlur = 38; ctx.shadowColor = '#00bfff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 9 + Math.sin(time / 480) * 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = skinColor;
      ctx.shadowBlur = 32; ctx.shadowColor = '#00bfff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = `hsla(200,75%,84%,${0.84 + Math.sin(time / 520) * 0.16})`;
      ctx.shadowBlur = 22; ctx.shadowColor = '#00ffff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.64, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = `rgba(210,245,255,${0.82 + Math.sin(time / 550) * 0.18})`;
      ctx.shadowBlur = 18; ctx.shadowColor = '#ffffff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.38, 0, Math.PI * 2); ctx.fill();

      ctx.shadowBlur = 0;
    } else if (activeSkin === 'bronze-champion') {
      // bronze champion skin
      const time = Date.now();

      // 3 forge rings
      ctx.globalAlpha = 0.35;
      for (let ring = 0; ring < 3; ring++) {
        const rr = this.r + 18 + ring * 15 + Math.sin(time / 100 + ring * 0.7) * 7;
        const rH = 22 + Math.sin(time / 580 + ring) * 10;
        ctx.strokeStyle = `hsla(${rH},88%,${62 - ring * 6}%,${0.5 - ring * 0.1})`;
        ctx.lineWidth = 2.6 - ring * 0.5;
        ctx.shadowBlur = 18; ctx.shadowColor = '#ff6347';
        ctx.beginPath(); ctx.arc(this.x, this.y, rr, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // trailing flame wisps
 // 6 flame plumes arranged symmetrically around lower half of player,
 // tapering outward like fire wings / warrior flames
      const flameAngles = [
        Math.PI * 0.60, Math.PI * 0.72, Math.PI * 0.85,   // left side arc
        Math.PI * 1.15, Math.PI * 1.28, Math.PI * 1.40,   // right side arc
      ];
      for (let f = 0; f < flameAngles.length; f++) {
        const baseAngle = flameAngles[f];
        const flicker = Math.sin(time / 120 + f * 1.7) * 0.08;
        const angle = baseAngle + flicker;
 // Each flame: 4 circles shrinking outward, hot white → orange → red
        for (let step = 0; step < 4; step++) {
          const dist = this.r + 5 + step * 7 + Math.sin(time / 140 + f + step) * 2;
          const fx = this.x + Math.cos(angle) * dist;
          const fy = this.y + Math.sin(angle) * dist;
          const fH = 12 - step * 3;             // red → deep red
          const fL = 70 - step * 14;            // bright → dim
          const fSize = (3.5 - step * 0.65) + Math.sin(time / 160 + f * 2) * 0.4;
          const fAlpha = 0.88 - step * 0.18;

          ctx.globalAlpha = fAlpha;
          ctx.fillStyle = step === 0
            ? `hsla(38,100%,88%,0.92)`          // white-hot core
            : `hsl(${Math.max(0, fH)},95%,${Math.max(25, fL)}%)`;
          ctx.shadowBlur = 14 - step * 2;
          ctx.shadowColor = step < 2 ? '#ff6600' : '#ff2200';
          ctx.beginPath(); ctx.arc(fx, fy, Math.max(0.5, fSize), 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // warrior triangle crest
      const crestR = this.r + 22 + Math.sin(time / 560) * 4;
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'hsla(30,90%,68%,0.85)';
      ctx.lineWidth = 2.6;
      ctx.shadowBlur = 16; ctx.shadowColor = '#ff6347';
      ctx.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = (time / 3000 + i * Math.PI * 2 / 3 - Math.PI / 2) % (Math.PI * 2);
        const x = this.x + Math.cos(a) * crestR, y = this.y + Math.sin(a) * crestR;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
 // Triangle spike tips with molten jewels
      for (let i = 0; i < 3; i++) {
        const a = (time / 3000 + i * Math.PI * 2 / 3 - Math.PI / 2) % (Math.PI * 2);
        const x1 = this.x + Math.cos(a) * crestR;
        const y1 = this.y + Math.sin(a) * crestR;
        const x2 = this.x + Math.cos(a) * (crestR + 11);
        const y2 = this.y + Math.sin(a) * (crestR + 11);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        const jH = 25 + i * 12;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = `hsl(${jH},100%,68%)`; ctx.shadowBlur = 18; ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath(); ctx.arc(x2, y2, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 3 molten orbs
      for (let orb = 0; orb < 3; orb++) {
        const oa = (time / 2100 + orb * Math.PI * 2 / 3) % (Math.PI * 2);
        const od = this.r + 20 + Math.sin(time / 460 + orb * 2) * 5;
        const ox = this.x + Math.cos(oa) * od, oy = this.y + Math.sin(oa) * od;
        const os = 5.2 + Math.sin(time / 360 + orb) * 2;
        const oH = 20 + (orb * 10) + Math.sin(time / 500 + orb) * 8;

        ctx.globalAlpha = 0.4;
        ctx.fillStyle = `hsla(${oH},90%,58%,0.62)`;
        ctx.shadowBlur = 26; ctx.shadowColor = '#ff6347';
        ctx.beginPath(); ctx.arc(ox, oy, os + 4, 0, Math.PI * 2); ctx.fill();

        ctx.globalAlpha = 1;
        ctx.fillStyle = `hsl(${oH},96%,65%)`;
        ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(ox, oy, os, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = `hsla(45,100%,78%,${0.82 + Math.sin(time / 340 + orb) * 0.18})`;
        ctx.shadowBlur = 10; ctx.shadowColor = '#ffd700';
        ctx.beginPath(); ctx.arc(ox, oy, os * 0.45, 0, Math.PI * 2); ctx.fill();
      }

      // 18 ember particles
      for (let i = 0; i < 18; i++) {
        const a = (time / 1300 + i * Math.PI * 2 / 18) % (Math.PI * 2);
        const d = this.r + 10 + (i % 3) * 5 + Math.sin(time / 270 + i * 1.8) * 3.5;
        const pH = 15 + (i % 5) * 6;
        ctx.globalAlpha = 0.62 + Math.sin(time / 290 + i * 2.4) * 0.26;
        ctx.fillStyle = `hsl(${pH},92%,${58 + (i % 3) * 6}%)`;
        ctx.shadowBlur = 7; ctx.shadowColor = `hsl(${pH},92%,65%)`;
        ctx.beginPath(); ctx.arc(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d,
          1.6 + Math.sin(time / 220 + i) * 0.7, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 2 segmented rotating rings
      for (let ring = 0; ring < 2; ring++) {
        const rr = this.r + 9 + ring * 4.5 + Math.sin(time / 500 + ring) * 2.5;
        const rot = time / (1500 + ring * 350) * (ring % 2 === 0 ? 1 : -1);
        ctx.strokeStyle = `hsla(25,88%,${60 - ring * 10}%,${0.70 - ring * 0.15})`;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 16; ctx.shadowColor = '#cd7f32';
        for (let seg = 0; seg < 7; seg++) {
          const sa = rot + seg * Math.PI * 2 / 7;
          ctx.beginPath(); ctx.arc(this.x, this.y, rr, sa, sa + Math.PI * 0.31); ctx.stroke();
        }
      }

      // multi-layer molten core
      ctx.globalAlpha = 0.46;
      ctx.fillStyle = 'hsla(22,90%,60%,0.55)';
      ctx.shadowBlur = 35; ctx.shadowColor = '#ff6347';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 9 + Math.sin(time / 470) * 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = skinColor;
      ctx.shadowBlur = 30; ctx.shadowColor = '#ff6347';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = `hsla(30,92%,70%,${0.82 + Math.sin(time / 500) * 0.18})`;
      ctx.shadowBlur = 22; ctx.shadowColor = '#ffa500';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.64, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = `hsla(45,100%,74%,${0.80 + Math.sin(time / 530) * 0.20})`;
      ctx.shadowBlur = 16; ctx.shadowColor = '#ffd700';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.38, 0, Math.PI * 2); ctx.fill();

      ctx.shadowBlur = 0;
    } else if (activeSkin === 'celestial') {
 // CELESTIAL NEXUS: Universal convergence - the ultimate visual spectacle
      const time = Date.now();
      const phase = Math.sin(time / 800); // Slow phase transition
      
      // dimensional rift background
 // Expanding cosmic rings that create depth
      ctx.globalAlpha = 0.3;
      for (let ring = 0; ring < 5; ring++) {
        const ringRadius = this.r + 30 + ring * 15 + Math.sin(time / 100 + ring) * 8;
        const ringHue = (time / 30 + ring * 60) % 360;
        ctx.strokeStyle = `hsla(${ringHue},80%,65%,${0.4 - ring * 0.06})`;
        ctx.lineWidth = 3 - ring * 0.4;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `hsl(${ringHue},80%,65%)`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      
      // cosmic energy streams
 // Flowing energy tendrils that spiral around
      ctx.globalAlpha = 0.6;
      for (let stream = 0; stream < 12; stream++) {
        const baseAngle = (time / 40 + stream * 30) * Math.PI / 180;
        const streamLength = this.r + 35;
        const waveOffset = Math.sin(time / 60 + stream) * 10;
        
        ctx.beginPath();
        for (let segment = 0; segment < 8; segment++) {
          const segmentRatio = segment / 7;
          const angle = baseAngle + segmentRatio * Math.PI / 6;
          const dist = this.r + 5 + segmentRatio * streamLength + Math.sin(time / 50 + segment) * waveOffset;
          const x = this.x + Math.cos(angle) * dist;
          const y = this.y + Math.sin(angle) * dist;
          
          if (segment === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        
        const streamHue = (time / 20 + stream * 30) % 360;
        ctx.strokeStyle = `hsla(${streamHue},90%,70%,${0.7 - (stream % 4) * 0.15})`;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 12;
        ctx.shadowColor = `hsl(${streamHue},90%,70%)`;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      
      // constellation pattern
 // Geometric star pattern with connecting lines
      const constellationPoints = 8;
      const constellationRadius = this.r + 25 + Math.sin(time / 110) * 5;
      const constellationPositions = [];
      
      for (let i = 0; i < constellationPoints; i++) {
        const angle = (time / 50 + i * (360 / constellationPoints)) * Math.PI / 180;
        const x = this.x + Math.cos(angle) * constellationRadius;
        const y = this.y + Math.sin(angle) * constellationRadius;
        constellationPositions.push({ x, y });
        
 // Stars
        const starHue = (time / 15 + i * 45) % 360;
        const starSize = 3 + Math.sin(time / 70 + i * 2) * 1.5;
        ctx.fillStyle = `hsla(${starHue},100%,75%,0.9)`;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsl(${starHue},100%,75%)`;
        ctx.beginPath();
        ctx.arc(x, y, starSize, 0, Math.PI * 2);
        ctx.fill();
        
 // Star glow
        ctx.fillStyle = `hsla(${starHue},100%,85%,0.5)`;
        ctx.beginPath();
        ctx.arc(x, y, starSize + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      
 // Connect constellation points
      ctx.globalAlpha = 0.4;
      for (let i = 0; i < constellationPoints; i++) {
        const next = (i + 1) % constellationPoints;
        const lineHue = (time / 18 + i * 45) % 360;
        ctx.strokeStyle = `hsla(${lineHue},85%,70%,0.6)`;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `hsl(${lineHue},85%,70%)`;
        ctx.beginPath();
        ctx.moveTo(constellationPositions[i].x, constellationPositions[i].y);
        ctx.lineTo(constellationPositions[next].x, constellationPositions[next].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      
      // nebula cloud particles
 // Dense particle cloud with depth
      const nebulaParticleCount = 40;
      for (let i = 0; i < nebulaParticleCount; i++) {
        const angle = (time / 35 + i * (360 / nebulaParticleCount)) * Math.PI / 180;
        const dist = this.r + 8 + (i % 3) * 8 + Math.sin(time / 55 + i * 2) * 6;
        const particleX = this.x + Math.cos(angle) * dist;
        const particleY = this.y + Math.sin(angle) * dist;
        const particleHue = (time / 12 + i * 9) % 360;
        const particleSize = 1.5 + Math.sin(time / 45 + i) * 0.8;
        const particleAlpha = 0.6 + Math.sin(time / 60 + i * 3) * 0.3;
        
        ctx.fillStyle = `hsla(${particleHue},95%,75%,${particleAlpha})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = `hsl(${particleHue},95%,75%)`;
        ctx.beginPath();
        ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // quantum energy orbs
 // Large orbiting energy spheres
      for (let orb = 0; orb < 3; orb++) {
        const orbAngle = (time / 45 + orb * 120) * Math.PI / 180;
        const orbDist = this.r + 20 + Math.sin(time / 90 + orb * 2) * 5;
        const orbX = this.x + Math.cos(orbAngle) * orbDist;
        const orbY = this.y + Math.sin(orbAngle) * orbDist;
        const orbHue = (time / 10 + orb * 120) % 360;
        const orbSize = 5 + Math.sin(time / 70 + orb) * 2;
        
 // Orb glow
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = `hsla(${orbHue},100%,70%,0.6)`;
        ctx.shadowBlur = 25;
        ctx.shadowColor = `hsl(${orbHue},100%,70%)`;
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbSize + 4, 0, Math.PI * 2);
        ctx.fill();
        
 // Orb core
        ctx.globalAlpha = 1;
        ctx.fillStyle = `hsla(${orbHue},100%,85%,0.95)`;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbSize, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // reality distortion effect
 // Warping hexagonal pattern around player
      ctx.globalAlpha = 0.25;
      const hexCount = 6;
      for (let hex = 0; hex < hexCount; hex++) {
        const hexAngle = (time / 60 + hex * 60) * Math.PI / 180;
        const hexDist = this.r + 18 + Math.sin(time / 85 + hex) * 4;
        const hexX = this.x + Math.cos(hexAngle) * hexDist;
        const hexY = this.y + Math.sin(hexAngle) * hexDist;
        const hexSize = 6 + Math.sin(time / 65 + hex * 2) * 2;
        const hexHue = (time / 25 + hex * 60) % 360;
        
        ctx.strokeStyle = `hsla(${hexHue},90%,70%,0.7)`;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = `hsl(${hexHue},90%,70%)`;
        ctx.beginPath();
        for (let side = 0; side < 6; side++) {
          const sideAngle = (side * 60) * Math.PI / 180;
          const sx = hexX + Math.cos(sideAngle) * hexSize;
          const sy = hexY + Math.sin(sideAngle) * hexSize;
          if (side === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      
      // core energy sphere
 // Triple-layered core with different blend modes
      
 // Outer core glow
      ctx.globalAlpha = 0.5;
      const outerGlowRadius = this.r + 8 + Math.sin(time / 90) * 3;
      const outerGlowHue = (time / 18) % 360;
      ctx.fillStyle = `hsla(${outerGlowHue},85%,65%,0.5)`;
      ctx.shadowBlur = 35;
      ctx.shadowColor = `hsl(${outerGlowHue},85%,65%)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, outerGlowRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      
 // Middle core layer
      ctx.fillStyle = skinColor;
      ctx.shadowBlur = 30;
      ctx.shadowColor = skinColor;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      
 // Inner core - brilliant white center
      const innerCoreSize = this.r * 0.5 + Math.sin(time / 100) * 2;
      ctx.fillStyle = `hsla(${(time / 15) % 360},100%,95%,${0.85 + Math.sin(time / 80) * 0.15})`;
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, innerCoreSize, 0, Math.PI * 2);
      ctx.fill();
      
      // energy burst lines
 // Radiating energy lines that pulse outward
      if (Math.sin(time / 200) > 0.7) { // Periodic bursts
        ctx.globalAlpha = 0.6;
        const burstCount = 24;
        for (let burst = 0; burst < burstCount; burst++) {
          const burstAngle = (burst * (360 / burstCount)) * Math.PI / 180;
          const burstLength = this.r + 40 + Math.sin(time / 50 + burst) * 15;
          const burstHue = (time / 8 + burst * 15) % 360;
          
          ctx.strokeStyle = `hsla(${burstHue},100%,75%,${0.5 + Math.sin(time / 40 + burst) * 0.3})`;
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 8;
          ctx.shadowColor = `hsl(${burstHue},100%,75%)`;
          ctx.beginPath();
          ctx.moveTo(this.x, this.y);
          ctx.lineTo(
            this.x + Math.cos(burstAngle) * burstLength,
            this.y + Math.sin(burstAngle) * burstLength
          );
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      
      ctx.shadowBlur = 0;
    } else if (activeSkin && activeSkin.startsWith('c_')) {
      // crate exclusive skin rendering
      const time = Date.now();
      const skinColor = getActiveSkinColor();
      const t = time;

 // Determine tier from skin id for effect intensity
      const crateTiers = {
        common:    ['c_static','c_rust','c_slate','c_olive','c_maroon','c_moss','c_ash','c_dusk','c_clay'],
        uncommon:  ['c_cobalt','c_teal','c_coral','c_sand','c_chrome','c_sapphire','c_mint','c_bronze_skin','c_storm_grey','neon_pulse','neon_grid','frost_snowdrift','frost_icicle','infernal_ember','infernal_cinder'],
        rare:      ['c_prism','c_aurora','c_lava','c_storm','c_neon','c_bloodmoon','c_frostfire','c_vortex','c_toxic_waste','neon_surge','neon_cipher','frost_blizzard','frost_permafrost','infernal_wildfire','infernal_eruption','void_hollow'],
        epic:      ['c_glitch','c_nebula','c_biohazard','c_arctic','c_wildfire','c_spectre','c_blackhole','c_dragonscale','c_hologram','c_thunderstrike','neon_overload','frost_avalanche','infernal_hellstorm','void_nebula_core','void_dark_matter'],
        legendary: ['c_supernova','c_wraith','c_titan','c_astral','c_eclipse','c_abyssal_flame','c_zero_point','neon_synthwave','frost_absolute_zero','infernal_solar_flare','void_event_horizon'],
        mythic:    ['c_omnichrome','c_singularity','c_ultraviolet','c_godmode','c_rift','c_entropy','c_dimension_rift','c_eternal','void_big_bang'],
      };
      const tier = Object.entries(crateTiers).find(([,ids]) => ids.includes(activeSkin))?.[0] || 'common';

      // common: simple glow circle + soft pulse ring
      if (tier === 'common') {
        ctx.fillStyle = skinColor;
        ctx.shadowBlur = 18;
        ctx.shadowColor = skinColor;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
 // Slow pulse ring
        const pr = this.r + 7 + Math.sin(t / 300) * 3;
        ctx.strokeStyle = skinColor;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4 + Math.sin(t / 300) * 0.2;
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(this.x, this.y, pr, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // uncommon: core + dual orbiting sparks
      else if (tier === 'uncommon') {
        ctx.fillStyle = skinColor;
        ctx.shadowBlur = 22;
        ctx.shadowColor = skinColor;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
 // 2 orbiting sparks
        for (let i = 0; i < 2; i++) {
          const angle = (t / 600 + i * Math.PI) % (Math.PI * 2);
          const ox = this.x + Math.cos(angle) * (this.r + 10);
          const oy = this.y + Math.sin(angle) * (this.r + 10);
          ctx.fillStyle = skinColor;
          ctx.shadowBlur = 12;
          ctx.shadowColor = skinColor;
          ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI * 2); ctx.fill();
        }
 // Pulse ring
        const pr = this.r + 6 + Math.sin(t / 250) * 4;
        ctx.strokeStyle = skinColor;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.45 + Math.sin(t / 250) * 0.2;
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(this.x, this.y, pr, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // rare: core + twin rings + 4-particle orbit
      else if (tier === 'rare') {
 // Outer glow ring
        ctx.strokeStyle = skinColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.35;
        ctx.shadowBlur = 20;
        ctx.shadowColor = skinColor;
        const outerR = this.r + 14 + Math.sin(t / 200) * 5;
        ctx.beginPath(); ctx.arc(this.x, this.y, outerR, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;

 // Core
        ctx.fillStyle = skinColor;
        ctx.shadowBlur = 28;
        ctx.shadowColor = skinColor;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();

 // 4 orbiting particles
        for (let i = 0; i < 4; i++) {
          const angle = (t / 500 + i * Math.PI / 2) % (Math.PI * 2);
          const dist = this.r + 12 + Math.sin(t / 300 + i) * 3;
          const px = this.x + Math.cos(angle) * dist;
          const py = this.y + Math.sin(angle) * dist;
          const pHue = (t / 20 + i * 90) % 360;
          ctx.fillStyle = activeSkin === 'c_prism' ? `hsl(${pHue},100%,70%)` : skinColor;
          ctx.shadowBlur = 14;
          ctx.shadowColor = ctx.fillStyle;
          ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // epic: dual counter-rotating rings + 6 particles + energy core
      else if (tier === 'epic') {
 // Outer rotating ring
        for (let ring = 0; ring < 2; ring++) {
          const ringR = this.r + 12 + ring * 12 + Math.sin(t / 200 + ring) * 4;
          const ringAlpha = 0.35 - ring * 0.1;
          const ringHue = activeSkin === 'c_glitch' ? (t / 6 + ring * 120) % 360 :
                          activeSkin === 'c_biohazard' ? 100 :
                          activeSkin === 'c_arctic'    ? 195 :
                          activeSkin === 'c_wildfire'  ? 25 :
                          activeSkin === 'c_spectre'   ? 235 : 270;
          ctx.strokeStyle = `hsla(${ringHue},90%,65%,${ringAlpha})`;
          ctx.lineWidth = 2 - ring * 0.5;
          ctx.shadowBlur = 18;
          ctx.shadowColor = skinColor;
          ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(this.x, this.y, ringR, 0, Math.PI * 2); ctx.stroke();
        }

 // Bright core
        ctx.fillStyle = skinColor;
        ctx.shadowBlur = 35;
        ctx.shadowColor = skinColor;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();

 // White hot inner core
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.45, 0, Math.PI * 2); ctx.fill();

 // 6 orbiting particles
        for (let i = 0; i < 6; i++) {
          const angle = (t / 400 + i * Math.PI / 3) % (Math.PI * 2);
          const dist = this.r + 15 + Math.sin(t / 280 + i) * 4;
          const px = this.x + Math.cos(angle) * dist;
          const py = this.y + Math.sin(angle) * dist;
          const pH = activeSkin === 'c_glitch' ? (t / 5 + i * 60) % 360 : null;
          ctx.fillStyle = pH !== null ? `hsl(${pH},100%,68%)` : skinColor;
          ctx.shadowBlur = 16;
          ctx.shadowColor = ctx.fillStyle;
          ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // legendary: 3 rings + energy streams + 8 particles
      else if (tier === 'legendary') {
 // 3 rings
        for (let ring = 0; ring < 3; ring++) {
          const ringR = this.r + 10 + ring * 14 + Math.sin(t / 180 + ring * 0.8) * 6;
          const dir = ring % 2 === 0 ? 1 : -1;
          const rotation = (t / 800 * dir + ring * 1.2) % (Math.PI * 2);
          const baseHue = activeSkin === 'c_supernova' ? (t / 8 + ring * 40) % 360 :
                          activeSkin === 'c_wraith'    ? 270 + ring * 15 :
                          activeSkin === 'c_titan'     ? 35 + ring * 5 : 205 + ring * 20;
          ctx.strokeStyle = `hsla(${baseHue},95%,${65 - ring * 8}%,${0.5 - ring * 0.1})`;
          ctx.lineWidth = 2.5 - ring * 0.5;
          ctx.shadowBlur = 22;
          ctx.shadowColor = skinColor;
          ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(this.x, this.y, ringR, rotation, rotation + Math.PI * 1.6); ctx.stroke();
        }

 // Core
        ctx.fillStyle = skinColor;
        ctx.shadowBlur = 40;
        ctx.shadowColor = skinColor;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();

 // Bright inner core
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.4, 0, Math.PI * 2); ctx.fill();

 // 8 orbiting particles, 2 sizes
        for (let i = 0; i < 8; i++) {
          const angle = (t / 350 + i * Math.PI / 4) % (Math.PI * 2);
          const dist = this.r + 16 + Math.sin(t / 250 + i * 1.3) * 5;
          const px = this.x + Math.cos(angle) * dist;
          const py = this.y + Math.sin(angle) * dist;
          const pH = activeSkin === 'c_supernova' ? (t / 4 + i * 45) % 360 : null;
          const pColor = pH !== null ? `hsl(${pH},100%,72%)` : skinColor;
          const pSize = i % 2 === 0 ? 3.5 : 2;
          ctx.fillStyle = pColor;
          ctx.shadowBlur = 18;
          ctx.shadowColor = pColor;
          ctx.globalAlpha = 0.92;
          ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // mythic: near-champion — 4 rings + energy tendrils + 10 particles + dual cores
      else if (tier === 'mythic') {
 // 4 expanding rings
        for (let ring = 0; ring < 4; ring++) {
          const ringR = this.r + 8 + ring * 13 + Math.sin(t / 150 + ring * 0.7) * 7;
          const dir = ring % 2 === 0 ? 1 : -1;
          const rH = activeSkin === 'c_omnichrome' || activeSkin === 'c_singularity' || activeSkin === 'c_rift'
            ? (t / 6 + ring * 90) % 360
            : activeSkin === 'c_godmode' ? 45 + ring * 5
            : 272 + ring * 10;
          ctx.strokeStyle = `hsla(${rH},100%,${70 - ring * 8}%,${0.5 - ring * 0.09})`;
          ctx.lineWidth = 2.5 - ring * 0.4;
          ctx.shadowBlur = 25;
          ctx.shadowColor = skinColor;
          ctx.beginPath(); ctx.arc(this.x, this.y, ringR, 0, Math.PI * 2); ctx.stroke();
        }

 // Energy tendrils (4 spiraling lines)
        ctx.globalAlpha = 0.55;
        for (let s = 0; s < 4; s++) {
          const baseAngle = (t / 300 + s * Math.PI / 2) % (Math.PI * 2);
          ctx.beginPath();
          for (let seg = 0; seg < 6; seg++) {
            const r2 = this.r + 4 + seg * 8;
            const a2 = baseAngle + seg * 0.3;
            const sx = this.x + Math.cos(a2) * r2;
            const sy = this.y + Math.sin(a2) * r2;
            seg === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
          }
          const sH = activeSkin === 'c_omnichrome' ? (t / 4 + s * 90) % 360 :
                      activeSkin === 'c_godmode' ? 48 : 272;
          ctx.strokeStyle = `hsl(${sH},100%,70%)`;
          ctx.lineWidth = 2;
          ctx.shadowBlur = 14;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

 // Outer core glow
        ctx.fillStyle = skinColor;
        ctx.shadowBlur = 50;
        ctx.shadowColor = skinColor;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();

 // Bright white inner core
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ffffff';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.38, 0, Math.PI * 2); ctx.fill();

 // 10 orbiting particles
        for (let i = 0; i < 10; i++) {
          const angle = (t / 280 + i * Math.PI * 0.2) % (Math.PI * 2);
          const dist = this.r + 18 + Math.sin(t / 200 + i * 1.5) * 6;
          const px = this.x + Math.cos(angle) * dist;
          const py = this.y + Math.sin(angle) * dist;
          const pH = activeSkin === 'c_omnichrome' || activeSkin === 'c_rift'
            ? (t / 4 + i * 36) % 360
            : activeSkin === 'c_godmode' ? 50 + Math.sin(t / 200 + i) * 10
            : 272 + Math.sin(t / 200 + i) * 30;
          const pColor = `hsl(${pH},100%,72%)`;
          const pSize = i % 3 === 0 ? 4 : 2.5;
          ctx.fillStyle = pColor;
          ctx.shadowBlur = 20;
          ctx.shadowColor = pColor;
          ctx.globalAlpha = 0.95;
          ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      ctx.shadowBlur = 0;
      ctx.fillStyle = skinColor;
      ctx.shadowBlur = 10;
      ctx.shadowColor = skinColor;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (activeSkin && activeSkin.startsWith('ob_')) {
      // oblivion crate skins — dark premium rendering
      const time = Date.now();
      const skinColor = getActiveSkinColor();
      const t = time;
      const isUltra = activeSkin === 'ob_worldeater' || activeSkin === 'ob_eternium';
      const isMythicOb = activeSkin === 'ob_abyssal' || activeSkin === 'ob_eventide' || isUltra;
      const isLegendaryOb = activeSkin === 'ob_soulreaper' || activeSkin === 'ob_eclipsar' || activeSkin === 'ob_phantomking';

      // dark outer void ring (all oblivion skins)
      const voidR = this.r + 6 + Math.sin(t / 600) * 3;
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.35 + Math.sin(t / 400) * 0.1})`;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 15;
      ctx.shadowColor = skinColor;
      ctx.beginPath(); ctx.arc(this.x, this.y, voidR, 0, Math.PI * 2); ctx.stroke();

      if (isLegendaryOb || isMythicOb) {
        // 2 counter-rotating partial arcs
        for (let a = 0; a < 2; a++) {
          const arcR = this.r + 12 + a * 10 + Math.sin(t / 350 + a) * 4;
          const dir = a === 0 ? 1 : -1;
          const rot = (t / (450 + a * 100)) * dir;
          ctx.strokeStyle = skinColor;
          ctx.globalAlpha = 0.35 - a * 0.1;
          ctx.lineWidth = 2 - a * 0.5;
          ctx.shadowBlur = 20;
          ctx.shadowColor = skinColor;
          ctx.beginPath();
          ctx.arc(this.x, this.y, arcR, rot, rot + Math.PI * 1.2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // 6 orbiting embers
        for (let i = 0; i < 6; i++) {
          const angle = (t / 380 + i * Math.PI / 3) % (Math.PI * 2);
          const dist = this.r + 14 + Math.sin(t / 250 + i * 1.3) * 5;
          const px = this.x + Math.cos(angle) * dist;
          const py = this.y + Math.sin(angle) * dist;
          ctx.fillStyle = skinColor;
          ctx.shadowBlur = 12;
          ctx.shadowColor = skinColor;
          ctx.globalAlpha = 0.8;
          ctx.beginPath(); ctx.arc(px, py, 2.5 - (i % 2) * 0.8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (isMythicOb) {
        // dark energy tendrils (3)
        ctx.globalAlpha = 0.4;
        for (let s = 0; s < 3; s++) {
          const baseAngle = (t / 400 + s * Math.PI * 2 / 3) % (Math.PI * 2);
          ctx.beginPath();
          for (let seg = 0; seg < 5; seg++) {
            const r2 = this.r + 3 + seg * 7;
            const a2 = baseAngle + seg * 0.35;
            const sx = this.x + Math.cos(a2) * r2;
            const sy = this.y + Math.sin(a2) * r2;
            seg === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
          }
          ctx.strokeStyle = skinColor;
          ctx.lineWidth = 2;
          ctx.shadowBlur = 16;
          ctx.shadowColor = skinColor;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (isUltra) {
        // pulsing shockwave ring
        const wavePhase = (t / 1200) % 1;
        const waveR = this.r + 8 + wavePhase * 30;
        const waveAlpha = (1 - wavePhase) * 0.3;
        ctx.strokeStyle = skinColor;
        ctx.globalAlpha = waveAlpha;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 25;
        ctx.shadowColor = skinColor;
        ctx.beginPath(); ctx.arc(this.x, this.y, waveR, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;

        // 4 spiraling energy lines
        ctx.globalAlpha = 0.5;
        for (let s = 0; s < 4; s++) {
          const baseAngle = (t / 300 + s * Math.PI / 2) % (Math.PI * 2);
          ctx.beginPath();
          for (let seg = 0; seg < 7; seg++) {
            const r2 = this.r + 4 + seg * 7;
            const a2 = baseAngle + seg * 0.4;
            const sx = this.x + Math.cos(a2) * r2;
            const sy = this.y + Math.sin(a2) * r2;
            seg === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
          }
          ctx.strokeStyle = skinColor;
          ctx.lineWidth = 1.8;
          ctx.shadowBlur = 18;
          ctx.shadowColor = skinColor;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // dark core body
      const coreGrad = ctx.createRadialGradient(
        this.x - this.r * 0.2, this.y - this.r * 0.2, 0,
        this.x, this.y, this.r
      );
      coreGrad.addColorStop(0, skinColor);
      coreGrad.addColorStop(0.6, skinColor);
      coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
      ctx.fillStyle = coreGrad;
      ctx.shadowBlur = isMythicOb ? 40 : isLegendaryOb ? 28 : 18;
      ctx.shadowColor = skinColor;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();

      // inner highlight
      if (isLegendaryOb || isMythicOb) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffffff';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.3, 0, Math.PI * 2); ctx.fill();
      }

      ctx.shadowBlur = 0;

    } else if (activeSkin && activeSkin.startsWith('icon_')) {
      // icon skins - friend collection
      const time = Date.now();
      const skinColor = getActiveSkinColor();
      
 // Baseball - Classic 2D baseball
      if (activeSkin === 'icon_keegan_baseball') {
 // White ball
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(150, 150, 150, 0.5)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

 // Red seams - S-curves that start apart, come close, then go apart (never touch)
        ctx.strokeStyle = '#d32f2f';
        ctx.lineWidth = 3;

 // Left S-curve: upper-left → curves toward center → lower-left
        ctx.beginPath();
        ctx.moveTo(this.x - this.r * 0.6, this.y - this.r * 0.65);
        ctx.bezierCurveTo(
          this.x - this.r * 0.15, this.y - this.r * 0.3,  // Control point 1 (curves inward)
          this.x - this.r * 0.15, this.y + this.r * 0.3,  // Control point 2 (curves inward)
          this.x - this.r * 0.6, this.y + this.r * 0.65   // End point
        );
        ctx.stroke();

 // Right S-curve: upper-right → curves toward center → lower-right
        ctx.beginPath();
        ctx.moveTo(this.x + this.r * 0.6, this.y - this.r * 0.65);
        ctx.bezierCurveTo(
          this.x + this.r * 0.15, this.y - this.r * 0.3,  // Control point 1 (curves inward)
          this.x + this.r * 0.15, this.y + this.r * 0.3,  // Control point 2 (curves inward)
          this.x + this.r * 0.6, this.y + this.r * 0.65   // End point
        );
        ctx.stroke();

 // Stitches crossing the seams
        ctx.lineWidth = 2.5;

 // Calculate points along the left S-curve for stitches
        for (let i = 0; i < 5; i++) {
          const t = i / 4; // 0 to 1
 // Bezier curve formula
          const px = Math.pow(1-t, 3) * (this.x - this.r * 0.6) +
                     3 * Math.pow(1-t, 2) * t * (this.x - this.r * 0.15) +
                     3 * (1-t) * Math.pow(t, 2) * (this.x - this.r * 0.15) +
                     Math.pow(t, 3) * (this.x - this.r * 0.6);
          const py = Math.pow(1-t, 3) * (this.y - this.r * 0.65) +
                     3 * Math.pow(1-t, 2) * t * (this.y - this.r * 0.3) +
                     3 * (1-t) * Math.pow(t, 2) * (this.y + this.r * 0.3) +
                     Math.pow(t, 3) * (this.y + this.r * 0.65);

 // Perpendicular angle for stitch
          const angle = Math.atan2(py - this.y, px - this.x);
          const perpAngle = angle + Math.PI / 2;

          ctx.beginPath();
          ctx.moveTo(px - Math.cos(perpAngle) * 3.5, py - Math.sin(perpAngle) * 3.5);
          ctx.lineTo(px + Math.cos(perpAngle) * 3.5, py + Math.sin(perpAngle) * 3.5);
          ctx.stroke();
        }

 // Calculate points along the right S-curve for stitches
        for (let i = 0; i < 5; i++) {
          const t = i / 4; // 0 to 1
 // Bezier curve formula
          const px = Math.pow(1-t, 3) * (this.x + this.r * 0.6) +
                     3 * Math.pow(1-t, 2) * t * (this.x + this.r * 0.15) +
                     3 * (1-t) * Math.pow(t, 2) * (this.x + this.r * 0.15) +
                     Math.pow(t, 3) * (this.x + this.r * 0.6);
          const py = Math.pow(1-t, 3) * (this.y - this.r * 0.65) +
                     3 * Math.pow(1-t, 2) * t * (this.y - this.r * 0.3) +
                     3 * (1-t) * Math.pow(t, 2) * (this.y + this.r * 0.3) +
                     Math.pow(t, 3) * (this.y + this.r * 0.65);

 // Perpendicular angle for stitch
          const angle = Math.atan2(py - this.y, px - this.x);
          const perpAngle = angle + Math.PI / 2;

          ctx.beginPath();
          ctx.moveTo(px - Math.cos(perpAngle) * 3.5, py - Math.sin(perpAngle) * 3.5);
          ctx.lineTo(px + Math.cos(perpAngle) * 3.5, py + Math.sin(perpAngle) * 3.5);
          ctx.stroke();
        }
      }
 // Dpoe - pink to baby blue fade (static, not animated)
      else if (activeSkin === 'icon_dpoe_fade') {
 // Pink to baby blue gradient - more baby blue
        const gradient = ctx.createLinearGradient(
          this.x - this.r, this.y - this.r,
          this.x + this.r, this.y + this.r
        );
        gradient.addColorStop(0, '#ff69b4');    // Hot pink
        gradient.addColorStop(0.35, '#ff9ec4'); // Light pink
        gradient.addColorStop(0.65, '#a8d8ea'); // Light baby blue
        gradient.addColorStop(1, '#89cff0');    // Baby blue

        ctx.fillStyle = gradient;
        ctx.shadowBlur = 22;
        ctx.shadowColor = '#a8d8ea';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
 // Carter - cosmic dust with white particles emanating
      else if (activeSkin === 'icon_carter_cosmic') {
 // Red to black gradient core - more dramatic
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
        gradient.addColorStop(0, '#ff2020');    // Bright red center
        gradient.addColorStop(0.4, '#cc0000');  // Red
        gradient.addColorStop(0.7, '#660000');  // Dark red
        gradient.addColorStop(1, '#1a0000');    // Almost black
        
        ctx.fillStyle = gradient;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff0000';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
 // White dust particles emanating outward - make them very visible
        ctx.globalAlpha = 1;
        for (let i = 0; i < 20; i++) {
          const angle = (time / 500 + i * (360 / 20)) * Math.PI / 180;
          const baseDistance = this.r + 5;
          const drift = (Math.sin(time / 400 + i * 2) * 0.5 + 0.5) * 12; // 0-12 pixels drift
          const dist = baseDistance + drift;
          const px = this.x + Math.cos(angle) * dist;
          const py = this.y + Math.sin(angle) * dist;
          
 // Particle size
          const pSize = 1.5 + Math.sin(time / 250 + i * 3) * 0.8;
          
 // Opacity fades as particle drifts further (but stays visible)
          const opacity = 0.9 - (drift / 15);
          
 // Bright white particles
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.shadowBlur = 10;
          ctx.shadowColor = `rgba(255, 255, 255, ${opacity * 0.8})`;
          ctx.beginPath();
          ctx.arc(px, py, pSize, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
 // Evan - Watermelon
      else if (activeSkin === 'icon_evan_watermelon') {
 // Watermelon gradient (red center to green edge)
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
        gradient.addColorStop(0, '#ff6b9d');    // Light pink center
        gradient.addColorStop(0.3, '#ff4466');  // Red
        gradient.addColorStop(0.5, '#ff1744');  // Bright red
        gradient.addColorStop(0.7, '#4caf50');  // Green rind
        gradient.addColorStop(1, '#2e7d32');    // Dark green edge

        ctx.fillStyle = gradient;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff4466';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

 // Add black "seeds"
        ctx.fillStyle = '#000000';
        const seedCount = 8;
        for (let i = 0; i < seedCount; i++) {
          const angle = (i / seedCount) * Math.PI * 2 + (time / 1000);
          const dist = this.r * 0.4;
          const sx = this.x + Math.cos(angle) * dist;
          const sy = this.y + Math.sin(angle) * dist;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
 // Gavin - TZL (Smooth animated fade: Red → White → Blue → repeat)
      else if (activeSkin === 'icon_gavin_tzl') {
 // Smooth continuous fade through colors
        const cycleSpeed = 4000; // 4 seconds per full cycle
        const phase = (time % cycleSpeed) / cycleSpeed; // 0 to 1

        let r, g, b;

        if (phase < 0.33) {
 // Fading from Red to White
          const t = phase / 0.33; // 0 to 1 within this phase
          r = Math.floor(220 + (255 - 220) * t);
          g = Math.floor(20 + (255 - 20) * t);
          b = Math.floor(60 + (255 - 60) * t);
        } else if (phase < 0.66) {
 // Fading from White to Blue
          const t = (phase - 0.33) / 0.33; // 0 to 1 within this phase
          r = Math.floor(255 + (0 - 255) * t);
          g = Math.floor(255 + (71 - 255) * t);
          b = Math.floor(255 + (171 - 255) * t);
        } else {
 // Fading from Blue back to Red
          const t = (phase - 0.66) / 0.34; // 0 to 1 within this phase
          r = Math.floor(0 + (220 - 0) * t);
          g = Math.floor(71 + (20 - 71) * t);
          b = Math.floor(171 + (60 - 171) * t);
        }

        const color = `rgb(${r}, ${g}, ${b})`;

        ctx.fillStyle = color;
        ctx.shadowBlur = 28;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

 // Draw "TZL" text in center with adaptive color
 // Use black text when background is close to white, white text otherwise
        const brightness = r + g + b;
        const textColor = brightness > 600 ? '#000000' : '#ffffff';
        const outlineColor = brightness > 600 ? '#ffffff' : '#000000';

        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = 3;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText('TZL', this.x, this.y);

        ctx.fillStyle = textColor;
        ctx.shadowBlur = 2;
        ctx.shadowColor = outlineColor;
        ctx.fillText('TZL', this.x, this.y);
        ctx.shadowBlur = 0;
      }
 // Brody - American flag
      else if (activeSkin === 'icon_brody_flag') {
 // Draw American flag pattern on circular player
 // We'll draw it as if the flag is wrapped around the circle
        
        const stripeHeight = (this.r * 2) / 13; // 13 stripes
        
 // Draw 13 alternating red and white stripes
        for (let i = 0; i < 13; i++) {
          const y = this.y - this.r + i * stripeHeight;
          const color = i % 2 === 0 ? '#b22234' : '#ffffff'; // Red or white
          
          ctx.fillStyle = color;
          ctx.beginPath();
          
 // Create clipping region for circular shape
          ctx.save();
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
          ctx.clip();
          
 // Draw horizontal stripe
          ctx.fillRect(this.x - this.r, y, this.r * 2, stripeHeight);
          ctx.restore();
        }
        
 // Draw blue canton (top left rectangle)
        const cantonWidth = this.r * 0.8;
        const cantonHeight = stripeHeight * 7; // 7 stripes worth
        
        ctx.fillStyle = '#3c3b6e'; // Flag blue
        ctx.beginPath();
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillRect(this.x - this.r, this.y - this.r, cantonWidth, cantonHeight);
        ctx.restore();
        
 // Draw white stars in blue canton (simplified - 5 stars in a pattern)
        ctx.fillStyle = '#ffffff';
        const starPositions = [
          { x: -0.6, y: -0.7 },
          { x: -0.3, y: -0.7 },
          { x: -0.6, y: -0.4 },
          { x: -0.3, y: -0.4 },
          { x: -0.45, y: -0.55 }
        ];
        
        for (const pos of starPositions) {
          const sx = this.x + pos.x * this.r;
          const sy = this.y + pos.y * this.r;
          
 // Draw simple star (5 pointed)
          ctx.save();
          ctx.translate(sx, sy);
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const radius = i % 2 === 0 ? 2.5 : 1.2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        
 // Add circular border to clean up edges
        ctx.strokeStyle = '#b22234';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.stroke();

 // Add patriotic glow effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#3c3b6e';
        ctx.strokeStyle = 'rgba(60, 59, 110, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
 // Sterling - Blue to black radial gradient (matches shop preview)
      else if (activeSkin === 'icon_sterling') {
 // Radial gradient matching shop preview: electric blue to black
        const gradient = ctx.createRadialGradient(
          this.x - this.r * 0.3, this.y - this.r * 0.3, 0,
          this.x, this.y, this.r
        );
        gradient.addColorStop(0, '#0064ff');    // Electric blue center
        gradient.addColorStop(0.3, '#0050cc');  // Medium blue
        gradient.addColorStop(0.6, '#003399');  // Dark blue
        gradient.addColorStop(1, '#000000');    // Black edge
        
        ctx.fillStyle = gradient;
        
 // Pulsing glow effect
        const pulseIntensity = 20 + Math.sin(time / 200) * 8;
        ctx.shadowBlur = pulseIntensity;
        ctx.shadowColor = '#0064ff';
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
 // Add animated electric rings
        const numRings = 2;
        for (let i = 0; i < numRings; i++) {
          const ringPhase = (time / 1000 + i * 0.5) % 1;
          const ringRadius = this.r + 3 + ringPhase * 8;
          const ringAlpha = (1 - ringPhase) * 0.6;
          
          ctx.strokeStyle = `rgba(0, 100, 255, ${ringAlpha})`;
          ctx.lineWidth = 2;
          ctx.shadowBlur = 8;
          ctx.shadowColor = 'rgba(0, 100, 255, 0.8)';
          ctx.beginPath();
          ctx.arc(this.x, this.y, ringRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
 // Justin - Lucky Clover: four-leaf clover with hard edge glow
      else if (activeSkin === 'icon_justin_clover') {
        const cx = this.x;
        const cy = this.y;
        const R = this.r;

 // Outer aura pulse
        const auraPulse = 18 + Math.sin(time / 300) * 6;
        ctx.shadowBlur = auraPulse;
        ctx.shadowColor = '#39ff14';

 // Draw four heart-shaped leaves
        ctx.fillStyle = '#1a8c2e';
        for (let leaf = 0; leaf < 4; leaf++) {
          const angle = (leaf * Math.PI / 2) - Math.PI / 4 + Math.sin(time / 2000) * 0.04;
          const leafDist = R * 0.42;
          const lx = cx + Math.cos(angle) * leafDist;
          const ly = cy + Math.sin(angle) * leafDist;
          const leafSize = R * 0.48;

          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(angle + Math.PI / 4);

 // Heart-shape leaf
          ctx.beginPath();
          ctx.moveTo(0, -leafSize * 0.3);
          ctx.bezierCurveTo(-leafSize * 0.55, -leafSize * 0.7, -leafSize * 0.55, 0, 0, leafSize * 0.4);
          ctx.bezierCurveTo(leafSize * 0.55, 0, leafSize * 0.55, -leafSize * 0.7, 0, -leafSize * 0.3);
          ctx.fill();

          ctx.restore();
        }

 // Lighter vein gradient overlay on each leaf
        ctx.fillStyle = 'rgba(50, 205, 50, 0.35)';
        for (let leaf = 0; leaf < 4; leaf++) {
          const angle = (leaf * Math.PI / 2) - Math.PI / 4 + Math.sin(time / 2000) * 0.04;
          const leafDist = R * 0.42;
          const lx = cx + Math.cos(angle) * leafDist;
          const ly = cy + Math.sin(angle) * leafDist;
          const leafSize = R * 0.36;

          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(angle + Math.PI / 4);

          ctx.beginPath();
          ctx.moveTo(0, -leafSize * 0.3);
          ctx.bezierCurveTo(-leafSize * 0.45, -leafSize * 0.6, -leafSize * 0.45, 0, 0, leafSize * 0.35);
          ctx.bezierCurveTo(leafSize * 0.45, 0, leafSize * 0.45, -leafSize * 0.6, 0, -leafSize * 0.3);
          ctx.fill();

          ctx.restore();
        }

 // Center hub
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#00ff41';
        ctx.fillStyle = '#145a1e';
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.18, 0, Math.PI * 2);
        ctx.fill();

 // Stem
        ctx.strokeStyle = '#0d5c1a';
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#1a8c2e';
        ctx.beginPath();
        ctx.moveTo(cx, cy + R * 0.15);
        ctx.quadraticCurveTo(cx + R * 0.15, cy + R * 0.7, cx + R * 0.35, cy + R * 1.0);
        ctx.stroke();

 // Animated sparkle particles
        ctx.shadowBlur = 0;
        const sparkleCount = 6;
        for (let i = 0; i < sparkleCount; i++) {
          const sparklePhase = (time / 800 + i * 1.047) % (Math.PI * 2);
          const dist = R * 0.9 + Math.sin(sparklePhase * 2) * R * 0.3;
          const sparkAngle = sparklePhase + i * (Math.PI * 2 / sparkleCount);
          const sx = cx + Math.cos(sparkAngle) * dist;
          const sy = cy + Math.sin(sparkAngle) * dist;
          const sparkAlpha = 0.5 + Math.sin(sparklePhase * 3) * 0.4;
          const sparkSize = 1.5 + Math.sin(sparklePhase * 2) * 1;

          ctx.globalAlpha = Math.max(0, sparkAlpha);
          ctx.fillStyle = '#7dff6b';
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#39ff14';
          ctx.beginPath();
          ctx.arc(sx, sy, sparkSize, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
      // Profe - Spanish flag (red-yellow-red with animated patriotic glow)
      else if (activeSkin === 'icon_profe_spain') {
        const cx = this.x, cy = this.y, R = this.r;
        const t = time;

        // ── Base Spanish flag ──
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = '#c60b1e'; ctx.fillRect(cx-R, cy-R,     R*2, R*0.5);   // top red
        ctx.fillStyle = '#ffc400'; ctx.fillRect(cx-R, cy-R*0.5, R*2, R*1.0);   // gold
        ctx.fillStyle = '#c60b1e'; ctx.fillRect(cx-R, cy+R*0.5, R*2, R*0.5);   // bottom red

        // ── Coat of arms: shield ──
        const shX = cx - R*0.12, shY = cy + R*0.03;
        const shW = R*0.38, shH = R*0.46;
        // Shield quarters: left=red/white castle, right=yellow/red lion (simplified as color blocks)
        ctx.fillStyle = '#8b0000';
        ctx.beginPath();
        ctx.moveTo(shX - shW*0.5, shY - shH*0.5);
        ctx.lineTo(shX + shW*0.5, shY - shH*0.5);
        ctx.lineTo(shX + shW*0.5, shY + shH*0.25);
        ctx.quadraticCurveTo(shX, shY + shH*0.55, shX - shW*0.5, shY + shH*0.25);
        ctx.closePath();
        ctx.fill();
        // Dividing lines on shield for quarters
        ctx.strokeStyle = '#ffc400'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(shX, shY-shH*0.5); ctx.lineTo(shX, shY+shH*0.25); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(shX-shW*0.5, shY); ctx.lineTo(shX+shW*0.5, shY); ctx.stroke();
        // Castle top-left
        ctx.fillStyle = '#ffc400';
        ctx.fillRect(shX-shW*0.42, shY-shH*0.42, shW*0.16, shH*0.22);
        ctx.fillRect(shX-shW*0.42, shY-shH*0.22, shW*0.1,  shH*0.2);
        // Lion bottom-right (simplified crouching shape)
        ctx.fillStyle = '#c60b1e';
        ctx.beginPath();
        ctx.ellipse(shX+shW*0.22, shY+shH*0.1, shW*0.18, shH*0.14, 0, 0, Math.PI*2);
        ctx.fill();

        // ── Royal crown above shield ──
        const crX = shX, crY = shY - shH*0.55;
        ctx.fillStyle = '#ffc400';
        // Crown base arc
        ctx.beginPath();
        ctx.arc(crX, crY, R*0.14, Math.PI, 0, false);
        ctx.closePath();
        ctx.fill();
        // Three crown points
        for (let p = -1; p <= 1; p++) {
          const px = crX + p * R*0.1, py = crY - R*0.03;
          ctx.beginPath();
          ctx.moveTo(px - R*0.05, py);
          ctx.lineTo(px, py - R*(p===0?0.18:0.12));
          ctx.lineTo(px + R*0.05, py);
          ctx.closePath();
          ctx.fill();
        }
        // Crown jewels
        const jewels = [{x:-0.1,c:'#c60b1e'},{x:0,c:'#ffffff'},{x:0.1,c:'#c60b1e'}];
        jewels.forEach(j => {
          ctx.fillStyle = j.c;
          ctx.beginPath();
          ctx.arc(crX + j.x*R, crY - R*0.01, R*0.03, 0, Math.PI*2);
          ctx.fill();
        });

        ctx.restore();

        // ── Animated light rays (burst behind skin) ──
        const numRays = 12;
        for (let i = 0; i < numRays; i++) {
          const angle = (i / numRays) * Math.PI * 2 + t / 2000;
          const rayLen = R * (1.5 + Math.sin(t/400 + i) * 0.4);
          const alpha  = 0.12 + Math.sin(t/300 + i*0.7) * 0.07;
          const isGold = i % 2 === 0;
          ctx.strokeStyle = isGold ? `rgba(255,196,0,${alpha})` : `rgba(198,11,30,${alpha})`;
          ctx.lineWidth = R * 0.22;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * R * 0.85, cy + Math.sin(angle) * R * 0.85);
          ctx.lineTo(cx + Math.cos(angle) * (R + rayLen), cy + Math.sin(angle) * (R + rayLen));
          ctx.stroke();
        }

        // ── Orbiting gold spark particles ──
        for (let i = 0; i < 8; i++) {
          const phase   = (t / 700 + i * 0.785) % (Math.PI * 2);
          const orbitR  = R + 5 + Math.sin(t/300 + i*1.3) * 4;
          const px      = cx + Math.cos(phase) * orbitR;
          const py      = cy + Math.sin(phase) * orbitR;
          const pAlpha  = 0.5 + Math.sin(t/200 + i*2) * 0.4;
          const pSize   = 1.5 + Math.sin(t/250 + i) * 0.8;
          ctx.globalAlpha = Math.max(0, pAlpha);
          ctx.fillStyle   = i % 3 === 0 ? '#ffffff' : '#ffc400';
          ctx.shadowBlur  = 10;
          ctx.shadowColor = '#ffc400';
          ctx.beginPath();
          ctx.arc(px, py, pSize, 0, Math.PI*2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur  = 0;

        // ── Dual pulsing glow: alternates red ↔ gold ──
        const glowPhase = (Math.sin(t / 500) + 1) / 2;
        const glowR = Math.floor(198 + 57 * glowPhase);
        const glowG = Math.floor(11  + 185 * glowPhase);
        const glowB = Math.floor(30  * (1 - glowPhase));
        ctx.shadowBlur  = 22 + Math.sin(t/350) * 8;
        ctx.shadowColor = `rgb(${glowR},${glowG},${glowB})`;
        ctx.strokeStyle = `rgba(${glowR},${glowG},${glowB},0.8)`;
        ctx.lineWidth   = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, R + 0.5, 0, Math.PI*2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      // Kayden - Duck Camo (hunting camo: tan base + olive/brown/dark blobs + reed silhouettes)
      else if (activeSkin === 'icon_kayden_duck') {
        const cx = this.x, cy = this.y, R = this.r;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.clip();

        // Base tan/khaki fill
        ctx.fillStyle = '#c4a265';
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

        // Duck camo blobs — seeded positions so they're consistent every frame
        // Colors: dark olive, medium brown, dark brown, light tan
        const camoLayers = [
          { color: '#5a6b2a', blobs: [{x:-0.4,y:-0.5,rx:0.55,ry:0.38},{x:0.3,y:0.1,rx:0.48,ry:0.35},{x:-0.1,y:0.55,rx:0.6,ry:0.3},{x:0.55,y:-0.4,rx:0.35,ry:0.45}] },
          { color: '#3d2b0e', blobs: [{x:0.1,y:-0.3,rx:0.32,ry:0.42},{x:-0.5,y:0.3,rx:0.38,ry:0.28},{x:0.45,y:0.5,rx:0.4,ry:0.32},{x:-0.2,y:0.1,rx:0.28,ry:0.35}] },
          { color: '#7a5c28', blobs: [{x:-0.15,y:-0.65,rx:0.45,ry:0.28},{x:0.55,y:0.2,rx:0.3,ry:0.45},{x:-0.55,y:-0.1,rx:0.28,ry:0.4},{x:0.1,y:0.65,rx:0.42,ry:0.25}] },
          { color: '#4a5c1e', blobs: [{x:0.35,y:-0.6,rx:0.3,ry:0.35},{x:-0.3,y:0.6,rx:0.35,ry:0.28},{x:0.65,y:-0.1,rx:0.22,ry:0.38}] },
        ];

        for (const layer of camoLayers) {
          ctx.fillStyle = layer.color;
          for (const b of layer.blobs) {
            ctx.beginPath();
            ctx.ellipse(cx + b.x*R, cy + b.y*R, b.rx*R, b.ry*R, b.x*0.8, 0, Math.PI*2);
            ctx.fill();
          }
        }

        // Reed/cattail silhouettes — thin vertical dark lines with bulb tops
        ctx.fillStyle = '#2a1a08';
        const reeds = [{x:-0.55,h:1.4},{x:-0.3,h:1.6},{x:0.15,h:1.5},{x:0.45,h:1.35},{x:0.68,h:1.55}];
        for (const rd of reeds) {
          const rx = cx + rd.x*R;
          // Stem
          ctx.fillRect(rx - R*0.025, cy + R*0.2, R*0.05, R*rd.h*0.7);
          // Cattail bulb
          ctx.beginPath();
          ctx.ellipse(rx, cy + R*0.1, R*0.055, R*0.18, 0, 0, Math.PI*2);
          ctx.fill();
        }

        ctx.restore();

        // Subtle earthy glow — very muted, matches the camo feel
        ctx.shadowBlur  = 10;
        ctx.shadowColor = 'rgba(90, 70, 20, 0.6)';
        ctx.strokeStyle = 'rgba(61, 43, 14, 0.5)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI*2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      // Troy - Hockey Puck (black rubber disc with 3D edge and ice effects)
      else if (activeSkin === 'icon_troy_puck') {
        // Black puck body with subtle radial shading for 3D depth
        const puckGrad = ctx.createRadialGradient(
          this.x - this.r * 0.25, this.y - this.r * 0.25, 0,
          this.x, this.y, this.r
        );
        puckGrad.addColorStop(0,   '#3a3a3a');
        puckGrad.addColorStop(0.5, '#1a1a1a');
        puckGrad.addColorStop(1,   '#050505');

        ctx.fillStyle = puckGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();

        // Edge highlight ring — top-left lighter (light source)
        const edgeGrad = ctx.createLinearGradient(
          this.x - this.r, this.y - this.r,
          this.x + this.r, this.y + this.r
        );
        edgeGrad.addColorStop(0,   'rgba(180,180,180,0.55)');
        edgeGrad.addColorStop(0.5, 'rgba(80,80,80,0.2)');
        edgeGrad.addColorStop(1,   'rgba(10,10,10,0.4)');
        ctx.strokeStyle = edgeGrad;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r - 1, 0, Math.PI * 2);
        ctx.stroke();

        // Inner rubber texture rings
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r * 0.65, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r * 0.35, 0, Math.PI * 2);
        ctx.stroke();

        // Animated ice-chip sparks flying off
        for (let i = 0; i < 5; i++) {
          const sparkPhase = (time / 500 + i * 1.256) % (Math.PI * 2);
          const dist = this.r + 4 + Math.sin(sparkPhase * 2) * 5;
          const angle = sparkPhase + i * (Math.PI * 2 / 5);
          const px = this.x + Math.cos(angle) * dist;
          const py = this.y + Math.sin(angle) * dist;
          const alpha = 0.4 + Math.sin(sparkPhase * 3) * 0.35;
          ctx.globalAlpha = Math.max(0, alpha);
          ctx.fillStyle = '#c8e8ff';
          ctx.shadowBlur = 5;
          ctx.shadowColor = '#c8e8ff';
          ctx.beginPath();
          ctx.arc(px, py, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
      // the creator skin — solar system theme
      else if (activeSkin === 'icon_the_creator') {
        const t = time / 1000;
        const milestoneScale = getCreatorMilestoneScale();
        // milestone flare burst particles
        if (milestoneScale > 1.05 && Math.random() < 0.4) {
          const fa = Math.random() * Math.PI * 2;
          particles.push(new Particle(this.x, this.y, fa, 60 + Math.random() * 40, '#ffcc44', 0.3));
        }

        // planet definitions: orbital radius, size, speed, color, optional ring
        const creatorPlanets = [
          { orbit: this.r + 22, size: 3.2, speed: 0.7, color: '#5a4a3a', ring: false },
          { orbit: this.r + 34, size: 4.0, speed: 0.45, color: '#d4a84b', ring: true, ringColor: '#c8a050' },
          { orbit: this.r + 44, size: 3.5, speed: 0.55, color: '#4a9eff', ring: false, glow: true },
          { orbit: this.r + 54, size: 2.8, speed: 0.35, color: '#cc5533', ring: false },
        ];

        // subtle orbit trail lines
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = '#ffcc66';
        ctx.lineWidth = 0.8;
        for (let i = 0; i < creatorPlanets.length; i++) {
          ctx.beginPath();
          ctx.arc(this.x, this.y, creatorPlanets[i].orbit, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // orbiting planets
        const isMoving = (keys['w'] || keys['arrowup'] || keys['s'] || keys['arrowdown'] ||
                          keys['a'] || keys['arrowleft'] || keys['d'] || keys['arrowright']);
        const orbitSpeedMult = isMoving ? 1.35 : 1.0;

        for (let i = 0; i < creatorPlanets.length; i++) {
          const p = creatorPlanets[i];
          const angle = t * p.speed * orbitSpeedMult + i * 1.57;
          const wobble = Math.sin(t * 1.5 + i * 2.1) * 2;
          const px = this.x + Math.cos(angle) * (p.orbit + wobble);
          const py = this.y + Math.sin(angle) * (p.orbit + wobble);

          // planet glow for the blue one
          if (p.glow) {
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#4a9eff';
          } else {
            ctx.shadowBlur = 4;
            ctx.shadowColor = p.color;
          }

          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();

          // saturn ring
          if (p.ring) {
            ctx.strokeStyle = p.ringColor;
            ctx.lineWidth = 1.2;
            ctx.shadowBlur = 3;
            ctx.shadowColor = p.ringColor;
            ctx.beginPath();
            ctx.ellipse(px, py, p.size + 4, p.size * 0.35, angle * 0.3, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // outer corona glow — soft warm ambient
        const pulseGlow = 0.12 + Math.sin(t * 1.8) * 0.04;
        const coronaGrad = ctx.createRadialGradient(this.x, this.y, this.r * 0.9, this.x, this.y, this.r + 14);
        coronaGrad.addColorStop(0, `rgba(255, 140, 30, ${pulseGlow + 0.08})`);
        coronaGrad.addColorStop(0.6, `rgba(255, 80, 20, ${pulseGlow})`);
        coronaGrad.addColorStop(1, 'rgba(200, 40, 10, 0)');
        ctx.fillStyle = coronaGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 14, 0, Math.PI * 2);
        ctx.fill();

        // soft flame flickers around edge
        ctx.globalAlpha = 0.35;
        for (let f = 0; f < 6; f++) {
          const fAngle = t * 0.9 + f * 1.047;
          const flickerLen = 3 + Math.sin(t * 3.5 + f * 1.7) * 2.5;
          const fx = this.x + Math.cos(fAngle) * (this.r + 1);
          const fy = this.y + Math.sin(fAngle) * (this.r + 1);
          const fex = this.x + Math.cos(fAngle) * (this.r + flickerLen + 4);
          const fey = this.y + Math.sin(fAngle) * (this.r + flickerLen + 4);

          const flGrad = ctx.createLinearGradient(fx, fy, fex, fey);
          flGrad.addColorStop(0, 'rgba(255, 200, 60, 0.6)');
          flGrad.addColorStop(1, 'rgba(255, 80, 20, 0)');
          ctx.strokeStyle = flGrad;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(fex, fey);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // sun body — layered gradient (scales with milestone)
        const drawR = this.r * milestoneScale;
        const sunGrad = ctx.createRadialGradient(
          this.x - drawR * 0.2, this.y - drawR * 0.2, 0,
          this.x, this.y, drawR
        );
        sunGrad.addColorStop(0, '#ffffff');
        sunGrad.addColorStop(0.25, '#fffbe6');
        sunGrad.addColorStop(0.5, '#ffcc33');
        sunGrad.addColorStop(0.75, '#ff8c1a');
        sunGrad.addColorStop(1, '#cc4400');
        ctx.fillStyle = sunGrad;
        ctx.shadowBlur = 28;
        ctx.shadowColor = '#ff9933';
        ctx.beginPath();
        ctx.arc(this.x, this.y, drawR, 0, Math.PI * 2);
        ctx.fill();

        // animated solar surface texture
        ctx.globalAlpha = 0.15;
        for (let s = 0; s < 4; s++) {
          const sAngle = t * 0.6 + s * 1.57;
          const sx = this.x + Math.cos(sAngle) * this.r * 0.35;
          const sy = this.y + Math.sin(sAngle) * this.r * 0.35;
          const sRad = this.r * (0.25 + Math.sin(t * 2 + s) * 0.08);
          const sGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sRad);
          sGrad.addColorStop(0, 'rgba(255, 240, 200, 0.5)');
          sGrad.addColorStop(1, 'rgba(255, 180, 60, 0)');
          ctx.fillStyle = sGrad;
          ctx.beginPath();
          ctx.arc(sx, sy, sRad, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // slow pulsing glow ring
        const glowPulse = 0.18 + Math.sin(t * 1.2) * 0.07;
        ctx.strokeStyle = `rgba(255, 180, 50, ${glowPulse})`;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#ffaa33';
        const glowR = this.r + 4 + Math.sin(t * 1.2) * 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowR, 0, Math.PI * 2);
        ctx.stroke();

        // bright center highlight
        const coreGrad = ctx.createRadialGradient(
          this.x - this.r * 0.15, this.y - this.r * 0.15, 0,
          this.x, this.y, this.r * 0.35
        );
        coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        coreGrad.addColorStop(0.5, 'rgba(255, 250, 220, 0.4)');
        coreGrad.addColorStop(1, 'rgba(255, 220, 150, 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r * 0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
      }
 // Other icon skins - standard rendering with glow
      else {
        ctx.fillStyle = skinColor;
        ctx.shadowBlur = 20;
        ctx.shadowColor = skinColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        
 // Soft pulse ring
        const pr = this.r + 6 + Math.sin(time / 300) * 3;
        ctx.strokeStyle = skinColor;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(this.x, this.y, pr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }

    } else if (activeSkin && activeSkin.startsWith('bp1_')) {
      // battle pass season 1 skins – properly animated in-game
      const time = Date.now();

      if (activeSkin === 'bp1_striker') {
        const pulse = 0.85+Math.sin(time/220)*0.15, rot = time/380;
        const cg = ctx.createRadialGradient(this.x-this.r*0.3,this.y-this.r*0.3,0,this.x,this.y,this.r);
        cg.addColorStop(0,'#fff8e7'); cg.addColorStop(0.18,'#ffdd66'); cg.addColorStop(0.42,'#ffaa44'); cg.addColorStop(0.72,'#ff6b35'); cg.addColorStop(1,'#b83010');
        ctx.fillStyle=cg; ctx.shadowBlur=45*pulse; ctx.shadowColor='#ff6b35'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        const sg=ctx.createRadialGradient(this.x-this.r*0.38,this.y-this.r*0.38,0,this.x-this.r*0.25,this.y-this.r*0.25,this.r*0.55);
        sg.addColorStop(0,'rgba(255,255,255,0.65)'); sg.addColorStop(1,'rgba(255,255,255,0)'); ctx.shadowBlur=0; ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        for (let i=0;i<12;i++) { const fa=rot+i*(Math.PI*2/12),fd=this.r+10+Math.sin(time/110+i)*5,fx=this.x+Math.cos(fa)*fd,fy=this.y+Math.sin(fa)*fd,fsz=2.2+Math.sin(time/95+i*0.5)*1.6,ta=fa-Math.PI/14; ctx.fillStyle='rgba(255,160,60,0.45)'; ctx.shadowBlur=6; ctx.shadowColor='#ff7722'; ctx.beginPath(); ctx.arc(this.x+Math.cos(ta)*(fd-5),this.y+Math.sin(ta)*(fd-5),fsz*0.55,0,Math.PI*2); ctx.fill(); ctx.fillStyle=i%2===0?'#ffee55':'#ffbb44'; ctx.shadowBlur=18; ctx.shadowColor='#ff6b35'; ctx.beginPath(); ctx.arc(fx,fy,fsz,0,Math.PI*2); ctx.fill(); if(i%3===0){ctx.strokeStyle=`rgba(255,255,180,${0.45+Math.sin(time/75+i)*0.35})`; ctx.lineWidth=1.8; ctx.shadowBlur=14; ctx.shadowColor='#ffee55'; ctx.beginPath(); ctx.moveTo(this.x,this.y); ctx.lineTo(fx,fy); ctx.stroke();} }
        for (let ring=0;ring<3;ring++) { const rp=(time/550+ring*0.34)%1; ctx.strokeStyle=`rgba(255,165,70,${(1-rp)*0.85})`; ctx.lineWidth=3.5-ring*0.8; ctx.shadowBlur=22; ctx.shadowColor='#ff6b35'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r+5+rp*26,0,Math.PI*2); ctx.stroke(); }
        ctx.shadowBlur=0;

      } else if (activeSkin === 'bp1_guardian') {
        const sp=0.9+Math.sin(time/420)*0.1;
        const cg=ctx.createRadialGradient(this.x-this.r*0.28,this.y-this.r*0.28,0,this.x,this.y,this.r); cg.addColorStop(0,'#eaffff'); cg.addColorStop(0.22,'#b2f5f0'); cg.addColorStop(0.55,'#4ecdc4'); cg.addColorStop(1,'#1d8a83');
        ctx.fillStyle=cg; ctx.shadowBlur=38*sp; ctx.shadowColor='#4ecdc4'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        const sg=ctx.createRadialGradient(this.x-this.r*0.35,this.y-this.r*0.35,0,this.x-this.r*0.22,this.y-this.r*0.22,this.r*0.52); sg.addColorStop(0,'rgba(255,255,255,0.7)'); sg.addColorStop(1,'rgba(255,255,255,0)'); ctx.shadowBlur=0; ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        [{scale:0.93,speed:850,lw:3.2,op:1.0},{scale:0.62,speed:-1100,lw:2.4,op:0.8},{scale:0.32,speed:1300,lw:1.8,op:0.6}].forEach((hl,li)=>{
          ctx.strokeStyle=`rgba(126,232,224,${hl.op*sp})`; ctx.lineWidth=hl.lw; ctx.shadowBlur=20; ctx.shadowColor='#4ecdc4'; ctx.beginPath();
          for(let i=0;i<6;i++){const a=(time/hl.speed)+i*(Math.PI/3),hx=this.x+Math.cos(a)*this.r*hl.scale,hy=this.y+Math.sin(a)*this.r*hl.scale;i===0?ctx.moveTo(hx,hy):ctx.lineTo(hx,hy);}
          ctx.closePath(); ctx.stroke();
          for(let i=0;i<6;i++){const a=(time/hl.speed)+i*(Math.PI/3);ctx.fillStyle=li===0?'#eaffff':'#b2f5f0';ctx.shadowBlur=12;ctx.shadowColor='#7ee8e0';ctx.beginPath();ctx.arc(this.x+Math.cos(a)*this.r*hl.scale,this.y+Math.sin(a)*this.r*hl.scale,2.6-li*0.5,0,Math.PI*2);ctx.fill();}
          if(li===0)for(let i=0;i<3;i++){const a1=(time/hl.speed)+i*(Math.PI/3),a2=a1+Math.PI;ctx.strokeStyle=`rgba(175,245,241,${0.22*sp})`;ctx.lineWidth=1;ctx.shadowBlur=8;ctx.beginPath();ctx.moveTo(this.x+Math.cos(a1)*this.r*hl.scale,this.y+Math.sin(a1)*this.r*hl.scale);ctx.lineTo(this.x+Math.cos(a2)*this.r*hl.scale,this.y+Math.sin(a2)*this.r*hl.scale);ctx.stroke();}
        });
        for(let w=0;w<2;w++){const wp=(time/720+w*0.5)%1;ctx.strokeStyle=`rgba(126,232,224,${(1-wp)*0.65})`;ctx.lineWidth=3.5;ctx.shadowBlur=18;ctx.shadowColor='#4ecdc4';ctx.beginPath();ctx.arc(this.x,this.y,this.r+6+wp*22,0,Math.PI*2);ctx.stroke();}
        ctx.shadowBlur=0;

      } else if (activeSkin === 'bp1_phantom') {
        const ga=0.80+Math.sin(time/310)*0.17,wob=Math.sin(time/260)*4;
        const cg=ctx.createRadialGradient(this.x+wob*0.6,this.y+wob*0.4,0,this.x,this.y,this.r); cg.addColorStop(0,'#f4eaff'); cg.addColorStop(0.2,'#dbbff0'); cg.addColorStop(0.5,'#c39bd3'); cg.addColorStop(0.82,'#9b59b6'); cg.addColorStop(1,'#5b2c6f');
        ctx.globalAlpha=ga; ctx.fillStyle=cg; ctx.shadowBlur=48; ctx.shadowColor='#9b59b6'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha=ga*0.38; ctx.fillStyle='#c39bd3'; ctx.shadowBlur=35; ctx.beginPath(); ctx.arc(this.x,this.y,this.r+7,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
        const sg=ctx.createRadialGradient(this.x-this.r*0.32,this.y-this.r*0.32,0,this.x-this.r*0.2,this.y-this.r*0.2,this.r*0.5); sg.addColorStop(0,`rgba(255,255,255,${0.5*ga})`); sg.addColorStop(1,'rgba(255,255,255,0)'); ctx.fillStyle=sg; ctx.shadowBlur=0; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        for(let l=0;l<3;l++){const rp=(time/(660-l*90))+l*Math.PI*0.65;ctx.strokeStyle=`rgba(195,155,211,${(0.55-l*0.12)*ga})`;ctx.lineWidth=2.8-l*0.6;ctx.shadowBlur=14;ctx.shadowColor='#9b59b6';ctx.globalAlpha=ga;ctx.beginPath();ctx.arc(this.x,this.y,this.r+8+l*6,rp,rp+Math.PI*1.55);ctx.stroke();}
        for(let i=0;i<20;i++){const oa=(i/20)*Math.PI*2+time/430,od=this.r*0.52+Math.sin(time/190+i)*10,px=this.x+Math.cos(oa)*od,py=this.y+Math.sin(oa)*od,psz=2.4+Math.sin(time/115+i)*1.8,pop=(0.45+Math.sin(time/140+i*2)*0.42)*ga;for(let t=1;t<=3;t++){const ta=oa-t*0.14;ctx.fillStyle=`rgba(195,155,211,${pop*(1-t*0.28)})`;ctx.shadowBlur=5;ctx.shadowColor='#c39bd3';ctx.globalAlpha=ga;ctx.beginPath();ctx.arc(this.x+Math.cos(ta)*(od-t*3.5),this.y+Math.sin(ta)*(od-t*3.5),psz*(1-t*0.28),0,Math.PI*2);ctx.fill();}ctx.fillStyle=`rgba(223,195,244,${pop})`;ctx.shadowBlur=12;ctx.shadowColor='#dbbff0';ctx.globalAlpha=ga;ctx.beginPath();ctx.arc(px,py,psz,0,Math.PI*2);ctx.fill();}
        for(let i=0;i<5;i++){const wa=time/550+i*Math.PI*0.4,wd=this.r*0.28+Math.sin(time/190+i*1.6)*6;ctx.fillStyle=`rgba(245,235,255,${0.45*ga})`;ctx.shadowBlur=18;ctx.shadowColor='#dbbff0';ctx.globalAlpha=ga;ctx.beginPath();ctx.arc(this.x+Math.cos(wa)*wd,this.y+Math.sin(wa)*wd,3.2,0,Math.PI*2);ctx.fill();}
        ctx.globalAlpha=1; ctx.shadowBlur=0;

      } else if (activeSkin === 'bp1_tempest') {
        const si=0.9+Math.sin(time/270)*0.1,vs=time/290;
        const cg=ctx.createRadialGradient(this.x-this.r*0.25,this.y-this.r*0.25,0,this.x,this.y,this.r); cg.addColorStop(0,'#eaf7ff'); cg.addColorStop(0.2,'#b8e0f6'); cg.addColorStop(0.5,'#85c1e9'); cg.addColorStop(0.78,'#3498db'); cg.addColorStop(1,'#103d66');
        ctx.fillStyle=cg; ctx.shadowBlur=48*si; ctx.shadowColor='#3498db'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        const sg=ctx.createRadialGradient(this.x-this.r*0.36,this.y-this.r*0.36,0,this.x-this.r*0.23,this.y-this.r*0.23,this.r*0.54); sg.addColorStop(0,'rgba(255,255,255,0.68)'); sg.addColorStop(1,'rgba(255,255,255,0)'); ctx.shadowBlur=0; ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        for(let arm=0;arm<5;arm++){const ap2=(vs*(1+arm*0.18))+arm*Math.PI*0.4;ctx.strokeStyle=`rgba(133,193,233,${0.72-arm*0.1})`;ctx.lineWidth=3.2-arm*0.4;ctx.shadowBlur=14;ctx.shadowColor='#3498db';ctx.beginPath();ctx.arc(this.x,this.y,this.r+7+arm*7,ap2,ap2+Math.PI*1.3);ctx.stroke();}
        for(let i=0;i<22;i++){const da=vs*1.6+i*(Math.PI*2/22),dd=this.r*0.38+(i%5)*8+Math.sin(time/140+i)*6;ctx.fillStyle=`rgba(184,224,246,${0.55+Math.sin(time/115+i*0.7)*0.35})`;ctx.shadowBlur=8;ctx.shadowColor='#b8e0f6';ctx.beginPath();ctx.arc(this.x+Math.cos(da)*dd,this.y+Math.sin(da)*dd,1.6+Math.sin(time/95+i)*1.3,0,Math.PI*2);ctx.fill();}
        if(Math.floor(time/480)%3===0||Math.random()>0.94){[time/65,time/65+Math.PI*0.7,time/65+Math.PI*1.4].forEach(ba=>{const m1x=this.x+Math.cos(ba+0.22)*this.r*0.48,m1y=this.y+Math.sin(ba+0.22)*this.r*0.48,ex=this.x+Math.cos(ba-0.1)*this.r*0.92,ey=this.y+Math.sin(ba-0.1)*this.r*0.92;ctx.strokeStyle='rgba(255,255,255,0.92)';ctx.lineWidth=2.5;ctx.shadowBlur=30;ctx.shadowColor='#cce8ff';ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(m1x,m1y);ctx.lineTo(ex,ey);ctx.stroke();ctx.strokeStyle='rgba(133,193,233,0.45)';ctx.lineWidth=5;ctx.shadowBlur=16;ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(m1x,m1y);ctx.lineTo(ex,ey);ctx.stroke();});}
        for(let w=0;w<3;w++){const wp=(time/580+w*0.34)%1;ctx.strokeStyle=`rgba(52,152,219,${(1-wp)*0.75})`;ctx.lineWidth=4-w*0.7;ctx.shadowBlur=22;ctx.shadowColor='#3498db';ctx.beginPath();ctx.arc(this.x,this.y,this.r+9+wp*26,0,Math.PI*2);ctx.stroke();}
        ctx.shadowBlur=0;

      } else if (activeSkin === 'bp1_eclipse') {
        const ep=0.85+Math.sin(time/520)*0.15,os=time/1050;
        const cg=ctx.createRadialGradient(this.x-this.r*0.32,this.y-this.r*0.32,0,this.x,this.y,this.r); cg.addColorStop(0,'#9aafc4'); cg.addColorStop(0.22,'#6b7a8f'); cg.addColorStop(0.5,'#3a4a5c'); cg.addColorStop(0.78,'#1e2c3a'); cg.addColorStop(1,'#0d1520');
        ctx.fillStyle=cg; ctx.shadowBlur=30; ctx.shadowColor='#070f18'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(13,21,32,0.45)'; ctx.shadowBlur=22; ctx.shadowColor='#1e2c3a'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r+5,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
        const sg=ctx.createRadialGradient(this.x-this.r*0.38,this.y-this.r*0.38,0,this.x-this.r*0.25,this.y-this.r*0.25,this.r*0.5); sg.addColorStop(0,'rgba(200,215,235,0.45)'); sg.addColorStop(1,'rgba(200,215,235,0)'); ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(107,122,143,0.3)'; ctx.lineWidth=1; ctx.setLineDash([3,4]); ctx.beginPath(); ctx.arc(this.x,this.y,this.r+16,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
        const moonA=os,moonX=this.x+Math.cos(moonA)*(this.r+16),moonY=this.y+Math.sin(moonA)*(this.r+16);
        ctx.fillStyle='#eeeeff'; ctx.shadowBlur=16; ctx.shadowColor='#fff'; ctx.beginPath(); ctx.arc(moonX,moonY,6.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#1e2c3a'; ctx.shadowBlur=0; ctx.beginPath(); ctx.arc(moonX-3.2,moonY,5.6,0,Math.PI*2); ctx.fill();
        [[os*1.6,this.r+22],[os*-0.8+1.9,this.r+14]].forEach(([a,d],idx)=>{const tw=0.65+Math.sin(time/140+idx*3)*0.35;ctx.globalAlpha=tw;ctx.fillStyle='#ddeeff';ctx.shadowBlur=10*tw;ctx.shadowColor='#fff';ctx.beginPath();ctx.arc(this.x+Math.cos(a)*d,this.y+Math.sin(a)*d,2.4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});
        for(let ring=0;ring<3;ring++){const rp2=(time/1350)+ring*Math.PI*0.64;ctx.strokeStyle=`rgba(139,154,175,${(0.38-ring*0.09)*ep})`;ctx.lineWidth=2.5-ring*0.55;ctx.shadowBlur=14;ctx.shadowColor='#6b7a8f';ctx.beginPath();ctx.arc(this.x,this.y,this.r+6+ring*7,rp2,rp2+Math.PI*1.25);ctx.stroke();}
        ctx.strokeStyle=`rgba(185,200,220,${(0.42+Math.sin(time/560)*0.22)*ep})`; ctx.lineWidth=3.2; ctx.shadowBlur=28; ctx.shadowColor='#8b9aaf'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r+5,0,Math.PI*2); ctx.stroke();
        for(let i=0;i<8;i++){const va=(time/750)+i*(Math.PI*2/8),vd=this.r*0.48+Math.sin(time/290+i)*5;ctx.fillStyle='rgba(100,115,135,0.55)';ctx.shadowBlur=5;ctx.shadowColor='#3a4a5c';ctx.beginPath();ctx.arc(this.x+Math.cos(va)*vd,this.y+Math.sin(va)*vd,1.6,0,Math.PI*2);ctx.fill();}
        ctx.shadowBlur=0;

      } else if (activeSkin === 'bp1_sovereign') {
        const rp=0.9+Math.sin(time/310)*0.1,maj=time/390;
        const cg=ctx.createRadialGradient(this.x-this.r*0.28,this.y-this.r*0.35,0,this.x,this.y,this.r); cg.addColorStop(0,'#ffffff'); cg.addColorStop(0.12,'#fffacd'); cg.addColorStop(0.32,'#ffd700'); cg.addColorStop(0.65,'#f39c12'); cg.addColorStop(0.88,'#d4820a'); cg.addColorStop(1,'#8a5000');
        ctx.fillStyle=cg; ctx.shadowBlur=52*rp; ctx.shadowColor='#ffd700'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=`rgba(255,215,0,${0.22*rp})`; ctx.shadowBlur=32; ctx.shadowColor='#ffd700'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r+7,0,Math.PI*2); ctx.fill();
        const sg=ctx.createRadialGradient(this.x-this.r*0.38,this.y-this.r*0.38,0,this.x-this.r*0.24,this.y-this.r*0.24,this.r*0.55); sg.addColorStop(0,'rgba(255,255,255,0.72)'); sg.addColorStop(1,'rgba(255,255,255,0)'); ctx.shadowBlur=0; ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        const crownCy=this.y-this.r-4,crownW=this.r*1.4,crownFloat=Math.sin(time/230)*3;
        [{xf:-0.5,tall:true},{xf:-0.25,tall:false},{xf:0,tall:true},{xf:0.25,tall:false},{xf:0.5,tall:true}].forEach((sp2,si)=>{
          const sx=this.x+sp2.xf*crownW,sy=crownCy+crownFloat,tipH=sp2.tall?14:9,bW=sp2.tall?5.5:4;
          ctx.fillStyle=sp2.tall?'#ffd700':'#ffe97a'; ctx.shadowBlur=14; ctx.shadowColor='#f39c12'; ctx.beginPath(); ctx.moveTo(sx,sy-tipH); ctx.lineTo(sx-bW,sy); ctx.lineTo(sx+bW,sy); ctx.closePath(); ctx.fill();
          if(sp2.tall){ctx.fillStyle=['#ff4444','#44ff88','#4488ff','#ff88ff','#44ffff'][si];ctx.shadowBlur=18;ctx.shadowColor='#fff';ctx.beginPath();ctx.arc(sx,sy-tipH+1,2.8,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,255,255,0.75)';ctx.shadowBlur=6;ctx.beginPath();ctx.arc(sx-0.8,sy-tipH,1.2,0,Math.PI*2);ctx.fill();}
        });
        ctx.fillStyle='rgba(210,155,5,0.4)'; ctx.shadowBlur=0; ctx.fillRect(this.x-crownW*0.55,crownCy+crownFloat-3,crownW*1.1,7);
        for(let i=0;i<12;i++){const oa=maj+i*(Math.PI*2/12),od=this.r*0.62+Math.sin(time/175+i)*6;ctx.fillStyle=i%3===0?'#ffffff':'#fffacd';ctx.shadowBlur=11;ctx.shadowColor='#ffd700';ctx.beginPath();ctx.arc(this.x+Math.cos(oa)*od,this.y+Math.sin(oa)*od,2+Math.sin(time/145+i)*1.1,0,Math.PI*2);ctx.fill();}
        for(let i=0;i<6;i++){const ra=(time/580)+i*(Math.PI*2/6),rl=this.r+11+Math.sin(time/195+i)*5;ctx.strokeStyle='rgba(255,250,200,0.32)';ctx.lineWidth=2.2;ctx.shadowBlur=18;ctx.shadowColor='#ffd700';ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(this.x+Math.cos(ra)*rl,this.y+Math.sin(ra)*rl);ctx.stroke();}
        for(let w=0;w<3;w++){const wp=(time/480+w*0.34)%1;ctx.strokeStyle=`rgba(255,215,0,${(1-wp)*(0.88-w*0.18)})`;ctx.lineWidth=4.5-w*0.9;ctx.shadowBlur=28;ctx.shadowColor='#ffd700';ctx.beginPath();ctx.arc(this.x,this.y,this.r+9+wp*24,0,Math.PI*2);ctx.stroke();}
        ctx.shadowBlur=0;

      } else if (activeSkin === 'bp1_apex') {
        const ap=0.87+Math.sin(time/195)*0.13,hr=time/440,ri=1+Math.sin(time/175)*0.32;
        const cg=ctx.createRadialGradient(this.x-this.r*0.28,this.y-this.r*0.28,0,this.x,this.y,this.r*ap); cg.addColorStop(0,'#ffdddd'); cg.addColorStop(0.12,'#ff9999'); cg.addColorStop(0.3,'#ff6b6b'); cg.addColorStop(0.55,'#e74c3c'); cg.addColorStop(0.8,'#c0392b'); cg.addColorStop(1,'#3d0000');
        ctx.fillStyle=cg; ctx.shadowBlur=58*ap*ri; ctx.shadowColor='#e74c3c'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=`rgba(231,76,60,${0.30*ri})`; ctx.shadowBlur=42; ctx.shadowColor='#c0392b'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r+9,0,Math.PI*2); ctx.fill();
        const sg=ctx.createRadialGradient(this.x-this.r*0.35,this.y-this.r*0.35,0,this.x-this.r*0.22,this.y-this.r*0.22,this.r*0.52); sg.addColorStop(0,'rgba(255,255,255,0.6)'); sg.addColorStop(1,'rgba(255,255,255,0)'); ctx.shadowBlur=0; ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
        const eox=this.r*0.34,eoy=this.r*0.27,eglow=(22+Math.sin(time/115)*10)*ri;
        for(const side of [-1,1]){const ex=this.x+side*eox,ey=this.y-eoy;ctx.fillStyle='#ff0000';ctx.shadowBlur=eglow;ctx.shadowColor='#ff0000';ctx.beginPath();ctx.arc(ex,ey,5.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#5a0000';ctx.shadowBlur=0;ctx.beginPath();ctx.ellipse(ex,ey,1.6,3.8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff';ctx.shadowBlur=8;ctx.shadowColor='#fff';ctx.beginPath();ctx.arc(ex-1.2,ey-1.5,1.5,0,Math.PI*2);ctx.fill();ctx.strokeStyle=`rgba(255,0,0,${0.5*ri})`;ctx.lineWidth=3;ctx.shadowBlur=22;ctx.shadowColor='#ff0000';ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex+side*eox*2.2+Math.sin(time/95)*2,ey-eoy*4.2+Math.cos(time/95)*2);ctx.stroke();ctx.strokeStyle=`rgba(255,120,120,${0.25*ri})`;ctx.lineWidth=6;ctx.shadowBlur=16;ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex+side*eox*2.2+Math.sin(time/95)*2,ey-eoy*4.2+Math.cos(time/95)*2);ctx.stroke();}
        for(let layer=0;layer<2;layer++){const lspd=layer===0?1:-0.65,tcnt=layer===0?6:4;for(let i=0;i<tcnt;i++){const ta=(hr*lspd)+i*(Math.PI*2/tcnt),td=this.r+15+layer*9+Math.sin(time/195+i*1.5)*6;for(let t=1;t<=2;t++){const gta=ta-t*0.11*lspd,gtd=td-t*5;ctx.save();ctx.translate(this.x+Math.cos(gta)*gtd,this.y+Math.sin(gta)*gtd);ctx.rotate(gta+time/(240+layer*90));ctx.strokeStyle=`rgba(255,107,107,${(0.38-t*0.14)*ap})`;ctx.lineWidth=1.5;ctx.shadowBlur=8;ctx.shadowColor='#ff6b6b';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(-4,4);ctx.lineTo(4,4);ctx.closePath();ctx.stroke();ctx.restore();}ctx.save();ctx.translate(this.x+Math.cos(ta)*td,this.y+Math.sin(ta)*td);ctx.rotate(ta+time/(240+layer*90));ctx.fillStyle=layer===0?'#ff6b6b':'#e74c3c';ctx.shadowBlur=20;ctx.shadowColor='#e74c3c';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(-6,6);ctx.lineTo(6,6);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(255,200,200,0.5)';ctx.lineWidth=1.5;ctx.shadowBlur=6;ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(-6,6);ctx.lineTo(6,6);ctx.closePath();ctx.stroke();ctx.restore();}}
        for(let w=0;w<4;w++){const wp=(time/340+w*0.25)%1;ctx.strokeStyle=`rgba(231,76,60,${(1-wp)*0.95})`;ctx.lineWidth=5.5-w*0.9;ctx.shadowBlur=32;ctx.shadowColor='#e74c3c';ctx.beginPath();ctx.arc(this.x,this.y,this.r+11+wp*30,0,Math.PI*2);ctx.stroke();}
        for(let i=0;i<24;i++){const sp2=(time/480+i*(Math.PI*2/24))%(Math.PI*2),sd=this.r*0.32+(sp2/(Math.PI*2))*this.r*0.62,sa=sp2*4.2+time/290,pop=Math.max(0,1-sp2/(Math.PI*2)),psz=2.8*pop;if(psz<0.5)continue;ctx.fillStyle=`rgba(255,${100-Math.floor(pop*45)},${100-Math.floor(pop*45)},${pop})`;ctx.shadowBlur=12;ctx.shadowColor='#ff6b6b';ctx.beginPath();ctx.arc(this.x+Math.cos(sa)*sd,this.y+Math.sin(sa)*sd,psz,0,Math.PI*2);ctx.fill();}
        if(Math.floor(time/380)%3===0||Math.random()>0.93){for(let i=0;i<3;i++){const ba=(i*Math.PI*0.66)+time/58,m1x=this.x+Math.cos(ba+0.2)*this.r*0.5,m1y=this.y+Math.sin(ba+0.2)*this.r*0.5;ctx.strokeStyle='rgba(255,210,210,0.82)';ctx.lineWidth=2.8;ctx.shadowBlur=24;ctx.shadowColor='#ff6b6b';ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(m1x,m1y);ctx.lineTo(this.x+Math.cos(ba-0.1)*this.r*0.9,this.y+Math.sin(ba-0.1)*this.r*0.9);ctx.stroke();}}
        ctx.shadowBlur=0;
      }

    } else if (activeSkin === 'transcendence') {
      // Achievement master skin — every color, maximum visual impact
      const time = Date.now();
      const t = time;

      // 1. Radiating full-spectrum light beams
      const beamCount = 18;
      ctx.globalAlpha = 0.32;
      for (let beam = 0; beam < beamCount; beam++) {
        const beamAngle = (t / 28 + beam * (Math.PI * 2 / beamCount));
        const beamLen = this.r + 58 + Math.sin(t / 55 + beam * 1.4) * 16;
        const beamHue = (t / 4 + beam * (360 / beamCount)) % 360;
        const grad = ctx.createLinearGradient(
          this.x, this.y,
          this.x + Math.cos(beamAngle) * beamLen,
          this.y + Math.sin(beamAngle) * beamLen
        );
        const bAlpha = 0.75 + Math.sin(t / 40 + beam) * 0.25;
        grad.addColorStop(0, `hsla(${beamHue},100%,82%,${bAlpha})`);
        grad.addColorStop(0.55, `hsla(${beamHue},100%,68%,${bAlpha * 0.45})`);
        grad.addColorStop(1, `hsla(${beamHue},100%,55%,0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 12;
        ctx.shadowColor = `hsl(${beamHue},100%,72%)`;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(beamAngle) * beamLen, this.y + Math.sin(beamAngle) * beamLen);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 2. Three counter-rotating polygon rings
      const polyDefs = [
        { sides: 8, radius: this.r + 15, speed: t / 22000, dir:  1, lw: 2.2 },
        { sides: 6, radius: this.r + 28, speed: t / 30000, dir: -1, lw: 1.9 },
        { sides: 5, radius: this.r + 40, speed: t / 18000, dir:  1, lw: 1.5 },
      ];
      for (let pi = 0; pi < polyDefs.length; pi++) {
        const pd = polyDefs[pi];
        const ringHue = (t / 5 + pi * 120) % 360;
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = `hsl(${ringHue},100%,74%)`;
        ctx.lineWidth = pd.lw;
        ctx.shadowBlur = 16;
        ctx.shadowColor = `hsl(${ringHue},100%,68%)`;
        ctx.beginPath();
        for (let s = 0; s <= pd.sides; s++) {
          const angle = pd.dir * pd.speed * Math.PI * 2 + s * (Math.PI * 2 / pd.sides);
          const px = this.x + Math.cos(angle) * pd.radius;
          const py = this.y + Math.sin(angle) * pd.radius;
          if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // 3. Two orbiting rings of prismatic orbs
      const orbRings = [
        { count: 6,  radius: this.r + 20, speed: t / 38000, sizeBase: 4.5, hueOff:  0 },
        { count: 9,  radius: this.r + 38, speed: -t / 55000, sizeBase: 3.0, hueOff: 60 },
      ];
      for (let ri = 0; ri < orbRings.length; ri++) {
        const ring = orbRings[ri];
        for (let i = 0; i < ring.count; i++) {
          const orbAngle = ring.speed * Math.PI * 2 + i * (Math.PI * 2 / ring.count);
          const orbHue = (t / 3 + ring.hueOff + i * (360 / ring.count)) % 360;
          const ox = this.x + Math.cos(orbAngle) * ring.radius;
          const oy = this.y + Math.sin(orbAngle) * ring.radius;
          const sz = ring.sizeBase + Math.sin(t / 50 + i * 2.3) * 1.5;
          // outer glow
          ctx.globalAlpha = 0.42;
          ctx.fillStyle = `hsl(${orbHue},100%,55%)`;
          ctx.shadowBlur = 18;
          ctx.shadowColor = `hsl(${orbHue},100%,65%)`;
          ctx.beginPath(); ctx.arc(ox, oy, sz + 4, 0, Math.PI * 2); ctx.fill();
          // core
          ctx.globalAlpha = 1;
          ctx.fillStyle = `hsl(${orbHue},100%,80%)`;
          ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(ox, oy, sz, 0, Math.PI * 2); ctx.fill();
          // white center
          ctx.fillStyle = '#fff';
          ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.arc(ox, oy, sz * 0.3, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // 4. Pulsing rainbow aura
      const auraR = this.r + 9 + Math.sin(t / 60) * 5;
      const auraHue = (t / 3.5) % 360;
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = `hsl(${auraHue},100%,65%)`;
      ctx.shadowBlur = 38;
      ctx.shadowColor = `hsl(${auraHue},100%,68%)`;
      ctx.beginPath(); ctx.arc(this.x, this.y, auraR, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      // 5. Main core — fast full-spectrum cycling
      ctx.fillStyle = skinColor;
      ctx.shadowBlur = 36;
      ctx.shadowColor = skinColor;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();

      // 6. Inner bright layer
      const innerHue = (t / 2 + 90) % 360;
      ctx.fillStyle = `hsl(${innerHue},100%,90%)`;
      ctx.shadowBlur = 26;
      ctx.shadowColor = `hsl(${innerHue},100%,80%)`;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.58, 0, Math.PI * 2); ctx.fill();

      // 7. White center flash
      ctx.fillStyle = `rgba(255,255,255,${0.88 + Math.sin(t / 85) * 0.12})`;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ffffff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.26, 0, Math.PI * 2); ctx.fill();

      ctx.shadowBlur = 0;

    } else {
      // default skins - battle pass & standard skins
 // Simple circle with skin color and glow
      ctx.fillStyle = skinColor;
      ctx.shadowBlur = 20;
      ctx.shadowColor = skinColor;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

 // Aim indicator
    ctx.strokeStyle = skinColor;
    ctx.lineWidth = 2;
    const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
    const tipX = this.x + Math.cos(angle) * this.r;
    const tipY = this.y + Math.sin(angle) * this.r;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + Math.cos(angle) * 10, tipY + Math.sin(angle) * 10);
    ctx.stroke();

 // HP bar
    const barWidth = 45;
    const barHeight = 5;
    const barX = this.x - barWidth / 2;
    const barY = this.y - this.r - 15;
    
    ctx.fillStyle = 'rgba(255, 71, 87, 0.5)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    const hpPercent = this.hp / this.maxHp;
    const hpColor = hpPercent > 0.5 ? '#6bff7b' : hpPercent > 0.25 ? '#ffd93d' : '#ff4757';
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
  }

  takeDamage(amount) {
    if (this.dashDuration > 0) return; // Invulnerable during dash
    
    if (this.shield > 0) {
      this.shield = 0;
      playSound(400, 0.2, 'sine');
      return;
    }
    
    this.hp -= amount;
    if (typeof achOnDamageTaken === 'function') achOnDamageTaken();
if (gameSettings.screenShake) screenShakeAmt = 0.5;
    sounds.damage();
    
    for (let i = 0; i < 25; i++) {
      particles.push(acquireParticle(
        this.x, this.y,
        Math.random() * 360,
        Math.random() * 120 + 60,
        '#ff4757',
        0.6
      ));
    }
  }
}

/* =======================
   BULLETS
======================= */

class Bullet {
  constructor(x, y, vx, vy) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = 5;
    this.life = 1;
  }
}

/* =======================
   ENEMIES
======================= */

class Enemy {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type || 'normal';
    this.hp = 1;
    this.maxHp = 1;
    
    if (this.type === 'fast') {
      this.r = 10;
      this.speed = 228; // Increased from 190
      this.color = '#ff9ff3';
      this.hp = 1;
      this.maxHp = 1;
      this.score = 15;
      this.coinValue = 2;
    } else if (this.type === 'tank') {
      this.r = 20;
      this.speed = 78; // Increased from 65
      this.color = '#ff6b6b';
      this.hp = 3;
      this.maxHp = 3;
      this.score = 30;
      this.coinValue = 6;
    } else if (this.type === 'shooter') {
      this.r = 12;
      this.speed = 102; // Increased from 85
      this.color = '#ffd93d';
      this.hp = 2;
      this.maxHp = 2;
      this.score = 25;
      this.shootCooldown = 0;
      this.coinValue = 5;
    } else if (this.type === 'miniboss') {
      this.r = 25;
      this.speed = 60; // Increased from 50
      this.color = '#b86bff';
      this.hp = 8;
      this.maxHp = 8;
      this.score = 100;
      this.shootCooldown = 0;
      this.coinValue = 20;
    } else if (this.type === 'enforcer') {
 // Elite enemy that spawns after wave 15
      this.r = 16;
      this.speed = 95;
      this.color = '#6bcfff';
      this.hp = 4;
      this.maxHp = 4;
      this.score = 45;
      this.coinValue = 10;
      this.dashCooldown = 0;
      this.dashTimer = 0;
      this.isDashing = false;
      this.dashChargeTime = 0;
      this.normalSpeed = 95;
      this.dashSpeed = 280;
    } else {
      this.r = 14;
      this.speed = 126; // Increased from 105
      this.color = '#ff7b6b';
      this.hp = 1;
      this.maxHp = 1;
      this.score = 10;
      this.coinValue = 2;
    }

 // Track whether enemy has entered visible screen (prevents off-screen damage)
    this.hasEnteredScreen = false;
  }

  update(dt) {
    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    
 // Enforcer dash behavior
    if (this.type === 'enforcer') {
      this.dashCooldown -= dt;
      
 // Charge phase - visual warning before dash
      if (this.dashChargeTime > 0) {
        this.dashChargeTime -= dt;
        if (this.dashChargeTime <= 0) {
          this.isDashing = true;
          this.dashTimer = 0.4; // 0.4 second dash duration
        }
      }
      
 // Execute dash
      if (this.isDashing) {
        this.dashTimer -= dt;
        if (this.dashTimer <= 0) {
          this.isDashing = false;
          this.speed = this.normalSpeed;
          this.dashCooldown = 3.5; // 3.5 seconds between dashes
        } else {
          this.speed = this.dashSpeed;
          
 // Create dash trail particles
          if (gameSettings.particles && Math.random() < 0.6) {
            particles.push(acquireParticle(
              this.x, this.y,
              Math.random() * Math.PI * 2,
              Math.random() * 80 + 40,
              '#6bcfff',
              0.3
            ));
          }
        }
      }
      
 // Trigger dash charge
      if (!this.isDashing && this.dashChargeTime <= 0 && this.dashCooldown <= 0) {
        const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
 // Only dash if within reasonable range (not too close, not too far)
        if (distToPlayer > 100 && distToPlayer < 400) {
          this.dashChargeTime = 0.35; // 0.35 second telegraph
          this.speed = this.normalSpeed * 0.5; // Slow down during charge
        } else {
          this.dashCooldown = 0.5; // Check again soon if not in range
        }
      }
    }
    
    this.x += Math.cos(angle) * this.speed * dt;
    this.y += Math.sin(angle) * this.speed * dt;

 // Check if enemy has entered visible screen bounds
    if (!this.hasEnteredScreen) {
      const margin = 30; // Same as loot clamp padding
      if (this.x >= margin && this.x <= canvas.width - margin &&
          this.y >= margin && this.y <= canvas.height - margin) {
        this.hasEnteredScreen = true;
      }
    }
    
    if (this.type === 'shooter' || this.type === 'miniboss') {
      this.shootCooldown -= dt;
      if (this.shootCooldown <= 0) {
        this.shootCooldown = this.type === 'miniboss' ? 1.5 : 2.5;
        this.shootAtPlayer();
      }
    }
  }

  shootAtPlayer() {
    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    const speed = 320;
    
    if (this.type === 'miniboss') {
 // Mini-boss shoots 3 bullets in spread
      for (let i = -1; i <= 1; i++) {
        enemyBullets.push({
          x: this.x,
          y: this.y,
          vx: Math.cos(angle + i * 0.2) * speed,
          vy: Math.sin(angle + i * 0.2) * speed,
          r: 6
        });
      }
    } else {
      enemyBullets.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 5
      });
    }
    playSound(400, 0.1, 'square');
  }

  draw() {
 // Glow for miniboss
    if (this.type === 'miniboss') {
      setShadow(15, this.color);
    }
    
 // Glow and pulsing effect for enforcer during charge/dash
    if (this.type === 'enforcer') {
      if (this.dashChargeTime > 0) {
 // Charging - red pulsing glow (warning)
        const pulseIntensity = 10 + Math.sin(Date.now() * 0.015) * 8;
        setShadow(pulseIntensity, '#ff4444');
      } else if (this.isDashing) {
 // Dashing - bright cyan trail
        setShadow(20, '#6bcfff');
      } else {
 // Normal - subtle glow
        setShadow(5, this.color);
      }
    }

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    resetShadow();
    
 // HP bar for tanks, enforcers, and minibosses
    if (this.type === 'tank' || this.type === 'miniboss' || this.type === 'enforcer') {
      const barWidth = this.r * 2;
      const barHeight = 4;
      const barX = this.x - barWidth / 2;
      const barY = this.y - this.r - 10;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      const hpPercent = this.hp / this.maxHp;
      ctx.fillStyle = hpPercent > 0.5 ? '#ff4757' : '#ff9ff3';
      ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
    }
    
 // Shooter/miniboss indicator
    if (this.type === 'shooter' || this.type === 'miniboss') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.type === 'miniboss' ? '⚠' : '!', this.x, this.y);
    }
    
 // Enforcer indicator with charge warning
    if (this.type === 'enforcer') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (this.dashChargeTime > 0) {
        ctx.fillStyle = '#ff4444';
        ctx.fillText('⚡', this.x, this.y);
      } else {
        ctx.fillText('⬥', this.x, this.y);
      }
    }
  }
}

function spawnEnemy() {
  const side = Math.floor(Math.random() * 4);
  let x, y;
  
  if (side === 0) { x = Math.random() * canvas.width; y = -20; }
  else if (side === 1) { x = canvas.width + 20; y = Math.random() * canvas.height; }
  else if (side === 2) { x = Math.random() * canvas.width; y = canvas.height + 20; }
  else { x = -20; y = Math.random() * canvas.height; }
  
  let type = 'normal';
  const rand = Math.random();

  if (currentGameMode === 'ranked' && typeof rankedSpawnType === 'function') {
    // Tier-specific enemy pool with progression weighting
    type = rankedSpawnType(wave);
  } else if (wave >= 16) {
 // Wave 16+ includes enforcer enemy type
    if (rand < 0.03) type = 'miniboss';
    else if (rand < 0.11) type = 'enforcer';
    else if (rand < 0.28) type = 'shooter';
    else if (rand < 0.45) type = 'tank';
    else if (rand < 0.65) type = 'fast';
  } else {
 // Waves 1-15
    if (wave >= 3 && rand < 0.03) type = 'miniboss';
    else if (wave >= 3 && rand < 0.23) type = 'shooter';
    else if (wave >= 2 && rand < 0.43) type = 'tank';
    else if (rand < 0.63) type = 'fast';
  }

  const e = new Enemy(x, y, type);

  // Ranked: scale HP and speed by tier multipliers
  if (currentGameMode === 'ranked' && typeof getRankedConfig === 'function') {
    const rcfg = getRankedConfig();
    e.hp    = Math.ceil(e.hp    * rcfg.hpMult);
    e.maxHp = e.hp;
    e.speed = Math.round(e.speed * rcfg.speedMult);
    if (e.normalSpeed !== undefined) e.normalSpeed = Math.round(e.normalSpeed * rcfg.speedMult);
    if (e.dashSpeed   !== undefined) e.dashSpeed   = Math.round(e.dashSpeed   * rcfg.speedMult);
  }

  enemies.push(e);
  enemiesThisWave++;
}

function cullOffScreenEnemies() {
  const cullMargin = 100; // Pixels beyond screen edge before culling

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

 // Only cull if enemy has entered screen first (prevents culling during spawn)
    if (e.hasEnteredScreen) {
      if (e.x < -cullMargin || e.x > canvas.width + cullMargin ||
          e.y < -cullMargin || e.y > canvas.height + cullMargin) {
        enemies.splice(i, 1);
 // Don't count toward wave completion
      }
    }
  }
}

/* =======================
   BOSS ENEMY
======================= */

class Boss {
  constructor(x, y, wave) {
    this.x = x;
    this.y = y;
    this.r = 45;
    this.speed = 54; // Increased from 45
    this.hp = 60 + wave * 25;
    this.maxHp = this.hp;
    this.color = '#b86bff';
    this.shootCooldown = 0;
    this.movePattern = 0;
    this.moveTimer = 0;
    this.isBoss = true;
    this.wave = wave;
  }

  update(dt) {
    this.moveTimer += dt;
    
    if (this.moveTimer > 4) {
      this.moveTimer = 0;
      this.movePattern = (this.movePattern + 1) % 3;
    }
    
    if (this.movePattern === 0) {
      const angle = Math.atan2(player.y - this.y, player.x - this.x) + Math.PI / 2;
      this.x += Math.cos(angle) * this.speed * dt;
      this.y += Math.sin(angle) * this.speed * dt;
    } else if (this.movePattern === 1) {
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(angle) * this.speed * 0.6 * dt;
      this.y += Math.sin(angle) * this.speed * 0.6 * dt;
    } else {
      this.x += (Math.random() - 0.5) * this.speed * 1.2 * dt;
      this.y += (Math.random() - 0.5) * this.speed * 1.2 * dt;
    }
    
    this.x = Math.max(60, Math.min(canvas.width - 60, this.x));
    this.y = Math.max(60, Math.min(canvas.height - 60, this.y));
    
    this.shootCooldown -= dt;
    if (this.shootCooldown <= 0) {
      this.shootCooldown = 1.2;
      this.shootBurst();
    }
  }

  shootBurst() {
    const numShots = 8;
    for (let i = 0; i < numShots; i++) {
      const angle = (Math.PI * 2 / numShots) * i + Date.now() / 1000; // Rotating pattern
      const speed = 270;
      enemyBullets.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 7
      });
    }
    playSound(200, 0.2, 'square');
  }

  draw() {
    ctx.shadowBlur = 25;
    ctx.shadowColor = this.color;
    
 // Rotating outer rings
    const time = Date.now() / 1000;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 5;
    
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 15 + i * 10 + Math.sin(time * 2) * 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    
 // Boss body
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowBlur = 0;
    
 // Boss HP bar
    const barWidth = 120;
    const barHeight = 10;
    const barX = this.x - barWidth / 2;
    const barY = this.y - this.r - 25;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
    
    ctx.fillStyle = 'rgba(255, 71, 87, 0.6)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    ctx.fillStyle = this.color;
    ctx.fillRect(barX, barY, barWidth * (this.hp / this.maxHp), barHeight);
    
 // Boss text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('BOSS', this.x, this.y);
  }
}

/* =======================
   MEGA BOSS ENEMY (Every 10 Waves)
======================= */

class MegaBoss {
  constructor(x, y, wave) {
    this.x = x;
    this.y = y;
    this.r = 70; // Much bigger than regular boss
    this.speed = 42; // Increased from 35
    this.hp = 150 + wave * 45; // Way more HP
    this.maxHp = this.hp;
    this.color = '#ff3366'; // Red/pink color to distinguish from purple boss
    this.shootCooldown = 0;
    this.specialCooldown = 0;
    this.movePattern = 0;
    this.moveTimer = 0;
    this.isBoss = true;
    this.isMegaBoss = true;
    this.wave = wave;
    this.phase = 1; // Changes at 66% and 33% HP
  }

  update(dt) {
 // Update phase based on HP
    const hpPercent = this.hp / this.maxHp;
    if (hpPercent <= 0.33) this.phase = 3;
    else if (hpPercent <= 0.66) this.phase = 2;
    else this.phase = 1;
    
    this.moveTimer += dt;
    
    if (this.moveTimer > 3) {
      this.moveTimer = 0;
      this.movePattern = (this.movePattern + 1) % 4;
    }
    
 // Movement patterns
    if (this.movePattern === 0) {
 // Circle strafe
      const angle = Math.atan2(player.y - this.y, player.x - this.x) + Math.PI / 2;
      this.x += Math.cos(angle) * this.speed * dt;
      this.y += Math.sin(angle) * this.speed * dt;
    } else if (this.movePattern === 1) {
 // Chase player slowly
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(angle) * this.speed * 0.5 * dt;
      this.y += Math.sin(angle) * this.speed * 0.5 * dt;
    } else if (this.movePattern === 2) {
 // Dash towards player
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(angle) * this.speed * 1.8 * dt;
      this.y += Math.sin(angle) * this.speed * 1.8 * dt;
    } else {
 // Erratic movement
      this.x += (Math.random() - 0.5) * this.speed * 1.5 * dt;
      this.y += (Math.random() - 0.5) * this.speed * 1.5 * dt;
    }
    
    this.x = Math.max(80, Math.min(canvas.width - 80, this.x));
    this.y = Math.max(80, Math.min(canvas.height - 80, this.y));
    
 // Regular shooting pattern
    this.shootCooldown -= dt;
    if (this.shootCooldown <= 0) {
      this.shootCooldown = 0.8; // Faster than regular boss
      this.shootSpiral();
    }
    
 // Special attacks based on phase
    this.specialCooldown -= dt;
    if (this.specialCooldown <= 0) {
      if (this.phase === 1) {
        this.specialCooldown = 4;
        this.shootWave();
      } else if (this.phase === 2) {
        this.specialCooldown = 3.5;
        this.shootCross();
      } else {
        this.specialCooldown = 3;
        this.shootChaos();
      }
    }
  }

  shootSpiral() {
 // Rotating spiral pattern
    const numShots = 12;
    for (let i = 0; i < numShots; i++) {
      const angle = (Math.PI * 2 / numShots) * i + Date.now() / 800;
      const speed = 280;
      enemyBullets.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 8
      });
    }
    playSound(180, 0.25, 'square');
  }

  shootWave() {
 // Wide wave attack (Phase 1)
    const numShots = 16;
    const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
    for (let i = 0; i < numShots; i++) {
      const spread = (i - numShots / 2) * 0.15;
      const angle = angleToPlayer + spread;
      const speed = 250;
      enemyBullets.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 7
      });
    }
    playSound(200, 0.3, 'sawtooth');
    if (gameSettings.screenShake) screenShakeAmt = 0.5;
  }

  shootCross() {
 // Cross pattern + diagonals (Phase 2)
    const patterns = [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI / 4, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    for (const angle of patterns) {
      for (let j = 0; j < 3; j++) {
        setTimeout(() => {
          const speed = 300;
          enemyBullets.push({
            x: this.x,
            y: this.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 8
          });
        }, j * 100);
      }
    }
    playSound(220, 0.3, 'square');
    if (gameSettings.screenShake) screenShakeAmt = 0.6;
  }

  shootChaos() {
 // Rapid fire in all directions (Phase 3 - enraged)
    const numBursts = 5;
    for (let burst = 0; burst < numBursts; burst++) {
      setTimeout(() => {
        const numShots = 20;
        for (let i = 0; i < numShots; i++) {
          const angle = (Math.PI * 2 / numShots) * i + Math.random() * 0.3;
          const speed = 260 + Math.random() * 40;
          enemyBullets.push({
            x: this.x,
            y: this.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 6
          });
        }
        playSound(240, 0.15, 'square');
      }, burst * 150);
    }
    if (gameSettings.screenShake) screenShakeAmt = 0.8;
  }

  draw() {
    const time = Date.now() / 1000;
    
 // Pulsing glow based on phase
    const glowIntensity = this.phase === 3 ? 40 : this.phase === 2 ? 30 : 25;
    ctx.shadowBlur = glowIntensity;
    ctx.shadowColor = this.color;
    
 // Phase warning rings
    const numRings = this.phase;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 6;
    
    for (let i = 0; i < numRings; i++) {
      const offset = i * 15;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 20 + offset + Math.sin(time * 3 + i) * 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    
 // Core
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
    gradient.addColorStop(0, this.color);
    gradient.addColorStop(0.5, this.phase === 3 ? '#ff0033' : this.phase === 2 ? '#ff4466' : this.color);
    gradient.addColorStop(1, '#330011');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    
 // Inner rotating symbols
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const symbol = this.phase === 3 ? '☠' : this.phase === 2 ? '⚡' : '●';
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(time * 2);
    ctx.fillText(symbol, 0, 0);
    ctx.restore();
    
    ctx.shadowBlur = 0;
    
 // MEGA BOSS HP bar (wider and more prominent)
    const barWidth = 200;
    const barHeight = 14;
    const barX = this.x - barWidth / 2;
    const barY = this.y - this.r - 35;
    
 // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(barX - 3, barY - 3, barWidth + 6, barHeight + 6);
    
 // Empty bar
    ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
 // HP bar with phase coloring
    const hpPercent = this.hp / this.maxHp;
    const barColor = this.phase === 3 ? '#ff0033' : this.phase === 2 ? '#ff4466' : this.color;
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
    
 // Phase markers at 66% and 33%
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(barX + barWidth * 0.66, barY);
    ctx.lineTo(barX + barWidth * 0.66, barY + barHeight);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(barX + barWidth * 0.33, barY);
    ctx.lineTo(barX + barWidth * 0.33, barY + barHeight);
    ctx.stroke();
    
 // MEGA BOSS title
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.strokeText('⚔ MEGA BOSS ⚔', this.x, barY - 20);
    ctx.fillText('⚔ MEGA BOSS ⚔', this.x, barY - 20);
    
 // Phase indicator
    ctx.font = 'bold 10px Arial';
    ctx.fillStyle = '#ffd93d';
    const phaseText = `PHASE ${this.phase}`;
    ctx.strokeText(phaseText, this.x, barY + barHeight + 5);
    ctx.fillText(phaseText, this.x, barY + barHeight + 5);
  }
}

/* =======================
   ULTRA BOSS (Wave 20)
======================= */

class UltraBoss {
  constructor(x, y, wave) {
    this.x = x;
    this.y = y;
    this.r = 90;
    this.speed = 36; // Increased from 30
    this.hp = 270 + wave * 44;    // Final tuning: +6% on top of previous +3% for perfect challenge
    this.maxHp = this.hp;
    this.color = '#ffd700';
    this.coreColor = '#ffffff';
    this.isBoss = true;
    this.isMegaBoss = false;
    this.isUltraBoss = true;
    this.wave = wave;
    this.dead = false;             // Flag so setTimeout attacks stop firing after death

 // Shoot timers
    this.spiralCooldown  = 0;
    this.specialCooldown = 0;
    this.summonCooldown  = 4;

 // Movement
    this.moveTimer   = 0;
    this.movePattern = 0;
    this.dashTarget  = null;
    this.dashTimer   = 0;

 // Phase: 1–4
    this.phase = 1;
    this.lastPhase = 1;

 // Dual-spiral angle offset
    this.spiralAngle = 0;
  }

  get hpPct() { return this.hp / this.maxHp; }

  update(dt) {
 // Phase transitions at 75 / 50 / 25 % HP
    if      (this.hpPct <= 0.25) this.phase = 4;
    else if (this.hpPct <= 0.50) this.phase = 3;
    else if (this.hpPct <= 0.75) this.phase = 2;
    else                         this.phase = 1;

 // Flash screen on phase change
    if (this.phase !== this.lastPhase) {
      this.lastPhase = this.phase;
      if (gameSettings.screenShake) screenShakeAmt = 1.5;
      playSound(60 + this.phase * 20, 0.6, 'sawtooth');
    }

 // Movement — gets faster and more aggressive per phase
    this.moveTimer += dt;
    const movePeriod = Math.max(1.5, 3 - this.phase * 0.4);
    if (this.moveTimer > movePeriod) {
      this.moveTimer = 0;
      this.movePattern = (this.movePattern + 1) % (2 + this.phase);
    }

    const spd = this.speed * (1 + (this.phase - 1) * 0.25);
    if (this.dashTimer > 0) {
 // Active dash towards dashTarget
      this.dashTimer -= dt;
      if (this.dashTarget) {
        const ang = Math.atan2(this.dashTarget.y - this.y, this.dashTarget.x - this.x);
        this.x += Math.cos(ang) * spd * 3.5 * dt;
        this.y += Math.sin(ang) * spd * 3.5 * dt;
      }
    } else if (this.movePattern === 0) {
 // Orbit strafe
      const ang = Math.atan2(player.y - this.y, player.x - this.x) + Math.PI / 2;
      this.x += Math.cos(ang) * spd * dt;
      this.y += Math.sin(ang) * spd * dt;
    } else if (this.movePattern === 1) {
 // Slow approach
      const ang = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(ang) * spd * 0.5 * dt;
      this.y += Math.sin(ang) * spd * 0.5 * dt;
    } else if (this.movePattern === 2) {
 // Charge dash — pick target once
      if (!this.dashTarget) {
        this.dashTarget = { x: player.x, y: player.y };
        this.dashTimer = 0.5;
      }
    } else if (this.movePattern === 3) {
 // Erratic (phase 4 only effectively)
      this.x += (Math.random() - 0.5) * spd * 2 * dt;
      this.y += (Math.random() - 0.5) * spd * 2 * dt;
    }

    if (this.movePattern !== 2) this.dashTarget = null;

    this.x = Math.max(100, Math.min(canvas.width  - 100, this.x));
    this.y = Math.max(100, Math.min(canvas.height - 100, this.y));

    // dual counter-rotating spirals (constant)
    this.spiralCooldown -= dt;
    const spiralRate = Math.max(0.46, 0.92 - this.phase * 0.1); // Final tuning: +6% faster on top of previous
    if (this.spiralCooldown <= 0) {
      this.spiralCooldown = spiralRate;
      this.shootDualSpiral();
    }

    // phase special attacks
    this.specialCooldown -= dt;
    const specialRate = Math.max(1.9, 4.9 - this.phase * 0.6); // Final tuning: +6% faster overall
    if (this.specialCooldown <= 0) {
      this.specialCooldown = specialRate;
      if      (this.phase === 1) this.shootStarBurst();
      else if (this.phase === 2) this.shootRingWave();
      else if (this.phase === 3) this.shootCrossLaser();
      else                       this.shootDeathBlossom();
    }

    // minion summoning (phase 2+)
    if (this.phase >= 2) {
      this.summonCooldown -= dt;
      const summonRate = Math.max(6, 10 - this.phase * 1.5); // Was max(4, 8 - phase*1.5) — less frequent
      if (this.summonCooldown <= 0) {
        this.summonCooldown = summonRate;
        this.summonMinions();
      }
    }
  }

  // attack patterns

  shootDualSpiral() {
    this.spiralAngle += 0.35;
    const count = 7 + this.phase * 2;          // Was 10 + phase*2
    const speed = 210 + this.phase * 12;        // Was 265 + phase*15
    for (let i = 0; i < count; i++) {
      const a1 = this.spiralAngle + (Math.PI * 2 / count) * i;
      const a2 = -this.spiralAngle + (Math.PI * 2 / count) * i;
      for (const a of [a1, a2]) {
        enemyBullets.push({ x: this.x, y: this.y,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5 }); // Was r:7
      }
    }
    playSound(160, 0.15, 'square');
  }

  shootStarBurst() {
 // 5-pointed star of bullet lines aimed at player
    const base = Math.atan2(player.y - this.y, player.x - this.x);
    const points = 5;
    const bulletsPerPoint = 3;
    for (let p = 0; p < points; p++) {
      const a = base + (Math.PI * 2 / points) * p;
      for (let b = 0; b < bulletsPerPoint; b++) {
        const speed = 260 + b * 30;
        enemyBullets.push({ x: this.x, y: this.y,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 8 });
      }
    }
    if (gameSettings.screenShake) screenShakeAmt = 0.5;
    playSound(200, 0.3, 'sawtooth');
  }

  shootRingWave() {
 // Two expanding rings fired in quick succession
    for (let ring = 0; ring < 2; ring++) {
      setTimeout(() => {
        if (this.dead) return; // Don't fire after death
        const count = 14;                        // Was 20
        const speed = 180 + ring * 35;           // Was 230 + ring*40
        const offset = (Math.PI / count) * ring;
        for (let i = 0; i < count; i++) {
          const a = (Math.PI * 2 / count) * i + offset;
          enemyBullets.push({ x: this.x, y: this.y,
            vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 6 }); // Was r:7
        }
        playSound(180, 0.2, 'square');
      }, ring * 300);
    }
    if (gameSettings.screenShake) screenShakeAmt = 0.4;
  }

  shootCrossLaser() {
 // 6 directions (was 8), 4 bullets each (was 5)
    const dirs = Array.from({ length: 6 }, (_, i) => (Math.PI * 2 / 6) * i);
    dirs.forEach((a, idx) => {
      setTimeout(() => {
        if (this.dead) return; // Don't fire after death
        for (let j = 0; j < 4; j++) {
          const speed = 230 + j * 18;            // Was 280 + j*20
          enemyBullets.push({ x: this.x, y: this.y,
            vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 6 }); // Was r:8
        }
      }, idx * 80);
    });
    if (gameSettings.screenShake) screenShakeAmt = 0.5;
    playSound(220, 0.3, 'square');
  }

  shootDeathBlossom() {
 // Was: 6 bursts × 24 bullets at 290-340 speed = 144 bullets in 0.65s
 // Now: 3 bursts × 14 bullets at 220-260 speed = 42 bullets in 0.4s
    for (let burst = 0; burst < 3; burst++) {
      setTimeout(() => {
        if (this.dead) return; // Critical — stops bullets firing after boss is killed
        const count = 14;
        const speed = 220 + Math.random() * 40;   // Was 290 + random*50
        const offset = (Math.PI * 2 / 3) * burst + Math.random() * 0.3;
        for (let i = 0; i < count; i++) {
          const a = offset + (Math.PI * 2 / count) * i;
          enemyBullets.push({ x: this.x, y: this.y,
            vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5 }); // Was r:6
        }
        playSound(250, 0.1, 'square');
      }, burst * 200);                             // Was burst * 130
    }
    if (gameSettings.screenShake) screenShakeAmt = 0.7;
  }

  summonMinions() {
    const count = Math.max(1, this.phase - 1); // Was 1 + phase. Phase 4 = 3 minions instead of 5
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 / count) * i;
      const dist = this.r + 60;
      const mx = Math.max(20, Math.min(canvas.width  - 20, this.x + Math.cos(a) * dist));
      const my = Math.max(20, Math.min(canvas.height - 20, this.y + Math.sin(a) * dist));
      enemies.push(new Enemy(mx, my, i % 2 === 0 ? 'shooter' : 'fast'));
    }
    playSound(300, 0.3, 'sawtooth');
    if (gameSettings.screenShake) screenShakeAmt = 0.4;
  }

  // drawing

  draw() {
    const time = Date.now() / 1000;
    const hpPct = this.hpPct;

 // Phase colour palette
    const phaseColors = ['#ffd700', '#ff9900', '#ff4400', '#cc00ff'];
    const pColor = phaseColors[this.phase - 1];

 // Intense glow
    ctx.shadowBlur = 40 + this.phase * 8;
    ctx.shadowColor = pColor;

 // Outer rotating rings (more rings per phase)
    ctx.lineWidth = 5;
    for (let r = 0; r < this.phase + 1; r++) {
      const ringR = this.r + 22 + r * 18 + Math.sin(time * 2.5 + r) * 7;
      const alpha = 0.5 - r * 0.08;
      ctx.strokeStyle = `rgba(${r % 2 === 0 ? '255,215,0' : '255,255,255'},${alpha})`;
      ctx.beginPath();
 // Rings rotate in alternate directions
      ctx.arc(this.x, this.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }

 // Orbiting gold orbs
    const orbCount = 6 + this.phase * 2;
    for (let i = 0; i < orbCount; i++) {
      const dir  = i % 2 === 0 ? 1 : -1;
      const oA   = time * dir * (1 + this.phase * 0.3) + (Math.PI * 2 / orbCount) * i;
      const oDist = this.r + 14 + Math.sin(time * 3 + i) * 6;
      const ox   = this.x + Math.cos(oA) * oDist;
      const oy   = this.y + Math.sin(oA) * oDist;
      ctx.fillStyle = pColor;
      ctx.shadowBlur = 12;
      ctx.shadowColor = pColor;
      ctx.beginPath();
      ctx.arc(ox, oy, 5, 0, Math.PI * 2);
      ctx.fill();
    }

 // Core gradient body
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, pColor);
    grad.addColorStop(0.7, this.phase >= 3 ? '#440000' : '#1a0a00');
    grad.addColorStop(1, '#000000');

    ctx.shadowBlur = 50;
    ctx.shadowColor = pColor;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();

 // Spinning inner symbol
    const symbols = ['★', '⚡', '☠', '☢'];
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `bold 32px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(time * (1.5 + this.phase * 0.5));
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ffffff';
    ctx.fillText(symbols[this.phase - 1], 0, 0);
    ctx.restore();

    ctx.shadowBlur = 0;

    // hp bar
    const barW = 260;
    const barH = 16;
    const barX = this.x - barW / 2;
    const barY = this.y - this.r - 48;

    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(barX - 4, barY - 4, barW + 8, barH + 8);

    ctx.fillStyle = 'rgba(50,50,50,0.9)';
    ctx.fillRect(barX, barY, barW, barH);

 // HP gradient
    const hpGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    hpGrad.addColorStop(0, '#00ff88');
    hpGrad.addColorStop(0.4, '#ffd700');
    hpGrad.addColorStop(0.7, '#ff4400');
    hpGrad.addColorStop(1, '#cc00ff');
    ctx.fillStyle = hpGrad;
    ctx.fillRect(barX, barY, barW * hpPct, barH);

 // Phase markers at 75, 50, 25%
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    for (const marker of [0.75, 0.50, 0.25]) {
      ctx.beginPath();
      ctx.moveTo(barX + barW * marker, barY);
      ctx.lineTo(barX + barW * marker, barY + barH);
      ctx.stroke();
    }

 // Boss title
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 4;
    const title = '💀 OMEGA OVERLORD 💀';
    ctx.strokeText(title, this.x, barY - 26);
    ctx.fillStyle = pColor;
    ctx.shadowBlur = 15;
    ctx.shadowColor = pColor;
    ctx.fillText(title, this.x, barY - 26);

 // Phase indicator
    ctx.shadowBlur = 0;
    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = '#ffd700';
    const phaseNames = ['AWAKENING', 'ASCENDING', 'ENRAGED', 'OMEGA FORM'];
    const ptxt = `PHASE ${this.phase} — ${phaseNames[this.phase - 1]}`;
    ctx.strokeText(ptxt, this.x, barY + barH + 5);
    ctx.fillText(ptxt, this.x, barY + barH + 5);
  }
}

/* =======================
   LEGENDARY BOSS (0.1% Random Spawn - INSANE)
======================= */

class LegendaryBoss {
  constructor(x, y, wave) {
    this.x = x;
    this.y = y;
    this.r = 110;
    this.speed = 34; // Increased from 28
    this.hp = 650 + wave * 110; // Increased from 500 + wave * 80 (now ~1.85x UltraBoss HP)
    this.maxHp = this.hp;
    this.color = '#ff0066';  // Hot pink/red
    this.coreColor = '#ffffff';
    this.isBoss = true;
    this.isMegaBoss = false;
    this.isUltraBoss = false;
    this.isLegendaryBoss = true;
    this.wave = wave;

 // Attack timers - increased cooldowns for more breathing room
    this.spiralCooldown = 0;
    this.specialCooldown = 0;
    this.summonCooldown = 4; // Increased from 3
    this.laserCooldown = 0;

 // Movement
    this.moveTimer = 0;
    this.movePattern = 0;
    this.dashTarget = null;
    this.dashTimer = 0;

 // 5 Phases for legendary difficulty
    this.phase = 1;
    this.lastPhase = 1;

 // Visual effects
    this.spiralAngle = 0;
    this.pulseTime = 0;
  }

  get hpPct() { return this.hp / this.maxHp; }

  update(dt) {
    this.pulseTime += dt;
    
 // Phase transitions at 80 / 60 / 40 / 20 % HP (5 phases!)
    if      (this.hpPct <= 0.20) this.phase = 5;
    else if (this.hpPct <= 0.40) this.phase = 4;
    else if (this.hpPct <= 0.60) this.phase = 3;
    else if (this.hpPct <= 0.80) this.phase = 2;
    else                         this.phase = 1;

 // Massive screen shake on phase change
    if (this.phase !== this.lastPhase) {
      this.lastPhase = this.phase;
      if (gameSettings.screenShake) screenShakeAmt = 2.5;
      playSound(40 + this.phase * 15, 0.8, 'sawtooth');
      setTimeout(() => playSound(80 + this.phase * 20, 0.6, 'sawtooth'), 150);
    }

 // Movement - gets insanely aggressive in later phases
    this.moveTimer += dt;
    const movePeriod = Math.max(1.2, 2.8 - this.phase * 0.3); // Slightly slower pattern changes
    if (this.moveTimer > movePeriod) {
      this.moveTimer = 0;
      this.movePattern = (this.movePattern + 1) % (3 + this.phase);
    }

    const spd = this.speed * (1 + (this.phase - 1) * 0.25); // Reduced from 0.3
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      if (this.dashTarget) {
        const ang = Math.atan2(this.dashTarget.y - this.y, this.dashTarget.x - this.x);
        this.x += Math.cos(ang) * spd * 4.0 * dt; // Reduced from 4.5
        this.y += Math.sin(ang) * spd * 4.0 * dt;
      }
    } else if (this.movePattern === 0) {
      const ang = Math.atan2(player.y - this.y, player.x - this.x) + Math.PI / 2;
      this.x += Math.cos(ang) * spd * dt;
      this.y += Math.sin(ang) * spd * dt;
    } else if (this.movePattern === 1) {
      const ang = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(ang) * spd * 0.4 * dt;
      this.y += Math.sin(ang) * spd * 0.4 * dt;
    } else if (this.movePattern === 2) {
      this.dashTarget = { x: player.x, y: player.y };
      this.dashTimer = 0.8;
    } else {
      this.x += (Math.random() - 0.5) * spd * 2 * dt;
      this.y += (Math.random() - 0.5) * spd * 2 * dt;
    }

    this.x = Math.max(100, Math.min(canvas.width - 100, this.x));
    this.y = Math.max(100, Math.min(canvas.height - 100, this.y));

 // Constant spiral attack - slower
    this.spiralCooldown -= dt;
    if (this.spiralCooldown <= 0) {
      this.spiralCooldown = Math.max(0.6, 1.2 - this.phase * 0.1); // Increased from 0.4/0.9
      this.shootDualSpiral();
    }

 // Special attacks based on phase - more time between attacks
    this.specialCooldown -= dt;
    if (this.specialCooldown <= 0) {
      if (this.phase === 1) {
        this.specialCooldown = 4.5; // Increased from 3.5
        this.shootRing();
      } else if (this.phase === 2) {
        this.specialCooldown = 4.0; // Increased from 3.0
        this.shootCross();
      } else if (this.phase === 3) {
        this.specialCooldown = 3.5; // Increased from 2.5
        this.shootHexagon();
      } else if (this.phase === 4) {
        this.specialCooldown = 3.0; // Increased from 2.0
        this.shootChaosStorm();
      } else {
        this.specialCooldown = 2.5; // Increased from 1.5
        this.shootApocalypse();
      }
    }

 // Laser attack (phase 3+) - less frequent
    if (this.phase >= 3) {
      this.laserCooldown -= dt;
      if (this.laserCooldown <= 0) {
        this.laserCooldown = 7; // Increased from 5
        this.shootLaserBeam();
      }
    }

 // Summon mini enemies (phase 4+) - less frequent
    if (this.phase >= 4) {
      this.summonCooldown -= dt;
      if (this.summonCooldown <= 0) {
        this.summonCooldown = 8; // Increased from 6
        this.summonMinions();
      }
    }
  }

  shootDualSpiral() {
    this.spiralAngle += 0.4;
    const numShots = 12; // Reduced from 16
    for (let i = 0; i < numShots; i++) {
      const angle = (Math.PI * 2 / numShots) * i + this.spiralAngle;
      const speed = 280; // Reduced from 300
      enemyBullets.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 8 // Reduced from 9
      });
    }
    playSound(160, 0.2, 'square');
  }

  shootRing() {
    const numShots = 20; // Reduced from 24
    for (let i = 0; i < numShots; i++) {
      const angle = (Math.PI * 2 / numShots) * i;
      const speed = 250; // Reduced from 260
      enemyBullets.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 7 // Reduced from 8
      });
    }
    playSound(180, 0.35, 'sawtooth');
    if (gameSettings.screenShake) screenShakeAmt = 0.6;
  }

  shootCross() {
    const patterns = [];
    for (let i = 0; i < 12; i++) { // Reduced from 16
      patterns.push(i * Math.PI / 6); // Adjusted angle
    }
    for (const angle of patterns) {
      for (let j = 0; j < 3; j++) { // Reduced from 4
        setTimeout(() => {
          const speed = 300; // Reduced from 320
          enemyBullets.push({
            x: this.x,
            y: this.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 8 // Reduced from 9
          });
        }, j * 100); // Increased from 80
      }
    }
    playSound(200, 0.3, 'square');
    if (gameSettings.screenShake) screenShakeAmt = 0.7;
  }

  shootHexagon() {
    for (let layer = 0; layer < 2; layer++) { // Reduced from 3 layers
      setTimeout(() => {
        const numShots = 14; // Reduced from 18
        for (let i = 0; i < numShots; i++) {
          const angle = (Math.PI * 2 / numShots) * i + layer * 0.3;
          const speed = 270 + layer * 15; // Reduced speed
          enemyBullets.push({
            x: this.x,
            y: this.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 7 // Reduced from 8
          });
        }
      }, layer * 250); // Increased from 200
    }
    playSound(220, 0.35, 'sawtooth');
    if (gameSettings.screenShake) screenShakeAmt = 0.8;
  }

  shootChaosStorm() {
    const numBursts = 5; // Reduced from 8
    for (let burst = 0; burst < numBursts; burst++) {
      setTimeout(() => {
        const numShots = 18; // Reduced from 25
        for (let i = 0; i < numShots; i++) {
          const angle = (Math.PI * 2 / numShots) * i + Math.random() * 0.3; // Reduced randomness from 0.4
          const speed = 260 + Math.random() * 30; // Reduced from 60
          enemyBullets.push({
            x: this.x,
            y: this.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 6 // Reduced from 7
          });
        }
        playSound(240, 0.12, 'square');
      }, burst * 150); // Increased from 120
    }
    if (gameSettings.screenShake) screenShakeAmt = 1.0;
  }

  shootApocalypse() {
 // Final phase - still intense but more dodgeable
    for (let wave = 0; wave < 4; wave++) { // Reduced from 5
      setTimeout(() => {
 // Spiral
        const spiral = 20; // Reduced from 30
        for (let i = 0; i < spiral; i++) {
          const angle = (Math.PI * 2 / spiral) * i + wave * 1.2;
          const speed = 280; // Reduced from 290
          enemyBullets.push({
            x: this.x,
            y: this.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 7 // Reduced from 8
          });
        }
 // Plus targeted shots - reduced spread
        const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
        for (let j = -1; j <= 1; j++) { // Reduced from -2 to 2
          enemyBullets.push({
            x: this.x,
            y: this.y,
            vx: Math.cos(angleToPlayer + j * 0.4) * 330, // Reduced from 350 and increased spread
            vy: Math.sin(angleToPlayer + j * 0.4) * 330,
            r: 9 // Reduced from 10
          });
        }
        playSound(260, 0.15, 'sawtooth');
      }, wave * 200); // Increased from 180
    }
    if (gameSettings.screenShake) screenShakeAmt = 1.5;
  }

  shootLaserBeam() {
    const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
    for (let i = 0; i < 10; i++) { // Reduced from 12
      setTimeout(() => {
        for (let j = 0; j < 2; j++) { // Reduced from 3
          enemyBullets.push({
            x: this.x,
            y: this.y,
            vx: Math.cos(angleToPlayer + (j - 0.5) * 0.08) * 420, // Reduced from 450 and adjusted spread
            vy: Math.sin(angleToPlayer + (j - 0.5) * 0.08) * 420,
            r: 6
          });
        }
      }, i * 60); // Increased from 50
    }
    playSound(400, 0.5, 'sine');
    if (gameSettings.screenShake) screenShakeAmt = 1.2;
  }

  summonMinions() {
    for (let i = 0; i < 2; i++) { // Reduced from 3
      const angle = (Math.PI * 2 / 2) * i;
      const dist = 150;
      const x = this.x + Math.cos(angle) * dist;
      const y = this.y + Math.sin(angle) * dist;
      enemies.push(new Enemy(x, y, 'shooter')); // Changed from miniboss to shooter
    }
    playSound(120, 0.4, 'sawtooth');
    if (gameSettings.screenShake) screenShakeAmt = 0.9;
  }

  draw() {
    const time = this.pulseTime;
    
 // Ultra glow based on phase
    const glowIntensity = 30 + this.phase * 15;
    ctx.shadowBlur = glowIntensity;
    ctx.shadowColor = this.color;
    
 // Rotating energy rings (more rings = higher phase)
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 8;
    
    for (let i = 0; i < this.phase; i++) {
      const offset = i * 18;
      const rotation = time * (2 + i * 0.5);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 25 + offset + Math.sin(time * 4 + i) * 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    
 // Outer pulsing ring
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    const pulseRadius = this.r + 35 + Math.sin(time * 5) * 15;
    ctx.beginPath();
    ctx.arc(this.x, this.y, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();
    
 // Core with intense gradient
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
    if (this.phase === 5) {
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.3, this.color);
      gradient.addColorStop(0.6, '#ff0000');
      gradient.addColorStop(1, '#000000');
    } else {
      gradient.addColorStop(0, this.coreColor);
      gradient.addColorStop(0.4, this.color);
      gradient.addColorStop(1, '#220011');
    }
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    
 // Rotating symbols
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const symbols = ['☠', '⚡', '💀', '🔥', '💥'];
    const symbol = symbols[this.phase - 1];
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(time * 3);
    ctx.fillText(symbol, 0, 0);
    ctx.restore();
    
    ctx.shadowBlur = 0;
    
 // Epic HP bar
    const barW = 250;
    const barH = 18;
    const barX = this.x - barW / 2;
    const barY = this.y - this.r - 45;
    
 // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(barX - 4, barY - 4, barW + 8, barH + 8);
    
 // Empty bar
    ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
    ctx.fillRect(barX, barY, barW, barH);
    
 // HP bar with phase coloring
    const hpPercent = this.hpPct;
    const phaseColors = ['#ff0066', '#ff0044', '#ff0022', '#ff0000', '#ffffff'];
    const barColor = phaseColors[this.phase - 1];
    
    const hpGradient = ctx.createLinearGradient(barX, 0, barX + barW * hpPercent, 0);
    hpGradient.addColorStop(0, barColor);
    hpGradient.addColorStop(1, '#660000');
    ctx.fillStyle = hpGradient;
    ctx.fillRect(barX, barY, barW * hpPercent, barH);
    
 // Phase markers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 5; i++) {
      const markX = barX + barW * (i * 0.2);
      ctx.beginPath();
      ctx.moveTo(markX, barY);
      ctx.lineTo(markX, barY + barH);
      ctx.stroke();
    }
    
 // Glowing border
    ctx.strokeStyle = barColor;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = barColor;
    ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.shadowBlur = 0;
    
 // Boss title
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5;
    const title = '⚠️ LEGENDARY DESTROYER ⚠️';
    ctx.strokeText(title, this.x, barY - 32);
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 20;
    ctx.shadowColor = this.color;
    ctx.fillText(title, this.x, barY - 32);
    
 // Phase indicator
    ctx.shadowBlur = 0;
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#ffd700';
    const phaseNames = ['AWAKENING', 'RAMPAGE', 'CHAOS', 'APOCALYPSE', 'DESTROYER MODE'];
    const ptxt = `PHASE ${this.phase} — ${phaseNames[this.phase - 1]}`;
    ctx.strokeText(ptxt, this.x, barY + barH + 6);
    ctx.fillText(ptxt, this.x, barY + barH + 6);
  }
}

/* =======================
   PARTICLES
======================= */

class Particle {
  constructor(x, y, angle, speed, color, life) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.r = Math.random() * 3 + 1;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 250 * dt; // Gravity
    this.life -= dt;
  }

  draw() {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Particle pool — reuse objects instead of constant allocation
const particlePool = [];
const PARTICLE_POOL_MAX = 400;

function acquireParticle(x, y, angle, speed, color, life) {
  let p;
  if (particlePool.length > 0) {
    p = particlePool.pop();
  } else {
    p = new Particle(0, 0, 0, 0, '#fff', 1);
  }
  p.x = x;
  p.y = y;
  p.vx = Math.cos(angle) * speed;
  p.vy = Math.sin(angle) * speed;
  p.color = color;
  p.life = life;
  p.maxLife = life;
  p.r = Math.random() * 3 + 1;
  p.isTrail = false;
  return p;
}

function createExplosion(x, y, color, count) {
  if (!gameSettings.particles) return;
  if (gameSettings.perfMode && particles.length >= 150) return;
  for (let i = 0; i < count; i++) {
    particles.push(acquireParticle(
      x,
      y,
      Math.random() * Math.PI * 2,
      Math.random() * 220 + 120,
      color,
      0.7
    ));
  }
}

// Battle Pass Trail Effects — Enhanced
function createTrailParticle(x, y) {
  if (!gameSettings.particles) return;
  if (typeof battlePassData === 'undefined' || !battlePassData.activeTrail) return;

  const trailId = battlePassData.activeTrail;
  const trail = TRAIL_EFFECTS[trailId];
  if (!trail) return;

 // Helper: push a particle tagged as a trail particle (draws BEHIND player)
  function pushTrail(px, py, angle, speed, color, life) {
    const p = acquireParticle(px, py, angle, speed, color, life);
    p.isTrail = true;
    particles.push(p);
  }

  switch (trailId) {
    case 'comet': {
      for (let i = 0; i < 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 60 + 20;
        pushTrail(
          x + (Math.random() - 0.5) * 8,
          y + (Math.random() - 0.5) * 8,
          angle, speed,
          i === 0 ? '#ffffff' : (Math.random() > 0.5 ? '#00d9ff' : '#aaeeff'),
          Math.random() * 0.5 + 0.35
        );
      }
      pushTrail(x, y, Math.random() * Math.PI * 2, 10, '#ffffff', 0.25);
      break;
    }
    case 'lightning': {
      const numSparks = Math.floor(Math.random() * 3) + 3;
      for (let i = 0; i < numSparks; i++) {
        const angle = (Math.random() - 0.5) * Math.PI + Math.PI;
        const speed = Math.random() * 120 + 40;
        const color = Math.random() > 0.4 ? '#ffff00' : (Math.random() > 0.5 ? '#fff' : '#ffffaa');
        pushTrail(
          x + (Math.random() - 0.5) * 12,
          y + (Math.random() - 0.5) * 12,
          angle, speed, color,
          Math.random() * 0.3 + 0.2
        );
      }
      if (Math.random() < 0.2) {
        pushTrail(x, y, Math.random() * Math.PI * 2, 5, '#ffffff', 0.15);
      }
      break;
    }
    case 'flame': {
      pushTrail(
        x + (Math.random() - 0.5) * 5,
        y + (Math.random() - 0.5) * 5,
        Math.PI / 2 + (Math.random() - 0.5) * 0.8,
        Math.random() * 40 + 20,
        Math.random() > 0.5 ? '#ffff88' : '#fff8aa',
        Math.random() * 0.25 + 0.15
      );
      for (let i = 0; i < 2; i++) {
        pushTrail(
          x + (Math.random() - 0.5) * 10,
          y + (Math.random() - 0.5) * 10,
          Math.random() * Math.PI * 2,
          Math.random() * 70 + 30,
          Math.random() > 0.5 ? '#ff6600' : '#ff4500',
          Math.random() * 0.4 + 0.25
        );
      }
      pushTrail(
        x + (Math.random() - 0.5) * 14,
        y + (Math.random() - 0.5) * 14,
        Math.random() * Math.PI * 2,
        Math.random() * 50 + 20,
        Math.random() > 0.5 ? '#cc2200' : '#ff2200',
        Math.random() * 0.5 + 0.3
      );
      break;
    }
    case 'void': {
      const baseAngle = Math.random() * Math.PI * 2;
      for (let i = 0; i < 5; i++) {
        const ringAngle = baseAngle + (i / 5) * Math.PI * 2;
        const dist = Math.random() * 10 + 4;
        const color = i % 3 === 0 ? '#cc66ff' : (i % 3 === 1 ? '#9933ff' : '#660099');
        pushTrail(
          x + Math.cos(ringAngle) * dist,
          y + Math.sin(ringAngle) * dist,
          ringAngle + Math.PI / 2,
          Math.random() * 40 + 15,
          color,
          Math.random() * 0.6 + 0.3
        );
      }
      if (Math.random() < 0.3) {
        pushTrail(x, y, Math.random() * Math.PI * 2, 5, '#ffffff', 0.1);
      }
      break;
    }
  }
}

// Battle Pass Death Effects — Enhanced
function createDeathEffect(x, y) {
  if (!gameSettings.particles) return;
  if (typeof battlePassData === 'undefined' || !battlePassData.activeDeathEffect) {
 // Default death explosion — enhanced version
    createExplosion(x, y, '#ff4444', 50);
 // Add a ring burst
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      particles.push(new Particle(x, y, angle, 200 + Math.random() * 60, '#ff8844', 0.6));
    }
    return;
  }

  const effectId = battlePassData.activeDeathEffect;
  const effect = DEATH_EFFECTS[effectId];
  if (!effect) {
    createExplosion(x, y, '#ff4444', 50);
    return;
  }

  switch (effectId) {
    case 'starburst': {
 // Phase 1: bright white flash core
      for (let i = 0; i < 30; i++) {
        particles.push(new Particle(x, y, Math.random() * Math.PI * 2, Math.random() * 80 + 30, '#ffffff', 0.4));
      }
 // Phase 2: 8 directional star points
      for (let spike = 0; spike < 8; spike++) {
        const baseAngle = (spike / 8) * Math.PI * 2;
        for (let j = 0; j < 12; j++) {
          const angle = baseAngle + (Math.random() - 0.5) * 0.4;
          const speed = Math.random() * 250 + 150;
          const color = effect.colors[j % effect.colors.length];
          particles.push(new Particle(x, y, angle, speed, color, 0.9 + Math.random() * 0.6));
        }
      }
 // Phase 3: delayed second burst ring
      setTimeout(() => {
        for (let i = 0; i < 24; i++) {
          const angle = (i / 24) * Math.PI * 2;
          particles.push(new Particle(x, y, angle, 180 + Math.random() * 60,
            ['#ff00ff', '#ffff00', '#00ffff'][i % 3], 0.7));
        }
      }, 150);
 // Phase 4: scattered sparkle
      setTimeout(() => {
        for (let i = 0; i < 40; i++) {
          particles.push(new Particle(
            x + (Math.random() - 0.5) * 60,
            y + (Math.random() - 0.5) * 60,
            Math.random() * Math.PI * 2, Math.random() * 60 + 20,
            effect.colors[Math.floor(Math.random() * effect.colors.length)],
            Math.random() * 0.8 + 0.4
          ));
        }
      }, 300);
      break;
    }

    case 'supernova': {
 // Phase 1: Mega white core explosion
      for (let i = 0; i < 80; i++) {
        const speed = Math.random() * 400 + 100;
        const color = effect.colors[Math.floor(Math.random() * effect.colors.length)];
        particles.push(new Particle(x, y, Math.random() * Math.PI * 2, speed, color, Math.random() * 1.5 + 0.5));
      }
 // Phase 2: 3 expanding shockwave rings at staggered intervals
      for (let ring = 0; ring < 3; ring++) {
        setTimeout(() => {
          const ringParticles = 32 + ring * 8;
          for (let i = 0; i < ringParticles; i++) {
            const angle = (i / ringParticles) * Math.PI * 2;
            const speed = 280 + ring * 100 + Math.random() * 50;
            const ringColors = [
              ['#ffffff', '#ffffaa'],
              ['#ff8844', '#ffcc44'],
              ['#ff44aa', '#ff00ff']
            ][ring];
            particles.push(new Particle(x, y, angle, speed,
              ringColors[i % ringColors.length], 0.7 + ring * 0.15));
          }
 // Center re-burst for each ring
          for (let i = 0; i < 20; i++) {
            particles.push(new Particle(x, y, Math.random() * Math.PI * 2,
              Math.random() * 100 + 50, '#ffffff', 0.3));
          }
        }, ring * 180);
      }
 // Phase 4: Final massive debris scatter
      setTimeout(() => {
        for (let i = 0; i < 60; i++) {
          const dx = (Math.random() - 0.5) * 150;
          const dy = (Math.random() - 0.5) * 150;
          particles.push(new Particle(
            x + dx, y + dy,
            Math.random() * Math.PI * 2, Math.random() * 80 + 20,
            effect.colors[Math.floor(Math.random() * effect.colors.length)],
            Math.random() * 1.0 + 0.5
          ));
        }
      }, 450);
      break;
    }
  }
}

// Creator Skin — Solar trail particles (movement effect)
function createCreatorTrail(x, y) {
  if (!gameSettings.particles) return;
  const angle = Math.random() * Math.PI * 2;
  const speed = Math.random() * 30 + 10;
  const colors = ['#ffcc33', '#ff8c1a', '#ffe066'];
  const p = acquireParticle(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10,
    angle, speed, colors[Math.floor(Math.random() * 3)], 0.3 + Math.random() * 0.2);
  p.isTrail = true;
  p.r = Math.random() * 2 + 0.5;
  particles.push(p);
}

// Creator Skin — Solar kill effect (enemy ignites then collapses)
function createCreatorKillEffect(x, y) {
  if (!gameSettings.particles) return;
  // brief ignite burst — warm colors
  const igniteColors = ['#ffdd44', '#ff8800', '#ff4400', '#ffffff'];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const spd = 80 + Math.random() * 60;
    particles.push(acquireParticle(x, y, a, spd,
      igniteColors[Math.floor(Math.random() * igniteColors.length)], 0.25 + Math.random() * 0.15));
  }
  // collapse spark flash
  setTimeout(() => {
    for (let i = 0; i < 8; i++) {
      const p = acquireParticle(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12,
        Math.random() * Math.PI * 2, Math.random() * 40 + 15, '#ffffcc', 0.2);
      p.r = Math.random() * 1.5 + 0.5;
      particles.push(p);
    }
  }, 80);
}

// Creator Skin — Milestone solar flare burst
let creatorMilestoneTimer = 0;
function triggerCreatorMilestone() {
  creatorMilestoneTimer = Date.now();
}
function getCreatorMilestoneScale() {
  if (creatorMilestoneTimer === 0) return 1;
  const elapsed = Date.now() - creatorMilestoneTimer;
  if (elapsed > 700) { creatorMilestoneTimer = 0; return 1; }
  // quick expand then ease back: peaks around 100ms
  const progress = elapsed / 700;
  const scale = 1 + 0.18 * Math.sin(progress * Math.PI) * (1 - progress * 0.5);
  return scale;
}

/* =======================
   POWERUPS
======================= */

class PowerUp {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.r = 11;
    this.type = type;
    this.life = 12;
    
    const types = {
      health: { color: '#6bff7b', symbol: '+' },
      rapidfire: { color: '#ffd93d', symbol: '⚡' },
      speed: { color: '#9be7ff', symbol: '»' },
      shield: { color: '#b693ff', symbol: '◈' },
      weapon: { color: '#ffd700', symbol: '★' },
      maxhp: { color: '#ff69b4', symbol: '♥' },
      speedup: { color: '#00ffff', symbol: '⟫' },
      nuke: { color: '#ff6b35', symbol: '💣' },
      explosive: { color: '#ff4500', symbol: '💥' },
      pierce: { color: '#ff8c42', symbol: '⚔' }
    };
    
    const config = types[type];
    this.color = config.color;
    this.symbol = config.symbol;
  }

  update(dt) {
    this.life -= dt;
    this.y += Math.sin(Date.now() / 150) * 0.6;
  }

  draw() {
    const alpha = Math.min(1, this.life / 2);
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 18;
    ctx.shadowColor = this.color;
    
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + Math.sin(Date.now() / 80) * 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.symbol, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}

function spawnPowerUp(x, y) {
  const types = ['health', 'rapidfire', 'speed', 'shield'];

 // Weapon upgrade (13% chance, max 3 levels)
  if (Math.random() < 0.13 && player.weaponLevel < 3) {
    types.push('weapon');
  }

 // Max HP upgrade (13% chance, max 3 levels)
  if (Math.random() < 0.13 && player.maxHpLevel < 3) {
    types.push('maxhp');
  }

 // Speed upgrade (13% chance, max 3 levels)
  if (Math.random() < 0.13 && player.speedLevel < 3) {
    types.push('speedup');
  }

 // Rare nuke drop (8% chance, only after wave 2)
  if (Math.random() < 0.08 && wave >= 2) {
    types.push('nuke');
  }

 // Explosive Bullets (10% chance) - bullets create small explosions on impact
  if (Math.random() < 0.10) {
    types.push('explosive');
  }

 // Pierce Shot (10% chance) - bullets pierce through multiple enemies
  if (Math.random() < 0.10) {
    types.push('pierce');
  }
  
 // Clamp powerup position within visible screen bounds with padding
 // This prevents powerups from spawning off-screen when enemies die off-screen
  const padding = 30; // Minimum distance from screen edge
  const clampedX = Math.max(padding, Math.min(canvas.width - padding, x));
  const clampedY = Math.max(padding, Math.min(canvas.height - padding, y));
  
  const type = types[Math.floor(Math.random() * types.length)];
  powerups.push(new PowerUp(clampedX, clampedY, type));
}

/* =======================
   COMBO SYSTEM
======================= */

function addCombo() {
  combo++;
  comboTimer = 3;
  if (combo >= 5) {
    comboValEl.textContent = combo;
    comboEl.classList.remove('hidden');
  }
  // Update kill counter HUD with bump animation
  if (killsValEl_cached) {
    killsValEl_cached.textContent = totalKills;
    killsValEl_cached.classList.remove('kills-bump');
    void killsValEl_cached.offsetWidth; // force reflow to restart animation
    killsValEl_cached.classList.add('kills-bump');
  }
  if (typeof achOnKill === 'function') achOnKill(totalKills, combo);
}

function addComboBulk(count) {
  const gain = Math.min(count, 15); // cap nuke combo contribution
  combo += gain;
  comboTimer = 3;
  if (combo >= 5) {
    comboValEl.textContent = combo;
    comboEl.classList.remove('hidden');
  }
  if (killsValEl_cached) {
    killsValEl_cached.textContent = totalKills;
    killsValEl_cached.classList.remove('kills-bump');
    void killsValEl_cached.offsetWidth;
    killsValEl_cached.classList.add('kills-bump');
  }
  if (typeof achOnKill === 'function') achOnKill(totalKills, combo);
}

function resetCombo() {
  combo = 0;
  comboEl.classList.add('hidden');
}

/* =======================
   BUFFS DISPLAY
======================= */

let lastBuffUpdate = 0;
let activeBuffElements = {}; // Track existing buff elements by key

function updateBuffsDisplay() {
  if (!player) return;
  const now = Date.now();
  if (now - lastBuffUpdate < 50) return; // throttle DOM updates
  lastBuffUpdate = now;

  const container = buffsDisplayEl;
  if (!container) return;

  const buffs = [];

  if (player.rapidFire > 0) {
    buffs.push({ 
      key: 'rapidFire',
      icon: '⚡', 
      name: 'Rapid Fire', 
      time: player.rapidFire, 
      maxTime: 12, 
      color: '#ffd93d' 
    });
  }
  if (player.speedBoost > 0) {
    buffs.push({ 
      key: 'speedBoost',
      icon: '💨', 
      name: 'Speed Boost', 
      time: player.speedBoost, 
      maxTime: 12, 
      color: '#9be7ff' 
    });
  }
  if (player.shield > 0) {
    buffs.push({ 
      key: 'shield',
      icon: '🛡', 
      name: 'Shield', 
      time: player.shield, 
      maxTime: 15, 
      color: '#b693ff' 
    });
  }
  if (player.weaponLevel > 1) {
    const wlColor = ['','','#9be7ff','#ffd700','#ff6b35'][player.weaponLevel] || '#ffd700';
    buffs.push({ 
      key: 'weaponLevel',
      icon: '⭐', 
      name: `Weapon Lv.${player.weaponLevel}`, 
      time: -1, 
      maxTime: -1, 
      color: wlColor 
    });
  }
  if (player.maxHpLevel > 1) {
    const hpColor = ['','','#ff69b4','#ff1493','#c71585'][player.maxHpLevel] || '#ff69b4';
    buffs.push({ 
      key: 'maxHpLevel',
      icon: '♥', 
      name: `Max HP Lv.${player.maxHpLevel}`, 
      time: -1, 
      maxTime: -1, 
      color: hpColor 
    });
  }
  if (player.speedLevel > 1) {
    const spdColor = ['','','#00ffff','#00ccff','#0099ff'][player.speedLevel] || '#00ffff';
    buffs.push({ 
      key: 'speedLevel',
      icon: '⟫', 
      name: `Speed Lv.${player.speedLevel}`, 
      time: -1, 
      maxTime: -1, 
      color: spdColor 
    });
  }
  if (player.pierce > 0) {
    buffs.push({ 
      key: 'pierce',
      icon: '⚔️', 
      name: 'Pierce Shot', 
      time: player.pierce, 
      maxTime: 10, 
      color: '#ff6b35' 
    });
  }
  if (player.explosive > 0) {
    buffs.push({ 
      key: 'explosive',
      icon: '💥', 
      name: 'Explosive Bullets', 
      time: player.explosive, 
      maxTime: 12, 
      color: '#ff4500' 
    });
  }

 // Get current buff keys
  const currentKeys = buffs.map(b => b.key);
  const existingKeys = Object.keys(activeBuffElements);

 // Remove buffs that are no longer active
  for (const key of existingKeys) {
    if (!currentKeys.includes(key)) {
      const elem = activeBuffElements[key];
      if (elem && elem.parentNode) {
        elem.style.opacity = '0';
        elem.style.transform = 'scale(0.8)';
        setTimeout(() => {
          if (elem.parentNode) elem.parentNode.removeChild(elem);
        }, 200);
      }
      delete activeBuffElements[key];
    }
  }

 // Add or update buffs
  for (const b of buffs) {
    let elem = activeBuffElements[b.key];
    
 // Create new element if it doesn't exist
    if (!elem) {
      elem = document.createElement('div');
      elem.className = 'buff-card';
      elem.innerHTML = `
        <div class="buff-icon">${b.icon}</div>
        <div class="buff-info">
          <div class="buff-name">${b.name}</div>
          <div class="buff-bar-bg"><div class="buff-bar"></div></div>
          <div class="buff-time"></div>
        </div>
      `;
      elem.style.opacity = '0';
      elem.style.transform = 'scale(0.8)';
      container.appendChild(elem);
      activeBuffElements[b.key] = elem;
      
 // Trigger animation
      setTimeout(() => {
        elem.style.opacity = '1';
        elem.style.transform = 'scale(1)';
      }, 10);
    }

 // Update existing element values
    const pct = b.time > 0 ? (b.time / b.maxTime) * 100 : 100;
    const opacity = b.time > 0 ? Math.max(0.3, Math.min(1, b.time / 2)) : 1;
    const timeStr = b.time > 0 ? `${b.time.toFixed(1)}s` : '∞';
    
    const bar = elem.querySelector('.buff-bar');
    const timeEl = elem.querySelector('.buff-time');
    const nameEl = elem.querySelector('.buff-name');
    
    if (bar) {
      bar.style.width = pct + '%';
      bar.style.background = b.color;
    }
    if (timeEl) timeEl.textContent = timeStr;
    if (nameEl) nameEl.textContent = b.name; // Update name in case weapon level changes
    
 // Fade out when time is low
    if (b.time > 0) {
      elem.style.opacity = opacity;
    }
  }
}

/* =======================
   PAUSE SYSTEM
======================= */

function formatRunTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function togglePause() {
  paused = !paused;
  const pauseOverlay = document.getElementById('pauseOverlay');
  if (paused) {
    // Populate run stats
    const el = id => document.getElementById(id);
    if (el('pauseWave'))  el('pauseWave').textContent  = wave;
    if (el('pauseKills')) el('pauseKills').textContent = totalKills;
    if (el('pauseScore')) el('pauseScore').textContent = score;
    if (el('pauseTime'))  el('pauseTime').textContent  = formatRunTime(Date.now() - runStartTime);
    // Hide sub-confirms if they were open
    el('restartConfirm')?.classList.add('hidden');
    el('rankedQuitConfirm')?.classList.add('hidden');
    pauseOverlay.classList.remove('hidden');
    pauseOverlay.classList.add('visible');
    comboEl.classList.add('hidden');
  } else {
    pauseOverlay.classList.remove('visible');
    pauseOverlay.classList.add('hidden');
    skipNextFrame = true; // avoid dt spike on resume
  }
}

/* =======================
   SETTINGS UI
======================= */

function initSettingsUI(fromPause = false) {
  const panel = document.getElementById('settingsPanel');

 // Sync toggles to current settings
  document.getElementById('masterSoundToggle').checked = gameSettings.masterSound;
  document.getElementById('shootSoundToggle').checked = gameSettings.shootSound;
  document.getElementById('screenShakeToggle').checked = gameSettings.screenShake;
  document.getElementById('particlesToggle').checked = gameSettings.particles;
  document.getElementById('showFPSToggle').checked = gameSettings.showFPS;
  document.getElementById('autoShootToggle').checked = gameSettings.autoShoot;

 // Wire up toggles
  const wire = (id, key) => {
    const el = document.getElementById(id);
    el.onchange = () => { gameSettings[key] = el.checked; saveSettings(); };
  };
  wire('masterSoundToggle', 'masterSound');
  wire('shootSoundToggle', 'shootSound');
  wire('screenShakeToggle', 'screenShake');
  wire('particlesToggle', 'particles');
  wire('showFPSToggle', 'showFPS');
  wire('autoShootToggle', 'autoShoot');

  // performance mode toggle
  const perfToggle = document.getElementById('perfModeToggle');
  if (perfToggle) {
    perfToggle.checked = !!gameSettings.perfMode;
    perfToggle.onchange = () => {
      gameSettings.perfMode = perfToggle.checked;
      saveSettings();
    };
  }

  // cursor color buttons
  const colorBtns = document.querySelectorAll('.cursor-color-btn');
  colorBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === gameSettings.cursorColor);
    btn.onclick = () => {
      colorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyCursorColor(btn.dataset.color);
    };
  });

  // Chat button and visibility are fully managed by chat.js

  document.getElementById('settingsBackBtn').onclick = () => {
    panel.classList.add('hidden');
    if (fromPause) {
      document.getElementById('pauseOverlay').classList.remove('hidden');
    } else {
      document.getElementById('homeScreen').classList.remove('hidden');
    }
  };

  panel.classList.remove('hidden');
}

/* =======================
   SHOP UI
======================= */

// baseball skin preview helper
// Draws the baseball skin directly onto a canvas element appended to `container`,
// exactly matching the in-game rendering (white ball + S-curve seams + stitches).
function _drawBaseballPreview(container) {
  const DPR = window.devicePixelRatio || 1;
 // CSS display size matches the .skin-preview dimensions (42 × 42)
  const CSS = 42;
  const PX  = Math.round(CSS * DPR * 2); // 2× super-sample for crisp look

  const canvas = document.createElement('canvas');
  canvas.width  = PX;
  canvas.height = PX;
  canvas.style.cssText = `
    width:${CSS}px; height:${CSS}px;
    border-radius:50%;
    display:block;
    position:absolute; top:0; left:0;
  `;

  const ctx = canvas.getContext('2d');
  const cx  = PX / 2;
  const cy  = PX / 2;
  const r   = PX / 2 - PX * 0.04; // tiny inset so shadow isn't clipped

  // white ball with soft grey shadow
  ctx.shadowBlur  = PX * 0.12;
  ctx.shadowColor = 'rgba(120,120,120,0.55)';
  ctx.fillStyle   = '#f9f9f9';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // red s-curve seams (proportions = in-game constants)
  ctx.strokeStyle = '#d32f2f';
  ctx.lineWidth   = r * 0.085;   // matches in-game lineWidth 3 / r≈16 ratio
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

 // Left seam
  ctx.beginPath();
  ctx.moveTo(cx - r*0.6, cy - r*0.65);
  ctx.bezierCurveTo(cx - r*0.15, cy - r*0.3, cx - r*0.15, cy + r*0.3, cx - r*0.6, cy + r*0.65);
  ctx.stroke();

 // Right seam
  ctx.beginPath();
  ctx.moveTo(cx + r*0.6, cy - r*0.65);
  ctx.bezierCurveTo(cx + r*0.15, cy - r*0.3, cx + r*0.15, cy + r*0.3, cx + r*0.6, cy + r*0.65);
  ctx.stroke();

  // stitches crossing each seam
  ctx.lineWidth = r * 0.065;
  const sLen    = r * 0.19; // stitch half-length → matches in-game 3.5 / r≈18

  for (let i = 0; i < 5; i++) {
    const t  = i / 4;
    const t2 = t * t, t3 = t2 * t, m = 1 - t, m2 = m * m, m3 = m2 * m;

 // Left seam stitch
    const lx = m3*(cx-r*0.6) + 3*m2*t*(cx-r*0.15) + 3*m*t2*(cx-r*0.15) + t3*(cx-r*0.6);
    const ly = m3*(cy-r*0.65) + 3*m2*t*(cy-r*0.3) + 3*m*t2*(cy+r*0.3)  + t3*(cy+r*0.65);
    const la = Math.atan2(ly - cy, lx - cx) + Math.PI/2;
    ctx.beginPath();
    ctx.moveTo(lx - Math.cos(la)*sLen, ly - Math.sin(la)*sLen);
    ctx.lineTo(lx + Math.cos(la)*sLen, ly + Math.sin(la)*sLen);
    ctx.stroke();

 // Right seam stitch
    const rx2 = m3*(cx+r*0.6) + 3*m2*t*(cx+r*0.15) + 3*m*t2*(cx+r*0.15) + t3*(cx+r*0.6);
    const ry2 = m3*(cy-r*0.65) + 3*m2*t*(cy-r*0.3) + 3*m*t2*(cy+r*0.3)  + t3*(cy+r*0.65);
    const ra  = Math.atan2(ry2 - cy, rx2 - cx) + Math.PI/2;
    ctx.beginPath();
    ctx.moveTo(rx2 - Math.cos(ra)*sLen, ry2 - Math.sin(ra)*sLen);
    ctx.lineTo(rx2 + Math.cos(ra)*sLen, ry2 + Math.sin(ra)*sLen);
    ctx.stroke();
  }

 // Slot the canvas into the container so border-radius clips it correctly
  container.style.position   = 'relative';
  container.style.overflow   = 'hidden';
  container.style.background = 'transparent';
  container.style.boxShadow  = '0 0 22px rgba(210,0,0,0.45), 0 0 6px rgba(150,150,150,0.25)';
  container.appendChild(canvas);
}

// ─── Global rich skin preview ─────────────────────────────────────────────────
// Applies gradients, glows, and CSS animations to any skin preview element.
// Used by the inventory, crate display, shop, and marketplace.
function applyRichSkinPreview(el, skinId, fallbackColor) {
  const styles = {
    // Default skin
    agent:      ['radial-gradient(circle at 35% 35%,#d0f4ff 0%,#9be7ff 40%,#3ab0d8 75%,#0a4a6a 100%)', '0 0 18px rgba(155,231,255,0.6)', ''],
    // Shop specials
    rainbow:    ['conic-gradient(red,orange,yellow,green,cyan,blue,violet,red)',                                            '0 0 22px rgba(255,150,0,0.7)',                                       'quantumSpin 3s linear infinite'],
    galaxy:     ['linear-gradient(135deg,#667eea 0%,#764ba2 50%,#f093fb 100%)',                                            '0 0 25px #764ba2',                                                    'galaxyShimmer 2s ease-in-out infinite'],
    void:       ['radial-gradient(circle at 40% 40%,#1a0033 0%,#0d001a 40%,#000 100%)',                                   '0 0 35px #9900ff,0 0 60px rgba(153,0,255,0.5)',                       'voidPulse 3s ease-in-out infinite'],
    sunset:     ['linear-gradient(135deg,#ff6b6b 0%,#ffd93d 50%,#ff69b4 100%)',                                           '0 0 20px #ff8c00',                                                    ''],
    phoenix:    ['radial-gradient(circle,#ff4500 0%,#ff6347 50%,#ffa500 100%)',                                            '0 0 22px #ff4500',                                                    'voidPulse 2s ease-in-out infinite'],
    diamond:    ['radial-gradient(circle at 35% 35%,#fff 0%,#f0f8ff 20%,#ffe6f0 40%,#fff5e6 60%,#f0f0ff 80%,#fff 100%)', '0 0 40px #fff,0 0 70px rgba(255,255,255,0.7)',                        'diamondShine 2.5s ease-in-out infinite'],
    quantum:    ['conic-gradient(from 0deg,#ff0080,#00ffff,#8000ff,#ffff00,#ff0080)',                                     '0 0 35px rgba(255,0,255,0.8)',                                        'quantumSpin 3s linear infinite'],
    celestial:  ['radial-gradient(circle at 30% 40%,#b794f6 0%,#4a90e2 30%,#50c9ce 50%,#ffd700 70%,#b794f6 100%)',      '0 0 45px rgba(183,148,246,1)',                                        'celestialGlow 4s ease-in-out infinite'],
    // Champions
    'gold-champion':   ['radial-gradient(circle,#ffd700 0%,#ffed4e 40%,#fff 60%,#ffd700 100%)',       '0 0 30px #ffd700',                                    'championPulse 2s ease-in-out infinite'],
    'silver-champion': ['radial-gradient(circle,#c0c0c0 0%,#e8e8e8 40%,#fff 60%,#c0c0c0 100%)',      '0 0 30px #c0c0c0',                                    'championPulse 2.2s ease-in-out infinite'],
    'bronze-champion': ['radial-gradient(circle,#cd7f32 0%,#e8a87c 40%,#f5d0a9 60%,#cd7f32 100%)',   '0 0 30px #cd7f32',                                    'championPulse 2.4s ease-in-out infinite'],
    // Icon skins
    icon_noah_brown:      ['radial-gradient(circle,#9a6033 0%,#6b4423 50%,#3a2010 100%)',                                 '0 0 18px #6b4423',  ''],
    icon_keegan_baseball: ['radial-gradient(circle,#f5f5f5 0%,#e0e0d0 50%,#c8c8b0 100%)',                                '0 0 14px #ddd',     ''],
    icon_dpoe_fade:       ['linear-gradient(135deg,#ff69b4 0%,#ff9ec4 50%,#89cff0 100%)',                                 '0 0 22px #ff9ec4',  ''],
    icon_evan_watermelon: ['radial-gradient(circle,#ff6b9d 0%,#ff4466 30%,#ff1744 50%,#4caf50 70%,#2e7d32 100%)',        '0 0 20px #ff4466',  ''],
    icon_gavin_tzl:       ['linear-gradient(135deg,#dc143c 0%,#fff 50%,#0047ab 100%)',                                    '0 0 25px #0047ab',  ''],
    icon_carter_cosmic:   ['radial-gradient(circle,#ff2020 0%,#cc0000 40%,#660000 70%,#1a0000 100%)',                     '0 0 25px #cc0000',  ''],
    icon_brody_flag:      ['repeating-linear-gradient(to bottom,#b22234 0px,#b22234 8%,#fff 8%,#fff 16%)',                '0 0 22px #3c3b6e',  ''],
    icon_sterling:        ['radial-gradient(circle at 30% 30%,#0064ff 0%,#0050cc 30%,#003399 60%,#000 100%)',             '0 0 25px #0064ff,0 0 40px rgba(0,100,255,0.5)', 'sterlingPulse 3s ease-in-out infinite'],
    icon_profe_spain:     ['linear-gradient(to bottom,#c60b1e 0%,#c60b1e 25%,#ffc400 25%,#ffc400 75%,#c60b1e 75%,#c60b1e 100%)', '0 0 25px #c60b1e,0 0 40px rgba(255,196,0,0.6)', 'voidPulse 1.2s ease-in-out infinite'],
    icon_kayden_duck:     ['conic-gradient(from 20deg,#5a6b2a,#c4a265,#3d2b0e,#7a5c28,#5a6b2a)',                         '0 0 18px rgba(90,107,42,0.7)', ''],
    icon_troy_puck:       ['radial-gradient(circle at 35% 35%,#3a3a3a 0%,#1a1a1a 50%,#050505 100%)',                     '0 0 20px rgba(200,232,255,0.5)', ''],
    icon_justin_clover:   ['radial-gradient(circle,#39ff14 0%,#1a8c2e 40%,#0d5c1a 70%,#042b0a 100%)',                    '0 0 25px #39ff14,0 0 40px rgba(26,140,46,0.5)', ''],
    icon_the_creator:     ['conic-gradient(from 0deg,#ff0080,#00ffff,#8000ff,#ffff00,#ff0080)',                           '0 0 45px #fff,0 0 80px rgba(255,215,0,0.6)', 'quantumSpin 1.5s linear infinite'],
    // BP Season 1
    bp1_striker:   ['radial-gradient(circle,#ff8050 0%,#ff6b35 50%,#883010 100%)',   '0 0 18px #ff6b35',  ''],
    bp1_guardian:  ['radial-gradient(circle,#70ffee 0%,#4ecdc4 50%,#1a6060 100%)',   '0 0 18px #4ecdc4',  ''],
    bp1_phantom:   ['radial-gradient(circle,#cc88ff 0%,#9b59b6 50%,#4a1a66 100%)',   '0 0 20px #9b59b6',  ''],
    bp1_tempest:   ['radial-gradient(circle,#80aaff 0%,#3498db 50%,#103055 100%)',   '0 0 20px #3498db',  ''],
    bp1_eclipse:   ['radial-gradient(circle,#404060 0%,#2c3e50 50%,#0d1520 100%)',   '0 0 18px #2c3e50',  ''],
    bp1_sovereign: ['radial-gradient(circle,#ffd060 0%,#f39c12 50%,#6a3a00 100%)',   '0 0 22px #f39c12',  'celestialGlow 3s ease-in-out infinite'],
    bp1_apex:      ['radial-gradient(circle,#ff8888 0%,#e74c3c 40%,#660000 100%)',   '0 0 28px #e74c3c',  'voidPulse 2s ease-in-out infinite'],
    transcendence: ['conic-gradient(from 0deg,#ff0080,#00ffff,#8000ff,#ffff00,#ff0080)', '0 0 55px #fff,0 0 90px rgba(255,255,255,0.6)', 'quantumSpin 2s linear infinite'],
    // c_ crate skins
    c_static:     ['radial-gradient(circle,#c8c8dc 0%,#808090 60%,#404050 100%)',                                            '0 0 10px #b8b8cc', ''],
    c_rust:       ['radial-gradient(circle,#c06030 0%,#8b4513 55%,#4a2008 100%)',                                            '0 0 12px #8b4513', ''],
    c_slate:      ['radial-gradient(circle,#8090a0 0%,#607080 55%,#303840 100%)',                                            '0 0 10px #708090', ''],
    c_olive:      ['radial-gradient(circle,#9ab040 0%,#6b8e23 55%,#344010 100%)',                                            '0 0 12px #6b8e23', ''],
    c_maroon:     ['radial-gradient(circle,#cc3050 0%,#9b2335 55%,#4a0f1a 100%)',                                            '0 0 12px #9b2335', ''],
    c_cobalt:     ['radial-gradient(circle,#3080ff 0%,#0047ab 55%,#001a60 100%)',                                            '0 0 18px #3080ff', ''],
    c_teal:       ['radial-gradient(circle,#00c8b0 0%,#00897b 55%,#003830 100%)',                                            '0 0 18px #00c8b0', ''],
    c_coral:      ['radial-gradient(circle,#ff9080 0%,#ff6f61 55%,#a02010 100%)',                                            '0 0 18px #ff6f61', ''],
    c_sand:       ['radial-gradient(circle,#e0c870 0%,#c2a25a 55%,#6a5020 100%)',                                            '0 0 16px #c2a25a', ''],
    c_chrome:     ['linear-gradient(135deg,#666 0%,#ddd 25%,#999 50%,#fff 75%,#888 100%)',                                   '0 0 22px #ccc',    'quantumSpin 3s linear infinite'],
    c_prism:      ['conic-gradient(red,orange,yellow,green,cyan,blue,violet,red)',                                           '0 0 28px #fff',    'quantumSpin 2s linear infinite'],
    c_aurora:     ['linear-gradient(180deg,#00ff99 0%,#00aaff 40%,#9900cc 100%)',                                            '0 0 28px #00ff99', 'galaxyShimmer 2.5s ease-in-out infinite'],
    c_lava:       ['radial-gradient(circle,#ffcc00 0%,#ff4500 45%,#cc0000 75%,#440000 100%)',                               '0 0 28px #ff4500', 'voidPulse 1.5s ease-in-out infinite'],
    c_storm:      ['radial-gradient(circle,#c0d8ff 0%,#4080ff 35%,#0020a0 65%,#000820 100%)',                               '0 0 28px #4080ff', 'voidPulse 2s ease-in-out infinite'],
    c_neon:       ['linear-gradient(135deg,#ff00cc 0%,#00ffff 50%,#ff00cc 100%)',                                           '0 0 28px #ff00cc,0 0 50px rgba(0,255,255,0.5)', 'quantumSpin 3s linear infinite'],
    c_glitch:     ['conic-gradient(#ff0080,#00ffff,#ff0000,#00ff00,#ff00ff,#0000ff,#ff0080)',                               '0 0 35px #ff0080,0 0 60px rgba(0,255,255,0.5)', 'quantumSpin 0.6s linear infinite'],
    c_nebula:     ['radial-gradient(circle at 40% 35%,#ff80cc 0%,#9922cc 35%,#220066 65%,#110033 100%)',                   '0 0 35px #9922cc', 'galaxyShimmer 2s ease-in-out infinite'],
    c_biohazard:  ['radial-gradient(circle,#ccff00 0%,#39ff14 30%,#006600 65%,#001a00 100%)',                               '0 0 35px #39ff14', 'voidPulse 1.2s ease-in-out infinite'],
    c_arctic:     ['radial-gradient(circle,#fff 0%,#aaeeff 25%,#00c8ff 55%,#004466 100%)',                                  '0 0 35px #00e5ff', 'galaxyShimmer 3s ease-in-out infinite'],
    c_wildfire:   ['radial-gradient(circle,#fff 0%,#ffff00 20%,#ff6600 50%,#cc0000 75%,#300000 100%)',                     '0 0 35px #ff6600', 'voidPulse 0.9s ease-in-out infinite'],
    c_spectre:    ['radial-gradient(circle,rgba(255,255,255,0.95) 0%,rgba(180,180,255,0.8) 35%,rgba(80,80,200,0.5) 65%,rgba(20,20,80,0.3) 100%)', '0 0 35px rgba(160,160,255,0.9)', 'voidPulse 2.5s ease-in-out infinite'],
    c_supernova:  ['conic-gradient(white,yellow,orange,red,magenta,blue,cyan,white)',                                        '0 0 45px #fff,0 0 80px rgba(255,200,0,0.6)', 'quantumSpin 1.5s linear infinite'],
    c_wraith:     ['radial-gradient(circle,#8800ff 0%,#440088 30%,#1a0033 60%,#000 100%)',                                   '0 0 45px #8800ff,0 0 80px rgba(100,0,255,0.5)', 'voidPulse 2s ease-in-out infinite'],
    c_titan:      ['radial-gradient(circle,#ffe080 0%,#f5a623 30%,#b87333 60%,#3c1a00 100%)',                               '0 0 45px #f5a623', 'celestialGlow 2.5s ease-in-out infinite'],
    c_astral:     ['linear-gradient(135deg,#00e5ff 0%,#7b2ff7 35%,#ff00aa 65%,#00e5ff 100%)',                               '0 0 45px #7b2ff7', 'quantumSpin 4s linear infinite'],
    c_omnichrome: ['conic-gradient(red,orange,yellow,lime,cyan,blue,violet,magenta,red)',                                    '0 0 55px #fff,0 0 90px rgba(255,255,255,0.7)', 'quantumSpin 0.7s linear infinite'],
    c_singularity:['conic-gradient(#ff0080,#00ffff,#8000ff,#ff0080)',                                                       '0 0 55px #7700ff', 'quantumSpin 2s linear infinite'],
    c_ultraviolet:['radial-gradient(circle,#ff88ff 0%,#cc00ff 30%,#6600cc 60%,#200033 100%)',                               '0 0 55px #cc00ff', 'voidPulse 1.5s ease-in-out infinite'],
    c_godmode:    ['radial-gradient(circle,#fff 0%,#fffdd0 20%,#fff59d 50%,#ffd700 80%,#fff 100%)',                         '0 0 55px #fff,0 0 90px rgba(255,215,0,0.8)', 'diamondShine 1.8s ease-in-out infinite'],
    c_rift:       ['linear-gradient(135deg,#000 0%,#1a0044 25%,#ff00aa 50%,#00ffff 75%,#000 100%)',                         '0 0 55px #ff00aa', 'quantumSpin 2.5s linear infinite'],
    // Oblivion skins
    ob_duskblade:   ['radial-gradient(circle,#9055ff 0%,#5a2d8c 40%,#1a0a2e 100%)',                                         '0 0 20px rgba(144,85,255,0.5)',  'voidPulse 2s ease-in-out infinite'],
    ob_voidborn:    ['radial-gradient(circle,#3355cc 0%,#1a2266 40%,#060618 100%)',                                          '0 0 20px rgba(51,85,204,0.5)',   'voidPulse 2.5s ease-in-out infinite'],
    ob_ashwalker:   ['radial-gradient(circle,#8a6040 0%,#4a3020 40%,#1a0f08 100%)',                                          '0 0 18px rgba(138,96,64,0.4)',  ''],
    ob_soulreaper:  ['radial-gradient(circle,#ff3366 0%,#991133 35%,#330011 70%,#0a0003 100%)',                              '0 0 25px rgba(255,51,102,0.6)', 'voidPulse 1.5s ease-in-out infinite'],
    ob_eclipsar:    ['radial-gradient(circle,#ffd700 0%,#664400 30%,#0d1133 60%,#000 100%)',                                 '0 0 25px rgba(255,215,0,0.4)', 'galaxyShimmer 3s ease-in-out infinite'],
    ob_phantomking: ['radial-gradient(circle,#bb88ff 0%,#6633aa 35%,#220055 70%,#0a0018 100%)',                              '0 0 25px rgba(187,136,255,0.5)', 'voidPulse 2s ease-in-out infinite'],
    ob_abyssal:     ['radial-gradient(circle,#2244aa 0%,#0d1133 40%,#020208 100%)',                                          '0 0 30px rgba(34,68,170,0.5)', 'voidPulse 3s ease-in-out infinite'],
    ob_eventide:    ['conic-gradient(from 0deg,#1a0a2e,#2a1a4e,#3a2a6e,#2a1a4e,#1a0a2e)',                                   '0 0 30px rgba(100,60,160,0.4)', 'quantumSpin 5s linear infinite'],
    ob_worldeater:  ['radial-gradient(circle,#ff0000 0%,#660000 30%,#1a0000 60%,#000 100%)',                                 '0 0 35px rgba(255,0,0,0.7)', 'voidPulse 0.8s ease-in-out infinite'],
    ob_eternium:    ['conic-gradient(from 0deg,#ff2060,#8a2be2,#00ccff,#39ff14,#ffd700,#ff2060)',                            '0 0 35px rgba(138,43,226,0.6)', 'quantumSpin 1.2s linear infinite'],
    // new oblivion
    ob_nightcrawler:['radial-gradient(circle,#1a2060 0%,#050520 55%,#000000 100%)',                                         '0 0 20px rgba(30,30,120,0.8)',  'voidPulse 2.5s ease-in-out infinite'],
    ob_ironwraith:  ['radial-gradient(circle,#7090b0 0%,#3d2820 50%,#0a0806 100%)',                                         '0 0 18px rgba(80,120,180,0.7)', 'voidPulse 2s ease-in-out infinite'],
    ob_hellforge:   ['conic-gradient(from 0deg,#550000,#cc3300,#ff6600,#cc3300,#550000)',                                   '0 0 25px rgba(220,80,0,0.8)',   'quantumSpin 2s linear infinite'],
    ob_gravemind:   ['radial-gradient(circle,#f5f0e0 0%,#c8b090 40%,#301808 100%)',                                         '0 0 20px rgba(80,40,20,0.8)',   'voidPulse 3s ease-in-out infinite'],
    ob_voidwalker:  ['radial-gradient(circle,rgba(80,0,160,0.4) 0%,rgba(20,0,60,0.7) 60%,rgba(0,0,0,0.9) 100%)',           '0 0 30px rgba(100,0,200,0.9)', 'quantumSpin 1.8s linear infinite'],
    ob_deathbloom:  ['conic-gradient(from 0deg,#0a0000,#1a0000,#cc0000,#1a0000,#0a0000)',                                   '0 0 28px rgba(200,0,0,0.9)',    'quantumSpin 1.4s linear infinite'],
    ob_apocalypse:  ['conic-gradient(from 0deg,#cc0000,#ff4400,#ffaa00,#440000,#cc0000)',                                   '0 0 40px rgba(255,100,0,0.9)',  'quantumSpin 0.8s linear infinite'],
    // new standard common
    c_moss:         ['radial-gradient(circle,#6aaa50 0%,#3d6e3d 55%,#1a3318 100%)',                                         '0 0 12px #3d6e3d',  ''],
    c_ash:          ['radial-gradient(circle,#e8e0d8 0%,#b0a898 55%,#585048 100%)',                                         '0 0 10px #b0a898',  ''],
    c_dusk:         ['radial-gradient(circle,#5050a0 0%,#2d2050 55%,#10081e 100%)',                                         '0 0 12px #403080',  ''],
    c_clay:         ['radial-gradient(circle,#d4854a 0%,#b5651d 55%,#5a2c08 100%)',                                         '0 0 12px #b5651d',  ''],
    // new standard uncommon
    c_sapphire:     ['linear-gradient(135deg,#4080ff 0%,#1560bd 50%,#072f6e 100%)',                                         '0 0 18px #1560bd',  'galaxyShimmer 3s ease-in-out infinite'],
    c_mint:         ['linear-gradient(135deg,#a0ffe0 0%,#4dffc3 50%,#00cc88 100%)',                                         '0 0 18px #4dffc3',  'galaxyShimmer 3.5s ease-in-out infinite'],
    c_bronze_skin:  ['linear-gradient(135deg,#e8a840 0%,#c07830 50%,#7a4810 100%)',                                         '0 0 18px #c07830',  'galaxyShimmer 3s ease-in-out infinite'],
    c_storm_grey:   ['linear-gradient(135deg,#8090b0 0%,#4a5568 50%,#1a2030 100%)',                                         '0 0 18px #6090d0',  'voidPulse 2.5s ease-in-out infinite'],
    // new standard rare
    c_bloodmoon:    ['radial-gradient(circle,#ff2020 0%,#8b0000 45%,#200000 100%)',                                         '0 0 28px #cc0000',  'voidPulse 1.8s ease-in-out infinite'],
    c_frostfire:    ['linear-gradient(90deg,#00aaff 0%,#0055ff 45%,#ff4400 55%,#ff8800 100%)',                              '0 0 28px #8844ff',  'galaxyShimmer 2s ease-in-out infinite'],
    c_vortex:       ['conic-gradient(from 0deg,#6600ff,#4400aa,#0044ff,#6600ff)',                                           '0 0 28px #5500ee',  'quantumSpin 3s linear infinite'],
    c_toxic_waste:  ['radial-gradient(circle,#aaff00 0%,#39ff14 40%,#003300 100%)',                                         '0 0 28px #39ff14',  'voidPulse 1.5s ease-in-out infinite'],
    // new standard epic
    c_blackhole:    ['conic-gradient(from 0deg,#000000,#110011,#330033,#000000)',                                           '0 0 35px #440044',  'quantumSpin 1.2s linear infinite'],
    c_dragonscale:  ['conic-gradient(from 0deg,#ff2200,#cc4400,#ffaa00,#cc4400,#ff2200)',                                   '0 0 35px #ff6600',  'quantumSpin 1.5s linear infinite'],
    c_hologram:     ['conic-gradient(from 0deg,rgba(0,255,255,0.8),rgba(255,0,255,0.8),rgba(255,255,0,0.8),rgba(0,255,255,0.8))','0 0 35px white','quantumSpin 0.8s linear infinite'],
    c_thunderstrike:['radial-gradient(circle,#ffff00 0%,#f5d800 30%,#ff8800 70%,#220000 100%)',                             '0 0 35px #f5d800',  'quantumSpin 1.0s linear infinite'],
    // new standard legendary
    c_eclipse:      ['radial-gradient(circle,#ffd700 0%,#c07000 15%,#050505 40%,#ffd700 80%,#050505 100%)',                 '0 0 45px #ffd700',  'quantumSpin 2s linear infinite'],
    c_abyssal_flame:['conic-gradient(from 0deg,#000820,#001860,#0044aa,#0088ff,#001860,#000820)',                           '0 0 45px #0066ff',  'quantumSpin 1.8s linear infinite'],
    c_zero_point:   ['radial-gradient(circle,white 0%,#ccddff 20%,#2200aa 60%,#000000 100%)',                               '0 0 45px white',    'quantumSpin 1.5s linear infinite'],
    // new standard mythic
    c_entropy:      ['conic-gradient(red,orange,yellow,lime,cyan,blue,violet,red)',                                         '0 0 55px white',    'quantumSpin 0.5s linear infinite'],
    c_dimension_rift:['conic-gradient(from 0deg,#0000ff,#ff00ff,#00ffff,#ffffff,#ff00ff,#0000ff)',                          '0 0 55px #aa00ff',  'quantumSpin 0.6s linear infinite'],
    c_eternal:      ['radial-gradient(circle,#fffacc 0%,#ffd700 40%,#c09000 70%,#402000 100%)',                             '0 0 55px #ffd700',  'voidPulse 2s ease-in-out infinite'],
    // neon crate
    neon_pulse:     ['linear-gradient(135deg,#80e8ff 0%,#00b4ff 50%,#0055aa 100%)',                                         '0 0 22px #00b4ff',  'voidPulse 1.8s ease-in-out infinite'],
    neon_grid:      ['linear-gradient(135deg,#80fff0 0%,#00ffcc 50%,#00aa88 100%)',                                         '0 0 22px #00ffcc',  'galaxyShimmer 2.5s ease-in-out infinite'],
    neon_surge:     ['conic-gradient(from 0deg,#0088ff,#00ffff,#00ff88,#0088ff)',                                           '0 0 28px #00ffcc',  'quantumSpin 2.5s linear infinite'],
    neon_cipher:    ['radial-gradient(circle,#00ff88 0%,#00aa44 40%,#002200 100%)',                                         '0 0 28px #00ff88',  'voidPulse 1.5s ease-in-out infinite'],
    neon_overload:  ['conic-gradient(from 0deg,#ff00ff,#00ffff,#ffff00,#ff0088,#ff00ff)',                                   '0 0 35px #ff00ff',  'quantumSpin 0.9s linear infinite'],
    neon_synthwave: ['linear-gradient(180deg,#ff6ec7 0%,#ff4488 30%,#aa00ff 60%,#0033ff 100%)',                             '0 0 45px #ff4488',  'quantumSpin 2s linear infinite'],
    // frost crate
    frost_snowdrift:   ['radial-gradient(circle,#ffffff 0%,#cce8ff 55%,#6699cc 100%)',                                      '0 0 14px #a0d0ff',  ''],
    frost_icicle:      ['linear-gradient(135deg,#d0eeff 0%,#a8d8ea 50%,#5090b0 100%)',                                      '0 0 18px #a8d8ea',  'galaxyShimmer 3s ease-in-out infinite'],
    frost_blizzard:    ['conic-gradient(from 0deg,white,#aaddff,#6699cc,white)',                                            '0 0 28px #aaddff',  'quantumSpin 3s linear infinite'],
    frost_permafrost:  ['radial-gradient(circle,#80bbdd 0%,#2266aa 40%,#001133 100%)',                                      '0 0 28px #4499cc',  'voidPulse 2s ease-in-out infinite'],
    frost_avalanche:   ['conic-gradient(from 0deg,#ffffff,#88ccff,#0044aa,#88ccff,#ffffff)',                                '0 0 35px #88ccff',  'quantumSpin 1.5s linear infinite'],
    frost_absolute_zero:['radial-gradient(circle,rgba(255,255,255,0.9) 0%,rgba(180,220,255,0.7) 40%,rgba(0,80,160,0.5) 100%)','0 0 45px white', 'quantumSpin 2s linear infinite'],
    // infernal crate
    infernal_ember:      ['radial-gradient(circle,#ffaa44 0%,#ff6600 55%,#551100 100%)',                                    '0 0 18px #ff6600',  ''],
    infernal_cinder:     ['radial-gradient(circle,#88807a 0%,#555244 55%,#1a1510 100%)',                                    '0 0 16px #887860',  'voidPulse 2.5s ease-in-out infinite'],
    infernal_wildfire:   ['conic-gradient(from 0deg,#ff4400,#ff8800,#ffcc00,#ff4400)',                                      '0 0 28px #ff6600',  'quantumSpin 2s linear infinite'],
    infernal_eruption:   ['radial-gradient(circle,#ffcc00 0%,#ff4400 40%,#880000 75%,#1a0000 100%)',                        '0 0 28px #ff6600',  'voidPulse 1.5s ease-in-out infinite'],
    infernal_hellstorm:  ['conic-gradient(from 0deg,#ff0000,#aa0000,#ff4400,#ffaa00,#aa0000,#ff0000)',                      '0 0 35px #ff2200',  'quantumSpin 1.0s linear infinite'],
    infernal_solar_flare:['radial-gradient(circle,white 0%,#ffff88 20%,#ffcc00 50%,#ff4400 80%)',                           '0 0 45px white',    'quantumSpin 1.5s linear infinite'],
    // void crate
    void_hollow:        ['radial-gradient(circle,#111111 0%,#050505 60%,#000000 100%)',                                     '0 0 15px rgba(80,0,160,0.5)', ''],
    void_nebula_core:   ['conic-gradient(from 0deg,#0a002a,#220066,#440088,#220066,#0a002a)',                               '0 0 35px #440088',  'quantumSpin 2s linear infinite'],
    void_dark_matter:   ['radial-gradient(circle,rgba(40,0,80,0.6) 0%,rgba(10,0,20,0.9) 100%)',                             '0 0 25px rgba(100,0,200,0.7)', 'voidPulse 3s ease-in-out infinite'],
    void_event_horizon: ['radial-gradient(circle,#000000 0%,#000000 30%,#6600cc 40%,#aa44ff 50%,#000000 60%)',              '0 0 45px #8800ff',  'quantumSpin 1.5s linear infinite'],
    void_big_bang:      ['conic-gradient(from 0deg,white,#ffff00,#ff4400,#aa00ff,#0044ff,#00ffff,white)',                   '0 0 55px white',    'quantumSpin 0.6s linear infinite'],
  };

  const s = styles[skinId];
  if (s) {
    el.style.background = s[0];
    el.style.boxShadow  = s[1];
    if (s[2]) el.style.animation = s[2];
    // c_singularity special filter
    if (skinId === 'c_singularity') el.style.filter = 'brightness(0.3) contrast(3)';
    return;
  }

  // Fallback: convert flat color to a radial gradient orb
  const c = fallbackColor;
  if (c) {
    el.style.background = `radial-gradient(circle at 35% 35%,${c}ee 0%,${c} 55%,${c}88 100%)`;
    el.style.boxShadow  = `0 0 16px ${c}80,0 0 30px ${c}40`;
  } else {
    el.style.background = '#1a1a2e';
    el.style.boxShadow  = '0 0 8px rgba(88,166,255,0.2)';
  }
}

function initShopUI() {
  document.getElementById('shopCoinsVal').textContent = playerCoins;
  // Initialize inventory tab (renders content + wires up filter/sort handlers)
  if (typeof initInventoryTab === 'function') initInventoryTab();
  const grid = document.getElementById('skinGrid');
  if (!grid) return; // Inventory tab replaces skins tab
  grid.innerHTML = '';

 // Also initialize crates tab
  if (typeof initCratesTab === 'function') {
    initCratesTab();
  }

 // Also initialize battle pass tab
  if (typeof initBattlePassTab === 'function') {
    initBattlePassTab();
  }

  // Sort regular purchasable skins by price (lowest to highest) before rendering
  const regularSkinsOrdered = SKINS
    .filter(s => !s.crateOnly && !s.achievementOnly && s.battlePassTier === undefined && s.price !== -1)
    .sort((a, b) => a.price - b.price);

  for (const skin of regularSkinsOrdered) {
    const copyCount = ownedSkins.filter(s => s === skin.id).length;
    const owned = copyCount > 0;
    const active = activeSkin === skin.id;
    const isChampion = false; // Champions filtered out above (price === -1)

    const card = document.createElement('div');
    card.className = 'skin-card' + (active ? ' active' : '') + (owned ? ' owned' : '');

    // Preview circle — use the shared rich skin preview function
    const preview = document.createElement('div');
    preview.className = 'skin-preview';
    if (skin.id === 'icon_keegan_baseball') {
      _drawBaseballPreview(preview);
    } else {
      applyRichSkinPreview(preview, skin.id, skin.color);
    }

    const name = document.createElement('div');
    name.className = 'skin-name';
    name.textContent = skin.name;

    const desc = document.createElement('div');
    desc.className = 'skin-desc';
    desc.textContent = skin.desc;

    const btn = document.createElement('button');
    btn.className = 'skin-btn';
    if (active) {
      btn.textContent = copyCount > 1 ? `✓ Equipped (×${copyCount})` : '✓ Equipped';
      btn.disabled = true;
    } else if (owned) {
      btn.textContent = copyCount > 1 ? `Equip (×${copyCount})` : 'Equip';
      btn.onclick = () => { activeSkin = skin.id; saveSkins(); initShopUI(); };
    } else if (isChampion) {
 // Champion skins - not purchasable
      btn.textContent = '🏆 LEADERBOARD EXCLUSIVE';
      btn.disabled = true;
      btn.style.fontSize = '11px';
      btn.style.background = 'rgba(255,215,0,0.2)';
      btn.style.border = '2px solid rgba(255,215,0,0.5)';
    } else {
      btn.textContent = `🪙 ${skin.price}`;
      btn.disabled = playerCoins < skin.price;
      btn.onclick = () => {
        if (playerCoins >= skin.price) {
          playerCoins -= skin.price;
          ownedSkins.push(skin.id);
          activeSkin = skin.id;
          saveCoins();
          saveSkins();
          initShopUI();
        }
      };
    }

    card.appendChild(preview);
    card.appendChild(name);
    card.appendChild(desc);
    card.appendChild(btn);
    grid.appendChild(card);
  }

  // ── Champion Skins Section ────────────────────────────────────────────
  // These are earned exclusively through leaderboard placement.
  // They are NOT tradeable on the Marketplace — ever.
  const champSkins = SKINS.filter(s => s.price === -1);
  if (champSkins.length > 0) {
    const champHeader = document.createElement('div');
    champHeader.style.cssText = `
      grid-column: 1 / -1;
      text-align: center;
      padding: 18px 12px 10px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 2px;
      color: #ffd700;
      border-top: 2px solid rgba(255,215,0,0.3);
      margin-top: 14px;
      text-transform: uppercase;
      background: linear-gradient(180deg, rgba(255,215,0,0.04) 0%, transparent 100%);
      border-radius: 8px 8px 0 0;
    `;
    champHeader.innerHTML = '🏆 Champion Skins &mdash; Leaderboard Exclusive &mdash; Not Tradeable';
    grid.appendChild(champHeader);

    const champSubtitle = document.createElement('div');
    champSubtitle.style.cssText = `
      grid-column: 1 / -1;
      text-align: center;
      font-size: 11px;
      color: rgba(255,215,0,0.55);
      letter-spacing: 1px;
      margin-bottom: 6px;
      margin-top: -4px;
    `;
    champSubtitle.textContent = 'Awarded to the top 3 global leaderboard players each season';
    grid.appendChild(champSubtitle);

    // Apply champion preview style using a direct approach
    function applyChampionPreview(preview, skinId) {
      if (skinId === 'gold-champion') {
        preview.style.background = 'radial-gradient(circle, #ffd700 0%, #ffed4e 40%, #ffffff 60%, #ffd700 100%)';
        preview.style.boxShadow  = '0 0 30px #ffd700, inset 0 0 25px rgba(255,255,255,0.8)';
        preview.style.animation  = 'championPulse 2s ease-in-out infinite';
      } else if (skinId === 'silver-champion') {
        preview.style.background = 'radial-gradient(circle, #c0c0c0 0%, #e8e8e8 40%, #ffffff 60%, #c0c0c0 100%)';
        preview.style.boxShadow  = '0 0 30px #c0c0c0, inset 0 0 25px rgba(255,255,255,0.8)';
        preview.style.animation  = 'championPulse 2.2s ease-in-out infinite';
      } else if (skinId === 'bronze-champion') {
        preview.style.background = 'radial-gradient(circle, #cd7f32 0%, #e8a87c 40%, #f5d0a9 60%, #cd7f32 100%)';
        preview.style.boxShadow  = '0 0 30px #cd7f32, inset 0 0 25px rgba(255,200,150,0.8)';
        preview.style.animation  = 'championPulse 2.4s ease-in-out infinite';
      }
    }

    const rankLabels = {
      'gold-champion':   { label: '🥇 1st Place',   color: '#ffd700' },
      'silver-champion': { label: '🥈 2nd Place',   color: '#c0c0c0' },
      'bronze-champion': { label: '🥉 3rd Place',   color: '#cd7f32' },
    };

    for (const skin of champSkins) {
      const owned  = ownedSkins.includes(skin.id);
      const active = activeSkin === skin.id;
      const rank   = rankLabels[skin.id] || { label: '🏆 Champion', color: '#ffd700' };

      const card = document.createElement('div');
      card.className = 'skin-card' + (active ? ' active' : '') + (owned ? ' owned' : '');
      card.style.borderColor = owned ? rank.color : 'rgba(255,215,0,0.2)';
      card.style.background  = owned
        ? `linear-gradient(145deg, rgba(255,215,0,0.08) 0%, rgba(0,0,0,0) 100%)`
        : 'rgba(20,18,14,0.5)';
      if (!owned) card.style.opacity = '0.6';

      const preview = document.createElement('div');
      preview.className = 'skin-preview';
      applyChampionPreview(preview, skin.id);

      const name = document.createElement('div');
      name.className = 'skin-name';
      name.textContent = skin.name;

      const rankTag = document.createElement('div');
      rankTag.className = 'skin-desc';
      rankTag.textContent = rank.label + ' · Season Reward';
      rankTag.style.color      = rank.color;
      rankTag.style.fontWeight = '700';
      rankTag.style.fontSize   = '10px';

      const btn = document.createElement('button');
      btn.className = 'skin-btn';
      if (active) {
        btn.textContent = '✓ Equipped';
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = 'Equip';
        btn.onclick = () => { activeSkin = skin.id; saveSkins(); initShopUI(); };
      } else {
        btn.textContent = '🏆 LEADERBOARD EXCLUSIVE';
        btn.disabled = true;
        btn.style.cssText = `
          font-size: 10px;
          background: rgba(255,215,0,0.08);
          border: 1px solid rgba(255,215,0,0.3);
          color: rgba(255,215,0,0.6);
          cursor: default;
          letter-spacing: 0.5px;
        `;
      }

      // Non-tradeable badge
      const noBadge = document.createElement('div');
      noBadge.style.cssText = `
        font-size: 9px;
        color: rgba(255,100,100,0.6);
        text-align: center;
        margin-top: 3px;
        letter-spacing: 0.5px;
      `;
      noBadge.textContent = '⛔ Cannot be traded';

      card.appendChild(preview);
      card.appendChild(name);
      card.appendChild(rankTag);
      card.appendChild(btn);
      card.appendChild(noBadge);
      grid.appendChild(card);
    }
  }

  // Rarity display order for the crate section
  const crateRarityOrder = ['common','uncommon','rare','epic','legendary','mythic'];
  const crateRarityColors = {
    common:'#78b7ff', uncommon:'#9d7aff', rare:'#ff78b7',
    epic:'#ff9d47', legendary:'#ffd700', mythic:'#ff69ff'
  };
  const crateRarityLabels = {
    common:'COMMON', uncommon:'UNCOMMON', rare:'RARE',
    epic:'EPIC', legendary:'LEGENDARY', mythic:'MYTHIC'
  };
 // Map skin id → rarity using SKIN_RARITIES from crate-system.js
  const crateRarityMap = {};
  if (typeof SKIN_RARITIES !== 'undefined') {
    for (const [rarity, ids] of Object.entries(SKIN_RARITIES)) {
      for (const id of ids) crateRarityMap[id] = rarity;
    }
  }

  // Group skins by which crate they can actually drop from (based on each crate's rarityWeights).
  // Common Crate     (common/uncommon/rare weights)        → common + uncommon + rare skins
  // Rare Crate       (common/uncommon/rare/epic weights)   → common + uncommon + rare + epic skins
  // Epic Crate       (uncommon/rare/epic/legendary weights)→ uncommon + rare + epic + legendary skins
  // Legendary Crate  (rare/epic/legendary/mythic weights)  → rare + epic + legendary + mythic skins
  // Icon Crate       → icon skins
  // Oblivion Crate   → ob_* skins
  const SR = (typeof SKIN_RARITIES !== 'undefined') ? SKIN_RARITIES : { common:[], uncommon:[], rare:[], epic:[], legendary:[], mythic:[] };
  // Show all skins that can drop from each crate (crateOnly exclusives + shop skins added to pool)
  const commonCrateSkins    = SKINS.filter(s => !s.iconSkin && !s.battlePassTier && [...SR.common, ...SR.uncommon, ...SR.rare].includes(s.id));
  const rareCrateSkins      = SKINS.filter(s => !s.iconSkin && !s.battlePassTier && [...SR.common, ...SR.uncommon, ...SR.rare, ...SR.epic].includes(s.id));
  const epicCrateSkins      = SKINS.filter(s => !s.iconSkin && !s.battlePassTier && [...SR.uncommon, ...SR.rare, ...SR.epic, ...SR.legendary].includes(s.id));
  const legendaryCrateSkins = SKINS.filter(s => !s.iconSkin && !s.battlePassTier && [...SR.rare, ...SR.epic, ...SR.legendary, ...SR.mythic].includes(s.id));
  const oblivionCrateSkins  = SKINS.filter(s => s.crateOnly && !s.iconSkin && !s.battlePassTier && s.id.startsWith('ob_'));

  // Sort each group by rarity tier (cheapest/lowest rarity first)
  const sortByRarity = arr => arr.sort((a, b) => {
    const ri = r => crateRarityOrder.indexOf(crateRarityMap[r] || 'common');
    return ri(a.id) - ri(b.id);
  });
  sortByRarity(commonCrateSkins);
  sortByRarity(rareCrateSkins);
  sortByRarity(epicCrateSkins);
  sortByRarity(legendaryCrateSkins);

 // Animated preview helpers for crate skins
  function setCrateSkinPreview(preview, skinId) {
    const animated = {
 // COMMON
      c_static:    () => { preview.style.background = 'radial-gradient(circle, #c8c8dc 0%, #808090 60%, #404050 100%)'; preview.style.boxShadow = '0 0 10px #b8b8cc'; },
      c_rust:      () => { preview.style.background = 'radial-gradient(circle, #c06030 0%, #8b4513 55%, #4a2008 100%)'; preview.style.boxShadow = '0 0 12px #8b4513'; },
      c_slate:     () => { preview.style.background = 'radial-gradient(circle, #8090a0 0%, #607080 55%, #303840 100%)'; preview.style.boxShadow = '0 0 10px #708090'; },
      c_olive:     () => { preview.style.background = 'radial-gradient(circle, #9ab040 0%, #6b8e23 55%, #344010 100%)'; preview.style.boxShadow = '0 0 12px #6b8e23'; },
      c_maroon:    () => { preview.style.background = 'radial-gradient(circle, #cc3050 0%, #9b2335 55%, #4a0f1a 100%)'; preview.style.boxShadow = '0 0 12px #9b2335'; },
 // UNCOMMON
      c_cobalt:    () => { preview.style.background = 'radial-gradient(circle, #3080ff 0%, #0047ab 55%, #001a60 100%)'; preview.style.boxShadow = '0 0 18px #3080ff'; },
      c_teal:      () => { preview.style.background = 'radial-gradient(circle, #00c8b0 0%, #00897b 55%, #003830 100%)'; preview.style.boxShadow = '0 0 18px #00c8b0'; },
      c_coral:     () => { preview.style.background = 'radial-gradient(circle, #ff9080 0%, #ff6f61 55%, #a02010 100%)'; preview.style.boxShadow = '0 0 18px #ff6f61'; },
      c_sand:      () => { preview.style.background = 'radial-gradient(circle, #e0c870 0%, #c2a25a 55%, #6a5020 100%)'; preview.style.boxShadow = '0 0 16px #c2a25a'; },
      c_chrome:    () => { preview.style.background = 'linear-gradient(135deg, #666 0%, #ddd 25%, #999 50%, #fff 75%, #888 100%)'; preview.style.boxShadow = '0 0 22px #ccc'; preview.style.animation = 'quantumSpin 3s linear infinite'; },
 // RARE
      c_prism:     () => { preview.style.background = 'conic-gradient(red,orange,yellow,green,cyan,blue,violet,red)'; preview.style.boxShadow = '0 0 28px white'; preview.style.animation = 'quantumSpin 2s linear infinite'; },
      c_aurora:    () => { preview.style.background = 'linear-gradient(180deg, #00ff99 0%, #00aaff 40%, #9900cc 100%)'; preview.style.boxShadow = '0 0 28px #00ff99'; preview.style.animation = 'galaxyShimmer 2.5s ease-in-out infinite'; },
      c_lava:      () => { preview.style.background = 'radial-gradient(circle, #ffcc00 0%, #ff4500 45%, #cc0000 75%, #440000 100%)'; preview.style.boxShadow = '0 0 28px #ff4500'; preview.style.animation = 'voidPulse 1.5s ease-in-out infinite'; },
      c_storm:     () => { preview.style.background = 'radial-gradient(circle, #c0d8ff 0%, #4080ff 35%, #0020a0 65%, #000820 100%)'; preview.style.boxShadow = '0 0 28px #4080ff'; preview.style.animation = 'voidPulse 2s ease-in-out infinite'; },
      c_neon:      () => { preview.style.background = 'linear-gradient(135deg, #ff00cc 0%, #00ffff 50%, #ff00cc 100%)'; preview.style.boxShadow = '0 0 28px #ff00cc, 0 0 50px rgba(0,255,255,0.5)'; preview.style.animation = 'quantumSpin 3s linear infinite'; },
 // EPIC
      c_glitch:    () => { preview.style.background = 'conic-gradient(#ff0080,#00ffff,#ff0000,#00ff00,#ff00ff,#0000ff,#ff0080)'; preview.style.boxShadow = '0 0 35px #ff0080, 0 0 60px rgba(0,255,255,0.5)'; preview.style.animation = 'quantumSpin 0.6s linear infinite'; },
      c_nebula:    () => { preview.style.background = 'radial-gradient(circle at 40% 35%, #ff80cc 0%, #9922cc 35%, #220066 65%, #110033 100%)'; preview.style.boxShadow = '0 0 35px #9922cc, 0 0 60px rgba(255,80,200,0.4)'; preview.style.animation = 'galaxyShimmer 2s ease-in-out infinite'; },
      c_biohazard: () => { preview.style.background = 'radial-gradient(circle, #ccff00 0%, #39ff14 30%, #006600 65%, #001a00 100%)'; preview.style.boxShadow = '0 0 35px #39ff14, 0 0 60px rgba(57,255,20,0.4)'; preview.style.animation = 'voidPulse 1.2s ease-in-out infinite'; },
      c_arctic:    () => { preview.style.background = 'radial-gradient(circle, #ffffff 0%, #aaeeff 25%, #00c8ff 55%, #004466 100%)'; preview.style.boxShadow = '0 0 35px #00e5ff, 0 0 60px rgba(170,238,255,0.5)'; preview.style.animation = 'galaxyShimmer 3s ease-in-out infinite'; },
      c_wildfire:  () => { preview.style.background = 'radial-gradient(circle, #ffffff 0%, #ffff00 20%, #ff6600 50%, #cc0000 75%, #300000 100%)'; preview.style.boxShadow = '0 0 35px #ff6600, 0 0 60px rgba(255,100,0,0.5)'; preview.style.animation = 'voidPulse 0.9s ease-in-out infinite'; },
      c_spectre:   () => { preview.style.background = 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(180,180,255,0.8) 35%, rgba(80,80,200,0.5) 65%, rgba(20,20,80,0.3) 100%)'; preview.style.boxShadow = '0 0 35px rgba(160,160,255,0.9), 0 0 60px rgba(100,100,200,0.5)'; preview.style.animation = 'voidPulse 2.5s ease-in-out infinite'; },
 // LEGENDARY
      c_supernova: () => { preview.style.background = 'conic-gradient(white,yellow,orange,red,magenta,blue,cyan,white)'; preview.style.boxShadow = '0 0 45px white, 0 0 80px rgba(255,200,0,0.6)'; preview.style.animation = 'quantumSpin 1.5s linear infinite'; },
      c_wraith:    () => { preview.style.background = 'radial-gradient(circle, #8800ff 0%, #440088 30%, #1a0033 60%, #000000 100%)'; preview.style.boxShadow = '0 0 45px #8800ff, 0 0 80px rgba(100,0,255,0.5), inset 0 0 30px rgba(150,0,255,0.4)'; preview.style.animation = 'voidPulse 2s ease-in-out infinite'; },
      c_titan:     () => { preview.style.background = 'radial-gradient(circle, #ffe080 0%, #f5a623 30%, #b87333 60%, #3c1a00 100%)'; preview.style.boxShadow = '0 0 45px #f5a623, 0 0 80px rgba(245,166,35,0.5)'; preview.style.animation = 'celestialGlow 2.5s ease-in-out infinite'; },
      c_astral:    () => { preview.style.background = 'linear-gradient(135deg, #00e5ff 0%, #7b2ff7 35%, #ff00aa 65%, #00e5ff 100%)'; preview.style.boxShadow = '0 0 45px #7b2ff7, 0 0 80px rgba(0,229,255,0.5)'; preview.style.animation = 'quantumSpin 4s linear infinite'; },
 // MYTHIC
      c_omnichrome:()=> { preview.style.background = 'conic-gradient(red,orange,yellow,lime,cyan,blue,violet,magenta,red)'; preview.style.boxShadow = '0 0 55px white, 0 0 90px rgba(255,255,255,0.7)'; preview.style.animation = 'quantumSpin 0.7s linear infinite'; },
      c_singularity:()=>{ preview.style.background = 'radial-gradient(circle, #000000 0%, #0d0020 20%, conic-gradient(from 0deg,#ff0080,#00ffff,#8000ff,#ff0080) 60%)'; preview.style.background = 'conic-gradient(#ff0080,#00ffff,#8000ff,#ff0080)'; preview.style.filter = 'brightness(0.3) contrast(3)'; preview.style.boxShadow = '0 0 55px #7700ff, 0 0 90px rgba(120,0,255,0.6)'; preview.style.animation = 'quantumSpin 2s linear infinite'; },
      c_ultraviolet:()=>{ preview.style.background = 'radial-gradient(circle, #ff88ff 0%, #cc00ff 30%, #6600cc 60%, #200033 100%)'; preview.style.boxShadow = '0 0 55px #cc00ff, 0 0 90px rgba(200,0,255,0.6)'; preview.style.animation = 'voidPulse 1.5s ease-in-out infinite'; },
      c_godmode:   ()=> { preview.style.background = 'radial-gradient(circle, #ffffff 0%, #fffdd0 20%, #fff59d 50%, #ffd700 80%, #fff 100%)'; preview.style.boxShadow = '0 0 55px white, 0 0 90px rgba(255,215,0,0.8), 0 0 130px rgba(255,255,255,0.4)'; preview.style.animation = 'diamondShine 1.8s ease-in-out infinite'; },
      c_rift:      ()=> { preview.style.background = 'linear-gradient(135deg, #000 0%, #1a0044 25%, #ff00aa 50%, #00ffff 75%, #000 100%)'; preview.style.boxShadow = '0 0 55px #ff00aa, 0 0 90px rgba(0,255,255,0.5)'; preview.style.animation = 'quantumSpin 2.5s linear infinite'; },
 // OBLIVION CRATE
      ob_duskblade:   ()=> { preview.style.background = 'radial-gradient(circle, #9055ff 0%, #5a2d8c 40%, #1a0a2e 100%)'; preview.style.boxShadow = '0 0 20px rgba(144,85,255,0.5)'; preview.style.animation = 'voidPulse 2s ease-in-out infinite'; },
      ob_voidborn:    ()=> { preview.style.background = 'radial-gradient(circle, #3355cc 0%, #1a2266 40%, #060618 100%)'; preview.style.boxShadow = '0 0 20px rgba(51,85,204,0.5)'; preview.style.animation = 'voidPulse 2.5s ease-in-out infinite'; },
      ob_ashwalker:   ()=> { preview.style.background = 'radial-gradient(circle, #8a6040 0%, #4a3020 40%, #1a0f08 100%)'; preview.style.boxShadow = '0 0 18px rgba(138,96,64,0.4)'; },
      ob_soulreaper:  ()=> { preview.style.background = 'radial-gradient(circle, #ff3366 0%, #991133 35%, #330011 70%, #0a0003 100%)'; preview.style.boxShadow = '0 0 25px rgba(255,51,102,0.6)'; preview.style.animation = 'voidPulse 1.5s ease-in-out infinite'; },
      ob_eclipsar:    ()=> { preview.style.background = 'radial-gradient(circle, #ffd700 0%, #664400 30%, #0d1133 60%, #000 100%)'; preview.style.boxShadow = '0 0 25px rgba(255,215,0,0.4), 0 0 40px rgba(13,17,51,0.6)'; preview.style.animation = 'galaxyShimmer 3s ease-in-out infinite'; },
      ob_phantomking: ()=> { preview.style.background = 'radial-gradient(circle, #bb88ff 0%, #6633aa 35%, #220055 70%, #0a0018 100%)'; preview.style.boxShadow = '0 0 25px rgba(187,136,255,0.5)'; preview.style.animation = 'voidPulse 2s ease-in-out infinite'; },
      ob_abyssal:     ()=> { preview.style.background = 'radial-gradient(circle, #2244aa 0%, #0d1133 40%, #020208 100%)'; preview.style.boxShadow = '0 0 30px rgba(34,68,170,0.5)'; preview.style.animation = 'voidPulse 3s ease-in-out infinite'; preview.style.border = '2px solid rgba(34,68,170,0.4)'; },
      ob_eventide:    ()=> { preview.style.background = 'conic-gradient(from 0deg, #1a0a2e, #2a1a4e, #3a2a6e, #2a1a4e, #1a0a2e)'; preview.style.boxShadow = '0 0 30px rgba(100,60,160,0.4)'; preview.style.animation = 'quantumSpin 5s linear infinite'; preview.style.border = '2px solid rgba(100,60,160,0.3)'; },
      ob_worldeater:  ()=> { preview.style.background = 'radial-gradient(circle, #ff0000 0%, #660000 30%, #1a0000 60%, #000 100%)'; preview.style.boxShadow = '0 0 35px rgba(255,0,0,0.7), 0 0 60px rgba(255,0,0,0.3)'; preview.style.animation = 'voidPulse 0.8s ease-in-out infinite'; preview.style.border = '2px solid rgba(255,0,0,0.5)'; },
      ob_eternium:    ()=> { preview.style.background = 'conic-gradient(from 0deg, #ff2060, #8a2be2, #00ccff, #39ff14, #ffd700, #ff2060)'; preview.style.boxShadow = '0 0 35px rgba(138,43,226,0.6), 0 0 60px rgba(255,255,255,0.3)'; preview.style.animation = 'quantumSpin 1.2s linear infinite'; preview.style.border = '2px solid rgba(255,255,255,0.5)'; },
      // New Oblivion skins
      ob_nightcrawler: ()=> { preview.style.background = 'radial-gradient(circle,#1a2060 0%,#050520 55%,#000000 100%)'; preview.style.boxShadow = '0 0 20px rgba(30,30,120,0.8)'; preview.style.animation = 'voidPulse 2.5s ease-in-out infinite'; preview.style.border = '2px solid rgba(30,30,120,0.5)'; },
      ob_ironwraith:   ()=> { preview.style.background = 'radial-gradient(circle,#7090b0 0%,#3d2820 50%,#0a0806 100%)'; preview.style.boxShadow = '0 0 18px rgba(80,120,180,0.7)'; preview.style.animation = 'voidPulse 2s ease-in-out infinite'; preview.style.border = '2px solid rgba(80,120,180,0.4)'; },
      ob_hellforge:    ()=> { preview.style.background = 'conic-gradient(from 0deg,#550000,#cc3300,#ff6600,#cc3300,#550000)'; preview.style.boxShadow = '0 0 25px rgba(220,80,0,0.8)'; preview.style.animation = 'quantumSpin 2s linear infinite'; preview.style.border = '2px solid rgba(220,80,0,0.5)'; },
      ob_gravemind:    ()=> { preview.style.background = 'radial-gradient(circle,#f5f0e0 0%,#c8b090 40%,#301808 100%)'; preview.style.boxShadow = '0 0 20px rgba(80,40,20,0.8)'; preview.style.animation = 'voidPulse 3s ease-in-out infinite'; preview.style.border = '2px solid rgba(80,40,20,0.5)'; },
      ob_voidwalker:   ()=> { preview.style.background = 'radial-gradient(circle,rgba(80,0,160,0.4) 0%,rgba(20,0,60,0.7) 60%,rgba(0,0,0,0.9) 100%)'; preview.style.boxShadow = '0 0 30px rgba(100,0,200,0.9)'; preview.style.animation = 'quantumSpin 1.8s linear infinite'; preview.style.border = '2px solid rgba(100,0,200,0.6)'; },
      ob_deathbloom:   ()=> { preview.style.background = 'conic-gradient(from 0deg,#0a0000,#1a0000,#cc0000,#1a0000,#0a0000)'; preview.style.boxShadow = '0 0 28px rgba(200,0,0,0.9)'; preview.style.animation = 'quantumSpin 1.4s linear infinite'; preview.style.border = '2px solid rgba(200,0,0,0.6)'; },
      ob_apocalypse:   ()=> { preview.style.background = 'conic-gradient(from 0deg,#cc0000,#ff4400,#ffaa00,#440000,#cc0000)'; preview.style.boxShadow = '0 0 40px rgba(255,100,0,0.9), 0 0 60px rgba(200,0,0,0.5)'; preview.style.animation = 'quantumSpin 0.8s linear infinite'; preview.style.border = '2px solid rgba(255,100,0,0.6)'; },
      // Standard crate skins — Common
      c_moss:          ()=> { preview.style.background = 'radial-gradient(circle,#6aaa50 0%,#3d6e3d 55%,#1a3318 100%)'; preview.style.boxShadow = '0 0 10px #3d6e3d'; },
      c_ash:           ()=> { preview.style.background = 'radial-gradient(circle,#e8e0d8 0%,#b0a898 55%,#585048 100%)'; preview.style.boxShadow = '0 0 10px #b0a898'; },
      c_dusk:          ()=> { preview.style.background = 'radial-gradient(circle,#5050a0 0%,#2d2050 55%,#10081e 100%)'; preview.style.boxShadow = '0 0 10px #403080'; },
      c_clay:          ()=> { preview.style.background = 'radial-gradient(circle,#d4854a 0%,#b5651d 55%,#5a2c08 100%)'; preview.style.boxShadow = '0 0 10px #b5651d'; },
      // Standard crate skins — Uncommon
      c_sapphire:      ()=> { preview.style.background = 'linear-gradient(135deg,#4080ff 0%,#1560bd 50%,#072f6e 100%)'; preview.style.boxShadow = '0 0 15px #1560bd'; preview.style.animation = 'galaxyShimmer 3s ease-in-out infinite'; },
      c_mint:          ()=> { preview.style.background = 'linear-gradient(135deg,#a0ffe0 0%,#4dffc3 50%,#00cc88 100%)'; preview.style.boxShadow = '0 0 15px #4dffc3'; preview.style.animation = 'galaxyShimmer 3.5s ease-in-out infinite'; },
      c_bronze_skin:   ()=> { preview.style.background = 'linear-gradient(135deg,#e8a840 0%,#c07830 50%,#7a4810 100%)'; preview.style.boxShadow = '0 0 15px #c07830'; preview.style.animation = 'galaxyShimmer 3s ease-in-out infinite'; },
      c_storm_grey:    ()=> { preview.style.background = 'linear-gradient(135deg,#8090b0 0%,#4a5568 50%,#1a2030 100%)'; preview.style.boxShadow = '0 0 15px #6090d0'; preview.style.animation = 'voidPulse 2.5s ease-in-out infinite'; },
      // Standard crate skins — Rare
      c_bloodmoon:     ()=> { preview.style.background = 'radial-gradient(circle,#ff2020 0%,#8b0000 45%,#200000 100%)'; preview.style.boxShadow = '0 0 20px #cc0000'; preview.style.animation = 'voidPulse 1.8s ease-in-out infinite'; },
      c_frostfire:     ()=> { preview.style.background = 'linear-gradient(90deg,#00aaff 0%,#0055ff 45%,#ff4400 55%,#ff8800 100%)'; preview.style.boxShadow = '0 0 20px #8844ff'; preview.style.animation = 'galaxyShimmer 2s ease-in-out infinite'; },
      c_vortex:        ()=> { preview.style.background = 'conic-gradient(from 0deg,#6600ff,#4400aa,#0044ff,#6600ff)'; preview.style.boxShadow = '0 0 20px #5500ee'; preview.style.animation = 'quantumSpin 3s linear infinite'; },
      c_toxic_waste:   ()=> { preview.style.background = 'radial-gradient(circle,#aaff00 0%,#39ff14 40%,#003300 100%)'; preview.style.boxShadow = '0 0 20px #39ff14'; preview.style.animation = 'voidPulse 1.5s ease-in-out infinite'; },
      // Standard crate skins — Epic
      c_blackhole:     ()=> { preview.style.background = 'conic-gradient(from 0deg,#000000,#110011,#330033,#000000)'; preview.style.boxShadow = '0 0 25px #440044'; preview.style.animation = 'quantumSpin 1.2s linear infinite'; },
      c_dragonscale:   ()=> { preview.style.background = 'conic-gradient(from 0deg,#ff2200,#cc4400,#ffaa00,#cc4400,#ff2200)'; preview.style.boxShadow = '0 0 25px #ff6600'; preview.style.animation = 'quantumSpin 1.5s linear infinite'; },
      c_hologram:      ()=> { preview.style.background = 'conic-gradient(from 0deg,rgba(0,255,255,0.8),rgba(255,0,255,0.8),rgba(255,255,0,0.8),rgba(0,255,255,0.8))'; preview.style.boxShadow = '0 0 25px white'; preview.style.animation = 'quantumSpin 0.8s linear infinite'; },
      c_thunderstrike: ()=> { preview.style.background = 'radial-gradient(circle,#ffff00 0%,#f5d800 30%,#ff8800 70%,#220000 100%)'; preview.style.boxShadow = '0 0 25px #f5d800'; preview.style.animation = 'quantumSpin 1.0s linear infinite'; },
      // Standard crate skins — Legendary
      c_eclipse:       ()=> { preview.style.background = 'radial-gradient(circle,#ffd700 0%,#c07000 15%,#050505 40%,#ffd700 80%,#050505 100%)'; preview.style.boxShadow = '0 0 30px #ffd700'; preview.style.animation = 'quantumSpin 2s linear infinite'; },
      c_abyssal_flame: ()=> { preview.style.background = 'conic-gradient(from 0deg,#000820,#001860,#0044aa,#0088ff,#001860,#000820)'; preview.style.boxShadow = '0 0 30px #0066ff'; preview.style.animation = 'quantumSpin 1.8s linear infinite'; },
      c_zero_point:    ()=> { preview.style.background = 'radial-gradient(circle,white 0%,#ccddff 20%,#2200aa 60%,#000000 100%)'; preview.style.boxShadow = '0 0 30px white'; preview.style.animation = 'quantumSpin 1.5s linear infinite'; },
      // Standard crate skins — Mythic
      c_entropy:         ()=> { preview.style.background = 'conic-gradient(red,orange,yellow,lime,cyan,blue,violet,red)'; preview.style.boxShadow = '0 0 35px white'; preview.style.animation = 'quantumSpin 0.5s linear infinite'; },
      c_dimension_rift:  ()=> { preview.style.background = 'conic-gradient(from 0deg,#0000ff,#ff00ff,#00ffff,#ffffff,#ff00ff,#0000ff)'; preview.style.boxShadow = '0 0 35px #aa00ff'; preview.style.animation = 'quantumSpin 0.6s linear infinite'; },
      c_eternal:         ()=> { preview.style.background = 'radial-gradient(circle,#fffacc 0%,#ffd700 40%,#c09000 70%,#402000 100%)'; preview.style.boxShadow = '0 0 35px #ffd700'; preview.style.animation = 'voidPulse 2s ease-in-out infinite'; },
      // Neon Crate exclusives
      neon_pulse:      ()=> { preview.style.background = 'linear-gradient(135deg,#80e8ff 0%,#00b4ff 50%,#0055aa 100%)'; preview.style.boxShadow = '0 0 20px #00b4ff'; preview.style.animation = 'voidPulse 1.8s ease-in-out infinite'; },
      neon_grid:       ()=> { preview.style.background = 'linear-gradient(135deg,#80fff0 0%,#00ffcc 50%,#00aa88 100%)'; preview.style.boxShadow = '0 0 20px #00ffcc'; preview.style.animation = 'galaxyShimmer 2.5s ease-in-out infinite'; },
      neon_surge:      ()=> { preview.style.background = 'conic-gradient(from 0deg,#0088ff,#00ffff,#00ff88,#0088ff)'; preview.style.boxShadow = '0 0 25px #00ffcc'; preview.style.animation = 'quantumSpin 2.5s linear infinite'; },
      neon_cipher:     ()=> { preview.style.background = 'radial-gradient(circle,#00ff88 0%,#00aa44 40%,#002200 100%)'; preview.style.boxShadow = '0 0 25px #00ff88'; preview.style.animation = 'voidPulse 1.5s ease-in-out infinite'; },
      neon_overload:   ()=> { preview.style.background = 'conic-gradient(from 0deg,#ff00ff,#00ffff,#ffff00,#ff0088,#ff00ff)'; preview.style.boxShadow = '0 0 30px #ff00ff'; preview.style.animation = 'quantumSpin 0.9s linear infinite'; },
      neon_synthwave:  ()=> { preview.style.background = 'linear-gradient(180deg,#ff6ec7 0%,#ff4488 30%,#aa00ff 60%,#0033ff 100%)'; preview.style.boxShadow = '0 0 30px #ff4488'; preview.style.animation = 'quantumSpin 2s linear infinite'; },
      // Frost Crate exclusives
      frost_snowdrift:     ()=> { preview.style.background = 'radial-gradient(circle,#ffffff 0%,#cce8ff 55%,#6699cc 100%)'; preview.style.boxShadow = '0 0 15px #a0d0ff'; },
      frost_icicle:        ()=> { preview.style.background = 'linear-gradient(135deg,#d0eeff 0%,#a8d8ea 50%,#5090b0 100%)'; preview.style.boxShadow = '0 0 15px #a8d8ea'; preview.style.animation = 'galaxyShimmer 3s ease-in-out infinite'; },
      frost_blizzard:      ()=> { preview.style.background = 'conic-gradient(from 0deg,white,#aaddff,#6699cc,white)'; preview.style.boxShadow = '0 0 20px #aaddff'; preview.style.animation = 'quantumSpin 3s linear infinite'; },
      frost_permafrost:    ()=> { preview.style.background = 'radial-gradient(circle,#80bbdd 0%,#2266aa 40%,#001133 100%)'; preview.style.boxShadow = '0 0 20px #4499cc'; preview.style.animation = 'voidPulse 2s ease-in-out infinite'; },
      frost_avalanche:     ()=> { preview.style.background = 'conic-gradient(from 0deg,#ffffff,#88ccff,#0044aa,#88ccff,#ffffff)'; preview.style.boxShadow = '0 0 25px #88ccff'; preview.style.animation = 'quantumSpin 1.5s linear infinite'; },
      frost_absolute_zero: ()=> { preview.style.background = 'radial-gradient(circle,rgba(255,255,255,0.9) 0%,rgba(180,220,255,0.7) 40%,rgba(0,80,160,0.5) 100%)'; preview.style.boxShadow = '0 0 30px white'; preview.style.animation = 'quantumSpin 2s linear infinite'; },
      // Infernal Crate exclusives
      infernal_ember:       ()=> { preview.style.background = 'radial-gradient(circle,#ffaa44 0%,#ff6600 55%,#551100 100%)'; preview.style.boxShadow = '0 0 15px #ff6600'; },
      infernal_cinder:      ()=> { preview.style.background = 'radial-gradient(circle,#88807a 0%,#555244 55%,#1a1510 100%)'; preview.style.boxShadow = '0 0 15px #887860'; preview.style.animation = 'voidPulse 2.5s ease-in-out infinite'; },
      infernal_wildfire:    ()=> { preview.style.background = 'conic-gradient(from 0deg,#ff4400,#ff8800,#ffcc00,#ff4400)'; preview.style.boxShadow = '0 0 20px #ff6600'; preview.style.animation = 'quantumSpin 2s linear infinite'; },
      infernal_eruption:    ()=> { preview.style.background = 'radial-gradient(circle,#ffcc00 0%,#ff4400 40%,#880000 75%,#1a0000 100%)'; preview.style.boxShadow = '0 0 20px #ff6600'; preview.style.animation = 'voidPulse 1.5s ease-in-out infinite'; },
      infernal_hellstorm:   ()=> { preview.style.background = 'conic-gradient(from 0deg,#ff0000,#aa0000,#ff4400,#ffaa00,#aa0000,#ff0000)'; preview.style.boxShadow = '0 0 25px #ff2200'; preview.style.animation = 'quantumSpin 1.0s linear infinite'; },
      infernal_solar_flare: ()=> { preview.style.background = 'radial-gradient(circle,white 0%,#ffff88 20%,#ffcc00 50%,#ff4400 80%)'; preview.style.boxShadow = '0 0 30px white'; preview.style.animation = 'quantumSpin 1.5s linear infinite'; },
      // Void Crate exclusives
      void_hollow:        ()=> { preview.style.background = 'radial-gradient(circle,#111111 0%,#050505 60%,#000000 100%)'; preview.style.boxShadow = '0 0 15px rgba(80,0,160,0.5)'; },
      void_nebula_core:   ()=> { preview.style.background = 'conic-gradient(from 0deg,#0a002a,#220066,#440088,#220066,#0a002a)'; preview.style.boxShadow = '0 0 25px #440088'; preview.style.animation = 'quantumSpin 2s linear infinite'; },
      void_dark_matter:   ()=> { preview.style.background = 'radial-gradient(circle,rgba(40,0,80,0.6) 0%,rgba(10,0,20,0.9) 100%)'; preview.style.boxShadow = '0 0 25px rgba(100,0,200,0.7)'; preview.style.animation = 'voidPulse 3s ease-in-out infinite'; },
      void_event_horizon: ()=> { preview.style.background = 'radial-gradient(circle,#000000 0%,#000000 30%,#6600cc 40%,#aa44ff 50%,#000000 60%)'; preview.style.boxShadow = '0 0 30px #8800ff'; preview.style.animation = 'quantumSpin 1.5s linear infinite'; },
      void_big_bang:      ()=> { preview.style.background = 'conic-gradient(from 0deg,white,#ffff00,#ff4400,#aa00ff,#0044ff,#00ffff,white)'; preview.style.boxShadow = '0 0 35px white'; preview.style.animation = 'quantumSpin 0.6s linear infinite'; },
    };
    if (animated[skinId]) {
      animated[skinId]();
    }
  }

  // Helper: create a section header for a crate
  function makeCrateHeader(icon, label, color, borderColor) {
    const h = document.createElement('div');
    h.style.cssText = `
      grid-column: 1 / -1;
      text-align: center;
      padding: 18px 0 8px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 2px;
      color: ${color};
      border-top: 1px solid ${borderColor};
      margin-top: 10px;
      text-transform: uppercase;
    `;
    h.textContent = `${icon} ${label}`;
    return h;
  }

  // Helper: render a list of crate skins into the grid
  function renderCrateSkinList(skinList, buttonLabel) {
    for (const skin of skinList) {
      const owned = ownedSkins.includes(skin.id);
      const active = activeSkin === skin.id;
      const rarity = crateRarityMap[skin.id] || (skin.id.startsWith('ob_') ? 'ob_epic' : 'common');
      // For ob_* skins use oblivion rarity colors, otherwise standard
      let rarityColor, rarityLabel;
      if (skin.id.startsWith('ob_')) {
        const obColors = { ob_epic:'#9055ff', ob_legendary:'#c44dff', ob_mythic:'#e040fb', ob_ultra:'#ff2060' };
        const obLabels = { ob_epic:'EPIC', ob_legendary:'LEGENDARY', ob_mythic:'MYTHIC', ob_ultra:'ULTRA RARE' };
        // Find which oblivion tier this skin belongs to
        let obRarity = 'ob_epic';
        if (typeof OBLIVION_SKIN_RARITIES !== 'undefined') {
          for (const [r, ids] of Object.entries(OBLIVION_SKIN_RARITIES)) {
            if (ids.includes(skin.id)) { obRarity = r; break; }
          }
        }
        rarityColor = obColors[obRarity] || '#9055ff';
        rarityLabel = obLabels[obRarity] || 'EPIC';
      } else {
        rarityColor = crateRarityColors[rarity] || '#78b7ff';
        rarityLabel = crateRarityLabels[rarity] || 'COMMON';
      }

      const card = document.createElement('div');
      card.className = 'skin-card' + (active ? ' active' : '') + (owned ? ' owned' : '');
      card.style.borderColor = owned ? rarityColor : 'rgba(100,100,120,0.4)';
      if (!owned) card.style.opacity = '0.65';

      const preview = document.createElement('div');
      preview.className = 'skin-preview';
      applyRichSkinPreview(preview, skin.id, skin.color);

      const name = document.createElement('div');
      name.className = 'skin-name';
      name.textContent = skin.name;

      const rarityTag = document.createElement('div');
      rarityTag.className = 'skin-desc';
      rarityTag.textContent = rarityLabel;
      rarityTag.style.color = rarityColor;
      rarityTag.style.fontWeight = '700';
      rarityTag.style.fontSize = '10px';

      const btn = document.createElement('button');
      btn.className = 'skin-btn';
      if (active) {
        btn.textContent = '✓ Equipped';
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = 'Equip';
        btn.onclick = () => { activeSkin = skin.id; saveSkins(); initShopUI(); };
      } else {
        btn.textContent = buttonLabel;
        btn.disabled = true;
        btn.style.background = 'rgba(100,80,200,0.2)';
        btn.style.border = `1px solid ${rarityColor}55`;
        btn.style.color = rarityColor;
        btn.style.fontSize = '11px';
      }

      card.appendChild(preview);
      card.appendChild(name);
      card.appendChild(rarityTag);
      card.appendChild(btn);
      grid.appendChild(card);
    }
  }

  // ── Common Crate (300 coins) — common/uncommon/rare skins ──────────────
  grid.appendChild(makeCrateHeader('📦', 'Common Crate — 300 Coins', '#78b7ff', 'rgba(120,183,255,0.25)'));
  renderCrateSkinList(commonCrateSkins, '📦 CRATE ONLY');

  // ── Icon Skins Crate (750 coins) — icon skins ──────────────────────────
  grid.appendChild(makeCrateHeader('🎯', 'Icon Skins Crate — 750 Coins', '#00ff9d', 'rgba(0,255,157,0.25)'));

  // Animated preview helpers for icon skins
  function setIconSkinPreview(preview, skinId) {
    const animated = {
      icon_noah_brown:      () => { preview.style.background = '#6b4423'; preview.style.boxShadow = '0 0 18px #6b4423'; },
      icon_keegan_baseball: () => { _drawBaseballPreview(preview); },
      icon_dpoe_fade:       () => { preview.style.background = 'linear-gradient(135deg, #ff69b4 0%, #ff9ec4 35%, #a8d8ea 65%, #89cff0 100%)'; preview.style.boxShadow = '0 0 22px #a8d8ea'; },
      icon_evan_watermelon: () => { preview.style.background = 'radial-gradient(circle, #ff6b9d 0%, #ff4466 30%, #ff1744 50%, #4caf50 70%, #2e7d32 100%)'; preview.style.boxShadow = '0 0 20px #ff4466, inset 0 0 15px rgba(46,125,50,0.3)'; },
      icon_gavin_tzl:       () => { preview.style.background = 'linear-gradient(135deg, #dc143c 0%, #ffffff 50%, #0047ab 100%)'; preview.style.boxShadow = '0 0 25px #0047ab, 0 0 35px rgba(220,20,60,0.5)'; preview.style.border = '2px solid rgba(255,255,255,0.5)'; },
      icon_carter_cosmic:   () => { preview.style.background = 'radial-gradient(circle, #ff2020 0%, #cc0000 40%, #660000 70%, #1a0000 100%)'; preview.style.boxShadow = '0 0 25px #cc0000'; },
      icon_brody_flag:      () => { preview.style.background = 'linear-gradient(to bottom, #b22234 0%, #b22234 7.7%, #ffffff 7.7%, #ffffff 15.4%, #b22234 15.4%, #b22234 23.1%, #ffffff 23.1%, #ffffff 30.8%, #b22234 30.8%, #b22234 38.5%, #ffffff 38.5%, #ffffff 46.2%, #b22234 46.2%, #b22234 53.9%, #ffffff 53.9%, #ffffff 61.6%, #b22234 61.6%, #b22234 69.3%, #ffffff 69.3%, #ffffff 77%, #b22234 77%, #b22234 84.7%, #ffffff 84.7%, #ffffff 92.4%, #b22234 92.4%, #b22234 100%)'; preview.style.boxShadow = '0 0 22px #3c3b6e, inset 0 0 30px rgba(60,59,110,0.3)'; },
      icon_sterling:        () => { preview.style.background = 'radial-gradient(circle at 30% 30%, #0064ff 0%, #0050cc 30%, #003399 60%, #000000 100%)'; preview.style.boxShadow = '0 0 25px #0064ff, 0 0 40px rgba(0,100,255,0.5)'; preview.style.animation = 'sterlingPulse 3s ease-in-out infinite'; },
      icon_justin_clover:   () => { preview.style.background = 'radial-gradient(circle, #39ff14 0%, #1a8c2e 40%, #0d5c1a 70%, #042b0a 100%)'; preview.style.boxShadow = '0 0 25px #39ff14, 0 0 40px rgba(26,140,46,0.5)'; preview.style.animation = 'voidPulse 2s ease-in-out infinite'; },
      icon_profe_spain:     () => { preview.style.background = 'linear-gradient(to bottom, #c60b1e 0%, #c60b1e 25%, #ffc400 25%, #ffc400 75%, #c60b1e 75%, #c60b1e 100%)'; preview.style.boxShadow = '0 0 25px #c60b1e, 0 0 45px rgba(255,196,0,0.7)'; preview.style.animation = 'voidPulse 1.2s ease-in-out infinite'; preview.style.border = '2px solid rgba(255,196,0,0.7)'; },
      icon_kayden_duck:     () => { preview.style.background = 'conic-gradient(from 20deg, #5a6b2a 0deg, #c4a265 40deg, #3d2b0e 90deg, #7a5c28 140deg, #5a6b2a 190deg, #c4a265 230deg, #3d2b0e 280deg, #4a5c1e 320deg, #c4a265 360deg)'; preview.style.boxShadow = '0 0 18px rgba(90,70,20,0.7)'; preview.style.border = '2px solid rgba(90,107,42,0.6)'; },
      icon_troy_puck:       () => { preview.style.background = 'radial-gradient(circle at 35% 35%, #3a3a3a 0%, #1a1a1a 50%, #050505 100%)'; preview.style.boxShadow = '0 0 20px rgba(200,232,255,0.5)'; preview.style.border = '3px solid rgba(160,160,160,0.4)'; },
      icon_the_creator:     () => { preview.style.background = 'radial-gradient(circle at 40% 40%, #ffffff 0%, #fffbe6 15%, #ffcc33 40%, #ff8c1a 70%, #cc4400 100%)'; preview.style.boxShadow = '0 0 30px rgba(255,153,51,0.8), 0 0 50px rgba(255,100,20,0.4)'; preview.style.animation = 'creatorPulse 2s ease-in-out infinite'; preview.style.border = '2px solid rgba(255,200,80,0.7)'; },
    };
    if (animated[skinId]) animated[skinId]();
  }

  const iconSkins = SKINS.filter(s => s.iconSkin);
  for (const skin of iconSkins) {
    if (skin.hideUntilUnlocked && !ownedSkins.includes(skin.id)) continue;
    const owned = ownedSkins.includes(skin.id);
    const active = activeSkin === skin.id;

    const card = document.createElement('div');
    card.className = 'skin-card' + (active ? ' active' : '') + (owned ? ' owned' : '');
    card.style.borderColor = owned ? '#00ff9d' : 'rgba(100,100,120,0.4)';
    if (!owned) card.style.opacity = '0.65';

    const preview = document.createElement('div');
    preview.className = 'skin-preview';
    if (skin.color) { preview.style.background = skin.color; preview.style.boxShadow = `0 0 14px ${skin.color}`; }
    else { setIconSkinPreview(preview, skin.id); }

    const name = document.createElement('div');
    name.className = 'skin-name';
    name.textContent = skin.name;

    const descTag = document.createElement('div');
    descTag.className = 'skin-desc';
    descTag.textContent = skin.desc;
    descTag.style.color = '#00ff9d';
    descTag.style.fontWeight = '700';
    descTag.style.fontSize = '10px';

    const btn = document.createElement('button');
    btn.className = 'skin-btn';
    if (active) { btn.textContent = '✓ Equipped'; btn.disabled = true; }
    else if (owned) { btn.textContent = 'Equip'; btn.onclick = () => { activeSkin = skin.id; saveSkins(); initShopUI(); }; }
    else {
      btn.textContent = '🎯 CRATE ONLY'; btn.disabled = true;
      btn.style.background = 'rgba(0,255,157,0.15)'; btn.style.border = '1px solid rgba(0,255,157,0.4)';
      btn.style.color = '#00ff9d'; btn.style.fontSize = '11px';
    }

    card.appendChild(preview); card.appendChild(name); card.appendChild(descTag); card.appendChild(btn);
    grid.appendChild(card);
  }

  // ── Rare Crate (750 coins) — uncommon/rare/epic skins ──────────────────
  grid.appendChild(makeCrateHeader('🎁', 'Rare Crate — 750 Coins', '#9d7aff', 'rgba(157,122,255,0.25)'));
  renderCrateSkinList(rareCrateSkins, '🎁 CRATE ONLY');

  // ── Epic Crate (1,500 coins) — rare/epic/legendary skins ────────────────
  grid.appendChild(makeCrateHeader('🎭', 'Epic Crate — 1,500 Coins', '#ff78b7', 'rgba(255,120,183,0.25)'));
  renderCrateSkinList(epicCrateSkins, '🎭 CRATE ONLY');

  // ── Legendary Crate (4,000 coins) — epic/legendary/mythic skins ────────
  grid.appendChild(makeCrateHeader('⭐', 'Legendary Crate — 4,000 Coins', '#ffd700', 'rgba(255,215,0,0.25)'));
  renderCrateSkinList(legendaryCrateSkins, '⭐ CRATE ONLY');

  // ── Oblivion Crate (10,000 coins) — ob_* skins ─────────────────────────
  grid.appendChild(makeCrateHeader('🌑', 'Oblivion Crate — 10,000 Coins', '#9055ff', 'rgba(144,85,255,0.25)'));
  renderCrateSkinList(oblivionCrateSkins, '🌑 CRATE ONLY');

  // battle pass skins section
  const battlePassSkins = SKINS.filter(s => s.battlePassTier);
  if (battlePassSkins.length > 0) {
    const bpHeader = document.createElement('div');
    bpHeader.style.cssText = `
      grid-column: 1 / -1;
      text-align: center;
      padding: 18px 0 8px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 2px;
      color: #00ff9d;
      border-top: 1px solid rgba(0,255,157,0.25);
      margin-top: 10px;
      text-transform: uppercase;
    `;
    bpHeader.textContent = '🎫 Battle Pass Skins — Unlock via Battle Pass';
    grid.appendChild(bpHeader);

    for (const skin of battlePassSkins) {
      const owned = ownedSkins.includes(skin.id);
      const active = activeSkin === skin.id;

      const card = document.createElement('div');
      card.className = 'skin-card' + (active ? ' active' : '') + (owned ? ' owned' : '');
      card.style.borderColor = owned ? '#00ff9d' : 'rgba(100,100,120,0.4)';
      if (!owned) card.style.opacity = '0.65';

      const preview = document.createElement('div');
      preview.className = 'skin-preview';
      preview.style.background = skin.color;
      preview.style.boxShadow = `0 0 18px ${skin.color}`;

      const name = document.createElement('div');
      name.className = 'skin-name';
      name.textContent = skin.name;

      const desc = document.createElement('div');
      desc.className = 'skin-desc';
      desc.textContent = skin.desc;

      const btn = document.createElement('button');
      btn.className = 'skin-btn';
      if (active) {
        btn.textContent = '✓ Equipped';
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = 'Equip';
        btn.onclick = () => { activeSkin = skin.id; saveSkins(); initShopUI(); };
      } else {
        btn.textContent = '🎫 BATTLE PASS';
        btn.disabled = true;
        btn.style.background = 'rgba(0,255,157,0.15)';
        btn.style.border = '1px solid rgba(0,255,157,0.4)';
        btn.style.color = '#00ff9d';
        btn.style.fontSize = '11px';
      }

      card.appendChild(preview);
      card.appendChild(name);
      card.appendChild(desc);
      card.appendChild(btn);
      grid.appendChild(card);
    }
  }

}

/* =======================
   WAVE ANNOUNCEMENT
======================= */

function showWaveAnnouncement(waveNum, isBoss = false, isMegaBoss = false) {
  const el = document.getElementById('waveAnnouncement');
  const isUltra = (waveNum === 20);
  
  if (isUltra) {
    el.textContent = `💀 OMEGA OVERLORD 💀`;
    el.style.color = '#ffd700';
    el.style.textShadow = '0 0 50px rgba(255,215,0,1), 0 0 80px rgba(255,100,0,0.8), 0 0 120px rgba(200,0,255,0.5)';
    el.style.fontSize = '58px';
  } else if (isMegaBoss) {
    el.textContent = `⚔ MEGA BOSS WAVE ${waveNum} ⚔`;
    el.style.color = '#ff3366';
    el.style.textShadow = '0 0 40px rgba(255,51,102,1), 0 0 60px rgba(255,51,102,0.7)';
    el.style.fontSize = '64px'; // Even bigger
  } else if (isBoss) {
    el.textContent = `⚠ BOSS WAVE ${waveNum} ⚠`;
    el.style.color = '#ff4757';
    el.style.textShadow = '0 0 30px rgba(255,71,87,0.9)';
    el.style.fontSize = '52px'; // Reset to normal boss size
  } else {
    el.textContent = `WAVE ${waveNum}`;
    el.style.color = '#9be7ff';
    el.style.textShadow = '0 0 30px rgba(88,166,255,0.9)';
    el.style.fontSize = '52px'; // Normal size
  }
  
  el.classList.remove('hidden');
  el.classList.add('wave-pop');
  setTimeout(() => {
    el.classList.remove('wave-pop');
    el.classList.add('hidden');
  }, isUltra ? 4000 : isMegaBoss ? 3000 : 2000);
}

/* =======================
   GAME LOOP
======================= */

function loop(time) {
 // Skip one frame after tab refocus to avoid huge dt spikes
  if (skipNextFrame) {
    skipNextFrame = false;
    lastTime = time;
    requestAnimationFrame(loop);
    return;
  }

  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  // Capture shake state ONCE so save/restore are always paired
  const shaking = screenShakeAmt > 0;
  if (shaking) {
    ctx.save();
    const shakeScale = gameSettings.perfMode ? 10 : 25;
    ctx.translate(
      (Math.random() - 0.5) * screenShakeAmt * shakeScale,
      (Math.random() - 0.5) * screenShakeAmt * shakeScale
    );
    screenShakeAmt = Math.max(0, screenShakeAmt - dt * 2.5);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (running && !paused) {
 // FPS calculation
    fpsSamples.push(dt > 0.001 ? Math.min(1 / dt, 300) : 60);
    if (fpsSamples.length > 30) fpsSamples.shift();
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      fpsDisplay = Math.round(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length);
      fpsTimer = 0;
    }
    player.update(dt);

 // Create trail particles if battle pass trail is active
    if (!gameSettings.perfMode && Math.random() < 0.6 && _hasTrailParticle) {
      createTrailParticle(player.x, player.y);
    }
 // Creator skin — warm solar trail when moving
    if (activeSkin === 'icon_the_creator' && Math.random() < 0.45) {
      const moving = keys['w'] || keys['arrowup'] || keys['s'] || keys['arrowdown'] ||
                     keys['a'] || keys['arrowleft'] || keys['d'] || keys['arrowright'];
      if (moving) createCreatorTrail(player.x, player.y);
    }

    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) {
        resetCombo();
      }
    }

 // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      
      if (b.x < -50 || b.x > canvas.width + 50 || b.y < -50 || b.y > canvas.height + 50) {
        bullets.splice(i, 1);
      }
    }

 // Update enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const eb = enemyBullets[i];
      eb.x += eb.vx * dt;
      eb.y += eb.vy * dt;
      
      const dist = Math.hypot(eb.x - player.x, eb.y - player.y);
      if (dist < eb.r + player.r) {
        player.takeDamage(5);
        enemyBullets.splice(i, 1);
        resetCombo();
        continue;
      }
      
      if (eb.x < -50 || eb.x > canvas.width + 50 || eb.y < -50 || eb.y > canvas.height + 50) {
        enemyBullets.splice(i, 1);
      }
    }

    if (boss) boss.update(dt);
    for (let i = 0; i < enemies.length; i++) {
      if (!enemies[i]._dead) enemies[i].update(dt);
    }

 // Cull off-screen enemies to prevent memory leak
    cullOffScreenEnemies();

 // Update powerups
    for (let i = powerups.length - 1; i >= 0; i--) {
      powerups[i].update(dt);
      
      const dist = Math.hypot(powerups[i].x - player.x, powerups[i].y - player.y);
      if (dist < powerups[i].r + player.r) {
        const pu = powerups[i];
        
        if (pu.type === 'health') {
          player.hp = Math.min(player.maxHp, player.hp + 35);
        } else if (pu.type === 'rapidfire') {
          player.rapidFire = 12;
        } else if (pu.type === 'speed') {
          player.speedBoost = 12;
        } else if (pu.type === 'shield') {
          player.shield = 15;
        } else if (pu.type === 'weapon') {
          player.weaponLevel = Math.min(3, player.weaponLevel + 1);
          score += 150;
        } else if (pu.type === 'maxhp') {
 // Permanent max HP upgrade (+20 HP per level)
          player.maxHpLevel = Math.min(3, player.maxHpLevel + 1);
          player.maxHp = 100 + (player.maxHpLevel - 1) * 20;
          player.hp = Math.min(player.maxHp, player.hp + 20); // Also heal 20 HP
          score += 150;
        } else if (pu.type === 'speedup') {
 // Permanent speed upgrade (15% per level)
          player.speedLevel = Math.min(3, player.speedLevel + 1);
          score += 150;
        } else if (pu.type === 'pierce') {
 // Pierce shot: bullets go through multiple enemies
          player.pierce = 10;
        } else if (pu.type === 'explosive') {
 // Explosive bullets: bullets create explosions on impact
          player.explosive = 12;
        } else if (pu.type === 'nuke') {
 // Nuke: instantly kill all on-screen enemies and the boss loses 30 HP
          const nukeKillCount = enemies.length;
          for (let n = enemies.length - 1; n >= 0; n--) {
            const ne = enemies[n];
            const pts = Math.floor(ne.score || 0);
            score += pts;
            playerCoins += (ne.coinValue || 0);
            createScorePopup(ne.x, ne.y, pts);
            createExplosion(ne.x, ne.y, ne.color, 20);
            if (activeSkin === 'icon_the_creator') createCreatorKillEffect(ne.x, ne.y);
            enemiesKilledThisWave++;
            totalKills++;

 // Apply XP with enemy-type multipliers
            if (_hasBattlePassXP) {
              let xpAmount = BP_XP_CONFIG.perKill;
              if (ne.type === 'miniboss') xpAmount = Math.round(BP_XP_CONFIG.perKill * BP_XP_CONFIG.minibossKill);
              else if (ne.type === 'enforcer') xpAmount = Math.round(BP_XP_CONFIG.perKill * BP_XP_CONFIG.enforcerKill);
              battlePassAddXP(xpAmount);
            }
          }
          enemies.length = 0;
          addComboBulk(nukeKillCount); // single UI update + achievement check
          saveCoins();
          if (boss) {
            boss.hp -= 30;
            createExplosion(boss.x, boss.y, '#ffffff', 40);
            if (boss.hp <= 0) {
 // Different rewards for each boss type
              const isLegendaryBoss = boss.isLegendaryBoss;
              const isUltraBoss = boss.isUltraBoss;
              const isMegaBoss  = boss.isMegaBoss;
              const pts = isLegendaryBoss ? (5500 + boss.wave * 700) : isUltraBoss ? (3000 + boss.wave * 400) : isMegaBoss ? (1500 + boss.wave * 250) : (600 + boss.wave * 120);
              const coins = isLegendaryBoss ? (175 + boss.wave * 18) : isUltraBoss ? (85 + boss.wave * 10) : isMegaBoss ? (50 + boss.wave * 6) : (25 + boss.wave * 4);
              const powerupCount = isLegendaryBoss ? 24 : isUltraBoss ? 14 : isMegaBoss ? 8 : 4;
              
              score += pts;
              playerCoins += coins;
              saveCoins();
              createScorePopup(boss.x, boss.y, pts);
              createExplosion(boss.x, boss.y, boss.color, isLegendaryBoss ? 280 : isUltraBoss ? 200 : isMegaBoss ? 120 : 60);
              for (let p = 0; p < powerupCount; p++) {
                spawnPowerUp(
                  boss.x + (Math.random()-0.5)*(isLegendaryBoss ? 230 : isMegaBoss ? 140 : 90), 
                  boss.y + (Math.random()-0.5)*(isLegendaryBoss ? 230 : isMegaBoss ? 140 : 90)
                );
              }
              if (isUltraBoss || isLegendaryBoss) {
                if (boss.dead !== undefined) boss.dead = true;
                enemyBullets.length = 0;
              }
              if (isLegendaryBoss && typeof achOnLegendaryBossKill === 'function') achOnLegendaryBossKill();
              if (typeof achOnBossKill === 'function') achOnBossKill();
              boss = null;
            }
          }
if (gameSettings.screenShake) screenShakeAmt = 1.2;
          playSound(120, 0.6, 'sawtooth');
          setTimeout(() => playSound(80, 0.6, 'sawtooth'), 150);
        }
        
        sounds.powerUp();
        createExplosion(pu.x, pu.y, pu.color, 25);
        if (typeof achOnPowerupCollect === 'function') achOnPowerupCollect();
        if (typeof achOnCoinsChanged === 'function') achOnCoinsChanged();
        powerups.splice(i, 1);
        continue;
      }
      
      if (powerups[i].life <= 0) {
        powerups.splice(i, 1);
      }
    }

 // Rebuild spatial grid for collision optimization
    spatialGrid.clear();
    for (let i = 0; i < enemies.length; i++) spatialGrid.insert(enemies[i], enemies[i].x, enemies[i].y);
    if (boss) spatialGrid.insert(boss, boss.x, boss.y);

 // Bullet-enemy collision
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      let hit = false;
      
 // Boss collision
      if (boss && !b._hitBoss) {
        const dist = Math.hypot(b.x - boss.x, b.y - boss.y);
        if (dist < b.r + boss.r) {
          b._hitBoss = true; // prevent same bullet hitting boss multiple times (pierce bug)
          boss.hp--;
          
          if (boss.hp <= 0) {
 // Different rewards for each boss type
            const isLegendaryBoss = boss.isLegendaryBoss;
            const isUltraBoss = boss.isUltraBoss;
            const isMegaBoss  = boss.isMegaBoss;
            const points = isLegendaryBoss ? (5500 + boss.wave * 700) : isUltraBoss ? (3000 + boss.wave * 400) : isMegaBoss ? (1500 + boss.wave * 250) : (600 + boss.wave * 120);
            const coins = isLegendaryBoss ? (175 + boss.wave * 18) : isUltraBoss ? (85 + boss.wave * 10) : isMegaBoss ? (50 + boss.wave * 6) : (25 + boss.wave * 4);
            const powerupCount = isLegendaryBoss ? 24 : isUltraBoss ? 14 : isMegaBoss ? 8 : 4;
            
            score += points;
            playerCoins += coins;
            saveCoins();
            createScorePopup(boss.x, boss.y, points);
            sounds.hit();
            createExplosion(boss.x, boss.y, boss.color, isLegendaryBoss ? 280 : isUltraBoss ? 200 : isMegaBoss ? 120 : 60);
            
 // Boss drops powerups
            for (let p = 0; p < powerupCount; p++) {
              spawnPowerUp(
                boss.x + (Math.random() - 0.5) * (isLegendaryBoss ? 230 : isUltraBoss ? 180 : isMegaBoss ? 140 : 90),
                boss.y + (Math.random() - 0.5) * (isLegendaryBoss ? 230 : isUltraBoss ? 180 : isMegaBoss ? 140 : 90)
              );
            }

 // Clear all lingering enemy bullets when UltraBoss or LegendaryBoss dies
 // This prevents players dying from queued DeathBlossom bullets after the kill
            if (isUltraBoss || isLegendaryBoss) {
              if (boss.dead !== undefined) boss.dead = true; // Stop any pending setTimeouts
              enemyBullets.length = 0;
            }
            if (isLegendaryBoss && typeof achOnLegendaryBossKill === 'function') achOnLegendaryBossKill();
            if (typeof achOnBossKill === 'function') achOnBossKill();
            addCombo();
            // Boss Rush: count kill and start rest phase
            if (currentGameMode === 'bossrush') {
              brBossesBeaten++;
              updateBossRushHUD();
              brRestTimer = BR_REST_TIME;
            }
            // Reset pierce boss-hit flag on all bullets so next boss can be hit
            for (let bi = 0; bi < bullets.length; bi++) bullets[bi]._hitBoss = false;
            boss = null;
            playSound(800, 0.6, 'sine');
            setTimeout(() => playSound(1000, 0.6, 'sine'), 120);
            setTimeout(() => playSound(1200, 0.6, 'sine'), 240);
          } else {
            createExplosion(b.x, b.y, '#ffffff', 12);
          }
          
 // Explosive bullets effect - damage nearby enemies (not bosses in boss rush)
          if (player.explosive > 0 && !(currentGameMode === 'bossrush' && boss)) {
            const explosionRadius = 60;
            const explosionDamage = 2;
            let explosionKills = 0;

            createExplosion(b.x, b.y, '#ff4500', 30);

            const nearbyForExplosion = spatialGrid.getNearby(b.x, b.y, explosionRadius);
            for (let k = 0; k < nearbyForExplosion.length; k++) {
              const ne = nearbyForExplosion[k];
              if (ne._dead) continue; // guard: skip enemies already killed this frame
              const explosionDist = Math.hypot(ne.x - b.x, ne.y - b.y);
              if (explosionDist < explosionRadius) {
                ne.hp -= explosionDamage;

                if (ne.hp <= 0) {
                  ne._dead = true; // mark immediately to prevent double-kill
                  const points = Math.floor(ne.score || 0);
                  score += points;
                  playerCoins += (ne.coinValue || 0);
                  saveCoins();
                  createScorePopup(ne.x, ne.y, points);
                  enemiesKilledThisWave++;
                  totalKills++;
                  explosionKills++;
                  addCombo();

 // Apply XP with enemy-type multipliers
                  if (_hasBattlePassXP) {
                    let xpAmount = BP_XP_CONFIG.perKill;
                    if (ne.type === 'miniboss') xpAmount = Math.round(BP_XP_CONFIG.perKill * BP_XP_CONFIG.minibossKill);
                    else if (ne.type === 'enforcer') xpAmount = Math.round(BP_XP_CONFIG.perKill * BP_XP_CONFIG.enforcerKill);
                    battlePassAddXP(xpAmount);
                  }

                  createExplosion(ne.x, ne.y, ne.color, 20);
                  if (activeSkin === 'icon_the_creator') createCreatorKillEffect(ne.x, ne.y);
                }
              }
            }
            if (typeof achOnExplosionKills === 'function') achOnExplosionKills(explosionKills);
          }

          hit = true;
 // Only remove bullet if not piercing
          if (player.pierce <= 0) {
            bullets.splice(i, 1);
          }
        }
      }

      if (hit) continue;

 // Enemy collision (optimized with spatial grid)
      const nearbyEnemies = spatialGrid.getNearby(b.x, b.y, 50);

      for (let j = nearbyEnemies.length - 1; j >= 0; j--) {
        const e = nearbyEnemies[j];

 // Skip collision if enemy hasn't entered screen yet (prevents off-screen kills)
        if (!e.hasEnteredScreen) continue;

        const dist = Math.hypot(b.x - e.x, b.y - e.y);

        if (dist < b.r + e.r) {
          e.hp--;

          if (e.hp <= 0) {
            e._dead = true; // mark before explosion chain runs to prevent double-kill
            const points = Math.floor(e.score || 0);
            score += points;
            playerCoins += (e.coinValue || 0);
            saveCoins();
            createScorePopup(e.x, e.y, points);
            enemiesKilledThisWave++;
            totalKills++;
            
 // Apply XP with enemy-type multipliers
            if (_hasBattlePassXP) {
              let xpAmount = BP_XP_CONFIG.perKill;
              if (e.type === 'miniboss') xpAmount = Math.round(BP_XP_CONFIG.perKill * BP_XP_CONFIG.minibossKill);
              else if (e.type === 'enforcer') xpAmount = Math.round(BP_XP_CONFIG.perKill * BP_XP_CONFIG.enforcerKill);
              battlePassAddXP(xpAmount);
            }

            sounds.hit();
            addCombo();
            createExplosion(e.x, e.y, e.color, 25);
            if (activeSkin === 'icon_the_creator') createCreatorKillEffect(e.x, e.y);

 // Power-up drop (20% base, 30% for enforcer, 40% for miniboss)
            const dropChance = e.type === 'miniboss' ? 0.4 : (e.type === 'enforcer' ? 0.3 : 0.2);
            if (Math.random() < dropChance) {
              spawnPowerUp(e.x, e.y);
            }
          } else {
            createExplosion(b.x, b.y, '#ffffff', 12);
          }

 // Explosive bullets effect
          if (player.explosive > 0) {
            const explosionRadius = 60;
            const explosionDamage = 2;
            let explosionKills2 = 0;

 // Create larger explosion visual
            createExplosion(b.x, b.y, '#ff4500', 30);

 // Damage nearby enemies
            const nearbyForExplosion = spatialGrid.getNearby(b.x, b.y, explosionRadius);
            for (let k = 0; k < nearbyForExplosion.length; k++) {
              const ne = nearbyForExplosion[k];
              if (ne === e) continue; // Skip the enemy we already hit
              if (ne._dead) continue; // guard: skip enemies already killed this frame

              const explosionDist = Math.hypot(ne.x - b.x, ne.y - b.y);
              if (explosionDist < explosionRadius) {
                ne.hp -= explosionDamage;

                if (ne.hp <= 0) {
                  ne._dead = true; // mark immediately to prevent double-kill
                  const points = Math.floor(ne.score || 0);
                  score += points;
                  playerCoins += (ne.coinValue || 0);
                  saveCoins();
                  createScorePopup(ne.x, ne.y, points);
                  enemiesKilledThisWave++;
                  totalKills++;
                  explosionKills2++;
                  addCombo();

 // Apply XP with enemy-type multipliers
                  if (_hasBattlePassXP) {
                    let xpAmount = BP_XP_CONFIG.perKill;
                    if (ne.type === 'miniboss') xpAmount = Math.round(BP_XP_CONFIG.perKill * BP_XP_CONFIG.minibossKill);
                    else if (ne.type === 'enforcer') xpAmount = Math.round(BP_XP_CONFIG.perKill * BP_XP_CONFIG.enforcerKill);
                    battlePassAddXP(xpAmount);
                  }

                  createExplosion(ne.x, ne.y, ne.color, 20);
                  if (activeSkin === 'icon_the_creator') createCreatorKillEffect(ne.x, ne.y);
                }
              }
            }
            if (typeof achOnExplosionKills === 'function') achOnExplosionKills(explosionKills2);
          }

          hit = true;
 // Only remove bullet if not piercing
          if (player.pierce <= 0) {
            bullets.splice(i, 1);
          }
          break;
        }
      }
    }

 // Remove enemies killed by bullets this frame (batch, avoids per-kill indexOf)
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i]._dead) enemies.splice(i, 1);
    }

 // Enemy-player collision
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < e.r + player.r) {
 // Damage based on enemy type and state
        let damage = 10;
        if (e.type === 'miniboss') damage = 15;
        else if (e.type === 'enforcer') {
 // Enforcer deals extra damage during dash
          damage = e.isDashing ? 18 : 12;
        }
        
        player.takeDamage(damage);
        resetCombo();
        createExplosion(e.x, e.y, e.color, 18);
        enemiesKilledThisWave++;
        const contactPoints = Math.floor(e.score || 0);
        if (contactPoints > 0) {
          score += contactPoints;
          createScorePopup(e.x, e.y, contactPoints);
        }
        playerCoins += (e.coinValue || 0);
        saveCoins();
        totalKills++;
        addCombo();

 // Apply XP with enemy-type multipliers
        if (_hasBattlePassXP) {
          let xpAmount = BP_XP_CONFIG.perKill;
          if (e.type === 'miniboss') xpAmount = Math.round(BP_XP_CONFIG.perKill * BP_XP_CONFIG.minibossKill);
          else if (e.type === 'enforcer') xpAmount = Math.round(BP_XP_CONFIG.perKill * BP_XP_CONFIG.enforcerKill);
          battlePassAddXP(xpAmount);
        }

        enemies.splice(i, 1);
      }
    }
    
 // Boss-player collision
    if (boss) {
      const d = Math.hypot(boss.x - player.x, boss.y - player.y);
      if (d < boss.r + player.r) {
        player.takeDamage(25);
        resetCombo();
if (gameSettings.screenShake) screenShakeAmt = 1;
      }
    }

 // Wave system
    const enemiesNeeded = currentGameMode === 'ranked' ? wave * 3 + 10 : wave * 5 + 12;

 // Boss countdown timer - tick down and spawn boss when ready
    if (bossCountdownTimer > 0) {
      bossCountdownTimer -= dt;
      if (bossCountdownTimer <= 0) {
        bossCountdownTimer = 0;
 // Spawn the appropriate boss type
        const cx = canvas.width / 2;
        if (pendingBossType === 4) {
          boss = new LegendaryBoss(cx, 140, wave);
        } else if (pendingBossType === 3) {
          boss = new UltraBoss(cx, 120, wave);
        } else if (pendingBossType === 2) {
          boss = new MegaBoss(cx, 100, wave);
        } else if (pendingBossType === 1) {
          boss = new Boss(cx, 80, wave);
        }
        pendingBossType = null;
 // Play spawn sound effect
        sounds.bossSpawn();
      }
    }

    // ── Mode-specific per-frame logic ─────────────────────────
    if (currentGameMode === 'timeattack') {
      taTimeLeft -= dt;
      updateTimerHUD();
      if (taTimeLeft <= 0) { endModeRun('timeout'); requestAnimationFrame(loop); return; }
      // Spawn continuously; no wave breaks
      spawnTimer += dt;
      const taRate = Math.max(0.18, 0.5 - (TIME_ATTACK_DURATION - taTimeLeft) / 600);
      if (spawnTimer >= taRate) { spawnEnemy(); spawnTimer = 0; }
    } else if (currentGameMode === 'bossrush') {
      if (!boss && brRestTimer <= 0 && enemies.length === 0) {
        spawnBossRushBoss();
      }
      if (brRestTimer > 0) {
        brRestTimer -= dt;
        if (brRestTimer <= 0) {
          brRestTimer = 0;
          // Drop a heal pickup between bosses
          powerups.push(new PowerUp(canvas.width / 2, canvas.height / 2, 'health'));
        }
      }
    }

    if ((currentGameMode === 'classic' || currentGameMode === 'ranked') && waveClearTimer > 0) {
 // Between-wave break — tick down, show countdown on canvas
      waveClearTimer -= dt;
      if (waveClearTimer <= 0) {
        waveClearTimer = 0;
        spawnTimer = 0; // fresh timer for new wave
        showWaveAnnouncement(wave);
      }
    } else if ((currentGameMode === 'classic' || currentGameMode === 'ranked') && enemiesKilledThisWave >= enemiesNeeded && enemies.length === 0 && !boss) {
 // Wave complete! — shared by classic and ranked
      const waveBonus = (wave + 1) * 60;
      score += waveBonus;
      const coinBonus = Math.floor(Math.min(wave, 20) * 5 + Math.max(0, wave - 20) * 2);
      playerCoins += coinBonus;
      saveCoins();
      player.hp = Math.min(player.maxHp, player.hp + 30);
      wave++;
      if (typeof achOnWaveReached === 'function') achOnWaveReached(wave);
      if (activeSkin === 'icon_the_creator') triggerCreatorMilestone();
      if (_hasBattlePassXP) battlePassAddXP(BP_XP_CONFIG.perWave);
      enemiesThisWave = 0;
      enemiesKilledThisWave = 0;
      spawnTimer = 0;

      if (currentGameMode === 'ranked') {
        // ── Ranked wave completion ─────────────────────────────
        const rcfg    = typeof getRankedConfig === 'function' ? getRankedConfig() : null;
        const targetW = rcfg ? rcfg.targetWaves : 10;
        const justCleared = wave - 1; // wave was already incremented
        if (typeof rankedOnWaveClear === 'function') rankedOnWaveClear(justCleared);

        if (justCleared >= targetW) {
          // Run complete — all waves survived
          waveEl.textContent = `${targetW}/${targetW}`;
          endModeRun('complete');
          requestAnimationFrame(loop);
          return;
        }

        waveEl.textContent = `${wave}/${targetW}`;

        // Tier-specific boss schedule
        const bossType = typeof rankedBossTypeForWave === 'function' ? rankedBossTypeForWave(justCleared) : 0;
        if (bossType > 0) {
          bossCountdownTimer = BOSS_COUNTDOWN_TIME;
          pendingBossType = bossType;
          sounds.bossSpawn();
          if (bossType >= 3 && gameSettings.screenShake) screenShakeAmt = 2.0;
          else if (bossType >= 2 && gameSettings.screenShake) screenShakeAmt = 1.2;
          else if (gameSettings.screenShake) screenShakeAmt = 0.7;
          showWaveAnnouncement(wave, true, bossType >= 2);
        } else {
          waveClearTimer = WAVE_BREAK_TIME;
          playSound(850, 0.4, 'sine');
          setTimeout(() => playSound(1050, 0.4, 'sine'), 120);
        }

      } else {
        // ── Classic boss scheduling ────────────────────────────
        waveEl.textContent = wave;
        const legendaryRoll = Math.random();
        if (wave > 3 && legendaryRoll < 0.001) {
          bossCountdownTimer = BOSS_COUNTDOWN_TIME;
          pendingBossType = 4;
          sounds.bossSpawn();
          setTimeout(() => sounds.bossSpawn(), 200);
          setTimeout(() => sounds.bossSpawn(), 400);
          setTimeout(() => sounds.bossSpawn(), 600);
          setTimeout(() => sounds.bossSpawn(), 800);
          if (gameSettings.screenShake) screenShakeAmt = 3.0;
          showWaveAnnouncement(wave, true, true);
        } else if (wave % 20 === 0) {
          bossCountdownTimer = BOSS_COUNTDOWN_TIME;
          pendingBossType = 3;
          sounds.bossSpawn();
          setTimeout(() => sounds.bossSpawn(), 300);
          setTimeout(() => sounds.bossSpawn(), 600);
          if (gameSettings.screenShake) screenShakeAmt = 2.0;
          showWaveAnnouncement(wave, true, true);
        } else if (wave % 10 === 0) {
          bossCountdownTimer = BOSS_COUNTDOWN_TIME;
          pendingBossType = 2;
          sounds.bossSpawn();
          if (gameSettings.screenShake) screenShakeAmt = 1.2;
          showWaveAnnouncement(wave, true, true);
        } else if (wave % 5 === 0) {
          bossCountdownTimer = BOSS_COUNTDOWN_TIME;
          pendingBossType = 1;
          sounds.bossSpawn();
          if (gameSettings.screenShake) screenShakeAmt = 0.7;
          showWaveAnnouncement(wave, true);
        } else {
          waveClearTimer = WAVE_BREAK_TIME;
          playSound(850, 0.4, 'sine');
          setTimeout(() => playSound(1050, 0.4, 'sine'), 120);
        }
      }
    }

 // Classic / Ranked: spawn enemies (not during boss fight, between-wave break, or boss countdown)
    if ((currentGameMode === 'classic' || currentGameMode === 'ranked') && !boss && waveClearTimer <= 0 && bossCountdownTimer <= 0) {
      spawnTimer += dt;
      const spawnRate = Math.max(0.25, 1.0 - wave * 0.05);
      if (spawnTimer > spawnRate && enemiesThisWave < enemiesNeeded) {
        spawnEnemy();
        spawnTimer = 0;
      }
    }

 // Game over
    if (player.hp <= 0) {
      if (currentGameMode !== 'classic') {
        // Non-classic modes use the mode-end overlay.
        // Set running=false immediately (mirrors classic) so:
        //  (a) this block can't re-fire on the next frame
        //  (b) particles/death effect still render (particle update is outside if(running))
        running = false;
        player.hp = -9999;
        const deathX = player.x, deathY = player.y;
        player.draw = () => {};
        if (_hasDeathEffect) createDeathEffect(deathX, deathY);
        else createExplosion(deathX, deathY, '#ff4444', 50);
        document.getElementById('buffsDisplay').innerHTML = '';
        activeBuffElements = {};
        comboEl.classList.add('hidden');
        setTimeout(() => endModeRun('death'), 700);
        // Keep loop alive so death particles animate and next startGame() works.
        requestAnimationFrame(loop);
        return;
      }
      if (_hasBattlePassXP) battlePassAddXP(BP_XP_CONFIG.matchCompletion);

 // Capture position before clearing player
      const deathX = player.x;
      const deathY = player.y;

 // Immediately hide player skin but keep loop running for particle rendering
      player.draw = () => {};
      player.hp = -9999; // prevent re-triggering this block

 // Trigger death effect
      if (_hasDeathEffect) {
        createDeathEffect(deathX, deathY);
      } else {
        createExplosion(deathX, deathY, '#ff4444', 50);
      }

 // Clear HUD overlays right away
      document.getElementById('buffsDisplay').innerHTML = '';
      activeBuffElements = {};
      comboEl.classList.add('hidden');

 // Update high score immediately so the save captures the correct value
      if (score > high) {
        high = score;
        if (isGuest || !currentUser) localStorage.setItem('highscore', score);
      }

 // Submit score and save immediately (don't wait for visual delay)
      if (currentUser && !isGuest) {
        if (typeof acSessionEnd === 'function') acSessionEnd(wave, totalKills);
        if (typeof acSubmitScore === 'function') acSubmitScore(score);
        const SESSION_COIN_CAP = 5000;
        const sessionEarned = playerCoins - _sessionStartCoins;
        if (sessionEarned > SESSION_COIN_CAP) playerCoins = _sessionStartCoins + SESSION_COIN_CAP;
        saveUserDataToFirebase('critical');
        _sessionStartCoins = playerCoins;
      }

 // Pause game logic (enemies/bullets stop moving) but keep loop alive for particles
      running = false;

 // Wait for death effect to finish before showing home screen
      const deathDelay = (typeof battlePassData !== 'undefined' && battlePassData.activeDeathEffect)
        ? (battlePassData.activeDeathEffect === 'supernova' ? 1800 : 1300)
        : 700;

      setTimeout(() => {
        // Post-game crate drop (fire-and-forget)
        if (typeof _triggerPostGameDrop === 'function') _triggerPostGameDrop('classic', null);

        const homeScreen = document.getElementById('homeScreen');
        const gameOverMsg = document.getElementById('gameOverMsg');
        const finalScoreEl = document.getElementById('finalScore');
        homeScreen.classList.remove('hidden');
        gameOverMsg.classList.remove('hidden');
        if (finalScoreEl) finalScoreEl.textContent = score;
        document.getElementById('homeHighVal').textContent = high;
        document.getElementById('homeCoinsVal').textContent = playerCoins;
        updateXPDisplay(); // Update XP display on home screen
      }, deathDelay);
    }

    scoreEl.textContent = score;
    hpEl.textContent = Math.max(0, Math.floor(player.hp));

 // Update coins HUD
    const coinsHUDEl = document.getElementById('coinsHUD');
    if (coinsHUDEl) coinsHUDEl.textContent = `🪙 ${playerCoins}`;

 // Update active buffs panel
    updateBuffsDisplay();

 // FPS counter
    if (gameSettings.showFPS) {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = fpsDisplay >= 50 ? '#6bff7b' : fpsDisplay >= 30 ? '#ffd93d' : '#ff4757';
      ctx.fillText(`FPS: ${fpsDisplay}`, canvas.width - 12, 12);
      ctx.restore();
    }

 // Draw between-wave countdown
    if (waveClearTimer > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
 // Pulsing circle background
      const pulse = Math.sin(Date.now() / 200) * 0.1 + 0.9;
      const circleRadius = 80 * pulse;
      
 // Outer glow circle
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, circleRadius + 20);
      gradient.addColorStop(0, 'rgba(107, 255, 123, 0.3)');
      gradient.addColorStop(0.7, 'rgba(107, 255, 123, 0.1)');
      gradient.addColorStop(1, 'rgba(107, 255, 123, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, circleRadius + 20, 0, Math.PI * 2);
      ctx.fill();
      
 // Main circle
      ctx.fillStyle = 'rgba(20, 25, 35, 0.95)';
      ctx.strokeStyle = '#6bff7b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
 // Progress arc (countdown visual)
      const progress = waveClearTimer / WAVE_BREAK_TIME;
      ctx.strokeStyle = '#ffd93d';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(centerX, centerY, circleRadius - 12, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress), false);
      ctx.stroke();
      
 // Countdown number - large and prominent
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#ffd93d';
      ctx.font = 'bold 64px system-ui';
      ctx.fillStyle = '#ffd93d';
      ctx.fillText(Math.ceil(waveClearTimer), centerX, centerY);
      
 // Small "WAVE CLEAR" text above
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#6bff7b';
      ctx.font = '600 14px system-ui';
      ctx.fillStyle = '#6bff7b';
      ctx.fillText('WAVE CLEARED', centerX, centerY - 50);
      
 // Small "NEXT WAVE" text below
      ctx.shadowBlur = 0;
      ctx.font = '500 12px system-ui';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillText('NEXT WAVE', centerX, centerY + 50);
      
      ctx.restore();
    }

 // Draw boss countdown (red/orange warning theme)
    if (bossCountdownTimer > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
 // Pulsing circle background (faster pulse for urgency)
      const pulse = Math.sin(Date.now() / 150) * 0.15 + 0.85;
      const circleRadius = 90 * pulse;
      
 // Outer glow circle (red/orange warning)
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, circleRadius + 25);
      gradient.addColorStop(0, 'rgba(255, 71, 87, 0.4)');
      gradient.addColorStop(0.7, 'rgba(255, 107, 53, 0.2)');
      gradient.addColorStop(1, 'rgba(255, 71, 87, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, circleRadius + 25, 0, Math.PI * 2);
      ctx.fill();
      
 // Main circle (darker background)
      ctx.fillStyle = 'rgba(20, 15, 25, 0.95)';
      ctx.strokeStyle = '#ff4757';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
 // Progress arc (countdown visual in red/orange)
      const progress = bossCountdownTimer / BOSS_COUNTDOWN_TIME;
      ctx.strokeStyle = '#ff6348';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(centerX, centerY, circleRadius - 15, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress), false);
      ctx.stroke();
      
 // Countdown number - large and prominent
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#ff4757';
      ctx.font = 'bold 72px system-ui';
      ctx.fillStyle = '#ff4757';
      ctx.fillText(Math.ceil(bossCountdownTimer), centerX, centerY);
      
 // Warning text above
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ff6348';
      ctx.font = 'bold 18px system-ui';
      ctx.fillStyle = '#ff6348';
      
 // Determine boss type text
      let bossTypeText = 'BOSS INCOMING';
      if (pendingBossType === 4) bossTypeText = '☠ LEGENDARY BOSS ☠';
      else if (pendingBossType === 3) bossTypeText = 'OMEGA OVERLORD';
      else if (pendingBossType === 2) bossTypeText = 'MEGA BOSS';
      
      ctx.fillText(bossTypeText, centerX, centerY - 60);
      
 // "GET READY!" text below
      ctx.shadowBlur = 8;
      ctx.font = 'bold 14px system-ui';
      ctx.fillStyle = '#ffd93d';
      ctx.fillText('GET READY!', centerX, centerY + 60);
      
      ctx.restore();
    }

 // Draw enemies remaining counter (classic / ranked)
    if ((currentGameMode === 'classic' || currentGameMode === 'ranked') && !boss && waveClearTimer <= 0 && running) {
      const enemiesNeededHUD = currentGameMode === 'ranked' ? wave * 3 + 10 : wave * 5 + 12;
      const remaining = Math.max(0, enemiesNeededHUD - enemiesKilledThisWave);
      
      ctx.save();
      
 // Background box
      const padding = 14;
      const boxWidth = 180;
      const boxHeight = 42;
      const boxX = 12;
      const boxY = canvas.height - boxHeight - 12;
      const borderRadius = 10;
      
 // Draw rounded rectangle background
      ctx.fillStyle = 'rgba(13,21,37,0.88)';
      ctx.beginPath();
      ctx.moveTo(boxX + borderRadius, boxY);
      ctx.lineTo(boxX + boxWidth - borderRadius, boxY);
      ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + borderRadius);
      ctx.lineTo(boxX + boxWidth, boxY + boxHeight - borderRadius);
      ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - borderRadius, boxY + boxHeight);
      ctx.lineTo(boxX + borderRadius, boxY + boxHeight);
      ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - borderRadius);
      ctx.lineTo(boxX, boxY + borderRadius);
      ctx.quadraticCurveTo(boxX, boxY, boxX + borderRadius, boxY);
      ctx.closePath();
      ctx.fill();
      
 // Border
      ctx.strokeStyle = 'rgba(88,166,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
 // Enemy icon (red circle)
      const iconX = boxX + 20;
      const iconY = boxY + boxHeight / 2;
      ctx.fillStyle = '#ff4757';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff4757';
      ctx.beginPath();
      ctx.arc(iconX, iconY, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
 // Text
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '600 14px Inter, system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('Enemies', iconX + 18, iconY - 8);
      
 // Remaining count
      ctx.font = '700 18px Inter, system-ui';
      const countColor = remaining <= 5 ? '#6bff7b' : remaining <= 10 ? '#ffd93d' : '#9be7ff';
      ctx.fillStyle = countColor;
      ctx.shadowBlur = 6;
      ctx.shadowColor = countColor;
      ctx.fillText(remaining, iconX + 18, iconY + 9);
      ctx.shadowBlur = 0;
      
      ctx.restore();
    }
  }

 // Always update particles (even during death effect delay when running=false)
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update(dt);
    if (particles[i].life <= 0) {
      if (particlePool.length < PARTICLE_POOL_MAX) particlePool.push(particles[i]);
      particles[i] = particles[particles.length - 1];
      particles.pop();
    }
  }

 // Draw trail particles FIRST (behind player)
  for (let i = 0; i < particles.length; i++) { if (particles[i].isTrail) particles[i].draw(); };

 // Draw everything
  if (player) player.draw();

  if (activeSkin === 'icon_the_creator') {
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      // solar energy projectile with warm trail
      const bGrad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r + 2);
      bGrad.addColorStop(0, '#ffffee');
      bGrad.addColorStop(0.5, '#ffaa33');
      bGrad.addColorStop(1, 'rgba(255, 80, 20, 0)');
      setShadow(10, '#ff9933');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2);
      ctx.fill();
      // core
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Batch all player bullets into one path — one fill() call instead of N
    setShadow(12, '#ffe66b');
    ctx.fillStyle = '#ffe66b';
    ctx.beginPath();
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      ctx.moveTo(b.x + b.r, b.y);
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  resetShadow();

  // Batch all enemy bullets into one path
  setShadow(10, '#ff4757');
  ctx.fillStyle = '#ff4757';
  ctx.beginPath();
  for (let i = 0; i < enemyBullets.length; i++) {
    const eb = enemyBullets[i];
    ctx.moveTo(eb.x + eb.r, eb.y);
    ctx.arc(eb.x, eb.y, eb.r, 0, Math.PI * 2);
  }
  ctx.fill();
  resetShadow();

  for (let i = 0; i < enemies.length; i++) enemies[i].draw();
  if (boss) boss.draw();
  for (let i = 0; i < particles.length; i++) { if (!particles[i].isTrail) particles[i].draw(); }
  for (let i = 0; i < powerups.length; i++) powerups[i].draw();

  if (shaking) {
    ctx.restore();
  }

  requestAnimationFrame(loop);
}

/* =======================
   GAME MODE HELPERS
======================= */

// ── Mode HUD visibility ───────────────────────────────────────
function hideModeHUDs() {
  ['modeTimerHUD','bossRushHUD','modeEndOverlay','rankedHUD','rankedEndOverlay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function showModeHUD(type) {
  hideModeHUDs();
  const map = { timer:'modeTimerHUD', bossrush:'bossRushHUD', ranked:'rankedHUD' };
  const el = document.getElementById(map[type]);
  if (el) el.style.display = '';
}

// ── Time Attack ───────────────────────────────────────────────
function updateTimerHUD() {
  const el = document.getElementById('modeTimerHUD');
  if (!el) return;
  const s = Math.ceil(taTimeLeft);
  const m = Math.floor(s / 60);
  el.textContent = `⏱ ${m}:${String(s % 60).padStart(2, '0')}`;
  el.classList.toggle('timer-warning', s <= 60 && s > 20);
  el.classList.toggle('timer-critical', s <= 20);
}

// ── Boss Rush ─────────────────────────────────────────────────
function updateBossRushHUD() {
  const el = document.getElementById('bossRushHUD');
  if (el) el.textContent = `👹 BOSS RUSH  ·  Beaten: ${brBossesBeaten}`;
}

function spawnBossRushBoss() {
  if (!running || paused) return;
  const cx = canvas.width / 2;
  // Cycle: Boss → MegaBoss → UltraBoss → Legendary, getting harder each cycle
  const cycle = Math.floor(brBossesBeaten / 4);
  const tier  = brBossesBeaten % 4; // 0=Boss, 1=Mega, 2=Ultra, 3=Legendary
  // Use a high fake-wave number so boss stats scale up
  const fakeWave = 10 + brBossesBeaten * 8 + cycle * 20;

  if (tier === 3)      boss = new LegendaryBoss(cx, 120, fakeWave);
  else if (tier === 2) boss = new UltraBoss(cx, 110, fakeWave);
  else if (tier === 1) boss = new MegaBoss(cx, 100, fakeWave);
  else                 boss = new Boss(cx, 80, fakeWave);

  // Extra HP scaling so pierce/burst can't trivialise it
  const hpScale = 1.5 + brBossesBeaten * 0.4;
  boss.hp = Math.round(boss.hp * hpScale);
  boss.maxHp = boss.hp;
  // Boss Rush bosses take reduced pierce/explosive damage
  boss.bossRushArmour = true;

  sounds.bossSpawn();
  showWaveAnnouncement(`BOSS ${brBossesBeaten + 1}`);
}

// ── Mode end overlay ──────────────────────────────────────────
function showModeEndOverlay(title, sub, stats, newBest) {
  let el = document.getElementById('modeEndOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'modeEndOverlay';
    document.getElementById('ui').appendChild(el);
  }
  el.innerHTML = `
    <div class="mode-end-box">
      <div class="mode-end-title">${title}</div>
      <div class="mode-end-sub">${sub}</div>
      <div class="mode-end-stats">
        ${stats.map(s => `<div class="mode-end-stat"><div class="mode-end-stat-val">${s.val}</div><div class="mode-end-stat-lbl">${s.lbl}</div></div>`).join('')}
      </div>
      ${newBest ? '<div class="mode-end-new-best">★ NEW BEST ★</div>' : ''}
      <button class="home-btn primary" id="modeEndPlayAgainBtn">▶ PLAY AGAIN</button>
      <button class="home-btn" id="modeEndMenuBtn">⌂ MAIN MENU</button>
    </div>`;
  el.style.display = 'flex';

  document.getElementById('modeEndPlayAgainBtn').addEventListener('click', () => {
    el.style.display = 'none';
    startGame();
  });

  document.getElementById('modeEndMenuBtn').addEventListener('click', () => {
    el.style.display = 'none';
    running = false;
    paused = false;
    document.getElementById('wave').style.display = '';
    hideModeHUDs();
    document.getElementById('homeScreen').classList.remove('hidden');
    document.getElementById('homeHighVal').textContent = high;
    document.getElementById('homeCoinsVal').textContent = playerCoins;
    document.getElementById('buffsDisplay').innerHTML = '';
    activeBuffElements = {};
    comboEl.classList.add('hidden');
  });
}

// ── Mode personal bests (local cache) ────────────────────────
function getModeBests() {
  try { return JSON.parse(localStorage.getItem('topdown_mode_bests') || '{}'); } catch { return {}; }
}
function saveModeBest(mode, value) {
  const bests = getModeBests();
  const prev = bests[mode];
  const isNew = (prev === undefined) || (value > prev);
  if (isNew) {
    bests[mode] = value;
    localStorage.setItem('topdown_mode_bests', JSON.stringify(bests));
  }
  return isNew;
}

function populateModeSelectBests() {
  const bests = getModeBests();
  const formats = {
    classic:    v => `Best: Wave ${v}`,
    timeattack: v => `Best: ${v} kills`,
    bossrush:   v => `Best: ${v} bosses`,
  };
  // Also use classic high score
  const classicEl = document.getElementById('modeBest_classic');
  if (classicEl) classicEl.textContent = high > 0 ? `Best: Score ${high.toLocaleString()}` : 'Best: —';

  ['timeattack','bossrush'].forEach(m => {
    const el = document.getElementById(`modeBest_${m}`);
    if (!el) return;
    el.textContent = bests[m] ? formats[m](bests[m]) : 'Best: —';
  });

  // Refresh ranked badge from server when mode select opens
  if (typeof loadRankedProfile === 'function') loadRankedProfile();
}

// ── Mode end: submit score + show overlay ─────────────────────
async function endModeRun(reason) {
  if (!modeRunActive) return;
  modeRunActive = false;
  running = false;
  paused = false;
  hideModeHUDs();
  comboEl.classList.add('hidden');

  const elapsed = Date.now() - runStartTime;
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('topdown_token') : null;
  const BASE = API_BASE.replace(/\/api$/, '');

  if (currentGameMode === 'timeattack') {
    const isNew = saveModeBest('timeattack', totalKills);
    if (token && currentUser && !isGuest) {
      fetch(`${BASE}/api/leaderboard/submit/timeattack`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({kills: totalKills}) }).catch(err => console.warn('[Leaderboard] TA submit:', err));
    }
    showModeEndOverlay('TIME\'S UP!', 'Time Attack Complete', [{val: totalKills, lbl:'KILLS'},{val: formatRunTime(elapsed), lbl:'TIME'}], isNew);

  } else if (currentGameMode === 'bossrush') {
    const isNew = saveModeBest('bossrush', brBossesBeaten);
    if (token && currentUser && !isGuest) {
      fetch(`${BASE}/api/leaderboard/submit/bossrush`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({bosses: brBossesBeaten}) }).catch(err => console.warn('[Leaderboard] BR submit:', err));
    }
    showModeEndOverlay('DEFEATED', 'Boss Rush Over', [{val: brBossesBeaten, lbl:'BOSSES BEATEN'},{val: formatRunTime(elapsed), lbl:'SURVIVED'}], isNew);

  } else if (currentGameMode === 'ranked') {
    // endRankedRun handles RP calc, server submit, and overlay
    if (typeof endRankedRun === 'function') {
      endRankedRun(reason === 'complete').catch(err => console.warn('[Ranked] end:', err));
    }
  }
}

// ── Mode card selection wiring (runs after DOM ready) ─────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('mode-selected'));
      card.classList.add('mode-selected');
      currentGameMode = card.dataset.mode;
      const playBtn = document.getElementById('modePlayBtn');
      if (playBtn) {
        playBtn.disabled = false;
        playBtn.textContent = `▶ PLAY — ${card.querySelector('.mode-card-name').textContent}`;
      }
    });
  });

  document.getElementById('modePlayBtn')?.addEventListener('click', () => {
    if (!currentGameMode) return;
    startGame();
  });
});

/* =======================
   UI WIRING
======================= */

console.log('🎮 Setting up UI...');

// Initial HUD values
document.getElementById('homeHighVal').textContent = high;
document.getElementById('homeCoinsVal').textContent = playerCoins;

// Cached function-existence checks (resolved once at game start, not every frame)
let _hasTrailParticle = false;
let _hasBattlePassXP = false;
let _hasDeathEffect = false;

function startGame() {
  _hasTrailParticle = typeof createTrailParticle === 'function';
  _hasBattlePassXP  = typeof battlePassAddXP === 'function';
  _hasDeathEffect   = typeof createDeathEffect === 'function';
  initAudio();
  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('modeSelectPanel')?.classList.add('hidden');
  document.getElementById('gameOverMsg').classList.add('hidden');
  hideModeHUDs();
  player = new Player(canvas.width / 2, canvas.height / 2);
  bullets = [];
  enemies = [];
  enemyBullets = [];
  particles = [];
  powerups = [];
  boss = null;
  score = 0;
  _sessionStartCoins = playerCoins;
  wave = 1;
  enemiesThisWave = 0;
  enemiesKilledThisWave = 0;
  totalKills = 0;
  runStartTime = Date.now();
  spawnTimer = 0;
  combo = 0;
  comboTimer = 0;
  screenShakeAmt = 0;
  lastTime = 0;
  running = true;
  paused = false;
  modeRunActive = (currentGameMode !== 'classic');
  waveClearTimer = 0;
  bossCountdownTimer = 0;
  pendingBossType = null;
  skipNextFrame = false;
  waveEl.textContent = wave;
  const killsValEl = document.getElementById('killsVal');
  if (killsValEl) killsValEl.textContent = '0';
  comboEl.classList.add('hidden');
  document.getElementById('buffsDisplay').innerHTML = '';
  activeBuffElements = {};

  // ── Mode-specific init ───────────────────────────────────────
  taTimeLeft = TIME_ATTACK_DURATION;
  brBossesBeaten = 0;
  brRestTimer = 0;

  if (currentGameMode === 'timeattack') {
    showModeHUD('timer');
    updateTimerHUD();
    // wave HUD not meaningful in TA
    document.getElementById('wave').style.display = 'none';
  } else if (currentGameMode === 'bossrush') {
    showModeHUD('bossrush');
    updateBossRushHUD();
    document.getElementById('wave').style.display = 'none';
    spawnBossRushBoss();
  } else if (currentGameMode === 'ranked') {
    if (typeof rankedInit === 'function') rankedInit();
    showModeHUD('ranked');
    if (typeof updateRankedHUD === 'function') updateRankedHUD();
    const rcfg = typeof getRankedConfig === 'function' ? getRankedConfig() : null;
    const targetW = rcfg ? rcfg.targetWaves : 10;
    const safeTgt = targetW > 9000 ? '∞' : targetW;
    waveEl.textContent = `1/${safeTgt}`;
    document.getElementById('wave').style.display = '';
    showWaveAnnouncement(1);
  } else {
    // Classic — show normal wave HUD
    document.getElementById('wave').style.display = '';
    showWaveAnnouncement(1);
  }

  if (typeof acSessionStart === 'function') acSessionStart();
  updateXPDisplay();
  if (typeof achOnGameStart === 'function') achOnGameStart();
}

// Show the mode select panel instead of directly starting
document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('homeScreen').classList.add('hidden');
  const panel = document.getElementById('modeSelectPanel');
  if (panel) {
    populateModeSelectBests();
    panel.classList.remove('hidden');
  } else {
    startGame();
  }
});

document.getElementById('modeSelectBackBtn')?.addEventListener('click', () => {
  document.getElementById('modeSelectPanel').classList.add('hidden');
  document.getElementById('homeScreen').classList.remove('hidden');
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  document.getElementById('homeScreen').classList.add('hidden');
  initSettingsUI(false);
});

document.getElementById('shopBtn').addEventListener('click', () => {
  const home = document.getElementById('homeScreen');
  const shop = document.getElementById('shopPanel');
  home.classList.add('hs-exiting');
  home.addEventListener('animationend', () => {
    home.classList.add('hidden');
    home.classList.remove('hs-exiting');
    shop.classList.remove('hidden');
    initShopUI();
    shop.classList.add('panel-overlay-entering');
    shop.addEventListener('animationend', () => {
      shop.classList.remove('panel-overlay-entering');
    }, { once: true });
  }, { once: true });
});

document.getElementById('shopBackBtn').addEventListener('click', () => {
  const home = document.getElementById('homeScreen');
  const shop = document.getElementById('shopPanel');
  shop.classList.add('hs-exiting');
  shop.addEventListener('animationend', () => {
    shop.classList.add('hidden');
    shop.classList.remove('hs-exiting');
    home.classList.remove('hidden');
    home.classList.add('panel-overlay-entering');
    home.addEventListener('animationend', () => {
      home.classList.remove('panel-overlay-entering');
      document.getElementById('homeCoinsVal').textContent = playerCoins;
    }, { once: true });
  }, { once: true });
});

// Shop tab switching
document.querySelectorAll('.shop-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    
 // Update active tab
    document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
 // Show correct content
    document.querySelectorAll('.shop-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`shopTab-${targetTab}`).classList.remove('hidden');

 // Initialize content if needed
    if (targetTab === 'crates' && typeof initCratesTab === 'function') {
      initCratesTab();
    }
    if (targetTab === 'battlepass' && typeof initBattlePassTab === 'function') {
      initBattlePassTab();
    }
    if (targetTab === 'cosmetics' && typeof initCosmeticsTab === 'function') {
      initCosmeticsTab();
    }
    if (targetTab === 'marketplace' && typeof openMarketplaceTab === 'function') {
      openMarketplaceTab();
    }
    if (targetTab === 'inventory') {
      initInventoryTab();
    }
    if (targetTab === 'trades' && typeof initTradesTab === 'function') {
      initTradesTab();
    }
    if (targetTab === 'tradeup' && typeof initTradeUpTab === 'function') {
      initTradeUpTab();
    }
  });
});

// ══════════════════════════════════════════════════════════════
// INVENTORY TAB + LIVE SKIN TRY
// ══════════════════════════════════════════════════════════════

let _invFilter = 'all';
let _invSort   = 'rarity-desc';
let _tryingSkin = null;
let _realEquippedSkin = null;

function initInventoryTab() {
  _renderInventory();
  document.querySelectorAll('.inv-filter').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.inv-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _invFilter = btn.dataset.filter;
      _renderInventory();
    };
  });
  const sortSel = document.getElementById('invSortSelect');
  if (sortSel) {
    sortSel.value = _invSort;
    sortSel.onchange = () => { _invSort = sortSel.value; _renderInventory(); };
  }
}

function _renderInventory() {
  const grid  = document.getElementById('invGrid');
  const empty = document.getElementById('invEmpty');
  if (!grid) return;
  grid.innerHTML = '';

  // Count copies per skin
  const countMap = {};
  for (const id of ownedSkins) countMap[id] = (countMap[id] || 0) + 1;

  // Stats bar
  const totalCount   = ownedSkins.length;
  const mutatedCount = ownedSkins.filter(s => s.includes('__')).length;
  const totalEl = document.getElementById('invTotalCount');
  const mutEl   = document.getElementById('invMutatedCount');
  if (totalEl) totalEl.textContent = `${totalCount} skin${totalCount !== 1 ? 's' : ''}`;
  if (mutEl)  { mutEl.textContent = `${mutatedCount} mutated`; mutEl.style.display = mutatedCount > 0 ? '' : 'none'; }

  // Deduplicate
  const rarityOrder = { mythic: 0, legendary: 1, epic: 2, rare: 3, uncommon: 4, common: 5, icon: 6 };
  const seen = new Set();
  const entries = [];
  for (const skinId of ownedSkins) {
    if (seen.has(skinId)) continue;
    seen.add(skinId);
    entries.push({ skinId, count: countMap[skinId] });
  }

  // Helper: get skin value (price) for sorting
  const getSkinValue = (skinId) => {
    const { baseSkinId } = typeof parseMutatedSkinId === 'function'
      ? parseMutatedSkinId(skinId) : { baseSkinId: skinId };
    const s = SKINS.find(sk => sk.id === baseSkinId);
    return s ? (s.price || 0) : 0;
  };
  const getSkinName = (skinId) => {
    const { baseSkinId } = typeof parseMutatedSkinId === 'function'
      ? parseMutatedSkinId(skinId) : { baseSkinId: skinId };
    const s = SKINS.find(sk => sk.id === baseSkinId);
    return s ? s.name : baseSkinId;
  };

  entries.sort((a, b) => {
    // Equipped skin always first
    if (a.skinId === activeSkin) return -1;
    if (b.skinId === activeSkin) return 1;

    const ra = typeof getSkinRarity === 'function' ? (getSkinRarity(a.skinId) || 'common') : 'common';
    const rb = typeof getSkinRarity === 'function' ? (getSkinRarity(b.skinId) || 'common') : 'common';
    const oa = rarityOrder[ra] ?? 7;
    const ob = rarityOrder[rb] ?? 7;

    switch (_invSort) {
      case 'rarity-desc': return oa !== ob ? oa - ob : a.skinId.localeCompare(b.skinId);
      case 'rarity-asc':  return oa !== ob ? ob - oa : a.skinId.localeCompare(b.skinId);
      case 'name-asc':    return getSkinName(a.skinId).localeCompare(getSkinName(b.skinId));
      case 'name-desc':   return getSkinName(b.skinId).localeCompare(getSkinName(a.skinId));
      case 'value-desc':  return getSkinValue(b.skinId) - getSkinValue(a.skinId) || oa - ob;
      case 'value-asc':   return getSkinValue(a.skinId) - getSkinValue(b.skinId) || oa - ob;
      case 'count-desc':  return b.count - a.count || oa - ob;
      default:            return oa !== ob ? oa - ob : a.skinId.localeCompare(b.skinId);
    }
  });

  // Apply filter
  const filtered = entries.filter(({ skinId }) => {
    if (_invFilter === 'all')     return true;
    if (_invFilter === 'mutated') return skinId.includes('__');
    const r = typeof getSkinRarity === 'function' ? getSkinRarity(skinId) : null;
    return r === _invFilter;
  });

  if (filtered.length === 0) {
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  for (const { skinId, count } of filtered) {
    grid.appendChild(_buildInvCard(skinId, count));
  }
}

function _buildInvCard(skinId, count) {
  const { baseSkinId, mutation } = typeof parseMutatedSkinId === 'function'
    ? parseMutatedSkinId(skinId) : { baseSkinId: skinId, mutation: null };
  const skin    = SKINS.find(s => s.id === baseSkinId);
  const mc      = mutation && typeof MUTATION_CONFIG !== 'undefined' ? MUTATION_CONFIG[mutation] : null;
  const rarity  = typeof getSkinRarity === 'function' ? getSkinRarity(skinId) : null;
  const isActive  = activeSkin === skinId;
  const isTrying  = _tryingSkin === skinId;

  const card = document.createElement('div');
  card.className = 'inv-card' + (isActive ? ' inv-active' : '') + (mc ? ` ${mc.cssClass}` : '');

  // Preview circle — use rich gradients + animations matching the crates tab
  const preview = document.createElement('div');
  preview.className = 'inv-preview';
  const rc = (rarity && typeof getRarityColor === 'function') ? getRarityColor(rarity) : '#888';
  applyRichSkinPreview(preview, baseSkinId, skin ? skin.color : null);
  if (mc) {
    if (mc.cssFilter) preview.style.filter = mc.cssFilter;
    preview.style.boxShadow += `, 0 0 16px ${mc.glowColor}`;
  }

  // Name + count badge
  const nameRow = document.createElement('div');
  nameRow.className = 'inv-name-row';
  const nameEl = document.createElement('div');
  nameEl.className = 'inv-name';
  nameEl.textContent = skin ? skin.name : baseSkinId;
  if (mc) { nameEl.style.color = mc.color; nameEl.style.textShadow = `0 0 8px ${mc.color}`; }
  nameRow.appendChild(nameEl);
  if (count > 1) {
    const badge = document.createElement('span');
    badge.className = 'inv-count-badge';
    badge.textContent = `×${count}`;
    nameRow.appendChild(badge);
  }

  // Rarity + mutation badges
  const meta = document.createElement('div');
  meta.className = 'inv-meta';
  if (rarity) {
    const rar = document.createElement('span');
    rar.className = 'inv-rarity';
    rar.style.color = rc;
    rar.textContent = rarity.toUpperCase();
    meta.appendChild(rar);
  }
  if (mc) {
    const mb = document.createElement('span');
    mb.className = `inv-mut-badge`;
    mb.style.color = mc.color;
    mb.textContent = `✦ ${mc.label}`;
    meta.appendChild(mb);
  }

  // Market value hint
  const tradeable = typeof isSkinTradeable === 'function' && isSkinTradeable(skinId);
  if (tradeable && typeof getMutatedPriceLimits === 'function') {
    const limits = getMutatedPriceLimits(skinId);
    if (limits) {
      const priceEl = document.createElement('div');
      priceEl.className = 'inv-price';
      priceEl.textContent = `🪙 ${limits.floor.toLocaleString()} – ${limits.ceiling.toLocaleString()}`;
      meta.appendChild(priceEl);
    }
  }

  // Action buttons
  const btns = document.createElement('div');
  btns.className = 'inv-btns';

  const equipBtn = document.createElement('button');
  equipBtn.className = 'inv-btn inv-btn-equip';
  if (isActive) {
    equipBtn.textContent = '✓ ON';
    equipBtn.disabled = true;
  } else {
    equipBtn.textContent = 'EQUIP';
    equipBtn.onclick = () => {
      if (_tryingSkin) stopTrySkin();
      activeSkin = skinId;
      saveSkins();
      _renderInventory();
    };
  }

  const tryBtn = document.createElement('button');
  tryBtn.className = 'inv-btn inv-btn-try' + (isTrying ? ' trying' : '');
  tryBtn.textContent = isTrying ? '⏹ STOP' : '▶ TRY';
  tryBtn.onclick = () => { isTrying ? stopTrySkin() : trySkin(skinId); };

  btns.appendChild(equipBtn);
  btns.appendChild(tryBtn);

  if (tradeable) {
    const listBtn = document.createElement('button');
    listBtn.className = 'inv-btn inv-btn-list';
    listBtn.textContent = '🏪 SELL';
    listBtn.onclick = () => quickListSkin(skinId);
    btns.appendChild(listBtn);
  }

  card.appendChild(preview);
  card.appendChild(nameRow);
  card.appendChild(meta);
  card.appendChild(btns);
  return card;
}

function trySkin(skinId) {
  if (!_tryingSkin) _realEquippedSkin = activeSkin;
  _tryingSkin = skinId;
  activeSkin  = skinId;
  const banner = document.getElementById('trySkinBanner');
  const label  = document.getElementById('trySkinLabel');
  if (banner) banner.classList.remove('hidden');
  if (label) {
    const { baseSkinId, mutation } = typeof parseMutatedSkinId === 'function'
      ? parseMutatedSkinId(skinId) : { baseSkinId: skinId, mutation: null };
    const skin = SKINS.find(s => s.id === baseSkinId);
    const mc   = mutation && typeof MUTATION_CONFIG !== 'undefined' ? MUTATION_CONFIG[mutation] : null;
    label.textContent = mc ? `${skin?.name || baseSkinId} [${mc.label}]` : (skin?.name || baseSkinId);
    if (mc) { label.style.color = mc.color; } else { label.style.color = ''; }
  }
  _renderInventory();
}

function stopTrySkin() {
  if (!_tryingSkin) return;
  activeSkin      = _realEquippedSkin || 'agent';
  _tryingSkin     = null;
  _realEquippedSkin = null;
  const banner = document.getElementById('trySkinBanner');
  if (banner) banner.classList.add('hidden');
  _renderInventory();
}

function quickListSkin(skinId) {
  // Switch to marketplace tab
  document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
  const mpTab = document.querySelector('.shop-tab[data-tab="marketplace"]');
  if (mpTab) mpTab.classList.add('active');
  document.querySelectorAll('.shop-tab-content').forEach(c => c.classList.add('hidden'));
  document.getElementById('shopTab-marketplace')?.classList.remove('hidden');
  if (typeof openMarketplaceTab === 'function') openMarketplaceTab();
  // Pre-select the skin after marketplace initializes
  setTimeout(() => {
    if (typeof openSellModal === 'function') openSellModal();
    setTimeout(() => {
      const sel = document.getElementById('mpSellSkinSelect');
      if (sel && sel.querySelector(`option[value="${skinId}"]`)) {
        sel.value = skinId;
        if (typeof onSkinSelectChange === 'function') onSkinSelectChange();
      }
    }, 150);
  }, 200);
}

document.getElementById('resumeBtn').addEventListener('click', () => {
  togglePause();
});

document.getElementById('restartBtn').addEventListener('click', () => {
  if (currentGameMode === 'ranked') {
    document.getElementById('rankedQuitConfirm').classList.remove('hidden');
  } else {
    document.getElementById('restartConfirm').classList.remove('hidden');
  }
});

document.getElementById('restartConfirmNo').addEventListener('click', () => {
  document.getElementById('restartConfirm').classList.add('hidden');
});

document.getElementById('rankedQuitConfirmNo').addEventListener('click', () => {
  document.getElementById('rankedQuitConfirm').classList.add('hidden');
});

document.getElementById('rankedQuitConfirmYes').addEventListener('click', () => {
  running = false;
  paused = false;
  document.getElementById('pauseOverlay').classList.add('hidden');
  document.getElementById('rankedQuitConfirm').classList.add('hidden');
  if (typeof endRankedRun === 'function') {
    endRankedRun(false).catch(err => console.warn('[Ranked] quit:', err));
  }
});

document.getElementById('restartConfirmYes').addEventListener('click', () => {
  document.getElementById('pauseOverlay').classList.add('hidden');
  document.getElementById('restartConfirm').classList.add('hidden');
  paused = false;
  running = false;
  startGame();
});

document.getElementById('pauseSettingsBtn').addEventListener('click', () => {
  document.getElementById('pauseOverlay').classList.add('hidden');
  initSettingsUI(true);
});

document.getElementById('menuBtn').addEventListener('click', () => {
  if (currentGameMode === 'ranked') {
    document.getElementById('rankedQuitConfirm').classList.remove('hidden');
    return;
  }
  running = false;
  paused = false;
  document.getElementById('pauseOverlay').classList.add('hidden');
  document.getElementById('homeScreen').classList.remove('hidden');
  document.getElementById('homeHighVal').textContent = high;
  document.getElementById('homeCoinsVal').textContent = playerCoins;
  document.getElementById('buffsDisplay').innerHTML = '';
  activeBuffElements = {}; // Clear buff tracking
  comboEl.classList.add('hidden'); // Hide combo when going to menu
});

console.log('🎬 Starting animation loop...');
requestAnimationFrame(loop);
console.log('✅ Game initialized!');

// ============================================
// DEV CONSOLE (admin only)
// ============================================

let devGodMode = false;
let devDifficultyMultiplier = 1.0;

// admin panel dev tab functions

function devSpawnEnemy(type) {
  if (!isAdmin || !running) return;
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const x = Math.max(20, Math.min(canvas.width - 20, cx + (Math.random() - 0.5) * 300));
  const y = Math.max(20, Math.min(canvas.height - 20, cy + (Math.random() - 0.5) * 300));
  enemies.push(new Enemy(x, y, type || 'normal'));
  showAdminMessage(`Spawned ${type} enemy`, false);
}

function devSpawnPowerup(type) {
  if (!isAdmin || !running) return;
  const x = Math.max(20, Math.min(canvas.width - 20, player.x + (Math.random() - 0.5) * 200));
  const y = Math.max(20, Math.min(canvas.height - 20, player.y + (Math.random() - 0.5) * 200));
  spawnPowerUp(x, y, type);
  showAdminMessage(`Spawned ${type} powerup`, false);
}

function devTeleport() {
  if (!isAdmin || !running) return;
  const x = parseFloat(document.getElementById('devTeleportX').value) || canvas.width / 2;
  const y = parseFloat(document.getElementById('devTeleportY').value) || canvas.height / 2;
  player.x = Math.max(player.r, Math.min(canvas.width - player.r, x));
  player.y = Math.max(player.r, Math.min(canvas.height - player.r, y));
  showAdminMessage(`Teleported to (${Math.round(player.x)}, ${Math.round(player.y)})`, false);
}

function devSetDifficulty() {
  if (!isAdmin) return;
  const val = parseFloat(document.getElementById('devDifficulty').value);
  if (!isNaN(val) && val > 0) {
    devDifficultyMultiplier = val;
    showAdminMessage(`Difficulty set to ${val}×`, false);
  }
}

function devResetUpgrades() {
  if (!isAdmin) return;
  if (player) {
    player.weaponLevel = 1;
    player.maxHpLevel  = 1;
    player.speedLevel  = 1;
    player.maxHp       = 100;
    player.hp          = Math.min(player.hp, player.maxHp);
    player.baseSpeed   = 250;
    player.speed       = 250;
  }
  showAdminMessage('Upgrades reset to level 1', false);
}

function devUnlockAllSkins() {
  if (!isAdmin) return;
  if (typeof SKINS !== 'undefined') {
    const mutations = Object.keys(MUTATION_CONFIG);
    SKINS.forEach(s => {
      // Base skin
      if (!ownedSkins.includes(s.id)) ownedSkins.push(s.id);
      // Every mutation variant
      mutations.forEach(mut => {
        const mutId = `${s.id}__${mut}`;
        if (!ownedSkins.includes(mutId)) ownedSkins.push(mutId);
      });
    });
    if (typeof saveUserDataToFirebase === 'function') saveUserDataToFirebase('critical');
    else if (typeof saveCoins === 'function') saveCoins();
  }
  const total = SKINS.length * (1 + Object.keys(MUTATION_CONFIG).length);
  showAdminMessage(`All skins + all mutations unlocked! (${total} total)`, false);
}

// ── Profile unlock dev helpers ──────────────────────────────────────────────

async function devGrantAllProfileUnlocks() {
  if (!isAdmin || !currentUser) return;
  try {
    const data = await apiPost('/admin/rotation/profile/grant-all-unlocks', {});
    if (data.error) { showAdminMessage('Error: ' + data.error, true); return; }
    showAdminMessage(`✅ Granted ${data.granted} profile unlockables to your account`, false);
  } catch (e) {
    showAdminMessage('Error: ' + e.message, true);
  }
}

async function devGrantS1Champion() {
  if (!isAdmin || !currentUser) return;
  try {
    const data = await apiPost('/admin/rotation/profile/grant-unlock', { unlockableId: 'badge_s1_champion' });
    if (data.error) { showAdminMessage('Error: ' + data.error, true); return; }
    showAdminMessage('🏆 S1 Champion badge granted!', false);
  } catch (e) {
    showAdminMessage('Error: ' + e.message, true);
  }
}

async function devGrantSpecificUnlock() {
  if (!isAdmin || !currentUser) return;
  const id = (document.getElementById('devUnlockId')?.value || '').trim();
  if (!id) { showAdminMessage('Enter an unlockable ID', true); return; }
  try {
    const data = await apiPost('/admin/rotation/profile/grant-unlock', { unlockableId: id });
    if (data.error) { showAdminMessage('Error: ' + data.error, true); return; }
    showAdminMessage(`✅ Granted: ${data.name} (${data.unlockableId})`, false);
  } catch (e) {
    showAdminMessage('Error: ' + e.message, true);
  }
}

async function devRevokeSpecificUnlock() {
  if (!isAdmin || !currentUser) return;
  const id = (document.getElementById('devRevokeId')?.value || '').trim();
  if (!id) { showAdminMessage('Enter an unlockable ID to revoke', true); return; }
  try {
    const data = await apiPost('/admin/rotation/profile/revoke-unlock', { unlockableId: id });
    if (data.error) { showAdminMessage('Error: ' + data.error, true); return; }
    showAdminMessage(`🗑️ Revoked: ${id} (${data.removed} row removed)`, false);
  } catch (e) {
    showAdminMessage('Error: ' + e.message, true);
  }
}

async function devRevokeAllUnlocks() {
  if (!isAdmin || !currentUser) return;
  try {
    const data = await apiPost('/admin/rotation/profile/revoke-all-unlocks', {});
    if (data.error) { showAdminMessage('Error: ' + data.error, true); return; }
    showAdminMessage(`💥 Revoked all ${data.removed} profile unlockables`, false);
  } catch (e) {
    showAdminMessage('Error: ' + e.message, true);
  }
}

// the creator skin

// Global flag to force next icon crate to give THE CREATOR
let devForceCreatorFlag = false;

function devForceCreatorNext() {
  if (!isAdmin) return;
  devForceCreatorFlag = true;
  showAdminMessage('✨ Next Icon Crate will give THE CREATOR!', false);
  console.log('👑 CREATOR FORCE ENABLED: Next Icon Crate opening will guarantee THE CREATOR');
}

function devUnlockCreator() {
  if (!isAdmin) return;
  if (!ownedSkins.includes('icon_the_creator')) {
    ownedSkins.push('icon_the_creator');
    if (typeof saveUserDataToFirebase === 'function') saveUserDataToFirebase();
    else if (typeof saveCoins === 'function') saveCoins();
    showAdminMessage('👑 THE CREATOR unlocked!', false);
    console.log('✨ THE CREATOR added to collection');
    
 // Refresh shop UI if it exists
    if (typeof initShopUI === 'function') {
      initShopUI();
    }
  } else {
    showAdminMessage('THE CREATOR already owned!', true);
  }
  devCheckCreatorStatus();
}

function devRemoveCreator() {
  if (!isAdmin) return;
  const index = ownedSkins.indexOf('icon_the_creator');
  if (index > -1) {
    ownedSkins.splice(index, 1);
    
 // If currently equipped, switch to default
    if (activeSkin === 'icon_the_creator') {
      activeSkin = 'agent';
      if (typeof saveSkins === 'function') saveSkins();
    }
    
    if (typeof saveUserDataToFirebase === 'function') saveUserDataToFirebase();
    else if (typeof saveCoins === 'function') saveCoins();
    showAdminMessage('THE CREATOR removed from collection', false);
    console.log('🗑️ THE CREATOR removed');
    
 // Refresh shop UI
    if (typeof initShopUI === 'function') {
      initShopUI();
    }
  } else {
    showAdminMessage('THE CREATOR not owned!', true);
  }
  devCheckCreatorStatus();
}

function devCheckCreatorStatus() {
  if (!isAdmin) return;
  const owned = ownedSkins.includes('icon_the_creator');
  const equipped = activeSkin === 'icon_the_creator';
  
  const statusEl = document.getElementById('creatorStatus');
  if (statusEl) {
    if (equipped) {
      statusEl.textContent = 'EQUIPPED';
      statusEl.className = 'dev-status on';
      statusEl.style.background = 'linear-gradient(135deg, #ffd700, #ff69b4)';
    } else if (owned) {
      statusEl.textContent = 'OWNED';
      statusEl.className = 'dev-status on';
    } else {
      statusEl.textContent = 'NOT OWNED';
      statusEl.className = 'dev-status off';
    }
  }
  
  console.log(`👑 THE CREATOR Status: ${owned ? 'OWNED' : 'NOT OWNED'} ${equipped ? '(EQUIPPED)' : ''}`);
  return owned;
}

function devEquipCreator() {
  if (!isAdmin) return;
 // Unlock if not owned
  if (!ownedSkins.includes('icon_the_creator')) {
    ownedSkins.push('icon_the_creator');
    showAdminMessage('THE CREATOR unlocked & equipped!', false);
  } else {
    showAdminMessage('THE CREATOR equipped!', false);
  }
  
  activeSkin = 'icon_the_creator';
  
  if (typeof saveUserDataToFirebase === 'function') saveUserDataToFirebase('critical');
  else if (typeof saveSkins === 'function') saveSkins();
  
  console.log('👑 THE CREATOR equipped');
  
 // Refresh shop UI
  if (typeof initShopUI === 'function') {
    initShopUI();
  }
  
  devCheckCreatorStatus();
}

function devSimulateCreatorPulls() {
  if (!isAdmin) return;
  const numPulls = parseInt(document.getElementById('devSimulatePulls').value) || 100;
  
 // Simulate pulls with 0.5% chance
  let creatorPulls = 0;
  for (let i = 0; i < numPulls; i++) {
    if (Math.random() < 0.005) {
      creatorPulls++;
    }
  }
  
  const percentage = ((creatorPulls / numPulls) * 100).toFixed(2);
  const resultEl = document.getElementById('simulationResult');
  
  if (resultEl) {
    resultEl.innerHTML = `<strong>${creatorPulls}</strong> Creator pulls in ${numPulls} attempts (${percentage}% vs 0.5% expected)`;
    
    if (creatorPulls === 0) {
      resultEl.style.color = '#ff6b6b';
    } else if (creatorPulls >= numPulls * 0.0075) {
      resultEl.style.color = '#6bff7b';
    } else {
      resultEl.style.color = '#ffd93d';
    }
  }
  
  console.log(`🎲 Simulated ${numPulls} pulls: ${creatorPulls} CREATOR (${percentage}%)`);
}


// in-game overlay dev functions

function devSpawnEnemyOverlay() {
  if (!isAdmin) return;
  const type = document.getElementById('ovEnemyType').value;
  devSpawnEnemy(type);
}

function devSpawnPowerupOverlay() {
  if (!isAdmin) return;
  const type = document.getElementById('ovPowerupType').value;
  devSpawnPowerup(type);
}

function devTeleportOverlay() {
  if (!isAdmin || !running) return;
  const x = parseFloat(document.getElementById('ovTeleportX').value) || canvas.width / 2;
  const y = parseFloat(document.getElementById('ovTeleportY').value) || canvas.height / 2;
  player.x = Math.max(player.r, Math.min(canvas.width - player.r, x));
  player.y = Math.max(player.r, Math.min(canvas.height - player.r, y));
}

function devSetDifficultyOverlay() {
  if (!isAdmin) return;
  const val = parseFloat(document.getElementById('ovDifficulty').value);
  if (!isNaN(val) && val > 0) devDifficultyMultiplier = val;
}

function devOverlayToggle() {
  if (!isAdmin) return;
  const el = document.getElementById('devOverlay');
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) {
 // Sync current values into overlay inputs
    document.getElementById('ovWaveInput').value = wave;
    document.getElementById('ovHpInput').value = Math.round(player.hp);
    document.getElementById('ovScoreInput').value = score;
    document.getElementById('ovCoinsInput').value = playerCoins;
    _devSyncGodStatus();
  }
}

function devOverlayClose() {
  document.getElementById('devOverlay').classList.add('hidden');
}

function _devSyncGodStatus() {
  const statuses = ['godModeStatus', 'ovGodStatus'];
  statuses.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = devGodMode ? 'ON' : 'OFF';
    el.className = 'dev-status ' + (devGodMode ? 'on' : 'off');
 // overlay uses dev-ov-status class
    if (id === 'ovGodStatus') {
      el.className = 'dev-ov-status ' + (devGodMode ? 'on' : 'off');
    }
  });
}

// Set Wave — jumps straight to that wave number
function devSetWave(fromOverlay = false) {
  if (!isAdmin) return;
  const input = fromOverlay ? 'ovWaveInput' : 'devWaveInput';
  const val = parseInt(document.getElementById(input).value);
  if (isNaN(val) || val < 1) return;

  wave = val;
 // Clear enemies and boss so the new wave can start clean
  enemies.length = 0;
  enemyBullets.length = 0;
  boss = null;
  waveClearTimer = 0;
  bossCountdownTimer = 0;
  pendingBossType = null;

  document.getElementById('waveVal').textContent = wave;
  document.getElementById('waveAnnouncement').textContent = `WAVE ${wave}`;
  document.getElementById('waveAnnouncement').classList.remove('hidden');
  setTimeout(() => document.getElementById('waveAnnouncement').classList.add('hidden'), 2000);
  console.log(`[DEV] Wave set to ${wave}`);
}

// Set HP
function devSetHp(fromOverlay = false) {
  if (!isAdmin || !running) return;
  const input = fromOverlay ? 'ovHpInput' : 'devHpInput';
  const val = parseInt(document.getElementById(input).value);
  if (isNaN(val) || val < 1) return;

  player.hp = val;
  player.maxHp = Math.max(player.maxHp, val);
  document.getElementById('hpVal').textContent = Math.round(player.hp);
  console.log(`[DEV] HP set to ${val}`);
}

// Set Score
function devSetScore(fromOverlay = false) {
  if (!isAdmin) return;
  const input = fromOverlay ? 'ovScoreInput' : 'devScoreInput';
  const val = parseInt(document.getElementById(input).value);
  if (isNaN(val) || val < 0) return;

  score = val;
  document.getElementById('scoreVal').textContent = score;
  console.log(`[DEV] Score set to ${val}`);
}

// Set Coins (exact amount, not adding)
function devSetCoins(fromOverlay = false) {
  if (!isAdmin) return;
  const input = fromOverlay ? 'ovCoinsInput' : 'devCoinsInput';
  const val = parseInt(document.getElementById(input).value);
  if (isNaN(val) || val < 0) return;

  playerCoins = val; // SET instead of ADD
  const coinsHUD = document.getElementById('coinsHUD');
  if (coinsHUD) coinsHUD.textContent = `🪙 ${playerCoins}`;
  document.getElementById('homeCoinsVal').textContent = playerCoins;
  if (currentUser && !isGuest && typeof saveUserDataToFirebase === 'function') {
    saveUserDataToFirebase('critical');
  } else {
    saveCoins();
  }
  console.log(`[DEV] Coins set to ${val}`);
}

// Set Battle Pass XP
function devSetBattlePassXP(fromOverlay = false) {
  if (!isAdmin) return;
  const input = fromOverlay ? 'ovBattlePassXPInput' : 'devBattlePassXPInput';
  const val = parseInt(document.getElementById(input).value);
  if (isNaN(val) || val < 0) return;

  if (typeof battlePassData !== 'undefined') {
    battlePassData.currentXP = val;
    checkTierUnlocks();
    saveBattlePassData();
 // Update UI if battle pass is open
    if (typeof updateBattlePassProgress === 'function') {
      updateBattlePassProgress();
    }
    console.log(`[DEV] Battle Pass XP set to ${val}`);
  }
}

// Set Weapon Level
function devSetWeapon(level) {
  if (!isAdmin || !running) return;
  player.weaponLevel = Math.max(1, Math.min(3, level));
  console.log(`[DEV] Weapon level set to ${player.weaponLevel}`);
}

// Set Max HP Level
function devSetMaxHp(level) {
  if (!isAdmin || !running) return;
  player.maxHpLevel = Math.max(1, Math.min(3, level));
  player.maxHp = 100 + (player.maxHpLevel - 1) * 20;
  player.hp = Math.min(player.hp, player.maxHp); // Cap current HP to new max
  console.log(`[DEV] Max HP level set to ${player.maxHpLevel} (${player.maxHp} HP)`);
}

// Set Speed Level
function devSetSpeed(level) {
  if (!isAdmin || !running) return;
  player.speedLevel = Math.max(1, Math.min(3, level));
  console.log(`[DEV] Speed level set to ${player.speedLevel}`);
}

// Toggle God Mode (player takes no damage)
function devToggleGodMode() {
  if (!isAdmin) return;
  devGodMode = !devGodMode;
  _devSyncGodStatus();
  console.log(`[DEV] God mode ${devGodMode ? 'ON' : 'OFF'}`);
}

// Kill all enemies and clear bullets
function devKillAll() {
  if (!isAdmin) return;
 // Award coins/score for each kill silently
  enemies.forEach(e => { score += e.score || 10; });
  enemies.length = 0;
  enemyBullets.length = 0;
  if (boss) {
    boss.hp = 0; // Let normal death logic handle it next frame
  }
  document.getElementById('scoreVal').textContent = score;
  console.log('[DEV] All enemies killed');
}

// Skip current wave (clears enemies, sets wave clear timer)
function devSkipWave() {
  if (!isAdmin) return;
  enemies.length = 0;
  enemyBullets.length = 0;
  boss = null;
  wave++;
  waveClearTimer = 0;
  bossCountdownTimer = 0;
  pendingBossType = null;
  document.getElementById('waveVal').textContent = wave;
  document.getElementById('waveAnnouncement').textContent = `WAVE ${wave}`;
  document.getElementById('waveAnnouncement').classList.remove('hidden');
  setTimeout(() => document.getElementById('waveAnnouncement').classList.add('hidden'), 2000);
  console.log(`[DEV] Skipped to wave ${wave}`);
}

// Spawn a specific boss type immediately
function devSpawnBoss(type) {
  if (!isAdmin || !running) return;
  enemies.length = 0;
  enemyBullets.length = 0;
  boss = null;
  bossCountdownTimer = 0;
  pendingBossType = null;

  const cx = canvas.width / 2;
  
 // Match exact spawn positions and parameters from normal game
  if (type === 4) {
    boss = new LegendaryBoss(cx, 140, wave); // Y=140 matches normal spawn
  } else if (type === 3) {
    boss = new UltraBoss(cx, 120, wave); // Y=120 matches normal spawn
  } else if (type === 2) {
    boss = new MegaBoss(cx, 100, wave); // Y=100 matches normal spawn
  } else {
    boss = new Boss(cx, 80, wave); // Y=80 matches normal spawn
  }

  sounds.bossSpawn();
  console.log(`[DEV] Spawned boss type ${type} for wave ${wave}`);
}

// Full heal player
function devFullHeal() {
  if (!isAdmin || !running) return;
  player.hp = player.maxHp;
  document.getElementById('hpVal').textContent = Math.round(player.hp);
  console.log('[DEV] Full heal applied');
}

// Patch player.takeDamage to respect god mode
const _origTakeDamage = Player.prototype.takeDamage;
Player.prototype.takeDamage = function(amount) {
  if (devGodMode) return;
  _origTakeDamage.call(this, amount);
};
// Initialize XP display on page load
setTimeout(() => {
  if (typeof updateXPDisplay === "function") updateXPDisplay();
}, 500);