// ===========================================================
// js/main.js
// Homepage data layer.
// Fetches published articles from Supabase and renders them
// into the page sections. Replaces placeholder content with
// live data while keeping the existing design intact.
// ===========================================================

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

  // Split by featured vs regular.
  // NOTE: "regular" is only used as a fallback filler when a category
  // doesn't have enough articles of its own — it must NOT be the primary
  // source for category sections, or featured articles get excluded from
  // their own category (that was the bug: featured articles disappeared
  // from Sports/Local News/etc. because those sections only read from
  // "regular"). Category sections should show ALL published articles in
  // that category, featured or not; featured articles ALSO show in the
  // hero separately.
  const featured  = articles
    .filter(a => a.is_featured)
    .sort((a, b) => {
      // Respect the admin's saved hero order (display_order) first.
      // Falls back to newest-first when order hasn't been set.
      const aOrder = a.display_order || 0;
      const bOrder = b.display_order || 0;
      if (aOrder && bOrder) return aOrder - bOrder;
      if (aOrder) return -1;
      if (bOrder) return 1;
      return new Date(b.published_at) - new Date(a.published_at);
    });
  const regular   = articles.filter(a => !a.is_featured);

  // Category buckets — pull from ALL published articles for that
  // category (featured included), fall back to other categories only
  // if there simply aren't enough articles yet.
  function byCategory(cat, limit) {
    const list = articles.filter(a => a.category === cat);
    if (list.length < limit) {
      const fillers = regular.filter(a => a.category !== cat && !list.includes(a));
      list.push(...fillers);
    }
    return list.slice(0, limit);
  }

  // Full category pool (no limit) — used to decide whether a section
  // should render as a scrollable carousel (more than 3 articles).
  function categoryArticles(cat) {
    return articles.filter(a => a.category === cat);
  }

  // ── Hero section ────────────────────────────────────────────
  // The main hero spot continuously rotates through the featured
  // articles (in the admin's saved order), spending 8 seconds on
  // each before looping to the next — forever, with no end.
  // Side cards stay fixed, same as before.

  const heroPool = featured.length > 0 ? featured : articles.slice(0, 6);
  const heroSide = (featured.length > 1 ? featured.slice(1, 4) : articles.slice(1, 4));

  const heroContainer = document.getElementById('hero-grid');

  function heroMainHTML(a) {
    return `
      <div class="hero-featured" style="cursor:pointer" onclick="goToArticle('${a.slug}')">
        ${imgEl(a.image_url, a.title, 480)}
        <div class="hero-featured-overlay">
          <div class="hero-featured-tag">${tagBadge(a.category) || '<span class="tag tag-red">Breaking News</span>'}</div>
          <h1 class="hero-featured-title">${a.title}</h1>
          <p class="hero-featured-desc">${a.excerpt || ''}</p>
          <div class="hero-meta">
            <span>By <strong>${a.author_name || a.source_name || 'Staff Reporter'}</strong></span>
            <span>·</span>
            <span>${fmtDate(a.published_at)}</span>
            ${a.content ? `<span>·</span><span>${readTime(a.content)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  if (heroContainer && heroPool.length > 0) {

    heroContainer.innerHTML = `
      ${heroMainHTML(heroPool[0])}

      <!-- Side articles (fixed, do not rotate) -->
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

    if (heroPool.length > 1) {
      let heroIdx = 0;
      setInterval(function () {
        heroIdx = (heroIdx + 1) % heroPool.length;
        const slot = heroContainer.querySelector('.hero-featured');
        if (slot) slot.outerHTML = heroMainHTML(heroPool[heroIdx]);
      }, 8000);
    }
  }

  // ── News card template (shared by grid + carousel views) ──

  function newsCardHTML(a, imgHeight) {
    return `
      <article class="news-card" style="cursor:pointer" onclick="goToArticle('${a.slug}')">
        ${imgEl(a.image_url, a.title, imgHeight || 180)}
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
    `;
  }

  /**
   * Renders a category section either as the normal fixed grid
   * (3-ish cards) or, once there are MORE than `minCount` articles
   * in that category, as a horizontally scrollable carousel showing
   * all of them. Never used for the hero section.
   */
  function renderCategorySection(containerEl, catName, fallbackLimit, cardFn, imgHeight) {
    if (!containerEl) return;
    const all = categoryArticles(catName);

    if (all.length > fallbackLimit) {
      containerEl.classList.add('carousel-track');
      containerEl.innerHTML = all.slice(0, 12).map(a => cardFn(a, imgHeight)).join('');
    } else {
      containerEl.classList.remove('carousel-track');
      const list = byCategory(catName, fallbackLimit);
      containerEl.innerHTML = list.map(a => cardFn(a, imgHeight)).join('');
    }
  }

  // ── Local News grid / carousel ─────────────────────────────

  renderCategorySection(document.getElementById('local-news-grid'), 'Local News', 3, newsCardHTML, 180);

  // ── Politics section ──────────────────────────────────────

  const politicsMain = document.getElementById('politics-main');
  const politicsList = document.getElementById('politics-list');
  const politicsArticles = byCategory('Politics', 5);

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
  const bizArticles = byCategory('Business', 2).concat(byCategory('Economy', 2)).slice(0, 2);

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

  // ── Entertainment section (grid / carousel) ────────────────

  renderCategorySection(document.getElementById('entertainment-grid'), 'Entertainment', 3, newsCardHTML, 170);

  // ── Sports section (grid / carousel) ────────────────────────

  function sportsCardHTML(a) {
    return `
      <div class="sports-card" style="cursor:pointer" onclick="goToArticle('${a.slug}')">
        ${imgEl(a.image_url, a.title, 130)}
        <div class="sports-card-body">
          <div><span class="tag tag-gold" style="font-size:9px;padding:2px 6px;margin-bottom:6px;display:inline-block">${a.category || 'Sports'}</span></div>
          <div class="sports-card-title">${a.title}</div>
          <div class="sports-card-meta">${fmtDate(a.published_at)}</div>
        </div>
      </div>
    `;
  }

  renderCategorySection(document.getElementById('sports-grid'), 'Sports', 4, sportsCardHTML);

  // ── Opinion & Analysis (dynamic, from the "opinions" table) ─

  (async function renderOpinions() {
    const opinionGrid = document.getElementById('opinion-grid');
    if (!opinionGrid) return;

    const { data: opinions, error: opError } = await _supabase
      .from('opinions')
      .select('*')
      .eq('status', 'published')
      .order('display_order', { ascending: true })
      .order('published_at', { ascending: false })
      .limit(12);

    if (opError || !opinions || opinions.length === 0) return; // leave placeholder markup as-is

    function opinionCardHTML(o) {
      return `
        <div class="opinion-card">
          ${o.avatar_url
            ? `<img src="${o.avatar_url}" alt="${o.author_name || ''}" class="opinion-avatar" style="object-fit:cover">`
            : `<div class="opinion-avatar"></div>`}
          <div class="opinion-author">${o.author_name || 'Contributor'}${o.author_role ? ' — ' + o.author_role : ''}</div>
          <div class="opinion-title">"${o.headline}"</div>
          <p class="opinion-excerpt">${o.excerpt || ''}</p>
        </div>
      `;
    }

    if (opinions.length > 3) {
      opinionGrid.classList.add('carousel-track');
    } else {
      opinionGrid.classList.remove('carousel-track');
    }
    opinionGrid.innerHTML = opinions.map(opinionCardHTML).join('');
  })();

  // ── Sidebar: Most Read ────────────────────────────────────
  // Ranked by real view counts (see the "view_count" column on
  // articles, incremented by article.js each time a story is read).

  const mostRead = document.getElementById('most-read-list');
  if (mostRead) {
    const byViews = [...articles].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
    mostRead.innerHTML = byViews.slice(0, 5).map((a, i) => `
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

  // ── Ad banners (image + overlay text + click-through link) ──
  // Reads the "ads" table (one row per slot: top / mid / sidebar1 /
  // sidebar2). Falls back to the existing placeholder image + the
  // default "Advertise With Us" mailto link if a slot has no image
  // set yet, so nothing on the page breaks for slots that haven't
  // been configured.

  (async function renderAds() {
    const { data: ads, error: adsError } = await _supabase.from('ads').select('*');
    if (adsError || !ads) return;

    const bySlot = {};
    ads.forEach(a => { bySlot[a.slot_key] = a; });

    function applyAd(slotKey, linkId, imgId, textId) {
      const ad = bySlot[slotKey];
      if (!ad || !ad.image_url) return; // keep default placeholder + mailto link

      const linkEl = document.getElementById(linkId);
      const imgEl  = document.getElementById(imgId);
      const textEl = document.getElementById(textId);

      if (imgEl) imgEl.src = ad.image_url;
      if (imgEl) imgEl.style.display = 'block';
      if (linkEl && ad.link_url) {
        linkEl.href = ad.link_url;
      }
      if (textEl && ad.ad_text) {
        textEl.textContent = ad.ad_text;
        textEl.style.display = 'block';
      }
    }

    applyAd('top',      'ad-top-link',      'ad-top-img',      'ad-top-text');
    applyAd('mid',       'ad-mid-link',      'ad-mid-img',      'ad-mid-text');
    applyAd('sidebar1', 'sidebar-ad-1-link', 'sidebar-ad-1-img', 'sidebar-ad-1-text');
    applyAd('sidebar2', 'sidebar-ad-2-link', 'sidebar-ad-2-img', 'sidebar-ad-2-text');
  })();

})();
