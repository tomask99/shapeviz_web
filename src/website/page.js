import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parse, parseFragment, serialize} from 'parse5';
import {translate} from '../../public/i18n/messages.js';
import {preferredLanguage, supportedLanguages} from './language.js';
import {seoMarkup} from './seo.js';
import {services as serviceDefinitions, servicePath, findService} from './services.js';
import {renderServicePage} from './service-page.js';
import {renderPortfolioPage} from './portfolio.js';
import {loadPublicContent, renderCompanies} from './content.js';
import {renderGallery} from './gallery.js';
import {loadShopCatalog} from '../shop/handler.js';
import {createProductPreviews} from '../shop/previews.js';
import {renderCatalogFallback} from '../shop/pages.js';
import {legalRoute, legalPaths, renderLegalPage, withLegalFooter} from './legal.js';

export function renderPublicPage(source, locale, {shop = false, explicit = false, interest = null, companies = null, gallery = null, about = null} = {}) {
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
        if (node.attrs.some(a => a.name === 'data-privacy-notice')) attr.value = legalPaths[locale].legal+'#privacy';
        if (attr.value === '/shop') attr.value = prefix + '/shop';
        if (attr.value === '/articles' && locale === 'sk') attr.value = '/articles?lang=sk';
        const serviceId = node.attrs.find(a => a.name === 'data-service-link')?.value;
        if (serviceId) attr.value = servicePath(serviceDefinitions.find(service=>service.id===serviceId), locale);
      }
    }
    const aboutField = node.attrs?.find(attr => attr.name === 'data-about')?.value;
    if (!shop && aboutField && typeof about?.[locale]?.[aboutField] === 'string') {
      // Saved copy is plain text, not markup, and is already in the selected language.
      const value = about[locale][aboutField];
      if (aboutField === 'bio') {
        node.childNodes = value.split(/\r?\n\s*\r?\n/).map(text => text.trim()).filter(Boolean).map(text => {
          const paragraph = {nodeName: 'p', tagName: 'p', attrs: [], namespaceURI: 'http://www.w3.org/1999/xhtml', childNodes: [], parentNode: node};
          paragraph.childNodes = [{nodeName: '#text', value: text, parentNode: paragraph}];
          return paragraph;
        });
      }
      else if (node.tagName === 'img') node.attrs.find(attr => attr.name === 'alt').value = value;
      else node.childNodes = [{nodeName: '#text', value, parentNode: node}];
      return;
    }
    for (const child of node.childNodes || []) walk(child);
    if (node.content) walk(node.content);
  }
  walk(document);
  if (!shop && gallery !== null) {
    function replaceGallery(node) {
      const classes = node.attrs?.find(attr => attr.name === 'class')?.value.split(/\s+/) || [];
      let markup;
      if (classes.includes('gallery-grid')) markup = renderGallery(gallery, locale);
      if (classes.includes('gallery-count')) {
        const images = gallery.filter(item => item.type === 'image').length;
        const films = gallery.length - images;
        markup = `${String(images).padStart(2, '0')} ${locale === 'sk' ? 'OBRAZOV' : 'IMAGES'} / ${String(films).padStart(2, '0')} ${locale === 'sk' ? 'FILMOV' : 'FILMS'}`;
      }
      if (classes.includes('gallery-edition')) markup = `${translate('SELECTED WORKS', locale)} <span class="accent">/</span> ${gallery.length ? '01 &mdash; ' : ''}${String(gallery.length).padStart(2, '0')}`;
      if (markup !== undefined) {
        node.childNodes = parseFragment(markup).childNodes;
        for (const child of node.childNodes) child.parentNode = node;
        return;
      }
      node.childNodes?.forEach(replaceGallery);
    }
    replaceGallery(document);
  }
  if (!shop && companies !== null) {
    function replaceCompanies(node) {
      if (node.attrs?.some(attr => attr.name === 'class' && attr.value.split(/\s+/).includes('client-list'))) {
        node.childNodes = parseFragment(renderCompanies(companies, locale)).childNodes;
        for (const child of node.childNodes) child.parentNode = node;
        return;
      }
      node.childNodes?.forEach(replaceCompanies);
    }
    replaceCompanies(document);
  }
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
  return withLegalFooter(serialize(document), locale);
}

export function createPublicPageHandler({publicDir = path.resolve('public'), env = process.env, send = fetch} = {}) {
  const previews=createProductPreviews({send});
  return async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {res.writeHead(405, {Allow: 'GET, HEAD'}).end(); return;}
    const url = new URL(req.url, 'http://localhost');
    const legal = legalRoute(url.pathname) || (url.searchParams.get('route')==='page' && legalPaths[url.searchParams.get('locale')]?.[url.searchParams.get('legal')] ? {locale:url.searchParams.get('locale'),page:url.searchParams.get('legal')} : null);
    if (legal) {
      if (legal.page==='privacy') {res.writeHead(308,{Location:legalPaths[legal.locale].legal}).end();return;}
      const body = renderLegalPage(legal.locale, legal.page);
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Content-Language':legal.locale,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"}).end(req.method==='HEAD'?undefined:body);
      return;
    }
    const route = /^\/(sk|en)(\/shop)?\/?$/.exec(url.pathname);
    const serviceRoute = /^\/(sk|en)\/(sluzby|services)\/([a-z0-9-]+)\/?$/.exec(url.pathname);
    const isApi = url.pathname === '/api/site-events' && url.searchParams.get('route') === 'page';
    const portfolio = /^\/portfolio\/?$/.test(url.pathname) || (isApi && url.searchParams.get('page') === 'portfolio');
    const explicit = route?.[1] || serviceRoute?.[1] || (isApi && supportedLanguages.includes(url.searchParams.get('locale')) ? url.searchParams.get('locale') : null);
    const shop = !!route?.[2] || /^\/shop(?:\/|\/index.html)?$/.test(url.pathname) || (isApi && url.searchParams.get('page') === 'shop');
    const locale = portfolio ? (url.searchParams.get('lang') === 'en' ? 'en' : 'sk') : explicit || preferredLanguage(req.headers, env);
    const serviceSlug = serviceRoute?.[3] || (isApi ? url.searchParams.get('service') : null);
    const service = serviceSlug ? findService(locale, serviceSlug) : null;
    if ((serviceSlug && !service) || (serviceRoute && serviceRoute[2] !== (locale==='sk'?'sluzby':'services'))) {
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8','X-Robots-Tag':'noindex','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:'Not found');return;
    }
    try {
      const content = portfolio || service || shop ? null : await loadPublicContent({env, send});
      const catalog=shop&&url.searchParams.get('preview')!=='1'?await previews(await loadShopCatalog({env,send})):null;
      let body = portfolio ? renderPortfolioPage(locale) : service ? renderServicePage(service, locale) : renderPublicPage(await readFile(path.join(publicDir, shop ? 'shop/index.html' : 'index.html'), 'utf8'), locale, {shop, explicit: !!explicit, interest: url.searchParams.get('interest'), ...content});
      if(catalog?.launched){
        body=body.replace(/<section id="shop-catalog"[^>]*><\/section>/,()=>`<section id="shop-catalog" aria-label="Shop products">${renderCatalogFallback(catalog)}</section>`)
          .replace('id="shop-coming"','hidden id="shop-coming"')
          .replace(/<span class="shop-nav" data-shop-nav[^>]*>[\s\S]*?<\/span>/,`<a class="shop-nav" data-shop-nav href="/${locale}/shop">Shop</a>`)
          .replace(/(<span[^>]*id="shop-state-label"[^>]*>)[^<]*/,`$1${translate('MADE FOR CREATORS',locale)}`)
          .replace(/(id="shop-checkout-note"[^>]*?) hidden=""/,'$1')
          .replace(/<noscript>[\s\S]*?<\/noscript>/,'')
          .replace('</body>',()=>`<script id="shop-initial-data" type="application/json">${JSON.stringify(catalog).replace(/</g,'\\u003c')}</script></body>`);
        if(env.VERCEL_ENV!=='preview')body=body.replace('content="noindex,nofollow"','content="index,follow,max-image-preview:large"');
      }
      const headers = {'Content-Type': 'text/html; charset=utf-8', 'Content-Language': locale, 'Cache-Control': 'private, no-store', Vary: 'Cookie, Accept-Language, X-Vercel-IP-Country', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin'};
      if (explicit) headers['Set-Cookie'] = `sv_language=${locale}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${env.VERCEL === '1' ? '; Secure' : ''}`;
      if (portfolio || (shop&&!catalog?.launched) || env.VERCEL_ENV === 'preview') headers['X-Robots-Tag'] = 'noindex, nofollow';
      headers['Content-Security-Policy'] = shop
        ? "default-src 'self'; script-src 'self' https://gumroad.com https://assets.gumroad.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://public-files.gumroad.com https://assets.gumroad.com; media-src 'self'; connect-src 'self'; frame-src https://gumroad.com https://*.gumroad.com; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
      if (!shop && env.SUPABASE_URL) headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace("img-src 'self' data:;", "img-src 'self' data: " + new URL(env.SUPABASE_URL).origin + ";");
      res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : body);
    } catch {res.writeHead(500, {'Cache-Control': 'no-store'}).end('Page unavailable');}
  };
}
