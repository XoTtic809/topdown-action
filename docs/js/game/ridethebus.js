// ridethebus.js
// Ride the Bus — classic 4-round card guessing game.
// Renders into #casGame_ridethebus inside the casino lobby.

(function () {
  'use strict';

  const API = (typeof API_BASE !== 'undefined' && API_BASE) ||
    ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:3001/api'
      : 'https://topdown-action-production-8a95.up.railway.app/api');

  function getToken() { return localStorage.getItem('topdown_token') || null; }

  let currentGame = null; // { gameId, round, ... }

  const ROUND_LABELS = [
    '', // 0 unused
    'Round 1: Red or Black?',
    'Round 2: Higher or Lower?',
    'Round 3: Inside or Outside?',
    'Round 4: Guess the Suit!',
  ];

  // ── Server actions ──────────────────────────────────────────
  async function startGame() {
    const betInput = document.getElementById('rtbBetInput');
    const bet = parseInt(betInput?.value, 10);
    if (!bet || bet < 10) { _setStatus('Minimum bet is 10.'); return; }
    if (typeof playerCoins === 'number' && bet > playerCoins) {
      _setStatus('Not enough coins.'); return;
    }
    _setBetEnabled(false);
    _hideGuessControls();
    try {
      const res = await fetch(`${API}/ridethebus/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ bet }),
      });
      const data = await res.json();
      if (!res.ok) { _setStatus(data.error || 'Failed to start.'); _setBetEnabled(true); return; }
      currentGame = data;
      window.casinoApplyBalance(data.newBalance);
      _renderCards([data.card]);
      _setRoundLabel(1);
      _setStatus(`Bet ${data.bet} \u2022 ${ROUND_LABELS[1]}`);
      _showGuessButtons(1);
    } catch (e) {
      _setStatus('Network error.');
      _setBetEnabled(true);
    }
  }

  async function sendGuess(guess) {
    if (!currentGame) return;
    _disableGuessButtons();
    try {
      const res = await fetch(`${API}/ridethebus/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ gameId: currentGame.gameId, guess }),
      });
      const data = await res.json();
      if (!res.ok) { _setStatus(data.error || 'Guess failed.'); _enableGuessButtons(); return; }

      _renderCards(data.previousCards || []);

      if (data.done) {
        if (data.correct) {
          _setStatus(`ALL 4 CORRECT! You win ${data.payout} coins!`);
          if (data.newBalance != null) window.casinoApplyBalance(data.newBalance);
        } else {
          _setStatus(`Wrong! You lose your bet.`);
        }
        _hideGuessControls();
        _setBetEnabled(true);
        currentGame = null;
      } else {
        currentGame.round = data.round;
        currentGame.cashoutValue = data.cashoutValue;
        _setRoundLabel(data.round);
        _setStatus(`Correct! Cash out for ${data.cashoutValue} or keep going for ${data.nextMultiplier}x!`);
        _showGuessButtons(data.round, data.cashoutValue);
      }
    } catch (e) {
      _setStatus('Network error.');
      _enableGuessButtons();
    }
  }

  async function cashOut() {
    if (!currentGame) return;
    _disableGuessButtons();
    try {
      const res = await fetch(`${API}/ridethebus/cashout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ gameId: currentGame.gameId }),
      });
      const data = await res.json();
      if (!res.ok) { _setStatus(data.error || 'Cashout failed.'); _enableGuessButtons(); return; }

      if (data.newBalance != null) window.casinoApplyBalance(data.newBalance);
      _setStatus(`Cashed out after round ${data.round}! +${data.payout} coins`);
      _hideGuessControls();
      _setBetEnabled(true);
      currentGame = null;
    } catch (e) {
      _setStatus('Network error.');
      _enableGuessButtons();
    }
  }

  // ── UI helpers ──────────────────────────────────────────────
  function _renderCards(cards) {
    const el = document.getElementById('rtbCards');
    if (!el) return;
    el.innerHTML = cards.map(window.casinoCardHtml).join('');
  }

  function _setRoundLabel(round) {
    const el = document.getElementById('rtbRoundLabel');
    if (el) el.textContent = ROUND_LABELS[round] || '';
  }

  function _setStatus(text) {
    const el = document.getElementById('rtbStatus');
    if (el) el.textContent = text;
  }

  function _setBetEnabled(on) {
    const bet = document.getElementById('rtbBetInput');
    const start = document.getElementById('rtbStartBtn');
    if (bet) bet.disabled = !on;
    if (start) {
      start.disabled = !on;
      start.classList.toggle('hidden', !on);
    }
  }

  function _showGuessButtons(round, cashoutValue) {
    const container = document.getElementById('rtbGuessControls');
    if (!container) return;
    container.innerHTML = '';
    container.classList.remove('hidden');

    // Show cash out button if player has completed at least 1 round
    if (cashoutValue && round > 1) {
      const cashBtn = document.createElement('button');
      cashBtn.className = 'rtb-guess-btn cashout';
      cashBtn.textContent = `CASH OUT (+${cashoutValue})`;
      cashBtn.addEventListener('click', () => cashOut());
      container.appendChild(cashBtn);
    }

    let buttons = [];
    if (round === 1) {
      buttons = [
        { label: 'RED', guess: 'red', cls: 'red' },
        { label: 'BLACK', guess: 'black', cls: 'black' },
      ];
    } else if (round === 2) {
      buttons = [
        { label: 'HIGHER', guess: 'higher', cls: '' },
        { label: 'LOWER', guess: 'lower', cls: '' },
      ];
    } else if (round === 3) {
      buttons = [
        { label: 'INSIDE', guess: 'inside', cls: '' },
        { label: 'OUTSIDE', guess: 'outside', cls: '' },
      ];
    } else if (round === 4) {
      buttons = [
        { label: '\u2660', guess: 'spades', cls: 'black' },
        { label: '\u2665', guess: 'hearts', cls: 'red' },
        { label: '\u2666', guess: 'diamonds', cls: 'red' },
        { label: '\u2663', guess: 'clubs', cls: 'black' },
      ];
    }

    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'rtb-guess-btn' + (b.cls ? ' ' + b.cls : '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => sendGuess(b.guess));
      container.appendChild(btn);
    });
  }

  function _hideGuessControls() {
    const container = document.getElementById('rtbGuessControls');
    if (container) { container.classList.add('hidden'); container.innerHTML = ''; }
  }

  function _disableGuessButtons() {
    document.querySelectorAll('#rtbGuessControls .rtb-guess-btn').forEach(b => b.disabled = true);
  }
  function _enableGuessButtons() {
    document.querySelectorAll('#rtbGuessControls .rtb-guess-btn').forEach(b => b.disabled = false);
  }

  function _resetTable() {
    _renderCards([]);
    _setRoundLabel(1);
    _setStatus('Place your bet and click START.');
    _hideGuessControls();
    _setBetEnabled(true);
    currentGame = null;
  }

  // ── Wiring ──────────────────────────────────────────────────
  function wire() {
    document.getElementById('rtbStartBtn')?.addEventListener('click', startGame);
  }

  window.addEventListener('casino:tab-activated', (e) => {
    if (e.detail === 'ridethebus') _resetTable();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
