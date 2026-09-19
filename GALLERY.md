# Portfolio gallery

The gallery below the two featured projects expands into the page's normal scroll.
Its sticky collapse button returns focus and scroll position to the opening button.
All 22 files in `assets/galery/` are represented: 20 images and two videos.
The original media remain untouched. Only `public/media/gallery/` is served.

Images have up to three WebP sizes (640, 1280, 1920 pixels wide, without upscaling).
No gallery media is requested while initially collapsed. After expansion, images
load lazily and videos load near the viewport, autoplay muted, and pause offscreen,
on collapse, or while an image is enlarged. Reduced motion disables autoplay,
parallax, reveals and hover transforms; video playback can still be started manually.

## Updating the gallery

Run these commands in order after changing the originals:

```powershell
node scripts/prepare-gallery.js
node scripts/optimize-gallery-videos.js path/to/ffmpeg.exe
node scripts/prepare-gallery-posters.js
npx playwright test tests/browser/gallery.spec.js tests/browser/site.spec.js
npm run build
```

The first script prepares WebP files, copies the original videos, generates
`public/media/gallery/manifest.json`, and replaces only the gallery block in
`public/index.html`. Update its descriptions/category rules for new media.
The optimization script converts the two current videos to 1080px-high H.264,
30fps, with fast-start metadata and retained AAC audio where available.
The poster script uses local Chrome to capture frames; it does not contact Supabase.
Prepared files are committed so production builds need neither Chrome nor FFmpeg.

Current image originals total 59.4 MB; the largest WebP variants total 2.9 MB.
Videos total 2.6 MB after optimization, down from 58.1 MB.
