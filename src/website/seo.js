// The public apex redirects to www. Never derive canonical URLs from a request
// Host header, localhost, or a Vercel preview hostname.
import {services as allServices, servicePath} from './services.js';
export const SITE_ORIGIN = 'https://www.shapeviz.com';
const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function seoMarkup({locale, shop, title, description, services = [], service}) {
  const suffix = shop ? '/shop' : '';
  const pagePath = lang => service ? servicePath(service, lang) : `/${lang}${suffix}`;
  const canonical = SITE_ORIGIN + pagePath(locale);
  const image = SITE_ORIGIN + (service?.image.src || '/media/milenium-interior-1440.webp');
  const width = service?.image.width || 1440, height = service?.image.height || 960;
  const imageAlt = service ? service[locale].imageAlt : locale === 'sk' ? 'Vizualizácia interiéru s nábytkom Milenium od Shapeviz' : 'Milenium furniture interior visualization by Shapeviz';
  const metadata = `<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="sk" href="${SITE_ORIGIN}${pagePath('sk')}">
<link rel="alternate" hreflang="en" href="${SITE_ORIGIN}${pagePath('en')}">
<link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${service ? pagePath('en') : suffix || '/'}">
<meta property="og:locale" content="${locale === 'sk' ? 'sk_SK' : 'en_US'}">
<meta property="og:locale:alternate" content="${locale === 'sk' ? 'en_US' : 'sk_SK'}">
<meta property="og:site_name" content="SHAPEVIZ"><meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}"><meta property="og:image:width" content="${width}"><meta property="og:image:height" content="${height}">
<meta property="og:image:alt" content="${escape(imageAlt)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="${escape(imageAlt)}">
${shop ? '' : '<meta name="robots" content="index, follow, max-image-preview:large">'}`;
  if (shop) return metadata;
  const organization = `${SITE_ORIGIN}/#organization`, website = `${SITE_ORIGIN}/#website`, catalog = `${canonical}#services`;
  const data = {'@context': 'https://schema.org', '@graph': [
    {'@type':'Organization','@id':organization,name:'Shapeviz',url:SITE_ORIGIN+'/',logo:`${SITE_ORIGIN}/media/shapeviz-logo.webp`,...(service ? {} : {hasOfferCatalog:{'@id':catalog}})},
    {'@type':'WebSite','@id':website,name:'Shapeviz',url:SITE_ORIGIN+'/',inLanguage:['sk','en'],publisher:{'@id':organization}},
    {'@type':'WebPage','@id':`${canonical}#webpage`,url:canonical,name:title,description,inLanguage:locale,isPartOf:{'@id':website},about:{'@id':organization},mainEntity:{'@id':service ? `${canonical}#service` : catalog},primaryImageOfPage:{'@type':'ImageObject',url:image,width,height},...(service ? {breadcrumb:{'@id':`${canonical}#breadcrumb`}} : {})},
    ...(service ? [
      {'@type':'Service','@id':`${canonical}#service`,name:service[locale].name,serviceType:service[locale].name,description:service[locale].intro,url:canonical,image,provider:{'@id':organization}},
      {'@type':'BreadcrumbList','@id':`${canonical}#breadcrumb`,itemListElement:[
        {'@type':'ListItem',position:1,name:'Shapeviz',item:`${SITE_ORIGIN}/${locale}`},
        {'@type':'ListItem',position:2,name:service[locale].name,item:canonical},
      ]},
    ] : [
      {'@type':'OfferCatalog','@id':catalog,name:locale==='sk'?'3D modelovanie, vizualizácie a tvorba videí':'3D modeling, visualization and video production',itemListElement:services.map(item=>({
        '@type':'Offer',itemOffered:{'@type':'Service','@id':`${SITE_ORIGIN}${servicePath(allServices.find(s=>s.id===item.id),locale)}#service`,name:item.name,serviceType:item.name,description:item.description,url:`${SITE_ORIGIN}${servicePath(allServices.find(s=>s.id===item.id),locale)}`,provider:{'@id':organization}}
      }))},
    ]),
  ]};
  return metadata + `<script type="application/ld+json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script>`;
}

export function sitemapXml() {
  const pages = [{sk:'/sk',en:'/en',default:'/',image:'/media/milenium-interior-1440.webp'}, ...allServices.map(service=>({sk:servicePath(service,'sk'),en:servicePath(service,'en'),default:servicePath(service,'en'),image:service.image.src}))];
  const entries = pages.flatMap(page => ['sk','en'].map(locale => {
    const alternatives = ['sk','en','x-default'].map(lang=>`<xhtml:link rel="alternate" hreflang="${lang}" href="${SITE_ORIGIN}${page[lang==='x-default'?'default':lang]}"/>`).join('');
    return `  <url><loc>${SITE_ORIGIN}${page[locale]}</loc>${alternatives}<image:image><image:loc>${SITE_ORIGIN}${page.image}</image:loc></image:image></url>`;
  }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n<url><loc>${SITE_ORIGIN}/articles</loc></url>\n${entries.join('\n')}\n</urlset>\n`;
}

export function robotsText() {
  // Keep noindex pages crawlable so crawlers can read their existing directives.
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /oauth/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\nSitemap: ${SITE_ORIGIN}/sitemap-products.xml\nSitemap: ${SITE_ORIGIN}/sitemap-articles.xml\n`;
}
