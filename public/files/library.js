import '../admin/cursor.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const share = /^\/files\/share\/([\w-]{32})\/?$/.exec(location.pathname)?.[1];
const portal = !share && /^\/files\/([a-z0-9-]{1,80})\/?$/.exec(location.pathname)?.[1];
const access = portal ? new URLSearchParams(location.hash.slice(1)).get('access') : null;
const basePath = share ? `/files/share/${share}` : `/files/${portal}`;
const content = document.querySelector('#content');
let view, loading, generation = 0, downloading = false, stopDownload, noticeTimer;
export function formatSize(bytes) {
  if (!bytes) return '0 B';
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** unit).toLocaleString('en', { maximumFractionDigits: unit ? 1 : 0 })} ${['B','KB','MB','GB'][unit]}`;
}
const extension = item => item.directory ? 'FOLDER' : item.name.includes('.') ? item.name.split('.').at(-1).slice(0,12).toUpperCase() : 'FILE';
const folderIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4.2a2 2 0 0 1 1.6.8L11.5 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M2.5 10h19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const href = node => `${basePath}${node ? '?node=' + encodeURIComponent(node) : ''}${access ? '#access='+encodeURIComponent(access) : ''}`;
function notify(message) {
  clearTimeout(noticeTimer); document.querySelector('#notice').textContent = message;
  noticeTimer = setTimeout(() => { document.querySelector('#notice').textContent = ''; }, 3500);
}
async function copy(node) {
  const buttons=[...document.querySelectorAll('[data-copy],#copy-page')];buttons.forEach(button=>button.disabled=true);
  try {
    const result=await api({action:'share',node},AbortSignal.timeout(30_000),'POST');
    const address=new URL(result.url,location.origin).href;
    try { await navigator.clipboard.writeText(address); notify('Shapeviz link copied. Only this file or folder is shared.'); }
    catch { const dialog = document.querySelector('#copy-dialog'); document.querySelector('#copy-address').value = address; dialog.showModal(); document.querySelector('#copy-address').select(); }
  } catch(error) { notify(error.message); }
  finally { buttons.forEach(button=>button.disabled=false); }
}
async function api(params, signal, method='GET') {
  const response = await fetch('/api/files?' + new URLSearchParams({ ...(share?{share}:{portal}), ...params }), { method, signal, headers:access?{'X-Files-Access':access}:{}, credentials:'omit', cache:'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The file library is temporarily unavailable.');
  return data;
}
async function load() {
  const ticket = ++generation;
  loading?.abort(); loading = new AbortController();
  content.setAttribute('aria-busy','true'); content.innerHTML = '<p class="loading" role="status">Opening your files…</p>';
  document.querySelector('#copy-page').hidden = true;
  try {
    if (!share && (!portal || !access)) throw new Error('This file library link is incomplete. Ask the sender for the complete link.');
    const params = new URLSearchParams(location.search);
    const data = await api({ node:params.get('node')||'', page:params.get('page')||'1', q:params.get('q')||'' }, AbortSignal.any([loading.signal,AbortSignal.timeout(30_000)]));
    if (ticket !== generation) return;
    view = data;
    document.title = `${data.current.directory?data.collection.title:data.current.name} · Shapeviz`;
    document.querySelector('#collection-title').textContent = data.collection.title;
    document.querySelector('#breadcrumbs').innerHTML = data.breadcrumbs.map((item,i) => `${i?'<span class="crumb-sep" aria-hidden="true">/</span>':''}${i===data.breadcrumbs.length-1?`<span aria-current="page">${esc(i===0&&!data.restricted?'All files':item.name)}</span>`:`<a data-browse href="${href(item.id)}">${esc(i===0&&!data.restricted?'All files':item.name)}</a>`}`).join('');
    const copyPage = document.querySelector('#copy-page'); copyPage.hidden = false;
    copyPage.textContent = data.current.directory ? 'Copy folder link ↗' : 'Copy file link ↗';
    copyPage.onclick = () => copy(data.current.id);
    if (!data.current.directory) {
      const item = data.current;
      content.innerHTML = `<article class="file-detail"><div class="detail-art" aria-hidden="true"><span>${esc(extension(item))}</span></div><div class="detail-info"><p class="eyebrow">READY FOR YOUR NEXT PROJECT</p><h2>${esc(item.name)}</h2><p>${esc(extension(item))} FILE &nbsp; / &nbsp; ${formatSize(item.size)}</p><div class="detail-actions"><button class="primary" data-download="${item.id}" ${downloading?'disabled':''}>Download file <span aria-hidden="true">↓</span></button><button class="secondary" data-copy="${item.id}">Copy file link ↗</button></div><p class="detail-caption">Share this page with your architect or project team.</p></div></article>`;
    } else {
      content.innerHTML = `<div class="folder-tools"><p>${data.total} ${data.total===1?'item':'items'}${params.get('q')?' found':''}</p><form id="file-search"><label class="sr-only" for="search-files">Search this folder</label><input type="search" id="search-files" name="q" maxlength="160" placeholder="Search this folder" value="${esc(params.get('q')||'')}"></form></div><div class="file-list">${data.items.map(item => `<article class="file-row"><a class="file-name" data-browse href="${href(item.id)}"><span class="file-icon ${item.directory?'folder-icon':''}" aria-hidden="true">${item.directory?folderIcon:esc(extension(item))}</span><span><strong>${esc(item.name)}</strong><small>${item.directory?'FOLDER':esc(extension(item))+' &nbsp; / &nbsp; '+formatSize(item.size)}</small></span></a><div class="row-actions"><button class="copy-row" data-copy="${item.id}" aria-label="Copy link to ${esc(item.name)}">Copy link ↗</button>${item.directory?`<a class="secondary" data-browse href="${href(item.id)}" aria-label="Open ${esc(item.name)}">Open →</a>`:`<button class="secondary" data-download="${item.id}" aria-label="Download ${esc(item.name)}" ${downloading?'disabled':''}>Download ↓</button>`}</div></article>`).join('') || '<p class="empty">No files found in this folder.</p>'}</div>${data.page>1||data.hasMore?`<div class="pagination"><button class="secondary" data-page="${data.page-1}" ${data.page===1?'disabled':''}>Previous</button><span>Page ${data.page}</span><button class="secondary" data-page="${data.page+1}" ${!data.hasMore?'disabled':''}>Next</button></div>`:''}`;
      document.querySelector('#file-search').onsubmit = event => { event.preventDefault(); const next = new URL(href(data.current.id),location.origin); const q = new FormData(event.currentTarget).get('q').trim(); if (q) next.searchParams.set('q',q); navigate(next); };
    }
  } catch (error) {
    if (ticket !== generation) return;
    view = null;
    document.querySelector('#breadcrumbs').textContent = '';
    content.innerHTML = `<div class="empty"><h2>We couldn’t open these files.</h2><p role="alert">${esc(error.name==='TimeoutError'?'The library took too long to respond. Please try again.':error.message)}</p><button class="secondary" data-retry>Try again</button></div>`;
  } finally { if (ticket === generation) content.setAttribute('aria-busy','false'); }
}
function navigate(url) { history.pushState(null,'',url); load(); }
document.addEventListener('click', event => {
  const link = event.target.closest('a[data-browse]');
  if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button===0) { event.preventDefault(); navigate(link.href); return; }
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (button.hasAttribute('data-copy')) copy(button.dataset.copy);
  if (button.hasAttribute('data-retry')) load();
  if (button.hasAttribute('data-page')) { const next = new URL(location.href); next.searchParams.set('page',button.dataset.page); navigate(next); }
  if (button.hasAttribute('data-download')) download(button.dataset.download);
});
window.addEventListener('popstate',load);
window.addEventListener('beforeunload',event => { if (downloading) { event.preventDefault(); event.returnValue=''; } });
document.querySelector('#cancel-download').onclick = () => stopDownload?.();
async function download(id) {
  if (downloading || !view) return;
  const item = [view.current,...view.items].find(file=>file.id===id);
  if (!item || item.directory) return;
  downloading = true;
  const controller = new AbortController(); stopDownload = () => controller.abort();
  const transfer = document.querySelector('#transfer'), status = document.querySelector('#download-status'), progress = document.querySelector('#download-progress');
  transfer.hidden = false; document.querySelector('#transfer-name').textContent = item.name;
  document.querySelector('#cancel-download').hidden = false;
  progress.value = 0; status.textContent = 'Preparing your download…';
  document.querySelectorAll('[data-download]').forEach(button=>button.disabled=true);
  // Call the picker synchronously within the click, before importing or fetching.
  const chosenFile = typeof window.showSaveFilePicker === 'function' ? window.showSaveFilePicker({ suggestedName:item.name.replace(/[\\/\u0000-\u001f]/g,'_') }) : null;
  // Attach a rejection handler immediately so a cancelled picker never becomes
  // an unhandled rejection while the module is loading.
  const choice = chosenFile?.then(handle=>({handle}),error=>({error}));
  try {
    const { downloadFile } = await import('./download.js');
    const picked = await choice;
    if (picked?.error) throw picked.error;
    if (controller.signal.aborted) throw new DOMException('Cancelled','AbortError');
    const data = await api({ action:'download',node:id }, AbortSignal.any([controller.signal,AbortSignal.timeout(30_000)]));
    let lastUpdate = 0;
    await downloadFile({ ...data, handle:picked?.handle, signal:controller.signal, onProgress(bytes) {
      if (Date.now()-lastUpdate<150 && bytes!==data.file.size) return; lastUpdate=Date.now();
      progress.value = data.file.size ? Math.min(99,bytes/data.file.size*100) : 0;
      status.textContent = `${formatSize(bytes)} / ${formatSize(data.file.size)} — downloading`;
    } });
    progress.value=100; status.textContent = 'Download complete. Your file is ready.';
  } catch (error) {
    status.textContent = error.name==='AbortError' || controller.signal.aborted ? 'Download cancelled. You can start it again.' : `Download failed. ${error.message || 'Please try again.'}`;
  } finally {
    downloading=false; stopDownload=null; document.querySelector('#cancel-download').hidden=true;
    document.querySelectorAll('[data-download]').forEach(button=>button.disabled=false);
  }
}
load();
