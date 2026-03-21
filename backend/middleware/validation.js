// middleware/validation.js — Server-side username profanity filter
// Mirrors the client-side filter from anticheat.js

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
  const trimmed = (username || '').trim();
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

module.exports = { validateUsername, normalizeUsername };
