// admin-skins.js — Admin panel: Skins tab functionality
// Provides: skin price editor, crate price editor, give/remove skin,
//           lookup user skins, and trade restriction management.

console.log('🎨 Admin skins module loaded');

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════

function _adminLog(action, details = {}) {
  if (!currentUser) return;
  db.collection('activityLogs').add({
    action,
    adminId:   currentUser.uid,
    adminName: currentUser.displayName || currentUser.email,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    ...details
  }).catch(() => {});
}

// ════════════════════════════════════════════════════
// SKIN PRICE EDITOR
// ════════════════════════════════════════════════════

let _skinPriceDropdownInited = false;

function adminInitSkinPriceDropdown() {
  if (_skinPriceDropdownInited) return;
  _skinPriceDropdownInited = true;

  const sel = document.getElementById('skinPriceEditSelect');
  if (!sel || typeof SKINS === 'undefined') return;

  // Only shop skins (price > 0)
  const shopSkins = SKINS.filter(s => s.price > 0);
  shopSkins.forEach(skin => {
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
  if (!sel || !infoEl) return;

  const skinId = sel.value;
  if (!skinId) {
    infoEl.textContent = 'Select a skin to see its current price';
    if (inputEl) inputEl.value = '';
    return;
  }

  const skin = SKINS.find(s => s.id === skinId);
  if (!skin) return;

  infoEl.textContent = `Current price: 🪙 ${skin.price.toLocaleString()}`;
  if (inputEl) inputEl.value = skin.price;
}

async function adminSaveSkinPrice() {
  if (!isAdmin) return;

  const skinId   = document.getElementById('skinPriceEditSelect')?.value;
  const newPrice = parseInt(document.getElementById('skinPriceEditValue')?.value, 10);

  if (!skinId)         { showAdminMessage('Select a skin first', true);          return; }
  if (!newPrice || newPrice < 50 || newPrice > 100000) {
    showAdminMessage('Price must be between 50 and 100,000', true);
    return;
  }

  const skin = SKINS.find(s => s.id === skinId);
  if (!skin) { showAdminMessage('Skin not found', true); return; }

  const oldPrice = skin.price;
  skin.price = newPrice;

  // Update the dropdown label too
  const sel = document.getElementById('skinPriceEditSelect');
  if (sel) {
    const opt = [...sel.options].find(o => o.value === skinId);
    if (opt) opt.textContent = `${skin.name} — 🪙 ${newPrice.toLocaleString()}`;
  }
  adminSkinPriceSelectChange();

  // Log to Firestore
  _adminLog('skin_price_edit', { skinId, skinName: skin.name, oldPrice, newPrice });

  showAdminMessage(`✅ ${skin.name} price updated to 🪙 ${newPrice.toLocaleString()} (session only — redeploy to persist)`);
}

// ════════════════════════════════════════════════════
// CRATE PRICE EDITOR
// ════════════════════════════════════════════════════

let _cratePriceDropdownInited = false;

function adminInitCratePriceDropdown() {
  if (_cratePriceDropdownInited) return;
  _cratePriceDropdownInited = true;

  const sel = document.getElementById('cratePriceEditSelect');
  if (!sel || typeof CRATES === 'undefined') return;

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
  if (!sel || !infoEl) return;

  const crateId = sel.value;
  if (!crateId) {
    infoEl.textContent = 'Select a crate to see its current price';
    if (inputEl) inputEl.value = '';
    return;
  }

  const crate = CRATES.find(c => c.id === crateId);
  if (!crate) return;

  infoEl.textContent = `Current price: 🪙 ${crate.price.toLocaleString()}`;
  if (inputEl) inputEl.value = crate.price;
}

async function adminSaveCratePrice() {
  if (!isAdmin) return;

  const crateId  = document.getElementById('cratePriceEditSelect')?.value;
  const newPrice = parseInt(document.getElementById('cratePriceEditValue')?.value, 10);

  if (!crateId)    { showAdminMessage('Select a crate first', true); return; }
  if (!newPrice || newPrice < 100 || newPrice > 100000) {
    showAdminMessage('Price must be between 100 and 100,000', true);
    return;
  }

  const crate = CRATES.find(c => c.id === crateId);
  if (!crate) { showAdminMessage('Crate not found', true); return; }

  const oldPrice = crate.price;
  crate.price = newPrice;

  const sel = document.getElementById('cratePriceEditSelect');
  if (sel) {
    const opt = [...sel.options].find(o => o.value === crateId);
    if (opt) opt.textContent = `${crate.icon || '📦'} ${crate.name} — 🪙 ${newPrice.toLocaleString()}`;
  }
  adminCratePriceSelectChange();

  _adminLog('crate_price_edit', { crateId, crateName: crate.name, oldPrice, newPrice });

  showAdminMessage(`✅ ${crate.name} price updated to 🪙 ${newPrice.toLocaleString()} (session only — redeploy to persist)`);
}

// ════════════════════════════════════════════════════
// LOOKUP USER SKINS
// ════════════════════════════════════════════════════

async function adminLookupUserSkins() {
  if (!isAdmin) return;

  const userId  = document.getElementById('skinLookupUserId')?.value.trim();
  const resultEl = document.getElementById('skinLookupResult');
  if (!userId) { showAdminMessage('Enter a User ID', true); return; }

  resultEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:12px;">Loading…</div>';

  try {
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) {
      resultEl.innerHTML = '<div style="color:var(--danger);font-size:12px;padding:12px;">User not found.</div>';
      return;
    }
    const data   = snap.data();
    const skins  = data.ownedSkins || [];
    const uname  = data.username || data.email || userId;

    if (!skins.length) {
      resultEl.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:12px;">${uname} owns no skins.</div>`;
      return;
    }

    resultEl.innerHTML = skins.map(skinId => {
      const skin = (typeof SKINS !== 'undefined') ? SKINS.find(s => s.id === skinId) : null;
      const label = skin ? skin.name : skinId;
      const color = skin?.color || '#9be7ff';
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
        <span style="font-size:12px;color:#dbe7ff;">${label}</span>
        <span style="font-size:10px;color:var(--muted);margin-left:auto;">${skinId}</span>
      </div>`;
    }).join('');

    showAdminMessage(`${uname} owns ${skins.length} skin(s)`);
  } catch (err) {
    resultEl.innerHTML = `<div style="color:var(--danger);font-size:12px;padding:12px;">Error: ${err.message}</div>`;
    showAdminMessage('Error loading skins: ' + err.message, true);
  }
}

// ════════════════════════════════════════════════════
// GIVE SKIN TO USER
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

async function adminGiveSkin() {
  if (!isAdmin) return;

  const userId = document.getElementById('skinGiveUserId')?.value.trim();
  const skinId = document.getElementById('skinGiveSelect')?.value;

  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  if (!skinId) { showAdminMessage('Select a skin', true);   return; }

  try {
    const userRef = db.collection('users').doc(userId);
    const snap    = await userRef.get();
    if (!snap.exists) { showAdminMessage('User not found', true); return; }

    const data   = snap.data();
    const skins  = data.ownedSkins || [];

    if (skins.includes(skinId)) {
      showAdminMessage('User already owns this skin', true);
      return;
    }

    skins.push(skinId);
    await userRef.update({ ownedSkins: skins });

    const skin  = (typeof SKINS !== 'undefined') ? SKINS.find(s => s.id === skinId) : null;
    const uname = data.username || data.email || userId;
    _adminLog('admin_give_skin', { targetUserId: userId, targetUsername: uname, skinId, skinName: skin?.name });

    showAdminMessage(`✅ Gave "${skin?.name || skinId}" to ${uname}`);
  } catch (err) {
    showAdminMessage('Error: ' + err.message, true);
  }
}

// ════════════════════════════════════════════════════
// REMOVE SKIN FROM USER
// ════════════════════════════════════════════════════

async function adminLoadUserSkinsForRemoval() {
  if (!isAdmin) return;

  const userId = document.getElementById('skinRemoveUserId')?.value.trim();
  const sel    = document.getElementById('skinRemoveSelect');
  if (!userId) { showAdminMessage('Enter a User ID first', true); return; }

  sel.innerHTML = '<option value="">Loading…</option>';

  try {
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) {
      sel.innerHTML = '<option value="">User not found</option>';
      showAdminMessage('User not found', true);
      return;
    }

    const skins = snap.data().ownedSkins || [];
    if (!skins.length) {
      sel.innerHTML = '<option value="">No skins found</option>';
      showAdminMessage('This user owns no skins', true);
      return;
    }

    sel.innerHTML = '<option value="">— Select skin to remove —</option>';
    skins.forEach(skinId => {
      const skin  = (typeof SKINS !== 'undefined') ? SKINS.find(s => s.id === skinId) : null;
      const opt   = document.createElement('option');
      opt.value   = skinId;
      opt.textContent = skin ? `${skin.name} (${skinId})` : skinId;
      sel.appendChild(opt);
    });

    showAdminMessage(`Loaded ${skins.length} skin(s) for this user`);
  } catch (err) {
    sel.innerHTML = '<option value="">Error loading skins</option>';
    showAdminMessage('Error: ' + err.message, true);
  }
}

async function adminRemoveSkin() {
  if (!isAdmin) return;

  const userId = document.getElementById('skinRemoveUserId')?.value.trim();
  const skinId = document.getElementById('skinRemoveSelect')?.value;

  if (!userId) { showAdminMessage('Enter a User ID', true); return; }
  if (!skinId) { showAdminMessage('Select a skin to remove', true); return; }

  // Safety: never remove the base 'agent' skin
  if (skinId === 'agent') { showAdminMessage('Cannot remove the default Agent skin', true); return; }

  try {
    const userRef = db.collection('users').doc(userId);
    const snap    = await userRef.get();
    if (!snap.exists) { showAdminMessage('User not found', true); return; }

    const data  = snap.data();
    let   skins = data.ownedSkins || [];

    if (!skins.includes(skinId)) {
      showAdminMessage('User does not own this skin', true);
      return;
    }

    skins = skins.filter(s => s !== skinId);
    const updates = { ownedSkins: skins };

    // If it was their active skin, reset to agent
    if (data.activeSkin === skinId) updates.activeSkin = 'agent';

    await userRef.update(updates);

    const skin  = (typeof SKINS !== 'undefined') ? SKINS.find(s => s.id === skinId) : null;
    const uname = data.username || data.email || userId;
    _adminLog('admin_remove_skin', { targetUserId: userId, targetUsername: uname, skinId, skinName: skin?.name });

    showAdminMessage(`✅ Removed "${skin?.name || skinId}" from ${uname}`);

    // Reload the dropdown
    adminLoadUserSkinsForRemoval();
  } catch (err) {
    showAdminMessage('Error: ' + err.message, true);
  }
}

// ════════════════════════════════════════════════════
// TRADE RESTRICTIONS
// ════════════════════════════════════════════════════

async function adminBlockSkinTrade() {
  if (!isAdmin) return;

  const skinId = document.getElementById('tradeRestrictSkinId')?.value.trim();
  const reason = document.getElementById('tradeRestrictReason')?.value.trim() || 'Admin restriction';

  if (!skinId) { showAdminMessage('Enter a Skin ID', true); return; }

  // Champion skins are always blocked; no need to add
  const CHAMPION_IDS = ['gold-champion', 'silver-champion', 'bronze-champion'];
  if (CHAMPION_IDS.includes(skinId)) {
    showAdminMessage('Champion skins are already permanently blocked', true);
    return;
  }

  try {
    await db.collection('tradeRestrictions').doc(skinId).set({
      skinId,
      reason,
      blockedBy:  currentUser.uid,
      blockedAt:  firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Apply in-memory
    if (typeof NON_TRADEABLE_SKINS !== 'undefined') NON_TRADEABLE_SKINS.add(skinId);

    _adminLog('skin_trade_blocked', { skinId, reason });

    document.getElementById('tradeRestrictSkinId').value = '';
    document.getElementById('tradeRestrictReason').value = '';

    showAdminMessage(`⛔ "${skinId}" is now blocked from trading`);
    adminLoadTradeRestrictions();
  } catch (err) {
    showAdminMessage('Error: ' + err.message, true);
  }
}

async function adminUnblockSkinTrade(skinIdOverride) {
  if (!isAdmin) return;

  const skinId = skinIdOverride || document.getElementById('tradeUnrestrictSkinId')?.value.trim();
  if (!skinId) { showAdminMessage('Enter a Skin ID', true); return; }

  // Champion skins cannot be unblocked
  const CHAMPION_IDS = ['gold-champion', 'silver-champion', 'bronze-champion'];
  if (CHAMPION_IDS.includes(skinId)) {
    showAdminMessage('Champion skins are permanently non-tradeable and cannot be unblocked', true);
    return;
  }

  try {
    await db.collection('tradeRestrictions').doc(skinId).delete();

    // Remove in-memory (only if not otherwise non-tradeable by rule)
    if (typeof NON_TRADEABLE_SKINS !== 'undefined') NON_TRADEABLE_SKINS.delete(skinId);

    _adminLog('skin_trade_unblocked', { skinId });

    const inputEl = document.getElementById('tradeUnrestrictSkinId');
    if (inputEl) inputEl.value = '';

    showAdminMessage(`✅ "${skinId}" can now be traded`);
    adminLoadTradeRestrictions();
  } catch (err) {
    showAdminMessage('Error: ' + err.message, true);
  }
}

async function adminLoadTradeRestrictions() {
  if (!isAdmin) return;

  const listEl = document.getElementById('tradeRestrictList');
  if (!listEl) return;

  listEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px;">Loading…</div>';

  try {
    const snap = await db.collection('tradeRestrictions').get();

    if (snap.empty) {
      listEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px;">No manual restrictions active.</div>';
      return;
    }

    listEl.innerHTML = snap.docs.map(doc => {
      const d     = doc.data();
      const skin  = (typeof SKINS !== 'undefined') ? SKINS.find(s => s.id === d.skinId) : null;
      const label = skin ? skin.name : d.skinId;
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:11px;">
        <span style="flex:1;color:#dbe7ff;">${label} <span style="color:var(--muted);">(${d.skinId})</span></span>
        <span style="color:var(--muted);font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;">${d.reason || ''}</span>
        <button onclick="adminUnblockSkinTrade('${d.skinId}')"
          style="padding:3px 8px;background:rgba(107,255,123,0.12);border:1px solid rgba(107,255,123,0.3);
                 border-radius:4px;color:var(--success);font-size:9px;font-weight:700;cursor:pointer;">
          UNBLOCK
        </button>
      </div>`;
    }).join('');

    // Sync in-memory NON_TRADEABLE_SKINS with Firestore
    if (typeof NON_TRADEABLE_SKINS !== 'undefined') {
      snap.docs.forEach(doc => NON_TRADEABLE_SKINS.add(doc.data().skinId));
    }
  } catch (err) {
    listEl.innerHTML = `<div style="color:var(--danger);font-size:12px;padding:8px;">Error: ${err.message}</div>`;
  }
}

// Auto-load trade restrictions when admin skins tab is activated
// (firebase-ui.js already calls adminInitSkinGiveDropdown — we hook in here)
(function initAdminSkinsOnTabLoad() {
  const origTabHandler = document.getElementById('adminPanel');
  if (!origTabHandler) return;

  // Extend the existing tab click handler from firebase-ui.js
  const tabEls = document.querySelectorAll('.admin-tab[data-tab="skins"]');
  tabEls.forEach(tab => {
    tab.addEventListener('click', () => {
      adminInitSkinGiveDropdown();
      adminLoadTradeRestrictions();
    });
  });
})();