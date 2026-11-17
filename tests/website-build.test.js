import test from 'node:test';
import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

test('Vercel homepage cannot shadow the live content rewrite with a static index', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await promisify(execFile)(process.execPath, ['scripts/build.js'], {
    cwd:root, env:{...process.env, VERCEL:'1'}, timeout:120000,
  });
  await assert.rejects(access(new URL('../dist/index.html', import.meta.url)), {code:'ENOENT'});
  await access(new URL('../dist/styles.css', import.meta.url));
  await access(new URL('../dist/admin/index.html', import.meta.url));
  await access(new URL('../public/index.html', import.meta.url));
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.rewrites.find(rule => rule.source === '/').destination, '/api/site-events?route=page');
  assert.match(config.functions['api/site-events.js'].includeFiles, /index\.html/);
});
