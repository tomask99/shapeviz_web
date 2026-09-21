import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyPresentationOpened} from '../src/presentations/telegram.js';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'secret',TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'123',SITE_URL:'https://shapevizweb.vercel.app'};
const event={eventType:'session_started',sessionId:'session',deck:'milenium'};
const project={client:'Milenium',title:'Art direction'};
test('concurrent duplicate starts send one notification with the correct deck and link',async()=>{
 let claimed=false;const messages=[];
 const send=async(url,options)=>{
  if(url.includes('/presentation_sessions?')){assert.match(url,/id=eq.session/);assert.match(url,/deck_slug=eq.milenium/);const rows=claimed?[]:[{id:'session'}];claimed=true;return Response.json(rows);}
  messages.push(JSON.parse(options.body));return Response.json({ok:true});
 };
 await Promise.all([notifyPresentationOpened(event,project,{env,send}),notifyPresentationOpened(event,project,{env,send})]);
 assert.equal(messages.length,1);assert.equal(messages[0].chat_id,'123');
 assert.match(messages[0].text,/Milenium — Art direction/);assert.match(messages[0].text,/https:\/\/shapevizweb.vercel.app\/p\/milenium/);
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
