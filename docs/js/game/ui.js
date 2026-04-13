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
  const adminBtn        = document.getElementById('adminBtn');

  if (userStatus)      userStatus.classList.remove('hidden');
  if (adminBtn)        adminBtn.classList.toggle('hidden', !isAdmin);

  // Update lobby bar
  const name = currentUser.displayName || currentUser.email;
  const lbarName = document.getElementById('lbarUsername');
  if (lbarName) lbarName.textContent = name;
  const lbarCoins = document.getElementById('lbarCoins');
  if (lbarCoins) lbarCoins.textContent = playerCoins;

  // Hide guest auth prompt in play tab, show sidebar
  document.getElementById('playGuestAuth')?.classList.add('hidden');
  document.getElementById('playSidebar')?.classList.remove('hidden');

  // Render equipped skin as avatar
  _renderHomeAvatar();

  document.getElementById('homeScreen')?.classList.remove('hidden');
  if (typeof switchLobbyTab === 'function') switchLobbyTab('play');
  // Refresh chat widget visibility now that the user is logged in
  if (typeof window.chatRefreshVisibility === 'function') window.chatRefreshVisibility();
}

function updateUIForGuest() {
  hideAuthModal();
  isGuest = true;

  document.getElementById('userStatus')?.classList.add('hidden');
  document.getElementById('adminBtn')?.classList.add('hidden');

  // Restore guest data from localStorage so returning guests keep their progress.
  high        = Number(localStorage.getItem('highscore')  || 0);
  playerCoins = Number(localStorage.getItem('playerCoins') || 0);
  ownedSkins  = JSON.parse(localStorage.getItem('ownedSkins')  || '["agent"]');
  activeSkin  = localStorage.getItem('activeSkin') || 'agent';

  document.getElementById('homeHighVal').textContent  = high;
  document.getElementById('homeCoinsVal').textContent = playerCoins;

  // Update lobby bar for guest
  const lbarName = document.getElementById('lbarUsername');
  if (lbarName) lbarName.textContent = 'Guest';
  const lbarCoins = document.getElementById('lbarCoins');
  if (lbarCoins) lbarCoins.textContent = playerCoins;

  // Show guest auth prompt in play tab, hide sidebar stats
  document.getElementById('playGuestAuth')?.classList.remove('hidden');

  document.getElementById('homeScreen')?.classList.remove('hidden');
  if (typeof switchLobbyTab === 'function') switchLobbyTab('play');
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

  // ── Guest (auth modal) ────────────────────────────────────
  document.getElementById('playGuestBtn')?.addEventListener('click', () => {
    updateUIForGuest();
    setTimeout(checkForNewAnnouncements, 800);
  });

  // ── Guest (lobby play tab prompt) ─────────────────────────
  document.getElementById('lobbyGuestBtn')?.addEventListener('click', () => {
    updateUIForGuest();
    setTimeout(checkForNewAnnouncements, 800);
  });

  // ── Login/signup from lobby play tab ──────────────────────
  document.getElementById('playLoginBtn')?.addEventListener('click', () => {
    showAuthModal();
    // Switch to login tab
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.auth-tab[data-tab="login"]')?.classList.add('active');
    document.getElementById('loginForm')?.classList.remove('hidden');
    document.getElementById('signupForm')?.classList.add('hidden');
  });
  document.getElementById('playSignupBtn')?.addEventListener('click', () => {
    showAuthModal();
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.auth-tab[data-tab="signup"]')?.classList.add('active');
    document.getElementById('loginForm')?.classList.add('hidden');
    document.getElementById('signupForm')?.classList.remove('hidden');
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
      btn.textContent = 'Promoting\u2026';
      if (msgEl) { msgEl.textContent = ''; }

      try {
        const res  = await fetch('http://localhost:3001/api/dev/promote-admin', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email, devKey: 'topdown-local-dev' }),
        });
        const data = await res.json();
        if (data.success) {
          if (msgEl) { msgEl.textContent = `\u2705 ${data.username} is now admin. Log in to activate.`; msgEl.style.color = '#6bff7b'; }
        } else {
          if (msgEl) { msgEl.textContent = `\u274c ${data.error}`; msgEl.style.color = '#ff6b7a'; }
        }
      } catch (e) {
        if (msgEl) { msgEl.textContent = '\u274c Could not reach local server.'; msgEl.style.color = '#ff6b7a'; }
      }

      btn.disabled    = false;
      btn.textContent = '\u26a1 MAKE ADMIN (local only)';
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

  // ── Leaderboard filter buttons (inside compete tab) ────────
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      displayLeaderboard(btn.dataset.filter);
    });
  });

  // ── Support form ───────────────────────────────────────────
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
      showSupportMsg('\u2705 Report submitted! We review every report.', true);
      document.getElementById('reportSubject').value     = '';
      document.getElementById('reportDescription').value = '';
    } else {
      showSupportMsg(result.error || 'Failed to submit. Please try again.', false);
    }

    btn.textContent = '\ud83d\udce8 SUBMIT REPORT';
    btn.disabled    = false;
  });

  // ── Support tab auth check ─────────────────────────────────
  // When switching to support tab, show/hide form vs auth warning
  const _origSwitchLobbyTab = typeof switchLobbyTab === 'function' ? switchLobbyTab : null;
  if (_origSwitchLobbyTab) {
    const _patchedSwitch = window.switchLobbyTab;
    // We'll use a MutationObserver or just check on tab show
  }
  // Simpler: check on form visibility when support tab becomes visible
  const supportObserver = new MutationObserver(() => {
    const supportTab = document.getElementById('lobbyTab-support');
    if (supportTab && !supportTab.classList.contains('hidden')) {
      const authWarning = document.getElementById('supportAuthWarning');
      const form        = document.getElementById('supportForm');
      const isLoggedIn  = !isGuest && typeof currentUser !== 'undefined' && currentUser;
      authWarning?.classList.toggle('hidden', !!isLoggedIn);
      form?.classList.toggle('hidden', !isLoggedIn);
    }
  });
  const supportTab = document.getElementById('lobbyTab-support');
  if (supportTab) supportObserver.observe(supportTab, { attributes: true, attributeFilter: ['class'] });

  // ── Admin panel ─────────────────────────────────────────────
  document.getElementById('myProfileBtn')?.addEventListener('click', () => {
    if (typeof openOwnProfileCard === 'function') openOwnProfileCard();
  });

  document.getElementById('adminBtn')?.addEventListener('click', () => {
    if (!isAdmin) return;
    document.getElementById('adminPanel')?.classList.remove('hidden');
    displayBannedUsers();
  });

  document.getElementById('adminBackBtn')?.addEventListener('click', () => {
    document.getElementById('adminPanel')?.classList.add('hidden');
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
      if (targetTab === 'devconsole' && typeof devLoadCasinoFlag === 'function') devLoadCasinoFlag();
      if (targetTab === 'market' && typeof adminMpInitSkinDropdown === 'function') { adminMpInitSkinDropdown(); adminMpLoadWhitelist(); }
      if (targetTab === 'skins'    && typeof adminInitSkinGiveDropdown === 'function') adminInitSkinGiveDropdown();
      if (targetTab === 'reports'  && typeof adminLoadReports === 'function') adminLoadReports('open');
      if (targetTab === 'ranked'   && typeof adminRankedLoadLb === 'function') adminRankedLoadLb();
      if (targetTab === 'rotation' && typeof initRotationManager === 'function') initRotationManager();
      if (targetTab === 'profile'  && typeof initAdminProfileTab === 'function') initAdminProfileTab();
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

// ── Lobby bar avatar skin preview ───────────────────────────
function _renderHomeAvatar() {
  const el = document.getElementById('lbarAvatarSkin');
  if (!el) return;
  const skin = typeof activeSkin !== 'undefined' ? activeSkin : 'agent';
  if (typeof applyRichSkinPreview === 'function') {
    el.textContent = '';
    el.style.overflow = 'hidden';
    const skinData = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === skin) : null;
    applyRichSkinPreview(el, skin, skinData ? skinData.color : null);
  }
}

console.log('\u2705 ui.js loaded');
