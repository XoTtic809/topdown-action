// Topdown Action - Enhanced Edition
// Built with pure JavaScript
'use strict';

console.log('🎮 Game loading...');

/* =======================
   CANVAS & UI
======================= */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('scoreVal');
const hpEl = document.getElementById('hpVal');
const waveEl = document.getElementById('waveVal');
const comboEl = document.getElementById('combo');
const comboValEl = document.getElementById('comboVal');
const scorePopupsContainer = document.getElementById('scorePopups');
const dashAbility = document.getElementById('dashAbility');
const dashCooldownEl = dashAbility.querySelector('.ability-cooldown');
const dashTimerEl = dashAbility.querySelector('.ability-timer');

/* =======================
   RESIZE
======================= */

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

/* =======================
   CUSTOM CURSOR
======================= */

// Create custom cursor elements
const customCursor = document.createElement('div');
customCursor.className = 'custom-cursor';
const cursorDot = document.createElement('div');
cursorDot.className = 'custom-cursor-dot';
customCursor.appendChild(cursorDot);
document.body.appendChild(customCursor);

// Update cursor position
document.addEventListener('mousemove', (e) => {
  customCursor.style.left = e.clientX + 'px';
  customCursor.style.top = e.clientY + 'px';
});

// Hide cursor when leaving window
document.addEventListener('mouseleave', () => {
  customCursor.style.opacity = '0';
});

document.addEventListener('mouseenter', () => {
  customCursor.style.opacity = '1';
});

/* =======================
   INPUT
======================= */

const keys = {};
const mouse = { x: canvas.width / 2, y: canvas.height / 2, down: false };

window.addEventListener('keydown', (e) => {
  if (!e.key) return; // Safety check
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
  if (!e.key) return; // Safety check
  keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousedown', () => {
  mouse.down = true;
});

canvas.addEventListener('mouseup', () => {
  mouse.down = false;
});

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  mouse.down = true;
  const r = canvas.getBoundingClientRect();
  mouse.x = e.touches[0].clientX - r.left;
  mouse.y = e.touches[0].clientY - r.top;
});

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  mouse.down = false;
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  mouse.x = e.touches[0].clientX - r.left;
  mouse.y = e.touches[0].clientY - r.top;
});

/* =======================
   AUDIO SYSTEM
======================= */

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

/* =======================
   SETTINGS
======================= */

const defaultSettings = {
  masterSound: true,
  shootSound: true,
  screenShake: true,
  particles: true,
  showFPS: false,
  autoShoot: false
};

const gameSettings = Object.assign({}, defaultSettings,
  JSON.parse(localStorage.getItem('gameSettings') || '{}'));

function saveSettings() {
  localStorage.setItem('gameSettings', JSON.stringify(gameSettings));
}

/* =======================
   COINS & SKINS
======================= */

let playerCoins = Number(localStorage.getItem('playerCoins') || 0);

function saveCoins() {
  // Save to localStorage for guests only
  if (isGuest || !currentUser) {
    localStorage.setItem('playerCoins', playerCoins);
  }
  // Firebase saving happens in saveUserDataToFirebase (called on game over)
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
  // EXCLUSIVE LEADERBOARD SKINS (Not purchasable - earned only)
  { id: 'bronze-champion', name: '🥉 Bronze Champion', color: null, price: -1, leaderboardRank: 3, desc: '🏆 EXCLUSIVE: 3rd Place Global Rank' },
  { id: 'silver-champion', name: '🥈 Silver Champion', color: null, price: -1, leaderboardRank: 2, desc: '🏆 EXCLUSIVE: 2nd Place Global Rank' },
  { id: 'gold-champion',   name: '🥇 Gold Champion',   color: null, price: -1, leaderboardRank: 1, desc: '🏆 EXCLUSIVE: 1st Place Global Rank' },
];

let ownedSkins = JSON.parse(localStorage.getItem('ownedSkins') || '["agent"]');
let activeSkin = localStorage.getItem('activeSkin') || 'agent';

function saveSkins() {
  // Save to localStorage for guests only
  if (isGuest || !currentUser) {
    localStorage.setItem('ownedSkins', JSON.stringify(ownedSkins));
    localStorage.setItem('activeSkin', activeSkin);
  } else if (currentUser && typeof saveUserDataToFirebase === 'function') {
    // Save to Firebase for logged-in users
    saveUserDataToFirebase();
  }
}

function getActiveSkinColor() {
  if (activeSkin === 'rainbow') {
    const hue = (Date.now() / 20) % 360;
    return `hsl(${hue},100%,70%)`;
  }
  if (activeSkin === 'galaxy') {
    // Cycle through purple, blue, cyan, pink
    const time = Date.now() / 50;
    const hue = (time % 120) + 240; // Range from 240 (blue) to 360 (magenta)
    return `hsl(${hue},90%,65%)`;
  }
  if (activeSkin === 'void') {
    // Dark pulsing effect
    const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.5;
    const brightness = 15 + pulse * 25; // Very dark, pulsing
    return `hsl(270,100%,${brightness}%)`;
  }
  if (activeSkin === 'sunset') {
    // Orange to pink to purple gradient cycle
    const time = Date.now() / 40;
    const hue = ((time % 60) + 0); // 0-60 (red to orange to yellow/pink)
    return `hsl(${hue},100%,65%)`;
  }
  if (activeSkin === 'phoenix') {
    // Red/orange/yellow fire colors
    const time = Date.now() / 30;
    const hue = ((time % 40) + 0); // 0-40 (red to orange)
    const brightness = 60 + Math.sin(time / 5) * 10;
    return `hsl(${hue},100%,${brightness}%)`;
  }
  if (activeSkin === 'diamond') {
    // White with rainbow shimmer
    const time = Date.now() / 15;
    const saturation = 20 + Math.sin(time / 3) * 20;
    const hue = (time * 3) % 360;
    return `hsl(${hue},${saturation}%,95%)`;
  }
  if (activeSkin === 'quantum') {
    // Quantum Flux - Reality-bending chromatic aberration effect
    // Rapidly cycles through entire spectrum with glitch effects
    const time = Date.now() / 8;
    const hue = (time * 5) % 360;
    const saturation = 90 + Math.sin(time / 2) * 10;
    const brightness = 60 + Math.sin(time / 3) * 15;
    return `hsl(${hue},${saturation}%,${brightness}%)`;
  }
  // EXCLUSIVE LEADERBOARD CHAMPION SKINS
  if (activeSkin === 'gold-champion') {
    // Gold Champion - Divine radiance with rainbow prismatic edge and white core
    const time = Date.now() / 5;
    const mainGold = 45 + Math.sin(time / 3) * 5; // Gold hue oscillation
    const brightness = 85 + Math.sin(time / 2) * 12; // Pulsing brightness 73-97%
    const chromatic = (time * 8) % 360; // Fast rainbow edge effect
    const glitch = Math.sin(time / 1.5) * 3; // Micro-glitch
    // Complex layering: gold base + chromatic edge + white highlights
    return `hsl(${mainGold + glitch},100%,${brightness}%)`;
  }
  if (activeSkin === 'silver-champion') {
    // Silver Champion - Liquid metal with electric blue plasma and holographic shift
    const time = Date.now() / 6;
    const metalBase = 200 + Math.sin(time / 4) * 20; // Silver-blue shift
    const plasma = Math.sin(time / 2) * 30 + 70; // Plasma brightness 40-100%
    const holographic = (time * 6) % 60; // Holographic hue shift
    const shimmer = Math.sin(time * 3) * 5; // Fast shimmer
    // Liquid metal effect with electric undertones
    return `hsl(${metalBase + holographic + shimmer},25%,${plasma}%)`;
  }
  if (activeSkin === 'bronze-champion') {
    // Bronze Champion - Molten metal with copper-gold gradient and lava glow
    const time = Date.now() / 7;
    const bronzeBase = 25 + Math.sin(time / 3) * 8; // Bronze to copper oscillation
    const lavaGlow = 50 + Math.sin(time / 2) * 20; // Lava-like pulsing 30-70%
    const goldShift = Math.sin(time / 4) * 10; // Gold highlights
    const molten = Math.sin(time * 2) * 5; // Molten shimmer
    // Molten bronze with gold veins
    return `hsl(${bronzeBase + goldShift + molten},85%,${lavaGlow}%)`;
  }
  const skin = SKINS.find(s => s.id === activeSkin);
  return skin ? skin.color : '#9be7ff';
}

/* =======================
   GAME STATE
======================= */

let player;
let bullets = [];
let enemies = [];
let enemyBullets = [];
let particles = [];
let powerups = [];
let running = false;
let paused = false;
let lastTime = 0;
let skipNextFrame = false;
let score = 0;
let wave = 1;
let enemiesThisWave = 0;
let enemiesKilledThisWave = 0;
let totalKills = 0;
let spawnTimer = 0;
let combo = 0;
let comboTimer = 0;
let screenShakeAmt = 0;
let boss = null;
let waveClearTimer = 0;
const WAVE_BREAK_TIME = 3;
let fpsDisplay = 0;
let fpsTimer = 0;
let fpsSamples = [];

// Fix large dt spikes when the browser tab is hidden/refocused
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) skipNextFrame = true;
});

let high = Number(localStorage.getItem('highscore') || 0);

/* =======================
   SCORE POPUP
======================= */

function createScorePopup(x, y, points) {
  const popup = document.createElement('div');
  popup.className = 'score-popup';
  popup.textContent = `+${points}`;
  popup.style.left = x + 'px';
  popup.style.top = y + 'px';
  scorePopupsContainer.appendChild(popup);
  
  setTimeout(() => popup.remove(), 1000);
}

/* =======================
   PLAYER
======================= */

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
        particles.push(new Particle(
          this.x + (Math.random() - 0.5) * 20,
          this.y + (Math.random() - 0.5) * 20,
          0,
          0,
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
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    
    // Update dash ability UI
    const cooldownPercent = (this.dashCooldown / 3) * 100;
    dashCooldownEl.style.height = cooldownPercent + '%';
    
    // Show cooldown timer text
    if (this.dashCooldown > 0) {
      dashTimerEl.textContent = Math.ceil(this.dashCooldown);
      dashTimerEl.style.display = 'block';
      dashAbility.classList.remove('ready');
    } else {
      dashTimerEl.style.display = 'none';
      dashAbility.classList.add('ready');
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
      bullets.push(new Bullet(this.x, this.y, Math.cos(angle) * speed, Math.sin(angle) * speed));
    } else if (this.weaponLevel === 2) {
      const spread = 0.12;
      bullets.push(new Bullet(this.x, this.y, Math.cos(angle - spread) * speed, Math.sin(angle - spread) * speed));
      bullets.push(new Bullet(this.x, this.y, Math.cos(angle + spread) * speed, Math.sin(angle + spread) * speed));
    } else if (this.weaponLevel >= 3) {
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
      // Void: Dark with particle trail and purple edge
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#9900ff';
      
      // Dark core
      ctx.fillStyle = skinColor;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      
      // Purple outline ring
      ctx.strokeStyle = '#9900ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 3, 0, Math.PI * 2);
      ctx.stroke();
      
      // Void particles
      const time = Date.now() / 80;
      for (let i = 0; i < 4; i++) {
        const angle = (time + i * 90) % 360;
        const dist = this.r + 8 + Math.sin(time + i) * 4;
        const particleX = this.x + Math.cos(angle) * dist;
        const particleY = this.y + Math.sin(angle) * dist;
        ctx.fillStyle = 'rgba(153, 0, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(particleX, particleY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
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
      // Diamond: Rainbow sparkles and bright glow
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#ffffff';
      
      // Core
      ctx.fillStyle = skinColor;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      
      // Rainbow sparkles
      const time = Date.now() / 60;
      for (let i = 0; i < 8; i++) {
        const angle = (time * 2 + i * 45) % 360;
        const dist = this.r + 10 + Math.sin(time * 3 + i) * 6;
        const sparkleX = this.x + Math.cos(angle * Math.PI / 180) * dist;
        const sparkleY = this.y + Math.sin(angle * Math.PI / 180) * dist;
        const sparkleHue = (time * 10 + i * 45) % 360;
        const sparkleSize = 2 + Math.sin(time * 5 + i) * 1;
        ctx.fillStyle = `hsla(${sparkleHue},100%,70%,0.8)`;
        ctx.beginPath();
        ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Extra bright center sparkle
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
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
      // GOLD CHAMPION: Divine radiance with prismatic corona and white core explosion
      const time = Date.now();
      
      // Outer prismatic corona - rainbow explosion
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 16; i++) {
        const angle = (time / 40 + i * 22.5) * Math.PI / 180;
        const dist = this.r + 18 + Math.sin(time / 60 + i) * 6;
        const coronaX = this.x + Math.cos(angle) * dist;
        const coronaY = this.y + Math.sin(angle) * dist;
        const coronaHue = (time / 10 + i * 22.5) % 360;
        const coronaSize = 4 + Math.sin(time / 50 + i * 2) * 2;
        
        ctx.fillStyle = `hsla(${coronaHue},100%,65%,0.9)`;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `hsl(${coronaHue},100%,65%)`;
        ctx.beginPath();
        ctx.arc(coronaX, coronaY, coronaSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // Golden rays bursting outward
      ctx.globalAlpha = 0.4;
      for (let i = 0; i < 8; i++) {
        const rayAngle = (time / 50 + i * 45) * Math.PI / 180;
        const rayLength = this.r + 25 + Math.sin(time / 70 + i) * 8;
        ctx.strokeStyle = `hsla(45,100%,75%,${0.7 - Math.sin(time / 60 + i) * 0.3})`;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(255,215,0,0.8)';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(rayAngle) * rayLength, this.y + Math.sin(rayAngle) * rayLength);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      
      // Rotating gold ring
      ctx.strokeStyle = 'hsla(45,100%,60%,0.8)';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#ffd700';
      const goldRing = this.r + 10 + Math.sin(time / 90) * 4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, goldRing, 0, Math.PI * 2);
      ctx.stroke();
      
      // Core with white explosion center
      ctx.fillStyle = skinColor;
      ctx.shadowBlur = 35;
      ctx.shadowColor = '#ffd700';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      
      // Bright white core
      ctx.fillStyle = `rgba(255,255,255,${0.8 + Math.sin(time / 100) * 0.2})`;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
    } else if (activeSkin === 'silver-champion') {
      // SILVER CHAMPION: Liquid metal with electric plasma arcs and holographic shimmer
      const time = Date.now();
      
      // Electric plasma arcs
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 6; i++) {
        const arcAngle1 = (time / 35 + i * 60) * Math.PI / 180;
        const arcAngle2 = (time / 35 + i * 60 + 90) * Math.PI / 180;
        const arcDist = this.r + 15 + Math.sin(time / 55 + i) * 5;
        const x1 = this.x + Math.cos(arcAngle1) * arcDist;
        const y1 = this.y + Math.sin(arcAngle1) * arcDist;
        const x2 = this.x + Math.cos(arcAngle2) * arcDist;
        const y2 = this.y + Math.sin(arcAngle2) * arcDist;
        
        ctx.strokeStyle = `hsla(200,80%,75%,${0.7 + Math.sin(time / 40 + i) * 0.3})`;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00bfff';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      
      // Holographic particle ring
      const particleCount = 20;
      for (let i = 0; i < particleCount; i++) {
        const angle = (time / 25 + i * (360 / particleCount)) * Math.PI / 180;
        const dist = this.r + 14 + Math.sin(time / 45 + i * 2) * 6;
        const particleX = this.x + Math.cos(angle) * dist;
        const particleY = this.y + Math.sin(angle) * dist;
        const holoHue = 180 + (time / 15 + i * 18) % 60;
        const particleSize = 3 + Math.sin(time / 35 + i * 3) * 1.5;
        
        ctx.fillStyle = `hsla(${holoHue},70%,70%,0.85)`;
        ctx.shadowBlur = 12;
        ctx.shadowColor = `hsl(${holoHue},70%,70%)`;
        ctx.beginPath();
        ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Liquid metal shimmer rings
      for (let ring = 0; ring < 3; ring++) {
        const ringRadius = this.r + 8 + ring * 4 + Math.sin(time / 80 + ring) * 3;
        ctx.strokeStyle = `hsla(200,40%,${70 + ring * 10}%,${0.4 - ring * 0.1})`;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#c0c0c0';
        ctx.beginPath();
        ctx.arc(this.x, this.y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      // Core
      ctx.fillStyle = skinColor;
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#00bfff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      
      // Bright electric center
      ctx.fillStyle = `rgba(200,240,255,${0.7 + Math.sin(time / 90) * 0.3})`;
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#00ffff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
    } else if (activeSkin === 'bronze-champion') {
      // BRONZE CHAMPION: Molten metal with lava veins and copper-gold eruption
      const time = Date.now();
      
      // Lava eruption particles
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < 10; i++) {
        const eruptAngle = (time / 40 + i * 36) * Math.PI / 180;
        const eruptDist = this.r + 16 + Math.sin(time / 55 + i * 1.5) * 7;
        const eruptX = this.x + Math.cos(eruptAngle) * eruptDist;
        const eruptY = this.y + Math.sin(eruptAngle) * eruptDist;
        const lavaHue = 15 + Math.sin(time / 60 + i) * 15;
        const eruptSize = 3.5 + Math.sin(time / 45 + i * 2) * 1.5;
        
        ctx.fillStyle = `hsla(${lavaHue},90%,55%,${0.85 - Math.sin(time / 50 + i) * 0.2})`;
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#ff4500';
        ctx.beginPath();
        ctx.arc(eruptX, eruptY, eruptSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // Molten veins
      for (let i = 0; i < 8; i++) {
        const veinAngle = (time / 60 + i * 45) * Math.PI / 180;
        const veinDist = this.r + 12 + Math.sin(time / 70 + i) * 4;
        const veinX = this.x + Math.cos(veinAngle) * veinDist;
        const veinY = this.y + Math.sin(veinAngle) * veinDist;
        
        ctx.strokeStyle = `hsla(35,100%,60%,${0.6 + Math.sin(time / 50 + i) * 0.3})`;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffa500';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(veinX, veinY);
        ctx.stroke();
      }
      
      // Bronze heat waves
      for (let wave = 0; wave < 3; wave++) {
        const waveRadius = this.r + 7 + wave * 5 + Math.sin(time / 75 + wave * 1.5) * 4;
        ctx.strokeStyle = `hsla(25,85%,${55 + wave * 5}%,${0.5 - wave * 0.12})`;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#cd7f32';
        ctx.beginPath();
        ctx.arc(this.x, this.y, waveRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      // Core
      ctx.fillStyle = skinColor;
      ctx.shadowBlur = 28;
      ctx.shadowColor = '#ff6347';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      
      // Glowing copper-gold center
      ctx.fillStyle = `hsla(35,100%,65%,${0.75 + Math.sin(time / 85) * 0.25})`;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ffa500';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
    } else {
      // Normal skins
      ctx.fillStyle = skinColor;
      ctx.shadowBlur = 10;
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
if (gameSettings.screenShake) screenShakeAmt = 0.5;
    sounds.damage();
    
    for (let i = 0; i < 25; i++) {
      particles.push(new Particle(
        this.x,
        this.y,
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
      this.speed = 190;
      this.color = '#ff9ff3';
      this.hp = 1;
      this.maxHp = 1;
      this.score = 15;
      this.coinValue = 3;
    } else if (this.type === 'tank') {
      this.r = 20;
      this.speed = 65;
      this.color = '#ff6b6b';
      this.hp = 3;
      this.maxHp = 3;
      this.score = 30;
      this.coinValue = 6;
    } else if (this.type === 'shooter') {
      this.r = 12;
      this.speed = 85;
      this.color = '#ffd93d';
      this.hp = 2;
      this.maxHp = 2;
      this.score = 25;
      this.shootCooldown = 0;
      this.coinValue = 5;
    } else if (this.type === 'miniboss') {
      this.r = 25;
      this.speed = 50;
      this.color = '#b86bff';
      this.hp = 8;
      this.maxHp = 8;
      this.score = 100;
      this.shootCooldown = 0;
      this.coinValue = 20;
    } else {
      this.r = 14;
      this.speed = 105;
      this.color = '#ff7b6b';
      this.hp = 1;
      this.maxHp = 1;
      this.score = 10;
      this.coinValue = 2;
    }
  }

  update(dt) {
    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    this.x += Math.cos(angle) * this.speed * dt;
    this.y += Math.sin(angle) * this.speed * dt;
    
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
      ctx.shadowBlur = 15;
      ctx.shadowColor = this.color;
    }
    
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // HP bar for tanks and minibosses
    if (this.type === 'tank' || this.type === 'miniboss') {
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
  
  // Mini-boss chance (3%)
  if (wave >= 3 && rand < 0.03) type = 'miniboss';
  else if (wave >= 3 && rand < 0.23) type = 'shooter';
  else if (wave >= 2 && rand < 0.43) type = 'tank';
  else if (rand < 0.63) type = 'fast';
  
  enemies.push(new Enemy(x, y, type));
  enemiesThisWave++;
}

/* =======================
   BOSS ENEMY
======================= */

class Boss {
  constructor(x, y, wave) {
    this.x = x;
    this.y = y;
    this.r = 45;
    this.speed = 45;
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
    this.speed = 35;
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
    this.speed = 30;
    this.hp = 350 + wave * 60;
    this.maxHp = this.hp;
    this.color = '#ffd700';       // Gold base
    this.coreColor = '#ffffff';
    this.isBoss = true;
    this.isMegaBoss = false;
    this.isUltraBoss = true;
    this.wave = wave;

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

    // ── Dual counter-rotating spirals (constant) ──
    this.spiralCooldown -= dt;
    const spiralRate = Math.max(0.35, 0.8 - this.phase * 0.1);
    if (this.spiralCooldown <= 0) {
      this.spiralCooldown = spiralRate;
      this.shootDualSpiral();
    }

    // ── Phase special attacks ──
    this.specialCooldown -= dt;
    const specialRate = Math.max(1.5, 4 - this.phase * 0.6);
    if (this.specialCooldown <= 0) {
      this.specialCooldown = specialRate;
      if      (this.phase === 1) this.shootStarBurst();
      else if (this.phase === 2) this.shootRingWave();
      else if (this.phase === 3) this.shootCrossLaser();
      else                       this.shootDeathBlossom();
    }

    // ── Minion summoning (phase 2+) ──
    if (this.phase >= 2) {
      this.summonCooldown -= dt;
      const summonRate = Math.max(4, 8 - this.phase * 1.5);
      if (this.summonCooldown <= 0) {
        this.summonCooldown = summonRate;
        this.summonMinions();
      }
    }
  }

  // ── Attack patterns ──────────────────────────

  shootDualSpiral() {
    this.spiralAngle += 0.35;
    const count = 10 + this.phase * 2;
    const speed = 265 + this.phase * 15;
    for (let i = 0; i < count; i++) {
      const a1 = this.spiralAngle + (Math.PI * 2 / count) * i;
      const a2 = -this.spiralAngle + (Math.PI * 2 / count) * i; // counter-rotate
      for (const a of [a1, a2]) {
        enemyBullets.push({ x: this.x, y: this.y,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 7 });
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
        const count = 20;
        const speed = 230 + ring * 40;
        const offset = (Math.PI / count) * ring; // stagger the rings
        for (let i = 0; i < count; i++) {
          const a = (Math.PI * 2 / count) * i + offset;
          enemyBullets.push({ x: this.x, y: this.y,
            vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 7 });
        }
        playSound(180, 0.2, 'square');
      }, ring * 250);
    }
    if (gameSettings.screenShake) screenShakeAmt = 0.6;
  }

  shootCrossLaser() {
    // 8 directions, 5 bullets each, with staggered timing
    const dirs = Array.from({ length: 8 }, (_, i) => (Math.PI * 2 / 8) * i);
    dirs.forEach((a, idx) => {
      setTimeout(() => {
        for (let j = 0; j < 5; j++) {
          const speed = 280 + j * 20;
          enemyBullets.push({ x: this.x, y: this.y,
            vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 8 });
        }
      }, idx * 60);
    });
    if (gameSettings.screenShake) screenShakeAmt = 0.7;
    playSound(220, 0.3, 'square');
  }

  shootDeathBlossom() {
    // Phase 4 enrage: 6 rapid-fire spirals in a burst
    for (let burst = 0; burst < 6; burst++) {
      setTimeout(() => {
        const count = 24;
        const speed = 290 + Math.random() * 50;
        const offset = (Math.PI * 2 / 6) * burst + Math.random() * 0.3;
        for (let i = 0; i < count; i++) {
          const a = offset + (Math.PI * 2 / count) * i;
          enemyBullets.push({ x: this.x, y: this.y,
            vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 6 });
        }
        playSound(250, 0.1, 'square');
      }, burst * 130);
    }
    if (gameSettings.screenShake) screenShakeAmt = 1.0;
  }

  summonMinions() {
    const count = 1 + this.phase;
    for (let i = 0; i < count; i++) {
      // Spawn minions in a ring around the boss
      const a = (Math.PI * 2 / count) * i;
      const dist = this.r + 60;
      const mx = Math.max(20, Math.min(canvas.width  - 20, this.x + Math.cos(a) * dist));
      const my = Math.max(20, Math.min(canvas.height - 20, this.y + Math.sin(a) * dist));
      // Alternate between shooter and fast enemies
      enemies.push(new Enemy(mx, my, i % 2 === 0 ? 'shooter' : 'fast'));
    }
    playSound(300, 0.3, 'sawtooth');
    if (gameSettings.screenShake) screenShakeAmt = 0.4;
  }

  // ── Drawing ──────────────────────────────────

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

    // ── HP bar ──
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
    this.speed = 28;
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

function createExplosion(x, y, color, count) {
  if (!gameSettings.particles) return;
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(
      x,
      y,
      Math.random() * Math.PI * 2,
      Math.random() * 220 + 120,
      color,
      0.7
    ));
  }
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
      nuke: { color: '#ff6b35', symbol: '💣' }
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
  
  // Weapon upgrade (12% chance, max 3 levels)
  if (Math.random() < 0.12 && player.weaponLevel < 3) {
    types.push('weapon');
  }
  
  // Max HP upgrade (12% chance, max 3 levels)
  if (Math.random() < 0.12 && player.maxHpLevel < 3) {
    types.push('maxhp');
  }
  
  // Speed upgrade (12% chance, max 3 levels)
  if (Math.random() < 0.12 && player.speedLevel < 3) {
    types.push('speedup');
  }
  
  // Rare nuke drop (8% chance, only after wave 2)
  if (Math.random() < 0.08 && wave >= 2) {
    types.push('nuke');
  }
  
  const type = types[Math.floor(Math.random() * types.length)];
  powerups.push(new PowerUp(x, y, type));
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

  const container = document.getElementById('buffsDisplay');
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

function togglePause() {
  paused = !paused;
  const pauseOverlay = document.getElementById('pauseOverlay');
  if (paused) {
    pauseOverlay.classList.remove('hidden');
    pauseOverlay.classList.add('visible');
    comboEl.classList.add('hidden'); // Hide combo when pausing
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

function initShopUI() {
  document.getElementById('shopCoinsVal').textContent = playerCoins;
  const grid = document.getElementById('skinGrid');
  grid.innerHTML = '';

  for (const skin of SKINS) {
    const owned = ownedSkins.includes(skin.id);
    const active = activeSkin === skin.id;
    const isChampion = skin.price === -1; // Champion skins have price -1

    const card = document.createElement('div');
    card.className = 'skin-card' + (active ? ' active' : '') + (owned ? ' owned' : '');

    // Preview circle
    const preview = document.createElement('div');
    preview.className = 'skin-preview';
    if (skin.id === 'rainbow') {
      preview.style.background = 'conic-gradient(red,orange,yellow,green,cyan,blue,violet,red)';
    } else if (skin.id === 'galaxy') {
      preview.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)';
      preview.style.animation = 'galaxyShimmer 2s ease-in-out infinite';
    } else if (skin.id === 'void') {
      preview.style.background = 'radial-gradient(circle, #1a0033 0%, #000000 100%)';
      preview.style.boxShadow = '0 0 20px #9900ff, inset 0 0 20px #9900ff';
    } else if (skin.id === 'sunset') {
      preview.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ffd93d 50%, #ff69b4 100%)';
    } else if (skin.id === 'phoenix') {
      preview.style.background = 'radial-gradient(circle, #ff4500 0%, #ff6347 50%, #ffa500 100%)';
      preview.style.boxShadow = '0 0 20px #ff4500';
    } else if (skin.id === 'diamond') {
      preview.style.background = 'linear-gradient(45deg, #ffffff 0%, #e0f7ff 25%, #ffe0ff 50%, #ffffcc 75%, #ffffff 100%)';
      preview.style.boxShadow = '0 0 25px rgba(255,255,255,0.8), inset 0 0 20px rgba(255,255,255,0.5)';
    } else if (skin.id === 'gold-champion') {
      preview.style.background = 'radial-gradient(circle, #ffd700 0%, #ffed4e 40%, #ffffff 60%, #ffd700 100%)';
      preview.style.boxShadow = '0 0 30px #ffd700, inset 0 0 25px rgba(255,255,255,0.8)';
      preview.style.animation = 'championPulse 2s ease-in-out infinite';
    } else if (skin.id === 'silver-champion') {
      preview.style.background = 'radial-gradient(circle, #c0c0c0 0%, #e8e8e8 40%, #ffffff 60%, #c0c0c0 100%)';
      preview.style.boxShadow = '0 0 30px #c0c0c0, inset 0 0 25px rgba(255,255,255,0.8)';
      preview.style.animation = 'championPulse 2.2s ease-in-out infinite';
    } else if (skin.id === 'bronze-champion') {
      preview.style.background = 'radial-gradient(circle, #cd7f32 0%, #e8a87c 40%, #f5d0a9 60%, #cd7f32 100%)';
      preview.style.boxShadow = '0 0 30px #cd7f32, inset 0 0 25px rgba(255,200,150,0.8)';
      preview.style.animation = 'championPulse 2.4s ease-in-out infinite';
    } else {
      preview.style.background = skin.color;
      preview.style.boxShadow = `0 0 14px ${skin.color}`;
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
      btn.textContent = '✓ Equipped';
      btn.disabled = true;
    } else if (owned) {
      btn.textContent = 'Equip';
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

  if (screenShakeAmt > 0) {
    ctx.save();
    ctx.translate(
      (Math.random() - 0.5) * screenShakeAmt * 25,
      (Math.random() - 0.5) * screenShakeAmt * 25
    );
    screenShakeAmt -= dt * 2.5;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (running && !paused) {
    // FPS calculation
    fpsSamples.push(dt > 0 ? 1 / dt : 60);
    if (fpsSamples.length > 30) fpsSamples.shift();
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      fpsDisplay = Math.round(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length);
      fpsTimer = 0;
    }
    player.update(dt);

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
    enemies.forEach(e => e.update(dt));

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update(dt);
      if (particles[i].life <= 0) {
        particles.splice(i, 1);
      }
    }

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
        } else if (pu.type === 'nuke') {
          // Nuke: instantly kill all on-screen enemies and the boss loses 30 HP
          for (let n = enemies.length - 1; n >= 0; n--) {
            const ne = enemies[n];
            const pts = Math.floor(ne.score * (1 + combo * 0.1));
            score += pts;
            playerCoins += ne.coinValue;
            createScorePopup(ne.x, ne.y, pts);
            createExplosion(ne.x, ne.y, ne.color, 20);
            enemiesKilledThisWave++;
            totalKills++;
          }
          enemies.length = 0;
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
              const coins = isLegendaryBoss ? (550 + boss.wave * 55) : isUltraBoss ? (300 + boss.wave * 30) : isMegaBoss ? (150 + boss.wave * 20) : (60 + boss.wave * 10);
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
              boss = null;
            }
          }
if (gameSettings.screenShake) screenShakeAmt = 1.2;
          playSound(120, 0.6, 'sawtooth');
          setTimeout(() => playSound(80, 0.6, 'sawtooth'), 150);
        }
        
        sounds.powerUp();
        createExplosion(pu.x, pu.y, pu.color, 25);
        powerups.splice(i, 1);
        continue;
      }
      
      if (powerups[i].life <= 0) {
        powerups.splice(i, 1);
      }
    }

    // Bullet-enemy collision
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      let hit = false;
      
      // Boss collision
      if (boss) {
        const dist = Math.hypot(b.x - boss.x, b.y - boss.y);
        if (dist < b.r + boss.r) {
          boss.hp--;
          
          if (boss.hp <= 0) {
            // Different rewards for each boss type
            const isLegendaryBoss = boss.isLegendaryBoss;
            const isUltraBoss = boss.isUltraBoss;
            const isMegaBoss  = boss.isMegaBoss;
            const points = isLegendaryBoss ? (5500 + boss.wave * 700) : isUltraBoss ? (3000 + boss.wave * 400) : isMegaBoss ? (1500 + boss.wave * 250) : (600 + boss.wave * 120);
            const coins = isLegendaryBoss ? (550 + boss.wave * 55) : isUltraBoss ? (300 + boss.wave * 30) : isMegaBoss ? (150 + boss.wave * 20) : (60 + boss.wave * 10);
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
            
            boss = null;
            playSound(800, 0.6, 'sine');
            setTimeout(() => playSound(1000, 0.6, 'sine'), 120);
            setTimeout(() => playSound(1200, 0.6, 'sine'), 240);
          } else {
            createExplosion(b.x, b.y, '#ffffff', 12);
          }
          
          hit = true;
          bullets.splice(i, 1);
        }
      }
      
      if (hit) continue;
      
      // Enemy collision
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const dist = Math.hypot(b.x - e.x, b.y - e.y);
        
        if (dist < b.r + e.r) {
          e.hp--;
          
          if (e.hp <= 0) {
            const points = Math.floor(e.score * (1 + combo * 0.1));
            score += points;
            playerCoins += e.coinValue;
            saveCoins();
            createScorePopup(e.x, e.y, points);
            addCombo();
            enemiesKilledThisWave++;
            totalKills++;
            
            sounds.hit();
            createExplosion(e.x, e.y, e.color, 25);
            
            // Power-up drop (20% chance, 40% for miniboss)
            const dropChance = e.type === 'miniboss' ? 0.4 : 0.2;
            if (Math.random() < dropChance) {
              spawnPowerUp(e.x, e.y);
            }
            
            enemies.splice(j, 1);
          } else {
            createExplosion(b.x, b.y, '#ffffff', 12);
          }
          
          hit = true;
          bullets.splice(i, 1);
          break;
        }
      }
    }

    // Enemy-player collision
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < e.r + player.r) {
        player.takeDamage(e.type === 'miniboss' ? 15 : 10);
        resetCombo();
        createExplosion(e.x, e.y, e.color, 18);
        enemiesKilledThisWave++; // BUG FIX: count contact kills toward wave completion
        playerCoins += e.coinValue;
        saveCoins();
        totalKills++;
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
    const enemiesNeeded = wave * 5 + 12;

    if (waveClearTimer > 0) {
      // Between-wave break — tick down, show countdown on canvas
      waveClearTimer -= dt;
      if (waveClearTimer <= 0) {
        waveClearTimer = 0;
        spawnTimer = 0; // fresh timer for new wave
        showWaveAnnouncement(wave);
      }
    } else if (enemiesKilledThisWave >= enemiesNeeded && enemies.length === 0 && !boss) {
      // Wave complete!
      const waveBonus = (wave + 1) * 60;
      score += waveBonus;
      const coinBonus = wave * 5;
      playerCoins += coinBonus;
      saveCoins();
      player.hp = Math.min(player.maxHp, player.hp + 30);
      wave++;
      enemiesThisWave = 0;
      enemiesKilledThisWave = 0;
      spawnTimer = 0;
      waveEl.textContent = wave;

      // 0.1% chance for LEGENDARY BOSS on any wave (after wave 3)
      const legendaryRoll = Math.random();
      if (wave > 3 && legendaryRoll < 0.001) {
        // LEGENDARY DESTROYER — ultra rare spawn!
        boss = new LegendaryBoss(canvas.width / 2, 140, wave - 1);
        sounds.bossSpawn();
        setTimeout(() => sounds.bossSpawn(), 200);
        setTimeout(() => sounds.bossSpawn(), 400);
        setTimeout(() => sounds.bossSpawn(), 600);
        setTimeout(() => sounds.bossSpawn(), 800);
        if (gameSettings.screenShake) screenShakeAmt = 3.0;
        showWaveAnnouncement(wave - 1, true, true);
      } else if ((wave - 1) % 20 === 0) {
        // OMEGA OVERLORD — wave 20 special boss
        boss = new UltraBoss(canvas.width / 2, 120, wave - 1);
        sounds.bossSpawn();
        setTimeout(() => sounds.bossSpawn(), 300);
        setTimeout(() => sounds.bossSpawn(), 600);
        if (gameSettings.screenShake) screenShakeAmt = 2.0;
        showWaveAnnouncement(wave - 1, true, true);
      } else if ((wave - 1) % 10 === 0) {
        // MEGA BOSS wave (every 10 waves: 10, 30, etc.)
        boss = new MegaBoss(canvas.width / 2, 100, wave - 1);
        sounds.bossSpawn();
        if (gameSettings.screenShake) screenShakeAmt = 1.2;
        showWaveAnnouncement(wave - 1, true, true); // true for isBoss, true for isMegaBoss
      } else if ((wave - 1) % 5 === 0) {
        // Regular Boss wave (every 5 waves: 5, 15, 25, etc. - but not 10, 20, 30)
        boss = new Boss(canvas.width / 2, 80, wave - 1);
        sounds.bossSpawn();
        if (gameSettings.screenShake) screenShakeAmt = 0.7;
        showWaveAnnouncement(wave - 1, true); // true for isBoss
      } else {
        // Normal wave — give the player a 3-second break
        waveClearTimer = WAVE_BREAK_TIME;
        playSound(850, 0.4, 'sine');
        setTimeout(() => playSound(1050, 0.4, 'sine'), 120);
      }
    }

    // Spawn enemies (not during boss fight or between-wave break)
    if (!boss && waveClearTimer <= 0) {
      spawnTimer += dt;
      const spawnRate = Math.max(0.4, 1.6 - wave * 0.07);
      if (spawnTimer > spawnRate && enemiesThisWave < enemiesNeeded) {
        spawnEnemy();
        spawnTimer = 0;
      }
    }

    // Game over
    if (player.hp <= 0) {
      running = false;
      document.getElementById('buffsDisplay').innerHTML = '';
      activeBuffElements = {}; // Clear buff tracking
      comboEl.classList.add('hidden'); // Hide combo on game over
      // Show home screen with game over message
      const homeScreen = document.getElementById('homeScreen');
      const gameOverMsg = document.getElementById('gameOverMsg');
      const finalScoreEl = document.getElementById('finalScore');
      homeScreen.classList.remove('hidden');
      gameOverMsg.classList.remove('hidden');
      if (finalScoreEl) finalScoreEl.textContent = score;
      document.getElementById('homeHighVal').textContent = high;
      document.getElementById('homeCoinsVal').textContent = playerCoins;
      if (score > high) {
        high = score;
        // Save to localStorage for guest, Firebase for logged-in users
        if (isGuest || !currentUser) {
          localStorage.setItem('highscore', score);
        }
        document.getElementById('homeHighVal').textContent = high;
      }
      
      // Submit to Firebase if logged in
      if (currentUser && !isGuest && typeof submitScoreToLeaderboard === 'function') {
        submitScoreToLeaderboard(score);
        saveUserDataToFirebase();
      }
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

      // Improved background with rounded corners
      const boxWidth = 340;
      const boxHeight = 90;
      const boxX = canvas.width / 2 - boxWidth / 2;
      const boxY = canvas.height / 2 - boxHeight / 2;
      const radius = 16;
      
      // Draw rounded rectangle background
      ctx.fillStyle = 'rgba(8,12,24,0.92)';
      ctx.beginPath();
      ctx.moveTo(boxX + radius, boxY);
      ctx.lineTo(boxX + boxWidth - radius, boxY);
      ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius);
      ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
      ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight);
      ctx.lineTo(boxX + radius, boxY + boxHeight);
      ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
      ctx.lineTo(boxX, boxY + radius);
      ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
      ctx.closePath();
      ctx.fill();
      
      // Subtle border
      ctx.strokeStyle = 'rgba(107,255,123,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // "WAVE CLEAR!" text with glow
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#6bff7b';
      ctx.fillStyle = '#6bff7b';
      ctx.font = 'bold 22px system-ui';
      ctx.fillText('WAVE CLEAR!', canvas.width / 2, canvas.height / 2 - 16);
      
      // "Next wave in" text
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '16px system-ui';
      ctx.fillText('Next wave in', canvas.width / 2, canvas.height / 2 + 10);

      // Countdown number with glow
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#ffd93d';
      ctx.font = 'bold 40px system-ui';
      ctx.fillStyle = '#ffd93d';
      ctx.fillText(Math.ceil(waveClearTimer), canvas.width / 2, canvas.height / 2 + 38);
      ctx.restore();
    }

    // Draw enemies remaining counter (bottom-left of screen during active wave)
    if (!boss && waveClearTimer <= 0 && running) {
      const enemiesNeededHUD = wave * 5 + 12;
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

  // Draw everything
  if (player) player.draw();

  bullets.forEach(b => {
    ctx.fillStyle = '#ffe66b';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ffe66b';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  enemyBullets.forEach(eb => {
    ctx.fillStyle = '#ff4757';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff4757';
    ctx.beginPath();
    ctx.arc(eb.x, eb.y, eb.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  enemies.forEach(e => e.draw());
  if (boss) boss.draw();
  particles.forEach(p => p.draw());
  powerups.forEach(pu => pu.draw());

  if (screenShakeAmt > 0) {
    ctx.restore();
  }

  requestAnimationFrame(loop);
}

/* =======================
   UI WIRING
======================= */

console.log('🎮 Setting up UI...');

// Initial HUD values
document.getElementById('homeHighVal').textContent = high;
document.getElementById('homeCoinsVal').textContent = playerCoins;

function startGame() {
  initAudio();
  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('gameOverMsg').classList.add('hidden');
  player = new Player(canvas.width / 2, canvas.height / 2);
  bullets = [];
  enemies = [];
  enemyBullets = [];
  particles = [];
  powerups = [];
  boss = null;
  score = 0;
  wave = 1;
  enemiesThisWave = 0;
  enemiesKilledThisWave = 0;
  totalKills = 0;
  spawnTimer = 0;
  combo = 0;
  comboTimer = 0;
  running = true;
  paused = false;
  waveClearTimer = 0;
  skipNextFrame = false;
  waveEl.textContent = wave;
  comboEl.classList.add('hidden');
  document.getElementById('buffsDisplay').innerHTML = '';
  activeBuffElements = {}; // Clear buff tracking
  showWaveAnnouncement(1);
}

document.getElementById('startBtn').addEventListener('click', startGame);

document.getElementById('settingsBtn').addEventListener('click', () => {
  document.getElementById('homeScreen').classList.add('hidden');
  initSettingsUI(false);
});

document.getElementById('shopBtn').addEventListener('click', () => {
  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('shopPanel').classList.remove('hidden');
  initShopUI();
});

document.getElementById('shopBackBtn').addEventListener('click', () => {
  document.getElementById('shopPanel').classList.add('hidden');
  document.getElementById('homeScreen').classList.remove('hidden');
  document.getElementById('homeCoinsVal').textContent = playerCoins;
});

document.getElementById('resumeBtn').addEventListener('click', () => {
  togglePause();
});

document.getElementById('pauseSettingsBtn').addEventListener('click', () => {
  document.getElementById('pauseOverlay').classList.add('hidden');
  initSettingsUI(true);
});

document.getElementById('menuBtn').addEventListener('click', () => {
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

function devOverlayToggle() {
  if (!isAdmin) return;
  const el = document.getElementById('devOverlay');
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) {
    // Sync current values into overlay inputs
    document.getElementById('ovWaveInput').value = wave;
    document.getElementById('ovHpInput').value = Math.round(player.hp);
    document.getElementById('ovScoreInput').value = score;
    document.getElementById('ovCoinsInput').value = 100;
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
  saveCoins(); // Save to Firebase
  console.log(`[DEV] Coins set to ${val}`);
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

  const cx = canvas.width / 2;
  const cy = 120;
  if (type === 4)      boss = new LegendaryBoss(cx, cy, wave);
  else if (type === 3) boss = new UltraBoss(cx, cy, wave);
  else if (type === 2) boss = new MegaBoss(cx, cy, wave);
  else                 boss = new Boss(cx, cy, wave);

  sounds.bossSpawn();
  console.log(`[DEV] Spawned boss type ${type}`);
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