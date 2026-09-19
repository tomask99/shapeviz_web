import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const slug = process.argv[2];
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) {
  throw new Error('Usage: npm run presentation:new -- lowercase-url-slug');
}
const destination = path.resolve('presentations', slug);
await mkdir(destination);
await cp('presentations/_template/index.example.html', path.join(destination, 'index.html'));
const htmlPath = path.join(destination, 'index.html');
await writeFile(htmlPath, (await readFile(htmlPath, 'utf8')).replaceAll('data-deck="company-x"', `data-deck="${slug}"`).replace('<head>', `<head>\n<base href="/p/${slug}/">`));
const template = JSON.parse(await readFile('presentations/_template/project.example.json', 'utf8'));
template.id = slug;
template.slug = slug;
await writeFile(path.join(destination, 'project.json'), `${JSON.stringify(template, null, 2)}\n`);
console.log(`Created presentations/${slug}/ as a draft.`);
