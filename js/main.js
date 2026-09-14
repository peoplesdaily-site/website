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
  // if there simply aren't enough articles yet. Real category matches
  // always come first in the returned list; fallback fillers (if any)
  // are appended after them.
  function byCategory(cat, limit) {
    const list = articles.filter(a => a.category === cat);
    if (list.length < limit) {
      const fillers = regular.filter(a => a.category !== cat && !list.includes(a));
      list.push(...fillers);
    }
    return list.slice(0, limit);
  }

  // Same idea as byCategory(), but for a section that treats several
  // categories as equivalent (Business & Economy share one section).
  // Fixes a real bug: fetching each category separately and
  // concatenating the results could put a filler article from one
  // category's fallback ahead of a genuine article from the other
  // category. This gathers all real matches across every listed
  // category FIRST, and only fills any remaining slots with fillers
  // from unrelated categories after that.
  function byCategories(cats, limit) {
    const list = articles.filter(a => cats.includes(a.category));
    if (list.length < limit) {
      const fillers = regular.filter(a => !cats.includes(a.category) && !list.includes(a));
      list.push(...fillers);
    }
    return list.slice(0, limit);
  }

  // Full category pool (no limit) — the category's OWN articles only,
  // no fallback fillers. Used both to decide whether a section has
  // enough of its own content to rotate, and as the rotation pool
  // itself (rotation only ever cycles through real matching-category
  // articles, never fillers).
  function categoryArticles(cat) {
    return articles.filter(a => a.category === cat);
  }

  // ── Rotating category sections ──────────────────────────────
  // A category section shows `slotCount` articles at a time. If that
  // category has MORE of its own articles than fit in those slots, the
  // section rotates through all of them every 60 seconds, forever —
  // same idea as the hero, but slower and only ever using that
  // category's own articles (never filler from other categories).
  // If the category has slotCount or fewer of its own articles,
  // nothing to rotate to — it's rendered once as a static section,
  // using the normal fallback-fill (byCategory/byCategories) so the
  // section still isn't left half-empty.

  function slotsFromPool(pool, startIdx, count) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(pool[(startIdx + i) % pool.length]);
    return out;
  }

  function setupRotatingSection(ownPool, slotCount, staticFallbackList, renderFn) {
    if (ownPool.length > slotCount) {
      let start = 0;
      renderFn(slotsFromPool(ownPool, start, slotCount));
      setInterval(function () {
        start = (start + 1) % ownPool.length;
        renderFn(slotsFromPool(ownPool, start, slotCount));
      }, 60000);
    } else {
      renderFn(staticFallbackList);
    }
  }

  // ── Hero section ────────────────────────────────────────────
  // All 4 hero spaces — the big main spot AND the 3 small side
  // cards — continuously rotate together through the featured
  // articles (in the admin's saved order), 8 seconds per rotation,
  // looping forever with no end.

  const heroPool = featured.length > 0 ? featured : articles.slice(0, 6);

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

  function heroSideCardHTML(a) {
    return `
      <div class="hero-sec-card" style="cursor:pointer" onclick="goToArticle('${a.slug}')">
        ${imgEl(a.image_url, a.title, 160)}
        <div class="hero-sec-overlay">
          ${tagBadge(a.category)}
          <h2 class="hero-sec-title">${a.title}</h2>
        </div>
      </div>
    `;
  }

  /** Picks the 4 articles (main + 3 side) to show, starting at heroPool[startIdx],
   *  wrapping around the pool with modulo so it works for any pool size. */
  function heroSlotsFrom(startIdx) {
    const slots = [];
    for (let i = 0; i < 4; i++) {
      slots.push(heroPool[(startIdx + i) % heroPool.length]);
    }
    return slots;
  }

  function renderHeroSlots(startIdx) {
    const slots = heroSlotsFrom(startIdx);
    heroContainer.innerHTML = `
      ${heroMainHTML(slots[0])}
      <div class="hero-secondary">
        ${slots.slice(1).map(heroSideCardHTML).join('')}
      </div>
    `;
  }

  if (heroContainer && heroPool.length > 0) {

    renderHeroSlots(0);

    if (heroPool.length > 1) {
      let heroStart = 0;
      setInterval(function () {
        heroStart = (heroStart + 1) % heroPool.length;
        renderHeroSlots(heroStart);
      }, 8000);
    }
  }

  // ── News card template (shared by every card-grid section) ──

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

  // ── Local News (3 slots, rotates every 60s if it has more than 3 own articles) ──

  setupRotatingSection(
    categoryArticles('Local News'), 3, byCategory('Local News', 3),
    function (list) {
      const el = document.getElementById('local-news-grid');
      if (el) el.innerHTML = list.map(a => newsCardHTML(a, 180)).join('');
    }
  );

  // ── Politics (5 slots: 1 main + 4 list, same rotation rule) ──

  function renderPoliticsSection(list) {
    const politicsMain = document.getElementById('politics-main');
    const politicsList = document.getElementById('politics-list');

    if (politicsMain && list.length > 0) {
      const main = list[0];
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

    if (politicsList) {
      politicsList.innerHTML = list.slice(1, 5).map(a => `
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
  }

  setupRotatingSection(
    categoryArticles('Politics'), 5, byCategory('Politics', 5),
    renderPoliticsSection
  );

  // ── Business & Economy (2 slots — treated as one combined category) ──

  setupRotatingSection(
    articles.filter(a => a.category === 'Business' || a.category === 'Economy'), 2,
    byCategories(['Business', 'Economy'], 2),
    function (list) {
      const el = document.getElementById('business-grid');
      if (el) el.innerHTML = list.map(a => newsCardHTML(a, 200)).join('');
    }
  );

  // ── Entertainment (3 slots, same rotation rule) ──

  setupRotatingSection(
    categoryArticles('Entertainment'), 3, byCategory('Entertainment', 3),
    function (list) {
      const el = document.getElementById('entertainment-grid');
      if (el) el.innerHTML = list.map(a => newsCardHTML(a, 170)).join('');
    }
  );

  // ── Sports (4 slots, same rotation rule) ──

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

  setupRotatingSection(
    categoryArticles('Sports'), 4, byCategory('Sports', 4),
    function (list) {
      const el = document.getElementById('sports-grid');
      if (el) el.innerHTML = list.map(sportsCardHTML).join('');
    }
  );

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

    function applyAd(slotKey, linkId, imgId, textId, fallbackId) {
      const ad = bySlot[slotKey];
      if (!ad || !ad.image_url) return; // keep default placeholder + mailto link

      const linkEl     = document.getElementById(linkId);
      const imgEl      = document.getElementById(imgId);
      const textEl     = document.getElementById(textId);
      const fallbackEl = fallbackId ? document.getElementById(fallbackId) : null;

      if (imgEl) imgEl.src = ad.image_url;
      if (imgEl) imgEl.style.display = 'block';
      if (fallbackEl) fallbackEl.style.display = 'none';
      if (linkEl && ad.link_url) {
        linkEl.href = ad.link_url;
      }
      if (textEl && ad.ad_text) {
        textEl.textContent = ad.ad_text;
        textEl.style.display = 'block';
      }
    }

    applyAd('top',      'ad-top-link',      'ad-top-img',      'ad-top-text',      'ad-top-fallback');
    applyAd('mid',      'ad-mid-link',      'ad-mid-img',      'ad-mid-text',      'ad-mid-fallback');
    applyAd('sidebar1', 'sidebar-ad-1-link', 'sidebar-ad-1-img', 'sidebar-ad-1-text');
    applyAd('sidebar2', 'sidebar-ad-2-link', 'sidebar-ad-2-img', 'sidebar-ad-2-text');
  })();

  // ── Trending Topics (auto-generated from article tags) ─────
  // Counts how often each tag appears across the recent published
  // articles fetched above and shows the top 8. If no articles have
  // tags set yet, the default placeholder tags already in the HTML
  // are left untouched so the sidebar never looks broken/empty.

  (function renderTrendingTopics() {
    const list = document.getElementById('trend-tags-list');
    if (!list) return;

    const counts = {};
    articles.forEach(a => {
      if (!a.tags) return;
      a.tags.split(',').forEach(raw => {
        const clean = raw.trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (!counts[key]) counts[key] = { label: clean, count: 0 };
        counts[key].count++;
      });
    });

    const top = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 8);
    if (top.length === 0) return; // keep default placeholder tags

    list.innerHTML = top.map(t => {
      const safeLabel = t.label.replace(/'/g, "\\'");
      return `<span class="trend-tag" style="cursor:pointer" onclick="trendSearch('${safeLabel}')">#${t.label.replace(/\s+/g, '')}</span>`;
    }).join('');
  })();

  // ── Search ───────────────────────────────────────────────
  // Wires up the existing search overlay (#searchOverlay /
  // #searchInput) to actually query published articles by title,
  // excerpt, content, and tags, and lists matches to click through to.

  let searchDebounceTimer = null;

  async function runSiteSearch(term) {
    const resultsEl = document.getElementById('searchResults');
    if (!resultsEl) return;

    const q = term.trim();
    if (!q) { resultsEl.innerHTML = ''; return; }

    resultsEl.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-family:var(--font-ui);font-size:13px">Searching…</p>';

    // Commas break Supabase's .or() filter syntax, so strip them from the
    // search term before building the filter (harmless — spaces still work).
    const safeQ = q.replace(/,/g, ' ');

    const { data, error } = await _supabase
      .from('articles')
      .select('id, title, slug, category, excerpt, published_at')
      .eq('status', 'published')
      .or(`title.ilike.%${safeQ}%,excerpt.ilike.%${safeQ}%,content.ilike.%${safeQ}%,tags.ilike.%${safeQ}%`)
      .order('published_at', { ascending: false })
      .limit(8);

    if (error) {
      resultsEl.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-family:var(--font-ui);font-size:13px">Search failed. Please try again.</p>';
      return;
    }

    if (!data || data.length === 0) {
      resultsEl.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-family:var(--font-ui);font-size:13px">No stories found for "' + q + '".</p>';
      return;
    }

    resultsEl.innerHTML = data.map(a => `
      <div style="padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.1);cursor:pointer" onclick="goToArticle('${a.slug}')">
        <div style="font-family:var(--font-ui);font-size:10px;font-weight:700;letter-spacing:1px;color:var(--accent);text-transform:uppercase;margin-bottom:4px">${a.category || 'News'}</div>
        <div style="font-family:var(--font-display);font-size:17px;font-weight:700;color:#fff;margin-bottom:4px">${a.title}</div>
        ${a.excerpt ? `<div style="font-family:var(--font-ui);font-size:13px;color:rgba(255,255,255,0.5)">${a.excerpt}</div>` : ''}
      </div>
    `).join('');
  }

  // Called from the Trending Topics tags — opens the search overlay
  // (if it isn't already open) and runs a search for that tag.
  function trendSearch(term) {
    const overlay = document.getElementById('searchOverlay');
    const input   = document.getElementById('searchInput');
    if (overlay && !overlay.classList.contains('open') && typeof window.toggleSearch === 'function') {
      window.toggleSearch();
    }
    if (input) input.value = term;
    runSiteSearch(term);
  }
  window.trendSearch = trendSearch;

  (function wireSearchInput() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    input.addEventListener('input', function () {
      clearTimeout(searchDebounceTimer);
      const val = input.value;
      searchDebounceTimer = setTimeout(function () { runSiteSearch(val); }, 350);
    });
  })();

})();
