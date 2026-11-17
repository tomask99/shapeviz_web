import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'parse5';
import {renderPublicPage} from '../src/website/page.js';
import {SITE_ORIGIN,sitemapXml,robotsText} from '../src/website/seo.js';
import {validateContact} from '../src/contact.js';
import {createApp} from '../server.js';
import {services,servicePath} from '../src/website/services.js';
import {renderServicePage} from '../src/website/service-page.js';
import sharp from 'sharp';

const source=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const text=node=>node.nodeName==='#text'?node.value:(node.childNodes||[]).map(text).join('');
function nodes(html){const result=[];function walk(node){result.push(node);node.childNodes?.forEach(walk);}walk(parse(html));return result;}
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;

test('each language has absolute canonical/social metadata and truthful localized service schema',()=>{
 for(const locale of ['sk','en']){
  const html=renderPublicPage(source,locale,{explicit:true}),all=nodes(html);
  const canonical=all.find(n=>attr(n,'rel')==='canonical');assert.equal(attr(canonical,'href'),`${SITE_ORIGIN}/${locale}`);
  const alternates=all.filter(n=>attr(n,'rel')==='alternate');assert.deepEqual(alternates.map(n=>attr(n,'hreflang')),['sk','en','x-default']);
  for(const node of alternates)assert.ok(attr(node,'href').startsWith(SITE_ORIGIN));
  const title=text(all.find(n=>n.tagName==='title'));assert.match(title,/3D/);assert.ok(title.length<65);
  const description=attr(all.find(n=>attr(n,'name')==='description'),'content');assert.ok(description.length>100&&description.length<180);
  assert.equal(attr(all.find(n=>attr(n,'property')==='og:url'),'content'),`${SITE_ORIGIN}/${locale}`);
  assert.match(attr(all.find(n=>attr(n,'property')==='og:image'),'content'),/^https:\/\/www\.shapeviz\.com\/media\//);
  assert.equal(attr(all.find(n=>attr(n,'name')==='twitter:card'),'content'),'summary_large_image');
  const schema=JSON.parse(text(all.find(n=>attr(n,'type')==='application/ld+json')));
  assert.deepEqual(schema['@graph'].map(n=>n['@type']),['Organization','WebSite','WebPage','OfferCatalog']);
  const catalog=schema['@graph'].at(-1);assert.equal(catalog.itemListElement.length,4);
  for(const offer of catalog.itemListElement){
   const service=offer.itemOffered,definition=services.find(item=>SITE_ORIGIN+servicePath(item,locale)===service.url),section=all.find(n=>attr(n,'id')===definition?.id);
   assert.ok(section);assert.ok(text(section).includes(service.name));assert.equal(service.description,undefined);
   assert.equal(service.provider['@id'],SITE_ORIGIN+'/#organization');assert.equal(offer.price,undefined);
  }
  assert.equal(schema['@graph'][2].inLanguage,locale);
  assert.equal(all.filter(n=>n.tagName==='h1').length,1);
  for(const image of all.filter(n=>n.tagName==='img' && attr(n,'loading')==='lazy')){
   assert.ok(attr(image,'src')?.startsWith('/media/'));assert.ok(attr(image,'srcset'));
   if(attr(image.parentNode,'class')==='client-preview') {
    assert.equal(attr(image.parentNode,'aria-hidden'),'true');assert.equal(attr(image,'alt'),'');
   } else assert.ok(attr(image,'alt'));
  }
 }
});

test('sitemap lists indexable language URLs and articles; contact accepts the new services',()=>{
 const xml=sitemapXml();assert.equal((xml.match(/<loc>/g)||[]).length,11);assert.match(xml,/<loc>https:\/\/www.shapeviz.com\/articles<\/loc>/);
 for(const locale of ['sk','en'])assert.ok(xml.includes(`<loc>${SITE_ORIGIN}/${locale}</loc>`));
 assert.ok(!/admin|shop|\/files|\/p\//.test(xml));assert.ok(robotsText().includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));
 const selected=['High-end 3D modeling','Product & interior visualization','Architectural 3D modeling','Video production & animation','Marketing & digital presence','Websites & applications'];
 assert.equal(validateContact({name:'Test visitor',email:'visitor@example.test',company:'',message:'A detailed brief for a visualization project.',consent:true,services:selected}),null);
});

test('service pages expose distinct localized copy, equivalent URLs and schema without JavaScript',async()=>{
 const titles=new Set(),descriptions=new Set();
 for(const service of services){
  const image=await sharp('public'+service.image.src).metadata();assert.equal(image.width,service.image.width);assert.equal(image.height,service.image.height);
  for(const locale of ['sk','en']){
   const copy=service[locale],all=nodes(renderServicePage(service,locale)),url=SITE_ORIGIN+servicePath(service,locale);
   titles.add(copy.title);descriptions.add(copy.description);
   assert.equal(all.filter(n=>n.tagName==='h1').length,1);assert.equal(text(all.find(n=>n.tagName==='h1')),copy.name);
   assert.equal(attr(all.find(n=>attr(n,'rel')==='canonical'),'href'),url);
   assert.equal(attr(all.find(n=>attr(n,'hreflang')===(locale==='sk'?'en':'sk')),'href'),SITE_ORIGIN+servicePath(service,locale==='sk'?'en':'sk'));
   const graph=JSON.parse(text(all.find(n=>attr(n,'type')==='application/ld+json')))['@graph'];
   assert.equal(graph.find(n=>n['@type']==='Service').description,copy.intro);
   assert.equal(graph.find(n=>n['@type']==='BreadcrumbList').itemListElement[1].item,url);
   assert.equal(all.filter(n=>n.tagName==='details').length,2);
   assert.ok(sitemapXml().includes(`<loc>${url}</loc>`));
   assert.ok(all.some(n=>attr(n,'href')===`/${locale}?interest=${service.id}#project-form`));
   for(const other of services.filter(s=>s!==service))assert.ok(all.some(n=>attr(n,'href')===servicePath(other,locale)));
   assert.ok(copy.title.length<65);assert.ok(copy.description.length>100&&copy.description.length<180);
  }
 }
 assert.equal(titles.size,8);assert.equal(descriptions.size,8);
});

test('all sitemap destinations, service rewrites and missing pages return the correct HTTP response',async()=>{
 const server=createApp({env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'test'},send:async()=>Response.json([])});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const {1:url} of sitemapXml().matchAll(/<loc>(.*?)<\/loc>/g)){
   const response=await fetch(origin+new URL(url).pathname);assert.equal(response.status,200,url);
   assert.ok(!(response.headers.get('x-robots-tag')||'').includes('noindex'));
   const html=await response.text();assert.ok(html.includes(`rel="canonical" href="${url}"`));
  }
  const config=JSON.parse(await readFile('vercel.json','utf8'));
  for(const locale of ['sk','en']){
   const source=`/${locale}/${locale==='sk'?'sluzby':'services'}/:service`;
   const rewrite=config.rewrites.find(rule=>rule.source===source);assert.ok(rewrite);
   const response=await fetch(origin+rewrite.destination.replace(':service',services[0][locale].slug));
   assert.equal(response.status,200);assert.ok((await response.text()).includes(services[0][locale].intro));
  }
  for(const url of ['/sk/sluzby/neexistuje','/en/services/unknown','/sk/services/3d-modelovanie','/api/site-events?route=page&locale=en&service=unknown'])assert.equal((await fetch(origin+url)).status,404,url);
  for(const [from,to] of [['/index.html','/'],['/sk/','/sk'],['/en/services/3d-modeling/','/en/services/3d-modeling'],['/shop/index.html','/shop']]){
   const response=await fetch(origin+from+'?utm_source=test',{redirect:'manual'});assert.equal(response.status,308);assert.equal(response.headers.get('location'),to+'?utm_source=test');
  }
  const head=await fetch(origin+servicePath(services[0],'sk'),{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.equal((await fetch(origin+servicePath(services[0],'sk'),{method:'POST'})).status,405);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('SEO endpoints serve XML/text and preview responses stay out of search',async()=>{
 const server=createApp({env:{VERCEL_ENV:'preview'}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  const sitemap=await fetch(origin+'/sitemap.xml');assert.equal(sitemap.status,200);assert.match(sitemap.headers.get('content-type'),/application\/xml/);assert.equal(await sitemap.text(),sitemapXml());
  const robots=await fetch(origin+'/robots.txt');assert.match(robots.headers.get('content-type'),/text\/plain/);assert.equal(await robots.text(),robotsText());
  const preview=await fetch(origin+'/sk');assert.match(preview.headers.get('x-robots-tag'),/noindex/);
  const shop=await fetch(origin+'/en/shop');assert.match(shop.headers.get('x-robots-tag'),/noindex/);assert.ok(!(await shop.text()).includes('application/ld+json'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
