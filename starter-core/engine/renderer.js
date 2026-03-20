/**
 * renderer.js
 * Canvas setup, drawing utilities, and the particle system.
 *
 * All modules that draw to the screen import `canvas` and `ctx` from here.
 *
 * Usage:
 *   import { canvas, ctx, setShadow, clearShadow, createExplosion } from './renderer.js';
 *
 * Call initRenderer() once before anything draws.
 */

import { state } from './state.js';

// Exported canvas and 2D context — set by initRenderer()
export let canvas;
export let ctx;

// ─────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────

/**
 * Grab the <canvas> element, get its 2D context, and fit it to the window.
 * Call this once before the game loop starts.
 */
export function initRenderer() {
  canvas = document.getElementById('game');
  ctx    = canvas.getContext('2d');
  _resize();
  window.addEventListener('resize', _resize);
}

function _resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

// ─────────────────────────────────────────────────────────────
// Background
// ─────────────────────────────────────────────────────────────

/**
 * Draw the arena background: dark fill + subtle grid + vignette.
 * Call at the start of each render frame (before drawing entities).
 */
export function drawBackground() {
  // Dark base
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle grid lines — gives a sense of space without being distracting
  ctx.strokeStyle = 'rgba(88,166,255,0.04)';
  ctx.lineWidth   = 1;
  const gs = 60;
  for (let x = 0; x < canvas.width;  x += gs) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gs) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // Vignette — darkens the edges so the centre feels lit
  const grad = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, canvas.height * 0.3,
    canvas.width / 2, canvas.height / 2, canvas.height * 0.9,
  );
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ─────────────────────────────────────────────────────────────
// Glow / shadow helpers
// ─────────────────────────────────────────────────────────────

/** Enable a glow around the next drawn shape. */
export function setShadow(blur, color) {
  ctx.shadowBlur  = blur;
  ctx.shadowColor = color;
}

/** Clear any active shadow. Always call this after drawing with a shadow. */
export function clearShadow() {
  ctx.shadowBlur  = 0;
  ctx.shadowColor = 'transparent';
}

// ─────────────────────────────────────────────────────────────
// Particle System
// ─────────────────────────────────────────────────────────────

class Particle {
  /**
   * @param {number} x       - Spawn X
   * @param {number} y       - Spawn Y
   * @param {number} vx      - Initial X velocity (px/sec)
   * @param {number} vy      - Initial Y velocity (px/sec)
   * @param {string} color   - CSS color string
   * @param {number} life    - Total lifespan in seconds
   * @param {number} radius  - Initial radius
   */
  constructor(x, y, vx, vy, color, life, radius) {
    this.x       = x;
    this.y       = y;
    this.vx      = vx;
    this.vy      = vy;
    this.color   = color;
    this.life    = life;
    this.maxLife = life;
    this.r       = radius;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.vy += 180 * dt;  // Gentle downward gravity
    this.life -= dt;
  }

  draw() {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0.1, this.r * alpha), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * Spawn an explosion burst of particles at (x, y).
 *
 * @param {number} x      - Center X
 * @param {number} y      - Center Y
 * @param {string} color  - CSS color
 * @param {number} count  - Number of particles (default 12)
 */
export function createExplosion(x, y, color, count = 12) {
  if (!state.settings.particles) return;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 200 + 80;
    state.particles.push(new Particle(
      x, y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      color,
      0.5 + Math.random() * 0.4,
      Math.random() * 3 + 1,
    ));
  }
}

/**
 * Spawn a small trailing particle (used for the player dash effect).
 *
 * @param {number} x      - Spawn X
 * @param {number} y      - Spawn Y
 * @param {string} color  - CSS color
 */
export function createTrailParticle(x, y, color) {
  if (!state.settings.particles) return;
  const angle = Math.random() * Math.PI * 2;
  state.particles.push(new Particle(
    x, y,
    Math.cos(angle) * 40, Math.sin(angle) * 40,
    color,
    0.2,
    3,
  ));
}

/**
 * Update every particle by dt seconds, draw alive ones, remove dead ones.
 * Call once per render frame.
 *
 * @param {number} dt - Delta time in seconds
 */
export function updateAndDrawParticles(dt) {
  state.particles = state.particles.filter((p) => {
    p.update(dt);
    if (p.life > 0) { p.draw(); return true; }
    return false;
  });
}
