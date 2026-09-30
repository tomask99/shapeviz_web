import { fail, nodePattern, sharePattern, validSlug, publicNode } from './mega.js';

const unavailable = () => fail(404, 'This file link is unavailable or its sharing has been disabled.');
export function createFileStore({ env, send }) {
  return async (path, options = {}) => {
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw fail(503, 'File sharing is not configured yet.');
    const response = await send(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/${path}`, {
      ...options, headers: { apikey:env.SUPABASE_SECRET_KEY, 'Content-Type':'application/json', Prefer:'return=representation', ...options.headers }, signal:AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw fail(response.status===409?409:503, 'The file library could not be updated. Please refresh and try again.');
    return response.json();
  };
}

export function within(folder, item, root) {
  for (let count=0; item && count<=folder.nodes.size; count++,item=folder.nodes.get(item.parent)) if (item.id===root.id) return true;
  return false;
}

// Resolve only the portal identity and capability, without fetching MEGA data.
export async function resolvePortalAccess({ req, params, store }) {
  const share=params.get('share'),slug=params.get('portal'),access=req.headers['x-files-access'];
  if (share ? !sharePattern.test(share) || slug || access : !validSlug(slug) || !sharePattern.test(access || '')) throw unavailable();
  let link,portal,ancestors=[];
  if (share) {
    [link]=await store(`client_file_links?token=eq.${share}&enabled=eq.true&select=*&limit=1`);
    if (!link) throw unavailable();
    [portal]=await store(`client_file_shares?id=eq.${link.portal_id}&active=eq.true&select=*&limit=1`);
    if (!portal || link.source_version!==portal.source_version) throw unavailable();
    if (link.ancestor_ids.length) {
      ancestors=await store(`client_file_links?id=in.(${link.ancestor_ids.join(',')})&portal_id=eq.${portal.id}&enabled=eq.true&source_version=eq.${portal.source_version}&select=id,mega_node_id,type`);
      if (ancestors.length!==link.ancestor_ids.length || !link.ancestor_ids.every(id=>ancestors.some(item=>item.id===id))) throw unavailable();
    }
  } else {
    [portal]=await store(`client_file_shares?slug=eq.${slug}&public_token=eq.${access}&active=eq.true&select=*&limit=1`);
    if (!portal) throw unavailable();
  }
  return {portal,link,ancestors};
}

// Check live node ancestry, not saved filenames or paths. Derived shares retain
// their parent capability so revocation and moves also apply to forwarded links.
export async function resolveAccess({ req, params, store, loadFolder }) {
  const {portal,link,ancestors}=await resolvePortalAccess({req,params,store});
  const folder=await loadFolder(portal.mega_url,{fresh:true});
  const root=folder.nodes.get(link?.mega_node_id || folder.rootId);
  if (!root || (link && root.directory!==(link.type==='folder'))) throw unavailable();
  for (const ancestor of ancestors) {
    const ancestorRoot=folder.nodes.get(ancestor.mega_node_id);
    if (!ancestorRoot?.directory || !within(folder,root,ancestorRoot)) throw unavailable();
  }
  const nodeId=params.get('node');
  if (nodeId && !nodePattern.test(nodeId)) throw fail(400,'Invalid file link.');
  const current=folder.nodes.get(nodeId || root.id);
  if (!current || !within(folder,current,root)) throw unavailable();
  const safeNode=item=>({...publicNode(item),parent:item.id===root.id?null:item.parent});
  return {portal,link,folder,root,current,safeNode};
}
