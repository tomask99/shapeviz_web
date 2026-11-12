import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parse, parseFragment, serialize} from 'parse5';
import {translate} from '../../public/i18n/messages.js';
import {preferredLanguage, supportedLanguages} from './language.js';
import {seoMarkup} from './seo.js';
import {services as serviceDefinitions, servicePath, findService} from './services.js';
import {renderServicePage} from './service-page.js';

export function renderPublicPage(source, locale, {shop = false, explicit = false, interest = null} = {}) {
  const document = parse(source, {scriptingEnabled: false});
  const suffix = shop ? '/shop' : '';
  const prefix = explicit || locale === 'sk' ? '/' + locale : '';
  function walk(node) {
    if (['script', 'style'].includes(node.tagName)) return;
    if (interest && node.tagName === 'input' && node.attrs.some(attr => attr.name === 'data-service-id' && attr.value === interest)) {
      node.attrs.push({name: 'checked', value: ''});
    }
    if (node.nodeName === '#text' && node.value.trim()) {
      node.value = node.value.replace(/\S[\s\S]*\S|\S/, text => translate(text, locale));
    }
    for (const attr of node.attrs || []) {
      if (['alt', 'aria-label', 'placeholder', 'title'].includes(attr.name) ||
        (node.tagName === 'meta' && attr.name === 'content' && node.attrs.some(a => ['description', 'og:title', 'og:description'].includes(a.value)))) attr.value = translate(attr.value, locale);
      if (node.tagName === 'html' && attr.name === 'lang') attr.value = locale;
      if (attr.name === 'href' && !node.attrs.some(a => a.name === 'data-language')) {
        if (attr.value === '/' || attr.value.startsWith('/#')) attr.value = prefix + (attr.value === '/' ? '' : attr.value.slice(1)) || '/';
        if (attr.value === '/shop') attr.value = prefix + '/shop';
        const serviceId = node.attrs.find(a => a.name === 'data-service-link')?.value;
        if (serviceId) attr.value = servicePath(serviceDefinitions.find(service=>service.id===serviceId), locale);
      }
    }
    for (const child of node.childNodes || []) walk(child);
    if (node.content) walk(node.content);
  }
  walk(document);
  const html = document.childNodes.find(n => n.tagName === 'html');
  const head = html.childNodes.find(n => n.tagName === 'head');
  const text = node => node?.nodeName === '#text' ? node.value : (node?.childNodes || []).map(text).join('');
  const title = text(head.childNodes.find(node => node.tagName === 'title'));
  const description = head.childNodes.find(node => node.tagName === 'meta' && node.attrs.some(a => a.name === 'name' && a.value === 'description'))?.attrs.find(a => a.name === 'content')?.value || '';
  const services = [];
  function collectServices(node) {
    if (node.attrs?.some(a => a.name === 'data-seo-service')) services.push({
      id:node.attrs.find(a => a.name === 'id').value,
      name:text(node.childNodes.find(n => n.tagName === 'a')),
    });
    node.childNodes?.forEach(collectServices);
  }
  collectServices(document);
  const metadata = parseFragment(seoMarkup({locale, shop, title, description, services}));
  for (const child of metadata.childNodes) {child.parentNode = head; head.childNodes.push(child);}
  function markSwitch(node) {
    const language = node.attrs?.find(a => a.name === 'data-language')?.value;
    if (language) {
      node.attrs.find(a => a.name === 'href').value = '/' + language + suffix;
      if (language === locale) node.attrs.push({name: 'aria-current', value: 'true'});
    }
    node.childNodes?.forEach(markSwitch);
  }
  markSwitch(document);
  return serialize(document);
}

export function createPublicPageHandler({publicDir = path.resolve('public'), env = process.env} = {}) {
  return async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {res.writeHead(405, {Allow: 'GET, HEAD'}).end(); return;}
    const url = new URL(req.url, 'http://localhost');
    const route = /^\/(sk|en)(\/shop)?\/?$/.exec(url.pathname);
    const serviceRoute = /^\/(sk|en)\/(sluzby|services)\/([a-z0-9-]+)\/?$/.exec(url.pathname);
    const isApi = url.pathname === '/api/site-events' && url.searchParams.get('route') === 'page';
    const explicit = route?.[1] || serviceRoute?.[1] || (isApi && supportedLanguages.includes(url.searchParams.get('locale')) ? url.searchParams.get('locale') : null);
    const shop = !!route?.[2] || /^\/shop(?:\/|\/index.html)?$/.test(url.pathname) || (isApi && url.searchParams.get('page') === 'shop');
    const locale = explicit || preferredLanguage(req.headers, env);
    const serviceSlug = serviceRoute?.[3] || (isApi ? url.searchParams.get('service') : null);
    const service = serviceSlug ? findService(locale, serviceSlug) : null;
    if ((serviceSlug && !service) || (serviceRoute && serviceRoute[2] !== (locale==='sk'?'sluzby':'services'))) {
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8','X-Robots-Tag':'noindex','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:'Not found');return;
    }
    try {
      const body = service ? renderServicePage(service, locale) : renderPublicPage(await readFile(path.join(publicDir, shop ? 'shop/index.html' : 'index.html'), 'utf8'), locale, {shop, explicit: !!explicit, interest: url.searchParams.get('interest')});
      const headers = {'Content-Type': 'text/html; charset=utf-8', 'Content-Language': locale, 'Cache-Control': 'private, no-store', Vary: 'Cookie, Accept-Language, X-Vercel-IP-Country', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin'};
      if (explicit) headers['Set-Cookie'] = `sv_language=${locale}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${env.VERCEL === '1' ? '; Secure' : ''}`;
      if (shop || env.VERCEL_ENV === 'preview') headers['X-Robots-Tag'] = 'noindex, nofollow';
      headers['Content-Security-Policy'] = shop
        ? "default-src 'self'; script-src 'self' https://gumroad.com https://assets.gumroad.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://public-files.gumroad.com https://assets.gumroad.com; media-src 'self'; connect-src 'self'; frame-src https://gumroad.com https://*.gumroad.com; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
      res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : body);
    } catch {res.writeHead(500, {'Cache-Control': 'no-store'}).end('Page unavailable');}
  };
}
