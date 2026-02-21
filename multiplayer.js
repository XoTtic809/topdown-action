// multiplayer.js
// Client-side multiplayer handler
// Connects to Railway WebSocket server, handles lobby and game state sync

const MP_SERVER = 'https://web-production-144da.up.railway.app';

let mpSocket       = null;
let mpRoom         = null;    // current room code
let mpState        = null;    // latest game state from server
let mpMySocketId   = null;
let mpConnected    = false;
let mpGameActive   = false;

// ─── Connect to server ────────────────────────────────────────
function mpConnect() {
  const token = localStorage.getItem('topdown_token');
  if (!token) {
    showMpError('You must be logged in to play multiplayer.');
    return;
  }

  if (mpSocket?.connected) return; // already connected

  mpSocket = io(MP_SERVER, {
    auth:              { token },
    reconnectionDelay: 1000,
    timeout:           10000,
  });

  mpSocket.on('connect', () => {
    mpConnected  = true;
    mpMySocketId = mpSocket.id;
    console.log('[MP] Connected:', mpSocket.id);
  });

  mpSocket.on('connect_error', (err) => {
    console.error('[MP] Connection error:', err.message);
    showMpError('Could not connect to game server. Try again.');
    mpConnected = false;
  });

  mpSocket.on('disconnect', () => {
    mpConnected  = false;
    mpGameActive = false;
    console.log('[MP] Disconnected');
    if (mpGameActive) showMpError('Lost connection to server.');
  });

  // ── Room events ──
  mpSocket.on('room_created', ({ code }) => {
    mpRoom = code;
    showMpLobby(code, true);
  });

  mpSocket.on('room_joined', ({ code }) => {
    mpRoom = code;
  });

  mpSocket.on('room_updated', ({ players }) => {
    updateMpLobbyPlayers(players);
  });

  mpSocket.on('partner_left', () => {
    showMpError('Your partner left the game.');
    mpReturnToMenu();
  });

  mpSocket.on('countdown', ({ seconds }) => {
    updateMpCountdown(seconds);
  });

  // ── Game events ──
  mpSocket.on('game_start', ({ wave }) => {
    mpGameActive = true;
    startMpGame(wave);
  });

  mpSocket.on('state', (state) => {
    mpState = state;
    if (typeof mpOnStateReceived === 'function') mpOnStateReceived(state);
  });

  mpSocket.on('player_died', ({ username }) => {
    showMpNotification(`${username} is down! Auto-revive in 10s...`, 'warning');
  });

  mpSocket.on('player_revived', ({ socketId }) => {
    const name = socketId === mpMySocketId ? 'You' : 'Your partner';
    showMpNotification(`${name} has been revived!`, 'success');
  });

  mpSocket.on('wave_clear', ({ wave, nextWave }) => {
    showMpNotification(`Wave ${wave} cleared! Wave ${nextWave} incoming...`, 'success');
  });

  mpSocket.on('wave_start', ({ wave }) => {
    showMpNotification(`Wave ${wave}!`, 'info');
  });

  mpSocket.on('powerup_collected', ({ username, type }) => {
    const labels = {
      health:'❤️ Health', rapidfire:'⚡ Rapid Fire', speed:'💙 Speed',
      shield:'💜 Shield', weapon:'★ Weapon Up', maxhp:'♥ Max HP',
      speedup:'⟫ Speed Up', nuke:'💣 NUKE!'
    };
    const isMe = username === (mpSocket._user?.username);
    const who  = isMe ? 'You' : username;
    showMpNotification(`${who} got ${labels[type] || type}!`, isMe ? 'success' : 'info');
  });

  mpSocket.on('nuke', ({ username }) => {
    showMpNotification(`💣 ${username} used NUKE — all enemies cleared!`, 'warning');
  });

  mpSocket.on('game_over', (data) => {
    mpGameActive = false;
    showMpGameOver(data);
  });

  mpSocket.on('error', ({ message }) => {
    showMpError(message);
  });
}

function mpDisconnect() {
  if (mpSocket) { mpSocket.disconnect(); mpSocket = null; }
  mpConnected  = false;
  mpGameActive = false;
  mpRoom       = null;
  mpState      = null;
}

// ─── Room actions ─────────────────────────────────────────────
function mpCreateRoom() {
  if (!mpConnected) mpConnect();
  setTimeout(() => {
    if (mpConnected) mpSocket.emit('create_room');
    else showMpError('Not connected. Try again.');
  }, mpConnected ? 0 : 1500);
}

function mpJoinRoom(code) {
  if (!code) { showMpError('Enter a room code.'); return; }
  if (!mpConnected) mpConnect();
  setTimeout(() => {
    if (mpConnected) mpSocket.emit('join_room', { code: code.toUpperCase() });
    else showMpError('Not connected. Try again.');
  }, mpConnected ? 0 : 1500);
}

// ─── Send input to server every frame ─────────────────────────
function mpSendInput(keys, mouseX, mouseY, shooting) {
  if (!mpSocket?.connected || !mpGameActive) return;
  // keys can be a plain object {w:true} or a Set — handle both
  const has = k => keys instanceof Set ? keys.has(k) : !!keys[k];
  mpSocket.emit('input', {
    up:       has('w') || has('arrowup'),
    down:     has('s') || has('arrowdown'),
    left:     has('a') || has('arrowleft'),
    right:    has('d') || has('arrowright'),
    shooting,
    mouseX,
    mouseY,
  });
}

// ─── Draw the arena background (dark grid) ───────────────────
function mpDrawArena(ctx, w, h) {
  // Dark background fill
  ctx.fillStyle = '#0a0f1a';
  ctx.fillRect(0, 0, w, h);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(88,166,255,0.06)';
  ctx.lineWidth = 1;
  const GRID = 60;
  for (let x = 0; x < w; x += GRID) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += GRID) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Arena boundary glow
  ctx.strokeStyle = 'rgba(88,166,255,0.18)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, w - 4, h - 4);
}

// ─── Render multiplayer game state ────────────────────────────
// Called from your main draw loop when mpGameActive is true
function mpRender(ctx, mySocketId) {
  if (!mpState) return;

  // Draw powerups
  for (const pu of (mpState.powerups || [])) {
    const cfg = {
      health:    { color: '#6bff7b', symbol: '+' },
      rapidfire: { color: '#ffd93d', symbol: '⚡' },
      speed:     { color: '#9be7ff', symbol: '»' },
      shield:    { color: '#b693ff', symbol: '◈' },
      weapon:    { color: '#ffd700', symbol: '★' },
      maxhp:     { color: '#ff69b4', symbol: '♥' },
      speedup:   { color: '#00ffff', symbol: '⟫' },
      nuke:      { color: '#ff6b35', symbol: '💣' },
    }[pu.type] || { color: '#fff', symbol: '?' };

    // Pulsing outer ring
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, pu.r + 5, 0, Math.PI * 2);
    ctx.fillStyle = cfg.color + '22';
    ctx.fill();

    // Core circle
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, pu.r, 0, Math.PI * 2);
    ctx.fillStyle = cfg.color + '44';
    ctx.fill();
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Symbol
    ctx.fillStyle = cfg.color;
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.symbol, pu.x, pu.y);
  }
  ctx.textBaseline = 'alphabetic';

  // Draw bullets
  for (const b of mpState.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe066';
    ctx.fill();
  }

  // Draw enemies
  for (const e of mpState.enemies) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fillStyle = e.color || '#e74c3c';
    ctx.fill();

    // HP bar
    const barW = e.radius * 2;
    const barX = e.x - e.radius;
    const barY = e.y - e.radius - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX, barY, barW, 4);
    ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#6bff7b' : '#ff6b7a';
    ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), 4);
  }

  // Draw players
  for (const p of mpState.players) {
    const isMe = p.socketId === mySocketId;

    if (!p.alive) {
      // Draw ghost/downed indicator
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6b7a';
      ctx.fill();
      ctx.globalAlpha = 1;

      // Revive timer
      if (p.reviveTimer > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(p.reviveTimer)}s`, p.x, p.y - 25);
      }
      continue;
    }

    // Player circle
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? '#58a6ff' : '#ff9f43';
    ctx.fill();
    ctx.strokeStyle = isMe ? '#ffffff' : '#ffcc00';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Direction indicator
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22);
    ctx.strokeStyle = isMe ? '#fff' : '#ffcc00';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Username label
    ctx.fillStyle = isMe ? '#58a6ff' : '#ff9f43';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(isMe ? 'YOU' : p.username, p.x, p.y - 24);

    // HP bar
    const barW = 36;
    const barX = p.x - barW / 2;
    const barY = p.y + 22;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX, barY, barW, 4);
    ctx.fillStyle = p.hp / p.maxHp > 0.4 ? '#6bff7b' : '#ff6b7a';
    ctx.fillRect(barX, barY, barW * (p.hp / p.maxHp), 4);
  }

  ctx.textAlign = 'left'; // reset
}

// ─── HUD update ───────────────────────────────────────────────
function mpUpdateHUD() {
  if (!mpState) return;

  const scoreEl = document.getElementById('scoreVal');
  const waveEl  = document.getElementById('waveVal');
  if (scoreEl) scoreEl.textContent = mpState.score?.toLocaleString() || 0;
  if (waveEl)  waveEl.textContent  = mpState.wave || 1;

  // Partner HP bar (if it exists in your HTML)
  const partner = mpState.players.find(p => p.socketId !== mpMySocketId);
  const partnerHpEl = document.getElementById('partnerHp');
  if (partnerHpEl && partner) {
    partnerHpEl.style.width = `${(partner.hp / partner.maxHp) * 100}%`;
    partnerHpEl.style.background = partner.hp / partner.maxHp > 0.4 ? '#6bff7b' : '#ff6b7a';
  }

  // My HP
  const me = mpState.players.find(p => p.socketId === mpMySocketId);
  const hpEl = document.getElementById('hpVal');
  if (hpEl && me) hpEl.textContent = Math.ceil(me.hp);

  // Enemies remaining counter — reuse or create a floating element
  let enemyCountEl = document.getElementById('mpEnemyCount');
  if (!enemyCountEl) {
    enemyCountEl = document.createElement('div');
    enemyCountEl.id = 'mpEnemyCount';
    enemyCountEl.style.cssText = `
      position:fixed; bottom:16px; left:16px;
      background:rgba(13,21,37,0.88); border:1.5px solid rgba(88,166,255,0.25);
      border-radius:10px; padding:6px 14px;
      display:flex; align-items:center; gap:8px;
      font-family:Inter,system-ui; font-size:13px; color:rgba(255,255,255,0.7);
      pointer-events:none; z-index:100;
    `;
    document.body.appendChild(enemyCountEl);
  }

  if (mpState.waveClearTimer > 0) {
    const secs = Math.ceil(mpState.waveClearTimer);
    enemyCountEl.innerHTML = `<span style="color:#6bff7b;font-weight:700;">Wave Clear!</span> <span style="color:#ffd93d;">Next wave in ${secs}s</span>`;
    enemyCountEl.style.display = 'flex';
  } else if (mpGameActive) {
    const killed  = mpState.enemiesKilledThisWave || 0;
    const needed  = mpState.enemiesNeeded || 1;
    const remaining = Math.max(0, needed - killed);
    const color = remaining <= 5 ? '#6bff7b' : remaining <= 10 ? '#ffd93d' : '#9be7ff';
    enemyCountEl.innerHTML = `
      <span style="width:10px;height:10px;border-radius:50%;background:#ff4757;display:inline-block;box-shadow:0 0 6px #ff4757;"></span>
      <span>Enemies</span>
      <span style="color:${color};font-weight:700;font-size:15px;">${remaining}</span>`;
    enemyCountEl.style.display = 'flex';
  } else {
    enemyCountEl.style.display = 'none';
  }
}

// ─── Clean up MP HUD elements on game end ────────────────────
function mpCleanupHUD() {
  document.getElementById('mpEnemyCount')?.remove();
}

// ─── UI helpers ───────────────────────────────────────────────
function showMpLobby(code, isHost) {
  const panel = document.getElementById('mpLobbyPanel');
  if (!panel) return;
  document.getElementById('homeScreen')?.classList.add('hidden');
  panel.classList.remove('hidden');

  const codeEl = document.getElementById('mpRoomCode');
  if (codeEl) codeEl.textContent = code;

  const statusEl = document.getElementById('mpLobbyStatus');
  if (statusEl) statusEl.textContent = isHost
    ? 'Waiting for a partner to join...'
    : 'Connected! Waiting to start...';
}

function updateMpLobbyPlayers(players) {
  const listEl = document.getElementById('mpPlayerList');
  if (!listEl) return;
  listEl.innerHTML = '';
  players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'mp-player-entry';
    el.innerHTML = `
      <div class="mp-player-name">${p.isHost ? '👑 ' : ''}${p.username}</div>
      <div class="mp-player-status" style="color:#6bff7b;">✓ Ready</div>`;
    listEl.appendChild(el);
  });

  const statusEl = document.getElementById('mpLobbyStatus');
  if (statusEl && players.length === 2) {
    statusEl.textContent = 'Both players connected! Starting soon...';
    statusEl.style.color = '#6bff7b';
  }
}

function updateMpCountdown(seconds) {
  const el = document.getElementById('mpCountdown');
  if (el) { el.textContent = seconds; el.classList.remove('hidden'); }
}

function startMpGame(wave) {
  document.getElementById('mpLobbyPanel')?.classList.add('hidden');
  document.getElementById('mpCountdown')?.classList.add('hidden');
  // The main game loop will detect mpGameActive = true and switch to MP mode
  showMpNotification(`Wave ${wave} — GO!`, 'success');
}

function showMpGameOver(data) {
  const panel = document.getElementById('mpGameOverPanel');
  if (!panel) { console.log('[MP] Game over:', data); return; }

  const waveEl   = document.getElementById('mpGoWave');
  const scoreEl  = document.getElementById('mpGoScore');
  const resultsEl = document.getElementById('mpGoResults');

  if (waveEl)  waveEl.textContent  = `Wave ${data.wave}`;
  if (scoreEl) scoreEl.textContent = `Score: ${data.score?.toLocaleString() || 0}`;

  if (resultsEl) {
    resultsEl.innerHTML = '';
    (data.results || []).forEach(r => {
      const el = document.createElement('div');
      el.className = 'mp-result-entry';
      el.innerHTML = `
        <div>${r.username}</div>
        <div>🏆 ${(r.score||0).toLocaleString()} · ☠️ ${r.kills||0} kills · ${r.survived ? '✓ Survived' : '✗ Down'}</div>`;
      resultsEl.appendChild(el);
    });
  }

  panel.classList.remove('hidden');
}

function mpReturnToMenu() {
  document.getElementById('mpLobbyPanel')?.classList.add('hidden');
  document.getElementById('mpGameOverPanel')?.classList.add('hidden');
  document.getElementById('homeScreen')?.classList.remove('hidden');
  mpGameActive = false;
  mpRoom       = null;
  mpState      = null;
  mpCleanupHUD();
}

function showMpError(message) {
  const el = document.getElementById('mpError');
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  } else {
    alert(message);
  }
}

function showMpNotification(message, type = 'info') {
  const colors = { info: '#58a6ff', success: '#6bff7b', warning: '#ffcc00', error: '#ff6b7a' };
  const existing = document.getElementById('mpNotification');
  const el = existing || document.createElement('div');
  el.id = 'mpNotification';
  el.textContent = message;
  el.style.cssText = `
    position:fixed; top:80px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.85); border:1px solid ${colors[type]};
    color:${colors[type]}; padding:10px 20px; border-radius:8px;
    font-size:14px; font-weight:700; z-index:9999;
    animation: fadeInDown 0.3s ease;
  `;
  if (!existing) document.body.appendChild(el);
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.remove(), 3000);
}

console.log('✅ multiplayer.js loaded');