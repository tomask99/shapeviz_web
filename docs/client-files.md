# Cloud storage through MEGA

The public panel is named **Cloud storage**, shown above the company name and
in the browser title. Its header logo and **visual studio** link both navigate
to `https://shapeviz.com/`. The lower promotional footer is omitted.

## Studio click notifications

An actual logo/studio click sends a small same-origin `keepalive` POST while
native navigation continues immediately, including keyboard and new-tab clicks.
`/api/files?action=website-click` verifies the portal/share capability, active
portal, source version and ancestor revocation. It reads the company and cloud
title from the database, never from client-supplied names. Notifications do not
depend on MEGA availability or transfer file bytes.

With the existing `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` configured, the bot
reports the source **Cloud storage**, company name, cloud title and clicked link.
DNT/GPC and bot requests are excluded. A service-only `client_file_website_clicks`
ledger atomically claims each event ID so concurrent retries cannot duplicate
the notification. It stores only event ID, portal ID, link type and timestamp;
deleting the portal cascades to these records. Telegram errors never block
navigation, and uncertain deliveries are not retried automatically.

The ledger deliberately has no client RLS policies and revokes all client grants.
Supabase's informational [RLS-without-policy advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
is expected for this server-only table; PostgreSQL tests verify client access is denied.

## Connecting a client

In **Clients → Client → Files**, connect one dedicated MEGA folder. Set the
public client name, **Files URL slug**, optional description and complete MEGA
folder link including its key. The server validates the source before saving.
No MEGA account password is required. **Portal settings** can change the source;
leave the replacement field empty to keep it. Replacing the source invalidates
all previous file/folder shares, even if you later switch back.

**Copy portal URL** produces `/files/{slug}#access={random-token}`. The fragment
contains the capability for the entire portal and is not sent in HTTP URLs or
referrers. The browser supplies it in a private API request header. The full URL
is needed; guessing `/files/milenium` does not grant access. The name is readable
while access remains unguessable. Changing the slug changes the client URL.

The portal follows the actual MEGA hierarchy. Open folders, use breadcrumbs,
search within the current folder, download individual files and copy links.
Metadata is loaded fresh on each API request, so additions, renames, removals
and moves appear on refresh. MEGA node IDs survive renames; replacing/deleting
a node can invalidate its old link. No file hierarchy is maintained in Supabase.
The loader disables MEGAJS's `ca=1` server-side tree snapshot: without replaying
MEGA action packets it can return an older tree even on a fresh HTTP request.
Each public request instead fetches the current full tree (the same `nocache`
behavior used by [MEGA's SDK](https://github.com/meganz/sdk/blob/master/src/commands.cpp)).

## Scoped sharing

**Copy link** creates or reuses `/files/share/{random-token}` for exactly the
selected file or folder subtree. The share page has Shapeviz branding and a
visual studio link, without a link back to the entire client portal.
Its root breadcrumb has no parent. Server checks also reject attempts to read,
download or share a sibling/parent node by manually changing request parameters.

A recipient of a folder share can share one of its children. That derived link
retains its parent capability: disabling the parent also invalidates derived
links. Moving the child outside the shared subtree makes the derived link
unavailable. Up to eight generations of derived links are supported.

The admin Files tab shows portal settings and controls, without a list of
individual shared links. **Disable portal** pauses all access;
**Enable portal** restores only links that were not individually
revoked and still match the current source. None of these actions deletes MEGA
files. Already obtained file keys or started downloads cannot be recalled;
removing underlying MEGA access is a separate action.

Individual link listing and permanent revocation remain available through the
owner-only admin API; removing the list from the UI does not delete or disable
existing share links.

The cross in the portal card's top-right corner removes the portal after
confirmation. It deletes only the Shapeviz portal settings and related share
records, so old links stop working. Files and folders in MEGA stay intact.
The client can then connect a new folder, including reusing the same slug;
new access tokens are generated and old links remain invalid.

## Storage and download behavior

Raster images (PNG, JPEG, WebP, GIF, AVIF and BMP, up to 32 MiB each) have
lazy-loaded previews in the file list and a larger preview in their file detail.
The **Preview size** slider remembers its value in this browser and resizes
existing thumbnails without downloading the images again. Unsupported or
larger files keep their normal file icon and download controls.

Previews use the same scoped access checks as downloads. At most two original
images are fetched directly from MEGA at a time, decrypted and integrity-checked
in the browser, then reduced to small thumbnails. This uses MEGA transfer
allowance; it does not upload images to Supabase or proxy image bytes through
Vercel. Navigating away aborts unfinished previews and releases their Blob URLs.
Animated images use a still preview; download the original for the full image.

All models, ZIPs and other file bytes remain in MEGA. Supabase stores only portal
settings, share-link records and small click records; its Storage service is not used by this feature.
The Vercel API reads folder metadata and checks access. File downloads travel
directly from MEGA to the browser, without a Vercel download proxy.

The browser receives the key and download identifier of only the authorised
file when downloading. The MEGA root-folder key, Supabase secret and account
credentials are never sent in public responses. The selected file key can be
extracted by its authorised recipient; Shapeviz branding is the delivery
experience, not DRM. A pinned, locally bundled MEGAJS dependency decrypts and
verifies each file.

Chromium browsers with `showSaveFilePicker` write to disk. Other browsers with
service workers and streaming responses use a same-origin attachment stream.
Both paths use bounded chunks and backpressure, without a whole-file Blob.
Completion requires exact length and full-file integrity verification. Cancel
stops the transfer; retry starts from the beginning. Keep the page open until
completion. MEGA transfer allowances still apply.

Native and attachment writers were tested in Chrome. Mobile layout was checked
at 375 px; Safari/iOS downloads still need a real-device compatibility check.
The supplied collection verified a real 57,777,004-byte FBX download. A generated
2 GiB attachment separately verified streaming and output length; that was not
a real 2 GiB MEGA download. Folder ZIP generation, reload-resume, rendered 3D
previews are outside this MVP.

## Lifetime download statistics

In **Clients > client > Files**, the **Downloads** section below the
portal card accepts a Shapeviz folder-share URL or a complete portal URL (with
its access fragment and optional `node`). MEGA URLs and other clients' links are
rejected. A tracked folder covers every descendant file, including files added
later and downloads through separate file links or the main portal. Up to 100
folders per client can be tracked; re-adding the same folder preserves its totals.

Rankings use a compact, plain-text list showing only the full filename (including
its extension) and completed-download count. Different formats such as `.fbx`
and `.3ds` remain separate rows. Results are sorted by lifetime count with 50 files per page.
Counts are keyed by MEGA node ID, so renaming the same file does not reset it;
the displayed name updates when it is next downloaded. A newly uploaded
replacement with a new MEGA node ID is a separate file. Moving an existing file
into a tracked folder starts counting future downloads there; moving it out
stops future counts there. Historical rows are retained. Overlapping tracked
folders each count their descendant downloads independently.

The download API checks live MEGA ancestry and issues a signed 48-hour receipt
containing the file identity and matching trackers. Merely browsing, copying a
link, viewing an image preview, or preparing a download never increments a count.
Only after MEGA integrity verification, exact byte length and the download
writer's close operation succeed does the browser POST that receipt. The server
rechecks portal/share access and atomically claims the event ID and increments
the aggregates. Retries cannot double-count. Invalid, expired and cross-origin
requests are rejected. Analytics failure does not block file delivery.

This measures **browser-confirmed completed transfers through Shapeviz**. Direct
MEGA downloads cannot be observed. With attachment downloads, the browser owns
the final disk-save step; its OS write cannot be independently verified by the
server. A determined authorized client can simulate a completion callback; these
are popularity statistics, not tamper-proof billing records. If the page closes
before confirmation or tracking remains unavailable beyond the receipt lifetime,
a completion may be missed. Completed receipts are retried from localStorage
on later portal visits, on reconnection and every 30 seconds while the page is
open, then removed on acknowledgement or expiry. Receipt entries include the
existing portal capability when required, never a MEGA key or file contents.

The counters have no automatic reset or retention limit and no reset action.
Pausing/resuming tracking, disabling/removing the portal, replacing its MEGA
source, disabling the original copied link, and new deployments preserve history.
Replacing a source requires adding a new folder tracker; the previous totals
remain visible as history. Deleting the entire CRM company explicitly deletes
its analytics with the rest of its records. Tracking starts when enabled; past
downloads cannot be reconstructed. Refresh statistics or reopen Files to see
new completions. Owner downloads through the portal are included as well.

Migration `20260930165702_client_file_download_tracking.sql` adds owner-readable
RLS-protected tracker/aggregate tables and a server-only atomic RPC. No anonymous
access or authenticated counter writes are granted. The compact replay ledger
expires alongside signed receipts; its cleanup never deletes aggregates. Only
file metadata/counters use the database. MEGA file bytes never use Supabase Storage.

## Configuration and verification

### Request efficiency

Simultaneous metadata reads for the same MEGA share reuse the same pending
promise within one server instance. Completed trees are never reused by a
`fresh` read: refresh/navigation still sees current MEGA additions, moves,
renames and removals. Failures are evicted so retries can recover. The bounded
metadata cache contains no file bytes; every public request still validates
portal/link status and live ancestry before releasing file access.

The admin tracking list now embeds portal status and each tracker's first 50
filename/count pairs in one JWT/RLS-protected REST query. Each embedded ranking
is ordered by count and stable node ID, and limited independently to 51 rows
to detect another page. Later pages load only on demand. Refresh preserves the
selected page; detached trackers retain their history. The UI remains a simple
list of filenames (including their extensions) and lifetime download counts.
See [PostgREST embedded filters](https://docs.postgrest.org/en/v13/references/api/resource_embedding.html#embedded-filters).

### Setup

The existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY` variables are used. Migrations
`20260930121806_client_file_shares.sql` and
`20260930125222_client_file_portals_scoped_links.sql` create portal settings and
scoped share records, owner RLS, column permissions, unique constraints and
versioning triggers. `20260930132644_client_file_portal_removal.sql` adds
owner-authorised portal removal and cascading deletion of its share records.
These migrations are applied to the connected Supabase project.
The web application still needs deployment before these routes work on the
public website. Existing Milenium settings are retained with slug `milenium`.

All `/files/*` pages and API responses use `noindex, nofollow, noarchive`,
`no-store` and `no-referrer`. Client URLs are excluded from the sitemap.

```powershell
npm.cmd test
npx.cmd playwright test tests/browser/client-files.spec.js
npm.cmd run build

# Optional generated 2 GiB attachment; no external file storage traffic.
$env:FILE_TEST_GB='2'
npx.cmd playwright test tests/browser/client-files.spec.js --grep 'streamed attachment'
Remove-Item Env:FILE_TEST_GB

# Optional live MEGA download. Set MEGA_TEST_FOLDER privately to an authorised
# folder first. Its largest file (up to 2 GiB) consumes MEGA transfer allowance.
npx.cmd playwright test tests/browser/client-files-live.spec.js

# Optional integrated live check, using an existing authorised client portal.
# Creates and cleans up its own temporary share records; downloads a small file.
$env:FILES_TEST_SLUG='your-test-client'
node --env-file-if-exists=.env node_modules/@playwright/test/cli.js test tests/browser/client-files-scope-live.spec.js
Remove-Item Env:FILES_TEST_SLUG
```

HTTP tests exercise portal-token checks, scoped browsing/download/share creation,
parent/sibling denial, idempotent links, live moves/renames/removal, source
replacement and ancestor revocation. PGlite runs both real migrations and checks
owner isolation, anonymous denial, column grants, uniqueness and versioning.
Browser tests exercise navigation, sharing, direct link reload, admin settings,
revocation, mobile layout, streaming, integrity failures and cancellation.

The Supabase advisor found no new security issues for these objects. Existing
unrelated notices concern
[password leak protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
and [policy-free private/server-only tables](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
