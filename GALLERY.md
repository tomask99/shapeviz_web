# Portfolio gallery

The expandable collection is a single curated grid of 11 works: three lifestyle
images, three studio images, three details, and both films. There are no category
tabs or sections to switch. The curated IDs and display order live in the
selection array in scripts/prepare-gallery.js. All originals and prepared media
remain available; unselected files are not included or requested by the page.

The desktop composition alternates wide images with smaller supporting frames.
Photos use intentional crops and per-image focal points; clicking opens the full
image. On mobile the photographs use landscape frames in one column. Videos use
object-fit: contain on desktop and their natural aspect ratio on mobile, so the
full video stays visible without cropping. Rounded corners and the existing
hover interaction are retained.

Scrolling is natural with no scroll animations or pinned scenes. The close
control remains available during browsing and restores focus and scroll position
to the gallery trigger. Images are responsive WebP with lazy loading; gallery
media is not requested until expansion. Videos autoplay muted when visible,
pause offscreen/on collapse, and respect reduced motion.

## Updating the gallery

Run these commands in order after changing the originals:

```powershell
node scripts/prepare-gallery.js
node scripts/optimize-gallery-videos.js path/to/ffmpeg.exe
node scripts/prepare-gallery-posters.js
npx playwright test tests/browser/gallery.spec.js tests/browser/site.spec.js
npm run build
```

For layout-only changes, run `node scripts/prepare-gallery.js --markup-only`;
this preserves the optimized media.

The first script prepares WebP files, copies the original videos, generates
`public/media/gallery/manifest.json`, and replaces only the gallery block in
`public/index.html`. Update its descriptions/category rules for new media.
The optimization script converts the two current videos to 1080px-high H.264,
30fps, with fast-start metadata and retained AAC audio where available.
The poster script uses local Chrome to capture frames; it does not contact Supabase.
Prepared files are committed so production builds need neither Chrome nor FFmpeg.

Current image originals total 59.4 MB; the largest WebP variants total 2.9 MB.
Videos total 2.6 MB after optimization, down from 58.1 MB.
