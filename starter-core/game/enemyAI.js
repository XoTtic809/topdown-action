/**
 * enemyAI.js
 * Enemy class, spawn logic, and wave-based type selection.
 *
 * Enemy types:
 *   'normal'  — chases the player directly, 1 HP
 *   'fast'    — smaller and quicker, 1 HP
 *   'tank'    — large and slow with a concentric ring detail, 3 HP
 *   'shooter' — keeps its distance and fires projectiles at the player
 *
 * All enemies spawn just outside the screen edges and move inward.
 * Type selection probabilities increase with wave number so difficulty
 * ramps naturally.
 *
 * Usage:
 *   import { Enemy, spawnEnemy } from './enemyAI.js';
 *   spawnEnemy(state.wave);  // Adds a new enemy to state.enemies
 */

import { canvas, ctx, setShadow, clearShadow, createExplosion } from '../engine/renderer.js';
import { state } from '../engine/state.js';

// ─────────────────────────────────────────────────────────────
// Stat Templates
// ─────────────────────────────────────────────────────────────

const STATS = {
  normal:  { r: 14, speed: 126, hp: 1, color: '#ff7b6b', scoreValue: 10 },
  fast:    { r: 10, speed: 228, hp: 1, color: '#ff9ff3', scoreValue: 15 },
  tank:    { r: 20, speed: 78,  hp: 3, color: '#e74c3c', scoreValue: 30 },
  shooter: { r: 12, speed: 90,  hp: 2, color: '#ffd93d', scoreValue: 25, shootCooldownMax: 2.5 },
};

// ─────────────────────────────────────────────────────────────
// Enemy Class
// ─────────────────────────────────────────────────────────────

export class Enemy {
  /**
   * @param {number} x
   * @param {number} y
   * @param {'normal'|'fast'|'tank'|'shooter'} type
   */
  constructor(x, y, type = 'normal') {
    this.x    = x;
    this.y    = y;
    this.type = type;

    // Copy stats from the template (fall back to normal if unknown type)
    const s          = STATS[type] ?? STATS.normal;
    this.r           = s.r;
    this.speed       = s.speed;
    this.hp          = s.hp;
    this.maxHp       = s.hp;
    this.color       = s.color;
    this.scoreValue  = s.scoreValue;

    // Shooter-specific cooldown
    this.shootCooldown    = s.shootCooldownMax ?? 0;
    this.shootCooldownMax = s.shootCooldownMax ?? 0;

    // Prevents premature off-screen culling while the enemy is still entering
    this.hasEnteredScreen = false;
  }

  // ─────────────────────────────────────────────────────────
  // Update — call once per frame
  // ─────────────────────────────────────────────────────────

  update(dt) {
    const player = state.player;
    if (!player) return;

    const dx    = player.x - this.x;
    const dy    = player.y - this.y;
    const angle = Math.atan2(dy, dx);
    const dist  = Math.sqrt(dx * dx + dy * dy);

    if (this.type === 'shooter') {
      this._updateShooter(dt, dist, angle);
    } else {
      // Normal / fast / tank: chase the player directly
      this.x += Math.cos(angle) * this.speed * dt;
      this.y += Math.sin(angle) * this.speed * dt;
    }

    // Mark once the enemy has crossed into the visible screen area
    if (!this.hasEnteredScreen) {
      const m = 20;
      if (this.x > m && this.x < canvas.width - m &&
          this.y > m && this.y < canvas.height - m) {
        this.hasEnteredScreen = true;
      }
    }
  }

  _updateShooter(dt, dist, angle) {
    // Shooters maintain an ideal range of ~250 px, strafing to hold it
    const ideal = 250;

    if      (dist > ideal + 40) {
      // Too far — close in
      this.x += Math.cos(angle) * this.speed * dt;
      this.y += Math.sin(angle) * this.speed * dt;
    } else if (dist < ideal - 40) {
      // Too close — back away
      this.x -= Math.cos(angle) * this.speed * dt;
      this.y -= Math.sin(angle) * this.speed * dt;
    }
    // Otherwise strafe (lateral movement could be added here)

    // Fire at the player
    this.shootCooldown -= dt;
    if (this.shootCooldown <= 0) {
      this.shootCooldown = this.shootCooldownMax;
      this._fire(angle);
    }
  }

  _fire(angle) {
    // Push a plain-object projectile; drawn by drawEnemyBullet() in shooting.js
    state.enemyBullets.push({
      x:  this.x,
      y:  this.y,
      vx: Math.cos(angle) * 320,
      vy: Math.sin(angle) * 320,
      r:  5,
    });
  }

  // ─────────────────────────────────────────────────────────
  // Draw
  // ─────────────────────────────────────────────────────────

  draw() {
    // Glowing body
    setShadow(10, this.color + '88');
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    clearShadow();

    // Type-specific details
    if (this.type === 'tank') {
      // Concentric inner ring — conveys bulk
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r - 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.type === 'shooter') {
      // Dark inner dot — suggests a gun barrel
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // HP bar — only visible after the first hit
    if (this.hp < this.maxHp) {
      this._drawHPBar();
    }
  }

  _drawHPBar() {
    const w   = this.r * 2;
    const bx  = this.x - this.r;
    const by  = this.y - this.r - 7;
    const pct = this.hp / this.maxHp;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(bx, by, w, 4);

    ctx.fillStyle = pct > 0.5 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(bx, by, w * pct, 4);
  }
}

// ─────────────────────────────────────────────────────────────
// Spawning
// ─────────────────────────────────────────────────────────────

/**
 * Spawn one enemy at a random point just outside the screen edge.
 * Type is chosen based on the current wave number.
 *
 * @param {number} wave - Current wave number
 */
export function spawnEnemy(wave) {
  const { x, y } = _randomEdge();
  const type      = _pickType(wave);
  state.enemies.push(new Enemy(x, y, type));
}

/** Return a spawn position just outside one of the four screen edges. */
function _randomEdge() {
  const side = Math.floor(Math.random() * 4);
  switch (side) {
    case 0:  return { x: Math.random() * canvas.width,  y: -25 };
    case 1:  return { x: canvas.width + 25,             y: Math.random() * canvas.height };
    case 2:  return { x: Math.random() * canvas.width,  y: canvas.height + 25 };
    default: return { x: -25,                           y: Math.random() * canvas.height };
  }
}

/**
 * Choose an enemy type using wave-scaled probabilities.
 *
 * Wave 1      → normal only
 * Wave 2      → fast introduced
 * Wave 3–4    → tanks join
 * Wave 5+     → shooters added
 */
function _pickType(wave) {
  const r = Math.random();

  if (wave >= 5) {
    if (r < 0.10) return 'shooter';
    if (r < 0.25) return 'tank';
    if (r < 0.50) return 'fast';
    return 'normal';
  }
  if (wave >= 3) {
    if (r < 0.15) return 'tank';
    if (r < 0.45) return 'fast';
    return 'normal';
  }
  if (wave >= 2) {
    if (r < 0.40) return 'fast';
    return 'normal';
  }
  return 'normal';
}
