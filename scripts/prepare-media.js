import sharp from 'sharp';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/media', { recursive: true });
for (const width of [720, 1440]) {
  await sharp('assets/lifestyle_03.png').resize({ width }).webp({ quality: 84 }).toFile(`public/media/milenium-interior-${width}.webp`);
}
await sharp('assets/shapeviz logo.png').resize({ width: 360 }).webp({ lossless: true }).toFile('public/media/shapeviz-logo.webp');
await copyFile('assets/video_creative_01.mp4', 'public/media/milenium-motion.mp4');
