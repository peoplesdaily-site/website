// ============================================================
// js/main.js
// Homepage data layer.
// Fetches published articles from Supabase and renders them
// into the page sections. Replaces placeholder content with
// live data while keeping the existing design intact.
// ============================================================

(async function () {

  // ── Helpers ──────────────────────────────────────────────

  /** Format a date string into a readable label */
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = (Date.now() - d) / 1000; // seconds
    if (diff < 60)   return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) {
      const h = Math.floor(diff / 3600);
      return h + ' hour' + (h > 1 ? 's' : '') + ' ago';
    }
    if (diff < 172800) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Estimate reading time from content string */
  function readTime(content) {
    if (!content) return '';
    const words = content.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200)) + ' min read';
  }

  /** Safe image element — falls back to placeholder SVG */
  function imgEl(url, alt, height) {
    const h = height || 180;
    if (url) {
      return `<img src="${url}" alt="${alt || ''}"
                style="width:100%;height:${h}px;object-fit:cover;display:block;"
                onerror="this.outerHTML=placeholderSVG(${h})">`;
    }
    return placeholderSVG(h);
  }

  /** Placeholder SVG block identical to original design */
  function placeholderSVG(h) {
    return `<div class="img-placeholder" style="height:${h}px">
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="10" width="36" height="28" rx="2" stroke="#bbb" stroke-width="2"/>
        <circle cx="18" cy="20" r="4" stroke="#bbb" stroke-width="2"/>
        <path d="M6 32l8-8 6 6 8-10 14 14" stroke="#bbb" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    </div>`;
  }

  /** Tag badge HTML */
  function tagBadge(category) {
    if (!category) return '';
    const map = {
      'Politics':      'tag-navy',
      'Business':      'tag-gold',
      'Economy':       'tag-gold',
      'Crime':         'tag-navy',
      'Local News':    'tag-red',
      'Breaking':      'tag-red',
      'Sports':        'tag-navy',
      'Entertainment': 'tag-navy',
      'World':         'tag-navy',
      'Opinion':       'tag-outline',
    };
    const cls = map[category] || 'tag-outline';
    return `<span class="tag ${cls}">${category}</span>`;
  }

  /** Navigate to an article page */
  function goToArticle(slug) {
    window.location.href = `article.html?slug=${encodeURIComponent(slug)}`;
  }

  // Make goToArticle available globally for onclick handlers
  window.goToArticle = goToArticle;

  // ── Fetch data ────────────────────────────────────────────

  const { data: articles, error } = await _supabase
    .from('articles')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(40);

  if (error) {
    console.error('Error fetching articles:', error.message);
    return;
  }

  if (!articles || articles.length === 0) {
    // Nothing to render — leave placeholder content visible
    return;
  }

  // Split by featured vs regular
  const featured  = articles.filter(a => a.is_featured);
  const regular   = articles.filter(a => !a.is_featured);

  // Category buckets (fall through to regular if short)
  function byCategory(cat, pool, limit) {
    const list = pool.filter(a => a.category === cat);
    if (list.length < limit) list.push(...regular.filter(a => a.category !== cat));
    return list.slice(0, limit);
  }

  // ── Hero section ──────────────────────────────────────────

  const heroMain = featured[0] || articles[0];
  const heroSide = (featured.length > 1 ? featured.slice(1, 4) : articles.slice(1, 4));

  const heroContainer = document.getElementById('hero-grid');
  if (heroContainer && heroMain) {

    heroContainer.innerHTML = `
      <!-- Main hero article -->
      <div class="hero-featured" style="cursor:pointer" onclick="goToArticle('${heroMain.slug}')">
        ${imgEl(heroMain.image_url, heroMain.title, 480)}
        <div class="hero-featured-overlay">
          <div class="hero-featured-tag">${tagBadge(heroMain.category) || '<span class="tag tag-red">Breaking News</span>'}</div>
          <h1 class="hero-featured-title">${heroMain.title}</h1>
          <p class="hero-featured-desc">${heroMain.excerpt || ''}</p>
          <div class="hero-meta">
            <span>By <strong>${heroMain.author_name || heroMain.source_name || 'Staff Reporter'}</strong></span>
            <span>·</span>
            <span>${fmtDate(heroMain.published_at)}</span>
            ${heroMain.content ? `<span>·</span><span>${readTime(heroMain.content)}</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Side articles -->
      <div class="hero-secondary">
        ${heroSide.map(a => `
          <div class="hero-sec-card" style="cursor:pointer" onclick="goToArticle('${a.slug}')">
            ${imgEl(a.image_url, a.title, 160)}
            <div class="hero-sec-overlay">
              ${tagBadge(a.category)}
              <h2 class="hero-sec-title">${a.title}</h2>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ── Local News grid ───────────────────────────────────────

  const localSection = document.getElementById('local-news-grid');
  const localArticles = byCategory('Local News', regular, 3);

  if (localSection && localArticles.length > 0) {
    localSection.innerHTML = localArticles.map(a => `
      <article class="news-card" style="cursor:pointer" onclick="goToArticle('${a.slug}')">
        ${imgEl(a.image_url, a.title, 180)}
        <div class="news-card-body">
          <div class="news-card-tag">${tagBadge(a.category)}</div>
          <h3 class="news-card-title">${a.title}</h3>
          <p class="news-card-excerpt">${a.excerpt || ''}</p>
          <div class="news-card-meta">
            <span class="author">${a.author_name || a.source_name || 'Staff Reporter'}</span>
            <span>${fmtDate(a.published_at)}</span>
          </div>
        </div>
      </article>
    `).join('');
  }

  // ── Politics section ──────────────────────────────────────

  const politicsMain = document.getElementById('politics-main');
  const politicsList = document.getElementById('politics-list');
  const politicsArticles = byCategory('Politics', regular, 5);

  if (politicsMain && politicsArticles.length > 0) {
    const main = politicsArticles[0];
    politicsMain.innerHTML = `
      <article class="news-card news-card-large" style="cursor:pointer" onclick="goToArticle('${main.slug}')">
        ${imgEl(main.image_url, main.title, 260)}
        <div class="news-card-body">
          <div class="news-card-tag">${tagBadge(main.category)}</div>
          <h3 class="news-card-title" style="font-size:20px">${main.title}</h3>
          <p class="news-card-excerpt">${main.excerpt || ''}</p>
          <div class="news-card-meta">
            <span class="author">${main.author_name || main.source_name || 'Staff Reporter'}</span>
            <span>${fmtDate(main.published_at)}${main.content ? ' · ' + readTime(main.content) : ''}</span>
          </div>
        </div>
      </article>
    `;
  }

  if (politicsList && politicsArticles.length > 1) {
    politicsList.innerHTML = politicsArticles.slice(1, 5).map(a => `
      <div class="news-list-item" style="cursor:pointer" onclick="goToArticle('${a.slug}')">
        ${imgEl(a.image_url, a.title, 68)}
        <div>
          ${tagBadge(a.category)}
          <div class="news-list-title">${a.title}</div>
          <div class="news-list-meta">${fmtDate(a.published_at)} · ${a.author_name || a.source_name || 'Staff Reporter'}</div>
        </div>
      </div>
    `).join('');
  }

  // ── Business section ──────────────────────────────────────

  const bizGrid = document.getElementById('business-grid');
  const bizArticles = byCategory('Business', regular, 2).concat(byCategory('Economy', regular, 2)).slice(0, 2);

  if (bizGrid && bizArticles.length > 0) {
    bizGrid.innerHTML = bizArticles.map(a => `
      <article class="news-card" style="cursor:pointer" onclick="goToArticle('${a.slug}')">
        ${imgEl(a.image_url, a.title, 200)}
        <div class="news-card-body">
          <div class="news-card-tag">${tagBadge(a.category)}</div>
          <h3 class="news-card-title">${a.title}</h3>
          <p class="news-card-excerpt">${a.excerpt || ''}</p>
          <div class="news-card-meta">
            <span class="author">${a.author_name || a.source_name || 'Staff Reporter'}</span>
            <span>${fmtDate(a.published_at)}</span>
          </div>
        </div>
      </article>
    `).join('');
  }

  // ── Entertainment section ─────────────────────────────────

  const entGrid = document.getElementById('entertainment-grid');
  const entArticles = byCategory('Entertainment', regular, 3);

  if (entGrid && entArticles.length > 0) {
    entGrid.innerHTML = entArticles.map(a => `
      <article class="news-card" style="cursor:pointer" onclick="goToArticle('${a.slug}')">
        ${imgEl(a.image_url, a.title, 170)}
        <div class="news-card-body">
          <div class="news-card-tag">${tagBadge(a.category)}</div>
          <h3 class="news-card-title">${a.title}</h3>
          <p class="news-card-excerpt">${a.excerpt || ''}</p>
          <div class="news-card-meta">
            <span class="author">${a.author_name || a.source_name || 'Staff Reporter'}</span>
            <span>${fmtDate(a.published_at)}</span>
          </div>
        </div>
      </article>
    `).join('');
  }

  // ── Sports section ────────────────────────────────────────

  const sportsGrid = document.getElementById('sports-grid');
  const sportsArticles = byCategory('Sports', regular, 4);

  if (sportsGrid && sportsArticles.length > 0) {
    sportsGrid.innerHTML = sportsArticles.map(a => `
      <div class="sports-card" style="cursor:pointer" onclick="goToArticle('${a.slug}')">
        ${imgEl(a.image_url, a.title, 130)}
        <div class="sports-card-body">
          <div><span class="tag tag-gold" style="font-size:9px;padding:2px 6px;margin-bottom:6px;display:inline-block">${a.category || 'Sports'}</span></div>
          <div class="sports-card-title">${a.title}</div>
          <div class="sports-card-meta">${fmtDate(a.published_at)}</div>
        </div>
      </div>
    `).join('');
  }

  // ── Sidebar: Most Read ────────────────────────────────────
  // Uses the 5 most recently published articles as proxy for "most read"

  const mostRead = document.getElementById('most-read-list');
  if (mostRead) {
    mostRead.innerHTML = articles.slice(0, 5).map((a, i) => `
      <div class="sidebar-list-item" style="cursor:pointer" onclick="goToArticle('${a.slug}')">
        <span class="sidebar-num">0${i + 1}</span>
        <div>
          <div class="sidebar-list-title">${a.title}</div>
          <div class="sidebar-mini-meta">${a.category || 'News'}</div>
        </div>
      </div>
    `).join('');
  }

  // ── Sidebar: Latest Updates ───────────────────────────────

  const latestList = document.getElementById('latest-list');
  if (latestList) {
    latestList.innerHTML = articles.slice(0, 4).map((a, i) => `
      <div class="sidebar-list-item" style="cursor:pointer" onclick="goToArticle('${a.slug}')">
        <div>
          <div class="sidebar-mini-meta" style="color:${i === 0 ? 'var(--accent)' : 'inherit'};font-weight:${i === 0 ? '700' : '400'};margin-bottom:3px">
            ${fmtDate(a.published_at)}
          </div>
          <div class="sidebar-list-title">${a.title}</div>
        </div>
      </div>
    `).join('');
  }

})();
