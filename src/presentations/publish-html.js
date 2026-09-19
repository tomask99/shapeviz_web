// Keep document navigation and the shared tracker on Shapeviz. Only package
// assets resolve against Storage; an external <base> would also move /api URLs.
export function preparePublishedHtml(html, { slug, mediaBase, analytics }) {
  html = html.replace(/<base\b[^>]*>/gi, '');
  const resolve = value => /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(value) ? value : new URL(value, mediaBase).href;
  html = html.replace(/\b(src|href|poster)=(['"])(.*?)\2/gi, (match, attribute, quote, value) => `${attribute}=${quote}${resolve(value)}${quote}`);
  html = html.replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/gi, (match, quote, value) => `url(${quote}${resolve(value)}${quote})`);
  html = html.replace(/<script\b[^>]*src=['"][^'"]*\/presentation-system\/tracker\.js['"][^>]*>\s*<\/script>/gi, '');
  const tracker = `<script src="/presentation-system/tracker.js" data-deck="${slug}" data-analytics="${analytics === true}" defer></script>`;
  return html.replace(/<head[^>]*>/i, match => `${match}\n<base href="/p/${slug}/">\n<meta name="robots" content="noindex,nofollow,noarchive">`)
    .replace(/<\/body>/i, `${tracker}\n</body>`);
}
