export const MAX_PREVIEW_BYTES = 32 * 1024 * 1024;
const imageTypes = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', avif:'image/avif', bmp:'image/bmp' };
export function previewType(file) {
  if (file.directory || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_PREVIEW_BYTES) return null;
  const extension=String(file.name).split('.').at(-1).toLowerCase();
  return Object.hasOwn(imageTypes,extension)?imageTypes[extension]:null;
}
