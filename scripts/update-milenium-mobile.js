// Prepare a reviewable HTML revision, then publish only that verified revision.
// Run with --env-file-if-exists=.env; keys never enter the generated HTML.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {getPresentationProject, getPrivatePresentationSource, uploadStorageObject} from '../src/presentations/remote.js';

const directory = new URL('../.cache/milenium-mobile/', import.meta.url);
const env = process.env;
const sha = text => createHash('sha256').update(text).digest('hex');
const patchRoot = new URL('../src/presentations/customizations/', import.meta.url);
const css = await readFile(new URL('milenium-mobile.css', patchRoot), 'utf8');
const js = await readFile(new URL('milenium-mobile.js', patchRoot), 'utf8');
function customize(source) {
  // Replace only our previous additions; keep all original markup and scripts.
  const clean = source.replace(/<style id="milenium-mobile-layout">[\s\S]*?<\/style>\s*/g, '')
    .replace(/<script id="milenium-mobile-controls">[\s\S]*?<\/script>\s*/g, '');
  if (!clean.includes('</head>') || !clean.includes('</body>')) throw new Error('Unexpected standalone HTML');
  return clean.replace('</head>', `<style id="milenium-mobile-layout">\n${css}\n</style>\n</head>`)
    .replace('</body>', `<script id="milenium-mobile-controls">\n${js}\n</script>\n</body>`);
}
const project = await getPresentationProject('milenium', {env});
if (project?.source_type !== 'standalone' || project.status !== 'published') throw new Error('Expected published standalone Milenium presentation');
const source = await getPrivatePresentationSource(project, {env});
if (!process.argv.includes('--publish')) {
  await mkdir(directory, {recursive: true});
  await writeFile(new URL('before.html', directory), source);
  await writeFile(new URL('project-before.json', directory), JSON.stringify(project, null, 2));
  const html = customize(source);
  await writeFile(new URL('after.html', directory), html);
  await writeFile(new URL('prepared.json', directory), JSON.stringify({before: sha(source), after: sha(html)}));
  console.log('Prepared .cache/milenium-mobile/after.html. Production is unchanged.');
} else {
  const baseline = JSON.parse(await readFile(new URL('project-before.json', directory), 'utf8'));
  const prepared = JSON.parse(await readFile(new URL('prepared.json', directory), 'utf8'));
  const html = await readFile(new URL('after.html', directory), 'utf8');
  if (project.source_path !== baseline.source_path || project.updated_at !== baseline.updated_at || sha(source) !== prepared.before) throw new Error('Presentation changed since preparation; prepare and verify again');
  if (sha(html) !== prepared.after || html !== customize(source)) throw new Error('Prepared HTML or customization changed; prepare and verify again');
  const object = `milenium/${sha(html).slice(0, 32)}/index.html`;
  await uploadStorageObject({bucket: project.source_bucket, object, body: html, contentType: 'text/html; charset=utf-8', env});
  const stored = await getPrivatePresentationSource({...project, source_path: object}, {env});
  if (sha(stored) !== prepared.after) throw new Error('Uploaded source failed checksum verification');
  const scopes = [...(project.content?._storageScopes || [])];
  if (!scopes.some(s => s.bucket === project.source_bucket && s.path === project.source_path)) scopes.push({bucket: project.source_bucket, path: project.source_path});
  const query = new URLSearchParams({deck_slug: 'eq.milenium', source_path: `eq.${baseline.source_path}`, updated_at: `eq.${baseline.updated_at}`});
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/presentation_projects?${query}`, {
    method: 'PATCH', headers: {apikey: env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation'},
    body: JSON.stringify({source_path: object, content: {...project.content, _storageScopes: scopes}})
  });
  if (!response.ok) throw new Error(`Registry update failed: ${response.status}`);
  const rows = await response.json();
  if (rows.length !== 1) throw new Error('Concurrent modification prevented publishing');
  const saved = await getPresentationProject('milenium', {env});
  if (saved.source_path !== object) throw new Error('Published registry verification failed');
  await writeFile(new URL('published.json', directory), JSON.stringify({source_path: object, previous_source_path: baseline.source_path, sha256: sha(html), updated_at: saved.updated_at}, null, 2));
  console.log(`Published https://www.shapeviz.com/p/milenium\nOriginal source retained: ${baseline.source_path}\nNew source: ${object}`);
}
