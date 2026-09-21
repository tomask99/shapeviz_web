import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createAdminHandler} from '../src/admin/handler.js';

test('live Storage repeats a signed PUT at the same path and cleans up one object', {skip:process.env.LIVE_SUPABASE_TEST!=='true'},async()=>{
 process.loadEnvFile('.env');
 const env={...process.env,SUPABASE_URL:'https://psqykqbewphchalfyrsp.supabase.co'};
 const owner='00000000-0000-4000-8000-000000000001',uploadId=randomUUID();
 const send=async(url,options)=>{
  // Local harness authentication only; actual Storage and cleanup use Supabase.
  if(url.endsWith('/auth/v1/user'))return Response.json({id:owner});
  if(url.includes('presentation_admins?'))return Response.json([{role:'owner'}]);
  return fetch(url,options);
 };
 const server=createServer(createAdminHandler({env,send}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const api=(action,body)=>fetch(origin+'/?action='+action,{method:'POST',headers:{Origin:origin,Cookie:'sv_access=integration-only','Content-Type':'application/json'},body:JSON.stringify(body)});
 let wrote=false;
 try {
  const response=await api('sign-upload',{uploadId,filename:'retry-check.svg'});assert.equal(response.status,200);
  const signed=await response.json();
  for(let attempt=0;attempt<2;attempt++) {
   const put=await fetch(signed.url,{method:'PUT',headers:{'Content-Type':'image/svg+xml'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',signal:AbortSignal.timeout(30000)});
   assert.equal(put.status,200,`Storage PUT attempt ${attempt+1}`);wrote=true;
  }
 }finally {
  try {
   const cleaned=await api('abort-upload',{uploadId});assert.equal(cleaned.status,200,'Test upload cleanup');
   const result=await cleaned.json();if(wrote)assert.equal(result.deletedFiles,1);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 }
});
