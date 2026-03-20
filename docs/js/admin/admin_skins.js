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
  if (sel.options.length > 1) return; // already populated
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
// AUTO-LOAD ON TAB OPEN
// ════════════════════════════════════════════════════

(function initAdminSkinsOnTabLoad() {
  document.querySelectorAll('.admin-tab[data-tab="skins"]').forEach(tab => {
    tab.addEventListener('click', () => {
      adminInitSkinGiveDropdown();
      if (typeof adminLoadTradeRestrictions === 'function') adminLoadTradeRestrictions();
    });
  });
})();
