// ============================================================
// js/page.js
// Shared script for About Us, Editorial Policy, Contact Us.
// Fetches content from public.pages in Supabase and renders it.
//
// Before loading this file, set the slug:
//   <script>var PAGE_SLUG = 'about';</script>
//   <script src="js/page.js"></script>
//
// Required HTML elements on the page:
//   <h1 id="page-title"></h1>
//   <div id="page-content"></div>
//   <div id="page-updated"></div>
// ============================================================

(async function () {

  var slug = window.PAGE_SLUG;
  if (!slug) return;

  var contentEl = document.getElementById('page-content');
  var titleEl   = document.getElementById('page-title');
  var updatedEl = document.getElementById('page-updated');

  // Show spinner while loading
  if (titleEl)   titleEl.innerHTML = '<div class="loading-spinner"></div>';
  if (contentEl) contentEl.innerHTML = '';

  // Fetch from Supabase
  var result = await _supabase
    .from('pages')
    .select('*')
    .eq('slug', slug)
    .single();

  var page  = result.data;
  var error = result.error;

  if (error || !page) {
    if (titleEl)   titleEl.textContent = 'Page Not Found';
    if (contentEl) contentEl.innerHTML = '<p>This page could not be loaded. Please try again later.</p>';
    return;
  }

  // Update browser tab title
  document.title = page.title + ' \u2014 People\'s Daily News Online';

  // Set heading
  if (titleEl) titleEl.textContent = page.title;

  // Set last-updated line
  if (updatedEl && page.updated_at) {
    updatedEl.textContent = 'Last updated: ' + new Date(page.updated_at)
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Render content:
  // - Blank lines = new paragraph
  // - Short ALL-CAPS lines = section subheading
  function renderContent(text) {
    if (!text) return '<p>Content coming soon.</p>';
    return text.split(/\n\n+/).map(function(para) {
      var trimmed = para.trim();
      // ALL-CAPS short line → subheading
      if (
        /^[A-Z][A-Z\s&''',.!-]{2,}$/.test(trimmed) &&
        trimmed.length < 50 &&
        trimmed.split(' ').length <= 6
      ) {
        return '<h3 class="page-subheading">' + trimmed + '</h3>';
      }
      return '<p>' + trimmed.replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  if (contentEl) contentEl.innerHTML = renderContent(page.content);

})();
