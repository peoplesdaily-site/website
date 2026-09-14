// ===========================================================
// js/articles-feed.js
// Powers the "All Articles" page (articles.html): fetches
// published articles in pages of 12 using Supabase's range(),
// and lets the reader click "Load More" to fetch the next page
// — same idea as CNN's "load more stories" pattern, just
// button-triggered rather than auto-firing on scroll, so it
// never fires a flood of requests by accident.
//
// This file only touches #articles-feed-grid, #load-more-btn,
// and #feed-status on articles.html. It does not run on
// index.html and does not touch anything main.js renders.
// ===========================================================

(function () {

  var PAGE_SIZE = 12;
  var currentPage = 0;   // next page to fetch (0-indexed)
  var isLoading = false;
  var reachedEnd = false;

  var gridEl   = document.getElementById('articles-feed-grid');
  var btnEl    = document.getElementById('load-more-btn');
  var statusEl = document.getElementById('feed-status');

  if (!gridEl) return; // not on this page — do nothing

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function placeholderSVG(h) {
    return '<div class="img-placeholder" style="height:' + h + 'px">' +
      '<svg viewBox="0 0 48 48" fill="none"><rect x="6" y="10" width="36" height="28" rx="2" stroke="#bbb" stroke-width="2"/>' +
      '<circle cx="18" cy="20" r="4" stroke="#bbb" stroke-width="2"/>' +
      '<path d="M6 32l8-8 6 6 8-10 14 14" stroke="#bbb" stroke-width="2" stroke-linejoin="round"/></svg></div>';
  }

  function cardHTML(a) {
    var img = a.image_url
      ? '<img src="' + a.image_url + '" alt="' + a.title + '" style="width:100%;height:180px;object-fit:cover;display:block" onerror="this.outerHTML=' + JSON.stringify(placeholderSVG(180)) + '">'
      : placeholderSVG(180);

    return (
      '<article class="news-card" style="cursor:pointer" onclick="window.location.href=\'article.html?slug=' + encodeURIComponent(a.slug) + '\'">' +
        img +
        '<div class="news-card-body">' +
          (a.category ? '<div class="news-card-tag"><span class="tag tag-outline">' + a.category + '</span></div>' : '') +
          '<h3 class="news-card-title">' + a.title + '</h3>' +
          '<p class="news-card-excerpt">' + (a.excerpt || '') + '</p>' +
          '<div class="news-card-meta">' +
            '<span class="author">' + (a.author_name || a.source_name || 'Staff Reporter') + '</span>' +
            '<span>' + fmtDate(a.published_at) + '</span>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  async function loadMoreArticles() {
    if (isLoading || reachedEnd) return;
    isLoading = true;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Loading…'; }
    if (statusEl) statusEl.textContent = '';

    var from = currentPage * PAGE_SIZE;
    var to   = from + PAGE_SIZE - 1;

    var result = await _supabase
      .from('articles')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .range(from, to);

    isLoading = false;

    if (result.error) {
      if (statusEl) statusEl.textContent = 'Could not load more articles. Please try again.';
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Load More Articles'; }
      return;
    }

    var batch = result.data || [];

    // Clear the initial "Loading…" placeholder cards on the first page only.
    if (currentPage === 0) gridEl.innerHTML = '';

    if (batch.length === 0) {
      reachedEnd = true;
      if (btnEl) btnEl.style.display = 'none';
      if (statusEl) statusEl.textContent = currentPage === 0
        ? 'No articles published yet.'
        : "You've reached the end — that's everything.";
      return;
    }

    gridEl.insertAdjacentHTML('beforeend', batch.map(cardHTML).join(''));
    currentPage++;

    if (batch.length < PAGE_SIZE) {
      reachedEnd = true;
      if (btnEl) btnEl.style.display = 'none';
      if (statusEl) statusEl.textContent = "You've reached the end — that's everything.";
    } else if (btnEl) {
      btnEl.style.display = 'inline-block';
      btnEl.disabled = false;
      btnEl.textContent = 'Load More Articles';
    }
  }

  window.loadMoreArticles = loadMoreArticles;

  loadMoreArticles();

})();
