import {readFileSync} from 'node:fs';
import {svgIcon} from '../../public/ui/icons.js';
import {translate} from '../../public/i18n/messages.js';

export const defaultGallery = JSON.parse(readFileSync(new URL('./default-gallery.json', import.meta.url), 'utf8'));
const fail = (status, message) => Object.assign(new Error(message), {status});
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function validateGallery(items, env) {
  if (!Array.isArray(items) || items.length > 100) throw fail(400, 'Use at most 100 gallery items.');
  const ids = new Set();
  const prefix = `${env.SUPABASE_URL?.replace(/\/$/, '')}/storage/v1/object/public/site-gallery/`;
  return items.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id)) throw fail(400, 'Each gallery item needs a unique ID.');
    ids.add(item.id);
    const original = defaultGallery.find(entry => entry.src === item.src);
    let media = original;
    if (!original) {
      const object = typeof item.src === 'string' && item.src.startsWith(prefix) ? item.src.slice(prefix.length) : '';
      const parts = object.split('/');
      if (parts.length !== 4 || parts[0] !== 'uploads' || !uuid.test(parts[1]) || !uuid.test(parts[2]) || parts[3] !== 'thumb.webp') throw fail(400, 'Upload images through the gallery editor.');
      if (![item.width, item.height].every(value => Number.isInteger(value) && value > 0 && value <= 2400)) throw fail(400, 'Invalid image dimensions.');
      const full = item.src.replace(/thumb\.webp$/, 'image.webp');
      const thumbWidth = Math.max(1, Math.round(item.width * Math.min(1, 800 / Math.max(item.width, item.height))));
      media = {type:'image', src:item.src, full, srcset:thumbWidth < item.width ? `${item.src} ${thumbWidth}w, ${full} ${item.width}w` : '', poster:'', width:item.width, height:item.height, category:'image'};
    }
    for (const field of ['caption', 'alt', 'filename']) {
      if (typeof item[field] !== 'string' || item[field].length > (field === 'caption' ? 120 : 500)) throw fail(400, 'Enter a valid image caption and description.');
    }
    if (!item.alt.trim()) throw fail(400, 'Enter a description for each image.');
    if (!['wide', 'narrow', 'film'].includes(item.size) || (media.type === 'image' && item.size === 'film')) throw fail(400, 'Invalid gallery card size.');
    if (![item.positionX, item.positionY].every(value => Number.isFinite(value) && value >= 0 && value <= 100)) throw fail(400, 'Invalid image crop.');
    return {...media, id:item.id, caption:item.caption.trim(), alt:item.alt.trim(), filename:item.filename, size:media.type === 'video' ? 'film' : item.size, positionX:item.positionX, positionY:item.positionY};
  });
}

export async function signGalleryImage({uploadId, bucket, call, env, user}) {
  if (typeof uploadId !== 'string' || !uuid.test(uploadId)) throw fail(400, 'Invalid upload ID.');
  const root = env.SUPABASE_URL.replace(/\/$/, '');
  const result = {};
  for (const name of ['image', 'thumb']) {
    const object = `uploads/${user.id}/${uploadId}/${name}.webp`;
    const signed = await call(`/storage/v1/object/upload/sign/${bucket}/${object}`, {method:'POST', body:{}, headers:{'x-upsert':'true'}});
    result[name] = {url:`${root}/storage/v1${signed.url}`, publicUrl:`${root}/storage/v1/object/public/${bucket}/${object}`};
  }
  return result;
}

export async function handleGallery({action, body, call, env, user}) {
  body ??= {};
  if (action === 'site-gallery-upload') return signGalleryImage({uploadId:body.uploadId, bucket:'site-gallery', call, env, user});
  const rows = await call('/rest/v1/site_content?id=eq.1&select=gallery,gallery_version');
  const current = rows?.[0];
  if (!current || !current.gallery_version) throw fail(503, 'Gallery storage is not ready.');
  if (action === 'site-gallery-list') return {items:current.gallery ?? defaultGallery, version:current.gallery_version};
  const conflict = () => fail(409, 'The gallery changed in another window. Reload the saved gallery before saving again.');
  if (!Number.isSafeInteger(body.version) || body.version !== current.gallery_version) throw conflict();
  const gallery = validateGallery(body.items, env);
  const saved = await call(`/rest/v1/site_content?id=eq.1&gallery_version=eq.${body.version}&select=gallery,gallery_version`, {
    method:'PATCH', headers:{Prefer:'return=representation'}, body:{gallery, gallery_version:body.version + 1, updated_at:new Date().toISOString()}
  });
  if (!saved?.[0]) throw conflict();
  return {items:saved[0].gallery, version:saved[0].gallery_version};
}

export function renderGallery(items, locale) {
  const t = value => escape(translate(value, locale));
  return items.map((item, index) => {
    const image = `<button class="image-button" aria-label="${t('Enlarge: ' + item.alt)}" data-lightbox="${escape(item.full)}"><span class="media-clip"><img src="${escape(item.src)}" ${item.srcset ? `srcset="${escape(item.srcset)}"` : ''} sizes="(max-width:600px) 100vw, ${item.size === 'wide' ? '66vw' : '33vw'}" width="${item.width}" height="${item.height}" alt="${t(item.alt)}" loading="lazy" decoding="async"></span></button>`;
    const video = `<div class="video-frame"><div class="media-clip"><video width="${item.width}" height="${item.height}" muted loop playsinline preload="none" controls data-autoplay data-src="${escape(item.src)}" data-gallery-poster="${escape(item.poster)}" aria-label="${t(item.alt)}"></video><div class="video-controls" hidden><button type="button" class="video-play" aria-label="${t('Play video')}"><span aria-hidden="true">${svgIcon('play')}</span></button><span class="micro">${t('IN MOTION')}</span><button type="button" class="video-sound" aria-label="${t('Unmute video')}" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path class="sound-off" d="m16 9 6 6m0-6-6 6"/><path class="sound-on" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg></button></div></div></div>`;
    return `<div class="gallery-slot gallery-slot--${item.size}"><figure class="gallery-item${item.type === 'video' ? ' gallery-film' : ''}" data-gallery-file="${escape(item.filename)}" data-kind="${escape(item.category)}" style="--image-position:${item.positionX}% ${item.positionY}%">${item.type === 'video' ? video : image}<figcaption><span>${t(item.caption)}</span><span>${String(index + 1).padStart(2, '0')}</span></figcaption></figure></div>`;
  }).join('');
}
