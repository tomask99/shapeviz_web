import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultGallery, validateGallery} from '../src/website/gallery.js';
import {siteContentFixture} from './helpers/site-content-fixture.js';

test('gallery validates trusted media, metadata and unique IDs', () => {
  const env = {SUPABASE_URL:'https://test.supabase.co'};
  assert.equal(validateGallery(defaultGallery, env).length, 11);
  for (const items of [null, [null], [defaultGallery[0], defaultGallery[0]], [{...defaultGallery[0], src:'javascript:alert(1)'}], [{...defaultGallery[0], positionX:101}], [{...defaultGallery[0], size:'film'}]]) assert.throws(() => validateGallery(items, env), {status:400});
});

test('gallery owner saves are atomic and independent of companies, public HTML uses saved ordering', async () => {
  const fixture = await siteContentFixture();
  try {
    assert.equal((await fixture.request('site-gallery-list', undefined, '')).status, 401);
    assert.equal((await fixture.request('site-gallery-upload', {uploadId:crypto.randomUUID()}, 'visitor')).status, 403);
    const initial = await (await fixture.request('site-gallery-list')).json();
    assert.equal(initial.items.length, 11);
    const signed = await (await fixture.request('site-gallery-upload', {uploadId:crypto.randomUUID()})).json();
    assert.match(signed.image.publicUrl, /site-gallery\/uploads\/.*\/image.webp$/);
    const added = {...initial.items[0], id:'uploaded', src:signed.thumb.publicUrl, width:1200, height:800, caption:'New <image>', alt:'New image'};
    const items = [added, initial.items[1], initial.items[0], ...initial.items.slice(2)];
    const results = await Promise.all([
      fixture.request('site-gallery-save', {version:initial.version, items}),
      fixture.request('site-gallery-save', {version:initial.version, items})
    ]);
    assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
    const saved = await (await fixture.request('site-gallery-list')).json();
    assert.equal(saved.version, 2);
    assert.equal((await (await fixture.request('site-content-list')).json()).version, 1);
    const response = await fetch(fixture.origin + '/en');
    const html = await response.text();
    assert.ok(html.includes('New &lt;image&gt;'));
    assert.ok(html.includes('10 IMAGES / 02 FILMS'));
    assert.ok(html.includes(`data-lightbox="${signed.image.publicUrl}"`));
    assert.match(response.headers.get('content-security-policy'), /img-src[^;]+https:\/\/test.supabase.co/);
    assert.equal((await fixture.request('site-gallery-save', {version:2, items:[]})).status, 200);
    assert.match(await (await fetch(fixture.origin + '/en')).text(), /00 IMAGES \/ 00 FILMS/);
  } finally {await fixture.close();}
});
