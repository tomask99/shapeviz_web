import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createContactHandler} from '../src/contact.js';
const env={CONTACT_PROVIDER:'gmail',GMAIL_USER:'studio@gmail.com',GMAIL_APP_PASSWORD:'abcd efgh ijkl mnop',CONTACT_TO_EMAIL:'studio@gmail.com',RESEND_API_KEY:'unused'};
const inquiry={name:'Visitor',email:'visitor@example.com',company:'Company',services:[],message:'Please tell me more about your services.',consent:true};
async function run(options,assertions){
 const server=createServer(createContactHandler({env,send:()=>assert.fail('Must not use Resend'),...options}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const r=await fetch(`http://127.0.0.1:${server.address().port}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(inquiry)});await assertions(r);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('Gmail uses TLS, fixed recipient and visitor Reply-To, then closes connection',async()=>{
 let closed=false;
 await run({createTransport:options=>{
  assert.equal(options.host,'smtp.gmail.com');assert.equal(options.secure,true);assert.equal(options.port,465);
  assert.equal(options.auth.pass,'abcdefghijklmnop');assert.equal(options.logger,false);
  return {sendMail:async message=>{
   assert.deepEqual(message.to,[{address:env.CONTACT_TO_EMAIL}]);assert.equal(message.from.address,env.GMAIL_USER);
   assert.equal(message.replyTo.address,inquiry.email);assert.equal(message.html,undefined);assert.ok(message.text.includes(inquiry.message));
   return {accepted:[env.CONTACT_TO_EMAIL]};
  },close:()=>closed=true};
 }},async r=>{assert.equal(r.status,200);assert.equal((await r.json()).ok,true);});
 assert.equal(closed,true);
});
test('Gmail rejection does not report success or fall back to Resend',async()=>{
 for(const fail of [false,true]){
  let closed=false;
  await run({createTransport:()=>({sendMail:async()=>{if(fail)throw new Error('Secret-bearing provider error');return {accepted:[]};},close:()=>closed=true})},async r=>{assert.equal(r.status,502);assert.doesNotMatch(await r.text(),/Secret-bearing/);});
  assert.equal(closed,true);
 }
});
test('explicit Gmail requires Gmail credentials even when Resend is configured',async()=>{
 await run({env:{...env,GMAIL_APP_PASSWORD:'',CONTACT_FROM_EMAIL:'other@example.com'},createTransport:()=>assert.fail('Unconfigured')},async r=>assert.equal(r.status,503));
});
