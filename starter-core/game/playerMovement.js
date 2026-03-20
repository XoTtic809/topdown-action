/**
 * playerMovement.js
 * Player class: movement, dash, health, and rendering.
 *
 * The player is a glowing circle that:
 *   - Moves with WASD / Arrow keys
 *   - Aims at the mouse cursor (a dot rotates to face it)
 *   - Shoots when the mouse button is held (or auto-shoot is on)
 *   - Dashes with SPACE — brief high-speed burst + invincibility frames
 *
 * The active skin is read from skins.js every frame, so skin changes
 * take effect immediately without restarting the game.
 */

import { canvas, ctx, setShadow, clearShadow, createExplosion, createTrailParticle } from '../engine/renderer.js';
import { keys, mouse } from '../engine/input.js';
import { state } from '../engine/state.js';
import { getActiveSkinColor, getActiveSkinGlow, activeSkin } from './skins.js';
import { playerShoot } from './shooting.js';

export class Player {
  /**
   * @param {number} x - Starting X (pass canvas.width / 2 for centre)
   * @param {number} y - Starting Y (pass canvas.height / 2 for centre)
   */
  constructor(x, y) {
    // ── Position & size ────────────────────────────────────────
    this.x = x;
    this.y = y;
    this.r = 14;           // Collision radius in pixels

    // ── Stats ──────────────────────────────────────────────────
    this.speed       = 250;   // Movement speed in px/sec
    this.hp          = 100;
    this.maxHp       = 100;
    this.weaponLevel = 1;     // Bullet pattern: 1 = single, 2 = twin, 3 = spread

    // ── Shoot cooldown ─────────────────────────────────────────
    this.shootCooldown    = 0;
    this.shootCooldownMax = 0.12;   // ~8 shots per second

    // ── Dash ───────────────────────────────────────────────────
    this.dashCooldown       = 0;     // Remaining cooldown (seconds)
    this.dashDuration       = 0;     // How long the current dash lasts
    this.dashDir            = { x: 0, y: 0 };
    this.DASH_DURATION      = 0.15;  // 150 ms dash window
    this.DASH_COOLDOWN      = 3;     // 3 s until next dash
    this.DASH_SPEED_MULT    = 6;     // Speed multiplier during dash

    // ── Damage invincibility ───────────────────────────────────
    // Short grace period after taking a hit prevents repeated rapid damage.
    this.invincibleTimer = 0;
  }

  // ─────────────────────────────────────────────────────────
  // Update — call once per frame
  // ─────────────────────────────────────────────────────────

  update(dt) {
    this._tickCooldowns(dt);
    this._move(dt);
    this._shoot();
  }

  _tickCooldowns(dt) {
    this.shootCooldown   = Math.max(0, this.shootCooldown   - dt);
    this.dashCooldown    = Math.max(0, this.dashCooldown    - dt);
    this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);

    // While actively dashing, spawn a color trail behind the player
    if (this.dashDuration > 0) {
      this.dashDuration -= dt;
      createTrailParticle(this.x, this.y, getActiveSkinColor());
    }
  }

  _move(dt) {
    let dx = 0, dy = 0;

    // Read WASD / arrow keys
    if (keys['w'] || keys['arrowup'])    dy--;
    if (keys['s'] || keys['arrowdown'])  dy++;
    if (keys['a'] || keys['arrowleft'])  dx--;
    if (keys['d'] || keys['arrowright']) dx++;

    // During an active dash, override direction and boost speed
    let speed = this.speed;
    if (this.dashDuration > 0) {
      dx    = this.dashDir.x;
      dy    = this.dashDir.y;
      speed = this.speed * this.DASH_SPEED_MULT;
    }

    // Normalize diagonal movement so it isn't faster than cardinal movement
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dx !== 0 || dy !== 0) {
      this.x += (dx / len) * speed * dt;
      this.y += (dy / len) * speed * dt;
    }

    // Clamp to canvas bounds
    this.x = Math.max(this.r, Math.min(canvas.width  - this.r, this.x));
    this.y = Math.max(this.r, Math.min(canvas.height - this.r, this.y));
  }

  _shoot() {
    const wantShoot = mouse.down || state.settings.autoShoot;
    if (wantShoot && this.shootCooldown <= 0) {
      this.shootCooldown = this.shootCooldownMax;
      playerShoot(this);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Dash — triggered by SPACE via input.js callback
  // ─────────────────────────────────────────────────────────

  dash() {
    if (this.dashCooldown > 0 || this.dashDuration > 0) return;  // Still charging

    // Use current movement direction; fall back to mouse direction
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup'])    dy--;
    if (keys['s'] || keys['arrowdown'])  dy++;
    if (keys['a'] || keys['arrowleft'])  dx--;
    if (keys['d'] || keys['arrowright']) dx++;

    if (dx === 0 && dy === 0) {
      // No keys held — dash toward the mouse cursor instead
      const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
      dx = Math.cos(angle);
      dy = Math.sin(angle);
    }

    const len         = Math.sqrt(dx * dx + dy * dy) || 1;
    this.dashDir      = { x: dx / len, y: dy / len };
    this.dashDuration = this.DASH_DURATION;
    this.dashCooldown = this.DASH_COOLDOWN;

    // Brief invincibility — the dash itself plus a tiny buffer
    this.invincibleTimer = this.DASH_DURATION + 0.05;

    // Burst particle effect at dash origin
    createExplosion(this.x, this.y, getActiveSkinColor(), 10);
  }

  // ─────────────────────────────────────────────────────────
  // Damage
  // ─────────────────────────────────────────────────────────

  /**
   * Reduce HP by `amount`. Respects invincibility frames so the player
   * can't be hit repeatedly in the same moment.
   *
   * @param {number} amount - Damage to deal
   */
  takeDamage(amount) {
    if (this.invincibleTimer > 0) return;
    this.hp             -= amount;
    this.invincibleTimer = 0.3;   // 300 ms grace after each hit

    if (state.settings.screenShake) {
      state.screenShake = 8;
    }
  }

  /** @returns {boolean} true when the player has no HP remaining. */
  get isDead() {
    return this.hp <= 0;
  }

  // ─────────────────────────────────────────────────────────
  // Draw
  // ─────────────────────────────────────────────────────────

  draw() {
    const color = getActiveSkinColor();
    const glow  = getActiveSkinGlow();

    // Optional: skin-specific extra effects drawn underneath the body
    this._drawSkinEffects(color);

    // Blink during invincibility frames (rapidly show/hide)
    const blinking = this.invincibleTimer > 0 &&
                     Math.floor(this.invincibleTimer / 0.05) % 2 === 0;
    if (blinking) return;

    // ── Outer glow ring ─────────────────────────────────────
    setShadow(18, glow);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 3, 0, Math.PI * 2);
    ctx.stroke();

    // ── Main body circle ────────────────────────────────────
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    clearShadow();

    // ── Aim dot (rotates to face mouse cursor) ───────────────
    const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(
      this.x + Math.cos(angle) * (this.r - 4),
      this.y + Math.sin(angle) * (this.r - 4),
      3, 0, Math.PI * 2,
    );
    ctx.fill();

    // ── HP bar (above the player) ────────────────────────────
    this._drawHPBar();

    // ── Dash cooldown arc (around the player) ───────────────
    this._drawDashArc();
  }

  // ── Skin-specific extra visuals ──────────────────────────

  /**
   * Draw extra visuals for animated skins.
   * Extend this with new cases when you add animated skins.
   */
  _drawSkinEffects(color) {
    if (activeSkin === 'galaxy') {
      // Three sparkle dots orbiting the player
      const t = Date.now() / 800;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      for (let i = 0; i < 3; i++) {
        const a  = t + (i * Math.PI * 2) / 3;
        const ox = this.x + Math.cos(a) * (this.r + 9);
        const oy = this.y + Math.sin(a) * (this.r + 9);
        ctx.beginPath();
        ctx.arc(ox, oy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (activeSkin === 'void') {
      // Dark tendrils radiating outward — the Void Walker's signature look
      const t = Date.now() / 600;
      ctx.strokeStyle = 'rgba(150, 0, 255, 0.28)';
      ctx.lineWidth   = 2;
      for (let i = 0; i < 5; i++) {
        const a   = t + (i * Math.PI * 2) / 5;
        const len = this.r + 12 + Math.sin(t * 2 + i) * 5;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(a) * len, this.y + Math.sin(a) * len);
        ctx.stroke();
      }
    }
  }

  // ── Sub-draw helpers ─────────────────────────────────────

  _drawHPBar() {
    const w   = 36;
    const h   = 4;
    const bx  = this.x - w / 2;
    const by  = this.y - this.r - 11;
    const pct = Math.max(0, this.hp / this.maxHp);
    const col = pct > 0.5 ? '#2ecc71' : pct > 0.25 ? '#f39c12' : '#e74c3c';

    // Background track
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);

    // Fill
    ctx.fillStyle = col;
    ctx.fillRect(bx, by, w * pct, h);
  }

  _drawDashArc() {
    if (this.dashCooldown <= 0) return;
    const progress = 1 - (this.dashCooldown / this.DASH_COOLDOWN);
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.45)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(
      this.x, this.y, this.r + 8,
      -Math.PI / 2,
      -Math.PI / 2 + progress * Math.PI * 2,
    );
    ctx.stroke();
  }
}
