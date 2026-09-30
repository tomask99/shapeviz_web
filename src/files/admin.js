import { randomBytes } from 'node:crypto';
import { uuid, string } from '../crm/validation.js';
import { createFolderLoader, normalizeMegaFolder, validSlug, fail } from './mega.js';
import {trackingActions,trackingReadActions,handleFileTracking} from './admin-tracking.js';

export const fileActions = ['client-files', 'client-files-save', 'client-files-status', 'client-files-delete', 'client-file-links', 'client-file-link-disable',...trackingActions];
const fields = 'id,company_id,title,slug,description,public_token,active,version,source_version,created_at';
const linkFields = 'id,portal_id,name,type,token,enabled,source_version,parent_id,ancestor_ids,version,created_at';
const loadMega = createFolderLoader();

export async function handleClientFiles({ action, body, url, user, token, call, loadFolder = loadMega }) {
  const reading = action === 'client-files' || action === 'client-file-links' || trackingReadActions.includes(action);
  const companyId = reading ? url.searchParams.get('companyId') : body.companyId;
  if (!token || !uuid(user?.id)) throw fail(401, 'Please sign in.');
  if (!uuid(companyId)) throw fail(400, 'Invalid client.');
  const request = (path, options = {}) => call(path, { ...options, token });
  const scope = `company_id=eq.${companyId}&owner_id=eq.${user.id}`;
  const clients = await request(`/rest/v1/crm_clients?${scope}&select=company_id,crm_companies(archived_at)`);
  if (!clients?.[0]) throw fail(404, 'Client not found.');
  if(trackingActions.includes(action))return handleFileTracking({action,body,url,user,companyId,request,call,loadFolder,archived:clients[0].crm_companies?.archived_at});
  if (action === 'client-files') return { items: await request(`/rest/v1/client_file_shares?${scope}&select=${fields}&limit=1`) };
  if (action === 'client-file-links') {
    const page=Number(url.searchParams.get('page') || 1);
    if (!Number.isSafeInteger(page) || page<1 || page>10000) throw fail(400,'Invalid page.');
    const rows=await request(`/rest/v1/client_file_links?${scope}&select=${linkFields}&order=created_at.desc,id&offset=${(page-1)*50}&limit=51`);
    const items=rows.slice(0,50),ancestorIds=[...new Set(items.flatMap(item=>item.ancestor_ids))];
    const ancestors=ancestorIds.length?await request(`/rest/v1/client_file_links?${scope}&id=in.(${ancestorIds.join(',')})&enabled=eq.true&select=id`):[];
    return {items:items.map(item=>({...item,ancestors_enabled:item.ancestor_ids.every(id=>ancestors.some(parent=>parent.id===id))})),page,hasMore:rows.length>50};
  }
  if (clients[0].crm_companies?.archived_at) throw fail(409, 'Restore the client before changing shared files.');
  const id = body.id;
  if (id && (!uuid(id) || !Number.isSafeInteger(body.version) || body.version < 1)) throw fail(400, 'Reload the collection before saving.');
  if (action === 'client-files-delete') {
    if (!id || body.confirm !== 'delete') throw fail(400,'Confirm removal of this file portal.');
    const rows=await request(`/rest/v1/client_file_shares?id=eq.${id}&${scope}&version=eq.${body.version}&select=id`,{method:'DELETE',headers:{Prefer:'return=representation'}});
    if (!rows?.[0]) throw fail(409,'The portal changed. Refresh it before removing it.');
    return {deleted:true};
  }
  if (action === 'client-file-link-disable') {
    if (!id) throw fail(400,'Invalid share link.');
    const rows=await request(`/rest/v1/client_file_links?id=eq.${id}&${scope}&version=eq.${body.version}&select=${linkFields}`,{method:'PATCH',body:{enabled:false},headers:{Prefer:'return=representation'}});
    if (!rows?.[0]) throw fail(409,'The link changed. Refresh before trying again.');
    return {item:rows[0]};
  }
  const base = '/rest/v1/client_file_shares';
  const target = id ? `${base}?id=eq.${id}&${scope}&version=eq.${body.version}&select=${fields}` : `${base}?on_conflict=owner_id,request_id&select=${fields}`;
  let values;
  if (action === 'client-files-status') {
    if (!id || typeof body.active !== 'boolean') throw fail(400, 'Invalid sharing status.');
    values = { active: body.active };
  } else {
    const title = string(body.title, 160, 'collection title');
    if (!title) throw fail(400, 'Enter a collection title.');
    const slug=string(body.slug,80,'files URL slug').toLowerCase();
    if (!validSlug(slug)) throw fail(400,'Use a URL slug with lowercase letters, numbers and single hyphens.');
    values = { title, slug, description: string(body.description, 1500, 'description') };
    if (id && body.megaUrl?.trim()) {
      values.mega_url=normalizeMegaFolder(body.megaUrl);
      await loadFolder(values.mega_url,{fresh:true});
    }
    if (!id) {
      if (!uuid(body.requestId)) throw fail(400, 'Reopen the collection form.');
      // Resolve retries before contacting MEGA again or generating another token.
      const existing = await request(`${base}?${scope}&request_id=eq.${body.requestId}&select=${fields}`);
      if (existing[0]) return { item: existing[0] };
      const mega_url = normalizeMegaFolder(body.megaUrl);
      await loadFolder(mega_url,{fresh:true});
      values = { ...values, company_id: companyId, owner_id: user.id, request_id: body.requestId, mega_url, public_token: randomBytes(24).toString('base64url') };
    }
  }
  const rows = await request(target, { method: id ? 'PATCH' : 'POST', body: values, headers: { Prefer: 'return=representation' + (id ? '' : ',resolution=ignore-duplicates') } });
  if (!rows?.[0] && !id) {
    const existing = await request(`${base}?${scope}&request_id=eq.${body.requestId}&select=${fields}`);
    if (existing[0]) return { item: existing[0] };
  }
  if (!rows?.[0]) throw fail(409, 'The collection changed. Refresh it before trying again.');
  return { item: rows[0] };
}
