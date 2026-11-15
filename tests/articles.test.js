import test from 'node:test';
import assert from 'node:assert/strict';
import {articlesFixture} from './helpers/articles-fixture.js';
import {firstArticle} from '../src/articles/first-article.js';
import {productVisualizationArticle} from '../src/articles/product-visualization-article.js';
import {productVisualizationArticleEn} from '../src/articles/product-visualization-article-en.js';
import {validateDocument,renderDocument,safeLink} from '../public/articles/content.js';
import {robotsText,sitemapXml} from '../src/website/seo.js';

test('published translations have reciprocal language links, unique groups and one card per topic',async()=>{
  const f=await articlesFixture({seed:true});
  try {
    const save=async data=>{const r=await f.request('articles-save',data);assert.equal(r.status,200);return (await r.json()).article;};
    const sk=await save(productVisualizationArticle);
    let en=await save({...productVisualizationArticleEn,status:'draft'});
    let html=await(await fetch(f.origin+'/articles/'+sk.slug)).text();
    assert.doesNotMatch(html,new RegExp(en.slug));
    en=await save({...en,status:'published'});
    assert.equal((await f.request('articles-save',{...productVisualizationArticleEn,slug:'duplicate-translation'})).status,409);
    assert.equal((await f.request('articles-save',{...productVisualizationArticleEn,translation_group:'Bad group'})).status,400);
    for(const article of [sk,en]) {
      html=await(await fetch(f.origin+'/articles/'+article.slug)).text();
      for(const sibling of [sk,en])assert.ok(html.includes(`rel="alternate" hreflang="${sibling.language}" href="https://www.shapeviz.com/articles/${sibling.slug}"`));
      assert.ok(html.includes(`rel="canonical" href="https://www.shapeviz.com/articles/${article.slug}"`));
    }
    for(const [query,article,other]of [['',en,sk],['?lang=sk',sk,en]]) {
      const response=await fetch(f.origin+'/articles'+query);html=await response.text();
      assert.equal(response.headers.get('content-language'),article.language);
      assert.equal((html.match(/class="article-public-card/g)||[]).length,2);
      assert.ok(html.includes(article.title));assert.ok(!html.includes(other.title));
    }
    const sitemap=await(await fetch(f.origin+'/sitemap-articles.xml')).text();
    assert.ok(sitemap.includes(sk.slug)&&sitemap.includes(en.slug));
    const {translation_group,...legacy}=en;
    const preserved=await save(legacy);assert.equal(preserved.translation_group,translation_group);
    await save({...preserved,status:'draft'});
    html=await(await fetch(f.origin+'/articles/'+sk.slug)).text();assert.doesNotMatch(html,new RegExp(en.slug));
  }finally{await f.close();}
});

test('Slovak articles preserve language through editing and expose matching SEO',async()=>{
  const f=await articlesFixture();
  try {
    assert.equal((await f.request('articles-save',{...productVisualizationArticle,language:'invalid'})).status,400);
    const saved=await f.request('articles-save',productVisualizationArticle);
    assert.equal(saved.status,200);
    const {article}=await saved.json();assert.equal(article.language,'sk');
    const {language,...legacy}=article;
    const updated=await f.request('articles-save',legacy);
    assert.equal((await updated.json()).article.language,'sk');
    const response=await fetch(f.origin+'/articles/'+article.slug),html=await response.text();
    assert.equal(response.headers.get('content-language'),'sk');
    assert.match(html,/<html lang="sk">/);
    assert.match(html,/"inLanguage":"sk"/);
    assert.match(html,/property="og:locale" content="sk_SK"/);
    assert.match(html,/V TOMTO ČLÁNKU/);
    assert.match(html,/href="\/sk\/sluzby\/produktove-interierove-vizualizacie"/);
    assert.doesNotMatch(html,/SV Textures/);
    assert.ok((await(await fetch(f.origin+'/sitemap-articles.xml')).text()).includes(article.slug));
  } finally {await f.close();}
});

test('article lifecycle protects drafts, writes, concurrency and stable published URLs',async()=>{
  const f=await articlesFixture();
  try {
    assert.equal((await f.request('articles-list',undefined,'')).status,401);
    assert.equal((await f.request('articles-list',undefined,'visitor')).status,403);
    assert.equal((await f.request('articles-save',firstArticle,'visitor')).status,403);
    assert.equal((await fetch(f.origin+'/api/admin?action=articles-save',{method:'POST',headers:{Cookie:'sv_access=owner','Content-Type':'application/json',Origin:'https://evil.test'},body:JSON.stringify(firstArticle)})).status,403);
    const draft={...firstArticle,status:'draft'};
    const created=await f.request('articles-save',draft);assert.equal(created.status,200);
    let {article}=await created.json();assert.equal(article.published_at,null);
    assert.equal((await fetch(f.origin+'/articles/'+draft.slug)).status,404);
    assert.doesNotMatch(await(await fetch(f.origin+'/sitemap-articles.xml')).text(),new RegExp(draft.slug));
    assert.doesNotMatch(await(await fetch(f.origin+'/articles')).text(),new RegExp(draft.title));
    assert.equal((await f.request('articles-get',undefined,'owner',{id:article.id})).status,200);
    assert.equal((await f.request('articles-save',{...article,status:'published',cover:null})).status,400);
    const pub=await f.request('articles-save',{...article,status:'published'});assert.equal(pub.status,200);const old=article;article=(await pub.json()).article;
    assert.ok(article.published_at);assert.equal(article.version,2);
    assert.equal((await f.request('articles-save',old)).status,409);
    assert.equal((await f.request('articles-delete',{id:old.id,version:old.version})).status,409);
    assert.equal((await f.request('articles-save',{...article,slug:'renamed'})).status,400);
    assert.equal((await f.request('articles-save',firstArticle)).status,409);
    const response=await fetch(f.origin+'/articles/'+article.slug),html=await response.text();assert.equal(response.status,200);
    assert.match(html,/<link rel="canonical" href="https:\/\/www.shapeviz.com\/articles\/how-to-create-pbr-maps">/);
    assert.match(html,/<h1>How to create PBR maps/);assert.match(html,/<h2 id="section-1">/);assert.match(html,/not a standalone application/);
    const data=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(data['@graph'][0]['@type'],'BlogPosting');assert.equal(data['@graph'][0].datePublished,article.published_at);
    assert.match(await(await fetch(f.origin+'/sitemap-articles.xml')).text(),/<lastmod>/);
    assert.equal((await fetch(f.origin+'/articles/'+article.slug+'/',{redirect:'manual'})).status,308);
    const head=await fetch(f.origin+'/articles/'+article.slug,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    article=(await(await f.request('articles-save',{...article,status:'draft'})).json()).article;
    assert.equal((await fetch(f.origin+'/articles/'+article.slug)).status,404);
    assert.equal((await f.request('articles-delete',{id:article.id,version:article.version})).status,200);
    assert.equal((await f.request('articles-get',undefined,'owner',{id:article.id})).status,404);
    assert.equal((await f.request('articles-delete',{id:"x'or=true",version:1})).status,400);
    f.setUnavailable(true);assert.equal((await fetch(f.origin+'/articles')).status,503);
  } finally {await f.close();}
});

test('document renderer escapes content and rejects executable URLs, foreign images and oversized content',()=>{
  assert.equal(safeLink('javascript:alert(1)'),null);assert.equal(safeLink('//evil.test'),null);assert.equal(safeLink('/\\evil.test'),null);
  const doc=validateDocument({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'<script>alert(1)</script>'}]}]});
  assert.equal(renderDocument(doc),'<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  const unsafeText={type:'text',text:'link',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]};
  assert.throws(()=>validateDocument({type:'doc',content:[{type:'paragraph',content:[unsafeText]}]}));
  assert.throws(()=>validateDocument({type:'doc',content:[{type:'image',attrs:{src:'https://evil.test/a.svg',alt:'x',width:10,height:10}}]}));
  assert.throws(()=>validateDocument({type:'doc',content:[{type:'iframe'}]}));
  assert.throws(()=>validateDocument({type:'doc',content:[{type:'text',text:'x'.repeat(300000)}]}));
});

test('database denies direct anonymous access and upload URLs are owner scoped',async()=>{
  const f=await articlesFixture();try{
    for(const role of ['anon','authenticated']){
      await f.db.exec('set role '+role);await assert.rejects(f.db.query('select * from articles'),/permission denied/);await f.db.exec('reset role');
    }
    const security=(await f.db.query("select relrowsecurity from pg_class where relname='articles'")).rows;assert.equal(security[0].relrowsecurity,true);
    assert.equal((await f.request('articles-upload',{uploadId:'../bad'})).status,400);
    const r=await f.request('articles-upload',{uploadId:'22222222-2222-4222-8222-222222222222'});assert.equal(r.status,200);
    assert.match((await r.json()).image.publicUrl,/article-images\/uploads\/11111111-1111-4111-8111-111111111111\//);
  }finally{await f.close();}
});

test('articles are discoverable and previews are not indexed',async()=>{
  assert.match(robotsText(),/sitemap-articles\.xml/);assert.match(sitemapXml(),/\/articles<\/loc>/);
  const f=await articlesFixture({seed:true,preview:true});try{
    const r=await fetch(f.origin+'/articles/'+firstArticle.slug);assert.equal(r.headers.get('x-robots-tag'),'noindex,nofollow');
    assert.match(await r.text(),/content="noindex,nofollow"/);
  }finally{await f.close();}
});
