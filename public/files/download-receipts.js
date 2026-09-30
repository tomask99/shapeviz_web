// Persist only completed transfers until acknowledged. Retries share one signed
// receipt, so a lost HTTP response cannot increment the database twice.
const prefix='shapeviz.completedDownload.v1.';
const pending=new Map();
let flushing=false,timer;
function storageKey(receipt){return prefix+receipt.split('.').at(-1);}
function persist(row){try{localStorage.setItem(storageKey(row.receipt),JSON.stringify(row));}catch{}}
function remove(receipt){pending.delete(receipt);try{localStorage.removeItem(storageKey(receipt));}catch{}}
function expiry(receipt){try{return JSON.parse(atob(receipt.split('.')[0].replace(/-/g,'+').replace(/_/g,'/'))).exp;}catch{return 0;}}
function restore(){
  try{for(const key of Object.keys(localStorage).filter(k=>k.startsWith(prefix))){
    try{const row=JSON.parse(localStorage.getItem(key));if(typeof row.receipt==='string'&&row.expires>Date.now()&&/^\/api\/files\?/.test(row.url))pending.set(row.receipt,row);else localStorage.removeItem(key);}catch{localStorage.removeItem(key);}
  }}catch{}
}
async function flush(){
  if(flushing)return;
  flushing=true;clearTimeout(timer);restore();
  try{
    for(const [receipt,row] of pending){
      if(row.expires<=Date.now()){remove(receipt);continue;}
      try{
        const body=JSON.stringify({receipt});
        const response=await fetch(row.url,{method:'POST',credentials:'omit',cache:'no-store',keepalive:body.length<60_000,
          headers:{'Content-Type':'application/json',...(row.access?{'X-Files-Access':row.access}:{})},body,signal:AbortSignal.timeout(12_000)});
        if(response.ok||[400,403,404,410,413,415].includes(response.status))remove(receipt);
      }catch{}
    }
  }finally{flushing=false;if(pending.size)timer=setTimeout(flush,30_000);}
}
export function recordCompletedDownload({receipt,share,portal,access}){
  if(!receipt)return;
  const expires=expiry(receipt);if(expires<=Date.now())return;
  restore();
  const row={receipt,expires,url:'/api/files?'+new URLSearchParams({action:'download-complete',...share?{share}:{portal}}),access:share?null:access};
  pending.set(receipt,row);persist(row);void flush();
}
window.addEventListener('online',()=>void flush());
window.addEventListener('pageshow',()=>void flush());
void flush();
