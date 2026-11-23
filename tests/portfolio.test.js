import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'parse5';
import sharp from 'sharp';
import {renderPortfolioPage} from '../src/website/portfolio.js';
import {sitemapXml, robotsText} from '../src/website/seo.js';
import {createApp} from '../server.js';

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
