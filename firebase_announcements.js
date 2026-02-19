// firebase_announcements.js — admin announcements system

let seenAnnouncements = [];
let _seenLoaded = false; // track whether we've fetched seenAnnouncements from server this session

// ─────────────────────────────────────────────
//  ADMIN: Send an announcement
// ─────────────────────────────────────────────
async function sendAnnouncement(title, message, type = 'info', options = {}) {
  if (!isAdmin) return { success: false, error: 'Not authorized' };
  if (!title || !message) return { success: false, error: 'Title and message are required' };

  try {
    const data = {
      title,
      message,
      type,
      priority:     options.priority || 'normal',
      adminId:      currentUser.uid,
      adminName:    currentUser.displayName || currentUser.email,
      timestamp:    firebase.firestore.FieldValue.serverTimestamp(),
      createdAt:    new Date().toISOString(),
      expiresAt:    options.expiresAt || null,
      active:       options.active !== undefined ? options.active : true,
      showToGuests: options.showToGuests !== undefined ? options.showToGuests : true
    };

    const ref = await db.collection('announcements').add(data);
    await logAdminAction('send_announcement', {
      announcementId: ref.id, title, type,
      priority: data.priority, active: data.active
    });

    return { success: true, id: ref.id };
  } catch (err) {
    console.error('sendAnnouncement error:', err);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────
//  ADMIN: Fetch recent announcements (all, for admin panel)
// ─────────────────────────────────────────────
async function fetchRecentAnnouncements(limit = 10) {
  if (!isAdmin) return [];
  try {
    // Force server read so the list always reflects the latest toggle/delete
    const snap = await db.collection('announcements')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get({ source: 'server' });
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('fetchRecentAnnouncements error:', err);
    return [];
  }
}

// ─────────────────────────────────────────────
//  PUBLIC: Fetch only active, non-expired announcements
//  Kept minimal — only 1 Firestore read per session check
// ─────────────────────────────────────────────
async function fetchActiveAnnouncements() {
  try {
    const snap = await db.collection('announcements')
      .where('active', '==', true)
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();

    const now = new Date();
    return snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(a => !a.expiresAt || new Date(a.expiresAt) > now);
  } catch (err) {
    console.error('fetchActiveAnnouncements error:', err);
    return [];
  }
}

// ─────────────────────────────────────────────
//  ADMIN: Render recent announcements list
// ─────────────────────────────────────────────
async function displayRecentAnnouncements() {
  const listEl = document.getElementById('recentAnnouncements');
  if (!listEl) return;

  listEl.innerHTML = '<div class="loading-spinner">Loading...</div>';
  const announcements = await fetchRecentAnnouncements();

  if (announcements.length === 0) {
    listEl.innerHTML = '<div class="loading-spinner">No announcements yet</div>';
    return;
  }

  const typeIcons = { info: 'ℹ️', warning: '⚠️', success: '✅', error: '❌' };
  const priorityBadges = {
    normal: '',
    high:   '<span style="background:rgba(255,165,0,0.2);color:#ffaa00;padding:2px 6px;border-radius:3px;font-size:9px;margin-left:6px;">⚡ HIGH</span>',
    urgent: '<span style="background:rgba(255,71,87,0.2);color:#ff6b7a;padding:2px 6px;border-radius:3px;font-size:9px;margin-left:6px;">🚨 URGENT</span>'
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
    // Explicit boolean check so missing/undefined field = inactive
    const isActive      = a.active === true;
    const statusBadge   = isActive
      ? '<span class="announce-status" style="color:#6bff7b;">● Active</span>'
      : '<span class="announce-status" style="color:#888;">● Inactive</span>';
    const guestBadge    = a.showToGuests === false
      ? '<span style="font-size:9px;color:#888;margin-left:6px;">👤 Members Only</span>'
      : '';

    let expiryInfo = '';
    if (a.expiresAt) {
      const expiryDate = new Date(a.expiresAt);
      const expired    = expiryDate < new Date();
      expiryInfo = `<div style="font-size:10px;color:${expired ? '#ff6b7a' : '#ffaa00'};margin-top:4px;">
        ⏰ ${expired ? 'Expired' : 'Expires'}: ${expiryDate.toLocaleDateString()}
      </div>`;
    }

    el.innerHTML = `
      <div class="admin-announcement-header">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:18px;">${icon}</span>
          <strong>${a.title}</strong>
          ${priorityBadge}${guestBadge}
        </div>
        ${statusBadge}
      </div>
      <div class="admin-announcement-message">${a.message}</div>
      ${expiryInfo}
      <div class="admin-announcement-meta">by ${a.adminName} · ${time}</div>
      <div class="admin-announcement-actions">
        <button class="admin-action-btn ${isActive ? 'warning' : 'success'}"
                onclick="toggleAnnouncementStatus('${a.id}', ${!isActive}, this)">
          ${isActive ? '🔇 Deactivate' : '🔔 Activate'}
        </button>
        <button class="admin-action-btn delete"
                onclick="deleteAnnouncement('${a.id}', '${a.title.replace(/'/g, "\\'")}')">
          🗑️ Delete
        </button>
      </div>
    `;

    listEl.appendChild(el);
  });
}

// ─────────────────────────────────────────────
//  PUBLIC: Show announcement modal to user
// ─────────────────────────────────────────────
function showAnnouncementToUser(announcement) {
  const isPreview = announcement.id === 'preview';

  // Real announcements: skip if already seen
  if (!isPreview && seenAnnouncements.includes(announcement.id)) return;

  const modal = document.getElementById('announcementModal');
  if (!modal) {
    console.warn('announcementModal element missing from DOM');
    return;
  }

  const titleEl    = modal.querySelector('.announcement-title');
  const subtitleEl = modal.querySelector('.announcement-subtitle');
  const bodyEl     = modal.querySelector('.announcement-body');
  if (!titleEl || !bodyEl) return;

  const typeConfig = {
    info:    { color: '#74b9ff', icon: 'ℹ️',  label: 'Info'      },
    warning: { color: '#fdcb6e', icon: '⚠️',  label: 'Heads Up'  },
    success: { color: '#6bff7b', icon: '✅',  label: 'Good News' },
    error:   { color: '#ff7675', icon: '❌',  label: 'Important' }
  };
  const priorityConfig = {
    normal: { color: 'var(--muted)', label: ''                },
    high:   { color: '#ffaa00',      label: '⚡ High Priority' },
    urgent: { color: '#ff4757',      label: '🚨 Urgent'        }
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
  modal.style.display = 'flex';

  // Mark as seen — never track preview id
  if (!isPreview && !seenAnnouncements.includes(announcement.id)) {
    seenAnnouncements.push(announcement.id);

    if (currentUser && !isGuest) {
      db.collection('users').doc(currentUser.uid)
        .update({ seenAnnouncements })
        .catch(err => console.error('seenAnnouncements write error:', err));
    } else {
      localStorage.setItem('seenAnnouncements', JSON.stringify(seenAnnouncements));
    }
  }
}

// ─────────────────────────────────────────────
//  PUBLIC: Check + display any unseen announcements
//  Called once on login and once on guest entry.
//  Total reads: 1 user doc (first call only) + 1 announcements query
// ─────────────────────────────────────────────
async function checkForNewAnnouncements() {
  try {
    // Load seenAnnouncements only once per session
    if (!_seenLoaded) {
      if (currentUser && !isGuest) {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) seenAnnouncements = userDoc.data().seenAnnouncements || [];
      } else {
        const saved = localStorage.getItem('seenAnnouncements');
        seenAnnouncements = saved ? JSON.parse(saved) : [];
      }
      _seenLoaded = true;
    }

    const announcements = await fetchActiveAnnouncements();
    const relevant      = announcements.filter(a => !(isGuest && a.showToGuests === false));
    const unseen        = relevant.filter(a => !seenAnnouncements.includes(a.id));

    if (unseen.length === 0) return;

    const priorityOrder = { urgent: 3, high: 2, normal: 1 };
    unseen.sort((a, b) => {
      const diff = (priorityOrder[b.priority || 'normal'] || 1)
                 - (priorityOrder[a.priority || 'normal'] || 1);
      if (diff !== 0) return diff;
      const aTime = a.timestamp?.seconds || (new Date(a.createdAt).getTime() / 1000);
      const bTime = b.timestamp?.seconds || (new Date(b.createdAt).getTime() / 1000);
      return bTime - aTime;
    });

    showAnnouncementToUser(unseen[0]);
  } catch (err) {
    console.error('checkForNewAnnouncements error:', err);
  }
}

// Call this on logout so the next login re-fetches cleanly
function resetAnnouncementSession() {
  _seenLoaded = false;
  seenAnnouncements = [];
}

// ─────────────────────────────────────────────
//  ADMIN: Toggle active / inactive
//  Uses optimistic UI — no extra Firestore read on success
// ─────────────────────────────────────────────
async function toggleAnnouncementStatus(announcementId, newStatus, btnEl) {
  if (!isAdmin) return;

  // Optimistic UI — update DOM immediately
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
    await db.collection('announcements').doc(announcementId).update({ active: newStatus });
    await logAdminAction('toggle_announcement', { announcementId, newStatus });
  } catch (err) {
    console.error('toggleAnnouncementStatus error:', err);
    showAdminMessage('Toggle failed: ' + err.message, true);
    displayRecentAnnouncements(); // revert on error
  }
}

// ─────────────────────────────────────────────
//  ADMIN: Delete announcement
// ─────────────────────────────────────────────
async function deleteAnnouncement(announcementId, title) {
  if (!isAdmin) return;
  if (!confirm(`Delete announcement: "${title}"?`)) return;

  try {
    await db.collection('announcements').doc(announcementId).delete();
    await logAdminAction('delete_announcement', { announcementId, title });
    // Remove card from DOM instantly — no re-fetch needed
    const entry = document.querySelector(`[data-announcement-id="${announcementId}"]`);
    if (entry) entry.remove();
    const listEl = document.getElementById('recentAnnouncements');
    if (listEl && !listEl.querySelector('.admin-announcement-entry')) {
      listEl.innerHTML = '<div class="loading-spinner">No announcements yet</div>';
    }
    showAdminMessage('Announcement deleted');
  } catch (err) {
    console.error('deleteAnnouncement error:', err);
    showAdminMessage('Error: ' + err.message, true);
  }
}

// ─────────────────────────────────────────────
//  DOM-READY: bind admin panel controls
// ─────────────────────────────────────────────
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

  // Preview — always shows regardless of seen history
  const previewBtn = document.getElementById('previewAnnouncementBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      const title    = titleInput?.value.trim();
      const message  = messageInput?.value.trim();
      const type     = document.getElementById('announceType')?.value     || 'info';
      const priority = document.getElementById('announcePriority')?.value || 'normal';

      if (!title || !message) {
        showAdminMessage('Enter a title and message to preview', true);
        return;
      }

      showAnnouncementToUser({ id: 'preview', title, message, type, priority });
      showAdminMessage('Preview shown — close the modal to keep editing.');
    });
  }

  // Send
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

      if (!title || !message) {
        showAdminMessage('Please enter both a title and a message', true);
        return;
      }

      sendBtn.disabled = true;
      showAdminMessage('Sending…');

      const result = await sendAnnouncement(title, message, type, {
        priority,
        expiresAt:    expiryInput ? new Date(expiryInput).toISOString() : null,
        active,
        showToGuests
      });

      sendBtn.disabled = false;

      if (result.success) {
        showAdminMessage(`Announcement ${active ? 'sent and active' : 'saved as draft'}!`);
        if (titleInput)   titleInput.value   = '';
        if (messageInput) messageInput.value = '';
        const fields = ['announceType','announcePriority','announceExpiry'];
        const defaults = ['info','normal',''];
        fields.forEach((id, i) => { const el = document.getElementById(id); if (el) el.value = defaults[i]; });
        const checks = ['announceActive','announceShowToGuests'];
        checks.forEach(id => { const el = document.getElementById(id); if (el) el.checked = true; });
        if (titleCounter)   titleCounter.textContent   = '0/100';
        if (messageCounter) messageCounter.textContent = '0/500';
        displayRecentAnnouncements();
      } else {
        showAdminMessage('Error: ' + result.error, true);
      }
    });
  }

  // Close user-facing announcement modal
  const closeBtn = document.getElementById('closeAnnouncementBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const modal = document.getElementById('announcementModal');
      if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
    });
  }
});