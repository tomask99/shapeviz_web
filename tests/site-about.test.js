import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'parse5';
import {siteContentFixture} from './helpers/site-content-fixture.js';
import {defaultAbout} from '../public/site/about-content.js';

test('profile edits require an owner, validate both languages, survive reload and render as text', async () => {
  const fixture = await siteContentFixture();
  try {
    assert.equal((await fixture.request('site-about-list', undefined, '')).status, 401);
    assert.equal((await fixture.request('site-about-list', undefined, 'visitor')).status, 403);
    const initial = await (await fixture.request('site-about-list')).json();
    assert.deepEqual(initial, {about: defaultAbout, version: 1});
    const about = structuredClone(initial.about);
    about.sk.bio = 'Nový slovenský profil <img src=x onerror=alert(1)> & text\n\nDruhý odsek.\nĎalší riadok.\n\nTretí odsek.\n\nŠtvrtý odsek.';
    about.en.bio = 'An updated English profile.';
    about.sk.imageAlt = 'Portrait " onerror="alert(1)';
    assert.equal((await fixture.request('site-about-save', {about, version: 1}, 'visitor')).status, 403);
    assert.equal((await fixture.request('site-about-save', {about: {sk: about.sk}, version: 1})).status, 400);
    assert.equal((await fixture.request('site-about-save', {about: {...about, en: {...about.en, bio: 'x'.repeat(10001)}}, version: 1})).status, 400);
    assert.equal((await fixture.request('site-about-save', {about, version: 1})).status, 200);
    assert.deepEqual((await (await fixture.request('site-about-list')).json()).about, about);
    assert.equal((await fixture.request('site-about-save', {about, version: 1})).status, 409);
    const companies = await (await fixture.request('site-content-list')).json();
    assert.equal(companies.version, 1);
    assert.equal((await fixture.request('site-content-save', {companies: companies.companies, version: companies.version})).status, 200);
    assert.equal((await (await fixture.request('site-about-list')).json()).version, 2);
    for (const locale of ['sk','en']) {
      const response = await fetch(fixture.origin + '/' + locale);
      assert.equal(response.status, 200);
      const html = await response.text();
      const document = parse(html);
      const fields = {};
      const visit = node => { const key = node.attrs?.find(a=>a.name==='data-about')?.value; if (key) fields[key]=node; node.childNodes?.forEach(visit); };
      visit(document);
      const paragraphs = about[locale].bio.split('\n\n');
      assert.equal(fields.bio.childNodes.length, paragraphs.length);
      fields.bio.childNodes.forEach((node,index) => {
        assert.equal(node.tagName, 'p');
        assert.equal(node.childNodes.length, 1);
        assert.equal(node.childNodes[0].nodeName, '#text');
        assert.equal(node.childNodes[0].value, paragraphs[index]);
      });
      assert.equal(fields.imageAlt.attrs.find(a=>a.name==='alt').value, about[locale].imageAlt);
      assert.ok(!fields.imageAlt.attrs.some(a=>a.name==='onerror'));
    }
    const responses = await Promise.all([
      fixture.request('site-about-save', {about, version: 2}),
      fixture.request('site-about-save', {about, version: 2})
    ]);
    assert.deepEqual(responses.map(r=>r.status).sort(), [200,409]);
    fixture.setUnavailable(true);
    const fallback = await (await fetch(fixture.origin + '/sk')).text();
    assert.ok(fallback.includes(defaultAbout.sk.bio.split('\n\n')[0]));
    assert.ok(!fallback.includes(about.sk.bio));
  } finally { await fixture.close(); }
});

test('existing three-field profiles open as one bio without losing saved text or headings', async () => {
  const fixture = await siteContentFixture();
  try {
    const legacy = structuredClone(defaultAbout);
    for (const value of Object.values(legacy)) {
      [value.intro,value.focus,value.collaborations] = value.bio.split('\n\n');
      value.collaborations = 'A previously saved collaboration paragraph.';
      delete value.bio;
    }
    legacy.sk.heading = 'MÔJ VLASTNÝ NADPIS';
    legacy.sk.intro = 'Môj už uložený úvod.';
    await fixture.db.query('update site_content set about=$1 where id=1', [JSON.stringify(legacy)]);
    const saved = await (await fixture.request('site-about-list')).json();
    assert.equal(saved.about.sk.bio, [legacy.sk.intro,legacy.sk.focus,legacy.sk.collaborations].join('\n\n'));
    assert.equal(saved.about.sk.heading, legacy.sk.heading);
    assert.equal((await fixture.request('site-about-save', saved)).status, 200);
    const page = await (await fetch(fixture.origin+'/sk')).text();
    assert.ok(page.includes(legacy.sk.intro));
    assert.ok(page.includes(legacy.sk.heading));
  } finally { await fixture.close(); }
});
