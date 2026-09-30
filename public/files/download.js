import { API, File } from './vendor/megajs.mjs';

// Writes chunks directly to disk: never concatenate them into a Blob/Buffer.
// Chromium uses an atomic file writer; other supported browsers use a same-
// origin service worker with pull-based backpressure and attachment headers.
export async function downloadFile({ file, download, handle, signal, onProgress = () => {} }) {
  let sink, stream, bytes = 0;
  const network = new AbortController();
  const api = new API(false);
  const request = api.request.bind(api);
  api.request = (body, callback, retry) => {
    if (api.closed || signal.aborted) return;
    return request(body, callback, retry);
  };
  api.userAgent = null;
  api.fetch = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.any([signal, network.signal, AbortSignal.timeout(60_000)]) });
  const abort = () => { stream?.destroy(new DOMException('Cancelled','AbortError')); sink?.abort().catch(()=>{}); };
  signal.addEventListener('abort',abort,{once:true});
  try {
    signal.throwIfAborted();
    sink = handle ? await handle.createWritable() : await streamWriter(file, signal);
    signal.throwIfAborted();
    if (file.size) {
      const source = new File({ downloadId:download.downloadId, key:download.key, api });
      stream = source.download({ forceHttps:true, maxConnections:2, initialChunkSize:128*1024, maxChunkSize:1024*1024, handleRetries(tries,error,callback) {
        if (signal.aborted || network.signal.aborted || tries>3 || /quota|bandwidth|509/i.test(error.message)) callback(error);
        else setTimeout(callback,Math.min(1000*2**tries,8000));
      } });
      for await (const chunk of stream) {
        signal.throwIfAborted();
        bytes += chunk.byteLength;
        if (bytes > file.size) throw new Error('The file changed during download. Refresh this page and try again.');
        await sink.write(chunk); onProgress(bytes);
      }
    }
    // MEGAJS verifies the full file MAC before its stream ends. Do not close
    // (commit) a file until both integrity and exact length have been checked.
    if (bytes !== file.size) throw new Error('The transfer was incomplete. Please try again.');
    signal.throwIfAborted();
    await sink.close();
  } catch (error) {
    stream?.destroy(); await sink?.abort().catch(()=>{});
    if (/quota|bandwidth|509/i.test(error.message)) throw new Error('The storage transfer allowance has been reached. Please try again later or contact the sender.');
    throw error;
  } finally { signal.removeEventListener('abort',abort); api.close(); network.abort(); }
}

async function streamWriter(file, signal) {
  if (!('serviceWorker' in navigator) || !('ReadableStream' in window)) throw new Error('This browser cannot save this download. Open the link in a current desktop browser.');
  const registration = await navigator.serviceWorker.register('/files/download-worker.js', { scope:'/files/' });
  const worker = registration.active || registration.installing || registration.waiting;
  if (!worker) throw new Error('Could not prepare the download. Please reload this page.');
  if (worker.state !== 'activated') await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>{cleanup();reject(new Error('Download setup timed out. Please reload.'));},15_000);
    const changed=()=>{if(worker.state==='activated'){cleanup();resolve();}else if(worker.state==='redundant'){cleanup();reject(new Error('Download setup failed. Please reload.'));}};
    const cancelled=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));};
    function cleanup(){clearTimeout(timer);worker.removeEventListener('statechange',changed);signal.removeEventListener('abort',cancelled);}
    worker.addEventListener('statechange',changed);signal.addEventListener('abort',cancelled,{once:true});changed();
  });
  signal.throwIfAborted();
  const id = crypto.randomUUID(), channel = new MessageChannel();
  let demand = false, waiting, finished, failed, timer, keepalive, rejectReady;
  const frame = document.createElement('iframe');frame.hidden=true;frame.title='File download';
  const ready = new Promise((resolve,reject) => {
    rejectReady=reject;
    timer=setTimeout(()=>{failed=new Error('The download could not start. Please reload and try again.');reject(failed);},15_000);
    channel.port1.onmessage=event=>{
      const data=event.data;
      if(data.type==='ready'){clearTimeout(timer);rejectReady=null;resolve();}
      if(data.type==='pull'){demand=true;waiting?.resolve();waiting=null;}
      if(data.type==='finished'){finished?.resolve();finished=null;}
      if(data.type==='cancel'){failed=new DOMException('Download cancelled','AbortError');waiting?.reject(failed);waiting=null;finished?.reject(failed);finished=null;reject(failed);}
    };
  });
  function cleanup(){clearTimeout(timer);clearInterval(keepalive);signal.removeEventListener('abort',cancel);channel.port1.close();frame.remove();}
  function cancel(){failed=new DOMException('Cancelled','AbortError');rejectReady?.(failed);waiting?.reject(failed);finished?.reject(failed);channel.port1.postMessage({type:'abort'});cleanup();}
  signal.addEventListener('abort',cancel,{once:true});
  worker.postMessage({type:'open',id,name:file.name,size:file.size},[channel.port2]);
  try { await ready;signal.throwIfAborted(); } catch(error){cleanup();throw error;}
  frame.src='/files/transfer/'+id;document.body.append(frame);
  keepalive=setInterval(()=>worker.postMessage({type:'ping'}),15_000);
  return {
    async write(chunk){
      if(failed)throw failed;signal.throwIfAborted();
      if(!demand)await new Promise((resolve,reject)=>{waiting={resolve,reject};});
      if(failed)throw failed;signal.throwIfAborted();demand=false;
      const copy=Uint8Array.from(chunk);channel.port1.postMessage({type:'chunk',data:copy},[copy.buffer]);
    },
    async close(){
      if(failed)throw failed;signal.throwIfAborted();
      const done=new Promise((resolve,reject)=>{finished={resolve,reject};});
      channel.port1.postMessage({type:'end'});await done;cleanup();
    },
    async abort(){cancel();}
  };
}
