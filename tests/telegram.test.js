import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyPresentationOpened,notifyWebsiteClicked} from '../src/presentations/telegram.js';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'secret',TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'123',SITE_URL:'https://shapevizweb.vercel.app'};
const event={eventType:'session_started',sessionId:'session',deck:'milenium'};
const project={client:'Milenium',title:'Art direction'};

test('website clicks notify independently of opens and deduplicate concurrent event deliveries',async()=>{
 const claims=new Set(),messages=[];
 const click={...event,eventType:'website_clicked',eventId:'click-1',slideIndex:8};
 const send=async(url,options)=>{
  if(url.includes('/presentation_events?')){
   const query=new URL(url).searchParams,key=query.get('event_id');
   assert.equal(query.get('session_id'),'eq.session');
   assert.equal(query.get('deck_slug'),'eq.milenium');
   assert.equal(query.get('event_type'),'eq.website_clicked');
   assert.equal(query.get('telegram_claimed_at'),'is.null');
   assert.equal(options.method,'PATCH');
   const rows=claims.has(key)?[]:[{event_id:key}];claims.add(key);return Response.json(rows);
  }
  if(url.includes('/presentation_sessions?'))return Response.json([{id:'session'}]);
  messages.push(JSON.parse(options.body));return Response.json({ok:true});
 };
 const options={env:{...env,TELEGRAM_CHAT_ID:' 123\n'},send};
 await notifyPresentationOpened(event,project,options);
 await Promise.all([notifyWebsiteClicked(click,project,options),notifyWebsiteClicked(click,project,options)]);
 assert.equal(messages.length,2);
 assert.match(messages[1].text,/prešiel z prezentácie na tvoj web/);
 assert.match(messages[1].text,/Milenium — Art direction/);
 assert.match(messages[1].text,/Slide: 8/);
 assert.equal(messages[1].chat_id,'123');
 await notifyWebsiteClicked({...click,eventId:'click-2'},project,options);
 assert.equal(messages.length,3);
});

test('click notifications skip other events, missing configuration and nonexistent stored events',async()=>{
 const send=()=>{throw new Error('Unexpected request');};
 await notifyWebsiteClicked(event,project,{env,send});
 await notifyWebsiteClicked({...event,eventType:'website_clicked'},project,{env:{...env,TELEGRAM_BOT_TOKEN:''},send});
 await notifyWebsiteClicked({...event,eventType:'website_clicked',eventId:'missing'},project,{env,send:async url=>{
  assert.match(url,/\/presentation_events\?/);return Response.json([]);
 }});
});

test('click notification failures do not escape or leak token-bearing errors',async()=>{
 const warnings=[],original=console.warn;console.warn=value=>warnings.push(value);
 try{
  await notifyWebsiteClicked({...event,eventType:'website_clicked',eventId:'click'},project,{env,send:async url=>{
   if(url.includes('/presentation_events?'))return Response.json([{event_id:'click'}]);
   throw new Error('https://api.telegram.org/bottest-token/sendMessage');
  }});
 }finally{console.warn=original;}
 assert.deepEqual(warnings,['Telegram website click notification failed']);
});
test('concurrent duplicate starts send one notification with the correct deck and no link',async()=>{
 let claimed=false;const messages=[];
 const send=async(url,options)=>{
  if(url.includes('/presentation_sessions?')){assert.match(url,/id=eq.session/);assert.match(url,/deck_slug=eq.milenium/);const rows=claimed?[]:[{id:'session'}];claimed=true;return Response.json(rows);}
  messages.push(JSON.parse(options.body));return Response.json({ok:true});
 };
 await Promise.all([notifyPresentationOpened(event,project,{env,send}),notifyPresentationOpened(event,project,{env,send})]);
 assert.equal(messages.length,1);assert.equal(messages[0].chat_id,'123');
 assert.match(messages[0].text,/Milenium — Art direction/);assert.doesNotMatch(messages[0].text,/https?:\/\//);
 assert.match(messages[0].text,/Zariadenie: Neznáme zariadenie/);
 assert.match(messages[0].text,/Približná poloha: Nedostupná/);
 assert.deepEqual(messages[0].link_preview_options,{is_disabled:true});
});
test('slide events and missing configuration do not call Telegram or claim a session',async()=>{
 const send=()=>{throw new Error('Unexpected request');};
 await notifyPresentationOpened({...event,eventType:'slide_viewed'},project,{env,send});
 await notifyPresentationOpened(event,project,{env:{...env,TELEGRAM_CHAT_ID:''},send});
});
test('notification failures are contained and never log token-bearing errors',async()=>{
 const warnings=[];const original=console.warn;console.warn=value=>warnings.push(value);
 try{await notifyPresentationOpened(event,project,{env,send:async()=>{throw new Error('https://api.telegram.org/bottest-token/sendMessage');}});}finally{console.warn=original;}
 assert.deepEqual(warnings,['Telegram presentation notification failed']);
});

test('notification describes devices and safely decodes approximate platform location',async()=>{
 const cases=[
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile','iPhone (mobil)'],
  ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)','iPad (tablet)'],
  ['Mozilla/5.0 (Linux; Android 15) Mobile','Android (mobil)'],
  ['Mozilla/5.0 (Linux; Android 15)','Android (tablet)'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)','Počítač · Windows'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)','Počítač · macOS'],
  ['','Neznáme zariadenie']
 ];
 for(const [ua,label] of cases){
  let message;
  const send=async(url,options)=>{
   if(url.includes('/presentation_sessions?'))return Response.json([{id:'session'}]);
   message=JSON.parse(options.body);return Response.json({ok:true});
  };
  await notifyPresentationOpened(event,project,{env:{...env,VERCEL:'1',SITE_URL:''},send,headers:{'user-agent':ua,'x-vercel-ip-city':'Ko%C5%A1ice','x-vercel-ip-country':'SK'}});
  assert.ok(message.text.includes(`Zariadenie: ${label}`));
  assert.ok(message.text.includes('Približná poloha: Košice, Slovensko'));
  assert.equal(message.parse_mode,undefined);
 }
});

test('location handles unavailable, country-only, malformed and non-platform headers',async()=>{
 for(const [platform,city,country,expected] of [
  ['1','','SK','Slovensko'],['1','%ZZ','','Nedostupná'],
  ['1','','','Nedostupná'],['0','Bratislava','SK','Nedostupná'],
  ['1','City%0AInjected','invalid','City Injected']
 ]){
  let message;
  const send=async(url,options)=>{
   if(url.includes('/presentation_sessions?'))return Response.json([{id:'session'}]);
   message=JSON.parse(options.body);return Response.json({ok:true});
  };
  await notifyPresentationOpened(event,project,{env:{...env,VERCEL:platform},send,headers:{'x-vercel-ip-city':city,'x-vercel-ip-country':country}});
  assert.ok(message.text.endsWith(`Približná poloha: ${expected}`));
 }
});
