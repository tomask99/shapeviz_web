import {analyticsAllowed} from './privacy/consent.js';
let generation=0, dispose=()=>{};
function restart(){const run=++generation;dispose();dispose=()=>{};if(analyticsAllowed())start(run).catch(()=>{});}
addEventListener('shapeviz:consent',restart);
// First-party, per-tab sessions. No fingerprint, IP storage or cross-site identifier.
async function start(run, attempt=0) {
  if(run!==generation || !analyticsAllowed())return;
  if((!['/','/index.html','/sk','/sk/','/en','/en/'].includes(location.pathname) && !/^\/(?:sk\/sluzby|en\/services)\/[a-z0-9-]+\/?$/.test(location.pathname)) || navigator.doNotTrack==='1' || navigator.globalPrivacyControl || /bot|crawler|spider|preview/i.test(navigator.userAgent))return;
  // A slow admin-status endpoint must not permanently disable this visit.
  // Keep owner exclusion fail-closed, retrying without recording until verified.
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),5000);
  try {
    const response=await fetch('/api/admin?action=tracking-status',{credentials:'same-origin',signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error('Tracking status unavailable');
    const status=await response.json();
    if(status.exclude===true)return;
    if(status.exclude!==false)throw new Error('Invalid tracking status');
  } catch {
    const retry=setTimeout(()=>start(run,Math.min(attempt+1,4)).catch(()=>{}),Math.min(60_000,5000*2**attempt));
    if(run===generation)dispose=()=>clearTimeout(retry);else clearTimeout(retry);
    return;
  } finally {clearTimeout(timeout);}
  if(run!==generation || !analyticsAllowed())return;
  const listeners=new AbortController();
  const key='sv-website-session-v1', expiry=30*60*1000;
  let state, lastTick=Date.now(), lastInput=lastTick, lastSent=0;
  const id=()=>crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));
  const save=()=>{try{sessionStorage.setItem(key,JSON.stringify(state));}catch{}};
  function reset(now) {state={id:id(),seconds:0,lastActive:now,referrer:document.referrer};save();}
  try{state=JSON.parse(sessionStorage.getItem(key));}catch{}
  if(!state || !/^[a-f0-9-]{36}$/i.test(state.id||'') || !Number.isFinite(state.seconds) || !Number.isFinite(state.lastActive) || Date.now()-state.lastActive>=expiry)reset(Date.now());
  function flush(beacon=false) {
    if(run!==generation || !analyticsAllowed())return;
    const body=JSON.stringify({sessionId:state.id,seconds:Math.min(604800,Math.floor(state.seconds)),referrer:state.referrer});
    lastSent=Date.now();save();
    if(beacon && navigator.sendBeacon?.('/api/site-events',new Blob([body],{type:'text/plain'})))return;
    fetch('/api/site-events',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
  }
  function tick() {
    if(!analyticsAllowed()){dispose();return;}
    const now=Date.now();
    if(document.visibilityState==='visible' && now-lastInput<60_000){
      if(now-state.lastActive>=expiry)reset(now);
      state.seconds+=Math.max(0,Math.min(2,(now-lastTick)/1000));state.lastActive=now;save();
      if(now-lastSent>=15_000)flush();
    }
    lastTick=now;
  }
  ['pointerdown','pointermove','keydown','scroll','touchstart'].forEach(type=>addEventListener(type,()=>{lastInput=Date.now();},{passive:true,signal:listeners.signal}));
  document.addEventListener('visibilitychange',()=>{
    if(!analyticsAllowed()){dispose();return;}
    if(document.visibilityState==='hidden'){tick();flush(true);}
    else {lastTick=lastInput=Date.now();if(lastInput-state.lastActive>=expiry)reset(lastInput);flush();}
  },{signal:listeners.signal});
  addEventListener('pagehide',()=>{tick();flush(true);},{signal:listeners.signal});
  if(document.visibilityState==='visible')flush();
  const interval=setInterval(tick,1000);
  dispose=()=>{clearInterval(interval);listeners.abort();};
}
restart();
