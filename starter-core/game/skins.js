/**
 * skins.js
 * Skin system: definitions, animated color logic, and localStorage persistence.
 *
 * How to add a new skin:
 *   1. Add an entry to SKINS with a unique `id`.
 *   2. If it's animated (color: null), add a case in getActiveSkinColor().
 *   3. Optionally add special draw logic in Player._drawSkinEffects() (playerMovement.js).
 *
 * Skin unlock state is stored in localStorage as a JSON array of skin IDs.
 */

// ─────────────────────────────────────────────────────────────
// Skin Definitions
// ─────────────────────────────────────────────────────────────

export const SKINS = [
  // ── Starter skins (solid colors) ─────────────────────────
  { id: 'agent',    name: 'Agent',     color: '#58a6ff' },   // Default — always unlocked
  { id: 'crimson',  name: 'Crimson',   color: '#dc143c' },
  { id: 'gold',     name: 'Gold Rush', color: '#ffd700' },
  { id: 'emerald',  name: 'Emerald',   color: '#2ecc71' },
  { id: 'obsidian', name: 'Obsidian',  color: '#6c6cbe' },

  // ── Animated skins (color: null → computed in getActiveSkinColor) ──
  {
    id: 'rainbow',
    name: 'Rainbow',
    color: null,  // Cycles through all hues continuously
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    color: null,  // Pulses through deep blue → indigo → violet
    // Also draws orbiting sparkle particles in playerMovement.js
  },
  {
    id: 'void',
    name: 'Void Walker',
    color: null,  // Dark purple with a pulsing glow, tendrils in playerMovement.js
  },
];

// ─────────────────────────────────────────────────────────────
// Unlock State (persisted to localStorage)
// ─────────────────────────────────────────────────────────────

// Load the set of owned skin IDs from localStorage.
// 'agent' is always unlocked — it's the default.
let _ownedSkins = new Set(
  JSON.parse(localStorage.getItem('ownedSkins') || '["agent"]')
);

/** Returns true if the player owns a skin by ID. */
export function isSkinOwned(id) {
  return _ownedSkins.has(id);
}

/** Unlock a skin and persist the change. */
export function unlockSkin(id) {
  _ownedSkins.add(id);
  localStorage.setItem('ownedSkins', JSON.stringify([..._ownedSkins]));
}

// ─────────────────────────────────────────────────────────────
// Active Skin (persisted to localStorage)
// ─────────────────────────────────────────────────────────────

export let activeSkin = localStorage.getItem('activeSkin') || 'agent';

/**
 * Switch the active skin. Silently ignores unknown or un-owned skin IDs.
 * @param {string} id - Skin ID from SKINS array
 */
export function setActiveSkin(id) {
  if (SKINS.find(s => s.id === id) && isSkinOwned(id)) {
    activeSkin = id;
    localStorage.setItem('activeSkin', id);
  }
}

// ─────────────────────────────────────────────────────────────
// Color Resolution
// ─────────────────────────────────────────────────────────────

/**
 * Return the current CSS color for the active skin.
 * Animated skins shift color using Date.now() so they animate smoothly
 * across frames without any extra state.
 *
 * @returns {string} CSS color string (hex, hsl, or rgba)
 */
export function getActiveSkinColor() {
  switch (activeSkin) {

    case 'rainbow': {
      // Full hue cycle, one rotation every ~7 seconds
      const hue = (Date.now() / 20) % 360;
      return `hsl(${hue}, 100%, 70%)`;
    }

    case 'galaxy': {
      // Slow sine pulse between deep blue (220) and violet (260)
      const t   = Date.now() / 2000;
      const hue = 220 + Math.sin(t) * 40;
      return `hsl(${hue}, 85%, 65%)`;
    }

    case 'void': {
      // Dark purple that brightens and dims like a heartbeat
      const pulse      = (Math.sin(Date.now() / 400) + 1) / 2;  // 0 → 1
      const lightness  = 25 + pulse * 20;                         // 25% → 45%
      return `hsl(270, 70%, ${lightness}%)`;
    }

    default: {
      // Static hex color from SKINS definition
      const skin = SKINS.find(s => s.id === activeSkin);
      return skin?.color ?? '#58a6ff';
    }
  }
}

/**
 * Return a semi-transparent version of the active skin color for glow effects.
 * Used for bullet glow, player ring, and setShadow() calls.
 *
 * @returns {string} CSS rgba/hsla color string
 */
export function getActiveSkinGlow() {
  switch (activeSkin) {
    case 'void':    return 'rgba(150, 0, 255, 0.45)';
    case 'galaxy':  return 'rgba(100, 140, 255, 0.4)';
    case 'rainbow': {
      const hue = (Date.now() / 20) % 360;
      return `hsla(${hue}, 100%, 70%, 0.4)`;
    }
    default: {
      const skin = SKINS.find(s => s.id === activeSkin);
      // Append 66 (40% opacity) to any hex color
      const hex  = skin?.color ?? '#58a6ff';
      return hex + '66';
    }
  }
}
