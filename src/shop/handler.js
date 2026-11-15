import {publicCatalog} from './catalog.js';
import {createProductPreviews} from './previews.js';
export async function loadShopCatalog({env, send}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return {launched:false};
  const response = await send(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/shop_catalog?id=eq.1&select=launched,categories,products`, {headers:{apikey:env.SUPABASE_SECRET_KEY}, signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('Shop unavailable');
  const rows = await response.json();
  return publicCatalog(rows[0]);
}
export function createShopHandler({env=process.env, send=fetch}={}) {
  const previews = createProductPreviews({send});
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    if (req.method !== 'GET') { res.setHeader('Allow','GET');reply(405,{error:'Use GET.'});return; }
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {reply(200,{launched:false});return;}
    try {
      const catalog=await loadShopCatalog({env,send});
      reply(200,new URL(req.url,'http://localhost').searchParams.get('status') === '1' ? {launched:catalog.launched} : await previews(catalog));
    } catch { reply(503,{launched:false,error:'The shop is temporarily unavailable. Please try again.'}); }
  };
}
