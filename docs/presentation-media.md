# Presentation media loading

Supabase-backed `/p/:slug` pages apply `deferPresentationMedia()` at delivery.
This covers existing uploaded HTML and newly created template presentations
without rewriting the originals in Storage.

Admin template previews apply the same transformation before returning HTML for
the preview iframe. Opening a template therefore does not fetch hidden-slide
images and videos either.

The server moves image, picture, video, audio and caption URLs into `data-sv-*`
attributes inside `.slide` or `[data-slide]` containers. It also removes media
preload hints. Doing this before delivery prevents the browser preload scanner
from downloading hidden slides, even while JavaScript is still loading.

`public/presentation-system/media.js` restores those attributes when the slide
opens. It recognizes `.active` decks and viewport-visible slides in scrolling
decks. A visible `#startOverlay` defers all slide media until the introduction
is dismissed. Existing play handlers, native controls and image/video lightboxes
keep working. Inactive slide audio/video is paused; hydrated media is retained
for back navigation and browser caching.

When adding a presentation:

- Keep media in slide containers and use normal `img`, `picture`, `video`,
  `audio`, `source` and `track` elements.
- Toggle `.active` for stacked decks, or use visible sections for scrolling decks.
- Avoid eager JavaScript fetches, CSS media backgrounds and media outside slides:
  these are not covered by the HTML attribute transformation.
- If slides are dynamically inserted, call `window.ShapevizMedia?.refresh()`.
- Local static fixture decks bypass the remote presentation handler. Preview
  the served `/p/:slug` route when checking deferred loading.

This reduces transfer for slides the visitor never opens. It does not undo
previously counted egress or reduce Storage size. Visited media still transfers
data unless the browser can reuse a cached response. A video request already in
progress may finish after navigation.

Regression checks:

```powershell
node --test tests/presentation-media.test.js
npx.cmd playwright test tests/browser/presentation-media.spec.js
```

The browser checks cover initial load, unvisited slides, responsive pictures,
video/audio playback, image lightboxes, back navigation and scrolling decks.
The tiny MP4 fixture is a generated two-second gray clip with no audio.

## Supabase transfer and query reductions

- The admin keeps selected read responses in page memory for 30 seconds and
  coalesces identical in-flight reads. Refresh, writes, logout and leaving the
  tab invalidate them. Merely hovering or focusing navigation makes no requests.
- Analytics still checks current publication/access settings for every event,
  but selects only six required fields instead of transferring the source/media
  manifest. Milenium's measured record shrank from about 8.4 kB to 150 bytes.
- `slide_viewed` already updates `max_slide` in the recording RPC, so the browser
  no longer sends a redundant `slide_reached_max` event. Time, views, maximum
  slide and website-click notifications retain their existing behavior.
- Vercel builds keep bundled media in the private
  `node_modules/.cache/shapeviz-media-v1` build cache. Each reuse requires a
  Supabase `304` response to an ETag conditional request and a matching local
  SHA-256 digest. Changed files download again; failures never reuse stale bytes.
  A missing/cleared Vercel build cache still requires one full media download.

Query Performance reports cumulative database execution time, not Storage CDN
egress or disk consumption. Its cache hit percentage describes Postgres memory
buffers; it is not the percentage of the monthly Cached Egress allowance used.
Previously counted monthly egress is not reduced by these optimizations. Cloud
Storage download counters and existing analytics history are not reset.
