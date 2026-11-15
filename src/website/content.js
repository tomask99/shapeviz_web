import {companyProjectUrl} from '../../public/site/company-url.js';
import {svgIcon} from '../../public/ui/icons.js';

const fail = (status, message) => Object.assign(new Error(message), {status});
const conflict = () => fail(409, 'The company list changed in another window. Reload the saved list before saving again.');
const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export function validateCompanies(companies) {
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
    return {id: company.id, name: company.name.trim(), url};
  });
}

export async function handleSiteContent({action, body, call}) {
  const rows = await call('/rest/v1/site_content?id=eq.1&select=companies,version');
  const current = rows?.[0];
  if (!current) throw fail(503, 'Site editing storage is not ready. Apply the site content migration.');
  if (action === 'site-content-list') return current;
  if (!Number.isSafeInteger(body.version) || body.version !== current.version) throw conflict();
  const companies = validateCompanies(body.companies);
  const saved = await call(`/rest/v1/site_content?id=eq.1&version=eq.${body.version}&select=companies,version`, {
    method: 'PATCH',
    headers: {Prefer: 'return=representation'},
    body: {companies, version: current.version + 1, updated_at: new Date().toISOString()}
  });
  if (!saved?.[0]) throw conflict();
  return saved[0];
}

export async function loadPublicCompanies({env, send}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return null;
  try {
    const response = await send(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/site_content?id=eq.1&select=companies`, {
      headers: {apikey: env.SUPABASE_SECRET_KEY},
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    const rows = await response.json();
    return rows?.[0] ? validateCompanies(rows[0].companies) : null;
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
    return `<li data-dissolve><span class="client-number micro">${String(index + 1).padStart(2, '0')}</span><span class="client-name">${escape(company.name)}</span>${mark}</li>`;
  }).join('');
}
