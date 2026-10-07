# Hourly projects and Time Tracker

Implemented on 7 October 2026 in the existing Shapeviz Studio. UI and application
changes are local to this checkout. The database migration is applied to the
connected `shapeviz_web` Supabase project. No application deployment or Git push
was performed.

## Using it

Run `npm.cmd run dev`, sign in as the studio owner, and open a client. In **New
project**, choose **Hourly** and enter the rate in EUR/h; both `60.00` and `60,00`
are accepted. The existing One-time, Monthly and legacy mixed prices still work.

Open **Time Tracker** in the navigation, or **Start tracking** in an hourly
project. Select a client and one of its hourly projects, or choose **Custom
activity** and enter its name. Use **Pause**, **Resume** and **Finish**. The
mini-timer opens the controls from other Studio screens. A running timer continues
while its tab is closed; both running and paused sessions restore from the server.

The project's **Time & earnings** panel supports adding and editing manual time.
Enter a work date, start time to the minute, and separate hours and minutes
(up to 24 hours per entry). Older entries retain their unknown start time and
exact seconds until explicitly edited. Existing entries retain their saved rate.

Use **Delete time** on any manual or tracked history row, in either the project
or Time Tracker. Confirmation removes that entry, its segments, and its earned
value. Deleting an open timer also clears the mini-timer. Retries use the same
request ID, so a lost response cannot delete another entry. Project totals and
Overview revenue update automatically; other tabs refresh too. Projects with
remaining time records cannot be deleted or changed away from Hourly billing.

**Workspace / Projects** at `/admin/projects` lists projects across clients.
It opens with active, planned and on-hold work; status filters also expose
completed/cancelled projects. Search by project or client, filter by client or
billing, and open the existing project workspace from a card. Archived clients
are excluded. Filters survive refresh and browser back/forward; results paginate
at 25 projects per page.

Project cards now have a subtle hover and a full-card button. Clicking opens the
existing project detail inside a rounded, scrollable dialog above the list on
desktop and mobile. Briefs, editing, tasks, notes and time entries remain usable;
closing restores the list and focus, including refreshed prices after editing.
The status chip offers **Active / Paused / Done** using the existing versioned
status API. Done leaves the default In progress view and remains available in
the Done filter. Status updates preserve the active filters. Escape and outside
click dismiss the status picker or dialog; in-flight saves prevent dismissal.

Time Tracker provides Today / This week / This month totals, history filtered by
date, client, project and activity type, and a session’s active segments. Dates
use the browser’s IANA timezone, falling back to Europe/Bratislava. Weekly totals
start on Monday. Period totals clip each segment at local midnight, including
DST transitions. A filtered history row shows the full session, as its caption
explains. Timed manual records also overlap and clip at local midnight; older
date-only records remain assigned to their work date. Nonexistent start times
during spring daylight-saving transitions are rejected. An ambiguous autumn
clock time follows PostgreSQL's standard-time interpretation.

If a command cannot be confirmed, the timer shows the last confirmed state and
offers **Synchronize** and **Retry command**. Retrying uses the same request ID.
An offline pause does not pretend to have stopped the server timer. Unconfirmed
manual saves retain their payload for the next Save time attempt.

Overview's **Revenue / One-time projects** includes agreed one-time prices plus
finished hourly timers and manual time entries at their saved rates. The card
shows the hourly contribution separately. Running and paused timers enter revenue
after **Finish**. Each project is counted once regardless of its number of time
entries. Cancelled projects and archived clients remain excluded; monthly revenue
keeps its existing rules.

## Storage and authorization

Migration: `supabase/migrations/20261007204318_hourly_time_tracker.sql`.
Revenue follow-up: `supabase/migrations/20261007210620_hourly_project_revenue.sql`.
Entry details and Projects: `supabase/migrations/20261007214855_time_entry_details_and_projects.sql`.

- Adds nullable `crm_projects.hourly_rate_cents`; existing price columns and rows
  are retained. A non-null hourly rate requires the other price columns to be null.
- Adds `crm_time_sessions`, `crm_time_segments`, `crm_time_manual`, owner RLS,
  supporting indexes and read RPCs. Authenticated clients have SELECT only on
  time tables. The private mutation function checks current owner membership.
- Uses a transaction lock per owner, a unique partial index for one open session,
  one open segment per session, optimistic versions and a private retry ledger.
  Late retries cannot pause or finish a newer segment. All command timestamps
  originate in Postgres, at whole-second precision.
- Captures the rate on creation. Editing a manual entry keeps its original rate;
  changing a project rate applies to new records only. Money uses integer cents
  and PostgreSQL numeric arithmetic, rounded once per record; totals sum those
  cents. Browser estimates use BigInt. Earned value is separate from payments.
- Preserves history with restrictive project foreign keys. The private retry
  ledger is not exposed through the Data API; its owner FK cleans up on account
  deletion.

No new dependency, paid service, API credential or environment variable is needed.
Future environments must apply the migrations before deploying the updated app.
At this verification, local and remote histories contained the same 64 versions
(MD5 of sorted comma-separated versions: `5674611b8d26ba7fd5420f8789e8a233`).

## Changed files

| Area | Files |
| --- | --- |
| Database | `supabase/migrations/20261007204318_hourly_time_tracker.sql`, `supabase/migrations/20261007210620_hourly_project_revenue.sql` |
| API | `src/crm/time-tracker.js`, `src/crm/clients.js`, `src/crm/handler.js`, `src/admin/handler.js` |
| Entry management and Projects | `public/admin/time-manual-editor.js`, `public/admin/workspace-projects.js`, `tests/time-entry-details.test.js` |
| Shared calculations | `public/admin/time-values.js` |
| Timer, history and manual UI | `public/admin/time-store.js`, `time-tracker.js`, `time-history.js`, `time-project.js`, `time-tracker.css` |
| Existing project UI | `public/admin/crm-project-editor.js`, `crm-project-workspace.js`, `crm-clients.js`, `crm-project-revenue.js` |
| Navigation and routes | `public/admin/studio.js`, `crm.js`, `index.html`, `public/ui/icons.js`, `server.js`, `vercel.json` |
| Tests | `tests/time-tracker.test.js`, `tests/time-revenue.test.js`, `tests/helpers/time-database.js`, `tests/crm-project-workspace.test.js`, `tests/browser/time-tracker.spec.js`, `tests/browser/time-tracker-live.spec.js` |

## Verification

- `npm.cmd test`: 371 passed, one existing opt-in storage test skipped.
- `npm.cmd run icons:validate`: passed, including dynamic timer SVG states.
- `npm.cmd run build`: passed. Syntax checks passed for the affected JavaScript.
- 20 browser tests passed across the new tracker, existing projects, clients,
  admin and navigation suites, including the opt-in live Supabase test.
- Local browser coverage uses the real admin HTTP/auth/validation handlers and
  the migrated SQL in an isolated PGlite database. It covers desktop 1440px and
  mobile 390px, hourly creation, manual CRUD, previews/totals, pause/resume/finish,
  running and paused refresh, navigation/mini-timer, segments, custom activity,
  lost start confirmation with safe retry, and two tabs.
- Live coverage uses a temporary owner and real Supabase: concurrent start
  requests produce one success and one conflict, timer state persists, repeated
  finish/manual requests do not duplicate work, rates stay historical, and
  project deletion is rejected when it would remove time history. Cleanup was
  verified: zero temporary users/companies and zero orphan sessions/retry rows.
- SQL tests also cover the `3h15 + 2h30 at EUR60/h = EUR345` example, stale
  versions, direct-write denial, owner isolation, removed-owner/anonymous access,
  invalid durations, midnight and DST.
- Supabase advisors found no new security warning or missing foreign-key index
  for this feature. The private retry ledger has an expected informational
  RLS-without-policy notice: its table denies all client access. Existing
  unrelated advisor findings were left as they were.
- Revenue follow-up: 14 focused Node tests and 9 browser tests passed, including
  the live Supabase flow and desktop/mobile revenue cards. SQL coverage verifies
  fixed prices plus hourly earnings, saved rates, edits/deletes, exclusions,
  owner isolation and no duplicate project counts. Build and icon checks passed;
  temporary live data was removed and migration histories match.

To repeat the normal feature browser tests:

```powershell
npx.cmd playwright test tests/browser/time-tracker.spec.js tests/browser/crm-projects.spec.js
```

To run the isolated live verification against the `.env` Supabase project:

```powershell
$env:LIVE_TIME_TRACKER='true'
npx.cmd playwright test tests/browser/time-tracker-live.spec.js
```

The tracker has one open timer per owner. Finished tracked durations remain
read-only, but their entries can be deleted. CSV export and invoicing integration
remain outside this feature.
Time continues until the server accepts Pause or Finish. The compact timer lives
in the Studio shell; the separate Connected apps screen has its own shell.

## Entry details and Workspace Projects verification

- Four database/API regression tests cover confirmed, versioned and idempotent
  deletion of manual, completed tracked and open/custom entries; ownership and
  direct-write denial; rate/revenue updates; minute validation; DST/midnight;
  date-only compatibility; and Projects filters, pagination and client isolation.
- 15 focused browser tests passed across the tracker, project workspace and admin
  suites. New flows were exercised at 1440px and 390px, including cancelled
  deletion, lost deletion confirmation/retry, precise manual entry, Projects
  filters and navigation. Screenshots were visually reviewed.
- The live Supabase browser test passed with a temporary owner: exact start time
  and minute duration persisted, Projects opened the correct detail, all four
  manual/tracked/custom entries were individually deleted, and revenue returned
  to the fixed project price. Cleanup checks found zero test users/companies or
  orphan sessions/retry rows. No new Supabase security advisories appeared.
- Build, SVG icon validation and whitespace checks passed. Local preview remains
  available at `http://localhost:3000/admin/projects`.

Project-card follow-up (8 October): 11 focused browser cases passed across the
project and tracker suites, including desktop/mobile card clicks, popup manual
entries, edited prices reflected in the list, status persistence and filtering,
keyboard/focus, backdrop dismissal, loading retries and stale-status conflicts.
Eight project API tests, build, SVG validation and whitespace checks passed.
No database migration or application deployment was needed for this follow-up.
