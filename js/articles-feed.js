// ===========================================================
// js/articles-feed.js
// Powers the "All Articles" page (articles.html): fetches
// published articles in pages of 12 using Supabase's range(),
// with a "Load More" button. Each click keeps the page length
// constant — it removes the oldest visible batch from the top
// while adding the new batch at the bottom, instead of letting
// the page grow taller forever.
//
// Cards use the same overlay style as the homepage hero's small
// side cards (title + excerpt over the image), just sized down
// from the huge main hero image.
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

  // Truncates an excerpt so it doesn't overwhelm the image overlay.
  function shortExcerpt(text) {
    if (!text) return '';
    return text.length > 110 ? text.slice(0, 107).trim() + '…' : text;
  }

  // cardHTML() — hero-side-card style: title + excerpt overlaid on the
  // image itself (reuses the existing .hero-sec-card/.hero-sec-overlay/
  // .hero-sec-title classes from the homepage hero), just at a medium
  // size rather than the huge main hero photo.
  //
  // NOTE: if the image fails to load, this hides the <img> and adds a
  // "no-img" class to the card so a plain background shows instead —
  // no destructive HTML rewriting on error, which is what caused the
  // stray "''''>" characters to leak onto the page before.
  function cardHTML(a) {
    var imgTag = a.image_url
      ? '<img src="' + a.image_url + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block" ' +
        'onerror="this.style.display=\'none\';this.closest(\'.feed-card\').classList.add(\'no-img\')">'
      : '';

    var tagHTML = a.category ? '<span class="tag tag-outline" style="background:rgba(255,255,255,0.15);color:#fff;border-color:rgba(255,255,255,0.3)">' + a.category + '</span>' : '';

    return (
      '<article class="feed-card hero-sec-card" ' +
        'style="height:260px;cursor:pointer;background:linear-gradient(135deg,#1a1a2e,#2c2c4e)" ' +
        'onclick="window.location.href=\'article.html?slug=' + encodeURIComponent(a.slug) + '\'">' +
        imgTag +
        '<div class="hero-sec-overlay" style="padding:16px">' +
          tagHTML +
          '<h3 class="hero-sec-title" style="font-size:16px;margin-top:8px">' + a.title + '</h3>' +
          '<p style="font-family:var(--font-ui, sans-serif);font-size:12px;line-height:1.4;color:rgba(255,255,255,0.75);margin-top:6px">' + shortExcerpt(a.excerpt) + '</p>' +
          '<div style="font-family:var(--font-ui, sans-serif);font-size:11px;color:rgba(255,255,255,0.55);margin-top:8px">' +
            (a.author_name || a.source_name || 'Staff Reporter') + ' · ' + fmtDate(a.published_at) +
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

    if (batch.length === 0) {
      reachedEnd = true;
      if (currentPage === 0) gridEl.innerHTML = '';
      if (btnEl) btnEl.style.display = 'none';
      if (statusEl) statusEl.textContent = currentPage === 0
        ? 'No articles published yet.'
        : "You've reached the end — that's everything.";
      return;
    }

    if (currentPage === 0) {
      // First load — just fill the grid, nothing to remove yet.
      gridEl.innerHTML = batch.map(cardHTML).join('');
    } else {
      // Keep the page length constant: drop the oldest visible batch
      // from the top before adding the new batch at the bottom.
      var toRemove = Math.min(batch.length, gridEl.children.length);
      for (var i = 0; i < toRemove; i++) {
        if (gridEl.firstElementChild) gridEl.removeChild(gridEl.firstElementChild);
      }
      gridEl.insertAdjacentHTML('beforeend', batch.map(cardHTML).join(''));
    }

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
