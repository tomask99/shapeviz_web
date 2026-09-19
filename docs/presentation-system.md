# Shapeviz Presentation System

The repository serves standalone HTML presentations under `/p/{slug}`. Decks do
not inherit the website header, footer, CSS, or JavaScript. The first production
deck is Milenium at `/p/milenium`.

## Current operating mode

Phase 1 is complete and works without a backend. Milenium is `unlisted`: anyone
with the exact URL can open it. It is excluded from indexing by both an HTML
`robots` meta tag and `X-Robots-Tag`. This is discoverability control, not access
control.

The event adapter is implemented and fails silently for viewers until Supabase
is configured. The server returns `X-Analytics-Status: not-configured` and does
not invent statistics. Run the migration in
`supabase/migrations/20260919144703_presentation_system.sql`, then set
`SUPABASE_URL` and `SUPABASE_SECRET_KEY` on the server. The secret key must never
be exposed in presentation HTML or browser code. `SUPABASE_PUBLISHABLE_KEY` is
reserved for a future authenticated owner interface.

Password and unique-link delivery are intentionally unavailable while the deck
uses `media.provider: local`. Local presentation files are emitted as public
Vercel assets and therefore cannot be made confidential by a login screen. The
registry rejects `password` or `link` together with local media, and the build
rejects protected output. Real protected delivery requires a private media
provider with authorization and video Range support, plus Supabase Auth. No
cosmetic password screen is included.

## Architecture

- `presentations/{slug}/project.json` is private build metadata and is never
  copied to `dist`.
- `presentations/{slug}/index.html` remains a standalone document.
- `src/presentations/registry.js` validates metadata, paths, states, and local
  references.
- `scripts/build.js` discovers decks generically and emits published unlisted
  decks to `dist/p/{slug}`.
- `public/presentation-system/tracker.js` is the small shared tracking adapter.
- `api/presentation-events.js` validates event payloads and writes through one
  server-only Supabase RPC when configured.
- `vercel.json` maps the clean URL to the generated `index.html` and adds deck
  privacy/security headers without changing website SEO headers.

The adapter records anonymous sessions, first views of meaningful slides,
furthest reached slide, video start, video completion at 90%, active heartbeats,
and a best-effort session end. It pauses engaged time when the tab is hidden or
idle. It stores a broad device category but no IP address, exact fingerprint,
password, token, or recipient identity. Browser close and attention metrics are
approximate. Review the required privacy/consent basis before enabling behavioral
analytics for recipients.

## Supabase setup

1. Create or select a dedicated Shapeviz Supabase project.
2. Link the local folder with `npx supabase link --project-ref <ref>`.
3. Review and apply with `npx supabase db push`.
4. Add one authenticated owner to `presentation_admins` only when the owner UI
   is implemented.
5. Configure the three `SUPABASE_*` names from `.env.example` in Vercel. Use a
   modern `sb_secret_...` key for `SUPABASE_SECRET_KEY`.

RLS is enabled on every presentation table. Anonymous and authenticated clients
cannot insert analytics. The server's secret role can call the narrow
`record_presentation_event` RPC. Owner read policies exist for a future
authenticated dashboard. The RPC uses a unique browser-generated event ID so a
retried request does not double-count active time. The restricted
`delete_expired_presentation_events()` function removes raw events older than
180 days by default; schedule it only after selecting the operational retention
policy. Session aggregates remain until separately removed.

## Vercel and domains

The build command is `npm run build` and output is `dist`. The original embedded
Milenium source is deliberately excluded from Git and Vercel; the importer
creates deduplicated, external assets where every individual file is below the
GitHub 100 MB file limit. `.vercelignore` also excludes source media that the
production build does not need.

After a preview has been checked, attach `shapeviz.com` to the Vercel project and
set `SITE_URL=https://shapeviz.com`. Until DNS is attached, only the Vercel
preview URL is live.

## Protected-deck migration

For a confidential deck, upload its HTML and media to a private provider that
supports signed delivery and byte ranges. Change `media.provider` to
`supabase-private` (or a documented remote provider), keep raw assets out of
`dist`, and implement the authorized delivery adapter before switching
`access.mode`. Revocation must invalidate both new token exchanges and existing
grants for sensitive work. Do not proxy large video bodies through a Vercel
Function.
