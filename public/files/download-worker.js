// This worker handles only temporary download responses, never navigation,
// API responses or cached content. Data arrives on demand from the open page.
const transfers = new Map();
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  const {type,id,name,size}=event.data||{};
  if(type!=='open')return;
  const port=event.ports[0];
  if(!port||!event.source?.url||new URL(event.source.url).origin!==self.location.origin||!new URL(event.source.url).pathname.startsWith('/files/')||!/^[-\w]{36}$/.test(id)||!Number.isSafeInteger(size)||size<0||typeof name!=='string'||transfers.size>=4)return;
  let controller, pending, ended=false, received=0;
  const timeout=setTimeout(()=>{transfers.delete(id);port.postMessage({type:'cancel'});port.close();},60_000);
  function fail(){if(ended)return;ended=true;controller?.error(new Error('Download interrupted'));pending?.();pending=null;port.postMessage({type:'cancel'});port.close();transfers.delete(id);clearTimeout(timeout);}
  const stream=new ReadableStream({
    start(value){controller=value;},
    pull(){if(ended)return;return new Promise(resolve=>{pending=resolve;port.postMessage({type:'pull'});});},
    cancel(){fail();}
  },{highWaterMark:0});
  port.onmessage=message=>{
    if(ended)return;
    const data=message.data;
    if(data.type==='abort'){fail();return;}
    if(data.type==='chunk'){
      if(!pending||!(data.data instanceof Uint8Array)||data.data.byteLength>8*1024*1024){fail();return;}
      received+=data.data.byteLength;if(received>size){fail();return;}
      controller.enqueue(data.data);pending?.();pending=null;
    }
    if(data.type==='end'){
      if(received!==size){fail();return;}
      ended=true;controller.close();pending?.();pending=null;port.postMessage({type:'finished'});port.close();clearTimeout(timeout);transfers.delete(id);
    }
  };
  const safeName=name.replace(/[\\/\u0000-\u001f\u007f]/g,'_').slice(0,240)||'download';
  transfers.set(id,{stream,size,name:safeName,timeout});
  port.postMessage({type:'ready'});
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  const match=/^\/files\/transfer\/([-\w]{36})$/.exec(url.pathname);
  if(url.origin!==self.location.origin||!match||event.request.method!=='GET')return;
  const item=transfers.get(match[1]);
  if(!item){event.respondWith(new Response('This download has expired. Return to the file page and try again.',{status:410}));return;}
  transfers.delete(match[1]);clearTimeout(item.timeout);
  const filename=encodeURIComponent(item.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
  // Omit Content-Length: the browser must receive the stream's successful EOF,
  // after MAC verification, rather than accepting the last byte prematurely.
  event.respondWith(new Response(item.stream,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="download"; filename*=UTF-8''${filename}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}}));
});
