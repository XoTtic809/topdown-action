// blackjack.js
// Blackjack game tab within the casino lobby.
// Depends on casino-lobby.js for overlay management and shared utilities.

(function () {
  'use strict';

  const API = (typeof API_BASE !== 'undefined' && API_BASE) ||
    ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:3001/api'
      : 'https://topdown-action-production-8a95.up.railway.app/api');

  function getToken() { return localStorage.getItem('topdown_token') || null; }

  let currentHand = null;

  // ── Server actions ──────────────────────────────────────────
  async function startHand() {
    const betInput = document.getElementById('bjBetInput');
    const bet = parseInt(betInput?.value, 10);
    if (!bet || bet < 10) { _setStatus('Minimum bet is 10.'); return; }
    if (typeof playerCoins === 'number' && bet > playerCoins) {
      _setStatus('Not enough coins.'); return;
    }
    _setActionsEnabled(false);
    _setBetEnabled(false);
    try {
      const res = await fetch(`${API}/blackjack/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ bet }),
      });
      const data = await res.json();
      if (!res.ok) { _setStatus(data.error || 'Failed to start.'); _setBetEnabled(true); return; }
      currentHand = data;
      window.casinoApplyBalance(data.newBalance);
      _renderHands(data.player, data.dealerUp || data.dealer, data.state === 'done');
      if (data.state === 'done') {
        _showOutcome(data);
      } else {
        _setStatus(`Bet ${data.bet} \u2022 Hit, Stand, or Double`);
        _setActionsEnabled(true);
      }
    } catch (e) {
      _setStatus('Network error.');
      _setBetEnabled(true);
    }
  }

  async function sendAction(action) {
    if (!currentHand) return;
    _setActionsEnabled(false);
    try {
      const res = await fetch(`${API}/blackjack/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ handId: currentHand.handId, action }),
      });
      const data = await res.json();
      if (!res.ok) { _setStatus(data.error || 'Action failed.'); _setActionsEnabled(true); return; }
      currentHand = data;
      const dealerCards = data.state === 'done' ? data.dealer : (data.dealerUp || []);
      _renderHands(data.player, dealerCards, data.state === 'done');
      if (data.state === 'done') {
        window.casinoApplyBalance(data.newBalance);
        _showOutcome(data);
      } else {
        _setStatus(`Player ${_value(data.player)} \u2022 Hit or Stand`);
        _setActionsEnabled(true);
      }
    } catch (e) {
      _setStatus('Network error.');
      _setActionsEnabled(true);
    }
  }

  // ── UI helpers ──────────────────────────────────────────────
  function _value(cards) {
    let total = 0, aces = 0;
    for (const c of cards) {
      if (c.r === 'A') { total += 11; aces++; }
      else if (c.r === 'K' || c.r === 'Q' || c.r === 'J') total += 10;
      else total += parseInt(c.r, 10);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  function _renderHands(player, dealer, revealAll) {
    const pEl = document.getElementById('bjPlayerCards');
    const dEl = document.getElementById('bjDealerCards');
    if (pEl) pEl.innerHTML = (player || []).map(window.casinoCardHtml).join('');
    if (dEl) {
      const cards = (dealer || []).map(window.casinoCardHtml);
      if (!revealAll && cards.length === 1) cards.push(window.casinoCardBack());
      dEl.innerHTML = cards.join('');
    }
    const pVal = document.getElementById('bjPlayerValue');
    const dVal = document.getElementById('bjDealerValue');
    if (pVal) pVal.textContent = player ? `Player: ${_value(player)}` : 'Player: \u2014';
    if (dVal) dVal.textContent = dealer && revealAll ? `Dealer: ${_value(dealer)}` : 'Dealer: ?';
  }

  function _showOutcome(data) {
    const map = {
      blackjack:    `BLACKJACK! +${data.payout}`,
      dealer_bust:  `Dealer busts! +${data.payout}`,
      win:          `You win! +${data.payout}`,
      push:         `Push. Bet returned.`,
      lose:         `Dealer wins. -${data.bet}`,
      bust:         `Bust! -${data.bet}`,
    };
    _setStatus(map[data.outcome] || 'Hand complete.');
    _setActionsEnabled(false);
    _setBetEnabled(true);
    currentHand = null;
  }

  function _resetTable(msg) {
    _renderHands([], [], false);
    _setStatus(msg || 'Place your bet and click DEAL.');
    _setActionsEnabled(false);
    _setBetEnabled(true);
  }

  function _setStatus(text) {
    const el = document.getElementById('bjStatus');
    if (el) el.textContent = text;
  }

  function _setActionsEnabled(on) {
    ['bjHitBtn','bjStandBtn','bjDoubleBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !on;
    });
  }

  function _setBetEnabled(on) {
    const bet = document.getElementById('bjBetInput');
    const deal = document.getElementById('bjDealBtn');
    if (bet)  bet.disabled = !on;
    if (deal) deal.disabled = !on;
  }

  // ── Wiring ──────────────────────────────────────────────────
  function wire() {
    document.getElementById('bjDealBtn')?.addEventListener('click', startHand);
    document.getElementById('bjHitBtn')?.addEventListener('click', () => sendAction('hit'));
    document.getElementById('bjStandBtn')?.addEventListener('click', () => sendAction('stand'));
    document.getElementById('bjDoubleBtn')?.addEventListener('click', () => sendAction('double'));
  }

  // Reset table when our tab becomes active
  window.addEventListener('casino:tab-activated', (e) => {
    if (e.detail === 'blackjack') _resetTable();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
