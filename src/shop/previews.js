import {parse} from 'parse5';
import {gumroadUrl} from '../../public/shop/url.js';

const maximumBytes = 1024 * 1024;
export function productPreview(html) {
  const metadata = new Map();
  function visit(node) {
    if (node.tagName === 'meta') {
      const attrs = Object.fromEntries(node.attrs.map(({name,value}) => [name,value]));
      const key = attrs.property || attrs.name;
      if (!metadata.has(key)) metadata.set(key, attrs.content || '');
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parse(html));
  const title = (metadata.get('og:title') || '').trim().slice(0,300);
  let image = null;
  try {
    const url = new URL(metadata.get('og:image'));
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
        ['public-files.gumroad.com','assets.gumroad.com'].includes(url.hostname)) image = url.href;
  } catch {}
  return {title:title || null, image};
}

async function readPreview(url, send, signal) {
  for (let redirects = 0; redirects <= 3; redirects++) {
    // Validate each redirect before making a request; never forward app credentials.
    url = gumroadUrl(url);
    const response = await send(url, {redirect:'manual', signal, headers:{Accept:'text/html'}});
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Missing redirect');
      url = new URL(location,url).href;
      continue;
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html') ||
        Number(response.headers.get('content-length')) > maximumBytes) {
      await response.body?.cancel();throw new Error('Preview unavailable');
    }
    const chunks = [];let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > maximumBytes) throw new Error('Preview too large');
      chunks.push(chunk);
    }
    return productPreview(Buffer.concat(chunks).toString('utf8'));
  }
  throw new Error('Too many redirects');
}

export function createProductPreviews({send = fetch} = {}) {
  const cache = new Map();
  async function preview(url, signal) {
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) return hit.value;
    if (signal.aborted) return {title:null,image:null};
    const entry = {expires:Date.now()+600_000};
    entry.value = readPreview(url,send,signal).catch(() => {
      entry.expires = Date.now()+30_000;
      return {title:null,image:null};
    });
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(url,entry);
    return entry.value;
  }
  return async catalog => {
    if (!catalog.products?.length) return catalog;
    // Limit external requests and total response time, even for large catalogs.
    const products = catalog.products.map(product => ({...product}));
    const signal = AbortSignal.timeout(8000);let next = 0;
    await Promise.all(Array.from({length:Math.min(6,products.length)},async () => {
      while (next < products.length) {
        const product = products[next++];
        product.preview = await preview(product.url,signal);
      }
    }));
    return {...catalog,products};
  };
}
