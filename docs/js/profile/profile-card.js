// profile-card.js — Player Profile Card Component
// Depends on: applyRichSkinPreview (game.js), rankBadgeSvg (ranked.js),
//             apiGet / apiPost (api-auth.js)
'use strict';

// ── Background CSS lookup ────────────────────────────────────────────────────
var PC_BACKGROUNDS = {
  'bg_default':    'linear-gradient(135deg,#0a1628 0%,#1a2a44 100%)',
  'bg_bronze':     'linear-gradient(135deg,#281008 0%,#6a3010 35%,#9a5020 55%,#6a3010 75%,#281008 100%)',
  'bg_silver':     'linear-gradient(135deg,#141e2a 0%,#2a4055 35%,#527890 55%,#2a4055 75%,#141e2a 100%)',
  'bg_gold':       'ANIMATED:pc-bg-gold',
  'bg_platinum':   'linear-gradient(135deg,#0e1c2a 0%,#1e3a55 35%,#407898 55%,#1e3a55 75%,#0e1c2a 100%)',
  'bg_diamond':    'linear-gradient(135deg,#050d1a 0%,#0a3a6a 30%,#1a6aaa 50%,#0a3a6a 70%,#050d1a 100%)',
  'bg_galaxy':     'ANIMATED:pc-bg-galaxy',
  'bg_sovereign':  'ANIMATED:pc-bg-sovereign',
  'bg_inferno':    'linear-gradient(135deg,#1a0300 0%,#601000 35%,#aa2400 55%,#601000 75%,#1a0300 100%)',
  'bg_collector':  'linear-gradient(135deg,#051005 0%,#0e3010 35%,#1e5a22 55%,#0e3010 75%,#051005 100%)',
  'bg_whale':      'linear-gradient(135deg,#060f1e 0%,#0d2848 35%,#1a4888 55%,#0d2848 75%,#060f1e 100%)',
  'bg_veteran':    'linear-gradient(135deg,#181818 0%,#282828 40%,#383838 60%,#282828 100%)',
  'bg_seasonal_s1':'linear-gradient(135deg,#100820 0%,#281050 35%,#481888 55%,#281050 75%,#100820 100%)',
  // Crate-themed backgrounds
  'bg_neon':       'radial-gradient(ellipse at 35% 35%,#004899 0%,#002250 45%,#000e20 80%)',
  'bg_frost':      'linear-gradient(135deg,#0a1c28 0%,#1a3e55 35%,#2e6888 55%,#1a3e55 75%,#0a1c28 100%)',
  'bg_void':       'radial-gradient(ellipse at center,#1c0048 0%,#090018 55%,#020008 100%)',
  'bg_midnight':   'linear-gradient(135deg,#060618 0%,#0f0f40 38%,#1c1c62 55%,#0f0f40 72%,#060618 100%)',
  'bg_crimson':    'linear-gradient(135deg,#180008 0%,#480015 35%,#7a0025 55%,#480015 75%,#180008 100%)',
  'bg_ocean':      'linear-gradient(135deg,#010e1a 0%,#023c58 35%,#056578 55%,#023c58 75%,#010e1a 100%)',
  // Animated backgrounds (ANIMATED: prefix → apply CSS class instead of inline bg)
  'bg_aurora':     'ANIMATED:pc-bg-aurora',
  'bg_matrix':     'ANIMATED:pc-bg-matrix',
  'bg_ember':      'ANIMATED:pc-bg-ember',
};

// ── Border CSS lookup ────────────────────────────────────────────────────────
var PC_BORDERS = {
  'border_default':        '1px solid rgba(88,166,255,0.2)',
  'border_silver':         '2px solid #8090b0',
  'border_gold':           '2px solid #c0900a',
  'border_diamond':        '2px solid #40aaff',
  'border_animated_pulse': '2px solid rgba(88,166,255,0.8)',
  'border_prismatic':      '2px solid #ff6eb4',
  'border_champion':       '3px solid #ffd700',
  'border_oblivion':       '2px solid rgba(180,0,255,0.8)',
  // New animated glow borders
  'border_neon':           '2px solid rgba(0,229,255,0.8)',
  'border_fire':           '2px solid rgba(255,100,0,0.8)',
  'border_ice':            '2px solid rgba(160,216,234,0.8)',
  'border_void':           '2px solid rgba(140,0,255,0.8)',
};

// ── Title display text ───────────────────────────────────────────────────────
var PC_TITLE_DISPLAY = {
  'title_newcomer':     'New Here',
  'title_grinder':      'All Day',
  'title_trader':       'Market Shark',
  'title_collector':    'Skin Hoarder',
  'title_apex_predator':'Certified',
  'title_sovereign':    'The One',
  'title_whale':        'Money Pit',
  'title_lucky':        'Cracked RNG',
  'title_dedicated':    'Terminally Online',
  'title_unbreakable':  'Never Dies',
  'title_number_one':   'Him.',
  'title_custom':       null, // uses custom_title_text from API
  'title_sigma':        'Sigma',
  'title_sweat':        'Tryhard',
  'title_rich':         'Made of Money',
};

// ── Badge display data ───────────────────────────────────────────────────────
var PC_BADGE_DISPLAY = {
  'badge_rank_silver':    { icon: '🥈', name: 'Silver Ranked',   bg: 'linear-gradient(135deg,#1a2030,#4a6080)' },
  'badge_rank_gold':      { icon: '🥇', name: 'Gold Ranked',     bg: 'linear-gradient(135deg,#3a2000,#c09020)' },
  'badge_rank_platinum':  { icon: '💠', name: 'Platinum Ranked', bg: 'linear-gradient(135deg,#0d1f2d,#2a6080)' },
  'badge_rank_diamond':   { icon: '💎', name: 'Diamond Ranked',  bg: 'linear-gradient(135deg,#050d1a,#1a6aaa)' },
  'badge_rank_apex':      { icon: '👑', name: 'Apex Ranked',     bg: 'linear-gradient(135deg,#1a0040,#6a20c0)' },
  'badge_wave_master':    { icon: '🌊', name: 'Wave Master',     bg: 'linear-gradient(135deg,#0a2040,#1a5080)' },
  'badge_mythic_pull':    { icon: '✨', name: 'Mythic Pull',     bg: 'linear-gradient(135deg,#200040,#8000cc)' },
  'badge_oblivion_club':  { icon: '🌑', name: 'Oblivion Club',   bg: 'linear-gradient(135deg,#050010,#1a0040)' },
  'badge_skin_collector': { icon: '🎨', name: 'Skin Collector',  bg: 'linear-gradient(135deg,#001a20,#005060)' },
  'badge_market_shark':   { icon: '🤝', name: 'Market Shark',    bg: 'linear-gradient(135deg,#001020,#003050)' },
  'badge_century':        { icon: '🎮', name: 'Century',         bg: 'linear-gradient(135deg,#101828,#204060)' },
  'badge_hot_streak':     { icon: '🔥', name: 'Hot Streak',      bg: 'linear-gradient(135deg,#300000,#a03000)' },
  'badge_s1_champion':    { icon: '🏆', name: 'S1 Champion',     bg: 'linear-gradient(135deg,#302000,#c07000)' },
  'badge_veteran':        { icon: '⚔️',  name: 'Veteran',         bg: 'linear-gradient(135deg,#1a1a1a,#3a3020)' },
  'badge_high_roller':    { icon: '💰', name: 'High Roller',     bg: 'linear-gradient(135deg,#1a1000,#5a3a00)' },
  'badge_streak_pro':     { icon: '⚡', name: 'Streak Lord',     bg: 'linear-gradient(135deg,#0a0a20,#2a1a60)' },
};

// ── Name color lookup ─────────────────────────────────────────────────────────
var PC_NAME_COLORS = {
  'name_default':   '#e8eaf6',
  'name_gold':      '#ffd700',
  'name_neon':      '#00e5ff',
  'name_crimson':   '#ff2d55',
  'name_emerald':   '#00e676',
  'name_rainbow':   'ANIMATED:pc-name-rainbow',
  'name_sovereign': 'ANIMATED:pc-name-sovereign',
  'name_purple':    '#cc44ff',
  'name_orange':    '#ff8c00',
  'name_pink':      '#ff2d9e',
  'name_ice':       '#a8d8ff',
  'name_fire':      'ANIMATED:pc-name-fire',
};

// ── Card glow lookup (box-shadow value, or ANIMATED: prefix for CSS class) ──
var PC_GLOW_STYLES = {
  'glow_none':    'none',
  'glow_default': '0 0 22px rgba(88,166,255,0.35), 0 0 44px rgba(88,166,255,0.12)',
  'glow_gold':    '0 0 22px rgba(255,215,0,0.45), 0 0 44px rgba(255,215,0,0.15)',
  'glow_red':     '0 0 22px rgba(255,45,85,0.45),  0 0 44px rgba(255,45,85,0.15)',
  'glow_green':   '0 0 22px rgba(0,230,118,0.45),  0 0 44px rgba(0,230,118,0.15)',
  'glow_rainbow': 'ANIMATED:pc-glow-rainbow',
  'glow_purple':  '0 0 22px rgba(160,0,255,0.45),  0 0 44px rgba(120,0,200,0.15)',
  'glow_cyan':    '0 0 22px rgba(0,229,255,0.45),   0 0 44px rgba(0,180,220,0.15)',
  'glow_orange':  '0 0 22px rgba(255,130,0,0.45),  0 0 44px rgba(220,80,0,0.15)',
  'glow_pink':    '0 0 22px rgba(255,40,200,0.45),  0 0 44px rgba(200,0,160,0.15)',
  'glow_white':   '0 0 22px rgba(255,255,255,0.3),  0 0 44px rgba(200,220,255,0.12)',
};

// ── Title CSS class ──────────────────────────────────────────────────────────
var PC_TITLE_CSS_CLASS = {
  'title_sovereign':   'pc-title-sovereign',
  'title_number_one':  'pc-title-number-one',
};

// ─── Profile cache ────────────────────────────────────────────────────────────
var _pcProfileCache = { me: null, unlockables: null, ts: 0 };
var _PC_CACHE_TTL   = 90000;
function _pcCacheValid()    { return _pcProfileCache.me && _pcProfileCache.unlockables && (Date.now() - _pcProfileCache.ts) < _PC_CACHE_TTL; }
function _pcCacheStore(me, ul) { _pcProfileCache.me = me; _pcProfileCache.unlockables = ul; _pcProfileCache.ts = Date.now(); }
function _pcCacheInvalidate()  { _pcProfileCache.ts = 0; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _pcFmt(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function _pcTierLabel(tier, division) {
  if (!tier) return '—';
  const TIERS = { bronze:'Bronze', silver:'Silver', gold:'Gold', platinum:'Platinum',
                  diamond:'Diamond', master:'Master', grandmaster:'Grandmaster',
                  apex:'Apex', sovereign:'Sovereign' };
  const DIVS = { 1:'I', 2:'II', 3:'III', 4:'IV', 5:'V' };
  const hasDivision = ['bronze','silver','gold','platinum','diamond'].includes(tier);
  return TIERS[tier] || tier + (hasDivision && division ? ' ' + (DIVS[division] || division) : '');
}

// ── renderProfileCard(data, containerEl, opts) ───────────────────────────────
// Inserts profile card HTML into containerEl and applies skin preview.
function renderProfileCard(data, containerEl, opts) {
  opts = opts || {};
  var compact  = opts.compact  || false;
  var editable = opts.editable || false;

  if (!data || !data.profile) {
    containerEl.innerHTML = '<div class="pc-loading">Failed to load profile.</div>';
    return;
  }

  var p     = data.profile;
  var s     = data.stats || {};
  var bgRaw  = PC_BACKGROUNDS[p.cardBackground] || PC_BACKGROUNDS['bg_default'];
  var bgIsAnim = typeof bgRaw === 'string' && bgRaw.startsWith('ANIMATED:');
  var bgCss    = bgIsAnim ? '' : bgRaw;
  var bgClass  = bgIsAnim ? bgRaw.replace('ANIMATED:', '') : '';

  var brdCss= PC_BORDERS[p.cardBorder] || PC_BORDERS['border_default'];
  var accent= p.cardAccentColor || '#4a9eff';

  var glowRaw    = PC_GLOW_STYLES[p.cardGlow] || PC_GLOW_STYLES['glow_default'];
  var glowIsAnim = typeof glowRaw === 'string' && glowRaw.startsWith('ANIMATED:');
  var glowClass  = glowIsAnim ? (' ' + glowRaw.replace('ANIMATED:', '')) : '';
  var glowStyle  = glowIsAnim ? '' : (glowRaw === 'none' ? 'box-shadow:none;' : 'box-shadow:0 12px 40px rgba(0,0,0,0.7),' + glowRaw + ';');

  var ncRaw    = PC_NAME_COLORS[p.nameColor] || PC_NAME_COLORS['name_default'];
  var ncIsAnim = typeof ncRaw === 'string' && ncRaw.startsWith('ANIMATED:');
  var ncClass  = ncIsAnim ? (' ' + ncRaw.replace('ANIMATED:', '')) : '';
  var ncStyle  = ncIsAnim ? '' : ('color:' + ncRaw + ';');

  var titleId   = p.displayTitle || 'title_newcomer';
  var titleText = titleId === 'title_custom' && p.displayTitleText
    ? p.displayTitleText
    : (PC_TITLE_DISPLAY[titleId] || titleId);
  var titleClass = 'pc-title ' + (PC_TITLE_CSS_CLASS[titleId] || '');

  var borderClass = '';
  if (p.cardBorder === 'border_animated_pulse') borderClass = ' pc-border-animated-pulse';
  if (p.cardBorder === 'border_prismatic')       borderClass = ' pc-border-prismatic';
  if (p.cardBorder === 'border_oblivion')        borderClass = ' pc-border-oblivion';
  if (p.cardBorder === 'border_neon')            borderClass = ' pc-border-neon';
  if (p.cardBorder === 'border_fire')            borderClass = ' pc-border-fire';
  if (p.cardBorder === 'border_ice')             borderClass = ' pc-border-ice';
  if (p.cardBorder === 'border_void')            borderClass = ' pc-border-void';

  var rankHtml = '';
  if (typeof rankBadgeSvg === 'function' && data.stats && data.stats.currentRank) {
    var cr = data.stats.currentRank;
    rankHtml = '<div class="pc-rank-badge">' + rankBadgeSvg(cr.tier, cr.division) +
               '<span class="pc-rank-label">' + _pcTierLabel(cr.tier, cr.division) + '</span></div>';
  }

  var bioHtml = p.bio
    ? '<div class="pc-bio">' + _escapeHtml(p.bio) + '</div>'
    : '';

  var statsHtml = '';
  if (!compact) {
    var peakLabel = _pcTierLabel(s.peakRank && s.peakRank.tier, s.peakRank && s.peakRank.division);
    statsHtml = '<div class="pc-divider"></div>' +
      '<div class="pc-stats-heading">Stats</div>' +
      '<div class="pc-stats-grid">' +
        _pcStat('Games',   _pcFmt(s.totalGames)) +
        _pcStat('Waves',   _pcFmt(s.totalWavesCleared)) +
        _pcStat('Kills',   _pcFmt(s.totalKills)) +
        _pcStat('Crates',  _pcFmt(s.totalCratesOpened)) +
        _pcStat('Trades',  _pcFmt(s.totalTradesCompleted)) +
        _pcStat('Ranked',  (s.rankedWins||0) + 'W / ' + (s.rankedLosses||0) + 'L') +
        _pcStat('Win Rate',(s.winRate||0) + '%') +
        _pcStat('Streak',  _pcFmt(s.currentStreak)) +
        _pcStat('Peak',    peakLabel) +
        _pcStat('Skins',   _pcFmt(s.ownedSkinsCount)) +
      '</div>';
  }

  var badgesHtml = '';
  if (!compact) {
    var badgeSlots = [p.showcaseBadge1, p.showcaseBadge2, p.showcaseBadge3];
    var filledBadges = badgeSlots.filter(function(bid) { return bid && PC_BADGE_DISPLAY[bid]; });
    if (filledBadges.length > 0) {
      var badgePills = filledBadges.map(function(bid) {
        var disp = PC_BADGE_DISPLAY[bid];
        return '<div class="pc-badge" style="background:' + disp.bg + '" title="' + _escapeHtml(disp.name) + '">' +
               '<span class="pc-badge-icon">' + disp.icon + '</span>' +
               '<span class="pc-badge-name">' + _escapeHtml(disp.name) + '</span></div>';
      }).join('');
      badgesHtml = '<div class="pc-badges">' + badgePills + '</div>';
    }
  }

  var footerHtml = !compact
    ? '<div class="pc-footer">Account age: ' + (s.accountAgeDays || 0) + ' day' + (s.accountAgeDays !== 1 ? 's' : '') + '</div>'
    : '';

  var editHtml = editable
    ? '<button class="pc-edit-btn" onclick="openProfileCustomizer()">✏ Customize</button>'
    : '';

  var uid = data.uid || '';
  var skinId = compact
    ? 'pc-skin-compact-' + uid
    : 'pc-skin-' + uid;

  var accentBar = '<div class="pc-accent-bar" style="background:linear-gradient(90deg,transparent 0%,' + accent + '55 20%,' + accent + 'cc 50%,' + accent + '55 80%,transparent 100%)"></div>';

  var bgEl = '<div class="pc-bg ' + bgClass + '" style="' + (bgCss ? 'background:' + bgCss + ';' : '') + '"></div>';

  containerEl.innerHTML =
    '<div class="pc-card' + (compact ? ' pc-compact' : '') + borderClass + glowClass + '" ' +
         'style="border:' + brdCss + ';' + glowStyle + '">' +
      bgEl +
      accentBar +
      '<div class="pc-header">' +
        '<div class="' + skinId + ' pc-skin-showcase" id="' + skinId + '"></div>' +
        '<div class="pc-identity">' +
          '<div class="pc-username' + ncClass + '" style="' + ncStyle + '">' + _escapeHtml(data.username || '') + '</div>' +
          rankHtml +
          '<div class="' + titleClass + '" style="color:' + accent + '">' + _escapeHtml(titleText) + '</div>' +
        '</div>' +
      '</div>' +
      bioHtml +
      badgesHtml +
      statsHtml +
      footerHtml +
      editHtml +
    '</div>';

  // Apply skin preview after DOM insertion
  var skinEl = containerEl.querySelector('#' + skinId);
  if (skinEl && typeof applyRichSkinPreview === 'function') {
    var _showcaseId = p.showcaseSkin || 'agent';
    var _skinData   = typeof SKINS !== 'undefined' ? SKINS.find(function(s) { return s.id === _showcaseId; }) : null;
    applyRichSkinPreview(skinEl, _showcaseId, _skinData ? _skinData.color : null);
  }
}

function _pcStat(label, val) {
  return '<div class="pc-stat"><span class="pc-stat-label">' + label + '</span>' +
         '<span class="pc-stat-val">' + val + '</span></div>';
}

function _escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Skeleton helpers ──────────────────────────────────────────────────────────
function _pcCardSkeleton() {
  return '<div class="pc-skeleton-card pc-card" style="width:340px;background:#0a1628;border:1px solid rgba(88,166,255,0.15);padding:0">' +
    '<div class="sk-shimmer" style="height:3px;border-radius:0;margin-bottom:0"></div>' +
    '<div style="padding:20px">' +
      '<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px">' +
        '<div class="sk-shimmer sk-box" style="width:88px;height:88px;flex-shrink:0"></div>' +
        '<div style="flex:1;padding-top:4px">' +
          '<div class="sk-shimmer sk-line-lg" style="width:70%;margin-bottom:10px"></div>' +
          '<div class="sk-shimmer sk-line-sm" style="width:45%;margin-bottom:8px"></div>' +
          '<div class="sk-shimmer sk-line-sm" style="width:60%"></div>' +
        '</div>' +
      '</div>' +
      '<div class="sk-shimmer sk-line-sm" style="width:90%;margin-bottom:6px"></div>' +
      '<div class="sk-shimmer sk-line-sm" style="width:70%;margin-bottom:16px"></div>' +
      '<div style="height:1px;background:rgba(88,166,255,0.1);margin-bottom:14px"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div class="sk-shimmer sk-box" style="height:28px"></div>' +
        '<div class="sk-shimmer sk-box" style="height:28px"></div>' +
        '<div class="sk-shimmer sk-box" style="height:28px"></div>' +
        '<div class="sk-shimmer sk-box" style="height:28px"></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function _pcCustomizerSkeleton() {
  return '<div class="pc-cust-skeleton" style="display:flex;gap:0;height:100%;pointer-events:none">' +
    '<div style="width:360px;flex-shrink:0;padding:24px;border-right:1px solid rgba(88,166,255,0.1)">' +
      '<div class="sk-shimmer sk-line" style="width:60px;margin-bottom:14px"></div>' +
      _pcCardSkeleton() +
    '</div>' +
    '<div style="flex:1;padding:24px;display:flex;flex-direction:column;gap:20px">' +
      '<div>' +
        '<div class="sk-shimmer sk-line" style="width:80px;margin-bottom:10px"></div>' +
        '<div class="sk-shimmer sk-box" style="height:120px"></div>' +
      '</div>' +
      '<div>' +
        '<div class="sk-shimmer sk-line" style="width:60px;margin-bottom:10px"></div>' +
        '<div class="sk-shimmer sk-box" style="height:80px"></div>' +
      '</div>' +
      '<div>' +
        '<div class="sk-shimmer sk-line" style="width:70px;margin-bottom:10px"></div>' +
        '<div class="sk-shimmer sk-box" style="height:100px"></div>' +
      '</div>' +
      '<div>' +
        '<div class="sk-shimmer sk-line" style="width:50px;margin-bottom:10px"></div>' +
        '<div class="sk-shimmer sk-box" style="height:160px"></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:auto">' +
        '<div class="sk-shimmer sk-box" style="height:40px;flex:1"></div>' +
        '<div class="sk-shimmer sk-box" style="height:40px;width:100px"></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

// ── openProfilePopup(uid) ────────────────────────────────────────────────────
// Fetches and displays a profile card in a modal overlay.
function openProfilePopup(uid) {
  if (!uid) return;

  // Remove any existing popup
  var existing = document.getElementById('pcPopupOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id  = 'pcPopupOverlay';
  overlay.className = 'pc-overlay';
  overlay.innerHTML = '<div class="pc-popup-box">' + _pcCardSkeleton() +
    '<button class="pc-close-btn" title="Close">✕</button></div>';
  document.body.appendChild(overlay);

  var box      = overlay.querySelector('.pc-popup-box');
  var closeBtn = overlay.querySelector('.pc-close-btn');

  var close = function() { overlay.remove(); };
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

  apiGet('/profile/' + uid).then(function(data) {
    var sk = box.querySelector('.pc-skeleton-card');
    if (data.hidden) {
      if (sk) sk.outerHTML = '<div class="pc-hidden-msg">🔒 This profile is private.</div>';
      return;
    }
    var content = document.createElement('div');
    renderProfileCard(data, content, {});
    if (sk) sk.replaceWith(content);
    else box.prepend(content);
  }).catch(function() {
    var sk = box.querySelector('.pc-skeleton-card');
    if (sk) sk.outerHTML = '<div class="pc-loading">Failed to load profile.</div>';
  });
}

// ── openOwnProfileCard() ─────────────────────────────────────────────────────
// Opens the current user's own profile card with an edit button.
function openOwnProfileCard() {
  var existing = document.getElementById('pcPopupOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id  = 'pcPopupOverlay';
  overlay.className = 'pc-overlay';
  overlay.innerHTML = '<div class="pc-popup-box">' + _pcCardSkeleton() +
    '<button class="pc-close-btn" title="Close">✕</button></div>';
  document.body.appendChild(overlay);

  var box      = overlay.querySelector('.pc-popup-box');
  var closeBtn = overlay.querySelector('.pc-close-btn');

  var close = function() { overlay.remove(); };
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

  var fetchMe = _pcProfileCache.me && (Date.now() - _pcProfileCache.ts) < _PC_CACHE_TTL
    ? Promise.resolve(_pcProfileCache.me)
    : apiGet('/profile/me');

  fetchMe.then(function(data) {
    _pcCacheStore(data, _pcProfileCache.unlockables);
    var content = document.createElement('div');
    renderProfileCard(data, content, { editable: true });
    var sk = box.querySelector('.pc-skeleton-card');
    if (sk) sk.replaceWith(content);
    else box.prepend(content);
    window._pcOwnProfileData = data;
  }).catch(function() {
    var sk = box.querySelector('.pc-skeleton-card');
    if (sk) sk.outerHTML = '<div class="pc-loading">Failed to load profile.</div>';
  });
}

// ── openProfileCustomizer() ──────────────────────────────────────────────────
// Opens the two-pane customizer overlay.
function openProfileCustomizer() {
  // Close profile popup
  var popup = document.getElementById('pcPopupOverlay');
  if (popup) popup.remove();

  var existing = document.getElementById('pcCustomizerOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id  = 'pcCustomizerOverlay';
  overlay.className = 'pc-customizer-overlay';
  overlay.innerHTML = '<div class="pc-customizer-box">' + _pcCustomizerSkeleton() + '</div>';
  document.body.appendChild(overlay);

  var custBox = overlay.querySelector('.pc-customizer-box');

  if (_pcCacheValid()) {
    _renderCustomizer(custBox, _pcProfileCache.me, _pcProfileCache.unlockables);
  } else {
    var fetchMe2 = _pcProfileCache.me && (Date.now() - _pcProfileCache.ts) < _PC_CACHE_TTL
      ? Promise.resolve(_pcProfileCache.me)
      : apiGet('/profile/me');
    var fetchUl = _pcProfileCache.unlockables
      ? Promise.resolve(_pcProfileCache.unlockables)
      : apiGet('/profile/unlockables');

    Promise.all([fetchMe2, fetchUl]).then(function(results) {
      _pcCacheStore(results[0], results[1]);
      _renderCustomizer(custBox, results[0], results[1]);
    }).catch(function() {
      custBox.innerHTML = '<div class="pc-loading" style="padding:60px 40px">Failed to load customizer.</div>';
    });
  }
}

function _renderCustomizer(box, profileData, unlockables) {
  // Pending state (what's been selected but not saved)
  var pending = {
    cardBackground:  profileData.profile.cardBackground  || 'bg_default',
    cardBorder:      profileData.profile.cardBorder      || 'border_default',
    cardAccentColor: profileData.profile.cardAccentColor || '#4a9eff',
    cardTitle:       profileData.profile.cardTitle       || null,
    showcaseSkin:    profileData.profile.showcaseSkin    || null,
    bio:             profileData.profile.bio             || '',
    cardVisibility:  profileData.profile.cardVisibility  || 'public',
    nameColor:       profileData.profile.nameColor       || 'name_default',
    cardGlow:        profileData.profile.cardGlow        || 'glow_default',
    showcaseBadges:  [
      profileData.profile.showcaseBadge1 || null,
      profileData.profile.showcaseBadge2 || null,
      profileData.profile.showcaseBadge3 || null,
    ],
  };

  // Categorize unlockables
  var bgs        = unlockables.filter(function(u) { return u.type === 'background'; });
  var borders    = unlockables.filter(function(u) { return u.type === 'border'; });
  var titles     = unlockables.filter(function(u) { return u.type === 'title'; });
  var badges     = unlockables.filter(function(u) { return u.type === 'badge'; });
  var nameColors = unlockables.filter(function(u) { return u.type === 'name_color'; });
  var glows      = unlockables.filter(function(u) { return u.type === 'glow'; });

  // User's owned skins — read from localStorage (where game.js stores them)
  var ownedSkins = [];
  try {
    var _lsVal = localStorage.getItem('ownedSkins');
    if (_lsVal) ownedSkins = JSON.parse(_lsVal);
  } catch (e) {}
  if (!ownedSkins.length && window._currentUser && Array.isArray(window._currentUser.ownedSkins)) {
    ownedSkins = window._currentUser.ownedSkins;
  }

  function rebuildPreview() {
    var previewData = JSON.parse(JSON.stringify(profileData));
    previewData.profile.cardBackground  = pending.cardBackground;
    previewData.profile.cardBorder      = pending.cardBorder;
    previewData.profile.cardAccentColor = pending.cardAccentColor;
    previewData.profile.cardTitle       = pending.cardTitle;
    previewData.profile.displayTitle    = pending.cardTitle || profileData.profile.titleOverride || 'title_newcomer';
    previewData.profile.showcaseSkin    = pending.showcaseSkin;
    previewData.profile.bio             = pending.bio;
    previewData.profile.nameColor       = pending.nameColor;
    previewData.profile.cardGlow        = pending.cardGlow;
    var previewEl = document.getElementById('pcCustomizerPreviewCard');
    if (previewEl) renderProfileCard(previewData, previewEl, {});
  }

  function makeBgGrid(searchFilter) {
    var filtered = searchFilter
      ? bgs.filter(function(b) { return b.name.toLowerCase().includes(searchFilter.toLowerCase()); })
      : bgs;

    return filtered.map(function(bg) {
      var sel  = pending.cardBackground === bg.id ? ' pc-selected' : '';
      var lock = !bg.unlocked ? ' pc-locked' : '';
      var tooltip = !bg.unlocked ? ' title="' + _escapeHtml(bg.name) + ' — ' + _escapeHtml(bg.unlock_condition) + '"' : ' title="' + _escapeHtml(bg.name) + '"';
      return '<div class="pc-selector-item' + sel + lock + '" ' +
             'style="background:' + bg.preview_css + '"' + tooltip +
             ' data-bg-id="' + bg.id + '">' +
             (!bg.unlocked
               ? '<div class="pc-locked-icon">🔒<span>' + _escapeHtml(bg.name) + '</span></div>'
               : '<span class="pc-item-name">' + _escapeHtml(bg.name) + '</span>') +
             '</div>';
    }).join('');
  }

  function makeBorderList(searchFilter) {
    var filtered = searchFilter
      ? borders.filter(function(b) { return b.name.toLowerCase().includes(searchFilter.toLowerCase()); })
      : borders;

    return filtered.map(function(brd) {
      var sel  = pending.cardBorder === brd.id ? ' pc-selected' : '';
      var lock = !brd.unlocked ? ' pc-locked' : '';
      var tooltip = !brd.unlocked ? ' title="' + _escapeHtml(brd.unlock_condition) + '"' : '';
      return '<div class="pc-selector-row' + sel + lock + '"' + tooltip + ' data-border-id="' + brd.id + '">' +
             '<div class="pc-border-preview" style="border:' + _escapeHtml(brd.preview_css) + ';background:rgba(88,166,255,0.05)"></div>' +
             _escapeHtml(brd.name) +
             (!brd.unlocked ? ' 🔒' : '') +
             '</div>';
    }).join('');
  }

  function makeTitleList(searchFilter) {
    var filtered = searchFilter
      ? titles.filter(function(t) { return t.name.toLowerCase().includes(searchFilter.toLowerCase()); })
      : titles;

    return filtered.map(function(t) {
      var sel  = pending.cardTitle === t.id ? ' pc-selected' : '';
      var lock = !t.unlocked ? ' pc-locked' : '';
      var tooltip = !t.unlocked ? ' title="' + _escapeHtml(t.unlock_condition) + '"' : '';
      var displayName = PC_TITLE_DISPLAY[t.id] !== undefined ? (PC_TITLE_DISPLAY[t.id] || t.name) : t.name;
      return '<div class="pc-selector-row' + sel + lock + '"' + tooltip + ' data-title-id="' + t.id + '">' +
             _escapeHtml(displayName) +
             (!t.unlocked ? ' 🔒' : '') +
             '</div>';
    }).join('');
  }

  function makeBadgeSlotsHtml() {
    return [0, 1, 2].map(function(i) {
      var bid  = pending.showcaseBadges[i];
      var disp = bid && PC_BADGE_DISPLAY[bid];
      if (disp) {
        return '<div class="pc-cust-badge-slot pc-cust-badge-filled" data-slot="' + i + '" ' +
               'style="background:' + disp.bg + '" title="' + _escapeHtml(disp.name) + ' — click to remove">' +
               '<span class="pc-badge-icon">' + disp.icon + '</span></div>';
      }
      return '<div class="pc-cust-badge-slot pc-badge-empty" data-slot="' + i + '" title="Empty — click a badge below to fill"></div>';
    }).join('');
  }

  function makeBadgeGridHtml() {
    var unlockedBadges = badges.filter(function(b) { return b.unlocked; });
    var lockedBadges   = badges.filter(function(b) { return !b.unlocked; });
    if (!unlockedBadges.length && !lockedBadges.length) {
      return '<div class="pc-no-badges">No badges available yet.</div>';
    }
    var html = unlockedBadges.map(function(b) {
      var disp = PC_BADGE_DISPLAY[b.id];
      if (!disp) return '';
      var isSelected = pending.showcaseBadges.includes(b.id);
      return '<div class="pc-cust-badge-option' + (isSelected ? ' pc-selected' : '') + '" ' +
             'data-badge-id="' + _escapeHtml(b.id) + '" ' +
             'style="background:' + disp.bg + '" title="' + _escapeHtml(disp.name) + '">' +
             '<span class="pc-badge-icon">' + disp.icon + '</span></div>';
    }).join('');
    if (lockedBadges.length) {
      html += lockedBadges.map(function(b) {
        var disp = PC_BADGE_DISPLAY[b.id];
        if (!disp) return '';
        return '<div class="pc-cust-badge-option pc-locked" title="' + _escapeHtml(b.unlock_condition) + '">' +
               '<span class="pc-badge-icon" style="filter:grayscale(1);opacity:0.4">' + disp.icon + '</span>' +
               '<span class="pc-badge-lock">🔒</span></div>';
      }).join('');
    }
    return html || '<div class="pc-no-badges">No badges unlocked yet — keep playing!</div>';
  }

  function makeNameColorList() {
    return nameColors.map(function(nc) {
      var sel  = pending.nameColor === nc.id ? ' pc-selected' : '';
      var lock = !nc.unlocked ? ' pc-locked' : '';
      var tooltip = !nc.unlocked ? ' title="' + _escapeHtml(nc.unlock_condition) + '"' : '';
      var ncVal = PC_NAME_COLORS[nc.id];
      var isAnim = typeof ncVal === 'string' && ncVal.startsWith('ANIMATED:');
      var swatchClass = nc.id === 'name_rainbow' ? ' pc-nc-rainbow' : nc.id === 'name_sovereign' ? ' pc-nc-sovereign' : nc.id === 'name_fire' ? ' pc-nc-fire' : '';
      var swatchStyle = (!isAnim && ncVal) ? 'background:' + ncVal + ';' : '';
      var nameStyle   = (!isAnim && ncVal) ? 'color:' + ncVal + ';font-weight:700' : '';
      return '<div class="pc-selector-row' + sel + lock + '"' + tooltip + ' data-nc-id="' + nc.id + '">' +
             '<div class="pc-nc-swatch' + swatchClass + '" style="' + swatchStyle + '"></div>' +
             '<span style="' + nameStyle + '">' + _escapeHtml(nc.name) + '</span>' +
             (!nc.unlocked ? ' 🔒' : '') +
             '</div>';
    }).join('');
  }

  function makeGlowList() {
    return glows.map(function(g) {
      var sel  = pending.cardGlow === g.id ? ' pc-selected' : '';
      var lock = !g.unlocked ? ' pc-locked' : '';
      var tooltip = !g.unlocked ? ' title="' + _escapeHtml(g.unlock_condition) + '"' : '';
      var gVal = PC_GLOW_STYLES[g.id];
      var isAnim = typeof gVal === 'string' && gVal.startsWith('ANIMATED:');
      var swatchStyle = '';
      if (!isAnim && gVal && gVal !== 'none') {
        // extract color from box-shadow for swatch
        var m = gVal.match(/rgba\([^)]+\)/g);
        swatchStyle = m ? 'box-shadow:' + m[0].replace(/0\.[\d]+\)/, '0.7)') + ' 0 0 8px;background:transparent' : '';
      }
      return '<div class="pc-selector-row' + sel + lock + '"' + tooltip + ' data-glow-id="' + g.id + '">' +
             '<div class="pc-glow-swatch" style="' + swatchStyle + '"></div>' +
             _escapeHtml(g.name) +
             (!g.unlocked ? ' 🔒' : '') +
             '</div>';
    }).join('');
  }

  box.innerHTML =
    '<div class="pc-customizer-preview">' +
      '<h3>Preview</h3>' +
      '<div id="pcCustomizerPreviewCard"></div>' +
    '</div>' +
    '<div class="pc-customizer-controls" id="pcCustomizerControls">' +

      // Background
      '<div class="pc-ctrl-section">' +
        '<div class="pc-ctrl-label">Background</div>' +
        '<input type="text" class="pc-ctrl-search" id="pcBgSearch" placeholder="Search backgrounds...">' +
        '<div class="pc-selector-grid" id="pcBgGrid">' + makeBgGrid('') + '</div>' +
      '</div>' +

      // Border
      '<div class="pc-ctrl-section">' +
        '<div class="pc-ctrl-label">Border</div>' +
        '<div class="pc-selector-list" id="pcBorderList">' + makeBorderList('') + '</div>' +
      '</div>' +

      // Title
      '<div class="pc-ctrl-section">' +
        '<div class="pc-ctrl-label">Title</div>' +
        '<div class="pc-selector-list" id="pcTitleList">' + makeTitleList('') + '</div>' +
      '</div>' +

      // Badges
      '<div class="pc-ctrl-section">' +
        '<div class="pc-ctrl-label">Badges <span style="font-size:10px;opacity:0.5">(pick up to 3)</span></div>' +
        '<div class="pc-cust-badge-slots" id="pcBadgeSlots">' + makeBadgeSlotsHtml() + '</div>' +
        '<div class="pc-cust-badge-grid" id="pcBadgeGrid">' + makeBadgeGridHtml() + '</div>' +
      '</div>' +

      // Accent color
      '<div class="pc-ctrl-section">' +
        '<div class="pc-ctrl-label">Accent Color</div>' +
        '<div class="pc-color-row">' +
          '<input type="color" class="pc-color-input" id="pcAccentColor" value="' + _escapeHtml(pending.cardAccentColor) + '">' +
          '<span class="pc-color-hex" id="pcColorHex">' + _escapeHtml(pending.cardAccentColor) + '</span>' +
        '</div>' +
        '<div class="pc-color-presets" id="pcColorPresets">' +
          ['#4a9eff','#ff4a6a','#4aff9e','#ffcc00','#ff6a00','#cc44ff','#00e5ff','#ff44cc','#ffffff','#7fffaa'].map(function(c) {
            var sel = pending.cardAccentColor === c ? ' pc-selected' : '';
            return '<div class="pc-color-preset' + sel + '" data-color="' + c + '" style="background:' + c + '" title="' + c + '"></div>';
          }).join('') +
        '</div>' +
      '</div>' +

      // Name Color
      '<div class="pc-ctrl-section">' +
        '<div class="pc-ctrl-label">Name Color</div>' +
        '<div class="pc-selector-list" id="pcNameColorList">' + makeNameColorList() + '</div>' +
      '</div>' +

      // Card Glow
      '<div class="pc-ctrl-section">' +
        '<div class="pc-ctrl-label">Card Glow</div>' +
        '<div class="pc-selector-list" id="pcGlowList">' + makeGlowList() + '</div>' +
      '</div>' +

      // Showcase skin
      '<div class="pc-ctrl-section">' +
        '<div class="pc-ctrl-label">Showcase Skin</div>' +
        '<div class="pc-skin-grid" id="pcSkinGrid">Loading skins...</div>' +
      '</div>' +

      // Bio
      '<div class="pc-ctrl-section">' +
        '<div class="pc-ctrl-label">Bio</div>' +
        '<div class="pc-bio-wrap">' +
          '<textarea class="pc-bio-input" id="pcBioInput" maxlength="120" placeholder="Write a short bio...">' +
            _escapeHtml(pending.bio) +
          '</textarea>' +
          '<span class="pc-bio-counter" id="pcBioCounter">' + (pending.bio || '').length + '/120</span>' +
        '</div>' +
      '</div>' +

      // Visibility
      '<div class="pc-ctrl-section">' +
        '<div class="pc-ctrl-label">Visibility</div>' +
        '<div class="pc-visibility-row">' +
          '<button class="pc-vis-btn' + (pending.cardVisibility === 'public'  ? ' pc-selected' : '') + '" data-vis="public">Public</button>' +
          '<button class="pc-vis-btn' + (pending.cardVisibility === 'friends' ? ' pc-selected' : '') + '" data-vis="friends">Friends</button>' +
          '<button class="pc-vis-btn' + (pending.cardVisibility === 'private' ? ' pc-selected' : '') + '" data-vis="private">Private</button>' +
        '</div>' +
      '</div>' +

      // Footer buttons
      '<div class="pc-customizer-footer">' +
        '<button class="pc-save-btn" id="pcSaveBtn">Save Profile</button>' +
        '<button class="pc-cancel-btn" id="pcCancelBtn">Cancel</button>' +
      '</div>' +

    '</div>';  // end controls

  // Initial preview render
  rebuildPreview();

  // Populate skin grid
  var skinGrid = document.getElementById('pcSkinGrid');
  if (skinGrid) {
    // Filter out mutation variants — show base skins only
    var baseSkins = ownedSkins.filter(function(sid) { return !sid.includes('__'); });
    if (baseSkins.length === 0) {
      skinGrid.innerHTML = '<div style="font-size:12px;color:rgba(255,255,255,0.4);grid-column:1/-1">No skins owned yet.</div>';
    } else {
      skinGrid.innerHTML = baseSkins.map(function(sid) {
        var sel = pending.showcaseSkin === sid ? ' pc-selected' : '';
        return '<div class="pc-skin-cell' + sel + '" data-skin-id="' + _escapeHtml(sid) + '" title="' + _escapeHtml(sid) + '"></div>';
      }).join('');
      baseSkins.forEach(function(sid) {
        var el = skinGrid.querySelector('[data-skin-id="' + sid + '"]');
        if (el && typeof applyRichSkinPreview === 'function') {
          var skinData = typeof SKINS !== 'undefined' ? SKINS.find(function(s) { return s.id === sid; }) : null;
          applyRichSkinPreview(el, sid, skinData ? skinData.color : null);
        }
      });
    }
  }

  // ── Event Wiring ──────────────────────────────────────────────────────────

  // Background search
  var bgSearch = document.getElementById('pcBgSearch');
  if (bgSearch) {
    bgSearch.addEventListener('input', function() {
      var grid = document.getElementById('pcBgGrid');
      if (grid) grid.innerHTML = makeBgGrid(this.value);
    });
  }

  // Background select (delegated)
  var bgGrid = document.getElementById('pcBgGrid');
  if (bgGrid) {
    bgGrid.addEventListener('click', function(e) {
      var item = e.target.closest('[data-bg-id]');
      if (!item || item.classList.contains('pc-locked')) return;
      pending.cardBackground = item.dataset.bgId;
      bgGrid.querySelectorAll('[data-bg-id]').forEach(function(el) { el.classList.remove('pc-selected'); });
      item.classList.add('pc-selected');
      rebuildPreview();
    });
  }

  // Border select
  var borderList = document.getElementById('pcBorderList');
  if (borderList) {
    borderList.addEventListener('click', function(e) {
      var item = e.target.closest('[data-border-id]');
      if (!item || item.classList.contains('pc-locked')) return;
      pending.cardBorder = item.dataset.borderId;
      borderList.querySelectorAll('[data-border-id]').forEach(function(el) { el.classList.remove('pc-selected'); });
      item.classList.add('pc-selected');
      rebuildPreview();
    });
  }

  // Title select
  var titleList = document.getElementById('pcTitleList');
  if (titleList) {
    titleList.addEventListener('click', function(e) {
      var item = e.target.closest('[data-title-id]');
      if (!item || item.classList.contains('pc-locked')) return;
      pending.cardTitle = item.dataset.titleId;
      titleList.querySelectorAll('[data-title-id]').forEach(function(el) { el.classList.remove('pc-selected'); });
      item.classList.add('pc-selected');
      rebuildPreview();
    });
  }

  // Badge grid — toggle on/off
  var badgeGrid = document.getElementById('pcBadgeGrid');
  if (badgeGrid) {
    badgeGrid.addEventListener('click', function(e) {
      var item = e.target.closest('[data-badge-id]');
      if (!item || item.classList.contains('pc-locked')) return;
      var bid = item.dataset.badgeId;
      var idx = pending.showcaseBadges.indexOf(bid);
      if (idx !== -1) {
        // Already selected — remove it
        pending.showcaseBadges[idx] = null;
      } else {
        // Add to first empty slot; if all full, replace slot 0
        var emptyIdx = pending.showcaseBadges.indexOf(null);
        if (emptyIdx !== -1) {
          pending.showcaseBadges[emptyIdx] = bid;
        } else {
          pending.showcaseBadges[0] = bid;
        }
      }
      document.getElementById('pcBadgeSlots').innerHTML = makeBadgeSlotsHtml();
      document.getElementById('pcBadgeGrid').innerHTML  = makeBadgeGridHtml();
      rebuildPreview();
    });
  }

  // Badge slots — click to clear
  var badgeSlotsEl = document.getElementById('pcBadgeSlots');
  if (badgeSlotsEl) {
    badgeSlotsEl.addEventListener('click', function(e) {
      var slot = e.target.closest('[data-slot]');
      if (!slot || !slot.classList.contains('pc-cust-badge-filled')) return;
      pending.showcaseBadges[Number(slot.dataset.slot)] = null;
      document.getElementById('pcBadgeSlots').innerHTML = makeBadgeSlotsHtml();
      document.getElementById('pcBadgeGrid').innerHTML  = makeBadgeGridHtml();
      rebuildPreview();
    });
  }

  // Accent color
  var colorInput = document.getElementById('pcAccentColor');
  var colorHex   = document.getElementById('pcColorHex');
  if (colorInput) {
    colorInput.addEventListener('input', function() {
      pending.cardAccentColor = this.value;
      if (colorHex) colorHex.textContent = this.value;
      // Deselect presets
      var presets = document.getElementById('pcColorPresets');
      if (presets) presets.querySelectorAll('.pc-color-preset').forEach(function(el) { el.classList.remove('pc-selected'); });
      rebuildPreview();
    });
  }

  // Accent color presets
  var colorPresets = document.getElementById('pcColorPresets');
  if (colorPresets) {
    colorPresets.addEventListener('click', function(e) {
      var dot = e.target.closest('[data-color]');
      if (!dot) return;
      var c = dot.dataset.color;
      pending.cardAccentColor = c;
      if (colorInput) colorInput.value = c;
      if (colorHex) colorHex.textContent = c;
      colorPresets.querySelectorAll('.pc-color-preset').forEach(function(el) { el.classList.remove('pc-selected'); });
      dot.classList.add('pc-selected');
      rebuildPreview();
    });
  }

  // Name Color
  var nameColorList = document.getElementById('pcNameColorList');
  if (nameColorList) {
    nameColorList.addEventListener('click', function(e) {
      var item = e.target.closest('[data-nc-id]');
      if (!item || item.classList.contains('pc-locked')) return;
      pending.nameColor = item.dataset.ncId;
      nameColorList.querySelectorAll('[data-nc-id]').forEach(function(el) { el.classList.remove('pc-selected'); });
      item.classList.add('pc-selected');
      rebuildPreview();
    });
  }

  // Card Glow
  var glowList = document.getElementById('pcGlowList');
  if (glowList) {
    glowList.addEventListener('click', function(e) {
      var item = e.target.closest('[data-glow-id]');
      if (!item || item.classList.contains('pc-locked')) return;
      pending.cardGlow = item.dataset.glowId;
      glowList.querySelectorAll('[data-glow-id]').forEach(function(el) { el.classList.remove('pc-selected'); });
      item.classList.add('pc-selected');
      rebuildPreview();
    });
  }

  // Skin grid select
  var skinGridEl = document.getElementById('pcSkinGrid');
  if (skinGridEl) {
    skinGridEl.addEventListener('click', function(e) {
      var item = e.target.closest('[data-skin-id]');
      if (!item) return;
      pending.showcaseSkin = item.dataset.skinId;
      skinGridEl.querySelectorAll('[data-skin-id]').forEach(function(el) { el.classList.remove('pc-selected'); });
      item.classList.add('pc-selected');
      rebuildPreview();
    });
  }

  // Bio
  var bioInput    = document.getElementById('pcBioInput');
  var bioCounter  = document.getElementById('pcBioCounter');
  if (bioInput) {
    bioInput.addEventListener('input', function() {
      pending.bio = this.value.slice(0, 120);
      if (bioCounter) bioCounter.textContent = pending.bio.length + '/120';
      rebuildPreview();
    });
  }

  // Visibility
  var visRow = box.querySelector('.pc-visibility-row');
  if (visRow) {
    visRow.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-vis]');
      if (!btn) return;
      pending.cardVisibility = btn.dataset.vis;
      visRow.querySelectorAll('[data-vis]').forEach(function(el) { el.classList.remove('pc-selected'); });
      btn.classList.add('pc-selected');
    });
  }

  // Save
  var saveBtn = document.getElementById('pcSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      apiPost('/profile/update', {
        cardBackground:  pending.cardBackground,
        cardBorder:      pending.cardBorder,
        cardAccentColor: pending.cardAccentColor,
        cardTitle:       pending.cardTitle,
        showcaseSkin:    pending.showcaseSkin,
        showcaseBadges:  pending.showcaseBadges,
        bio:             pending.bio,
        cardVisibility:  pending.cardVisibility,
        nameColor:       pending.nameColor,
        cardGlow:        pending.cardGlow,
      }).then(function(res) {
        if (res.success) {
          var custOverlay = document.getElementById('pcCustomizerOverlay');
          if (custOverlay) custOverlay.remove();
          _pcCacheInvalidate();
          openOwnProfileCard();
        } else {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Profile';
          alert(res.error || 'Failed to save profile.');
        }
      }).catch(function() {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Profile';
        alert('Network error. Please try again.');
      });
    });
  }

  // Cancel
  var cancelBtn = document.getElementById('pcCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function() {
      var custOverlay = document.getElementById('pcCustomizerOverlay');
      if (custOverlay) custOverlay.remove();
    });
  }
}

// ── showUnlockToast(unlockableId, unlockName) ─────────────────────────────────
function showUnlockToast(unlockableId, unlockName) {
  var toast = document.createElement('div');
  toast.className = 'pc-unlock-toast';
  toast.innerHTML =
    '<div class="pc-toast-icon">🎉</div>' +
    '<div class="pc-toast-text">' +
      '<div class="pc-toast-title">New Profile Unlock!</div>' +
      _escapeHtml(unlockName || unlockableId) +
    '</div>';
  document.body.appendChild(toast);
  setTimeout(function() {
    toast.style.transition = 'opacity 0.5s';
    toast.style.opacity    = '0';
    setTimeout(function() { toast.remove(); }, 500);
  }, 4000);
}

// ── handleNewUnlocks(newUnlocks) ──────────────────────────────────────────────
// Call from game end / ranked submit callbacks when response.newUnlocks is set.
function handleNewUnlocks(newUnlocks) {
  if (!Array.isArray(newUnlocks) || !newUnlocks.length) return;

  // Map IDs to display names
  var NAMES = {};
  for (var k in PC_TITLE_DISPLAY) { if (PC_TITLE_DISPLAY[k]) NAMES[k] = PC_TITLE_DISPLAY[k]; }
  // Supplement with background/border names (hardcoded short version)
  var BG_NAMES = {
    'bg_galaxy':'Galaxy Background', 'bg_sovereign':'Sovereign Background',
    'bg_inferno':'Inferno Background', 'bg_collector':'Collector Background',
    'bg_whale':'Big Spender Background', 'bg_veteran':'Veteran Background',
    'bg_bronze':'Bronze Background', 'bg_silver':'Silver Background',
    'bg_gold':'Gold Background', 'bg_platinum':'Platinum Background',
    'bg_diamond':'Diamond Background', 'bg_seasonal_s1':'Season 1 Background',
  };
  var BRD_NAMES = {
    'border_silver':'Silver Border', 'border_gold':'Gold Border',
    'border_diamond':'Diamond Border', 'border_animated_pulse':'Pulse Border',
    'border_prismatic':'Prismatic Border', 'border_champion':'Champion Border',
    'border_oblivion':'Oblivion Border',
  };
  Object.assign(NAMES, BG_NAMES, BRD_NAMES);

  // Show toast for each (staggered)
  newUnlocks.forEach(function(id, idx) {
    setTimeout(function() {
      showUnlockToast(id, NAMES[id] || id);
    }, idx * 1200);
  });

  // Pulse the My Profile button
  var btn = document.getElementById('myProfileBtn');
  if (btn) {
    btn.classList.add('pc-pulse');
    setTimeout(function() { btn.classList.remove('pc-pulse'); }, 5000);
  }
}

// ── showMiniProfileCard(uid, anchorEl) ────────────────────────────────────────
// Shows a compact mini profile card anchored near the given element.
var _miniCardTimer = null;
var _miniCardEl    = null;

function showMiniProfileCard(uid, anchorEl) {
  clearTimeout(_miniCardTimer);
  if (_miniCardEl) { _miniCardEl.remove(); _miniCardEl = null; }

  apiGet('/profile/' + uid).then(function(data) {
    if (data.hidden) return;

    var mini = document.createElement('div');
    mini.className = 'pc-mini-card';
    renderProfileCard(data, mini, { compact: true });

    // Position below the anchor element
    var rect = anchorEl.getBoundingClientRect();
    mini.style.top  = (rect.bottom + window.scrollY + 6) + 'px';
    mini.style.left = rect.left + 'px';

    document.body.appendChild(mini);
    _miniCardEl = mini;
  }).catch(function() {});
}

function hideMiniProfileCard() {
  _miniCardTimer = setTimeout(function() {
    if (_miniCardEl) { _miniCardEl.remove(); _miniCardEl = null; }
  }, 200);
}
