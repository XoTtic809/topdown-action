// api-auth.js
// Drop-in replacement for firebase-auth.js
// Uses Railway backend instead of Firebase/Firestore.
// All function names and global variables are kept identical
// so firebase-ui.js and game.js require no changes.

// ─────────────────────────────────────────────────────────────
// CONFIG — auto-detects localhost vs Railway
// ─────────────────────────────────────────────────────────────
// var (not const) so it's accessible as a global from game.js, api-announcements.js, etc.
var API_BASE = (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
) ? 'http://localhost:3001/api' : 'https://topdown-action-production-8a95.up.railway.app/api';

const TOKEN_KEY = 'topdown_token';

// ─────────────────────────────────────────────────────────────
// GLOBALS (same names as firebase-auth.js)
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// TOKEN HELPERS
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// BATTLE PASS — stored in localStorage since Railway doesn't
// have battle pass tables yet. Works identically to before.
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// AUTH FUNCTIONS
// ─────────────────────────────────────────────────────────────
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
  if (typeof stopTradeHeartbeat    === 'function') stopTradeHeartbeat();
  if (typeof stopTradeNotifPolling === 'function') stopTradeNotifPolling();
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────
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

  // Marketplace state — populated from auth response so marketplace tab
  // doesn't need a separate Firestore read to check eligibility.
  if (typeof marketplaceState !== 'undefined') {
    marketplaceState.skinReceivedTimes = data.skinReceivedTimes || {};
    marketplaceState.accountCreatedAt  = data.createdAt         || null;
    marketplaceState.isWhitelisted     = data.isWhitelisted     || false;
    marketplaceState.eligibilityLoaded = true;
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

  // Start trade heartbeat + notification polling
  if (typeof startTradeHeartbeat     === 'function') startTradeHeartbeat();
  if (typeof startTradeNotifPolling  === 'function') startTradeNotifPolling();

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

// ─────────────────────────────────────────────────────────────
// AUTO-LOGIN on page load (replaces onAuthStateChanged)
// ─────────────────────────────────────────────────────────────
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
    // /me returns a fresh token — save it so JWT always reflects current admin status
    if (data.token) setToken(data.token);
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

// ─────────────────────────────────────────────────────────────
// SAVE — replaces saveUserDataToFirebase / executeSave
// ─────────────────────────────────────────────────────────────
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

  // Force immediate save if max wait exceeded, but only when no save is already
  // in-flight — otherwise we'd clear the just-scheduled timeout and the pending
  // data change would never be persisted.
  if (Date.now() - lastSaveTime >= SAVE_CONFIG.MAX_WAIT && !pendingSave) {
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
      ownedSkins: typeof ownedSkins !== 'undefined' ? ownedSkins : [],
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

// ─────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────
async function submitScoreToLeaderboard(score) {
  // Progress is saved via executeSave — this is a no-op
  // (Railway leaderboard is built from the users table automatically)
}

async function submitCoinsToLeaderboard(coins) {
  // no-op — coins saved in executeSave
}

async function submitLevelToLeaderboard(xp, level) {
  // no-op — XP saved in executeSave
}

async function fetchLeaderboard(type = 'allTime') {
  try {
    if (type === 'coins') {
      const rows = await apiGet('/leaderboard/coins?limit=100');
      return rows.map(r => ({ userId: r.uid, username: r.username, coins: r.total_coins }));
    } else if (type === 'level') {
      const rows = await apiGet('/leaderboard/levels?limit=100');
      return rows.map(r => ({ userId: r.uid, username: r.username, xp: r.current_xp,
        level: typeof calculateTrueLevel === 'function' ? (calculateTrueLevel(r.current_xp) || 0) : 0 }));
    } else if (type === 'timeattack') {
      const rows = await apiGet('/leaderboard/timeattack?limit=100');
      return rows.map(r => ({ userId: r.uid, username: r.username, kills: r.ta_best_kills }));
    } else if (type === 'bossrush') {
      const rows = await apiGet('/leaderboard/bossrush?limit=100');
      return rows.map(r => ({ userId: r.uid, username: r.username, bosses: r.br_bosses_beaten }));
    } else if (type === 'ranked') {
      const rows = await apiGet('/ranked/leaderboard?limit=100');
      return rows.map(r => ({ userId: r.uid, username: r.username, tier: r.tier, division: r.division, rp: r.rp, wins: r.wins, losses: r.losses }));
    } else {
      const rows = await apiGet('/leaderboard/scores?limit=100');
      return rows.map(r => ({ userId: r.uid, username: r.username, score: r.high_score }));
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
    let value;
    if (filter === 'coins')      value = `${(entry.coins  || 0).toLocaleString()} 🪙`;
    else if (filter === 'level') value = `Level ${entry.level || 0} (${(entry.xp || 0).toLocaleString()} XP)`;
    else if (filter === 'timeattack') value = `${(entry.kills || 0).toLocaleString()} kills`;
    else if (filter === 'bossrush') value = `${entry.bosses || 0} bosses`;
    else value = (entry.score || 0).toLocaleString();

    if (filter === 'ranked') {
      const lbl = typeof rankLabel === 'function' ? rankLabel(entry.tier, entry.division) : (entry.tier || 'Unranked');
      const cfg = typeof RANKED_CONFIG !== 'undefined' && RANKED_CONFIG[entry.tier];
      const clr = cfg ? cfg.color : '#aaa';
      const badgeHtml = typeof rankBadgeSvg === 'function'
        ? `<div class="lb-rank-badge">${rankBadgeSvg(entry.tier, entry.division)}</div>` : '';
      el.innerHTML = `
        <div class="rank">${i + 1}</div>
        ${badgeHtml}
        <div class="leaderboard-name">${entry.username}</div>
        <div class="leaderboard-score lb-ranked-score">
          <span style="color:${clr};font-weight:700;">${lbl}</span>
          <span class="lb-ranked-rp">${entry.rp} RP</span>
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="rank">${badge || (i + 1)}</div>
        <div class="leaderboard-name">${entry.username}</div>
        <div class="leaderboard-score">${value}</div>
      `;
    }
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
    if (!data.error) {
      if (data.token) setToken(data.token);
      _applyUserData(data);
    }
  } catch (e) { /* ignore */ }
}

// updateLeaderboardsIfNeeded — kept for compatibility
async function updateLeaderboardsIfNeeded() {
  // Railway leaderboard auto-updates from users table — nothing to do
}

// ─────────────────────────────────────────────────────────────
// ADMIN FUNCTIONS
// ─────────────────────────────────────────────────────────────
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
    'ban': '🚫 Banned user', 'ban_user': '🚫 Banned user',
    'unban': '✅ Unbanned user', 'unban_user': '✅ Unbanned user',
    'reset_score': '🔄 Reset high score',
    'grant_skin': '🎁 Granted skin',
    'remove_skin': '🗑️ Removed skin',
    'grant_coins': '🪙 Granted coins',
    'block_skin_trade': '⛔ Blocked skin trade',
    'unblock_skin_trade': '✅ Unblocked skin trade',
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

// ── Admin Skins Management ──
// adminInitSkinGiveDropdown / price editors defined in admin_skins.js

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
  if (!isAdmin) return;
  const userId = document.getElementById('skinRemoveUserId')?.value.trim();
  const skinId = document.getElementById('skinRemoveSelect')?.value;
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  if (!skinId) { showAdminMessage('Select a skin to remove', true); return; }
  if (skinId === 'agent') { showAdminMessage('Cannot remove the default Agent skin', true); return; }
  if (!confirm(`Remove skin "${skinId}" from user ${userId}?`)) return;
  try {
    const data = await apiPost('/users/admin/remove-skin', { targetUid: userId, skinId });
    if (data.error) { showAdminMessage('Error: ' + data.error, true); return; }
    showAdminMessage(`✅ Removed "${skinId}" from user`);
    adminLoadUserSkinsForRemoval();
  } catch (err) {
    showAdminMessage('Error: ' + err.message, true);
  }
}

async function adminLoadUserSkinsForRemoval() {
  if (!isAdmin) return;
  const userId = document.getElementById('skinRemoveUserId')?.value.trim();
  const sel    = document.getElementById('skinRemoveSelect');
  if (!userId) { showAdminMessage('Enter a User ID first', true); return; }
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading…</option>';
  try {
    const data = await apiGet(`/users/${userId}/profile`);
    if (data.error) {
      sel.innerHTML = '<option value="">User not found</option>';
      showAdminMessage('User not found', true);
      return;
    }
    const owned = data.owned_skins || ['agent'];
    if (owned.length === 0) {
      sel.innerHTML = '<option value="">No skins found</option>';
      return;
    }
    sel.innerHTML = '<option value="">— Select skin to remove —</option>';
    owned.forEach(skinId => {
      const skinInfo = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === skinId) : null;
      const opt = document.createElement('option');
      opt.value = skinId;
      opt.textContent = skinInfo ? `${skinInfo.name} (${skinId})` : skinId;
      sel.appendChild(opt);
    });
    showAdminMessage(`Loaded ${owned.length} skin(s) — select one to remove`);
  } catch (err) {
    sel.innerHTML = '<option value="">Error loading</option>';
    showAdminMessage('Error: ' + err.message, true);
  }
}

// ── Quick action buttons ──

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

// ── Features that existed in Firebase but not in Railway yet ──
// These are graceful no-ops so the rest of the UI doesn't break.

async function displayFlaggedScores() {
  const listEl = document.getElementById('flaggedScoresList');
  if (listEl) listEl.innerHTML = '<div class="loading-spinner">Flagged scores not available in self-hosted mode.</div>';
}

async function removeFlaggedScore() {
  showAdminMessage('Not available in self-hosted mode', true);
}

async function adminLoadTradeRestrictions() {
  if (!isAdmin) return;
  const listEl = document.getElementById('tradeRestrictList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  try {
    const rows = await apiGet('/trade-restrictions/admin/list');
    if (!rows || rows.length === 0) {
      listEl.innerHTML = '<div class="loading-spinner">No restricted skins</div>';
      return;
    }
    listEl.innerHTML = '';
    rows.forEach(r => {
      const el = document.createElement('div');
      el.className = 'admin-score-entry';
      el.innerHTML = `
        <div class="admin-score-info">
          <div class="admin-score-name">${r.skin_id}</div>
          <div style="font-size:10px;color:var(--muted);">${r.reason || ''} · by ${r.added_by || 'admin'}</div>
        </div>
        <button class="admin-action-btn success" onclick="adminUnblockSkinById('${r.skin_id}')">✅ Unblock</button>
      `;
      listEl.appendChild(el);
    });
  } catch (err) {
    listEl.innerHTML = '<div class="loading-spinner">Error loading restrictions</div>';
  }
}

async function adminUnblockSkinById(skinId) {
  if (!isAdmin || !skinId) return;
  try {
    const data = await apiDelete(`/trade-restrictions/admin/${encodeURIComponent(skinId)}`);
    if (data.error) { showAdminMessage('Error: ' + data.error, true); return; }
    showAdminMessage(`✅ ${skinId} unblocked from trading`);
    adminLoadTradeRestrictions();
  } catch (err) {
    showAdminMessage('Error: ' + err.message, true);
  }
}

async function adminBlockSkinTrade() {
  if (!isAdmin) return;
  const skinId = document.getElementById('tradeRestrictSkinId')?.value.trim();
  const reason = document.getElementById('tradeRestrictReason')?.value.trim() || 'Restricted by admin';
  if (!skinId) { showAdminMessage('Enter a skin ID', true); return; }
  try {
    const data = await apiPost('/trade-restrictions/admin/block', { skinId, reason });
    if (data.error) { showAdminMessage('Error: ' + data.error, true); return; }
    showAdminMessage(`⛔ ${skinId} blocked from trading`);
    document.getElementById('tradeRestrictSkinId').value = '';
    document.getElementById('tradeRestrictReason').value = '';
    adminLoadTradeRestrictions();
  } catch (err) {
    showAdminMessage('Error: ' + err.message, true);
  }
}

async function adminUnblockSkinTrade() {
  if (!isAdmin) return;
  const skinId = document.getElementById('tradeUnrestrictSkinId')?.value.trim();
  if (!skinId) { showAdminMessage('Enter a skin ID', true); return; }
  await adminUnblockSkinById(skinId);
  if (document.getElementById('tradeUnrestrictSkinId')) {
    document.getElementById('tradeUnrestrictSkinId').value = '';
  }
}

// Price editor functions (adminInitSkinPriceDropdown, adminSaveSkinPrice, etc.)
// are defined in admin_skins.js which loads after this file.

// ── Report System ─────────────────────────────────────────────

async function submitReport(type, subject, description) {
  try {
    const data = await apiPost('/reports', { type, subject, description });
    return data.error ? { success: false, error: data.error } : { success: true };
  } catch (err) {
    return { success: false, error: 'Connection failed. Please try again.' };
  }
}

async function adminLoadReports(statusFilter) {
  if (!isAdmin) return;
  const listEl = document.getElementById('reportsList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  try {
    const rows = await apiGet('/reports/admin/list');
    const filtered = statusFilter ? rows.filter(r => r.status === statusFilter) : rows;
    if (!filtered.length) {
      listEl.innerHTML = `<div class="loading-spinner">No ${statusFilter || ''} reports found.</div>`;
      return;
    }
    const TYPE_LABELS   = { bug:'🐛 Bug', cheater:'🚩 Cheater', abuse:'⚠️ Abuse', suggestion:'💡 Suggestion', other:'📌 Other' };
    const STATUS_COLORS = { open:'#ff6b7a', reviewing:'#ffd700', resolved:'#6bff7b', dismissed:'#8899aa' };
    listEl.innerHTML = '';
    filtered.forEach(r => {
      const el = document.createElement('div');
      el.className = 'admin-score-entry';
      el.style.alignItems = 'flex-start';
      el.innerHTML = `
        <div class="admin-score-info" style="flex:1;min-width:0;">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px;">
            <span style="font-size:11px;font-weight:700;color:${STATUS_COLORS[r.status] || '#aaa'}">${r.status.toUpperCase()}</span>
            <span style="font-size:11px;color:var(--muted);">${TYPE_LABELS[r.type] || r.type}</span>
            <span style="font-size:10px;color:var(--muted);">by <strong style="color:#dbe7ff">${escapeHtml(r.username)}</strong></span>
            <span style="font-size:10px;color:var(--muted);margin-left:auto;">${new Date(r.created_at).toLocaleDateString()}</span>
          </div>
          <div style="font-size:13px;font-weight:600;color:#dbe7ff;margin-bottom:4px;">${escapeHtml(r.subject)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.6);line-height:1.5;white-space:pre-wrap;word-break:break-word;">${escapeHtml(r.description)}</div>
          ${r.admin_note ? `<div style="margin-top:6px;font-size:11px;color:#ffd700;">📝 Note: ${escapeHtml(r.admin_note)}</div>` : ''}
          ${r.resolved_by ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;">Actioned by: ${escapeHtml(r.resolved_by)}</div>` : ''}
          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
            ${r.status !== 'reviewing'  ? `<button class="admin-action-btn" onclick="adminResolveReport('${r.id}','reviewing',null)">👁 Review</button>` : ''}
            ${r.status !== 'resolved'   ? `<button class="admin-action-btn success" onclick="adminResolveReport('${r.id}','resolved',null)">✅ Resolve</button>` : ''}
            ${r.status !== 'dismissed'  ? `<button class="admin-action-btn danger"  onclick="adminResolveReport('${r.id}','dismissed',null)">🗑 Dismiss</button>` : ''}
          </div>
        </div>
      `;
      listEl.appendChild(el);
    });
  } catch (err) {
    listEl.innerHTML = '<div class="loading-spinner">Error loading reports.</div>';
  }
}

async function adminResolveReport(reportId, status, adminNote) {
  if (!isAdmin) return;
  try {
    const res  = await fetch(`${API_BASE}/reports/admin/${reportId}`, {
      method:  'PATCH',
      headers: authHeaders(),
      body:    JSON.stringify({ status, admin_note: adminNote }),
    });
    const data = await res.json();
    if (data.error) { showAdminMessage('Error: ' + data.error, true); return; }
    showAdminMessage(`Report marked as ${status}`);
    adminLoadReports(); // reload all
  } catch (err) {
    showAdminMessage('Error: ' + err.message, true);
  }
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

// Note: checkForNewAnnouncements() is defined in firebase_announcements.js
// and is called from _postLoginSetup above. No stub needed here.

// ─────────────────────────────────────────────────────────────────────────────
// RANKED ADMIN
// ─────────────────────────────────────────────────────────────────────────────

function _rankedLabel(tier, division) {
  if (typeof rankLabel === 'function') return rankLabel(tier, division);
  const divStrs = { 1:'I', 2:'II', 3:'III', 4:'IV', 5:'V' };
  const hasDivs = ['bronze','silver','gold','platinum','diamond'].includes(tier);
  const name = tier ? (tier.charAt(0).toUpperCase() + tier.slice(1)) : 'Unranked';
  return hasDivs ? `${name} ${divStrs[division] || division}` : name;
}

async function adminRankedLookup() {
  const uid = document.getElementById('adminRankedLookupId').value.trim();
  const out = document.getElementById('adminRankedLookupResult');
  if (!uid) { out.innerHTML = '<span style="color:#ff6b7a;">Enter a user ID.</span>'; return; }
  out.innerHTML = '<span style="color:var(--muted);">Loading…</span>';
  try {
    const data = await apiGet(`/ranked/admin/profile/${encodeURIComponent(uid)}`);
    if (!data) {
      out.innerHTML = '<span style="color:var(--muted);">No ranked profile found for this user.</span>';
      return;
    }
    const cfg = typeof RANKED_CONFIG !== 'undefined' && RANKED_CONFIG[data.tier];
    const clr = cfg ? cfg.color : '#aaa';
    out.innerHTML = `
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px 12px;line-height:1.8;">
        <div><strong>Username:</strong> ${data.username || uid}</div>
        <div><strong>Rank:</strong> <span style="color:${clr};font-weight:700;">${_rankedLabel(data.tier, data.division)}</span> — ${data.rp} RP</div>
        <div><strong>Peak:</strong> ${_rankedLabel(data.peak_tier, data.peak_division)}</div>
        <div><strong>W/L:</strong> ${data.wins}W / ${data.losses}L &nbsp;·&nbsp; <strong>Streak:</strong> ${data.streak}</div>
        <div><strong>Promo Shield:</strong> ${data.promo_protect ? '🛡 Active' : 'None'}</div>
        <div style="font-size:10px;color:var(--muted);">Updated: ${data.updated_at ? new Date(data.updated_at).toLocaleString() : 'N/A'}</div>
      </div>
    `;
  } catch (err) {
    out.innerHTML = `<span style="color:#ff6b7a;">Error: ${err.message}</span>`;
  }
}

async function adminRankedSet() {
  const uid      = document.getElementById('adminRankedSetId').value.trim();
  const tier     = document.getElementById('adminRankedSetTier').value;
  const division = parseInt(document.getElementById('adminRankedSetDiv').value) || 1;
  const rp       = parseInt(document.getElementById('adminRankedSetRp').value) || 0;
  if (!uid) { showAdminMessage('Enter a user ID', true); return; }
  try {
    const data = await apiPost('/ranked/admin/set', { uid, tier, division, rp });
    if (data.error) { showAdminMessage(data.error, true); return; }
    showAdminMessage(`✅ Set ${uid} → ${_rankedLabel(tier, division)} ${rp} RP`);
  } catch (err) {
    showAdminMessage(err.message, true);
  }
}

async function adminRankedReset() {
  const uid = document.getElementById('adminRankedResetId').value.trim();
  if (!uid) { showAdminMessage('Enter a user ID', true); return; }
  if (!confirm(`Reset ranked profile for ${uid} to Bronze V?`)) return;
  try {
    const data = await apiDelete(`/ranked/admin/reset/${encodeURIComponent(uid)}`);
    if (data.error) { showAdminMessage(data.error, true); return; }
    showAdminMessage(`✅ Ranked profile for ${uid} reset to Bronze V`);
  } catch (err) {
    showAdminMessage(err.message, true);
  }
}

async function adminRankedLoadLb() {
  const listEl = document.getElementById('adminRankedLbList');
  if (!listEl) return;
  listEl.innerHTML = '<div style="font-size:11px;color:var(--muted);">Loading…</div>';
  try {
    const rows = await apiGet('/ranked/admin/leaderboard?limit=100');
    if (!rows || rows.length === 0) {
      listEl.innerHTML = '<div style="font-size:11px;color:var(--muted);">No ranked players yet.</div>';
      return;
    }
    listEl.innerHTML = '';
    rows.forEach((r, i) => {
      const cfg = typeof RANKED_CONFIG !== 'undefined' && RANKED_CONFIG[r.tier];
      const clr = cfg ? cfg.color : '#aaa';
      const label = _rankedLabel(r.tier, r.division);
      const el = document.createElement('div');
      el.className = 'admin-score-entry';
      el.style.cssText = 'align-items:center;';
      el.innerHTML = `
        <div class="admin-score-rank">${i + 1}</div>
        <div class="admin-score-info" style="flex:1;">
          <div class="admin-score-name">${r.username}${r.is_banned ? ' <span style="color:#ff6b7a;font-size:9px;">BANNED</span>' : ''}</div>
          <div class="admin-score-val" style="color:${clr};">${label} &middot; ${r.rp} RP</div>
          <div style="font-size:10px;color:var(--muted);">${r.wins}W / ${r.losses}L &middot; ID: ${r.uid}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <button class="admin-action-btn reset" style="padding:3px 8px;font-size:10px;"
            onclick="document.getElementById('adminRankedLookupId').value='${r.uid}';document.getElementById('adminRankedSetId').value='${r.uid}';document.getElementById('adminRankedResetId').value='${r.uid}';">
            Fill ID
          </button>
          <button class="admin-action-btn danger" style="padding:3px 8px;font-size:10px;"
            onclick="adminRankedResetById('${r.uid}', '${(r.username||'').replace(/'/g,"\\'")}')">
            Reset
          </button>
        </div>
      `;
      listEl.appendChild(el);
    });
  } catch (err) {
    listEl.innerHTML = `<div style="font-size:11px;color:#ff6b7a;">Error: ${err.message}</div>`;
  }
}

async function adminRankedResetById(uid, username) {
  if (!confirm(`Reset ranked profile for ${username} (${uid}) to Bronze V?`)) return;
  try {
    const data = await apiDelete(`/ranked/admin/reset/${encodeURIComponent(uid)}`);
    if (data.error) { showAdminMessage(data.error, true); return; }
    showAdminMessage(`✅ Reset ${username} to Bronze V`);
    adminRankedLoadLb();
  } catch (err) {
    showAdminMessage(err.message, true);
  }
}

console.log('✅ api-auth.js loaded — Railway backend active');
