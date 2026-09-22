import {randomBytes,createHash} from 'node:crypto';
export const validRecipientToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value)&&Buffer.from(value,'base64url').toString('base64url')===value;
export const newRecipientToken=()=>randomBytes(32).toString('base64url');
export const recipientHash=value=>createHash('sha256').update(value).digest('hex');
export function recipientParam(url){
 const values=url.searchParams.getAll('r');
 if(!values.length)return null;
 if(values.length!==1||!validRecipientToken(values[0]))throw Object.assign(new Error('Invalid recipient link'),{status:404});
 return values[0];
}
export async function resolveRecipient(deck,hash,{env,send=fetch}){
 const response=await send(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/crm_resolve_recipient`,{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_deck:deck,p_hash:hash}),signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new Error('Recipient service unavailable');
 return Boolean(await response.json());
}
