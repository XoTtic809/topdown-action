/**
 * pvp2p.js — Local 2-player PvP deathmatch mode.
 *
 * Self-contained: branched from game.js's loop() and startGame() when
 * currentGameMode === 'pvp2p'. Does NOT touch the global Player, the
 * single-player bullets[] array, enemies, or any other mode's state.
 *
 * Loaded AFTER game.js so it can read script-global bindings (canvas, ctx,
 * keys, running, paused, currentGameMode) and exposes its public functions
 * on window.* for game.js to call.
 *
 * Controls (locked, no mouse):
 *   P1  WASD move · TFGH aim · SPACE shoot · Q dash
 *   P2  Arrows move · IJKL aim · ENTER shoot · SHIFT dash
 */

(function () {
  'use strict';

  // ── Tunables ────────────────────────────────────────────────
  const FIGHTER_R       = 16;
  const FIGHTER_SPEED   = 270;
  const FIGHTER_HP_MAX  = 100;
  const BULLET_R        = 5;
  const BULLET_SPD      = 680;
  const BULLET_DMG      = 12;
  const FIRE_CD         = 0.13;
  const DASH_DURATION   = 0.16;
  const DASH_COOLDOWN   = 2.5;
  const DASH_SPEED_MULT = 6;
  const DASH_IFRAMES    = 0.20;
  const RESPAWN_DELAY   = 1.8;

  // ── Presets ─────────────────────────────────────────────────
  const PRESETS = {
    quick:    { killLimit: 5,  timeLimit: 0,   label: 'QUICK',    sub: 'First to 5'        },
    standard: { killLimit: 10, timeLimit: 180, label: 'STANDARD', sub: '10 kills · 3 min'  },
    long:     { killLimit: 15, timeLimit: 300, label: 'LONG',     sub: '15 kills · 5 min'  },
  };

  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem('pvp2pConfig'));
      if (saved && typeof saved === 'object') return saved;
    } catch (_) {}
    return { preset: 'standard', killLimit: 10, timeLimit: 180 };
  }
  function saveConfig() {
    try { localStorage.setItem('pvp2pConfig', JSON.stringify(pvp2pConfig)); } catch (_) {}
  }
  function effectiveConfig() {
    if (pvp2pConfig.preset && pvp2pConfig.preset !== 'custom' && PRESETS[pvp2pConfig.preset]) {
      const p = PRESETS[pvp2pConfig.preset];
      return { killLimit: p.killLimit, timeLimit: p.timeLimit };
    }
    return { killLimit: pvp2pConfig.killLimit | 0, timeLimit: pvp2pConfig.timeLimit | 0 };
  }

  let pvp2pConfig = loadConfig();

  // ── Key bindings ────────────────────────────────────────────
  const P1_KEYS = { up:'w',       left:'a',         down:'s',        right:'d',
                    aimUp:'t',    aimLeft:'f',      aimDown:'g',     aimRight:'h',
                    shoot:' ',    dash:'q' };
  const P2_KEYS = { up:'arrowup', left:'arrowleft', down:'arrowdown',right:'arrowright',
                    aimUp:'i',    aimLeft:'j',      aimDown:'k',     aimRight:'l',
                    shoot:'enter',dash:'shift' };

  // The global `keys` object in game.js stores lowercased key names for
  // most keys, but special keys are stored under e.key.toLowerCase().
  // 'arrowup', 'enter', 'shift' all match this convention.
  function held(name) { return keys[name] === true; }

  // ── Fighter ─────────────────────────────────────────────────
  class PvpFighter {
    constructor(x, y, color, tag, binds, spawnX, spawnY) {
      this.x = x; this.y = y;
      this.spawnX = spawnX; this.spawnY = spawnY;
      this.r = FIGHTER_R;
      this.hp = FIGHTER_HP_MAX;
      this.maxHp = FIGHTER_HP_MAX;
      this.aimX = 1; this.aimY = 0;
      this.color = color;
      this.tag = tag;
      this.binds = binds;
      this.kills = 0;
      this.deaths = 0;
      this.shootCD = 0;
      this.dashCD = 0;
      this.dashDur = 0;
      this.dashDX = 0; this.dashDY = 0;
      this.iFrames = 0;
      this.dead = false;
      this.respawn = 0;
    }

    update(dt, opponent) {
      // Respawn handling
      if (this.dead) {
        this.respawn -= dt;
        if (this.respawn <= 0) {
          this.dead = false;
          this.hp = this.maxHp;
          this.x = this.spawnX;
          this.y = this.spawnY;
          this.iFrames = 0.8;
        }
        return;
      }

      this.shootCD = Math.max(0, this.shootCD - dt);
      this.dashCD  = Math.max(0, this.dashCD - dt);
      this.iFrames = Math.max(0, this.iFrames - dt);

      const b = this.binds;

      // Movement input
      let mx = 0, my = 0;
      if (held(b.up))    my -= 1;
      if (held(b.down))  my += 1;
      if (held(b.left))  mx -= 1;
      if (held(b.right)) mx += 1;

      // Dash trigger (uses current move direction; falls back to aim)
      if (held(b.dash) && this.dashCD <= 0 && this.dashDur <= 0) {
        let dx = mx, dy = my;
        if (dx === 0 && dy === 0) { dx = this.aimX; dy = this.aimY; }
        const ln = Math.hypot(dx, dy) || 1;
        this.dashDX = dx / ln;
        this.dashDY = dy / ln;
        this.dashDur = DASH_DURATION;
        this.dashCD  = DASH_COOLDOWN;
        this.iFrames = DASH_IFRAMES;
        if (typeof sounds !== 'undefined' && sounds.dash) sounds.dash();
      }

      // Move
      let speed = FIGHTER_SPEED;
      if (this.dashDur > 0) {
        this.dashDur -= dt;
        mx = this.dashDX; my = this.dashDY;
        speed *= DASH_SPEED_MULT;
        // dash trail
        if (typeof acquireParticle === 'function' && Math.random() < 0.6) {
          particles.push(acquireParticle(
            this.x + (Math.random() - 0.5) * 14,
            this.y + (Math.random() - 0.5) * 14,
            0, 0, this.color, 0.3
          ));
        }
      }
      const ln = Math.hypot(mx, my) || 1;
      if (mx !== 0 || my !== 0) {
        this.x += (mx / ln) * speed * dt;
        this.y += (my / ln) * speed * dt;
      }

      // Clamp to arena
      this.x = Math.max(this.r + 8, Math.min(canvas.width  - this.r - 8, this.x));
      this.y = Math.max(this.r + 8, Math.min(canvas.height - this.r - 8, this.y));

      // Aim input (8-direction, only updates while a key is held)
      let ax = 0, ay = 0;
      if (held(b.aimUp))    ay -= 1;
      if (held(b.aimDown))  ay += 1;
      if (held(b.aimLeft))  ax -= 1;
      if (held(b.aimRight)) ax += 1;
      if (ax !== 0 || ay !== 0) {
        const al = Math.hypot(ax, ay) || 1;
        this.aimX = ax / al;
        this.aimY = ay / al;
      }

      // Shoot
      if (held(b.shoot) && this.shootCD <= 0) {
        this.shootCD = FIRE_CD;
        const sd = this.r + BULLET_R + 2;
        pvpBullets.push({
          x: this.x + this.aimX * sd,
          y: this.y + this.aimY * sd,
          vx: this.aimX * BULLET_SPD,
          vy: this.aimY * BULLET_SPD,
          r: BULLET_R,
          owner: this,
          color: this.color,
        });
        if (typeof sounds !== 'undefined' && sounds.shoot) sounds.shoot();
      }
    }

    takeDamage(n, attacker) {
      if (this.iFrames > 0 || this.dead) return;
      this.hp -= n;
      this.iFrames = 0.15;
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        this.deaths++;
        this.respawn = RESPAWN_DELAY;
        if (attacker) attacker.kills++;
        // Death burst
        if (typeof acquireParticle === 'function') {
          for (let i = 0; i < 22; i++) {
            const a = (Math.PI * 2 * i) / 22;
            particles.push(acquireParticle(
              this.x, this.y,
              Math.cos(a) * (120 + Math.random() * 80),
              Math.sin(a) * (120 + Math.random() * 80),
              this.color, 0.6
            ));
          }
        }
        screenShakeAmt = Math.max(screenShakeAmt, 0.6);
      } else {
        // Hit spark
        if (typeof acquireParticle === 'function') {
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            particles.push(acquireParticle(
              this.x, this.y,
              Math.cos(a) * 90, Math.sin(a) * 90,
              this.color, 0.25
            ));
          }
        }
      }
    }

    draw() {
      if (this.dead) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(Math.ceil(this.respawn), this.x, this.y + 6);
        ctx.textAlign = 'left';
        return;
      }

      // Blink during invulnerability
      const blink = this.iFrames > 0 && Math.floor(this.iFrames / 0.06) % 2 === 0;

      // Outer glow ring
      if (!blink) {
        ctx.shadowBlur = 18;
        ctx.shadowColor = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 3, 0, Math.PI * 2);
        ctx.stroke();

        // Body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Aim indicator (gun barrel)
      const len = this.r + 14;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.x + this.aimX * (this.r - 2), this.y + this.aimY * (this.r - 2));
      ctx.lineTo(this.x + this.aimX * len,          this.y + this.aimY * len);
      ctx.stroke();
      ctx.lineCap = 'butt';

      // HP bar
      const bw = 44, bh = 5;
      const bx = this.x - bw / 2;
      const by = this.y - this.r - 14;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      const pct = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = pct > 0.5 ? '#3ee07a' : pct > 0.25 ? '#f5b342' : '#ff5252';
      ctx.fillRect(bx, by, bw * pct, bh);

      // Dash ready pip
      if (this.dashCD <= 0) {
        ctx.fillStyle = '#9be7ff';
        ctx.beginPath();
        ctx.arc(this.x, this.y + this.r + 9, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Dash cooldown arc
        ctx.strokeStyle = 'rgba(155,231,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const prog = 1 - this.dashCD / DASH_COOLDOWN;
        ctx.arc(this.x, this.y, this.r + 7, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        ctx.stroke();
      }

      // Tag
      ctx.fillStyle = this.color;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.tag, this.x, this.y - this.r - 18);
      ctx.textAlign = 'left';
    }
  }

  // ── State ───────────────────────────────────────────────────
  let pvp1 = null;
  let pvp2 = null;
  let pvpBullets = [];
  let pvpMatchTime = 0;
  let pvpEnded = false;
  let pvpHudEl = null;

  // ── HUD ─────────────────────────────────────────────────────
  function ensureHud() {
    if (pvpHudEl && document.body.contains(pvpHudEl)) return pvpHudEl;
    pvpHudEl = document.createElement('div');
    pvpHudEl.id = 'pvp2pHud';
    pvpHudEl.innerHTML = `
      <div class="pvp-hud-side pvp-hud-p1">
        <div class="pvp-hud-tag">P1</div>
        <div class="pvp-hud-kills" id="pvpHudP1Kills">0</div>
      </div>
      <div class="pvp-hud-mid">
        <div class="pvp-hud-target" id="pvpHudTarget">—</div>
        <div class="pvp-hud-time" id="pvpHudTime">0:00</div>
      </div>
      <div class="pvp-hud-side pvp-hud-p2">
        <div class="pvp-hud-tag">P2</div>
        <div class="pvp-hud-kills" id="pvpHudP2Kills">0</div>
      </div>`;
    const ui = document.getElementById('ui') || document.body;
    ui.appendChild(pvpHudEl);
    return pvpHudEl;
  }
  function showHud() { ensureHud().style.display = 'flex'; }
  function hideHud() { if (pvpHudEl) pvpHudEl.style.display = 'none'; }
  function updateHud() {
    if (!pvpHudEl) return;
    const cfg = effectiveConfig();
    document.getElementById('pvpHudP1Kills').textContent = pvp1.kills;
    document.getElementById('pvpHudP2Kills').textContent = pvp2.kills;
    const tEl = document.getElementById('pvpHudTime');
    if (cfg.timeLimit > 0) {
      const left = Math.max(0, cfg.timeLimit - pvpMatchTime);
      const m = Math.floor(left / 60);
      const s = Math.ceil(left - m * 60);
      tEl.textContent = `${m}:${String(Math.min(59, s)).padStart(2, '0')}`;
    } else {
      const m = Math.floor(pvpMatchTime / 60);
      const s = Math.floor(pvpMatchTime - m * 60);
      tEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    }
    document.getElementById('pvpHudTarget').textContent =
      cfg.killLimit > 0 ? `FIRST TO ${cfg.killLimit}` : 'FREE PLAY';
  }

  // ── Public: start a match ───────────────────────────────────
  function pvp2pStart() {
    if (typeof initAudio === 'function') initAudio();
    if (typeof startMusic === 'function') startMusic('pvp2p');

    document.getElementById('homeScreen').classList.add('hidden');
    document.getElementById('gameOverMsg').classList.add('hidden');
    if (typeof hideModeHUDs === 'function') hideModeHUDs();

    // Hide single-player HUD elements that don't apply
    const hide = (id) => { const e = document.getElementById(id); if (e) e.style.display = 'none'; };
    hide('wave'); hide('combo'); hide('buffsDisplay');
    const dashAb = document.getElementById('dashAbility');
    if (dashAb) dashAb.style.display = 'none';

    // Reset shared loop state
    bullets = [];
    enemyBullets = [];
    enemies = [];
    boss = null;
    powerups = [];
    turrets = [];
    particles = [];
    score = 0;
    wave = 1;
    totalKills = 0;
    runStartTime = _frameNow;
    spawnTimer = 0;
    combo = 0;
    comboTimer = 0;
    screenShakeAmt = 0;
    lastTime = 0;
    skipNextFrame = false;
    modeRunActive = false; // PvP manages its own end-state

    // Spawn fighters at opposite sides
    const lx = canvas.width  * 0.18;
    const rx = canvas.width  * 0.82;
    const cy = canvas.height * 0.50;
    pvp1 = new PvpFighter(lx, cy, '#4dc9f6', 'P1', P1_KEYS, lx, cy);
    pvp2 = new PvpFighter(rx, cy, '#f67280', 'P2', P2_KEYS, rx, cy);
    pvp1.aimX = 1;  pvp1.aimY = 0;
    pvp2.aimX = -1; pvp2.aimY = 0;

    pvpBullets = [];
    pvpMatchTime = 0;
    pvpEnded = false;

    running = true;
    paused = false;

    showHud();
    updateHud();
  }

  // ── Public: per-frame update ────────────────────────────────
  function pvp2pUpdate(dt) {
    if (pvpEnded) return;
    pvpMatchTime += dt;

    pvp1.update(dt, pvp2);
    pvp2.update(dt, pvp1);

    // Bullets
    for (let i = pvpBullets.length - 1; i >= 0; i--) {
      const b = pvpBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < -40 || b.x > canvas.width + 40 ||
          b.y < -40 || b.y > canvas.height + 40) {
        pvpBullets.splice(i, 1);
        continue;
      }

      // Hit check vs both fighters
      const targets = [pvp1, pvp2];
      let hit = false;
      for (let t = 0; t < 2; t++) {
        const tgt = targets[t];
        if (tgt.dead || b.owner === tgt) continue;
        const dx = b.x - tgt.x;
        const dy = b.y - tgt.y;
        const rs = b.r + tgt.r;
        if (dx * dx + dy * dy < rs * rs) {
          tgt.takeDamage(BULLET_DMG, b.owner);
          hit = true;
          break;
        }
      }
      if (hit) pvpBullets.splice(i, 1);
    }

    // Push fighters apart if overlapping
    if (!pvp1.dead && !pvp2.dead) {
      const dx = pvp1.x - pvp2.x;
      const dy = pvp1.y - pvp2.y;
      const rs = pvp1.r + pvp2.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rs * rs && d2 > 0.001) {
        const d = Math.sqrt(d2);
        const push = (rs - d) / 2;
        const nx = dx / d, ny = dy / d;
        pvp1.x += nx * push; pvp1.y += ny * push;
        pvp2.x -= nx * push; pvp2.y -= ny * push;
      }
    }

    updateHud();

    // Win check
    const cfg = effectiveConfig();
    const killWin = cfg.killLimit > 0 && (pvp1.kills >= cfg.killLimit || pvp2.kills >= cfg.killLimit);
    const timeUp  = cfg.timeLimit > 0 && pvpMatchTime >= cfg.timeLimit;
    if (killWin || timeUp) endMatch();
  }

  // ── Public: per-frame draw ──────────────────────────────────
  function pvp2pDraw() {
    // Background — dark with center divider
    ctx.fillStyle = '#0a1224';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle grid
    ctx.strokeStyle = 'rgba(80,120,180,0.08)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < canvas.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Arena border
    ctx.strokeStyle = 'rgba(120,160,220,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    // Center line
    ctx.strokeStyle = 'rgba(120,160,220,0.18)';
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 20);
    ctx.lineTo(canvas.width / 2, canvas.height - 20);
    ctx.stroke();
    ctx.setLineDash([]);

    // Particles (reused from main game)
    if (typeof particles !== 'undefined' && particles.length) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (typeof p.update === 'function') {
          p.update(0.0167);
          if (p.life <= 0) { particles.splice(i, 1); continue; }
          if (typeof p.draw === 'function') p.draw();
        }
      }
    }

    // Bullets
    for (let i = 0; i < pvpBullets.length; i++) {
      const b = pvpBullets[i];
      ctx.shadowBlur = 12;
      ctx.shadowColor = b.color;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Fighters
    pvp1.draw();
    pvp2.draw();
  }

  // ── Match end ───────────────────────────────────────────────
  function endMatch() {
    if (pvpEnded) return;
    pvpEnded = true;
    running = false;
    if (typeof stopMusic === 'function') stopMusic();
    hideHud();

    let title;
    if      (pvp1.kills > pvp2.kills) title = 'PLAYER 1 WINS';
    else if (pvp2.kills > pvp1.kills) title = 'PLAYER 2 WINS';
    else                              title = 'DRAW';

    const sub = `1v1 Match Complete · ${formatTime(pvpMatchTime)}`;
    const stats = [
      { val: pvp1.kills,            lbl: 'P1 KILLS' },
      { val: pvp2.kills,            lbl: 'P2 KILLS' },
      { val: formatTime(pvpMatchTime), lbl: 'TIME' },
    ];

    if (typeof showModeEndOverlay === 'function') {
      showModeEndOverlay(title, sub, stats, false);
    } else {
      // Fallback
      alert(`${title}\n${sub}`);
    }
  }
  function formatTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t - m * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ── Settings overlay ────────────────────────────────────────
  function openSettings() {
    const ov = document.getElementById('pvp2pSettingsOverlay');
    if (!ov) return;
    ov.classList.remove('hidden');
    syncSettingsUI();
  }
  function closeSettings() {
    const ov = document.getElementById('pvp2pSettingsOverlay');
    if (ov) ov.classList.add('hidden');
  }
  function syncSettingsUI() {
    const cfg = pvp2pConfig;
    document.querySelectorAll('#pvp2pSettingsOverlay .pvp-preset').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === cfg.preset);
    });
    const klEl = document.getElementById('pvpKillLimit');
    const tlEl = document.getElementById('pvpTimeLimit');
    const eff = effectiveConfig();
    if (klEl) klEl.value = eff.killLimit;
    if (tlEl) tlEl.value = eff.timeLimit;
    const customRow = document.getElementById('pvpCustomFields');
    if (customRow) customRow.style.opacity = cfg.preset === 'custom' ? '1' : '0.55';
  }
  function pickPreset(name) {
    if (PRESETS[name]) {
      pvp2pConfig.preset = name;
      pvp2pConfig.killLimit = PRESETS[name].killLimit;
      pvp2pConfig.timeLimit = PRESETS[name].timeLimit;
    } else if (name === 'custom') {
      pvp2pConfig.preset = 'custom';
    }
    saveConfig();
    syncSettingsUI();
  }
  function applyCustomInputs() {
    const klEl = document.getElementById('pvpKillLimit');
    const tlEl = document.getElementById('pvpTimeLimit');
    if (klEl) pvp2pConfig.killLimit = Math.max(0, Math.min(99,  parseInt(klEl.value, 10) || 0));
    if (tlEl) pvp2pConfig.timeLimit = Math.max(0, Math.min(900, parseInt(tlEl.value, 10) || 0));
    pvp2pConfig.preset = 'custom';
    saveConfig();
    syncSettingsUI();
  }

  function wireSettingsOverlay() {
    const ov = document.getElementById('pvp2pSettingsOverlay');
    if (!ov) return;
    ov.querySelectorAll('.pvp-preset').forEach(btn => {
      btn.addEventListener('click', () => pickPreset(btn.dataset.preset));
    });
    ov.querySelectorAll('[data-pvp-close]').forEach(el => {
      el.addEventListener('click', closeSettings);
    });
    const klEl = document.getElementById('pvpKillLimit');
    const tlEl = document.getElementById('pvpTimeLimit');
    if (klEl) klEl.addEventListener('change', applyCustomInputs);
    if (tlEl) tlEl.addEventListener('change', applyCustomInputs);
    const startBtn = document.getElementById('pvpStartMatchBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        closeSettings();
        currentGameMode = 'pvp2p';
        startGame();
      });
    }
  }

  // ── Init on DOM ready ───────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireSettingsOverlay);
  } else {
    wireSettingsOverlay();
  }

  // ── Public API ──────────────────────────────────────────────
  window.pvp2pStart        = pvp2pStart;
  window.pvp2pUpdate       = pvp2pUpdate;
  window.pvp2pDraw         = pvp2pDraw;
  window.openPvp2pSettings = openSettings;
})();
