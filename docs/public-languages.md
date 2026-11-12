# Public website languages

The homepage, service pages and shop support Slovak and English. Admin screens, client portals,
presentations, stored product names and custom category names are not translated.
Gumroad controls its own embedded product and checkout content.

- `/sk` and `/en` select an explicit language; `/sk/shop` and `/en/shop` do the
  same for the shop. These routes also remember the selection in a first-party,
  HttpOnly `sv_language` cookie for one year.
- `/` and `/shop` use the saved choice first, then Slovak for the trusted Vercel
  country header `SK`, then the highest-ranked supported browser language.
  English is the fallback. Country detection needs no external lookup or browser
  location permission. Local development uses browser preferences.
- SK / EN links work without JavaScript. With JavaScript they also retain the
  current query string and section anchor.
- HTML, metadata, accessible names and image descriptions are translated on the
  server before the first paint. Canonical and alternate language links identify
  the explicit URLs. Responses are private and uncached to avoid sharing a
  visitor's language choice through a CDN cache.

`public/i18n/messages.js` maps authored English copy to Slovak. The server applies
it only to the two public templates; browser modules use the same dictionary for
dynamic controls and feedback. Form field values and submitted visitor content
retain their original values. The shared shop components remain English in admin.

Public pages share the existing `api/site-events.js` function using `route=page`,
keeping the project within its existing 12-function budget. `vercel.json` includes
the templates in the function bundle. Deploy the application and routing changes
together; no database migration or new environment variable is needed for languages.
This change has been verified locally and has not been deployed.

Verification:

```powershell
node --test tests/website-language.test.js tests/website-routing.test.js tests/server.test.js
npx.cmd playwright test tests/browser/website-language.spec.js tests/browser/site.spec.js tests/browser/shop.spec.js
npm.cmd run icons:validate
npm.cmd run build
```

Coverage includes language priority, remembered choice, server-rendered Slovak,
no-JavaScript navigation, mobile layouts, gallery and video states, contact success
and failure, shop filtering, and unchanged admin language. Live Gumroad checkout is
an existing opt-in test and is not required for this localization.

## SEO and expanded services

The homepage now describes high-end 3D modeling, product/interior visualization,
architectural modeling, and video production/animation in both languages. Each
service has a clickable heading leading to its detailed page; the homepage does
not duplicate service descriptions. The header links to the service overview. Contact checkboxes
use stable English values accepted by the API, while their labels are localized.

`src/website/seo.js` uses the canonical production origin
`https://www.shapeviz.com` (the apex redirects to www). Canonical, hreflang,
Open Graph and Twitter URLs never depend on the request Host or preview hostname.
Both languages have descriptive titles and summaries. Organization, WebSite,
WebPage and OfferCatalog/Service JSON-LD use the visible translated service copy;
no ratings, pricing, address or other unverified business facts are added.

The build generates `dist/sitemap.xml` and `dist/robots.txt`; the local server
serves the same content. The sitemap contains ten canonical URLs: `/sk`, `/en`
and four services in both languages. It includes reciprocal language alternatives
and primary images. The automatic-language root is x-default for the homepage;
each service uses its English page as x-default. Existing
noindex shop/private routes are excluded; they remain crawlable so search engines
can see their noindex directives. Preview HTML responses also send noindex.

### Dedicated service pages

`src/website/services.js` holds the bilingual content and stable route definitions.
`src/website/service-page.js` renders each complete page on the server, including
its own descriptive H1, title, description, social image, Service and BreadcrumbList
JSON-LD, scope, process, briefing guidance, visible FAQs and related service links.
No FAQ rich result eligibility, ratings, guaranteed delivery times or prices are
claimed. These pages share the existing serverless function and require no extra
template includeFiles or database migration.

| Service | Slovak URL | English URL |
| --- | --- | --- |
| Modeling | `/sk/sluzby/3d-modelovanie` | `/en/services/3d-modeling` |
| Visualization | `/sk/sluzby/produktove-interierove-vizualizacie` | `/en/services/product-interior-visualization` |
| Architecture | `/sk/sluzby/architektonicke-modelovanie` | `/en/services/architectural-modeling` |
| Video | `/sk/sluzby/tvorba-videi-animacie` | `/en/services/video-production-animation` |

The single numbered service list in the homepage studio section links to these URLs;
the header's Services link targets that list. Each service page links to the others,
the portfolio and the localized inquiry form. Language switches preserve the
equivalent service rather than sending the visitor to the homepage. The homepage
has a descriptive visible H1 while its animated brand wordmark keeps its appearance.

Legacy index.html and trailing-slash URLs redirect permanently to the clean URL,
preserving query parameters. Unknown services return 404 instead of a soft-404
homepage. Local and Vercel routing use the same paths.

Service pages use responsive WebP images with dimensions and eager hero loading;
the video uses a poster and `preload="none"`, with no autoplay. They do not load the
homepage animation/gallery scripts or a new framework. Gallery image src/srcset
URLs are present in HTML, including generated galleries, while native lazy loading
keeps the closed gallery deferred.

Verification commands:

```powershell
node --test tests/website-seo.test.js tests/website-language.test.js tests/website-routing.test.js tests/server.test.js
npx.cmd playwright test tests/browser/service-pages.spec.js tests/browser/website-seo.spec.js tests/browser/website-language.spec.js tests/browser/site.spec.js
npm.cmd run icons:validate
npm.cmd run build
```

Coverage includes canonical/social metadata, all sitemap URLs, actual image
dimensions, Service/BreadcrumbList data, rewrites, redirects, 404s, language
switching, no-JavaScript navigation, inquiry links, gallery deferral and video
playback. Service layouts are checked at 320, 768 and 1440 pixels.

After deployment, submit `https://www.shapeviz.com/sitemap.xml` in the site's
Google Search Console property and inspect the home and service URLs. Measure
PageSpeed Insights/Core Web Vitals on the production domain; local browser checks
are not field performance measurements. Neither deployment nor Search Console
submission has been performed from the local checkout.

Implementation references: [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide),
[localized URLs](https://developers.google.com/search/docs/specialty/international/localized-versions),
and [organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization),
[image sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps)
and [crawlable lazy loading](https://developers.google.com/search/docs/crawling-indexing/javascript/lazy-loading).
