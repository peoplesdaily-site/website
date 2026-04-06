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

// ── Admin email (UX guard only — RLS is the real lock) ───
// NOTE: Do not place secrets here. This is just a UI check.
const ADMIN_EMAIL = atob('cGVvcGxlc2RhaWx5bmV3c29ubGluZUBnbWFpbC5jb20=');
// (That's base64 for: peoplesdailynewsonline@gmail.com)
// This is not truly hidden on the frontend — anyone who
// opens DevTools can decode it. RLS handles real security.

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
    // Not signed in → show login screen
    showScreen('login');
    return;
  }

  currentUser = session.user;

  // Check if this user is the admin
  if (currentUser.email !== ADMIN_EMAIL) {
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
    showScreen('login');
  }
});

// ══════════════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ══════════════════════════════════════════════════════════

function showScreen(which) {
  document.getElementById('login-screen').style.display    = which === 'login'     ? 'flex'  : 'none';
  document.getElementById('access-denied').style.display   = which === 'denied'    ? 'flex'  : 'none';
  document.getElementById('dashboard-shell').style.display = which === 'dashboard' ? 'grid'  : 'none';
}

// ══════════════════════════════════════════════════════════
// VIEW (TAB) SWITCHING
// ══════════════════════════════════════════════════════════

const viewTitles = {
  'view-overview':  'Overview',
  'view-articles':  'All Articles',
  'view-new':       'New Article',
  'view-settings':  'Site Settings',
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
  if (id === 'view-overview')  loadOverview();
  if (id === 'view-articles')  loadArticlesTable();
  if (id === 'view-settings')  loadSettings();
}

// ══════════════════════════════════════════════════════════
// AUTH — LOGIN & SIGN OUT
// ══════════════════════════════════════════════════════════

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = 'Please enter your email and password.';
    errEl.style.display = 'block';
    return;
  }

  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });

  if (error) {
    errEl.textContent = 'Sign in failed: ' + error.message;
    errEl.style.display = 'block';
    return;
  }

  currentUser = data.user;

  // Check admin status
  if (currentUser.email !== ADMIN_EMAIL) {
    await _supabase.auth.signOut();
    errEl.textContent = 'Access denied. This account is not authorised to use the dashboard.';
    errEl.style.display = 'block';
    return;
  }

  document.getElementById('nav-user-email').textContent = currentUser.email;
  showScreen('dashboard');
  loadOverview();
}

// Allow pressing Enter in login form
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});
document.getElementById('login-email').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

async function doSignOut() {
  await _supabase.auth.signOut();
  currentUser = null;
  showScreen('login');
  toast('Signed out successfully.', 'success');
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
  document.getElementById('upload-preview').innerHTML = '';
  document.getElementById('upload-status').textContent = '';
  document.getElementById('form-panel-title').textContent = 'Create New Article';
}

/** Save article (create or update) */
async function saveArticle(statusOverride) {
  const id       = document.getElementById('form-id').value;
  const title    = document.getElementById('form-title').value.trim();
  const slug     = document.getElementById('form-slug').value.trim();

  if (!title || !slug) {
    toast('Title and slug are required.', 'error');
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
