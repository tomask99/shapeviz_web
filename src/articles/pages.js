import {SITE_ORIGIN} from '../website/seo.js';
import {withLegalFooter} from '../website/legal.js';
import {svgIcon} from '../../public/ui/icons.js';
import {escapeHtml as esc,validateDocument,validateImage,renderDocument,documentText,imageHtml} from '../../public/articles/content.js';
import {articleListFields} from './store.js';
const path = article => '/articles/'+article.slug;
const absolute = src => src.startsWith('/')?SITE_ORIGIN+src:src;
const date = value => new Date(value).toLocaleDateString('en',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const json = data => JSON.stringify(data).replace(/</g,'\\u003c');
const header = `<a class="skip-link" href="#main">Skip to content</a><header class="articles-header section-shell"><a class="brand" href="/en" aria-label="Shapeviz home"><img src="/media/shapeviz-logo.webp" alt="Shapeviz" width="1515" height="314"></a><nav aria-label="Main navigation"><a href="/en">Studio</a><a href="/en/shop">Shop</a><a href="/articles" aria-current="page">Articles</a><a href="/en#contact">Let’s talk ${svgIcon('arrowUpRight')}</a></nav></header>`;
function shell({title,description,canonical,image,body,structured,noindex=false}) {
  return withLegalFooter(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000000"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${noindex?'noindex,nofollow':'index,follow,max-image-preview:large'}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="${structured?.['@graph']?.some(n=>n['@type']==='BlogPosting')?'article':'website'}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:site_name" content="Shapeviz"><meta property="og:locale" content="en_US"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}">${image?`<meta property="og:image" content="${esc(absolute(image.src))}"><meta property="og:image:alt" content="${esc(image.alt)}"><meta name="twitter:image" content="${esc(absolute(image.src))}">`:''}<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/articles/articles.css"><link rel="stylesheet" href="/cursor.css"><script type="module" src="/admin/cursor.js"></script>${structured?`<script type="application/ld+json">${json(structured)}</script>`:''}</head><body class="articles-page">${header}<main id="main" class="section-shell">${body}</main><footer class="section-shell articles-footer"><a href="/en" class="footer-brand">SHAPEVIZ</a><span>© ${new Date().getFullYear()} Shapeviz</span></footer></body></html>`,'en');
}
function card(article,index) {
  return `<article class="article-public-card${index===0?' featured':''}"><a href="${esc(path(article))}"><div class="article-public-image">${article.cover?imageHtml(article.cover,{hero:index===0,sizes:index===0?'(max-width:760px) 92vw, 55vw':'(max-width:760px) 92vw, 45vw'}):''}</div><div class="article-public-copy"><p class="micro accent">${index===0?'LATEST ARTICLE':'FROM THE STUDIO'}</p><h2>${esc(article.title)}</h2><p class="article-card-excerpt">${esc(article.excerpt)}</p><div class="article-card-foot"><time datetime="${esc(article.published_at)}">${date(article.published_at)}</time><span>Read article ${svgIcon('arrowUpRight')}</span></div></div></a></article>`;
}
export function renderArticlesIndex(items,{noindex=false}={}) {
  const title='Articles on 3D, Materials & Blender Tools | Shapeviz';
  const description='Practical guides to 3D materials, PBR textures and Blender tools. Learn the workflows behind Shapeviz assets and add-ons.';
  return shell({title,description,canonical:SITE_ORIGIN+'/articles',image:items[0]?.cover,noindex,structured:{'@context':'https://schema.org','@type':'CollectionPage',name:title,url:SITE_ORIGIN+'/articles',description,inLanguage:'en',mainEntity:{'@type':'ItemList',itemListElement:items.map((a,i)=>({'@type':'ListItem',position:i+1,url:SITE_ORIGIN+path(a),name:a.title}))}},body:`<section class="articles-intro"><p class="micro accent">SHAPEVIZ / ARTICLES</p><h1>FIELD<br><span>NOTES.</span></h1><div class="articles-intro-bottom"><p>Ideas, tools and the details that make a difference.<br>Practical knowledge for your next creation.</p><span class="micro">FROM THE STUDIO</span></div></section><section class="articles-grid" aria-label="Articles">${items.length?items.map(card).join(''):'<p class="articles-empty">New guides are on the way. Explore our <a href="/en/shop">tools and assets</a> in the meantime.</p>'}</section>`});
}
export function renderArticle(article,{noindex=false}={}) {
  const canonical=SITE_ORIGIN+path(article),title=article.seo_title||article.title+' | Shapeviz',description=article.seo_description||article.excerpt;
  const words=documentText(article.content).trim().split(/\s+/).length;
  const toc=[];let index=0;
  const headings = node => {if(node.type==='heading'){index++;if(node.attrs.level===2)toc.push({id:index,text:documentText(node)});}for(const n of node.content||[])headings(n);};headings(article.content);
  const structured={'@context':'https://schema.org','@graph':[
    {'@type':'BlogPosting','@id':canonical+'#article',mainEntityOfPage:canonical,url:canonical,headline:article.title,description,inLanguage:'en',datePublished:article.published_at,dateModified:article.updated_at,author:{'@type':'Organization',name:'Shapeviz',url:SITE_ORIGIN+'/en'},publisher:{'@type':'Organization',name:'Shapeviz',url:SITE_ORIGIN,logo:{'@type':'ImageObject',url:SITE_ORIGIN+'/media/shapeviz-logo.webp'}},...(article.cover?{image:[absolute(article.cover.src)]}:{}),wordCount:words},
    {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Shapeviz',item:SITE_ORIGIN+'/en'},{'@type':'ListItem',position:2,name:'Articles',item:SITE_ORIGIN+'/articles'},{'@type':'ListItem',position:3,name:article.title,item:canonical}]}
  ]};
  return shell({title,description,canonical,image:article.cover,structured,noindex,body:`<article><header class="article-heading"><a class="article-back micro" href="/articles">${svgIcon('arrowLeft')} ALL ARTICLES</a><p class="micro accent">SHAPEVIZ / MATERIALS &amp; WORKFLOWS</p><h1>${esc(article.title)}</h1><div class="article-lead"><p>${esc(article.excerpt)}</p><div class="article-byline"><span>By Shapeviz</span><time datetime="${esc(article.published_at)}">${date(article.published_at)}</time><span>${Math.max(1,Math.ceil(words/220))} min read</span></div></div></header>${article.cover?`<figure class="article-hero-image">${imageHtml(article.cover,{hero:true,sizes:'92vw'})}${article.cover.title?`<figcaption>${esc(article.cover.title)}</figcaption>`:''}</figure>`:''}<div class="article-reading-layout"><nav class="article-toc" aria-label="In this article"><p class="micro accent">IN THIS ARTICLE</p><ol>${toc.map(h=>`<li><a href="#section-${h.id}">${esc(h.text)}</a></li>`).join('')}</ol><a class="article-toc-shop" href="/en/shop">Tools for your workflow ${svgIcon('arrowUpRight')}</a></nav><div class="article-prose">${renderDocument(article.content)}</div></div><div class="article-end"><span class="micro">KEEP EXPLORING</span><a href="/articles">More field notes ${svgIcon('arrowUpRight')}</a></div></article>`});
}
export function createArticlesHandler({env=process.env,send=fetch}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    const url=new URL(req.url,'http://localhost');
    const sitemap=url.pathname==='/sitemap-articles.xml'||url.searchParams.get('route')==='articles-sitemap';
    const slug=url.pathname.startsWith('/articles/')?url.pathname.slice(10).replace(/\/$/,''):url.searchParams.get('article');
    if(url.pathname.endsWith('/')&&url.pathname.startsWith('/articles')){res.writeHead(308,{Location:url.pathname.slice(0,-1)+url.search}).end();return;}
    try {
      if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw new Error('Article storage is not configured.');
      if(slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){res.writeHead(404,{'X-Robots-Tag':'noindex'}).end();return;}
      const root=env.SUPABASE_URL.replace(/\/$/,'');
      const query=new URLSearchParams({status:'eq.published',published_at:'lte.'+new Date().toISOString(),select:slug?'*':articleListFields,order:'published_at.desc,id',limit:slug?'1':'500',...(slug?{slug:'eq.'+slug}:{})});
      const response=await send(root+'/rest/v1/articles?'+query,{headers:{apikey:env.SUPABASE_SECRET_KEY},signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('Article storage unavailable.');
      const items=await response.json();if(!Array.isArray(items))throw new Error('Invalid article response.');
      const noindex=env.VERCEL_ENV==='preview';
      if(sitemap){res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8',...(noindex?{'X-Robots-Tag':'noindex'}:{})}).end(req.method==='HEAD'?undefined:`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_ORIGIN}/articles</loc></url>${items.map(a=>`<url><loc>${SITE_ORIGIN}${esc(path(a))}</loc><lastmod>${new Date(a.updated_at).toISOString()}</lastmod></url>`).join('')}</urlset>`);return;}
      for(const item of items)if(item.cover)item.cover=validateImage(item.cover,root);
      const article=items[0];
      if(slug&&!article){res.writeHead(404,{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex'}).end(req.method==='HEAD'?undefined:shell({title:'Article not found | Shapeviz',description:'This article is not available.',canonical:SITE_ORIGIN+'/articles',noindex:true,body:'<section class="articles-intro"><h1>Not found.</h1><p>This article is not available. <a href="/articles">Explore all articles</a>.</p></section>'}));return;}
      if(slug)article.content=validateDocument(article.content,root);
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Language':'en','X-Robots-Tag':noindex?'noindex,nofollow':'index,follow,max-image-preview:large','Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' ${root}; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`}).end(req.method==='HEAD'?undefined:slug?renderArticle(article,{noindex}):renderArticlesIndex(items,{noindex}));
    }catch{res.writeHead(503,{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex','Retry-After':'60'}).end(req.method==='HEAD'?undefined:'<!doctype html><html lang="en"><title>Articles temporarily unavailable | Shapeviz</title><h1>Please try again shortly.</h1><p>Articles are temporarily unavailable.</p><a href="/en">Back to Shapeviz</a></html>');}
  };
}
