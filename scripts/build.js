import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { discoverProjects } from '../src/presentations/registry.js';
import { validateUiIcons } from './validate-ui-icons.js';
import {buildPresentationBundles} from './lib/presentation-bundles.js';
import {sitemapXml,robotsText} from '../src/website/seo.js';
await validateUiIcons();
await import('./build-article-editor.js');
const required = ['public/index.html', 'public/styles.css', 'public/app.js', 'public/media/milenium-interior-720.webp', 'public/media/milenium-interior-1440.webp', 'public/media/milenium-motion.mp4', 'public/media/milenium-motion-poster.webp', 'public/media/shapeviz-logo.webp'];
for (const file of required) await stat(file);
const projects = process.env.PRESENTATIONS_REMOTE === 'true' ? [] : await discoverProjects(path.resolve('presentations'));
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
// Vercel serves existing static files before rewrites. The homepage template
// belongs in the page function's includeFiles, not at the public root, where it
// would bypass the live content, language selection and no-store response.
if (process.env.VERCEL === '1') await rm(path.resolve('dist/index.html'));
await mkdir('dist/admin/vendor',{recursive:true});
await cp('.cache/articles/editor.js','dist/admin/vendor/article-editor.js');
await cp('.cache/articles/LICENSE.txt','dist/admin/vendor/article-editor-LICENSE.txt');
await writeFile('dist/sitemap.xml', sitemapXml());
await writeFile('dist/robots.txt', robotsText());
await buildPresentationBundles();
await mkdir('dist/files/vendor', { recursive: true });
await cp('node_modules/megajs/dist/main.browser-es.mjs','dist/files/vendor/megajs.mjs');
await cp('node_modules/megajs/LICENSE','dist/files/vendor/MEGAJS-LICENSE.txt');
for (const project of projects) {
  if (project.status !== 'published') continue;
  if (project.access.mode !== 'unlisted') throw new Error(`${project.slug}: protected delivery is not configured`);
  const destination = path.join('dist', 'p', project.slug);
  await cp(project.directory, destination, {
    recursive: true,
    filter: source => path.basename(source) !== 'project.json'
  });
  console.log(`Built /p/${project.slug}`);
}
console.log('Built SHAPEVIZ into dist/. Run npm start to preview the production build.');
