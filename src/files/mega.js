import { API, File } from 'megajs';

export const fail = (status, message) => Object.assign(new Error(message), { status });
export const nodePattern = /^[\w-]{8}$/;
export const sharePattern = /^[\w-]{32}$/;
export const validSlug = value => typeof value === 'string' && value.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && !['share','transfer','vendor','index'].includes(value);

// Accept only a complete folder share. Never fetch a user-supplied host.
export function normalizeMegaFolder(value) {
  if (typeof value !== 'string' || value.length > 250) throw fail(400, 'Enter a MEGA folder link including its decryption key.');
  let url;
  try { url = new URL(value.trim()); } catch { throw fail(400, 'Enter a valid MEGA folder link.'); }
  if (url.protocol !== 'https:' || !['mega.nz', 'mega.co.nz'].includes(url.hostname) || url.port || url.username || url.password || url.search) throw fail(400, 'Use an HTTPS folder link from mega.nz.');
  const modern = /^\/folder\/([\w-]{8})\/?$/.exec(url.pathname);
  const legacy = url.pathname === '/' && /^#F!([\w-]{8})!([\w-]{22})$/.exec(url.hash);
  const handle = modern?.[1] || legacy?.[1];
  const key = modern ? /^#([\w-]{22})$/.exec(url.hash)?.[1] : legacy?.[2];
  if (!handle || !key) throw fail(400, 'Use the full folder link with its key, without a selected subfolder or file.');
  return `https://mega.nz/folder/${handle}#${key}`;
}

export function indexFolder(root) {
  const nodes = new Map();
  const queue = [{ file: root, parent: null }];
  for (let i = 0; i < queue.length; i++) {
    if (i >= 20_000) throw fail(422, 'This folder is too large. Share a smaller collection.');
    const { file, parent } = queue[i];
    const id = file === root ? file.nodeId : file.downloadId?.[1];
    if (!nodePattern.test(id || '') || nodes.has(id) || typeof file.name !== 'string' || !file.key) throw fail(502, 'The folder could not be read. Check its link and key.');
    const item = { id, parent, name: file.name.slice(0,500), directory: !!file.directory, size: Number.isSafeInteger(file.size) && file.size >= 0 ? file.size : 0, file };
    nodes.set(id, item);
    if (file.directory) for (const child of file.children || []) queue.push({ file: child, parent: id });
  }
  return { rootId: root.nodeId, nodes };
}

// Short-lived, bounded metadata cache; publication status is checked separately
// on EVERY public request. File contents are never downloaded by this server.
export function createFolderLoader({ send = fetch, ttl = 60_000, now = Date.now } = {}) {
  const cache = new Map();
  return async function loadFolder(input, { fresh = false } = {}) {
    const url = normalizeMegaFolder(input);
    const cached = cache.get(url);
    if (!fresh && cached && cached.expires > now()) return cached.promise;
    if (cache.size >= 12) cache.delete(cache.keys().next().value);
    const signal = AbortSignal.timeout(20_000);
    const api = new API(false);
    const request = api.request.bind(api);
    api.request = (body, callback, retry) => {
      if (signal.aborted || api.closed) { callback?.(new Error('Folder request expired.')); return; }
      return request(body, callback, retry);
    };
    api.fetch = (target, options = {}) => send(target, { ...options, signal });
    const promise = (async () => {
      let aborted;
      try {
        const folder = File.fromURL(url, { api });
        await Promise.race([folder.loadAttributes(), new Promise((_,reject) => {
          aborted=()=>reject(new Error('Folder request timed out.'));
          signal.addEventListener('abort',aborted,{once:true});
        })]);
        return indexFolder(folder);
      } catch (error) {
        cache.delete(url);
        if (error.status) throw error;
        throw fail(502, 'MEGA could not open this folder. Check that the link is still shared and includes the correct key, then retry.');
      } finally { signal.removeEventListener('abort',aborted); api.close(); }
    })();
    cache.set(url, { expires: now() + ttl, promise });
    return promise;
  };
}

export const publicNode = ({ id, parent, name, directory, size }) => ({ id, parent, name, directory, size });
