# SHAPEVIZ PRESENTATION STUDIO → SALES / CRM WORKSPACE

## PROJECT CONTEXT

I already have a working private admin panel for Shapeviz called **Presentation Studio**.

The existing application currently allows me to:
- create/manage client presentations,
- upload presentation templates,
- upload HTML presentations,
- publish presentations,
- track presentation analytics,
- track visits,
- active time,
- average time per visit,
- slide views,
- website clicks,
- click-through rate,
- display presentation visit activity over time.

The current admin UI has a strong established visual identity:
- almost black background,
- very dark brown surfaces,
- warm orange / amber accent,
- off-white typography,
- large uppercase editorial headings,
- rounded cards,
- subtle borders,
- minimal premium appearance,
- compact left sidebar,
- lots of whitespace,
- Shapeviz visual identity.

DO NOT redesign the application into a generic SaaS/CRM dashboard.

The new CRM functionality must look like a natural extension of the existing Shapeviz Presentation Studio.

Before changing anything:
1. inspect the existing repository,
2. inspect the existing routing,
3. inspect the current database/schema,
4. inspect how authentication currently works,
5. inspect how presentations and analytics are stored,
6. reuse existing components, styles, tokens and conventions whenever possible.

Do not break any existing Presentation Studio functionality.

---

# MAIN GOAL

Expand the Shapeviz admin panel into a lightweight internal sales CRM.

This system is only for my own Shapeviz business.

I want to gradually build a database of companies that could potentially become Shapeviz clients.

I should be able to:

- add companies,
- research/store basic information about them,
- categorize them,
- store contacts,
- see whether I contacted them,
- see whether I sent them a presentation,
- connect a Shapeviz presentation to a company,
- see whether they viewed the presentation,
- see whether they replied,
- manage follow-ups,
- move leads through a sales pipeline,
- search/filter the database,
- add notes,
- see all activity connected to the company,
- eventually see which companies are most engaged.

The CRM should stay lightweight and visual.

Do NOT turn this into an enterprise CRM.

The core workflow is:

COMPANY
→ CONTACT
→ PRESENTATION
→ PRESENTATION ANALYTICS
→ FOLLOW-UP
→ REPLY
→ MEETING
→ PROPOSAL
→ CLIENT

---

# NAVIGATION

Update the sidebar structure approximately to:

SHAPEVIZ
PRESENTATION STUDIO

Overview

SALES
- Leads
- Pipeline
- Follow-ups

PRESENTATIONS
- Presentations
- Templates
- Upload template
- Upload HTML

Then keep the existing private workspace/account section at the bottom.

Use appropriate minimal icons consistent with the existing interface.

Do not overcrowd the sidebar.

---

# 1. LEADS

Create a new main page:

/admin/leads

or follow the existing routing convention.

This is the central database of potential clients.

## Leads table

The default view should be a premium-looking table/list.

Suggested columns:

COMPANY
COUNTRY
INDUSTRY
STATUS
SERVICES
PRESENTATION
LAST CONTACT
NEXT ACTION
PRIORITY

Example:

Nario
SK
Furniture
Presentation viewed
CGI, Social Content
Viewed
22 Sep
Follow up 27 Sep
High

The UI should be visually clean.

Do not display every available field in the table.

The important information should be scannable quickly.

---

# COMPANY / LEAD DATA

Each lead/company should support the following data.

## Basic company information

- id
- company_name
- logo
- website
- instagram
- linkedin
- country
- country_category
- city
- industry
- short_description
- notes
- priority
- lead_source
- pipeline_status
- created_at
- updated_at
- archived_at / is_archived

## Country

I specifically want to quickly distinguish:

- Slovakia
- Czech Republic
- International

Store the actual country too if useful, but provide a convenient category/filter for:

SK
CZ
INT

Use small visual country badges where appropriate.

---

# INDUSTRIES

Industry should be flexible but support common values such as:

- Furniture
- Interior design
- Architecture
- Real estate / developer
- Lighting
- Product design
- Fashion
- Luxury
- Hospitality
- Automotive
- Agency
- Other

Ideally allow custom values or design the database so new industries can be added later.

---

# POTENTIAL SHAPEVIZ SERVICES

A company can have multiple services associated with it.

Initial values:

- Product CGI
- Archviz
- Product visualization
- 3D modelling
- 3D models for architects
- Social content
- Art direction
- AI content
- Animation
- Web
- Automation
- Other

Display these as compact tags.

Multiple services can be selected for one company.

---

# LEAD SOURCE

Support:

- Google
- Instagram
- LinkedIn
- Referral
- Existing contact
- Trade fair / event
- Inbound
- Manual research
- Other

This will later allow analysis of where good leads are coming from.

---

# PRIORITY

Allow manual priority:

LOW
MEDIUM
HIGH

Keep this separate from engagement.

Priority represents how interesting the company is to Shapeviz.

---

# 2. PIPELINE STATUS

Do not use just a boolean such as "contacted".

Implement a proper sales pipeline.

Statuses:

NEW_LEAD

QUALIFIED

PRESENTATION_READY

CONTACTED

PRESENTATION_VIEWED

REPLIED

MEETING

PROPOSAL

WON

LOST

Display user-friendly versions:

New lead
Qualified
Presentation ready
Contacted
Presentation viewed
Replied
Meeting
Proposal
Won
Lost

Status should be visually represented with small pills/badges.

The styling should remain subtle and premium.

Avoid overly colorful Trello-style UI.

---

# 3. PIPELINE PAGE

Create:

/admin/pipeline

Display the same leads from the database in a Kanban-style pipeline.

Columns should represent pipeline stages.

Suggested visible columns:

NEW
QUALIFIED
READY
CONTACTED
VIEWED
REPLIED
MEETING
PROPOSAL
WON

Lost leads can be accessible through a filter rather than taking permanent horizontal space.

Each card should show only useful information:

- company name
- country
- industry
- priority
- next action
- presentation engagement if available

Example card:

NARIO
Slovakia · Furniture

HIGH

Presentation viewed 3×
Follow up · 27 Sep

Allow drag and drop between pipeline stages.

When dropped:
- persist the new status to the database,
- create an activity timeline event recording the status change.

Example:

Pipeline status changed
Contacted → Presentation viewed

Do not make drag and drop the only way to update status.

Status must also be editable from company detail.

---

# 4. ADD LEAD

Add a clear:

+ Add lead

button.

Clicking it should open either:
- a premium modal,
- drawer,
- or dedicated page,

depending on the current component conventions.

Initial form should not overwhelm me.

Main fields:

Company name *
Website
Country
Industry
Potential services
Instagram
LinkedIn
Short description
Priority
Lead source

Optional contact:

Contact name
Position
Email
Phone

After creation, open the company detail page.

---

# 5. COMPANY DETAIL PAGE

Create a dedicated company/lead detail page.

Example:

/admin/leads/[id]

Header example:

NARIO

Furniture · Slovakia

nario.sk

STATUS:
PRESENTATION VIEWED

Priority: HIGH

Possible actions:

Edit
Change status
Add contact
Add note
Schedule follow-up
Create / assign presentation
Archive

---

# COMPANY DETAIL TABS

Use tabs approximately:

Overview
Contacts
Presentations
Activity
Notes

Do not create excessive nested interfaces.

---

# OVERVIEW TAB

Show important information at a glance.

Sections:

Company information

Potential Shapeviz services

Sales status

Priority

Contact summary

Next action

Latest activity

Presentation engagement

Website/social links

Notes preview

---

# 6. CONTACTS

A company can have multiple contacts.

Contact entity should support:

- id
- company_id
- full_name
- job_title
- email
- phone
- linkedin
- instagram if useful
- primary_contact boolean
- notes
- created_at
- updated_at

Example:

Martin Novák
Marketing Director

martin@nario.sk
LinkedIn →

PRIMARY CONTACT

Allow:

+ Add contact

Allow editing/removing contacts.

Do not delete the whole company when a contact is removed.

---

# 7. PRESENTATIONS ↔ COMPANIES

This is a critical part of the system.

Existing Shapeviz presentations must be connectable to leads/companies.

One company may eventually have more than one presentation.

For example:

NARIO
- Initial pitch
- Social content proposal
- Final proposal

Add company_id or a proper relationship depending on the existing database design.

When creating/editing a presentation, I should be able to select:

Associated company

When viewing a company, show its presentations.

Example:

SHAPEVIZ × NARIO

Created
21 Sep 2026

Sent
22 Sep 2026

Views
3

Active time
4m 28s

Slides viewed
22 / 27

Website click
Yes

[Open analytics]
[Open presentation]

Reuse existing analytics.

Do not duplicate analytics data unnecessarily.

Reference existing presentation analytics records wherever possible.

---

# PRESENTATION STATUS

For each presentation/company relationship, support useful sales metadata such as:

- presentation_created_at
- presentation_sent_at
- presentation_url
- sent_to_contact_id if relevant

If the existing presentation entity already contains equivalent information, extend that entity instead of duplicating fields.

---

# AUTO PRESENTATION ENGAGEMENT

Use existing presentation analytics to show engagement inside CRM.

Examples:

Viewed 3×

Last viewed today at 14:32

4m 28s active time

22 / 27 slides viewed

Website clicked

If a presentation receives its first real visit and the company pipeline status is still an earlier stage such as:

PRESENTATION_READY
or
CONTACTED

the system MAY automatically advance the status to:

PRESENTATION_VIEWED

But:

Never automatically move a company backwards.

Never override advanced statuses such as:

REPLIED
MEETING
PROPOSAL
WON
LOST

Create an activity event when an automatic status change happens.

---

# 8. ACTIVITY TIMELINE

Create a unified activity timeline for each company.

Example:

22 SEP · 14:32
Presentation viewed

22 SEP · 11:04
Presentation sent

21 SEP · 18:12
Presentation created

20 SEP · 16:45
Lead added

Possible event types:

lead_created

status_changed

contact_added

contact_updated

presentation_created

presentation_assigned

presentation_sent

presentation_viewed

website_clicked

note_added

followup_created

followup_completed

reply_received

meeting_scheduled

proposal_sent

lead_won

lead_lost

manual_activity

Store structured metadata where useful.

Example:

{
  from_status: "CONTACTED",
  to_status: "PRESENTATION_VIEWED"
}

Allow manual activity creation too, for example:

"Called marketing manager."

---

# 9. NOTES

Allow adding freeform notes to a company.

Each note should contain:

- content
- created_at
- updated_at
- user_id if the existing app supports users

Display newest first or as appropriate.

Notes should not replace activity events.

A note is user-written information.

Activity is system/history information.

---

# 10. FOLLOW-UPS

Create:

/admin/follow-ups

Follow-up entity should support:

- id
- company_id
- contact_id optional
- due_at
- title
- description optional
- completed_at
- created_at
- updated_at

Examples:

Follow up after presentation

Send second email

Call marketing manager

Send proposal

Prepare new visuals

---

# FOLLOW-UP PAGE

Group follow-ups approximately by:

OVERDUE

TODAY

UPCOMING

COMPLETED

Example:

TODAY — 3

NARIO
Presentation viewed · No reply
Follow up

WOOD COMPANY
Contacted 7 days ago
Send second email

Allow:

Mark complete

Reschedule

Open company

When a follow-up is completed:
- set completed_at,
- add an activity event.

---

# NEXT ACTION

Each lead should display its closest incomplete follow-up as:

Next action

Example:

Follow up · 27 Sep

This should appear in:
- Leads table,
- Pipeline cards,
- Company detail,
- Dashboard where useful.

---

# 11. SEARCH

Implement fast search on Leads.

Placeholder:

Search companies, contacts, websites...

Search should match at minimum:

- company name
- website
- company description
- contact name
- contact email

Use server-side/database search if necessary once the dataset grows.

For the expected initial dataset, prioritize simplicity and responsiveness.

---

# 12. FILTERS

Add filters for:

Country
Industry
Pipeline status
Potential service
Priority
Lead source
Presentation status
Last contacted
Has follow-up
Has replied

Filters should combine.

Example:

Country:
Slovakia

Industry:
Furniture

Status:
New lead

Service:
Product CGI

Result:
all Slovak furniture companies I have not yet contacted.

Include:

Clear filters

Do not allow the filter bar to become visually overwhelming.

Use dropdown/popover filters consistent with the current UI.

---

# 13. SORTING

Useful sorting:

Recently added

Company name

Last activity

Last contacted

Next follow-up

Priority

Most engaged

---

# 14. ENGAGEMENT / HOT LEADS

Keep manual priority separate from engagement.

Create an engagement indicator calculated from presentation analytics.

Do not pretend it is sophisticated AI.

It can simply identify unusually engaged leads.

Possible indicators:

COLD
ACTIVE
HOT

Suggested simple logic:

HOT if one or more strong engagement signals exist such as:

- multiple presentation visits,
- high active viewing time,
- most slides viewed,
- website click,
- multiple visits over multiple sessions.

ACTIVE if the presentation has meaningful engagement but not enough for HOT.

COLD if there is little/no interaction.

Make thresholds easy to adjust in one place in code.

Display this subtly.

Example:

HOT LEAD

3 visits
4m 28s active
Website clicked

Do not overwrite manual priority based on engagement.

---

# 15. OVERVIEW DASHBOARD

The current Overview page is heavily focused on presentation analytics.

Evolve it into a Shapeviz business dashboard while preserving existing presentation analytics.

Top-level cards could become:

TOTAL LEADS

CONTACTED

REPLIES

MEETINGS

ACTIVE OPPORTUNITIES

WON

Potential additional metric:

PIPELINE VALUE

if opportunity values are implemented.

Below that show:

FOLLOW-UPS

Example:

3 due today
2 overdue

Then:

SALES PIPELINE

Example:

126 leads

43 contacted

28 presentations viewed

11 replies

4 meetings

2 clients

Do not create misleading conversion statistics when there is no data.

---

# PRESENTATION ANALYTICS ON OVERVIEW

Keep the valuable existing presentation statistics.

They can move lower on the page into a section such as:

PRESENTATION PERFORMANCE

Containing existing metrics:

Visits
Active time
Average / visit
Slide views
Website clicks
CTR

Keep the existing presentation visit graph.

Do not remove working analytics.

---

# 16. PIPELINE / OPPORTUNITY VALUE

Allow optional estimated value per lead.

Fields could be:

estimated_value
value_type

value_type:

ONE_TIME
MONTHLY
UNKNOWN

Examples:

€3,000 project

€1,500 / month

Do not require this field.

If values exist, dashboard can show:

OPEN PIPELINE VALUE

Keep monthly recurring value separate from one-time project value where possible.

Do not simply sum €3,000 project + €1,500/month into one meaningless number.

Display for example:

One-time pipeline
€12,500

Monthly opportunities
€4,500/mo

---

# 17. WON / LOST

When moving a company to WON:

optionally allow:

Won date
Service sold
Project value
Monthly recurring value
Notes

When moving to LOST:

allow optional:

Lost reason

Suggested reasons:

No reply
Not interested
Budget
Timing
Already has supplier
Not a fit
Other

Do not require a reason.

Keep lost leads in the database.

Do not delete them.

---

# 18. ARCHIVING

Allow leads to be archived.

Archived companies should not appear by default in active Leads/Pipeline views.

Provide:

Show archived

Avoid hard deleting records from the normal UI unless there is an explicit destructive action.

---

# 19. DATABASE DESIGN

Use the project's existing database technology.

If the current app is already using Supabase/Postgres, continue using it.

Do not introduce a second database.

Design the schema cleanly.

Likely entities will include some variation of:

companies / leads
contacts
lead_services
followups
notes
activities
presentations

and existing presentation analytics tables.

Avoid storing comma-separated arrays in plain text if relational tables or Postgres arrays are more appropriate.

Follow existing schema conventions.

Use migrations.

Do not edit production schema manually without migrations.

---

# OWNERSHIP / AUTH

This is currently a private Shapeviz workspace.

All CRM records must belong to the authenticated workspace/user.

If Supabase Auth is used:

include appropriate owner/user/workspace IDs.

Apply proper RLS policies.

A logged-in user should only access their own CRM data.

Do not expose CRM endpoints publicly.

Public presentation viewing must continue working exactly as it currently does.

Be careful not to apply restrictive CRM RLS rules that break public presentation analytics collection.

---

# 20. DATES

Store timestamps consistently, preferably UTC in the database.

Display them in the user's local timezone.

Reuse the project's existing date utilities.

Examples in the UI:

22 Sep 2026

Today, 14:32

3 days ago

Avoid inconsistent date formatting across pages.

---

# 21. RESPONSIVE DESIGN

The admin panel should work properly on:

large desktop
laptop
tablet
mobile

Desktop is the primary experience.

Do not simply shrink the desktop Leads table on mobile.

For smaller screens, convert lead rows into compact cards or another usable responsive layout.

Kanban should allow horizontal scrolling on smaller screens.

Sidebar should use the existing responsive behavior or become collapsible.

---

# 22. VISUAL DESIGN REQUIREMENTS

Very important:

Keep the current Shapeviz visual identity.

Reference the existing Overview page.

Use:

black backgrounds

warm brown/black card surfaces

subtle orange glow / accent

off-white text

muted secondary text

thin low-contrast borders

rounded corners

large editorial headings

small uppercase labels

minimal icons

premium spacing

The CRM should feel like:

SHAPEVIZ INTERNAL STUDIO

not:

generic HubSpot clone

Avoid:

bright blue SaaS colors

rainbow status chips

large amounts of white

generic Material UI appearance

overly dense spreadsheets

heavy gradients

unnecessary charts

---

# 23. INTERACTIONS

All important interactions need proper states:

loading

empty

error

success

disabled

hover

focus

confirmation for destructive operations

Examples of good empty states:

NO LEADS YET

Start building your potential client database.

[Add lead]

and:

NO FOLLOW-UPS TODAY

Nothing requires your attention right now.

Do not show broken/empty graphs when no data exists.

---

# 24. PERFORMANCE

Leads may eventually grow to hundreds or thousands.

Do not load unnecessary presentation analytics for every lead row if this causes expensive queries.

Use efficient aggregate queries/views/server functions where appropriate.

Index fields commonly used for:

search
company_id
status
country
created_at
due_at
presentation relationship

Avoid N+1 database queries.

---

# 25. EXISTING PRESENTATIONS

Do not change public presentation URLs unless absolutely necessary.

Existing links such as:

/p/company-name

must continue functioning.

Existing presentations must remain accessible.

Existing analytics must remain intact.

Database migrations must preserve all existing data.

---

# 26. EMAIL

For the first CRM version, do NOT build a full email client.

It is enough to manually record:

Presentation sent

Email sent

Reply received

However, design the data model so Gmail integration could be added later.

If email functionality already exists in the project, inspect it before deciding.

Do not add a third-party email service just for CRM tracking unless necessary.

---

# 27. MVP PRIORITY

Implement in this order.

PHASE 1 — CORE CRM

Leads database

Add/edit company

Company detail

Contacts

Search

Filters

Pipeline statuses

Kanban

Notes

Activity timeline

Follow-ups

Presentation-company relationship

Presentation engagement inside company page

Dashboard CRM metrics

PHASE 2 — ENHANCEMENTS

Engagement / HOT lead indicator

Opportunity values

Won/lost metadata

Advanced filtering

Better reporting

Lead source analytics

Additional automation

Do not spend time building speculative complex features before the core CRM is stable.

---

# 28. IMPORTANT UX PRINCIPLE

I want this system to help answer these questions very quickly:

Who can I contact next?

Who did I already contact?

Who did I send a presentation to?

Who actually opened the presentation?

Who seems interested?

Who replied?

Who should I follow up with today?

Which leads are progressing?

Which leads became clients?

The interface should optimize for these questions.

---

# 29. EXAMPLE USER FLOW

I find a furniture company called Nario.

I click:

+ Add lead

I enter:

Company:
Nario

Country:
Slovakia

Industry:
Furniture

Services:
Product CGI
Social Content
3D Models for Architects

Priority:
High

Source:
Instagram

I save it.

Status:

NEW LEAD

Later I prepare:

Shapeviz × Nario

I assign the presentation to Nario.

Pipeline becomes:

PRESENTATION READY

I send the presentation.

I mark:

Presentation sent

Status becomes:

CONTACTED

The person opens the presentation.

Existing presentation analytics record the visit.

CRM shows:

PRESENTATION VIEWED

3 visits

4m 28s active time

22 / 27 slides

Website clicked

A few days later I create:

Follow up
27 September

It appears on my Follow-ups page.

They reply.

I change status to:

REPLIED

Then:

MEETING

Then:

PROPOSAL

Eventually:

WON

The entire history should remain visible in Nario's Activity timeline.

That is the intended workflow.

---

# 30. CODE QUALITY

Keep the implementation maintainable.

Requirements:

- use existing project architecture,
- reuse existing UI components,
- create reusable CRM components,
- use strongly typed data,
- avoid huge monolithic page components,
- avoid duplicated business logic,
- centralize pipeline statuses/constants,
- centralize service options,
- centralize industry options where appropriate,
- centralize engagement thresholds,
- handle database errors,
- create clean migrations,
- preserve existing code style.

If TypeScript is already used, keep everything strongly typed.

---

# 31. BEFORE IMPLEMENTATION

Before writing significant code:

Inspect the repository and provide a short implementation plan based on the actual current architecture.

Identify:

- framework,
- routing system,
- database,
- authentication,
- existing presentation schema,
- existing analytics schema,
- relevant reusable UI components,
- styling system,
- potential migration risks.

Then implement the system incrementally.

Do not recreate infrastructure that already exists.

---

# 32. AFTER IMPLEMENTATION

When finished:

Run the project's existing validation commands.

At minimum where available:

- typecheck
- lint
- build
- tests

Fix introduced errors.

Do not leave placeholder components or mocked CRM data in production UI unless explicitly marked as development-only.

Provide a summary of:

- files created,
- files modified,
- database migrations,
- new routes,
- new tables,
- important architectural decisions,
- anything I need to configure manually.

---

# ACCEPTANCE CRITERIA

The implementation is complete when I can:

1. log into my existing Shapeviz admin,

2. open Leads,

3. create a potential client,

4. classify them as Slovakia / Czech Republic / International,

5. assign an industry,

6. assign multiple Shapeviz services,

7. store their website/socials,

8. add one or more contact people,

9. search for the company later,

10. filter companies,

11. move the company through pipeline stages,

12. view the same companies in Kanban,

13. create notes,

14. create follow-ups,

15. see overdue/today/upcoming follow-ups,

16. connect an existing or new Shapeviz presentation to the company,

17. see existing presentation analytics from inside the company detail,

18. see when the presentation was viewed,

19. see company activity history,

20. identify highly engaged leads,

21. mark a lead as replied/meeting/proposal/won/lost,

22. archive old leads,

23. see useful CRM statistics on Overview,

24. still use every existing Presentation Studio feature without regression,

25. use the admin comfortably on desktop and mobile.

The final result should feel like the existing Shapeviz Presentation Studio has naturally evolved into a custom internal sales operating system for Shapeviz.