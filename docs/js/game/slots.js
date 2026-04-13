// slots.js
// 3-reel slot machine within the casino lobby.
// Renders into #casGame_slots.

(function () {
  'use strict';

  const API = (typeof API_BASE !== 'undefined' && API_BASE) ||
    ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:3001/api'
      : 'https://topdown-action-production-8a95.up.railway.app/api');

  function getToken() { return localStorage.getItem('topdown_token') || null; }

  const ALL_EMOJIS = ['🍒','🍋','🍫','⭐','7️⃣','💎'];
  let spinning = false;

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

    // Start visual spin animation
    const reels = [0,1,2].map(i => document.getElementById('slotsReel' + i));
    reels.forEach(r => { if (r) r.classList.add('spinning'); });
    const spinIntervals = reels.map(r => {
      if (!r) return null;
      return setInterval(() => {
        r.textContent = ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];
      }, 80);
    });

    try {
      const res = await fetch(`${API}/slots/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ bet }),
      });
      const data = await res.json();
      if (!res.ok) {
        _stopReels(reels, spinIntervals, ['-','-','-']);
        _setStatus(data.error || 'Spin failed.');
        spinning = false;
        if (spinBtn) spinBtn.disabled = false;
        if (betInput) betInput.disabled = false;
        return;
      }

      const resultEmojis = data.symbols.map(s => s.emoji);

      // Stagger reel stops for drama
      setTimeout(() => _stopReel(reels[0], spinIntervals[0], resultEmojis[0]), 400);
      setTimeout(() => _stopReel(reels[1], spinIntervals[1], resultEmojis[1]), 700);
      setTimeout(() => {
        _stopReel(reels[2], spinIntervals[2], resultEmojis[2]);

        window.casinoApplyBalance(data.newBalance);

        // Highlight winning reels
        const ids = data.symbols.map(s => s.id);
        const allMatch = ids[0] === ids[1] && ids[1] === ids[2];
        const anyMatch = ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2];
        if (allMatch) {
          reels.forEach(r => { if (r) r.classList.add('win'); });
        } else if (anyMatch) {
          // highlight matching pair
          if (ids[0] === ids[1]) { reels[0]?.classList.add('win'); reels[1]?.classList.add('win'); }
          if (ids[1] === ids[2]) { reels[1]?.classList.add('win'); reels[2]?.classList.add('win'); }
          if (ids[0] === ids[2]) { reels[0]?.classList.add('win'); reels[2]?.classList.add('win'); }
        }

        if (data.payout > 0) {
          _setStatus(`WIN! +${data.payout} coins`);
        } else {
          _setStatus('No match. Try again!');
        }

        spinning = false;
        if (spinBtn) spinBtn.disabled = false;
        if (betInput) betInput.disabled = false;
      }, 1000);

    } catch (e) {
      _stopReels(reels, spinIntervals, ['-','-','-']);
      _setStatus('Network error.');
      spinning = false;
      if (spinBtn) spinBtn.disabled = false;
      if (betInput) betInput.disabled = false;
    }
  }

  function _stopReel(reel, interval, emoji) {
    if (interval) clearInterval(interval);
    if (reel) {
      reel.classList.remove('spinning');
      reel.textContent = emoji;
    }
  }

  function _stopReels(reels, intervals, emojis) {
    reels.forEach((r, i) => _stopReel(r, intervals[i], emojis[i]));
  }

  function _setStatus(text) {
    const el = document.getElementById('slotsStatus');
    if (el) el.textContent = text;
  }

  function _resetTable() {
    const reels = [0,1,2].map(i => document.getElementById('slotsReel' + i));
    reels.forEach(r => {
      if (r) { r.textContent = '-'; r.classList.remove('spinning', 'win'); }
    });
    _setStatus('Place your bet and SPIN!');
    const spinBtn = document.getElementById('slotsSpinBtn');
    const betInput = document.getElementById('slotsBetInput');
    if (spinBtn) spinBtn.disabled = false;
    if (betInput) betInput.disabled = false;
    spinning = false;
  }

  // ── Wiring ──────────────────────────────────────────────────
  function wire() {
    document.getElementById('slotsSpinBtn')?.addEventListener('click', spin);
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
