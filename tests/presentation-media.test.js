import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'parse5';
import {deferPresentationMedia} from '../src/presentations/deferred-media.js';
import {createApp} from '../server.js';

function elements(html){
  const found=[];
  function walk(node){if(node.tagName)found.push({tag:node.tagName,attrs:Object.fromEntries(node.attrs.map(a=>[a.name,a.value]))});node.childNodes?.forEach(walk);}
  walk(parse(html));return found;
}

test('defers slide media before parsing without rewriting author scripts, text or unrelated images',()=>{
  const script='<script>const sample = `<img src="example.jpg">`; window.deckReady=true;</script>';
  const input=`<!doctype html><html><head><link rel="preload" as="image" href="large.jpg"></head><body><img id="logo" src="logo.svg"><section class="slide active"><picture><source srcset="large.webp 2x"><IMG id="photo" SRC='small.jpg?a=1&amp;b=2' srcset="large.jpg 2x" /></picture><video autoplay preload="auto" poster="poster.jpg"><source src="movie.mp4"><track src="captions.vtt"></video><audio src="voice.mp3" preload="metadata"></audio>${script}</section></body></html>`;
  const html=deferPresentationMedia(input),nodes=elements(html);
  const managed=nodes.filter(n=>'data-sv-media' in n.attrs);
  assert.equal(managed.length,6);
  for(const node of managed)for(const attr of ['src','srcset','poster','autoplay'])assert.equal(node.attrs[attr],undefined);
  assert.equal(nodes.find(n=>n.attrs.id==='photo').attrs['data-sv-src'],'small.jpg?a=1&b=2');
  assert.equal(nodes.find(n=>n.attrs.id==='logo').attrs.src,'logo.svg');
  assert.equal(nodes.find(n=>n.tag==='link').attrs.href,undefined);
  for(const node of nodes.filter(n=>['video','audio'].includes(n.tag)))assert.equal(node.attrs.preload,'none');
  assert.ok(html.includes(script));
  assert.ok(html.indexOf('/presentation-system/media.js')<html.indexOf('<body>'));
  assert.equal(deferPresentationMedia(html),html);
});

test('leaves non-slide documents unchanged and supports an implicit head',()=>{
  const plain='<img src="logo.png"><script>document.title="Title"</script>';
  assert.equal(deferPresentationMedia(plain),plain);
  const html=deferPresentationMedia('<section data-slide="intro"><img src="photo.png"></section>');
  assert.ok(html.startsWith('<script src="/presentation-system/media.js"></script>'));
  assert.equal(elements(html).find(n=>n.tag==='img').attrs['data-sv-src'],'photo.png');
});

test('existing private presentation HTML is deferred at delivery with its sandbox intact',async()=>{
  const server=createApp({env:{PRESENTATIONS_REMOTE:'true',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'test-secret'},send:async url=>{
    if(url.includes('/presentation_projects?'))return Response.json([{deck_slug:'example',status:'published',access_mode:'unlisted',source_type:'standalone',source_bucket:'presentation-source',source_path:'example/index.html'}]);
    return new Response('<html><head></head><body><section class="slide active"><img src="https://test.supabase.co/photo.jpg"><video src="https://test.supabase.co/movie.mp4" preload="auto"></video></section></body></html>');
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/p/example?sv_gate=1`);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,/data-sv-src="https:\/\/test.supabase.co\/photo.jpg"/);
    assert.match(html,/presentation-system\/media.js/);
    assert.match(response.headers.get('content-security-policy'),/sandbox allow-scripts/);
    assert.match(response.headers.get('cache-control'),/no-store/);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
