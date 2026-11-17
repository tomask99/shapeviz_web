import {companyProjectUrl} from '../../public/site/company-url.js';
import {svgIcon} from '../../public/ui/icons.js';
import {defaultGallery, validateGallery} from './gallery.js';
import {validateAbout} from './about.js';
import {companyDetails} from '../../public/site/company-descriptions.js';

const fail = (status, message) => Object.assign(new Error(message), {status});
const conflict = () => fail(409, 'The company list changed in another window. Reload the saved list before saving again.');
const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

const previewNames = ['PRADA', 'PUCCI', 'MAZDA', 'MILENIUM', 'MCM', 'BERO', 'BRAVE MMA', 'TATRABANKA', 'TOLICCI', 'LOUIS VUITTON'];
const previewImages = defaultGallery.filter(item => item.type === 'image');
export function companyPreview(company) {
  if (company.image !== undefined) return company.image;
  const index = previewNames.indexOf(company.name.trim().toUpperCase());
  return index < 0 ? null : previewImages[index % previewImages.length];
}

export function validateCompanies(companies, env = {}) {
  if (!Array.isArray(companies) || companies.length > 100) {
    throw fail(400, 'Use a list of at most 100 companies.');
  }
  const ids = new Set();
  return companies.map(company => {
    if (!company || typeof company.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(company.id) || ids.has(company.id)) {
      throw fail(400, 'Each company needs a unique ID. Reload the saved list and try again.');
    }
    if (typeof company.name !== 'string' || !company.name.trim() || company.name.length > 120) {
      throw fail(400, 'Enter a company name of at most 120 characters.');
    }
    let url;
    try {
      url = companyProjectUrl(company.url);
    } catch (error) {
      throw fail(400, error.message);
    }
    ids.add(company.id);
    const result = {id: company.id, name: company.name.trim(), url};
    if (company.description !== undefined) {
      if (!company.description || typeof company.description !== 'object' || Array.isArray(company.description)) throw fail(400, 'Enter a project description in Slovak and English.');
      result.description = {};
      for (const locale of ['sk', 'en']) {
        const text = company.description[locale];
        if (typeof text !== 'string' || text.length > 500) throw fail(400, 'Keep each project description within 500 characters.');
        result.description[locale] = text.trim();
      }
    }
    if (company.image !== undefined) {
      result.image = company.image === null ? null : validateGallery([company.image], env)[0];
      if (result.image && result.image.type !== 'image') throw fail(400, 'Choose a still image for the project preview.');
    }
    if (company.collaboration !== undefined) {
      result.collaboration = {};
      for (const locale of ['sk', 'en']) {
        const value = company.collaboration?.[locale];
        if (typeof value !== 'string' || value.length > 200) throw fail(400, 'Keep collaboration names within 200 characters per language.');
        result.collaboration[locale] = value.trim();
      }
    }
    if (company.contributions !== undefined) {
      result.contributions = {};
      for (const locale of ['sk', 'en']) {
        const items = company.contributions?.[locale];
        if (!Array.isArray(items) || items.length > 6 || items.some(item => typeof item !== 'string' || !item.trim() || item.length > 120)) throw fail(400, 'Use up to 6 contribution bullets of at most 120 characters each.');
        result.contributions[locale] = items.map(item => item.trim());
      }
    }
    return result;
  });
}

export async function handleSiteContent({action, body, call, env}) {
  const rows = await call('/rest/v1/site_content?id=eq.1&select=companies,version');
  const current = rows?.[0];
  if (!current) throw fail(503, 'Site editing storage is not ready. Apply the site content migration.');
  if (action === 'site-content-list') return {...current, companies:current.companies.map(company => {
    const image = companyPreview(company);
    const details = Object.fromEntries(Object.entries(companyDetails(company)).filter(([,value]) => value !== null));
    return {...company, ...(image ? {image} : {}), ...details};
  })};
  if (!Number.isSafeInteger(body.version) || body.version !== current.version) throw conflict();
  const companies = validateCompanies(body.companies, env);
  const saved = await call(`/rest/v1/site_content?id=eq.1&version=eq.${body.version}&select=companies,version`, {
    method: 'PATCH',
    headers: {Prefer: 'return=representation'},
    body: {companies, version: current.version + 1, updated_at: new Date().toISOString()}
  });
  if (!saved?.[0]) throw conflict();
  return saved[0];
}

export async function loadPublicContent({env, send}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return null;
  try {
    const response = await send(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/site_content?id=eq.1&select=companies,gallery,about`, {
      headers: {apikey: env.SUPABASE_SECRET_KEY},
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    const rows = await response.json();
    if (!rows?.[0]) return null;
    const companies = validateCompanies(rows[0].companies, env);
    let gallery = null;
    try { if (rows[0].gallery != null) gallery = validateGallery(rows[0].gallery, env); } catch { /* Keep the built-in gallery available. */ }
    let about = null;
    try { if (rows[0].about != null) about = validateAbout(rows[0].about); } catch { /* Keep the built-in profile available. */ }
    return {companies, gallery, about};
  } catch {
    // Keep the original public list available during a database outage.
    return null;
  }
}

export function renderCompanies(companies, locale) {
  return companies.map((company, index) => {
    const label = locale === 'sk'
      ? `Otvoriť projekt ${company.name} (nová karta)`
      : `Open ${company.name} project (new tab)`;
    const arrow = svgIcon('arrowUpRight', 'arrow-icon');
    const mark = company.url
      ? `<a class="client-mark" href="${escape(company.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(label)}">${arrow}</a>`
      : `<span class="client-mark" aria-hidden="true">${arrow}</span>`;
    const image = companyPreview(company);
    const details = companyDetails(company);
    const description = details.description?.[locale] || '';
    const collaboration = details.collaboration?.[locale] || '';
    const contributions = details.contributions?.[locale] || [];
    const preview = image ? `<span class="client-preview" aria-hidden="true"><img src="${escape(image.src)}" ${image.srcset ? `srcset="${escape(image.srcset)}"` : ''} sizes="(max-width: 600px) 45vw, 48vw" width="${image.width}" height="${image.height}" alt="" loading="lazy" decoding="async" style="object-position:${image.positionX}% ${image.positionY}%"></span>` : '';
    const hasDescription = Boolean(image && (description || collaboration || contributions.length));
    const bullet = '<svg class="client-bullet" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="4" cy="4" r="2"/></svg>';
    const facts = `<div class="client-facts">${collaboration ? `<div><h3 class="client-detail-label">${locale === 'sk' ? 'SPOLUPRÁCA' : 'COLLABORATION'}</h3><p>${escape(collaboration)}</p></div>` : ''}${contributions.length ? `<div><h3 class="client-detail-label">${locale === 'sk' ? 'MOJA PRÁCA' : 'MY CONTRIBUTION'}</h3><ul class="client-contributions">${contributions.map(item => `<li>${bullet}<span>${escape(item)}</span></li>`).join('')}</ul></div>` : ''}</div>`;
    const summary = description ? `<div class="client-summary"><h3 class="client-detail-label">${locale === 'sk' ? 'O PROJEKTE' : 'ABOUT THE PROJECT'}</h3><p>${escape(description)}</p></div>` : '';
    const copy = hasDescription ? `<div class="client-copy"><span class="client-name">${escape(company.name)}</span><div class="client-description"><h3 class="client-brand">${escape(company.name)}</h3><div class="client-detail-body">${facts}${summary}</div></div></div>` : `<span class="client-name">${escape(company.name)}</span>`;
    return `<li data-dissolve${hasDescription ? ' class="has-project-description"' : ''}${image && !company.url ? ' tabindex="0"' : ''}>${preview}<span class="client-number micro">${String(index + 1).padStart(2, '0')}</span>${copy}${mark}</li>`;
  }).join('');
}
