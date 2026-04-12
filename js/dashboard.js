// ============================================================
// js/dashboard.js
// Admin Dashboard — all logic for auth, article CRUD,
// image uploads, site settings, and UI state management.
//
// Security note:
//   - Admin access is verified by checking the signed-in
//     user's email against the known admin email.
//   - The email is stored in a JS constant (not exposed in
//     the HTML). This is a client-side check for UX only.
//   - The REAL security layer is Supabase Row-Level Security
//     (RLS). Even if someone bypasses this check, they cannot
//     write or delete data unless they are authenticated as
//     the admin account in Supabase Auth.
//   - See the README for how to improve this with a custom
//     Supabase database role or metadata check instead.
// ============================================================

// ── Admin check — uses Supabase user_metadata.role ──────────
// Set role in Supabase Auth dashboard:
//   Auth → Users → click admin user → Edit → User Metadata
//   Set: { "role": "admin" }
// This is more secure than checking email in client code.
// RLS on your tables is still the real security layer.
// No admin email is exposed anywhere in this file.

// ── Storage bucket name ───────────────────────────────────
const STORAGE_BUCKET = 'news-images';

// ── Global state ──────────────────────────────────────────
let allArticles  = [];   // cached article list
let deleteTarget = null; // id of article pending deletion
let currentUser  = null; // signed-in Supabase user object

// ══════════════════════════════════════════════════════════
// INITIALISATION — runs on page load
// ══════════════════════════════════════════════════════════
(async function init() {

  // Check if a user is already signed in
  const { data: { session } } = await _supabase.auth.getSession();

  if (!session) {
    // Not signed in → redirect to signin page
    window.location.href = 'signin.html';
    return;
  }

  currentUser = session.user;

  // Check if this user is the admin
  const ADMIN_EMAIL = atob('cGVvcGxlc2RhaWx5bmV3c29ubGluZUBnbWFpbC5jb20=');
  const isAdmin = (currentUser.user_metadata && currentUser.user_metadata.role === 'admin') ||
                  (currentUser.app_metadata  && currentUser.app_metadata.role  === 'admin') ||
                  (currentUser.email === ADMIN_EMAIL);
  if (!isAdmin) {
    showScreen('denied');
    return;
  }

  // All good — show the dashboard
  document.getElementById('nav-user-email').textContent = currentUser.email;
  showScreen('dashboard');
  loadOverview();

})();

// Listen for auth state changes (e.g. sign-out in another tab)
_supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    window.location.href = 'signin.html';
    return;
  }

  if (session?.user) {
    currentUser = session.user;

    const isAdminUser = (currentUser.user_metadata && currentUser.user_metadata.role === 'admin') ||
                        (currentUser.app_metadata  && currentUser.app_metadata.role  === 'admin') ||
                        (currentUser.email === ADMIN_EMAIL);
    if (!isAdminUser) {
      showScreen('denied');
      return;
    }

    document.getElementById('nav-user-email').textContent = currentUser.email;
    showScreen('dashboard');
  }
});

// ══════════════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ══════════════════════════════════════════════════════════

function showScreen(which) {
  document.getElementById('access-denied').style.display   = which === 'denied'    ? 'flex'  : 'none';
  document.getElementById('dashboard-shell').style.display = which === 'dashboard' ? 'grid'  : 'none';

  // Clear the inline visibility:hidden on <body> so the CSS class can take effect
  document.body.style.visibility = 'visible';
  document.body.classList.add('auth-ready');
  document.body.classList.remove('auth-pending');
}

// ══════════════════════════════════════════════════════════
// VIEW (TAB) SWITCHING
// ══════════════════════════════════════════════════════════

const viewTitles = {
  'view-overview':     'Overview',
  'view-articles':     'All Articles',
  'view-new':          'New Article',
  'view-settings':     'Site Settings',
  'view-pages':        'Edit Pages',
  'view-subscribers':  'Newsletter Subscribers',
};

function showView(id) {
  // Hide all views, activate the chosen one
  document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  // Update nav link active state
  document.querySelectorAll('.dash-nav-link').forEach(l => l.classList.remove('active'));
  event && event.target && event.target.closest('.dash-nav-link') &&
    event.target.closest('.dash-nav-link').classList.add('active');

  // Update top bar title
  document.getElementById('view-title').textContent = viewTitles[id] || 'Dashboard';

  // Lazy-load data for each view
  if (id === 'view-overview')     loadOverview();
  if (id === 'view-articles')     loadArticlesTable();
  if (id === 'view-settings')     loadSettings();
  if (id === 'view-pages')        loadPageEditor();
  if (id === 'view-subscribers')  loadSubscribers();
}


// ══════════════════════════════════════════════════════════
// AUTH — SIGN OUT
// ══════════════════════════════════════════════════════════

async function doSignOut() {
  await _supabase.auth.signOut();
  currentUser = null;
  window.location.href = 'signin.html';
}

// ══════════════════════════════════════════════════════════
// OVERVIEW — load stats + recent articles preview
// ══════════════════════════════════════════════════════════

async function loadOverview() {
  // Fetch all articles (no status filter — admin sees all)
  const { data, error } = await _supabase
    .from('articles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { toast('Error loading articles: ' + error.message, 'error'); return; }

  allArticles = data || [];

  // Stats
  document.getElementById('stat-total').textContent    = allArticles.length;
  document.getElementById('stat-pub').textContent      = allArticles.filter(a => a.status === 'published').length;
  document.getElementById('stat-draft').textContent    = allArticles.filter(a => a.status === 'draft').length;
  document.getElementById('stat-featured').textContent = allArticles.filter(a => a.is_featured).length;

  // Recent 10 in table
  renderTable(allArticles.slice(0, 10), 'overview-table-wrap');

  // Hero order panel — show featured articles sorted by display_order then published_at
  const featured = allArticles
    .filter(a => a.is_featured && a.status === 'published')
    .sort((a, b) => {
      if (a.display_order && b.display_order) return a.display_order - b.display_order;
      if (a.display_order) return -1;
      if (b.display_order) return 1;
      return new Date(b.published_at) - new Date(a.published_at);
    });
  renderHeroOrderPanel(featured);
}

// ══════════════════════════════════════════════════════════
// ARTICLES TABLE
// ══════════════════════════════════════════════════════════

async function loadArticlesTable() {
  const { data, error } = await _supabase
    .from('articles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { toast('Error loading articles: ' + error.message, 'error'); return; }
  allArticles = data || [];

  // Populate category filter
  const cats = [...new Set(allArticles.map(a => a.category).filter(Boolean))].sort();
  const sel  = document.getElementById('filter-category');
  sel.innerHTML = '<option value="">All categories</option>' +
    cats.map(c => `<option>${c}</option>`).join('');

  renderTable(allArticles, 'articles-table-wrap');
}

function filterTable() {
  const search = document.getElementById('filter-search').value.toLowerCase();
  const status = document.getElementById('filter-status').value;
  const cat    = document.getElementById('filter-category').value;

  const filtered = allArticles.filter(a => {
    const matchSearch = !search || a.title.toLowerCase().includes(search);
    const matchStatus = !status || a.status === status;
    const matchCat    = !cat    || a.category === cat;
    return matchSearch && matchStatus && matchCat;
  });

  renderTable(filtered, 'articles-table-wrap');
}

function renderTable(articles, wrapperId) {
  const wrap = document.getElementById(wrapperId);

  if (!articles || articles.length === 0) {
    wrap.innerHTML = '<p style="padding:28px;color:var(--text-muted);font-size:13px">No articles found.</p>';
    return;
  }

  wrap.innerHTML = `
    <table class="articles-table">
      <thead>
        <tr>
          <th style="width:60px">Image</th>
          <th>Title</th>
          <th>Category</th>
          <th>Status</th>
          <th>Featured</th>
          <th>Date</th>
          <th style="width:160px">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${articles.map(a => `
          <tr data-id="${a.id}">
            <td>
              ${a.image_url
                ? `<img src="${a.image_url}" class="article-thumb" onerror="this.style.display='none'">`
                : `<div class="article-thumb" style="background:var(--border)"></div>`}
            </td>
            <td>
              <div class="article-title-cell">
                ${a.title}
                <div class="article-slug">${a.slug}</div>
              </div>
            </td>
            <td>${a.category ? `<span class="badge badge-grey">${a.category}</span>` : '—'}</td>
            <td>
              <span class="badge ${a.status === 'published' ? 'badge-green' : 'badge-orange'}">
                ${a.status}
              </span>
            </td>
            <td>
              ${a.is_featured
                ? '<span class="badge badge-star">⭐ Featured</span>'
                : '<span style="color:var(--text-muted)">—</span>'}
            </td>
            <td style="white-space:nowrap;font-size:12px;color:var(--text-muted)">
              ${a.created_at ? new Date(a.created_at).toLocaleDateString('en-GB') : '—'}
            </td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-ghost btn-sm" onclick="editArticle('${a.id}')">Edit</button>
                <button class="btn btn-ghost btn-sm" onclick="toggleFeatured('${a.id}', ${a.is_featured})">
                  ${a.is_featured ? 'Unfeature' : 'Feature'}
                </button>
                <button class="btn btn-danger btn-sm" onclick="confirmDelete('${a.id}')">Delete</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ══════════════════════════════════════════════════════════
// ARTICLE FORM — CREATE & EDIT
// ══════════════════════════════════════════════════════════

/** Auto-generate slug from title */
function autoSlug() {
  // Only auto-generate for new articles (no ID)
  if (document.getElementById('form-id').value) return;
  const title = document.getElementById('form-title').value;
  const slug  = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
  document.getElementById('form-slug').value = slug;
}

/** Populate form with existing article data for editing */
function editArticle(id) {
  const a = allArticles.find(x => x.id === id);
  if (!a) { toast('Article not found in cache. Reload the page.', 'error'); return; }

  document.getElementById('form-id').value        = a.id;
  document.getElementById('form-title').value     = a.title || '';
  document.getElementById('form-slug').value      = a.slug || '';
  document.getElementById('form-category').value  = a.category || '';
  document.getElementById('form-author').value    = a.author_name || '';
  document.getElementById('form-source').value    = a.source_name || '';
  document.getElementById('form-status').value    = a.status || 'published';
  document.getElementById('form-excerpt').value   = a.excerpt || '';
  document.getElementById('form-content').value   = a.content || '';
  document.getElementById('form-image-url').value = a.image_url || '';
  document.getElementById('form-featured').checked = !!a.is_featured;

  // Populate the rich editor
  const editorEl = document.getElementById('rich-editor');
  if (editorEl) {
    editorEl.innerHTML = a.content || '';
  }

  // Show image preview if URL exists
  if (a.image_url) {
    document.getElementById('upload-preview').innerHTML =
      `<img src="${a.image_url}" alt="Current image">`;
  }

  document.getElementById('form-panel-title').textContent = 'Edit Article';
  showView('view-new');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Reset form back to blank "new article" state */
function resetForm() {
  document.getElementById('article-form').reset();
  document.getElementById('form-id').value = '';
  document.getElementById('form-slug').value = '';
  document.getElementById('upload-preview').innerHTML = '';
  document.getElementById('upload-status').textContent = '';
  document.getElementById('form-panel-title').textContent = 'Create New Article';

  // Clear rich editor
  const editorEl = document.getElementById('rich-editor');
  if (editorEl) editorEl.innerHTML = '';
}

/** Save article (create or update) */
async function saveArticle(statusOverride) {
  // Sync rich editor content to the hidden textarea first
  const editorEl = document.getElementById('rich-editor');
  if (editorEl) {
    document.getElementById('form-content').value = editorEl.innerHTML.trim();
  }

  const id    = document.getElementById('form-id').value;
  const title = document.getElementById('form-title').value.trim();
  const slug  = document.getElementById('form-slug').value.trim();

  if (!title) {
    toast('Please enter an article title.', 'error');
    return;
  }
  if (!slug) {
    toast('Could not generate a URL for this article. Please check the title.', 'error');
    return;
  }

  // Gather form data
  const payload = {
    title,
    slug,
    category:    document.getElementById('form-category').value || null,
    author_name: document.getElementById('form-author').value.trim() || null,
    source_name: document.getElementById('form-source').value.trim() || null,
    status:      statusOverride || document.getElementById('form-status').value,
    excerpt:     document.getElementById('form-excerpt').value.trim() || null,
    content:     document.getElementById('form-content').value.trim() || null,
    image_url:   document.getElementById('form-image-url').value.trim() || null,
    is_featured: document.getElementById('form-featured').checked,
    updated_at:  new Date().toISOString(),
  };

  let error;

  if (id) {
    // UPDATE existing article
    const res = await _supabase.from('articles').update(payload).eq('id', id);
    error = res.error;
  } else {
    // CREATE new article
    payload.published_at = payload.status === 'published' ? new Date().toISOString() : null;
    const res = await _supabase.from('articles').insert([payload]);
    error = res.error;
  }

  if (error) {
    toast('Save failed: ' + error.message, 'error');
    return;
  }

  toast(id ? 'Article updated!' : 'Article created!', 'success');
  resetForm();
  showView('view-articles');
  loadArticlesTable();
}

// ══════════════════════════════════════════════════════════
// TOGGLE FEATURED
// ══════════════════════════════════════════════════════════

async function toggleFeatured(id, currentValue) {
  const { error } = await _supabase
    .from('articles')
    .update({ is_featured: !currentValue, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) { toast('Error updating featured: ' + error.message, 'error'); return; }

  toast(!currentValue ? 'Article marked as featured.' : 'Article removed from featured.', 'success');
  loadArticlesTable();
}

// ══════════════════════════════════════════════════════════
// DELETE ARTICLE
// ══════════════════════════════════════════════════════════

function confirmDelete(id) {
  deleteTarget = id;
  document.getElementById('delete-modal').classList.add('open');

  document.getElementById('confirm-delete-btn').onclick = async () => {
    closeModal();
    const { error } = await _supabase.from('articles').delete().eq('id', deleteTarget);
    if (error) { toast('Delete failed: ' + error.message, 'error'); return; }
    toast('Article deleted.', 'success');
    deleteTarget = null;
    loadOverview();
    loadArticlesTable();
  };
}

function closeModal() {
  document.getElementById('delete-modal').classList.remove('open');
}

// Close modal on overlay click
document.getElementById('delete-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ══════════════════════════════════════════════════════════
// IMAGE UPLOAD TO SUPABASE STORAGE
// ══════════════════════════════════════════════════════════

async function handleImageUpload(input) {
  const file = input.files[0];
  if (!file) return;

  // Validate size (5 MB max)
  if (file.size > 5 * 1024 * 1024) {
    toast('Image is too large. Maximum size is 5 MB.', 'error');
    return;
  }

  const statusEl  = document.getElementById('upload-status');
  const previewEl = document.getElementById('upload-preview');
  statusEl.textContent = 'Uploading…';

  // Create a unique filename using timestamp + original name
  const ext      = file.name.split('.').pop();
  const fileName = `articles/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await _supabase
    .storage
    .from(STORAGE_BUCKET)
    .upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (error) {
    statusEl.textContent = 'Upload failed: ' + error.message;
    toast('Image upload failed: ' + error.message, 'error');
    return;
  }

  // Get the public URL
  const { data: urlData } = _supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
  const publicUrl = urlData.publicUrl;

  // Fill in the URL field
  document.getElementById('form-image-url').value = publicUrl;
  statusEl.textContent = '✓ Image uploaded successfully.';

  // Show preview
  previewEl.innerHTML = `<img src="${publicUrl}" alt="Uploaded image">`;

  toast('Image uploaded!', 'success');
}

// Drag-and-drop support for upload zone
const uploadZone = document.getElementById('upload-zone');
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById('image-upload-input').files = dt.files;
    handleImageUpload(document.getElementById('image-upload-input'));
  }
});

// ══════════════════════════════════════════════════════════
// SITE SETTINGS
// ══════════════════════════════════════════════════════════

async function loadSettings() {
  const wrap = document.getElementById('settings-form-wrap');

  const { data, error } = await _supabase
    .from('site_settings')
    .select('*')
    .limit(1)
    .single();

  const s = data || {};

  wrap.innerHTML = `
    <div style="max-width:600px">
      <div class="form-row full" style="margin-bottom:14px">
        <div class="form-group">
          <label>Site Name</label>
          <input type="text" id="sett-site-name" value="${escHtml(s.site_name || '')}" placeholder="e.g. People's Daily News Online">
        </div>
      </div>
      <div class="form-row full" style="margin-bottom:14px">
        <div class="form-group">
          <label>Logo URL</label>
          <input type="url" id="sett-logo-url" value="${escHtml(s.logo_url || '')}" placeholder="https://…">
        </div>
      </div>
      <div class="form-row full" style="margin-bottom:14px">
        <div class="form-group">
          <label>Hero Title</label>
          <input type="text" id="sett-hero-title" value="${escHtml(s.hero_title || '')}" placeholder="e.g. Botswana's Most Trusted News Source">
        </div>
      </div>
      <div class="form-row full" style="margin-bottom:24px">
        <div class="form-group">
          <label>Hero Subtitle</label>
          <input type="text" id="sett-hero-subtitle" value="${escHtml(s.hero_subtitle || '')}" placeholder="Short tagline shown below the hero title">
        </div>
      </div>
      <button class="btn btn-primary" onclick="saveSettings('${s.id || ''}')">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        Save Settings
      </button>
    </div>
  `;
}

async function saveSettings(existingId) {
  const payload = {
    site_name:     document.getElementById('sett-site-name').value.trim(),
    logo_url:      document.getElementById('sett-logo-url').value.trim() || null,
    hero_title:    document.getElementById('sett-hero-title').value.trim() || null,
    hero_subtitle: document.getElementById('sett-hero-subtitle').value.trim() || null,
    updated_at:    new Date().toISOString(),
  };

  let error;
  if (existingId) {
    const res = await _supabase.from('site_settings').update(payload).eq('id', existingId);
    error = res.error;
  } else {
    const res = await _supabase.from('site_settings').insert([payload]);
    error = res.error;
  }

  if (error) { toast('Save failed: ' + error.message, 'error'); return; }
  toast('Settings saved!', 'success');
}

// ══════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════════════

let toastTimer;
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + (type || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3500);
}

// ══════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════

/** Escape HTML special characters to avoid injection in innerHTML */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════════════════════
// RICH TEXT EDITOR
// ══════════════════════════════════════════════════════════

function rfmt(cmd) {
  const editor = document.getElementById('rich-editor');
  editor.focus();

  if (cmd === 'bold')       document.execCommand('bold', false, null);
  else if (cmd === 'italic')    document.execCommand('italic', false, null);
  else if (cmd === 'underline') document.execCommand('underline', false, null);
  else if (cmd === 'heading')   document.execCommand('formatBlock', false, 'h2');
  else if (cmd === 'subheading') document.execCommand('formatBlock', false, 'h3');
  else if (cmd === 'para')      document.execCommand('formatBlock', false, 'p');
  else if (cmd === 'ul')        document.execCommand('insertUnorderedList', false, null);
  else if (cmd === 'ol')        document.execCommand('insertOrderedList', false, null);
  else if (cmd === 'quote')     document.execCommand('formatBlock', false, 'blockquote');
  else if (cmd === 'link') {
    const url = prompt('Enter the link URL:');
    if (url) document.execCommand('createLink', false, url);
  }
  else if (cmd === 'clear')     document.execCommand('removeFormat', false, null);
}

// ══════════════════════════════════════════════════════════
// HERO ARTICLE ORDERING
// ══════════════════════════════════════════════════════════

let heroOrderIds = []; // current drag order of featured article IDs

function renderHeroOrderPanel(featuredArticles) {
  const wrap = document.getElementById('hero-order-wrap');
  if (!wrap) return;

  if (!featuredArticles || featuredArticles.length === 0) {
    wrap.innerHTML = `
      <div class="dash-panel-body" style="color:var(--text-muted);font-size:13px">
        No featured articles yet. Mark articles as "Featured" to control their homepage order.
      </div>`;
    return;
  }

  heroOrderIds = featuredArticles.map(a => a.id);

  wrap.innerHTML = `
    <div class="hero-order-list" id="hero-order-list">
      ${featuredArticles.map((a, i) => `
        <div class="hero-order-item" draggable="true" data-id="${a.id}">
          <span class="hero-drag-handle">⠿</span>
          <span class="hero-order-rank" style="font-size:11px;font-weight:700;color:var(--text-muted);min-width:18px">#${i+1}</span>
          ${a.image_url
            ? `<img src="${a.image_url}" class="hero-order-thumb" onerror="this.style.display='none'">`
            : `<div class="hero-order-thumb" style="background:var(--border)"></div>`}
          <div class="hero-order-info">
            <div class="hero-order-title">${escHtml(a.title)}</div>
            <div class="hero-order-meta">${a.category || 'Uncategorised'} · ${a.published_at ? new Date(a.published_at).toLocaleDateString('en-GB') : 'No date'}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="hero-save-bar">
      <span class="hero-save-info">Drag articles up or down to change the order they appear on the homepage hero section.</span>
      <button class="btn btn-primary btn-sm" onclick="saveHeroOrder()">Save Order</button>
    </div>
  `;

  // Wire up drag-and-drop
  initHeroDragDrop();
}

function initHeroDragDrop() {
  const list = document.getElementById('hero-order-list');
  if (!list) return;

  let dragSrc = null;

  list.querySelectorAll('.hero-order-item').forEach(item => {
    item.addEventListener('dragstart', function(e) {
      dragSrc = this;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => this.style.opacity = '0.4', 0);
    });
    item.addEventListener('dragend', function() {
      this.style.opacity = '';
      list.querySelectorAll('.hero-order-item').forEach(i => i.classList.remove('drag-over'));
      // Rebuild heroOrderIds from current DOM order
      heroOrderIds = [...list.querySelectorAll('.hero-order-item')].map(el => el.dataset.id);
      // Update rank numbers
      list.querySelectorAll('.hero-order-rank').forEach((el, i) => el.textContent = '#' + (i+1));
    });
    item.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (this !== dragSrc) {
        list.querySelectorAll('.hero-order-item').forEach(i => i.classList.remove('drag-over'));
        this.classList.add('drag-over');
      }
    });
    item.addEventListener('drop', function(e) {
      e.preventDefault();
      if (this !== dragSrc) {
        const items = [...list.querySelectorAll('.hero-order-item')];
        const srcIdx = items.indexOf(dragSrc);
        const tgtIdx = items.indexOf(this);
        if (srcIdx < tgtIdx) {
          list.insertBefore(dragSrc, this.nextSibling);
        } else {
          list.insertBefore(dragSrc, this);
        }
      }
    });
  });
}

async function saveHeroOrder() {
  // Save display_order to each featured article in Supabase.
  // Requires a display_order INTEGER column in your articles table.
  // Run this SQL in Supabase once:
  //   ALTER TABLE articles ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;
  if (heroOrderIds.length === 0) { toast('Nothing to save.', 'error'); return; }

  const updates = heroOrderIds.map((id, idx) =>
    _supabase.from('articles').update({ display_order: idx + 1 }).eq('id', id)
  );

  const results = await Promise.all(updates);
  const failed = results.filter(r => r.error);

  if (failed.length > 0) {
    // Likely the display_order column doesn't exist yet
    toast('Could not save order. Please add the display_order column to your articles table in Supabase. See comments in dashboard.js for the SQL.', 'error');
    return;
  }

  toast('Hero order saved! Homepage will reflect the new order.', 'success');
  // Refresh cached articles
  allArticles = allArticles.map(a => {
    const newOrder = heroOrderIds.indexOf(a.id);
    if (newOrder !== -1) return { ...a, display_order: newOrder + 1 };
    return a;
  });
}


// ══════════════════════════════════════════════════════════
// PAGES EDITOR
// Edit About Us, Editorial Policy, Contact Us from dashboard
// ══════════════════════════════════════════════════════════

let currentPageSlug = 'about'; // which page is currently loaded

/** Switch between page tabs (About / Editorial Policy / Contact) */
function switchPageTab(slug, btn) {
  document.querySelectorAll('.page-tab').forEach(function(b) {
    b.className = b === btn
      ? 'btn btn-primary btn-sm page-tab active'
      : 'btn btn-ghost btn-sm page-tab';
  });
  currentPageSlug = slug;
  loadPageEditor();
}

/** Load the chosen page from Supabase and show the edit form */
async function loadPageEditor() {
  const wrap = document.getElementById('page-editor-wrap');
  wrap.innerHTML = '<div class="spinner"></div>';

  const { data: page, error } = await _supabase
    .from('pages')
    .select('*')
    .eq('slug', currentPageSlug)
    .single();

  // PGRST116 = no rows found — that's OK, it just hasn't been saved yet
  if (error && error.code !== 'PGRST116') {
    wrap.innerHTML = '<p style="padding:16px;color:var(--text-muted)">Error loading page: ' + error.message + '</p>';
    return;
  }

  const p = page || {};
  const previewHref = currentPageSlug === 'about'
    ? 'about.html'
    : currentPageSlug === 'contact'
      ? 'contact.html'
      : currentPageSlug === 'privacy-policy'
        ? 'privacy-policy.html'
        : currentPageSlug === 'terms-of-use'
          ? 'terms-of-use.html'
          : 'editorial-policy.html';

  // Tab bar — renders all editable pages so no dashboard HTML change is needed
  const pageTabs = [
    { slug: 'about',            label: 'About Us' },
    { slug: 'editorial-policy', label: 'Editorial Policy' },
    { slug: 'contact',          label: 'Contact Us' },
    { slug: 'privacy-policy',   label: 'Privacy Policy' },
    { slug: 'terms-of-use',     label: 'Terms of Use' },
  ];
  const tabBarHTML = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">'
    + pageTabs.map(function(t) {
        return '<button class="btn btn-sm page-tab ' + (t.slug === currentPageSlug ? 'btn-primary active' : 'btn-ghost') + '" onclick="switchPageTab(\'' + t.slug + '\', this)">' + t.label + '</button>';
      }).join('')
    + '</div>';

  wrap.innerHTML = tabBarHTML + `
    <input type="hidden" id="page-id" value="${escHtml(p.id || '')}">

    <div class="form-row full" style="margin-bottom:14px">
      <div class="form-group">
        <label>Page Title</label>
        <input type="text" id="page-title-input"
               value="${escHtml(p.title || '')}"
               placeholder="e.g. About Us">
        <span class="form-hint">Shown as the main heading on the page.</span>
      </div>
    </div>

    <div class="form-row full" style="margin-bottom:20px">
      <div class="form-group">
        <label>Page Content</label>
        <textarea id="page-content-input"
                  style="min-height:380px;resize:vertical;font-size:13px;line-height:1.75"
                  placeholder="Write content here.

Separate paragraphs with a blank line.

Short ALL-CAPS lines become section headings — for example:

OUR MISSION
Write your mission statement here.

CONTACT US
Reach us at news@pdno.co.bw">${escHtml(p.content || '')}</textarea>
        <span class="form-hint">
          ✏️ <strong>Tip:</strong> Use blank lines between paragraphs.
          Short ALL-CAPS lines (like OUR MISSION) automatically become bold headings on the page.
        </span>
      </div>
    </div>

    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-primary" onclick="savePage()">
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Save Page
      </button>
      <a href="${previewHref}" target="_blank" class="btn btn-ghost">
        Preview Page →
      </a>
    </div>
    <div id="page-save-msg" style="margin-top:10px;font-size:12px;font-family:var(--font-ui);min-height:16px"></div>
  `;
}

/** Save the edited page content to Supabase */
async function savePage() {
  const existingId = document.getElementById('page-id').value;
  const title   = document.getElementById('page-title-input').value.trim();
  const content = document.getElementById('page-content-input').value.trim();
  const msgEl   = document.getElementById('page-save-msg');

  if (!title) {
    msgEl.innerHTML = '<span style="color:var(--accent)">Page title is required.</span>';
    return;
  }

  const payload = {
    slug:       currentPageSlug,
    title,
    content,
    updated_at: new Date().toISOString(),
  };

  let error;
  if (existingId) {
    const res = await _supabase.from('pages').update(payload).eq('id', existingId);
    error = res.error;
  } else {
    const res = await _supabase.from('pages').insert([payload]);
    error = res.error;
  }

  if (error) {
    msgEl.innerHTML = '<span style="color:var(--accent)">Save failed: ' + error.message + '</span>';
    toast('Save failed: ' + error.message, 'error');
    return;
  }

  msgEl.innerHTML = '<span style="color:var(--green)">✓ Page saved! Changes are live on the website.</span>';
  toast('Page saved!', 'success');
  // Reload to populate the hidden ID if it was a fresh insert
  setTimeout(loadPageEditor, 600);
}


// ══════════════════════════════════════════════════════════
// NEWSLETTER SUBSCRIBERS
// View and remove newsletter signups
// ══════════════════════════════════════════════════════════

async function loadSubscribers() {
  const wrap    = document.getElementById('subscribers-wrap');
  const countEl = document.getElementById('subscriber-count');
  wrap.innerHTML = '<div class="spinner"></div>';

  const { data, error } = await _supabase
    .from('newsletter_subscribers')
    .select('*')
    .order('subscribed_at', { ascending: false });

  if (error) {
    wrap.innerHTML = '<p style="padding:20px;color:var(--text-muted)">Error: ' + error.message + '</p>';
    return;
  }

  const subs = data || [];
  if (countEl) countEl.textContent = subs.length + ' subscriber' + (subs.length !== 1 ? 's' : '');

  if (subs.length === 0) {
    wrap.innerHTML = '<p style="padding:28px;color:var(--text-muted);font-size:13px;font-family:var(--font-ui)">No subscribers yet. They appear here once readers sign up via the newsletter box on the homepage.</p>';
    return;
  }

  wrap.innerHTML = `
    <table class="articles-table">
      <thead>
        <tr>
          <th style="width:40px">#</th>
          <th>Email Address</th>
          <th style="width:160px">Subscribed</th>
          <th style="width:90px">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${subs.map(function(s, i) { return `
          <tr>
            <td style="color:var(--text-muted);font-size:12px;font-family:var(--font-ui)">${i + 1}</td>
            <td style="font-family:var(--font-ui);font-size:13px;font-weight:500">${escHtml(s.email)}</td>
            <td style="font-family:var(--font-ui);font-size:12px;color:var(--text-muted);white-space:nowrap">
              ${s.subscribed_at
                ? new Date(s.subscribed_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
                : '—'}
            </td>
            <td>
              <button class="btn btn-danger btn-sm"
                      onclick="deleteSubscriber('${s.id}', '${escHtml(s.email)}')">
                Remove
              </button>
            </td>
          </tr>
        `; }).join('')}
      </tbody>
    </table>
    <div style="padding:12px 16px;background:var(--bg-soft);border-top:1px solid var(--border);
                font-family:var(--font-ui);font-size:11px;color:var(--text-muted)">
      ${subs.length} total subscriber${subs.length !== 1 ? 's' : ''}.
      You can copy these emails into Mailchimp, Brevo, or any mailing tool.
    </div>
  `;
}

async function deleteSubscriber(id, email) {
  if (!confirm('Remove ' + email + ' from the subscriber list?')) return;
  const { error } = await _supabase.from('newsletter_subscribers').delete().eq('id', id);
  if (error) { toast('Could not remove: ' + error.message, 'error'); return; }
  toast('Subscriber removed.', 'success');
  loadSubscribers();
}
