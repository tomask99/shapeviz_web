// Normal links also work without JavaScript. Preserve the current section and
// query, including private shop preview, when switching in the browser.
function syncLinks() {
  document.querySelectorAll('[data-language]').forEach(link => {
    const url = new URL(link.href);
    url.search = location.search;
    url.hash = location.hash;
    link.href = url.pathname + url.search + url.hash;
  });
}
syncLinks();
addEventListener('hashchange', syncLinks);
