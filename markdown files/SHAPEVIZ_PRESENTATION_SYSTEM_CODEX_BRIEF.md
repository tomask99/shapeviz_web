# SHAPEVIZ PRESENTATION SYSTEM — IMPLEMENTATION BRIEF FOR CODEX

**Project:** Shapeviz website + reusable HTML pitchdeck platform  
**Primary domain after launch:** `https://shapeviz.com`  
**Required presentation routes:** `https://shapeviz.com/p/milenium`, `https://shapeviz.com/p/{slug}`  
**Hosting:** Vercel (same domain and deployment as the new Shapeviz website, unless the existing architecture requires a separate Vercel project with an internal rewrite).  
**Optional backend, used when needed:** Supabase Postgres + Supabase Auth.  
**Language of website/presentations:** preserve the language of each existing page and deck.  
**Scope:** implement the system **inside my actual existing website repository**, not as an unrelated proof of concept.

## 0. HOW TO WORK IN MY REPOSITORY (MANDATORY)

1. Inspect the existing project first: framework, router, scripts, build tool, Vercel configuration, public assets, design system, conventions, auth/database integration, and any existing HTML presentation files. Do not assume the website uses Next.js.
2. Read any existing Shapeviz brand/design guidelines, especially the `.md` file describing the visual system of the Milenium presentation (typography, orange accents, rounded images, cursor glow, image/video lift on hover, transitions, fullscreen layout). **Reuse those rules.** Do not invent a conflicting design language.
3. Find the actual Milenium HTML presentation and all its referenced videos, images, fonts, CSS and JavaScript. Preserve its content and appearance. If it is not in the repo, prepare the directory/import workflow, report exactly what source files are missing, and do not invent a replacement deck.
4. Choose the **smallest maintainable implementation compatible with this codebase**. Prefer existing framework-native routes; use `vercel.json` rewrites only where needed. Do not migrate frameworks or rewrite the entire site to build this system.
5. Implement functional features, tests, and documentation. Do not leave mock analytics, fake access control, dead buttons, or hard-coded counters and claim the feature is complete.
6. If Supabase/project secrets are not configured, the public/unlisted presentation path must still work. Clearly mark database-dependent capabilities as **not configured** and document exactly which environment variables, migration and setup are needed to enable them. Never pretend analytics/password protection work without required infrastructure.
7. Before modifying potentially unrelated files, inspect and preserve existing work. Keep diffs focused. Provide a final summary of added files, routes, environment variables, tests, outstanding configuration, and actual deployment status. Do not claim deployment occurred unless it did.

## 1. PRODUCT VISION

Build **Shapeviz Presentation System**, a lightweight reusable platform that serves standalone, visually rich **HTML** pitchdecks under the Shapeviz domain. A recipient opens a single link and sees the presentation in a polished, fullscreen experience rather than downloading a PDF.

The first real presentation is **Milenium**. Future examples:

```text
shapeviz.com/p/milenium
shapeviz.com/p/company-x
shapeviz.com/p/company-y
```

These URLs must not display the ordinary Shapeviz website header, footer, cookie banners over the deck unnecessarily, portfolio navigation, or any WordPress elements. Keep existing animations, hover effects, video handling, slide transitions, image zoom, and custom presentation interactions.

**Important:** pitchdecks remain standalone HTML documents; do not force their slides into React components or convert them to PDF. A framework may provide routing, authorization and an admin UI around the documents.

## 2. REQUIRED ARCHITECTURE

Support a clean, scalable structure, adjusted to the existing project layout:

```text
<existing website repository>/
  ...existing website files...
  presentations/
    milenium/
      project.json
      index.html
      assets/
        images/
        videos/
        styles/
        scripts/
    _template/
      project.example.json
      index.example.html
  ...framework-specific server routes / auth / analytics / admin...
  docs/
    presentation-system.md
    adding-a-presentation.md
```

The shown layout is conceptual. In particular:

- For **public/unlisted decks**, build/copy the HTML and assets to web-accessible routes as appropriate to the framework. `GET /p/milenium` must work directly after a refresh and `GET /p/milenium/assets/...` must resolve correctly.
- For **actually protected decks**, do **NOT** publish the protected `index.html`, raw JSON metadata with secrets, or private assets in a public static directory. Authorization must happen before sending protected content. Implement a protected asset strategy or explicitly restrict the password/token feature to assets that are intentionally public; never call public assets confidential.
- Avoid routing conflicts between the website's dynamic route, the deck's `index.html`, and its assets. Do not add a generic SPA rewrite that hijacks `/p/*`.
- Retain CSS/JS isolation, so a deck does not inherit or break the website's styling. Prefer directly serving the standalone HTML over iframe when practical; use an iframe only with a documented reason and verify fullscreen, navigation, keyboard and analytics communication.
- Handle relative URLs, `<base>` where appropriate, image/video paths and JavaScript module imports consistently; a pitch must work via the clean path both with and without a trailing slash (one canonical URL).
- Reserve `p` for presentations; do not create a public index of clients automatically.

## 3. PROJECT.JSON — A REUSABLE DECK REGISTRY

Use one `project.json` per deck. Define a validated schema (e.g. with the repo's existing validation tooling) and provide a reusable starter template. Example:

```json
{
  "id": "milenium",
  "slug": "milenium",
  "client": "Milenium",
  "title": "Social Media & Visual Direction",
  "date": "September 2026",
  "description": "Private visual direction proposal for Milenium.",
  "cover": "assets/images/cover.jpg",
  "entry": "index.html",
  "locale": "sk",
  "status": "published",
  "access": {
    "mode": "unlisted"
  },
  "analytics": {
    "enabled": true,
    "slideCount": null
  },
  "media": {
    "provider": "local",
    "baseUrl": null
  }
}
```

Rules:

- `slug` must be unique and URL-safe; validate it against traversal and unknown slugs.
- `status`: at least `draft`, `published`, `archived`. Draft and archived decks are not publicly served; show 404 or an appropriate access state. Never rely on hidden links as the only restriction for drafts.
- `access.mode`: at least `unlisted`, `password`, `link`. A truly public mode may also exist, but decks must remain nonindexable by default.
- Do **not** store raw passwords, raw secret access tokens, Supabase service keys, or personal recipient details in a publicly served `project.json` or Git-committed source.
- `slideCount` can be inferred by the presentation adapter when possible; allow explicit metadata for unusual decks. Do not pretend any arbitrary HTML is automatically a slide presentation.
- A new deck should require copying the template, adding assets, editing metadata, and deploying — **not editing core routing code or duplicating the whole website**.
- Provide clear validation errors at build time for missing `index.html`, missing required metadata, invalid slugs and missing local files when detectable.

## 4. MILENIUM: FIRST REAL DECK

- Locate the existing finished Milenium HTML deck and mount it at **`/p/milenium`**.
- Preserve the design system already approved: Helvetica-like uppercase typography, black/white/orange palette, orange CTA, custom cursor glow, rounded imagery, gentle elevation of image/video on hover, smooth transitions, fullscreen editorial composition and existing content.
- Preserve all existing videos, their aspect ratios, image sharpness, slides and interactions. Do not crop imagery or replace provided assets with placeholders.
- Keep the deck visually separate from the main website layout.
- Correct broken paths caused by moving from a single HTML file to `/p/milenium`.
- Test desktop and mobile. A pitch may be desktop-first, but it must not be unusable on mobile.
- Video autoplay **with sound cannot be guaranteed by browsers**. Use browser-compatible muted autoplay/`playsinline` where intended, and offer a clear user-initiated sound control. Respect reduced motion when practical.

## 5. PRIVACY, METADATA AND INDEXING

Each pitch URL must be excluded from the sitemap and be **nonindexable**, even if its link is shared:

```html
<meta name="robots" content="noindex, nofollow, noarchive">
```

Additionally return a suitable `X-Robots-Tag` header for deck pages and related protected responses. Set a conservative `Referrer-Policy`, especially for access-link flows. Do not assume `robots.txt` or `noindex` is security. The ordinary public Shapeviz website should remain indexable; do not accidentally apply the presentation rule globally.

- Use the `project.json` title/client/cover for an appropriate browser title, favicon and social-card metadata **only when that metadata may be disclosed**.
- Protected decks should default to a neutral preview/title if exposing the client's name or cover would be sensitive.
- No sitemap entries or automatic client directory. Unknown slugs receive 404; private decks must not leak detailed metadata on their gate screen.

## 6. REAL ACCESS CONTROL — NOT A FAKE PASSWORD SCREEN

Implement three supported modes in the codebase, with the secure modes enabled once their backend/secrets are configured:

### A. Unlisted

- Default for the first Milenium demonstration if no backend is configured.
- Anyone with the exact URL can view it; `noindex` only helps avoid search indexing.
- Do not describe unlisted as password-protected or confidential.

### B. Password

- Server verifies a strong **password hash** (prefer Argon2id; use a vetted compatible alternative if runtime support requires it). Never compare a password in browser JS or put it into HTML/JSON.
- Include a Shapeviz-branded, accessible password screen, errors without sensitive detail, and rate limiting against guessing with persistent backing where feasible.
- Successful verification sets a short-lived, signed/opaque `HttpOnly`, `Secure`, `SameSite=Lax` access cookie scoped as narrowly as practical. Offer session expiry; decide whether a logout/forget-access button belongs in UI.
- Every request for confidential HTML and confidential media is gated on the server. `Cache-Control: private, no-store` for protected HTML, token exchange and gate responses; make sure CDN caching cannot expose another user's protected response.

### C. Unique share link

Example recipient-facing URL:

```text
https://shapeviz.com/p/milenium?key=<cryptographically-random-secret>
```

- Generate high-entropy tokens server-side; store **only hashes/digests**, never plaintext tokens in Supabase. Show/copy each raw link at creation and do not store it as readable plaintext elsewhere.
- Support optional expiry and revocation; include optional human-readable internal label like `Milenium — marketing team`, which is NOT proof of who actually opened the link.
- Verify key server-side, exchange it for the short-lived cookie and **redirect to the clean URL** before third-party media/analytics loads. Strip it from browser history; do not pass it through analytics, referrers, error monitoring or normal access logs.
- A revoked/expired key must no longer create new sessions. Define/document whether revocation invalidates previously exchanged cookies immediately; prefer checking a revocable grant/version for sensitive decks.
- The secret link must never be a permanent hard-coded query string in the deck HTML.

**Security invariant:** do not implement a cosmetic client-side gate that leaves a sensitive `index.html` accessible at another public URL. If the existing app cannot securely gate local assets, put protected documents and protected media in private storage or use a server-authorized delivery path. Where video byte-range requests matter, preserve streaming/Range support or choose a suitable private media provider. Do not proxy huge video files blindly through a serverless function.

## 7. PRESENTATION ANALYTICS — USE SUPABASE FOR EVENT-LEVEL DETAIL

Desired per-deck metrics:

```text
Milenium
Opened / page views:      3
Last opened:             18 Sep 2026, 22:41
Active time in deck:     7m 24s
Furthest reached slide:  23 / 28
Video 1 completed:       yes
Video 2 completed:       yes
```

These are *illustrative output fields*, **not** hard-coded values. Design the system to distinguish:

- **Page views/opens** vs distinct anonymous **viewing sessions** vs link-labelled sessions. Do not claim you know how many distinct people viewed a shared URL unless there is verified identity.
- `session_started`, `slide_viewed`, `slide_reached_max`, `video_started`, `video_completed` (defined, e.g. >=90% playback), `session_heartbeat`, `session_ended` (best effort), and optional CTA click.
- Presentations using section-scroll and those using explicit next/previous slide navigation. Create a **small deck tracking adapter** rather than intrusive rewrite of the existing Milenium HTML.
- Track current slide only when meaningful/visible; deduplicate slide events and video milestones, do not flood the backend on scroll.
- Measure **active engaged time**, not merely tab-open wall clock time. Pause or discount when the document is hidden or idle; use controlled heartbeat intervals and `sendBeacon`/keepalive on exit where appropriate. Treat browser-close events as best effort. Never present this metric as mathematically exact human attention.
- Each event must be linked to a generated session ID and deck ID. Attach `share_link_id` only when legitimately available after successful token exchange; do not send raw share keys.
- Server-side validate deck, event type, bounds, payload size and session/auth; rate limit events and prevent cross-deck access. Avoid public unrestricted inserts into Supabase.
- If Supabase is unavailable, the deck still loads; analytics should fail silently for viewers and report unavailable/disabled to the admin — do **not** fabricate data or block the presentation.

### Suggested Supabase tables (adapt names and migrations to the repository)

```text
presentation_share_links
  id, deck_slug, label, token_digest, created_at, expires_at, revoked_at

presentation_sessions
  id, deck_slug, share_link_id nullable, started_at, last_seen_at,
  ended_at nullable, active_seconds, max_slide, user_agent_category nullable

presentation_events
  id, session_id, deck_slug, event_type, slide_index nullable,
  video_id nullable, video_progress nullable, event_time

presentation_admins / existing app's admin auth mapping
  user_id, role
```

- Introduce the minimum schema required and SQL migrations; avoid collecting IP addresses, exact fingerprinting, unnecessary PII, or content of passwords/tokens.
- Restrict data access with appropriate table grants and RLS; administrative reads and sensitive writes must require verified server-side authorization. Supabase secret/service-role keys are **server-only**.
- Set retention/cleanup rules for granular events, and provide a short privacy disclosure where needed. Consider applicable consent requirements before enabling nonessential behavioral analytics on real recipients.
- General Vercel page analytics may coexist with this system, but must not be substituted for per-session granular slide/video statistics. In particular, custom Vercel Web Analytics events may depend on a paid plan. Suppress/sanitize tracking of `?key=` URLs and access gates.

## 8. OWNER DASHBOARD / MANAGEMENT

Provide a simple **private Shapeviz owner area** (e.g. `/studio/presentations`), styled consistently with the brand but optimized for utility. Prefer existing website admin/auth infrastructure; if none exists, Supabase Auth plus a server-side admin allowlist/role is acceptable.

The admin experience should allow:

1. View registered decks, status, route and access mode.
2. Open a deck and copy its clean public/unlisted URL.
3. Configure access mode and password securely; never display the existing plaintext password.
4. Create, copy, expire and revoke labelled share links.
5. Inspect per-deck opens, sessions, latest open, approximate active time, furthest slide and video engagement, with date range filtering when practical.
6. Separate real statistics from zero events, loading and database-not-configured states.

**Do not build a full visual slide editor or CMS in the first version.** Content lives in HTML and media files managed in Git; metadata lives in `project.json` (or an explicitly documented secure server-side override for settings such as access mode). Ensure dashboard changes persist instead of being reset by the next deployment. For access settings in particular, Supabase should be the operational source of truth once enabled; `project.json` supplies safe defaults, not a second conflicting mutable database.

## 9. ADDING A NEW PITCHDECK

Document a repeatable procedure, ideally with a tiny script/CLI command if the project's tooling supports it:

```text
1. Create presentations/company-x/
2. Add index.html, all media and project.json
3. Validate the new deck and its paths
4. Deploy to Vercel
5. Open https://shapeviz.com/p/company-x
6. Optionally enable a password or generate a labelled share link
7. View analytics in the owner dashboard
```

New decks may have unique creative styling and bespoke JavaScript; the reusable **platform shell**, access, metadata, asset resolution and analytics adapter should remain shared. Do not impose identical slide layouts on every client.

Provide a template HTML with opt-in analytics hooks such as `data-slide`, stable `data-video-id` and a documented slide-change JS event or adapter API; integrate the actual Milenium HTML with minimal changes. Explain exactly how to instrument a scroll-based deck versus a slide-based deck.

## 10. MEDIA AND FUTURE MIGRATION

For now, keep the Milenium deck and reasonably sized media files on Vercel as requested; do not force a paid external media service immediately.

Plan an easy migration later:

```json
"media": {
  "provider": "local",
  "baseUrl": null
}
```

Possible future providers: a CDN, Cloudflare R2, Bunny.net, Vercel Blob or other suitable host, subject to current terms, privacy and signed-access needs.

- Centralize asset URL resolution or use a consistent stable path that can be remapped at the edge/build step; document how to migrate one deck without editing dozens of hand-written image/video URLs.
- Use video `poster`, `preload="metadata"` / lazy strategies as appropriate, WebP/AVIF thumbnails where quality permits, responsive images and appropriate caching for non-sensitive hashed assets.
- Avoid downloading all slides' full videos just because one deck was opened. Preserve premium visual quality; do not blindly compress macro fabric/product details.
- For protected assets, external migration must preserve authorization and not accidentally make confidential files public.
- Report actual deployment/build-size issues rather than assuming every video will fit under every Vercel plan's limits.

## 11. UX / QUALITY REQUIREMENTS

- Canonical links look professional: `shapeviz.com/p/milenium`, no `.html`, no Vercel hostname shown to recipients once the domain is attached.
- Fast first load with a visually intentional cover/loading experience; avoid a blank page while large videos download.
- Desktop, tablet and mobile layouts; sensible safe areas and video sizing.
- Accessible focus handling for password form, owner dashboard and deck controls; keyboard navigation should continue to work.
- Respect `prefers-reduced-motion` where feasible without destroying the visual identity.
- Elegant 404 and invalid/expired-link states; do not leak whether a confidential slug exists unnecessarily.
- Do not expose environment secrets in client bundles, static HTML, sourcemaps or logs.
- Use safe response headers, session cookie settings, error boundaries and caching appropriate to each access mode.

## 12. IMPLEMENTATION ORDER — DELIVER FUNCTIONAL SLICES

**Phase 1 — core, no backend required**

- Inspect repo and brand guidelines.
- Mount the actual Milenium HTML at `/p/milenium` with working assets.
- Add metadata schema/validation, generic deck discovery, reusable starter template and nonindexing.
- Preserve website behavior; ensure future `/p/{slug}` decks need no route-code edits.
- Write setup/add-new-deck docs and run core routing/build checks.

**Phase 2 — secure distribution**

- Add Supabase migrations/verified owner authentication if not already present.
- Add real password and revocable share-link access; protect underlying content as specified.
- Add owner management controls and test denial/revocation/cookie expiry.

**Phase 3 — engagement intelligence**

- Add event ingestion, the minimal HTML tracking adapter and Supabase storage.
- Wire Milenium slide/video metadata.
- Add owner analytics views, sane deduplication, cleanup/retention and privacy controls.

Complete phases that can be completed using present credentials. For blockers involving missing Supabase environment variables or missing Milenium HTML/media, leave a clearly documented and safely nonfunctional gated feature, not a pretend working screen. Public Phase 1 must remain usable.

## 13. ACCEPTANCE CHECKLIST — TEST BEFORE HANDOFF

- [ ] Existing Shapeviz pages work unchanged.
- [ ] `/p/milenium` opens the **actual** Milenium HTML deck on direct visit and refresh.
- [ ] Videos, images, font files, hover/lift/glow effects, slide transitions and zoom work with no asset 404s.
- [ ] One newly added fixture deck works at `/p/test-company` without editing the router; fixture is not unintentionally published in production.
- [ ] Unknown slugs return 404; draft/archived decks are unavailable publicly.
- [ ] Decks are absent from the sitemap and have correct `noindex` in markup/headers; regular website SEO is unaffected.
- [ ] Password mode cannot be bypassed via a direct HTML or asset URL; incorrect passwords are rejected and requests rate-limited.
- [ ] Share token is unguessable, hashed at rest, revocable/expirable and removed from the visible URL after exchange; token does not appear in analytics or logs.
- [ ] Sensitive pages cannot leak through public CDN caching; session cookies are secure and server-verified.
- [ ] Analytics distinguish opens and sessions, and report real slide/video events and active time rather than invented numbers.
- [ ] Duplicate events, hidden tabs, disabled analytics and temporary Supabase outages are handled appropriately.
- [ ] Only an authorized Shapeviz owner can view analytics, change access settings or generate links.
- [ ] Static assets and source HTML support later migration to another media provider.
- [ ] `npm run build` (or actual repo build command), lint/typecheck and applicable tests pass; report any existing unrelated failures honestly.
- [ ] Provide `.env.example` with names, **never real keys**, SQL migrations and exact deployment steps.

## 14. WHAT I WANT FROM CODEX AT THE END

Supply a compact completion report with:

- The actual implemented route structure and files changed.
- Which phases are **working now**, which are blocked by missing material/credentials, and which remain future improvements.
- A concrete local test URL and final Vercel route pattern; never assert `shapeviz.com` is live before its DNS/domain is actually attached.
- All Vercel/Supabase setup steps I personally must perform, if any.
- Instructions to add the next HTML deck and to move deck videos to another host later.
- Actual build/test results and security limitations, especially for unlisted vs truly protected decks.

### Reference documentation for implementation decisions

- Vercel rewrites: https://vercel.com/docs/routing/rewrites
- Vercel project configuration: https://vercel.com/docs/project-configuration
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Vercel Web Analytics custom events (plan-dependent): https://vercel.com/docs/analytics/custom-events
- Redacting sensitive analytics data: https://vercel.com/docs/analytics/redacting-sensitive-data
