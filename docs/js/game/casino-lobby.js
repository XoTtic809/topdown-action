// casino-lobby.js
// Central orchestrator for the hidden casino. Manages the tabbed overlay,
// shared utilities (card rendering, balance sync), entry triggers (Konami,
// URL hash), and tab switching. Each game IIFE (blackjack, ridethebus,
// slots, poker) listens for 'casino:tab-activated' to initialize.

(function () {
  'use strict';

  const API = (typeof API_BASE !== 'undefined' && API_BASE) ||
    ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:3001/api'
      : 'https://topdown-action-production-8a95.up.railway.app/api');

  function getToken() { return localStorage.getItem('topdown_token') || null; }

  // ── Feature flag ────────────────────────────────────────────
  async function isCasinoEnabled() {
    try {
      const res = await fetch(`${API}/features/casino`);
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.enabled;
    } catch { return false; }
  }

  // ── Open / Close ────────────────────────────────────────────
  async function openCasino(tab) {
    if (!getToken()) return;
    const enabled = await isCasinoEnabled();
    if (!enabled) return;
    const overlay = document.getElementById('casinoOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    syncBalance();
    if (tab) switchTab(tab);
    else {
      // Activate whichever tab is already marked active
      const activeTab = document.querySelector('.cas-tab.active');
      if (activeTab) fireTabEvent(activeTab.dataset.casGame);
    }
  }

  function closeCasino() {
    const overlay = document.getElementById('casinoOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ── Tab switching ───────────────────────────────────────────
  function switchTab(name) {
    document.querySelectorAll('.cas-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.cas-game-panel').forEach(p => p.classList.remove('active'));
    const tab = document.querySelector(`.cas-tab[data-cas-game="${name}"]`);
    if (tab) tab.classList.add('active');
    const panel = document.getElementById('casGame_' + name);
    if (panel) panel.classList.add('active');
    fireTabEvent(name);
  }

  function fireTabEvent(name) {
    window.dispatchEvent(new CustomEvent('casino:tab-activated', { detail: name }));
  }

  // ── Shared utilities exposed on window ──────────────────────
  function cardHtml(c) {
    const red = c.s === '♥' || c.s === '♦';
    return `<div class="cas-card${red ? ' cas-card-red' : ''}"><span class="cas-rank">${c.r}</span><span class="cas-suit">${c.s}</span></div>`;
  }

  function cardBackHtml() {
    return '<div class="cas-card cas-card-back">?</div>';
  }

  function applyBalance(newBalance) {
    if (typeof newBalance !== 'number') return;
    if (typeof window.playerCoins !== 'undefined') window.playerCoins = newBalance;
    syncBalance();
    const coinsHUD = document.getElementById('coinsHUD');
    if (coinsHUD) coinsHUD.textContent = '\uD83E\uDE99 ' + newBalance;
    const homeCoins = document.getElementById('homeCoinsVal');
    if (homeCoins) homeCoins.textContent = newBalance;
  }

  function syncBalance() {
    const el = document.getElementById('casBalance');
    if (el && typeof playerCoins === 'number') el.textContent = '\uD83E\uDE99 ' + playerCoins;
  }

  // ── Konami code: ↑↑↓↓←→←→BA ────────────────────────────────
  const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let kpos = 0;
  document.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === KONAMI[kpos]) {
      kpos++;
      if (kpos === KONAMI.length) { kpos = 0; openCasino(); }
    } else {
      kpos = (k === KONAMI[0]) ? 1 : 0;
    }
  });

  // ── URL hash triggers (#bj or #casino) ─────────────────────
  function checkHash() {
    const h = (window.location.hash || '').toLowerCase();
    if (h === '#bj' || h === '#casino') {
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch {}
      setTimeout(openCasino, 600);
    }
  }

  // ── Wiring ──────────────────────────────────────────────────
  function wire() {
    document.getElementById('casCloseBtn')?.addEventListener('click', closeCasino);
    document.querySelector('#casinoOverlay > .cas-backdrop')?.addEventListener('click', closeCasino);

    document.querySelectorAll('.cas-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.casGame));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { wire(); checkHash(); });
  } else {
    wire();
    checkHash();
  }

  // ── Public API ──────────────────────────────────────────────
  window.openCasino      = openCasino;
  window.closeCasino     = closeCasino;
  window.casinoCardHtml  = cardHtml;
  window.casinoCardBack  = cardBackHtml;
  window.casinoApplyBalance = applyBalance;
  window.casinoSyncBalance  = syncBalance;
  // Backwards compat for any existing openBlackjack calls
  window.openBlackjack   = openCasino;
  window.closeBlackjack  = closeCasino;
})();
