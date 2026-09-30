import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {readJson} from '../http.js';
import {resolvePortalAccess,within} from './access.js';
import {fail} from './mega.js';

const lifetime=48*60*60*1000;
const mac=(value,key)=>createHmac('sha256',key).update('shapeviz:file-download:v1:'+value).digest();
export function nodePath(folder,item,root) {
  const parts=[];
  for(let count=0;item&&item.id!==root.id&&count<folder.nodes.size;count++,item=folder.nodes.get(item.parent))parts.unshift(item.name);
  return parts.join(' / ').slice(0,4000);
}

export function createDownloadTracker({env,store,now=Date.now}) {
  const limits=new Map();
  return {
    async issue({portal,folder,current}) {
      const trackers=await store(`client_file_trackers?portal_id=eq.${portal.id}&source_version=eq.${portal.source_version}&active=eq.true&select=id,mega_node_id&limit=100`);
      const targets=trackers.flatMap(t=>{
        const root=folder.nodes.get(t.mega_node_id);
        return root?.directory&&within(folder,current,root)?[{id:t.id,path:nodePath(folder,current,root)}]:[];
      });
      if(!targets.length)return null;
      const payload=Buffer.from(JSON.stringify({v:1,event:randomUUID(),portal:portal.id,version:portal.source_version,node:current.id,name:current.name,targets,exp:now()+lifetime})).toString('base64url');
      return payload+'.'+mac(payload,env.SUPABASE_SECRET_KEY).toString('base64url');
    },
    async complete(req,params) {
      if(!req.headers.origin)throw fail(403,'Open Cloud storage to download files.');
      if(!/^application\/json(;|$)/i.test(req.headers['content-type']||''))throw fail(415,'Expected JSON.');
      const peer=env.VERCEL==='1'?req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress:req.socket?.remoteAddress;
      for(const [key,value] of limits)if(value.until<now())limits.delete(key);
      const limit=limits.get(peer)||{count:0,until:now()+60_000};
      if(++limit.count>120||limits.size>=10000)throw fail(429,'Please try again later.');
      limits.set(peer,limit);
      let body;try{body=await readJson(req,600_000);}catch(error){throw fail(error.status===413?413:400,'Invalid download receipt.');}
      if(!body||typeof body.receipt!=='string'||Object.keys(body).length!==1)throw fail(400,'Invalid download receipt.');
      const [payload,signature,...extra]=body.receipt.split('.');
      const supplied=Buffer.from(signature||'','base64url'),expected=mac(payload||'',env.SUPABASE_SECRET_KEY);
      if(extra.length||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw fail(400,'Invalid download receipt.');
      let receipt;try{receipt=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{throw fail(400,'Invalid download receipt.');}
      if(receipt.v!==1||!Number.isSafeInteger(receipt.exp)||receipt.exp<=now()||receipt.exp>now()+lifetime)throw fail(410,'Download receipt expired.');
      const {portal}=await resolvePortalAccess({req,params,store});
      if(portal.id!==receipt.portal||portal.source_version!==receipt.version)throw fail(404,'This download is no longer available.');
      const counted=await store('rpc/record_client_file_download',{method:'POST',body:JSON.stringify({
        p_event_id:receipt.event,p_portal_id:portal.id,p_source_version:receipt.version,
        p_node_id:receipt.node,p_name:receipt.name,p_targets:receipt.targets,p_expires_at:new Date(receipt.exp).toISOString()
      })});
      return {recorded:counted>0};
    }
  };
}
