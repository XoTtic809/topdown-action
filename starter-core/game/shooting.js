/**
 * shooting.js
 * Bullet class and the playerShoot() function.
 *
 * Weapon levels determine fire pattern:
 *   Level 1 — single centered shot
 *   Level 2 — parallel twin shot (offset perpendicular to aim)
 *   Level 3 — V-spread (center + two angled outward by ~10°)
 *
 * Usage:
 *   Player holds a `weaponLevel` property (default 1).
 *   Call playerShoot(player) when the player fires.
 *   Call updateBullets(dt) and drawBullets() each frame.
 */

import { canvas, ctx, setShadow, clearShadow } from '../engine/renderer.js';
import { mouse } from '../engine/input.js';
import { state } from '../engine/state.js';
import { getActiveSkinColor, getActiveSkinGlow } from './skins.js';

const BULLET_SPEED = 650;  // px/sec

// ─────────────────────────────────────────────────────────────
// Bullet Class
// ─────────────────────────────────────────────────────────────

export class Bullet {
  /**
   * @param {number} x  - Spawn X
   * @param {number} y  - Spawn Y
   * @param {number} vx - Velocity X (px/sec)
   * @param {number} vy - Velocity Y (px/sec)
   */
  constructor(x, y, vx, vy) {
    this.x  = x;
    this.y  = y;
    this.vx = vx;
    this.vy = vy;
    this.r  = 5;   // Collision & visual radius
  }

  /**
   * Move the bullet.
   * @param {number} dt - Delta time in seconds
   * @returns {boolean} false when the bullet has left the screen (should be removed)
   */
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const m = 60;
    return !(this.x < -m || this.x > canvas.width + m ||
             this.y < -m || this.y > canvas.height + m);
  }

  draw() {
    setShadow(14, getActiveSkinGlow());
    ctx.fillStyle = getActiveSkinColor();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    clearShadow();
  }
}

// ─────────────────────────────────────────────────────────────
// Player Shoot — called by playerMovement.js
// ─────────────────────────────────────────────────────────────

/**
 * Fire one or more bullets from the player toward the mouse cursor.
 * Pattern depends on player.weaponLevel (1, 2, or 3).
 *
 * @param {import('../game/playerMovement.js').Player} player
 */
export function playerShoot(player) {
  const angle       = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  const weaponLevel = player.weaponLevel ?? 1;

  if (weaponLevel >= 3) {
    // V-spread: three bullets fanning outward
    const spread = 0.18;  // ~10 degrees per side
    _spawn(player.x, player.y, angle);
    _spawn(player.x, player.y, angle - spread);
    _spawn(player.x, player.y, angle + spread);

  } else if (weaponLevel === 2) {
    // Twin parallel shot — offset perpendicular to aim direction
    const perpX = Math.cos(angle + Math.PI / 2) * 7;
    const perpY = Math.sin(angle + Math.PI / 2) * 7;
    _spawn(player.x + perpX, player.y + perpY, angle);
    _spawn(player.x - perpX, player.y - perpY, angle);

  } else {
    // Single centered shot
    _spawn(player.x, player.y, angle);
  }
}

function _spawn(x, y, angle) {
  state.bullets.push(new Bullet(
    x, y,
    Math.cos(angle) * BULLET_SPEED,
    Math.sin(angle) * BULLET_SPEED,
  ));
}

// ─────────────────────────────────────────────────────────────
// Enemy Bullet Draw Helper
// ─────────────────────────────────────────────────────────────

/**
 * Draw a single enemy bullet.
 * Enemy bullets are stored as plain objects: { x, y, vx, vy, r }.
 *
 * @param {{ x:number, y:number, r:number }} b
 */
export function drawEnemyBullet(b) {
  setShadow(8, 'rgba(255, 100, 100, 0.5)');
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fill();
  clearShadow();
}
