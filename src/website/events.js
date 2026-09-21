import {readJson, requestOrigin} from '../http.js';
import {deviceLabel, locationLabel, notifyWebsiteOpened} from '../presentations/telegram.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function referralSource(value, origin) {
  try {
    const url=new URL(typeof value==='string' ? value.slice(0,2048) : '');
    return /^https?:$/.test(url.protocol) && url.origin!==origin ? url.hostname.slice(0,253) : 'Direct / unknown';
  } catch { return 'Direct / unknown'; }
}

export function createWebsiteEventHandler({env=process.env, send=fetch}={}) {
  const limits=new Map();
  return async (req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST'){res.writeHead(405,{Allow:'POST'}).end();return;}
    const origin=requestOrigin(req,env);
    if(!origin || req.headers.origin!==origin || req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403).end();return;}
    if(!/^(application\/json|text\/plain)(;|$)/i.test(req.headers['content-type']||'')){res.writeHead(415).end();return;}
    if(req.headers.dnt==='1' || req.headers['sec-gpc']==='1' || /bot|crawler|spider|preview/i.test(req.headers['user-agent']||'')){res.writeHead(204).end();return;}
    const now=Date.now(), peer=env.VERCEL==='1' ? req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress : req.socket?.remoteAddress;
    for(const [key,value] of limits)if(value.until<now)limits.delete(key);
    const limit=limits.get(peer)||{count:0,until:now+60_000};
    if(++limit.count>120 || limits.size>=10000){res.writeHead(429,{'Retry-After':'60'}).end();return;}
    limits.set(peer,limit);
    try {
      const body=await readJson(req,4096);
      if(!body || !uuid.test(body.sessionId||'') || !Number.isInteger(body.seconds) || body.seconds<0 || body.seconds>604800){res.writeHead(400).end();return;}
      if(!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY){res.writeHead(204,{'X-Analytics-Status':'not-configured'}).end();return;}
      const response=await send(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/record_website_visit`,{
        method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),
        body:JSON.stringify({p_id:body.sessionId,p_seconds:body.seconds,p_device:deviceLabel(req.headers),p_location:locationLabel(req.headers,env),p_source:referralSource(body.referrer,origin)})
      });
      if(!response.ok)throw new Error('record failed');
      if(await response.json()===true)await notifyWebsiteOpened({env,send,headers:req.headers});
      res.writeHead(204,{'X-Analytics-Status':'recorded'}).end();
    } catch(error) {res.writeHead(error instanceof SyntaxError ? 400 : error.status===400 || error.status===413 ? error.status : 503).end();}
  };
}
