import test from 'node:test';
import assert from 'node:assert/strict';
import {productPreview,createProductPreviews} from '../src/shop/previews.js';

const html='<meta content="Bag &amp; accessories" property="og:title"><meta property="og:image" content="https://public-files.gumroad.com/cover">';
const response=body=>new Response(body,{headers:{'Content-Type':'text/html'}});
test('product previews decode metadata and allow only Gumroad image hosts',()=>{
 assert.deepEqual(productPreview(html),{title:'Bag & accessories',image:'https://public-files.gumroad.com/cover'});
 for(const url of ['javascript:alert(1)','https://evil.test/a','https://public-files.gumroad.com.evil.test/a','https://user:pass@public-files.gumroad.com/a','http://public-files.gumroad.com/a'])assert.equal(productPreview(`<meta property="og:image" content="${url}">`).image,null);
 assert.deepEqual(productPreview('<script>alert(1)</script>'),{title:null,image:null});
});
test('preview requests are deduplicated and cached without forwarding credentials or fetching closed catalogs',async()=>{
 let calls=0;
 const decorate=createProductPreviews({send:async(url,options)=>{calls++;assert.equal(url,'https://gumroad.com/l/bag');assert.deepEqual(options.headers,{Accept:'text/html'});assert.equal(options.redirect,'manual');return response(html);}});
 assert.deepEqual(await decorate({launched:false}),{launched:false});assert.equal(calls,0);
 const catalog={launched:true,products:[{id:'one',url:'https://gumroad.com/l/bag'}]};
 const [one,two]=await Promise.all([decorate(catalog),decorate(catalog)]);
 assert.equal(one.products[0].preview.title,'Bag & accessories');assert.deepEqual(two,one);assert.equal(calls,1);
 await decorate(catalog);assert.equal(calls,1);assert.equal(catalog.products[0].preview,undefined);
});
test('external redirects, oversized responses and unavailable metadata fall back without breaking catalog',async()=>{
 for(const send of [
  async()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}}),
  async()=>response('x'.repeat(1024*1024+1)),
  async()=>new Response('Not found',{status:404}),
 ]){
  let calls=0;const decorate=createProductPreviews({send:async(...args)=>{calls++;return send(...args);}});
  const result=await decorate({products:[{url:'https://gumroad.com/l/bag'}]});
  assert.deepEqual(result.products[0].preview,{title:null,image:null});assert.equal(calls,1);
 }
});
