// Shared validation: never accept arbitrary embed HTML.
export function gumroadUrl(value) {
  let url;
  try { url = new URL(typeof value === 'string' ? value.trim() : ''); } catch { /* validated below */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.port ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)?gumroad\.com$/.test(url.hostname) ||
      !/^\/l\/[A-Za-z0-9_-]{1,100}\/?$/.test(url.pathname)) {
    throw new Error('Enter an HTTPS Gumroad product URL, such as https://creator.gumroad.com/l/product.');
  }
  return url.origin + url.pathname.replace(/\/$/, '');
}
export const productKey = url => gumroadUrl(url).split('/').at(-1);
