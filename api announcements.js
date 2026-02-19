// api-announcements.js
// Full replacement for firebase_announcements.js
// Uses Railway backend — no Firebase needed.

let seenAnnouncements = [];
let _seenLoaded = false;

function resetAnnouncementSession() {
  _seenLoaded = false;
  seenAnnouncements = [];
}

// ─── Public: fetch active announcements ───────────────────────
async function fetchActiveAnnouncements() {
  try {
    const res = await fetch('https://web-production-144da.up.railway.app/api/announcements/active');
    return await res.json();
  } catch (err) {
    console.error('fetchActiveAnnouncements error:', err);
    return [];
  }
}

// ─── Admin: fetch all announcements ───────────────────────────
async function fetchRecentAnnouncements(limit = 10) {
  if (!isAdmin) return [];
  try {
    const token = localStorage.getItem('topdown_token');
    const res   = await fetch('https://web-production-144da.up.railway.app/api/announcements/admin/list', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const rows = await res.json();
    // Map to Firebase shape so existing UI code works
    return rows.slice(0, limit).map(r => ({
      id:           r.id,
      title:        r.title,
      message:      r.message,
      type:         r.type,
      priority:     r.priority,
      adminName:    r.admin_name,
      active:       r.active,
      showToGuests: r.show_to_guests,
      expiresAt:    r.expires_at,
      timestamp:    { seconds: Math.floor(new Date(r.created_at).getTime() / 1000) },
      createdAt:    r.created_at,
    }));
  } catch (err) {
    console.error('fetchRecentAnnouncements error:', err);
    return [];
  }
}

// ─── Admin: send announcement ─────────────────────────────────
async function sendAnnouncement(title, message, type = 'info', options = {}) {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  if (!title || !message) return { success: false, error: 'Title and message are required' };
  try {
    const token = localStorage.getItem('topdown_token');
    const res   = await fetch('https://web-production-144da.up.railway.app/api/announcements/admin/create', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        title,
        message,
        type,
        priority:     options.priority     || 'normal',
        active:       options.active       !== undefined ? options.active       : true,
        showToGuests: options.showToGuests !== undefined ? options.showToGuests : true,
        expiresAt:    options.expiresAt    || null,
      }),
    });
    const data = await res.json();
    if (data.error) return { success: false, error: data.error };
    return { success: true, id: data.announcement?.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Admin: toggle active ─────────────────────────────────────
async function toggleAnnouncementStatus(announcementId, newStatus, btnEl) {
  if (!isAdmin) return;

  // Optimistic UI
  const entry = btnEl?.closest('.admin-announcement-entry');
  if (entry) {
    const statusSpan = entry.querySelector('.announce-status');
    if (statusSpan) {
      statusSpan.textContent = newStatus ? '● Active' : '● Inactive';
      statusSpan.style.color = newStatus ? '#6bff7b' : '#888';
    }
    btnEl.textContent = newStatus ? '🔇 Deactivate' : '🔔 Activate';
    btnEl.className   = `admin-action-btn ${newStatus ? 'warning' : 'success'}`;
    btnEl.onclick     = () => toggleAnnouncementStatus(announcementId, !newStatus, btnEl);
  }

  try {
    const token = localStorage.getItem('topdown_token');
    await fetch('https://web-production-144da.up.railway.app/api/announcements/admin/toggle', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ announcementId, active: newStatus }),
    });
  } catch (err) {
    console.error('toggleAnnouncementStatus error:', err);
    showAdminMessage('Toggle failed: ' + err.message, true);
    displayRecentAnnouncements();
  }
}

// ─── Admin: delete announcement ───────────────────────────────
async function deleteAnnouncement(announcementId, title) {
  if (!isAdmin) return;
  if (!confirm(`Delete announcement: "${title}"?`)) return;
  try {
    const token = localStorage.getItem('topdown_token');
    await fetch(`https://web-production-144da.up.railway.app/api/announcements/admin/${announcementId}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const entry = document.querySelector(`[data-announcement-id="${announcementId}"]`);
    if (entry) entry.remove();
    const listEl = document.getElementById('recentAnnouncements');
    if (listEl && !listEl.querySelector('.admin-announcement-entry')) {
      listEl.innerHTML = '<div class="loading-spinner">No announcements yet</div>';
    }
    showAdminMessage('Announcement deleted');
  } catch (err) {
    showAdminMessage('Error: ' + err.message, true);
  }
}

// ─── Admin: render list ───────────────────────────────────────
async function displayRecentAnnouncements() {
  const listEl = document.getElementById('recentAnnouncements');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  const announcements = await fetchRecentAnnouncements();
  if (announcements.length === 0) {
    listEl.innerHTML = '<div class="loading-spinner">No announcements yet</div>';
    return;
  }
  const typeIcons = { info:'ℹ️', warning:'⚠️', success:'✅', error:'❌' };
  const priorityBadges = {
    normal: '',
    high:   '<span style="background:rgba(255,165,0,0.2);color:#ffaa00;padding:2px 6px;border-radius:3px;font-size:9px;margin-left:6px;">⚡ HIGH</span>',
    urgent: '<span style="background:rgba(255,71,87,0.2);color:#ff6b7a;padding:2px 6px;border-radius:3px;font-size:9px;margin-left:6px;">🚨 URGENT</span>',
  };
  listEl.innerHTML = '';
  announcements.forEach(a => {
    const el = document.createElement('div');
    el.className = 'admin-announcement-entry';
    el.dataset.announcementId = a.id;
    const time = a.timestamp
      ? new Date(a.timestamp.seconds * 1000).toLocaleString()
      : new Date(a.createdAt).toLocaleString();
    const icon          = typeIcons[a.type] || 'ℹ️';
    const priorityBadge = priorityBadges[a.priority || 'normal'] || '';
    const isActive      = a.active === true;
    const statusBadge   = isActive
      ? '<span class="announce-status" style="color:#6bff7b;">● Active</span>'
      : '<span class="announce-status" style="color:#888;">● Inactive</span>';
    const guestBadge = a.showToGuests === false
      ? '<span style="font-size:9px;color:#888;margin-left:6px;">👤 Members Only</span>' : '';
    let expiryInfo = '';
    if (a.expiresAt) {
      const d = new Date(a.expiresAt);
      const expired = d < new Date();
      expiryInfo = `<div style="font-size:10px;color:${expired?'#ff6b7a':'#ffaa00'};margin-top:4px;">⏰ ${expired?'Expired':'Expires'}: ${d.toLocaleDateString()}</div>`;
    }
    el.innerHTML = `
      <div class="admin-announcement-header">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:18px;">${icon}</span>
          <strong>${a.title}</strong>${priorityBadge}${guestBadge}
        </div>
        ${statusBadge}
      </div>
      <div class="admin-announcement-message">${a.message}</div>
      ${expiryInfo}
      <div class="admin-announcement-meta">by ${a.adminName} · ${time}</div>
      <div class="admin-announcement-actions">
        <button class="admin-action-btn ${isActive?'warning':'success'}"
                onclick="toggleAnnouncementStatus('${a.id}',${!isActive},this)">
          ${isActive?'🔇 Deactivate':'🔔 Activate'}
        </button>
        <button class="admin-action-btn delete"
                onclick="deleteAnnouncement('${a.id}','${a.title.replace(/'/g,"\\'")}')">
          🗑️ Delete
        </button>
      </div>`;
    listEl.appendChild(el);
  });
}

// ─── Public: show modal to user ───────────────────────────────
function showAnnouncementToUser(announcement) {
  const isPreview = announcement.id === 'preview';
  if (!isPreview && seenAnnouncements.includes(announcement.id)) return;

  const modal = document.getElementById('announcementModal');
  if (!modal) return;
  const titleEl    = modal.querySelector('.announcement-title');
  const subtitleEl = modal.querySelector('.announcement-subtitle');
  const bodyEl     = modal.querySelector('.announcement-body');
  if (!titleEl || !bodyEl) return;

  const typeConfig = {
    info:    { color:'#74b9ff', icon:'ℹ️',  label:'Info'      },
    warning: { color:'#fdcb6e', icon:'⚠️',  label:'Heads Up'  },
    success: { color:'#6bff7b', icon:'✅',  label:'Good News' },
    error:   { color:'#ff7675', icon:'❌',  label:'Important' },
  };
  const priorityConfig = {
    normal: { color:'var(--muted)', label:''                },
    high:   { color:'#ffaa00',      label:'⚡ High Priority' },
    urgent: { color:'#ff4757',      label:'🚨 Urgent'        },
  };
  const tc = typeConfig[announcement.type] || typeConfig.info;
  const pc = priorityConfig[announcement.priority || 'normal'];

  titleEl.textContent = `${tc.icon} ${announcement.title}`;
  titleEl.style.color = tc.color;
  bodyEl.textContent  = announcement.message;
  if (subtitleEl) {
    subtitleEl.textContent = pc.label || tc.label;
    subtitleEl.style.color = pc.label ? pc.color : 'var(--muted)';
  }

  modal.classList.remove('hidden');

  // Mark as seen
  if (!isPreview) {
    seenAnnouncements.push(announcement.id);
    // Save to server if logged in
    const token = localStorage.getItem('topdown_token');
    if (token && currentUser && !isGuest) {
      fetch('https://web-production-144da.up.railway.app/api/announcements/seen', {
        method:  'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
        body: JSON.stringify({ announcementId: announcement.id }),
      }).catch(() => {});
    } else {
      // Guest — use localStorage
      localStorage.setItem('seenAnnouncements', JSON.stringify(seenAnnouncements));
    }
  }
}

// ─── Public: check + show unseen announcements ────────────────
async function checkForNewAnnouncements() {
  try {
    if (!_seenLoaded) {
      if (currentUser && !isGuest) {
        // Server tracks seen announcements for logged-in users
        // We trust the filter in fetchActiveAnnouncements + local array
        const saved = localStorage.getItem('seenAnnouncements');
        seenAnnouncements = saved ? JSON.parse(saved) : [];
      } else {
        const saved = localStorage.getItem('seenAnnouncements');
        seenAnnouncements = saved ? JSON.parse(saved) : [];
      }
      _seenLoaded = true;
    }

    const announcements = await fetchActiveAnnouncements();
    const relevant = announcements.filter(a => !(isGuest && a.show_to_guests === false));
    const unseen   = relevant.filter(a => !seenAnnouncements.includes(a.id));
    if (unseen.length === 0) return;

    // Show highest priority first
    const order = { urgent: 3, high: 2, normal: 1 };
    unseen.sort((a, b) => (order[b.priority||'normal']||1) - (order[a.priority||'normal']||1));

    // Map to shape showAnnouncementToUser expects
    showAnnouncementToUser({
      id:       unseen[0].id,
      title:    unseen[0].title,
      message:  unseen[0].message,
      type:     unseen[0].type,
      priority: unseen[0].priority,
    });
  } catch (err) {
    console.error('checkForNewAnnouncements error:', err);
  }
}

// ─── DOM ready: bind admin panel controls ─────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const titleInput     = document.getElementById('announceTitle');
  const messageInput   = document.getElementById('announceMessage');
  const titleCounter   = document.getElementById('titleCounter');
  const messageCounter = document.getElementById('messageCounter');

  if (titleInput && titleCounter) {
    titleInput.addEventListener('input', () => {
      const n = titleInput.value.length;
      titleCounter.textContent = `${n}/100`;
      titleCounter.style.color = n > 80 ? '#ff6b7a' : 'var(--muted)';
    });
  }
  if (messageInput && messageCounter) {
    messageInput.addEventListener('input', () => {
      const n = messageInput.value.length;
      messageCounter.textContent = `${n}/500`;
      messageCounter.style.color = n > 450 ? '#ff6b7a' : 'var(--muted)';
    });
  }

  const previewBtn = document.getElementById('previewAnnouncementBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      const title    = titleInput?.value.trim();
      const message  = messageInput?.value.trim();
      const type     = document.getElementById('announceType')?.value     || 'info';
      const priority = document.getElementById('announcePriority')?.value || 'normal';
      if (!title || !message) { showAdminMessage('Enter title and message to preview', true); return; }
      showAnnouncementToUser({ id:'preview', title, message, type, priority });
      showAdminMessage('Preview shown!');
    });
  }

  const sendBtn = document.getElementById('sendAnnouncementBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      const title        = titleInput?.value.trim();
      const message      = messageInput?.value.trim();
      const type         = document.getElementById('announceType')?.value         || 'info';
      const priority     = document.getElementById('announcePriority')?.value     || 'normal';
      const expiryInput  = document.getElementById('announceExpiry')?.value;
      const active       = document.getElementById('announceActive')?.checked     ?? true;
      const showToGuests = document.getElementById('announceShowToGuests')?.checked ?? true;
      if (!title || !message) { showAdminMessage('Please enter title and message', true); return; }

      sendBtn.disabled = true;
      showAdminMessage('Sending…');

      const result = await sendAnnouncement(title, message, type, {
        priority, expiresAt: expiryInput ? new Date(expiryInput).toISOString() : null,
        active, showToGuests,
      });

      sendBtn.disabled = false;
      if (result.success) {
        showAdminMessage(`Announcement ${active?'sent and active':'saved as draft'}!`);
        if (titleInput)   titleInput.value   = '';
        if (messageInput) messageInput.value = '';
        ['announceType','announcePriority','announceExpiry'].forEach((id,i) => {
          const el=document.getElementById(id); if(el) el.value=['info','normal',''][i];
        });
        ['announceActive','announceShowToGuests'].forEach(id => {
          const el=document.getElementById(id); if(el) el.checked=true;
        });
        if (titleCounter)   titleCounter.textContent   = '0/100';
        if (messageCounter) messageCounter.textContent = '0/500';
        displayRecentAnnouncements();
      } else {
        showAdminMessage('Error: ' + result.error, true);
      }
    });
  }

  const closeBtn = document.getElementById('closeAnnouncementBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const modal = document.getElementById('announcementModal');
      if (modal) { modal.classList.add('hidden'); modal.style.display='none'; }
    });
  }
});

console.log('✅ api-announcements.js loaded — Railway backend active');