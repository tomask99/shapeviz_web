# Studio UI refresh

Implemented on 7 October 2026. Application changes are available in the local
checkout and development server. No application deployment or Git push was made.

## Removed features

Removed Today / Action Center and Suggested next steps, including their UI
controllers, timers, API routes, recommendation rules, feature-specific styles
and obsolete tests. Overview no longer requests their data or renders a second
follow-up dashboard. Regular Follow-ups, company tasks and activity history remain
available through their existing screens.

Applied `supabase/migrations/20261007212243_remove_action_center_suggestions.sql`
to the connected `shapeviz_web` database. It removes the five dedicated RPCs and
the suggestion dismissal/snooze state table without CASCADE. Dependency checks
confirmed that no shared function called the retired functions. Read-back checks
confirmed that the retired objects are absent and follow-ups, project revenue
and time sessions remain present. Existing migrations are retained for replay.

Local and remote histories match: 63 versions, MD5 of sorted comma-separated
versions `52f67e4540d7e3847aa248405b570622`. Security advisors report no new findings.

## Interface

- Revenue leads the Overview, including completed hourly work. Four compact
  metrics and a visual pipeline replace the dense stack of explanatory sections.
- Calculation details, lead sources and traffic breakdowns expand on request.
  Empty website charts no longer take up blank space.
- Shared charcoal surfaces, warm gold accents, smaller headings, consistent
  forms and controls, and tighter spacing cover the Studio and Connected apps.
- Navigation groups Workspace, Sales and Library. Search stays in the header;
  upload and account actions have compact menus. Mobile navigation scrolls
  horizontally and retains labels and accessible SVG icons.
- Clients, projects, presentations, research, reports and the time tracker use
  the shared styling. Research cards already in Leads keep their accent state.

Primary files: `public/admin/studio-polish.css`, `studio-shell.js`,
`crm-overview.js`, `crm-project-revenue.js`, `crm-pipeline-value.js`, `index.html`.

## Verification

Node tests cover API retirement, owner scopes, shared CRM functionality and hourly
revenue. Browser verification covers desktop and mobile Overview, navigation,
account/upload menus, clients, projects, timer states, follow-up CRUD, pipeline,
research, recent activity, website charts and connected-app authorization.
Screenshots were visually reviewed at desktop and 390px mobile widths. Build,
SVG icon validation and Git whitespace checks pass.

Preview: `http://localhost:3000/admin`.
