import {readJson} from '../http.js';
import {resolvePortalAccess} from './access.js';
import {fail} from './mega.js';
import {notifyCloudWebsiteClicked} from '../presentations/telegram.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createCloudClickTracker({env,send,store}) {
  const limits=new Map();
  return async function track(req,params) {
    if(!req.headers.origin)throw fail(403,'Open Cloud storage to use this link.');
    if([...params.keys()].some(key=>!['action','share','portal'].includes(key)))throw fail(400,'Invalid click scope.');
    if(!/^application\/json(;|$)/i.test(req.headers['content-type']||''))throw fail(415,'Expected JSON.');
    if(req.headers.dnt==='1'||req.headers['sec-gpc']==='1'||/bot|crawler|spider|preview/i.test(req.headers['user-agent']||''))return 'ignored';
    const now=Date.now(),peer=env.VERCEL==='1'?req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress:req.socket?.remoteAddress;
    for(const [key,value] of limits)if(value.until<now)limits.delete(key);
    const limit=limits.get(peer)||{count:0,until:now+60_000};
    if(++limit.count>30||limits.size>=10000)throw fail(429,'Please try again later.');
    limits.set(peer,limit);
    let body;try{body=await readJson(req,1024);}catch(error){throw fail(error.status===413?413:400,'Invalid click event.');}
    if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['eventId','source'].includes(key))||!uuid.test(body.eventId||'')||!['logo','visual_studio'].includes(body.source))throw fail(400,'Invalid click event.');
    // A studio click needs only the cloud identity, so a MEGA outage cannot
    // suppress it. File browsing/downloads still enforce live MEGA ancestry.
    const {portal}=await resolvePortalAccess({req,params,store});
    if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return 'not-configured';
    const [company]=await store(`crm_companies?id=eq.${portal.company_id}&owner_id=eq.${portal.owner_id}&select=company_name&limit=1`);
    if(!company)throw fail(404,'Cloud storage is unavailable.');
    // An atomic insert claims this click across instances and concurrent retries.
    // No tokens, MEGA keys, filenames or file contents are stored in this ledger.
    const rows=await store('client_file_website_clicks?on_conflict=event_id&select=event_id',{
      method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify({event_id:body.eventId,portal_id:portal.id,source:body.source})
    });
    if(!rows.length)return 'duplicate';
    return await notifyCloudWebsiteClicked({company:company.company_name,title:portal.title,source:body.source},{env,send,headers:req.headers})?'notified':'delivery-failed';
  };
}
