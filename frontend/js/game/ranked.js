// js/game/ranked.js — Ranked Mode System

/* ── Tier definitions ────────────────────────────────────────── */
const RANKED_TIERS = ['bronze','silver','gold','platinum','diamond','master','grandmaster','apex'];

const RANKED_CONFIG = {
  bronze: {
    label:'Bronze', icon:'🥉', color:'#cd7f32',
    hasDivisions:true, rpPerDiv:100,
    targetWaves:7, waveOffset:0,
    hpMult:0.75, speedMult:0.85,
    rpGainBase:12, rpLoss:7,
    enemyTypes:['normal','fast'],
    miniBossInterval:0, bigBossInterval:0,
    desc:'Learn the basics. Waves are short and enemies are gentle.',
  },
  silver: {
    label:'Silver', icon:'🥈', color:'#aaaacc',
    hasDivisions:true, rpPerDiv:100,
    targetWaves:12, waveOffset:5,
    hpMult:0.9, speedMult:0.92,
    rpGainBase:18, rpLoss:10,
    enemyTypes:['normal','fast','tank'],
    miniBossInterval:0, bigBossInterval:0, lastWaveBoss:1,
    desc:'Slightly tougher enemies. A mini-boss awaits on the final wave.',
  },
  gold: {
    label:'Gold', icon:'🥇', color:'#ffd700',
    hasDivisions:true, rpPerDiv:100,
    targetWaves:14, waveOffset:10,
    hpMult:1.0, speedMult:1.0,
    rpGainBase:22, rpLoss:13,
    enemyTypes:['normal','fast','tank','shooter'],
    miniBossInterval:5, bigBossInterval:0,
    desc:'Shooters join the fight. Mini-bosses every 5 waves.',
  },
  platinum: {
    label:'Platinum', icon:'💠', color:'#00d4aa',
    hasDivisions:true, rpPerDiv:100,
    targetWaves:18, waveOffset:15,
    hpMult:1.15, speedMult:1.05,
    rpGainBase:28, rpLoss:18,
    enemyTypes:['fast','tank','shooter','enforcer'],
    miniBossInterval:5, bigBossInterval:15,
    desc:'Enforcers appear. Mini-bosses every 5 waves, big boss at wave 15.',
  },
  diamond: {
    label:'Diamond', icon:'💎', color:'#4fc3f7',
    hasDivisions:true, rpPerDiv:100,
    targetWaves:24, waveOffset:20,
    hpMult:1.35, speedMult:1.1,
    rpGainBase:38, rpLoss:25,
    enemyTypes:['fast','tank','shooter','enforcer'],
    miniBossInterval:4, bigBossInterval:10,
    desc:'High HP, fast AI. Mini-bosses every 4 waves, big boss every 10.',
  },
  master: {
    label:'Master', icon:'👑', color:'#b39ddb',
    hasDivisions:false, rpPerDiv:200,
    targetWaves:32, waveOffset:28,
    hpMult:1.65, speedMult:1.2,
    rpGainBase:48, rpLoss:30,
    enemyTypes:['tank','shooter','enforcer'],
    miniBossInterval:3, bigBossInterval:8,
    desc:'No divisions. Aggressive enemies. Mini-bosses every 3 waves.',
  },
  grandmaster: {
    label:'Grandmaster', icon:'🔱', color:'#ef5350',
    hasDivisions:false, rpPerDiv:300,
    targetWaves:42, waveOffset:35,
    hpMult:2.1, speedMult:1.3,
    rpGainBase:62, rpLoss:35,
    enemyTypes:['shooter','enforcer'],
    miniBossInterval:0, bigBossInterval:6,
    desc:'Elite threats only. Big bosses every 6 waves. 300 RP to reach Apex.',
  },
  apex: {
    label:'Apex', icon:'⚡', color:'#ff9800',
    hasDivisions:false, rpPerDiv:null,
    targetWaves:9999, waveOffset:42,
    hpMult:2.5, speedMult:1.4,
    rpGainBase:78, rpLoss:40,
    enemyTypes:['shooter','enforcer'],
    miniBossInterval:0, bigBossInterval:5,
    desc:'Leaderboard-only. Legendary bosses every 5 waves. Endurance is everything.',
  },
};

/* ── Run state (reset per run) ───────────────────────────────── */
let _rankedRunActive   = false;
let _rankedWavesCleared = 0;
let _rankedStreak      = 0;   // persists across runs; reset on loss
let _rankedPromoProtect = false;

/* ── Persistent profile (loaded from server) ─────────────────── */
let _rankedProfile = {
  tier:'bronze', division:5, rp:0,
  peak_tier:'bronze', peak_division:5,
  wins:0, losses:0, streak:0,
};

/* ── Helpers ─────────────────────────────────────────────────── */
function _divLabel(d) { return ['','I','II','III','IV','V'][d] || ''; }

function rankLabel(tier, division) {
  const cfg = RANKED_CONFIG[tier];
  if (!cfg) return 'Unranked';
  return cfg.hasDivisions ? `${cfg.label} ${_divLabel(division)}` : cfg.label;
}

/* ── Rank badge SVG icons (R6S-inspired hexagonal) ──────────── */
// Pointed hexagon with 3-stop metallic gradient + tier symbol.
// Division roman numeral shown inside badge for Bronze–Diamond.
function rankBadgeSvg(tier, division) {
  const divRoman = { 1:'I', 2:'II', 3:'III', 4:'IV', 5:'V' };
  const hasDivs  = ['bronze','silver','gold','platinum','diamond'].includes(tier);
  const div      = hasDivs && division ? (divRoman[division] || '') : '';
  const label    = RANKED_CONFIG[tier]?.label || tier;

  // Hexagon (pointed top + bottom), 44×50 viewport
  // Outer: M22,2 L40,13 L40,37 L22,48 L4,37 L4,13 Z
  // Inner border ring (4px inset)
  const outer = 'M22,2 L40,13 L40,37 L22,48 L4,37 L4,13 Z';
  const inner = 'M22,7 L36,16 L36,34 L22,43 L8,34 L8,16 Z';

  // Tier colors: [top highlight, main, deep shadow, border, symbol/icon]
  const C = {
    bronze:      ['#f0b870','#bf7230','#66280a','#98481a','#f8dca8'],
    silver:      ['#dcdcf4','#9494b4','#383858','#707098','#e4e6ff'],
    gold:        ['#ffe870','#c48c00','#624200','#9c6c00','#fff8a8'],
    platinum:    ['#48f8cc','#00b488','#004838','#008f68','#b0fff0'],
    diamond:     ['#88d4ff','#1c8ce0','#00387a','#1060b4','#ccecff'],
    master:      ['#d4a0ff','#7038c4','#280878','#5020a0','#e8d4ff'],
    grandmaster: ['#ff8888','#c41414','#540008','#940010','#ffd8b8'],
    apex:        ['#ffcc38','#e06400','#6c1800','#ac3c00','#fff0a8'],
  };

  const [cTop, cMid, cBot, cBrd, cSym] = C[tier] || C.bronze;

  // Symbols shift up slightly when division text occupies the bottom
  const sy = div ? -4 : 0;

  const sym = {
    // Single thick chevron
    bronze: `<polyline points="10,${30+sy} 22,${21+sy} 34,${30+sy}" fill="none" stroke="${cSym}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    // Double chevron
    silver: `<polyline points="10,${26+sy} 22,${17+sy} 34,${26+sy}" fill="none" stroke="${cSym}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
             <polyline points="10,${33+sy} 22,${24+sy} 34,${33+sy}" fill="none" stroke="${cSym}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    // 5-point star
    gold: `<polygon points="22,${15+sy} 24.2,${21.6+sy} 31.2,${21.6+sy} 25.6,${25.8+sy} 27.8,${32.4+sy} 22,${28.2+sy} 16.2,${32.4+sy} 18.4,${25.8+sy} 12.8,${21.6+sy} 19.8,${21.6+sy}" fill="${cSym}" stroke="rgba(160,100,0,0.35)" stroke-width="0.6"/>`,
    // 6-arm snowflake + circle
    platinum: `<line x1="22" y1="${13+sy}" x2="22" y2="${35+sy}" stroke="${cSym}" stroke-width="2.8" stroke-linecap="round"/>
               <line x1="9"  y1="${20+sy}" x2="35" y2="${28+sy}" stroke="${cSym}" stroke-width="2.8" stroke-linecap="round"/>
               <line x1="35" y1="${20+sy}" x2="9"  y2="${28+sy}" stroke="${cSym}" stroke-width="2.8" stroke-linecap="round"/>
               <circle cx="22" cy="${24+sy}" r="4.5" fill="none" stroke="${cSym}" stroke-width="2.2"/>`,
    // Faceted diamond gem
    diamond: `<polygon points="22,${13+sy} 32,${24+sy} 22,${35+sy} 12,${24+sy}" fill="${cSym}" stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>
              <polygon points="22,${13+sy} 32,${24+sy} 22,${25+sy} 12,${24+sy}" fill="rgba(255,255,255,0.42)"/>
              <line x1="12" y1="${24+sy}" x2="32" y2="${24+sy}" stroke="rgba(255,255,255,0.5)" stroke-width="0.9"/>`,
    // Crown — 3 points with gems
    master: `<path d="M9,37 L9,25 L14,30 L22,18 L30,30 L35,25 L35,37 Z" fill="${cSym}" stroke="rgba(255,255,255,0.22)" stroke-width="0.9" stroke-linejoin="round"/>
             <circle cx="9.5"  cy="24"   r="2.4" fill="rgba(255,255,255,0.92)"/>
             <circle cx="22"   cy="17"   r="2.8" fill="white"/>
             <circle cx="34.5" cy="24"   r="2.4" fill="rgba(255,255,255,0.92)"/>`,
    // Crown — 5 points with gems + base bar
    grandmaster: `<rect x="9" y="37" width="26" height="4.5" rx="1.5" fill="${cSym}" opacity="0.88"/>
                  <path d="M9,37 L9,24 L13.5,29 L17.5,19 L22,25 L26.5,19 L30.5,29 L35,24 L35,37 Z" fill="${cSym}" stroke="rgba(255,255,255,0.2)" stroke-width="0.9" stroke-linejoin="round"/>
                  <circle cx="9.5"  cy="23.5" r="2"   fill="rgba(255,255,255,0.9)"/>
                  <circle cx="17.5" cy="18"   r="2"   fill="rgba(255,255,255,0.9)"/>
                  <circle cx="22"   cy="15.5" r="2.3" fill="white"/>
                  <circle cx="26.5" cy="18"   r="2"   fill="rgba(255,255,255,0.9)"/>
                  <circle cx="34.5" cy="23.5" r="2"   fill="rgba(255,255,255,0.9)"/>`,
    // Crown — 5 points + star above center gem
    apex: `<rect x="9" y="37" width="26" height="4" rx="1.5" fill="${cSym}" opacity="0.85"/>
           <path d="M9,37 L9,25 L14,30 L19,19 L22,25 L25,19 L30,30 L35,25 L35,37 Z" fill="${cSym}" stroke="rgba(255,220,80,0.28)" stroke-width="0.9" stroke-linejoin="round"/>
           <circle cx="9.5"  cy="24"   r="2"   fill="rgba(255,255,255,0.88)"/>
           <circle cx="34.5" cy="24"   r="2"   fill="rgba(255,255,255,0.88)"/>
           <polygon points="22,10 23.5,14.8 28.6,14.8 24.5,17.9 26,22.7 22,19.6 18,22.7 19.5,17.9 15.4,14.8 20.5,14.8" fill="${cSym}" stroke="rgba(255,220,0,0.5)" stroke-width="0.5"/>`,
  };

  return `<span class="rank-badge-svg" title="${label}${div ? ' ' + div : ''}"><svg xmlns="http://www.w3.org/2000/svg" width="44" height="50" viewBox="0 0 44 50">
    <defs>
      <linearGradient id="rbg-${tier}" x1="25%" y1="0%" x2="75%" y2="100%">
        <stop offset="0%"   stop-color="${cTop}"/>
        <stop offset="45%"  stop-color="${cMid}"/>
        <stop offset="100%" stop-color="${cBot}"/>
      </linearGradient>
    </defs>
    <path d="${outer}" fill="url(#rbg-${tier})" stroke="${cBrd}" stroke-width="2.5"/>
    <path d="${inner}" fill="rgba(0,0,0,0.14)" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>
    <path d="M22,2 L40,13 L31,7 Z" fill="rgba(255,255,255,0.2)"/>
    ${sym[tier] || sym.bronze}
    ${div ? `<text x="22" y="46" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-size="8.5" font-weight="900" fill="rgba(255,255,255,0.9)" letter-spacing="1.5">${div}</text>` : ''}
  </svg></span>`;
}

function getRankedConfig() {
  return RANKED_CONFIG[_rankedProfile.tier] || RANKED_CONFIG.bronze;
}

function getRankedProfile() { return { ..._rankedProfile }; }

/* ── Load profile from backend ───────────────────────────────── */
async function loadRankedProfile() {
  try {
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('topdown_token');
    if (!token || (typeof isGuest !== 'undefined' && isGuest)) return;
    const res = await fetch(`${API_BASE}/ranked/profile`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.tier) {
      _rankedProfile = data;
      _rankedStreak  = data.streak || 0;
      updateRankedBadge();
    }
  } catch (_) {}
}

/* ── Boss schedule per tier + wave ───────────────────────────── */
function rankedBossTypeForWave(completedWave) {
  const cfg  = getRankedConfig();
  const tier = _rankedProfile.tier;

  if (tier === 'silver' && completedWave === cfg.targetWaves) return 1;  // mini on final
  if (tier === 'apex'   && completedWave % 5 === 0) return 4;            // legendary every 5
  if (tier === 'grandmaster' && completedWave % 6 === 0) return 2;

  if (cfg.bigBossInterval  > 0 && completedWave % cfg.bigBossInterval  === 0) return 2;
  if (cfg.miniBossInterval > 0 && completedWave % cfg.miniBossInterval === 0) return 1;
  return 0;
}

/* ── Enemy type selection for ranked ─────────────────────────── */
function rankedSpawnType(runWave) {
  const cfg   = getRankedConfig();
  const types = cfg.enemyTypes;
  const rand  = Math.random();
  const n     = types.length;

  if (n === 1) return types[0];

  // Bronze/Silver: truly random from the small pool
  if (n <= 2) return types[Math.floor(rand * n)];

  // Increase probability of harder types as run progresses
  const prog = Math.min(runWave / Math.max(cfg.targetWaves, 1), 1);
  const idx  = Math.min(Math.floor(prog * (n - 1) + Math.random()), n - 1);
  return types[idx];
}

/* ── RP calculation ──────────────────────────────────────────── */
function _calcRpGain(wavesCleared) {
  const cfg  = getRankedConfig();
  const base = cfg.rpGainBase + (wavesCleared - 1) * 4;
  const mult = 1 + Math.min(_rankedStreak * 0.1, 0.5); // up to +50% at 5-streak
  return Math.round(base * mult);
}

function _calcRpLoss() { return getRankedConfig().rpLoss; }

/* ── Init a ranked run ───────────────────────────────────────── */
function rankedInit() {
  _rankedRunActive    = true;
  _rankedWavesCleared = 0;
}

/* ── Wave cleared callback ───────────────────────────────────── */
function rankedOnWaveClear(completedWave) {
  if (!_rankedRunActive) return;
  _rankedWavesCleared = completedWave;
  updateRankedHUD();
}

/* ── End of run ──────────────────────────────────────────────── */
async function endRankedRun(won) {
  if (!_rankedRunActive) return null;
  _rankedRunActive = false;

  // Capture target waves BEFORE we update the profile
  const targetWaves = getRankedConfig().targetWaves;

  // ── Calculate RP delta ────────────────────────────────────────
  let rpDelta;
  const isLoggedInUser = typeof currentUser !== 'undefined' && currentUser
    && !(typeof isGuest !== 'undefined' && isGuest);

  if (!isLoggedInUser) {
    // Guest / offline: show overlay without tracking
    showRankedEndOverlay({ rpDelta: 0, won, result: null, wavesCleared: _rankedWavesCleared, targetWaves });
    return { rpDelta: 0, won, result: null };
  }

  if (won) {
    rpDelta = _calcRpGain(_rankedWavesCleared);
    _rankedStreak++;
  } else {
    rpDelta = -_calcRpLoss();
    if (_rankedPromoProtect) { rpDelta = 0; _rankedPromoProtect = false; }
    _rankedStreak = 0;
  }

  // ── Submit to backend ─────────────────────────────────────────
  let result = null;
  try {
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('topdown_token');
    const resp  = await fetch(`${API_BASE}/ranked/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ wavesCleared: _rankedWavesCleared, rpDelta, won }),
    });
    if (resp.ok) result = await resp.json();
  } catch (_) {}

  // ── Update local profile ──────────────────────────────────────
  if (result && result.tier) {
    _rankedProfile = {
      tier: result.tier, division: result.division, rp: result.rp,
      peak_tier: result.peak_tier, peak_division: result.peak_division,
      wins: result.wins, losses: result.losses, streak: result.streak,
    };
    if (result.promo_protect) _rankedPromoProtect = true;
  }

  updateRankedBadge();
  showRankedEndOverlay({ rpDelta, won, result, wavesCleared: _rankedWavesCleared, targetWaves });
  return { rpDelta, won, result, wavesCleared: _rankedWavesCleared };
}

/* ── Run-end overlay ─────────────────────────────────────────── */
function showRankedEndOverlay({ rpDelta, won, result, wavesCleared, targetWaves }) {
  let el = document.getElementById('rankedEndOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id        = 'rankedEndOverlay';
    el.className = 'ranked-end-overlay';
    document.getElementById('ui').appendChild(el);
  }

  const cfg       = getRankedConfig();
  const label     = rankLabel(_rankedProfile.tier, _rankedProfile.division);
  const rpSign    = rpDelta > 0 ? '+' : '';
  const rpColor   = rpDelta > 0 ? '#4caf50' : rpDelta < 0 ? '#ef5350' : '#ff9800';
  const titleText = won ? '✅ VICTORY' : '💀 DEFEAT';
  const titleClr  = won ? '#4caf50' : '#ef5350';
  const safeTgt   = targetWaves > 9000 ? '∞' : targetWaves;

  let rankChangeHtml = '';
  if (result && (result.tier_changed || result.division_changed)) {
    const oldLbl = rankLabel(result.prev_tier, result.prev_division);
    const newLbl = rankLabel(result.tier, result.division);
    const newCfg = RANKED_CONFIG[result.tier] || cfg;
    if (won) {
      rankChangeHtml = `<div class="ranked-promo-banner" style="color:${newCfg.color}">▲ PROMOTED: ${oldLbl} → ${newLbl}</div>`;
    } else {
      rankChangeHtml = `<div class="ranked-promo-banner" style="color:#ef5350">▼ DEMOTED: ${oldLbl} → ${newLbl}</div>`;
    }
  } else if (rpDelta === 0 && !won) {
    rankChangeHtml = `<div class="ranked-promo-banner" style="color:#ff9800">🛡 Promotion Shield — No RP lost</div>`;
  }

  // Current RP bar
  const maxRp    = cfg.rpPerDiv || 300;
  const curRp    = _rankedProfile.rp;
  const barPct   = Math.max(0, Math.min(100, (curRp / maxRp) * 100));

  el.innerHTML = `
    <div class="ranked-end-box">
      <div class="ranked-end-title" style="color:${titleClr}">${titleText}</div>
      <div class="ranked-end-waves">${wavesCleared} / ${safeTgt} waves cleared</div>
      <div class="ranked-rp-delta" style="color:${rpColor}">${rpSign}${rpDelta} RP</div>
      ${rankChangeHtml}
      <div class="ranked-end-current" style="color:${cfg.color}">${cfg.icon} ${label}</div>
      <div class="ranked-end-bar-wrap">
        <div class="ranked-end-bar" style="width:${barPct}%;background:${cfg.color}"></div>
      </div>
      <div class="ranked-end-rp-label">${curRp} / ${maxRp} RP</div>
      <div class="ranked-end-buttons">
        <button class="home-btn primary" id="rankedEndPlayAgainBtn">▶ PLAY AGAIN</button>
        <button class="home-btn" id="rankedEndMenuBtn">⌂ MAIN MENU</button>
      </div>
    </div>
  `;
  el.style.display = 'flex';

  document.getElementById('rankedEndPlayAgainBtn').addEventListener('click', () => {
    el.style.display = 'none';
    if (typeof startGame === 'function') startGame();
  });
  document.getElementById('rankedEndMenuBtn').addEventListener('click', () => {
    el.style.display = 'none';
    if (typeof hideModeHUDs === 'function') hideModeHUDs();
    document.getElementById('homeScreen').classList.remove('hidden');
    document.getElementById('homeHighVal').textContent   = typeof high !== 'undefined' ? high : '';
    document.getElementById('homeCoinsVal').textContent  = typeof playerCoins !== 'undefined' ? playerCoins : '';
    if (typeof updateXPDisplay === 'function') updateXPDisplay();
    updateRankedBadge();
  });
}

/* ── In-game ranked HUD ──────────────────────────────────────── */
function updateRankedHUD() {
  const el = document.getElementById('rankedHUD');
  if (!el) return;
  const cfg  = getRankedConfig();
  const maxRp = cfg.rpPerDiv || 300;
  const rp   = _rankedProfile.rp;
  const pct  = Math.max(0, Math.min(100, (rp / maxRp) * 100));
  const lbl  = rankLabel(_rankedProfile.tier, _rankedProfile.division);

  // Color warning as RP drops toward demotion
  let barColor = cfg.color;
  if (rp < 20)      barColor = '#ef5350';
  else if (rp < 40) barColor = '#ff9800';

  const streakHtml = _rankedStreak >= 2
    ? `<span class="ranked-streak">🔥 ${_rankedStreak} STREAK</span>` : '';

  el.innerHTML = `
    <div class="ranked-hud-label" style="color:${cfg.color}">${cfg.icon} ${lbl}</div>
    ${streakHtml}
    <div class="ranked-rp-bar-wrap">
      <div class="ranked-rp-bar" style="width:${pct}%;background:${barColor}"></div>
    </div>
    <div class="ranked-rp-text">${rp} / ${maxRp} RP</div>
  `;
}

/* ── Mode-card badge (home screen) ───────────────────────────── */
function updateRankedBadge() {
  // In-game HUD badge
  const badge = document.getElementById('rankedModeBadge');
  if (badge) {
    const cfg = getRankedConfig();
    const lbl = rankLabel(_rankedProfile.tier, _rankedProfile.division);
    badge.textContent = `${cfg.icon} ${lbl}`;
    badge.style.color = cfg.color;
  }

  // Home screen rank display
  const row   = document.getElementById('homeRankRow');
  const icon  = document.getElementById('homeRankBadge');
  const lbl   = document.getElementById('homeRankLabel');
  const rp    = document.getElementById('homeRankRP');
  if (row && icon && lbl) {
    const cfg   = getRankedConfig();
    const label = rankLabel(_rankedProfile.tier, _rankedProfile.division);
    icon.innerHTML = rankBadgeSvg(_rankedProfile.tier, _rankedProfile.division);
    lbl.textContent  = label;
    lbl.style.color  = cfg.color;
    if (rp) rp.textContent = `${_rankedProfile.rp} RP`;
    row.style.display = '';
  }
}

/* ── Auto-load profile on page ready ────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure api-auth.js globals are set
  setTimeout(() => {
    if (typeof getToken === 'function' && getToken()) loadRankedProfile();
  }, 600);
});

/* ── Public API ──────────────────────────────────────────────── */
window.RANKED_CONFIG        = RANKED_CONFIG;
window.RANKED_TIERS         = RANKED_TIERS;
window.rankLabel             = rankLabel;
window.rankBadgeSvg          = rankBadgeSvg;
window.getRankedConfig       = getRankedConfig;
window.getRankedProfile      = getRankedProfile;
window.loadRankedProfile     = loadRankedProfile;
window.rankedInit            = rankedInit;
window.rankedOnWaveClear     = rankedOnWaveClear;
window.endRankedRun          = endRankedRun;
window.rankedBossTypeForWave = rankedBossTypeForWave;
window.rankedSpawnType       = rankedSpawnType;
window.updateRankedHUD       = updateRankedHUD;
window.updateRankedBadge     = updateRankedBadge;
