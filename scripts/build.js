import { cp, mkdir, stat } from 'node:fs/promises';
const required = ['public/index.html', 'public/styles.css', 'public/app.js', 'public/media/milenium-interior-720.webp', 'public/media/milenium-interior-1440.webp', 'public/media/milenium-motion.mp4', 'public/media/milenium-motion-poster.webp', 'public/media/shapeviz-logo.webp'];
for (const file of required) await stat(file);
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
console.log('Built SHAPEVIZ into dist/. Run npm start to preview the production build.');
