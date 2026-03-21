// admin-skins.js — Admin panel: Skins tab functionality (Railway backend)
// Provides price editors for skins and crates.
// Skin lookup / give / remove / trade restrictions are handled by api-auth.js

console.log('🎨 Admin skins module loaded');

// ════════════════════════════════════════════════════
// SKIN GIVE DROPDOWN — improved version (all skins)
// ════════════════════════════════════════════════════

function adminInitSkinGiveDropdown() {
  const sel = document.getElementById('skinGiveSelect');
  if (!sel || typeof SKINS === 'undefined') return;
  // Always rebuild to reflect any SKINS array changes
  sel.innerHTML = '<option value="">— Select a skin —</option>';
  SKINS.forEach(skin => {
    const opt = document.createElement('option');
    opt.value = skin.id;
    opt.textContent = `${skin.name} (${skin.id})`;
    sel.appendChild(opt);
  });
}

// ════════════════════════════════════════════════════
// SKIN PRICE EDITOR
// ════════════════════════════════════════════════════

let _skinPriceDropdownInited = false;

function adminInitSkinPriceDropdown() {
  const sel = document.getElementById('skinPriceEditSelect');
  if (!sel || typeof SKINS === 'undefined') return;
  if (_skinPriceDropdownInited) return;
  _skinPriceDropdownInited = true;

  sel.innerHTML = '<option value="">-- Select a shop skin --</option>';
  SKINS.filter(s => s.price > 0 && !s.achievementOnly).forEach(skin => {
    const opt = document.createElement('option');
    opt.value = skin.id;
    opt.textContent = `${skin.name} — 🪙 ${skin.price.toLocaleString()}`;
    sel.appendChild(opt);
  });
}

function adminSkinPriceSelectChange() {
  const sel     = document.getElementById('skinPriceEditSelect');
  const infoEl  = document.getElementById('skinPriceCurrentVal');
  const inputEl = document.getElementById('skinPriceEditValue');
  if (!sel) return;

  const skinId = sel.value;
  if (!skinId) {
    if (infoEl)  infoEl.textContent = 'Select a skin to see its current price';
    if (inputEl) inputEl.value = '';
    return;
  }
  const skin = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === skinId) : null;
  if (!skin) return;
  if (infoEl)  infoEl.textContent = `Current price: 🪙 ${skin.price.toLocaleString()}`;
  if (inputEl) inputEl.value = skin.price;
}

async function adminSaveSkinPrice() {
  if (!isAdmin) return;
  const skinId   = document.getElementById('skinPriceEditSelect')?.value;
  const newPrice = parseInt(document.getElementById('skinPriceEditValue')?.value, 10);
  if (!skinId) { showAdminMessage('Select a skin first', true); return; }
  if (!newPrice || newPrice < 50 || newPrice > 100000) {
    showAdminMessage('Price must be between 50 and 100,000', true);
    return;
  }
  const skin = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === skinId) : null;
  if (!skin) { showAdminMessage('Skin not found', true); return; }
  const oldPrice = skin.price;
  skin.price = newPrice;

  // Update the dropdown label
  const sel = document.getElementById('skinPriceEditSelect');
  if (sel) {
    const opt = [...sel.options].find(o => o.value === skinId);
    if (opt) opt.textContent = `${skin.name} — 🪙 ${newPrice.toLocaleString()}`;
  }
  adminSkinPriceSelectChange();
  showAdminMessage(`✅ ${skin.name}: 🪙 ${oldPrice} → 🪙 ${newPrice} (session only — edit SKINS array in game.js to persist)`);
}

// ════════════════════════════════════════════════════
// CRATE PRICE EDITOR
// ════════════════════════════════════════════════════

let _cratePriceDropdownInited = false;

function adminInitCratePriceDropdown() {
  const sel = document.getElementById('cratePriceEditSelect');
  if (!sel || typeof CRATES === 'undefined') return;
  if (_cratePriceDropdownInited) return;
  _cratePriceDropdownInited = true;

  sel.innerHTML = '<option value="">-- Select a crate --</option>';
  CRATES.forEach(crate => {
    const opt = document.createElement('option');
    opt.value = crate.id;
    opt.textContent = `${crate.icon || '📦'} ${crate.name} — 🪙 ${crate.price.toLocaleString()}`;
    sel.appendChild(opt);
  });
}

function adminCratePriceSelectChange() {
  const sel     = document.getElementById('cratePriceEditSelect');
  const infoEl  = document.getElementById('cratePriceCurrentVal');
  const inputEl = document.getElementById('cratePriceEditValue');
  if (!sel) return;

  const crateId = sel.value;
  if (!crateId) {
    if (infoEl)  infoEl.textContent = 'Select a crate to see its current price';
    if (inputEl) inputEl.value = '';
    return;
  }
  const crate = typeof CRATES !== 'undefined' ? CRATES.find(c => c.id === crateId) : null;
  if (!crate) return;
  if (infoEl)  infoEl.textContent = `Current price: 🪙 ${crate.price.toLocaleString()}`;
  if (inputEl) inputEl.value = crate.price;
}

async function adminSaveCratePrice() {
  if (!isAdmin) return;
  const crateId  = document.getElementById('cratePriceEditSelect')?.value;
  const newPrice = parseInt(document.getElementById('cratePriceEditValue')?.value, 10);
  if (!crateId) { showAdminMessage('Select a crate first', true); return; }
  if (!newPrice || newPrice < 100 || newPrice > 100000) {
    showAdminMessage('Price must be between 100 and 100,000', true);
    return;
  }
  const crate = typeof CRATES !== 'undefined' ? CRATES.find(c => c.id === crateId) : null;
  if (!crate) { showAdminMessage('Crate not found', true); return; }
  const oldPrice = crate.price;
  crate.price = newPrice;

  const sel = document.getElementById('cratePriceEditSelect');
  if (sel) {
    const opt = [...sel.options].find(o => o.value === crateId);
    if (opt) opt.textContent = `${crate.icon || '📦'} ${crate.name} — 🪙 ${newPrice.toLocaleString()}`;
  }
  adminCratePriceSelectChange();
  if (typeof initCratesTab === 'function') initCratesTab();
  showAdminMessage(`✅ ${crate.name}: 🪙 ${oldPrice} → 🪙 ${newPrice} (session only)`);
}

// ════════════════════════════════════════════════════
// MUTATION ADMIN TOOLS
// ════════════════════════════════════════════════════

function adminInitMutationSection() {
  if (typeof MUTATION_CONFIG === 'undefined') return;

  // Build reference table
  const table = document.getElementById('adminMutationTable');
  if (table && table.children.length === 0) {
    // Header row
    ['TYPE', 'CHANCE', 'PRICE MULT', 'TOTAL %'].forEach(h => {
      const cell = document.createElement('div');
      cell.style.cssText = 'font-weight:800;letter-spacing:1px;color:var(--muted);padding:4px 2px;border-bottom:1px solid rgba(255,255,255,0.08)';
      cell.textContent = h;
      table.appendChild(cell);
    });
    // Data rows
    for (const [type, mc] of Object.entries(MUTATION_CONFIG)) {
      const pct = (mc.chance * 100).toFixed(1);
      [mc.label, `1 in ${Math.round(1/mc.chance)}`, `×${mc.priceMultiplier}`, `${pct}%`].forEach((val, i) => {
        const cell = document.createElement('div');
        cell.style.cssText = `padding:5px 2px;color:${i === 0 ? mc.color : 'rgba(255,255,255,0.75)'};font-weight:${i === 0 ? '700' : '400'}`;
        cell.textContent = val;
        table.appendChild(cell);
      });
    }
  }

  // Populate base skin dropdown
  const skinSel = document.getElementById('mutGiveSkinSelect');
  if (skinSel && skinSel.options.length <= 1 && typeof SKINS !== 'undefined') {
    SKINS.filter(s => !s.iconSkin && s.id !== 'icon_the_creator').forEach(skin => {
      const opt = document.createElement('option');
      opt.value = skin.id;
      opt.textContent = `${skin.name} (${skin.id})`;
      skinSel.appendChild(opt);
    });
  }

  // Populate mutation dropdown
  const mutSel = document.getElementById('mutGiveMutSelect');
  if (mutSel && mutSel.options.length <= 1) {
    for (const [type, mc] of Object.entries(MUTATION_CONFIG)) {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = mc.label;
      mutSel.appendChild(opt);
    }
  }

  // Live preview of the resulting skin ID
  const updatePreview = () => {
    const base = document.getElementById('mutGiveSkinSelect')?.value;
    const mut  = document.getElementById('mutGiveMutSelect')?.value;
    const prev = document.getElementById('mutGivePreview');
    if (!prev) return;
    if (base && mut) {
      const mc = MUTATION_CONFIG[mut];
      prev.innerHTML = `Skin ID: <strong style="color:${mc.color}">${base}__${mut}</strong>`;
    } else {
      prev.textContent = '';
    }
  };
  document.getElementById('mutGiveSkinSelect')?.addEventListener('change', updatePreview);
  document.getElementById('mutGiveMutSelect')?.addEventListener('change', updatePreview);
}

let _giveMutLock = false;
async function adminGiveMutatedSkin() {
  if (!isAdmin || _giveMutLock) return;
  _giveMutLock = true;
  const userId   = document.getElementById('mutGiveUserId')?.value.trim();
  const baseSkin = document.getElementById('mutGiveSkinSelect')?.value;
  const mutation = document.getElementById('mutGiveMutSelect')?.value;
  if (!userId)   { showAdminMessage('Enter a User ID', true); return; }
  if (!baseSkin) { showAdminMessage('Select a base skin', true); return; }
  if (!mutation) { showAdminMessage('Select a mutation type', true); return; }

  const skinId = `${baseSkin}__${mutation}`;
  try {
    const data = await apiPost('/users/admin/grant-skin', { targetUid: userId, skinId });
    if (data.error) { showAdminMessage('Error: ' + data.error, true); return; }
    const mc = typeof MUTATION_CONFIG !== 'undefined' ? MUTATION_CONFIG[mutation] : null;
    const skinInfo = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === baseSkin) : null;
    const label = mc ? mc.label : mutation.toUpperCase();
    showAdminMessage(`✦ Gave "${skinInfo?.name || baseSkin} [${label}]" (${skinId}) to user`);
  } catch (err) { showAdminMessage('Error: ' + err.message, true); }
  finally { _giveMutLock = false; }
}

async function adminLookupMutatedSkins() {
  if (!isAdmin) return;
  const userId   = document.getElementById('mutLookupUserId')?.value.trim();
  const resultEl = document.getElementById('mutLookupResult');
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  resultEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  try {
    const data = await apiGet(`/users/${userId}/profile`);
    if (data.error) { resultEl.innerHTML = `<div style="color:#ff6b7a;padding:12px;">${data.error}</div>`; return; }
    const mutated = (data.owned_skins || []).filter(s => s.includes('__'));
    if (mutated.length === 0) {
      resultEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:12px;">No mutated skins found.</div>';
      return;
    }
    resultEl.innerHTML = mutated.map(sid => {
      const [base, mut] = sid.split('__');
      const mc = typeof MUTATION_CONFIG !== 'undefined' && MUTATION_CONFIG[mut] ? MUTATION_CONFIG[mut] : null;
      const skinInfo = typeof SKINS !== 'undefined' ? SKINS.find(s => s.id === base) : null;
      const color = mc ? mc.color : '#fff';
      const label = mc ? mc.label : (mut || '').toUpperCase();
      return `<div style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;">
        <span style="color:${color};font-weight:700">[${label}]</span>
        <span style="margin-left:6px;">${skinInfo?.name || base}</span>
        <span style="color:var(--muted);font-size:10px;margin-left:6px;">${sid}</span>
      </div>`;
    }).join('');
  } catch (err) {
    resultEl.innerHTML = `<div style="color:#ff6b7a;padding:12px;">Error: ${err.message}</div>`;
  }
}

// ════════════════════════════════════════════════════
// AUTO-LOAD ON TAB OPEN
// ════════════════════════════════════════════════════

(function initAdminSkinsOnTabLoad() {
  document.querySelectorAll('.admin-tab[data-tab="skins"]').forEach(tab => {
    tab.addEventListener('click', () => {
      adminInitSkinGiveDropdown();
      adminInitMutationSection();
      if (typeof adminLoadTradeRestrictions === 'function') adminLoadTradeRestrictions();
    });
  });
})();
