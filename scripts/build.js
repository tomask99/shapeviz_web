import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { discoverProjects } from '../src/presentations/registry.js';
const required = ['public/index.html', 'public/styles.css', 'public/app.js', 'public/media/milenium-interior-720.webp', 'public/media/milenium-interior-1440.webp', 'public/media/milenium-motion.mp4', 'public/media/milenium-motion-poster.webp', 'public/media/shapeviz-logo.webp'];
for (const file of required) await stat(file);
const projects = process.env.PRESENTATIONS_REMOTE === 'true' ? [] : await discoverProjects(path.resolve('presentations'));
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
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
