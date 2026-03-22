// models/crate-inventory.js
const { query } = require('../config/db');

// ── Get owned crates array
async function getOwnedCrates(uid) {
  const { rows } = await query('SELECT owned_crates FROM users WHERE uid = $1', [uid]);
  return rows[0]?.owned_crates || [];
}

// ── Add a crate — allows duplicates (multiple copies of the same crate type)
async function addCrate(uid, crateId, client = null) {
  const exec = (sql, p) => client ? client.query(sql, p) : query(sql, p);
  await exec(`
    UPDATE users
    SET owned_crates = array_append(owned_crates, $2),
        updated_at = NOW()
    WHERE uid = $1
  `, [uid, crateId]);
}

// ── Remove exactly ONE occurrence of a crate from owned_crates.
//    Uses array slicing around array_position so duplicates are preserved.
async function removeCrate(uid, crateId, client) {
  await client.query(`
    UPDATE users
    SET owned_crates = CASE
      WHEN array_position(owned_crates, $2) IS NULL THEN owned_crates
      ELSE
        owned_crates[1 : array_position(owned_crates, $2) - 1]
        || owned_crates[array_position(owned_crates, $2) + 1 : array_length(owned_crates, 1)]
    END,
    updated_at = NOW()
    WHERE uid = $1
  `, [uid, crateId]);
}

module.exports = { getOwnedCrates, addCrate, removeCrate };
