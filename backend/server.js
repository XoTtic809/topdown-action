// server.js
require('dotenv').config();

// ─── Validate critical environment variables ───────────────────
// Catches placeholder values before they silently break auth or the DB.
(function validateEnv() {
  const missing = [];

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('postgresql://USER:')) {
    missing.push('DATABASE_URL (copy from Railway Postgres → Variables tab)');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('REPLACE_')) {
    missing.push('JWT_SECRET (run: openssl rand -base64 32)');
  }

  if (missing.length) {
    console.error('\n[Boot] FATAL — the following env vars are missing or still set to their placeholder values:');
    missing.forEach(v => console.error(`  • ${v}`));
    console.error('\nSet them in your .env file (local) or Railway Variables (production) and restart.\n');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGIN) {
    console.warn('\n[Boot] WARNING — ALLOWED_ORIGIN is not set. CORS is open to all origins (*).');
    console.warn('  Set ALLOWED_ORIGIN to your frontend URL in Railway Variables for security.\n');
  }
})();

const express      = require('express');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const http         = require('http');
const { Server }   = require('socket.io');
const jwt          = require('jsonwebtoken');
const { initSchema } = require('./config/db');

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

app.set('io', io); // make io accessible from route handlers
// Trust Railway's reverse proxy so req.ip is the real client IP.
// Without this, all requests appear to come from the same proxy IP,
// which causes rate limiters to share one bucket across ALL users.
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10kb' }));

// Health check must be before HTTPS redirect so Railway's internal probe works
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ─── HTTPS enforcement (Railway terminates TLS and sets this header) ───
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// ─── Security headers ─────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — slow down' },
}));

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many trade requests — please wait' },
});

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth',               require('./routes/auth'));
app.use('/api/users',              require('./routes/users'));
app.use('/api/marketplace',        require('./routes/marketplace'));
app.use('/api/leaderboard',        require('./routes/leaderboard'));
app.use('/api/battlepass',         require('./routes/battlepass'));
app.use('/api/announcements',      require('./routes/announcements'));
app.use('/api/trade-restrictions', require('./routes/traderestrictions'));
app.use('/api/reports',            require('./routes/reports'));
app.use('/api/chat',               require('./routes/chat'));
app.use('/api/ranked',             require('./routes/ranked'));
app.use('/api/trades',             require('./routes/trades'));
app.use('/api/crates',             require('./routes/crates'));
app.use('/api/shop',               require('./routes/shop'));
app.use('/api/admin/rotation',     require('./routes/admin-rotation'));
app.use('/api/profile',            require('./routes/profile'));
app.use('/api/features',           require('./routes/features'));
app.use('/api/blackjack',          require('./routes/blackjack'));
app.use('/api/ridethebus',         require('./routes/ridethebus'));
app.use('/api/slots',              require('./routes/slots'));
app.use('/api/poker',              require('./routes/poker'));

app.post('/api/marketplace/buy',    writeLimiter);
app.post('/api/marketplace/list',   writeLimiter);
app.post('/api/marketplace/cancel', writeLimiter);

// ─── DEV-ONLY: promote account to admin ───────────────────────
// Disabled automatically in production (NODE_ENV=production).
// Used for local testing so you don't need direct DB access.
if (process.env.NODE_ENV !== 'production') {
  const DEV_KEY = process.env.DEV_ADMIN_KEY || 'topdown-local-dev';

  app.post('/api/dev/promote-admin', async (req, res) => {
    const { email, devKey } = req.body || {};
    if (devKey !== DEV_KEY) {
      return res.status(403).json({ error: 'Invalid dev key' });
    }
    if (!email) return res.status(400).json({ error: 'email required' });
    try {
      const { query } = require('./config/db');
      const { rows } = await query(
        `UPDATE users SET is_admin = TRUE WHERE LOWER(email) = LOWER($1) RETURNING uid, username, email`,
        [email.trim()]
      );
      if (!rows[0]) return res.status(404).json({ error: 'No account found with that email' });
      console.log(`[Dev] Promoted ${rows[0].username} (uid: ${rows[0].uid}) to admin`);
      return res.json({ success: true, username: rows[0].username, uid: rows[0].uid });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });
  console.log('  [Dev] /api/dev/promote-admin endpoint active (local only)');
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, _next) => {
  if (process.env.NODE_ENV === 'production') {
    console.error('[Server] Unhandled error:', err.message);
  } else {
    console.error('[Server] Unhandled error:', err);
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ═════════════════════════════════════════════════════════════
// CHAT SYSTEM
// ═════════════════════════════════════════════════════════════

// ── Global settings (admin can change at runtime) ─────────────
const chatSettings = {
  enabled:          true,   // Global kill switch — false = nobody can send anything
  filterEnabled:    true,   // Profanity filter on/off
  readOnly:         false,  // Read-only mode — users can only use quick chat
  quickChatEnabled: true,   // Predefined quick-message buttons
};

// ── Message log (last MAX_HISTORY msgs, survives until server restart) ─
const chatHistory   = [];
const MAX_HISTORY   = 500;

// ── Per-message constraints ───────────────────────────────────
const MAX_MSG_LEN    = 120;   // characters
const MSG_COOLDOWN   = 3500;  // ms between regular messages per socket
const QUICK_COOLDOWN = 1500;  // ms between quick-chat presses

// ── Anti-spam / auto-mute ─────────────────────────────────────
const SPAM_STRIKES   = 3;         // strikes before auto-mute
const MUTE_DURATION  = 60_000;    // 60 second auto-mute

// ── Global spike failsafe ─────────────────────────────────────
const SPIKE_WINDOW    = 30_000;   // rolling 30-second window
const SPIKE_THRESHOLD = 40;       // messages before auto read-only
const SPIKE_COOLDOWN  = 120_000;  // 2 min before auto-lifting read-only

let spikeTimer = null;
const spikeTimestamps = [];       // rolling global message timestamps

// ── Per-socket state ──────────────────────────────────────────
const socketStates = new Map();
// socketId → { lastMsgTime, quickLastTime, spamStrikes, mutedUntil, lastMsg }

// ── Profanity: severe = block entire message ──────────────────
const SEVERE_WORDS = [
  'nigger','nigga','faggot','kike','chink','spic','wetback','gook',
];

// ── Profanity: moderate = replace with *** ────────────────────
const BAD_WORDS = [
  'fuck','shit','bitch','cunt','dick','pussy','cock','bastard',
  'whore','slut','piss','arse','fag','twat','bollocks','asshole',
  'arsehole','motherfucker','dipshit','jackass','dumbass',
];

// ── Predefined quick-chat messages ────────────────────────────
// id must match what the client sends in chat:quick
const QUICK_MESSAGES = new Map([
  ['gg',       '👍 GG!'],
  ['wp',       '💪 Well played!'],
  ['gl',       '🍀 Good luck!'],
  ['help',     '🆘 Help!'],
  ['nice',     '🔥 Nice shot!'],
  ['watchout', '⚠️ Watch out!'],
  ['letsgo',   '🚀 Let\'s go!'],
  ['ez',       '😂 ez pz'],
]);

// ── Helpers ───────────────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Returns filtered text, or null if message contains a severe word (reject entirely)
function applyFilter(text) {
  for (const word of SEVERE_WORDS) {
    const re = new RegExp(`(?<![a-z])${word}(?![a-z])`, 'gi');
    if (re.test(text)) return null;
  }
  let out = text;
  for (const word of BAD_WORDS) {
    const re = new RegExp(`(?<![a-z])${word}(?![a-z])`, 'gi');
    out = out.replace(re, '*'.repeat(word.length));
  }
  return out;
}

function verifyToken(token) {
  if (!token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return null; }
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function addToHistory(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
}

function broadcast(msg) {
  addToHistory(msg);
  io.emit('chat:message', msg);
}

function sysMessage(text) {
  broadcast({ id: makeId(), username: 'System', text, timestamp: Date.now(), isSystem: true });
}

// ── Global spike detector ─────────────────────────────────────
function recordAndCheckSpike() {
  const now = Date.now();
  spikeTimestamps.push(now);
  // Remove entries outside the rolling window
  while (spikeTimestamps.length && now - spikeTimestamps[0] > SPIKE_WINDOW) {
    spikeTimestamps.shift();
  }

  if (spikeTimestamps.length >= SPIKE_THRESHOLD && !chatSettings.readOnly) {
    chatSettings.readOnly = true;
    io.emit('chat:settings', { ...chatSettings });
    sysMessage('⚠️ High activity detected — chat is temporarily read-only. Quick chat still works.');
    console.log('[Chat] Spike failsafe triggered — read-only enabled.');

    if (spikeTimer) clearTimeout(spikeTimer);
    spikeTimer = setTimeout(() => {
      // Only auto-lift if the spike has actually calmed down
      const recentCount = spikeTimestamps.filter(t => Date.now() - t <= SPIKE_WINDOW).length;
      if (recentCount < SPIKE_THRESHOLD / 2) {
        chatSettings.readOnly = false;
        io.emit('chat:settings', { ...chatSettings });
        sysMessage('✅ Activity normalized — chat is open again.');
        console.log('[Chat] Spike resolved — read-only lifted.');
      }
      spikeTimer = null;
    }, SPIKE_COOLDOWN);
  }
}

// ═════════════════════════════════════════════════════════════
// SOCKET.IO HANDLER
// ═════════════════════════════════════════════════════════════
io.on('connection', (socket) => {
  socketStates.set(socket.id, {
    lastMsgTime:   0,
    quickLastTime: 0,
    spamStrikes:   0,
    mutedUntil:    0,
    lastMsg:       '',
  });

  socket.emit('chat:settings', { ...chatSettings });
  socket.emit('chat:history', chatHistory);

  socket.on('disconnect', () => socketStates.delete(socket.id));

  // ── User identification (for targeted server pushes like balance updates) ──
  // Client emits this after connecting with their JWT. We verify and join a
  // per-user room so routes can `io.to('user:'+uid).emit(...)`.
  socket.on('user:identify', ({ token } = {}) => {
    const d = verifyToken(token);
    if (!d?.uid) return;
    socket.join('user:' + d.uid);
  });

  // ── Regular message ────────────────────────────────────────
  socket.on('chat:send', (payload) => {
    const state = socketStates.get(socket.id);
    if (!state) return;

    // Global kill switch
    if (!chatSettings.enabled) {
      socket.emit('chat:error', 'Chat is currently disabled.');
      return;
    }
    // Read-only mode
    if (chatSettings.readOnly) {
      socket.emit('chat:error', 'Chat is in read-only mode. Use quick chat instead.');
      return;
    }

    const { text, token } = payload || {};

    // Must be logged in
    const decoded = verifyToken(token);
    if (!decoded) {
      socket.emit('chat:error', 'You must be signed in to chat.');
      return;
    }

    const now = Date.now();

    // Check mute
    if (state.mutedUntil > now) {
      const secsLeft = Math.ceil((state.mutedUntil - now) / 1000);
      socket.emit('chat:error', `You are muted for ${secsLeft} more second${secsLeft !== 1 ? 's' : ''}.`);
      socket.emit('chat:muted', { until: state.mutedUntil });
      return;
    }

    // Validate text
    if (typeof text !== 'string') return;
    const trimmed = text.trim();
    if (trimmed.length === 0) return;

    if (trimmed.length > MAX_MSG_LEN) {
      socket.emit('chat:error', `Message too long (max ${MAX_MSG_LEN} chars).`);
      return;
    }

    // Rate limit
    const elapsed = now - state.lastMsgTime;
    if (elapsed < MSG_COOLDOWN) {
      state.spamStrikes++;
      if (state.spamStrikes >= SPAM_STRIKES) {
        state.mutedUntil  = now + MUTE_DURATION;
        state.spamStrikes = 0;
        const secs = Math.ceil(MUTE_DURATION / 1000);
        socket.emit('chat:error', `You've been muted for ${secs}s for sending messages too fast.`);
        socket.emit('chat:muted', { until: state.mutedUntil });
        console.log(`[Chat] Auto-muted ${decoded.username || decoded.uid} for ${secs}s`);
        return;
      }
      const wait = Math.ceil((MSG_COOLDOWN - elapsed) / 1000);
      socket.emit('chat:error', `Slow down! Wait ${wait} more second${wait !== 1 ? 's' : ''}.`);
      return;
    }

    // Anti-copy spam
    if (trimmed.toLowerCase() === state.lastMsg.toLowerCase()) {
      socket.emit('chat:error', 'Don\'t repeat the same message.');
      return;
    }

    // Profanity filter
    let safeText = escapeHtml(trimmed);
    if (chatSettings.filterEnabled) {
      const filtered = applyFilter(safeText);
      if (filtered === null) {
        socket.emit('chat:error', 'Message blocked: contains prohibited content.');
        state.lastMsgTime = now; // still counts as an attempt
        state.lastMsg     = trimmed;
        return;
      }
      safeText = filtered;
    }

    // Committed — update state
    state.lastMsgTime = now;
    state.lastMsg     = trimmed;
    if (state.spamStrikes > 0) state.spamStrikes = Math.max(0, state.spamStrikes - 1);

    recordAndCheckSpike();

    broadcast({
      id:        makeId(),
      uid:       decoded.uid,
      username:  decoded.username || decoded.email || 'Player',
      text:      safeText,
      timestamp: now,
      isAdmin:   !!decoded.isAdmin,
    });
  });

  // ── Quick chat ─────────────────────────────────────────────
  socket.on('chat:quick', (payload) => {
    const state = socketStates.get(socket.id);
    if (!state) return;

    if (!chatSettings.enabled && !chatSettings.quickChatEnabled) {
      socket.emit('chat:error', 'Chat is disabled.');
      return;
    }
    if (!chatSettings.quickChatEnabled) {
      socket.emit('chat:error', 'Quick chat is disabled.');
      return;
    }

    const { msgId, token } = payload || {};

    const decoded = verifyToken(token);
    if (!decoded) {
      socket.emit('chat:error', 'You must be signed in to chat.');
      return;
    }

    const quickText = QUICK_MESSAGES.get(msgId);
    if (!quickText) return;

    const now = Date.now();

    // Check mute
    if (state.mutedUntil > now) {
      const secsLeft = Math.ceil((state.mutedUntil - now) / 1000);
      socket.emit('chat:error', `Muted for ${secsLeft}s.`);
      return;
    }

    // Quick-chat cooldown (shorter than regular)
    if (now - state.quickLastTime < QUICK_COOLDOWN) {
      socket.emit('chat:error', 'Slow down!');
      return;
    }

    state.quickLastTime = now;

    broadcast({
      id:          makeId(),
      uid:         decoded.uid,
      username:    decoded.username || 'Player',
      text:        quickText,
      timestamp:   now,
      isAdmin:     !!decoded.isAdmin,
      isQuickChat: true,
    });
  });

  // ── Admin: global kill switch ──────────────────────────────
  socket.on('chat:admin-toggle', ({ token } = {}) => {
    const d = verifyToken(token);
    if (!d?.isAdmin) { socket.emit('chat:error', 'Unauthorized.'); return; }
    chatSettings.enabled = !chatSettings.enabled;
    io.emit('chat:settings', { ...chatSettings });
    sysMessage(chatSettings.enabled
      ? '✅ Chat enabled by admin.'
      : '🚫 Chat has been disabled by an admin.');
    console.log(`[Chat] enabled=${chatSettings.enabled} by ${d.username}`);
  });

  // ── Admin: filter toggle ───────────────────────────────────
  socket.on('chat:admin-filter-toggle', ({ token } = {}) => {
    const d = verifyToken(token);
    if (!d?.isAdmin) { socket.emit('chat:error', 'Unauthorized.'); return; }
    chatSettings.filterEnabled = !chatSettings.filterEnabled;
    io.emit('chat:settings', { ...chatSettings });
    console.log(`[Chat] filter=${chatSettings.filterEnabled} by ${d.username}`);
  });

  // ── Admin: read-only toggle ────────────────────────────────
  socket.on('chat:admin-readonly-toggle', ({ token } = {}) => {
    const d = verifyToken(token);
    if (!d?.isAdmin) { socket.emit('chat:error', 'Unauthorized.'); return; }
    chatSettings.readOnly = !chatSettings.readOnly;
    if (!chatSettings.readOnly && spikeTimer) { clearTimeout(spikeTimer); spikeTimer = null; }
    io.emit('chat:settings', { ...chatSettings });
    sysMessage(chatSettings.readOnly
      ? '📖 Chat set to read-only by admin. Quick chat still available.'
      : '✍️ Chat is open again — messages are enabled.');
    console.log(`[Chat] readOnly=${chatSettings.readOnly} by ${d.username}`);
  });

  // ── Admin: quick chat toggle ───────────────────────────────
  socket.on('chat:admin-quickchat-toggle', ({ token } = {}) => {
    const d = verifyToken(token);
    if (!d?.isAdmin) { socket.emit('chat:error', 'Unauthorized.'); return; }
    chatSettings.quickChatEnabled = !chatSettings.quickChatEnabled;
    io.emit('chat:settings', { ...chatSettings });
    console.log(`[Chat] quickChat=${chatSettings.quickChatEnabled} by ${d.username}`);
  });

  // ── Admin: delete one message ──────────────────────────────
  socket.on('chat:admin-delete', ({ token, msgId } = {}) => {
    const d = verifyToken(token);
    if (!d?.isAdmin) { socket.emit('chat:error', 'Unauthorized.'); return; }
    const idx = chatHistory.findIndex(m => m.id === msgId);
    if (idx !== -1) chatHistory.splice(idx, 1);
    io.emit('chat:deleted', msgId);
  });

  // ── Admin: clear all messages ──────────────────────────────
  socket.on('chat:admin-clear', ({ token } = {}) => {
    const d = verifyToken(token);
    if (!d?.isAdmin) { socket.emit('chat:error', 'Unauthorized.'); return; }
    chatHistory.length = 0;
    io.emit('chat:cleared');
    console.log(`[Chat] History cleared by ${d.username}`);
  });
});

// ─────────────────────────────────────────────────────────────

async function boot() {
  try {
    await initSchema();
    const { startRotationScheduler } = require('./jobs/rotation-scheduler');
    startRotationScheduler();
    server.listen(PORT, () => {
      console.log(`\n🚀  topdown-backend v2 running on port ${PORT}`);
      console.log(`    Health:  http://localhost:${PORT}/health\n`);
    });
  } catch (err) {
    console.error('[Boot] Failed to start:', err.message);
    process.exit(1);
  }
}

boot();
