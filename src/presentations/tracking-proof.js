import {createHmac,timingSafeEqual} from 'node:crypto';
export function signTracking(payload,secret){
 if(!secret)return '';
 const data=Buffer.from(JSON.stringify(payload)).toString('base64url');return data+'.'+createHmac('sha256',secret).update(data).digest('base64url');
}
export function verifyTracking(value,secret){
 try{
  if(typeof value!=='string'||value.length>2048||!secret)return null;
  const [data,signature,...extra]=value.split('.');if(extra.length)return null;
  const expected=createHmac('sha256',secret).update(data).digest();const supplied=Buffer.from(signature,'base64url');
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return null;
  const p=JSON.parse(Buffer.from(data,'base64url'));return Number.isFinite(p.exp)&&p.exp>Date.now()?p:null;
 }catch{return null;}
}
export function trackingClassification(req,secret){
 const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('sv_tracking='))?.slice(12);
 const p=verifyTracking(cookie,secret);return p?.kind==='classification'&&typeof p.exclude==='boolean'?p:null;
}
export function trackingCookie(exclude,env){
 const value=signTracking({kind:'classification',exclude,exp:Date.now()+300000},env.SUPABASE_SECRET_KEY);
 return `sv_tracking=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=300${env.VERCEL||env.SITE_URL?.startsWith('https:')?'; Secure':''}`;
}
