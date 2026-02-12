// Firebase Authentication & Leaderboard Integration
// This file handles all Firebase-related functionality

console.log('🔐 Loading Firebase auth module...');

let currentUser = null;
let isGuest = false;
let isAdmin = false;

// ============================================
// AUTHENTICATION
// ============================================

// Check if user is banned
async function checkIfBanned(userId) {
  try {
    const bannedDoc = await db.collection('banned').doc(userId).get();
    return bannedDoc.exists;
  } catch (error) {
    console.error('Error checking ban status:', error);
    return false;
  }
}

// Check if user is admin
async function checkIfAdmin(userId) {
  try {
    const adminDoc = await db.collection('admins').doc(userId).get();
    return adminDoc.exists && adminDoc.data().isAdmin === true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Login handler
async function handleLogin(email, password) {
  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Check if banned
    const banned = await checkIfBanned(user.uid);
    if (banned) {
      await auth.signOut();
      throw new Error('This account has been banned.');
    }
    
    console.log('✅ Login successful:', user.uid);
    return { success: true };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: error.message };
  }
}

// Signup handler
async function handleSignup(email, password, username) {
  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Update profile with username
    await user.updateProfile({ displayName: username });
    
    // Create user document in Firestore
    await db.collection('users').doc(user.uid).set({
      username: username,
      email: email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      highScore: 0,
      totalCoins: 0,
      ownedSkins: ['agent'],
      activeSkin: 'agent',
      gamesPlayed: 0
    });
    
    console.log('✅ Signup successful:', user.uid);
    return { success: true };
  } catch (error) {
    console.error('Signup error:', error);
    return { success: false, error: error.message };
  }
}

// Logout handler
async function handleLogout() {
  try {
    await auth.signOut();
    currentUser = null;
    isGuest = false;
    isAdmin = false;
    console.log('✅ Logout successful');
    return { success: true };
  } catch (error) {
    console.error('Logout error:', error);
    return { success: false, error: error.message };
  }
}

// Auth state listener
auth.onAuthStateChanged(async (user) => {
  if (user) {
    // Check if banned
    const banned = await checkIfBanned(user.uid);
    if (banned) {
      await auth.signOut();
      alert('Your account has been banned.');
      showAuthModal();
      return;
    }
    
    // Set current user
    currentUser = user;
    isGuest = false;
    isAdmin = await checkIfAdmin(user.uid);
    
    console.log('👤 User logged in:', user.displayName || user.email);
    console.log('🔑 User ID:', user.uid);
    if (isAdmin) console.log('⚠️ Admin privileges active');
    
    // Update UI
    updateUIForLoggedInUser();
    
    // Load user data from Firestore
    await loadUserDataFromFirebase(user.uid);
  } else {
    currentUser = null;
    isAdmin = false;
    console.log('👋 User logged out');
  }
});

// ============================================
// LEADERBOARD
// ============================================

// Submit score to leaderboard
async function submitScoreToLeaderboard(score) {
  if (!currentUser || isGuest) return;
  
  try {
    const userDoc = db.collection('leaderboard').doc(currentUser.uid);
    const userData = await userDoc.get();
    
    // Only update if new score is higher
    if (!userData.exists || score > (userData.data().score || 0)) {
      await userDoc.set({
        userId: currentUser.uid,
        username: currentUser.displayName || 'Anonymous',
        score: score,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        date: new Date().toISOString()
      });
      console.log('📊 Score submitted to leaderboard:', score);
    }
  } catch (error) {
    console.error('Error submitting score:', error);
  }
}

// Fetch leaderboard data
async function fetchLeaderboard(filter = 'allTime') {
  try {
    let query = db.collection('leaderboard').orderBy('score', 'desc').limit(100);
    
    // Apply time filter
    if (filter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(today));
    } else if (filter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(weekAgo));
    }
    
    const snapshot = await query.get();
    const leaderboard = [];
    
    snapshot.forEach(doc => {
      leaderboard.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return leaderboard;
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
}

// Display leaderboard
async function displayLeaderboard(filter = 'allTime') {
  const listEl = document.getElementById('leaderboardList');
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  
  const leaderboard = await fetchLeaderboard(filter);
  
  if (leaderboard.length === 0) {
    listEl.innerHTML = '<div class="loading-spinner">No entries yet</div>';
    return;
  }
  
  listEl.innerHTML = '';
  leaderboard.forEach((entry, index) => {
    const rank = index + 1;
    const entryEl = document.createElement('div');
    entryEl.className = `leaderboard-entry ${rank <= 3 ? `rank-${rank}` : ''}`;
    
    const isCurrentUser = currentUser && entry.userId === currentUser.uid;
    
    entryEl.innerHTML = `
      <div class="rank">${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</div>
      <div class="player-name">${entry.username}${isCurrentUser ? ' (You)' : ''}</div>
      <div class="player-score">${entry.score.toLocaleString()}</div>
    `;
    
    if (isCurrentUser) {
      entryEl.style.background = 'rgba(88,166,255,0.15)';
      entryEl.style.borderColor = 'rgba(88,166,255,0.4)';
    }
    
    listEl.appendChild(entryEl);
  });
}

// ============================================
// USER DATA SYNC
// ============================================

// Save user data to Firebase
async function saveUserDataToFirebase() {
  if (!currentUser || isGuest) return;
  
  try {
    await db.collection('users').doc(currentUser.uid).update({
      highScore: high,
      totalCoins: playerCoins,
      ownedSkins: ownedSkins,
      activeSkin: activeSkin,
      lastPlayed: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log('💾 User data saved to Firebase');
  } catch (error) {
    console.error('Error saving user data:', error);
  }
}

// Load user data from Firebase
async function loadUserDataFromFirebase(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (userDoc.exists) {
      const data = userDoc.data();
      high = data.highScore || 0;
      playerCoins = data.totalCoins || 0;
      ownedSkins = data.ownedSkins || ['agent'];
      activeSkin = data.activeSkin || 'agent';
      
      // Update UI
      document.getElementById('homeHighVal').textContent = high;
      document.getElementById('homeCoinsVal').textContent = playerCoins;
      
      console.log('📥 User data loaded from Firebase');
    } else {
      console.log('📄 No existing data, using defaults');
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

// Ban user
async function banUser(userId, reason = '') {
  if (!isAdmin) {
    console.error('❌ Not authorized');
    return { success: false, error: 'Not authorized' };
  }
  
  try {
    await db.collection('banned').doc(userId).set({
      bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
      bannedBy: currentUser.uid,
      reason: reason
    });
    await logAdminAction('ban', { targetUserId: userId, reason });
    console.log('🚫 User banned:', userId);
    return { success: true };
  } catch (error) {
    console.error('Error banning user:', error);
    return { success: false, error: error.message };
  }
}

// Unban user
async function unbanUser(userId) {
  if (!isAdmin) {
    console.error('❌ Not authorized');
    return { success: false, error: 'Not authorized' };
  }
  
  try {
    await db.collection('banned').doc(userId).delete();
    await logAdminAction('unban', { targetUserId: userId });
    console.log('✅ User unbanned:', userId);
    return { success: true };
  } catch (error) {
    console.error('Error unbanning user:', error);
    return { success: false, error: error.message };
  }
}

// Fetch banned users list
async function fetchBannedUsers() {
  if (!isAdmin) return [];
  
  try {
    const snapshot = await db.collection('banned').get();
    const bannedUsers = [];
    
    snapshot.forEach(doc => {
      bannedUsers.push({
        userId: doc.id,
        ...doc.data()
      });
    });
    
    return bannedUsers;
  } catch (error) {
    console.error('Error fetching banned users:', error);
    return [];
  }
}

// Display banned users list
async function displayBannedUsers() {
  const listEl = document.getElementById('bannedUsersList');
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  
  const bannedUsers = await fetchBannedUsers();
  
  if (bannedUsers.length === 0) {
    listEl.innerHTML = '<div class="loading-spinner">No banned users</div>';
    return;
  }
  
  listEl.innerHTML = '';
  bannedUsers.forEach(entry => {
    const entryEl = document.createElement('div');
    entryEl.className = 'banned-entry';
    
    entryEl.innerHTML = `
      <div>
        <div style="font-weight: 600;">${entry.userId.substring(0, 8)}...</div>
        <div style="font-size: 10px; color: var(--muted);">${entry.reason || 'No reason provided'}</div>
      </div>
      <button class="unban-btn" onclick="handleUnban('${entry.userId}')">UNBAN</button>
    `;
    
    listEl.appendChild(entryEl);
  });
}

// Handle unban from UI
async function handleUnban(userId) {
  const result = await unbanUser(userId);
  if (result.success) {
    displayBannedUsers();
    showAdminMessage('User unbanned successfully');
  } else {
    showAdminMessage('Error: ' + result.error, true);
  }
}

// ============================================
// ADMIN — NEW FEATURES
// ============================================

// Log an admin action to Firestore
async function logAdminAction(action, details = {}) {
  if (!currentUser) return;
  try {
    await db.collection('activityLogs').add({
      action,
      adminId: currentUser.uid,
      adminName: currentUser.displayName || currentUser.email,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      ...details
    });
  } catch (error) {
    console.error('Error logging admin action:', error);
  }
}

// Fetch all registered users (admin only)
async function fetchAllUsers() {
  if (!isAdmin) return [];
  try {
    const snapshot = await db.collection('users').orderBy('highScore', 'desc').get();
    const users = [];
    snapshot.forEach(doc => users.push({ userId: doc.id, ...doc.data() }));
    return users;
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

// Delete a user's leaderboard score (admin only)
async function deleteLeaderboardScore(userId, username) {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  try {
    await db.collection('leaderboard').doc(userId).delete();
    await logAdminAction('delete_score', { targetUserId: userId, targetUsername: username });
    console.log('🗑️ Leaderboard score deleted for:', userId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting score:', error);
    return { success: false, error: error.message };
  }
}

// Reset a user's high score (admin only)
async function resetUserHighScore(userId, username) {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  try {
    await db.collection('users').doc(userId).update({ highScore: 0 });
    await db.collection('leaderboard').doc(userId).delete();
    await logAdminAction('reset_high_score', { targetUserId: userId, targetUsername: username });
    console.log('🔄 High score reset for:', userId);
    return { success: true };
  } catch (error) {
    console.error('Error resetting high score:', error);
    return { success: false, error: error.message };
  }
}

// Fetch activity logs (admin only)
async function fetchActivityLogs() {
  if (!isAdmin) return [];
  try {
    const snapshot = await db.collection('activityLogs')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();
    const logs = [];
    snapshot.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
    return logs;
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    return [];
  }
}

// Display all users
async function displayAllUsers() {
  const listEl = document.getElementById('usersList');
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
    const joined = user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
    el.innerHTML = `
      <div class="admin-user-info">
        <div class="admin-user-name">${user.username || 'Unknown'}</div>
        <div class="admin-user-meta">${user.email || ''} &nbsp;·&nbsp; Joined: ${joined}</div>
        <div class="admin-user-meta">🏆 Best: ${(user.highScore || 0).toLocaleString()} &nbsp;·&nbsp; 🎮 Games: ${user.gamesPlayed || 0} &nbsp;·&nbsp; 🪙 Coins: ${user.totalCoins || 0}</div>
        <div class="admin-user-id">ID: ${user.userId}</div>
      </div>
      <div class="admin-user-actions">
        <button class="admin-action-btn ban"    onclick="quickBanUser('${user.userId}', '${(user.username||'').replace(/'/g,"\\'")}')">🚫 Ban</button>
        <button class="admin-action-btn reset"  onclick="quickResetScore('${user.userId}', '${(user.username||'').replace(/'/g,"\\'")}')">🔄 Reset Score</button>
      </div>
    `;
    listEl.appendChild(el);
  });
}

// Display leaderboard with delete buttons
async function displayScoresAdmin() {
  const listEl = document.getElementById('scoresAdminList');
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';

  const leaderboard = await fetchLeaderboard('allTime');

  if (leaderboard.length === 0) {
    listEl.innerHTML = '<div class="loading-spinner">No scores yet</div>';
    return;
  }

  listEl.innerHTML = '';
  leaderboard.forEach((entry, index) => {
    const el = document.createElement('div');
    el.className = 'admin-score-entry';
    el.innerHTML = `
      <div class="admin-score-rank">${index + 1}</div>
      <div class="admin-score-info">
        <div class="admin-score-name">${entry.username}</div>
        <div class="admin-score-val">${entry.score.toLocaleString()}</div>
      </div>
      <button class="admin-action-btn delete" onclick="quickDeleteScore('${entry.userId}', '${(entry.username||'').replace(/'/g,"\\'")}')">🗑️ Delete</button>
    `;
    listEl.appendChild(el);
  });
}

// Display activity logs
async function displayActivityLogs() {
  const listEl = document.getElementById('activityLogsList');
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';

  const logs = await fetchActivityLogs();

  if (logs.length === 0) {
    listEl.innerHTML = '<div class="loading-spinner">No activity yet</div>';
    return;
  }

  const actionLabels = {
    ban: '🚫 Banned user',
    unban: '✅ Unbanned user',
    delete_score: '🗑️ Deleted score',
    reset_high_score: '🔄 Reset high score'
  };

  listEl.innerHTML = '';
  logs.forEach(log => {
    const el = document.createElement('div');
    el.className = 'admin-log-entry';
    const time = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString() : 'N/A';
    const label = actionLabels[log.action] || log.action;
    const target = log.targetUsername ? ` → <strong>${log.targetUsername}</strong>` : (log.targetUserId ? ` → ${log.targetUserId.substring(0,8)}...` : '');
    el.innerHTML = `
      <div class="admin-log-action">${label}${target}</div>
      <div class="admin-log-meta">by ${log.adminName} &nbsp;·&nbsp; ${time}</div>
    `;
    listEl.appendChild(el);
  });
}

// Quick-action helpers called from user list buttons
async function quickBanUser(userId, username) {
  if (!confirm(`Ban ${username}?`)) return;
  const result = await banUser(userId, 'Banned via user list');
  showAdminMessage(result.success ? `${username} banned` : 'Error: ' + result.error, !result.success);
  if (result.success) { displayAllUsers(); displayActivityLogs(); }
}

async function quickResetScore(userId, username) {
  if (!confirm(`Reset high score for ${username}?`)) return;
  const result = await resetUserHighScore(userId, username);
  showAdminMessage(result.success ? `${username}'s score reset` : 'Error: ' + result.error, !result.success);
  if (result.success) { displayAllUsers(); displayScoresAdmin(); displayActivityLogs(); }
}

async function quickDeleteScore(userId, username) {
  if (!confirm(`Delete leaderboard score for ${username}?`)) return;
  const result = await deleteLeaderboardScore(userId, username);
  showAdminMessage(result.success ? `Score deleted` : 'Error: ' + result.error, !result.success);
  if (result.success) { displayScoresAdmin(); displayActivityLogs(); }
}

// Show admin message
function showAdminMessage(message, isError = false) {
  const msgEl = document.getElementById('adminMessage');
  msgEl.textContent = message;
  msgEl.classList.remove('hidden');
  if (isError) {
    msgEl.style.background = 'rgba(255,71,87,0.15)';
    msgEl.style.borderColor = 'rgba(255,71,87,0.4)';
    msgEl.style.color = '#ff6b7a';
  } else {
    msgEl.style.background = 'rgba(107,255,123,0.15)';
    msgEl.style.borderColor = 'rgba(107,255,123,0.4)';
    msgEl.style.color = '#6bff7b';
  }
  
  setTimeout(() => {
    msgEl.classList.add('hidden');
  }, 3000);
}

console.log('✅ Firebase auth module loaded');
