// ui.js — replaces firebase-ui.js
// All button handlers for auth, leaderboard, admin panel, and settings

function showAuthModal() {
  const modal = document.getElementById('authModal');
  const home  = document.getElementById('homeScreen');
  if (modal) modal.classList.remove('hidden');
  if (home)  home.classList.add('hidden');
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('hidden');
}

function updateUIForLoggedInUser() {
  hideAuthModal();
  const userStatus      = document.getElementById('userStatus');
  const usernameDisplay = document.getElementById('usernameDisplay');
  const adminBtn        = document.getElementById('adminBtn');

  if (userStatus)      userStatus.classList.remove('hidden');
  if (usernameDisplay) usernameDisplay.textContent = currentUser.displayName || currentUser.email;
  if (adminBtn)        adminBtn.classList.toggle('hidden', !isAdmin);

  document.getElementById('homeScreen')?.classList.remove('hidden');
  // Refresh chat widget visibility now that the user is logged in
  if (typeof window.chatRefreshVisibility === 'function') window.chatRefreshVisibility();
}

function updateUIForGuest() {
  hideAuthModal();
  isGuest = true;

  document.getElementById('userStatus')?.classList.add('hidden');
  document.getElementById('leaderboardBtn')?.classList.add('hidden');
  document.getElementById('adminBtn')?.classList.add('hidden');

  // Restore guest data from localStorage so returning guests keep their progress.
  // Do NOT reset to 0 — game.js already read these on page load; reassigning here
  // would wipe any data that was saved from a previous guest session.
  high        = Number(localStorage.getItem('highscore')  || 0);
  playerCoins = Number(localStorage.getItem('playerCoins') || 0);
  ownedSkins  = JSON.parse(localStorage.getItem('ownedSkins')  || '["agent"]');
  activeSkin  = localStorage.getItem('activeSkin') || 'agent';

  document.getElementById('homeHighVal').textContent  = high;
  document.getElementById('homeCoinsVal').textContent = playerCoins;
  document.getElementById('homeScreen')?.classList.remove('hidden');
  // Hide chat setting row — guests cannot access chat
  if (typeof window.chatRefreshVisibility === 'function') window.chatRefreshVisibility();
}

document.addEventListener('DOMContentLoaded', () => {

  // ── Auth tab switching ──────────────────────────────────────
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.tab === 'login') {
        document.getElementById('loginForm')?.classList.remove('hidden');
        document.getElementById('signupForm')?.classList.add('hidden');
      } else {
        document.getElementById('loginForm')?.classList.add('hidden');
        document.getElementById('signupForm')?.classList.remove('hidden');
      }
    });
  });

  // ── Login ───────────────────────────────────────────────────
  document.getElementById('loginBtn')?.addEventListener('click', async () => {
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

  // Allow Enter key on login fields
  ['loginEmail','loginPassword'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });
  });

  // ── Signup ──────────────────────────────────────────────────
  document.getElementById('signupBtn')?.addEventListener('click', async () => {
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

  // Allow Enter key on signup fields
  ['signupUsername','signupEmail','signupPassword'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('signupBtn').click();
    });
  });

  // ── Guest ───────────────────────────────────────────────────
  document.getElementById('playGuestBtn')?.addEventListener('click', () => {
    updateUIForGuest();
    setTimeout(checkForNewAnnouncements, 800);
  });

  // ── Local dev tools (localhost only) ───────────────────────
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const helperEl = document.getElementById('devAdminHelper');
    if (helperEl) helperEl.style.display = 'block';

    document.getElementById('devMakeAdminBtn')?.addEventListener('click', async () => {
      const email  = document.getElementById('devAdminEmail')?.value.trim();
      const msgEl  = document.getElementById('devAdminMsg');
      const btn    = document.getElementById('devMakeAdminBtn');
      if (!email) { if (msgEl) { msgEl.textContent = 'Enter your account email first.'; msgEl.style.color = '#ff6b7a'; } return; }

      btn.disabled    = true;
      btn.textContent = 'Promoting…';
      if (msgEl) { msgEl.textContent = ''; }

      try {
        const res  = await fetch('http://localhost:3001/api/dev/promote-admin', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email, devKey: 'topdown-local-dev' }),
        });
        const data = await res.json();
        if (data.success) {
          if (msgEl) { msgEl.textContent = `✅ ${data.username} is now admin. Log in to activate.`; msgEl.style.color = '#6bff7b'; }
        } else {
          if (msgEl) { msgEl.textContent = `❌ ${data.error}`; msgEl.style.color = '#ff6b7a'; }
        }
      } catch (e) {
        if (msgEl) { msgEl.textContent = '❌ Could not reach local server.'; msgEl.style.color = '#ff6b7a'; }
      }

      btn.disabled    = false;
      btn.textContent = '⚡ MAKE ADMIN (local only)';
    });
  }

  // ── Logout ──────────────────────────────────────────────────
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    if (typeof resetAnnouncementSession === 'function') resetAnnouncementSession();
    await handleLogout();
    isGuest = false;
    if (typeof window.chatRefreshVisibility === 'function') window.chatRefreshVisibility();
    showAuthModal();
  });

  // ── Leaderboard ─────────────────────────────────────────────
  document.getElementById('leaderboardBtn')?.addEventListener('click', () => {
    document.getElementById('homeScreen')?.classList.add('hidden');
    document.getElementById('leaderboardPanel')?.classList.remove('hidden');
    displayLeaderboard('allTime');
  });

  document.getElementById('leaderboardBackBtn')?.addEventListener('click', () => {
    document.getElementById('leaderboardPanel')?.classList.add('hidden');
    document.getElementById('homeScreen')?.classList.remove('hidden');
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      displayLeaderboard(btn.dataset.filter);
    });
  });

  // ── Support ──────────────────────────────────────────────────
  document.getElementById('supportBtn')?.addEventListener('click', () => {
    document.getElementById('homeScreen')?.classList.add('hidden');
    document.getElementById('supportPanel')?.classList.remove('hidden');
    const authWarning = document.getElementById('supportAuthWarning');
    const form        = document.getElementById('supportForm');
    const isLoggedIn  = !isGuest && currentUser;
    authWarning?.classList.toggle('hidden', isLoggedIn);
    form?.classList.toggle('hidden', !isLoggedIn);
  });

  document.getElementById('supportBackBtn')?.addEventListener('click', () => {
    document.getElementById('supportPanel')?.classList.add('hidden');
    document.getElementById('homeScreen')?.classList.remove('hidden');
  });

  document.getElementById('supportForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type        = document.getElementById('reportType').value;
    const subject     = document.getElementById('reportSubject').value.trim();
    const description = document.getElementById('reportDescription').value.trim();
    const msgEl       = document.getElementById('supportMsg');
    const btn         = document.getElementById('submitReportBtn');

    function showSupportMsg(text, ok) {
      msgEl.textContent        = text;
      msgEl.style.background   = ok ? 'rgba(107,255,123,0.15)' : 'rgba(255,71,87,0.15)';
      msgEl.style.borderColor  = ok ? 'rgba(107,255,123,0.4)'  : 'rgba(255,71,87,0.4)';
      msgEl.style.color        = ok ? '#6bff7b'                : '#ff6b7a';
      msgEl.classList.remove('hidden');
    }

    if (!subject || !description) {
      showSupportMsg('Please fill in all fields.', false);
      return;
    }

    btn.textContent = 'Sending...';
    btn.disabled    = true;
    msgEl.classList.add('hidden');

    const result = await submitReport(type, subject, description);

    if (result.success) {
      showSupportMsg('✅ Report submitted! We review every report.', true);
      document.getElementById('reportSubject').value     = '';
      document.getElementById('reportDescription').value = '';
    } else {
      showSupportMsg(result.error || 'Failed to submit. Please try again.', false);
    }

    btn.textContent = '📨 SUBMIT REPORT';
    btn.disabled    = false;
  });

  // ── Update logs ─────────────────────────────────────────────
  document.getElementById('updateLogsBtn')?.addEventListener('click', () => {
    document.getElementById('homeScreen')?.classList.add('hidden');
    document.getElementById('updateLogsPanel')?.classList.remove('hidden');
  });

  document.getElementById('updateLogsBackBtn')?.addEventListener('click', () => {
    document.getElementById('updateLogsPanel')?.classList.add('hidden');
    document.getElementById('homeScreen')?.classList.remove('hidden');
  });

  // ── Achievements ─────────────────────────────────────────────
  document.getElementById('achievementsBtn')?.addEventListener('click', () => {
    document.getElementById('homeScreen')?.classList.add('hidden');
    document.getElementById('achievementsPanel')?.classList.remove('hidden');
    if (typeof renderAchievementsPanel === 'function') renderAchievementsPanel();
  });

  document.getElementById('achievementsBackBtn')?.addEventListener('click', () => {
    document.getElementById('achievementsPanel')?.classList.add('hidden');
    document.getElementById('homeScreen')?.classList.remove('hidden');
  });

  // ── Admin panel ─────────────────────────────────────────────
  document.getElementById('adminBtn')?.addEventListener('click', () => {
    if (!isAdmin) return;
    document.getElementById('homeScreen')?.classList.add('hidden');
    document.getElementById('adminPanel')?.classList.remove('hidden');
    displayBannedUsers();
  });

  document.getElementById('adminBackBtn')?.addEventListener('click', () => {
    document.getElementById('adminPanel')?.classList.add('hidden');
    document.getElementById('homeScreen')?.classList.remove('hidden');
  });

  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(`adminTab-${targetTab}`)?.classList.remove('hidden');

      if (targetTab === 'ban')      displayBannedUsers();
      if (targetTab === 'users')    displayAllUsers();
      if (targetTab === 'scores')   { displayScoresAdmin(); displayCoinsScoresAdmin(); displayLevelScoresAdmin(); }
      if (targetTab === 'logs')     displayActivityLogs();
      if (targetTab === 'announce') displayRecentAnnouncements();
      if (targetTab === 'stats')    displayPlatformStats();
      if (targetTab === 'flags')    displayFlaggedScores();
      if (targetTab === 'devconsole' && typeof devCheckCreatorStatus === 'function') devCheckCreatorStatus();
      if (targetTab === 'market' && typeof adminMpInitSkinDropdown === 'function') { adminMpInitSkinDropdown(); adminMpLoadWhitelist(); }
      if (targetTab === 'skins'    && typeof adminInitSkinGiveDropdown === 'function') adminInitSkinGiveDropdown();
      if (targetTab === 'reports'  && typeof adminLoadReports === 'function') adminLoadReports('open');
      if (targetTab === 'ranked'   && typeof adminRankedLoadLb === 'function') adminRankedLoadLb();
    });
  });

  document.getElementById('banUserBtn')?.addEventListener('click', async () => {
    const userId  = document.getElementById('banUserId').value.trim();
    const reason  = document.getElementById('banReason').value.trim();
    if (!userId) { showAdminMessage('Please enter a user ID', true); return; }
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

  // ── User search filter ───────────────────────────────────────
  document.getElementById('userSearchInput')?.addEventListener('input', function() {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.admin-user-entry').forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = text.includes(q) ? '' : 'none';
    });
  });

});

console.log('✅ ui.js loaded');