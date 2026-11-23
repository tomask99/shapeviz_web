import {defaultPortfolio} from './portfolio-default.js';
import {signGalleryImage} from './gallery.js';
import {
  portfolioBlockTypes, portfolioFieldLimit, portfolioImageFields, portfolioLanguages,
  portfolioLayouts, portfolioLimits, portfolioLink, portfolioSettings,
} from '../../public/site/portfolio-fields.js';

export const portfolioActions = ['site-portfolio-list', 'site-portfolio-save', 'site-portfolio-upload'];
const bucket = 'site-portfolio';
const selection = 'portfolio,portfolio_version';
const rowPath = '/rest/v1/site_content?id=eq.1';
const fail = (status, message) => Object.assign(new Error(message), {status});
const conflict = () => fail(409, 'The portfolio changed in another window. Reload the published portfolio before saving again.');
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const uploadPath = new RegExp(`^uploads/${uuid}/${uuid}/image\\.webp$`);
const originals = new Map([defaultPortfolio.logo, ...defaultPortfolio.blocks.flatMap(block => block.images)].map(image => {
  const {copy, ...media} = image;
  return [media.src, media];
}));

function validateCopy(values, fields) {
  if (values != null && !isRecord(values)) throw fail(400, 'Invalid portfolio text.');
  return Object.fromEntries(portfolioLanguages.map(locale => {
    const copy = values?.[locale];
    if (copy != null && !isRecord(copy)) throw fail(400, 'Invalid portfolio translation.');
    const entries = fields.flatMap(([key, label, mode]) => {
      const value = copy?.[key] ?? '';
      if (typeof value !== 'string' || value.length > portfolioFieldLimit(mode)) {
        throw fail(400, `${label} is too long or invalid (${locale.toUpperCase()}).`);
      }
      const trimmed = value.trim();
      if (mode === 'url' && trimmed && !portfolioLink(trimmed)) {
        throw fail(400, `Use a valid web, relative or email address for ${label.toLowerCase()} (${locale.toUpperCase()}).`);
      }
      return trimmed ? [[key, trimmed]] : [];
    });
    return [locale, Object.fromEntries(entries)];
  }));
}

function validateImage(image, env, fields = portfolioImageFields) {
  if (!isRecord(image)) throw fail(400, 'Invalid portfolio image.');
  let media = originals.get(image.src);
  if (!media) {
    const prefix = env.SUPABASE_URL && `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/`;
    if (!prefix || typeof image.src !== 'string' || !image.src.startsWith(prefix) || !uploadPath.test(image.src.slice(prefix.length))) {
      throw fail(400, 'Upload images using the portfolio editor.');
    }
    const {width, height, src} = image;
    if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 2400)) {
      throw fail(400, 'Invalid portfolio image dimensions.');
    }
    const smallWidth = Math.max(1, Math.round(width * Math.min(1, 800 / Math.max(width, height))));
    media = {src, small: src.replace(/image\.webp$/, 'thumb.webp'), width, height, smallWidth};
  }
  return {...media, copy: validateCopy(image.copy, fields)};
}

export function validatePortfolio(content, env = {}) {
  if (!isRecord(content) || !Array.isArray(content.blocks) || content.blocks.length > portfolioLimits.blocks) {
    throw fail(400, `Use up to ${portfolioLimits.blocks} portfolio blocks.`);
  }
  const ids = new Set(['main', 'service-lightbox-caption']);
  let totalImages = 0;
  const blocks = content.blocks.map(block => {
    if (!isRecord(block) || typeof block.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(block.id) || ids.has(block.id)) {
      throw fail(400, 'Each portfolio block needs a unique ID.');
    }
    if (typeof block.type !== 'string' || !Object.hasOwn(portfolioBlockTypes, block.type)) throw fail(400, 'Invalid portfolio block type.');
    ids.add(block.id);
    const spec = portfolioBlockTypes[block.type];
    const images = block.images ?? [];
    const limit = spec.singleImage ? 1 : spec.images ? portfolioLimits.imagesPerBlock : 0;
    if (!Array.isArray(images) || images.length > limit) throw fail(400, `This block supports up to ${limit} images.`);
    totalImages += images.length;
    if (totalImages > portfolioLimits.images) throw fail(400, `Use up to ${portfolioLimits.images} portfolio images.`);
    if (spec.layouts && (typeof block.layout !== 'string' || !Object.hasOwn(portfolioLayouts, block.layout))) throw fail(400, 'Invalid image grid layout.');
    return {
      id: block.id, type: block.type, copy: validateCopy(block.copy, spec.fields),
      images: images.map(image => validateImage(image, env)),
      ...(spec.layouts ? {layout: block.layout} : {}),
    };
  });
  return {
    copy: validateCopy(content.copy, portfolioSettings),
    logo: content.logo == null ? null : validateImage(content.logo, env, []),
    blocks,
  };
}

export async function handlePortfolio({action, body, call, env, user}) {
  if (action === 'site-portfolio-upload') {
    return signGalleryImage({uploadId: body?.uploadId, bucket, call, env, user});
  }
  if (action === 'site-portfolio-list') {
    const [current] = await call(`${rowPath}&select=${selection}`);
    if (!current?.portfolio_version) throw fail(503, 'Portfolio storage is not ready.');
    return {content: current.portfolio ?? defaultPortfolio, version: current.portfolio_version};
  }
  if (!Number.isSafeInteger(body?.version) || body.version < 1 || body.version >= 2147483647) throw conflict();
  const portfolio = validatePortfolio(body.content, env);
  const [saved] = await call(`${rowPath}&portfolio_version=eq.${body.version}&select=${selection}`, {
    method: 'PATCH',
    headers: {Prefer: 'return=representation'},
    body: {portfolio, portfolio_version: body.version + 1, updated_at: new Date().toISOString()},
  });
  if (!saved) throw conflict();
  return {content: saved.portfolio, version: saved.portfolio_version};
}

export async function loadPortfolio({env, send}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return defaultPortfolio;
  try {
    const response = await send(`${env.SUPABASE_URL.replace(/\/$/, '')}${rowPath}&select=portfolio`, {
      headers: {apikey: env.SUPABASE_SECRET_KEY},
      signal: AbortSignal.timeout(3500),
    });
    if (response.ok) {
      const [row] = await response.json();
      if (row?.portfolio != null) return validatePortfolio(row.portfolio, env);
    }
  } catch {
    // Serve the built-in portfolio if the database or its migration is unavailable.
  }
  return defaultPortfolio;
}
