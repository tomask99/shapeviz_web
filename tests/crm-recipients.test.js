import test from 'node:test';
import assert from 'node:assert/strict';
import {newRecipientToken,recipientHash,validRecipientToken,recipientParam} from '../src/presentations/recipient-token.js';
import {handleCrm} from '../src/crm/handler.js';
test('Recipient sent is retry-safe and analytics validates periods using the owner JWT',async()=>{
 const id='11111111-1111-4111-8111-111111111111',calls=[];let row={id},ctx={action:'crm-recipient-sent',user:{id},token:'jwt',url:new URL('https://test'),body:{companyId:id,id,sent_at:'2026-01-01T00:00:00.000Z'},call:async(path,options)=>{assert.equal(options.token,'jwt');calls.push({path,options});if(path.includes('crm_companies?'))return [{id}];if(path.includes('/rpc/'))return {visits:0};if(options.method==='PATCH')row={id,...options.body};return [row];}};
 await handleCrm(ctx);await handleCrm(ctx);assert.equal(calls.filter(c=>c.options.method==='PATCH').length,1);assert.match(calls.find(c=>c.options.method==='PATCH').path,/sent_at=is.null/);
 const read={...ctx,action:'crm-recipient-stats',url:new URL(`https://test/?companyId=${id}&id=${id}&days=7`)};assert.deepEqual(await handleCrm(read),{stats:{visits:0},days:7});assert.deepEqual(calls.at(-1).options.body,{p_recipient:id,p_days:7});await assert.rejects(()=>handleCrm({...read,url:new URL(`https://test/?companyId=${id}&id=${id}&days=365`)}),{status:400});
});
test('Recipient tokens are random, canonical, hashed and reject malformed/duplicate parameters',()=>{
 const a=newRecipientToken(),b=newRecipientToken();assert.notEqual(a,b);assert.equal(a.length,43);assert.equal(validRecipientToken(a),true);assert.match(recipientHash(a),/^[a-f0-9]{64}$/);assert.equal(recipientParam(new URL('https://test/?r='+a)),a);assert.equal(recipientParam(new URL('https://test/')),null);
 for(const q of ['r=','r=hello','r='+a+'&r='+b,'r='+a+'%0A'])assert.throws(()=>recipientParam(new URL('https://test/?'+q)),{status:404});
});
test('Recipient API uses authorized association/contact, user JWT, hash-only storage and bounded safe reads',async()=>{
 const id='11111111-1111-4111-8111-111111111111',calls=[];
 const ctx={action:'crm-recipient-create',user:{id},token:'jwt',url:new URL('https://test'),body:{companyId:id,associationId:id,name:'Private name',email:'p@example.test',owner_id:'spoof',token_hash:'spoof'},call:async(path,options)=>{assert.equal(options.token,'jwt');calls.push({path,options});if(path.includes('crm_companies?'))return [{id}];if(path.includes('crm_presentation_links?'))return [{id,deck_slug:'fixture'}];return [{id}];}};
 const result=await handleCrm(ctx),token=new URL(result.url,'https://test').searchParams.get('r');assert.equal(calls.at(-1).options.body.token_hash,recipientHash(token));assert.equal(calls.at(-1).options.body.owner_id,id);assert.equal(JSON.stringify(calls).includes(token),false);
 await handleCrm({...ctx,action:'crm-recipients',url:new URL(`https://test/?companyId=${id}&associationId=${id}`)});assert.match(calls.at(-1).path,/limit=26/);assert.doesNotMatch(calls.at(-1).path,/token_hash/);
 await assert.rejects(()=>handleCrm({...ctx,token:null}),{status:401});await assert.rejects(()=>handleCrm({...ctx,body:{...ctx.body,contact_id:'wrong'}}),{status:400});
});
