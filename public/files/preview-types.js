export const MAX_PREVIEW_BYTES = 32 * 1024 * 1024;
const imageTypes = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', avif:'image/avif', bmp:'image/bmp' };
export const MAX_VIDEO_PREVIEW_BYTES = 128 * 1024 * 1024;
const videoTypes = { mp4:'video/mp4', m4v:'video/mp4', webm:'video/webm', mov:'video/quicktime', ogv:'video/ogg' };
export function videoType(file) {
  if(file.directory)return null;
  const extension=String(file.name).split('.').at(-1).toLowerCase();
  return Object.hasOwn(videoTypes,extension)?videoTypes[extension]:null;
}
export function previewType(file) {
  const video=videoType(file);
  if(video)return Number.isSafeInteger(file.size)&&file.size>0&&file.size<=MAX_VIDEO_PREVIEW_BYTES?video:null;
  if (file.directory || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_PREVIEW_BYTES) return null;
  const extension=String(file.name).split('.').at(-1).toLowerCase();
  return Object.hasOwn(imageTypes,extension)?imageTypes[extension]:null;
}
