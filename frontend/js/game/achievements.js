'use strict';

/* ======================================================
   ACHIEVEMENTS — topdown-action
   Progress stored in localStorage as topdown_achievements
   Completing all 12 unlocks the TRANSCENDENCE skin
====================================================== */

const ACHIEVEMENTS = [
  {
    id: 'wave_5',
    name: 'First Command',
    desc: 'Survive to wave 5 in a single run',
    icon: '⚔️',
    reward: 150,
    hint: 'Focus on staying alive over score'
  },
  {
    id: 'wave_25',
    name: 'Battle Hardened',
    desc: 'Survive to wave 25 in a single run',
    icon: '🌊',
    reward: 400,
    hint: 'Max out your permanent upgrades as fast as possible'
  },
  {
    id: 'wave_50',
    name: 'Legendary Run',
    desc: 'Survive to wave 50 in a single run',
    icon: '👑',
    reward: 1500,
    hint: 'Stay mobile, never stop moving'
  },
  {
    id: 'untouchable',
    name: 'Untouchable',
    desc: 'Reach wave 10 without taking any damage',
    icon: '🛡️',
    reward: 600,
    hint: 'Shield pickups do not count — perfect play only'
  },
  {
    id: 'terminator',
    name: 'Terminator',
    desc: 'Kill 150 enemies in a single run',
    icon: '💀',
    reward: 350,
    hint: 'Upgrade to triple shot early and keep fighting'
  },
  {
    id: 'combo_god',
    name: 'Combo God',
    desc: 'Achieve a 75-kill combo without taking damage',
    icon: '⚡',
    reward: 600,
    hint: 'Get explosive bullets and keep moving'
  },
  {
    id: 'legendary_slayer',
    name: 'Legendary Slayer',
    desc: 'Defeat a Legendary Boss',
    icon: '🔥',
    reward: 1000,
    hint: 'Legendary Bosses have a very rare chance to spawn after wave 3'
  },
  {
    id: 'fully_armed',
    name: 'Fully Armed',
    desc: 'Max all permanent upgrades in one run (Weapon 3, Speed 3, HP 3)',
    icon: '⭐',
    reward: 450,
    hint: 'Collect every upgrade drop, do not let any expire off screen'
  },
  {
    id: 'high_roller',
    name: 'High Roller',
    desc: 'Have 10,000 coins at once',
    icon: '💰',
    reward: 0,
    hint: 'Save up instead of spending everything immediately'
  },
  {
    id: 'skin_collector',
    name: 'Skin Collector',
    desc: 'Own 25 different skins',
    icon: '🎨',
    reward: 500,
    hint: 'Earn coins from gameplay or open crates'
  },
  {
    id: 'boss_hunter',
    name: 'Boss Hunter',
    desc: 'Defeat 3 bosses in a single run',
    icon: '🏆',
    reward: 450,
    hint: 'Bosses spawn periodically — survive long enough and they keep coming'
  },
  {
    id: 'last_stand',
    name: 'Last Stand',
    desc: 'Reach wave 20 with 15 HP or less remaining',
    icon: '❤️',
    reward: 650,
    hint: 'Play dangerously and skip health pickups near wave 20'
  },
];

const TRANSCENDENCE_SKIN_ID = 'transcendence';

// ── Persisted progress ──
let achProgress = {};

function loadAchievements() {
  try {
    achProgress = JSON.parse(localStorage.getItem('topdown_achievements') || '{}');
  } catch(e) {
    achProgress = {};
  }
}

function saveAchievements() {
  localStorage.setItem('topdown_achievements', JSON.stringify(achProgress));
}

function isAchievementDone(id) {
  return !!achProgress[id];
}

function getCompletedCount() {
  return ACHIEVEMENTS.filter(a => achProgress[a.id]).length;
}

function allAchievementsComplete() {
  return ACHIEVEMENTS.every(a => achProgress[a.id]);
}

// ── Per-run tracking ──
let achRunNoDamage = true;
let achRunBossesKilled = 0;

function achOnGameStart() {
  achRunNoDamage = true;
  achRunBossesKilled = 0;
}

function achOnDamageTaken() {
  achRunNoDamage = false;
}

function achOnWaveReached(w) {
  if (w >= 5)  grantAchievement('wave_5');
  if (w >= 25) grantAchievement('wave_25');
  if (w >= 50) grantAchievement('wave_50');
  if (w >= 10 && achRunNoDamage) grantAchievement('untouchable');
  if (w >= 20 && typeof player !== 'undefined' && player && player.hp <= 15) grantAchievement('last_stand');
}

function achOnKill(totalKillsThisRun, currentCombo) {
  if (totalKillsThisRun >= 150) grantAchievement('terminator');
  if (currentCombo >= 75) grantAchievement('combo_god');
}

function achOnLegendaryBossKill() {
  grantAchievement('legendary_slayer');
}

function achOnPowerupCollect() {
  if (typeof player === 'undefined' || !player) return;
  if (player.weaponLevel >= 3 && player.speedLevel >= 3 && player.maxHpLevel >= 3) {
    grantAchievement('fully_armed');
  }
}

function achOnCoinsChanged() {
  if (typeof playerCoins !== 'undefined' && playerCoins >= 10000) {
    grantAchievement('high_roller');
  }
}

function achOnSkinsChanged() {
  if (typeof ownedSkins !== 'undefined' && ownedSkins.length >= 25) {
    grantAchievement('skin_collector');
  }
}

function achOnBossKill() {
  achRunBossesKilled++;
  if (achRunBossesKilled >= 3) grantAchievement('boss_hunter');
}

// ── Grant an achievement ──
function grantAchievement(id) {
  if (achProgress[id]) return;
  achProgress[id] = Date.now();
  saveAchievements();

  const ach = ACHIEVEMENTS.find(a => a.id === id);
  if (!ach) return;

  // Coin reward
  if (ach.reward > 0 && typeof playerCoins !== 'undefined') {
    playerCoins += ach.reward;
    if (typeof saveCoins === 'function') saveCoins();
    const coinsHUD = document.getElementById('coinsHUD');
    if (coinsHUD) coinsHUD.textContent = `🪙 ${playerCoins}`;
    const homeCoins = document.getElementById('homeCoinsVal');
    if (homeCoins) homeCoins.textContent = playerCoins;
  }

  showAchievementNotification(ach);
  renderAchievementsPanel();

  // All done → grant TRANSCENDENCE after 2s delay (lets the notif land first)
  if (allAchievementsComplete()) {
    setTimeout(grantTranscendenceSkin, 2200);
  }
}

// ── Grant TRANSCENDENCE skin ──
function grantTranscendenceSkin() {
  if (typeof ownedSkins === 'undefined' || ownedSkins.includes(TRANSCENDENCE_SKIN_ID)) return;
  ownedSkins.push(TRANSCENDENCE_SKIN_ID);
  if (typeof saveSkins === 'function') saveSkins();
  showTranscendenceUnlock();
  renderAchievementsPanel();
}

// ── Floating notification: single achievement ──
function showAchievementNotification(ach) {
  const notif = document.createElement('div');
  notif.className = 'ach-notif';
  notif.innerHTML = `
    <div class="ach-notif-label">ACHIEVEMENT UNLOCKED</div>
    <div class="ach-notif-body">
      <span class="ach-notif-icon">${ach.icon}</span>
      <div class="ach-notif-info">
        <div class="ach-notif-name">${ach.name}</div>
        <div class="ach-notif-sub">${ach.desc}</div>
      </div>
      ${ach.reward > 0 ? `<div class="ach-notif-reward">+${ach.reward} 🪙</div>` : ''}
    </div>
  `;
  document.body.appendChild(notif);
  requestAnimationFrame(() => notif.classList.add('ach-notif-visible'));
  setTimeout(() => {
    notif.classList.remove('ach-notif-visible');
    setTimeout(() => notif.remove(), 500);
  }, 4500);
}

// ── Floating notification: TRANSCENDENCE unlock ──
function showTranscendenceUnlock() {
  const notif = document.createElement('div');
  notif.className = 'ach-notif ach-notif-transcendence';
  notif.innerHTML = `
    <div class="ach-notif-label">✨ SKIN UNLOCKED</div>
    <div class="ach-notif-body">
      <span class="ach-notif-icon">✨</span>
      <div class="ach-notif-info">
        <div class="ach-notif-name">TRANSCENDENCE</div>
        <div class="ach-notif-sub">All achievements complete — equip it in the shop</div>
      </div>
    </div>
  `;
  document.body.appendChild(notif);
  requestAnimationFrame(() => notif.classList.add('ach-notif-visible'));
  setTimeout(() => {
    notif.classList.remove('ach-notif-visible');
    setTimeout(() => notif.remove(), 600);
  }, 8000);
}

// ── Render the achievements panel ──
function renderAchievementsPanel() {
  const grid = document.getElementById('achievementsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const allDone = allAchievementsComplete();
  const doneCount = getCompletedCount();

  ACHIEVEMENTS.forEach(ach => {
    const done = isAchievementDone(ach.id);
    const card = document.createElement('div');
    card.className = `ach-card${done ? ' ach-done' : ''}`;
    card.innerHTML = `
      <div class="ach-card-icon">${done ? ach.icon : '🔒'}</div>
      <div class="ach-card-body">
        <div class="ach-card-name">${ach.name}</div>
        <div class="ach-card-desc">${ach.desc}</div>
        ${!done ? `<div class="ach-card-hint">Hint: ${ach.hint}</div>` : ''}
      </div>
      <div class="ach-card-right">
        ${done
          ? '<div class="ach-check">✓</div>'
          : (ach.reward > 0 ? `<div class="ach-reward-tag">+${ach.reward}</div>` : '')}
      </div>
    `;
    grid.appendChild(card);
  });

  const counter = document.getElementById('achProgressCount');
  if (counter) counter.textContent = `${doneCount} / ${ACHIEVEMENTS.length}`;

  const rewardEl = document.getElementById('achGrandReward');
  if (rewardEl) {
    rewardEl.className = `ach-grand-reward${allDone ? ' ach-grand-unlocked' : ''}`;
  }

  const rewardStatus = document.getElementById('achGrandStatus');
  if (rewardStatus) {
    rewardStatus.textContent = allDone
      ? (ownedSkins && ownedSkins.includes(TRANSCENDENCE_SKIN_ID) ? 'Unlocked — equip in shop' : 'Unlocking...')
      : 'Complete all achievements to unlock';
  }
}

loadAchievements();
console.log('✅ achievements.js loaded');
