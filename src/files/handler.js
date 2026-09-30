import { randomBytes } from 'node:crypto';
import { createFolderLoader, fail } from './mega.js';
import { createFileStore, resolveAccess } from './access.js';

export function createFilesHandler({ env = process.env, send = fetch, loadFolder = createFolderLoader({ send }) } = {}) {
  const store=createFileStore({env,send});
  return async function files(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const action=params.get('action') || 'browse';
      if (!['browse','download','share'].includes(action)) throw fail(400,'Invalid file action.');
      if (req.method!==(action==='share'?'POST':'GET')) { res.setHeader('Allow',action==='share'?'POST':'GET');throw fail(405,'Invalid request method.'); }
      if (action==='share') {
        if (req.headers['sec-fetch-site']==='cross-site') throw fail(403,'Open this file on Shapeviz to share it.');
        if (req.headers.origin) {
          const host=req.headers['x-forwarded-host'] || req.headers.host;
          if (new URL(req.headers.origin).host!==host) throw fail(403,'Open this file on Shapeviz to share it.');
        }
      }
      const page=Number(params.get('page') || 1),query=(params.get('q') || '').trim();
      if (!Number.isSafeInteger(page) || page<1 || page>200 || query.length>160) throw fail(400,'Invalid file search.');
      const {portal,link,folder,root,current,safeNode}=await resolveAccess({req,params,store,loadFolder});
      if (action==='share') {
        if (link && current.id===root.id) { reply(200,{url:`/files/share/${link.token}`});return; }
        if (link?.ancestor_ids.length>=8) throw fail(422,'Share the existing folder link instead.');
        const filter=`portal_id=eq.${portal.id}&source_version=eq.${portal.source_version}&mega_node_id=eq.${current.id}&parent_id=${link?'eq.'+link.id:'is.null'}&enabled=eq.true&select=token&limit=1`;
        let [existing]=await store(`client_file_links?${filter}`);
        if (!existing) {
          try {
            [existing]=await store('client_file_links?select=token',{method:'POST',body:JSON.stringify({
              portal_id:portal.id,company_id:portal.company_id,owner_id:portal.owner_id,
              source_version:portal.source_version,mega_node_id:current.id,type:current.directory?'folder':'file',name:current.name,
              parent_id:link?.id || null,token:randomBytes(24).toString('base64url')
            })});
          } catch (error) {
            if (error.status!==409) throw error;
            [existing]=await store(`client_file_links?${filter}`);
            if (!existing) throw error;
          }
        }
        reply(200,{url:`/files/share/${existing.token}`});return;
      }
      if (action==='download') {
        if (current.directory) throw fail(400,'Open a folder and choose an individual file to download.');
        // Only this authorised file key is sent. The root folder key stays private.
        reply(200,{file:safeNode(current),download:{downloadId:current.file.downloadId,key:current.file.key.toString('base64url')}});return;
      }
      const breadcrumbs=[];
      for (let item=current;item;item=folder.nodes.get(item.parent)) { breadcrumbs.unshift(safeNode(item));if (item.id===root.id) break; }
      const children=current.directory?[...folder.nodes.values()].filter(item=>item.parent===current.id && (!query || item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name,'en',{numeric:true})||a.id.localeCompare(b.id)):[];
      reply(200,{collection:{title:portal.title,description:portal.description},restricted:!!link,current:safeNode(current),breadcrumbs,items:children.slice((page-1)*100,page*100).map(safeNode),page,total:children.length,hasMore:children.length>page*100});
    } catch (error) { reply(error.status || 502,{error:error.status?error.message:'The file library could not be loaded. Please try again.'}); }
  };
}
