// mp-hook.js
// Patches the game's main loop to support multiplayer rendering.
// Must load AFTER game.js and multiplayer.js.

(function() {
  // Wait for game to fully initialize
  const _originalLoop = window._mpOriginalLoop;

  // ── Override requestAnimationFrame loop ──────────────────────
  // We monkey-patch by replacing the loop function's body behavior
  // by intercepting at the canvas draw level.

  const canvas  = document.getElementById('game');
  const ctx     = canvas?.getContext('2d');
  if (!ctx) return;

  // Store original loop reference by wrapping it
  const _patchLoop = function(time) {
    // If multiplayer is active, run MP render instead of normal game
    if (typeof mpGameActive !== 'undefined' && mpGameActive) {
      const now = performance.now();
      const dt  = Math.min((now - (_patchLoop._last || now)) / 1000, 0.1);
      _patchLoop._last = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid lines for orientation
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 60) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // Render server state
      if (typeof mpRender === 'function') {
        mpRender(ctx, mpMySocketId);
      }

      // Send input to server
      if (typeof mpSendInput === 'function' && typeof keys !== 'undefined' && typeof mouse !== 'undefined') {
        const shooting = mouse?.buttons > 0 || (typeof mouseDown !== 'undefined' && mouseDown);
        mpSendInput(keys, mouse.x, mouse.y, shooting);
      }

      // Update HUD
      if (typeof mpUpdateHUD === 'function') mpUpdateHUD();

      requestAnimationFrame(_patchLoop);
      return;
    }

    // Normal single-player loop — call original
    _patchLoop._original(time);
  };

  // Find and wrap the original loop
  // We do this by overriding requestAnimationFrame temporarily
  const _origRAF = window.requestAnimationFrame;
  let _loopFn = null;
  let _intercepted = false;

  window.requestAnimationFrame = function(cb) {
    if (!_intercepted && cb && cb.name === 'loop') {
      _loopFn = cb;
      _intercepted = true;
      _patchLoop._original = cb;
      window.requestAnimationFrame = _origRAF;
      return _origRAF(_patchLoop);
    }
    return _origRAF(cb);
  };

  // ── Hook startMpGame to stop single-player loop ───────────────
  const _origStartMpGame = window.startMpGame;
  window.startMpGame = function(wave) {
    // Stop single-player game state
    if (typeof running !== 'undefined') {
      window.running = false;
    }

    // Hide home screen, show canvas
    document.getElementById('homeScreen')?.classList.add('hidden');
    document.getElementById('mpLobbyPanel')?.classList.add('hidden');
    document.getElementById('mpCountdown')?.classList.add('hidden');
    document.getElementById('partnerHpBar')?.classList.remove('hidden');

    // Call original
    if (_origStartMpGame) _origStartMpGame(wave);

    // Restart the animation loop in MP mode
    _patchLoop._last = performance.now();
    requestAnimationFrame(_patchLoop);

    showMpNotification(`Wave ${wave} — GO!`, 'success');
    console.log('[MP] Game started — rendering server state');
  };

  // ── Hook mpReturnToMenu to restore single-player ──────────────
  const _origReturnToMenu = window.mpReturnToMenu;
  window.mpReturnToMenu = function() {
    document.getElementById('partnerHpBar')?.classList.add('hidden');
    if (_origReturnToMenu) _origReturnToMenu();
  };

  // ── Fix mouse position for MP (canvas-relative) ───────────────
  canvas.addEventListener('mousemove', (e) => {
    if (typeof mpGameActive !== 'undefined' && mpGameActive) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      if (typeof mouse !== 'undefined') {
        mouse.x = (e.clientX - rect.left) * scaleX;
        mouse.y = (e.clientY - rect.top)  * scaleY;
      }
    }
  });

  // ── Track mouse button for shooting ──────────────────────────
  window.mouseDown = false;
  canvas.addEventListener('mousedown', () => { window.mouseDown = true;  });
  canvas.addEventListener('mouseup',   () => { window.mouseDown = false; });

  console.log('✅ mp-hook.js loaded — game loop patched for multiplayer');
})();