const API_BASE = 'https://web-production-144da.up.railway.app/api';
const TOKEN_KEY = 'topdown_token';

let currentUser = null;
let isGuest     = false;
let isAdmin     = false;

// save throttling
let pendingSave   = false;
let saveTimeout   = null;
let lastSaveTime  = 0;
let forceNextSave = false;

const SAVE_CONFIG = {
  MIN_INTERVAL: 30000,
  BATCH_DELAY:  5000,
  MAX_WAIT:     120000,
};

let lastSubmittedData = { highScore: 0, coins: 0, xp: 0, level: 0 };

function getToken()          { return localStorage.getItem(TOKEN_KEY); }
function setToken(token)     { localStorage.setItem(TOKEN_KEY, token); }
function clearToken()        { localStorage.removeItem(TOKEN_KEY); }

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
  });
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  return res.json();
}

const BP_KEY = 'topdown_battlepass';

function saveBattlePassLocally() {
  if (typeof battlePassData === 'undefined' || !currentUser) return;
  try {
    const stored = JSON.parse(localStorage.getItem(BP_KEY) || '{}');
    stored[currentUser.uid] = battlePassData;
    localStorage.setItem(BP_KEY, JSON.stringify(stored));
  } catch (e) { /* ignore */ }
}

function loadBattlePassLocally(uid) {
  try {
    const stored = JSON.parse(localStorage.getItem(BP_KEY) || '{}');
    return stored[uid] || null;
  } catch (e) { return null; }
}

async function handleLogin(email, password) {
  try {
    const data = await apiPost('/auth/login', { email, password });
    if (data.error) return { success: false, error: data.error };

    setToken(data.token);
    _applyUserData(data);
    updateUIForLoggedInUser();
    await _postLoginSetup();
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Connection failed. Check your internet.' };
  }
}

async function handleSignup(email, password, username) {
  if (typeof validateUsername === 'function') {
    const check = validateUsername(username);
    if (!check.ok) return { success: false, error: check.reason };
  }
  try {
    const data = await apiPost('/auth/signup', { email, password, username });
    if (data.error) return { success: false, error: data.error };

    setToken(data.token);
    _applyUserData(data);
    updateUIForLoggedInUser();
    await _postLoginSetup();
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Connection failed. Check your internet.' };
  }
}

async function handleLogout() {
  try {
    await executeSave();
    saveBattlePassLocally();
  } catch (e) { /* ignore save errors on logout */ }
  clearToken();
  currentUser = null;
  isGuest     = false;
  isAdmin     = false;
  if (typeof resetMarketplaceState === 'function') resetMarketplaceState();
  return { success: true };
}

function _applyUserData(data) {
  // Build a currentUser object that matches Firebase's shape
  currentUser = {
    uid:         data.uid,
    username:    data.username,
    displayName: data.username,   // firebase-ui.js uses displayName
    email:       data.email || '',
  };
  isAdmin = data.isAdmin || false;

  // Core game state
  high        = data.highScore  || 0;
  playerCoins = data.totalCoins || 0;
  ownedSkins  = data.ownedSkins || ['agent'];
  activeSkin  = data.activeSkin || 'agent';

  // Marketplace state
  if (typeof marketplaceState !== 'undefined') {
    marketplaceState.skinReceivedTimes = data.skinReceivedTimes || {};
    marketplaceState.accountCreatedAt  = data.createdAt || null;
  }

  // Battle pass — try localStorage first, then fresh defaults
  if (typeof battlePassData !== 'undefined') {
    const saved = loadBattlePassLocally(data.uid);
    if (saved) {
      Object.assign(battlePassData, saved);
    }
    // XP/level from server takes priority
    if (data.currentXp != null) battlePassData.currentXP = data.currentXp;
  }

  lastSubmittedData.highScore = high;
  lastSubmittedData.coins     = playerCoins;
  if (typeof battlePassData !== 'undefined') {
    lastSubmittedData.xp    = battlePassData.currentXP || 0;
    lastSubmittedData.level = typeof calculateTrueLevel === 'function'
      ? calculateTrueLevel(battlePassData.currentXP || 0) : 0;
  }

  // Update home screen displays
  const highEl  = document.getElementById('homeHighVal');
  const coinEl  = document.getElementById('homeCoinsVal');
  if (highEl) highEl.textContent  = high.toLocaleString();
  if (coinEl) coinEl.textContent  = playerCoins.toLocaleString();
}

async function _postLoginSetup() {
  if (typeof updateSkinsDisplay       === 'function') updateSkinsDisplay();
  if (typeof updateBattlePassProgress === 'function') updateBattlePassProgress();
  if (typeof updateXPDisplay          === 'function') updateXPDisplay();

  setTimeout(checkForNewAnnouncements, 1000);

  // Grant champion skins to admins so they can preview them
  if (isAdmin) {
    const champs  = ['gold-champion', 'silver-champion', 'bronze-champion'];
    const missing = champs.filter(s => !ownedSkins.includes(s));
    if (missing.length) {
      missing.forEach(s => ownedSkins.push(s));
      await saveUserDataToFirebase('critical');
    }
  }
}

window.addEventListener('load', async () => {
  if (typeof resetMarketplaceState === 'function') resetMarketplaceState();

  const token = getToken();
  if (!token) {
    setTimeout(() => { if (!currentUser && !isGuest) { const m = document.getElementById('authModal'); if(m) m.classList.remove('hidden'); } }, 500);
    return;
  }

  try {
    const data = await apiGet('/auth/me');
    if (data.error) {
      // Token expired or invalid
      clearToken();
      setTimeout(() => showAuthModal(), 300);
      return;
    }
    // Re-attach token fields missing from /me response
    data.skinReceivedTimes = data.skinReceivedTimes || {};
    _applyUserData(data);
    updateUIForLoggedInUser();
    await _postLoginSetup();
  } catch (err) {
    console.warn('[Auth] Auto-login failed:', err.message);
    setTimeout(() => showAuthModal(), 300);
  }
});

window.addEventListener('beforeunload', () => {
  if (currentUser && !isGuest) {
    executeSave();
    saveBattlePassLocally();
  }
});

function scheduleSave(priority = 'normal') {
  if (!currentUser || isGuest) return;

  if (priority === 'critical') {
    forceNextSave = true;
    clearTimeout(saveTimeout);
    executeSave();
    return;
  }

  clearTimeout(saveTimeout);
  const timeSince = Date.now() - lastSaveTime;
  const delay = timeSince >= SAVE_CONFIG.MIN_INTERVAL
    ? SAVE_CONFIG.BATCH_DELAY
    : SAVE_CONFIG.MIN_INTERVAL - timeSince + SAVE_CONFIG.BATCH_DELAY;

  saveTimeout = setTimeout(executeSave, delay);

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
    const currentXp = typeof battlePassData !== 'undefined'
      ? (battlePassData.currentXP || 0) : 0;

    const hasChanges =
      high        !== lastSubmittedData.highScore ||
      playerCoins !== lastSubmittedData.coins     ||
      currentXp   !== lastSubmittedData.xp;

    if (!hasChanges && !forceNextSave) {
      pendingSave = false;
      return;
    }

    // Coin sanity clamp
    const MAX_COINS_PER_SAVE = 300000;
    if (playerCoins - lastSubmittedData.coins > MAX_COINS_PER_SAVE) {
      console.warn('[Save] Coin increase clamped');
      playerCoins = lastSubmittedData.coins + MAX_COINS_PER_SAVE;
    }

    const result = await apiPost('/auth/progress', {
      highScore:  high,
      totalCoins: playerCoins,
      currentXp,
    });

    if (!result.error) {
      lastSubmittedData.highScore = high;
      lastSubmittedData.coins     = playerCoins;
      lastSubmittedData.xp        = currentXp;
      if (typeof calculateTrueLevel === 'function') {
        lastSubmittedData.level = calculateTrueLevel(currentXp);
      }
    }

    // Battle pass always saved to localStorage
    saveBattlePassLocally();
    forceNextSave = false;
  } catch (err) {
    console.error('[Save] Failed:', err.message);
  } finally {
    pendingSave = false;
  }
}

async function saveUserDataToFirebase(priority = 'normal') {
  scheduleSave(priority);
}

async function submitScoreToLeaderboard(score) {
  
}

async function submitCoinsToLeaderboard(coins) {
  
}

async function submitLevelToLeaderboard(xp, level) {
  
}

async function fetchLeaderboard(type = 'allTime') {
  try {
    if (type === 'coins') {
      const rows = await apiGet('/leaderboard/coins?limit=100');
      return rows.map(r => ({
        userId:   r.uid,
        username: r.username,
        coins:    r.total_coins,
      }));
    } else if (type === 'level') {
      const rows = await apiGet('/leaderboard/levels?limit=100');
      return rows.map(r => ({
        userId:   r.uid,
        username: r.username,
        xp:       r.current_xp,
        level:    typeof calculateTrueLevel === 'function'
          ? calculateTrueLevel(r.current_xp) : 0,
      }));
    } else {
      
      const rows = await apiGet('/leaderboard/scores?limit=100');
      return rows.map(r => ({
        userId:   r.uid,
        username: r.username,
        score:    r.high_score,
      }));
    }
  } catch (err) {
    console.error('[Leaderboard] fetch failed:', err);
    return [];
  }
}

async function displayLeaderboard(filter = 'allTime') {
  const leaderboard = await fetchLeaderboard(filter);
  const listEl = document.getElementById('leaderboardList');
  if (!listEl) return;

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
      ? `${(entry.coins || 0).toLocaleString()} 🪙`
      : filter === 'level'
      ? `Level ${entry.level || 0} (${(entry.xp || 0).toLocaleString()} XP)`
      : (entry.score || 0).toLocaleString();

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
    const lb   = await fetchLeaderboard('allTime');
    const rank = lb.findIndex(e => e.userId === currentUser.uid) + 1;
    if (!rank) return;

    const skinMap = { 1: 'gold-champion', 2: 'silver-champion', 3: 'bronze-champion' };
    const earned  = skinMap[rank];

    if (rank <= 3 && earned && !ownedSkins.includes(earned)) {
      ownedSkins.push(earned);
      await saveUserDataToFirebase('critical');
      if (typeof updateSkinsDisplay === 'function') updateSkinsDisplay();
    }

    if (rank > 3) {
      const champs  = ['gold-champion', 'silver-champion', 'bronze-champion'];
      let changed   = false;
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
    console.error('[Champion] update failed:', err);
  }
}

// loadUserDataFromFirebase — alias kept for any direct calls in game.js
async function loadUserDataFromFirebase(userId) {
  // Data is already loaded at login; this is a no-op
  // unless called explicitly to refresh
  try {
    const data = await apiGet('/auth/me');
    if (!data.error) _applyUserData(data);
  } catch (e) { /* ignore */ }
}

// updateLeaderboardsIfNeeded — kept for compatibility
async function updateLeaderboardsIfNeeded() {
 
}


async function banUser(userId, reason = '') {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  try {
    const data = await apiPost('/users/admin/ban', { targetUid: userId, reason });
    if (data.error) return { success: false, error: data.error };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function unbanUser(userId) {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  try {
    const data = await apiPost('/users/admin/unban', { targetUid: userId });
    if (data.error) return { success: false, error: data.error };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function fetchBannedUsers() {
  if (!isAdmin) return [];
  try {
    const users = await apiGet('/users/admin/list');
    return (users || [])
      .filter(u => u.is_banned)
      .map(u => ({
        userId: u.uid,
        reason: u.ban_reason || '',
        username: u.username,
      }));
  } catch (err) {
    console.error('Fetch banned users failed:', err);
    return [];
  }
}

async function displayBannedUsers() {
  const listEl = document.getElementById('bannedUsersList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  const banned = await fetchBannedUsers();
  if (banned.length === 0) {
    listEl.innerHTML = '<div class="loading-spinner">No banned users</div>';
    return;
  }
  listEl.innerHTML = '';
  banned.forEach(entry => {
    const el = document.createElement('div');
    el.className = 'banned-entry';
    el.innerHTML = `
      <div>
        <div style="font-weight:600;">${entry.username || entry.userId.substring(0, 8) + '...'}</div>
        <div style="font-size:10px;color:var(--muted);">${entry.reason || 'No reason provided'}</div>
        <div style="font-size:10px;color:var(--muted);">ID: ${entry.userId}</div>
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
  // Activity logs are written server-side automatically by Railway
  // on ban/unban/grant actions — nothing to do here
}

async function fetchAllUsers() {
  if (!isAdmin) return [];
  try {
    const users = await apiGet('/users/admin/list');
    return (users || []).map(u => ({
      userId:     u.uid,
      username:   u.username,
      email:      u.email,
      highScore:  u.high_score,
      totalCoins: u.total_coins,
      currentXp:  u.current_xp,
      is_banned:  u.is_banned,
      createdAt:  u.created_at,
      gamesPlayed: 0, // Railway doesn't track this yet
    }));
  } catch (err) {
    console.error('Fetch users failed:', err);
    return [];
  }
}

async function displayAllUsers() {
  const listEl = document.getElementById('usersList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  const users = await fetchAllUsers();
  if (users.length === 0) {
    listEl.innerHTML = '<div class="loading-spinner">No users found</div>';
    return;
  }
  listEl.innerHTML = '';
  users.forEach(user => {
    const el = document.createElement('div');
    el.className = 'admin-user-entry';
    const joined = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
    el.innerHTML = `
      <div class="admin-user-info">
        <div class="admin-user-name">${user.username || 'Unknown'}${user.is_banned ? ' <span style="color:#ff6b7a;font-size:10px;">BANNED</span>' : ''}</div>
        <div class="admin-user-meta">${user.email || ''} · Joined: ${joined}</div>
        <div class="admin-user-meta">🏆 Best: ${(user.highScore||0).toLocaleString()} · 🪙 Coins: ${(user.totalCoins||0).toLocaleString()}</div>
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

async function resetUserHighScore(userId, username) {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  try {
    const data = await apiPost('/users/admin/reset-score', { targetUid: userId });
    if (data.error) return { success: false, error: data.error };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteLeaderboardScore(userId, username) {
  return resetUserHighScore(userId, username);
}

async function deleteCoinsLeaderboardScore(userId, username) {
  // Railway doesn't have a separate coins leaderboard to delete from
  return { success: true };
}

async function deleteLevelLeaderboardScore(userId, username) {
  // Railway doesn't have a separate level leaderboard to delete from
  return { success: true };
}

async function fetchActivityLogs() {
  if (!isAdmin) return [];
  try {
    const logs = await apiGet('/users/admin/logs');
    return (logs || []).map(l => ({
      id:             l.id,
      action:         l.action?.toLowerCase().replace('_', ' ') || l.action,
      adminId:        l.admin_id,
      adminName:      l.admin_name,
      targetUserId:   l.target_uid,
      targetUsername: l.target_uid,
      details:        l.details,
      timestamp:      { seconds: Math.floor(new Date(l.created_at).getTime() / 1000) },
    }));
  } catch (err) {
    console.error('Fetch logs failed:', err);
    return [];
  }
}

async function displayActivityLogs() {
  const listEl = document.getElementById('activityLogsList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  const logs = await fetchActivityLogs();
  if (logs.length === 0) {
    listEl.innerHTML = '<div class="loading-spinner">No activity yet</div>';
    return;
  }
  const labels = {
    ban: '🚫 Banned user', 'ban_user': '🚫 Banned user',
    unban: '✅ Unbanned user', 'unban_user': '✅ Unbanned user',
    'reset_score': '🔄 Reset high score',
    'grant_skin': '🎁 Granted skin',
    'grant_coins': '🪙 Granted coins',
  };
  listEl.innerHTML = '';
  logs.forEach(log => {
    const el = document.createElement('div');
    el.className = 'admin-log-entry';
    const time  = log.timestamp?.seconds
      ? new Date(log.timestamp.seconds * 1000).toLocaleString() : 'N/A';
    const key   = log.action?.toLowerCase();
    const label = labels[key] || log.action || 'Unknown action';
    const target = log.targetUsername ? ` → <strong>${log.targetUsername}</strong>` : '';
    const detail = log.details ? ` <span style="color:var(--muted);font-size:10px;">(${log.details})</span>` : '';
    el.innerHTML = `
      <div class="admin-log-action">${label}${target}${detail}</div>
      <div class="admin-log-meta">by ${log.adminName} · ${time}</div>
    `;
    listEl.appendChild(el);
  });
}

async function displayScoresAdmin() {
  const listEl = document.getElementById('scoresAdminList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  const lb = await fetchLeaderboard('allTime');
  if (lb.length === 0) {
    listEl.innerHTML = '<div class="loading-spinner">No scores yet</div>';
    return;
  }
  listEl.innerHTML = '';
  lb.forEach((entry, i) => {
    const el = document.createElement('div');
    el.className = 'admin-score-entry';
    el.innerHTML = `
      <div class="admin-score-rank">${i + 1}</div>
      <div class="admin-score-info">
        <div class="admin-score-name">${entry.username}</div>
        <div class="admin-score-val">${(entry.score||0).toLocaleString()}</div>
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
  const lb = await fetchLeaderboard('coins');
  if (lb.length === 0) {
    listEl.innerHTML = '<div class="loading-spinner">No entries yet</div>';
    return;
  }
  listEl.innerHTML = '';
  lb.forEach((entry, i) => {
    const el = document.createElement('div');
    el.className = 'admin-score-entry';
    el.innerHTML = `
      <div class="admin-score-rank">${i + 1}</div>
      <div class="admin-score-info">
        <div class="admin-score-name">${entry.username}</div>
        <div class="admin-score-val">🪙 ${(entry.coins||0).toLocaleString()}</div>
      </div>
    `;
    listEl.appendChild(el);
  });
}

async function displayLevelScoresAdmin() {
  const listEl = document.getElementById('levelAdminList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  const lb = await fetchLeaderboard('level');
  if (lb.length === 0) {
    listEl.innerHTML = '<div class="loading-spinner">No entries yet</div>';
    return;
  }
  listEl.innerHTML = '';
  lb.forEach((entry, i) => {
    const el = document.createElement('div');
    el.className = 'admin-score-entry';
    el.innerHTML = `
      <div class="admin-score-rank">${i + 1}</div>
      <div class="admin-score-info">
        <div class="admin-score-name">${entry.username}</div>
        <div class="admin-score-val">⭐ Level ${entry.level||0} (${(entry.xp||0).toLocaleString()} XP)</div>
      </div>
    `;
    listEl.appendChild(el);
  });
}

async function displayPlatformStats() {
  if (!isAdmin) return;
  const fields = ['totalUsers', 'activeToday', 'totalGames', 'avgScore'];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '…'; });
  try {
    const users = await apiGet('/users/admin/list');
    const total = users?.length || 0;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val.toLocaleString(); };
    set('totalUsers',  total);
    set('activeToday', '—');   // Railway doesn't track lastSeen yet
    set('totalGames',  '—');   // Railway doesn't track gamesPlayed yet
    set('avgScore', total > 0
      ? Math.round(users.reduce((s, u) => s + (u.high_score || 0), 0) / total)
      : 0);

    const topEl = document.getElementById('topPlayersList');
    if (topEl) {
      const lb = await fetchLeaderboard('allTime');
      topEl.innerHTML = '';
      lb.slice(0, 10).forEach((entry, i) => {
        const row = document.createElement('div');
        row.className = 'admin-score-entry';
        row.innerHTML = `
          <div class="admin-score-rank">${i + 1}</div>
          <div class="admin-score-info">
            <div class="admin-score-name">${entry.username || 'Unknown'}</div>
            <div class="admin-score-val">🏆 ${(entry.score||0).toLocaleString()}</div>
          </div>`;
        topEl.appendChild(row);
      });
    }
  } catch (err) {
    console.error('Platform stats failed:', err);
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = 'ERR'; });
  }
}

// Admin Skins Management

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
  const userId  = document.getElementById('skinLookupUserId')?.value.trim();
  const resultEl = document.getElementById('skinLookupResult');
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  resultEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  try {
    const data = await apiGet(`/users/${userId}/profile`);
    if (data.error) { resultEl.innerHTML = `<div style="color:#ff6b7a;padding:12px;">${data.error}</div>`; return; }
    const owned    = data.owned_skins || ['agent'];
    const active   = data.active_skin || 'agent';
    const username = data.username || userId;
    let html = `<div style="padding:8px 0;color:var(--muted);font-size:11px;border-bottom:1px solid rgba(255,255,255,0.05);margin-bottom:6px;">
      <strong style="color:#fff;">${username}</strong> — ${owned.length} skin${owned.length !== 1 ? 's' : ''} owned, active: <strong style="color:#6bff7b;">${active}</strong>
    </div>`;
    for (const skinId of owned) {
      const skinInfo = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === skinId) : null;
      const name = skinInfo ? skinInfo.name : skinId;
      html += `<div style="padding:4px 0;font-size:12px;display:flex;justify-content:space-between;">
        <span>${skinId === active ? '⚡ ' : ''}${name} <span style="color:var(--muted);font-size:10px;">(${skinId})</span></span>
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
    const data = await apiPost('/users/admin/grant-skin', { targetUid: userId, skinId });
    if (data.error) { showAdminMessage('Error: ' + data.error, true); return; }
    const skinInfo = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === skinId) : null;
    showAdminMessage(`Gave "${skinInfo?.name || skinId}" to user`);
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
}

async function adminRemoveSkin() {
  showAdminMessage('Skin removal is managed via the Railway admin panel', true);
}

async function adminLoadUserSkinsForRemoval() {
  return adminLookupUserSkins();
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
  if (!confirm(`Reset leaderboard score for ${username}?`)) return;
  const r = await deleteLeaderboardScore(userId, username);
  showAdminMessage(r.success ? 'Score reset' : 'Error: ' + r.error, !r.success);
  if (r.success) { displayScoresAdmin(); displayActivityLogs(); }
}

async function quickDeleteCoinsScore(userId, username) {
  showAdminMessage('Coins entries are live from the database — no deletion needed');
}

async function quickDeleteLevelScore(userId, username) {
  showAdminMessage('Level entries are live from the database — no deletion needed');
}


async function displayFlaggedScores() {
  const listEl = document.getElementById('flaggedScoresList');
  if (listEl) listEl.innerHTML = '<div class="loading-spinner">Flagged scores not available in self-hosted mode.</div>';
}

async function removeFlaggedScore() {
  showAdminMessage('Not available in self-hosted mode', true);
}

async function adminLoadTradeRestrictions() {
  const listEl = document.getElementById('tradeRestrictList');
  if (listEl) listEl.innerHTML = '<div class="loading-spinner">Managed by the Railway backend directly.</div>';
}

async function adminBlockSkinTrade()   { showAdminMessage('Use Railway backend to manage trade restrictions', true); }
async function adminUnblockSkinTrade() { showAdminMessage('Use Railway backend to manage trade restrictions', true); }

async function adminInitSkinPriceDropdown() {
  const select = document.getElementById('skinPriceEditSelect');
  if (!select || typeof SKINS === 'undefined') return;
  if (select.options.length > 1) return;
  select.innerHTML = '<option value="">-- Select a shop skin --</option>';
  for (const skin of SKINS) {
    if (skin.price <= 0) continue;
    const opt = document.createElement('option');
    opt.value = skin.id;
    opt.textContent = `${skin.name} — 🪙 ${skin.price}`;
    select.appendChild(opt);
  }
}

function adminSkinPriceSelectChange() {
  const skinId = document.getElementById('skinPriceEditSelect')?.value;
  const input  = document.getElementById('skinPriceEditValue');
  const prevEl = document.getElementById('skinPriceCurrentVal');
  if (!skinId || typeof SKINS === 'undefined') return;
  const skin = SKINS.find(s => s.id === skinId);
  if (!skin) return;
  if (input)  input.value = skin.price;
  if (prevEl) prevEl.textContent = `Current price: 🪙 ${skin.price}`;
}

async function adminSaveSkinPrice() {
  // In-memory price change only (no Firebase to persist to)
  const skinId   = document.getElementById('skinPriceEditSelect')?.value;
  const newPrice = parseInt(document.getElementById('skinPriceEditValue')?.value) || 0;
  if (!skinId) { showAdminMessage('Select a skin', true); return; }
  if (newPrice < 50 || newPrice > 100000) { showAdminMessage('Price must be 50–100,000', true); return; }
  const skin = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === skinId) : null;
  if (!skin) { showAdminMessage('Skin not found', true); return; }
  const old = skin.price;
  skin.price = newPrice;
  showAdminMessage(`Price updated in session: "${skin.name}" 🪙 ${old} → 🪙 ${newPrice} (resets on reload)`);
  if (typeof initShopUI === 'function') initShopUI();
}

function adminInitCratePriceDropdown() {
  const select = document.getElementById('cratePriceEditSelect');
  if (!select || typeof CRATES === 'undefined') return;
  if (select.options.length > 1) return;
  select.innerHTML = '<option value="">-- Select a crate --</option>';
  for (const crate of CRATES) {
    const opt = document.createElement('option');
    opt.value = crate.id;
    opt.textContent = `${crate.name} — 🪙 ${crate.price}`;
    select.appendChild(opt);
  }
}

function adminCratePriceSelectChange() {
  const crateId = document.getElementById('cratePriceEditSelect')?.value;
  const input   = document.getElementById('cratePriceEditValue');
  const prevEl  = document.getElementById('cratePriceCurrentVal');
  if (!crateId || typeof CRATES === 'undefined') return;
  const crate = CRATES.find(c => c.id === crateId);
  if (!crate) return;
  if (input)  input.value = crate.price;
  if (prevEl) prevEl.textContent = `Current price: 🪙 ${crate.price}`;
}

async function adminSaveCratePrice() {
  const crateId  = document.getElementById('cratePriceEditSelect')?.value;
  const newPrice = parseInt(document.getElementById('cratePriceEditValue')?.value) || 0;
  if (!crateId) { showAdminMessage('Select a crate', true); return; }
  if (newPrice < 100 || newPrice > 100000) { showAdminMessage('Price must be 100–100,000', true); return; }
  const crate = typeof CRATES !== 'undefined' ? CRATES.find(c => c.id === crateId) : null;
  if (!crate) { showAdminMessage('Crate not found', true); return; }
  const old = crate.price;
  crate.price = newPrice;
  showAdminMessage(`Price updated in session: "${crate.name}" 🪙 ${old} → 🪙 ${newPrice} (resets on reload)`);
  if (typeof initCratesTab === 'function') initCratesTab();
}

function showAdminMessage(message, isError = false) {
  const el = document.getElementById('adminMessage');
  if (!el) return;
  el.textContent    = message;
  el.classList.remove('hidden');
  el.style.background  = isError ? 'rgba(255,71,87,0.15)'  : 'rgba(107,255,123,0.15)';
  el.style.borderColor = isError ? 'rgba(255,71,87,0.4)'   : 'rgba(107,255,123,0.4)';
  el.style.color       = isError ? '#ff6b7a'               : '#6bff7b';
  setTimeout(() => el.classList.add('hidden'), 3000);
}


console.log('✅ api-auth.js loaded — Railway backend active');
