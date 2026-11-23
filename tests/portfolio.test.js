import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'parse5';
import sharp from 'sharp';
import {renderPortfolioPage} from '../src/website/portfolio.js';
import {sitemapXml, robotsText} from '../src/website/seo.js';
import {createApp} from '../server.js';
import {portfolioFixture} from './helpers/portfolio-fixture.js';
import {PGlite} from '@electric-sql/pglite';

test('portfolio has one noindex directive, complete image assets and verified software in both languages', async()=>{
  for (const locale of ['sk','en']) {
    const html=renderPortfolioPage(locale), nodes=[];
    const walk=node=>{nodes.push(node);node.childNodes?.forEach(walk);};walk(parse(html));
    const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
    assert.equal(nodes.filter(n=>n.tagName==='h1').length,1);
    const robots=nodes.filter(n=>n.tagName==='meta'&&attr(n,'name')==='robots');
    assert.equal(robots.length,1);assert.equal(attr(robots[0],'content'),'noindex, nofollow');
    for(const name of ['Houdini','Marvelous Designer','Adobe Premiere Pro','AutoCAD','Octane','Karma'])assert.ok(html.includes(name));
    for(const project of ['louis-vuitton','pucci','mcm','prada','milenium','kontrafakt','rytmus','ektor','ami-paris','tolicci','hevi','interiors']) {
      assert.ok(nodes.some(n=>n.tagName==='section'&&attr(n,'id')===project),project);
      assert.ok(nodes.some(n=>n.tagName==='a'&&attr(n,'href')==='#'+project),project+' navigation');
    }
    assert.ok(html.includes('The New Face'));
    assert.ok(html.includes('Cosmic Star'));
    assert.ok(html.includes('Christmas'));
    assert.ok(!html.includes('/media/milenium-interior-'));
    assert.ok(!html.includes('/media/marketing/'));
    assert.ok(!html.includes('/media/gallery/lifestyle_01'));
    for (const image of nodes.filter(n=>n.tagName==='img'&&attr(n,'src'))) {
      const metadata=await sharp('public'+attr(image,'src')).metadata();
      assert.equal(metadata.width,Number(attr(image,'width')),attr(image,'src'));
      assert.equal(metadata.height,Number(attr(image,'height')),attr(image,'src'));
      for(const candidate of (attr(image,'srcset')||'').split(',').filter(Boolean)) {
        const [file,width]=candidate.trim().split(/\s+/);
        assert.equal((await sharp('public'+file).metadata()).width,Number(width.slice(0,-1)),file);
      }
    }
  }
  assert.ok(!sitemapXml().includes('/portfolio'));
  assert.ok(!robotsText().includes('Disallow: /portfolio'));
  assert.ok(!(await readFile('public/index.html','utf8')).includes('href="/portfolio'));
});

test('portfolio direct route and deployment rewrite return noindex for GET and HEAD without a database',async()=>{
  const server=createApp({env:{},send:async()=>{throw new Error('Portfolio must not need a database');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    const config=JSON.parse(await readFile('vercel.json','utf8'));
    const rewrite=config.rewrites.find(rule=>rule.source==='/portfolio');assert.ok(rewrite);
    for(const route of ['/portfolio',rewrite.destination])for(const lang of ['sk','en'])for(const method of ['GET','HEAD']) {
      const response=await fetch(origin+route+(route.includes('?')?'&':'?')+'lang='+lang,{method});
      assert.equal(response.status,200);assert.match(response.headers.get('x-robots-tag'),/noindex/);
      assert.equal(response.headers.get('content-language'),lang);
      const body=await response.text();
      if(method==='HEAD')assert.equal(body,'');else assert.ok(body.includes(`<html lang="${lang}">`));
    }
    const redirect=await fetch(origin+'/portfolio/?lang=en',{redirect:'manual'});
    assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'/portfolio?lang=en');
    assert.equal((await fetch(origin+'/portfolio',{method:'POST'})).status,405);
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('owner publishes a validated portfolio snapshot while stale writes and foreign images are rejected', async () => {
  const fixture = portfolioFixture();
  const server = createApp(fixture);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const endpoint = action => origin + '/api/admin?action=site-portfolio-' + action;
  const cookie = 'sv_access=owner-token';
  const post = (action, data, requestOrigin = origin) => fetch(endpoint(action), {
    method:'POST', headers:{Origin:requestOrigin, Cookie:cookie, 'Content-Type':'application/json'},
    body:JSON.stringify(data),
  });
  try {
    assert.equal((await fetch(endpoint('list'))).status, 401);
    assert.equal((await post('save', {}, 'https://example.com')).status, 403);
    const original = await (await fetch(endpoint('list'), {headers:{Cookie:cookie}})).json();
    assert.equal(original.version, 1);
    assert.equal(original.content.blocks.find(block => block.id === 'louis-vuitton').copy.en.title, 'Louis Vuitton');

    const upload = await post('upload', {uploadId:'2784376b-2cdb-4207-aec8-9f01a67e639d'});
    assert.equal(upload.status, 200);
    const media = await upload.json();
    assert.equal(fixture.uploads.length, 2);
    for (const request of fixture.uploads) {
      assert.ok(request.path.includes('/site-portfolio/uploads/' + fixture.owner + '/'));
      assert.equal(request.upsert, 'true');
    }

    const [first, second] = original.content.blocks.filter(block => block.type === 'project');
    const content = {logo:null, copy:original.content.copy, blocks:[second, first]};
    first.images[0] = {...first.images[0], src:media.image.publicUrl, copy:{sk:{url:'javascript:alert(1)'}, en:{}}};
    assert.equal((await post('save', {version:1, content})).status, 400);
    first.images[0].copy.sk.url = 'https://example.com/project';
    first.images[0].src = media.image.publicUrl.replace('/site-portfolio/', '/site-gallery/');
    assert.equal((await post('save', {version:1, content})).status, 400);
    first.images[0].src = media.image.publicUrl;
    first.copy.sk = {title:'<em>Nový názov</em>'};

    const result = await post('save', {version:1, content});
    assert.equal(result.status, 200);
    const saved = await result.json();
    assert.equal(saved.version, 2);
    assert.equal(saved.content.blocks[1].images[0].small, media.thumb.publicUrl);
    assert.equal((await post('save', {version:1, content})).status, 409);

    const publicPage = await fetch(origin + '/portfolio');
    const html = await publicPage.text();
    assert.equal(publicPage.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.ok(html.indexOf('id="pucci"') < html.indexOf('id="louis-vuitton"'));
    assert.match(html, /&lt;em&gt;Nový názov&lt;\/em&gt;/);
    assert.doesNotMatch(html, /<em>Nový názov<\/em>/);
    assert.match(html, /href="https:\/\/example\.com\/project"/);
    assert.doesNotMatch(await (await fetch(origin + '/sk')).text(), /Nový názov/);

    assert.equal((await post('save', {version:2, content:{blocks:[]}})).status, 200);
    assert.doesNotMatch(await (await fetch(origin + '/portfolio')).text(), /data-portfolio-block=/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('portfolio migration retains the singleton and restricts snapshots and upload policy', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
    for (const file of ['20261115105042_site_content.sql', '20261123145459_site_portfolio.sql']) {
      await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    }
    const {rows:[row]} = await db.query(`select portfolio, portfolio_version,
      has_column_privilege('anon', 'public.site_content', 'portfolio', 'select') as anon_read,
      has_column_privilege('authenticated', 'public.site_content', 'portfolio', 'update') as authenticated_write,
      has_column_privilege('service_role', 'public.site_content', 'portfolio', 'update') as server_write
      from public.site_content where id = 1`);
    assert.deepEqual(row, {portfolio:null, portfolio_version:1, anon_read:false, authenticated_write:false, server_write:true});
    await assert.rejects(db.exec(`update public.site_content set portfolio = '{"blocks":{}}'`));
    await db.exec(`update public.site_content set portfolio = '{"blocks":[]}', portfolio_version = 2 where id = 1 and portfolio_version = 1`);
    assert.deepEqual((await db.query('select portfolio, portfolio_version from public.site_content')).rows,
      [{portfolio:{blocks:[]}, portfolio_version:2}]);
    assert.deepEqual((await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'site-portfolio'`)).rows,
      [{public:true, file_size_limit:4194304, allowed_mime_types:['image/webp']}]);
  } finally {
    await db.close();
  }
});
