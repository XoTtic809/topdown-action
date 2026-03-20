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
    targetWaves:17, waveOffset:10,
    hpMult:1.1, speedMult:1.0,
    rpGainBase:22, rpLoss:13,
    enemyTypes:['normal','fast','tank','shooter'],
    miniBossInterval:5, bigBossInterval:0,
    desc:'Shooters join the fight. Mini-bosses every 5 waves.',
  },
  platinum: {
    label:'Platinum', icon:'💠', color:'#00d4aa',
    hasDivisions:true, rpPerDiv:100,
    targetWaves:22, waveOffset:15,
    hpMult:1.3, speedMult:1.1,
    rpGainBase:28, rpLoss:18,
    enemyTypes:['fast','tank','shooter','enforcer'],
    miniBossInterval:5, bigBossInterval:15,
    desc:'Enforcers appear. Mini-bosses every 5 waves, big boss at wave 15.',
  },
  diamond: {
    label:'Diamond', icon:'💎', color:'#4fc3f7',
    hasDivisions:true, rpPerDiv:100,
    targetWaves:30, waveOffset:20,
    hpMult:1.6, speedMult:1.2,
    rpGainBase:38, rpLoss:25,
    enemyTypes:['fast','tank','shooter','enforcer'],
    miniBossInterval:4, bigBossInterval:10,
    desc:'High HP, fast AI. Mini-bosses every 4 waves, big boss every 10.',
  },
  master: {
    label:'Master', icon:'👑', color:'#b39ddb',
    hasDivisions:false, rpPerDiv:200,
    targetWaves:40, waveOffset:28,
    hpMult:2.0, speedMult:1.3,
    rpGainBase:48, rpLoss:30,
    enemyTypes:['tank','shooter','enforcer'],
    miniBossInterval:3, bigBossInterval:8,
    desc:'No divisions. Aggressive enemies. Mini-bosses every 3 waves.',
  },
  grandmaster: {
    label:'Grandmaster', icon:'🔱', color:'#ef5350',
    hasDivisions:false, rpPerDiv:300,
    targetWaves:52, waveOffset:35,
    hpMult:2.5, speedMult:1.4,
    rpGainBase:62, rpLoss:35,
    enemyTypes:['shooter','enforcer'],
    miniBossInterval:0, bigBossInterval:6,
    desc:'Elite threats only. Big bosses every 6 waves. 300 RP to reach Apex.',
  },
  apex: {
    label:'Apex', icon:'⚡', color:'#ff9800',
    hasDivisions:false, rpPerDiv:null,
    targetWaves:9999, waveOffset:42,
    hpMult:3.0, speedMult:1.5,
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

/* ── Rank badge SVG icons ────────────────────────────────────── */
// Shield-shaped badges with a unique symbol per tier.
// Top 3 tiers get CSS animation classes (master/grandmaster/apex).
function rankBadgeSvg(tier) {
  // bg=main fill  bevel=inner highlight  stroke=border  sym=inner SVG symbol markup
  const D = {
    bronze: {
      bg: '#cd7f32', bevel: 'rgba(240,168,96,0.35)', stroke: '#a0522d',
      sym: `<polyline points="11,25 18,18 25,25" fill="none" stroke="#ffd4a0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    silver: {
      bg: '#aaaacc', bevel: 'rgba(220,220,240,0.3)', stroke: '#7777aa',
      sym: `<polyline points="11,21 18,15 25,21" fill="none" stroke="#e8e8ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="11,27 18,21 25,27" fill="none" stroke="#e8e8ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    gold: {
      bg: '#e8a800', bevel: 'rgba(255,240,80,0.4)', stroke: '#b07800',
      sym: `<polygon points="18,13 19.7,18.2 25.4,18.2 20.8,21.5 22.6,26.8 18,23.5 13.4,26.8 15.2,21.5 10.6,18.2 16.3,18.2" fill="#fff9c4" stroke="rgba(160,100,0,0.3)" stroke-width="0.5"/>`,
    },
    platinum: {
      bg: '#00b894', bevel: 'rgba(100,255,220,0.3)', stroke: '#008866',
      sym: `<polygon points="18,13 23,16.5 23,23.5 18,27 13,23.5 13,16.5" fill="none" stroke="#b0fff0" stroke-width="2"/>
            <line x1="18" y1="13" x2="18" y2="27" stroke="#b0fff0" stroke-width="1" opacity="0.55"/>
            <line x1="13" y1="16.5" x2="23" y2="23.5" stroke="#b0fff0" stroke-width="1" opacity="0.55"/>
            <line x1="23" y1="16.5" x2="13" y2="23.5" stroke="#b0fff0" stroke-width="1" opacity="0.55"/>`,
    },
    diamond: {
      bg: '#29b6f6', bevel: 'rgba(180,230,255,0.35)', stroke: '#0277bd',
      sym: `<polygon points="18,12 25,19 18,28 11,19" fill="#cceeff" stroke="rgba(255,255,255,0.5)" stroke-width="0.8"/>
            <polygon points="18,12 25,19 18,20 11,19" fill="rgba(255,255,255,0.45)"/>
            <line x1="11" y1="19" x2="25" y2="19" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/>`,
    },
    master: {
      bg: '#9575cd', bevel: 'rgba(210,180,255,0.3)', stroke: '#6a3faa',
      sym: `<path d="M10,27 L10,19 L14,23 L18,14 L22,23 L26,19 L26,27 Z" fill="#ede0ff" stroke="rgba(190,140,255,0.4)" stroke-width="0.8" stroke-linejoin="round"/>
            <circle cx="10.5" cy="18.5" r="1.5" fill="#f5f0ff"/>
            <circle cx="18" cy="13.5" r="1.8" fill="#fff"/>
            <circle cx="25.5" cy="18.5" r="1.5" fill="#f5f0ff"/>`,
    },
    grandmaster: {
      bg: '#e53935', bevel: 'rgba(255,150,150,0.25)', stroke: '#b71c1c',
      sym: `<line x1="18" y1="14" x2="18" y2="28" stroke="#fff0a0" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M13,15 Q12,20 16.5,20" fill="none" stroke="#fff0a0" stroke-width="2" stroke-linecap="round"/>
            <path d="M23,15 Q24,20 19.5,20" fill="none" stroke="#fff0a0" stroke-width="2" stroke-linecap="round"/>
            <line x1="13" y1="15" x2="13" y2="18.5" stroke="#fff0a0" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="23" y1="15" x2="23" y2="18.5" stroke="#fff0a0" stroke-width="2.5" stroke-linecap="round"/>`,
    },
    apex: {
      bg: '#f57c00', bevel: 'rgba(255,220,80,0.35)', stroke: '#bf360c',
      sym: `<polygon points="21,12 14,21 18.5,21 15,28 23,19 18.5,19" fill="#fff9e0" stroke="rgba(255,200,0,0.7)" stroke-width="0.6" stroke-linejoin="round"/>`,
    },
  };

  const d = D[tier] || D.bronze;
  const animClass = tier === 'apex' ? ' rank-badge-apex'
                  : tier === 'grandmaster' ? ' rank-badge-grandmaster'
                  : tier === 'master' ? ' rank-badge-master' : '';

  // Shield path + inner bevel + top-left highlight for depth
  return `<span class="rank-badge-svg${animClass}" title="${RANKED_CONFIG[tier]?.label || tier}"><svg xmlns="http://www.w3.org/2000/svg" width="36" height="40" viewBox="0 0 36 40">
    <path d="M18,2 L33,8 L33,21 Q33,36 18,41 Q3,36 3,21 L3,8 Z" fill="${d.bg}" stroke="${d.stroke}" stroke-width="1.5"/>
    <path d="M18,6 L28,11 L28,21 Q28,33 18,37 Q8,33 8,21 L8,11 Z" fill="${d.bevel}"/>
    <path d="M18,2 L33,8 L24,5 Z" fill="rgba(255,255,255,0.28)" opacity="0.8"/>
    ${d.sym}
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
  const badge = document.getElementById('rankedModeBadge');
  if (!badge) return;
  const cfg = getRankedConfig();
  const lbl = rankLabel(_rankedProfile.tier, _rankedProfile.division);
  badge.textContent = `${cfg.icon} ${lbl}`;
  badge.style.color = cfg.color;
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
