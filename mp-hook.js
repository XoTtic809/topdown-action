// mp-hook.js
// Patches the game loop for multiplayer rendering.
// Uses client-side interpolation to smooth out 30-tick server updates.

(function() {
  const canvas = document.getElementById('game');
  const ctx    = canvas?.getContext('2d');
  if (!ctx) return;

  // ── Interpolation state ────────────────────────────────────────
  let _prevState     = null;
  let _currState     = null;
  let _lastStateTime = 0;
  const SERVER_TICK_MS = 1000 / 30;

  // Intercept mpState assignments to capture timing
  let _internalState = null;
  Object.defineProperty(window, 'mpState', {
    get: () => _internalState,
    set: (val) => {
      if (val && _internalState) {
        _prevState = JSON.parse(JSON.stringify(_internalState));
        _lastStateTime = performance.now();
      } else if (val && !_internalState) {
        _prevState = val;
        _lastStateTime = performance.now();
      }
      _internalState = val;
      _currState = val;
    },
    configurable: true,
  });

  function lerp(a, b, t) { return a + (b - a) * t; }

  function getInterpolated() {
    if (!_currState) return null;
    if (!_prevState) return _currState;
    const t = Math.min((performance.now() - _lastStateTime) / SERVER_TICK_MS, 1.0);

    const players = _currState.players.map(curr => {
      const prev = _prevState.players?.find(p => p.socketId === curr.socketId);
      if (!prev) return curr;
      return { ...curr, x: lerp(prev.x, curr.x, t), y: lerp(prev.y, curr.y, t) };
    });

    const enemies = _currState.enemies.map(curr => {
      const prev = _prevState.enemies?.find(e => e.id === curr.id);
      if (!prev) return curr;
      return { ...curr, x: lerp(prev.x, curr.x, t), y: lerp(prev.y, curr.y, t) };
    });

    const bullets = _currState.bullets.map(b => {
      const prev = _prevState.bullets?.find(pb => pb.id === b.id);
      if (!prev) return b;
      return { ...b, x: lerp(prev.x, b.x, t), y: lerp(prev.y, b.y, t) };
    });

    return { ..._currState, players, enemies, bullets };
  }

  // ── Main MP render loop ────────────────────────────────────────
  const _patchLoop = function(time) {
    if (typeof mpGameActive !== 'undefined' && mpGameActive) {
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 60) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      const state = getInterpolated();
      if (state) _mpDraw(ctx, state);

      if (typeof mpSendInput === 'function' && typeof mouse !== 'undefined') {
        mpSendInput(typeof keys !== 'undefined' ? keys : {}, mouse.x, mouse.y, window.mouseDown || false);
      }

      if (typeof mpUpdateHUD === 'function') mpUpdateHUD();

      requestAnimationFrame(_patchLoop);
      return;
    }
    _patchLoop._original(time);
  };

  // ── Drawing ────────────────────────────────────────────────────
  function _mpDraw(ctx, state) {
    // Bullets
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe066';
      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Enemies
    for (const e of state.enemies) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fillStyle = e.color || '#e74c3c';
      ctx.shadowColor = e.color || '#e74c3c';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // HP bar
      const bw = e.radius * 2, bx = e.x - e.radius, by = e.y - e.radius - 8;
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = pct > 0.5 ? '#6bff7b' : pct > 0.25 ? '#ffcc00' : '#ff4757';
      ctx.fillRect(bx, by, bw * pct, 4);
    }

    // Players
    for (const p of state.players) {
      const isMe  = p.socketId === mpMySocketId;
      const color = isMe ? '#58a6ff' : '#ff9f43';

      if (!p.alive) {
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
        ctx.fillStyle = '#ff4757';
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ff4757';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('💀', p.x, p.y + 5);
        if (p.reviveTimer > 0) {
          ctx.fillStyle = '#ffcc00';
          ctx.font = 'bold 11px Arial';
          ctx.fillText(`${Math.ceil(p.reviveTimer)}s`, p.x, p.y - 26);
        }
        ctx.textAlign = 'left';
        continue;
      }

      ctx.shadowColor = color;
      ctx.shadowBlur  = 16;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = isMe ? '#ffffff' : '#ffcc00';
      ctx.lineWidth   = 2.5;
      ctx.stroke();

      // Aim line
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24);
      ctx.strokeStyle = isMe ? '#fff' : '#ffcc00';
      ctx.lineWidth   = 3;
      ctx.stroke();

      // Name
      ctx.fillStyle = color;
      ctx.font      = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(isMe ? 'YOU' : p.username, p.x, p.y - 26);

      // HP bar
      const bw = 40, bx = p.x - 20, by = p.y + 22;
      const pct = Math.max(0, p.hp / p.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = pct > 0.4 ? '#6bff7b' : '#ff4757';
      ctx.fillRect(bx, by, bw * pct, 5);
      ctx.textAlign = 'left';
    }

    // Wave clear banner
    if (state.waveClearTimer > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, canvas.height / 2 - 30, canvas.width, 60);
      ctx.fillStyle = '#6bff7b';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`WAVE ${state.wave} CLEAR — Next in ${Math.ceil(state.waveClearTimer)}s`, canvas.width / 2, canvas.height / 2 + 8);
      ctx.textAlign = 'left';
    }
  }

  // ── Wrap game loop ────────────────────────────────────────────
  const _origRAF    = window.requestAnimationFrame;
  let   _intercepted = false;
  window.requestAnimationFrame = function(cb) {
    if (!_intercepted && cb && cb.name === 'loop') {
      _intercepted          = true;
      _patchLoop._original  = cb;
      window.requestAnimationFrame = _origRAF;
      return _origRAF(_patchLoop);
    }
    return _origRAF(cb);
  };

  // ── startMpGame hook ──────────────────────────────────────────
  const _origStart = window.startMpGame;
  window.startMpGame = function(wave) {
    window.running = false;
    document.getElementById('homeScreen')?.classList.add('hidden');
    document.getElementById('mpLobbyPanel')?.classList.add('hidden');
    document.getElementById('mpCountdown')?.classList.add('hidden');
    document.getElementById('partnerHpBar')?.classList.remove('hidden');
    if (_origStart) _origStart(wave);
    requestAnimationFrame(_patchLoop);
    console.log('[MP] Game started — rendering server state');
  };

  // ── mpReturnToMenu hook ───────────────────────────────────────
  const _origReturn = window.mpReturnToMenu;
  window.mpReturnToMenu = function() {
    document.getElementById('partnerHpBar')?.classList.add('hidden');
    if (_origReturn) _origReturn();
  };

  // ── Mouse tracking ────────────────────────────────────────────
  canvas.addEventListener('mousemove', (e) => {
    if (typeof mpGameActive !== 'undefined' && mpGameActive) {
      const rect = canvas.getBoundingClientRect();
      if (typeof mouse !== 'undefined') {
        mouse.x = (e.clientX - rect.left) * (canvas.width  / rect.width);
        mouse.y = (e.clientY - rect.top)  * (canvas.height / rect.height);
      }
    }
  });

  window.mouseDown = false;
  canvas.addEventListener('mousedown', () => { window.mouseDown = true;  });
  canvas.addEventListener('mouseup',   () => { window.mouseDown = false; });

  console.log('✅ mp-hook.js loaded — game loop patched for multiplayer');
})();