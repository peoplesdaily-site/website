// ============================================================
// js/article.js
// Reads the ?slug= query parameter, fetches the matching
// article from Supabase, and renders it into article.html.
// Also loads related articles in the sidebar.
// ============================================================

(async function () {

  // ── Helpers ──────────────────────────────────────────────

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  function placeholderSVG(h) {
    return `<div class="img-placeholder" style="height:${h}px">
      <svg viewBox="0 0 48 48" fill="none">
        <rect x="6" y="10" width="36" height="28" rx="2" stroke="#bbb" stroke-width="2"/>
        <circle cx="18" cy="20" r="4" stroke="#bbb" stroke-width="2"/>
        <path d="M6 32l8-8 6 6 8-10 14 14" stroke="#bbb" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    </div>`;
  }

  function tagClass(category) {
    const map = {
      'Politics': 'tag-navy', 'Business': 'tag-gold', 'Economy': 'tag-gold',
      'Crime': 'tag-navy', 'Local News': 'tag-red', 'Breaking': 'tag-red',
      'Sports': 'tag-navy', 'Entertainment': 'tag-navy', 'World': 'tag-navy',
    };
    return map[category] || 'tag-outline';
  }

  function showError(msg) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
    document.getElementById('article-layout').style.display = 'none';
    if (msg) {
      document.querySelector('#error-state p').textContent = msg;
    }
  }

  function showArticle() {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'none';
    document.getElementById('article-layout').style.display = 'grid';
  }

  // ── Get slug from URL ─────────────────────────────────────

  const params = new URLSearchParams(window.location.search);
  const slug   = params.get('slug');

  if (!slug) {
    showError('No article specified. Please go back to the homepage.');
    return;
  }

  // ── Fetch the article ─────────────────────────────────────

  const { data: article, error } = await _supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error || !article) {
    showError('This article could not be found or is no longer available.');
    return;
  }

  // ── Update page title & meta ──────────────────────────────

  document.title = article.title + ' — People\'s Daily News Online';

  // ── Build the article HTML ────────────────────────────────

  const imageHTML = article.image_url
    ? `<img src="${article.image_url}" alt="${article.title}"
             class="article-hero-img"
             onerror="this.outerHTML=\`${placeholderSVG(360)}\`">`
    : placeholderSVG(360);

  // Convert plain text content into paragraphs.
  // Supports:
  //   - HTML content (returned as-is)
  //   - Lines that are bare image URLs (.jpg/.png/.gif/.webp/.jpeg) → rendered as <img>
  //   - Double-newline separated paragraphs
  function contentToHTML(text) {
    if (!text) return '<p><em>No content available.</em></p>';
    // If content already contains HTML tags, return as-is
    if (/<[a-z][\s\S]*>/i.test(text)) return text;
    // Otherwise split on double newlines and process each block
    var imageUrlPattern = /^https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)(\?[^\s]*)?$/i;
    return text
      .split(/\n\n+/)
      .map(function(para) {
        var trimmed = para.trim();
        if (!trimmed) return '';
        // A single line that is an image URL → render as image
        if (!trimmed.includes('\n') && imageUrlPattern.test(trimmed)) {
          return '<img src="' + trimmed + '" alt="Article image" class="article-img-inline" onerror="this.style.display=\'none\'">';
        }
        return '<p>' + trimmed.replace(/\n/g, '<br>') + '</p>';
      })
      .filter(function(s) { return s.length > 0; })
      .join('');
  }

  const mainEl = document.getElementById('article-main');
  mainEl.innerHTML = `
    <!-- Breadcrumb navigation -->
    <div class="article-breadcrumb">
      <a href="index.html">Home</a>
      ${article.category ? ` &rsaquo; <a href="index.html">${article.category}</a>` : ''}
      &rsaquo; Article
    </div>

    <!-- Category tag -->
    ${article.category
      ? `<span class="article-category-tag ${tagClass(article.category)}">${article.category}</span>`
      : ''}

    <!-- Title -->
    <h1 class="article-title">${article.title}</h1>

    <!-- Excerpt / standfirst -->
    ${article.excerpt
      ? `<p class="article-excerpt">${article.excerpt}</p>`
      : ''}

    <!-- Meta bar -->
    <div class="article-meta">
      ${article.author_name ? `<span>By <strong>${article.author_name}</strong></span>` : ''}
      ${article.source_name ? `<span class="source">${article.source_name}</span>` : ''}
      ${article.published_at ? `<span>${fmtDate(article.published_at)}</span>` : ''}
    </div>

    <!-- Hero image -->
    ${imageHTML}

    <!-- Body content -->
    <div class="article-body">
      ${contentToHTML(article.content)}
    </div>

    <!-- Related articles loaded below by JS -->
    <div id="related-section"></div>
  `;

  showArticle();

  // ── Prev / Next article navigation ───────────────────────

  const pubAt = article.published_at;
  if (pubAt) {
    const [prevRes, nextRes] = await Promise.all([
      _supabase.from('articles')
        .select('title, slug, category')
        .eq('status', 'published')
        .lt('published_at', pubAt)
        .order('published_at', { ascending: false })
        .limit(1),
      _supabase.from('articles')
        .select('title, slug, category')
        .eq('status', 'published')
        .gt('published_at', pubAt)
        .order('published_at', { ascending: true })
        .limit(1)
    ]);

    const prev = prevRes.data?.[0] || null;
    const next = nextRes.data?.[0] || null;

    if (prev || next) {
      const navEl = document.getElementById('article-nav');
      navEl.style.display = 'block';
      navEl.innerHTML = `
        <div class="article-nav">
          ${prev
            ? `<a class="article-nav-link nav-prev" href="article.html?slug=${encodeURIComponent(prev.slug)}">
                <div class="article-nav-label">← Previous Article</div>
                <div class="article-nav-title">${prev.title}</div>
               </a>`
            : `<span class="article-nav-placeholder"></span>`}
          ${next
            ? `<a class="article-nav-link nav-next" href="article.html?slug=${encodeURIComponent(next.slug)}">
                <div class="article-nav-label">Next Article →</div>
                <div class="article-nav-title">${next.title}</div>
               </a>`
            : `<span class="article-nav-placeholder"></span>`}
        </div>
      `;
    }
  }

  // ── Fetch sidebar: recent articles ───────────────────────

  const { data: recent } = await _supabase
    .from('articles')
    .select('id, title, slug, category, published_at')
    .eq('status', 'published')
    .neq('id', article.id)
    .order('published_at', { ascending: false })
    .limit(5);

  const sidebarEl = document.getElementById('article-sidebar');
  sidebarEl.innerHTML = `
    <div class="sidebar-widget">
      <div class="sidebar-widget-title">Latest Stories</div>
      <div class="sidebar-widget-body">
        ${(recent || []).map((a, i) => `
          <div class="sidebar-list-item" onclick="window.location.href='article.html?slug=${a.slug}'" style="cursor:pointer">
            <span class="sidebar-num">0${i + 1}</span>
            <div>
              <div class="sidebar-list-title">${a.title}</div>
              <div class="sidebar-mini-meta">${a.category || 'News'} · ${new Date(a.published_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // ── Related articles (same category) ─────────────────────

  if (article.category) {
    const { data: related } = await _supabase
      .from('articles')
      .select('id, title, slug, excerpt, image_url, category, author_name, published_at')
      .eq('status', 'published')
      .eq('category', article.category)
      .neq('id', article.id)
      .order('published_at', { ascending: false })
      .limit(3);

    if (related && related.length > 0) {
      document.getElementById('related-section').innerHTML = `
        <div class="related-section">
          <div class="section-label accent">More in ${article.category}</div>
          <div class="related-grid">
            ${related.map(a => `
              <article class="news-card" onclick="window.location.href='article.html?slug=${a.slug}'">
                ${a.image_url
                  ? `<img src="${a.image_url}" alt="${a.title}" style="width:100%;height:160px;object-fit:cover">`
                  : placeholderSVG(160)}
                <div class="news-card-body">
                  <h3 class="news-card-title">${a.title}</h3>
                  <div class="news-card-meta">${a.author_name || 'Staff Reporter'} · ${new Date(a.published_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</div>
                </div>
              </article>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

})();
