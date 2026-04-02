// js/game/ranked.js — Ranked Mode System

/* ── Tier definitions ────────────────────────────────────────── */
const RANKED_TIERS = ['bronze','silver','gold','platinum','diamond','master','grandmaster','apex','sovereign'];

const RANKED_CONFIG = {
  bronze: {
    label:'Bronze', icon:'🥉', color:'#cd7f32',
    hasDivisions:true, rpPerDiv:30,
    targetWaves:7, waveOffset:0,
    hpMult:0.6, speedMult:0.75,
    rpGainBase:20, rpLoss:4, rpPerWave:3, streakCap:0.10,
    enemyTypes:['normal'],
    miniBossInterval:0, bigBossInterval:0,
    desc:'Easy waves, weak enemies. Just getting started.',
  },
  silver: {
    label:'Silver', icon:'🥈', color:'#aaaacc',
    hasDivisions:true, rpPerDiv:50,
    targetWaves:8, waveOffset:0,
    hpMult:0.7, speedMult:0.8,
    rpGainBase:18, rpLoss:5, rpPerWave:3, streakCap:0.15,
    enemyTypes:['normal','fast'],
    miniBossInterval:0, bigBossInterval:0, lastWaveBoss:1,
    desc:'Faster enemies show up. Boss on the last wave.',
  },
  gold: {
    label:'Gold', icon:'🥇', color:'#ffd700',
    hasDivisions:true, rpPerDiv:50,
    targetWaves:10, waveOffset:0,
    hpMult:0.8, speedMult:0.85,
    rpGainBase:14, rpLoss:6, rpPerWave:2, streakCap:0.15,
    enemyTypes:['normal','fast','tank'],
    miniBossInterval:5, bigBossInterval:0,
    desc:'Tanks show up. Mini-boss every 5 waves.',
  },
  platinum: {
    label:'Platinum', icon:'💠', color:'#00e8c0',
    hasDivisions:true, rpPerDiv:70,
    targetWaves:12, waveOffset:0,
    hpMult:0.85, speedMult:0.9,
    rpGainBase:12, rpLoss:8, rpPerWave:2, streakCap:0.15,
    enemyTypes:['normal','fast','tank','shooter'],
    miniBossInterval:4, bigBossInterval:0,
    desc:'Shooters join. Mini-boss every 4 waves.',
  },
  diamond: {
    label:'Diamond', icon:'💎', color:'#4488FF',
    hasDivisions:true, rpPerDiv:200,
    targetWaves:14, waveOffset:0,
    hpMult:0.9, speedMult:0.9,
    rpGainBase:10, rpLoss:10, rpPerWave:2, streakCap:0.15,
    enemyTypes:['normal','fast','tank','shooter','enforcer'],
    miniBossInterval:4, bigBossInterval:14,
    desc:'Enforcers join. 200 RP per division. The real grind.',
  },
  master: {
    label:'Master', icon:'👑', color:'#AA33FF',
    hasDivisions:false, rpPerDiv:700,
    targetWaves:15, waveOffset:0,
    hpMult:0.95, speedMult:0.95,
    rpGainBase:10, rpLoss:12, rpPerWave:1, streakCap:0.20,
    enemyTypes:['normal','fast','tank','shooter','enforcer','splitter','bomber'],
    miniBossInterval:5, bigBossInterval:15,
    desc:'700 RP to promote. Splitters and bombers join.',
  },
  grandmaster: {
    label:'Grandmaster', icon:'🔱', color:'#ef5350',
    hasDivisions:false, rpPerDiv:900,
    targetWaves:16, waveOffset:0,
    hpMult:1.0, speedMult:1.0,
    rpGainBase:10, rpLoss:14, rpPerWave:1, streakCap:0.20,
    enemyTypes:['normal','fast','tank','shooter','enforcer','splitter','bomber','phantom'],
    miniBossInterval:4, bigBossInterval:16,
    desc:'900 RP to hit Apex. Phantoms now in the mix.',
  },
  apex: {
    label:'Apex', icon:'⚡', color:'#ff9800',
    hasDivisions:false, rpPerDiv:null,
    targetWaves:16, waveOffset:0,
    hpMult:1.05, speedMult:1.0,
    rpGainBase:12, rpLoss:16, rpPerWave:1, streakCap:0.25,
    enemyTypes:['normal','fast','tank','shooter','enforcer','splitter','bomber','phantom'],
    miniBossInterval:4, bigBossInterval:16,
    desc:'Top players. Every enemy type. The grind is real.',
  },
  sovereign: {
    label:'Sovereign', icon:'♛', color:'#ffffff',
    hasDivisions:false, rpPerDiv:null,
    targetWaves:16, waveOffset:0,
    hpMult:1.05, speedMult:1.0,
    rpGainBase:14, rpLoss:18, rpPerWave:1, streakCap:0.25,
    enemyTypes:['normal','fast','tank','shooter','enforcer','splitter','bomber','phantom'],
    miniBossInterval:4, bigBossInterval:16,
    desc:'The #1 player. You own this leaderboard.',
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

/* ── Rank badge SVG icons (Tactical Edition) ────────────────── */
// Full tactical shield badges with metallic gradients, glows, and per-tier symbols.
// Division roman numeral shown below badge for Bronze–Diamond.
// Apex has CSS-animated rotating ring; Sovereign has dual counter-rotating rings + shimmer.
function rankBadgeSvg(tier, division) {
  const divRoman = { 1:'I', 2:'II', 3:'III', 4:'IV', 5:'V' };
  const hasDivs  = ['bronze','silver','gold','platinum','diamond'].includes(tier);
  const div      = hasDivs && division ? (divRoman[division] || '') : '';
  const label    = RANKED_CONFIG[tier]?.label || tier;
  const uid      = `rb-${tier}-${Math.random().toString(36).slice(2,7)}`;

  const badges = {
    bronze: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
      <defs>
        <linearGradient id="${uid}-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#2a1a0a"/><stop offset="100%" stop-color="#1a0f05"/></linearGradient>
        <linearGradient id="${uid}-sh" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#e8905a"/><stop offset="50%" stop-color="#cd7f32"/><stop offset="100%" stop-color="#8b4a10"/></linearGradient>
        <linearGradient id="${uid}-hi" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="rgba(255,200,140,0.5)"/><stop offset="100%" stop-color="transparent"/></linearGradient>
        <filter id="${uid}-gl"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M50 6 L82 18 L82 52 Q82 74 50 94 Q18 74 18 52 L18 18 Z" fill="url(#${uid}-bg)" stroke="url(#${uid}-sh)" stroke-width="2"/>
      <path d="M50 14 L74 24 L74 52 Q74 68 50 83 Q26 68 26 52 L26 24 Z" fill="none" stroke="url(#${uid}-sh)" stroke-width="1" opacity="0.4"/>
      <path d="M36 56 L50 44 L64 56" fill="none" stroke="url(#${uid}-sh)" stroke-width="3.5" stroke-linecap="square" filter="url(#${uid}-gl)"/>
      <rect x="18" y="18" width="5" height="2" fill="#cd7f32" opacity="0.7"/><rect x="18" y="18" width="2" height="5" fill="#cd7f32" opacity="0.7"/>
      <rect x="77" y="18" width="5" height="2" fill="#cd7f32" opacity="0.7"/><rect x="80" y="18" width="2" height="5" fill="#cd7f32" opacity="0.7"/>
      <path d="M50 6 L82 18 L82 30 Q66 14 50 14 Q34 14 18 30 L18 18 Z" fill="url(#${uid}-hi)" opacity="0.3"/>
      <circle cx="44" cy="64" r="2.5" fill="#cd7f32" opacity="0.8"/><circle cx="50" cy="66" r="2.5" fill="#cd7f32" opacity="0.8"/><circle cx="56" cy="64" r="2.5" fill="#cd7f32" opacity="0.8"/>
    </svg>`,

    silver: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
      <defs>
        <linearGradient id="${uid}-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#161c24"/><stop offset="100%" stop-color="#0d1018"/></linearGradient>
        <linearGradient id="${uid}-sh" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#e0e8f0"/><stop offset="50%" stop-color="#a8b8cc"/><stop offset="100%" stop-color="#607080"/></linearGradient>
        <filter id="${uid}-gl"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M50 6 L82 18 L82 52 Q82 74 50 94 Q18 74 18 52 L18 18 Z" fill="url(#${uid}-bg)" stroke="url(#${uid}-sh)" stroke-width="2"/>
      <path d="M50 14 L74 24 L74 52 Q74 68 50 83 Q26 68 26 52 L26 24 Z" fill="none" stroke="url(#${uid}-sh)" stroke-width="1" opacity="0.35"/>
      <path d="M36 60 L50 48 L64 60" fill="none" stroke="url(#${uid}-sh)" stroke-width="3" stroke-linecap="square" filter="url(#${uid}-gl)"/>
      <path d="M36 51 L50 39 L64 51" fill="none" stroke="url(#${uid}-sh)" stroke-width="3" stroke-linecap="square" filter="url(#${uid}-gl)" opacity="0.6"/>
      <rect x="18" y="18" width="5" height="2" fill="#a8b8cc" opacity="0.7"/><rect x="18" y="18" width="2" height="5" fill="#a8b8cc" opacity="0.7"/>
      <rect x="77" y="18" width="5" height="2" fill="#a8b8cc" opacity="0.7"/><rect x="80" y="18" width="2" height="5" fill="#a8b8cc" opacity="0.7"/>
      <path d="M50 6 L82 18 L82 30 Q66 14 50 14 Q34 14 18 30 L18 18 Z" fill="rgba(220,240,255,0.2)" opacity="0.4"/>
      <circle cx="44" cy="68" r="2" fill="#a8b8cc" opacity="0.8"/><circle cx="50" cy="70" r="2" fill="#a8b8cc" opacity="0.8"/><circle cx="56" cy="68" r="2" fill="#a8b8cc" opacity="0.8"/>
    </svg>`,

    gold: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
      <defs>
        <linearGradient id="${uid}-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1e1600"/><stop offset="100%" stop-color="#120e00"/></linearGradient>
        <linearGradient id="${uid}-sh" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fff0a0"/><stop offset="40%" stop-color="#ffd040"/><stop offset="100%" stop-color="#a06800"/></linearGradient>
        <filter id="${uid}-gl"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M50 6 L82 18 L82 52 Q82 74 50 94 Q18 74 18 52 L18 18 Z" fill="url(#${uid}-bg)" stroke="url(#${uid}-sh)" stroke-width="2"/>
      <path d="M50 14 L74 24 L74 52 Q74 68 50 83 Q26 68 26 52 L26 24 Z" fill="none" stroke="url(#${uid}-sh)" stroke-width="1" opacity="0.3"/>
      <path d="M36 62 L50 50 L64 62" fill="none" stroke="url(#${uid}-sh)" stroke-width="3" stroke-linecap="square" filter="url(#${uid}-gl)"/>
      <path d="M36 53 L50 41 L64 53" fill="none" stroke="url(#${uid}-sh)" stroke-width="3" stroke-linecap="square" filter="url(#${uid}-gl)" opacity="0.75"/>
      <path d="M36 44 L50 32 L64 44" fill="none" stroke="url(#${uid}-sh)" stroke-width="3" stroke-linecap="square" filter="url(#${uid}-gl)" opacity="0.5"/>
      <rect x="18" y="18" width="6" height="2" fill="#ffd040" opacity="0.8"/><rect x="18" y="18" width="2" height="6" fill="#ffd040" opacity="0.8"/>
      <rect x="76" y="18" width="6" height="2" fill="#ffd040" opacity="0.8"/><rect x="80" y="18" width="2" height="6" fill="#ffd040" opacity="0.8"/>
      <path d="M50 6 L82 18 L82 28 Q66 12 50 12 Q34 12 18 28 L18 18 Z" fill="rgba(255,240,120,0.15)" opacity="0.5"/>
      <polygon points="50,70 52,76 58,76 53,80 55,86 50,82 45,86 47,80 42,76 48,76" fill="#ffd040" opacity="0.9" filter="url(#${uid}-gl)" transform="scale(0.7) translate(21.5,26)"/>
    </svg>`,

    platinum: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
      <defs>
        <linearGradient id="${uid}-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#001a18"/><stop offset="100%" stop-color="#000e0d"/></linearGradient>
        <linearGradient id="${uid}-sh" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#80ffee"/><stop offset="50%" stop-color="#00e8c0"/><stop offset="100%" stop-color="#007060"/></linearGradient>
        <filter id="${uid}-gl"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M50 5 L84 22 L84 55 Q84 76 50 95 Q16 76 16 55 L16 22 Z" fill="url(#${uid}-bg)" stroke="url(#${uid}-sh)" stroke-width="2"/>
      <path d="M50 14 L76 26 L76 54 Q76 70 50 84 Q24 70 24 54 L24 26 Z" fill="none" stroke="url(#${uid}-sh)" stroke-width="1" opacity="0.4"/>
      <line x1="50" y1="25" x2="50" y2="72" stroke="url(#${uid}-sh)" stroke-width="1.5" opacity="0.3"/>
      <line x1="28" y1="48" x2="72" y2="48" stroke="url(#${uid}-sh)" stroke-width="1.5" opacity="0.3"/>
      <polygon points="50,30 62,48 50,66 38,48" fill="none" stroke="url(#${uid}-sh)" stroke-width="2" filter="url(#${uid}-gl)"/>
      <polygon points="50,37 57,48 50,59 43,48" fill="rgba(0,232,192,0.15)" stroke="url(#${uid}-sh)" stroke-width="1"/>
      <rect x="16" y="22" width="6" height="2" fill="#00e8c0"/><rect x="16" y="22" width="2" height="6" fill="#00e8c0"/>
      <rect x="78" y="22" width="6" height="2" fill="#00e8c0"/><rect x="82" y="22" width="2" height="6" fill="#00e8c0"/>
      <circle cx="50" cy="48" r="3" fill="#00e8c0" filter="url(#${uid}-gl)"/>
    </svg>`,

    diamond: `<svg viewBox="0 0 80 92" xmlns="http://www.w3.org/2000/svg" width="44" height="50">
      <defs>
        <linearGradient id="${uid}-body" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1A2A4A"/><stop offset="50%" stop-color="#0A1428"/><stop offset="100%" stop-color="#050A18"/></linearGradient>
        <linearGradient id="${uid}-gem" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#AADDFF" stop-opacity="0.9"/><stop offset="50%" stop-color="#4499FF" stop-opacity="0.5"/><stop offset="100%" stop-color="#0044BB" stop-opacity="0.9"/></linearGradient>
        <linearGradient id="${uid}-bar" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#0044BB" stop-opacity="0"/><stop offset="50%" stop-color="#4488FF" stop-opacity="0.8"/><stop offset="100%" stop-color="#0044BB" stop-opacity="0"/></linearGradient>
        <radialGradient id="${uid}-aura" cx="50%" cy="45%" r="50%"><stop offset="0%" stop-color="#2255FF" stop-opacity="0.2"/><stop offset="100%" stop-color="#2255FF" stop-opacity="0"/></radialGradient>
        <filter id="${uid}-sh"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#1060FF" flood-opacity="0.4"/></filter>
        <filter id="${uid}-gl"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="${uid}-gl2"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M40 3 L64 10 L76 26 L76 52 Q74 74 55 84 L40 89 L25 84 Q6 74 4 52 L4 26 L16 10 Z" fill="url(#${uid}-body)" filter="url(#${uid}-sh)"/>
      <path d="M40 3 L64 10 L76 26 L76 52 Q74 74 55 84 L40 89 L25 84 Q6 74 4 52 L4 26 L16 10 Z" fill="url(#${uid}-aura)"/>
      <path d="M40 3 L64 10 L76 26 L76 52 Q74 74 55 84 L40 89 L25 84 Q6 74 4 52 L4 26 L16 10 Z" fill="none" stroke="#2060D0" stroke-width="1.5" opacity="0.7"/>
      <path d="M40 10 L59 16 L68 28 L68 51 Q66 69 50 78 L40 82 L30 78 Q14 69 12 51 L12 28 L21 16 Z" fill="none" stroke="#3366CC" stroke-width="0.8" opacity="0.45"/>
      <path d="M16 10 L22 10 L16 18" fill="none" stroke="#4488FF" stroke-width="1.5"/><path d="M64 10 L58 10 L64 18" fill="none" stroke="#4488FF" stroke-width="1.5"/>
      <path d="M4 40 L4 34 L10 34" fill="none" stroke="#4488FF" stroke-width="1.5"/><path d="M76 40 L76 34 L70 34" fill="none" stroke="#4488FF" stroke-width="1.5"/>
      <path d="M8 50 L14 50 L18 54 L24 54" fill="none" stroke="#3366CC" stroke-width="0.9" stroke-linecap="round" opacity="0.5"/>
      <path d="M72 50 L66 50 L62 54 L56 54" fill="none" stroke="#3366CC" stroke-width="0.9" stroke-linecap="round" opacity="0.5"/>
      <polygon points="40,17 52,26 40,28 28,26" fill="#88BBFF" opacity="0.9"/>
      <polygon points="52,26 56,38 44,36 40,28" fill="#4488FF" opacity="0.85"/>
      <polygon points="28,26 24,38 36,36 40,28" fill="#88CCFF" opacity="0.9"/>
      <polygon points="56,38 40,55 44,36" fill="#2255CC" opacity="0.9"/>
      <polygon points="24,38 40,55 36,36" fill="#5599FF" opacity="0.75"/>
      <polygon points="40,28 44,36 40,55 36,36" fill="url(#${uid}-gem)"/>
      <polygon points="40,17 52,26 56,38 40,55 24,38 28,26" fill="none" stroke="#88DDFF" stroke-width="1.2" opacity="0.9" filter="url(#${uid}-gl)"/>
      <circle cx="40" cy="33" r="2" fill="white" opacity="0.95" filter="url(#${uid}-gl2)"/>
      <line x1="40" y1="30" x2="40" y2="27" stroke="white" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
      <line x1="40" y1="36" x2="40" y2="39" stroke="white" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
      <line x1="37" y1="33" x2="34" y2="33" stroke="white" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
      <line x1="43" y1="33" x2="46" y2="33" stroke="white" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
      <rect x="16" y="60" width="48" height="1" fill="url(#${uid}-bar)" rx="0.5"/>
      <circle cx="28" cy="76" r="2.2" fill="#2255AA" filter="url(#${uid}-gl)"/><circle cx="34" cy="78" r="2.5" fill="#3366CC" filter="url(#${uid}-gl)"/>
      <circle cx="40" cy="79" r="3" fill="#5588FF" filter="url(#${uid}-gl2)"/>
      <circle cx="46" cy="78" r="2.5" fill="#3366CC" filter="url(#${uid}-gl)"/><circle cx="52" cy="76" r="2.2" fill="#2255AA" filter="url(#${uid}-gl)"/>
    </svg>`,

    master: `<svg viewBox="0 0 80 92" xmlns="http://www.w3.org/2000/svg" width="44" height="50">
      <defs>
        <linearGradient id="${uid}-body" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#2A0A3A"/><stop offset="50%" stop-color="#180525"/><stop offset="100%" stop-color="#0A0115"/></linearGradient>
        <linearGradient id="${uid}-orb" x1="20%" y1="0%" x2="80%" y2="100%"><stop offset="0%" stop-color="#CC44FF"/><stop offset="50%" stop-color="#8800CC"/><stop offset="100%" stop-color="#440066"/></linearGradient>
        <linearGradient id="${uid}-crown" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#DD77FF"/><stop offset="50%" stop-color="#9922CC"/><stop offset="100%" stop-color="#660099"/></linearGradient>
        <linearGradient id="${uid}-bar" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#7700CC" stop-opacity="0"/><stop offset="50%" stop-color="#AA33FF" stop-opacity="0.8"/><stop offset="100%" stop-color="#7700CC" stop-opacity="0"/></linearGradient>
        <radialGradient id="${uid}-aura" cx="50%" cy="45%" r="50%"><stop offset="0%" stop-color="#6600AA" stop-opacity="0.25"/><stop offset="100%" stop-color="#6600AA" stop-opacity="0"/></radialGradient>
        <filter id="${uid}-sh"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#8800CC" flood-opacity="0.4"/></filter>
        <filter id="${uid}-gl"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M40 3 L50 10 L58 6 L60 14 L68 10 L70 20 L76 24 L76 54 Q74 76 55 85 L40 89 L25 85 Q6 76 4 54 L4 24 L10 20 L12 10 L20 14 L22 6 L30 10 Z" fill="url(#${uid}-body)" filter="url(#${uid}-sh)"/>
      <path d="M40 3 L50 10 L58 6 L60 14 L68 10 L70 20 L76 24 L76 54 Q74 76 55 85 L40 89 L25 85 Q6 76 4 54 L4 24 L10 20 L12 10 L20 14 L22 6 L30 10 Z" fill="url(#${uid}-aura)"/>
      <path d="M40 3 L50 10 L58 6 L60 14 L68 10 L70 20 L76 24 L76 54 Q74 76 55 85 L40 89 L25 85 Q6 76 4 54 L4 24 L10 20 L12 10 L20 14 L22 6 L30 10 Z" fill="none" stroke="#9922DD" stroke-width="1.5" opacity="0.7"/>
      <path d="M10 20 L70 20 L76 24 L4 24 Z" fill="#1A0030" opacity="0.5"/>
      <path d="M22 6 L30 10 L40 3 L50 10 L58 6 L60 14 L68 10 L70 20 L10 20 L12 10 L20 14 Z" fill="url(#${uid}-crown)" opacity="0.25"/>
      <path d="M22 6 L30 10 L40 3 L50 10 L58 6 L60 14 L68 10 L70 20 L10 20 L12 10 L20 14 Z" fill="none" stroke="#CC44FF" stroke-width="1.2" opacity="0.7"/>
      <circle cx="40" cy="4" r="2.2" fill="#EE88FF" filter="url(#${uid}-gl)"/><circle cx="22" cy="7" r="1.6" fill="#CC55EE" filter="url(#${uid}-gl)"/><circle cx="58" cy="7" r="1.6" fill="#CC55EE" filter="url(#${uid}-gl)"/>
      <path d="M40 22 L60 30 L66 40 L66 54 Q64 70 48 79 L40 82 L32 79 Q16 70 14 54 L14 40 L20 30 Z" fill="none" stroke="#7711BB" stroke-width="0.8" opacity="0.5"/>
      <path d="M14 35 L20 35 L24 31 L32 31" fill="none" stroke="#AA33FF" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
      <path d="M66 35 L60 35 L56 31 L48 31" fill="none" stroke="#AA33FF" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
      <circle cx="40" cy="42" r="17" fill="none" stroke="#AA33FF" stroke-width="0.6" opacity="0.2"/>
      <circle cx="40" cy="42" r="14" fill="none" stroke="#AA33FF" stroke-width="0.8" opacity="0.3"/>
      <circle cx="40" cy="42" r="11" fill="url(#${uid}-orb)" filter="url(#${uid}-gl)"/>
      <circle cx="40" cy="42" r="11" fill="none" stroke="#DD66FF" stroke-width="1.2" opacity="0.8"/>
      <path d="M33 46 L36 37 L40 43 L44 37 L47 46" fill="none" stroke="#EECCFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="37" cy="39" r="3.5" fill="white" opacity="0.12"/><circle cx="36" cy="38" r="1.2" fill="white" opacity="0.2"/>
      <rect x="16" y="60" width="48" height="1" fill="url(#${uid}-bar)" rx="0.5"/>
      <circle cx="25" cy="76" r="2" fill="#550088" filter="url(#${uid}-gl)"/><circle cx="31" cy="78" r="2.2" fill="#7700AA" filter="url(#${uid}-gl)"/>
      <circle cx="37" cy="79" r="2.5" fill="#AA33FF" filter="url(#${uid}-gl)"/><circle cx="43" cy="79" r="2.5" fill="#AA33FF" filter="url(#${uid}-gl)"/>
      <circle cx="49" cy="78" r="2.2" fill="#7700AA" filter="url(#${uid}-gl)"/><circle cx="55" cy="76" r="2" fill="#550088" filter="url(#${uid}-gl)"/>
    </svg>`,

    grandmaster: `<svg viewBox="0 0 80 92" xmlns="http://www.w3.org/2000/svg" width="44" height="50">
      <defs>
        <linearGradient id="${uid}-body" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#2A0608"/><stop offset="50%" stop-color="#150203"/><stop offset="100%" stop-color="#0A0000"/></linearGradient>
        <linearGradient id="${uid}-gold" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFD060"/><stop offset="50%" stop-color="#C07A00"/><stop offset="100%" stop-color="#8A4A00"/></linearGradient>
        <linearGradient id="${uid}-red" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FF4444"/><stop offset="60%" stop-color="#CC0000"/><stop offset="100%" stop-color="#880000"/></linearGradient>
        <filter id="${uid}-sh"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#CC0000" flood-opacity="0.35"/></filter>
        <filter id="${uid}-gl"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M40 2 L52 7 L60 4 L64 12 L74 14 L76 24 L78 54 Q76 78 56 86 L40 90 L24 86 Q4 78 2 54 L4 24 L6 14 L16 12 L20 4 L28 7 Z" fill="url(#${uid}-body)" filter="url(#${uid}-sh)"/>
      <path d="M40 2 L52 7 L60 4 L64 12 L74 14 L76 24 L78 54 Q76 78 56 86 L40 90 L24 86 Q4 78 2 54 L4 24 L6 14 L16 12 L20 4 L28 7 Z" fill="none" stroke="url(#${uid}-gold)" stroke-width="1.8" opacity="0.85"/>
      <path d="M40 12 L54 18 L62 22 L62 50 Q60 68 44 78 L40 80 L36 78 Q20 68 18 50 L18 22 L26 18 Z" fill="#180000" stroke="#AA2200" stroke-width="1" opacity="0.7"/>
      <path d="M14 30 Q8 26 10 20 Q14 22 16 28" fill="none" stroke="#C07A00" stroke-width="1.5"/><path d="M12 38 Q4 34 6 26 Q11 28 13 36" fill="none" stroke="#C07A00" stroke-width="1.5"/>
      <path d="M14 46 Q6 44 8 36 Q13 38 14 45" fill="none" stroke="#C07A00" stroke-width="1.3"/>
      <path d="M66 30 Q72 26 70 20 Q66 22 64 28" fill="none" stroke="#C07A00" stroke-width="1.5"/><path d="M68 38 Q76 34 74 26 Q69 28 67 36" fill="none" stroke="#C07A00" stroke-width="1.5"/>
      <path d="M66 46 Q74 44 72 36 Q67 38 66 45" fill="none" stroke="#C07A00" stroke-width="1.3"/>
      <path d="M26 18 L26 12 L31 16 L36 10 L40 14 L44 10 L49 16 L54 12 L54 18 Z" fill="url(#${uid}-gold)"/>
      <circle cx="31" cy="13" r="2" fill="#FFE080"/><circle cx="40" cy="11" r="2.5" fill="#FFE880"/><circle cx="49" cy="13" r="2" fill="#FFE080"/>
      <path d="M40 22 L43 30 L51 28 L45 35 L49 43 L40 39 L31 43 L35 35 L29 28 L37 30 Z" fill="url(#${uid}-red)" filter="url(#${uid}-gl)"/>
      <path d="M40 22 L43 30 L51 28 L45 35 L49 43 L40 39 L31 43 L35 35 L29 28 L37 30 Z" fill="none" stroke="#FF8888" stroke-width="0.8" opacity="0.6"/>
      <circle cx="40" cy="34" r="5" fill="#FF2222" opacity="0.9"/><circle cx="40" cy="34" r="3" fill="#FF8888"/><circle cx="40" cy="34" r="1.5" fill="#FFDDDD"/>
      <circle cx="22" cy="73" r="2" fill="#660000"/><circle cx="28" cy="75" r="2.2" fill="#880000"/><circle cx="34" cy="77" r="2.5" fill="#CC0000"/>
      <circle cx="40" cy="77.5" r="3" fill="#FF3300"/><circle cx="46" cy="77" r="2.5" fill="#CC0000"/><circle cx="52" cy="75" r="2.2" fill="#880000"/><circle cx="58" cy="73" r="2" fill="#660000"/>
    </svg>`,

    apex: `<svg viewBox="0 0 80 92" xmlns="http://www.w3.org/2000/svg" width="44" height="50">
      <defs>
        <linearGradient id="${uid}-body" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#100800"/><stop offset="50%" stop-color="#080400"/><stop offset="100%" stop-color="#030100"/></linearGradient>
        <linearGradient id="${uid}-fire" x1="50%" y1="0%" x2="50%" y2="100%"><stop offset="0%" stop-color="#FFF0A0"/><stop offset="30%" stop-color="#FFAA00"/><stop offset="70%" stop-color="#FF5500"/><stop offset="100%" stop-color="#CC1100"/></linearGradient>
        <linearGradient id="${uid}-edge" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFE060"/><stop offset="50%" stop-color="#FF8800"/><stop offset="100%" stop-color="#FF4400"/></linearGradient>
        <linearGradient id="${uid}-crown" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFE060"/><stop offset="60%" stop-color="#FF8800"/><stop offset="100%" stop-color="#CC4400"/></linearGradient>
        <linearGradient id="${uid}-bar" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#FF6600" stop-opacity="0"/><stop offset="50%" stop-color="#FF9900" stop-opacity="0.9"/><stop offset="100%" stop-color="#FF6600" stop-opacity="0"/></linearGradient>
        <radialGradient id="${uid}-aura" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#FF9900" stop-opacity="0.35"/><stop offset="100%" stop-color="#FF9900" stop-opacity="0"/></radialGradient>
        <radialGradient id="${uid}-eg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#FF6600" stop-opacity="0.3"/><stop offset="100%" stop-color="#FF6600" stop-opacity="0"/></radialGradient>
        <filter id="${uid}-sh"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#FF8800" flood-opacity="0.4"/></filter>
        <filter id="${uid}-gl"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="${uid}-gl2"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <ellipse cx="40" cy="48" rx="34" ry="40" fill="url(#${uid}-aura)"/>
      <g class="rank-apex-ring">
        <circle cx="40" cy="46" r="36" fill="none" stroke="#FF6600" stroke-width="0.5" stroke-dasharray="3 6" opacity="0.5"/>
        <path d="M40 10 L42 14 L40 18 L38 14 Z" fill="#FF9900" opacity="0.7"/><path d="M65 21 L67 25 L65 29 L63 25 Z" fill="#FF9900" opacity="0.5"/>
        <path d="M74 46 L76 50 L74 54 L72 50 Z" fill="#FF9900" opacity="0.7"/><path d="M65 71 L67 75 L65 79 L63 75 Z" fill="#FF9900" opacity="0.5"/>
        <path d="M40 80 L42 84 L40 88 L38 84 Z" fill="#FF9900" opacity="0.4"/><path d="M15 71 L17 75 L15 79 L13 75 Z" fill="#FF9900" opacity="0.5"/>
        <path d="M6 46 L8 50 L6 54 L4 50 Z" fill="#FF9900" opacity="0.7"/><path d="M15 21 L17 25 L15 29 L13 25 Z" fill="#FF9900" opacity="0.5"/>
      </g>
      <path d="M40 4 L48 8 L56 4 L62 10 L70 8 L74 18 L78 28 L76 56 Q72 78 56 86 L40 90 L24 86 Q8 78 4 56 L2 28 L6 18 L10 8 L18 4 L24 8 Z" fill="url(#${uid}-body)" filter="url(#${uid}-sh)"/>
      <path d="M40 4 L48 8 L56 4 L62 10 L70 8 L74 18 L78 28 L76 56 Q72 78 56 86 L40 90 L24 86 Q8 78 4 56 L2 28 L6 18 L10 8 L18 4 L24 8 Z" fill="none" stroke="url(#${uid}-edge)" stroke-width="2" opacity="0.9"/>
      <path d="M40 14 L55 20 L64 28 L64 54 Q62 72 46 80 L40 82 L34 80 Q18 72 16 54 L16 28 L25 20 Z" fill="none" stroke="#FF6600" stroke-width="1" opacity="0.65"/>
      <path d="M2 28 L-2 20 L6 24 Z" fill="url(#${uid}-edge)" opacity="0.6"/><path d="M78 28 L82 20 L74 24 Z" fill="url(#${uid}-edge)" opacity="0.6"/>
      <path d="M6 18 L74 18 L78 28 L2 28 Z" fill="#1A0800" opacity="0.5"/>
      <path d="M24 8 L28 13 L32 7 L36 13 L40 6 L44 13 L48 7 L52 13 L56 8" fill="none" stroke="url(#${uid}-crown)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
      <circle cx="40" cy="6" r="2.5" fill="#FFF080" filter="url(#${uid}-gl2)"/><circle cx="32" cy="7" r="1.8" fill="#FFCC00" filter="url(#${uid}-gl)"/><circle cx="48" cy="7" r="1.8" fill="#FFCC00" filter="url(#${uid}-gl)"/>
      <path d="M36 28 Q38 18 40 14 Q42 18 44 28 Q42 24 40 26 Q38 24 36 28 Z" fill="#FF8800" opacity="0.35" filter="url(#${uid}-gl)"/>
      <path d="M36 28 Q38 18 40 14 Q42 18 44 28" fill="none" stroke="#FFD700" stroke-width="1.8" opacity="0.75"/>
      <ellipse cx="40" cy="40" rx="16" ry="16" fill="url(#${uid}-eg)"/>
      <path d="M40 24 L53 52 L27 52 Z" fill="#2A0A00" stroke="url(#${uid}-fire)" stroke-width="1.5" opacity="0.75"/>
      <path d="M40 28 L49 50 L31 50" fill="none" stroke="url(#${uid}-fire)" stroke-width="2.5" stroke-linejoin="round" filter="url(#${uid}-gl)"/>
      <line x1="34" y1="43" x2="46" y2="43" stroke="url(#${uid}-fire)" stroke-width="2.5" stroke-linecap="round" filter="url(#${uid}-gl)"/>
      <circle cx="40" cy="28" r="1.5" fill="#FFF0A0" opacity="0.9" filter="url(#${uid}-gl2)"/>
      <circle cx="40" cy="40" r="18" fill="none" stroke="#FF6600" stroke-width="0.8" opacity="0.2" class="rank-apex-pulse"/>
      <circle cx="40" cy="40" r="13" fill="none" stroke="#FF8800" stroke-width="0.5" opacity="0.3" class="rank-apex-pulse"/>
      <rect x="16" y="59" width="48" height="1" fill="url(#${uid}-bar)" rx="0.5"/>
      <text x="40" y="68" text-anchor="middle" font-family="monospace" font-size="6" fill="#FF9900" letter-spacing="1" opacity="0.9">TOP 100</text>
      <circle cx="16" cy="76" r="1.8" fill="#882200" filter="url(#${uid}-gl)"/><circle cx="22" cy="77.5" r="2" fill="#AA3300" filter="url(#${uid}-gl)"/>
      <circle cx="28" cy="78.5" r="2.2" fill="#CC4400" filter="url(#${uid}-gl)"/><circle cx="34" cy="79.5" r="2.5" fill="#FF6600" filter="url(#${uid}-gl)"/>
      <circle cx="40" cy="80" r="3" fill="#FF9900" filter="url(#${uid}-gl2)"/>
      <circle cx="46" cy="79.5" r="2.5" fill="#FF6600" filter="url(#${uid}-gl)"/><circle cx="52" cy="78.5" r="2.2" fill="#CC4400" filter="url(#${uid}-gl)"/>
      <circle cx="58" cy="77.5" r="2" fill="#AA3300" filter="url(#${uid}-gl)"/><circle cx="64" cy="76" r="1.8" fill="#882200" filter="url(#${uid}-gl)"/>
    </svg>`,

    sovereign: `<svg viewBox="-22 -20 124 132" xmlns="http://www.w3.org/2000/svg" width="68" height="73">
<defs>
<linearGradient id="${uid}-gb" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1e1e1e"/><stop offset="55%" stop-color="#080808"/><stop offset="100%" stop-color="#000"/></linearGradient>
<linearGradient id="${uid}-ge" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fff"/><stop offset="38%" stop-color="#d4d4d4"/><stop offset="100%" stop-color="#666"/></linearGradient>
<linearGradient id="${uid}-gc" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#fff"/><stop offset="45%" stop-color="#ddd"/><stop offset="100%" stop-color="#888"/></linearGradient>
<linearGradient id="${uid}-gp" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#161616"/><stop offset="100%" stop-color="#040404"/></linearGradient>
<radialGradient id="${uid}-ga" cx="50%" cy="42%" r="55%"><stop offset="0%" stop-color="#fff" stop-opacity=".2"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="${uid}-gbar" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="50%" stop-color="#fff" stop-opacity=".9"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="${uid}-gn" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#fff"/><stop offset="50%" stop-color="#d0d0d0"/><stop offset="100%" stop-color="#999"/></linearGradient>
<linearGradient id="${uid}-gsw" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="50%" stop-color="#fff" stop-opacity=".5"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="${uid}-ggem" cx="32%" cy="28%" r="72%"><stop offset="0%" stop-color="#fff"/><stop offset="55%" stop-color="#ccc"/><stop offset="100%" stop-color="#777"/></radialGradient>
<filter id="${uid}-fs"><feDropShadow dx="0" dy="1" stdDeviation="2.5" flood-color="#fff" flood-opacity=".42"/></filter>
<filter id="${uid}-fg1"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="${uid}-fg2"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="${uid}-fg3"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<clipPath id="${uid}-sc"><path d="M40 4 L50 10 L58 6 L62 13 L70 9 L74 19 L78 30 L76 57 Q72 79,56 87 L40 91 L24 87 Q8 79,4 57 L2 30 L6 19 L10 9 L18 6 L22 13 L30 10 Z"/></clipPath>
<clipPath id="${uid}-mc"><circle cx="40" cy="50" r="17"/></clipPath>
</defs>
<ellipse cx="40" cy="46" rx="38" ry="44" fill="url(#${uid}-ga)" class="rank-sov-p"/>
<g><animateTransform attributeName="transform" type="rotate" from="0 40 46" to="360 40 46" dur="18s" repeatCount="indefinite"/>
<circle cx="40" cy="46" r="56" fill="none" stroke="#fff" stroke-width="1.1" stroke-dasharray="3 7" opacity=".72"/>
<polygon points="40,-10 79.6,6.4 96,46 79.6,85.6 40,102 0.4,85.6 -16,46 0.4,6.4" fill="none" stroke="#fff" stroke-width=".65" opacity=".35"/>
<path d="M38,-10 L40,-13 L42,-10 L40,-7Z" fill="#fff" opacity=".95" filter="url(#${uid}-fg1)"/>
<path d="M77.6,4.4 L80.1,1.9 L82.6,4.4 L80.1,6.9Z" fill="#fff" opacity=".82" filter="url(#${uid}-fg1)"/>
<path d="M93.5,44 L96,41.5 L98.5,44 L96,46.5Z" fill="#fff" opacity=".9" filter="url(#${uid}-fg1)"/>
<path d="M77.6,85.6 L80.1,83.1 L82.6,85.6 L80.1,88.1Z" fill="#fff" opacity=".75"/>
<path d="M38,102 L40,99.5 L42,102 L40,104.5Z" fill="#fff" opacity=".55"/>
<path d="M-2.6,85.6 L-0.1,83.1 L2.4,85.6 L-0.1,88.1Z" fill="#fff" opacity=".75"/>
<path d="M-18.5,44 L-16,41.5 L-13.5,44 L-16,46.5Z" fill="#fff" opacity=".9" filter="url(#${uid}-fg1)"/>
<path d="M-2.6,4.4 L-0.1,1.9 L2.4,4.4 L-0.1,6.9Z" fill="#fff" opacity=".82" filter="url(#${uid}-fg1)"/>
</g>
<g><animateTransform attributeName="transform" type="rotate" from="0 40 46" to="-360 40 46" dur="11s" repeatCount="indefinite"/>
<circle cx="40" cy="46" r="48" fill="none" stroke="#ccc" stroke-width=".95" stroke-dasharray="2 5.5" opacity=".62"/>
<line x1="40" y1="-4.5" x2="40" y2="0.5" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".88"/>
<line x1="65.25" y1="2.3" x2="62.75" y2="6.62" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".78"/>
<line x1="83.7" y1="20.75" x2="79.4" y2="23.25" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".78"/>
<line x1="90.5" y1="46" x2="85.5" y2="46" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".88"/>
<line x1="83.7" y1="71.25" x2="79.4" y2="68.75" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".78"/>
<line x1="65.25" y1="89.7" x2="62.75" y2="85.38" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".68"/>
<line x1="40" y1="96.5" x2="40" y2="91.5" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".62"/>
<line x1="14.75" y1="89.7" x2="17.25" y2="85.38" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".68"/>
<line x1="-3.7" y1="71.25" x2="0.6" y2="68.75" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".78"/>
<line x1="-10.5" y1="46" x2="-5.5" y2="46" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".88"/>
<line x1="-3.7" y1="20.75" x2="0.6" y2="23.25" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".78"/>
<line x1="14.75" y1="2.3" x2="17.25" y2="6.62" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".78"/>
</g>
<g><animateTransform attributeName="transform" type="rotate" from="0 40 46" to="360 40 46" dur="7s" repeatCount="indefinite"/>
<circle cx="40" cy="46" r="41" fill="none" stroke="#aaa" stroke-width=".75" stroke-dasharray="1.2 4.2" opacity=".48"/>
<line x1="40" y1="2.5" x2="40" y2="7.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
<line x1="70.76" y1="15.24" x2="67.22" y2="18.78" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".65"/>
<line x1="83.5" y1="46" x2="78.5" y2="46" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
<line x1="70.76" y1="76.76" x2="67.22" y2="73.22" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".65"/>
<line x1="40" y1="89.5" x2="40" y2="84.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".62"/>
<line x1="9.24" y1="76.76" x2="12.78" y2="73.22" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".65"/>
<line x1="-3.5" y1="46" x2="1.5" y2="46" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
<line x1="9.24" y1="15.24" x2="12.78" y2="18.76" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".65"/>
</g>
<path d="M40 4 L50 10 L58 6 L62 13 L70 9 L74 19 L78 30 L76 57 Q72 79,56 87 L40 91 L24 87 Q8 79,4 57 L2 30 L6 19 L10 9 L18 6 L22 13 L30 10 Z" fill="url(#${uid}-gb)" filter="url(#${uid}-fs)"/>
<path d="M40 4 L50 10 L58 6 L62 13 L70 9 L74 19 L78 30 L76 57 Q72 79,56 87 L40 91 L24 87 Q8 79,4 57 L2 30 L6 19 L10 9 L18 6 L22 13 L30 10 Z" fill="url(#${uid}-ga)"/>
<g clip-path="url(#${uid}-sc)"><rect x="-18" y="-2" width="14" height="96" fill="url(#${uid}-gsw)" transform="skewX(-12)"><animate attributeName="x" from="-18" to="94" dur="7s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1" keyTimes="0;1"/></rect></g>
<path d="M40 7.5 L49 13 L56 9.5 L60 15.5 L67 12 L71 20 L74 30 L72 55 Q68 73,53 82 L40 85.5 L27 82 Q12 73,8 55 L6 30 L9 20 L13 12 L20 15.5 L24 9.5 L31 13 Z" fill="none" stroke="#fff" stroke-width=".4" opacity=".12"/>
<path d="M40 4 L50 10 L58 6 L62 13 L70 9 L74 19 L78 30 L76 57 Q72 79,56 87 L40 91 L24 87 Q8 79,4 57 L2 30 L6 19 L10 9 L18 6 L22 13 L30 10 Z" fill="none" stroke="url(#${uid}-ge)" stroke-width="2.1" opacity=".97"/>
<circle cx="40" cy="4" r="1.2" fill="#fff" opacity=".75" filter="url(#${uid}-fg1)"/>
<circle cx="58" cy="6" r="1" fill="#fff" opacity=".6" filter="url(#${uid}-fg1)"/>
<circle cx="70" cy="9" r=".85" fill="#fff" opacity=".5" filter="url(#${uid}-fg1)"/>
<circle cx="18" cy="6" r="1" fill="#fff" opacity=".6" filter="url(#${uid}-fg1)"/>
<circle cx="10" cy="9" r=".85" fill="#fff" opacity=".5" filter="url(#${uid}-fg1)"/>
<path d="M40 14 L56 21 L65 30 L65 56 Q63 74,47 82 L40 85 L33 82 Q17 74,15 56 L15 30 L24 21 Z" fill="url(#${uid}-gp)" stroke="#3a3a3a" stroke-width=".8" opacity=".88"/>
<path d="M40 14 L56 21 L65 30" fill="none" stroke="#fff" stroke-width=".6" stroke-linecap="round" opacity=".08"/>
<path d="M40 14 L24 21 L15 30" fill="none" stroke="#fff" stroke-width=".6" stroke-linecap="round" opacity=".08"/>
<g opacity=".1" stroke="#fff" stroke-width=".5" fill="none"><path d="M26 24.5 L20.5 31 L20.5 40"/><path d="M54 24.5 L59.5 31 L59.5 40"/><path d="M20.5 60 L20.5 67.5 L26 73"/><path d="M59.5 60 L59.5 67.5 L54 73"/><line x1="40" y1="16" x2="40" y2="25" opacity=".6"/><line x1="23" y1="46" x2="29" y2="46" opacity=".6"/><line x1="51" y1="46" x2="57" y2="46" opacity=".6"/></g>
<rect x="20" y="29.5" width="40" height=".7" fill="url(#${uid}-gbar)" rx=".35" opacity=".6"/>
<path d="M14 20 L14 18 C15.5 13,16.5 8,18 8 C19.5 8,21 15,23.5 15 C26 15,27 6,29 6 C31 6,32.5 14,34.5 14 C36.5 14,37.5 2,40 2 C42.5 2,43.5 14,45.5 14 C47.5 14,49 6,51 6 C53 6,54 15,56.5 15 C59 15,60.5 8,62 8 C63.5 8,64.5 13,66 18 L66 20 Z" fill="#0a0a0a" stroke="url(#${uid}-gc)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" filter="url(#${uid}-fg1)"/>
<path d="M14 18 C15.5 13,16.5 8,18 8 C19.5 8,21 15,23.5 15 C26 15,27 6,29 6 C31 6,32.5 14,34.5 14 C36.5 14,37.5 2,40 2 C42.5 2,43.5 14,45.5 14 C47.5 14,49 6,51 6 C53 6,54 15,56.5 15 C59 15,60.5 8,62 8 C63.5 8,64.5 13,66 18" fill="none" stroke="#fff" stroke-width=".6" stroke-linejoin="round" stroke-linecap="round" opacity=".3"/>
<rect x="14" y="18.5" width="52" height="1.4" rx=".7" fill="url(#${uid}-gbar)" opacity=".8"/>
<circle cx="18" cy="19.2" r=".8" fill="#999" opacity=".72"/>
<circle cx="29" cy="19.2" r=".85" fill="#aaa" opacity=".78"/>
<circle cx="40" cy="19.2" r="1.1" fill="#eee" opacity=".88"/>
<circle cx="51" cy="19.2" r=".85" fill="#aaa" opacity=".78"/>
<circle cx="62" cy="19.2" r=".8" fill="#999" opacity=".72"/>
<circle cx="18" cy="8" r="2.3" fill="#d5d5d5" filter="url(#${uid}-fg2)" class="rank-sov-g2"/>
<circle cx="29" cy="6" r="2" fill="#cccccc" filter="url(#${uid}-fg1)"/>
<circle cx="40" cy="2" r="3.8" fill="url(#${uid}-ggem)" filter="url(#${uid}-fg3)" class="rank-sov-g"/>
<circle cx="40" cy="2" r="1.6" fill="#fff" opacity=".52" class="rank-sov-g3"/>
<circle cx="51" cy="6" r="2" fill="#cccccc" filter="url(#${uid}-fg1)"/>
<circle cx="62" cy="8" r="2.3" fill="#d5d5d5" filter="url(#${uid}-fg2)" class="rank-sov-g2"/>
<g filter="url(#${uid}-fg2)" class="rank-sov-g2"><line x1="40" y1="-1.5" x2="40" y2="5.5" stroke="#fff" stroke-width=".8" stroke-linecap="round"/><line x1="36.7" y1="2" x2="43.3" y2="2" stroke="#fff" stroke-width=".8" stroke-linecap="round"/><line x1="37.9" y1=".1" x2="42.1" y2="3.9" stroke="#fff" stroke-width=".35" stroke-linecap="round" opacity=".5"/><line x1="42.1" y1=".1" x2="37.9" y2="3.9" stroke="#fff" stroke-width=".35" stroke-linecap="round" opacity=".5"/></g>
<path d="M3 28 L-1 32 L-4 40 L-4 48 L-1 54 L3 57" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M3 28 L0 32 L-1 40 L-1 48 L0 54 L3 57" fill="none" stroke="#444" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="-4" cy="40" r="1.3" fill="#777" filter="url(#${uid}-fg1)"/>
<circle cx="-4" cy="48" r="1.3" fill="#777" filter="url(#${uid}-fg1)"/>
<circle cx="3" cy="28" r="1.1" fill="#ccc"/><circle cx="3" cy="57" r="1.1" fill="#ccc"/>
<path d="M77 28 L81 32 L84 40 L84 48 L81 54 L77 57" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M77 28 L80 32 L81 40 L81 48 L80 54 L77 57" fill="none" stroke="#444" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="84" cy="40" r="1.3" fill="#777" filter="url(#${uid}-fg1)"/>
<circle cx="84" cy="48" r="1.3" fill="#777" filter="url(#${uid}-fg1)"/>
<circle cx="77" cy="28" r="1.1" fill="#ccc"/><circle cx="77" cy="57" r="1.1" fill="#ccc"/>
<path d="M2 30 L-4 20 L7 25 Z" fill="url(#${uid}-ge)" opacity=".55"/>
<path d="M78 30 L84 20 L73 25 Z" fill="url(#${uid}-ge)" opacity=".55"/>
<circle cx="40" cy="50" r="20" fill="#040404" stroke="#1a1a1a" stroke-width="1.3"/>
<circle cx="40" cy="50" r="20" fill="url(#${uid}-ga)" class="rank-sov-p"/>
<circle cx="40" cy="50" r="17.5" fill="#070707" stroke="#1c1c1c" stroke-width=".8" opacity=".95"/>
<circle cx="40" cy="50" r="15" fill="none" stroke="#2c2c2c" stroke-width=".5" opacity=".6"/>
<circle cx="40" cy="50" r="12.5" fill="none" stroke="#222" stroke-width=".3" opacity=".4"/>
<g stroke="#fff" stroke-width=".3" stroke-linecap="round" opacity=".12"><line x1="43.5" y1="46.5" x2="49" y2="41"/><line x1="43.5" y1="53.5" x2="49" y2="59"/><line x1="36.5" y1="53.5" x2="31" y2="59"/><line x1="36.5" y1="46.5" x2="31" y2="41"/></g>
<g stroke="#888" stroke-width=".75" stroke-linecap="round" opacity=".5"><line x1="40" y1="32.5" x2="40" y2="36.5"/><line x1="52.1" y1="36.5" x2="50.3" y2="39.6"/><line x1="57.5" y1="47" x2="53.5" y2="47"/><line x1="52.1" y1="57.5" x2="50.3" y2="54.4"/><line x1="40" y1="62.5" x2="40" y2="66.5"/><line x1="27.9" y1="57.5" x2="29.7" y2="54.4"/><line x1="22.5" y1="47" x2="26.5" y2="47"/><line x1="27.9" y1="36.5" x2="29.7" y2="39.6"/></g>
<g clip-path="url(#${uid}-mc)"><rect x="-12" y="33" width="10" height="34" fill="url(#${uid}-gsw)" transform="skewX(-12)"><animate attributeName="x" from="-12" to="60" dur="7s" begin="3.5s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1" keyTimes="0;1"/></rect></g>
<g filter="url(#${uid}-fg2)" opacity=".5"><path d="M43.5 38 L43.5 63 L34.5 63 L34.5 60.5 L41 60.5 L41 40 L38 39.5 L35 42 L35 39.5 L41 37 Z" fill="#fff"/></g>
<rect x="39" y="37.5" width="4.5" height="24" rx=".9" fill="url(#${uid}-gn)" filter="url(#${uid}-fg1)"/>
<rect x="34" y="60" width="14" height="3" rx="1.1" fill="url(#${uid}-gn)" filter="url(#${uid}-fg1)"/>
<path d="M39 37.5 L36 40 L36 42 L43.5 38.2 Z" fill="url(#${uid}-gn)" filter="url(#${uid}-fg1)"/>
<rect x="37" y="36.5" width="7.5" height="2" rx=".8" fill="url(#${uid}-gn)" filter="url(#${uid}-fg1)"/>
<line x1="42.5" y1="37.5" x2="42.5" y2="61" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".16"/>
<circle cx="40" cy="50" r="22" fill="none" stroke="#fff" stroke-width=".85" opacity=".07" class="rank-sov-p"/>
<rect x="16" y="72" width="48" height="1.1" fill="url(#${uid}-gbar)" rx=".5"/>
<g filter="url(#${uid}-fg1)"><circle cx="11" cy="80.5" r="2" fill="#1a1a1a"/><circle cx="17" cy="83" r="2.5" fill="#363636"/><circle cx="23" cy="84.8" r="3" fill="#686868"/><circle cx="29" cy="86.2" r="3.5" fill="#9e9e9e"/><circle cx="35" cy="87" r="4" fill="#c8c8c8"/></g>
<circle cx="40" cy="87.5" r="5" fill="#fff" filter="url(#${uid}-fg3)" class="rank-sov-g"/>
<circle cx="40" cy="86" r="2.1" fill="#fff" opacity=".5" filter="url(#${uid}-fg1)" class="rank-sov-g3"/>
<g filter="url(#${uid}-fg1)"><circle cx="45" cy="87" r="4" fill="#c8c8c8"/><circle cx="51" cy="86.2" r="3.5" fill="#9e9e9e"/><circle cx="57" cy="84.8" r="3" fill="#686868"/><circle cx="63" cy="83" r="2.5" fill="#363636"/><circle cx="69" cy="80.5" r="2" fill="#1a1a1a"/></g>
<circle cx="35" cy="86" r="1.7" fill="#fff" opacity=".5" filter="url(#${uid}-fg1)"/>
<circle cx="45" cy="86" r="1.7" fill="#fff" opacity=".5" filter="url(#${uid}-fg1)"/>
<circle cx="23" cy="83.8" r=".9" fill="#fff" opacity=".3"/>
<circle cx="57" cy="83.8" r=".9" fill="#fff" opacity=".3"/>
</svg>`,
  };

  const svgHtml = badges[tier] || badges.bronze;
  const divHtml = div ? `<span style="display:block;text-align:center;font-family:'Orbitron',monospace,sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;color:${RANKED_CONFIG[tier]?.color || '#aaa'};margin-top:2px">${div}</span>` : '';

  return `<span class="rank-badge-svg rank-badge-${tier}" title="${label}${div ? ' ' + div : ''}">${svgHtml}${divHtml}</span>`;
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
  } catch (e) { console.warn('[Ranked] profile load:', e); }
}

/* ── Boss schedule per tier + wave ───────────────────────────── */
function rankedBossTypeForWave(completedWave) {
  const cfg  = getRankedConfig();

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
  const base = cfg.rpGainBase + (wavesCleared - 1) * (cfg.rpPerWave || 4);
  const mult = 1 + Math.min(_rankedStreak * 0.08, cfg.streakCap || 0.50);
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

  // ── Submit to backend (server calculates RP) ─────────────────
  let result = null;
  try {
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('topdown_token');
    const resp  = await fetch(`${API_BASE}/ranked/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ wavesCleared: _rankedWavesCleared, won }),
    });
    if (resp.ok) result = await resp.json();
  } catch (e) { console.warn('[Ranked] submit:', e); }

  // ── Update local profile ──────────────────────────────────────
  if (result && result.tier) {
    _rankedProfile = {
      tier: result.tier, division: result.division, rp: result.rp,
      peak_tier: result.peak_tier, peak_division: result.peak_division,
      wins: result.wins, losses: result.losses, streak: result.streak,
    };
    if (result.promo_protect) _rankedPromoProtect = true;
  }

  // Use server-calculated rpDelta if available, otherwise fall back to client estimate
  const serverRpDelta = result ? result.rp_delta : rpDelta;

  if (result?.newUnlocks?.length && typeof handleNewUnlocks === 'function') {
    handleNewUnlocks(result.newUnlocks);
  }
  updateRankedBadge();
  showRankedEndOverlay({ rpDelta: serverRpDelta, won, result, wavesCleared: _rankedWavesCleared, targetWaves });
  // Post-game crate drop (fire-and-forget)
  if (typeof _triggerPostGameDrop === 'function') {
    _triggerPostGameDrop('ranked', (_rankedProfile && _rankedProfile.tier) || 'bronze');
  }
  return { rpDelta: serverRpDelta, won, result, wavesCleared: _rankedWavesCleared };
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
    if (typeof _syncLobbyBar === 'function') _syncLobbyBar();
    if (typeof switchLobbyTab === 'function') switchLobbyTab('play');
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
  const isSov = _rankedProfile.tier === 'sovereign';

  // In-game HUD badge
  const badge = document.getElementById('rankedModeBadge');
  if (badge) {
    const cfg = getRankedConfig();
    const lbl = rankLabel(_rankedProfile.tier, _rankedProfile.division);
    badge.textContent = `${cfg.icon} ${lbl}`;
    badge.style.color = cfg.color;
    badge.classList.toggle('sovereign-name', isSov);
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
    lbl.classList.toggle('sovereign-name', isSov);
    if (rp) rp.textContent = `${_rankedProfile.rp} RP`;
    row.style.display = '';
  }
}

/* ── Rank index grid population ─────────────────────────────── */
function renderRankIndex(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  const tierLabels = {
    bronze: 'Tier I', silver: 'Tier II', gold: 'Tier III',
    platinum: 'Tier IV', diamond: 'Tier V', master: 'Tier VI',
    grandmaster: 'Tier VII', apex: 'Top 100', sovereign: 'Rank #1',
  };

  grid.innerHTML = RANKED_TIERS.map(tier => {
    const cfg = RANKED_CONFIG[tier];
    const badge = rankBadgeSvg(tier, null);
    const nameClass = tier === 'sovereign' ? ' sovereign-name' : '';
    return `
      <div class="rank-index-card">
        <div class="rank-index-card-badge">${badge}</div>
        <div class="rank-index-card-divider"></div>
        <div class="rank-index-card-name${nameClass}" style="color:${cfg.color}">${cfg.label}</div>
        <div class="rank-index-card-tier">${tierLabels[tier] || ''}</div>
        <div class="rank-index-card-desc">${cfg.desc}</div>
      </div>
    `;
  }).join('');
}

function populateRankIndex() {
  renderRankIndex('rankIndexGrid');
}

/* ── Auto-load profile on page ready ────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure api-auth.js globals are set
  setTimeout(() => {
    if (typeof getToken === 'function' && getToken()) loadRankedProfile();
  }, 600);
  populateRankIndex();
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
window.renderRankIndex       = renderRankIndex;
window.endRankedRun          = endRankedRun;
window.rankedBossTypeForWave = rankedBossTypeForWave;
window.rankedSpawnType       = rankedSpawnType;
window.updateRankedHUD       = updateRankedHUD;
window.updateRankedBadge     = updateRankedBadge;
