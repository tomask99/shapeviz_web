const mimeExtensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/avif':'avif','image/gif':'gif','image/svg+xml':'svg','video/mp4':'mp4','video/webm':'webm','audio/mpeg':'mp3','audio/mp3':'mp3','audio/mp4':'m4a','audio/ogg':'ogg','audio/wav':'wav','audio/x-wav':'wav','audio/webm':'webm','font/woff2':'woff2','font/woff':'woff'};
const extensionMime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif',svg:'image/svg+xml',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',m4a:'audio/mp4',ogg:'audio/ogg',wav:'audio/wav',woff2:'font/woff2',woff:'font/woff',css:'text/css',js:'text/javascript'};

import {retryUpload} from './upload-retry.js';

export async function uploadPresentation(file, companions, api, progress) {
  if(file.size>200*1024*1024) throw new Error('The HTML file must be smaller than 200 MB.');
  let html=await file.text(), uploadId=crypto.randomUUID();
  let uploaded=0;
  async function upload(blob,name) {
    if(blob.size>50*1024*1024) throw new Error(`${name} exceeds the 50 MB media limit. Compress this asset first.`);
    const signed=await retryUpload(()=>api('sign-upload',{filename:name,uploadId}),progress,`Preparing ${name}`);
    await retryUpload(async()=>{
      let response;
      try {response=await fetch(signed.url,{method:'PUT',headers:{'Content-Type':blob.type || 'application/octet-stream'},body:blob,signal:AbortSignal.timeout(300000)});}
      catch(error) {throw Object.assign(new Error(`Could not upload ${name}: connection interrupted or timed out.`),{name:error.name});}
      if(!response.ok) {
        const data=await response.json().catch(()=>null);
        // Only show a short machine code, never raw upstream responses or signed URLs.
        const code=typeof data?.code==='string' && /^[a-zA-Z0-9_ -]{1,64}$/.test(data.code) ? `, ${data.code}` : '';
        throw Object.assign(new Error(`Could not upload ${name} (HTTP ${response.status}${code}). Please try again.`),{status:response.status,retryAfter:response.headers.get('Retry-After')});
      }
    },progress,`Uploading ${name}`);
    progress(`Uploaded ${++uploaded} files…`);
    return signed;
  }
  progress('Reading HTML and extracting embedded media…');
  // Rewrite data URIs everywhere, including CSS and JavaScript media constants.
  const embedded=[...new Set(html.match(/data:[a-zA-Z0-9/+.-]+;base64,[a-zA-Z0-9+/=]+/g)||[])];
  // Validate every embedded asset before the first network write.
  for(const uri of embedded) {
    const type=uri.slice(5,uri.indexOf(';'));
    if(!mimeExtensions[type])throw new Error(`Unsupported embedded media: ${type}`);
    const encoded=uri.slice(uri.indexOf(',')+1);
    if(encoded.length%4===1)throw new Error(`Invalid embedded media: ${type}`);
    const bytes=Math.floor(encoded.length*3/4)-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
    if(bytes>50*1024*1024)throw new Error(`Embedded ${type} exceeds the 50 MB media limit.`);
  }
  try {
  for(let index=0;index<embedded.length;index++) {
    const uri=embedded[index], type=uri.slice(5,uri.indexOf(';')), extension=mimeExtensions[type];
    if(!extension) throw new Error(`Unsupported embedded media: ${type}`);
    const encoded=uri.slice(uri.indexOf(',')+1), chunks=[];
    for(let offset=0;offset<encoded.length;offset+=65536) {const binary=atob(encoded.slice(offset,offset+65536));chunks.push(Uint8Array.from(binary,c=>c.charCodeAt(0)));}
    const signed=await upload(new Blob(chunks,{type}),`embedded-${index}.${extension}`);
    html=html.split(uri).join(signed.publicUrl);
  }
  const doc=new DOMParser().parseFromString(html,'text/html');
  const originalBase=doc.querySelector('base')?.getAttribute('href');
  doc.querySelectorAll('base').forEach(n=>n.remove());
  const assetMap=new Map();
  for(const file of companions) {
    if(assetMap.has(file.name))throw new Error(`Duplicate media name: ${file.name}`);
    assetMap.set(file.name,file);
  }
  const uploadedAssets=new Map();
  async function resolve(value) {
    if(!value || /^(?:https?:|data:|blob:|#|mailto:|tel:)/i.test(value) || value.startsWith('/presentation-system/'))return value;
    if(/^(?:javascript:|file:)/i.test(value))throw new Error('Local filesystem and javascript asset URLs are not supported.');
    if(originalBase && /^https?:/.test(originalBase))return new URL(value,originalBase).href;
    const name=decodeURIComponent(value.split(/[?#]/)[0].split('/').pop());
    if(uploadedAssets.has(name))return uploadedAssets.get(name);
    const file=assetMap.get(name);
    if(!file) throw new Error(`Missing file: ${value}. Include it under “HTML uses separate image or video files?”.`);
    const ext=name.split('.').pop().toLowerCase(), type=extensionMime[ext];
    if(!type) throw new Error(`Unsupported media file: ${name}`);
    const signed=await upload(new Blob([file],{type}),`asset-${uploadedAssets.size}-${crypto.randomUUID()}.${ext}`);
    uploadedAssets.set(name,signed.publicUrl);return signed.publicUrl;
  }
  for(const element of doc.querySelectorAll('[src],[poster],link[href]')) {
    for(const attr of ['src','poster',...(element.tagName==='LINK' ? ['href'] : [])]) {
      if(element.hasAttribute(attr))element.setAttribute(attr,await resolve(element.getAttribute(attr)));
    }
  }
  for(const element of doc.querySelectorAll('[srcset]')) {
    const parts=[];for(const part of element.getAttribute('srcset').split(',')){const [url,...descriptor]=part.trim().split(/\s+/);parts.push([await resolve(url),...descriptor].join(' '));}element.setAttribute('srcset',parts.join(', '));
  }
  for(const element of doc.querySelectorAll('style,[style]')) {
    const attribute=element.tagName!=='STYLE';let css=attribute ? element.getAttribute('style') : element.textContent;
    for(const match of [...css.matchAll(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/g)])css=css.replace(match[0],`url("${await resolve(match[2])}")`);
    if(attribute)element.setAttribute('style',css);else element.textContent=css;
  }
  html='<!doctype html>\n'+doc.documentElement.outerHTML;
  const blob=new Blob([html],{type:'text/html'});
  if(blob.size>4_000_000)throw new Error('HTML is still larger than 4 MB after extracting media. Move large inline data into separate assets.');
  progress('Saving HTML…');return await upload(blob,'source.html');
  } catch(error) {
    if(uploadId) {
      try { await retryUpload(()=>api('abort-upload',{uploadId}),progress,'Cleaning up incomplete upload'); }
      catch { throw new Error(`${error.message} Automatic cleanup failed; some uploaded files may remain. Upload ID: ${uploadId}`); }
    }
    throw error;
  }
}
