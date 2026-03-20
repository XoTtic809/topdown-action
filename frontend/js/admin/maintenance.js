// maintenance.js
// Shows a full-screen maintenance warning to all non-admin players.
// Admins can bypass by clicking the version text 3 times and entering their credentials.
// To disable maintenance: set MAINTENANCE_MODE = false and push.

const MAINTENANCE_MODE = false;

const MAINTENANCE_CONFIG = {
  title:       '⚠️ DATABASE MIGRATION IN PROGRESS',
  subtitle:    'Estimated downtime: 2-3 days',
  message:     `I am currently switching from Firebase to my new self-hosted database.\n\nAll player data, skins, coins, scores, and marketplace listings will not be transferred.\n\nI apologize for the inconvenience. Please check back shortly.`,
  startedAt:   'February 19, 2026',
  statusItems: [
    { label: 'Auth & Login',         done: true },
    { label: 'Scores & Leaderboard', done: true },
    { label: 'Skins & Marketplace',  done: true },
    { label: 'Battle Pass & Crates', done: true },
    { label: 'Announcements',        done: true },
    { label: 'Full Firebase Removal',done: true },
  ],
  discordUrl:  null,   // optional: 'https://discord.gg/yourserver'
};

(function() {
  if (!MAINTENANCE_MODE) return;

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    #maintenanceOverlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: #060a12;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Segoe UI', sans-serif;
      overflow-y: auto;
      cursor: default !important;
    }
    #maintenanceOverlay * {
      cursor: default !important;
    }
    #adminBypassBtn {
      cursor: pointer !important;
    }
    #adminBypassEmail, #adminBypassPass {
      cursor: text !important;
    }
    #maintenanceBox {
      max-width: 520px;
      width: 90%;
      margin: 40px auto;
      background: rgba(255,180,0,0.04);
      border: 2px solid rgba(255,180,0,0.35);
      border-radius: 16px;
      padding: 40px 36px;
      text-align: center;
      box-shadow: 0 0 60px rgba(255,160,0,0.08);
    }
    #maintenanceIcon {
      font-size: 56px;
      margin-bottom: 16px;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%,100% { opacity:1; transform:scale(1); }
      50%      { opacity:0.7; transform:scale(0.95); }
    }
    #maintenanceTitle {
      font-size: 20px;
      font-weight: 800;
      color: #ffcc00;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }
    #maintenanceSubtitle {
      font-size: 13px;
      color: rgba(255,200,0,0.6);
      margin-bottom: 24px;
      letter-spacing: 0.5px;
    }
    #maintenanceMessage {
      font-size: 14px;
      color: #b0bdd0;
      line-height: 1.7;
      white-space: pre-line;
      margin-bottom: 28px;
      text-align: left;
      background: rgba(0,0,0,0.25);
      border-radius: 10px;
      padding: 16px 18px;
    }
    #maintenanceStatus {
      text-align: left;
      margin-bottom: 28px;
    }
    #maintenanceStatus .status-title {
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .status-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: #8899aa;
      padding: 5px 0;
    }
    .status-item .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .status-item .dot.done    { background: #6bff7b; box-shadow: 0 0 6px #6bff7b; }
    .status-item .dot.pending { background: #ffaa00; box-shadow: 0 0 6px #ffaa00; animation: pulse 1.5s ease-in-out infinite; }
    #maintenanceFooter {
      font-size: 11px;
      color: rgba(255,255,255,0.2);
      margin-top: 8px;
      cursor: default;
      user-select: none;
    }
    #maintenanceDiscord {
      display: inline-block;
      margin-top: 16px;
      padding: 10px 24px;
      background: rgba(88,101,242,0.15);
      border: 1px solid rgba(88,101,242,0.4);
      border-radius: 8px;
      color: #7289da;
      font-size: 13px;
      text-decoration: none;
      font-weight: 600;
    }
    #maintenanceDiscord:hover { background: rgba(88,101,242,0.25); }
    /* Admin bypass form */
    #adminBypass {
      display: none;
      margin-top: 24px;
      padding: 16px;
      background: rgba(107,255,123,0.05);
      border: 1px solid rgba(107,255,123,0.2);
      border-radius: 10px;
      text-align: left;
    }
    #adminBypass p {
      font-size: 11px;
      color: rgba(107,255,123,0.7);
      margin-bottom: 10px;
      text-align: center;
      letter-spacing: 0.5px;
    }
    #adminBypassEmail, #adminBypassPass {
      width: 100%;
      box-sizing: border-box;
      background: rgba(0,0,0,0.4);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #fff;
      padding: 9px 12px;
      font-size: 13px;
      margin-bottom: 8px;
      outline: none;
    }
    #adminBypassBtn {
      width: 100%;
      padding: 10px;
      background: rgba(107,255,123,0.15);
      border: 1px solid rgba(107,255,123,0.4);
      border-radius: 6px;
      color: #6bff7b;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      letter-spacing: 0.5px;
    }
    #adminBypassBtn:hover { background: rgba(107,255,123,0.25); }
    #adminBypassError {
      font-size: 11px;
      color: #ff6b7a;
      margin-top: 6px;
      display: none;
      text-align: center;
    }
  `;
  document.head.appendChild(style);

  // Build overlay HTML
  const overlay = document.createElement('div');
  overlay.id = 'maintenanceOverlay';

  const statusHTML = MAINTENANCE_CONFIG.statusItems.map(item => `
    <div class="status-item">
      <div class="dot ${item.done ? 'done' : 'pending'}"></div>
      <span style="color:${item.done ? '#dbe7ff' : '#8899aa'}">${item.label}</span>
      <span style="margin-left:auto;font-size:11px;color:${item.done ? '#6bff7b' : '#ffaa00'}">
        ${item.done ? '✓ Done' : '⟳ Pending'}
      </span>
    </div>
  `).join('');

  const discordHTML = MAINTENANCE_CONFIG.discordUrl
    ? `<a href="${MAINTENANCE_CONFIG.discordUrl}" target="_blank" id="maintenanceDiscord">💬 Join Discord for updates</a>`
    : '';

  overlay.innerHTML = `
    <div id="maintenanceBox">
      <div id="maintenanceIcon">🔧</div>
      <div id="maintenanceTitle">${MAINTENANCE_CONFIG.title}</div>
      <div id="maintenanceSubtitle">${MAINTENANCE_CONFIG.subtitle}</div>
      <div id="maintenanceMessage">${MAINTENANCE_CONFIG.message}</div>
      <div id="maintenanceStatus">
        <div class="status-title">Migration Progress</div>
        ${statusHTML}
      </div>
      ${discordHTML}
      <div id="adminBypass">
        <p>🔑 ADMIN ACCESS</p>
        <input id="adminBypassEmail" type="email"    placeholder="Admin email"    autocomplete="off" />
        <input id="adminBypassPass"  type="password" placeholder="Password"       autocomplete="off" />
        <button id="adminBypassBtn">ENTER AS ADMIN</button>
        <div id="adminBypassError"></div>
      </div>
      <div id="maintenanceFooter">Started: ${MAINTENANCE_CONFIG.startedAt} · v2.0 migration</div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Force system cursor visible while maintenance screen is showing
  document.body.style.cursor = 'default';
  document.documentElement.style.cursor = 'default';

  // ── Secret admin bypass: click footer 3 times ──
  let footerClicks = 0;
  document.getElementById('maintenanceFooter').addEventListener('click', () => {
    footerClicks++;
    if (footerClicks >= 3) {
      document.getElementById('adminBypass').style.display = 'block';
      footerClicks = 0;
    }
  });

  // ── Admin login attempt ──
  document.getElementById('adminBypassBtn').addEventListener('click', async () => {
    const email    = document.getElementById('adminBypassEmail').value.trim();
    const password = document.getElementById('adminBypassPass').value;
    const errorEl  = document.getElementById('adminBypassError');
    const btn      = document.getElementById('adminBypassBtn');

    if (!email || !password) {
      errorEl.textContent = 'Please enter email and password';
      errorEl.style.display = 'block';
      return;
    }

    btn.textContent  = 'Checking...';
    btn.disabled     = true;
    errorEl.style.display = 'none';

    try {
      const _mBase = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3001/api'
        : 'https://web-production-144da.up.railway.app/api';
      const res  = await fetch(`${_mBase}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (data.error) {
        errorEl.textContent   = data.error;
        errorEl.style.display = 'block';
        btn.textContent       = 'ENTER AS ADMIN';
        btn.disabled          = false;
        return;
      }

      if (!data.isAdmin) {
        errorEl.textContent   = 'This account does not have admin access.';
        errorEl.style.display = 'block';
        btn.textContent       = 'ENTER AS ADMIN';
        btn.disabled          = false;
        return;
      }

      // Admin verified — store token and remove overlay
      localStorage.setItem('topdown_token', data.token);
      overlay.style.transition = 'opacity 0.4s';
      overlay.style.opacity    = '0';
      setTimeout(() => {
        overlay.remove();
        // Restore cursor to none so game custom cursor works
        document.body.style.cursor = '';
        document.documentElement.style.cursor = '';
      }, 400);

    } catch (err) {
      errorEl.textContent   = 'Connection failed. Try again.';
      errorEl.style.display = 'block';
      btn.textContent       = 'ENTER AS ADMIN';
      btn.disabled          = false;
    }
  });

  // Allow Enter key to submit
  ['adminBypassEmail','adminBypassPass'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('adminBypassBtn').click();
    });
  });

})();