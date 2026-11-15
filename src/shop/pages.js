import {loadShopCatalog} from './handler.js';
import {createProductPreviews} from './previews.js';
import {SITE_ORIGIN} from '../website/seo.js';
import {productPagePath} from '../../public/shop/seo-fields.js';
import {svgIcon} from '../../public/ui/icons.js';
import {renderProductGallery} from './gallery.js';
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const paragraphs=value=>String(value||'').split(/\n\s*\n/).filter(Boolean).map(p=>`<p>${escapeHtml(p).replace(/\n/g,'<br>')}</p>`).join('');

export function renderCatalogFallback(catalog) {
  return `<div class="shop-products">${catalog.products.map(p=>`<article class="shop-product"><a class="shop-product-card" href="${escapeHtml(productPagePath(p)||p.url)}"><span class="shop-product-cover">${p.seo?.image||p.preview?.image?`<img src="${escapeHtml(p.seo?.image||p.preview.image)}" alt="${escapeHtml(p.seo?.imageAlt||'')}" loading="lazy">`:''}</span><span class="shop-product-title">${escapeHtml(p.seo?.heading||p.preview?.title||p.url.split('/').at(-1))}</span></a></article>`).join('')}</div>`;
}

export function renderProductPage(product,catalog,{noindex=false}={}) {
  const s=product.seo,canonical=SITE_ORIGIN+productPagePath(product),image=s.image||product.preview?.image;
  const offer=product.preview?.offer;
  const price=offer?new Intl.NumberFormat('en',{style:'currency',currency:offer.currency}).format(offer.price):null;
  const structured={'@context':'https://schema.org','@graph':[
    {'@type':'Product','@id':canonical+'#product',name:s.heading,description:s.description,url:canonical,...(image?{image:[image]}:{}),...(offer?{offers:{'@type':'Offer',url:product.url,price:offer.price,priceCurrency:offer.currency}}:{})},
    {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Shop',item:SITE_ORIGIN+'/en/shop'},{'@type':'ListItem',position:2,name:s.heading,item:canonical}]}
  ]};
  const related=catalog.products.filter(p=>p.id!==product.id&&productPagePath(p));
  const gallery=s.gallery||[];
  const images=[...new Set([image,...gallery.map(item=>item.full)].filter(Boolean))];
  if(images.length)structured['@graph'][0].image=images;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(s.title)}</title><meta name="description" content="${escapeHtml(s.description)}"><meta name="robots" content="${noindex?'noindex,nofollow':'index,follow,max-image-preview:large'}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="product"><meta property="og:site_name" content="Shapeviz"><meta property="og:locale" content="en_US"><meta property="og:url" content="${canonical}"><meta property="og:title" content="${escapeHtml(s.title)}"><meta property="og:description" content="${escapeHtml(s.description)}"><meta name="twitter:card" content="summary_large_image">${image?`<meta property="og:image" content="${escapeHtml(image)}"><meta property="og:image:alt" content="${escapeHtml(s.imageAlt||s.heading)}">`:''}<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/shop/product.css"><script type="application/ld+json">${json(structured)}</script></head>
    <body class="product-page"><a class="skip-link" href="#product">Skip to content</a><header class="product-header section-shell"><a href="/en" aria-label="Shapeviz home"><img src="/media/shapeviz-logo.webp" alt="Shapeviz" width="180" height="38"></a><nav aria-label="Main navigation"><a href="/en/shop">All products</a><a href="/en#contact">Contact</a></nav></header>
    <main id="product" class="section-shell"><nav class="product-breadcrumb" aria-label="Breadcrumb"><a href="/en/shop">Shop</a><span>/</span><span>${escapeHtml(catalog.categories.find(c=>c.id===product.categoryId)?.name||'Products')}</span></nav>
    <section class="product-hero"><div><p class="micro accent">SHAPEVIZ / CREATOR TOOLS</p><h1>${escapeHtml(s.heading)}</h1><p class="product-summary">${escapeHtml(s.description)}</p>${price?`<p class="product-price">${offer.minimum?'From ':''}${escapeHtml(price)} <small>on Gumroad</small></p>`:''}<a class="product-buy" href="${escapeHtml(product.url)}" rel="noopener">Get it on Gumroad ${svgIcon('arrowUpRight')}</a><p class="product-note">Secure checkout and downloads on Gumroad. Final price and taxes are shown at checkout.</p></div>${image?`<img class="product-cover" src="${escapeHtml(image)}" alt="${escapeHtml(s.imageAlt||s.heading)}" fetchpriority="high" decoding="async">`:''}</section>
    ${renderProductGallery(gallery)}${gallery.length?'<script type="module" src="/shop/product-gallery.js"></script>':''}
    <div class="product-content"><section aria-labelledby="about-product"><p class="micro accent">THE WORKFLOW</p><h2 id="about-product">About ${escapeHtml(s.heading)}</h2>${paragraphs(s.body)}</section>
    ${s.features?`<section><h2>Key features</h2><ul class="product-features">${s.features.split('\n').filter(line=>line.trim()).map(line=>`<li>${escapeHtml(line)}</li>`).join('')}</ul></section>`:''}
    ${s.compatibility?`<section><h2>Compatibility &amp; requirements</h2>${paragraphs(s.compatibility)}</section>`:''}
    ${s.faqs?.length?`<section><h2>Frequently asked questions</h2>${s.faqs.map(f=>`<details class="product-faq"><summary>${escapeHtml(f.question)}</summary>${paragraphs(f.answer)}</details>`).join('')}</section>`:''}</div>
    <section class="product-bottom"><h2>Ready to create?</h2><a class="product-buy" href="${escapeHtml(product.url)}">Get it on Gumroad ${svgIcon('arrowUpRight')}</a></section>
    ${related.length?`<section class="product-related"><h2>More from Shapeviz</h2>${related.map(p=>`<a href="${productPagePath(p)}">${escapeHtml(p.seo.heading)} ${svgIcon('arrowUpRight')}</a>`).join('')}</section>`:''}</main><footer class="section-shell product-footer"><a href="/en/shop">Explore all products</a><span>© ${new Date().getFullYear()} Shapeviz</span></footer></body></html>`;
}

export function createProductPageHandler({env=process.env,send=fetch}={}) {
  const previews=createProductPreviews({send});
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    const url=new URL(req.url,'http://localhost'), sitemap=url.pathname==='/sitemap-products.xml'||url.searchParams.get('route')==='shop-sitemap';
    const slug=url.pathname.startsWith('/shop/')?url.pathname.slice(6).replace(/\/$/,''):url.searchParams.get('product');
    try{
      const catalog=await loadShopCatalog({env,send});
      if(sitemap){
        const paths=catalog.launched?['/en/shop','/sk/shop',...catalog.products.map(productPagePath).filter(Boolean)]:[];
        res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'}).end(req.method==='HEAD'?undefined:`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p=>`<url><loc>${SITE_ORIGIN}${escapeHtml(p)}</loc></url>`).join('')}</urlset>`);return;
      }
      const product=catalog.products?.find(p=>p.seo?.enabled&&p.seo.slug===slug);
      if(!product){res.writeHead(404,{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex'}).end(req.method==='HEAD'?undefined:'<!doctype html><html lang="en"><title>Product unavailable | Shapeviz</title><h1>Product unavailable</h1><a href="/en/shop">Back to shop</a></html>');return;}
      if(url.pathname.endsWith('/')){res.writeHead(308,{Location:productPagePath(product)+url.search}).end();return;}
      const decorated=await previews({products:[product]});
      const noindex=env.VERCEL_ENV==='preview';
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Language':'en','X-Robots-Tag':noindex?'noindex, nofollow':'index, follow, max-image-preview:large','Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://public-files.gumroad.com https://assets.gumroad.com ${env.SUPABASE_URL ? new URL(env.SUPABASE_URL).origin : ''}; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`}).end(req.method==='HEAD'?undefined:renderProductPage(decorated.products[0],catalog,{noindex}));
    }catch{res.writeHead(503,{'X-Robots-Tag':'noindex','Retry-After':'60'}).end(req.method==='HEAD'?undefined:'Product unavailable. Please try again.');}
  };
}
