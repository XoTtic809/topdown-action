// anticheat.js — username filter + score validation

const BAD_WORDS = [
  // slurs & hate speech
  'nigger','nigga','faggot','fag','dyke','tranny','chink','spic','kike','wetback',
  'gook','cracker','beaner','coon','towelhead','sandnigger','raghead','redskin',
  // sexual
  'fuck','shit','ass','bitch','cunt','dick','cock','pussy','whore','slut',
  'blowjob','handjob','cumshot','penis','vagina','dildo','masturbate','anal',
  'porno','porn','xxx','hentai','nude','naked','boobs','titties','tits',
  // violence / threats
  'kill','murder','rape','terrorist','jihad','isis','nazi','hitler','kkk',
  // impersonation
  'admin','moderator','mod','developer','dev','staff','official','ethan','owner',
];

const LEET_MAP = {
  '0':'o','1':'i','3':'e','4':'a','5':'s','6':'g','7':'t','8':'b','@':'a',
  '$':'s','!':'i','|':'l','(':'c','+':'t','#':'h'
};

function normalizeUsername(name) {
  return name
    .toLowerCase()
    .split('').map(c => LEET_MAP[c] || c).join('')
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/[^a-z0-9]/g, '');
}

function validateUsername(username) {
  const trimmed = username.trim();
  if (trimmed.length < 3)  return { ok: false, reason: 'Username must be at least 3 characters.' };
  if (trimmed.length > 20) return { ok: false, reason: 'Username must be 20 characters or fewer.' };
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(trimmed))
    return { ok: false, reason: 'Username may only contain letters, numbers, spaces, underscores, hyphens, and periods.' };
  if (!/^[a-zA-Z0-9]/.test(trimmed))
    return { ok: false, reason: 'Username must start with a letter or number.' };

  const normalized = normalizeUsername(trimmed);
  for (const word of BAD_WORDS) {
    if (normalized.includes(word))
      return { ok: false, reason: 'That username is not allowed. Please choose a different one.' };
  }
  return { ok: true };
}

// mirrors game.js values — update if game mechanics change
const AC_GAME = {
  enemiesNeeded: w => w * 5 + 12,
  spawnRate:     w => Math.max(0.25, 1.0 - w * 0.05),
  waveBreak:     2,
  bossCountdown: 3,
  bossScore: (w, type) => {
    if (type === 4) return 5500 + w * 700;
    if (type === 3) return 3000 + w * 400;
    if (type === 2) return 1500 + w * 250;
    return 600 + w * 120;
  },
  bossCoins: (w, type) => {
    if (type === 4) return 150 + w * 15;
    if (type === 3) return 75  + w * 8;
    if (type === 2) return 40  + w * 5;
    return 20 + w * 3;
  },
  waveBonus:     w => (w + 1) * 60,
  waveCoinBonus: w => Math.min(w, 20) * 5 + Math.max(0, w - 20) * 2,
  maxPowerupScore: 9 * 150,
};

// ceiling score for wave W — every enemy treated as miniboss, every boss as legendary, +30% padding
function maxPlausibleScore(waveReached) {
  const W = Math.max(1, waveReached);
  let s = 0;
  for (let w = 1; w < W; w++) {
    s += AC_GAME.enemiesNeeded(w) * 100;
    s += AC_GAME.waveBonus(w);
    if (w % 5 === 0) s += AC_GAME.bossScore(w, 4);
  }
  s += AC_GAME.enemiesNeeded(W) * 100;
  s += AC_GAME.maxPowerupScore;
  return Math.floor(s * 1.3);
}

// "good but suspicious" threshold — scores above this get flagged for review (not rejected)
function flagThresholdScore(waveReached) {
  return Math.floor(maxPlausibleScore(waveReached) * 0.85);
}

function maxPlausibleKills(waveReached) {
  const W = Math.max(1, waveReached);
  let k = 0;
  for (let w = 1; w <= W; w++) k += AC_GAME.enemiesNeeded(w);
  return Math.floor(k * 1.5); // 50% buffer for nuke kills etc.
}

// minimum real time to reach wave W, reduced 30% to avoid false flags
function minPlausibleGameTime(waveReached) {
  if (waveReached <= 1) return 8;
  const W = Math.max(1, waveReached);
  let t = 0;
  for (let w = 1; w < W; w++) {
    t += AC_GAME.enemiesNeeded(w) * AC_GAME.spawnRate(w);
    if (w % 5 === 0) {
      t += AC_GAME.bossCountdown;
      const bossHp = w % 20 === 0 ? (270 + w * 44) :
                     w % 10 === 0 ? (150 + w * 45) :
                                    (60  + w * 25);
      t += Math.max(5, bossHp / 18);
    } else {
      t += AC_GAME.waveBreak;
    }
  }
  return Math.max(8, Math.floor(t * 0.70));
}

function maxPlausibleCoins(waveReached) {
  const W = Math.max(1, waveReached);
  let c = 0;
  for (let w = 1; w < W; w++) {
    c += AC_GAME.enemiesNeeded(w) * 8;
    c += AC_GAME.waveCoinBonus(w);
    if (w % 5 === 0) c += AC_GAME.bossCoins(w, 4);
  }
  c += AC_GAME.enemiesNeeded(W) * 8;
  return Math.floor(c * 1.4);
}

const gameSession = {
  token:        null,
  startTime:    null,
  endTime:      null,
  waveReached:  1,
  totalKills:   0,
  submitted:    false,
  coinsAtStart: 0,
};

function acSessionStart() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  gameSession.token        = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  gameSession.startTime    = Date.now();
  gameSession.endTime      = null;
  gameSession.waveReached  = 1;
  gameSession.totalKills   = 0;
  gameSession.submitted    = false;
  gameSession.coinsAtStart = (typeof playerCoins !== 'undefined') ? playerCoins : 0;
}

const MAX_SESSION_COINS = 5000;

function acSessionEnd(waveReached, kills) {
  gameSession.endTime     = Date.now();
  gameSession.waveReached = waveReached;
  gameSession.totalKills  = kills;

  // Enforce session coin cap — clamp earnings to MAX_SESSION_COINS
  if (typeof playerCoins !== 'undefined' && typeof gameSession.coinsAtStart === 'number') {
    const earned = playerCoins - gameSession.coinsAtStart;
    if (earned > MAX_SESSION_COINS) {
      playerCoins = gameSession.coinsAtStart + MAX_SESSION_COINS;
      if (typeof saveCoins === 'function') saveCoins();
    }
  }
}

let _lastSubmitTime = 0;

function validateScore(score, waveReached, gameDurationMs, totalKills) {
  const sec = gameDurationMs / 1000;
  const W   = Math.max(1, waveReached);

  // --- hard rejections: definitely invalid data ---
  if (!Number.isFinite(score) || score < 0)
    return { valid: false, reason: `Invalid score value: ${score}`, severity: 'reject' };

  if (!Number.isFinite(W) || W < 1)
    return { valid: false, reason: `Invalid wave value: ${waveReached}`, severity: 'reject' };

  const maxScore = maxPlausibleScore(W);

  // AUTO-BAN: more than 2x the theoretical maximum (tightened from 4x)
  if (score > maxScore * 2)
    return { valid: false,
      reason: `Score ${score.toLocaleString()} is mathematically impossible at wave ${W} (ban ceiling: ${(maxScore*2).toLocaleString()})`,
      severity: 'ban' };

  // REJECT: exceeds theoretical ceiling for this wave
  if (score > maxScore)
    return { valid: false,
      reason: `Score ${score.toLocaleString()} exceeds ceiling ${maxScore.toLocaleString()} at wave ${W}`,
      severity: 'reject' };

  if (W === 1 && score > 3500)
    return { valid: false,
      reason: `Score ${score} is impossible on wave 1 (hard cap ~3500)`,
      severity: 'reject' };

  if (totalKills > 0) {
    const maxKills = maxPlausibleKills(W);
    if (totalKills > maxKills)
      return { valid: false,
        reason: `${totalKills} kills impossible at wave ${W} (max: ${maxKills})`,
        severity: 'reject' };

    // tightened from 300 to 200 — bosses are rare; avg ratio realistically 60-150
    const scorePerKill = score / totalKills;
    if (scorePerKill > 200)
      return { valid: false,
        reason: `Score per kill (${scorePerKill.toFixed(1)}) is suspiciously high at wave ${W}`,
        severity: 'reject' };
  }

  if (sec > 0) {
    const minTime = minPlausibleGameTime(W);
    if (sec < minTime)
      return { valid: false,
        reason: `Game duration ${sec.toFixed(0)}s is too short for wave ${W} (min: ${minTime}s)`,
        severity: 'reject' };
  }

  // duplicate submission guard
  if (_lastSubmitTime && Date.now() - _lastSubmitTime < 5000)
    return { valid: false, reason: 'Duplicate submission too fast', severity: 'reject' };

  // SOFT FLAG (score passes, but admin should review): top 85% of ceiling for this wave
  const flagThreshold = flagThresholdScore(W);
  if (score > flagThreshold)
    return { valid: true, flag: true,
      reason: `Exceptional score ${score.toLocaleString()} at wave ${W} — above 85% of ceiling (${flagThreshold.toLocaleString()}). Auto-flagged for review.` };

  return { valid: true };
}

function validateCoins(totalCoins, waveReached) {
  if (!Number.isFinite(totalCoins) || totalCoins < 0)
    return { valid: false, reason: `Invalid coin value: ${totalCoins}`, severity: 'reject' };

  // coins from this session only
  const coinsEarned = totalCoins - (gameSession.coinsAtStart || 0);
  if (coinsEarned <= 0) return { valid: true };

  const maxCoins = maxPlausibleCoins(waveReached);
  if (coinsEarned > maxCoins * 3)
    return { valid: false,
      reason: `Earned ${coinsEarned} coins in one session (max expected: ${maxCoins})`,
      severity: 'ban' };

  if (coinsEarned > maxCoins)
    return { valid: false,
      reason: `Earned ${coinsEarned} coins in one session (ceiling: ${maxCoins})`,
      severity: 'flag' };

  return { valid: true };
}

function maxPlausibleXP(waveReached, totalKills, matchTime) {
  const W = Math.max(1, waveReached);
  let xp = 0;
  xp += (W - 1) * 22; // wave XP
  xp += (W - 1) * 20; // wave bonus XP
  xp += totalKills * 8; // kill XP
  xp += 30; // match completion
  return Math.ceil(xp * 1.5);
}

function validateXP(xpEarned, waveReached, totalKills, matchTime) {
  if (!Number.isFinite(xpEarned) || xpEarned < 0)
    return { valid: false, reason: `Invalid XP value: ${xpEarned}`, severity: 'reject' };

  const maxXP = maxPlausibleXP(waveReached, totalKills, matchTime);
  if (xpEarned > maxXP)
    return { valid: false,
      reason: `Earned ${xpEarned} XP in ${waveReached} waves with ${totalKills} kills (max expected: ${maxXP})`,
      severity: 'reject' };

  return { valid: true };
}

async function acSubmitScore(score) {
  if (!currentUser || isGuest) return;

  const durationMs = (gameSession.endTime || Date.now()) - (gameSession.startTime || Date.now());
  const durationSec = Math.round(durationMs / 1000);

  if (isAdmin) {
    await submitScoreToLeaderboard(score, gameSession.waveReached, gameSession.totalKills, durationSec);
    return;
  }
  if (gameSession.submitted) { console.warn('[AC] Duplicate submission blocked'); return; }
  if (!gameSession.startTime) { console.warn('[AC] No session — not submitted'); return; }

  // Sanitize score: if NaN propagated from a game bug, treat as 0
  const safeScore = Number.isFinite(score) ? score : 0;

  const result = validateScore(safeScore, gameSession.waveReached, durationMs, gameSession.totalKills);

  if (!result.valid) {
    console.warn(`[AC] ${result.severity.toUpperCase()}: ${result.reason}`);
    await acLogViolation(safeScore, result.reason, result.severity, 'score');
    if (result.severity === 'ban') await acAutoBan(result.reason);
    return;
  }

  _lastSubmitTime = Date.now();
  gameSession.submitted = true;

  // Pass wave/kills/duration so the leaderboard entry is auditable
  await submitScoreToLeaderboard(safeScore, gameSession.waveReached, gameSession.totalKills, durationSec);

  // If anticheat returned a soft flag, log it for admin review (score still counts)
  if (result.flag) {
    console.warn(`[AC] SOFT FLAG: ${result.reason}`);
    await acLogViolation(safeScore, result.reason, 'flag', 'score');
  }

  // coin check — non-blocking, just flags anomalies
  if (typeof playerCoins !== 'undefined') {
    const cr = validateCoins(playerCoins, gameSession.waveReached);
    if (!cr.valid) {
      console.warn(`[AC] Coin flag: ${cr.reason}`);
      await acLogViolation(playerCoins, cr.reason, cr.severity, 'coins');
    }
  }
}

async function acAutoBan(reason) {
  if (!currentUser) return;
  try {
    // Use the Railway ban endpoint (banUser is defined in api-auth.js)
    await banUser(currentUser.uid, `[AUTO-BAN] ${reason}`);
    console.warn('[AC] User auto-banned');
    // Clear session and force re-auth
    localStorage.removeItem('topdown_token');
    alert('Your account has been banned for submitting an impossible score.\n\nIf you think this is a mistake, contact the developer.');
    location.reload();
  } catch (err) {
    console.error('[AC] Auto-ban failed:', err);
  }
}

function acLogViolation(value, reason, severity, type = 'score') {
  if (!currentUser) return;
  const sessionDuration = gameSession.endTime && gameSession.startTime
    ? Math.round((gameSession.endTime - gameSession.startTime) / 1000) : null;
  const killRate = gameSession.totalKills > 0 && sessionDuration
    ? +(gameSession.totalKills / sessionDuration).toFixed(2) : null;

  // Log violation details to console for debugging
  console.warn(`[AC] VIOLATION [${severity.toUpperCase()}] ${type}=${value}`, {
    uid:     currentUser.uid,
    wave:    gameSession.waveReached,
    kills:   gameSession.totalKills,
    duration: sessionDuration,
    killRate,
    reason,
  });
}

function displayFlaggedScores() {
  const listEl = document.getElementById('flaggedScoresList');
  if (!listEl || !isAdmin) return;
  listEl.innerHTML = '<div class="loading-spinner">Flagged score logging is console-only in this build.</div>';
}

// acDebug(10) — logs all thresholds for a given wave (admin console only)
function acDebug(wave) {
  if (!isAdmin) { console.log('Admin only'); return; }
  const max   = maxPlausibleScore(wave);
  const flag  = flagThresholdScore(wave);
  const minT  = minPlausibleGameTime(wave);
  const maxK  = maxPlausibleKills(wave);
  const maxC  = maxPlausibleCoins(wave);
  console.group(`[AC Debug] Wave ${wave}`);
  console.log(`Soft-flag threshold: ${flag.toLocaleString()} pts (85% of ceiling)`);
  console.log(`Reject ceiling:      ${max.toLocaleString()} pts`);
  console.log(`Ban ceiling:         ${(max*2).toLocaleString()} pts (2x reject)`);
  console.log(`Min game time:       ${minT}s (${(minT/60).toFixed(1)} min)`);
  console.log(`Max kills:           ${maxK}`);
  console.log(`Max coins/sess:      ${maxC.toLocaleString()}`);
  console.groupEnd();
  return { flag, max, ban: max*2, minTime: minT, maxKills: maxK, maxCoins: maxC };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}