import {publicCatalog} from './catalog.js';
export function createShopHandler({env=process.env, send=fetch}={}) {
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    if (req.method !== 'GET') { res.setHeader('Allow','GET');reply(405,{error:'Use GET.'});return; }
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {reply(200,{launched:false});return;}
    try {
      const response=await send(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/shop_catalog?id=eq.1&select=launched,categories,products`,{headers:{apikey:env.SUPABASE_SECRET_KEY},signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('Shop unavailable');
      const rows=await response.json(), catalog=publicCatalog(rows[0]);
      reply(200,new URL(req.url,'http://localhost').searchParams.get('status') === '1' ? {launched:catalog.launched} : catalog);
    } catch { reply(503,{launched:false,error:'The shop is temporarily unavailable. Please try again.'}); }
  };
}
