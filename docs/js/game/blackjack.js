// blackjack.js
// Hidden blackjack mini-game. No nav button — only reachable by:
//   1. Visiting index.html#bj
//   2. Konami sequence on the home screen (↑↑↓↓←→←→BA)
// Server-authoritative; gated by the `blackjack` feature flag.

(function () {
  'use strict';

  const API = (typeof API_BASE !== 'undefined' && API_BASE) ||
    ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:3001/api'
      : 'https://topdown-action-production-8a95.up.railway.app/api');

  function getToken() { return localStorage.getItem('topdown_token') || null; }

  let currentHand = null; // { handId, bet, ... }

  // ── Feature flag check ──────────────────────────────────────
  async function isBlackjackEnabled() {
    try {
      const res = await fetch(`${API}/features/blackjack`);
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.enabled;
    } catch { return false; }
  }

  // ── Public entry point ──────────────────────────────────────
  async function openBlackjack() {
    if (!getToken()) {
      _toast('You must be signed in.');
      return;
    }
    const enabled = await isBlackjackEnabled();
    if (!enabled) {
      // Silent — hidden mode should not advertise its existence to non-admins
      return;
    }
    const overlay = document.getElementById('blackjackOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    _resetTable('Place your bet and click DEAL.');
    _syncBalance();
  }

  function closeBlackjack() {
    const overlay = document.getElementById('blackjackOverlay');
    if (overlay) overlay.classList.add('hidden');
    currentHand = null;
  }

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
      _applyBalance(data.newBalance);
      _renderHands(data.player, data.dealerUp || data.dealer, data.state === 'done');
      if (data.state === 'done') {
        _showOutcome(data);
      } else {
        _setStatus(`Bet ${data.bet} • Hit, Stand, or Double`);
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
        _applyBalance(data.newBalance);
        _showOutcome(data);
      } else {
        _setStatus(`Player ${_value(data.player)} • Hit or Stand`);
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
    if (pEl) pEl.innerHTML = (player || []).map(_cardHtml).join('');
    if (dEl) {
      const cards = (dealer || []).map(_cardHtml);
      if (!revealAll && cards.length === 1) cards.push('<div class="bj-card bj-card-back">?</div>');
      dEl.innerHTML = cards.join('');
    }
    const pVal = document.getElementById('bjPlayerValue');
    const dVal = document.getElementById('bjDealerValue');
    if (pVal) pVal.textContent = player ? `Player: ${_value(player)}` : 'Player: —';
    if (dVal) dVal.textContent = dealer && revealAll ? `Dealer: ${_value(dealer)}` : 'Dealer: ?';
  }

  function _cardHtml(c) {
    const red = c.s === '♥' || c.s === '♦';
    return `<div class="bj-card${red ? ' bj-card-red' : ''}"><span class="bj-rank">${c.r}</span><span class="bj-suit">${c.s}</span></div>`;
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
    _setStatus(msg || '');
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

  function _applyBalance(newBalance) {
    if (typeof newBalance !== 'number') return;
    if (typeof window.playerCoins !== 'undefined') window.playerCoins = newBalance;
    _syncBalance();
    // Refresh other coin HUDs in the game (best-effort, no hard dep)
    const coinsHUD = document.getElementById('coinsHUD');
    if (coinsHUD) coinsHUD.textContent = `🪙 ${newBalance}`;
    const homeCoins = document.getElementById('homeCoinsVal');
    if (homeCoins) homeCoins.textContent = newBalance;
  }

  function _syncBalance() {
    const el = document.getElementById('bjBalance');
    if (el && typeof playerCoins === 'number') el.textContent = `🪙 ${playerCoins}`;
  }

  function _toast(msg) {
    console.log('[Blackjack]', msg);
  }

  // ── Wiring ──────────────────────────────────────────────────
  function wire() {
    document.getElementById('bjDealBtn')?.addEventListener('click', startHand);
    document.getElementById('bjHitBtn')?.addEventListener('click', () => sendAction('hit'));
    document.getElementById('bjStandBtn')?.addEventListener('click', () => sendAction('stand'));
    document.getElementById('bjDoubleBtn')?.addEventListener('click', () => sendAction('double'));
    document.getElementById('bjCloseBtn')?.addEventListener('click', closeBlackjack);
    document.querySelector('#blackjackOverlay .bj-backdrop')?.addEventListener('click', closeBlackjack);
  }

  // Konami sequence on home screen → ↑↑↓↓←→←→BA
  const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let kpos = 0;
  document.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === KONAMI[kpos]) {
      kpos++;
      if (kpos === KONAMI.length) { kpos = 0; openBlackjack(); }
    } else {
      kpos = (k === KONAMI[0]) ? 1 : 0;
    }
  });

  // URL hash trigger — consume #bj immediately so it doesn't linger
  function checkHash() {
    if ((window.location.hash || '').toLowerCase() === '#bj') {
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch {}
      // Defer so the rest of the game has a chance to boot
      setTimeout(openBlackjack, 600);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { wire(); checkHash(); });
  } else {
    wire();
    checkHash();
  }

  // Expose for admin panel + manual triggers
  window.openBlackjack = openBlackjack;
  window.closeBlackjack = closeBlackjack;
})();
