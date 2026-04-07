// ============================================================
// js/page.js
// Loads a static page's content from the public.pages table.
//
// Usage: Before loading this script, set the page slug:
//   <script>var PAGE_SLUG = 'about';</script>
//   <script src="js/page.js"></script>
//
// The page HTML must contain:
//   <h1 id="page-title"></h1>
//   <div id="page-content"></div>
//   <div id="page-updated"></div>
// ============================================================

(async function () {

  const slug = window.PAGE_SLUG;
  if (!slug) return;

  // Show loading state
  const contentEl = document.getElementById('page-content');
  if (contentEl) contentEl.innerHTML = '<p style="color:#999;font-family:var(--font-ui)">Loading…</p>';

  // Fetch the page from Supabase
  const { data: page, error } = await _supabase
    .from('pages')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !page) {
    if (contentEl) contentEl.innerHTML = '<p>This page could not be loaded. Please try again later.</p>';
    return;
  }

  // Update page <title>
  document.title = page.title + ' — People\'s Daily News Online';

  // Set the heading
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = page.title;

  // Set the last-updated note
  const updatedEl = document.getElementById('page-updated');
  if (updatedEl && page.updated_at) {
    updatedEl.textContent = 'Last updated: ' + new Date(page.updated_at)
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Render content into paragraphs.
  // Double line breaks = new paragraph.
  // Lines that are ALL CAPS (like "ACCURACY") become sub-headings.
  function renderContent(text) {
    if (!text) return '<p>Content coming soon.</p>';
    return text
      .split(/\n\n+/)
      .map(function (para) {
        const trimmed = para.trim();
        // If it's a short ALL-CAPS line, render as a sub-heading
        if (/^[A-Z\s&''']+$/.test(trimmed) && trimmed.length < 40 && !trimmed.includes('.')) {
          return '<h3 class="page-subheading">' + trimmed + '</h3>';
        }
        return '<p>' + trimmed.replace(/\n/g, '<br>') + '</p>';
      })
      .join('');
  }

  if (contentEl) contentEl.innerHTML = renderContent(page.content);

})();
