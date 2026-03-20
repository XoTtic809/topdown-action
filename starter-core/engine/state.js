/**
 * state.js
 * Shared game state — imported by all systems.
 *
 * All mutable game data lives here so modules don't hold their own copies
 * and there are no circular dependency surprises.
 */

export const state = {
  // ── Game flow ──────────────────────────────────────────────
  running: false,
  paused:  false,

  // ── Scoring ────────────────────────────────────────────────
  score:     0,
  highScore: parseInt(localStorage.getItem('highScore') || '0'),
  wave:      1,

  // ── Combo system ───────────────────────────────────────────
  combo:        0,
  comboTimer:   0,
  COMBO_WINDOW: 3,   // seconds to maintain combo between kills

  // ── Entity arrays (filled/cleared by the game loop) ────────
  bullets:      [],  // Player projectiles
  enemies:      [],  // Active enemies
  enemyBullets: [],  // Enemy projectiles
  particles:    [],  // Visual effects

  // ── Entity references (set at game start) ──────────────────
  player: null,

  // ── Wave management ────────────────────────────────────────
  enemiesSpawnedThisWave: 0,
  enemiesToSpawnThisWave: 0,
  enemiesKilledThisWave:  0,
  waveClearTimer:         0,
  spawnTimer:             0,
  spawnInterval:          1.5,  // seconds between enemy spawns
  WAVE_BREAK_TIME:        3,    // seconds between waves
  ENEMIES_PER_WAVE_BASE:  8,    // enemies on wave 1; +3 per wave after

  // ── Visual effects ─────────────────────────────────────────
  screenShake: 0,

  // ── Settings (loaded from localStorage) ───────────────────
  settings: {
    masterSound:  true,
    screenShake:  true,
    particles:    true,
    autoShoot:    false,
  },
};

/** Load persisted settings from localStorage and merge into state.settings. */
export function loadSettings() {
  const saved = localStorage.getItem('gameSettings');
  if (saved) {
    try { Object.assign(state.settings, JSON.parse(saved)); } catch (_) {}
  }
}

/** Persist current settings to localStorage. */
export function saveSettings() {
  localStorage.setItem('gameSettings', JSON.stringify(state.settings));
}
