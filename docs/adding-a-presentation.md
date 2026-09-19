# Adding a presentation

Create a safe draft from the reusable template:

```powershell
npm.cmd run presentation:new -- company-x
```

Edit `presentations/company-x/project.json`, replace the example HTML, and place
all local files inside that deck directory. Use relative URLs such as
`assets/images/cover.webp`; absolute filesystem paths and `..` traversal are
rejected. Keep the deck self-contained and set `status` to `published` only when
it is ready. A new slug never requires a router edit.

Validate and preview:

```powershell
npm.cmd run presentations:validate
npm.cmd run dev
```

Open `http://localhost:3000/p/company-x`. The canonical route has no trailing
slash. Draft and archived decks return 404. The production build copies only
published unlisted decks:

```powershell
npm.cmd run build
npm.cmd start
```

## Analytics hooks

Include the shared adapter before `</body>`:

```html
<script src="/presentation-system/tracker.js"
        data-deck="company-x"
        data-analytics="true"></script>
```

For a scroll deck, add `.slide` or `data-slide` to each meaningful section. The
adapter uses the section nearest the viewport center. For a next/previous deck,
add `active` to the visible slide and dispatch this event after navigation:

```js
document.dispatchEvent(new CustomEvent('shapeviz:slidechange'));
```

Give each video a stable `data-video-id`. Video completion means at least 90%
playback. Set `analytics.enabled` to `false` to make ingestion a truthful no-op.

## Importing the original Milenium file

Place the supplied monolithic source at
`presentations/prezentacia_milenium.html` and run:

```powershell
npm.cmd run presentation:import:milenium
```

The importer extracts and deduplicates embedded images/videos, repairs the two
known source-structure issues, and writes the versioned output under
`presentations/milenium`. The monolithic source remains Git-ignored because it
exceeds GitHub's single-file limit.

## Moving media later

Keep asset references under one stable `assets/` prefix. When moving a deck,
upload that prefix to the chosen CDN/storage provider and set `media.provider`
and `media.baseUrl` in metadata. For confidential decks, use private storage and
signed authorization with byte-range support; a public CDN URL is not access
control.
