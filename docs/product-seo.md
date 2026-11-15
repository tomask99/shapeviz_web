# Product SEO

Each product editor includes **Product gallery**. Upload up to 24 JPG, PNG, WebP or AVIF images (25 MB each). Images are optimized to WebP and uploaded through the existing owner-only signed upload flow. Drag images to reorder them, edit descriptions and captions, or remove them, then **Save product**. The public page displays a responsive gallery with a keyboard-accessible image viewer. Empty galleries are omitted. Removing an image from a product does not delete the shared storage object.

In **Admin > Shop > Add product / Edit**, add the Gumroad URL and use **Load name and cover from Gumroad**. This fills empty name, title, address and cover fields. Write the page description, features, compatibility and optional questions in English. The target search phrase is a private writing aid, not a meta-keywords tag.

Enable **Publish product page**, mark the product **Visible in catalog**, and save. The shop must also be live. Publishing requires a name, unique lowercase address, SEO title, meta description and main description. The address is locked while the page is published to protect existing links. Keep it unchanged when temporarily unpublishing a page.

Published pages have server-rendered content, canonical and social metadata, Product and Breadcrumb structured data, and crawlable links from the shop. Current price is fetched from the published Gumroad listing; it is omitted if unavailable. Checkout remains on Gumroad.

`/sitemap-products.xml` automatically lists live shop language pages and visible published product pages. `/robots.txt` advertises both this sitemap and the main `/sitemap.xml`. Hidden products, unpublished pages, private catalog previews and unlaunched shops are excluded. Vercel preview deployments send noindex.

In Google Search Console, submit `https://www.shapeviz.com/sitemap-products.xml` and inspect each published URL. Indexing and rankings are decided by Google; the editor's length guidance and preview are not ranking scores. Use specific helpful descriptions and real examples rather than repeating keywords.

`docs/products/sv-textures.json` is the initial content prepared from the supplied Gumroad listing. After import, the admin catalog in Supabase is authoritative; this file is not read by the live site.
