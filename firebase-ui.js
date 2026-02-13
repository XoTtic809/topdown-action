// UI Handlers for Authentication, Leaderboard, and Admin Panels
// This file should be loaded AFTER firebase-auth.js and BEFORE game.js

console.log('🎨 Loading UI handlers...');

// ============================================
// AUTHENTICATION UI
// ============================================

function showAuthModal() {
  document.getElementById('authModal').classList.remove('hidden');
  document.getElementById('homeScreen').classList.add('hidden');
}

function hideAuthModal() {
  document.getElementById('authModal').classList.add('hidden');
}

function updateUIForLoggedInUser() {
  hideAuthModal();
  
  // Show user status
  const userStatus = document.getElementById('userStatus');
  const usernameDisplay = document.getElementById('usernameDisplay');
  const leaderboardBtn = document.getElementById('leaderboardBtn');
  const adminBtn = document.getElementById('adminBtn');
  
  userStatus.classList.remove('hidden');
  usernameDisplay.textContent = currentUser.displayName || currentUser.email;
  leaderboardBtn.classList.remove('hidden');
  
  // Show admin button if user is admin
  if (isAdmin) {
    adminBtn.classList.remove('hidden');
  } else {
    adminBtn.classList.add('hidden');
  }
  
  document.getElementById('homeScreen').classList.remove('hidden');
}

function updateUIForGuest() {
  hideAuthModal();
  isGuest = true;
  
  // Hide user status and leaderboard button
  document.getElementById('userStatus').classList.add('hidden');
  document.getElementById('leaderboardBtn').classList.add('hidden');
  document.getElementById('adminBtn').classList.add('hidden');
  
  // Clear saved data for guest
  high = 0;
  playerCoins = 0;
  ownedSkins = ['agent'];
  activeSkin = 'agent';
  
  document.getElementById('homeHighVal').textContent = 0;
  document.getElementById('homeCoinsVal').textContent = 0;
  
  document.getElementById('homeScreen').classList.remove('hidden');
}

// Auth tab switching
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    
    // Update tabs
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Update forms
    if (targetTab === 'login') {
      document.getElementById('loginForm').classList.remove('hidden');
      document.getElementById('signupForm').classList.add('hidden');
    } else {
      document.getElementById('loginForm').classList.add('hidden');
      document.getElementById('signupForm').classList.remove('hidden');
    }
  });
});

// Login button
document.getElementById('loginBtn').addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  
  if (!email || !password) {
    errorEl.textContent = 'Please fill in all fields';
    errorEl.classList.remove('hidden');
    return;
  }
  
  errorEl.classList.add('hidden');
  
  const result = await handleLogin(email, password);
  
  if (!result.success) {
    errorEl.textContent = result.error;
    errorEl.classList.remove('hidden');
  }
  // If successful, onAuthStateChanged will handle UI update
});

// Signup button
document.getElementById('signupBtn').addEventListener('click', async () => {
  const username = document.getElementById('signupUsername').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const errorEl = document.getElementById('signupError');
  
  if (!username || !email || !password) {
    errorEl.textContent = 'Please fill in all fields';
    errorEl.classList.remove('hidden');
    return;
  }
  
  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters';
    errorEl.classList.remove('hidden');
    return;
  }
  
  errorEl.classList.add('hidden');
  
  const result = await handleSignup(email, password, username);
  
  if (!result.success) {
    errorEl.textContent = result.error;
    errorEl.classList.remove('hidden');
  }
  // If successful, onAuthStateChanged will handle UI update
});

// Play as guest button
document.getElementById('playGuestBtn').addEventListener('click', () => {
  updateUIForGuest();
});

// Logout button
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await handleLogout();
  
  // Clear guest flag and show auth modal
  isGuest = false;
  showAuthModal();
});

// ============================================
// LEADERBOARD UI
// ============================================

// Leaderboard button
document.getElementById('leaderboardBtn').addEventListener('click', () => {
  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('leaderboardPanel').classList.remove('hidden');
  displayLeaderboard('allTime');
});

// Leaderboard back button
document.getElementById('leaderboardBackBtn').addEventListener('click', () => {
  document.getElementById('leaderboardPanel').classList.add('hidden');
  document.getElementById('homeScreen').classList.remove('hidden');
});

// Leaderboard filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const filter = btn.dataset.filter;
    
    // Update active filter
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update leaderboard
    displayLeaderboard(filter);
  });
});

// ============================================
// UPDATE LOGS UI
// ============================================

// Update logs button
document.getElementById('updateLogsBtn').addEventListener('click', () => {
  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('updateLogsPanel').classList.remove('hidden');
});

// Update logs back button
document.getElementById('updateLogsBackBtn').addEventListener('click', () => {
  document.getElementById('updateLogsPanel').classList.add('hidden');
  document.getElementById('homeScreen').classList.remove('hidden');
});

// ============================================
// ADMIN UI
// ============================================

// Admin tab switching
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    // Update active tab button
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Show correct content panel
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`adminTab-${targetTab}`).classList.remove('hidden');

    // Load data for the tab
    if (targetTab === 'ban')         displayBannedUsers();
    if (targetTab === 'users')       displayAllUsers();
    if (targetTab === 'scores')      { displayScoresAdmin(); displayCoinsScoresAdmin(); }
    if (targetTab === 'logs')        displayActivityLogs();
    if (targetTab === 'devconsole')  { /* static UI, no load needed */ }
  });
});

// Admin button (opens panel)
document.getElementById('adminBtn').addEventListener('click', () => {
  if (!isAdmin) return;
  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('adminPanel').classList.remove('hidden');
  // Load default tab (bans)
  displayBannedUsers();
});

// Admin back button
document.getElementById('adminBackBtn').addEventListener('click', () => {
  document.getElementById('adminPanel').classList.add('hidden');
  document.getElementById('homeScreen').classList.remove('hidden');
});

// Ban user button (manual ID entry)
document.getElementById('banUserBtn').addEventListener('click', async () => {
  const userId = document.getElementById('banUserId').value.trim();
  const reason = document.getElementById('banReason').value.trim();

  if (!userId) {
    showAdminMessage('Please enter a user ID', true);
    return;
  }

  const result = await banUser(userId, reason);

  if (result.success) {
    showAdminMessage('User banned successfully');
    document.getElementById('banUserId').value = '';
    document.getElementById('banReason').value = '';
    displayBannedUsers();
    displayActivityLogs();
  } else {
    showAdminMessage('Error: ' + result.error, true);
  }
});

// ============================================
// INITIALIZATION
// ============================================

// Show auth modal on page load (auth state listener will handle if already logged in)
window.addEventListener('load', () => {
  // Small delay to ensure Firebase is initialized
  setTimeout(() => {
    if (!currentUser && !isGuest) {
      showAuthModal();
    }
  }, 500);
});

console.log('✅ UI handlers loaded');