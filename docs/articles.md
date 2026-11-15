# Articles

Public index: `/articles`. Public article: `/articles/<slug>`.
Owner editor: `/admin/site-editing#articles`.

Articles live in `public.articles`. Only the server role can access the table;
the existing owner session and same-origin checks protect editing. Public
requests select published rows only. Draft and missing article URLs return 404;
an unavailable database returns 503, never seed content or an empty cached page.

The editor provides headings, paragraphs, lists, quotes, links, undo/redo,
optimized cover and inline image uploads, image descriptions/captions, private
preview, drafts and publishing. Select an inserted image and choose Image, or
double-click it, to change its description/caption. Drag it to move it. Save is
explicit; the close/reload guard warns about unsaved changes. Optimistic version
checks reject conflicting writes. A slug becomes immutable after first
publication so routine title edits cannot break an indexed URL.

Content is a validated Tiptap JSON document; the public HTML renderer escapes
text and accepts only supported nodes/marks and safe links. Arbitrary embeds,
scripts and remote pasted images are not supported. Uploaded images are
browser-optimized WebP (up to 2400 pixels plus an 800-pixel variant) in the
public `article-images` bucket; image files are public assets even while the
containing article is a draft. Deleting an article does not delete media files,
which may be reused. Public pages include responsive images, an automatic
contents list, canonical/social metadata, BlogPosting and breadcrumb JSON-LD.
`/sitemap-articles.xml` updates directly from published records and is advertised
in robots.txt. `/articles` is also in the main sitemap. Preview deployments are
noindex. The section is initially English, matching the international shop.

The rich editor is Tiptap, bundled locally with esbuild. `npm run dev` and
`npm run test:browser` build it automatically. `npm run build` packages the
editor and its dependency licenses into `dist/admin/vendor`. If running
Playwright directly on a fresh checkout, run `npm run editor:build` first.

The first article is reproducible from `src/articles/first-article.js` using:

```
node --env-file-if-exists=.env scripts/seed-first-article.js
```

This requires the intended project's server credentials and inserts only if
the slug does not exist; it never overwrites editorial changes. It is not part
of regular builds. Images can be rebuilt with `node scripts/prepare-article-images.js`.
The image provenance, CC0 license and compression sizes are recorded in
`docs/article-images.json`. The sample material is credited to ambientCG and
is not represented as an SV Textures result.

Verification:

```
node --test tests/articles.test.js tests/website-seo.test.js
npm run test:browser -- tests/browser/articles.spec.js
npm run build
```
