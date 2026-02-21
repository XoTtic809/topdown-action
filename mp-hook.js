// mp-hook.js — v6
// Full feature parity with solo mode:
//   ✅ Score popups on kills          ✅ Combo counter + multiplier
//   ✅ Kill particles / explosions     ✅ Wave announcement animation
//   ✅ Screen shake on damage          ✅ Dash ability HUD
//   ✅ Buffs display (powerup icons)   ✅ Smooth interpolation
//   ✅ Full skin rendering             ✅ Pause overlay + ESC

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

    // ── Detect changes each new state ──────────────────────
    if (prevState) {
      _detectKills(prevState, state);
      _detectWaveChange(prevState, state);
      _detectPlayerDamage(prevState, state);
    }
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
          x:     lerp(pp.x, cp.x, t),
          y:     lerp(pp.y, cp.y, t),
          angle: lerpAngle(pp.angle, cp.angle, t),
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

  // ══════════════════════════════════════════════════════════
  //  CLIENT-SIDE FEEL SYSTEMS
  // ══════════════════════════════════════════════════════════

  // ── Combo system ───────────────────────────────────────────
  let mpCombo      = 0;
  let mpComboTimer = 0;
  const COMBO_WINDOW = 3.5; // seconds

  function _tickCombo(dt) {
    if (mpComboTimer > 0) {
      mpComboTimer -= dt;
      if (mpComboTimer <= 0) {
        mpCombo = 0;
        _updateComboUI(0);
      }
    }
  }

  function _addComboKill(pts) {
    mpCombo++;
    mpComboTimer = COMBO_WINDOW;
    const multi = Math.max(1, Math.floor(mpCombo / 5) + 1);
    _updateComboUI(mpCombo);
    return pts * multi;
  }

  function _updateComboUI(count) {
    const el     = document.getElementById('combo');
    const valEl  = document.getElementById('comboVal');
    if (!el || !valEl) return;
    if (count >= 3) {
      valEl.textContent = count;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  // ── Score popup (matches solo createScorePopup) ────────────
  function _spawnScorePopup(x, y, pts) {
    if (typeof createScorePopup === 'function') {
      createScorePopup(x, y, pts);
      return;
    }
    // Fallback if createScorePopup isn't available
    const el = document.createElement('div');
    el.textContent = `+${pts}`;
    el.style.cssText = `
      position:fixed;left:${x}px;top:${y}px;transform:translateX(-50%);
      color:#ffe066;font:bold 16px system-ui;pointer-events:none;z-index:9998;
      animation:scorePopFade 0.9s ease-out forwards;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  // ── Kill detection: diff enemy lists ──────────────────────
  function _detectKills(prev, next) {
    const prevIds = new Map(prev.enemies.map(e => [e.id, e]));
    const nextIds = new Set(next.enemies.map(e => e.id));

    // Also check boss death
    if (prev.boss && !next.boss) {
      const b = prev.boss;
      const pts = b.isLegendaryBoss ? 5500 : b.isUltraBoss ? 3000 : b.isMegaBoss ? 1500 : 600;
      if (typeof createExplosion === 'function') {
        for (let i = 0; i < 5; i++) {
          setTimeout(() => createExplosion(
            b.x + (Math.random()-0.5)*80,
            b.y + (Math.random()-0.5)*80,
            b.color || '#ff4757', 30
          ), i * 120);
        }
      }
      if (typeof screenShakeAmt !== 'undefined') screenShakeAmt = 1.5;
      _spawnScorePopup(b.x, b.y - 40, pts);
      mpComboTimer = COMBO_WINDOW;
    }

    for (const [id, e] of prevIds) {
      if (!nextIds.has(id)) {
        // This enemy died
        const bonusedPts = _addComboKill(e.score || 50);
        _spawnScorePopup(e.x, e.y - 20, bonusedPts);
        if (typeof createExplosion === 'function') {
          createExplosion(e.x, e.y, e.color || '#e74c3c', 20);
        }
        if (typeof sounds !== 'undefined' && typeof sounds.hit === 'function') {
          sounds.hit();
        }
      }
    }
  }

  // ── Wave change detection → announcement ──────────────────
  function _detectWaveChange(prev, next) {
    if ((next.wave || 1) > (prev.wave || 1)) {
      if (typeof showWaveAnnouncement === 'function') {
        const w = next.wave;
        const isBoss = (w % 5 === 0);
        const isMega = (w % 10 === 0);
        const isUltra = (w % 20 === 0);
        showWaveAnnouncement(w, isBoss, isMega || isUltra, isUltra);
      }
    }
  }

  // ── Damage detection → screen shake ───────────────────────
  function _detectPlayerDamage(prev, next) {
    if (!mpMySocketId) return;
    const prevMe = prev.players.find(p => p.socketId === mpMySocketId);
    const nextMe = next.players.find(p => p.socketId === mpMySocketId);
    if (prevMe && nextMe && nextMe.hp < prevMe.hp && prevMe.alive) {
      if (typeof screenShakeAmt !== 'undefined') {
        screenShakeAmt = Math.max(screenShakeAmt || 0, 0.6);
      }
      // Reset combo on damage
      if (mpCombo > 0) {
        mpCombo = 0;
        mpComboTimer = 0;
        _updateComboUI(0);
      }
    }
  }

  // ── Patch buffs display from server state ─────────────────
  function _updateBuffsFromState(me) {
    if (!me || !player) return;
    // Temporarily patch player with MP values so updateBuffsDisplay works
    const sv = {
      rapidFire:    player.rapidFire,
      speedBoost:   player.speedBoost,
      shield:       player.shield,
      weaponLevel:  player.weaponLevel,
      maxHpLevel:   player.maxHpLevel,
      speedLevel:   player.speedLevel,
      pierce:       player.pierce,
      explosive:    player.explosive,
    };
    player.rapidFire   = me.rapidFire   ?? 0;
    player.speedBoost  = me.speedBoost  ?? 0;
    player.shield      = me.shield      ? 5 : 0;
    player.weaponLevel = me.weaponLevel ?? 1;
    player.maxHpLevel  = me.maxHpLevel  ?? 1;
    player.speedLevel  = me.speedLevel  ?? 1;
    player.pierce      = me.pierce      ?? 0;
    player.explosive   = me.explosive   ?? 0;
    if (typeof updateBuffsDisplay === 'function') updateBuffsDisplay();
    // Restore
    Object.assign(player, sv);
  }

  // ── Patch dash ability HUD from server state ──────────────
  function _updateDashHUD(me) {
    if (!me) return;
    const ability   = document.getElementById('dashAbility');
    const coolEl    = ability?.querySelector('.ability-cooldown');
    const timerEl   = ability?.querySelector('.ability-timer');
    if (!ability || !coolEl || !timerEl) return;

    const cd = me.dashCooldown ?? 0;
    const pct = (cd / 3) * 100;
    coolEl.style.height = pct + '%';
    if (cd > 0) {
      timerEl.textContent = Math.ceil(cd);
      timerEl.style.display = 'block';
      ability.classList.remove('ready');
    } else {
      timerEl.style.display = 'none';
      ability.classList.add('ready');
    }
  }

  // ══════════════════════════════════════════════════════════
  //  MP PAUSE STATE
  // ══════════════════════════════════════════════════════════
  let mpPaused = false;

  function mpTogglePause() {
    mpPaused = !mpPaused;
    const overlay = document.getElementById('pauseOverlay');
    if (!overlay) return;
    if (mpPaused) {
      overlay.classList.remove('hidden');
      overlay.classList.add('visible');
    } else {
      overlay.classList.remove('visible');
      overlay.classList.add('hidden');
    }
  }

  // ══════════════════════════════════════════════════════════
  //  DRAW HELPERS
  // ══════════════════════════════════════════════════════════

  // ── Draw a player using the real Player.draw() ─────────────
  function drawMpPlayer(p) {
    if (!player) {
      try { player = new Player(canvas.width / 2, canvas.height / 2); }
      catch(e) { return; }
    }

    if (!p.alive) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.shadowBlur = 12; ctx.shadowColor = '#ff4757';
      ctx.fillStyle = '#ff6b7a';
      ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      if (p.reviveTimer > 0) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(`⬆ ${Math.ceil(p.reviveTimer)}s`, p.x, p.y - 26);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
      ctx.restore();
      return;
    }

    const sv = {
      x: player.x, y: player.y,
      hp: player.hp, maxHp: player.maxHp,
      weaponLevel: player.weaponLevel,
      shield: player.shield,
      speedBoost: player.speedBoost,
      dashDuration: player.dashDuration,
      dashDir: { ...(player.dashDir || { x: 0, y: 0 }) },
    };
    const savedSkin   = activeSkin;
    const savedMouseX = mouse.x;
    const savedMouseY = mouse.y;

    player.x            = p.x;
    player.y            = p.y;
    player.hp           = p.hp   ?? 100;
    player.maxHp        = p.maxHp ?? 100;
    player.weaponLevel  = p.weaponLevel ?? 1;
    player.shield       = p.shield ? 5 : 0;
    player.speedBoost   = p.speedBoost > 0 ? 5 : 0;
    player.dashDuration = p.isDashing ? 0.1 : 0;
    activeSkin          = p.skin || 'agent';
    mouse.x = p.x + Math.cos(p.angle) * 200;
    mouse.y = p.y + Math.sin(p.angle) * 200;

    player.draw();

    // Username label
    const isMe = p.socketId === mpMySocketId;
    const labelColor = isMe ? '#9be7ff' : '#ffcc70';
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = 'bold 11px system-ui';
    ctx.shadowBlur = 6; ctx.shadowColor = labelColor; ctx.fillStyle = labelColor;
    ctx.fillText(isMe ? 'YOU' : (p.username || 'Partner'), p.x, p.y - (player.r + 18));
    ctx.shadowBlur = 0;
    ctx.restore();

    // Dash cooldown arc
    if (p.dashCooldown > 0) {
      const prog = 1 - Math.min(p.dashCooldown / 3, 1);
      ctx.save();
      ctx.strokeStyle = 'rgba(155,231,255,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, player.r + 14, -Math.PI/2, -Math.PI/2 + Math.PI*2*prog);
      ctx.stroke();
      ctx.restore();
    }

    // Restore globals
    player.x = sv.x; player.y = sv.y;
    player.hp = sv.hp; player.maxHp = sv.maxHp;
    player.weaponLevel = sv.weaponLevel; player.shield = sv.shield;
    player.speedBoost = sv.speedBoost; player.dashDuration = sv.dashDuration;
    player.dashDir = sv.dashDir;
    activeSkin = savedSkin;
    mouse.x = savedMouseX; mouse.y = savedMouseY;
  }

  // ── Draw an enemy matching Enemy.draw() ────────────────────
  function drawMpEnemy(e) {
    const type = e.type || 'basic';
    if (type === 'miniboss') {
      ctx.shadowBlur = 15; ctx.shadowColor = e.color || '#c0392b';
    } else if (type === 'enforcer') {
      const pulse = 10 + Math.sin(Date.now() * 0.015) * 8;
      ctx.shadowBlur = e.isDashing ? 20 : (e.dashChargeTime > 0 ? pulse : 5);
      ctx.shadowColor = e.isDashing ? '#6bcfff' : (e.dashChargeTime > 0 ? '#ff4444' : (e.color || '#e74c3c'));
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = e.color || '#e74c3c';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius ?? e.r ?? 14, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    if (type === 'tank' || type === 'miniboss' || type === 'enforcer') {
      const r = e.radius ?? e.r ?? 14;
      const bw = r*2, bh = 4, bx = e.x-r, by = e.y-r-10;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, bh);
      const pct = e.hp / e.maxHp;
      ctx.fillStyle = pct > 0.5 ? '#ff4757' : '#ff9ff3'; ctx.fillRect(bx, by, bw*pct, bh);
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (type === 'shooter') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 12px Arial'; ctx.fillText('!', e.x, e.y);
    } else if (type === 'miniboss') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 12px Arial'; ctx.fillText('⚠', e.x, e.y);
    } else if (type === 'enforcer') {
      ctx.fillStyle = e.dashChargeTime > 0 ? '#ff4444' : 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(e.dashChargeTime > 0 ? '⚡' : '⬥', e.x, e.y);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ── Draw boss matching all boss types ──────────────────────
  function drawMpBoss(b) {
    if (!b) return;
    const time   = Date.now() / 1000;
    const hpPct  = b.hp / b.maxHp;

    if (b.isLegendaryBoss) {
      const phase = b.phase || 1;
      ctx.shadowBlur = 30 + phase*15; ctx.shadowColor = b.color || '#ff0066';
      ctx.strokeStyle = b.color || '#ff0066'; ctx.lineWidth = 8;
      for (let i = 0; i < phase; i++) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r+30+i*18+Math.sin(time*3+i)*10, 0, Math.PI*2); ctx.stroke(); }
      const pc5 = ['#ff0066','#ff3300','#ff00ff','#9900ff','#00ccff'][Math.min(phase-1,4)];
      const g = ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
      g.addColorStop(0,'#ffffff'); g.addColorStop(0.4,pc5); g.addColorStop(1,'#000000');
      ctx.shadowBlur = 60; ctx.shadowColor = pc5; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.font='bold 36px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(time*2); ctx.fillText(['★','⚡','☠','☢','💀'][Math.min(phase-1,4)],0,0); ctx.restore();
      ctx.shadowBlur=0;
      const bw=320,bh=18,bx=b.x-bw/2,by=b.y-b.r-55;
      ctx.fillStyle='rgba(0,0,0,0.92)'; ctx.fillRect(bx-4,by-4,bw+8,bh+8);
      ctx.fillStyle='rgba(50,50,50,0.9)'; ctx.fillRect(bx,by,bw,bh);
      const hg=ctx.createLinearGradient(bx,0,bx+bw,0); hg.addColorStop(0,'#ff0066'); hg.addColorStop(0.5,'#ff9900'); hg.addColorStop(1,'#cc00ff');
      ctx.fillStyle=hg; ctx.fillRect(bx,by,bw*hpPct,bh);
      ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=2;
      for(const m of[0.8,0.6,0.4,0.2]){ctx.beginPath();ctx.moveTo(bx+bw*m,by);ctx.lineTo(bx+bw*m,by+bh);ctx.stroke();}
      ctx.font='bold 20px Arial'; ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.strokeStyle='black'; ctx.lineWidth=4; ctx.strokeText('☠ LEGENDARY DESTROYER ☠',b.x,by-30);
      ctx.fillStyle=pc5; ctx.shadowBlur=15; ctx.shadowColor=pc5; ctx.fillText('☠ LEGENDARY DESTROYER ☠',b.x,by-30);
      ctx.shadowBlur=0; ctx.font='bold 11px Arial'; ctx.fillStyle='#ffd700'; ctx.fillText(`PHASE ${phase}`,b.x,by+bh+5);

    } else if (b.isUltraBoss) {
      const phase=b.phase||1;
      const pC=['#ffd700','#ff9900','#ff4400','#cc00ff'][Math.min(phase-1,3)];
      ctx.shadowBlur=40+phase*8; ctx.shadowColor=pC; ctx.lineWidth=5;
      for(let r=0;r<phase+1;r++){const rr=b.r+22+r*18+Math.sin(time*2.5+r)*7; ctx.strokeStyle=`rgba(${r%2===0?'255,215,0':'255,255,255'},${0.5-r*0.08})`; ctx.beginPath(); ctx.arc(b.x,b.y,rr,0,Math.PI*2); ctx.stroke();}
      const oC=6+phase*2;
      for(let i=0;i<oC;i++){const d=i%2===0?1:-1,oA=time*d*(1+phase*0.3)+(Math.PI*2/oC)*i,oD=b.r+14+Math.sin(time*3+i)*6; ctx.fillStyle=pC; ctx.shadowBlur=12; ctx.shadowColor=pC; ctx.beginPath(); ctx.arc(b.x+Math.cos(oA)*oD,b.y+Math.sin(oA)*oD,5,0,Math.PI*2); ctx.fill();}
      const g=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
      g.addColorStop(0,'#ffffff'); g.addColorStop(0.35,pC); g.addColorStop(0.7,phase>=3?'#440000':'#1a0a00'); g.addColorStop(1,'#000000');
      ctx.shadowBlur=50; ctx.shadowColor=pC; ctx.fillStyle=g; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.font='bold 32px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(time*(1.5+phase*0.5)); ctx.shadowBlur=10; ctx.shadowColor='#ffffff'; ctx.fillText(['★','⚡','☠','☢'][Math.min(phase-1,3)],0,0); ctx.restore();
      ctx.shadowBlur=0;
      const bw=260,bh=16,bx=b.x-bw/2,by=b.y-b.r-48;
      ctx.fillStyle='rgba(0,0,0,0.92)'; ctx.fillRect(bx-4,by-4,bw+8,bh+8);
      ctx.fillStyle='rgba(50,50,50,0.9)'; ctx.fillRect(bx,by,bw,bh);
      const hg=ctx.createLinearGradient(bx,0,bx+bw,0); hg.addColorStop(0,'#00ff88'); hg.addColorStop(0.4,'#ffd700'); hg.addColorStop(0.7,'#ff4400'); hg.addColorStop(1,'#cc00ff');
      ctx.fillStyle=hg; ctx.fillRect(bx,by,bw*hpPct,bh);
      ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=2;
      for(const m of[0.75,0.5,0.25]){ctx.beginPath();ctx.moveTo(bx+bw*m,by);ctx.lineTo(bx+bw*m,by+bh);ctx.stroke();}
      ctx.font='bold 18px Arial'; ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.strokeStyle='black'; ctx.lineWidth=4; ctx.strokeText('💀 OMEGA OVERLORD 💀',b.x,by-26);
      ctx.fillStyle=pC; ctx.shadowBlur=15; ctx.shadowColor=pC; ctx.fillText('💀 OMEGA OVERLORD 💀',b.x,by-26);
      ctx.shadowBlur=0; ctx.font='bold 11px Arial'; ctx.fillStyle='#ffd700';
      const pN=['AWAKENING','ASCENDING','ENRAGED','OMEGA FORM'];
      ctx.strokeText(`PHASE ${phase} — ${pN[Math.min(phase-1,3)]}`,b.x,by+bh+5); ctx.fillText(`PHASE ${phase} — ${pN[Math.min(phase-1,3)]}`,b.x,by+bh+5);

    } else if (b.isMegaBoss) {
      const phase=b.phase||1;
      const gw=phase===3?40:phase===2?30:25;
      ctx.shadowBlur=gw; ctx.shadowColor=b.color||'#ff3366';
      ctx.strokeStyle=b.color||'#ff3366'; ctx.lineWidth=6;
      for(let i=0;i<phase;i++){ctx.beginPath();ctx.arc(b.x,b.y,b.r+20+i*15+Math.sin(time*3+i)*8,0,Math.PI*2);ctx.stroke();}
      const midC=phase===3?'#ff0033':phase===2?'#ff4466':(b.color||'#ff3366');
      const g=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
      g.addColorStop(0,b.color||'#ff3366'); g.addColorStop(0.5,midC); g.addColorStop(1,'#330011');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.font='bold 24px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(time*2); ctx.fillText(phase===3?'☠':phase===2?'⚡':'●',0,0); ctx.restore();
      ctx.shadowBlur=0;
      const bw=200,bh=14,bx=b.x-bw/2,by=b.y-b.r-35;
      ctx.fillStyle='rgba(0,0,0,0.9)'; ctx.fillRect(bx-3,by-3,bw+6,bh+6);
      ctx.fillStyle='rgba(50,50,50,0.8)'; ctx.fillRect(bx,by,bw,bh);
      ctx.fillStyle=midC; ctx.fillRect(bx,by,bw*hpPct,bh);
      ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(bx+bw*0.66,by);ctx.lineTo(bx+bw*0.66,by+bh);ctx.stroke();
      ctx.beginPath();ctx.moveTo(bx+bw*0.33,by);ctx.lineTo(bx+bw*0.33,by+bh);ctx.stroke();
      ctx.fillStyle='white'; ctx.font='bold 16px Arial'; ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.strokeStyle='black'; ctx.lineWidth=3; ctx.strokeText('⚔ MEGA BOSS ⚔',b.x,by-20); ctx.fillText('⚔ MEGA BOSS ⚔',b.x,by-20);
      ctx.font='bold 10px Arial'; ctx.fillStyle='#ffd93d'; ctx.fillText(`PHASE ${phase}`,b.x,by+bh+5);

    } else {
      ctx.shadowBlur=25; ctx.shadowColor=b.color||'#b86bff';
      ctx.strokeStyle=b.color||'#b86bff'; ctx.lineWidth=5;
      for(let i=0;i<2;i++){ctx.beginPath();ctx.arc(b.x,b.y,b.r+15+i*10+Math.sin(time*2)*5,0,Math.PI*2);ctx.stroke();}
      ctx.fillStyle=b.color||'#b86bff'; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      const bw=120,bh=10,bx=b.x-bw/2,by=b.y-b.r-25;
      ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.fillRect(bx-2,by-2,bw+4,bh+4);
      ctx.fillStyle='rgba(255,71,87,0.6)'; ctx.fillRect(bx,by,bw,bh);
      ctx.fillStyle=b.color||'#b86bff'; ctx.fillRect(bx,by,bw*hpPct,bh);
      ctx.fillStyle='white'; ctx.font='bold 14px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('BOSS',b.x,b.y);
    }
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  }

  // ══════════════════════════════════════════════════════════
  //  MAIN RENDER FRAME
  // ══════════════════════════════════════════════════════════
  function mpRenderFrame(dt) {
    // Screen shake
    const shaking = typeof screenShakeAmt !== 'undefined' && screenShakeAmt > 0;
    if (shaking) {
      ctx.save();
      ctx.translate(
        (Math.random()-0.5)*screenShakeAmt*25,
        (Math.random()-0.5)*screenShakeAmt*25
      );
      if (typeof screenShakeAmt !== 'undefined') screenShakeAmt = Math.max(0, screenShakeAmt - dt * 2.5);
    }

    // Background — matches solo (dark navy + subtle grid)
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width;  x += 80) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 80) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }

    const s = getInterpolated();
    if (!s) {
      ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='16px Arial'; ctx.textAlign='center';
      ctx.fillText('Connecting...',canvas.width/2,canvas.height/2); ctx.textAlign='left';
      if (shaking) ctx.restore();
      return;
    }

    // Trail particles (behind players)
    if (typeof particles !== 'undefined')
      particles.forEach(p => { if (p.isTrail && typeof p.draw === 'function') p.draw(); });

    // Players
    s.players?.forEach(p => drawMpPlayer(p));

    // Bullets — glowing like solo
    if (s.bullets?.length) {
      ctx.shadowBlur = 12; ctx.shadowColor = '#ffe66b';
      s.bullets.forEach(b => {
        ctx.fillStyle = '#ffe66b';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r ?? 5, 0, Math.PI*2); ctx.fill();
      });
      ctx.shadowBlur = 0;
    }
    if (s.enemyBullets?.length) {
      ctx.shadowBlur = 10; ctx.shadowColor = '#ff4757';
      s.enemyBullets.forEach(eb => {
        ctx.fillStyle = '#ff4757';
        ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r ?? 7, 0, Math.PI*2); ctx.fill();
      });
      ctx.shadowBlur = 0;
    }

    // Enemies + boss
    s.enemies?.forEach(e => drawMpEnemy(e));
    if (s.boss) drawMpBoss(s.boss);

    // Non-trail particles (explosions, etc.)
    if (typeof particles !== 'undefined')
      particles.forEach(p => { if (!p.isTrail && typeof p.draw === 'function') p.draw(); });

    // Powerups — matching solo style
    s.powerups?.forEach(pu => {
      const bob = Math.sin(Date.now() / 80) * 2;
      const alpha = 1;
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 18; ctx.shadowColor = pu.color || '#ffffff';
      ctx.beginPath();
      ctx.arc(pu.x, pu.y + bob, pu.r ?? 12, 0, Math.PI * 2);
      ctx.fillStyle = pu.color || '#ffffff'; ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pu.symbol || '✦', pu.x, pu.y + bob);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    });

    if (shaking) ctx.restore();

    // ── Wave clear countdown ───────────────────────────────
    if (s.waveClearTimer > 0) {
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const cx=canvas.width/2, cy=canvas.height/2;
      const pulse=Math.sin(Date.now()/200)*0.1+0.9, cr=80*pulse;
      const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,cr+20);
      grad.addColorStop(0,'rgba(107,255,123,0.3)'); grad.addColorStop(0.7,'rgba(107,255,123,0.1)'); grad.addColorStop(1,'rgba(107,255,123,0)');
      ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(cx,cy,cr+20,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(20,25,35,0.95)'; ctx.strokeStyle='#6bff7b'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2); ctx.fill(); ctx.stroke();
      const prog=Math.min(s.waveClearTimer/2,1);
      ctx.strokeStyle='#ffd93d'; ctx.lineWidth=5; ctx.lineCap='round';
      ctx.beginPath(); ctx.arc(cx,cy,cr-12,-Math.PI/2,-Math.PI/2+Math.PI*2*prog); ctx.stroke();
      ctx.shadowBlur=25; ctx.shadowColor='#ffd93d'; ctx.font='bold 64px system-ui'; ctx.fillStyle='#ffd93d';
      ctx.fillText(Math.ceil(s.waveClearTimer),cx,cy);
      ctx.shadowBlur=8; ctx.shadowColor='#6bff7b'; ctx.font='600 14px system-ui'; ctx.fillStyle='#6bff7b'; ctx.fillText('WAVE CLEARED',cx,cy-50);
      ctx.shadowBlur=0; ctx.font='500 12px system-ui'; ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.fillText('NEXT WAVE',cx,cy+50);
      ctx.restore();
    }

    // ── Boss countdown ─────────────────────────────────────
    if (s.bossCountdownTimer > 0) {
      ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
      const cx=canvas.width/2, cy=canvas.height/2;
      const pulse=Math.sin(Date.now()/150)*0.15+0.85, cr=90*pulse;
      const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,cr+25);
      grad.addColorStop(0,'rgba(255,71,87,0.4)'); grad.addColorStop(0.7,'rgba(255,107,53,0.2)'); grad.addColorStop(1,'rgba(255,71,87,0)');
      ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(cx,cy,cr+25,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(20,15,25,0.95)'; ctx.strokeStyle='#ff4757'; ctx.lineWidth=4;
      ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2); ctx.fill(); ctx.stroke();
      const prog=Math.min(s.bossCountdownTimer/3,1);
      ctx.strokeStyle='#ff6348'; ctx.lineWidth=6; ctx.lineCap='round';
      ctx.beginPath(); ctx.arc(cx,cy,cr-15,-Math.PI/2,-Math.PI/2+Math.PI*2*prog); ctx.stroke();
      ctx.shadowBlur=30; ctx.shadowColor='#ff4757'; ctx.font='bold 72px system-ui'; ctx.fillStyle='#ff4757';
      ctx.fillText(Math.ceil(s.bossCountdownTimer),cx,cy);
      ctx.shadowBlur=12; ctx.shadowColor='#ff6348'; ctx.font='bold 18px system-ui'; ctx.fillStyle='#ff6348';
      const pt=s.pendingBossType;
      ctx.fillText(pt===4?'☠ LEGENDARY BOSS ☠':pt===3?'OMEGA OVERLORD':pt===2?'MEGA BOSS':'BOSS INCOMING',cx,cy-60);
      ctx.shadowBlur=8; ctx.font='bold 14px system-ui'; ctx.fillStyle='#ffd93d'; ctx.fillText('GET READY!',cx,cy+60);
      ctx.restore();
    }

    // ── Enemies remaining counter ──────────────────────────
    if (!s.boss && s.waveClearTimer <= 0 && s.bossCountdownTimer <= 0) {
      const needed    = s.enemiesNeeded ?? (8 + (s.wave || 1) * 3);
      const remaining = Math.max(0, needed - (s.enemiesKilledThisWave || 0));
      ctx.save();
      const bW=180, bH=42, bX=12, bY=canvas.height-bH-12, br=10;
      ctx.fillStyle='rgba(13,21,37,0.88)';
      ctx.beginPath();
      ctx.moveTo(bX+br,bY); ctx.lineTo(bX+bW-br,bY); ctx.quadraticCurveTo(bX+bW,bY,bX+bW,bY+br);
      ctx.lineTo(bX+bW,bY+bH-br); ctx.quadraticCurveTo(bX+bW,bY+bH,bX+bW-br,bY+bH);
      ctx.lineTo(bX+br,bY+bH); ctx.quadraticCurveTo(bX,bY+bH,bX,bY+bH-br);
      ctx.lineTo(bX,bY+br); ctx.quadraticCurveTo(bX,bY,bX+br,bY);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(88,166,255,0.25)'; ctx.lineWidth=1.5; ctx.stroke();
      const iX=bX+20, iY=bY+bH/2;
      ctx.fillStyle='#ff4757'; ctx.shadowBlur=8; ctx.shadowColor='#ff4757';
      ctx.beginPath(); ctx.arc(iX,iY,8,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.font='600 14px Inter, system-ui'; ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.fillText('Enemies',iX+18,iY-8);
      const cC = remaining<=5?'#6bff7b':remaining<=10?'#ffd93d':'#9be7ff';
      ctx.font='700 18px Inter, system-ui'; ctx.fillStyle=cC; ctx.shadowBlur=6; ctx.shadowColor=cC;
      ctx.fillText(remaining,iX+18,iY+9); ctx.shadowBlur=0;
      ctx.restore();
    }

    // ── HUD updates (score, wave, partner HP, dash, buffs) ─
    if (typeof mpUpdateHUD === 'function') mpUpdateHUD(s);

    const me = s.players?.find(p => p.socketId === mpMySocketId);
    _updateDashHUD(me);
    _updateBuffsFromState(me);
  }

  // ══════════════════════════════════════════════════════════
  //  OVERRIDE GAME LOOP
  // ══════════════════════════════════════════════════════════
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (typeof loop !== 'function') { console.warn('[MP] loop not found'); return; }
      const _origLoop = loop;

      window.loop = function mpLoop(time) {
        if (typeof mpGameActive !== 'undefined' && mpGameActive) {
          const rawDt = 0.016;

          // Tick particles
          if (typeof particles !== 'undefined') {
            for (let i = particles.length - 1; i >= 0; i--) {
              if (typeof particles[i].update === 'function') particles[i].update(rawDt);
              if (particles[i].life <= 0) particles.splice(i, 1);
            }
          }
          // Tick combo
          _tickCombo(rawDt);

          if (!mpPaused) {
            mpRenderFrame(rawDt);
            if (typeof mpSendInput === 'function' && typeof keys !== 'undefined' && typeof mouse !== 'undefined') {
              mpSendInput(keys, mouse.x, mouse.y, window.mouseDown || false);
            }
          }
          requestAnimationFrame(window.loop);
        } else {
          _origLoop(time);
        }
      };

      // Capture-phase keydown
      window.addEventListener('keydown', function mpKeydown(e) {
        if (!e.key) return;
        if (typeof mpGameActive === 'undefined' || !mpGameActive) return;
        if (e.key === ' ') {
          e.preventDefault();
          window._mpDashPending = true;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          mpTogglePause();
        }
      }, true);

      console.log('[MP] v6 — loop + keys wrapped');
    }, 200);
  });

  // ── Patch mpSendInput to include dash ─────────────────────
  window.addEventListener('load', () => {
    setTimeout(() => {
      const _origSend = window.mpSendInput;
      if (!_origSend) return;
      window.mpSendInput = function (keys, mouseX, mouseY, shooting) {
        if (!mpSocket?.connected || !mpGameActive) return;
        const has = k => keys instanceof Set ? keys.has(k) : !!keys[k];
        mpSocket.emit('input', {
          up:       has('w') || has('arrowup'),
          down:     has('s') || has('arrowdown'),
          left:     has('a') || has('arrowleft'),
          right:    has('d') || has('arrowright'),
          shooting,
          dash:     !!window._mpDashPending,
          mouseX,
          mouseY,
        });
        window._mpDashPending = false;
      };
      console.log('[MP] v6 — mpSendInput patched');
    }, 500);
  });

  // ── Wire pause overlay buttons ─────────────────────────────
  window.addEventListener('load', () => {
    setTimeout(() => {
      document.getElementById('resumeBtn')?.addEventListener('click', () => {
        if (typeof mpGameActive !== 'undefined' && mpGameActive && mpPaused) mpTogglePause();
      });
      document.getElementById('pauseSettingsBtn')?.addEventListener('click', () => {
        if (typeof mpGameActive !== 'undefined' && mpGameActive) {
          document.getElementById('pauseOverlay')?.classList.add('hidden');
        }
      });
      document.getElementById('menuBtn')?.addEventListener('click', () => {
        if (typeof mpGameActive !== 'undefined' && mpGameActive) {
          mpPaused = false;
          document.getElementById('pauseOverlay')?.classList.add('hidden');
          if (typeof mpReturnToMenu === 'function') mpReturnToMenu();
        }
      });
    }, 400);
  });

  // ── startMpGame / mpReturnToMenu hooks ────────────────────
  window.addEventListener('load', () => {
    setTimeout(() => {
      const _origStart = window.startMpGame;
      window.startMpGame = function (wave) {
        // Reset feel systems
        mpCombo = 0;
        mpComboTimer = 0;
        _updateComboUI(0);
        prevState = null;
        currentState = null;

        window.running = false;
        document.getElementById('homeScreen')?.classList.add('hidden');
        document.getElementById('mpLobbyPanel')?.classList.add('hidden');
        document.getElementById('mpCountdown')?.classList.add('hidden');
        document.getElementById('partnerHpBar')?.classList.remove('hidden');
        try { player = new Player(canvas.width / 2, canvas.height / 2); } catch(e) {}
        if (_origStart) _origStart(wave);
        requestAnimationFrame(window.loop);
        console.log('[MP] v6 — game started');
      };

      const _origReturn = window.mpReturnToMenu;
      window.mpReturnToMenu = function () {
        document.getElementById('partnerHpBar')?.classList.add('hidden');
        mpCombo = 0; mpComboTimer = 0; mpPaused = false;
        _updateComboUI(0);
        prevState = null; currentState = null;
        if (_origReturn) _origReturn();
      };
    }, 300);
  });

  // ── Mouse / touch input ────────────────────────────────────
  canvas?.addEventListener('mousemove', e => {
    if (!mpGameActive) return;
    const r = canvas.getBoundingClientRect();
    if (typeof mouse !== 'undefined') {
      mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      mouse.y = (e.clientY - r.top)  * (canvas.height / r.height);
    }
  });
  window.mouseDown = false;
  canvas?.addEventListener('mousedown', () => window.mouseDown = true);
  canvas?.addEventListener('mouseup',   () => window.mouseDown = false);
  canvas?.addEventListener('touchstart', e => {
    window.mouseDown = true;
    const r = canvas.getBoundingClientRect(), t = e.touches[0];
    if (typeof mouse !== 'undefined') {
      mouse.x = (t.clientX-r.left)*(canvas.width/r.width);
      mouse.y = (t.clientY-r.top)*(canvas.height/r.height);
    }
  }, { passive: true });
  canvas?.addEventListener('touchmove', e => {
    const r = canvas.getBoundingClientRect(), t = e.touches[0];
    if (typeof mouse !== 'undefined') {
      mouse.x = (t.clientX-r.left)*(canvas.width/r.width);
      mouse.y = (t.clientY-r.top)*(canvas.height/r.height);
    }
  }, { passive: true });
  canvas?.addEventListener('touchend', () => window.mouseDown = false);

  console.log('✅ mp-hook.js v6 loaded');
})();
