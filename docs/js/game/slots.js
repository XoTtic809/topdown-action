// slots.js
// 3-reel slot machine within the casino lobby.
// Renders into #casGame_slots with vertical-scrolling reel strips.

(function () {
  'use strict';

  const API = (typeof API_BASE !== 'undefined' && API_BASE) ||
    ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:3001/api'
      : 'https://topdown-action-production-8a95.up.railway.app/api');

  function getToken() { return localStorage.getItem('topdown_token') || null; }

  // Symbol map: id → emoji
  const SYM_MAP = {
    cherry:  '🍒',
    lemon:   '🍋',
    bar:     '🍫',
    star:    '⭐',
    seven:   '7️⃣',
    diamond: '💎',
  };
  const SYM_IDS = Object.keys(SYM_MAP);
  const SYM_HEIGHT = 66; // px per symbol, matches CSS .slots-sym height
  const VISIBLE_SYMS = 3; // how many symbols visible in the window (top / center / bottom)
  const REEL_SYMS = 30;   // total symbols in each reel strip during spin

  let spinning = false;
  let winStreak = 0;
  let autoSpinning = false;
  let autoSpinCount = 0;

  // ── Reel strip building ────────────────────────────────────
  function _randomSym() {
    return SYM_IDS[Math.floor(Math.random() * SYM_IDS.length)];
  }

  /** Fill a reel strip with random symbol divs */
  function _populateStrip(strip, count) {
    strip.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const div = document.createElement('div');
      div.className = 'slots-sym';
      div.textContent = SYM_MAP[_randomSym()];
      strip.appendChild(div);
    }
  }

  /** Build a strip that ends with the target symbol at the center visible position.
   *  Returns the translateY needed to show the target at the center. */
  function _buildResultStrip(strip, targetEmoji) {
    strip.innerHTML = '';
    // Fill with random symbols, then place the result at position that aligns with center
    const totalSyms = REEL_SYMS;
    // The center of the visible window is at index 1 from bottom of visible area
    // We place the target at index (totalSyms - 2), so the strip scrolls far down
    const targetIdx = totalSyms - 2; // second-to-last is center visible
    for (let i = 0; i < totalSyms; i++) {
      const div = document.createElement('div');
      div.className = 'slots-sym';
      if (i === targetIdx) {
        div.textContent = targetEmoji;
        div.classList.add('center');
      } else if (i === targetIdx - 1 || i === targetIdx + 1) {
        // Neighbors visible but dimmed
        div.textContent = SYM_MAP[_randomSym()];
      } else {
        div.textContent = SYM_MAP[_randomSym()];
      }
      strip.appendChild(div);
    }
    // translateY to bring targetIdx to the center of the window
    // Window height = VISIBLE_SYMS * SYM_HEIGHT = 198 ≈ 200
    // Center offset from top of window = SYM_HEIGHT (one symbol down)
    // The targetIdx symbol's top = targetIdx * SYM_HEIGHT
    // We need: targetIdx * SYM_HEIGHT + translateY = SYM_HEIGHT (to center it)
    const stopY = -(targetIdx * SYM_HEIGHT - SYM_HEIGHT);
    return stopY;
  }

  /** Reset reel strips to idle (show 3 dashes) */
  function _resetStrips() {
    for (let i = 0; i < 3; i++) {
      const strip = document.getElementById('slotsReel' + i);
      const win = strip?.parentElement;
      if (!strip) continue;
      strip.innerHTML = '';
      strip.className = 'slots-reel-strip';
      strip.style.transform = '';
      strip.style.transition = 'none';
      strip.style.removeProperty('--stop-y');
      if (win) win.classList.remove('win');
      // Build 3 idle symbols
      for (let j = 0; j < 3; j++) {
        const div = document.createElement('div');
        div.className = 'slots-sym' + (j === 1 ? ' center' : '');
        div.textContent = '—';
        strip.appendChild(div);
      }
      // Position so center sym is aligned
      strip.style.transform = `translateY(-${SYM_HEIGHT}px)`;
    }
  }

  // ── Spin animation ─────────────────────────────────────────
  async function spin() {
    if (spinning) return;
    const betInput = document.getElementById('slotsBetInput');
    const bet = parseInt(betInput?.value, 10);
    if (!bet || bet < 10) { _setStatus('Minimum bet is 10.'); return; }
    if (typeof playerCoins === 'number' && bet > playerCoins) {
      _setStatus('Not enough coins.'); return;
    }

    spinning = true;
    const spinBtn = document.getElementById('slotsSpinBtn');
    if (spinBtn) spinBtn.disabled = true;
    if (betInput) betInput.disabled = true;

    // Hide previous win display
    _hideWin();
    _clearParticles();
    const machine = document.getElementById('slotsMachine');
    if (machine) machine.classList.remove('shaking');
    const glow = document.getElementById('slotsGlow');
    if (glow) { glow.classList.remove('active', 'jackpot'); }

    // Clear previous win highlights
    for (let i = 0; i < 3; i++) {
      const win = document.getElementById('slotsReel' + i)?.parentElement;
      if (win) win.classList.remove('win');
    }

    // Start spinning animation — populate strips with lots of random symbols and scroll fast
    const strips = [0, 1, 2].map(i => document.getElementById('slotsReel' + i));
    strips.forEach(strip => {
      if (!strip) return;
      _populateStrip(strip, REEL_SYMS);
      strip.className = 'slots-reel-strip blur'; // clears stopped, bouncing, etc.
      strip.style.transition = 'none';
      strip.style.removeProperty('--stop-y');
      strip.style.transform = 'translateY(0)';
    });

    // Animate continuous scrolling with requestAnimationFrame
    const spinSpeed = 18; // px per frame
    let spinY = 0;
    let spinRunning = true;
    const stoppedReels = new Set(); // track which reel indices have stopped
    const totalStripHeight = REEL_SYMS * SYM_HEIGHT;

    function animateSpin() {
      if (!spinRunning) return;
      spinY = (spinY + spinSpeed) % totalStripHeight;
      strips.forEach((strip, idx) => {
        if (strip && !stoppedReels.has(idx)) {
          strip.style.transform = `translateY(-${spinY}px)`;
        }
      });
      requestAnimationFrame(animateSpin);
    }
    requestAnimationFrame(animateSpin);

    // Fire the API call
    try {
      const res = await fetch(`${API}/slots/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ bet }),
      });
      const data = await res.json();
      if (!res.ok) {
        spinRunning = false;
        _resetStrips();
        _setStatus(data.error || 'Spin failed.');
        _finish();
        return;
      }

      const resultEmojis = data.symbols.map(s => s.emoji);
      const resultIds = data.symbols.map(s => s.id);

      // Stop reels one-by-one with staggered delays
      await _stopReelsSequentially(strips, resultEmojis, stoppedReels);
      spinRunning = false;

      // Apply balance
      window.casinoApplyBalance(data.newBalance);

      // Determine match type
      const allMatch = resultIds[0] === resultIds[1] && resultIds[1] === resultIds[2];
      const pairs = [];
      if (resultIds[0] === resultIds[1]) { pairs.push(0); pairs.push(1); }
      if (resultIds[1] === resultIds[2]) { pairs.push(1); pairs.push(2); }
      if (resultIds[0] === resultIds[2]) { pairs.push(0); pairs.push(2); }
      const matchedReels = [...new Set(pairs)];

      // Win highlights
      if (matchedReels.length > 0) {
        matchedReels.forEach(idx => {
          strips[idx]?.parentElement?.classList.add('win');
        });
      }

      // Glow effects
      if (glow) {
        if (allMatch) glow.classList.add('jackpot');
        else if (data.payout > 0) glow.classList.add('active');
      }

      // Big win effects
      if (allMatch && machine) {
        machine.classList.add('shaking');
        _spawnParticles(20);
      } else if (data.payout > 0) {
        _spawnParticles(8);
      }

      // Streak tracking + near-miss detection
      if (data.payout > 0) {
        winStreak++;
        _showWin(data.payout, allMatch);
        if (winStreak >= 3) {
          _setStatus(`🔥 ${winStreak}x STREAK! +${data.payout} coins`);
          _updateStreakDisplay(winStreak);
        } else {
          _setStatus(`WIN! +${data.payout} coins`);
        }
      } else {
        // Near-miss effect: show "SO CLOSE" occasionally on losses to keep energy up
        if (Math.random() < 0.2) {
          _setStatus('SO CLOSE! Try again!');
          // Flash all reels briefly in near-miss style
          strips.forEach(s => s?.parentElement?.classList.add('near-miss'));
          setTimeout(() => strips.forEach(s => s?.parentElement?.classList.remove('near-miss')), 1500);
        } else {
          _setStatus('No luck. Try again!');
        }
        winStreak = 0;
        _updateStreakDisplay(0);
      }

      _finish();

      // Auto-spin continuation
      if (autoSpinning && autoSpinCount > 0) {
        autoSpinCount--;
        _updateAutoLabel();
        if (autoSpinCount <= 0) { _stopAutoSpin(); }
        else { setTimeout(() => { if (autoSpinning) spin(); }, 800); }
      }

    } catch (e) {
      spinRunning = false;
      _resetStrips();
      _setStatus('Network error.');
      _finish();
    }

    function _finish() {
      spinning = false;
      if (spinBtn) spinBtn.disabled = false;
      if (betInput) betInput.disabled = false;
    }
  }

  /** Stop each reel with a stagger, rebuilding the strip with the result symbol and bouncing */
  function _stopReelsSequentially(strips, emojis, stoppedReels) {
    return new Promise(resolve => {
      const delays = [300, 600, 1000]; // ms stagger for dramatic effect
      let stopped = 0;

      delays.forEach((delay, i) => {
        setTimeout(() => {
          const strip = strips[i];
          if (!strip) { stopped++; if (stopped === 3) resolve(); return; }

          // Mark this reel as stopped so the RAF loop skips it
          stoppedReels.add(i);

          // Rebuild strip with result at center
          const stopY = _buildResultStrip(strip, emojis[i]);

          // Start from a position above the stop point to simulate the last scroll
          strip.className = 'slots-reel-strip';
          strip.style.transition = 'none';
          const approachOffset = SYM_HEIGHT * 8;
          strip.style.transform = `translateY(${stopY + approachOffset}px)`;

          // Force reflow then animate to stop position with bounce
          void strip.offsetHeight;

          strip.style.setProperty('--stop-y', stopY + 'px');
          strip.classList.add('bouncing');

          // After bounce animation completes, finalize position
          const onEnd = () => {
            strip.removeEventListener('animationend', onEnd);
            strip.classList.remove('bouncing');
            strip.classList.add('stopped');
            strip.style.transition = 'none';
            strip.style.transform = `translateY(${stopY}px)`;
            stopped++;
            if (stopped === 3) resolve();
          };
          strip.addEventListener('animationend', onEnd);

          // Fallback in case animationend doesn't fire
          setTimeout(() => {
            if (stopped < i + 1) {
              strip.removeEventListener('animationend', onEnd);
              strip.classList.remove('bouncing');
              strip.classList.add('stopped');
              strip.style.transform = `translateY(${stopY}px)`;
              stopped++;
              if (stopped === 3) resolve();
            }
          }, 600);

        }, delay);
      });
    });
  }

  // ── Win display ────────────────────────────────────────────
  function _showWin(amount, isJackpot) {
    const display = document.getElementById('slotsWinDisplay');
    const amountEl = document.getElementById('slotsWinAmount');
    if (!display || !amountEl) return;
    amountEl.textContent = '+' + amount;
    amountEl.className = 'slots-win-amount' + (isJackpot ? ' jackpot' : '');
    display.classList.remove('hidden');
  }

  function _hideWin() {
    const display = document.getElementById('slotsWinDisplay');
    if (display) display.classList.add('hidden');
  }

  // ── Particles ──────────────────────────────────────────────
  function _spawnParticles(count) {
    const container = document.getElementById('slotsParticles');
    if (!container) return;
    const colors = ['#ffd866', '#ff9500', '#ff5555', '#55ff88', '#66ccff', '#fff'];
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'slots-particle';
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const dist = 60 + Math.random() * 100;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const dur = 0.6 + Math.random() * 0.6;
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.width = (4 + Math.random() * 4) + 'px';
      p.style.height = p.style.width;
      p.style.setProperty('--dx', dx + 'px');
      p.style.setProperty('--dy', dy + 'px');
      p.style.setProperty('--dur', dur + 's');
      container.appendChild(p);

      // Clean up after animation
      setTimeout(() => p.remove(), dur * 1000 + 50);
    }
  }

  function _clearParticles() {
    const container = document.getElementById('slotsParticles');
    if (container) container.innerHTML = '';
  }

  // ── Status ─────────────────────────────────────────────────
  function _setStatus(text) {
    const el = document.getElementById('slotsStatus');
    if (el) el.textContent = text;
  }

  function _resetTable() {
    _resetStrips();
    _hideWin();
    _clearParticles();
    _setStatus('Place your bet and SPIN!');
    const spinBtn = document.getElementById('slotsSpinBtn');
    const betInput = document.getElementById('slotsBetInput');
    if (spinBtn) spinBtn.disabled = false;
    if (betInput) betInput.disabled = false;
    spinning = false;
    winStreak = 0;
    _stopAutoSpin();
    _updateStreakDisplay(0);
    const glow = document.getElementById('slotsGlow');
    if (glow) glow.classList.remove('active', 'jackpot');
    const machine = document.getElementById('slotsMachine');
    if (machine) machine.classList.remove('shaking');
  }

  // ── Streak display ──────────────────────────────────────────
  function _updateStreakDisplay(count) {
    let el = document.getElementById('slotsStreak');
    if (!el) {
      // Create streak display if it doesn't exist
      const machine = document.getElementById('slotsMachine');
      if (!machine) return;
      el = document.createElement('div');
      el.id = 'slotsStreak';
      el.className = 'slots-streak hidden';
      machine.appendChild(el);
    }
    if (count >= 2) {
      el.textContent = '🔥'.repeat(Math.min(count, 10)) + ' ' + count + 'x STREAK';
      el.classList.remove('hidden');
      el.classList.toggle('hot', count >= 5);
    } else {
      el.classList.add('hidden');
    }
  }

  // ── Auto-spin ──────────────────────────────────────────────
  function _toggleAutoSpin() {
    if (autoSpinning) {
      _stopAutoSpin();
    } else {
      autoSpinning = true;
      autoSpinCount = 10;
      _updateAutoLabel();
      if (!spinning) spin();
    }
  }

  function _stopAutoSpin() {
    autoSpinning = false;
    autoSpinCount = 0;
    _updateAutoLabel();
  }

  function _updateAutoLabel() {
    const btn = document.getElementById('slotsAutoBtn');
    if (!btn) return;
    if (autoSpinning) {
      btn.textContent = `STOP (${autoSpinCount})`;
      btn.classList.add('active');
    } else {
      btn.textContent = 'AUTO x10';
      btn.classList.remove('active');
    }
  }

  // ── Wiring ─────────────────────────────────────────────────
  function wire() {
    document.getElementById('slotsSpinBtn')?.addEventListener('click', spin);
    document.getElementById('slotsAutoBtn')?.addEventListener('click', _toggleAutoSpin);
    _resetStrips(); // Initialize idle state
  }

  window.addEventListener('casino:tab-activated', (e) => {
    if (e.detail === 'slots') _resetTable();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
