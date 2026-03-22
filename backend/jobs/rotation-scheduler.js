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

  } catch (err) {
    console.error('[Scheduler] Tick error:', err.message);
  }
}

function startRotationScheduler() {
  console.log('[Scheduler] Rotation scheduler started (60s interval)');
  // Run once immediately on boot
  runTick();
  setInterval(runTick, INTERVAL_MS);
}

module.exports = { startRotationScheduler };
