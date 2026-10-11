import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.js';

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const shopRewrite = config.rewrites.find(rule => rule.source === '/api/shop');

test('Vercel deploys within the 12-function budget and routes shop through an existing function', async () => {
  const files = await readdir(new URL('../api/', import.meta.url), {recursive:true});
  const functions = files.filter(file => /\.(js|ts)$/.test(file));
  assert.ok(functions.length <= 12, `Hobby deployment has ${functions.length} functions; maximum is 12`);
  assert.ok(shopRewrite);
  const target = new URL(shopRewrite.destination, 'http://localhost');
  assert.ok(functions.includes(target.pathname.slice('/api/'.length) + '.js'));
});

test('direct and rewritten shop requests preserve redaction, status query and analytics behavior', async () => {
  let launched = false;
  const calls = [];
  const server = createApp({
    env:{SUPABASE_URL:'https://test.supabase.co', SUPABASE_SECRET_KEY:'test'},
    send:async (url, options) => {
      calls.push({url, options});
      if (url.includes('/shop_catalog?')) return Response.json([{
        launched, categories:[{id:'models',name:'Models'}],
        products:[{id:'draft',visible:false,url:'https://gumroad.com/l/private-draft'}],
      }]);
      assert.ok(url.endsWith('/rpc/record_website_visit'));
      return Response.json(false);
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ['/api/shop', shopRewrite.destination]) {
      const response = await fetch(origin + route);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), {launched:false});
      assert.equal((await fetch(origin + route, {method:'POST'})).status, 405);
    }
    launched = true;
    for (const route of ['/api/shop', shopRewrite.destination]) {
      const statusUrl = new URL(route, origin);
      statusUrl.searchParams.set('status', '1');
      assert.deepEqual(await (await fetch(statusUrl)).json(), {launched:true});
      const catalog = await (await fetch(origin + route)).json();
      assert.deepEqual(catalog, {launched:true,categories:[{id:'models',name:'Models'}],products:[]});
    }
    const analytics = await fetch(origin + '/api/site-events', {
      method:'POST', headers:{Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify({sessionId:randomUUID(),seconds:10}),
    });
    assert.equal(analytics.status, 204);
    assert.equal(analytics.headers.get('x-analytics-status'), 'recorded');
    assert.equal(calls.filter(call => call.url.includes('/rpc/record_website_visit')).length, 1);
    assert.equal((await fetch(origin + '/api/site-events')).status, 405);
    assert.equal((await fetch(origin + '/api/admin?action=shop-preview')).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
