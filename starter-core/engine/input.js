/**
 * input.js
 * Handles keyboard, mouse, and touch input.
 *
 * Usage:
 *   import { keys, mouse } from './input.js';
 *   // Then read keys['w'], mouse.x, mouse.down, etc. each frame.
 *
 * Call initInput(canvas, callbacks) once at startup.
 */

// Live keyboard state — key.toLowerCase() → true/false
export const keys = {};

// Live mouse/touch state
export const mouse = {
  x:    window.innerWidth  / 2,
  y:    window.innerHeight / 2,
  down: false,
};

/**
 * Set up all input event listeners.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ onDash: Function, onPause: Function }} callbacks
 *   onDash  — called when SPACE is pressed during gameplay
 *   onPause — called when ESC is pressed during gameplay
 */
export function initInput(canvas, { onDash, onPause }) {

  // ── Keyboard ────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;

    if (e.key === ' ') {
      e.preventDefault();
      onDash?.();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onPause?.();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // ── Mouse ────────────────────────────────────────────────────
  canvas.addEventListener('mousedown', () => { mouse.down = true;  });
  canvas.addEventListener('mouseup',   () => { mouse.down = false; });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  // ── Touch (mobile) ───────────────────────────────────────────
  // Mirrors mouse behavior. For a richer mobile experience you would
  // add a virtual joystick here — this keeps things minimal.
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    mouse.down = true;
    _updateMouseFromTouch(e, canvas);
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    mouse.down = false;
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    _updateMouseFromTouch(e, canvas);
  }, { passive: false });
}

function _updateMouseFromTouch(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.touches[0].clientX - rect.left;
  mouse.y = e.touches[0].clientY - rect.top;
}
