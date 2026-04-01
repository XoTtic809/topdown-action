// js/admin/rotation.js — Case rotation manager (simplified)
'use strict';

var _rotationInited = false;
var _rotationData   = [];
var _weeklyConfig   = null;
var _weeklyPool     = [];
var _weeklyCountdownTimer = null;

var ROTATION_CASE_META = {
  'common-crate':    { name: 'Common Case',    icon: '📦', price: 300 },
  'rare-crate':      { name: 'Rare Case',       icon: '🎁', price: 750 },
  'epic-crate':      { name: 'Epic Case',        icon: '🎭', price: 1500 },
  'legendary-crate': { name: 'Legendary Case',   icon: '⭐', price: 4000 },
  'icon-crate':      { name: 'Icon Case',         icon: '🎯', price: 750 },
  'oblivion-crate':  { name: 'Oblivion Case',    icon: '🌑', price: 10000 },
  'neon-crate':      { name: 'Neon Case',         icon: '⚡', price: 2000 },
  'frost-crate':     { name: 'Frost Case',        icon: '❄️', price: 2500 },
  'infernal-crate':  { name: 'Infernal Case',     icon: '🔥', price: 2500 },
  'void-crate':      { name: 'Void Case',         icon: '🌀', price: 6000 },
};

const CASE_LABELS = ['', 'DAILY', 'WEEKLY', 'FLASH SALE', 'LIMITED TIME', 'NEW', 'WEEKEND ONLY'];

// ── Entry point ───────────────────────────────────────────────────────────────

function initRotationManager() {
  if (_rotationInited) { loadRotationData(); return; }
  _rotationInited = true;
  loadRotationData();
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadRotationData() {
  const el = document.getElementById('rotationManagerCards');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--muted);padding:16px;">Loading cases...</div>';
  const schedEl = document.getElementById('schedulePanel');
  if (schedEl) schedEl.innerHTML = '';

  try {
    const [data, weeklyData] = await Promise.all([
      apiGet('/admin/rotation'),
      apiGet('/admin/rotation/weekly-config').catch(() => null),
    ]);
    _rotationData = data.rotation || [];
    _weeklyConfig = weeklyData?.config || null;
    _weeklyPool   = weeklyData?.pool || [];
    renderRotationPanel(_rotationData);
  } catch (err) {
    el.innerHTML = `<div style="color:#f44;padding:16px;">Failed to load: ${err.message}</div>`;
  }
}

// ── Main panel ────────────────────────────────────────────────────────────────

function renderRotationPanel(rows) {
  const el = document.getElementById('rotationManagerCards');
  if (!el) return;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <h3 style="margin:0;font-size:14px;color:var(--gold);letter-spacing:1px;">🗃️ CASE SHOP MANAGER</h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="admin-action-btn reset" onclick="rcActivateAll()" style="font-size:11px;padding:5px 10px;">✅ All ON</button>
        <button class="admin-action-btn danger" onclick="rcDeactivateAll()" style="font-size:11px;padding:5px 10px;">⛔ All OFF</button>
        <button class="admin-action-btn" onclick="loadRotationData()" style="font-size:11px;padding:5px 10px;">🔄 Refresh</button>
      </div>
    </div>

    <div style="font-size:11px;color:#aaa;margin-bottom:14px;background:#0d1117;border:1px solid #2a2a3e;border-radius:6px;padding:10px;line-height:1.7;">
      <strong style="color:#fff;">How to use:</strong>
      Click <strong style="color:#4c8;">Turn ON</strong> to make a case appear in the shop for players to buy.
      Click <strong style="color:#f77;">Turn OFF</strong> to hide it.
      Use the <em>Label</em> dropdown to show a banner like <em>DAILY</em> or <em>WEEKLY</em> on the case.
      Set a <em>Discount %</em> to show a sale price. Hit <strong>Save</strong> after changing the label or discount.
    </div>

    <div id="weeklyRotationPanel"></div>

    <div id="rcGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px;margin-bottom:16px;"></div>

    <div style="background:#0d1117;border:1px solid #2a2a3e;border-radius:8px;padding:14px;">
      <div style="font-size:12px;color:var(--gold);letter-spacing:1px;margin-bottom:10px;">⚡ QUICK ACTIONS</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="admin-action-btn" onclick="presetResetDefaults()" style="font-size:11px;padding:6px 12px;" title="Activate the standard set of cases and clear all labels/discounts">🔧 Reset to Defaults</button>
        <button class="admin-action-btn reset" onclick="presetWeekendFlashSale()" style="font-size:11px;padding:6px 12px;" title="Schedule 25% off on a case this weekend (Fri 18:00 UTC – Mon 06:00 UTC)">⚡ Weekend Flash Sale</button>
        <button class="admin-action-btn" onclick="presetLimitedDrop()" style="font-size:11px;padding:6px 12px;" title="Activate a case with a limited stock count right now">📦 Limited Drop</button>
      </div>
    </div>
  `;

  const grid = document.getElementById('rcGrid');
  for (const row of rows) {
    grid.appendChild(buildCaseCard(row));
  }

  renderWeeklyRotationPanel();
}

// ── Case card ─────────────────────────────────────────────────────────────────

function buildCaseCard(row) {
  const meta = ROTATION_CASE_META[row.crate_id] || { name: row.crate_id, icon: '📦', price: 0 };

  let statusText = 'OFF', statusColor = '#888', statusBg = '#222';
  if (row.retired)                      { statusText = 'RETIRED';     statusColor = '#555'; statusBg = '#111'; }
  else if (row.stock_remaining === 0)   { statusText = 'SOLD OUT';    statusColor = '#f90'; statusBg = '#2a1500'; }
  else if (row.active && row.weekend_only) { statusText = 'WEEKEND';  statusColor = '#a78'; statusBg = '#1a0a2a'; }
  else if (row.active)                  { statusText = 'LIVE';        statusColor = '#4c8'; statusBg = '#0a2010'; }

  const stockLine = row.stock_remaining != null
    ? ` · Stock: ${row.stock_remaining}${row.stock_limit ? '/' + row.stock_limit : ''}`
    : '';

  const labelOptions = CASE_LABELS.map(l =>
    `<option value="${l}" ${(row.rotation_label || '') === l ? 'selected' : ''}>${l || '— no label —'}</option>`
  ).join('');

  const card = document.createElement('div');
  card.className = 'admin-section';
  card.style.cssText = 'padding:12px;';

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:22px;">${meta.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:bold;font-size:12px;">${meta.name}</div>
        <div style="font-size:10px;color:var(--muted);">🪙 ${meta.price.toLocaleString()}${stockLine}</div>
      </div>
      ${row.auto_rotated ? '<span style="font-size:9px;font-weight:bold;color:#ffd93d;background:#2a2200;padding:2px 6px;border-radius:4px;border:1px solid #ffd93d44;white-space:nowrap;">AUTO</span>' : ''}
      <span style="font-size:10px;font-weight:bold;color:${statusColor};background:${statusBg};
            padding:2px 8px;border-radius:4px;border:1px solid ${statusColor}44;white-space:nowrap;">${statusText}</span>
    </div>

    <button onclick="rcToggleActive('${row.crate_id}', ${!row.active})"
      style="width:100%;padding:8px;margin-bottom:10px;border-radius:6px;border:none;cursor:pointer;
             font-size:12px;font-weight:bold;letter-spacing:.5px;
             background:${row.active ? '#3a1515' : '#152a15'};
             color:${row.active ? '#f77' : '#4c8'};
             border:1px solid ${row.active ? '#f7743a' : '#4c8a3a'};">
      ${row.active ? '⛔  Turn OFF' : '✅  Turn ON'}
    </button>

    <div style="display:grid;grid-template-columns:1fr 70px;gap:8px;margin-bottom:8px;">
      <div>
        <label style="font-size:10px;color:var(--muted);">Label (banner on case card)</label>
        <select id="rc-label-${row.crate_id}" class="auth-input"
          style="margin:3px 0 0;padding:5px 6px;font-size:11px;width:100%;">${labelOptions}</select>
      </div>
      <div>
        <label style="font-size:10px;color:var(--muted);">Discount %</label>
        <input id="rc-disc-${row.crate_id}" type="number" min="0" max="100"
          value="${row.discount_percent || 0}" class="auth-input"
          style="margin:3px 0 0;padding:5px 6px;font-size:11px;">
      </div>
    </div>

    <div style="display:flex;gap:6px;">
      <button class="admin-action-btn" onclick="rcSave('${row.crate_id}')"
        style="flex:1;font-size:11px;padding:5px;">💾 Save</button>
      <button class="admin-action-btn reset" onclick="rcRestock('${row.crate_id}')"
        style="font-size:11px;padding:5px;white-space:nowrap;">+ Stock</button>
    </div>
  `;

  return card;
}

// ── Card actions ──────────────────────────────────────────────────────────────

async function rcToggleActive(crateId, newActive) {
  try {
    await apiPost('/admin/rotation/update', { crateId, active: newActive, weekendOnly: false, autoRotated: false });
    const name = ROTATION_CASE_META[crateId]?.name || crateId;
    showAdminMessage(`${name}: ${newActive ? 'turned ON ✅' : 'turned OFF ⛔'}`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

async function rcSave(crateId) {
  const discEl  = document.getElementById(`rc-disc-${crateId}`);
  const labelEl = document.getElementById(`rc-label-${crateId}`);
  try {
    await apiPost('/admin/rotation/update', {
      crateId,
      discountPercent: parseInt(discEl?.value || '0', 10),
      rotationLabel:   labelEl?.value ?? '',
    });
    const name = ROTATION_CASE_META[crateId]?.name || crateId;
    showAdminMessage(`${name} saved ✅`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

async function rcRestock(crateId) {
  const name = ROTATION_CASE_META[crateId]?.name || crateId;
  const input = prompt(`Add stock to ${name}:\nHow many units to add?`);
  if (!input) return;
  const amount = parseInt(input, 10);
  if (!amount || amount <= 0) { showAdminMessage('Invalid amount', true); return; }
  try {
    await apiPost('/admin/rotation/restock', { crateId, amount });
    showAdminMessage(`${name}: +${amount} stock added ✅`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

// ── Bulk actions ──────────────────────────────────────────────────────────────

async function rcActivateAll() {
  if (!confirm('Turn ALL cases ON in the shop?')) return;
  try {
    for (const row of _rotationData) {
      if (!row.active) {
        // Passing active:true also un-retires the case on the backend
        await apiPost('/admin/rotation/update', { crateId: row.crate_id, active: true, weekendOnly: false });
      }
    }
    showAdminMessage('All cases activated ✅');
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

async function rcDeactivateAll() {
  if (!confirm('Turn ALL cases OFF in the shop?')) return;
  try {
    for (const row of _rotationData) {
      if (!row.retired && row.active) {
        await apiPost('/admin/rotation/update', { crateId: row.crate_id, active: false });
      }
    }
    showAdminMessage('All cases deactivated ⛔');
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

// ── Quick presets ─────────────────────────────────────────────────────────────

async function presetResetDefaults() {
  if (!confirm('Reset to default case rotation?\n\nON: Common, Rare, Epic, Legendary, Icon, Neon, Frost, Infernal\nOFF: Oblivion (weekend-only), Void\n\nThis will clear all labels and discounts.')) return;
  const plan = [
    { id: 'common-crate',    active: true  },
    { id: 'rare-crate',      active: true  },
    { id: 'epic-crate',      active: true  },
    { id: 'legendary-crate', active: true  },
    { id: 'icon-crate',      active: true  },
    { id: 'neon-crate',      active: true  },
    { id: 'frost-crate',     active: true  },
    { id: 'infernal-crate',  active: true  },
    { id: 'oblivion-crate',  active: false },
    { id: 'void-crate',      active: false },
  ];
  try {
    for (const { id, active } of plan) {
      await apiPost('/admin/rotation/update', { crateId: id, active, discountPercent: 0, rotationLabel: null });
    }
    showAdminMessage('Reset to defaults ✅');
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

function _pickCaseDialog(title) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#1a1a2e;border:1px solid #3a3a5e;border-radius:10px;padding:20px;min-width:280px;max-width:360px;';
    box.innerHTML = `
      <div style="font-size:13px;font-weight:bold;color:#fff;margin-bottom:12px;">${title}</div>
      <select id="_pickCaseSelect" class="auth-input" style="width:100%;padding:6px 8px;font-size:12px;margin-bottom:14px;">
        ${Object.entries(ROTATION_CASE_META).map(([id, m]) =>
          `<option value="${id}">${m.icon} ${m.name} — 🪙 ${m.price.toLocaleString()}</option>`
        ).join('')}
      </select>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="admin-action-btn" id="_pickCaseCancel" style="font-size:11px;">Cancel</button>
        <button class="admin-action-btn reset" id="_pickCaseOk" style="font-size:11px;">Select</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.querySelector('#_pickCaseCancel').onclick = () => { overlay.remove(); resolve(null); };
    box.querySelector('#_pickCaseOk').onclick = () => {
      const val = box.querySelector('#_pickCaseSelect').value;
      overlay.remove();
      resolve(val || null);
    };
  });
}

async function presetWeekendFlashSale() {
  const crateId = await _pickCaseDialog('Weekend Flash Sale — pick a case to put on 25% off:');
  if (!crateId) return;

  const now  = new Date();
  const day  = now.getUTCDay();
  const daysToFriday = (5 - day + 7) % 7 || 7;
  const friday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToFriday, 18, 0, 0));
  const monday = new Date(Date.UTC(friday.getUTCFullYear(), friday.getUTCMonth(), friday.getUTCDate() + 3, 6, 0, 0));

  const name = ROTATION_CASE_META[crateId]?.name || crateId;
  try {
    await apiPost('/admin/rotation/schedule/add', {
      crateId, action: 'price_change',
      scheduledAt: friday.toISOString(),
      payload: { price: null, discount_percent: 25 },
    });
    await apiPost('/admin/rotation/schedule/add', {
      crateId, action: 'price_change',
      scheduledAt: monday.toISOString(),
      payload: { discount_percent: 0 },
    });
    showAdminMessage(`Weekend Flash Sale scheduled for ${name} ✅\nFri ${friday.toUTCString().slice(0,16)} → Mon ${monday.toUTCString().slice(0,16)}`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

async function presetLimitedDrop() {
  const crateId = await _pickCaseDialog('Limited Drop — pick a case to activate with limited stock:');
  if (!crateId) return;

  const name = ROTATION_CASE_META[crateId]?.name || crateId;
  const stockStr = prompt(`Limited Drop: ${name}\nHow many units to put in stock?`);
  if (!stockStr) return;
  const stock = parseInt(stockStr, 10);
  if (!stock || stock <= 0) { showAdminMessage('Invalid stock amount', true); return; }

  try {
    await apiPost('/admin/rotation/update', { crateId, active: true, stockRemaining: stock, stockLimit: stock });
    showAdminMessage(`${name}: activated with ${stock} units ✅`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

// ── Weekly Auto-Rotation Panel ───────────────────────────────────────────────

const DAYS_OF_WEEK = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function _formatCountdown(target) {
  const now = Date.now();
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return 'Refreshing...';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function renderWeeklyRotationPanel() {
  const el = document.getElementById('weeklyRotationPanel');
  if (!el) return;

  const cfg = _weeklyConfig;
  const enabled = cfg?.enabled || false;
  const poolSize = cfg?.pool_size || 4;
  const rotDay = cfg?.rotation_day ?? 1;
  const rotHour = cfg?.rotation_hour ?? 12;
  const currentSel = cfg?.current_selection || [];
  const nextAt = cfg?.next_rotation_at;

  // Build pool checkboxes
  const poolChecks = Object.entries(ROTATION_CASE_META).map(([id, m]) => {
    const poolEntry = _weeklyPool.find(p => p.crate_id === id);
    const checked = poolEntry?.auto_rotation_pool ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;padding:3px 6px;
              background:#0d1117;border:1px solid #2a2a3e;border-radius:6px;white-space:nowrap;">
      <input type="checkbox" id="wrc-pool-${id}" ${checked} style="accent-color:#ffd93d;">
      <span>${m.icon}</span><span style="color:#ccc;">${m.name}</span>
    </label>`;
  }).join('');

  // Current selection display
  const selDisplay = currentSel.length > 0
    ? currentSel.map(id => {
        const m = ROTATION_CASE_META[id];
        return m ? `<span style="font-size:11px;background:#1a1a2e;border:1px solid #3a3a5e;border-radius:4px;padding:2px 8px;">${m.icon} ${m.name}</span>` : '';
      }).join(' ')
    : '<span style="color:#666;">None yet — click Refresh Now</span>';

  // Day options
  const dayOptions = DAYS_OF_WEEK.map((name, i) =>
    `<option value="${i}" ${rotDay === i ? 'selected' : ''}>${name}</option>`
  ).join('');

  // Hour options
  const hourOptions = Array.from({length: 24}, (_, i) =>
    `<option value="${i}" ${rotHour === i ? 'selected' : ''}>${String(i).padStart(2,'0')}:00 UTC</option>`
  ).join('');

  el.innerHTML = `
    <div style="background:#0d1117;border:1px solid ${enabled ? '#ffd93d44' : '#2a2a3e'};border-radius:8px;padding:14px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;">🔄</span>
          <span style="font-size:13px;font-weight:bold;color:#ffd93d;letter-spacing:1px;">WEEKLY AUTO-ROTATION</span>
          <span style="font-size:10px;font-weight:bold;padding:2px 8px;border-radius:4px;
            color:${enabled ? '#4c8' : '#f77'};
            background:${enabled ? '#0a2010' : '#2a1010'};
            border:1px solid ${enabled ? '#4c8a3a' : '#f7744a'};">
            ${enabled ? 'ENABLED' : 'DISABLED'}
          </span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="admin-action-btn ${enabled ? 'danger' : 'reset'}" onclick="weeklyToggleEnabled()"
            style="font-size:11px;padding:5px 12px;">${enabled ? '⛔ Disable' : '✅ Enable'}</button>
          <button class="admin-action-btn reset" onclick="weeklyRefreshNow()"
            style="font-size:11px;padding:5px 12px;">🔄 Refresh Now</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:80px 1fr 1fr;gap:8px;margin-bottom:12px;">
        <div>
          <label style="font-size:10px;color:var(--muted);">Pool Size</label>
          <input id="wrc-poolSize" type="number" min="1" max="10" value="${poolSize}" class="auth-input"
            style="margin:3px 0 0;padding:5px 6px;font-size:11px;">
        </div>
        <div>
          <label style="font-size:10px;color:var(--muted);">Rotation Day</label>
          <select id="wrc-day" class="auth-input" style="margin:3px 0 0;padding:5px 6px;font-size:11px;">${dayOptions}</select>
        </div>
        <div>
          <label style="font-size:10px;color:var(--muted);">Rotation Hour</label>
          <select id="wrc-hour" class="auth-input" style="margin:3px 0 0;padding:5px 6px;font-size:11px;">${hourOptions}</select>
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <label style="font-size:10px;color:var(--muted);display:block;margin-bottom:6px;">Case Pool (eligible for auto-rotation)</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${poolChecks}</div>
      </div>

      <div style="margin-bottom:10px;">
        <label style="font-size:10px;color:var(--muted);display:block;margin-bottom:4px;">Current Selection</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${selDisplay}</div>
      </div>

      ${nextAt ? `
        <div style="margin-bottom:10px;">
          <label style="font-size:10px;color:var(--muted);display:block;margin-bottom:4px;">Next Rotation</label>
          <div style="font-size:12px;color:#ffd93d;" id="wrc-countdown">${_formatCountdown(nextAt)}</div>
          <div style="font-size:10px;color:#666;margin-top:2px;">${new Date(nextAt).toUTCString()}</div>
        </div>
      ` : ''}

      <button class="admin-action-btn" onclick="weeklySaveConfig()"
        style="font-size:11px;padding:6px 16px;">💾 Save Config</button>
    </div>
  `;

  // Live countdown tick
  if (_weeklyCountdownTimer) clearInterval(_weeklyCountdownTimer);
  if (nextAt) {
    _weeklyCountdownTimer = setInterval(() => {
      const cdEl = document.getElementById('wrc-countdown');
      if (cdEl) cdEl.textContent = _formatCountdown(nextAt);
      else clearInterval(_weeklyCountdownTimer);
    }, 30000);
  }
}

async function weeklyToggleEnabled() {
  const newEnabled = !(_weeklyConfig?.enabled);
  try {
    await apiPost('/admin/rotation/weekly-config', { enabled: newEnabled });
    showAdminMessage(`Weekly auto-rotation ${newEnabled ? 'ENABLED ✅' : 'DISABLED ⛔'}`);
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

async function weeklySaveConfig() {
  const poolSize = parseInt(document.getElementById('wrc-poolSize')?.value || '4', 10);
  const rotationDay = parseInt(document.getElementById('wrc-day')?.value || '1', 10);
  const rotationHour = parseInt(document.getElementById('wrc-hour')?.value || '12', 10);

  // Gather pool checkboxes
  const pool = {};
  for (const id of Object.keys(ROTATION_CASE_META)) {
    const cb = document.getElementById(`wrc-pool-${id}`);
    if (cb) pool[id] = cb.checked;
  }

  try {
    await apiPost('/admin/rotation/weekly-config', { poolSize, rotationDay, rotationHour, pool });
    showAdminMessage('Weekly config saved ✅');
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}

async function weeklyRefreshNow() {
  if (!confirm('Refresh the weekly rotation now?\n\nThis will deactivate current auto-rotated cases and pick new ones from the pool.')) return;
  try {
    await apiPost('/admin/rotation/weekly-refresh', {});
    showAdminMessage('Weekly rotation refreshed ✅');
    loadRotationData();
  } catch (err) {
    showAdminMessage('Failed: ' + err.message, true);
  }
}
