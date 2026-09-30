# Client files through MEGA

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

## Scoped sharing

**Copy link** creates or reuses `/files/share/{random-token}` for exactly the
selected file or folder subtree. The share page has Shapeviz branding and a
studio/contact link, without a link back to the entire client portal.
Its root breadcrumb has no parent. Server checks also reject attempts to read,
download or share a sibling/parent node by manually changing request parameters.

A recipient of a folder share can share one of its children. That derived link
retains its parent capability: disabling the parent also invalidates derived
links. Moving the child outside the shared subtree makes the derived link
unavailable. Up to eight generations of derived links are supported.

The admin Files tab lists created links, their original names, creation dates
and status. **Disable link** permanently revokes that token. Copying the item
again from an authorised portal produces a new link. **Disable portal** pauses
all access; **Enable portal** restores only links that were not individually
revoked and still match the current source. None of these actions deletes MEGA
files. Already obtained file keys or started downloads cannot be recalled;
removing underlying MEGA access is a separate action.

## Storage and download behavior

All models, ZIPs and other file bytes remain in MEGA. Supabase stores only portal
settings and share-link records; its Storage service is not used by this feature.
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
previews and download analytics are outside this MVP.

## Configuration and verification

The existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY` variables are used. Migrations
`20260930121806_client_file_shares.sql` and
`20260930125222_client_file_portals_scoped_links.sql` create portal settings and
scoped share records, owner RLS, column permissions, unique constraints and
versioning triggers. Both are applied to the connected Supabase project.
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
