import {uuid} from '../crm/validation.js';
import {fail,nodePattern,sharePattern,validSlug} from './mega.js';
import {resolveAccess,resolvePortalAccess} from './access.js';
import {nodePath} from './download-tracking.js';

export const trackingActions=['client-file-tracking','client-file-tracking-add','client-file-tracking-status','client-file-download-stats'];
export const trackingReadActions=['client-file-tracking','client-file-download-stats'];
const fields='id,portal_id,source_version,mega_node_id,folder_name,folder_path,active,total_downloads,created_at';

export function parseTrackingLink(input,origin) {
  if(typeof input!=='string'||input.length>1000)throw fail(400,'Paste a Shapeviz folder link.');
  let link;try{link=new URL(input.trim(),origin);}catch{throw fail(400,'Paste a valid Shapeviz folder link.');}
  const allowed=new Set([new URL(origin).origin,'https://shapeviz.com','https://www.shapeviz.com','https://shapevizweb.vercel.app']);
  if(!allowed.has(link.origin)||link.username||link.password)throw fail(400,'Use a folder link copied from your Shapeviz Cloud storage.');
  const share=/^\/files\/share\/([A-Za-z0-9_-]{32})\/?$/.exec(link.pathname)?.[1];
  const portal=!share&&/^\/files\/([^/]+)\/?$/.exec(link.pathname)?.[1];
  const access=new URLSearchParams(link.hash.slice(1)).get('access');
  if(!share&&(!validSlug(portal)||!sharePattern.test(access||'')))throw fail(400,'Copy the complete folder link from Cloud storage.');
  const node=link.searchParams.get('node');
  if(node&&!nodePattern.test(node))throw fail(400,'Invalid folder link.');
  return {params:new URLSearchParams({...share?{share}:{portal},...node?{node}:{}}),req:{headers:share?{}:{'x-files-access':access}}};
}

export async function handleFileTracking({action,body,url,user,companyId,request,call,loadFolder,archived}) {
  const scope=`company_id=eq.${companyId}&owner_id=eq.${user.id}`;
  if(action==='client-file-tracking') {
    // Bound each embedded ranking independently. Both relations retain the
    // caller's JWT/RLS; old trackers with a deleted portal remain visible.
    const select=`${fields},portal:client_file_shares(id,source_version,active),downloads:client_file_download_counts(file_name,download_count)`;
    const items=await request(`/rest/v1/client_file_trackers?${scope}&select=${select}&order=created_at,id&limit=100&downloads.order=download_count.desc,mega_node_id&downloads.limit=51`);
    return {items:items.map(({portal,downloads=[],...item})=>{
      const connected=!!portal&&portal.id===item.portal_id&&portal.source_version===item.source_version;
      return {...item,connected,portal_active:connected&&portal.active,stats:{items:downloads.slice(0,50),page:1,hasMore:downloads.length>50}};
    })};
  }
  if(action==='client-file-download-stats') {
    const id=url.searchParams.get('trackerId'),page=Number(url.searchParams.get('page')||1);
    if(!uuid(id)||!Number.isSafeInteger(page)||page<1||page>10000)throw fail(400,'Invalid statistics page.');
    const [tracker]=await request(`/rest/v1/client_file_trackers?id=eq.${id}&${scope}&select=${fields}`);
    if(!tracker)throw fail(404,'Tracked folder not found.');
    const rows=await request(`/rest/v1/client_file_download_counts?tracker_id=eq.${id}&select=mega_node_id,file_name,file_path,download_count,last_download_at&order=download_count.desc,mega_node_id&offset=${(page-1)*50}&limit=51`);
    return {tracker,items:rows.slice(0,50),page,hasMore:rows.length>50};
  }
  if(archived)throw fail(409,'Restore the client before changing download tracking.');
  if(action==='client-file-tracking-status') {
    if(!uuid(body.trackerId)||typeof body.active!=='boolean')throw fail(400,'Invalid tracked folder.');
    const [item]=await call(`/rest/v1/client_file_trackers?id=eq.${body.trackerId}&${scope}&select=${fields}`,{method:'PATCH',body:{active:body.active},headers:{Prefer:'return=representation'}});
    if(!item)throw fail(404,'Tracked folder not found.');
    return {item};
  }
  const parsed=parseTrackingLink(body.link,url.origin);
  const store=(path,options={})=>call('/rest/v1/'+path,options);
  const identity=await resolvePortalAccess({...parsed,store});
  if(identity.portal.company_id!==companyId||identity.portal.owner_id!==user.id)throw fail(400,'This folder belongs to a different client.');
  const {portal,folder,current}=await resolveAccess({...parsed,store,loadFolder});
  if(!current.directory)throw fail(400,'Choose a folder link, not an individual file.');
  const filter=`${scope}&portal_id=eq.${portal.id}&source_version=eq.${portal.source_version}&mega_node_id=eq.${current.id}`;
  const [existing]=await request(`/rest/v1/client_file_trackers?${filter}&select=${fields}`);
  if(existing)return {item:existing,existing:true};
  const currentTrackers=await request(`/rest/v1/client_file_trackers?${scope}&select=id&limit=100`);
  if(currentTrackers.length>=100)throw fail(422,'You can track up to 100 folders per client.');
  const values={company_id:companyId,owner_id:user.id,portal_id:portal.id,source_version:portal.source_version,mega_node_id:current.id,folder_name:current.name,folder_path:nodePath(folder,current,folder.nodes.get(folder.rootId))||current.name};
  const rows=await call(`/rest/v1/client_file_trackers?on_conflict=portal_id,source_version,mega_node_id&select=${fields}`,{method:'POST',body:values,headers:{Prefer:'resolution=ignore-duplicates,return=representation'}});
  const item=rows[0]||(await request(`/rest/v1/client_file_trackers?${filter}&select=${fields}`))[0];
  if(!item)throw fail(409,'The folder changed. Please try again.');
  return {item};
}
