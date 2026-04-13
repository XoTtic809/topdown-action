// poker.js
// 5-Card Draw Poker vs Dealer within the casino lobby.
// Renders into #casGame_poker.

(function () {
  'use strict';

  const API = (typeof API_BASE !== 'undefined' && API_BASE) ||
    ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:3001/api'
      : 'https://topdown-action-production-8a95.up.railway.app/api');

  function getToken() { return localStorage.getItem('topdown_token') || null; }

  let currentGame = null; // { gameId, hand, ... }
  let holdSet = new Set(); // indices of cards the player wants to KEEP

  // ── Server actions ──────────────────────────────────────────
  async function dealHand() {
    const betInput = document.getElementById('pokerBetInput');
    const bet = parseInt(betInput?.value, 10);
    if (!bet || bet < 10) { _setStatus('Minimum ante is 10.'); return; }
    if (typeof playerCoins === 'number' && bet > playerCoins) {
      _setStatus('Not enough coins.'); return;
    }
    _setBetEnabled(false);
    _setDrawEnabled(false);
    try {
      const res = await fetch(`${API}/poker/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ bet }),
      });
      const data = await res.json();
      if (!res.ok) { _setStatus(data.error || 'Failed to deal.'); _setBetEnabled(true); return; }
      currentGame = data;
      holdSet = new Set([0, 1, 2, 3, 4]); // all held by default
      window.casinoApplyBalance(data.newBalance);
      _renderPlayerHand(data.hand, true);
      _renderDealerHand(null, false); // face down
      _setStatus(`Ante ${data.bet} \u2022 Click cards to discard, then DRAW`);
      _setDrawEnabled(true);
    } catch (e) {
      _setStatus('Network error.');
      _setBetEnabled(true);
    }
  }

  async function draw() {
    if (!currentGame) return;
    _setDrawEnabled(false);
    try {
      const res = await fetch(`${API}/poker/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ gameId: currentGame.gameId, hold: [...holdSet] }),
      });
      const data = await res.json();
      if (!res.ok) { _setStatus(data.error || 'Draw failed.'); _setDrawEnabled(true); return; }

      window.casinoApplyBalance(data.newBalance);
      _renderPlayerHand(data.playerHand, false);
      _renderDealerHand(data.dealerHand, true);

      const playerLabel = document.getElementById('pokerPlayerLabel');
      const dealerLabel = document.getElementById('pokerDealerLabel');
      if (playerLabel) playerLabel.textContent = `Your Hand \u2014 ${data.playerRank}`;
      if (dealerLabel) dealerLabel.textContent = `Dealer \u2014 ${data.dealerRank}`;

      if (data.outcome === 'win') {
        _setStatus(`You win! ${data.playerRank} beats ${data.dealerRank}. +${data.payout}`);
      } else if (data.outcome === 'push') {
        _setStatus(`Push! Both have ${data.playerRank}. Ante returned.`);
      } else {
        _setStatus(`Dealer wins with ${data.dealerRank}. -${currentGame.bet}`);
      }

      currentGame = null;
      holdSet.clear();
      _setBetEnabled(true);
    } catch (e) {
      _setStatus('Network error.');
      _setDrawEnabled(true);
    }
  }

  // ── UI helpers ──────────────────────────────────────────────
  function _renderPlayerHand(cards, interactive) {
    const el = document.getElementById('pokerPlayerCards');
    if (!el) return;
    el.innerHTML = '';
    if (!cards) return;
    cards.forEach((c, i) => {
      const div = document.createElement('div');
      const red = c.s === '♥' || c.s === '♦';
      div.className = 'cas-card' + (red ? ' cas-card-red' : '');
      if (interactive) {
        div.classList.add('selectable');
        if (holdSet.has(i)) div.classList.add('held');
        else div.classList.add('discarded');
        div.addEventListener('click', () => _toggleHold(i, div));
      }
      div.innerHTML = `<span class="cas-rank">${c.r}</span><span class="cas-suit">${c.s}</span>`;
      el.appendChild(div);
    });
  }

  function _toggleHold(index, el) {
    if (holdSet.has(index)) {
      holdSet.delete(index);
      el.classList.remove('held');
      el.classList.add('discarded');
    } else {
      holdSet.add(index);
      el.classList.add('held');
      el.classList.remove('discarded');
    }
  }

  function _renderDealerHand(cards, reveal) {
    const el = document.getElementById('pokerDealerCards');
    if (!el) return;
    if (!reveal || !cards) {
      el.innerHTML = Array(5).fill(window.casinoCardBack()).join('');
      return;
    }
    el.innerHTML = cards.map(window.casinoCardHtml).join('');
  }

  function _setStatus(text) {
    const el = document.getElementById('pokerStatus');
    if (el) el.textContent = text;
  }

  function _setBetEnabled(on) {
    const bet = document.getElementById('pokerBetInput');
    const deal = document.getElementById('pokerDealBtn');
    if (bet) bet.disabled = !on;
    if (deal) { deal.disabled = !on; deal.classList.toggle('hidden', !on); }
  }

  function _setDrawEnabled(on) {
    const btn = document.getElementById('pokerDrawBtn');
    if (btn) { btn.disabled = !on; btn.classList.toggle('hidden', !on); }
  }

  function _resetTable() {
    const playerCards = document.getElementById('pokerPlayerCards');
    const dealerCards = document.getElementById('pokerDealerCards');
    if (playerCards) playerCards.innerHTML = '';
    if (dealerCards) dealerCards.innerHTML = '';
    const playerLabel = document.getElementById('pokerPlayerLabel');
    const dealerLabel = document.getElementById('pokerDealerLabel');
    if (playerLabel) playerLabel.textContent = 'Your Hand';
    if (dealerLabel) dealerLabel.textContent = 'Dealer';
    _setStatus('Ante up and DEAL.');
    _setBetEnabled(true);
    _setDrawEnabled(false);
    currentGame = null;
    holdSet.clear();
  }

  // ── Wiring ──────────────────────────────────────────────────
  function wire() {
    document.getElementById('pokerDealBtn')?.addEventListener('click', dealHand);
    document.getElementById('pokerDrawBtn')?.addEventListener('click', draw);
  }

  window.addEventListener('casino:tab-activated', (e) => {
    if (e.detail === 'poker') _resetTable();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
