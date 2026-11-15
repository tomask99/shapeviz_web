import test from 'node:test';
import assert from 'node:assert/strict';
import {shopFixture,sampleUrl} from './helpers/shop-fixture.js';
import {productPreview} from '../src/shop/previews.js';
import {defaultGallery} from '../src/website/gallery.js';
const seo={enabled:true,slug:'blender-texture-tools',heading:'Texture tools for Blender',title:'Blender Texture Tools | Shapeviz',description:'Create seamless PBR textures in Blender.',body:'A practical Blender texture workflow.\n\nUse your own source images.',features:'Seamless tiling\nPBR maps',compatibility:'Windows',focusPhrase:'private writing guide',faqs:[{question:'Can I use my own images?',answer:'Yes, import a diffuse image.'}]};
test('published product pages have crawlable HTML and sitemap; drafts stay private and saves preserve SEO',async()=>{
  const f=await shopFixture();
  try{
    let row=await(await f.request('shop-list')).json();
    const product={id:'test-seo',url:sampleUrl,categoryId:row.categories[0].id,visible:true,name:'Internal title',seo};
    row=await(await f.request('shop-save',{...row,products:[product]})).json();
    assert.equal((await fetch(f.origin+'/shop/'+seo.slug)).status,404);
    row=await(await f.request('shop-launch',{version:row.version,launched:true})).json();
    const response=await fetch(f.origin+'/shop/'+seo.slug),html=await response.text();
    assert.equal(response.status,200);assert.match(response.headers.get('x-robots-tag'),/^index/);
    assert.match(html,/<h1>Texture tools for Blender<\/h1>/);assert.match(html,/rel="canonical" href="https:\/\/www.shapeviz.com\/shop\/blender-texture-tools"/);
    assert.match(html,/Use your own source images/);assert.match(html,/Can I use my own images/);assert.doesNotMatch(html,/private writing guide|Internal title|aggregateRating/);
    const graph=JSON.parse(html.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);assert.equal(graph['@graph'][0]['@type'],'Product');assert.equal(graph['@graph'][0].offers,undefined);
    const shop=await(await fetch(f.origin+'/en/shop')).text();assert.match(shop,/href="\/shop\/blender-texture-tools"/);assert.doesNotMatch(shop,/noindex/);
    assert.match(await(await fetch(f.origin+'/sitemap-products.xml')).text(),/blender-texture-tools/);
    assert.match(await(await fetch(f.origin+'/robots.txt')).text(),/sitemap-products.xml/);
    assert.equal((await fetch(f.origin+'/shop/'+seo.slug+'/',{redirect:'manual'})).status,308);
    const preview=await fetch(f.origin+'/shop?preview=1');assert.match(preview.headers.get('x-robots-tag'),/noindex/);assert.doesNotMatch(await preview.text(),/Texture tools for Blender/);
    const duplicate={...product,id:'another',url:'https://tomaskrajcovic.gumroad.com/l/another'};
    assert.equal((await f.request('shop-save',{...row,products:[product,duplicate]})).status,409);
    assert.equal((await f.request('shop-save',{...row,products:[{...product,seo:{...seo,slug:'changed'}}]})).status,400);
    const legacy={...product};delete legacy.seo;
    row=await(await f.request('shop-save',{...row,products:[legacy]})).json();assert.equal(row.products[0].seo.slug,seo.slug);
    row=await(await f.request('shop-save',{...row,products:[{...row.products[0],visible:false}]})).json();
    assert.equal((await fetch(f.origin+'/shop/'+seo.slug)).status,404);assert.doesNotMatch(await(await fetch(f.origin+'/sitemap-products.xml')).text(),/blender-texture-tools/);
    assert.equal((await f.request('shop-metadata',{url:sampleUrl},null)).status,401);
    assert.equal((await f.request('shop-save',{...row,products:[{...product,seo:{...seo,body:''}}]})).status,400);
    assert.equal((await f.request('shop-save',{...row,products:[{...product,seo:{...seo,image:'https://example.com/image.png'}}]})).status,400);
  }finally{await f.close();}
});
test('Gumroad offers use only verified published price data',()=>{
  const data=product=>`<div data-page='${JSON.stringify({props:{product}})}'></div>`;
  assert.deepEqual(productPreview(data({is_published:true,price_cents:2000,currency_code:'usd'})).offer,{price:20,currency:'USD',minimum:false});
  assert.equal(productPreview(data({is_published:false,price_cents:2000,currency_code:'usd'})).offer,undefined);
});
test('product gallery validates uploads, survives older editors and renders escaped accessible HTML',async()=>{
  const f=await shopFixture();
  try{
    let row=await(await f.request('shop-list')).json();
    const signed=await(await f.request('site-gallery-upload',{uploadId:crypto.randomUUID()})).json();
    const image={...defaultGallery[0],id:'gallery-test',src:signed.thumb.publicUrl,full:'https://evil.example/untrusted',alt:'Texture <preview>',caption:'Details <script>alert(1)</script>'};
    const product={id:'gallery-product',url:sampleUrl,categoryId:row.categories[0].id,visible:true,name:'Gallery product',seo:{...seo,gallery:[image]}};
    row=await(await f.request('shop-save',{...row,products:[product]})).json();
    assert.equal(row.products[0].seo.gallery[0].full,signed.image.publicUrl);
    row=await(await f.request('shop-launch',{version:row.version,launched:true})).json();
    const r=await fetch(f.origin+'/shop/'+seo.slug),html=await r.text();
    assert.match(html,/data-product-image/);assert.match(html,/Texture &lt;preview&gt;/);assert.match(html,/Details &lt;script&gt;/);assert.doesNotMatch(html,/evil.example/);
    assert.match(r.headers.get('content-security-policy'),/https:\/\/test.supabase.co/);
    const data=JSON.parse(html.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);assert.ok(data['@graph'][0].image.includes(signed.image.publicUrl));
    const old={...product,seo:{...seo}};
    row=await(await f.request('shop-save',{...row,products:[old]})).json();assert.equal(row.products[0].seo.gallery.length,1);
    for(const gallery of [[{...image,src:'https://evil.example/image.webp'}],[image,image],Array(25).fill(image),[{...image,alt:''}]])assert.equal((await f.request('shop-save',{...row,products:[{...product,seo:{...seo,gallery}}]})).status,400);
    row=await(await f.request('shop-save',{...row,products:[{...product,seo:{...seo,gallery:[]}}]})).json();
    assert.doesNotMatch(await(await fetch(f.origin+'/shop/'+seo.slug)).text(),/id="product-gallery-title"/);
  }finally{await f.close();}
});
