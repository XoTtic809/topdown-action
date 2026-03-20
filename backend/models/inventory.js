// models/inventory.js
const { query } = require('../config/db');

// ── Get owned skins array
async function getOwnedSkins(uid) {
  const { rows } = await query('SELECT owned_skins FROM users WHERE uid = $1', [uid]);
  return rows[0]?.owned_skins || [];
}

// ── Add a skin — allows duplicates (multiple copies of the same skin)
async function addSkin(uid, skinId, client = null) {
  const exec = (sql, p) => client ? client.query(sql, p) : query(sql, p);
  await exec(`
    UPDATE users
    SET owned_skins = array_append(owned_skins, $2),
        skin_received_times = skin_received_times || jsonb_build_object($2, NOW()::TEXT),
        updated_at = NOW()
    WHERE uid = $1
  `, [uid, skinId]);
}

// ── Remove exactly ONE occurrence of a skin from owned_skins.
//    Uses array slicing around array_position so duplicates are preserved.
async function removeSkin(uid, skinId, client) {
  await client.query(`
    UPDATE users
    SET owned_skins = CASE
      WHEN array_position(owned_skins, $2) IS NULL THEN owned_skins
      ELSE
        owned_skins[1 : array_position(owned_skins, $2) - 1]
        || owned_skins[array_position(owned_skins, $2) + 1 : array_length(owned_skins, 1)]
    END,
    updated_at = NOW()
    WHERE uid = $1
  `, [uid, skinId]);
}

// ── Sync client-side skins to the DB.
//    Only ever ADDS skins — never removes. Safe to call on every progress save.
//    Handles duplicates: if client has 2x "phantom" but DB has 1x, adds 1 more.
async function syncSkins(uid, clientSkins, client = null) {
  if (!Array.isArray(clientSkins) || clientSkins.length === 0) return;

  const exec = (sql, p) => client ? client.query(sql, p) : query(sql, p);

  // Get current server skins
  const { rows } = await exec('SELECT owned_skins FROM users WHERE uid = $1', [uid]);
  const serverSkins = rows[0]?.owned_skins || [];

  // Count how many of each skin the server already has
  const serverCounts = {};
  for (const s of serverSkins) serverCounts[s] = (serverCounts[s] || 0) + 1;

  // Determine which skins need to be added (client has more copies than server)
  const toAdd = [];
  const seen = {};
  for (const s of clientSkins) {
    seen[s] = (seen[s] || 0) + 1;
    if (seen[s] > (serverCounts[s] || 0)) {
      toAdd.push(s);
    }
  }

  if (toAdd.length === 0) return;

  // Append all new skins in one query
  await exec(`
    UPDATE users
    SET owned_skins = owned_skins || $2::text[],
        updated_at  = NOW()
    WHERE uid = $1
  `, [uid, toAdd]);
}

// ── Check if a skin was received within the last N hours (trade cooldown)
async function getSkinReceivedTime(uid, skinId) {
  const { rows } = await query(
    `SELECT skin_received_times->$2 AS received_at FROM users WHERE uid = $1`,
    [uid, skinId]
  );
  return rows[0]?.received_at || null;
}

module.exports = { getOwnedSkins, addSkin, removeSkin, syncSkins, getSkinReceivedTime };
