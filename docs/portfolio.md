# Shareable portfolio

`/portfolio` defaults to Slovak; `/portfolio?lang=en` is English. Both the HTML
and HTTP response specify `noindex, nofollow`. The page is deliberately absent
from the sitemap and main navigation. It remains publicly accessible by URL.

## Editor

Open **Site Editing**, then **Portfolio**, in Studio at `/admin/site-editing#portfolio`.
Use the language selector to edit Slovak and English separately. Block order,
images and grid layouts are shared. Each project's image descriptions, captions
and destinations can differ per language. Blank fields are omitted. A linked
image opens its destination, and an unlinked project image opens the gallery
preview.

Page settings contain the logo and the labels used across the page. Drag blocks
in the list or use the move buttons. **Save and publish** updates the public
page; the preview shows the current draft. The editor uses the
`site_portfolio` Supabase migration for the saved content and image bucket.

## Content sources

The owner requested every project from the website's current collaboration list,
plus work from `D:\MegaSync\MEGAsync\Zakazky\PORTFOLIO.pdf`. The public Slovak and
English project descriptions and credits were read on 2026-11-21. They identify
the artist's contribution, including The New Face collaborations, rather than
claiming sole authorship of the finished campaigns.

`src/website/portfolio-projects.js` contains the curated content. Images in
`public/media/portfolio` are local WebP derivatives with smaller responsive
versions; production rendering does not fetch the source website or PDF.

| Source | Included work |
| --- | --- |
| Public project previews | Louis Vuitton necklace, MCM station, Kontrafakt, Rytmus, Ektor, AMI bakery, Tolicci |
| PDF pages 5–6 | MCM Worldwide and Cosmic Star |
| PDF page 8 | Prada Beauty |
| PDF pages 9–10 | Pucci campaign and bag models |
| PDF pages 11–12 | AMI Paris Bakery and Christmas |
| PDF page 13 | HEVI product details; existing higher resolution campaign renders retained |
| PDF page 15 | Kontrafakt – INÍ production images |
| PDF pages 16–17 | Rytmus – Pri sebe and windshield simulation |
| PDF page 18 | Ektor – PTSD production images |
| PDF pages 20–24 | Interior visualization and kitchen details |
| Existing service assets | Milenium CGI, architectural exteriors, upholstery modeling |

PDF page numbers above are physical pages, including dividers. `pdf-N-M.webp`
identifies physical page N and its Mth embedded image. Higher resolution website
assets replace duplicate PDF images where available. The tyFlow settings-panel
image is omitted; the four simulation frames show the work itself.

The owner explicitly excluded the orange sofa AI imagery. Do not reintroduce
`milenium-interior-*`, `gallery/lifestyle_01*` or the marketing sofa variants on
this page. The opening image is now the MCM station.

## Verification

Run `node --test tests/portfolio.test.js tests/website-seo.test.js` and
`npm.cmd run build` (includes the SVG icon policy). Browser QA covers Slovak and
English at 320, 390, 768 and 1440 pixels, every image preview, closing/focus return,
project anchors, language switching, contact links and horizontal overflow.
