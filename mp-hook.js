// mp-hook.js — v4
// Multiplayer rendering fully aligned with single-player visual style.
// Reuses game.js Player.draw(), Enemy.draw(), Boss.draw(), particle system,
// and all HUD drawing code so MP looks identical to single-player.

(function () {
  const canvas = document.getElementById('game');
  const ctx    = canvas?.getContext('2d');
  if (!ctx) return;

  // ── Interpolation buffers ──────────────────────────────────
  let prevState    = null;
  let currentState = null;
  let stateTime    = 0;
  const TICK_MS    = 1000 / 30;

  window.mpOnStateReceived = function (state) {
    prevState    = currentState;
    currentState = state;
    stateTime    = performance.now();
  };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d >  Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function getInterpolated() {
    if (!currentState) return null;
    if (!prevState)    return currentState;
    const t = Math.min((performance.now() - stateTime) / TICK_MS, 1.0);
    return {
      ...currentState,
      players: currentState.players.map(cp => {
        const pp = prevState.players.find(p => p.socketId === cp.socketId);
        if (!pp) return cp;
        return { ...cp,
          x: lerp(pp.x, cp.x, t),
          y: lerp(pp.y, cp.y, t),
          angle: lerpAngle(pp.angle, cp.angle, t)
        };
      }),
      enemies: currentState.enemies.map(ce => {
        const pe = prevState.enemies.find(e => e.id === ce.id);
        if (!pe) return ce;
        return { ...ce, x: lerp(pe.x, ce.x, t), y: lerp(pe.y, ce.y, t) };
      }),
      boss: currentState.boss && prevState.boss ? {
        ...currentState.boss,
        x: lerp(prevState.boss.x, currentState.boss.x, t),
        y: lerp(prevState.boss.y, currentState.boss.y, t),
      } : currentState.boss,
    };
  }

  // ── Draw a player using the existing Player class ──────────
  // Temporarily patches the global `player` object and `activeSkin`
  // so player.draw() renders the correct skin, then restores everything.
  function drawMpPlayer(p) {
    if (!player) return; // game.js player instance must exist

    // Save original globals
    const sv = {
      x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp,
      weaponLevel: player.weaponLevel, shield: player.shield,
      speedBoost: player.speedBoost, dashDuration: player.dashDuration,
      r: player.r, alive: player.alive,
    };
    const savedSkin  = activeSkin;
    const savedMouseX = mouse.x, savedMouseY = mouse.y;

    // --- Ghost / dead player ---
    if (!p.alive) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ff4757';
      ctx.fillStyle = '#ff6b7a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      if (p.reviveTimer > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`⬆ ${Math.ceil(p.reviveTimer)}s`, p.x, p.y - 26);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
      ctx.restore();
      return;
    }

    // --- Patch globals ---
    player.x            = p.x;
    player.y            = p.y;
    player.hp           = p.hp ?? 100;
    player.maxHp        = p.maxHp ?? 100;
    player.weaponLevel  = p.weaponLevel ?? 1;
    player.shield       = p.shield ? 5 : 0;
    player.speedBoost   = p.speedBoost ? 5 : 0;
    player.dashDuration = p.isDashing ? 0.1 : 0;
    activeSkin          = p.skin || 'default';
    // Aim direction from server angle
    mouse.x = p.x + Math.cos(p.angle) * 200;
    mouse.y = p.y + Math.sin(p.angle) * 200;

    // Call the real draw method — full skin effects included
    player.draw();

    // --- Username label (drawn outside player.draw) ---
    const isMe = p.socketId === mpMySocketId;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const labelColor = isMe ? '#9be7ff' : '#ffcc70';
    ctx.font = 'bold 11px system-ui';
    ctx.shadowBlur = 6;
    ctx.shadowColor = labelColor;
    ctx.fillStyle = labelColor;
    ctx.fillText(isMe ? 'YOU' : (p.username || 'Player'), p.x, p.y - (player.r + 18));
    ctx.shadowBlur = 0;
    ctx.restore();

    // --- Restore globals ---
    player.x = sv.x; player.y = sv.y;
    player.hp = sv.hp; player.maxHp = sv.maxHp;
    player.weaponLevel = sv.weaponLevel; player.shield = sv.shield;
    player.speedBoost = sv.speedBoost; player.dashDuration = sv.dashDuration;
    activeSkin = savedSkin;
    mouse.x = savedMouseX; mouse.y = savedMouseY;
  }

  // ── Draw an enemy matching Enemy.draw() visuals ────────────
  function drawMpEnemy(e) {
    const type = e.type || 'normal';

    // Shadow / glow
    if (type === 'miniboss') {
      ctx.shadowBlur = 15; ctx.shadowColor = e.color || '#e74c3c';
    } else if (type === 'enforcer') {
      if (e.dashChargeTime > 0) {
        const pulse = 10 + Math.sin(Date.now() * 0.015) * 8;
        ctx.shadowBlur = pulse; ctx.shadowColor = '#ff4444';
      } else if (e.isDashing) {
        ctx.shadowBlur = 20; ctx.shadowColor = '#6bcfff';
      } else {
        ctx.shadowBlur = 5; ctx.shadowColor = e.color || '#e74c3c';
      }
    }

    ctx.fillStyle = e.color || '#e74c3c';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius ?? e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // HP bar for tank / miniboss / enforcer
    if (type === 'tank' || type === 'miniboss' || type === 'enforcer') {
      const r = e.radius ?? e.r;
      const barW = r * 2, barH = 4;
      const barX = e.x - r, barY = e.y - r - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX, barY, barW, barH);
      const pct = e.hp / e.maxHp;
      ctx.fillStyle = pct > 0.5 ? '#ff4757' : '#ff9ff3';
      ctx.fillRect(barX, barY, barW * pct, barH);
    }

    // Icon indicators
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (type === 'shooter') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 12px Arial';
      ctx.fillText('!', e.x, e.y);
    } else if (type === 'miniboss') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 12px Arial';
      ctx.fillText('⚠', e.x, e.y);
    } else if (type === 'enforcer') {
      ctx.fillStyle = e.dashChargeTime > 0 ? '#ff4444' : 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(e.dashChargeTime > 0 ? '⚡' : '⬥', e.x, e.y);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ── Draw boss matching the Boss / MegaBoss / UltraBoss / LegendaryBoss visuals
  function drawMpBoss(b) {
    if (!b) return;
    const time = Date.now() / 1000;
    const hpPct = b.hp / b.maxHp;

    if (b.isLegendaryBoss) {
      // ── LEGENDARY BOSS
      const phase = b.phase || 1;
      const glowIntensity = 30 + phase * 15;
      ctx.shadowBlur = glowIntensity; ctx.shadowColor = b.color || '#ff0066';
      ctx.strokeStyle = b.color || '#ff0066'; ctx.lineWidth = 8;
      for (let i = 0; i < phase; i++) {
        const off = i * 18;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 30 + off + Math.sin(time * 3 + i) * 10, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Core
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      const phaseColors5 = ['#ff0066','#ff3300','#ff00ff','#9900ff','#00ccff'];
      const pc = phaseColors5[Math.min(phase - 1, 4)];
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.4, pc); grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad; ctx.shadowBlur = 60; ctx.shadowColor = pc;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      // Symbol
      const legendSymbols = ['★','⚡','☠','☢','💀'];
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(time * 2);
      ctx.fillText(legendSymbols[Math.min(phase - 1, 4)], 0, 0); ctx.restore();
      ctx.shadowBlur = 0;
      // HP bar
      const barW = 320, barH = 18, barX = b.x - barW / 2, barY = b.y - b.r - 55;
      ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(barX - 4, barY - 4, barW + 8, barH + 8);
      ctx.fillStyle = 'rgba(50,50,50,0.9)'; ctx.fillRect(barX, barY, barW, barH);
      const hpG = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      hpG.addColorStop(0,'#ff0066'); hpG.addColorStop(0.5,'#ff9900'); hpG.addColorStop(1,'#cc00ff');
      ctx.fillStyle = hpG; ctx.fillRect(barX, barY, barW * hpPct, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
      for (const m of [0.8,0.6,0.4,0.2]) {
        ctx.beginPath(); ctx.moveTo(barX + barW * m, barY); ctx.lineTo(barX + barW * m, barY + barH); ctx.stroke();
      }
      ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.strokeStyle = 'black'; ctx.lineWidth = 4;
      ctx.strokeText('☠ LEGENDARY DESTROYER ☠', b.x, barY - 30);
      ctx.fillStyle = pc; ctx.shadowBlur = 15; ctx.shadowColor = pc;
      ctx.fillText('☠ LEGENDARY DESTROYER ☠', b.x, barY - 30);
      ctx.shadowBlur = 0;
      ctx.font = 'bold 11px Arial'; ctx.fillStyle = '#ffd700';
      ctx.fillText(`PHASE ${phase}`, b.x, barY + barH + 5);

    } else if (b.isUltraBoss) {
      // ── ULTRA BOSS (Omega Overlord)
      const phase = b.phase || 1;
      const phaseColors = ['#ffd700','#ff9900','#ff4400','#cc00ff'];
      const pColor = phaseColors[Math.min(phase - 1, 3)];
      ctx.shadowBlur = 40 + phase * 8; ctx.shadowColor = pColor;
      // Outer rings
      ctx.lineWidth = 5;
      for (let r = 0; r < phase + 1; r++) {
        const ringR = b.r + 22 + r * 18 + Math.sin(time * 2.5 + r) * 7;
        ctx.strokeStyle = `rgba(${r % 2 === 0 ? '255,215,0' : '255,255,255'},${0.5 - r * 0.08})`;
        ctx.beginPath(); ctx.arc(b.x, b.y, ringR, 0, Math.PI * 2); ctx.stroke();
      }
      // Orbiting orbs
      const orbCount = 6 + phase * 2;
      for (let i = 0; i < orbCount; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const oA = time * dir * (1 + phase * 0.3) + (Math.PI * 2 / orbCount) * i;
        const oDist = b.r + 14 + Math.sin(time * 3 + i) * 6;
        ctx.fillStyle = pColor; ctx.shadowBlur = 12; ctx.shadowColor = pColor;
        ctx.beginPath(); ctx.arc(b.x + Math.cos(oA)*oDist, b.y + Math.sin(oA)*oDist, 5, 0, Math.PI * 2); ctx.fill();
      }
      // Core
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.35, pColor);
      grad.addColorStop(0.7, phase >= 3 ? '#440000' : '#1a0a00'); grad.addColorStop(1,'#000000');
      ctx.shadowBlur = 50; ctx.shadowColor = pColor;
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      // Symbol
      const symbols = ['★','⚡','☠','☢'];
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(time * (1.5 + phase * 0.5));
      ctx.shadowBlur = 10; ctx.shadowColor = '#ffffff';
      ctx.fillText(symbols[Math.min(phase - 1, 3)], 0, 0); ctx.restore();
      ctx.shadowBlur = 0;
      // HP bar
      const barW = 260, barH = 16, barX = b.x - barW / 2, barY = b.y - b.r - 48;
      ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(barX - 4, barY - 4, barW + 8, barH + 8);
      ctx.fillStyle = 'rgba(50,50,50,0.9)'; ctx.fillRect(barX, barY, barW, barH);
      const hpG = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      hpG.addColorStop(0,'#00ff88'); hpG.addColorStop(0.4,'#ffd700'); hpG.addColorStop(0.7,'#ff4400'); hpG.addColorStop(1,'#cc00ff');
      ctx.fillStyle = hpG; ctx.fillRect(barX, barY, barW * hpPct, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
      for (const m of [0.75,0.5,0.25]) {
        ctx.beginPath(); ctx.moveTo(barX + barW * m, barY); ctx.lineTo(barX + barW * m, barY + barH); ctx.stroke();
      }
      ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.strokeStyle = 'black'; ctx.lineWidth = 4;
      ctx.strokeText('💀 OMEGA OVERLORD 💀', b.x, barY - 26);
      ctx.fillStyle = pColor; ctx.shadowBlur = 15; ctx.shadowColor = pColor;
      ctx.fillText('💀 OMEGA OVERLORD 💀', b.x, barY - 26);
      ctx.shadowBlur = 0;
      const phaseNames = ['AWAKENING','ASCENDING','ENRAGED','OMEGA FORM'];
      ctx.font = 'bold 11px Arial'; ctx.fillStyle = '#ffd700';
      ctx.strokeText(`PHASE ${phase} — ${phaseNames[Math.min(phase-1,3)]}`, b.x, barY + barH + 5);
      ctx.fillText(`PHASE ${phase} — ${phaseNames[Math.min(phase-1,3)]}`, b.x, barY + barH + 5);

    } else if (b.isMegaBoss) {
      // ── MEGA BOSS
      const phase = b.phase || 1;
      const glowIntensity = phase === 3 ? 40 : phase === 2 ? 30 : 25;
      ctx.shadowBlur = glowIntensity; ctx.shadowColor = b.color || '#ff3366';
      ctx.strokeStyle = b.color || '#ff3366'; ctx.lineWidth = 6;
      for (let i = 0; i < phase; i++) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 20 + i * 15 + Math.sin(time * 3 + i) * 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      grad.addColorStop(0, b.color || '#ff3366');
      grad.addColorStop(0.5, phase === 3 ? '#ff0033' : phase === 2 ? '#ff4466' : (b.color || '#ff3366'));
      grad.addColorStop(1, '#330011');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      const sym = phase === 3 ? '☠' : phase === 2 ? '⚡' : '●';
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(time * 2); ctx.fillText(sym, 0, 0); ctx.restore();
      ctx.shadowBlur = 0;
      // HP bar
      const barW = 200, barH = 14, barX = b.x - barW / 2, barY = b.y - b.r - 35;
      ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(barX - 3, barY - 3, barW + 6, barH + 6);
      ctx.fillStyle = 'rgba(50,50,50,0.8)'; ctx.fillRect(barX, barY, barW, barH);
      const barColor = phase === 3 ? '#ff0033' : phase === 2 ? '#ff4466' : (b.color || '#ff3366');
      ctx.fillStyle = barColor; ctx.fillRect(barX, barY, barW * hpPct, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(barX + barW * 0.66, barY); ctx.lineTo(barX + barW * 0.66, barY + barH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(barX + barW * 0.33, barY); ctx.lineTo(barX + barW * 0.33, barY + barH); ctx.stroke();
      ctx.fillStyle = 'white'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.strokeStyle = 'black'; ctx.lineWidth = 3;
      ctx.strokeText('⚔ MEGA BOSS ⚔', b.x, barY - 20);
      ctx.fillText('⚔ MEGA BOSS ⚔', b.x, barY - 20);
      ctx.font = 'bold 10px Arial'; ctx.fillStyle = '#ffd93d';
      ctx.fillText(`PHASE ${phase}`, b.x, barY + barH + 5);

    } else {
      // ── REGULAR BOSS
      ctx.shadowBlur = 25; ctx.shadowColor = b.color || '#b86bff';
      ctx.strokeStyle = b.color || '#b86bff'; ctx.lineWidth = 5;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 15 + i * 10 + Math.sin(time * 2) * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = b.color || '#b86bff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // HP bar
      const barW = 120, barH = 10, barX = b.x - barW / 2, barY = b.y - b.r - 25;
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
      ctx.fillStyle = 'rgba(255,71,87,0.6)'; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = b.color || '#b86bff'; ctx.fillRect(barX, barY, barW * hpPct, barH);
      ctx.fillStyle = 'white'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BOSS', b.x, b.y);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ── Main MP Render Frame ────────────────────────────────────
  function mpRenderFrame() {
    // ── Background (matches game.js loop) ──
    if (typeof screenShakeAmt !== 'undefined' && screenShakeAmt > 0) {
      ctx.save();
      ctx.translate(
        (Math.random() - 0.5) * screenShakeAmt * 25,
        (Math.random() - 0.5) * screenShakeAmt * 25
      );
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 80) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    const s = getInterpolated();
    if (!s) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Connecting...', canvas.width / 2, canvas.height / 2);
      ctx.textAlign = 'left';
      if (typeof screenShakeAmt !== 'undefined' && screenShakeAmt > 0) ctx.restore();
      return;
    }

    // ── Trail particles (behind player) ──
    if (typeof particles !== 'undefined') {
      particles.forEach(p => { if (p.isTrail && typeof p.draw === 'function') p.draw(); });
    }

    // ── Players ──
    s.players?.forEach(p => drawMpPlayer(p));

    // ── Bullets (player) ──
    if (s.bullets?.length) {
      if (typeof setShadow === 'function') setShadow(12, '#ffe66b');
      s.bullets.forEach(b => {
        ctx.fillStyle = '#ffe66b';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r ?? 5, 0, Math.PI * 2); ctx.fill();
      });
      if (typeof resetShadow === 'function') resetShadow();
    }

    // ── Enemy bullets ──
    if (s.enemyBullets?.length) {
      if (typeof setShadow === 'function') setShadow(10, '#ff4757');
      s.enemyBullets.forEach(eb => {
        ctx.fillStyle = '#ff4757';
        ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r ?? 7, 0, Math.PI * 2); ctx.fill();
      });
      if (typeof resetShadow === 'function') resetShadow();
    }

    // ── Enemies ──
    s.enemies?.forEach(e => drawMpEnemy(e));

    // ── Boss ──
    if (s.boss) drawMpBoss(s.boss);

    // ── Non-trail particles ──
    if (typeof particles !== 'undefined') {
      particles.forEach(p => { if (!p.isTrail && typeof p.draw === 'function') p.draw(); });
    }

    // ── Powerups ──
    s.powerups?.forEach(pu => {
      const bob = Math.sin(Date.now() / 150) * 2;
      ctx.shadowBlur = 18; ctx.shadowColor = pu.color || '#ffffff';
      ctx.beginPath(); ctx.arc(pu.x, pu.y + bob, pu.r ?? 12, 0, Math.PI * 2);
      ctx.fillStyle = pu.color || '#ffffff'; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pu.symbol || '✦', pu.x, pu.y + bob);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    });

    // ── Restore screen shake ──
    if (typeof screenShakeAmt !== 'undefined' && screenShakeAmt > 0) {
      ctx.restore();
    }

    // ─── HUD elements (exact match with game.js) ───────────────

    // Wave clear countdown
    if (s.waveClearTimer > 0) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const cx = canvas.width / 2, cy = canvas.height / 2;
      const WAVE_BREAK_TIME = 2;
      const pulse = Math.sin(Date.now() / 200) * 0.1 + 0.9;
      const circleRadius = 80 * pulse;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, circleRadius + 20);
      gradient.addColorStop(0, 'rgba(107,255,123,0.3)');
      gradient.addColorStop(0.7, 'rgba(107,255,123,0.1)');
      gradient.addColorStop(1, 'rgba(107,255,123,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(cx, cy, circleRadius + 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(20,25,35,0.95)'; ctx.strokeStyle = '#6bff7b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const progress = s.waveClearTimer / WAVE_BREAK_TIME;
      ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, circleRadius - 12, -Math.PI/2, -Math.PI/2 + Math.PI * 2 * progress); ctx.stroke();
      ctx.shadowBlur = 25; ctx.shadowColor = '#ffd93d';
      ctx.font = 'bold 64px system-ui'; ctx.fillStyle = '#ffd93d';
      ctx.fillText(Math.ceil(s.waveClearTimer), cx, cy);
      ctx.shadowBlur = 8; ctx.shadowColor = '#6bff7b';
      ctx.font = '600 14px system-ui'; ctx.fillStyle = '#6bff7b';
      ctx.fillText('WAVE CLEARED', cx, cy - 50);
      ctx.shadowBlur = 0;
      ctx.font = '500 12px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('NEXT WAVE', cx, cy + 50);
      ctx.restore();
    }

    // Boss countdown
    if (s.bossCountdownTimer > 0) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const cx = canvas.width / 2, cy = canvas.height / 2;
      const BOSS_COUNTDOWN_TIME = 3;
      const pulse = Math.sin(Date.now() / 150) * 0.15 + 0.85;
      const circleRadius = 90 * pulse;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, circleRadius + 25);
      gradient.addColorStop(0, 'rgba(255,71,87,0.4)');
      gradient.addColorStop(0.7, 'rgba(255,107,53,0.2)');
      gradient.addColorStop(1, 'rgba(255,71,87,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(cx, cy, circleRadius + 25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(20,15,25,0.95)'; ctx.strokeStyle = '#ff4757'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const progress = s.bossCountdownTimer / BOSS_COUNTDOWN_TIME;
      ctx.strokeStyle = '#ff6348'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, circleRadius - 15, -Math.PI/2, -Math.PI/2 + Math.PI * 2 * progress); ctx.stroke();
      ctx.shadowBlur = 30; ctx.shadowColor = '#ff4757';
      ctx.font = 'bold 72px system-ui'; ctx.fillStyle = '#ff4757';
      ctx.fillText(Math.ceil(s.bossCountdownTimer), cx, cy);
      ctx.shadowBlur = 12; ctx.shadowColor = '#ff6348';
      ctx.font = 'bold 18px system-ui'; ctx.fillStyle = '#ff6348';
      const pt = s.pendingBossType;
      const bossTypeText = pt === 4 ? '☠ LEGENDARY BOSS ☠' : pt === 3 ? 'OMEGA OVERLORD' : pt === 2 ? 'MEGA BOSS' : 'BOSS INCOMING';
      ctx.fillText(bossTypeText, cx, cy - 60);
      ctx.shadowBlur = 8; ctx.font = 'bold 14px system-ui'; ctx.fillStyle = '#ffd93d';
      ctx.fillText('GET READY!', cx, cy + 60);
      ctx.restore();
    }

    // Enemies remaining counter (bottom-left)
    if (!s.boss && s.waveClearTimer <= 0 && s.bossCountdownTimer <= 0) {
      const wave = s.wave || 1;
      const enemiesNeeded = wave * 5 + 12;
      const remaining = Math.max(0, enemiesNeeded - (s.enemiesKilledThisWave || 0));
      ctx.save();
      const padding = 14, boxWidth = 180, boxHeight = 42;
      const boxX = 12, boxY = canvas.height - boxHeight - 12, br = 10;
      ctx.fillStyle = 'rgba(13,21,37,0.88)';
      ctx.beginPath();
      ctx.moveTo(boxX + br, boxY);
      ctx.lineTo(boxX + boxWidth - br, boxY);
      ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + br);
      ctx.lineTo(boxX + boxWidth, boxY + boxHeight - br);
      ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - br, boxY + boxHeight);
      ctx.lineTo(boxX + br, boxY + boxHeight);
      ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - br);
      ctx.lineTo(boxX, boxY + br);
      ctx.quadraticCurveTo(boxX, boxY, boxX + br, boxY);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(88,166,255,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
      const iconX = boxX + 20, iconY = boxY + boxHeight / 2;
      ctx.fillStyle = '#ff4757'; ctx.shadowBlur = 8; ctx.shadowColor = '#ff4757';
      ctx.beginPath(); ctx.arc(iconX, iconY, 8, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '600 14px Inter, system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('Enemies', iconX + 18, iconY - 8);
      ctx.font = '700 18px Inter, system-ui';
      const countColor = remaining <= 5 ? '#6bff7b' : remaining <= 10 ? '#ffd93d' : '#9be7ff';
      ctx.fillStyle = countColor; ctx.shadowBlur = 6; ctx.shadowColor = countColor;
      ctx.fillText(remaining, iconX + 18, iconY + 9);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Update HUD elements (score, wave, hp, coins)
    if (typeof mpUpdateHUD === 'function') mpUpdateHUD(s);
  }

  // ── Override the game loop ─────────────────────────────────
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (typeof loop !== 'function') { console.warn('[MP] loop not found'); return; }
      const _origLoop = loop;
      window.loop = function mpLoop(time) {
        if (typeof mpGameActive !== 'undefined' && mpGameActive) {
          // Update particles even in MP mode (for effects)
          if (typeof particles !== 'undefined') {
            const dt = 0.016; // approximate
            for (let i = particles.length - 1; i >= 0; i--) {
              if (typeof particles[i].update === 'function') particles[i].update(dt);
              if (particles[i].life <= 0) particles.splice(i, 1);
            }
          }
          mpRenderFrame();
          if (typeof mpSendInput === 'function' && typeof keys !== 'undefined' && typeof mouse !== 'undefined') {
            mpSendInput(keys, mouse.x, mouse.y, window.mouseDown || false);
          }
          requestAnimationFrame(window.loop);
        } else {
          _origLoop(time);
        }
      };
      console.log('✅ mp-hook.js v4 — loop wrapped');
    }, 200);
  });

  // ── startMpGame hook ───────────────────────────────────────
  window.addEventListener('load', () => {
    setTimeout(() => {
      const _origStart = window.startMpGame;
      window.startMpGame = function (wave) {
        window.running = false;
        document.getElementById('homeScreen')?.classList.add('hidden');
        document.getElementById('mpLobbyPanel')?.classList.add('hidden');
        document.getElementById('mpCountdown')?.classList.add('hidden');
        document.getElementById('partnerHpBar')?.classList.remove('hidden');
        if (_origStart) _origStart(wave);
        requestAnimationFrame(window.loop);
        console.log('[MP] v4 started — full visual parity active');
      };

      const _origReturn = window.mpReturnToMenu;
      window.mpReturnToMenu = function () {
        document.getElementById('partnerHpBar')?.classList.add('hidden');
        prevState = null; currentState = null;
        if (_origReturn) _origReturn();
      };
    }, 300);
  });

  // ── Mouse / input tracking ─────────────────────────────────
  canvas?.addEventListener('mousemove', e => {
    if (!mpGameActive) return;
    const rect = canvas.getBoundingClientRect();
    if (typeof mouse !== 'undefined') {
      mouse.x = (e.clientX - rect.left) * (canvas.width  / rect.width);
      mouse.y = (e.clientY - rect.top)  * (canvas.height / rect.height);
    }
  });

  window.mouseDown = false;
  canvas?.addEventListener('mousedown', () => window.mouseDown = true);
  canvas?.addEventListener('mouseup',   () => window.mouseDown = false);

  // Touch support
  canvas?.addEventListener('touchstart', e => {
    window.mouseDown = true;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0];
    if (typeof mouse !== 'undefined') {
      mouse.x = (t.clientX - rect.left) * (canvas.width  / rect.width);
      mouse.y = (t.clientY - rect.top)  * (canvas.height / rect.height);
    }
  }, { passive: true });
  canvas?.addEventListener('touchmove', e => {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0];
    if (typeof mouse !== 'undefined') {
      mouse.x = (t.clientX - rect.left) * (canvas.width  / rect.width);
      mouse.y = (t.clientY - rect.top)  * (canvas.height / rect.height);
    }
  }, { passive: true });
  canvas?.addEventListener('touchend', () => window.mouseDown = false);

  console.log('✅ mp-hook.js v4 loaded');
})();
