import { downloadFile } from './download.js';
import { MAX_PREVIEW_BYTES, previewType } from './preview-types.js';

// Only small raster images enter this bounded in-memory writer. Model/ZIP
// downloads keep using the separate streaming-to-disk path.
async function previewBlob(data, signal, large) {
  const type=previewType(data.file);
  if (!type) throw new Error('Preview unavailable. Download the image to view it.');
  let chunks=[],bytes=0,blob;
  const handle={createWritable:async()=>({
    async write(chunk) {
      bytes+=chunk.byteLength;
      if(bytes>MAX_PREVIEW_BYTES)throw new Error('Image is too large to preview.');
      chunks.push(Uint8Array.from(chunk));
    },
    async close(){blob=new Blob(chunks,{type});chunks=[];},
    async abort(){chunks=[];blob=null;}
  })};
  await downloadFile({...data,handle,signal});
  signal.throwIfAborted();
  // Decode only after MEGA's full-file integrity check, then retain a small
  // thumbnail instead of keeping every original image in browser memory.
  const bitmap=await createImageBitmap(blob);
  try {
    signal.throwIfAborted();
    const scale=Math.min(1,(large?1600:640)/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    return await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Preview unavailable.')),'image/webp',.85));
  } finally { bitmap.close(); }
}

export function mountPreviews({root,api,signal}) {
  const slots=[...root.querySelectorAll('[data-image-preview]')],pending=[],urls=new Set();
  let running=0;
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);pending.push(entry.target);}
    pump();
  },{rootMargin:'160px'});
  for(const slot of slots)observer.observe(slot);
  function cleanup(){observer.disconnect();pending.length=0;for(const url of urls)URL.revokeObjectURL(url);urls.clear();}
  signal.addEventListener('abort',cleanup,{once:true});
  if(signal.aborted)cleanup();
  function pump(){
    while(!signal.aborted&&running<2&&pending.length){
      const slot=pending.shift();running++;
      render(slot).finally(()=>{running--;pump();});
    }
  }
  async function render(slot) {
    slot.dataset.previewState='loading';
    let url;
    try {
      const deadline=AbortSignal.any([signal,AbortSignal.timeout(90_000)]);
      const data=await api({action:'preview',node:slot.dataset.imagePreview},deadline);
      const blob=await previewBlob(data,deadline,slot.classList.contains('detail-image'));
      deadline.throwIfAborted();
      const image=new Image();image.alt='';image.decoding='async';
      url=URL.createObjectURL(blob);urls.add(url);image.src=url;
      await image.decode();deadline.throwIfAborted();
      slot.replaceChildren(image);slot.dataset.previewState='ready';
    } catch(error) {
      if(url){URL.revokeObjectURL(url);urls.delete(url);}
      if(signal.aborted)return;
      slot.dataset.previewState='unavailable';
      slot.textContent='No preview';slot.title='Preview unavailable. You can still download the file.';
    }
  }
}
