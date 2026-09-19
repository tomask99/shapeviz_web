import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const email=process.argv[2];
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||''))throw new Error('Provide the owner email.');
const root=process.env.SUPABASE_URL;
async function call(path,method='GET',body){const r=await fetch(root+path,{method,headers:{apikey:process.env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error(`Account setup failed (${r.status})`);return r.status===204?null:r.json();}
await mkdir('.cache',{recursive:true});
const listed=await call('/auth/v1/admin/users?page=1&per_page=1000');
let user=listed.users.find(u=>u.email===email);
if(!user){const password=randomBytes(32).toString('base64url');user=await call('/auth/v1/admin/users','POST',{email,password,email_confirm:true});await writeFile('.cache/admin-bootstrap.json',JSON.stringify({email,password,id:user.id}));}
await call('/rest/v1/presentation_admins','POST',{user_id:user.id,role:'owner'}).catch(async error=>{const rows=await call(`/rest/v1/presentation_admins?user_id=eq.${user.id}`);if(!rows.length)throw error;});
if(process.argv.includes('--link')){
 const link=await call('/auth/v1/admin/generate_link','POST',{type:'recovery',email});
 const token=link.hashed_token||link.properties?.hashed_token;
 if(!token)throw new Error('No setup token returned.');
 const url=`https://shapevizweb.vercel.app/adminlogin#token_hash=${encodeURIComponent(token)}`;
 await writeFile('.cache/admin-setup.html',`<!doctype html><meta charset="utf-8"><title>Shapeviz admin setup</title><style>body{background:#080706;color:#f1ede6;font:20px Arial;padding:10vw}a{color:#d88739}</style><h1>SHAPEVIZ ADMIN</h1><p>Private, single-use account setup for ${email}.</p><a href="${url}" rel="noreferrer">Set your admin password ↗</a><p>Keep this file private. The link expires after one hour.</p>`);
 console.log('Private setup link saved to .cache/admin-setup.html. No email was sent.');
}else console.log('Owner account provisioned. Credentials kept in ignored local QA file.');
