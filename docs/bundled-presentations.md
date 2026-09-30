# Serving selected presentations from Vercel

`config/presentation-hosting.json` selects standalone presentations whose HTML
and media are included in each deployment. Currently only `milenium` is selected.
The existing `/p/milenium` route, query parameters, recipient validation,
tracking gate, analytics and HTML sandbox are unchanged.

During a production build, `scripts/lib/presentation-bundles.js` uses the existing
server-side Supabase environment to fetch the published source and its media.
It writes:

- Private HTML and a revision manifest to `build/presentation-bundles/`, included
  only in the presentation page Function.
- Content-hashed media to `dist/presentation-media/milenium/`, served by Vercel's
  static CDN with immutable caching.

Both directories are ignored by Git. Client content must not be committed to
the public repository. The build fails if a requested asset cannot be downloaded
or the presentation changes during the build. Local builds without Supabase
configuration skip bundling; production builds require the credentials.

Runtime still reads the live registry and validates recipient access before
serving the private HTML. A missing/deleted/unpublished project or revoked
recipient remains blocked. If the source reference or `updated_at` changes,
the route immediately uses the current Supabase source until the next deployment
refreshes its bundle. Other presentations continue using their existing storage.

The Supabase originals remain necessary for admin edits, cloning, fallback and
future deployments. The transfer saving comes from serving media from Vercel to
visitors; builds still download a copy. Supabase still provides registry, access
checks and analytics, so this is not an offline fallback for a database outage.

Verification: `node --test tests/presentation-bundles.test.js`. A successfully
bundled response includes `X-Presentation-Storage: vercel`; normal remote
delivery includes `X-Presentation-Storage: supabase`.
