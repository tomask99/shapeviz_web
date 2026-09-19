# Shapeviz Presentation System

The public route is always `/p/{slug}`. A project in Supabase decides whether
the route renders a bespoke standalone HTML deck or a client-specific instance
of a shared Shapeviz template. Adding an instance changes database content and
does not require a router edit or a Vercel deployment.

## Delivery model

`presentation_projects` is the operational registry. `source_type` supports:

- `standalone`: the small HTML source is read from the private
  `presentation-source` bucket. Images and videos are served directly from the
  public CDN-backed `presentation-media` bucket.
- `template`: Vercel renders a versioned file from `presentation-templates/`
  using escaped, allowlisted values from the project's `content` object.

Vercel rewrites `/p/{slug}` to the server-side presentation handler. The
handler validates the slug and project state before returning HTML with
`noindex`, a conservative referrer policy and a presentation-specific CSP.
Draft, archived, unknown and currently unsupported protected projects are not
served. The website's normal SEO headers remain unchanged.

The private HTML gateway is intentionally small. Videos never pass through a
Vercel Function; the browser requests them directly from Supabase Storage, so
byte-range playback and CDN delivery remain available. The `SUPABASE_SECRET_KEY`
is used only on the server and is sent in the `apikey` header. It never appears
in browser HTML, JavaScript, logs, Git or public metadata.

## Publishing

`scripts/publish-presentation.js` validates a standalone deck, replaces its
asset references with Supabase media URLs, uploads media directly to
Storage, stores HTML privately and upserts the registry row. It supports a safe
dry run before any remote write.

Uploads use a content-derived revision folder. The registry switches only after
all files are uploaded; existing versions remain available. The HTML base stays
on Shapeviz so the tracking script and event endpoint keep the correct origin.
Remote HTML uses `private, no-store` so archiving takes effect on the next visit.
Set `PRESENTATIONS_REMOTE=true` during the Vercel build to omit local deck copies
from `dist`. The local sources remain available until their uploads are verified.

`scripts/create-template-presentation.js` validates a template descriptor
against the template schema and creates or updates one client instance. The
first shared template is `shapeviz-introduction-v1`. All inserted strings are
HTML escaped by the renderer.

The current upload workflow is deliberately CLI/assistant-driven. A future
`/studio/presentations` UI can call the same registry and Storage model without
changing public URLs.

## Analytics

`public/presentation-system/tracker.js` records anonymous sessions, first views
of meaningful slides, furthest reached slide, video start, video completion at
90%, active heartbeats and a best-effort session end. It pauses engaged time
when the tab is hidden or idle. It stores a broad device category but no IP
address, exact fingerprint, password, raw share key or claimed recipient
identity.

Events pass through the server-side endpoint and the narrow
`record_presentation_event` RPC. A unique event ID prevents network retries from
double-counting active time. If Supabase is unavailable, tracking fails silently
and never blocks the deck. `delete_expired_presentation_events()` removes raw
events older than 180 days by default when scheduled.

## Supabase setup

The checked-in migrations create the registry, RLS policies, analytics
tables, RPCs and these buckets:

- `presentation-source`: private HTML/JSON, maximum 5 MB per object.
- `presentation-media`: public images, videos and fonts, maximum 50 MB per
  object. Public media is suitable for unlisted decks and is not confidential.

Apply migrations to the `shapeviz_web` project, then set:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
PRESENTATIONS_REMOTE=true
```

Use a separate modern secret key for the Vercel backend. New Supabase secret
keys are sent as `apikey`; they are not JWT bearer tokens. Configure the same
server values in Vercel. The publishable key is reserved for the authenticated
owner interface.

RLS is enabled on every presentation table. Anonymous clients cannot read the
registry or write analytics. Authenticated owner policies are backed by
`presentation_admins`; add an owner only when the private dashboard is enabled.

## Access limitations

The current public runtime supports `unlisted`, which means anyone with the
exact URL can open the deck. `noindex` controls discovery and is not security.

Password and unique-link modes remain unavailable until confidential media is
kept in a private bucket and every HTML/media request is authorized. The build
and registry intentionally refuse the old combination of a protected mode with
public local media. Do not describe an unlisted deck as confidential.

## Vercel

The build command is `npm run build`, output is `dist`, and the clean route is
implemented by `vercel.json`. The framework preset is explicitly `null` (Other)
so Vercel serves static files and the three API functions.

Production is deployed at `https://shapevizweb.vercel.app`, with Milenium at
`/p/milenium` and the universal starter deck at `/p/shapeviz`. Supabase server
variables are configured for production and preview. Connecting `shapeviz.com`
is a separate DNS/domain step; the presentation paths remain the same.
