// battlepass-system.js

const BP_XP_CONFIG = {
  perKill:         6,    // 6 XP per enemy kill (was 5) — small buff for engagement
  perWave:         26,   // 26 XP per wave survived (was 22) — rewards consistent play
  matchCompletion: 50,   // 50 XP for any match end (was 35) — makes dying less punishing

  // Kill multipliers — bosses and elites feel meaningfully rewarding
  bossKill:      2.5,   // 2.5x for full bosses = 15 XP (was 2.0)
  minibossKill:  2.0,   // 2.0x for minibosses = 12 XP (was 1.5)
  enforcerKill:  1.5,   // 1.5x for enforcers = 9 XP (was 1.2)
};

const BATTLE_PASS_TIERS = [
  // Tier 1-5 (250 XP each) — Early tiers: fast to unlock, gives quick coin boosts
  { tier: 1, xpRequired: 250, freeReward: { type: 'coins', value: 30 },  premiumReward: { type: 'coins', value: 50 } },
  { tier: 2, xpRequired: 250, freeReward: { type: 'coins', value: 40 },  premiumReward: { type: 'coins', value: 75 } },
  { tier: 3, xpRequired: 250, freeReward: { type: 'coins', value: 50 },  premiumReward: { type: 'coins', value: 100 } },
  { tier: 4, xpRequired: 250, freeReward: { type: 'coins', value: 60 },  premiumReward: { type: 'coins', value: 100 } },
  { tier: 5, xpRequired: 250, freeReward: { type: 'coins', value: 75 },  premiumReward: { type: 'skin', skinId: 'bp1_striker' } },

  // Tier 6-10 (400 XP each)
  { tier: 6,  xpRequired: 400, freeReward: { type: 'coins', value: 75 },  premiumReward: { type: 'coins', value: 125 } },
  { tier: 7,  xpRequired: 400, freeReward: { type: 'coins', value: 90 },  premiumReward: { type: 'coins', value: 150 } },
  { tier: 8,  xpRequired: 400, freeReward: { type: 'coins', value: 100 }, premiumReward: { type: 'trail', effectId: 'comet' } },
  { tier: 9,  xpRequired: 400, freeReward: { type: 'coins', value: 120 }, premiumReward: { type: 'coins', value: 175 } },
  { tier: 10, xpRequired: 400, freeReward: { type: 'coins', value: 150 }, premiumReward: { type: 'skin', skinId: 'bp1_guardian' } },

  // Tier 11-15 (600 XP each) — Mid-early: player has marketplace access
  { tier: 11, xpRequired: 600, freeReward: { type: 'coins', value: 150 }, premiumReward: { type: 'coins', value: 200 } },
  { tier: 12, xpRequired: 600, freeReward: { type: 'coins', value: 160 }, premiumReward: { type: 'title', titleId: 'battleborn' } },
  { tier: 13, xpRequired: 600, freeReward: { type: 'coins', value: 175 }, premiumReward: { type: 'coins', value: 225 } },
  { tier: 14, xpRequired: 600, freeReward: { type: 'coins', value: 190 }, premiumReward: { type: 'coins', value: 250 } },
  { tier: 15, xpRequired: 600, freeReward: { type: 'coins', value: 200 }, premiumReward: { type: 'crate', crateId: 'common-crate', quantity: 1 } },

  // Tier 16-20 (600 XP each)
  { tier: 16, xpRequired: 600, freeReward: { type: 'coins', value: 210 }, premiumReward: { type: 'trail', effectId: 'lightning' } },
  { tier: 17, xpRequired: 600, freeReward: { type: 'coins', value: 225 }, premiumReward: { type: 'coins', value: 275 } },
  { tier: 18, xpRequired: 600, freeReward: { type: 'coins', value: 240 }, premiumReward: { type: 'coins', value: 275 } },
  { tier: 19, xpRequired: 600, freeReward: { type: 'coins', value: 260 }, premiumReward: { type: 'coins', value: 300 } },
  { tier: 20, xpRequired: 600, freeReward: { type: 'coins', value: 300 }, premiumReward: { type: 'skin', skinId: 'bp1_phantom' } },

  // Tier 21-25 (850 XP each) — Mid-game: meaningful investment required
  { tier: 21, xpRequired: 850, freeReward: { type: 'coins', value: 300 }, premiumReward: { type: 'coins', value: 350 } },
  { tier: 22, xpRequired: 850, freeReward: { type: 'coins', value: 325 }, premiumReward: { type: 'badge', badgeId: 'seasonwarrior' } },
  { tier: 23, xpRequired: 850, freeReward: { type: 'coins', value: 325 }, premiumReward: { type: 'coins', value: 350 } },
  { tier: 24, xpRequired: 850, freeReward: { type: 'coins', value: 350 }, premiumReward: { type: 'trail', effectId: 'flame' } },
  { tier: 25, xpRequired: 850, freeReward: { type: 'coins', value: 375 }, premiumReward: { type: 'crate', crateId: 'rare-crate', quantity: 2 } },

  // Tier 26-30 (1100 XP each)
  { tier: 26, xpRequired: 1100, freeReward: { type: 'coins', value: 375 }, premiumReward: { type: 'coins', value: 375 } },
  { tier: 27, xpRequired: 1100, freeReward: { type: 'coins', value: 400 }, premiumReward: { type: 'coins', value: 400 } },
  { tier: 28, xpRequired: 1100, freeReward: { type: 'coins', value: 400 }, premiumReward: { type: 'coins', value: 425 } },
  { tier: 29, xpRequired: 1100, freeReward: { type: 'coins', value: 425 }, premiumReward: { type: 'coins', value: 450 } },
  { tier: 30, xpRequired: 1100, freeReward: { type: 'coins', value: 450 }, premiumReward: { type: 'skin', skinId: 'bp1_tempest' } },

  // Tier 31-35 (1400 XP each) — Late-game: dedicated players
  { tier: 31, xpRequired: 1400, freeReward: { type: 'coins', value: 450 }, premiumReward: { type: 'coins', value: 475 } },
  { tier: 32, xpRequired: 1400, freeReward: { type: 'coins', value: 475 }, premiumReward: { type: 'death', effectId: 'starburst' } },
  { tier: 33, xpRequired: 1400, freeReward: { type: 'coins', value: 475 }, premiumReward: { type: 'coins', value: 500 } },
  { tier: 34, xpRequired: 1400, freeReward: { type: 'coins', value: 500 }, premiumReward: { type: 'coins', value: 550 } },
  { tier: 35, xpRequired: 1400, freeReward: { type: 'coins', value: 550 }, premiumReward: { type: 'crate', crateId: 'epic-crate', quantity: 2 } },

  // Tier 36-40 (1800 XP each)
  { tier: 36, xpRequired: 1800, freeReward: { type: 'coins', value: 550 }, premiumReward: { type: 'coins', value: 600 } },
  { tier: 37, xpRequired: 1800, freeReward: { type: 'coins', value: 575 }, premiumReward: { type: 'coins', value: 625 } },
  { tier: 38, xpRequired: 1800, freeReward: { type: 'coins', value: 600 }, premiumReward: { type: 'coins', value: 675 } },
  { tier: 39, xpRequired: 1800, freeReward: { type: 'coins', value: 625 }, premiumReward: { type: 'coins', value: 700 } },
  { tier: 40, xpRequired: 1800, freeReward: { type: 'coins', value: 700 }, premiumReward: { type: 'skin', skinId: 'bp1_eclipse', trail: 'void' } },

  // Tier 41-45 (2200 XP each) — Endgame: serious grind territory
  { tier: 41, xpRequired: 2200, freeReward: { type: 'coins', value: 700 }, premiumReward: { type: 'coins', value: 800 } },
  { tier: 42, xpRequired: 2200, freeReward: { type: 'coins', value: 725 }, premiumReward: { type: 'title', titleId: 'eliteoperative' } },
  { tier: 43, xpRequired: 2200, freeReward: { type: 'coins', value: 750 }, premiumReward: { type: 'coins', value: 825 } },
  { tier: 44, xpRequired: 2200, freeReward: { type: 'coins', value: 775 }, premiumReward: { type: 'coins', value: 900 } },
  { tier: 45, xpRequired: 2200, freeReward: { type: 'coins', value: 800 }, premiumReward: { type: 'skin', skinId: 'bp1_sovereign' } },

  // Tier 46-50 (2800 XP each) — Final stretch: prestige rewards
  { tier: 46, xpRequired: 2800, freeReward: { type: 'coins', value: 825 }, premiumReward: { type: 'coins', value: 1000 } },
  { tier: 47, xpRequired: 2800, freeReward: { type: 'coins', value: 850 }, premiumReward: { type: 'coins', value: 1075 } },
  { tier: 48, xpRequired: 2800, freeReward: { type: 'coins', value: 900 }, premiumReward: { type: 'death', effectId: 'supernova' } },
  { tier: 49, xpRequired: 2800, freeReward: { type: 'coins', value: 1000 }, premiumReward: { type: 'crate', crateId: 'legendary-crate', quantity: 2 } },
  { tier: 50, xpRequired: 2800, freeReward: { type: 'coins', value: 1200 }, premiumReward: { type: 'skin', skinId: 'bp1_apex', coins: 2250, badge: 's1champion' } }
];

const REWARD_TYPES = {
  coins: { icon: '🪙', name: 'Coins' },
  skin: { icon: '🎨', name: 'Skin' },
  trail: { icon: '✨', name: 'Trail Effect' },
  death: { icon: '💥', name: 'Death Effect' },
  title: { icon: '🏷️', name: 'Title' },
  badge: { icon: '🏅', name: 'Badge' },
  crate: { icon: '🎁', name: 'Crate' }
};

const TRAIL_EFFECTS = {
  comet: { name: 'Comet Trail', color: '#00d9ff', particles: 15, speed: 0.3 },
  lightning: { name: 'Lightning Trail', color: '#ffff00', particles: 20, speed: 0.5 },
  flame: { name: 'Flame Trail', color: '#ff4500', particles: 25, speed: 0.4 },
  void: { name: 'Void Trail', color: '#9966ff', particles: 18, speed: 0.35 }
};

const DEATH_EFFECTS = {
  starburst: {
    name: 'Starburst',
    particles: 100,
    colors: ['#fff', '#ff0', '#f0f'],
    duration: 1.5
  },
  supernova: {
    name: 'Supernova',
    particles: 200,
    colors: ['#fff', '#ffa', '#f88', '#f0f'],
    duration: 2.0,
    shockwave: true
  }
};

const PROFILE_TITLES = {
  battleborn: { name: 'Battle Born', color: '#00ff9d' },
  seasonwarrior: { name: 'Season Warrior', color: '#ffd700' },
  eliteoperative: { name: 'Elite Operative', color: '#ff69ff' }
};

const PROFILE_BADGES = {
  seasonwarrior: { icon: '🏅', name: 'Season Warrior' },
  s1champion: { icon: '👑', name: 'S1 Champion' }
};

let battlePassData = {
  season: 1,
  currentXP: 0,
  currentTier: 0,
  isPremium: false,
  claimedRewards: {
    free: [],
    premium: []
  },
  ownedTrails: [],
  ownedDeathEffects: [],
  ownedTitles: [],
  ownedBadges: [],
  activeTrail: null,
  activeDeathEffect: null,
  activeTitle: null,
  activeBadge: null,
  // Crate Inventory System
  crateInventory: {
    'common-crate': 0,
    'rare-crate': 0,
    'epic-crate': 0,
    'legendary-crate': 0,
    'icon-crate': 0,
    'oblivion-crate': 0
  }
};

function battlePassAddXP(amount) {
  if (typeof battlePassData === 'undefined') return;

  battlePassData.currentXP += amount;

  checkTierUnlocks();

  // Update UI if battle pass is open
  if (document.getElementById('shopTab-battlepass') && !document.getElementById('shopTab-battlepass').classList.contains('hidden')) {
    updateBattlePassProgress();
  }

  saveBattlePassData();

  if (typeof updateXPDisplay === 'function') updateXPDisplay();
}

function checkTierUnlocks() {
  const cumulativeXP = getCumulativeXP();
  let tierUnlocked = false;

  for (let i = battlePassData.currentTier + 1; i <= 50; i++) {
    const tierXP = cumulativeXP[i - 1];
    if (battlePassData.currentXP >= tierXP) {
      battlePassData.currentTier = i;
      tierUnlocked = true;
      // Show unlock notification
      showTierUnlockNotification(i);
    } else {
      break;
    }
  }

  // Force immediate save on tier unlock (this is a critical milestone)
  if (tierUnlocked && typeof saveUserDataToFirebase === 'function') {
    saveUserDataToFirebase('critical');
  }
}

function getCumulativeXP() {
  const cumulative = [];
  let total = 0;
  for (let i = 0; i < BATTLE_PASS_TIERS.length; i++) {
    total += BATTLE_PASS_TIERS[i].xpRequired;
    cumulative.push(total);
  }
  return cumulative;
}

function showTierUnlockNotification(tier) {
  const notification = document.createElement('div');
  notification.className = 'battlepass-unlock-notification';
  notification.innerHTML = `
    <div class="battlepass-unlock-content">
      <div class="battlepass-unlock-icon">🎫</div>
      <div class="battlepass-unlock-text">
        <div class="battlepass-unlock-title">TIER ${tier} UNLOCKED!</div>
        <div class="battlepass-unlock-subtitle">New rewards available</div>
      </div>
    </div>
  `;
  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add('show'), 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function canClaimReward(tier, track) {
  if (tier > battlePassData.currentTier) return false;

  if (battlePassData.claimedRewards[track].includes(tier)) return false;

  if (track === 'premium' && !battlePassData.isPremium) return false;

  return true;
}

function claimReward(tier, track) {
  if (!canClaimReward(tier, track)) return;

  const tierData = BATTLE_PASS_TIERS[tier - 1];
  const reward = track === 'free' ? tierData.freeReward : tierData.premiumReward;

  grantReward(reward);

  battlePassData.claimedRewards[track].push(tier);

  // Save progress (critical - reward claimed is important)
  saveBattlePassData();
  if (typeof saveUserDataToFirebase === 'function') {
    saveUserDataToFirebase('critical');
  }

  // Update UI (preserve scroll position)
  if (typeof initBattlePassTab === 'function') {
    const grid = document.querySelector('.battlepass-tier-grid');
    const scrollPos = grid ? grid.scrollTop : 0;
    initBattlePassTab();
    // Restore scroll position after re-render
    setTimeout(() => {
      const newGrid = document.querySelector('.battlepass-tier-grid');
      if (newGrid) newGrid.scrollTop = scrollPos;
    }, 10);
  }

  showRewardNotification(reward);
}

function claimAllAvailableRewards() {
  let claimedCount = 0;
  const rewards = [];

  // Claim all available rewards from both tracks
  for (let i = 0; i < BATTLE_PASS_TIERS.length; i++) {
    const tier = i + 1;
    const tierData = BATTLE_PASS_TIERS[i];

    // Try to claim free reward
    if (canClaimReward(tier, 'free')) {
      const reward = tierData.freeReward;
      grantReward(reward);
      battlePassData.claimedRewards.free.push(tier);
      rewards.push(reward);
      claimedCount++;
    }

    // Try to claim premium reward
    if (canClaimReward(tier, 'premium')) {
      const reward = tierData.premiumReward;
      grantReward(reward);
      battlePassData.claimedRewards.premium.push(tier);
      rewards.push(reward);
      claimedCount++;
    }
  }

  // Save progress (critical - rewards claimed)
  saveBattlePassData();
  if (claimedCount > 0 && typeof saveUserDataToFirebase === 'function') {
    saveUserDataToFirebase('critical');
  }

  if (typeof initBattlePassTab === 'function') {
    initBattlePassTab();
  }

  // Show notification
  if (claimedCount > 0) {
    const notification = document.createElement('div');
    notification.className = 'battlepass-unlock-notification';
    notification.innerHTML = `
      <div class="battlepass-unlock-content">
        <div class="battlepass-unlock-icon">🎁</div>
        <div class="battlepass-unlock-text">
          <div class="battlepass-unlock-title">CLAIMED ${claimedCount} REWARDS!</div>
          <div class="battlepass-unlock-subtitle">Check your inventory</div>
        </div>
      </div>
    `;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

function grantReward(reward) {
  switch (reward.type) {
    case 'coins':
      if (typeof playerCoins !== 'undefined') {
        playerCoins += reward.value;
        if (typeof saveCoins === 'function') saveCoins();
        if (typeof updateCoinDisplays === 'function') updateCoinDisplays();
      }
      break;

    case 'skin':
      if (typeof ownedSkins !== 'undefined' && !ownedSkins.includes(reward.skinId)) {
        ownedSkins.push(reward.skinId);
        if (typeof saveSkins === 'function') saveSkins();
      }
      // If tier 40 or 50, also grant trail/badge/coins
      if (reward.trail && !battlePassData.ownedTrails.includes(reward.trail)) {
        battlePassData.ownedTrails.push(reward.trail);
      }
      if (reward.badge && !battlePassData.ownedBadges.includes(reward.badge)) {
        battlePassData.ownedBadges.push(reward.badge);
      }
      if (reward.coins) {
        playerCoins += reward.coins;
        if (typeof saveCoins === 'function') saveCoins();
      }
      break;

    case 'trail':
      if (!battlePassData.ownedTrails.includes(reward.effectId)) {
        battlePassData.ownedTrails.push(reward.effectId);
      }
      break;

    case 'death':
      if (!battlePassData.ownedDeathEffects.includes(reward.effectId)) {
        battlePassData.ownedDeathEffects.push(reward.effectId);
      }
      break;

    case 'title':
      if (!battlePassData.ownedTitles.includes(reward.titleId)) {
        battlePassData.ownedTitles.push(reward.titleId);
      }
      break;

    case 'badge':
      if (!battlePassData.ownedBadges.includes(reward.badgeId)) {
        battlePassData.ownedBadges.push(reward.badgeId);
      }
      break;

    case 'crate':
      // Add crates to inventory instead of opening immediately
      if (!battlePassData.crateInventory) {
        battlePassData.crateInventory = {
          'common-crate': 0,
          'rare-crate': 0,
          'epic-crate': 0,
          'legendary-crate': 0,
          'icon-crate': 0,
          'oblivion-crate': 0
        };
      }

      if (battlePassData.crateInventory.hasOwnProperty(reward.crateId)) {
        battlePassData.crateInventory[reward.crateId] += reward.quantity || 1;
        console.log(`📦 Added ${reward.quantity || 1}x ${reward.crateId} to inventory`);
      }
      
      // Update crates tab if it's visible
      if (typeof initCratesTab === 'function') {
        initCratesTab();
      }
      break;
  }
}

function showRewardNotification(reward) {
  let rewardText = '';
  switch (reward.type) {
    case 'coins':
      rewardText = `${reward.value} Coins`;
      break;
    case 'skin':
      const skinName = SKINS.find(s => s.id === reward.skinId)?.name || 'Skin';
      rewardText = skinName;
      break;
    case 'trail':
      rewardText = TRAIL_EFFECTS[reward.effectId]?.name || 'Trail Effect';
      break;
    case 'death':
      rewardText = DEATH_EFFECTS[reward.effectId]?.name || 'Death Effect';
      break;
    case 'title':
      rewardText = PROFILE_TITLES[reward.titleId]?.name || 'Title';
      break;
    case 'badge':
      rewardText = PROFILE_BADGES[reward.badgeId]?.name || 'Badge';
      break;
    case 'crate':
      rewardText = `${reward.quantity}× Crate`;
      break;
  }

  // Create notification
  const notification = document.createElement('div');
  notification.className = 'battlepass-reward-notification';
  notification.innerHTML = `
    <div class="battlepass-reward-content">
      <div class="battlepass-reward-icon">${REWARD_TYPES[reward.type].icon}</div>
      <div class="battlepass-reward-text">
        <div class="battlepass-reward-title">REWARD CLAIMED!</div>
        <div class="battlepass-reward-name">${rewardText}</div>
      </div>
    </div>
  `;
  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function purchasePremiumPass() {
  const PREMIUM_PRICE = 5000;

  if (battlePassData.isPremium) {
    alert('You already own the Premium Battle Pass!');
    return;
  }

  if (typeof playerCoins === 'undefined' || playerCoins < PREMIUM_PRICE) {
    alert(`Not enough coins! Premium Pass costs ${PREMIUM_PRICE} coins.`);
    return;
  }

  // Deduct coins
  playerCoins -= PREMIUM_PRICE;
  if (typeof saveCoins === 'function') saveCoins();
  if (typeof updateCoinDisplays === 'function') updateCoinDisplays();

  // Grant premium
  battlePassData.isPremium = true;

  // Save (critical - purchase made)
  saveBattlePassData();
  if (typeof saveUserDataToFirebase === 'function') {
    saveUserDataToFirebase('critical');
  }

  if (typeof initBattlePassTab === 'function') {
    initBattlePassTab();
  }

  // Show success notification
  const notification = document.createElement('div');
  notification.className = 'battlepass-premium-notification';
  notification.innerHTML = `
    <div class="battlepass-premium-content">
      <div class="battlepass-premium-icon">🌟</div>
      <div class="battlepass-premium-text">
        <div class="battlepass-premium-title">PREMIUM UNLOCKED!</div>
        <div class="battlepass-premium-subtitle">All premium rewards are now available</div>
      </div>
    </div>
  `;
  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

let _bpLastXP = -1, _bpLastClaims = '';

function initBattlePassTab() {
  const container = document.getElementById('shopTab-battlepass');
  if (!container) return;

  // Skip re-render if nothing changed (dirty-flag optimization)
  const claimKey = JSON.stringify(battlePassData.claimedFree || []) + JSON.stringify(battlePassData.claimedPremium || []);
  if (battlePassData.currentXP === _bpLastXP && claimKey === _bpLastClaims && container.children.length > 0) return;
  _bpLastXP = battlePassData.currentXP;
  _bpLastClaims = claimKey;

  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'battlepass-header';

  const seasonInfo = document.createElement('div');
  seasonInfo.className = 'battlepass-season-info';
  seasonInfo.innerHTML = `
    <div class="battlepass-season-title">BATTLE PASS - SEASON ${battlePassData.season}</div>
    <div class="battlepass-season-level">Level ${battlePassData.currentTier} / 50</div>
  `;

  const premiumBtn = document.createElement('button');
  premiumBtn.className = 'battlepass-premium-btn';
  if (battlePassData.isPremium) {
    premiumBtn.textContent = '✓ PREMIUM UNLOCKED';
    premiumBtn.disabled = true;
    premiumBtn.style.background = 'rgba(0,255,157,0.2)';
    premiumBtn.style.border = '2px solid rgba(0,255,157,0.5)';
    premiumBtn.style.color = '#00ff9d';
  } else {
    premiumBtn.innerHTML = '🌟 BUY PREMIUM PASS - 2,500 <span style="color: #ffd700;">🪙</span>';
    premiumBtn.onclick = purchasePremiumPass;
  }

  header.appendChild(seasonInfo);
  header.appendChild(premiumBtn);

  const progressContainer = document.createElement('div');
  progressContainer.className = 'battlepass-progress-container';

  const cumulativeXP = getCumulativeXP();
  const currentTierXP = battlePassData.currentTier > 0 ? cumulativeXP[battlePassData.currentTier - 1] : 0;
  const nextTierXP = battlePassData.currentTier < 50 ? cumulativeXP[battlePassData.currentTier] : cumulativeXP[49];
  const xpInCurrentTier = battlePassData.currentXP - currentTierXP;
  const xpNeededForNextTier = nextTierXP - currentTierXP;
  const progress = battlePassData.currentTier >= 50 ? 100 : (xpInCurrentTier / xpNeededForNextTier) * 100;

  progressContainer.innerHTML = `
    <div class="battlepass-progress-info">
      <span>${battlePassData.currentXP.toLocaleString()} XP</span>
      <span>${battlePassData.currentTier < 50 ? `${nextTierXP.toLocaleString()} XP to Tier ${battlePassData.currentTier + 1}` : 'MAX LEVEL'}</span>
    </div>
    <div class="battlepass-progress-bar-outer">
      <div class="battlepass-progress-bar-inner" style="width: ${progress}%"></div>
    </div>
  `;

  const grid = document.createElement('div');
  grid.className = 'battlepass-tier-grid';

  for (let i = 0; i < BATTLE_PASS_TIERS.length; i++) {
    const tierData = BATTLE_PASS_TIERS[i];
    const tierNum = tierData.tier;
    const isUnlocked = tierNum <= battlePassData.currentTier;
    const isCurrent = tierNum === battlePassData.currentTier + 1;

    const tierCard = document.createElement('div');
    tierCard.className = 'battlepass-tier' + (isUnlocked ? ' unlocked' : '') + (isCurrent ? ' current' : '');

    const tierNumber = document.createElement('div');
    tierNumber.className = 'battlepass-tier-number';
    tierNumber.textContent = `TIER ${tierNum}`;

    const freeReward = createRewardElement(tierData.freeReward, 'free', tierNum, isUnlocked);

    const premiumReward = createRewardElement(tierData.premiumReward, 'premium', tierNum, isUnlocked);

    tierCard.appendChild(tierNumber);
    tierCard.appendChild(freeReward);
    tierCard.appendChild(premiumReward);

    grid.appendChild(tierCard);
  }

  container.appendChild(header);
  container.appendChild(progressContainer);

  // Check if there are any claimable rewards
  const hasClaimableRewards = BATTLE_PASS_TIERS.some((_, index) => {
    const tier = index + 1;
    return canClaimReward(tier, 'free') || canClaimReward(tier, 'premium');
  });

  if (hasClaimableRewards) {
    const claimAllBtn = document.createElement('button');
    claimAllBtn.className = 'battlepass-claim-all-btn';
    claimAllBtn.innerHTML = '🎁 CLAIM ALL AVAILABLE REWARDS';
    claimAllBtn.onclick = claimAllAvailableRewards;
    claimAllBtn.style.cssText = `
      margin: 10px auto;
      display: block;
      padding: 12px 24px;
      background: linear-gradient(135deg, #00ff9d 0%, #00b8a9 100%);
      border: none;
      border-radius: 8px;
      color: #0a1628;
      font-weight: bold;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 0 20px rgba(0, 255, 157, 0.4);
    `;
    claimAllBtn.onmouseenter = () => {
      claimAllBtn.style.transform = 'scale(1.05)';
      claimAllBtn.style.boxShadow = '0 0 30px rgba(0, 255, 157, 0.6)';
    };
    claimAllBtn.onmouseleave = () => {
      claimAllBtn.style.transform = 'scale(1)';
      claimAllBtn.style.boxShadow = '0 0 20px rgba(0, 255, 157, 0.4)';
    };
    container.appendChild(claimAllBtn);
  }

  container.appendChild(grid);
}

function createRewardElement(reward, track, tier, isUnlocked) {
  const rewardEl = document.createElement('div');
  rewardEl.className = `battlepass-reward battlepass-reward-${track}`;

  const trackLabel = document.createElement('div');
  trackLabel.className = 'battlepass-reward-track';
  trackLabel.textContent = track === 'free' ? 'FREE' : 'PREMIUM';
  trackLabel.style.color = track === 'free' ? '#78b7ff' : '#ffd700';

  const rewardIcon = document.createElement('div');
  rewardIcon.className = 'battlepass-reward-icon';

  // Special preview for skins - show canvas-drawn version of the actual skin
  if (reward.type === 'skin') {
    rewardIcon.style.borderRadius = '50%';
    rewardIcon.style.width  = '60px';
    rewardIcon.style.height = '60px';
    rewardIcon.style.display = 'flex';
    rewardIcon.style.alignItems = 'center';
    rewardIcon.style.justifyContent = 'center';
    rewardIcon.style.position = 'relative';
    rewardIcon.style.overflow = 'hidden';

    // Draw each BP skin as a proper canvas preview
    const S = 120; // canvas px (2× for sharpness inside the 60px container)
    const bpCanvas = document.createElement('canvas');
    bpCanvas.width  = S;
    bpCanvas.height = S;
    bpCanvas.style.cssText = 'width:60px;height:60px;display:block;border-radius:50%;';
    const bc  = bpCanvas.getContext('2d');
    const cx  = S/2, cy = S/2, r = S/2 - 3;

    // helper to make radial gradient
    const radGrad = (stops) => {
      const g = bc.createRadialGradient(cx - r*0.2, cy - r*0.2, 0, cx, cy, r);
      stops.forEach(([off, col]) => g.addColorStop(off, col));
      return g;
    };

    const skinId = reward.skinId;
    if (skinId === 'bp1_striker') {
      // striker – orange electric ball
      bc.fillStyle = radGrad([[0,'#fff4e6'],[0.2,'#ffdd77'],[0.45,'#ffaa55'],[0.75,'#ff6b35'],[1,'#cc4422']]);
      bc.shadowBlur  = 28; bc.shadowColor = '#ff6b35';
      bc.beginPath(); bc.arc(cx, cy, r, 0, Math.PI*2); bc.fill(); bc.shadowBlur = 0;

      // Outer pulse ring
      bc.strokeStyle = 'rgba(255,170,85,0.8)'; bc.lineWidth = 3;
      bc.shadowBlur = 14; bc.shadowColor = '#ff6b35';
      bc.beginPath(); bc.arc(cx, cy, r+5, 0, Math.PI*2); bc.stroke();

      // 8 rotating electric sparks
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI/4;
        const sx = cx + Math.cos(a)*(r+10), sy = cy + Math.sin(a)*(r+10);
        bc.fillStyle = i%2===0 ? '#ffdd55' : '#fff';
        bc.shadowBlur = 10; bc.shadowColor = '#ff6b35';
        bc.beginPath(); bc.arc(sx, sy, 2.5, 0, Math.PI*2); bc.fill();
        if (i%2===0) {
          bc.strokeStyle = 'rgba(255,255,200,0.55)'; bc.lineWidth = 1.5;
          bc.shadowBlur = 8; bc.shadowColor = '#ffdd55';
          bc.beginPath(); bc.moveTo(cx, cy); bc.lineTo(sx, sy); bc.stroke();
        }
      }
      rewardIcon.style.boxShadow = '0 0 28px #ff6b35, 0 0 50px rgba(255,107,53,0.5)';

    } else if (skinId === 'bp1_guardian') {
      // guardian – teal crystal shield
      bc.fillStyle = radGrad([[0,'#e0ffff'],[0.25,'#aff5f1'],[0.6,'#4ecdc4'],[1,'#2aa39a']]);
      bc.shadowBlur  = 26; bc.shadowColor = '#4ecdc4';
      bc.beginPath(); bc.arc(cx, cy, r, 0, Math.PI*2); bc.fill(); bc.shadowBlur = 0;

      // Inner hex at 0° rotation
      const hexPath = (rad, rot) => {
        bc.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = rot + i*Math.PI/3;
          const hx = cx+Math.cos(a)*rad, hy = cy+Math.sin(a)*rad;
          i===0 ? bc.moveTo(hx,hy) : bc.lineTo(hx,hy);
        }
        bc.closePath();
      };

      [0.88, 0.58, 0.3].forEach((scale, li) => {
        const rot = li * Math.PI/6;
        bc.strokeStyle = `rgba(126,232,224,${1 - li*0.22})`;
        bc.lineWidth   = 3 - li*0.7;
        bc.shadowBlur  = 14; bc.shadowColor = '#4ecdc4';
        hexPath(r*scale, rot); bc.stroke();

        // Vertex dots
        for (let i = 0; i < 6; i++) {
          const a = rot + i*Math.PI/3;
          bc.fillStyle = '#e0ffff'; bc.shadowBlur = 6;
          bc.beginPath(); bc.arc(cx+Math.cos(a)*r*scale, cy+Math.sin(a)*r*scale, 2-li*0.4, 0, Math.PI*2); bc.fill();
        }
      });
      rewardIcon.style.boxShadow = '0 0 28px #4ecdc4, 0 0 50px rgba(78,205,196,0.4)';

    } else if (skinId === 'bp1_phantom') {
      // phantom – purple ghost
      bc.globalAlpha = 0.88;
      bc.fillStyle = radGrad([[0,'#f0e6ff'],[0.2,'#dbbff0'],[0.5,'#c39bd3'],[0.8,'#9b59b6'],[1,'#6c3483']]);
      bc.shadowBlur  = 40; bc.shadowColor = '#9b59b6';
      bc.beginPath(); bc.arc(cx, cy, r, 0, Math.PI*2); bc.fill(); bc.shadowBlur = 0;

      // Ghost wisps / spectral orbs
      for (let i = 0; i < 14; i++) {
        const a  = i * Math.PI*2/14;
        const dr = r*0.55 + (i%3)*8;
        const px2 = cx + Math.cos(a)*dr, py2 = cy + Math.sin(a)*dr;
        bc.fillStyle  = `rgba(219,191,240,${0.5 + (i%2)*0.3})`;
        bc.shadowBlur = 10; bc.shadowColor = '#dbbff0';
        bc.globalAlpha = 0.7 + (i%4)*0.08;
        bc.beginPath(); bc.arc(px2, py2, 2.2 + i%2, 0, Math.PI*2); bc.fill();
      }

      // Outer spectral arc
      bc.globalAlpha = 0.5;
      bc.strokeStyle = 'rgba(195,155,211,0.6)'; bc.lineWidth = 2.5;
      bc.shadowBlur = 12; bc.shadowColor = '#9b59b6';
      bc.beginPath(); bc.arc(cx, cy, r+7, 0.3, Math.PI*1.7); bc.stroke();
      bc.beginPath(); bc.arc(cx, cy, r+12, Math.PI+0.3, Math.PI*2.7); bc.stroke();
      bc.globalAlpha = 1;
      rewardIcon.style.boxShadow = '0 0 30px #9b59b6, 0 0 55px rgba(155,89,182,0.45)';

    } else if (skinId === 'bp1_tempest') {
      // tempest – storm vortex
      bc.fillStyle = radGrad([[0,'#e6f7ff'],[0.2,'#b8e0f6'],[0.5,'#85c1e9'],[0.8,'#3498db'],[1,'#1a5490']]);
      bc.shadowBlur  = 30; bc.shadowColor = '#3498db';
      bc.beginPath(); bc.arc(cx, cy, r, 0, Math.PI*2); bc.fill(); bc.shadowBlur = 0;

      // Spiral vortex arcs (5 arms)
      for (let arm = 0; arm < 5; arm++) {
        const phase = arm * Math.PI*2/5;
        bc.strokeStyle = `rgba(133,193,233,${0.75 - arm*0.1})`;
        bc.lineWidth = 2.8 - arm*0.35;
        bc.shadowBlur = 10; bc.shadowColor = '#3498db';
        bc.beginPath();
        bc.arc(cx, cy, r*0.35 + arm*8, phase, phase + Math.PI*1.25);
        bc.stroke();
      }

      // Lightning bolt (simplified: 2-segment jag to edge)
      const boltAngles = [Math.PI*0.1, Math.PI*0.85, Math.PI*1.5];
      boltAngles.forEach(ba => {
        bc.strokeStyle = 'rgba(255,255,255,0.85)'; bc.lineWidth = 2;
        bc.shadowBlur = 18; bc.shadowColor = '#fff';
        bc.beginPath();
        bc.moveTo(cx, cy);
        const mid = r*0.45;
        bc.lineTo(cx + Math.cos(ba+0.15)*mid, cy + Math.sin(ba+0.15)*mid);
        bc.lineTo(cx + Math.cos(ba)*r*0.92, cy + Math.sin(ba)*r*0.92);
        bc.stroke();
      });

      // Orbit ring
      bc.strokeStyle = 'rgba(52,152,219,0.7)'; bc.lineWidth = 2;
      bc.shadowBlur = 14; bc.shadowColor = '#3498db';
      bc.beginPath(); bc.arc(cx, cy, r+6, 0, Math.PI*2); bc.stroke();
      rewardIcon.style.boxShadow = '0 0 30px #3498db, 0 0 50px rgba(52,152,219,0.45)';

    } else if (skinId === 'bp1_eclipse') {
      // eclipse – cosmic void
      bc.fillStyle = radGrad([[0,'#8b9aaf'],[0.25,'#6b7a8f'],[0.5,'#4a5568'],[0.75,'#2c3e50'],[1,'#1a252f']]);
      bc.shadowBlur  = 22; bc.shadowColor = '#000';
      bc.beginPath(); bc.arc(cx, cy, r, 0, Math.PI*2); bc.fill(); bc.shadowBlur = 0;

      // Crescent moon orbiting
      const mAngle = Math.PI*0.3;
      const mDist  = r + 14;
      const mX = cx + Math.cos(mAngle)*mDist, mY = cy + Math.sin(mAngle)*mDist;
      bc.fillStyle = '#f0f0f0'; bc.shadowBlur = 12; bc.shadowColor = '#fff';
      bc.beginPath(); bc.arc(mX, mY, 7, 0, Math.PI*2); bc.fill();
      bc.fillStyle = '#2c3e50'; bc.shadowBlur = 0;
      bc.beginPath(); bc.arc(mX-3.5, mY, 6.2, 0, Math.PI*2); bc.fill();

      // Stars
      [[Math.PI*0.9,r+10],[Math.PI*1.5,r+16],[Math.PI*1.85,r+12]].forEach(([a,d])=>{
        const sx2 = cx+Math.cos(a)*d, sy2 = cy+Math.sin(a)*d;
        bc.fillStyle = '#e8e8e8'; bc.shadowBlur = 8; bc.shadowColor = '#fff';
        bc.beginPath(); bc.arc(sx2, sy2, 2, 0, Math.PI*2); bc.fill();
      });

      // Dashed orbit trail
      bc.strokeStyle = 'rgba(107,122,143,0.4)'; bc.lineWidth = 1.2;
      bc.setLineDash([3,4]);
      bc.beginPath(); bc.arc(cx, cy, r+14, 0, Math.PI*2); bc.stroke();
      bc.setLineDash([]);

      // Corona glow ring
      bc.strokeStyle = 'rgba(192,192,192,0.45)'; bc.lineWidth = 2.5;
      bc.shadowBlur = 20; bc.shadowColor = '#8b9aaf';
      bc.beginPath(); bc.arc(cx, cy, r+4, 0, Math.PI*2); bc.stroke();
      rewardIcon.style.boxShadow = '0 0 30px rgba(44,62,80,0.8), 0 0 50px rgba(74,85,104,0.4), inset 0 0 20px rgba(200,200,200,0.15)';

    } else if (skinId === 'bp1_sovereign') {
      // sovereign – golden crown
      bc.fillStyle = radGrad([[0,'#fff'],[0.1,'#fffacd'],[0.35,'#ffd700'],[0.7,'#f39c12'],[1,'#b8860b']]);
      bc.shadowBlur  = 40; bc.shadowColor = '#ffd700';
      bc.beginPath(); bc.arc(cx, cy, r, 0, Math.PI*2); bc.fill(); bc.shadowBlur = 0;

      // Golden aura
      bc.strokeStyle = 'rgba(255,215,0,0.5)'; bc.lineWidth = 3;
      bc.shadowBlur = 20; bc.shadowColor = '#ffd700';
      bc.beginPath(); bc.arc(cx, cy, r+5, 0, Math.PI*2); bc.stroke();

      // Crown spikes (5 spikes arcing across the top)
      const crownSpikes = 5;
      const crownBase  = cy - r*0.5; // y-level of crown band
      const crownTop   = cy - r - 14; // y-level of tallest spike tip
      for (let i = 0; i < crownSpikes; i++) {
        const frac = i / (crownSpikes - 1);          // 0..1
        const crownX = cx - r*0.7 + frac * r*1.4;
        const isMain = (i === 0 || i === 2 || i === 4);
        const tipY   = isMain ? crownTop : crownTop + 10;
        const jewels = ['#ff4444','#44ff44','#4488ff','#ffff00','#ff44ff'];

        // Spike triangle
        bc.fillStyle  = isMain ? '#ffd700' : '#fffacd';
        bc.shadowBlur = 10; bc.shadowColor = '#f39c12';
        bc.beginPath();
        bc.moveTo(crownX, tipY);
        bc.lineTo(crownX - 5, crownBase);
        bc.lineTo(crownX + 5, crownBase);
        bc.closePath(); bc.fill();

        // Jewel on main spikes
        if (isMain) {
          bc.fillStyle  = jewels[i];
          bc.shadowBlur = 12; bc.shadowColor = '#fff';
          bc.beginPath(); bc.arc(crownX, tipY + 3, 3, 0, Math.PI*2); bc.fill();
          bc.fillStyle = 'rgba(255,255,255,0.7)'; bc.shadowBlur = 4;
          bc.beginPath(); bc.arc(crownX-1, tipY+2, 1.2, 0, Math.PI*2); bc.fill();
        }
      }

      // Crown band
      bc.fillStyle = 'rgba(183,134,11,0.35)';
      bc.fillRect(cx - r*0.72, crownBase - 4, r*1.44, 8);

      // Orbiting gold particles
      for (let i = 0; i < 10; i++) {
        const a = i*Math.PI*2/10;
        const px2 = cx+Math.cos(a)*r*0.65, py2 = cy+Math.sin(a)*r*0.65;
        bc.fillStyle = i%2===0 ? '#fff' : '#fffacd';
        bc.shadowBlur = 8; bc.shadowColor = '#ffd700';
        bc.beginPath(); bc.arc(px2, py2, 1.8, 0, Math.PI*2); bc.fill();
      }
      rewardIcon.style.boxShadow = '0 0 35px #ffd700, 0 0 60px rgba(255,215,0,0.55), inset 0 0 22px rgba(255,255,255,0.25)';

    } else if (skinId === 'bp1_apex') {
      // apex predator – legendary red
      bc.fillStyle = radGrad([[0,'#ffcccc'],[0.1,'#ff9999'],[0.3,'#ff6b6b'],[0.55,'#e74c3c'],[0.8,'#c0392b'],[1,'#4d0000']]);
      bc.shadowBlur  = 50; bc.shadowColor = '#e74c3c';
      bc.beginPath(); bc.arc(cx, cy, r, 0, Math.PI*2); bc.fill(); bc.shadowBlur = 0;

      // Menacing aura
      bc.strokeStyle = 'rgba(231,76,60,0.4)'; bc.lineWidth = 5;
      bc.shadowBlur = 30; bc.shadowColor = '#c0392b';
      bc.beginPath(); bc.arc(cx, cy, r+7, 0, Math.PI*2); bc.stroke();

      // Predator EYES (the signature feature)
      const eyeOX = r*0.34, eyeOY = r*0.28;
      [-1,1].forEach(side => {
        // Eye glow
        bc.fillStyle = '#ff0000'; bc.shadowBlur = 24; bc.shadowColor = '#ff0000';
        bc.beginPath(); bc.arc(cx+side*eyeOX, cy-eyeOY, 5.5, 0, Math.PI*2); bc.fill();
        // Pupil dark
        bc.fillStyle = '#800000'; bc.shadowBlur = 0;
        bc.beginPath(); bc.arc(cx+side*eyeOX, cy-eyeOY, 2.5, 0, Math.PI*2); bc.fill();
        // Highlight
        bc.fillStyle = '#fff'; bc.shadowBlur = 6; bc.shadowColor = '#fff';
        bc.beginPath(); bc.arc(cx+side*eyeOX-1, cy-eyeOY-1, 1.5, 0, Math.PI*2); bc.fill();
        // Laser beam
        bc.strokeStyle = 'rgba(255,0,0,0.45)'; bc.lineWidth = 2.5;
        bc.shadowBlur = 14; bc.shadowColor = '#ff0000';
        bc.beginPath();
        bc.moveTo(cx+side*eyeOX, cy-eyeOY);
        bc.lineTo(cx+side*eyeOX*2.8, cy-eyeOY*4.5);
        bc.stroke();
      });

      // 6 rotating danger triangles
      for (let i = 0; i < 6; i++) {
        const ta = i*Math.PI/3 + Math.PI/6;
        const tx = cx+Math.cos(ta)*(r+12), ty = cy+Math.sin(ta)*(r+12);
        bc.save();
        bc.translate(tx, ty); bc.rotate(ta);
        bc.fillStyle = i%2===0 ? '#ff6b6b' : '#e74c3c';
        bc.shadowBlur = 14; bc.shadowColor = '#e74c3c';
        bc.beginPath(); bc.moveTo(0,-7); bc.lineTo(-5,5); bc.lineTo(5,5); bc.closePath(); bc.fill();
        bc.restore();
      }

      // 4 expanding power rings
      for (let wave = 0; wave < 4; wave++) {
        const wr = r + 9 + wave*7;
        bc.strokeStyle = `rgba(231,76,60,${0.7 - wave*0.15})`;
        bc.lineWidth   = 4 - wave*0.7;
        bc.shadowBlur  = 22; bc.shadowColor = '#e74c3c';
        bc.beginPath(); bc.arc(cx, cy, wr, 0, Math.PI*2); bc.stroke();
      }
      rewardIcon.style.boxShadow = '0 0 40px #e74c3c, 0 0 70px rgba(231,76,60,0.65), inset 0 0 28px rgba(255,100,100,0.3)';

    } else {
      // Fallback for unknown skins
      rewardIcon.textContent = REWARD_TYPES[reward.type].icon;
    }

    if (bpCanvas.width && skinId !== 'bp1_unknown') {
      // Only append canvas if we drew something
      const knownSkins = ['bp1_striker','bp1_guardian','bp1_phantom','bp1_tempest','bp1_eclipse','bp1_sovereign','bp1_apex'];
      if (knownSkins.includes(skinId)) {
        bc.shadowBlur = 0; bc.globalAlpha = 1;
        rewardIcon.appendChild(bpCanvas);
      } else {
        rewardIcon.textContent = REWARD_TYPES[reward.type].icon;
      }
    }
  } else {
    rewardIcon.textContent = REWARD_TYPES[reward.type].icon;
  }

  const rewardName = document.createElement('div');
  rewardName.className = 'battlepass-reward-name';
  rewardName.textContent = getRewardDisplayName(reward);

  const isClaimed = battlePassData.claimedRewards[track].includes(tier);
  const canClaim = canClaimReward(tier, track);

  if (isClaimed) {
    const claimedMark = document.createElement('div');
    claimedMark.className = 'battlepass-reward-claimed';
    claimedMark.textContent = '✓';
    rewardEl.appendChild(claimedMark);
    rewardEl.classList.add('claimed');
  } else if (canClaim) {
    const claimBtn = document.createElement('button');
    claimBtn.className = 'battlepass-claim-btn';
    claimBtn.textContent = 'CLAIM';
    claimBtn.onclick = () => claimReward(tier, track);
    rewardEl.appendChild(claimBtn);
  } else if (!isUnlocked) {
    const lockIcon = document.createElement('div');
    lockIcon.className = 'battlepass-reward-locked';
    lockIcon.textContent = '🔒';
    rewardEl.appendChild(lockIcon);
    rewardEl.classList.add('locked');
  } else if (track === 'premium' && !battlePassData.isPremium) {
    const premiumLock = document.createElement('div');
    premiumLock.className = 'battlepass-reward-premium-lock';
    premiumLock.textContent = '⭐';
    rewardEl.appendChild(premiumLock);
    rewardEl.classList.add('premium-locked');
  }

  rewardEl.appendChild(trackLabel);
  rewardEl.appendChild(rewardIcon);
  rewardEl.appendChild(rewardName);

  return rewardEl;
}

function getRewardDisplayName(reward) {
  switch (reward.type) {
    case 'coins':
      return `${reward.value}`;
    case 'skin':
      const skin = SKINS ? SKINS.find(s => s.id === reward.skinId) : null;
      return skin ? skin.name : reward.skinId;
    case 'trail':
      return TRAIL_EFFECTS[reward.effectId]?.name || reward.effectId;
    case 'death':
      return DEATH_EFFECTS[reward.effectId]?.name || reward.effectId;
    case 'title':
      return PROFILE_TITLES[reward.titleId]?.name || reward.titleId;
    case 'badge':
      return PROFILE_BADGES[reward.badgeId]?.name || reward.badgeId;
    case 'crate':
      return `${reward.quantity}× Crate`;
    default:
      return REWARD_TYPES[reward.type].name;
  }
}

function updateBattlePassProgress() {
  const progressBar = document.querySelector('.battlepass-progress-bar-inner');
  const progressInfo = document.querySelector('.battlepass-progress-info');
  const seasonLevel = document.querySelector('.battlepass-season-level');

  if (!progressBar || !progressInfo || !seasonLevel) return;

  const cumulativeXP = getCumulativeXP();
  const currentTierXP = battlePassData.currentTier > 0 ? cumulativeXP[battlePassData.currentTier - 1] : 0;
  const nextTierXP = battlePassData.currentTier < 50 ? cumulativeXP[battlePassData.currentTier] : cumulativeXP[49];
  const xpInCurrentTier = battlePassData.currentXP - currentTierXP;
  const xpNeededForNextTier = nextTierXP - currentTierXP;
  const progress = battlePassData.currentTier >= 50 ? 100 : (xpInCurrentTier / xpNeededForNextTier) * 100;

  progressBar.style.width = progress + '%';
  progressInfo.innerHTML = `
    <span>${battlePassData.currentXP.toLocaleString()} XP</span>
    <span>${battlePassData.currentTier < 50 ? `${nextTierXP.toLocaleString()} XP to Tier ${battlePassData.currentTier + 1}` : 'MAX LEVEL'}</span>
  `;
  seasonLevel.textContent = `Level ${battlePassData.currentTier} / 50`;
}

// save/load

function saveBattlePassData() {
  // Save to localStorage (for guests)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('battlePassData', JSON.stringify(battlePassData));
  }

  // Save to Firebase (for logged-in users) - USE NEW THROTTLED SYSTEM
  if (typeof currentUser !== 'undefined' && currentUser && typeof saveUserDataToFirebase === 'function') {
    saveUserDataToFirebase('normal');  // Use 'normal' priority for automatic batching
  }
}

function loadBattlePassData() {
  // Try to load from localStorage first
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('battlePassData');
    if (saved) {
      try {
        battlePassData = JSON.parse(saved);
        
        // Ensure crateInventory exists (for older saves)
        if (!battlePassData.crateInventory) {
          battlePassData.crateInventory = {
            'common-crate': 0,
            'rare-crate': 0,
            'epic-crate': 0,
            'legendary-crate': 0,
            'icon-crate': 0,
            'oblivion-crate': 0
          };
        }
      } catch (e) {
        console.error('Error loading battle pass data:', e);
      }
    }
  }
}

function initCosmeticsTab() {
  const container = document.getElementById('shopTab-cosmetics');
  if (!container) return;

  container.innerHTML = '';

  // header
  const header = document.createElement('div');
  header.className = 'cosmetics-header';
  header.innerHTML = `
    <div class="cosmetics-header-title">✨ COSMETICS</div>
    <div class="cosmetics-header-sub">Equip trails and death effects earned from the Battle Pass</div>
  `;
  container.appendChild(header);

  // trail effects
  const trailSection = document.createElement('div');
  trailSection.className = 'cosmetics-section';
  trailSection.innerHTML = `
    <div class="cosmetics-section-header">
      <span class="cosmetics-section-icon">🌠</span>
      <span class="cosmetics-section-title">TRAIL EFFECTS</span>
      <span class="cosmetics-section-desc">Particle trail that follows your player</span>
    </div>
  `;

  const trailGrid = document.createElement('div');
  trailGrid.className = 'cosmetics-card-grid';

  const noneTrail = _makeCosmCard(
    '🚫', 'None', '#888',
    'No trail effect — clean & simple',
    battlePassData.activeTrail === null,
    true,
    () => { battlePassData.activeTrail = null; saveBattlePassData(); initCosmeticsTab(); }
  );
  trailGrid.appendChild(noneTrail);

  const TRAIL_META = {
    comet:     { icon: '☄️', preview: '#00d9ff', desc: 'Icy blue comet streak' },
    lightning: { icon: '⚡', preview: '#ffff00', desc: 'Electric yellow sparks' },
    flame:     { icon: '🔥', preview: '#ff4500', desc: 'Blazing orange fire wisps' },
    void:      { icon: '🌀', preview: '#9966ff', desc: 'Dark purple void energy' }
  };

  for (const [effectId, effect] of Object.entries(TRAIL_EFFECTS)) {
    const isOwned = battlePassData.ownedTrails.includes(effectId);
    const isActive = battlePassData.activeTrail === effectId;
    const meta = TRAIL_META[effectId] || { icon: '✨', preview: effect.color, desc: effect.name };

    const card = _makeCosmCard(
      meta.icon, effect.name, meta.preview,
      meta.desc,
      isActive, isOwned,
      isOwned ? () => { battlePassData.activeTrail = effectId; saveBattlePassData(); initCosmeticsTab(); } : null,
      'Earn from Battle Pass'
    );
    trailGrid.appendChild(card);
  }

  trailSection.appendChild(trailGrid);
  container.appendChild(trailSection);

  // death effects
  const deathSection = document.createElement('div');
  deathSection.className = 'cosmetics-section';
  deathSection.innerHTML = `
    <div class="cosmetics-section-header">
      <span class="cosmetics-section-icon">💀</span>
      <span class="cosmetics-section-title">DEATH EFFECTS</span>
      <span class="cosmetics-section-desc">Special effect when your player dies</span>
    </div>
  `;

  const deathGrid = document.createElement('div');
  deathGrid.className = 'cosmetics-card-grid';

  const noneDeath = _makeCosmCard(
    '💥', 'Default', '#ff4444',
    'Standard explosion',
    battlePassData.activeDeathEffect === null,
    true,
    () => { battlePassData.activeDeathEffect = null; saveBattlePassData(); initCosmeticsTab(); }
  );
  deathGrid.appendChild(noneDeath);

  const DEATH_META = {
    starburst: { icon: '🌟', preview: '#ff00ff', desc: 'Rainbow star burst explosion' },
    supernova: { icon: '🌠', preview: '#fff844', desc: 'Epic multi-ring supernova blast' }
  };

  for (const [effectId, effect] of Object.entries(DEATH_EFFECTS)) {
    const isOwned = battlePassData.ownedDeathEffects.includes(effectId);
    const isActive = battlePassData.activeDeathEffect === effectId;
    const meta = DEATH_META[effectId] || { icon: '💥', preview: '#ff4444', desc: effect.name };

    const card = _makeCosmCard(
      meta.icon, effect.name, meta.preview,
      meta.desc,
      isActive, isOwned,
      isOwned ? () => { battlePassData.activeDeathEffect = effectId; saveBattlePassData(); initCosmeticsTab(); } : null,
      'Earn from Battle Pass'
    );
    deathGrid.appendChild(card);
  }

  deathSection.appendChild(deathGrid);
  container.appendChild(deathSection);

  // earn more hint
  const hint = document.createElement('div');
  hint.className = 'cosmetics-earn-hint';
  hint.innerHTML = `
    <span>🎫</span>
    <span>Unlock more cosmetics by leveling up the <strong>Battle Pass</strong></span>
  `;
  container.appendChild(hint);
}

/** Helper: Build a cosmetic card */
function _makeCosmCard(icon, name, glowColor, desc, isActive, isOwned, onClick, lockedHint) {
  const card = document.createElement('div');
  card.className = 'cosmetics-card' + (isActive ? ' active' : '') + (!isOwned ? ' locked' : '');
  if (isActive) card.style.setProperty('--cosm-color', glowColor);

  card.innerHTML = `
    <div class="cosmetics-card-glow" style="background: radial-gradient(circle, ${glowColor}44 0%, transparent 70%);"></div>
    <div class="cosmetics-card-icon" style="color: ${glowColor}; text-shadow: 0 0 16px ${glowColor}80;">${icon}</div>
    <div class="cosmetics-card-name">${name}</div>
    <div class="cosmetics-card-desc">${desc}</div>
    ${isActive ? '<div class="cosmetics-card-badge active-badge">✓ ACTIVE</div>' : ''}
    ${!isOwned ? `<div class="cosmetics-card-badge locked-badge">🔒 ${lockedHint || 'LOCKED'}</div>` : ''}
  `;

  if (isOwned && onClick) {
    card.addEventListener('click', onClick);
  }
  return card;
}

loadBattlePassData();

console.log('🎫 Battle pass system loaded!');