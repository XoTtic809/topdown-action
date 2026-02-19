// firebase-ui.js — auth, leaderboard, and admin UI handlers

function showAuthModal() {
  document.getElementById('authModal').classList.remove('hidden');
  document.getElementById('homeScreen').classList.add('hidden');
}

function hideAuthModal() {
  document.getElementById('authModal').classList.add('hidden');
}

function updateUIForLoggedInUser() {
  hideAuthModal();

  const userStatus     = document.getElementById('userStatus');
  const usernameDisplay = document.getElementById('usernameDisplay');
  const leaderboardBtn = document.getElementById('leaderboardBtn');
  const adminBtn       = document.getElementById('adminBtn');

  userStatus.classList.remove('hidden');
  usernameDisplay.textContent = currentUser.displayName || currentUser.email;
  leaderboardBtn.classList.remove('hidden');
  adminBtn.classList.toggle('hidden', !isAdmin);

  document.getElementById('homeScreen').classList.remove('hidden');
}

function updateUIForGuest() {
  hideAuthModal();
  isGuest = true;

  document.getElementById('userStatus').classList.add('hidden');
  document.getElementById('leaderboardBtn').classList.add('hidden');
  document.getElementById('adminBtn').classList.add('hidden');

  high = 0;
  playerCoins = 0;
  ownedSkins = ['agent'];
  activeSkin = 'agent';

  document.getElementById('homeHighVal').textContent = 0;
  document.getElementById('homeCoinsVal').textContent = 0;
  document.getElementById('homeScreen').classList.remove('hidden');
}

// auth tab switching
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    if (targetTab === 'login') {
      document.getElementById('loginForm').classList.remove('hidden');
      document.getElementById('signupForm').classList.add('hidden');
    } else {
      document.getElementById('loginForm').classList.add('hidden');
      document.getElementById('signupForm').classList.remove('hidden');
    }
  });
});

document.getElementById('loginBtn').addEventListener('click', async () => {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl  = document.getElementById('loginError');

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
});

document.getElementById('signupBtn').addEventListener('click', async () => {
  const username = document.getElementById('signupUsername').value.trim();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const errorEl  = document.getElementById('signupError');

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
});

document.getElementById('playGuestBtn').addEventListener('click', () => {
  updateUIForGuest();
  setTimeout(checkForNewAnnouncements, 800);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (typeof resetAnnouncementSession === 'function') resetAnnouncementSession();
  await handleLogout();
  isGuest = false;
  showAuthModal();
});

// leaderboard
document.getElementById('leaderboardBtn').addEventListener('click', () => {
  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('leaderboardPanel').classList.remove('hidden');
  displayLeaderboard('allTime');
});

document.getElementById('leaderboardBackBtn').addEventListener('click', () => {
  document.getElementById('leaderboardPanel').classList.add('hidden');
  document.getElementById('homeScreen').classList.remove('hidden');
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    displayLeaderboard(btn.dataset.filter);
  });
});

// update logs
document.getElementById('updateLogsBtn').addEventListener('click', () => {
  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('updateLogsPanel').classList.remove('hidden');
});

document.getElementById('updateLogsBackBtn').addEventListener('click', () => {
  document.getElementById('updateLogsPanel').classList.add('hidden');
  document.getElementById('homeScreen').classList.remove('hidden');
});

// admin panel
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`adminTab-${targetTab}`).classList.remove('hidden');

    if (targetTab === 'ban')        displayBannedUsers();
    if (targetTab === 'users')      displayAllUsers();
    if (targetTab === 'scores')     { displayScoresAdmin(); displayCoinsScoresAdmin(); displayLevelScoresAdmin(); }
    if (targetTab === 'logs')       displayActivityLogs();
    if (targetTab === 'announce')   displayRecentAnnouncements();
    if (targetTab === 'stats')      displayPlatformStats();
    if (targetTab === 'flags')      displayFlaggedScores();
    if (targetTab === 'devconsole' && typeof devCheckCreatorStatus === 'function') devCheckCreatorStatus();
    if (targetTab === 'market' && typeof adminMpInitSkinDropdown === 'function') { adminMpInitSkinDropdown(); adminMpLoadWhitelist(); }
    if (targetTab === 'skins' && typeof adminInitSkinGiveDropdown === 'function') adminInitSkinGiveDropdown();
  });
});

document.getElementById('adminBtn').addEventListener('click', () => {
  if (!isAdmin) return;
  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('adminPanel').classList.remove('hidden');
  displayBannedUsers();
});

document.getElementById('adminBackBtn').addEventListener('click', () => {
  document.getElementById('adminPanel').classList.add('hidden');
  document.getElementById('homeScreen').classList.remove('hidden');
});

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

// show auth modal on load — onAuthStateChanged will handle it if already logged in
window.addEventListener('load', () => {
  setTimeout(() => {
    if (!currentUser && !isGuest) showAuthModal();
  }, 500);
});