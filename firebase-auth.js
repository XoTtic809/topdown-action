// firebase-auth.js

let currentUser = null;
let isGuest     = false;
let isAdmin     = false;

// save throttling — batches rapid changes, forces save on critical events
let pendingSave  = false;
let saveTimeout  = null;
let lastSaveTime = 0;
let forceNextSave = false;

const SAVE_CONFIG = {
  MIN_INTERVAL: 30000,   // 30s minimum between saves
  BATCH_DELAY:  5000,    // wait 5s after last change before saving
  MAX_WAIT:     120000,  // force save after 2 min no matter what
};

let lastSubmittedData = { highScore: 0, coins: 0, xp: 0, level: 0 };

function scheduleSave(priority = 'normal') {
  if (!currentUser || isGuest) return;

  if (priority === 'critical') {
    forceNextSave = true;
    clearTimeout(saveTimeout);
    executeSave();
    return;
  }

  clearTimeout(saveTimeout);

  const timeSinceLastSave = Date.now() - lastSaveTime;
  const delay = timeSinceLastSave >= SAVE_CONFIG.MIN_INTERVAL
    ? SAVE_CONFIG.BATCH_DELAY
    : SAVE_CONFIG.MIN_INTERVAL - timeSinceLastSave + SAVE_CONFIG.BATCH_DELAY;

  saveTimeout = setTimeout(executeSave, delay);

  // safety net — if we've somehow been waiting too long, force it
  if (Date.now() - lastSaveTime >= SAVE_CONFIG.MAX_WAIT) {
    clearTimeout(saveTimeout);
    executeSave();
  }
}

async function executeSave() {
  if (!currentUser || isGuest || pendingSave) return;

  pendingSave  = true;
  lastSaveTime = Date.now();

  try {
    const hasChanges =
      high !== lastSubmittedData.highScore ||
      playerCoins !== lastSubmittedData.coins ||
      (typeof battlePassData !== 'undefined' && battlePassData.currentXP !== lastSubmittedData.xp);

    if (!hasChanges && !forceNextSave) {
      pendingSave = false;
      return;
    }

    // ── Coin sanity check (second layer after Firestore rules) ──
    // If coins increased by more than the max plausible per-session amount,
    // clamp to prevent console hacking (e.g. playerCoins = 9999999).
    // Decreases (purchases) are always allowed through unchanged.
    const MAX_COINS_PER_SAVE = 300000; // must match firestore.rules
    if (playerCoins - lastSubmittedData.coins > MAX_COINS_PER_SAVE) {
      console.warn('[Save] Coin increase clamped — possible client manipulation.');
      playerCoins = lastSubmittedData.coins + MAX_COINS_PER_SAVE;
    }

    const updateData = {
      highScore:  high,
      totalCoins: playerCoins,
      ownedSkins: ownedSkins,
      activeSkin: activeSkin,
      battlePass: typeof battlePassData !== 'undefined' ? {
        season:           battlePassData.season,
        currentXP:        battlePassData.currentXP,
        currentTier:      battlePassData.currentTier,
        isPremium:        battlePassData.isPremium,
        claimedRewards:   battlePassData.claimedRewards,
        ownedTrails:      battlePassData.ownedTrails      || [],
        ownedDeathEffects: battlePassData.ownedDeathEffects || [],
        ownedTitles:      battlePassData.ownedTitles      || [],
        ownedBadges:      battlePassData.ownedBadges      || [],
        activeTrail:      battlePassData.activeTrail,
        activeDeathEffect: battlePassData.activeDeathEffect,
        activeTitle:      battlePassData.activeTitle,
        activeBadge:      battlePassData.activeBadge,
        crateInventory:   battlePassData.crateInventory   || {
          'common-crate': 0, 'rare-crate': 0, 'epic-crate': 0,
          'legendary-crate': 0, 'icon-crate': 0, 'oblivion-crate': 0
        }
      } : null,
      lastPlayed: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Include marketplace skin received times if they exist
    if (typeof marketplaceState !== 'undefined' && marketplaceState.skinReceivedTimes) {
      updateData.skinReceivedTimes = marketplaceState.skinReceivedTimes;
    }

    await db.collection('users').doc(currentUser.uid).update(updateData);

    await updateLeaderboardsIfNeeded();

    lastSubmittedData.highScore = high;
    lastSubmittedData.coins     = playerCoins;
    if (typeof battlePassData !== 'undefined') {
      lastSubmittedData.xp    = battlePassData.currentXP;
      lastSubmittedData.level = calculateTrueLevel(battlePassData.currentXP);
    }

    forceNextSave = false;
  } catch (err) {
    console.error('Save failed:', err);
  } finally {
    pendingSave = false;
  }
}

async function updateLeaderboardsIfNeeded() {
  const promises = [];

  if (Math.abs(playerCoins - lastSubmittedData.coins) >= 10)
    promises.push(submitCoinsToLeaderboard(playerCoins));

  if (typeof battlePassData !== 'undefined' && battlePassData.currentXP) {
    const level = calculateTrueLevel(battlePassData.currentXP);
    if (level !== lastSubmittedData.level)
      promises.push(submitLevelToLeaderboard(battlePassData.currentXP, level));
  }

  await Promise.all(promises);
}

async function saveUserDataToFirebase(priority = 'normal') {
  scheduleSave(priority);
}

async function checkIfBanned(userId) {
  try {
    return (await db.collection('banned').doc(userId).get()).exists;
  } catch (err) {
    console.error('Ban check failed:', err);
    return false;
  }
}

async function checkIfAdmin(userId) {
  try {
    const doc = await db.collection('admins').doc(userId).get();
    return doc.exists && doc.data().isAdmin === true;
  } catch (err) {
    console.error('Admin check failed:', err);
    return false;
  }
}

async function handleLogin(email, password) {
  try {
    const { user } = await auth.signInWithEmailAndPassword(email, password);
    if (await checkIfBanned(user.uid)) {
      await auth.signOut();
      throw new Error('This account has been banned.');
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleSignup(email, password, username) {
  if (typeof validateUsername === 'function') {
    const check = validateUsername(username);
    if (!check.ok) return { success: false, error: check.reason };
  }

  try {
    const { user } = await auth.createUserWithEmailAndPassword(email, password);
    await user.updateProfile({ displayName: username });
    await db.collection('users').doc(user.uid).set({
      username,
      email,
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
      highScore:   0,
      totalCoins:  0,
      ownedSkins:  ['agent'],
      activeSkin:  'agent',
      gamesPlayed: 0
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleLogout() {
  try {
    await executeSave();
    await auth.signOut();
    currentUser = null;
    isGuest     = false;
    isAdmin     = false;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

auth.onAuthStateChanged(async (user) => {
  // Always wipe marketplace cache on any auth change so no user
  // ever sees another user's whitelist/cooldown/eligibility data.
  if (typeof resetMarketplaceState === 'function') resetMarketplaceState();

  if (user) {
    if (await checkIfBanned(user.uid)) {
      await auth.signOut();
      alert('Your account has been banned.');
      showAuthModal();
      return;
    }

    currentUser = user;
    isGuest     = false;
    isAdmin     = await checkIfAdmin(user.uid);

    updateUIForLoggedInUser();
    await loadUserDataFromFirebase(user.uid);
    setTimeout(checkForNewAnnouncements, 1000);

    // grant champion skins to admins so they can see them in the shop
    if (isAdmin) {
      const championSkins = ['gold-champion', 'silver-champion', 'bronze-champion'];
      const added = championSkins.filter(s => !ownedSkins.includes(s));
      if (added.length) {
        ownedSkins.push(...added);
        await saveUserDataToFirebase('critical');
      }
    }
  } else {
    currentUser = null;
    isAdmin     = false;
  }
});

async function submitScoreToLeaderboard(score, wave = null, kills = null, gameDuration = null) {
  if (!currentUser || isGuest) return;
  if (!Number.isFinite(score) || score < 0) return; // final NaN guard
  try {
    const ref  = db.collection('leaderboard').doc(currentUser.uid);
    const snap = await ref.get();
    if (!snap.exists || score > (snap.data().score || 0)) {
      await ref.set({
        userId:    currentUser.uid,
        username:  currentUser.displayName || 'Anonymous',
        score,
        wave:         wave,
        kills:        kills,
        gameDuration: gameDuration,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        date:      new Date().toISOString()
      });
      await updateChampionSkins();
    }
  } catch (err) {
    console.error('Score submit failed:', err);
  }
}

async function submitCoinsToLeaderboard(coins) {
  if (!currentUser || isGuest) return;
  try {
    await db.collection('coinsLeaderboard').doc(currentUser.uid).set({
      userId:    currentUser.uid,
      username:  currentUser.displayName || 'Anonymous',
      coins,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Coins submit failed:', err);
  }
}

async function submitLevelToLeaderboard(xp, level) {
  if (!currentUser || isGuest) return;
  try {
    await db.collection('levelLeaderboard').doc(currentUser.uid).set({
      userId:    currentUser.uid,
      username:  currentUser.displayName || 'Anonymous',
      xp,
      level,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Level submit failed:', err);
  }
}

// calculateTrueLevel() lives in game.js

async function fetchLeaderboard(type = 'allTime') {
  try {
    let query;
    if (type === 'coins') {
      query = db.collection('coinsLeaderboard').orderBy('coins', 'desc').limit(100);
    } else if (type === 'level') {
      query = db.collection('levelLeaderboard').orderBy('xp', 'desc').limit(100);
    } else {
      query = db.collection('leaderboard').orderBy('score', 'desc').limit(100);
      if (type === 'daily') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        query = query.where('timestamp', '>=', yesterday);
      } else if (type === 'weekly') {
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        query = query.where('timestamp', '>=', lastWeek);
      }
    }
    return (await query.get()).docs.map(d => d.data());
  } catch (err) {
    console.error('Leaderboard fetch failed:', err);
    return [];
  }
}

async function displayLeaderboard(filter = 'allTime') {
  const leaderboard = await fetchLeaderboard(filter);
  const listEl = document.getElementById('leaderboardList');

  if (leaderboard.length === 0) {
    listEl.innerHTML = '<div class="leaderboard-empty">No scores yet!</div>';
    return;
  }

  listEl.innerHTML = '';
  leaderboard.forEach((entry, i) => {
    const el = document.createElement('div');
    el.className = 'leaderboard-entry';
    if (i === 0) el.classList.add('rank-1');
    else if (i === 1) el.classList.add('rank-2');
    else if (i === 2) el.classList.add('rank-3');
    if (currentUser && entry.userId === currentUser.uid) el.classList.add('current-user');

    const badge = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';

    const value = filter === 'coins'
      ? `${entry.coins?.toLocaleString() || 0} 🪙`
      : filter === 'level'
      ? `Level ${entry.level || 0} (${entry.xp?.toLocaleString() || 0} XP)`
      : entry.score?.toLocaleString() || 0;

    el.innerHTML = `
      <div class="rank">${badge || (i + 1)}</div>
      <div class="leaderboard-name">${entry.username}</div>
      <div class="leaderboard-score">${value}</div>
    `;
    listEl.appendChild(el);
  });
}

async function updateChampionSkins() {
  if (!currentUser || isGuest) return;
  try {
    const leaderboard = await fetchLeaderboard('allTime');
    const rank = leaderboard.findIndex(e => e.userId === currentUser.uid) + 1;
    if (!rank) return;

    const skinMap = { 1: 'gold-champion', 2: 'silver-champion', 3: 'bronze-champion' };
    const earned  = skinMap[rank];

    if (rank <= 3 && earned && !ownedSkins.includes(earned)) {
      ownedSkins.push(earned);
      await saveUserDataToFirebase('critical');
      if (typeof updateSkinsDisplay === 'function') updateSkinsDisplay();
    }

    if (rank > 3) {
      const champs = ['gold-champion', 'silver-champion', 'bronze-champion'];
      let changed  = false;
      champs.forEach(skin => {
        const idx = ownedSkins.indexOf(skin);
        if (idx > -1) {
          ownedSkins.splice(idx, 1);
          if (activeSkin === skin) activeSkin = 'agent';
          changed = true;
        }
      });
      if (changed) await saveUserDataToFirebase('critical');
    }
  } catch (err) {
    console.error('Champion skin update failed:', err);
  }
}

async function loadUserDataFromFirebase(userId) {
  try {
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return;

    const data   = snap.data();
    high         = data.highScore  || 0;
    playerCoins  = data.totalCoins || 0;
    ownedSkins   = data.ownedSkins || ['agent'];
    activeSkin   = data.activeSkin || 'agent';

    if (data.battlePass && typeof battlePassData !== 'undefined') {
      const bp = data.battlePass;
      battlePassData.season           = bp.season          || 1;
      battlePassData.currentXP        = bp.currentXP       || 0;
      battlePassData.currentTier      = bp.currentTier     || 0;
      battlePassData.isPremium        = bp.isPremium        || false;
      battlePassData.claimedRewards   = bp.claimedRewards   || { free: [], premium: [] };
      battlePassData.ownedTrails      = bp.ownedTrails      || [];
      battlePassData.ownedDeathEffects = bp.ownedDeathEffects || [];
      battlePassData.ownedTitles      = bp.ownedTitles      || [];
      battlePassData.ownedBadges      = bp.ownedBadges      || [];
      battlePassData.activeTrail      = bp.activeTrail      || null;
      battlePassData.activeDeathEffect = bp.activeDeathEffect || null;
      battlePassData.activeTitle      = bp.activeTitle      || null;
      battlePassData.activeBadge      = bp.activeBadge      || null;
      battlePassData.crateInventory   = bp.crateInventory   || {
        'common-crate': 0, 'rare-crate': 0, 'epic-crate': 0,
        'legendary-crate': 0, 'icon-crate': 0, 'oblivion-crate': 0
      };
    }

    // Load marketplace data
    if (typeof marketplaceState !== 'undefined') {
      marketplaceState.accountCreatedAt = data.createdAt || null;
      marketplaceState.skinReceivedTimes = data.skinReceivedTimes || {};
    }

    lastSubmittedData.highScore = high;
    lastSubmittedData.coins     = playerCoins;
    if (typeof battlePassData !== 'undefined') {
      lastSubmittedData.xp    = battlePassData.currentXP;
      lastSubmittedData.level = calculateTrueLevel(battlePassData.currentXP);
    }

    document.getElementById('homeHighVal').textContent  = high.toLocaleString();
    document.getElementById('homeCoinsVal').textContent = playerCoins.toLocaleString();

    if (typeof updateSkinsDisplay      === 'function') updateSkinsDisplay();
    if (typeof updateBattlePassProgress === 'function') updateBattlePassProgress();
    if (typeof updateXPDisplay          === 'function') updateXPDisplay();
  } catch (err) {
    console.error('Load user data failed:', err);
  }
}

window.addEventListener('beforeunload', () => {
  if (currentUser && !isGuest) executeSave();
});

// admin functions

async function banUser(userId, reason = '') {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  try {
    await db.collection('banned').doc(userId).set({
      bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
      bannedBy: currentUser.uid,
      reason
    });
    await logAdminAction('ban', { targetUserId: userId, reason });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function unbanUser(userId) {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  try {
    await db.collection('banned').doc(userId).delete();
    await logAdminAction('unban', { targetUserId: userId });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function fetchBannedUsers() {
  if (!isAdmin) return [];
  try {
    const snap = await db.collection('banned').get();
    return snap.docs.map(doc => ({ userId: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('Fetch banned users failed:', err);
    return [];
  }
}

async function displayBannedUsers() {
  const listEl = document.getElementById('bannedUsersList');
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';

  const banned = await fetchBannedUsers();
  if (banned.length === 0) { listEl.innerHTML = '<div class="loading-spinner">No banned users</div>'; return; }

  listEl.innerHTML = '';
  banned.forEach(entry => {
    const el = document.createElement('div');
    el.className = 'banned-entry';
    el.innerHTML = `
      <div>
        <div style="font-weight:600;">${entry.userId.substring(0, 8)}...</div>
        <div style="font-size:10px;color:var(--muted);">${entry.reason || 'No reason provided'}</div>
      </div>
      <button class="unban-btn" onclick="handleUnban('${entry.userId}')">UNBAN</button>
    `;
    listEl.appendChild(el);
  });
}

async function handleUnban(userId) {
  const result = await unbanUser(userId);
  showAdminMessage(result.success ? 'User unbanned' : 'Error: ' + result.error, !result.success);
  if (result.success) displayBannedUsers();
}

async function logAdminAction(action, details = {}) {
  if (!currentUser) return;
  try {
    await db.collection('activityLogs').add({
      action,
      adminId:   currentUser.uid,
      adminName: currentUser.displayName || currentUser.email,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      ...details
    });
  } catch (err) {
    console.error('Action log failed:', err);
  }
}

async function fetchAllUsers() {
  if (!isAdmin) return [];
  try {
    const snap = await db.collection('users').orderBy('highScore', 'desc').get();
    return snap.docs.map(doc => ({ userId: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('Fetch users failed:', err);
    return [];
  }
}

async function deleteLeaderboardScore(userId, username) {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  try {
    await db.collection('leaderboard').doc(userId).delete();
    await logAdminAction('delete_score', { targetUserId: userId, targetUsername: username });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteCoinsLeaderboardScore(userId, username) {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  try {
    await db.collection('coinsLeaderboard').doc(userId).delete();
    await logAdminAction('delete_coins_score', { targetUserId: userId, targetUsername: username });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteLevelLeaderboardScore(userId, username) {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  try {
    await db.collection('levelLeaderboard').doc(userId).delete();
    await logAdminAction('delete_level_score', { targetUserId: userId, targetUsername: username });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function resetUserHighScore(userId, username) {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  try {
    await db.collection('users').doc(userId).update({ highScore: 0 });
    await db.collection('leaderboard').doc(userId).delete();
    await logAdminAction('reset_high_score', { targetUserId: userId, targetUsername: username });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function fetchActivityLogs() {
  if (!isAdmin) return [];
  try {
    const snap = await db.collection('activityLogs').orderBy('timestamp', 'desc').limit(50).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('Fetch logs failed:', err);
    return [];
  }
}

async function displayAllUsers() {
  const listEl = document.getElementById('usersList');
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';

  const users = await fetchAllUsers();
  if (users.length === 0) { listEl.innerHTML = '<div class="loading-spinner">No users found</div>'; return; }

  listEl.innerHTML = '';
  users.forEach(user => {
    const el     = document.createElement('div');
    el.className = 'admin-user-entry';
    const joined = user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
    el.innerHTML = `
      <div class="admin-user-info">
        <div class="admin-user-name">${user.username || 'Unknown'}</div>
        <div class="admin-user-meta">${user.email || ''} · Joined: ${joined}</div>
        <div class="admin-user-meta">🏆 Best: ${(user.highScore || 0).toLocaleString()} · 🎮 Games: ${user.gamesPlayed || 0} · 🪙 Coins: ${user.totalCoins || 0}</div>
        <div class="admin-user-id">ID: ${user.userId}</div>
      </div>
      <div class="admin-user-actions">
        <button class="admin-action-btn ban"   onclick="quickBanUser('${user.userId}', '${(user.username||'').replace(/'/g,"\\'")}')">🚫 Ban</button>
        <button class="admin-action-btn reset" onclick="quickResetScore('${user.userId}', '${(user.username||'').replace(/'/g,"\\'")}')">🔄 Reset Score</button>
      </div>
    `;
    listEl.appendChild(el);
  });
}

async function displayScoresAdmin() {
  const listEl = document.getElementById('scoresAdminList');
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';

  const leaderboard = await fetchLeaderboard('allTime');
  if (leaderboard.length === 0) { listEl.innerHTML = '<div class="loading-spinner">No scores yet</div>'; return; }

  listEl.innerHTML = '';
  leaderboard.forEach((entry, i) => {
    const el = document.createElement('div');
    el.className = 'admin-score-entry';

    const waveTxt  = entry.wave  != null ? `Wave ${entry.wave}` : 'wave ?';
    const killsTxt = entry.kills != null ? `${entry.kills} kills` : '';
    const durTxt   = entry.gameDuration != null
      ? `${Math.floor(entry.gameDuration/60)}m${String(entry.gameDuration%60).padStart(2,'0')}s`
      : '';
    const ctx = [waveTxt, killsTxt, durTxt].filter(Boolean).join(' · ');

    el.innerHTML = `
      <div class="admin-score-rank">${i + 1}</div>
      <div class="admin-score-info">
        <div class="admin-score-name">${entry.username}</div>
        <div class="admin-score-val">${entry.score.toLocaleString()}</div>
        ${ctx ? `<div style="font-size:10px;color:#888;margin-top:2px;">${ctx}</div>` : ''}
      </div>
      <button class="admin-action-btn delete" onclick="quickDeleteScore('${entry.userId}', '${(entry.username||'').replace(/'/g,"\\'")}')">🗑️ Delete</button>
    `;
    listEl.appendChild(el);
  });
}

async function displayCoinsScoresAdmin() {
  const listEl = document.getElementById('coinsAdminList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';

  const leaderboard = await fetchLeaderboard('coins');
  if (leaderboard.length === 0) { listEl.innerHTML = '<div class="loading-spinner">No entries yet</div>'; return; }

  listEl.innerHTML = '';
  leaderboard.forEach((entry, i) => {
    const el = document.createElement('div');
    el.className = 'admin-score-entry';
    el.innerHTML = `
      <div class="admin-score-rank">${i + 1}</div>
      <div class="admin-score-info">
        <div class="admin-score-name">${entry.username}</div>
        <div class="admin-score-val">🪙 ${(entry.coins || 0).toLocaleString()}</div>
      </div>
      <button class="admin-action-btn delete" onclick="quickDeleteCoinsScore('${entry.userId}', '${(entry.username||'').replace(/'/g,"\\'")}')">🗑️ Delete</button>
    `;
    listEl.appendChild(el);
  });
}

async function displayLevelScoresAdmin() {
  const listEl = document.getElementById('levelAdminList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';

  const leaderboard = await fetchLeaderboard('level');
  if (leaderboard.length === 0) { listEl.innerHTML = '<div class="loading-spinner">No entries yet</div>'; return; }

  listEl.innerHTML = '';
  leaderboard.forEach((entry, i) => {
    const el = document.createElement('div');
    el.className = 'admin-score-entry';
    el.innerHTML = `
      <div class="admin-score-rank">${i + 1}</div>
      <div class="admin-score-info">
        <div class="admin-score-name">${entry.username}</div>
        <div class="admin-score-val">⭐ Level ${entry.level || 0} (${(entry.xp || 0).toLocaleString()} XP)</div>
      </div>
      <button class="admin-action-btn delete" onclick="quickDeleteLevelScore('${entry.userId}', '${(entry.username||'').replace(/'/g,"\\'")}')">🗑️ Delete</button>
    `;
    listEl.appendChild(el);
  });
}

async function displayActivityLogs() {
  const listEl = document.getElementById('activityLogsList');
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';

  const logs = await fetchActivityLogs();
  if (logs.length === 0) { listEl.innerHTML = '<div class="loading-spinner">No activity yet</div>'; return; }

  const labels = {
    ban: '🚫 Banned user',
    unban: '✅ Unbanned user',
    delete_score: '🗑️ Deleted score',
    reset_high_score: '🔄 Reset high score'
  };

  listEl.innerHTML = '';
  logs.forEach(log => {
    const el     = document.createElement('div');
    el.className = 'admin-log-entry';
    const time   = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString() : 'N/A';
    const label  = labels[log.action] || log.action;
    const target = log.targetUsername
      ? ` → <strong>${log.targetUsername}</strong>`
      : log.targetUserId ? ` → ${log.targetUserId.substring(0, 8)}...` : '';
    el.innerHTML = `
      <div class="admin-log-action">${label}${target}</div>
      <div class="admin-log-meta">by ${log.adminName} · ${time}</div>
    `;
    listEl.appendChild(el);
  });
}

// ── Admin Skins Management ──

function adminInitSkinGiveDropdown() {
  const select = document.getElementById('skinGiveSelect');
  if (!select || typeof SKINS === 'undefined') return;
  if (select.options.length > 1) return;
  select.innerHTML = '<option value="">-- Select skin --</option>';
  for (const skin of SKINS) {
    const opt = document.createElement('option');
    opt.value = skin.id;
    opt.textContent = `${skin.name} (${skin.id})`;
    select.appendChild(opt);
  }
}

async function adminLookupUserSkins() {
  if (!isAdmin) return;
  const userId = document.getElementById('skinLookupUserId')?.value.trim();
  const resultEl = document.getElementById('skinLookupResult');
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  resultEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) { resultEl.innerHTML = '<div style="color:#ff6b7a;padding:12px;">User not found.</div>'; return; }
    const data = userDoc.data();
    const owned = data.ownedSkins || ['agent'];
    const active = data.activeSkin || 'agent';
    const username = data.username || data.email || userId;
    let html = `<div style="padding:8px 0;color:var(--muted);font-size:11px;border-bottom:1px solid rgba(255,255,255,0.05);margin-bottom:6px;">
      <strong style="color:#fff;">${username}</strong> — ${owned.length} skin${owned.length !== 1 ? 's' : ''} owned, active: <strong style="color:#6bff7b;">${active}</strong>
    </div>`;
    for (const skinId of owned) {
      const skinInfo = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === skinId) : null;
      const name = skinInfo ? skinInfo.name : skinId;
      const isActive = skinId === active;
      html += `<div style="padding:4px 0;font-size:12px;display:flex;justify-content:space-between;align-items:center;">
        <span>${isActive ? '⚡ ' : ''}${name} <span style="color:var(--muted);font-size:10px;">(${skinId})</span></span>
        ${skinId === 'agent' ? '<span style="color:var(--muted);font-size:10px;">default</span>' : ''}
      </div>`;
    }
    resultEl.innerHTML = html;
  } catch (err) {
    resultEl.innerHTML = `<div style="color:#ff6b7a;padding:12px;">Error: ${err.message}</div>`;
  }
}

async function adminGiveSkin() {
  if (!isAdmin) return;
  const userId = document.getElementById('skinGiveUserId')?.value.trim();
  const skinId = document.getElementById('skinGiveSelect')?.value;
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  if (!skinId) { showAdminMessage('Select a skin', true); return; }
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) { showAdminMessage('User not found', true); return; }
    const owned = userDoc.data().ownedSkins || [];
    if (owned.includes(skinId)) { showAdminMessage('User already owns this skin', true); return; }
    await userRef.update({ ownedSkins: [...owned, skinId] });
    const skinInfo = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === skinId) : null;
    const skinName = skinInfo ? skinInfo.name : skinId;
    const username = userDoc.data().username || userId.substring(0, 12) + '...';
    showAdminMessage(`Gave "${skinName}" to ${username}`);
    logAdminAction('give_skin', { targetUserId: userId, targetUsername: username, skinId, skinName });
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminRemoveSkin() {
  if (!isAdmin) return;
  const userId = document.getElementById('skinRemoveUserId')?.value.trim();
  const skinId = document.getElementById('skinRemoveSelect')?.value;
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  if (!skinId) { showAdminMessage('Load the user\'s skins and select one', true); return; }
  if (skinId === 'agent') { showAdminMessage('Cannot remove the default Agent skin', true); return; }
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) { showAdminMessage('User not found', true); return; }
    const data = userDoc.data();
    const owned = data.ownedSkins || [];
    if (!owned.includes(skinId)) { showAdminMessage('User does not own this skin', true); return; }
    const updated = owned.filter(s => s !== skinId);
    const updateData = { ownedSkins: updated };
    // if they have this skin equipped, reset to agent
    if (data.activeSkin === skinId) updateData.activeSkin = 'agent';
    await userRef.update(updateData);
    const skinInfo = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === skinId) : null;
    const skinName = skinInfo ? skinInfo.name : skinId;
    const username = data.username || userId.substring(0, 12) + '...';
    showAdminMessage(`Removed "${skinName}" from ${username}`);
    logAdminAction('remove_skin', { targetUserId: userId, targetUsername: username, skinId, skinName });
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminLoadUserSkinsForRemoval() {
  if (!isAdmin) return;
  const userId = document.getElementById('skinRemoveUserId')?.value.trim();
  const selectEl = document.getElementById('skinRemoveSelect');
  if (!userId) { showAdminMessage('Enter a User ID first', true); return; }
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) { showAdminMessage('User not found', true); return; }
    const owned = userDoc.data().ownedSkins || [];
    selectEl.innerHTML = '<option value="">-- Select skin to remove --</option>';
    for (const skinId of owned) {
      if (skinId === 'agent') continue;
      const skinInfo = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === skinId) : null;
      const opt = document.createElement('option');
      opt.value = skinId;
      opt.textContent = skinInfo ? `${skinInfo.name} (${skinId})` : skinId;
      selectEl.appendChild(opt);
    }
    const count = owned.length - 1;
    showAdminMessage(`Loaded ${count} removable skin${count !== 1 ? 's' : ''}`);
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

function showAdminMessage(message, isError = false) {
  const el = document.getElementById('adminMessage');
  el.textContent = message;
  el.classList.remove('hidden');
  el.style.background   = isError ? 'rgba(255,71,87,0.15)'  : 'rgba(107,255,123,0.15)';
  el.style.borderColor  = isError ? 'rgba(255,71,87,0.4)'   : 'rgba(107,255,123,0.4)';
  el.style.color        = isError ? '#ff6b7a'                : '#6bff7b';
  setTimeout(() => el.classList.add('hidden'), 3000);
}

async function displayPlatformStats() {
  if (!isAdmin) return;

  const fields = ['totalUsers', 'activeToday', 'totalGames', 'avgScore'];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '…'; });

  try {
    const snap = await db.collection('users').get();
    let total = 0, gamesPlayed = 0, scoreSum = 0, activeCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    snap.forEach(doc => {
      const d = doc.data();
      total++;
      gamesPlayed += d.gamesPlayed || 0;
      scoreSum    += d.highScore   || 0;
      if (d.lastSeen?.seconds && new Date(d.lastSeen.seconds * 1000) >= today) activeCount++;
    });

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val.toLocaleString(); };
    set('totalUsers',  total);
    set('activeToday', activeCount);
    set('totalGames',  gamesPlayed);
    set('avgScore',    total > 0 ? Math.round(scoreSum / total) : 0);

    const topEl = document.getElementById('topPlayersList');
    if (topEl) {
      const topSnap = await db.collection('leaderboard').orderBy('score', 'desc').limit(10).get();
      if (topSnap.empty) {
        topEl.innerHTML = '<div class="loading-spinner">No scores yet</div>';
      } else {
        topEl.innerHTML = '';
        let rank = 1;
        topSnap.forEach(doc => {
          const d = doc.data();
          const row = document.createElement('div');
          row.className = 'admin-score-entry';
          row.innerHTML = `
            <div class="admin-score-rank">${rank++}</div>
            <div class="admin-score-info">
              <div class="admin-score-name">${d.username || 'Unknown'}</div>
              <div class="admin-score-val">🏆 ${(d.score || 0).toLocaleString()}</div>
            </div>`;
          topEl.appendChild(row);
        });
      }
    }
  } catch (err) {
    console.error('Platform stats failed:', err);
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = 'ERR'; });
  }
}

async function quickBanUser(userId, username) {
  if (!confirm(`Ban ${username}?`)) return;
  const r = await banUser(userId, 'Banned via user list');
  showAdminMessage(r.success ? `${username} banned` : 'Error: ' + r.error, !r.success);
  if (r.success) { displayAllUsers(); displayActivityLogs(); }
}

async function quickResetScore(userId, username) {
  if (!confirm(`Reset high score for ${username}?`)) return;
  const r = await resetUserHighScore(userId, username);
  showAdminMessage(r.success ? `${username}'s score reset` : 'Error: ' + r.error, !r.success);
  if (r.success) { displayAllUsers(); displayScoresAdmin(); displayActivityLogs(); }
}

async function quickDeleteScore(userId, username) {
  if (!confirm(`Delete leaderboard score for ${username}?`)) return;
  const r = await deleteLeaderboardScore(userId, username);
  showAdminMessage(r.success ? 'Score deleted' : 'Error: ' + r.error, !r.success);
  if (r.success) { displayScoresAdmin(); displayActivityLogs(); }
}

async function quickDeleteCoinsScore(userId, username) {
  if (!confirm(`Delete coins entry for ${username}?`)) return;
  const r = await deleteCoinsLeaderboardScore(userId, username);
  showAdminMessage(r.success ? 'Coins entry deleted' : 'Error: ' + r.error, !r.success);
  if (r.success) { displayCoinsScoresAdmin(); displayActivityLogs(); }
}

async function quickDeleteLevelScore(userId, username) {
  if (!confirm(`Delete level entry for ${username}?`)) return;
  const r = await deleteLevelLeaderboardScore(userId, username);
  showAdminMessage(r.success ? 'Level entry deleted' : 'Error: ' + r.error, !r.success);
  if (r.success) { displayLevelScoresAdmin(); displayActivityLogs(); }
}

async function removeFlaggedScore(flagId) {
  if (!isAdmin) return;
  try {
    await db.collection('flaggedScores').doc(flagId).delete();
    showAdminMessage('Flag cleared');
    displayFlaggedScores();
  } catch (err) {
    showAdminMessage('Error: ' + err.message, true);
  }
}
// ════════════════════════════════════════════════════════════
//  ADMIN — TRADE RESTRICTION CONTROLS
//  Block or unblock specific skins from being traded on the
//  marketplace. Writes to Firestore 'tradeRestrictions' collection.
//  marketplace.js reads this on listing creation.
// ════════════════════════════════════════════════════════════

async function adminLoadTradeRestrictions() {
  if (!isAdmin) return;
  const listEl = document.getElementById('tradeRestrictList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  try {
    const snap = await db.collection('tradeRestrictions').get();
    if (snap.empty) {
      listEl.innerHTML = '<div class="loading-spinner">No additional restrictions set.</div>';
      return;
    }
    listEl.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const el = document.createElement('div');
      el.className = 'admin-log-entry';
      el.innerHTML = `
        <div class="admin-log-action" style="font-family:monospace;font-size:11px;">
          ${doc.id}
          <span style="color:var(--danger);margin-left:6px;">⛔ BLOCKED</span>
        </div>
        <div class="admin-log-meta">Reason: ${d.reason || 'No reason given'} · by ${d.addedBy || '?'}</div>
        <button class="admin-action-btn success" onclick="adminUnblockSkinTrade('${doc.id}')"
                style="margin-top:4px;padding:4px 10px;font-size:10px;">✅ UNBLOCK</button>
      `;
      listEl.appendChild(el);
    });
  } catch (err) {
    listEl.innerHTML = '<div style="color:var(--danger);padding:8px;">Error: ' + err.message + '</div>';
  }
}

async function adminBlockSkinTrade() {
  if (!isAdmin) return;
  const skinId = document.getElementById('tradeRestrictSkinId')?.value.trim();
  const reason = document.getElementById('tradeRestrictReason')?.value.trim();
  if (!skinId) { showAdminMessage('Enter a Skin ID', true); return; }
  try {
    await db.collection('tradeRestrictions').doc(skinId).set({
      reason:    reason || 'Restricted by admin',
      addedBy:   currentUser.displayName || currentUser.email,
      addedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    });
    showAdminMessage(`Skin "${skinId}" blocked from trading.`);
    logAdminAction('block_skin_trade', { skinId, reason });
    adminLoadTradeRestrictions();
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminUnblockSkinTrade(skinId) {
  if (!isAdmin) return;
  if (!skinId) {
    skinId = document.getElementById('tradeUnrestrictSkinId')?.value.trim();
    if (!skinId) { showAdminMessage('Enter a Skin ID', true); return; }
  }
  if (!confirm(`Unblock trading for skin "${skinId}"?`)) return;
  try {
    await db.collection('tradeRestrictions').doc(skinId).delete();
    showAdminMessage(`Trade restriction removed for "${skinId}".`);
    logAdminAction('unblock_skin_trade', { skinId });
    adminLoadTradeRestrictions();
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

// ════════════════════════════════════════════════════════════
//  ADMIN — SKIN PRICE EDITOR
//  Updates price in Firestore 'skinPriceOverrides' collection.
//  NOTE: This edits the live display price only. SKINS array in
//  game.js is the authoritative source; to persist permanently,
//  deploy updated game.js. This is for emergency price adjustments.
// ════════════════════════════════════════════════════════════

async function adminInitSkinPriceDropdown() {
  const select = document.getElementById('skinPriceEditSelect');
  if (!select || select.options.length > 1 || typeof SKINS === 'undefined') return;
  select.innerHTML = '<option value="">-- Select a shop skin --</option>';
  for (const skin of SKINS) {
    if (skin.price <= 0) continue; // skip free/crate/bp skins
    const opt = document.createElement('option');
    opt.value = skin.id;
    opt.textContent = `${skin.name} — 🪙 ${skin.price}`;
    select.appendChild(opt);
  }
}

function adminSkinPriceSelectChange() {
  const skinId   = document.getElementById('skinPriceEditSelect')?.value;
  const input    = document.getElementById('skinPriceEditValue');
  const previewEl = document.getElementById('skinPriceCurrentVal');
  if (!skinId || typeof SKINS === 'undefined') return;
  const skin = SKINS.find(s => s.id === skinId);
  if (!skin) return;
  if (input)     input.value = skin.price;
  if (previewEl) previewEl.textContent = `Current price: 🪙 ${skin.price}`;
}

async function adminSaveSkinPrice() {
  if (!isAdmin) return;
  const skinId   = document.getElementById('skinPriceEditSelect')?.value;
  const newPrice = parseInt(document.getElementById('skinPriceEditValue')?.value) || 0;
  if (!skinId) { showAdminMessage('Select a skin', true); return; }
  if (newPrice < 50 || newPrice > 100000) { showAdminMessage('Price must be 50–100,000', true); return; }

  const skin = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === skinId) : null;
  if (!skin) { showAdminMessage('Skin not found in SKINS array', true); return; }

  const oldPrice = skin.price;

  try {
    // Store override in Firestore for reference / audit
    await db.collection('skinPriceOverrides').doc(skinId).set({
      skinId,
      skinName:   skin.name,
      oldPrice,
      newPrice,
      changedBy:  currentUser.displayName || currentUser.email,
      changedAt:  firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Update in-memory SKINS array so the shop immediately reflects the change
    // without a page reload — useful for emergency adjustments mid-session.
    skin.price = newPrice;
    showAdminMessage(`Price updated: "${skin.name}" 🪙 ${oldPrice} → 🪙 ${newPrice}`);
    logAdminAction('edit_skin_price', { skinId, skinName: skin.name, oldPrice, newPrice });

    if (typeof initShopUI === 'function') initShopUI();

    // Update dropdown to reflect new price
    const opt = document.querySelector(`#skinPriceEditSelect option[value="${skinId}"]`);
    if (opt) opt.textContent = `${skin.name} — 🪙 ${newPrice}`;
    const previewEl = document.getElementById('skinPriceCurrentVal');
    if (previewEl) previewEl.textContent = `Current price: 🪙 ${newPrice}`;

  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

// ════════════════════════════════════════════════════════════
//  ADMIN — CRATE PRICE EDITOR
//  Adjusts crate prices in the live CRATES array and logs to Firestore.
// ════════════════════════════════════════════════════════════

function adminInitCratePriceDropdown() {
  const select = document.getElementById('cratePriceEditSelect');
  if (!select || select.options.length > 1 || typeof CRATES === 'undefined') return;
  select.innerHTML = '<option value="">-- Select a crate --</option>';
  for (const crate of CRATES) {
    const opt = document.createElement('option');
    opt.value = crate.id;
    opt.textContent = `${crate.name} — 🪙 ${crate.price}`;
    select.appendChild(opt);
  }
}

function adminCratePriceSelectChange() {
  const crateId   = document.getElementById('cratePriceEditSelect')?.value;
  const input     = document.getElementById('cratePriceEditValue');
  const previewEl = document.getElementById('cratePriceCurrentVal');
  if (!crateId || typeof CRATES === 'undefined') return;
  const crate = CRATES.find(c => c.id === crateId);
  if (!crate) return;
  if (input)     input.value = crate.price;
  if (previewEl) previewEl.textContent = `Current price: 🪙 ${crate.price}`;
}

async function adminSaveCratePrice() {
  if (!isAdmin) return;
  const crateId  = document.getElementById('cratePriceEditSelect')?.value;
  const newPrice = parseInt(document.getElementById('cratePriceEditValue')?.value) || 0;
  if (!crateId) { showAdminMessage('Select a crate', true); return; }
  if (newPrice < 100 || newPrice > 100000) { showAdminMessage('Price must be 100–100,000', true); return; }

  const crate = typeof CRATES !== 'undefined' ? CRATES.find(c => c.id === crateId) : null;
  if (!crate) { showAdminMessage('Crate not found', true); return; }

  const oldPrice = crate.price;

  try {
    await db.collection('cratePriceOverrides').doc(crateId).set({
      crateId,
      crateName:  crate.name,
      oldPrice,
      newPrice,
      changedBy:  currentUser.displayName || currentUser.email,
      changedAt:  firebase.firestore.FieldValue.serverTimestamp(),
    });

    crate.price = newPrice;
    showAdminMessage(`Price updated: "${crate.name}" 🪙 ${oldPrice} → 🪙 ${newPrice}`);
    logAdminAction('edit_crate_price', { crateId, crateName: crate.name, oldPrice, newPrice });

    if (typeof initCratesTab === 'function') initCratesTab();

    const opt = document.querySelector(`#cratePriceEditSelect option[value="${crateId}"]`);
    if (opt) opt.textContent = `${crate.name} — 🪙 ${newPrice}`;
    const previewEl = document.getElementById('cratePriceCurrentVal');
    if (previewEl) previewEl.textContent = `Current price: 🪙 ${newPrice}`;

  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}