import test from 'node:test';
import assert from 'node:assert/strict';
import {gumroadUrl} from '../public/shop/url.js';
import {shopFixture,sampleUrl} from './helpers/shop-fixture.js';
test('Gumroad URL validation canonicalizes products and rejects unsafe inputs',()=>{
 assert.equal(gumroadUrl(sampleUrl+'/?wanted=true#x'),sampleUrl);
 for(const url of ['http://gumroad.com/l/a','https://gumroad.com.evil.test/l/a','https://evil.test/l/a','javascript:alert(1)','https://user:pass@gumroad.com/l/a','https://gumroad.com:444/l/a','https://gumroad.com/widgets','https://gumroad.com/l/a/other','<script>','https://gumroad.com/l/a%22'])assert.throws(()=>gumroadUrl(url));
});
test('shop persists edits, protects drafts and preview, rejects duplicates and concurrent edits',async()=>{
 const f=await shopFixture();try{
  const json=async r=>{assert.equal(r.status,200);return r.json();};
  assert.deepEqual(await json(await fetch(f.origin+'/api/shop')),{launched:false});
  for(const action of ['shop-list','shop-preview']){
   assert.equal((await f.request(action,null,null)).status,401);assert.equal((await f.request(action,null,'visitor')).status,403);
  }
  assert.equal((await f.request('shop-launch',{version:1,launched:true},null)).status,401);
  let catalog=await json(await f.request('shop-list'));
  const product={id:'sample',url:sampleUrl,categoryId:'3d-models',visible:true,name:'Private internal name'};
  catalog=await json(await f.request('shop-save',{...catalog,launched:true,products:[product]}));
  assert.equal(catalog.launched,false);assert.deepEqual(await json(await fetch(f.origin+'/api/shop')),{launched:false});
  const preview=await json(await f.request('shop-preview'));assert.equal(preview.products[0].url,sampleUrl);assert.equal(preview.products[0].name,undefined);
  assert.equal((await f.request('shop-save',{...catalog,products:[product,{...product,id:'duplicate',url:'https://gumroad.com/l/jQHeN'}]})).status,409);
  assert.equal((await f.request('shop-save',{...catalog,version:1})).status,409);
  assert.equal((await f.request('shop-save',{...catalog,products:[{...product,url:'https://evil.test/l/a'}]})).status,400);
  assert.equal((await f.request('shop-save',{...catalog,products:[{...product,id:undefined}]})).status,400);
  assert.equal((await f.request('shop-save',{...catalog,categories:[{name:'Missing ID'}]})).status,400);
  const cross=await fetch(f.origin+'/api/admin?action=shop-launch',{method:'POST',headers:{Cookie:'sv_access=owner',Origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify({version:catalog.version,launched:true})});assert.equal(cross.status,403);
  catalog=await json(await f.request('shop-launch',{version:catalog.version,launched:true}));
  assert.equal((await json(await fetch(f.origin+'/api/shop'))).products.length,1);
  assert.deepEqual(await json(await fetch(f.origin+'/api/shop?status=1')),{launched:true});
  const second={...product,id:'second',url:'https://creator.gumroad.com/l/second',visible:false};
  catalog=await json(await f.request('shop-save',{...catalog,products:[second,product],categories:catalog.categories.map((c,i)=>i?c:{...c,name:'3D Assets'})}));
  assert.equal((await json(await f.request('shop-list'))).products[0].id,'second');
  assert.equal((await json(await fetch(f.origin+'/api/shop'))).products.length,1);
  catalog=await json(await f.request('shop-save',{...catalog,products:[second]}));
  assert.equal((await json(await fetch(f.origin+'/api/shop'))).products.length,0);
  await json(await f.request('shop-launch',{version:catalog.version,launched:false}));
  assert.deepEqual(await json(await fetch(f.origin+'/api/shop')),{launched:false});
  for(const role of ['anon','authenticated']){
   await f.db.exec('set role '+role);
   for(const query of ['select * from shop_catalog',"update shop_catalog set launched=true",'delete from shop_catalog'])await assert.rejects(f.db.query(query),/permission denied/);
   await f.db.exec('reset role');
  }
 }finally{await f.close();}
});
