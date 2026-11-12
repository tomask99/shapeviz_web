import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'parse5';
import {createApp} from '../server.js';
import {preferredLanguage} from '../src/website/language.js';
import {renderPublicPage} from '../src/website/page.js';
import {translate} from '../public/i18n/messages.js';

test('language respects manual choice, trusted SK country and weighted browser fallback', () => {
  assert.equal(preferredLanguage({'x-vercel-ip-country':'SK','accept-language':'en-US'}, {VERCEL:'1'}),'sk');
  assert.equal(preferredLanguage({cookie:'other=1; sv_language=en','x-vercel-ip-country':'SK'}, {VERCEL:'1'}),'en');
  assert.equal(preferredLanguage({'x-vercel-ip-country':'SK','accept-language':'en-US'}, {}),'en');
  assert.equal(preferredLanguage({'accept-language':'de,sk-SK;q=0.9,en;q=0.8'}),'sk');
  assert.equal(preferredLanguage({'accept-language':'en;q=0.8,sk;q=0.2'}),'en');
  assert.equal(preferredLanguage({'accept-language':'sk;q=0,en;q=1'}),'en');
  assert.equal(preferredLanguage({cookie:'sv_language=invalid','accept-language':'sk-SK'}),'sk');
  assert.equal(preferredLanguage({}),'en');
});

test('all public template copy is translated while brands, SVGs and form values survive', async () => {
  const unchanged=new Set(['Shapeviz','SHAPEVIZ','S','H','A','P','E','V','I','Z','CGI & 3D','MILENIUM','PRADA','PUCCI','MAZDA','MCM','BERO','BRAVE MMA','TATRABANKA','TOLICCI','SK','EN','Slovenčina','English']);
  for(const file of ['public/index.html','public/shop/index.html']){
    const source=await readFile(file,'utf8'),missing=[];
    function inspect(node){
      if(['script','style'].includes(node.tagName))return;
      const check=value=>{const text=value.trim();if(/[a-zA-Z]/.test(text)&&!unchanged.has(text)&&!['01 / 3D','02 / CGI'].includes(text)&&translate(text,'sk')===text)missing.push(text);};
      if(node.nodeName==='#text')check(node.value);
      for(const attr of node.attrs||[])if(['alt','aria-label','placeholder','title'].includes(attr.name))check(attr.value);
      node.childNodes?.forEach(inspect);
    }
    inspect(parse(source,{scriptingEnabled:false}));assert.deepEqual(missing,[],file);
    const html=renderPublicPage(source,'sk',{shop:file.includes('/shop/'),explicit:true});
    assert.match(html,/<html lang="sk">/);assert.match(html,/hreflang="en"/);
    assert.equal((html.match(/<svg /g)||[]).length,(source.match(/<svg /g)||[]).length);
    if(!file.includes('/shop/'))assert.match(html,/value="High-end 3D modeling"/);
  }
});

test('localized HTTP pages work without scripts, persist selection and isolate admin', async () => {
  const server=createApp({env:{VERCEL:'1'}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    const auto=await fetch(origin,{headers:{'x-vercel-ip-country':'SK','accept-language':'en'}});
    assert.equal(auto.headers.get('content-language'),'sk');assert.match(auto.headers.get('cache-control'),/no-store/);
    assert.match(await auto.text(),/DÁVAME/);
    const english=await fetch(origin+'/en',{headers:{'x-vercel-ip-country':'SK'}});
    assert.equal(english.headers.get('content-language'),'en');assert.match(english.headers.get('set-cookie'),/sv_language=en;.*HttpOnly; Secure/);
    const saved=await fetch(origin,{headers:{cookie:'sv_language=en','x-vercel-ip-country':'SK'}});
    assert.equal(saved.headers.get('content-language'),'en');
    for(const url of ['/sk/shop','/api/site-events?route=page&page=shop&locale=sk']){
      const shop=await fetch(origin+url);assert.match(await shop.text(),/Obchod · Shapeviz/);
      assert.match(shop.headers.get('content-security-policy'),/frame-src https:\/\/gumroad.com/);
      assert.match(shop.headers.get('x-robots-tag'),/noindex/);
    }
    const admin=await fetch(origin+'/admin',{headers:{cookie:'sv_language=sk','x-vercel-ip-country':'SK'}});
    assert.match(await admin.text(),/<html lang="en">/);
    assert.equal((await fetch(origin+'/sk',{method:'HEAD'})).headers.get('content-language'),'sk');
    assert.equal((await fetch(origin+'/sk',{method:'POST'})).status,405);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
