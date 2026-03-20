// chat.js — Global chat widget + admin panel
// Rules:
//  1. Must be logged in (JWT token required — guests cannot chat).
//  2. Must opt in via Settings — chat is OFF by default.
//  3. Admin can globally kill chat, set read-only, toggle filter, toggle quick chat.
//  4. Quick chat works even in read-only mode (if admin has it enabled).

(function () {

  // ── Connection URL ─────────────────────────────────────────
  const SOCKET_URL = (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  )
    ? 'http://localhost:3001'
    : 'https://topdown-action-production-8a95.up.railway.app';

  // ── Quick-chat predefined buttons (must match server QUICK_MESSAGES) ──
  const QUICK_MSGS = [
    { id: 'gg',       label: '👍 GG!' },
    { id: 'wp',       label: '💪 Well played' },
    { id: 'gl',       label: '🍀 Good luck' },
    { id: 'help',     label: '🆘 Help!' },
    { id: 'nice',     label: '🔥 Nice shot' },
    { id: 'watchout', label: '⚠️ Watch out' },
    { id: 'letsgo',   label: '🚀 Let\'s go' },
    { id: 'ez',       label: '😂 ez pz' },
  ];

  // ── Auth helpers ───────────────────────────────────────────
  function getToken()   { return localStorage.getItem('topdown_token') || null; }
  function isLoggedIn() { return !!getToken() && !(typeof isGuest !== 'undefined' && isGuest); }

  // ── Opt-in / approval helpers ──────────────────────────────
  function isChatOptedIn() {
    // Migrate legacy key — existing opt-ins must go through the new request flow
    if (localStorage.getItem('chat_opted_in') === '1' && !localStorage.getItem('chat_approved')) {
      localStorage.removeItem('chat_opted_in');
    }
    return localStorage.getItem('chat_approved') === '1';
  }
  function setOptIn(val) {
    if (val) {
      localStorage.setItem('chat_approved', '1');
      localStorage.removeItem('chat_request_status');
      localStorage.removeItem('chat_opted_in');
    } else {
      localStorage.removeItem('chat_approved');
      localStorage.removeItem('chat_request_status');
      localStorage.removeItem('chat_opted_in');
    }
  }
  function getRequestStatus() { return localStorage.getItem('chat_request_status') || 'none'; }
  function setRequestStatus(s) {
    if (s === 'none') localStorage.removeItem('chat_request_status');
    else localStorage.setItem('chat_request_status', s);
  }

  // ── State ──────────────────────────────────────────────────
  let socket           = null;
  let connected        = false;
  let chatEnabled      = true;
  let filterOn         = true;
  let readOnly         = false;
  let quickChatEnabled = true;
  let collapsed        = false;
  let muteUntil        = 0;    // epoch ms, 0 = not muted
  let muteTimerHandle  = null;

  // ── DOM refs ───────────────────────────────────────────────
  let widgetEl, headerEl, bodyEl, messagesEl, disabledEl,
      inputEl, sendBtnEl, onlineCntEl, toggleIconEl,
      statusBarEl, quickChatEl;

  // Admin panel refs
  let adminMessagesEl, adminChatToggleBtn, adminFilterToggleBtn,
      adminReadonlyToggleBtn, adminQCToggleBtn, adminClearBtn,
      adminStatusEl, adminFilterStatusEl, adminReadonlyStatusEl, adminQCStatusEl;

  // ── Init ───────────────────────────────────────────────────
  function init() {
    widgetEl     = document.getElementById('chatWidget');
    headerEl     = document.getElementById('chatHeader');
    bodyEl       = document.getElementById('chatBody');
    messagesEl   = document.getElementById('chatMessages');
    disabledEl   = document.getElementById('chatDisabledOverlay');
    inputEl      = document.getElementById('chatInput');
    sendBtnEl    = document.getElementById('chatSendBtn');
    onlineCntEl  = document.getElementById('chatOnlineCnt');
    toggleIconEl = document.getElementById('chatToggleIcon');
    statusBarEl  = document.getElementById('chatStatusBar');
    quickChatEl  = document.getElementById('chatQuickBtns');

    adminMessagesEl         = document.getElementById('adminChatMessages');
    adminChatToggleBtn      = document.getElementById('adminChatToggleBtn');
    adminFilterToggleBtn    = document.getElementById('adminFilterToggleBtn');
    adminReadonlyToggleBtn  = document.getElementById('adminReadonlyToggleBtn');
    adminQCToggleBtn        = document.getElementById('adminQCToggleBtn');
    adminClearBtn           = document.getElementById('adminChatClearBtn');
    adminStatusEl           = document.getElementById('adminChatStatus');
    adminFilterStatusEl     = document.getElementById('adminFilterStatus');
    adminReadonlyStatusEl   = document.getElementById('adminReadonlyStatus');
    adminQCStatusEl         = document.getElementById('adminQCStatus');

    if (!widgetEl) return;

    // Build quick chat buttons
    buildQuickChatButtons();

    // Header click → collapse/expand
    headerEl.addEventListener('click', (e) => {
      if (e.target === inputEl || e.target === sendBtnEl) return;
      if (e.target.closest('.chat-quick-btn')) return;
      toggleCollapse();
    });

    sendBtnEl.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Admin controls
    adminChatToggleBtn?.addEventListener('click',     adminToggleChat);
    adminFilterToggleBtn?.addEventListener('click',   adminToggleFilter);
    adminReadonlyToggleBtn?.addEventListener('click', adminToggleReadonly);
    adminQCToggleBtn?.addEventListener('click',       adminToggleQC);
    adminClearBtn?.addEventListener('click',          adminClearMessages);

    document.getElementById('chatOptInBtn')?.addEventListener('click', () => {
      if (isChatOptedIn()) requestOptOut();
      else requestOptIn();
    });

    document.getElementById('adminChatRequestsRefreshBtn')
      ?.addEventListener('click', loadAdminChatRequests);

    // Load requests panel if admin panel is already open on this tab
    loadAdminChatRequests();

    // Check if a pending request was approved while the user was away
    checkMyRequestStatus();
    setInterval(checkMyRequestStatus, 60_000);

    observeHomeScreen();
    connectSocket();
  }

  // ── Quick chat button builder ──────────────────────────────
  function buildQuickChatButtons() {
    if (!quickChatEl) return;
    quickChatEl.innerHTML = '';
    QUICK_MSGS.forEach(({ id, label }) => {
      const btn = document.createElement('button');
      btn.className        = 'chat-quick-btn';
      btn.textContent      = label;
      btn.dataset.quickId  = id;
      btn.addEventListener('click', () => sendQuickChat(id));
      quickChatEl.appendChild(btn);
    });
  }

  // ── Widget visibility ──────────────────────────────────────
  function refreshWidgetVisibility() {
    if (!widgetEl) return;
    const homeEl      = document.getElementById('homeScreen');
    const homeVisible = homeEl && !homeEl.classList.contains('hidden');
    const show = homeVisible && isLoggedIn() && isChatOptedIn();
    widgetEl.style.display = show ? '' : 'none';
    if (show) applyModeUI();

    // Admins get chat access automatically — no request needed
    if (isLoggedIn() && typeof isAdmin !== 'undefined' && isAdmin && !isChatOptedIn()) {
      setOptIn(true);
    }

    // Show the entire chat setting row only when logged in
    const settingRow = document.getElementById('chatSettingRow');
    if (settingRow) settingRow.style.display = isLoggedIn() ? '' : 'none';

    // Update the button and hint text
    const btnEl  = document.getElementById('chatOptInBtn');
    const hintEl = document.getElementById('chatOptInHint');
    const reqStatus = getRequestStatus();

    if (btnEl) {
      if (isChatOptedIn()) {
        btnEl.textContent = 'Leave Chat';
        btnEl.className   = 'admin-action-btn warning';
        btnEl.style.cssText = 'padding:6px 14px;font-size:11px;white-space:nowrap;';
        btnEl.disabled    = false;
      } else if (reqStatus === 'pending') {
        btnEl.textContent = 'Pending…';
        btnEl.className   = 'admin-action-btn reset';
        btnEl.style.cssText = 'padding:6px 14px;font-size:11px;white-space:nowrap;opacity:0.6;';
        btnEl.disabled    = true;
      } else {
        btnEl.textContent = 'Request Access';
        btnEl.className   = 'admin-action-btn success';
        btnEl.style.cssText = 'padding:6px 14px;font-size:11px;white-space:nowrap;';
        btnEl.disabled    = false;
      }
    }

    if (hintEl) {
      if (isChatOptedIn()) {
        hintEl.textContent = 'Chat visible on home screen';
        hintEl.style.color = '';
      } else if (reqStatus === 'pending') {
        hintEl.textContent = '⏳ Request pending — awaiting admin approval';
        hintEl.style.color = '#fdcb6e';
      } else if (reqStatus === 'denied') {
        hintEl.textContent = '❌ Request denied — contact support';
        hintEl.style.color = '#ff7675';
      } else {
        hintEl.textContent = 'Request access to join the live chat';
        hintEl.style.color = '';
      }
    }
  }

  function observeHomeScreen() {
    const homeEl = document.getElementById('homeScreen');
    if (!homeEl) return;
    refreshWidgetVisibility();
    const obs = new MutationObserver(refreshWidgetVisibility);
    obs.observe(homeEl, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('storage', refreshWidgetVisibility);
  }

  // ── Apply correct UI for current mode ─────────────────────
  // Modes: disabled | readonly | muted | normal
  function applyModeUI() {
    if (!inputEl || !sendBtnEl || !disabledEl || !quickChatEl) return;

    const now = Date.now();
    const isMuted = muteUntil > now;

    // Quick chat area — visible when quickChatEnabled AND (chat disabled OR readonly OR normal)
    const showQuick = quickChatEnabled && isLoggedIn();
    quickChatEl.style.display = showQuick ? '' : 'none';

    // Disable quick buttons while muted
    quickChatEl.querySelectorAll('.chat-quick-btn').forEach(b => {
      b.disabled = isMuted;
    });

    if (!chatEnabled) {
      // Chat fully disabled — hide text input, show disabled overlay
      disabledEl.textContent    = '🚫 Chat is currently offline';
      disabledEl.classList.remove('hidden');
      inputEl.style.display     = 'none';
      sendBtnEl.style.display   = 'none';
    } else if (readOnly) {
      // Read-only — hide text input, show read-only notice
      disabledEl.textContent    = '📖 Read-only — use quick chat below';
      disabledEl.classList.remove('hidden');
      inputEl.style.display     = 'none';
      sendBtnEl.style.display   = 'none';
    } else if (isMuted) {
      // Muted — disable input, show countdown in status bar
      disabledEl.classList.add('hidden');
      inputEl.style.display     = '';
      sendBtnEl.style.display   = '';
      inputEl.disabled          = true;
      sendBtnEl.disabled        = true;
      startMuteCountdown();
    } else {
      // Normal
      disabledEl.classList.add('hidden');
      inputEl.style.display     = '';
      sendBtnEl.style.display   = '';
      inputEl.disabled          = false;
      sendBtnEl.disabled        = false;
      clearStatusBar();
    }
  }

  // ── Mute countdown timer ───────────────────────────────────
  function startMuteCountdown() {
    if (muteTimerHandle) clearInterval(muteTimerHandle);

    const tick = () => {
      const secsLeft = Math.ceil((muteUntil - Date.now()) / 1000);
      if (secsLeft <= 0) {
        muteUntil = 0;
        clearInterval(muteTimerHandle);
        muteTimerHandle = null;
        applyModeUI();
        clearStatusBar();
        return;
      }
      setStatusBar(`🔇 Muted — ${secsLeft}s remaining`);
    };

    tick();
    muteTimerHandle = setInterval(tick, 1000);
  }

  function setStatusBar(text) {
    if (!statusBarEl) return;
    statusBarEl.textContent  = text;
    statusBarEl.style.display = 'block';
  }

  function clearStatusBar() {
    if (!statusBarEl) return;
    statusBarEl.textContent  = '';
    statusBarEl.style.display = 'none';
  }

  // ── Opt-in flow ────────────────────────────────────────────
  function requestOptIn() {
    if (getRequestStatus() === 'pending') return; // already waiting
    showOptInWarning(async () => {
      const token = getToken();
      if (!token) return;
      try {
        const res  = await fetch(`${API_BASE}/chat/request`, {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.status === 'approved') {
          setOptIn(true); // edge case: already approved in DB
        } else {
          setRequestStatus('pending');
        }
      } catch (e) {
        console.warn('[Chat] Request submit failed:', e.message);
      }
      refreshWidgetVisibility();
    });
  }

  function requestOptOut() {
    setOptIn(false);
    refreshWidgetVisibility();
  }

  function showOptInWarning(onConfirm) {
    const existing = document.getElementById('chatOptInWarningOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'chatOptInWarningOverlay';
    overlay.innerHTML = `
      <div class="chat-warn-box">
        <div class="chat-warn-icon">⚠️</div>
        <div class="chat-warn-title">CHAT ACCESS REQUEST</div>
        <div class="chat-warn-body">
          Global Chat is a <strong>live, public channel</strong> visible to every player.
          All messages are permanently logged and reviewed by moderators.
          <ul class="chat-warn-list">
            <li>You must be <strong>13 or older</strong> to participate</li>
            <li>Hate speech, harassment, or threats → <strong>permanent ban</strong></li>
            <li>Spam or flooding → <strong>auto-mute then ban</strong></li>
            <li>Never share personal information (name, school, location)</li>
            <li>Keep content appropriate and game-related</li>
          </ul>
          Your request will be reviewed by an admin before chat is enabled.
        </div>
        <label style="display:flex;align-items:flex-start;gap:8px;margin:12px 0 4px;cursor:pointer;font-size:12px;line-height:1.4;">
          <input type="checkbox" id="chatWarnCheckbox" style="margin-top:2px;flex-shrink:0;cursor:pointer;">
          <span>I have read and fully understand all the rules above. I am 13 or older and take responsibility for my messages.</span>
        </label>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button id="chatWarnCancelBtn" class="chat-warn-btn-cancel">CANCEL</button>
          <button id="chatWarnOkBtn" class="chat-warn-btn" disabled style="opacity:0.4;cursor:not-allowed;">REQUEST ACCESS</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const checkbox = document.getElementById('chatWarnCheckbox');
    const okBtn    = document.getElementById('chatWarnOkBtn');

    checkbox.addEventListener('change', () => {
      okBtn.disabled      = !checkbox.checked;
      okBtn.style.opacity = checkbox.checked ? '1' : '0.4';
      okBtn.style.cursor  = checkbox.checked ? '' : 'not-allowed';
    });

    okBtn.addEventListener('click', () => {
      if (okBtn.disabled) return;
      overlay.remove();
      onConfirm();
    });
    document.getElementById('chatWarnCancelBtn').addEventListener('click', () => overlay.remove());
  }

  // ── Request status polling ─────────────────────────────────
  // Called on init and every 60 s. Handles approval/denial notifications.
  async function checkMyRequestStatus() {
    if (isChatOptedIn()) return; // already in
    const token = getToken();
    if (!token) return;
    try {
      const res  = await fetch(`${API_BASE}/chat/my-request`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === 'approved') {
        setOptIn(true);
        refreshWidgetVisibility();
      } else if (data.status === 'pending' || data.status === 'denied') {
        setRequestStatus(data.status);
        refreshWidgetVisibility();
      }
    } catch { /* silent — don't disrupt the game */ }
  }

  // ── Admin: chat access request panel ──────────────────────
  async function loadAdminChatRequests() {
    const listEl   = document.getElementById('adminChatRequests');
    const countEl  = document.getElementById('chatRequestCount');
    if (!listEl) return;
    listEl.innerHTML = '<div style="font-size:11px;color:var(--muted);">Loading…</div>';
    try {
      const res      = await fetch(`${API_BASE}/chat/requests`, {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const requests = await res.json();
      if (countEl) countEl.textContent = requests.length ? `(${requests.length} pending)` : '';
      if (!requests.length) {
        listEl.innerHTML = '<div style="font-size:11px;color:var(--muted);">No pending requests</div>';
        return;
      }
      listEl.innerHTML = '';
      requests.forEach(r => {
        const el = document.createElement('div');
        el.dataset.requestId = r.id;
        el.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);';
        el.innerHTML = `
          <div>
            <strong style="font-size:12px;">${r.username}</strong>
            <div style="font-size:10px;color:var(--muted);margin-top:2px;">
              Score: ${Number(r.high_score).toLocaleString()} &middot;
              Joined: ${new Date(r.joined_at).toLocaleDateString()} &middot;
              Requested: ${new Date(r.created_at).toLocaleString()}
            </div>
          </div>
          <div style="display:flex;gap:5px;flex-shrink:0;">
            <button class="admin-action-btn success" style="padding:4px 8px;font-size:10px;"
                    onclick="adminApproveChatRequest('${r.id}',this)">✅ Approve</button>
            <button class="admin-action-btn danger" style="padding:4px 8px;font-size:10px;"
                    onclick="adminDenyChatRequest('${r.id}',this)">❌ Deny</button>
          </div>`;
        listEl.appendChild(el);
      });
    } catch {
      listEl.innerHTML = '<div style="font-size:11px;color:#ff7675;">Failed to load requests</div>';
    }
  }

  async function approveChatRequest(id, btnEl) {
    btnEl.disabled = true;
    try {
      await fetch(`${API_BASE}/chat/requests/${id}/approve`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      btnEl.closest('[data-request-id]')?.remove();
      loadAdminChatRequests();
    } catch { btnEl.disabled = false; }
  }

  async function denyChatRequest(id, btnEl) {
    btnEl.disabled = true;
    try {
      await fetch(`${API_BASE}/chat/requests/${id}/deny`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      btnEl.closest('[data-request-id]')?.remove();
      loadAdminChatRequests();
    } catch { btnEl.disabled = false; }
  }

  // ── Socket ─────────────────────────────────────────────────
  function connectSocket() {
    if (socket) return;
    if (typeof io !== 'function') { setTimeout(connectSocket, 500); return; }

    try {
      socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], reconnectionDelay: 2000 });
    } catch (e) {
      console.warn('[Chat] Connection failed:', e.message);
      return;
    }

    socket.on('connect',    () => { connected = true;  setOnlineCount('●'); });
    socket.on('disconnect', () => { connected = false; setOnlineCount('○'); });

    socket.on('chat:settings', (s) => {
      chatEnabled      = s.enabled;
      filterOn         = s.filterEnabled;
      readOnly         = s.readOnly;
      quickChatEnabled = s.quickChatEnabled;
      applyModeUI();
      updateAdminControls();
    });

    socket.on('chat:history', (history) => {
      if (messagesEl)      messagesEl.innerHTML = '';
      if (adminMessagesEl) adminMessagesEl.innerHTML = '';
      history.forEach(addMessage);
    });

    socket.on('chat:message', addMessage);

    socket.on('chat:deleted', (msgId) => {
      document.querySelectorAll(`[data-msg-id="${msgId}"]`).forEach(el => el.remove());
    });

    socket.on('chat:cleared', () => {
      if (messagesEl)      messagesEl.innerHTML = '';
      if (adminMessagesEl) adminMessagesEl.innerHTML = '';
    });

    socket.on('chat:muted', ({ until }) => {
      muteUntil = until;
      applyModeUI();
    });

    socket.on('chat:error', showInputError);

    // Fired when an admin approves or denies a chat request
    socket.on('chat:request-result', ({ uid, approved }) => {
      try {
        const token = getToken();
        if (!token) return;
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.uid !== uid) return;
        if (approved) {
          setOptIn(true);
        } else {
          setRequestStatus('denied');
        }
        refreshWidgetVisibility();
      } catch { /* ignore malformed token */ }
    });
  }

  // ── Message rendering ──────────────────────────────────────
  function addMessage(msg) {
    if (messagesEl) {
      messagesEl.appendChild(buildMessageEl(msg, false));
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    if (adminMessagesEl) {
      adminMessagesEl.appendChild(buildMessageEl(msg, true));
      adminMessagesEl.scrollTop = adminMessagesEl.scrollHeight;
    }
  }

  function buildMessageEl(msg, isAdminView) {
    const wrap = document.createElement('div');
    wrap.className = msg.isSystem
      ? 'chat-msg chat-msg-system'
      : (msg.isAdmin ? 'chat-msg chat-msg-admin' : 'chat-msg');
    if (msg.isQuickChat) wrap.classList.add('chat-msg-quick');
    wrap.setAttribute('data-msg-id', msg.id);

    if (msg.isSystem) {
      wrap.innerHTML = `<span class="chat-sys-text">${msg.text}</span>`;
    } else {
      const time  = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const badge = msg.isAdmin
        ? '<span class="chat-admin-badge">ADMIN</span>'
        : (msg.isQuickChat ? '<span class="chat-qc-badge">QUICK</span>' : '');
      wrap.innerHTML =
        `<span class="chat-meta">` +
          `<span class="chat-user ${msg.isAdmin ? 'chat-user-admin' : ''}">${msg.username}</span>` +
          badge +
          `<span class="chat-time">${time}</span>` +
        `</span>` +
        `<span class="chat-text">${msg.text}</span>`;

      if (isAdminView) {
        const del = document.createElement('button');
        del.className   = 'chat-del-btn';
        del.title       = 'Delete';
        del.textContent = '🗑';
        del.addEventListener('click', () => adminDeleteMessage(msg.id));
        wrap.appendChild(del);
      }
    }
    return wrap;
  }

  // ── Send ───────────────────────────────────────────────────
  function sendMessage() {
    if (!isLoggedIn()) { showInputError('You must be signed in to chat.'); return; }
    if (!socket || !connected) { showInputError('Not connected — please wait…'); return; }
    const text = inputEl.value.trim();
    if (!text) return;
    socket.emit('chat:send', { text, token: getToken() });
    inputEl.value = '';
    clearInputError();
  }

  function sendQuickChat(msgId) {
    if (!isLoggedIn()) { showInputError('Sign in to use quick chat.'); return; }
    if (!socket || !connected) { showInputError('Not connected — please wait…'); return; }
    socket.emit('chat:quick', { msgId, token: getToken() });
  }

  // ── Collapse ───────────────────────────────────────────────
  function toggleCollapse() {
    collapsed = !collapsed;
    bodyEl.style.display = collapsed ? 'none' : '';
    if (toggleIconEl) toggleIconEl.textContent = collapsed ? '▲' : '▼';
  }

  // ── Admin control UI ───────────────────────────────────────
  function updateAdminControls() {
    setPill(adminStatusEl,          chatEnabled      ? 'ONLINE'   : 'DISABLED', chatEnabled);
    setPill(adminFilterStatusEl,    filterOn         ? 'ON'       : 'OFF',      filterOn);
    setPill(adminReadonlyStatusEl,  readOnly         ? 'READ-ONLY': 'NORMAL',  !readOnly);
    setPill(adminQCStatusEl,        quickChatEnabled ? 'ON'       : 'OFF',      quickChatEnabled);

    setAdminBtn(adminChatToggleBtn,     chatEnabled,      '🚫 DISABLE CHAT',    '✅ ENABLE CHAT',     'ban', 'success');
    setAdminBtn(adminFilterToggleBtn,   filterOn,         '🔓 DISABLE FILTER',  '🔒 ENABLE FILTER',  'reset', 'success');
    setAdminBtn(adminReadonlyToggleBtn, !readOnly,        '📖 SET READ-ONLY',   '✍️ DISABLE READ-ONLY','reset', 'success');
    setAdminBtn(adminQCToggleBtn,       quickChatEnabled, '🎮 DISABLE QUICK',   '🎮 ENABLE QUICK',    'reset', 'success');
  }

  function setPill(el, text, isGood) {
    if (!el) return;
    el.textContent = text;
    el.className   = isGood ? 'chat-admin-pill on' : 'chat-admin-pill off';
  }

  function setAdminBtn(el, currentlyOn, labelIfOn, labelIfOff, classIfOn, classIfOff) {
    if (!el) return;
    el.textContent = currentlyOn ? labelIfOn : labelIfOff;
    el.className   = `admin-action-btn ${currentlyOn ? classIfOn : classIfOff}`;
  }

  function adminToggleChat()     { socket?.emit('chat:admin-toggle',            { token: getToken() }); }
  function adminToggleFilter()   { socket?.emit('chat:admin-filter-toggle',     { token: getToken() }); }
  function adminToggleReadonly() { socket?.emit('chat:admin-readonly-toggle',   { token: getToken() }); }
  function adminToggleQC()       { socket?.emit('chat:admin-quickchat-toggle',  { token: getToken() }); }
  function adminDeleteMessage(id){ socket?.emit('chat:admin-delete',            { token: getToken(), msgId: id }); }

  function adminClearMessages() {
    if (!confirm('Clear ALL chat messages? This cannot be undone.')) return;
    socket?.emit('chat:admin-clear', { token: getToken() });
  }

  // ── Input error ────────────────────────────────────────────
  function showInputError(msg) {
    let el = document.getElementById('chatInputError');
    if (!el) {
      el = document.createElement('div');
      el.id        = 'chatInputError';
      el.className = 'chat-input-error';
      bodyEl?.appendChild(el);
    }
    el.textContent   = msg;
    el.style.display = 'block';
    setTimeout(clearInputError, 3500);
  }

  function clearInputError() {
    const el = document.getElementById('chatInputError');
    if (el) el.style.display = 'none';
  }

  function setOnlineCount(text) { if (onlineCntEl) onlineCntEl.textContent = text; }

  // ── Public API ─────────────────────────────────────────────
  window.chatRequestOptIn         = requestOptIn;
  window.chatRequestOptOut        = requestOptOut;
  window.chatRefreshVisibility    = refreshWidgetVisibility;
  // Used by inline onclick handlers in the admin requests panel
  window.adminApproveChatRequest  = approveChatRequest;
  window.adminDenyChatRequest     = denyChatRequest;

  // ── Boot ───────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
