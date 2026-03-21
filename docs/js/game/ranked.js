// js/game/ranked.js — Ranked Mode System

/* ── Tier definitions ────────────────────────────────────────── */
const RANKED_TIERS = ['bronze','silver','gold','platinum','diamond','master','grandmaster','apex','sovereign'];

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
    label:'Platinum', icon:'💠', color:'#00e8c0',
    hasDivisions:true, rpPerDiv:100,
    targetWaves:18, waveOffset:15,
    hpMult:1.15, speedMult:1.05,
    rpGainBase:28, rpLoss:18,
    enemyTypes:['fast','tank','shooter','enforcer'],
    miniBossInterval:5, bigBossInterval:15,
    desc:'Enforcers appear. Mini-bosses every 5 waves, big boss at wave 15.',
  },
  diamond: {
    label:'Diamond', icon:'💎', color:'#4488FF',
    hasDivisions:true, rpPerDiv:100,
    targetWaves:24, waveOffset:20,
    hpMult:1.35, speedMult:1.1,
    rpGainBase:38, rpLoss:25,
    enemyTypes:['fast','tank','shooter','enforcer'],
    miniBossInterval:4, bigBossInterval:10,
    desc:'High HP, fast AI. Mini-bosses every 4 waves, big boss every 10.',
  },
  master: {
    label:'Master', icon:'👑', color:'#AA33FF',
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
    desc:'Top 100. Legendary bosses every 5 waves. Endurance is everything.',
  },
  sovereign: {
    label:'Sovereign', icon:'♛', color:'#ffffff',
    hasDivisions:false, rpPerDiv:null,
    targetWaves:9999, waveOffset:42,
    hpMult:2.8, speedMult:1.5,
    rpGainBase:90, rpLoss:45,
    enemyTypes:['shooter','enforcer'],
    miniBossInterval:0, bigBossInterval:4,
    desc:'Rank #1. The ultimate challenge. You stand alone at the top.',
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

    sovereign: `<svg viewBox="0 0 80 92" xmlns="http://www.w3.org/2000/svg" width="44" height="50">
      <defs>
        <linearGradient id="${uid}-body" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1c1c1c"/><stop offset="50%" stop-color="#080808"/><stop offset="100%" stop-color="#000000"/></linearGradient>
        <linearGradient id="${uid}-edge" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="40%" stop-color="#d0d0d0"/><stop offset="100%" stop-color="#888888"/></linearGradient>
        <linearGradient id="${uid}-crown" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="50%" stop-color="#cccccc"/><stop offset="100%" stop-color="#888888"/></linearGradient>
        <linearGradient id="${uid}-panel" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1a1a1a"/><stop offset="100%" stop-color="#050505"/></linearGradient>
        <radialGradient id="${uid}-aura" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
        <linearGradient id="${uid}-bar" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0"/><stop offset="50%" stop-color="#ffffff" stop-opacity="0.7"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
        <linearGradient id="${uid}-num" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="50%" stop-color="#cccccc"/><stop offset="100%" stop-color="#999999"/></linearGradient>
        <filter id="${uid}-sh"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#ffffff" flood-opacity="0.35"/></filter>
        <filter id="${uid}-gl"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="${uid}-gl2"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="${uid}-gl3"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <ellipse cx="40" cy="46" rx="36" ry="42" fill="url(#${uid}-aura)" class="rank-sov-pulse"/>
      <g class="rank-sov-ring-outer">
        <circle cx="40" cy="44" r="37" fill="none" stroke="#ffffff" stroke-width="0.4" stroke-dasharray="2 8" opacity="0.3"/>
        <path d="M40 7 L42 11 L40 15 L38 11 Z" fill="#ffffff" opacity="0.8"/><path d="M67 18 L69 22 L67 26 L65 22 Z" fill="#ffffff" opacity="0.5"/>
        <path d="M77 44 L79 48 L77 52 L75 48 Z" fill="#ffffff" opacity="0.7"/><path d="M67 70 L69 74 L67 78 L65 74 Z" fill="#ffffff" opacity="0.5"/>
        <path d="M40 81 L42 85 L40 89 L38 85 Z" fill="#ffffff" opacity="0.4"/><path d="M13 70 L15 74 L13 78 L11 74 Z" fill="#ffffff" opacity="0.5"/>
        <path d="M3 44 L5 48 L3 52 L1 48 Z" fill="#ffffff" opacity="0.7"/><path d="M13 18 L15 22 L13 26 L11 22 Z" fill="#ffffff" opacity="0.5"/>
      </g>
      <g class="rank-sov-ring-inner">
        <circle cx="40" cy="44" r="30" fill="none" stroke="#aaaaaa" stroke-width="0.4" stroke-dasharray="1 6" opacity="0.25"/>
        <line x1="40" y1="14" x2="40" y2="18" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
        <line x1="60" y1="19" x2="58" y2="22" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
        <line x1="69" y1="38" x2="65" y2="39" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
        <line x1="64" y1="57" x2="61" y2="54" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
        <line x1="20" y1="19" x2="22" y2="22" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
        <line x1="11" y1="38" x2="15" y2="39" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
        <line x1="16" y1="57" x2="19" y2="54" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
      </g>
      <path d="M40 4 L50 10 L58 6 L62 13 L70 9 L74 19 L78 30 L76 57 Q72 79 56 87 L40 91 L24 87 Q8 79 4 57 L2 30 L6 19 L10 9 L18 6 L22 13 L30 10 Z" fill="url(#${uid}-body)" filter="url(#${uid}-sh)"/>
      <path d="M40 4 L50 10 L58 6 L62 13 L70 9 L74 19 L78 30 L76 57 Q72 79 56 87 L40 91 L24 87 Q8 79 4 57 L2 30 L6 19 L10 9 L18 6 L22 13 L30 10 Z" fill="url(#${uid}-aura)"/>
      <path d="M40 4 L50 10 L58 6 L62 13 L70 9 L74 19 L78 30 L76 57 Q72 79 56 87 L40 91 L24 87 Q8 79 4 57 L2 30 L6 19 L10 9 L18 6 L22 13 L30 10 Z" fill="none" stroke="url(#${uid}-edge)" stroke-width="1.8" opacity="0.95"/>
      <path d="M40 14 L56 21 L65 30 L65 56 Q63 74 47 82 L40 85 L33 82 Q17 74 15 56 L15 30 L24 21 Z" fill="url(#${uid}-panel)" stroke="#555555" stroke-width="0.8" opacity="0.7"/>
      <path d="M6 19 L74 19 L78 30 L2 30 Z" fill="#111111" opacity="0.7"/>
      <path d="M22 13 L27 18 L30 10 L35 18 L40 8 L45 18 L50 10 L53 18 L58 13" fill="none" stroke="url(#${uid}-crown)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="1" filter="url(#${uid}-gl)"/>
      <circle cx="40" cy="8" r="3" fill="#ffffff" filter="url(#${uid}-gl3)" class="rank-sov-shimmer"/><circle cx="30" cy="10" r="2" fill="#dddddd" filter="url(#${uid}-gl2)"/>
      <circle cx="50" cy="10" r="2" fill="#dddddd" filter="url(#${uid}-gl2)"/><circle cx="22" cy="13" r="1.5" fill="#bbbbbb" filter="url(#${uid}-gl)"/><circle cx="58" cy="13" r="1.5" fill="#bbbbbb" filter="url(#${uid}-gl)"/>
      <path d="M2 30 L8 30 L2 38" fill="none" stroke="#888888" stroke-width="1.4"/><path d="M78 30 L72 30 L78 38" fill="none" stroke="#888888" stroke-width="1.4"/>
      <path d="M4 52 L4 46 L10 46" fill="none" stroke="#666666" stroke-width="1.2"/><path d="M76 52 L76 46 L70 46" fill="none" stroke="#666666" stroke-width="1.2"/>
      <path d="M4 40 L12 40 L16 44 L22 44" fill="none" stroke="#555555" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/>
      <path d="M76 40 L68 40 L64 44 L58 44" fill="none" stroke="#555555" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/>
      <path d="M2 30 L-3 21 L7 25 Z" fill="url(#${uid}-edge)" opacity="0.65"/><path d="M78 30 L83 21 L73 25 Z" fill="url(#${uid}-edge)" opacity="0.65"/>
      <rect x="18" y="30" width="44" height="0.8" fill="url(#${uid}-bar)" rx="0.4"/>
      <circle cx="40" cy="50" r="17" fill="#0a0a0a" stroke="#333333" stroke-width="0.8" opacity="0.9"/>
      <circle cx="40" cy="50" r="17" fill="url(#${uid}-aura)" class="rank-sov-pulse"/>
      <circle cx="40" cy="50" r="14" fill="none" stroke="#444444" stroke-width="0.6" opacity="0.5"/>
      <rect x="37.5" y="36" width="5" height="22" rx="1" fill="url(#${uid}-num)" filter="url(#${uid}-gl)"/>
      <rect x="32" y="57" width="16" height="2.5" rx="1" fill="url(#${uid}-num)" filter="url(#${uid}-gl)"/>
      <path d="M37.5 36 L37.5 38 L33 41 L33 38 Z" fill="url(#${uid}-num)" filter="url(#${uid}-gl)"/>
      <rect x="39" y="37" width="1.5" height="18" rx="0.5" fill="white" opacity="0.25"/>
      <circle cx="40" cy="50" r="20" fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.12" class="rank-sov-pulse"/>
      <rect x="16" y="72" width="48" height="1" fill="url(#${uid}-bar)" rx="0.5"/>
      <circle cx="11" cy="78" r="1.6" fill="#333333" filter="url(#${uid}-gl)"/><circle cx="17" cy="79.5" r="1.8" fill="#555555" filter="url(#${uid}-gl)"/>
      <circle cx="23" cy="80.5" r="2" fill="#777777" filter="url(#${uid}-gl)"/><circle cx="29" cy="81.5" r="2.2" fill="#aaaaaa" filter="url(#${uid}-gl)"/>
      <circle cx="35" cy="82" r="2.5" fill="#cccccc" filter="url(#${uid}-gl2)"/>
      <circle cx="40" cy="82.5" r="3" fill="#ffffff" filter="url(#${uid}-gl3)" class="rank-sov-shimmer"/>
      <circle cx="45" cy="82" r="2.5" fill="#cccccc" filter="url(#${uid}-gl2)"/><circle cx="51" cy="81.5" r="2.2" fill="#aaaaaa" filter="url(#${uid}-gl)"/>
      <circle cx="57" cy="80.5" r="2" fill="#777777" filter="url(#${uid}-gl)"/><circle cx="63" cy="79.5" r="1.8" fill="#555555" filter="url(#${uid}-gl)"/>
      <circle cx="69" cy="78" r="1.6" fill="#333333" filter="url(#${uid}-gl)"/>
    </svg>`,
  };

  const svgHtml = badges[tier] || badges.bronze;
  const divHtml = div ? `<span style="display:block;text-align:center;font-family:'Orbitron',monospace,sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;color:${RANKED_CONFIG[tier]?.color || '#aaa'};margin-top:2px">${div}</span>` : '';

  return `<span class="rank-badge-svg" title="${label}${div ? ' ' + div : ''}">${svgHtml}${divHtml}</span>`;
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
