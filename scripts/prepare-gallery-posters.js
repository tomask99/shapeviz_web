import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createApp } from '../server.js';

const server = createApp({ env: {} });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const id of ['video_creative_02', 'video_creative_03']) {
    await page.goto(`http://127.0.0.1:${server.address().port}/media/gallery/${id}.mp4`);
    const result = await page.locator('video').evaluate(async video => {
      if (video.readyState < 2) await new Promise(resolve => video.addEventListener('loadeddata', resolve, { once: true }));
      await new Promise(resolve => {
        video.addEventListener('seeked', resolve, { once: true });
        video.currentTime = Math.min(2, video.duration / 2);
      });
      video.pause();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      return { data: canvas.toDataURL('image/png').split(',')[1], width: canvas.width, height: canvas.height, duration: video.duration };
    });
    await sharp(Buffer.from(result.data, 'base64')).resize({ width: 640 }).webp({ quality: 82 }).toFile(`public/media/gallery/${id}-poster.webp`);
    console.log(`${id}: ${result.width}x${result.height}, ${result.duration}s`);
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
