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
    about.sk.intro = 'Nový slovenský profil <img src=x onerror=alert(1)> & text';
    about.en.intro = 'An updated English profile.';
    about.sk.imageAlt = 'Portrait " onerror="alert(1)';
    assert.equal((await fixture.request('site-about-save', {about, version: 1}, 'visitor')).status, 403);
    assert.equal((await fixture.request('site-about-save', {about: {sk: about.sk}, version: 1})).status, 400);
    assert.equal((await fixture.request('site-about-save', {about: {...about, en: {...about.en, intro: 'x'.repeat(2001)}}, version: 1})).status, 400);
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
      assert.equal(fields.intro.childNodes.length, 1);
      assert.equal(fields.intro.childNodes[0].nodeName, '#text');
      assert.equal(fields.intro.childNodes[0].value, about[locale].intro);
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
    assert.ok(fallback.includes(defaultAbout.sk.intro));
    assert.ok(!fallback.includes(about.sk.intro));
  } finally { await fixture.close(); }
});
