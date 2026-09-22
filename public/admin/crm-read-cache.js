// Private to this page/session. Never persist CRM responses in browser storage.
export function createCrmReadCache(request,{now=Date.now,ttl=10000,maxEntries=30}={}) {
  const allowed=new Set(['crm-list','crm-pipeline','crm-followups','crm-saved-views']);
  const entries=new Map();let generation=0,writes=0;
  function invalidate(){generation++;entries.clear();}
  async function api(action,body,params={}) {
    if(body){
      writes++;invalidate();
      try{return await request(action,body,params);}
      finally{writes--;invalidate();}
    }
    if(!allowed.has(action)||writes)return request(action,body,params);
    const query=new URLSearchParams(params);query.sort();const key=action+'?'+query;
    const existing=entries.get(key);
    if(existing&&(existing.pending||existing.expires>now()))return structuredClone(await existing.promise);
    entries.delete(key);
    const epoch=generation,entry={pending:true,expires:0};
    entry.promise=Promise.resolve().then(()=>request(action,body,params)).then(value=>{
      entry.pending=false;entry.expires=now()+ttl;
      if(epoch!==generation&&entries.get(key)===entry)entries.delete(key);
      return value;
    },error=>{if(entries.get(key)===entry)entries.delete(key);throw error;});
    entries.set(key,entry);
    while(entries.size>maxEntries)entries.delete(entries.keys().next().value);
    return structuredClone(await entry.promise);
  }
  api.invalidate=invalidate;
  return api;
}
