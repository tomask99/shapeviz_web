# Portfolio gallery

The expandable collection below the featured projects uses natural page scrolling.
Four accessible category tabs show Lifestyle (10), Details & materials (6), Studio
(4), and Films (2). All 22 source files remain included. The category navigation
and close control stay available while browsing; closing restores focus and scroll
position to the opening button.

There are no pinned scenes, scroll listeners, parallax, fading, or scroll-driven
transforms in the gallery. Aligned grids, consistent image frames, spacious type
and understated dividers provide the visual structure. The existing media hover,
rounded clipping and image lightbox are retained. Details use three desktop
columns, other categories two; mobile uses one column.

Images have up to three WebP sizes (640, 1280, 1920 pixels wide, without upscaling).
No gallery media is requested while initially collapsed. Only the selected
category receives image sources, then browser lazy loading handles images below
the viewport. Videos autoplay muted when visible and pause on category changes,
collapse, backgrounding or lightbox opening. Reduced motion disables autoplay
and hover movement. Originals remain untouched; public/media/gallery is served.

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
