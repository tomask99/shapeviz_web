# Shapeviz Studio

Open `/adminlogin` directly. No public navigation link is added. Supabase Auth
verifies the password and every API request checks the account against
`presentation_admins`. A hidden URL alone never grants access.

## Account setup

The owner account uses `krajcovictomas99@gmail.com`. Run locally with server
credentials to generate a private one-use password setup file:

```powershell
node --env-file=.env scripts/setup-admin.js krajcovictomas99@gmail.com --link
```

Open `.cache/admin-setup.html` in a browser. It links to `/adminlogin` with a
recovery token in the fragment (not server logs). The app exchanges it once,
clears the fragment and asks for a password. The file is ignored by Git and
Vercel. It must remain private. The default link lifetime is one hour. No email
is sent. Future password recovery uses the same command.

## Upload and variants

Upload a `.html` file as a presentation or a template. Embedded base64 media is
extracted in the browser and uploaded directly to Storage using short-lived,
object-specific signed upload URLs. The final HTML is private and the registry
is created only after successful upload. Names are unique; a collision is
reported rather than overwriting an existing presentation.

Limits: 200 MB input HTML, 50 MB per media object, 4 MB final HTML. Include media
files if HTML references separate assets. Self-contained HTML with embedded
media is the recommended format. JavaScript-generated filesystem paths or
third-party APIs may need adaptation before upload. Logos inside images are
not automatically edited.

For a template, specify original company text, e.g. `MILENIUM`. Create a
variant, enter the new company, title and URL slug, then review the interactive
preview. Replacement is case-insensitive and preserves uppercase/lowercase
style. It changes HTML text and text labels; it does not rewrite asset URLs,
CSS selectors or JavaScript code. Each variant is independent, with its own
HTML, slug and analytics. Template edits do not change existing variants.

Presentation settings support title changes, published/draft/archived states
and converting existing decks into templates. Archived and draft links return
404. Published links are unlisted, not password-protected.

## Statistics

Choose 7, 30 or 90 days. The dashboard shows sessions, active time, average
active time and total slide views, plus daily visits. Presentation details
show per-slide repeat views, active seconds, unique slides per session,
furthest slide and the latest 100 sessions in the period. A session does not
identify a person. Daily grouping uses UTC; session timestamps use browser time.

The tracker flushes time on slide changes, visibility changes and exit. Hidden
tabs and inactivity after 60 seconds are excluded; visible video playback
counts as activity. Tracking is best effort and may be blocked by visitors.
Older events have no per-slide duration and recorded only the first slide
visit in a session. No historical repeat views or durations are fabricated.

## Isolation

Owner sessions use HttpOnly, SameSite=Strict cookies scoped to `/api/admin`
(Secure in production). Writes require an exact same-origin header. Uploaded
presentation documents run under a CSP sandbox without same-origin authority;
preview iframes use the same isolation. They cannot access owner cookies or
read admin data. Public anonymous analytics alone accepts the sandbox's null
origin, without credentials. Server keys never enter browser code.

Abandoned uploads can leave unreferenced Storage objects; do not delete assets
still referenced by template variants. HTML relying on localStorage, cookies,
forms or unrestricted cross-origin requests needs adaptation for the sandbox.
