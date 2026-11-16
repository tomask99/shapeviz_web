import {aboutFields, defaultAbout} from '../../public/site/about-content.js';

const fail = (status, message) => Object.assign(new Error(message), {status});
const conflict = () => fail(409, 'The profile changed in another window. Reload the saved profile before saving again.');

export function validateAbout(about) {
  if (!about || typeof about !== 'object' || Array.isArray(about)) throw fail(400, 'Enter profile text in Slovak and English.');
  const clean = {};
  for (const locale of ['sk', 'en']) {
    const source = about[locale];
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw fail(400, 'Enter profile text in Slovak and English.');
    clean[locale] = {};
    for (const {key, label, maxLength} of aboutFields) {
      // Profiles saved by the original editor keep all three paragraphs.
      const value = key === 'bio' && source.bio === undefined
        ? ['intro', 'focus', 'collaborations'].map(field => typeof source[field] === 'string' ? source[field].trim() : '').filter(Boolean).join('\n\n')
        : source[key];
      if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw fail(400, `${locale.toUpperCase()}: ${label} must contain 1–${maxLength} characters.`);
      clean[locale][key] = value.trim();
    }
  }
  return clean;
}

export async function handleAbout({action, body, call}) {
  const rows = await call('/rest/v1/site_content?id=eq.1&select=about,about_version');
  const current = rows?.[0];
  if (!current || !Number.isSafeInteger(current.about_version)) throw fail(503, 'Profile storage is not ready. Apply the site about migration.');
  if (action === 'site-about-list') return {about: validateAbout(current.about ?? defaultAbout), version: current.about_version};
  if (!Number.isSafeInteger(body.version) || body.version !== current.about_version) throw conflict();
  const about = validateAbout(body.about);
  const saved = await call(`/rest/v1/site_content?id=eq.1&about_version=eq.${body.version}&select=about,about_version`, {
    method: 'PATCH', headers: {Prefer: 'return=representation'},
    body: {about, about_version: current.about_version + 1, updated_at: new Date().toISOString()}
  });
  if (!saved?.[0]) throw conflict();
  return {about: saved[0].about, version: saved[0].about_version};
}
