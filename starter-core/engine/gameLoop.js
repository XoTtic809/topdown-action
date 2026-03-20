/**
 * gameLoop.js
 * Main game loop, wave management, collision detection, and HUD updates.
 *
 * This is the entry point loaded by index.html.
 * It ties together all other systems and runs the update/render cycle.
 *
 * ┌─ Startup ─────────────────────────────────────────────────┐
 * │  initRenderer → initInput → initUI → showHomeScreen       │
 * │  → (player clicks Start) → startGame()                    │
 * │  → requestAnimationFrame(loop) drives everything          │
 * └───────────────────────────────────────────────────────────┘
 *
 * Each frame:
 *   update(dt) — move player, move enemies, handle collisions, wave logic
 *   render(dt) — draw background, particles, enemies, player, HUD
 */

import { initRenderer, canvas, ctx, drawBackground, updateAndDrawParticles, createExplosion } from './renderer.js';
import { initInput }                   from './input.js';
import { state, loadSettings }         from './state.js';
import { Player }                      from '../game/playerMovement.js';
import { drawEnemyBullet }             from '../game/shooting.js';
import { spawnEnemy }                  from '../game/enemyAI.js';
import { initUI, showHomeScreen, hideHomeScreen, showPauseScreen, hidePauseScreen } from '../ui/homeScreen.js';

// ─────────────────────────────────────────────────────────────
// Bootstrap — runs once when the module is loaded
// ─────────────────────────────────────────────────────────────

loadSettings();
initRenderer();

initInput(canvas, {
  onDash:  () => state.player?.dash(),
  onPause: () => {
    if (state.running) togglePause();
  },
});

initUI({
  onStart:       startGame,
  onTogglePause: togglePause,
  onMenu:        returnToMenu,
});

showHomeScreen();
requestAnimationFrame(loop);

// ─────────────────────────────────────────────────────────────
// Game Lifecycle
// ─────────────────────────────────────────────────────────────

/** Begin a new run from wave 1 with a fresh player. */
function startGame() {
  // Clear everything
  state.running       = true;
  state.paused        = false;
  state.score         = 0;
  state.wave          = 1;
  state.combo         = 0;
  state.comboTimer    = 0;
  state.screenShake   = 0;

  state.bullets.length      = 0;
  state.enemies.length      = 0;
  state.enemyBullets.length = 0;
  state.particles.length    = 0;

  // Spawn the player at the centre of the screen
  state.player = new Player(canvas.width / 2, canvas.height / 2);

  _startWave(1);
}

/** Call when player HP reaches 0. Saves the high score and shows game over. */
function endGame() {
  state.running = false;

  // Persist best score
  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem('highScore', String(state.highScore));
  }

  showHomeScreen(true, state.score);
}

/**
 * Return to the menu without a game-over banner
 * (used by the pause-screen "Main Menu" button).
 */
function returnToMenu() {
  state.running = false;
  state.paused  = false;
  showHomeScreen(false);
}

/**
 * Toggle pause state.
 * Exported so input.js can call it via the callback passed to initInput.
 */
export function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  if (state.paused) showPauseScreen();
  else              hidePauseScreen();
}

// ─────────────────────────────────────────────────────────────
// Wave Management
// ─────────────────────────────────────────────────────────────

/**
 * Reset wave counters and set how many enemies to spawn.
 * Difficulty scales by adding 3 extra enemies and tightening the
 * spawn interval each wave.
 *
 * @param {number} waveNumber
 */
function _startWave(waveNumber) {
  state.wave                  = waveNumber;
  state.enemiesSpawnedThisWave = 0;
  state.enemiesKilledThisWave  = 0;
  state.waveClearTimer         = 0;
  state.spawnTimer             = 0;

  // Total enemies this wave: 8 on wave 1, +3 each wave
  state.enemiesToSpawnThisWave = state.ENEMIES_PER_WAVE_BASE + (waveNumber - 1) * 3;

  // Spawn interval shrinks each wave, bottoms out at 0.4 s
  state.spawnInterval = Math.max(0.4, 1.5 - (waveNumber - 1) * 0.08);

  _showWaveAnnouncement(waveNumber);
}

/** Upgrade the player's weapon at milestone waves. */
function _applyWaveBonus(wave) {
  if (!state.player) return;
  if (wave === 3) state.player.weaponLevel = 2;  // Twin shot at wave 3
  if (wave === 6) state.player.weaponLevel = 3;  // Spread shot at wave 6
}

function _showWaveAnnouncement(wave) {
  // Re-create the element to re-trigger the CSS animation
  const old   = document.getElementById('waveAnnouncement');
  const clone = old.cloneNode(true);
  clone.textContent = `WAVE ${wave}`;
  clone.classList.remove('hidden');
  old.parentNode.replaceChild(clone, old);
  setTimeout(() => clone.classList.add('hidden'), 2000);
}

// ─────────────────────────────────────────────────────────────
// Update — all game logic for one frame
// ─────────────────────────────────────────────────────────────

function update(dt) {
  const { player } = state;

  // ── Player ──────────────────────────────────────────────────
  player.update(dt);
  if (player.isDead) { endGame(); return; }

  // ── Enemy spawning ──────────────────────────────────────────
  state.spawnTimer += dt;
  if (state.enemiesSpawnedThisWave < state.enemiesToSpawnThisWave &&
      state.spawnTimer >= state.spawnInterval) {
    state.spawnTimer = 0;
    spawnEnemy(state.wave);
    state.enemiesSpawnedThisWave++;
  }

  // ── Enemy updates & player-melee collision ───────────────────
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    e.update(dt);

    // Cull enemies that wander off-screen after entering (shouldn't happen
    // often, but shooters occasionally drift out while backing away)
    if (e.hasEnteredScreen) {
      const m = 80;
      if (e.x < -m || e.x > canvas.width + m ||
          e.y < -m || e.y > canvas.height + m) {
        state.enemies.splice(i, 1);
        continue;
      }
    }

    // Melee contact — enemy overlaps the player circle
    const dx   = player.x - e.x;
    const dy   = player.y - e.y;
    if (dx * dx + dy * dy < (player.r + e.r) ** 2) {
      player.takeDamage(10);
    }
  }

  // ── Player bullet updates & enemy collision ──────────────────
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];

    // update() returns false when the bullet leaves the screen
    if (!b.update(dt)) {
      state.bullets.splice(i, 1);
      continue;
    }

    // Check against every enemy (simple O(n·m) — fine for this scale)
    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j--) {
      const e  = state.enemies[j];
      const dx = b.x - e.x;
      const dy = b.y - e.y;

      if (dx * dx + dy * dy < (b.r + e.r) ** 2) {
        e.hp--;
        createExplosion(b.x, b.y, e.color, 6);
        hit = true;

        if (e.hp <= 0) {
          // Enemy destroyed — award score, increment combo
          state.score += e.scoreValue * Math.max(1, state.combo);
          state.combo++;
          state.comboTimer = state.COMBO_WINDOW;
          createExplosion(e.x, e.y, e.color, 14);
          state.enemies.splice(j, 1);
          state.enemiesKilledThisWave++;
        }
        break;  // Bullet hits only one enemy (non-piercing)
      }
    }
    if (hit) state.bullets.splice(i, 1);
  }

  // ── Enemy bullet updates & player collision ──────────────────
  for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
    const b = state.enemyBullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Off-screen cull
    const m = 60;
    if (b.x < -m || b.x > canvas.width + m ||
        b.y < -m || b.y > canvas.height + m) {
      state.enemyBullets.splice(i, 1);
      continue;
    }

    // Hit player?
    const dx = b.x - player.x;
    const dy = b.y - player.y;
    if (dx * dx + dy * dy < (b.r + player.r) ** 2) {
      player.takeDamage(15);
      createExplosion(b.x, b.y, '#ff6b6b', 8);
      state.enemyBullets.splice(i, 1);
    }
  }

  // ── Combo decay ──────────────────────────────────────────────
  if (state.combo > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.combo      = 0;
      state.comboTimer = 0;
    }
  }

  // ── Wave-clear check ─────────────────────────────────────────
  const allSpawned = state.enemiesSpawnedThisWave >= state.enemiesToSpawnThisWave;
  if (allSpawned && state.enemies.length === 0) {
    state.waveClearTimer += dt;
    if (state.waveClearTimer >= state.WAVE_BREAK_TIME) {
      const next = state.wave + 1;
      _applyWaveBonus(next);
      _startWave(next);
    }
  }

  // ── Screen-shake decay ───────────────────────────────────────
  if (state.screenShake > 0) {
    state.screenShake = Math.max(0, state.screenShake - dt * 40);
  }
}

// ─────────────────────────────────────────────────────────────
// Render — draw everything for one frame
// ─────────────────────────────────────────────────────────────

function render(dt) {
  ctx.save();

  // Screen shake — randomly offset the entire canvas
  if (state.screenShake > 0 && state.settings.screenShake) {
    ctx.translate(
      (Math.random() - 0.5) * state.screenShake,
      (Math.random() - 0.5) * state.screenShake,
    );
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background (grid + vignette)
  drawBackground();

  // Particles (explosions, trails) — updated and drawn together
  updateAndDrawParticles(dt);

  // Enemies (drawn behind the player)
  state.enemies.forEach(e => e.draw());

  // Player
  state.player?.draw();

  // Player bullets
  state.bullets.forEach(b => b.draw());

  // Enemy bullets
  state.enemyBullets.forEach(b => drawEnemyBullet(b));

  ctx.restore();

  // HUD (drawn outside the save/restore so it's never shaken)
  _updateHUD();
}

// ─────────────────────────────────────────────────────────────
// HUD Updates
// ─────────────────────────────────────────────────────────────

function _updateHUD() {
  const player = state.player;
  if (!player) return;

  document.getElementById('scoreVal').textContent = state.score.toLocaleString();
  document.getElementById('waveVal').textContent  = state.wave;

  // HP bar
  const pct  = Math.max(0, player.hp / player.maxHp);
  const fill = document.getElementById('hp-bar-fill');
  fill.style.width      = (pct * 100) + '%';
  fill.style.background = pct > 0.5 ? '#2ecc71' : pct > 0.25 ? '#f39c12' : '#e74c3c';

  // Dash status
  const dashReady   = document.getElementById('dash-ready');
  const dashCharge  = document.getElementById('dash-charging');
  if (player.dashCooldown <= 0) {
    dashReady.style.display  = '';
    dashCharge.style.display = 'none';
  } else {
    dashReady.style.display  = 'none';
    dashCharge.style.display = '';
    dashCharge.textContent   = player.dashCooldown.toFixed(1) + 's';
  }

  // Combo
  const comboEl  = document.getElementById('combo');
  const comboVal = document.getElementById('comboVal');
  if (state.combo > 1) {
    comboEl.classList.remove('hidden');
    comboVal.textContent = state.combo;
  } else {
    comboEl.classList.add('hidden');
  }
}

// ─────────────────────────────────────────────────────────────
// Main Loop
// ─────────────────────────────────────────────────────────────

let lastTime = performance.now();

function loop(timestamp) {
  requestAnimationFrame(loop);

  // Cap dt to 100 ms so a backgrounded tab doesn't cause a huge jump
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  if (!state.running || state.paused) {
    // Keep drawing the background while idle / paused so it doesn't freeze
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    state.player?.draw();
    return;
  }

  update(dt);
  render(dt);
}
