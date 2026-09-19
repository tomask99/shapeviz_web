# Portfolio gallery

The gallery below the featured projects opens a pinned, full-viewport scene.
Natural document scroll advances 11 pairs in place, then resumes the rest of the site.
Its persistent collapse button returns focus and scroll position to the opening button.
All 22 files in `assets/galery/` are represented: 20 images and two videos.
The original media remain untouched. Only `public/media/gallery/` is served.

Images have up to three WebP sizes (640, 1280, 1920 pixels wide, without upscaling).
No gallery media is requested while initially collapsed. After expansion, images
load for the current and next pair; videos autoplay muted only in the active pair and pause offscreen,
on collapse, or while an image is enlarged. Reduced motion disables autoplay,
scroll transforms, reveals and hover transforms; video playback can still be started manually.

Pairs align side by side on desktop and stack within the scene on mobile. Each
transition uses 280–460px of scroll (48% of viewport height). The outgoing pair
fades and separates left/right while the next rises from below. A short 65ms
response smooths wheel input without trapping scrolling. Previous/Next controls
also advance pairs. Inactive pages are inert; their videos cannot play. Transforms
run on outer slots, independently of the media hover. Reduced motion uses a
static gallery instead of pinning. Original HTML sections remain the generated
source and are regrouped into pairs by `public/gallery.js`.

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
