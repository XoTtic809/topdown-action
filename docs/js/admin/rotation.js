// js/admin/rotation.js — Admin rotation manager UI
'use strict';

var _rotationInited = false;
var _rotationData   = [];

// Crate display info (must stay in sync with crate-system.js CRATES)
var ROTATION_CRATE_META = {
  'common-crate':    { name: 'Common Crate',    icon: '📦', price: 300 },
  'rare-crate':      { name: 'Rare Crate',       icon: '💠', price: 750 },
  'epic-crate':      { name: 'Epic Crate',        icon: '🔮', price: 1500 },
  'legendary-crate': { name: 'Legendary Crate',   icon: '👑', price: 4000 },
  'icon-crate':      { name: 'Icon Crate',         icon: '⭐', price: 750 },
  'oblivion-crate':  { name: 'Oblivion Crate',    icon: '🌑', price: 10000 },
  'neon-crate':      { name: 'Neon Crate',         icon: '💡', price: 2000 },
  'frost-crate':     { name: 'Frost Crate',        icon: '❄️', price: 2500 },
  'infernal-crate':  { name: 'Infernal Crate',     icon: '🔥', price: 2500 },
  'void-crate':      { name: 'Void Crate',         icon: '🕳️', price: 6000 },
};

// ── Public entry point ────────────────────────────────────────────────────────

function initRotationManager() {
  if (_rotationInited) { loadRotationData(); return; }
  _rotationInited = true;
  loadRotationData();
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadRotationData() {
  const cardsEl = document.getElementById('rotationManagerCards');
  const schedEl = document.getElementById('schedulePanel');
  if (!cardsEl || !schedEl) return;

  cardsEl.innerHTML = '<div style="color:var(--muted);padding:12px;">Loading...</div>';
  schedEl.innerHTML = '';

  try {
    const data = await apiGet('/admin/rotation');
    _rotationData = data.rotation || [];
    renderRotationCards(_rotationData);
    renderSchedulePanel();
  } catch (err) {
    cardsEl.innerHTML = `<div style="color:#f44;padding:12px;">Failed to load rotation data: ${err.message}</div>`;
  }
}

// ── Rotation Cards ────────────────────────────────────────────────────────────

function renderRotationCards(rows) {
  const el = document.getElementById('rotationManagerCards');
  if (!el) return;

  el.innerHTML = '<h3 style="margin:0 0 12px;font-size:13px;color:var(--gold);letter-spacing:1px;">CRATE ROTATION</h3>';

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;';

  for (const row of rows) {
    grid.appendChild(buildCrateCard(row));
  }

  el.appendChild(grid);
}

function buildCrateCard(row) {
  const meta     = ROTATION_CRATE_META[row.crate_id] || { name: row.crate_id, icon: '📦', price: 0 };
  const card     = document.createElement('div');
  card.className = 'admin-section';
  card.style.cssText = 'padding:12px;position:relative;';

  // Status badge
  let statusText = 'INACTIVE', statusColor = '#888';
  if (row.retired)              { statusText = 'RETIRED';     statusColor = '#555'; }
  else if (row.stock_remaining === 0) { statusText = 'SOLD OUT';  statusColor = '#f90'; }
  else if (row.active)          { statusText = row.weekend_only ? 'WEEKEND ONLY' : 'LIVE'; statusColor = row.weekend_only ? '#a78' : '#4c8'; }
  else if (row.weekend_only)    { statusText = 'WEEKEND ONLY (INACTIVE)'; statusColor = '#a78'; }
  else if ((row.pending_schedules || []).length > 0) { statusText = 'SCHEDULED'; statusColor = '#88f'; }

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:20px;">${meta.icon}</span>
      <div style="flex:1;">
        <div style="font-weight:bold;font-size:12px;">${meta.name}</div>
        <span style="font-size:10px;color:${statusColor};font-weight:bold;">${statusText}</span>
      </div>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;">
        <input type="checkbox" id="rc-active-${row.crate_id}" ${row.active ? 'checked' : ''} ${row.retired ? 'disabled' : ''}>
        Active
      </label>
    </div>

    ${buildStockBar(row)}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
      <div>
        <label style="font-size:10px;color:var(--muted);" title="Override the default price players pay. Leave blank to use the default price.">Custom Price</label>
        <input id="rc-price-${row.crate_id}" type="number" min="1" value="${row.price_override || ''}"
          placeholder="${meta.price} (default)" class="auth-input" style="margin:2px 0 0;padding:4px 6px;font-size:11px;">
      </div>
      <div>
        <label style="font-size:10px;color:var(--muted);" title="Percentage discount applied on top of the price. 25 = 25% off.">Discount %</label>
        <input id="rc-disc-${row.crate_id}" type="number" min="0" max="100" value="${row.discount_percent || 0}"
          class="auth-input" style="margin:2px 0 0;padding:4px 6px;font-size:11px;">
      </div>
      <div>
        <label style="font-size:10px;color:var(--muted);" title="Stock cap — maximum units available. Leave blank for unlimited.">Stock Limit</label>
        <input id="rc-stocklimit-${row.crate_id}" type="number" min="1" value="${row.stock_limit || ''}"
          placeholder="unlimited" class="auth-input" style="margin:2px 0 0;padding:4px 6px;font-size:11px;">
      </div>
      <div>
        <label style="font-size:10px;color:var(--muted);" title="Auto-deactivate this crate at this date/time.">Auto-Expire (local time)</label>
        <input id="rc-endsat-${row.crate_id}" type="datetime-local" value="${row.ends_at ? toLocalDatetimeInput(row.ends_at) : ''}"
          class="auth-input" style="margin:2px 0 0;padding:4px 6px;font-size:11px;">
      </div>
      <div>
        <label style="font-size:10px;color:var(--muted);" title="Lowest price players can list this crate for on the marketplace.">Min Marketplace Price</label>
        <input id="rc-floor-${row.crate_id}" type="number" min="1" value="${row.marketplace_floor_override || ''}"
          placeholder="—" class="auth-input" style="margin:2px 0 0;padding:4px 6px;font-size:11px;">
      </div>
      <div>
        <label style="font-size:10px;color:var(--muted);" title="Highest price players can list this crate for on the marketplace.">Max Marketplace Price</label>
        <input id="rc-ceil-${row.crate_id}" type="number" min="1" value="${row.marketplace_ceiling_override || ''}"
          placeholder="—" class="auth-input" style="margin:2px 0 0;padding:4px 6px;font-size:11px;">
      </div>
    </div>

    <div style="margin-bottom:8px;">
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;" title="Show a countdown timer on the crate card in the shop.">
        <input type="checkbox" id="rc-timer-${row.crate_id}" ${row.timer_visible ? 'checked' : ''}>
        Show countdown timer in shop
      </label>
    </div>

    <div style="margin-bottom:8px;">
      <label style="font-size:10px;color:var(--muted);" title="Text shown on the crate card in the shop, e.g. LIMITED TIME or FLASH SALE.">Shop Banner Text</label>
      <input id="rc-label-${row.crate_id}" type="text" value="${row.rotation_label || ''}"
        placeholder="e.g. LIMITED TIME · FLASH SALE" class="auth-input" style="margin:2px 0 0;padding:4px 6px;font-size:11px;">
    </div>

    <div style="display:flex;gap:6px;flex-wrap:wrap;">
      <button class="admin-action-btn" onclick="rcSave('${row.crate_id}')" style="font-size:10px;padding:4px 8px;">💾 Save</button>
      <button class="admin-action-btn reset" onclick="rcRestock('${row.crate_id}')" style="font-size:10px;padding:4px 8px;">+ Restock</button>
      <button class="admin-action-btn danger" onclick="rcSellOut('${row.crate_id}')" style="font-size:10px;padding:4px 8px;">Sell Out</button>
      ${!row.retired ? `<button class="admin-action-btn danger" onclick="rcRetire('${row.crate_id}')" style="font-size:10px;padding:4px 8px;">Retire</button>` : ''}
    </div>
  `;

  // Wire up active toggle
  const activeChk = card.querySelector(`#rc-active-${row.crate_id}`);
  if (activeChk && !row.retired) {
    activeChk.addEventListener('change', () => rcToggleActive(row.crate_id, activeChk.checked));
  }

  return card;
}

function buildStockBar(row) {
  if (row.stock_limit == null && row.stock_remaining == null) {
    return '<div style="font-size:10px;color:var(--muted);margin-bottom:8px;">Stock: Unlimited</div>';
  }
  const remaining = row.stock_remaining ?? 0;
  const limit     = row.stock_limit || remaining || 1;
  const pct       = Math.max(0, Math.min(100, (remaining / limit) * 100));
  const color     = pct > 50 ? '#4c8' : pct > 20 ? '#fa0' : '#f44';
  return `
    <div style="margin-bottom:8px;">
      <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">
        Stock: <strong>${remaining}</strong>${row.stock_limit ? ` / ${row.stock_limit}` : ''} remaining
      </div>
      <div style="background:#333;border-radius:3px;height:4px;overflow:hidden;">
        <div style="background:${color};width:${pct}%;height:100%;transition:width 0.3s;"></div>
      </div>
    </div>
  `;
}

function toLocalDatetimeInput(isoStr) {
  if (!isoStr) return '';
  // datetime-local input expects 'YYYY-MM-DDTHH:MM' in local time
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Card action handlers ──────────────────────────────────────────────────────

async function rcToggleActive(crateId, newActive) {
  try {
    await apiPost('/admin/rotation/update', { crateId, active: newActive });
    showAdminMessage(`${crateId}: ${newActive ? 'activated' : 'deactivated'}`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

async function rcSave(crateId) {
  const priceEl      = document.getElementById(`rc-price-${crateId}`);
  const discEl       = document.getElementById(`rc-disc-${crateId}`);
  const stockLimEl   = document.getElementById(`rc-stocklimit-${crateId}`);
  const floorEl      = document.getElementById(`rc-floor-${crateId}`);
  const ceilEl       = document.getElementById(`rc-ceil-${crateId}`);
  const endsEl       = document.getElementById(`rc-endsat-${crateId}`);
  const timerEl      = document.getElementById(`rc-timer-${crateId}`);
  const labelEl      = document.getElementById(`rc-label-${crateId}`);

  const body = { crateId };
  if (priceEl?.value)    body.priceOverride = parseInt(priceEl.value, 10);
  if (discEl)            body.discountPercent = parseInt(discEl.value || '0', 10);
  if (stockLimEl?.value) body.stockLimit = parseInt(stockLimEl.value, 10);
  if (floorEl?.value)    body.marketplaceFloorOverride = parseInt(floorEl.value, 10);
  if (ceilEl?.value)     body.marketplaceCeilingOverride = parseInt(ceilEl.value, 10);
  if (endsEl?.value)     body.endsAt = new Date(endsEl.value).toISOString();
  if (timerEl)           body.timerVisible = timerEl.checked;
  if (labelEl)           body.rotationLabel = labelEl.value.trim() || null;

  try {
    await apiPost('/admin/rotation/update', body);
    showAdminMessage(`${crateId} saved`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

async function rcRestock(crateId) {
  const input = prompt(`Restock ${crateId}:\nEnter amount to add:`);
  if (!input) return;
  const amount = parseInt(input, 10);
  if (!amount || amount <= 0) { showAdminMessage('Invalid amount', true); return; }
  try {
    await apiPost('/admin/rotation/restock', { crateId, amount });
    showAdminMessage(`${crateId}: added ${amount} stock`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

async function rcSellOut(crateId) {
  if (!confirm(`Sell out ${crateId}? This will set stock_remaining to 0.`)) return;
  try {
    await apiPost('/admin/rotation/sellout', { crateId });
    showAdminMessage(`${crateId}: sold out`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

async function rcRetire(crateId) {
  if (!confirm(`Retire ${crateId}?\n\nThis permanently disables purchases. The crate will remain listable on the marketplace.`)) return;
  try {
    await apiPost('/admin/rotation/retire', { crateId });
    showAdminMessage(`${crateId}: retired`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

// ── Schedule Panel ────────────────────────────────────────────────────────────

function renderSchedulePanel() {
  const el = document.getElementById('schedulePanel');
  if (!el) return;

  // Collect all pending schedules from loaded rotation data
  const allPending = [];
  for (const row of _rotationData) {
    if (row.pending_schedules && row.pending_schedules.length) {
      allPending.push(...row.pending_schedules);
    }
  }
  allPending.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  el.innerHTML = `
    <div class="admin-section" style="margin-top:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <h3 style="margin:0;font-size:13px;color:var(--gold);letter-spacing:1px;">SCHEDULE MANAGER</h3>
        <button class="admin-action-btn" id="scheduleFormToggle" onclick="toggleScheduleForm()" style="font-size:10px;padding:4px 10px;">+ Schedule Action</button>
      </div>

      <div id="scheduleFormPanel" style="display:none;background:#1a1a2e;border-radius:6px;padding:12px;margin-bottom:12px;">
        ${buildScheduleForm()}
      </div>

      <div id="schedulePresets" style="margin-bottom:12px;">
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px;">QUICK PRESETS</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="admin-action-btn reset" onclick="presetWeekendFlashSale()" style="font-size:10px;padding:4px 10px;">⚡ Weekend Flash Sale</button>
          <button class="admin-action-btn" onclick="presetLimitedDrop()" style="font-size:10px;padding:4px 10px;">📦 Limited Drop</button>
        </div>
      </div>

      <div style="font-size:11px;color:var(--muted);margin-bottom:6px;">UPCOMING (${allPending.length})</div>
      <div id="pendingSchedulesList">
        ${allPending.length === 0
          ? '<div style="font-size:11px;color:var(--muted);">No pending schedules.</div>'
          : allPending.map(s => buildScheduleRow(s)).join('')
        }
      </div>
    </div>
  `;
}

function buildScheduleForm() {
  const crateOptions = Object.entries(ROTATION_CRATE_META)
    .map(([id, m]) => `<option value="${id}">${m.icon} ${m.name}</option>`).join('');
  const actionOptions = [
    ['activate',     'Activate'],
    ['deactivate',   'Deactivate'],
    ['restock',      'Restock'],
    ['price_change', 'Price Change'],
    ['retire',       'Retire'],
  ].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
      <div>
        <label style="font-size:10px;color:var(--muted);">Crate</label>
        <select id="sf-crate" class="auth-input" style="margin:2px 0 0;padding:4px 6px;font-size:11px;">${crateOptions}</select>
      </div>
      <div>
        <label style="font-size:10px;color:var(--muted);">Action</label>
        <select id="sf-action" class="auth-input" onchange="updateSchedulePayloadFields()" style="margin:2px 0 0;padding:4px 6px;font-size:11px;">${actionOptions}</select>
      </div>
    </div>
    <div style="margin-bottom:8px;">
      <label style="font-size:10px;color:var(--muted);">Scheduled At (your local time)</label>
      <input id="sf-when" type="datetime-local" class="auth-input" style="margin:2px 0 0;padding:4px 6px;font-size:11px;">
    </div>
    <div id="sf-payload-fields" style="margin-bottom:8px;"></div>
    <button class="admin-action-btn" onclick="submitScheduleAction()" style="font-size:11px;">Schedule</button>
  `;
}

function toggleScheduleForm() {
  const p = document.getElementById('scheduleFormPanel');
  if (!p) return;
  const shown = p.style.display !== 'none';
  p.style.display = shown ? 'none' : 'block';
  if (!shown) updateSchedulePayloadFields();
}

function updateSchedulePayloadFields() {
  const action = document.getElementById('sf-action')?.value;
  const el     = document.getElementById('sf-payload-fields');
  if (!el) return;

  let html = '';
  if (action === 'activate' || action === 'restock') {
    const req = action === 'restock' ? 'required' : '';
    html = `
      <label style="font-size:10px;color:var(--muted);">Stock Amount ${action === 'activate' ? '(optional)' : ''}</label>
      <input id="sf-stock" type="number" min="1" placeholder="${action === 'activate' ? 'leave blank = keep current' : 'required'}"
        class="auth-input" ${req} style="margin:2px 0 0;padding:4px 6px;font-size:11px;">
    `;
  } else if (action === 'price_change') {
    html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div>
          <label style="font-size:10px;color:var(--muted);">New Price</label>
          <input id="sf-price" type="number" min="1" class="auth-input" style="margin:2px 0 0;padding:4px 6px;font-size:11px;">
        </div>
        <div>
          <label style="font-size:10px;color:var(--muted);">Discount %</label>
          <input id="sf-disc" type="number" min="0" max="100" value="0" class="auth-input" style="margin:2px 0 0;padding:4px 6px;font-size:11px;">
        </div>
      </div>
    `;
  }
  el.innerHTML = html;
}

async function submitScheduleAction() {
  const crateId    = document.getElementById('sf-crate')?.value;
  const action     = document.getElementById('sf-action')?.value;
  const whenVal    = document.getElementById('sf-when')?.value;
  if (!crateId || !action || !whenVal) { showAdminMessage('Fill all required fields', true); return; }

  const scheduledAt = new Date(whenVal).toISOString();
  const payload     = {};

  if (action === 'activate' || action === 'restock') {
    const stockEl = document.getElementById('sf-stock');
    if (stockEl?.value) payload.stock = parseInt(stockEl.value, 10);
    if (action === 'restock' && !payload.stock) { showAdminMessage('Stock amount required for restock', true); return; }
  } else if (action === 'price_change') {
    const priceEl = document.getElementById('sf-price');
    const discEl  = document.getElementById('sf-disc');
    if (!priceEl?.value) { showAdminMessage('Price required for price_change', true); return; }
    payload.price = parseInt(priceEl.value, 10);
    payload.discount_percent = parseInt(discEl?.value || '0', 10);
  }

  try {
    await apiPost('/admin/schedule/add', { crateId, action, scheduledAt, payload });
    showAdminMessage('Schedule added');
    document.getElementById('scheduleFormPanel').style.display = 'none';
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

function buildScheduleRow(s) {
  const meta    = ROTATION_CRATE_META[s.crate_id] || { name: s.crate_id, icon: '📦' };
  const when    = new Date(s.scheduled_at).toLocaleString();
  const payload = s.payload ? JSON.stringify(s.payload) : '—';
  return `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #2a2a3e;font-size:11px;">
      <span>${meta.icon}</span>
      <div style="flex:1;">
        <span style="font-weight:bold;">${meta.name}</span>
        <span style="color:var(--muted);margin:0 4px;">→</span>
        <span style="color:#88f;">${s.action}</span>
        <span style="color:var(--muted);margin-left:4px;">${payload}</span>
      </div>
      <span style="color:var(--muted);white-space:nowrap;">${when}</span>
      <button class="admin-action-btn danger" onclick="cancelSchedule(${s.id})" style="font-size:9px;padding:2px 6px;">✕</button>
    </div>
  `;
}

async function cancelSchedule(scheduleId) {
  if (!confirm('Cancel this scheduled action?')) return;
  try {
    await apiPost('/admin/schedule/cancel', { scheduleId });
    showAdminMessage('Schedule cancelled');
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

// ── Quick Presets ─────────────────────────────────────────────────────────────

async function presetWeekendFlashSale() {
  const options = Object.entries(ROTATION_CRATE_META)
    .map(([id, m]) => `${m.icon} ${m.name} (${id})`).join('\n');
  const input = prompt(`Weekend Flash Sale\nEnter crate ID:\n\n${options}`);
  if (!input) return;
  const crateId = input.trim();
  if (!ROTATION_CRATE_META[crateId]) { showAdminMessage('Invalid crate ID', true); return; }

  // Next Friday 18:00 UTC
  const now   = new Date();
  const day   = now.getUTCDay(); // 0=Sun
  const daysToFriday = (5 - day + 7) % 7 || 7; // days until next Friday (minimum 1)
  const friday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToFriday, 18, 0, 0));

  // Following Monday 06:00 UTC
  const monday = new Date(Date.UTC(friday.getUTCFullYear(), friday.getUTCMonth(), friday.getUTCDate() + 3, 6, 0, 0));

  try {
    await apiPost('/admin/schedule/add', {
      crateId,
      action: 'price_change',
      scheduledAt: friday.toISOString(),
      payload: { price: null, discount_percent: 25 },
    });
    await apiPost('/admin/schedule/add', {
      crateId,
      action: 'price_change',
      scheduledAt: monday.toISOString(),
      payload: { discount_percent: 0 },
    });
    showAdminMessage(`Weekend Flash Sale scheduled for ${crateId} (Fri ${friday.toUTCString().slice(0,16)} – Mon ${monday.toUTCString().slice(0,16)})`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

async function presetLimitedDrop() {
  const options = Object.entries(ROTATION_CRATE_META)
    .map(([id, m]) => `${m.icon} ${m.name} (${id})`).join('\n');
  const crateId = (prompt(`Limited Drop\nEnter crate ID:\n\n${options}`) || '').trim();
  if (!crateId || !ROTATION_CRATE_META[crateId]) { showAdminMessage('Invalid crate ID', true); return; }

  const stockStr = prompt(`How many to drop? (will activate crate now with this stock)`);
  if (!stockStr) return;
  const stock = parseInt(stockStr, 10);
  if (!stock || stock <= 0) { showAdminMessage('Invalid stock amount', true); return; }

  try {
    await apiPost('/admin/rotation/update', { crateId, active: true, stockRemaining: stock, stockLimit: stock });
    showAdminMessage(`Limited Drop: ${crateId} activated with ${stock} units`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}
