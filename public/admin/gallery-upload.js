import {retryUpload} from './upload-retry.js';

export async function uploadGalleryImage(file, api, progress, action = 'site-gallery-upload') {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Choose a JPG, PNG, WebP or AVIF image.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose an image smaller than 25 MB.');
  const bitmap = await createImageBitmap(file);
  async function encode(maxSize, quality) {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob || blob.type !== 'image/webp' || blob.size > 4 * 1024 * 1024) throw new Error('This image could not be optimized. Try a smaller image.');
    return {blob, width:canvas.width, height:canvas.height};
  }
  try {
    const image = await encode(2400, .88);
    const thumb = await encode(800, .82);
    const id = crypto.randomUUID();
    const signed = await api(action, {uploadId:id});
    for (const [name, media] of [['image', image], ['thumb', thumb]]) {
      await retryUpload(async () => {
        const response = await fetch(signed[name].url, {method:'PUT', headers:{'Content-Type':'image/webp'}, body:media.blob, signal:AbortSignal.timeout(90_000)});
        if (!response.ok) throw Object.assign(new Error(`Image upload failed (${response.status}). Try again.`), {status:response.status, retryAfter:response.headers.get('Retry-After')});
      }, progress, file.name);
    }
    return {id, type:'image', src:signed.thumb.publicUrl, full:signed.image.publicUrl, width:image.width, height:image.height, caption:'', alt:file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '), filename:file.name, size:'narrow', positionX:50, positionY:50};
  } finally {bitmap.close();}
}
