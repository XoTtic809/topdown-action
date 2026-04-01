// jobs/rotation-scheduler.js — Crate rotation scheduler
// Runs every 60 seconds to execute pending schedule actions,
// auto-deactivate expired crates, handle weekend_only flags,
// and auto-activate starts_at crates.
'use strict';

const { query } = require('../config/db');

const INTERVAL_MS = 60 * 1000; // 60 seconds

/**
 * Returns true if the current UTC time falls within the weekend window:
 * Friday 18:00 UTC through Monday 06:00 UTC.
 */
function isWeekendWindow() {
  const now  = new Date();
  const day  = now.getUTCDay();  // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const hour = now.getUTCHours();

  if (day === 5 && hour >= 18) return true; // Fri 18:00+
  if (day === 6) return true;               // All Saturday
  if (day === 0) return true;               // All Sunday
  if (day === 1 && hour < 6) return true;   // Mon 00:00–05:59
  return false;
}

async function runTick() {
  try {
    // ── Step 1: Execute pending crate_schedule rows ──────────────────────────
    const { rows: pending } = await query(`
      SELECT * FROM crate_schedule
       WHERE scheduled_at <= NOW() AND executed = false
       ORDER BY scheduled_at ASC
      FOR UPDATE SKIP LOCKED
    `);

    for (const row of pending) {
      try {
        const payload = row.payload || {};

        switch (row.action) {
          case 'activate':
            await query(
              `UPDATE crate_rotation
                  SET active = true,
                      stock_remaining = CASE
                        WHEN $2::integer IS NOT NULL THEN $2::integer
                        ELSE stock_remaining
                      END,
                      updated_at = NOW()
                WHERE crate_id = $1`,
              [row.crate_id, payload.stock ?? null]
            );
            break;

          case 'deactivate':
            await query(
              `UPDATE crate_rotation SET active = false, updated_at = NOW() WHERE crate_id = $1`,
              [row.crate_id]
            );
            break;

          case 'restock':
            await query(
              `UPDATE crate_rotation SET stock_remaining = $2, updated_at = NOW() WHERE crate_id = $1`,
              [row.crate_id, payload.stock]
            );
            break;

          case 'price_change':
            await query(
              `UPDATE crate_rotation
                  SET price_override = $2,
                      discount_percent = COALESCE($3, 0),
                      updated_at = NOW()
                WHERE crate_id = $1`,
              [row.crate_id, payload.price, payload.discount_percent ?? null]
            );
            break;

          case 'retire':
            await query(
              `UPDATE crate_rotation SET retired = true, active = false, updated_at = NOW()
                WHERE crate_id = $1`,
              [row.crate_id]
            );
            break;

          default:
            console.warn(`[Scheduler] Unknown action "${row.action}" for schedule id=${row.id}`);
        }

        await query(
          `UPDATE crate_schedule SET executed = true WHERE id = $1`,
          [row.id]
        );
        console.log(`[Scheduler] Executed schedule id=${row.id} action=${row.action} crate=${row.crate_id}`);
      } catch (actionErr) {
        console.error(`[Scheduler] Failed to execute schedule id=${row.id}:`, actionErr.message);
      }
    }

    // ── Step 2: ends_at auto-deactivation ───────────────────────────────────
    const { rowCount: expiredCount } = await query(`
      UPDATE crate_rotation SET active = false, updated_at = NOW()
       WHERE active = true AND ends_at IS NOT NULL AND ends_at <= NOW()
    `);
    if (expiredCount > 0) {
      console.log(`[Scheduler] Deactivated ${expiredCount} expired crate(s)`);
    }

    // ── Step 3: weekend_only auto-toggle ────────────────────────────────────
    const inWeekend = isWeekendWindow();
    if (inWeekend) {
      // Activate weekend crates that aren't already active
      const { rowCount: activatedWe } = await query(`
        UPDATE crate_rotation SET active = true, updated_at = NOW()
         WHERE weekend_only = true AND retired = false AND active = false
      `);
      if (activatedWe > 0) {
        console.log(`[Scheduler] Weekend window: activated ${activatedWe} weekend crate(s)`);
      }
    } else {
      // Deactivate weekend crates that are still active
      const { rowCount: deactivatedWe } = await query(`
        UPDATE crate_rotation SET active = false, updated_at = NOW()
         WHERE weekend_only = true AND active = true
      `);
      if (deactivatedWe > 0) {
        console.log(`[Scheduler] Weekday: deactivated ${deactivatedWe} weekend crate(s)`);
      }
    }

    // ── Step 4: starts_at auto-activation ───────────────────────────────────
    const { rowCount: startedCount } = await query(`
      UPDATE crate_rotation SET active = true, updated_at = NOW()
       WHERE active = false
         AND retired = false
         AND weekend_only = false
         AND starts_at IS NOT NULL
         AND starts_at <= NOW()
         AND (ends_at IS NULL OR ends_at > NOW())
    `);
    if (startedCount > 0) {
      console.log(`[Scheduler] starts_at: activated ${startedCount} crate(s)`);
    }

    // ── Step 5: Weekly auto-rotation ─────────────────────────────────────────
    const { rows: [wrc] } = await query(
      `SELECT * FROM weekly_rotation_config WHERE id = 1`
    );
    if (wrc && wrc.enabled) {
      const now = new Date();
      if (wrc.next_rotation_at && now >= new Date(wrc.next_rotation_at)) {
        await performWeeklyRotation(wrc);
      } else if (!wrc.next_rotation_at) {
        // First enable — seed next_rotation_at
        const next = computeNextRotation(wrc.rotation_day, wrc.rotation_hour);
        await query(
          `UPDATE weekly_rotation_config SET next_rotation_at = $1, updated_at = NOW() WHERE id = 1`,
          [next.toISOString()]
        );
        console.log(`[Scheduler] Weekly rotation: seeded next_rotation_at = ${next.toISOString()}`);
      }
    }

  } catch (err) {
    console.error('[Scheduler] Tick error:', err.message);
  }
}

/**
 * Compute the next occurrence of the given weekday + UTC hour from now.
 */
function computeNextRotation(day, hour) {
  const now = new Date();
  const target = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0
  ));
  const diff = (day - target.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + diff);
  // If target is in the past (or right now), push to next week
  if (target <= now) {
    target.setUTCDate(target.getUTCDate() + 7);
  }
  return target;
}

/**
 * Perform a weekly rotation: deactivate old auto-rotated cases,
 * pick new ones from the pool, activate them, update config.
 * @param {object} config - weekly_rotation_config row
 * @param {string[]} [manualSelection] - optional hand-picked crate IDs
 */
async function performWeeklyRotation(config, manualSelection) {
  // 1. Deactivate previous auto-rotated cases
  const { rowCount: deactivated } = await query(`
    UPDATE crate_rotation
       SET active = false, auto_rotated = false, rotation_label = NULL, updated_at = NOW()
     WHERE auto_rotated = true
  `);

  // 2. Pick new cases
  let selection;
  if (manualSelection && manualSelection.length > 0) {
    selection = manualSelection;
  } else {
    const { rows: picked } = await query(`
      SELECT crate_id FROM crate_rotation
       WHERE auto_rotation_pool = true AND retired = false
       ORDER BY RANDOM()
       LIMIT $1
    `, [config.pool_size]);
    selection = picked.map(r => r.crate_id);
  }

  // 3. Activate new selection
  if (selection.length > 0) {
    await query(`
      UPDATE crate_rotation
         SET active = true, auto_rotated = true, rotation_label = 'WEEKLY', updated_at = NOW()
       WHERE crate_id = ANY($1::text[])
    `, [selection]);
  }

  // 4. Compute next rotation + update config
  const next = computeNextRotation(config.rotation_day, config.rotation_hour);
  await query(`
    UPDATE weekly_rotation_config
       SET current_selection = $1,
           last_rotated_at = NOW(),
           next_rotation_at = $2,
           updated_at = NOW()
     WHERE id = 1
  `, [selection, next.toISOString()]);

  console.log(`[Scheduler] Weekly rotation: deactivated ${deactivated}, activated [${selection.join(', ')}], next at ${next.toISOString()}`);
}

function startRotationScheduler() {
  console.log('[Scheduler] Rotation scheduler started (60s interval)');
  // Run once immediately on boot
  runTick();
  setInterval(runTick, INTERVAL_MS);
}

module.exports = { startRotationScheduler, performWeeklyRotation, computeNextRotation };
