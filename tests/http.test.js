import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readJson, requestOrigin } from '../src/http.js';

test('handles platform-parsed JSON and raw Node streams with size limits', async () => {
  assert.deepEqual(await readJson({body:{name:'Shapeviz'}}), {name:'Shapeviz'});
  const stream = Readable.from([Buffer.from('{"ok":true}')]);
  assert.deepEqual(await readJson(stream), {ok:true});
  await assert.rejects(readJson({body:{text:'x'.repeat(9000)}}), {status:413});
  await assert.rejects(readJson(Readable.from([Buffer.alloc(9000)])), {status:413});
  await assert.rejects(readJson({body:'{'}), SyntaxError);
});

test('Vercel origins use HTTPS for the requested production or preview host', () => {
  const req = {headers:{host:'preview.vercel.app'}};
  assert.equal(requestOrigin(req,{VERCEL:'1',SITE_URL:'https://shapeviz.com'}),'https://preview.vercel.app');
  assert.equal(requestOrigin(req,{SITE_URL:'https://shapeviz.com/'}),'https://shapeviz.com');
});
