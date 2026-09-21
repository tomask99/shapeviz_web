// First-party, per-tab sessions. No fingerprint, IP storage or cross-site identifier.
async function start() {
  if(!['/','/index.html'].includes(location.pathname) || navigator.doNotTrack==='1' || navigator.globalPrivacyControl || /bot|crawler|spider|preview/i.test(navigator.userAgent))return;
  try {
    const response=await fetch('/api/admin?action=tracking-status',{credentials:'same-origin',signal:AbortSignal.timeout(5000)});
    if(!response.ok || (await response.json()).exclude)return;
  } catch {return;}
  const key='sv-website-session-v1', expiry=30*60*1000;
  let state, lastTick=Date.now(), lastInput=lastTick, lastSent=0;
  const id=()=>crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));
  const save=()=>{try{sessionStorage.setItem(key,JSON.stringify(state));}catch{}};
  function reset(now) {state={id:id(),seconds:0,lastActive:now,referrer:document.referrer};save();}
  try{state=JSON.parse(sessionStorage.getItem(key));}catch{}
  if(!state || !/^[a-f0-9-]{36}$/i.test(state.id||'') || !Number.isFinite(state.seconds) || !Number.isFinite(state.lastActive) || Date.now()-state.lastActive>=expiry)reset(Date.now());
  function flush(beacon=false) {
    const body=JSON.stringify({sessionId:state.id,seconds:Math.min(604800,Math.floor(state.seconds)),referrer:state.referrer});
    lastSent=Date.now();save();
    if(beacon && navigator.sendBeacon?.('/api/site-events',new Blob([body],{type:'text/plain'})))return;
    fetch('/api/site-events',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
  }
  function tick() {
    const now=Date.now();
    if(document.visibilityState==='visible' && now-lastInput<60_000){
      if(now-state.lastActive>=expiry)reset(now);
      state.seconds+=Math.max(0,Math.min(2,(now-lastTick)/1000));state.lastActive=now;save();
      if(now-lastSent>=15_000)flush();
    }
    lastTick=now;
  }
  ['pointerdown','pointermove','keydown','scroll','touchstart'].forEach(type=>addEventListener(type,()=>{lastInput=Date.now();},{passive:true}));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){tick();flush(true);}
    else {lastTick=lastInput=Date.now();if(lastInput-state.lastActive>=expiry)reset(lastInput);flush();}
  });
  addEventListener('pagehide',()=>{tick();flush(true);});
  if(document.visibilityState==='visible')flush();
  setInterval(tick,1000);
}
start().catch(()=>{});
