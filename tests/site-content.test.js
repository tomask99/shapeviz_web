import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'parse5';
import {companyProjectUrl} from '../public/site/company-url.js';
import {validateCompanies} from '../src/website/content.js';
import {siteContentFixture} from './helpers/site-content-fixture.js';

function companyList(html) {
  let list;
  function visit(node) {
    if (node.attrs?.some(attribute => attribute.name === 'class' && attribute.value === 'client-list')) list = node;
    node.childNodes?.forEach(visit);
  }
  visit(parse(html));
  return list.childNodes.filter(node => node.tagName === 'li');
}

test('company links accept project paths and reject executable URLs and invalid entries', () => {
  assert.equal(companyProjectUrl(' https://example.com/project?a=1&b=2 '), 'https://example.com/project?a=1&b=2');
  assert.equal(companyProjectUrl('/p/project?source=clients#slide'), '/p/project?source=clients#slide');
  assert.equal(companyProjectUrl(''), '');
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', '//evil.test', '/a/..//evil.test', '/\\evil.test', 'https://user:pass@example.com', 'https://example.com/a\nb', 'https://example.com/' + 'é'.repeat(400), 'not a URL']) {
    assert.throws(() => companyProjectUrl(url));
  }
  const company = {id: 'example', name: ' Example ', url: ''};
  assert.equal(validateCompanies([company])[0].name, 'Example');
  for (const companies of [null, [null], [company, company], [{...company, name: ''}], [{...company, name: 'a'.repeat(121)}], [{...company, url: 'javascript:alert(1)'}]]) {
    assert.throws(() => validateCompanies(companies), {status: 400});
  }
});

test('owner edits persist atomically and appear in localized server HTML with safe links', async () => {
  const fixture = await siteContentFixture();
  try {
    assert.equal((await fixture.request('site-content-list', undefined, '')).status, 401);
    assert.equal((await fixture.request('site-content-list', undefined, 'visitor')).status, 403);
    const initial = await (await fixture.request('site-content-list')).json();
    const source = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    assert.equal(initial.companies.length, companyList(source).length);
    for (const company of initial.companies) assert.ok(source.includes(`>${company.name}</span>`));
    const companies = [
      {id: 'safe', name: 'Studio <script>alert(1)</script> & Co', url: 'https://example.com/project?a=1&b=2'},
      {id: 'internal', name: 'Internal', url: '/p/example'},
      {id: 'no-link', name: 'No project yet', url: ''}
    ];
    assert.equal((await fixture.request('site-content-save', {version: initial.version, companies}, 'visitor')).status, 403);
    const savedResponse = await fixture.request('site-content-save', {version: initial.version, companies});
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json();
    assert.equal(saved.version, initial.version + 1);
    assert.deepEqual((await (await fixture.request('site-content-list')).json()).companies, companies);
    assert.equal((await fixture.request('site-content-save', {version: initial.version, companies: []})).status, 409);
    assert.equal((await fixture.request('site-content-save', {version: saved.version, companies: [{...companies[0], url: 'javascript:alert(1)'}]})).status, 400);
    for (const route of ['/', '/sk', '/en', '/api/site-events?route=page&locale=en']) {
      const response = await fetch(fixture.origin + route);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /no-store/);
      const html = await response.text();
      assert.ok(html.includes('>Studio &lt;script&gt;alert(1)&lt;/script&gt; &amp; Co</span>'));
      const rows = companyList(html);
      assert.equal(rows.length, 3);
      const link = rows[0].childNodes.find(node => node.tagName === 'a');
      assert.equal(link.attrs.find(attribute => attribute.name === 'href').value, companies[0].url);
      assert.equal(link.attrs.find(attribute => attribute.name === 'target').value, '_blank');
      assert.match(link.attrs.find(attribute => attribute.name === 'rel').value, /noopener/);
      assert.ok(!rows[2].childNodes.some(node => node.tagName === 'a'));
    }
    const writes = await Promise.all([
      fixture.request('site-content-save', {version: saved.version, companies: [companies[0]]}),
      fixture.request('site-content-save', {version: saved.version, companies: [companies[1]]})
    ]);
    assert.deepEqual(writes.map(response => response.status).sort(), [200, 409]);
    const latest = await (await fixture.request('site-content-list')).json();
    assert.equal((await fixture.request('site-content-save', {version: latest.version, companies: []})).status, 200);
    assert.equal(companyList(await (await fetch(fixture.origin + '/en')).text()).length, 0);
    fixture.setUnavailable(true);
    assert.equal(companyList(await (await fetch(fixture.origin + '/en')).text()).length, initial.companies.length);
  } finally {
    await fixture.close();
  }
});

test('site content database grants keep writes behind the owner API', async () => {
  const fixture = await siteContentFixture();
  try {
    const result = await fixture.db.query("select relrowsecurity from pg_class where oid='public.site_content'::regclass");
    assert.equal(result.rows[0].relrowsecurity, true);
    for (const role of ['anon', 'authenticated']) {
      const privileges = await fixture.db.query("select has_table_privilege($1,'public.site_content','SELECT') as read, has_table_privilege($1,'public.site_content','UPDATE') as write", [role]);
      assert.deepEqual(privileges.rows[0], {read: false, write: false});
    }
  } finally {
    await fixture.close();
  }
});
