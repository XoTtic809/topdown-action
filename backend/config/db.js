// config/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[DB] Pool error:', err.message);
});

async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS users (
        uid                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        username             TEXT NOT NULL UNIQUE,
        email                TEXT NOT NULL UNIQUE,
        password_hash        TEXT NOT NULL,
        is_admin             BOOLEAN   NOT NULL DEFAULT FALSE,
        is_banned            BOOLEAN   NOT NULL DEFAULT FALSE,
        ban_reason           TEXT,
        banned_by            TEXT,
        high_score           INTEGER   NOT NULL DEFAULT 0,
        total_coins          INTEGER   NOT NULL DEFAULT 0,
        current_xp           INTEGER   NOT NULL DEFAULT 0,
        owned_skins          TEXT[]    NOT NULL DEFAULT ARRAY['agent'],
        active_skin          TEXT      NOT NULL DEFAULT 'agent',
        skin_received_times  JSONB     NOT NULL DEFAULT '{}',
        battle_pass_data     JSONB     NOT NULL DEFAULT '{}',
        crate_inventory      JSONB     NOT NULL DEFAULT '{"common-crate":0,"rare-crate":0,"epic-crate":0,"legendary-crate":0,"icon-crate":0,"oblivion-crate":0}',
        seen_announcements   TEXT[]    NOT NULL DEFAULT ARRAY[]::TEXT[],
        last_trade_at        TIMESTAMPTZ,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS marketplace_whitelist (
        uid             TEXT PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
        whitelisted_by  TEXT NOT NULL,
        whitelisted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS listings (
        id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        seller_id    TEXT NOT NULL REFERENCES users(uid),
        seller_name  TEXT NOT NULL,
        skin_id      TEXT NOT NULL,
        skin_name    TEXT NOT NULL,
        rarity       TEXT NOT NULL,
        price        INTEGER NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at   TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trade_logs (
        id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        buyer_id         TEXT NOT NULL,
        buyer_name       TEXT NOT NULL,
        seller_id        TEXT NOT NULL,
        seller_name      TEXT NOT NULL,
        skin_id          TEXT NOT NULL,
        skin_name        TEXT NOT NULL,
        rarity           TEXT NOT NULL,
        price            INTEGER NOT NULL,
        tax              INTEGER NOT NULL,
        seller_received  INTEGER NOT NULL,
        timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id         SERIAL PRIMARY KEY,
        admin_id   TEXT NOT NULL,
        admin_name TEXT NOT NULL,
        action     TEXT NOT NULL,
        target_uid TEXT,
        details    TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS announcements (
        id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        title           TEXT NOT NULL,
        message         TEXT NOT NULL,
        type            TEXT NOT NULL DEFAULT 'info',
        priority        TEXT NOT NULL DEFAULT 'normal',
        admin_id        TEXT NOT NULL,
        admin_name      TEXT NOT NULL,
        active          BOOLEAN NOT NULL DEFAULT TRUE,
        show_to_guests  BOOLEAN NOT NULL DEFAULT TRUE,
        expires_at      TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trade_restrictions (
        skin_id    TEXT PRIMARY KEY,
        reason     TEXT NOT NULL DEFAULT 'Restricted by admin',
        added_by   TEXT NOT NULL,
        added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS marketplace_history (
        id          SERIAL PRIMARY KEY,
        item_id     TEXT NOT NULL,
        item_type   TEXT NOT NULL,
        price       INT  NOT NULL,
        seller_uid  TEXT NOT NULL,
        buyer_uid   TEXT NOT NULL,
        sold_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS crate_stock (
        crate_id   TEXT PRIMARY KEY,
        stock      INT  NOT NULL DEFAULT -1,
        sold_count INT  NOT NULL DEFAULT 0,
        reset_at   TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_listings_expires       ON listings(expires_at);
      CREATE INDEX IF NOT EXISTS idx_listings_seller        ON listings(seller_id);
      CREATE INDEX IF NOT EXISTS idx_listings_price         ON listings(price);
      CREATE INDEX IF NOT EXISTS idx_trade_logs_buyer       ON trade_logs(buyer_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_trade_logs_seller      ON trade_logs(seller_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_trade_logs_timestamp   ON trade_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_users_high_score       ON users(high_score DESC);
      CREATE INDEX IF NOT EXISTS idx_users_total_coins      ON users(total_coins DESC);
      CREATE INDEX IF NOT EXISTS idx_announcements_active   ON announcements(active, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_mh_item_date           ON marketplace_history (item_id, sold_at DESC);
      CREATE INDEX IF NOT EXISTS idx_mh_sold_at             ON marketplace_history (sold_at DESC);

      ALTER TABLE users ADD COLUMN IF NOT EXISTS battle_pass_data    JSONB NOT NULL DEFAULT '{}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS crate_inventory      JSONB NOT NULL DEFAULT '{"common-crate":0,"rare-crate":0,"epic-crate":0,"legendary-crate":0,"icon-crate":0,"oblivion-crate":0}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS seen_announcements   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

      ALTER TABLE users ADD COLUMN IF NOT EXISTS horde_best_kills     INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS ta_best_kills        INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS br_bosses_beaten     INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_crates         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

      ALTER TABLE listings ADD COLUMN IF NOT EXISTS listing_type      TEXT NOT NULL DEFAULT 'skin';
      ALTER TABLE listings ADD COLUMN IF NOT EXISTS crate_id          TEXT;

      ALTER TABLE trade_sessions ADD COLUMN IF NOT EXISTS initiator_crates TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
      ALTER TABLE trade_sessions ADD COLUMN IF NOT EXISTS target_crates    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

      ALTER TABLE trade_offers ADD COLUMN IF NOT EXISTS sender_crates     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
      ALTER TABLE trade_offers ADD COLUMN IF NOT EXISTS receiver_crates   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

      ALTER TABLE peer_trade_logs ADD COLUMN IF NOT EXISTS a_gave_crates  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
      ALTER TABLE peer_trade_logs ADD COLUMN IF NOT EXISTS b_gave_crates  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

      ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_crate_drops    INT NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS crate_drops_week_start TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS reports (
        id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        user_id      TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
        username     TEXT NOT NULL,
        type         TEXT NOT NULL,
        subject      TEXT NOT NULL,
        description  TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'open',
        admin_note   TEXT,
        resolved_by  TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reports_user   ON reports(user_id);

      CREATE TABLE IF NOT EXISTS chat_requests (
        id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        uid          TEXT NOT NULL UNIQUE REFERENCES users(uid) ON DELETE CASCADE,
        username     TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'pending',
        reviewed_by  TEXT,
        reviewed_at  TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_chat_requests_status ON chat_requests(status, created_at ASC);

      CREATE TABLE IF NOT EXISTS ranked_profiles (
        uid           TEXT PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
        tier          TEXT NOT NULL DEFAULT 'bronze',
        division      INTEGER NOT NULL DEFAULT 5,
        rp            INTEGER NOT NULL DEFAULT 0,
        peak_tier     TEXT NOT NULL DEFAULT 'bronze',
        peak_division INTEGER NOT NULL DEFAULT 5,
        wins          INTEGER NOT NULL DEFAULT 0,
        losses        INTEGER NOT NULL DEFAULT 0,
        streak        INTEGER NOT NULL DEFAULT 0,
        promo_protect BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_ranked_tier ON ranked_profiles(tier, division ASC, rp DESC);

      -- ── Peer Trading ──────────────────────────────────────────────

      CREATE TABLE IF NOT EXISTS user_presence (
        uid        TEXT PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
        username   TEXT NOT NULL,
        last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trade_sessions (
        id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        initiator_id     TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
        initiator_name   TEXT NOT NULL,
        target_id        TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
        target_name      TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'pending',
        initiator_skins  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        target_skins     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        initiator_coins  INTEGER NOT NULL DEFAULT 0,
        target_coins     INTEGER NOT NULL DEFAULT 0,
        initiator_ready  BOOLEAN NOT NULL DEFAULT FALSE,
        target_ready     BOOLEAN NOT NULL DEFAULT FALSE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes'
      );

      CREATE TABLE IF NOT EXISTS trade_offers (
        id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        sender_id      TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
        sender_name    TEXT NOT NULL,
        receiver_id    TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
        receiver_name  TEXT NOT NULL,
        sender_skins   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        receiver_skins TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        sender_coins   INTEGER NOT NULL DEFAULT 0,
        receiver_coins INTEGER NOT NULL DEFAULT 0,
        message        TEXT,
        status         TEXT NOT NULL DEFAULT 'pending',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
      );

      CREATE TABLE IF NOT EXISTS peer_trade_logs (
        id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
        trade_type   TEXT NOT NULL,
        user_a_id    TEXT NOT NULL,
        user_a_name  TEXT NOT NULL,
        user_b_id    TEXT NOT NULL,
        user_b_name  TEXT NOT NULL,
        a_gave_skins TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        b_gave_skins TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        a_gave_coins INTEGER NOT NULL DEFAULT 0,
        b_gave_coins INTEGER NOT NULL DEFAULT 0,
        timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_trade_sessions_initiator ON trade_sessions(initiator_id, status);
      CREATE INDEX IF NOT EXISTS idx_trade_sessions_target    ON trade_sessions(target_id, status);
      CREATE INDEX IF NOT EXISTS idx_trade_offers_sender      ON trade_offers(sender_id, status);
      CREATE INDEX IF NOT EXISTS idx_trade_offers_receiver    ON trade_offers(receiver_id, status);
      CREATE INDEX IF NOT EXISTS idx_peer_trade_logs_a        ON peer_trade_logs(user_a_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_peer_trade_logs_b        ON peer_trade_logs(user_b_id, timestamp DESC);

      INSERT INTO crate_stock (crate_id, stock, sold_count) VALUES
        ('common-crate',    -1, 0),
        ('rare-crate',      -1, 0),
        ('epic-crate',      -1, 0),
        ('legendary-crate', -1, 0),
        ('icon-crate',      -1, 0),
        ('oblivion-crate',  100, 0)
      ON CONFLICT (crate_id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS crate_rotation (
        crate_id                     TEXT PRIMARY KEY,
        active                       BOOLEAN     NOT NULL DEFAULT false,
        price_override               INTEGER,
        stock_limit                  INTEGER,
        stock_remaining              INTEGER,
        marketplace_floor_override   INTEGER,
        marketplace_ceiling_override INTEGER,
        discount_percent             INTEGER     NOT NULL DEFAULT 0,
        starts_at                    TIMESTAMPTZ,
        ends_at                      TIMESTAMPTZ,
        retired                      BOOLEAN     NOT NULL DEFAULT false,
        weekend_only                 BOOLEAN     NOT NULL DEFAULT false,
        timer_visible                BOOLEAN     NOT NULL DEFAULT false,
        rotation_label               TEXT,
        updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS crate_schedule (
        id           SERIAL PRIMARY KEY,
        crate_id     TEXT        NOT NULL REFERENCES crate_rotation(crate_id) ON DELETE CASCADE,
        action       TEXT        NOT NULL,
        scheduled_at TIMESTAMPTZ NOT NULL,
        payload      JSONB,
        executed     BOOLEAN     NOT NULL DEFAULT false,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_crate_schedule_pending
        ON crate_schedule (scheduled_at) WHERE executed = false;

      INSERT INTO crate_rotation (crate_id, active, weekend_only)
      VALUES
        ('common-crate',    true,  false),
        ('rare-crate',      true,  false),
        ('epic-crate',      true,  false),
        ('legendary-crate', true,  false),
        ('icon-crate',      true,  false),
        ('oblivion-crate',  false, true )
      ON CONFLICT (crate_id) DO NOTHING;
    `);
    console.log('[DB] Schema ready');
  } finally {
    client.release();
  }
}

async function query(sql, params) {
  return pool.query(sql, params);
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction, initSchema };
