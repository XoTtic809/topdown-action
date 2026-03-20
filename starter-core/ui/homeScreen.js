/**
 * homeScreen.js
 * Home screen / main menu, pause screen, and skin selector.
 *
 * This module manages all non-game UI:
 *   - Title screen (shown at load and after game over)
 *   - Skin selector (pick from owned skins)
 *   - Pause overlay
 *
 * It does NOT contain any game logic — it only wires HTML elements
 * to callbacks provided by the game loop.
 *
 * Usage:
 *   import { initUI, showHomeScreen, showPauseScreen, hidePauseScreen } from '../ui/homeScreen.js';
 *
 *   initUI({ onStart, onTogglePause, onMenu });
 *   showHomeScreen();                // On first load
 *   showHomeScreen(true, score);     // After game over
 */

import { SKINS, activeSkin, setActiveSkin, isSkinOwned } from '../game/skins.js';

const $ = (id) => document.getElementById(id);

// ─────────────────────────────────────────────────────────────
// Home Screen
// ─────────────────────────────────────────────────────────────

/**
 * Show the home screen.
 *
 * @param {boolean} gameOver   - Pass true to show the "Game Over" banner
 * @param {number}  finalScore - Score to display in the banner
 */
export function showHomeScreen(gameOver = false, finalScore = 0) {
  $('homeScreen').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('pauseScreen').classList.add('hidden');

  if (gameOver) {
    $('gameOverMsg').classList.remove('hidden');
    $('finalScore').textContent = finalScore.toLocaleString();
  } else {
    $('gameOverMsg').classList.add('hidden');
  }

  // Refresh stat footer
  const best = parseInt(localStorage.getItem('highScore') || '0');
  $('bestScore').textContent    = best.toLocaleString();

  // Show current skin name
  const skin = SKINS.find(s => s.id === activeSkin);
  $('activeSkinName').textContent = skin?.name ?? activeSkin;

  // Rebuild skin selector so newly unlocked skins show immediately
  _buildSkinSelector();
}

export function hideHomeScreen() {
  $('homeScreen').classList.add('hidden');
  $('hud').classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────
// Pause Screen
// ─────────────────────────────────────────────────────────────

export function showPauseScreen() {
  $('pauseScreen').classList.remove('hidden');
}

export function hidePauseScreen() {
  $('pauseScreen').classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────
// Skin Selector
// ─────────────────────────────────────────────────────────────

/**
 * Build (or rebuild) the row of skin buttons from the SKINS array.
 * Owned skins are selectable; locked skins are greyed out and unclickable.
 */
function _buildSkinSelector() {
  const container = $('skinSelector');
  container.innerHTML = '';

  SKINS.forEach((skin) => {
    const owned = isSkinOwned(skin.id);

    const btn = document.createElement('button');
    btn.className   = 'skin-btn';
    btn.title       = owned ? skin.name : `${skin.name} (locked)`;

    // Use the skin's static color for the button swatch;
    // animated skins (color: null) fall back to a purple preview
    btn.style.background = skin.color ?? '#9b59b6';

    if (skin.id === activeSkin) btn.classList.add('active');
    if (!owned)                 btn.style.opacity = '0.3';

    btn.addEventListener('click', () => {
      if (!owned) return;
      setActiveSkin(skin.id);

      // Update active indicator on all buttons
      container.querySelectorAll('.skin-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('activeSkinName').textContent = skin.name;
    });

    container.appendChild(btn);
  });
}

// ─────────────────────────────────────────────────────────────
// Init — wire up button event listeners
// ─────────────────────────────────────────────────────────────

/**
 * Initialize the UI and bind button callbacks.
 * Call once at startup, before showing the home screen.
 *
 * @param {{ onStart: Function, onTogglePause: Function, onMenu: Function }} callbacks
 *   onStart       — called when the player clicks "Start Game"
 *   onTogglePause — called when the player clicks "Resume"
 *   onMenu        — called when the player clicks "Main Menu" from pause
 */
export function initUI({ onStart, onTogglePause, onMenu }) {
  // ── Home screen ───────────────────────────────────────────
  $('startBtn').addEventListener('click', () => {
    hideHomeScreen();
    onStart();
  });

  // ── Pause → Resume ────────────────────────────────────────
  $('resumeBtn').addEventListener('click', () => {
    hidePauseScreen();
    onTogglePause();
  });

  // ── Pause → Main menu ─────────────────────────────────────
  $('menuBtn').addEventListener('click', () => {
    hidePauseScreen();
    onMenu();
  });
}
