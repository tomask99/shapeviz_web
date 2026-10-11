import {gumroadUrl, productKey} from '../../public/shop/url.js';
const fail = (status, message) => Object.assign(new Error(message), {status});
export const shopReadActions = ['shop-list', 'shop-preview'];
export const shopActions = [...shopReadActions, 'shop-save', 'shop-launch'];
const idPattern = /^[a-zA-Z0-9_-]{1,64}$/;

export function validateCatalog(body) {
  if (!Array.isArray(body.categories) || !body.categories.length || body.categories.length > 30 ||
      !Array.isArray(body.products) || body.products.length > 100) throw fail(400, 'Use 1–30 categories and at most 100 products.');
  const ids = new Set(), names = new Set();
  const categories = body.categories.map(c => {
    if (!c || typeof c.id !== 'string' || !idPattern.test(c.id) || c.id === 'all' || ids.has(c.id) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 60 || names.has(c.name.trim().toLowerCase())) throw fail(400, 'Each category needs a unique name (up to 60 characters).');
    ids.add(c.id); names.add(c.name.trim().toLowerCase());
    return {id:c.id, name:c.name.trim()};
  });
  const productsSeen = new Set(), urls = new Set();
  const products = body.products.map(p => {
    if (!p || typeof p.id !== 'string' || !idPattern.test(p.id) || productsSeen.has(p.id) || !ids.has(p.categoryId) || typeof p.visible !== 'boolean' || (p.name !== undefined && (typeof p.name !== 'string' || p.name.length > 100))) throw fail(400, 'Check the product category, visibility and optional internal name.');
    let url;
    try { url = gumroadUrl(p.url); } catch (e) { throw fail(400, e.message); }
    if (urls.has(productKey(url))) throw fail(409, 'This Gumroad product is already in the catalog. Edit the existing item.');
    productsSeen.add(p.id); urls.add(productKey(url));
    return {id:p.id, provider:'gumroad', url, categoryId:p.categoryId, visible:p.visible, name:(p.name || '').trim()};
  });
  return {categories, products};
}
export function publicCatalog(row) {
  if (!row?.launched) return {launched:false};
  return {launched:true, categories:row.categories, products:row.products.filter(p => p.visible).map(({id,provider,url,categoryId}) => ({id,provider,url,categoryId}))};
}
export async function handleShop({action, body, call}) {
  const rows = await call('/rest/v1/shop_catalog?id=eq.1&select=*');
  const row = rows?.[0];
  if (!row) throw fail(503, 'Shop storage is not ready. Apply the shop catalog migration.');
  if (action === 'shop-list') return row;
  if (action === 'shop-preview') return {...publicCatalog({...row, launched:true}), preview:true, launched:row.launched};
  if (!Number.isSafeInteger(body.version) || body.version !== row.version) throw fail(409, 'The catalog changed in another window. Reload before saving.');
  let changes;
  if (action === 'shop-launch') {
    if (typeof body.launched !== 'boolean') throw fail(400, 'Choose whether the shop is live.');
    changes = {launched:body.launched};
  } else changes = validateCatalog(body);
  const saved = await call(`/rest/v1/shop_catalog?id=eq.1&version=eq.${body.version}`, {method:'PATCH', body:{...changes,version:row.version+1,updated_at:new Date().toISOString()}, headers:{Prefer:'return=representation'}});
  if (!saved?.[0]) throw fail(409, 'The catalog changed in another window. Reload before saving.');
  return saved[0];
}
