import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {deferPresentationMedia} from '../../src/presentations/deferred-media.js';

const deck=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preload" as="image" href="/test-media/unvisited.png">
<style>body{margin:0} .slide{position:absolute;inset:0;opacity:0;pointer-events:none}.slide.active{opacity:1;pointer-events:auto}img,video{width:150px;height:100px}nav{position:fixed;bottom:10px;z-index:2}#startOverlay{position:fixed;inset:0;background:white;z-index:3}#lightbox{position:fixed;inset:0;background:white;z-index:4}#lightbox[hidden]{display:none}</style></head><body>
<div id="startOverlay"><button id="start">Start presentation</button></div>
<section class="slide active"><h1>First slide</h1><img id="first" src="/test-media/first.png"><video id="intro" muted autoplay preload="auto" src="/test-media/intro.mp4"></video></section>
<section class="slide"><h1>Second slide</h1><picture><source srcset="/test-media/picture.png"><img id="second" src="/test-media/fallback.png"></picture><video id="movie" muted playsinline preload="auto" poster="/test-media/poster.png"><source src="/test-media/movie.mp4" type="video/mp4"></video><audio id="voice" preload="auto" src="/test-media/voice.wav"></audio><button id="playVoice">Play audio</button></section>
<section class="slide"><h1>Unvisited slide</h1><img src="/test-media/unvisited.png"><video src="/test-media/unvisited.mp4" preload="auto"></video></section>
<nav><button id="previous">Previous</button><button id="next">Next</button></nav>
<div id="lightbox" hidden><img id="large"><button id="close">Close</button></div>
<script>
let current=0;const slides=[...document.querySelectorAll('.slide')];
function show(n){current=n;document.querySelectorAll('video,audio').forEach(v=>v.pause());slides.forEach((s,i)=>s.classList.toggle('active',i===n));slides[n].querySelector('video')?.play().catch(()=>{});}
document.querySelector('#start').onclick=()=>{document.querySelector('#startOverlay').style.display='none';show(0)};
document.querySelector('#next').onclick=()=>show(current+1);document.querySelector('#previous').onclick=()=>show(current-1);
document.querySelector('#second').onclick=()=>{document.querySelector('#large').src=document.querySelector('#second').currentSrc;document.querySelector('#lightbox').hidden=false};
document.querySelector('#close').onclick=()=>document.querySelector('#lightbox').hidden=true;
document.querySelector('#playVoice').onclick=()=>document.querySelector('#voice').play();
show(0);
</script></body></html>`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
// Two seconds of silent, mono 8 kHz PCM; tests need actual playable audio.
const wav=Buffer.alloc(32044);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(32000,40);

for(const mobile of [false,true])test(`only opened slides fetch media; playback, lightbox and back navigation work (${mobile?'mobile':'desktop'})`,async({page})=>{
  if(mobile)await page.setViewportSize({width:390,height:844});
  const requests=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const video=await readFile(new URL('../fixtures/media/deferred.mp4',import.meta.url));
  await page.route('**/test-media/**',async route=>{
    const url=route.request().url();requests.push(new URL(url).pathname);
    await route.fulfill({body:url.endsWith('.mp4')?video:url.endsWith('.wav')?wav:png,contentType:url.endsWith('.mp4')?'video/mp4':url.endsWith('.wav')?'audio/wav':'image/png',headers:{'Cache-Control':'public,max-age=3600'}});
  });
  await page.route('**/lazy-deck',route=>route.fulfill({body:deferPresentationMedia(deck),contentType:'text/html'}));
  await page.goto('/lazy-deck');
  await page.waitForTimeout(250);
  expect(requests).toEqual([]);
  await page.getByRole('button',{name:'Start presentation'}).click();
  await expect.poll(()=>page.locator('#first').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(()=>page.locator('#intro').evaluate(video=>video.currentTime)).toBeGreaterThan(0);
  expect(requests.every(url=>/\/(first.png|intro.mp4)$/.test(url))).toBe(true);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect.poll(()=>page.locator('#second').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(()=>page.locator('#movie').evaluate(video=>video.currentTime)).toBeGreaterThan(0);
  expect(requests).toContain('/test-media/picture.png');
  expect(requests).toContain('/test-media/poster.png');
  expect(requests).not.toContain('/test-media/fallback.png');
  await page.getByRole('button',{name:'Play audio'}).click();
  await expect.poll(()=>page.locator('#voice').evaluate(audio=>audio.currentTime)).toBeGreaterThan(0);
  expect(await page.locator('#intro').evaluate(video=>video.paused)).toBe(true);
  await page.locator('#second').click();
  await expect(page.locator('#lightbox')).toBeVisible();
  await expect.poll(()=>page.locator('#large').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  const firstFetches=requests.filter(url=>url.endsWith('/first.png')).length;
  await page.getByRole('button',{name:'Previous',exact:true}).click();
  await expect(page.locator('.slide.active h1')).toHaveText('First slide');
  await expect.poll(()=>page.locator('#intro').evaluate(video=>video.paused)).toBe(false);
  expect(requests.filter(url=>url.endsWith('/first.png')).length).toBe(firstFetches);
  expect(requests.some(url=>url.includes('unvisited'))).toBe(false);
  expect(errors).toEqual([]);
});

test('scrolling decks load only media entering the viewport',async({page})=>{
  const requested=[];
  await page.route('**/test-media/**',r=>{requested.push(new URL(r.request().url()).pathname);return r.fulfill({body:png,contentType:'image/png'});});
  const html='<html><head><style>body{margin:0}section{height:120vh}</style></head><body><section data-slide="first"><img src="/test-media/first.png"></section><section data-slide="second"><img src="/test-media/second.png"></section></body></html>';
  await page.route('**/scroll-deck',r=>r.fulfill({body:deferPresentationMedia(html),contentType:'text/html'}));
  await page.goto('/scroll-deck');
  await expect.poll(()=>requested.length).toBe(1);
  expect(requested).toEqual(['/test-media/first.png']);
  await page.locator('[data-slide="second"]').scrollIntoViewIfNeeded();
  await expect.poll(()=>requested.length).toBe(2);
});

for(const mobile of [false,true])test(`admin srcdoc preview uses deferred media (${mobile?'mobile':'desktop'})`,async({page})=>{
  if(mobile)await page.setViewportSize({width:390,height:844});
  const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/test-media/**',route=>{
    requests.push(new URL(route.request().url()).pathname);
    return route.fulfill({body:png,contentType:'image/png'});
  });
  await page.route('**/preview-fixture',route=>route.fulfill({body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><iframe id="preview" style="width:100%;height:90vh;border:0" title="Presentation preview"></iframe></body></html>',contentType:'text/html'}));
  await page.goto('/preview-fixture');
  const html='<html><head><style>body{margin:0}.slide{display:none}.slide.active{display:block}img{width:200px;height:100px}</style></head><body><section class="slide active"><h1>First</h1><img src="/test-media/first.png"></section><section class="slide"><h1>Second</h1><img src="/test-media/second.png"></section><button onclick="document.querySelectorAll(\'.slide\').forEach(s=>s.classList.toggle(\'active\'))">Next slide</button></body></html>';
  await page.locator('#preview').evaluate((iframe,html)=>iframe.srcdoc=html,deferPresentationMedia(html));
  const frame=page.frameLocator('#preview');
  await expect.poll(()=>frame.locator('.active img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  expect(requests).toEqual(['/test-media/first.png']);
  await frame.getByRole('button',{name:'Next slide'}).click();
  await expect.poll(()=>frame.locator('.active img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  expect(requests).toEqual(['/test-media/first.png','/test-media/second.png']);expect(errors).toEqual([]);
});
