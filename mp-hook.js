// mp-hook.js — v3
// Simpler approach: directly override the loop function after game.js defines it.
// Uses a flag checked at the TOP of the loop to take over rendering.

(function() {
  const canvas = document.getElementById('game');
  const ctx    = canvas?.getContext('2d');
  if (!ctx) return;

  // ── Interpolation buffers ──────────────────────────────────
  let prevState    = null;
  let currentState = null;
  let stateTime    = 0;
  let prevTime     = 0;
  const TICK_MS    = 1000 / 30;

  window.mpOnStateReceived = function(state) {
    prevState    = currentState;
    prevTime     = stateTime;
    currentState = state;
    stateTime    = performance.now();
  };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d >  Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function getInterpolated() {
    if (!currentState) return null;
    if (!prevState)    return currentState;
    const t = Math.min((performance.now() - stateTime) / TICK_MS, 1.0);
    return {
      wave:           currentState.wave,
      score:          currentState.score,
      coins:          currentState.coins,
      waveClearTimer: currentState.waveClearTimer,
      bullets:        currentState.bullets,
      players: currentState.players.map(cp => {
        const pp = prevState.players.find(p => p.socketId === cp.socketId);
        if (!pp) return cp;
        return { ...cp, x: lerp(pp.x, cp.x, t), y: lerp(pp.y, cp.y, t), angle: lerpAngle(pp.angle, cp.angle, t) };
      }),
      enemies: currentState.enemies.map(ce => {
        const pe = prevState.enemies.find(e => e.id === ce.id);
        if (!pe) return ce;
        return { ...ce, x: lerp(pe.x, ce.x, t), y: lerp(pe.y, ce.y, t) };
      }),
    };
  }

  // ── Render ─────────────────────────────────────────────────
  function mpRenderFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 80) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 80) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }

    const s = getInterpolated();
    if (!s) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Connecting...', canvas.width/2, canvas.height/2);
      ctx.textAlign = 'left';
      return;
    }

    // Bullets
    s.bullets?.forEach(b => {
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI*2);
      ctx.fillStyle = '#ffe066';
      ctx.shadowBlur = 8; ctx.shadowColor = '#ffe066';
      ctx.fill(); ctx.shadowBlur = 0;
    });

    // Powerups
    s.powerups?.forEach(pu => {
      const bob = Math.sin(Date.now() / 150) * 2;
      ctx.shadowBlur = 18; ctx.shadowColor = pu.color;
      ctx.beginPath(); ctx.arc(pu.x, pu.y + bob, pu.r, 0, Math.PI*2);
      ctx.fillStyle = pu.color; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pu.symbol, pu.x, pu.y + bob);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    });

    // Enemies
    s.enemies?.forEach(e => {
      ctx.shadowBlur = 12; ctx.shadowColor = e.color || '#e74c3c';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2);
      ctx.fillStyle = e.color || '#e74c3c'; ctx.fill();
      ctx.shadowBlur = 0;
      // HP bar
      const pct = e.hp/e.maxHp;
      const bx = e.x-e.radius, by = e.y-e.radius-8, bw = e.radius*2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx,by,bw,4);
      ctx.fillStyle = pct>0.5?'#6bff7b':pct>0.25?'#ffcc00':'#ff6b7a'; ctx.fillRect(bx,by,bw*pct,4);
    });

    // Players
    s.players?.forEach(p => {
      const isMe = p.socketId === mpMySocketId;
      const color = isMe ? '#58a6ff' : '#ff9f43';
      if (!p.alive) {
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI*2);
        ctx.fillStyle = '#ff6b7a'; ctx.fill();
        ctx.globalAlpha = 1;
        if (p.reviveTimer > 0) {
          ctx.fillStyle='#fff'; ctx.font='bold 12px Arial'; ctx.textAlign='center';
          ctx.fillText(`⬆ ${Math.ceil(p.reviveTimer)}s`, p.x, p.y-26); ctx.textAlign='left';
        }
        return;
      }
      // Shield ring
      if (p.shield) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(182,147,255,0.7)'; ctx.lineWidth = 3;
        ctx.shadowBlur = 12; ctx.shadowColor = '#b693ff'; ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.shadowBlur=18; ctx.shadowColor=color;
      ctx.beginPath(); ctx.arc(p.x,p.y,18,0,Math.PI*2);
      ctx.fillStyle=color; ctx.fill();
      ctx.strokeStyle=isMe?'#fff':'#ffcc00'; ctx.lineWidth=2; ctx.stroke();
      ctx.shadowBlur=0;
      // Aim line
      ctx.beginPath(); ctx.moveTo(p.x,p.y);
      ctx.lineTo(p.x+Math.cos(p.angle)*26, p.y+Math.sin(p.angle)*26);
      ctx.strokeStyle=isMe?'#fff':'#ffcc00'; ctx.lineWidth=3; ctx.stroke();
      // Label
      ctx.fillStyle=color; ctx.font='bold 11px Arial'; ctx.textAlign='center';
      ctx.fillText(isMe?'YOU':p.username, p.x, p.y-26); ctx.textAlign='left';
      // Weapon level dots
      if (p.weaponLevel > 1) {
        for (let i = 0; i < p.weaponLevel; i++) {
          ctx.beginPath(); ctx.arc(p.x - 8 + i * 8, p.y + 32, 3, 0, Math.PI*2);
          ctx.fillStyle = '#ffd700'; ctx.fill();
        }
      }
      // HP bar
      const pct=p.hp/p.maxHp;
      const bx=p.x-18, by=p.y+22;
      ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(bx,by,36,4);
      ctx.fillStyle=pct>0.4?'#6bff7b':'#ff6b7a'; ctx.fillRect(bx,by,36*pct,4);
    });

    // Wave clear countdown
    if (s.waveClearTimer > 0) {
      ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(canvas.width/2-130,16,260,38);
      ctx.fillStyle='#6bff7b'; ctx.font='bold 18px Arial'; ctx.textAlign='center';
      ctx.fillText(`Wave ${s.wave} clear! Next in ${Math.ceil(s.waveClearTimer)}s`, canvas.width/2, 42);
      ctx.textAlign='left';
    }

    // HUD update
    if (typeof mpUpdateHUD === 'function') mpUpdateHUD();
  }

  // ── Override the game loop by wrapping it ──────────────────
  // Wait until game.js has defined `loop`, then wrap it.
  window.addEventListener('load', () => {
    // game.js calls requestAnimationFrame(loop) at the bottom.
    // We intercept by replacing window.loop after it's defined.
    setTimeout(() => {
      if (typeof loop !== 'function') { console.warn('[MP] loop not found'); return; }

      const _origLoop = loop;

      // Replace the global loop function
      window.loop = function mpLoop(time) {
        if (typeof mpGameActive !== 'undefined' && mpGameActive) {
          // MP mode — render server state
          mpRenderFrame();

          // Send input
          if (typeof mpSendInput === 'function' && typeof keys !== 'undefined' && typeof mouse !== 'undefined') {
            mpSendInput(keys, mouse.x, mouse.y, window.mouseDown || false);
          }

          requestAnimationFrame(window.loop);
        } else {
          // Single player mode
          _origLoop(time);
        }
      };

      console.log('✅ mp-hook.js — loop wrapped successfully');
    }, 200); // small delay to ensure game.js is fully executed
  });

  // ── startMpGame hook ───────────────────────────────────────
  window.addEventListener('load', () => {
    setTimeout(() => {
      const _origStart = window.startMpGame;
      window.startMpGame = function(wave) {
        window.running = false;
        document.getElementById('homeScreen')?.classList.add('hidden');
        document.getElementById('mpLobbyPanel')?.classList.add('hidden');
        document.getElementById('mpCountdown')?.classList.add('hidden');
        document.getElementById('partnerHpBar')?.classList.remove('hidden');
        if (_origStart) _origStart(wave);
        // Kick off the loop in MP mode
        requestAnimationFrame(window.loop);
        console.log('[MP] Game started — interpolated render active');
      };

      const _origReturn = window.mpReturnToMenu;
      window.mpReturnToMenu = function() {
        document.getElementById('partnerHpBar')?.classList.add('hidden');
        prevState = null; currentState = null;
        if (_origReturn) _origReturn();
      };
    }, 300);
  });

  // ── Mouse tracking ─────────────────────────────────────────
  canvas?.addEventListener('mousemove', e => {
    if (!mpGameActive) return;
    const rect = canvas.getBoundingClientRect();
    if (typeof mouse !== 'undefined') {
      mouse.x = (e.clientX - rect.left) * (canvas.width  / rect.width);
      mouse.y = (e.clientY - rect.top)  * (canvas.height / rect.height);
    }
  });

  window.mouseDown = false;
  canvas?.addEventListener('mousedown', () => window.mouseDown = true);
  canvas?.addEventListener('mouseup',   () => window.mouseDown = false);

  console.log('✅ mp-hook.js loaded');
})();