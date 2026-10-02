import { downloadFile } from './download.js';
import { MAX_VIDEO_PREVIEW_BYTES, previewType } from './preview-types.js';

export function mountVideoPreview({slot,file,api,signal}) {
  const button=slot.querySelector('button'),status=slot.querySelector('[role=status]');
  const video=document.createElement('video');
  video.controls=true;video.playsInline=true;video.preload='metadata';
  video.setAttribute('aria-label',`Video preview: ${file.name}`);
  let url,controller;
  function release(){video.pause();video.removeAttribute('src');video.load();if(url)URL.revokeObjectURL(url);url=null;}
  signal.addEventListener('abort',()=>{controller?.abort();release();},{once:true});
  const type=previewType(file);
  if(!type || !video.canPlayType(type)) {
    button.hidden=true;
    status.textContent=!type?'This video exceeds the 128 MB preview limit. Download the file to watch it.':'This browser does not support this video format. Download the file to watch it.';
    return;
  }
  video.addEventListener('error',()=>{
    release();video.remove();button.hidden=false;button.disabled=false;
    status.textContent='This video could not be played. Download the file or try again.';
  });
  button.onclick=async()=>{
    button.disabled=true;controller=new AbortController();
    const deadline=AbortSignal.any([signal,controller.signal,AbortSignal.timeout(300_000)]);
    let chunks=[],bytes=0,blob;
    status.textContent='Loading video...';
    try {
      const data=await api({action:'preview',node:file.id},deadline);
      if(!previewType(data.file)?.startsWith('video/'))throw new Error('Video preview unavailable.');
      const handle={createWritable:async()=>({
        async write(chunk){bytes+=chunk.byteLength;if(bytes>MAX_VIDEO_PREVIEW_BYTES)throw new Error('Video is too large to preview.');chunks.push(Uint8Array.from(chunk));},
        async close(){blob=new Blob(chunks,{type:previewType(data.file)});chunks=[];},
        async abort(){chunks=[];blob=null;}
      })};
      await downloadFile({...data,handle,signal:deadline,onProgress(bytes){status.textContent=`Loading video: ${Math.round(bytes/data.file.size*100)}%`;}});
      deadline.throwIfAborted();
      url=URL.createObjectURL(blob);video.src=url;slot.prepend(video);
      button.hidden=true;status.textContent='Ready to play.';
    } catch(error) {
      if(signal.aborted)return;
      status.textContent='Preview unavailable. Download the file or try again.';
      button.disabled=false;
    } finally {chunks=[];blob=null;}
  };
}
