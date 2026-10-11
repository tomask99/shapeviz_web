# Shapeviz Shop

The shop is part of the existing HTML/JavaScript site and owner-only Studio.
It uses Gumroad's official inline product embed, not a local product-content or
payment system. Integration reference (checked 2026-10-11):
https://gumroad.com/help/article/44-build-gumroad-into-your-website

## Admin workflow

1. Sign in as usual and open **Shop** (`/admin/shop`).
2. Optionally open **Manage categories** to rename categories or add
   **Decals & Textures**. Defaults are 3D Models, Blender Add-ons and 3ds Max Scripts.
3. **Add product**: paste an HTTPS `creator.gumroad.com/l/permalink` or
   `gumroad.com/l/permalink` URL and select a category.
4. **Preview product** loads the real Gumroad embed. The internal name is optional.
5. **Save product** saves a draft unless **Visible in catalog** is selected.
6. Use **Edit**, **Show/Hide**, the up/down SVG buttons, or **Remove** to manage
   the Shapeviz catalog. These operations never modify the Gumroad product.

**Private catalog preview** opens `/shop?preview=1` and requires the existing
owner session. It shows the visible products even before launch. Preview a draft
from its product editor. Being signed in as an ordinary non-owner is insufficient.

**Shop live** is the only launch switch. It starts off. Turning it on activates
`/shop` in desktop/mobile navigation and reveals visible products. Turning it off
restores Coming soon. Product visibility and launch are independent.

## Deployment

Apply `supabase/migrations/20261011124216_shop_catalog.sql` to the intended
Supabase database through the project's normal migration workflow, then deploy
the code. The migration creates an empty catalog and sets `launched=false`.
It contains no sample product and does not launch the shop.

Existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY` server settings are reused.
No Gumroad token, OAuth, uploads, webhook or payment configuration is needed.
The additive migration was tested with PGlite and applied to the connected
Shapeviz Supabase database on 2026-10-11. Its local version matches the remote
migration history. The catalog starts empty, with three categories and
`launched=false`. Local REST reads and `/api/shop` returned HTTP 200 afterward.
The database migration alone does not deploy the website code.

On Vercel, `/api/shop` rewrites to `/api/site-events?route=shop`. The shared
website handler keeps the deployment within the Hobby plan's 12-function limit
while preserving the existing analytics endpoint and the public shop URL.

The security advisor reports the expected [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
notice for this server-only table. Direct client privileges are revoked;
verified owner requests go through the server.

## Implementation and security

- `/api/shop` returns only `{launched:false}` before launch; it never returns
  draft URLs, category names or internal product names to a public visitor.
- `/api/shop?status=1` returns only the launch state for navigation.
- `shop-list`, `shop-preview`, `shop-save` and `shop-launch` reuse `/api/admin`,
  its HttpOnly session, verified owner role, same-origin writes and no-store headers.
- The singleton `shop_catalog` stores an ordered list of categories and products.
  RLS is enabled and direct `anon`/`authenticated` table privileges are revoked.
  Only server service-role requests access the table after application checks.
- Versioned compare-and-swap updates reject stale concurrent edits. Reload the
  catalog after a conflict. This small catalog is bounded to 100 products and
  30 categories; product order is the array order.
- HTTPS Gumroad product URLs are validated on both client and server. Credentials,
  unrelated hosts, custom ports and non-product paths are rejected. Query strings,
  fragments and trailing slashes are removed. Duplicate permalinks are rejected
  even if entered with different Gumroad host aliases. Custom creator domains,
  short links, discount URLs and affiliate paths are outside this version.
- The official embed script loads once per document. Its own MutationObserver
  initializes new embeds in the admin. Filtering retains the existing iframes.
- Only Gumroad script/frame origins are added to the relevant CSPs. The iframe's
  internal appearance is not modified. A separate View on Gumroad link remains
  available if scripts or iframe content are blocked; a timeout explains delays.

## Gumroad behavior

The product's image, description, price and purchase control load from Gumroad.
Changes made there appear on the next widget load according to Gumroad caching.
Checkout and purchased-file delivery happen on Gumroad, not shapeviz.com.
No real purchase is required to test the integration.

## Verification

`npm.cmd test` covers URL validation, real SQL persistence, stale writes,
duplicates, launch/draft isolation, owner authentication, CSRF and direct database
permission denial. `tests/browser/shop.spec.js` exercises the actual local server,
API and isolated PGlite database with desktop/mobile views, blocked-script
fallbacks. The opt-in live test also verifies the real Gumroad product and checkout. Test authentication is a fixture; no
production credentials or catalog writes are used.

Run `npm.cmd run icons:validate`, `npm.cmd run build`, and
`npx.cmd playwright test tests/browser/shop.spec.js --workers=1`.
For the network-dependent Gumroad test in PowerShell, first set
`$env:SHOP_LIVE_TEST="true"`, then run the same browser command.
Screenshots are generated under `.cache/shop-*.png`.
