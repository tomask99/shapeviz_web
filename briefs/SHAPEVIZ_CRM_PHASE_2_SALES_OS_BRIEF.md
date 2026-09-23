# SHAPEVIZ STUDIO — CRM PHASE 2 / SALES OPERATING SYSTEM

## PURPOSE

This document defines the second development phase of the existing Shapeviz internal admin.

The current system already contains the core CRM / Presentation Studio functionality from Phase 1:

- Leads database
- Company detail
- Contacts
- Pipeline statuses
- Kanban pipeline
- Follow-ups
- Notes
- Activity timeline
- Presentation ↔ company relationships
- Presentation analytics
- Search and filters
- CRM dashboard metrics
- Existing Shapeviz presentation creation and management

The goal of this phase is **not** to replace or redesign Phase 1.

The goal is to evolve the current system from a database of leads into a practical internal **sales operating system** that helps answer:

- Who should I contact today?
- Who opened a presentation?
- Who is showing strong interest?
- Who has not replied yet?
- Who should receive a follow-up?
- Which leads are genuinely a good fit for Shapeviz?
- Which presentations generate the strongest engagement?
- Which leads became clients?
- What should I do next?

The admin should gradually evolve from “Presentation Studio” into a broader internal **Shapeviz Studio / Shapeviz OS**, while keeping Presentation Studio as a core module.

---

# CRITICAL IMPLEMENTATION RULE

Before implementing anything:

1. inspect the actual repository,
2. inspect what Phase 1 already implemented,
3. inspect current database migrations/schema,
4. inspect existing presentation analytics,
5. inspect auth / workspace ownership,
6. inspect routing and component architecture,
7. inspect current dashboard and lead detail pages,
8. inspect existing server actions / API routes,
9. reuse existing design system and components,
10. identify which features below are already partially present.

Do NOT blindly implement duplicate functionality.

Do NOT create a parallel CRM architecture.

Extend what already exists.

Preserve all current presentation URLs, public tracking, analytics and CRM data.

---

# HIGH-LEVEL PRODUCT DIRECTION

The admin should eventually behave like:

OVERVIEW
→ what requires my attention today

LEADS
→ companies that could become Shapeviz clients

PIPELINE
→ current sales stages

FOLLOW-UPS
→ what I need to do next

CLIENTS
→ converted / paying companies

PROJECTS
→ work performed for clients

PRESENTATIONS
→ pitch decks and analytics

The current phase should prioritize **daily sales usefulness** rather than adding large amounts of passive statistics.

---

# PHASE 2 PRIORITY ORDER

Implement in this order unless repository architecture strongly suggests otherwise:

## PHASE 2A — DAILY SALES WORKFLOW
1. Today / Action Center
2. Recent activity
3. Smart follow-up suggestions
4. Recipient-specific presentation tracking
5. Quick notes
6. Saved views

## PHASE 2B — LEAD INTELLIGENCE
7. Fit vs Engagement
8. Quick-add company from URL
9. Duplicate detection
10. Better presentation engagement signals

## PHASE 2C — CRM → CLIENT WORKFLOW
11. Convert lead to client
12. Clients section
13. Presentation creation directly from lead
14. Presentation versions
15. Projects under clients

## PHASE 2D — ANALYTICS / OPERATIONS
16. Revenue / opportunity analytics
17. Conversion analytics
18. Lost reason analytics
19. CSV import/export
20. Global command palette

## PHASE 2E — INTEGRATIONS READY
21. Gmail-ready architecture
22. Calendar-ready architecture

Do not build unnecessary integration complexity before the core UX works.

---

# 1. TODAY / ACTION CENTER

The main Overview should become action-oriented.

At the top of the dashboard add a section:

TODAY

or

ACTION CENTER

The exact label may follow the current visual language.

This should be the most useful part of the CRM.

It should surface actionable items rather than just statistics.

Examples:

3 follow-ups overdue

2 presentations viewed since yesterday

1 hot lead without follow-up

4 qualified leads never contacted

2 replies waiting for action

1 meeting requiring next step

---

# ACTION ITEMS

Each action item should be linked to a specific company.

Example:

NARIO

Presentation viewed 3×
Last viewed 18 min ago

[Open lead]
[Create follow-up]

Another:

WOOD COMPANY

Follow-up overdue by 3 days

[Complete]
[Reschedule]
[Open]

Another:

XYZ

Presentation sent 7 days ago
No recorded visit

[Open]
[Schedule follow-up]

Actions should be compact and fast.

Do not force navigation to another page for simple operations.

---

# ACTION CENTER RULES

Use deterministic rules.

Do NOT present this as AI.

Examples of rules:

FOLLOW_UP_OVERDUE
if incomplete follow-up due_at < now

FOLLOW_UP_TODAY
if due today

VIEWED_NO_FOLLOWUP
if presentation viewed recently and no future follow-up exists

MULTIPLE_VIEWS
if presentation has multiple sessions within configurable recent period

CONTACTED_NOT_VIEWED
if presentation/contact was sent X days ago and no visit exists

REPLIED_NEEDS_NEXT_ACTION
if lead status is REPLIED and no upcoming follow-up/meeting exists

MEETING_NEEDS_ACTION
if meeting status exists but no next follow-up/action exists

QUALIFIED_NOT_CONTACTED
if lead is qualified but has never been contacted

HOT_LEAD_IDLE
if engagement = HOT and there is no future task

Thresholds must be centralized in configuration/constants.

Do not scatter magic numbers across components.

---

# ACTION DISMISSAL

Some recommendations may not be relevant.

Allow dismissing / snoozing selected suggestions.

Possible fields:

dismissed_until

dismissed_at

dismiss_reason optional

Do not delete historical CRM data just because a suggestion is dismissed.

---

# 2. RECENT ACTIVITY

Add a Recent Activity component to Overview.

Example:

RECENT ACTIVITY

18 min ago
Nario viewed Shapeviz × Nario

34 min ago
Wood Company returned for a second presentation visit

1h ago
XYZ clicked the Shapeviz website

Yesterday
Company ABC moved to Proposal

Yesterday
Follow-up completed for Studio XYZ

Activity should combine useful CRM events and presentation engagement.

Reuse the existing activity/event architecture where possible.

---

# ACTIVITY FILTERING

Recent Activity should not become noisy.

Prioritize:

presentation viewed

repeat presentation visit

website click

reply received

status change

follow-up completed

meeting scheduled

proposal sent

won

lost

important manual activity

Avoid filling the feed with trivial system events.

---

# 3. RECIPIENT-SPECIFIC PRESENTATION TRACKING

This is an important upgrade.

Currently a presentation may be associated with a company.

Add the ability to generate a unique tracked presentation link for an individual recipient/contact.

Example conceptual URL:

/p/nario?r=<secure-token>

Do NOT expose contact emails or sequential database IDs in the public URL.

Use a random, opaque recipient token.

---

# PRESENTATION RECIPIENT ENTITY

Create an entity such as:

presentation_recipients

Suggested fields:

id
presentation_id
company_id
contact_id nullable
recipient_name nullable
recipient_email nullable
token_hash or secure_token strategy
created_at
sent_at nullable
revoked_at nullable
last_viewed_at nullable

Prefer connecting to an existing contact when possible.

Allow an ad-hoc recipient if the person has not yet been saved as a formal CRM contact.

---

# TRACKING BEHAVIOR

When a recipient-specific URL is opened:

associate presentation analytics/session with:

presentation_id
recipient_id
company_id

Do not break anonymous/general presentation links.

Generic public links should continue to work.

Analytics must support:

anonymous traffic
company-linked traffic
recipient-linked traffic

without destroying existing data.

---

# RECIPIENT ANALYTICS

On the company/presentation detail page show:

Martin Novák
Marketing Director

Sent 22 Sep

Views 3

Active time 4m 12s

Slides viewed 24 / 27

Last viewed Today, 14:32

Website clicked Yes

This is especially important if multiple people from the same company receive the same presentation.

---

# PRIVACY / SECURITY

Recipient tracking must be privacy-conscious.

Do not expose sensitive CRM data publicly.

The public presentation page should receive only the minimum recipient context required for analytics.

Never render private notes, email history, CRM status or company internal metadata into public page source.

Recipient tokens should be sufficiently random and revocable.

If using hashes, follow existing security conventions.

---

# 4. PRESENTATION SHARE / SEND FLOW

On a presentation detail page provide a workflow:

Share presentation

Select:
- existing contact
- create new contact
- anonymous/general link

For recipient share:

Generate tracked link

Allow:
Copy link

Optionally:
Mark as sent

If marked as sent:

set recipient sent_at
create activity:
presentation_sent

If Gmail integration is added later, this same entity should support automatic sent tracking.

---

# 5. SMART FOLLOW-UP SUGGESTIONS

Create lightweight rule-based follow-up recommendations.

Do NOT automatically send emails.

Do NOT automatically contact clients.

The system should recommend actions; I make the decision.

Examples:

Presentation viewed 3 days ago
No reply recorded

SUGGESTED ACTION
Follow up

---

Presentation sent 7 days ago
Never opened

SUGGESTED ACTION
Resend or contact another person

---

Presentation viewed 4× today
Website clicked

SUGGESTED ACTION
High engagement — consider following up

---

Lead marked Replied
No next action scheduled

SUGGESTED ACTION
Schedule next step

---

# CREATE FOLLOW-UP FROM SUGGESTION

Each suggestion should allow:

Create follow-up

Dismiss

Snooze

Open lead

When Create follow-up is clicked:

pre-fill:
company
suggested title
reasonable due date

Allow editing before save.

---

# 6. QUICK NOTES

Notes should be extremely fast to create.

Add + Note actions where useful:

Company detail header

Pipeline card context menu

Action Center item

Global command palette later

Potential quick-note UI:

small modal / popover

textarea

Save

No complex rich-text editor required.

---

# NOTE EXAMPLE

"Called marketing director. New showroom planned for October. Follow up after 15 Oct."

After saving:

show it immediately

create a note record

optionally create activity:
note_added

Do not make users navigate through multiple tabs simply to add a note.

---

# 7. SAVED VIEWS

Leads filters will become increasingly useful as the database grows.

Allow users to save combinations of filters/sorting.

Examples:

SK Furniture

CZ Not Contacted

Hot Leads

Presentation Viewed / No Reply

High Priority

Social Content Prospects

3D Models for Architects

---

# SAVED VIEW ENTITY

Suggested:

saved_views

id
user_id / workspace_id
name
view_type
filter_config jsonb
sort_config jsonb
created_at
updated_at
is_default boolean

view_type initially:
LEADS

Potentially later:
PIPELINE
CLIENTS

---

# SAVED VIEW UX

At the top of Leads:

All leads
[Saved views dropdown]

Allow:

Save current view

Rename

Delete

Set default

Do not create dozens of permanent sidebar navigation items.

---

# 8. FIT VS ENGAGEMENT

Keep these concepts separate:

PRIORITY
→ manually selected by me

FIT
→ how appropriate the company is for Shapeviz

ENGAGEMENT
→ how strongly the company/recipient is interacting

Do not collapse all three into one score.

---

# FIT

Initial options:

LOW
MEDIUM
HIGH

For now Fit can be manually assigned.

Later it could be assisted by rules, but do not add fake AI scoring.

Possible factors that can eventually influence fit:

industry
company size
quality of brand
services potentially needed
market/country
known budget
frequency of content
product catalogue size

But Phase 2 should keep it understandable.

---

# ENGAGEMENT

Possible display values:

NONE
COLD
ACTIVE
HOT

Engagement should be derived automatically from presentation analytics.

Centralize logic.

Example configurable logic:

NONE:
no presentation interaction

COLD:
1 short visit and limited slides

ACTIVE:
meaningful viewing time or strong slide progress

HOT:
strong signals such as:
- repeat visits
- high active time
- high percentage of slides viewed
- website click
- return visits on separate sessions

Do not rely on a single metric only.

---

# ENGAGEMENT DETAILS

Always allow the user to see why a lead is considered HOT/ACTIVE.

Example:

HOT

3 visits

4m 28s active time

89% slides viewed

Website clicked

Never show an unexplained opaque score like:

82/100

unless a transparent scoring model is intentionally introduced later.

---

# 9. QUICK ADD COMPANY FROM URL

Create a faster lead creation flow.

Possible UI:

+ Add lead

options:

Add manually

Add from website

For:

Add from website

input:

https://company.com

---

# URL ENRICHMENT

The system may attempt to prefill publicly available basic information such as:

company name

domain

website title

website meta description

favicon/logo candidate

social links explicitly linked from the site

country if clearly available

city if clearly available

short company description

Do not hallucinate missing information.

Only prefill information that can be derived reliably.

The user must be able to review/edit before saving.

---

# IMPLEMENTATION CAUTION

Do not introduce an expensive external enrichment provider unless the current architecture already uses one or it is explicitly justified.

Start with website metadata / public site information if practical.

If server-side fetching introduces security risks:

protect against SSRF.

Do not allow arbitrary access to:
localhost
private IP ranges
cloud metadata endpoints
internal services

Validate protocols.

Allow only http/https.

Set request timeout and size limits.

---

# 10. DUPLICATE DETECTION

When creating/importing a lead, detect likely duplicates.

Strong duplicate indicators:

same normalized domain

same normalized website

same exact company name + country

same contact email domain where appropriate

---

# DUPLICATE UX

Example:

A company with the domain nario.sk already exists.

NARIO
Furniture · Slovakia
Status: Contacted

[Open existing]
[Create anyway]

Do not silently block legitimate duplicates.

Do not silently merge records.

---

# NORMALIZATION

Create reusable functions for:

domain normalization

URL normalization

company name normalization

email domain extraction

Examples:

https://www.nario.sk/
www.nario.sk
nario.sk

should normalize to the same domain.

---

# 11. CREATE PRESENTATION FROM LEAD

On Company Detail add:

Create presentation

Workflow:

Choose:
- template
- duplicate existing presentation
- blank / current supported method

Automatically associate the newly created presentation with the company.

Where appropriate prefill:

client/company name

company logo

company website

presentation title

Do not copy private CRM notes into presentation content.

---

# EXAMPLE

NARIO

[Create presentation]

→ Choose template

Shapeviz Brand Pitch

→ Create

Result:

Shapeviz × Nario

Associated company:
Nario

Then open current presentation editor/workflow.

---

# 12. PRESENTATION VERSIONS

Allow a company to have multiple presentations and optionally related versions.

Example:

Nario Initial Pitch

Nario Pitch v2

Nario Final Proposal

Do not overwrite analytics from an older presentation/version.

Each published presentation must preserve its own analytics.

---

# VERSION RELATIONSHIP

If useful for current schema:

parent_presentation_id nullable

version_number nullable

or

presentation_group_id

Do not add this complexity if current presentation cloning already naturally handles it.

Choose the simplest structure consistent with repository architecture.

---

# 13. CONVERT LEAD TO CLIENT

When a lead reaches WON, provide:

Convert to client

Do not create a completely disconnected duplicate of the company.

Prefer one company record with lifecycle state, or a clean client profile that references the same company.

Avoid maintaining two copies of:

company name
website
contacts
notes

---

# CLIENT MODEL

Choose architecture based on existing schema.

Possible approach:

companies
- lifecycle_type: LEAD / CLIENT / BOTH

or:

clients
- id
- company_id unique

Keep contacts associated with company.

---

# CLIENT FIELDS

Potential client-specific fields:

client_since

active_status

services

billing notes optional

monthly_retainer optional

lifetime_value derived later

last_project_at

account_notes

Do not overbuild accounting functionality.

---

# CLIENTS PAGE

Create:

/admin/clients

Display:

CLIENT
SERVICES
ACTIVE PROJECTS
LAST ACTIVITY
CLIENT SINCE
VALUE if available

Allow search and filters.

Keep the design visually consistent with Leads.

---

# 14. PROJECTS UNDER CLIENTS

Projects are a later part of this phase and should stay lightweight.

Examples:

Milenium
→ Social Content Retainer

→ Elite Sofa CGI

→ Persona Campaign

A project entity could support:

id
company_id
name
status
service_type
description
start_date
end_date nullable
project_value nullable
monthly_value nullable
notes
created_at
updated_at

Statuses:

PLANNED
ACTIVE
ON_HOLD
COMPLETED
CANCELLED

Do not turn this into Asana/Notion project management.

No task management is required yet.

This is for business/client overview.

---

# 15. OPPORTUNITY / REVENUE DATA

Keep existing lead opportunity value functionality if already implemented.

Improve clarity between:

ONE-TIME PROJECT VALUE

MONTHLY RECURRING VALUE

Never sum them into one misleading metric.

Overview may show:

OPEN ONE-TIME PIPELINE
€18,500

OPEN MONTHLY OPPORTUNITIES
€5,200/mo

WON THIS MONTH
€X

NEW MONTHLY REVENUE
€X/mo

Only show metrics when data exists.

---

# 16. CONVERSION ANALYTICS

Once enough CRM data exists, create useful sales analytics.

Potential funnel:

Leads

Contacted

Presentation sent

Presentation viewed

Replied

Meeting

Proposal

Won

---

# ANALYTICS DIMENSIONS

Support filtering/grouping where useful by:

country

industry

lead source

potential service

date range

Do not build extremely complicated BI screens.

Prefer a few understandable charts/tables.

---

# EXAMPLE INSIGHT

Furniture

62 contacted

34 presentations viewed

11 replied

5 meetings

2 won

Again, this is descriptive data.

Do not generate unreliable causal claims automatically.

---

# 17. LOST REASON ANALYTICS

If leads can be marked Lost, preserve a standardized lost reason.

Suggested reasons:

NO_REPLY

NOT_INTERESTED

BUDGET

TIMING

EXISTING_SUPPLIER

NOT_A_FIT

OTHER

Allow optional text note.

Later show:

Lost leads by reason

This can help identify outreach problems.

---

# 18. CSV IMPORT

Add an optional Leads CSV import.

Use a review/mapping step.

Potential fields:

company_name

website

country

industry

instagram

linkedin

description

priority

fit

source

contact_name

contact_email

contact_role

---

# IMPORT SAFETY

Before commit:

show row count

show validation errors

show possible duplicates

allow skip duplicate

allow create anyway

Do not partially import unpredictably.

Use a transaction or robust batch strategy.

Provide an import result:

124 imported

6 skipped duplicates

3 failed validation

---

# CSV EXPORT

Allow exporting CRM data.

Minimum:

Leads export

Possible later:

Clients

Contacts

Pipeline

Follow-ups

Do not export private system tokens such as recipient tracking tokens.

Do not export authentication secrets.

---

# 19. GLOBAL COMMAND PALETTE

Implement once core CRM workflows are stable.

Shortcut:

Ctrl + K

and

Cmd + K

Search across:

companies

contacts

presentations

clients

projects

---

# COMMANDS

Examples:

Add lead

Add note

Create follow-up

Create presentation

Go to Pipeline

Go to Follow-ups

Search Nario

---

# COMMAND PALETTE DESIGN

Keep it minimal and fast.

Dark Shapeviz styling.

Keyboard navigation:

Arrow keys

Enter

Escape

Do not add a large dependency unless justified.

---

# 20. GMAIL-READY ARCHITECTURE

Do not build a full email client in this phase unless explicitly requested later.

But design data so Gmail integration can be added without schema redesign.

Useful future concepts:

email_thread_external_id

email_message_external_id

sent_at

received_at

company_id

contact_id

activity linkage

---

# FUTURE GMAIL BEHAVIOR

Potential later workflow:

Email sent to contact

→ activity automatically created

Reply received

→ activity automatically created

→ optionally suggest pipeline status REPLIED

→ Action Center shows reply needing next action

But do NOT automatically advance important statuses without an understandable rule/user confirmation unless explicitly implemented.

---

# 21. CALENDAR-READY ARCHITECTURE

Meetings should support a future external event identifier.

Potential fields:

meeting_id

company_id

contact_id nullable

title

starts_at

ends_at

notes

external_calendar_event_id nullable

created_at

updated_at

For now meetings may remain activity/follow-up records if that matches current architecture.

Do not create redundant entities unless they provide clear value.

---

# FUTURE CALENDAR WORKFLOW

Schedule meeting from lead

→ Calendar event created

→ CRM activity created

→ company detail shows next meeting

After event passes:

Action Center can suggest:

Add meeting notes

Create next action

---

# 22. OVERVIEW PAGE TARGET DESIGN

The Overview should eventually have this hierarchy:

SHAPEVIZ / STUDIO

OVERVIEW

### TODAY / ACTION CENTER

Actionable cards/items

### RECENT ACTIVITY

Newest meaningful activity

### CRM METRICS

Total leads
Contacted
Replies
Meetings
Won

### PIPELINE SNAPSHOT

Stages / counts

### FOLLOW-UPS

Overdue / today / upcoming

### PRESENTATION PERFORMANCE

Existing analytics:
Visits
Active time
Average visit
Slide views
Website clicks
CTR
Visit graph

Do not remove the current presentation analytics.

---

# 23. COMPANY DETAIL TARGET DESIGN

Company detail should eventually feel like the control center for that relationship.

Header:

NARIO

Furniture · Slovakia

High Priority

High Fit

Hot Engagement

Status: Presentation Viewed

Actions:

Add note

Add follow-up

Create presentation

Change status

Convert to client if applicable

---

# DETAIL CONTENT

Suggested areas:

NEXT ACTION

CONTACTS

PRESENTATIONS

ENGAGEMENT

RECENT ACTIVITY

NOTES

OPPORTUNITY

PROJECTS if client

Do not overcrowd the first screen.

Use progressive disclosure / tabs where needed.

---

# 24. LEADS TABLE IMPROVEMENTS

Useful optional columns:

Fit

Engagement

Last activity

Next action

Presentation views

Do not show every field by default.

If practical, add:

column visibility settings

Saved Views should preserve visible columns if architecture allows.

---

# 25. PIPELINE CARD IMPROVEMENTS

Pipeline cards can show:

Company

Country / Industry

Priority

Fit

Engagement

Next action

Presentation signal

Examples:

NARIO

Furniture · SK

HIGH PRIORITY
HIGH FIT
HOT

Presentation viewed 3×

Follow-up tomorrow

Do not make cards too tall.

---

# 26. NOTIFICATIONS

Do not build noisy push/browser notifications yet.

Action Center should be the primary notification mechanism.

Optional small dashboard badge counts are acceptable:

Follow-ups 3

Action Center 5

Do not create notifications for every presentation slide view.

---

# 27. AUTOMATION PRINCIPLES

Automate observation.

Recommend action.

Avoid automatically taking external actions.

Good:

Presentation viewed → record activity

Repeat view → increase engagement

No follow-up → suggest follow-up

Bad:

Automatically email prospect without explicit instruction

Automatically mark Won

Automatically create meetings

Automatically delete stale leads

---

# 28. DATABASE / EVENT DESIGN

Extend current data model rather than replacing it.

Likely new/extended concepts:

presentation_recipients

saved_views

clients or client metadata

projects

action dismissals / recommendation state if necessary

possibly meetings

Do not create tables simply because they are listed here.

First verify whether existing structures can support them cleanly.

---

# 29. INDEXES

Review indexes for new high-frequency lookups such as:

presentation_recipients.token

presentation_recipients.presentation_id

presentation_recipients.company_id

activity.created_at

followups.due_at

saved_views.user_id/workspace_id

projects.company_id

clients.company_id

normalized company domain if duplicate detection is database-backed

Use unique constraints where appropriate.

---

# 30. ROW LEVEL SECURITY

All private CRM data must remain protected.

Apply workspace/user ownership consistently.

Recipient public tracking must NOT make private CRM rows publicly readable.

Public presentation routes should use narrowly scoped server-side logic for tracking.

Do not create:

public SELECT access to contacts

public SELECT access to companies

public SELECT access to notes

public SELECT access to follow-ups

public SELECT access to activities

Public tracking should insert/update only what is required under controlled conditions.

---

# 31. AUDIT / ACTIVITY CONSISTENCY

Centralize meaningful activity creation.

If possible create one reusable service/function for events such as:

createActivity({
 companyId,
 type,
 metadata
})

Avoid different pages creating inconsistent activity formats.

Activity metadata should be structured JSON when appropriate.

---

# 32. DATE / TIME

Store timestamps consistently in UTC.

Render using current project date helpers.

Relative time is useful in:

Action Center

Recent Activity

Engagement

Examples:

18 min ago

Yesterday

3 days ago

Full timestamps should remain accessible where appropriate.

---

# 33. RESPONSIVE DESIGN

Desktop remains primary.

But:

Action Center must work well on mobile

Recent Activity must remain readable

Lead detail actions must wrap intelligently

Saved Views/filter UI must remain usable

Command palette should support mobile fallback through UI button if keyboard shortcut is unavailable

Pipeline may horizontally scroll

Do not squeeze desktop tables into unreadable mobile layouts.

---

# 34. DESIGN SYSTEM

Do not redesign Shapeviz.

Keep:

near-black background

dark brown surfaces

warm amber/orange accents

off-white typography

muted secondary labels

rounded cards

subtle borders

editorial uppercase labels

premium spacing

strong typography

minimal icons

The system should feel bespoke.

NOT:

HubSpot

Salesforce

Notion clone

generic Tailwind SaaS dashboard

---

# 35. LOADING / EMPTY / ERROR STATES

Every new feature needs proper states.

Examples:

NO ACTIONS TODAY

You're caught up.

---

NO RECENT ACTIVITY

Presentation and sales activity will appear here.

---

NO SAVED VIEWS

Save a filter combination to access it quickly later.

---

NO CLIENTS YET

Won leads can be converted into clients.

---

# 36. TESTING

Add tests where the project supports them.

Important logic to test:

engagement classification

status progression protection

recipient token resolution

duplicate detection normalization

Action Center rules

follow-up recommendation rules

saved view serialization

lead → client conversion

CSV validation/import

Do not rely only on manual browser testing for business rules.

---

# 37. STATUS PROGRESSION PROTECTION

Existing automatic logic must never move a lead backwards.

Example:

Lead status = PROPOSAL

Recipient opens presentation again

Do NOT change status back to PRESENTATION_VIEWED.

Automatic presentation-based advancement should only affect earlier stages.

Centralize stage ordering.

---

# 38. ENGAGEMENT CONFIG

Create a single configuration/module for engagement thresholds.

Example conceptual config:

ENGAGEMENT_CONFIG = {
  hot: {
    minVisits: ...,
    minActiveSeconds: ...,
    minSlideProgress: ...,
    websiteClickWeight: ...
  }
}

Exact scoring approach can differ.

Main requirement:

easy to change later

transparent

tested

not scattered

---

# 39. ACTION CENTER CONFIG

Similarly centralize suggested-action timing.

Example:

contactedNoViewDays

viewedNoReplyDays

hotLeadIdleDays

repliedNoNextActionDays

Do not hardcode timing separately in UI components.

---

# 40. CLIENT CONVERSION SAFETY

When converting:

preserve all:

company information

contacts

presentations

analytics

notes

activity

follow-ups

history

Never create a blank client profile while leaving history attached to an unrelated lead record.

Conversion should be a lifecycle transition, not data loss.

---

# 41. EXISTING DATA MIGRATION

All migrations must work with existing Phase 1 data.

Provide sensible nullable/default values.

Do not require historical records to have:

Fit

recipient

client metadata

project

unless necessary.

Migration must not break production startup.

---

# 42. PERFORMANCE

Action Center and Overview may require aggregates.

Avoid loading:

all slide events

all historical activities

all sessions

into the browser.

Prefer server-side aggregate queries.

Consider database views/RPC only when they clearly improve maintainability/performance.

Avoid N+1 queries.

---

# 43. ANALYTICS EVENT GRANULARITY

Presentation analytics may contain detailed low-level events.

Do not display low-level events directly as CRM activity.

Example:

slide 1 viewed

slide 2 viewed

slide 3 viewed

should NOT create three CRM timeline events.

Create meaningful aggregate events such as:

Presentation viewed

Returned to presentation

Website clicked

Recipient viewed presentation

---

# 44. MANUAL DATA OVERRIDES

Because CRM information can be imperfect:

allow manual override of:

Fit

Priority

Pipeline status

Lost reason

Company metadata

Contacts

Do not make automatic enrichment authoritative.

---

# 45. SEARCH EVOLUTION

Global search should eventually search:

company name

domain

contact

email

presentation name

client

project

Command palette can reuse the same search endpoint/service.

Avoid separate duplicated search implementations.

---

# 46. EXPORT / OWNERSHIP

The user should be able to export their CRM data.

This system should not create unnecessary lock-in.

Use standard CSV where practical.

Presentation analytics export can be added later, but is not required now.

---

# 47. DO NOT IMPLEMENT YET

Unless already trivial in current architecture, do NOT spend Phase 2 time on:

email sequence automation

cold email sending engine

AI-generated outreach spam

complex invoicing

full accounting

project task management

team permissions

multi-tenant enterprise roles

complex dashboards with dozens of charts

predictive sales AI

lead scraping at scale

browser automation

social media automation

These can be revisited later.

---

# 48. EXAMPLE COMPLETE WORKFLOW

I discover a furniture company:

NARIO

I choose:

Add from website

I paste:

https://nario.sk

The system extracts available public metadata.

It detects no duplicate.

I review:

Company: Nario

Country: Slovakia

Industry: Furniture

Fit: High

Priority: High

Services:

Product CGI

Social Content

3D Models for Architects

I save.

---

I open Nario.

I click:

Create presentation

I choose a template.

A new presentation is automatically linked to Nario.

---

I add a contact:

Martin Novák

Marketing Director

martin@nario.sk

---

I click:

Share presentation

Recipient:

Martin Novák

The system creates a secure recipient tracking link.

I copy it and send it.

I mark:

Sent

Activity:

Presentation sent to Martin Novák

Pipeline:

CONTACTED

---

Martin opens it.

Analytics record:

recipient

company

presentation

session

CRM shows:

Martin viewed presentation

Pipeline may advance to:

PRESENTATION_VIEWED

Engagement:

ACTIVE

---

Martin opens it again later.

The presentation now shows:

3 visits

4m 28s active

24 / 27 slides viewed

Website clicked

Engagement:

HOT

---

Action Center shows:

NARIO

High engagement

Presentation viewed 3×

No follow-up scheduled

[Create follow-up]

I click it.

The system pre-fills:

Follow up after presentation

Tomorrow

I save.

---

I call him.

I quickly add a note:

"Interested in monthly social content. Send pricing Friday."

I change status:

REPLIED

Then:

MEETING

Then:

PROPOSAL

Eventually:

WON

---

I click:

Convert to client

Nario now appears in:

CLIENTS

All previous:

contacts

presentations

analytics

activities

notes

remain attached.

---

I create project:

Nario Social Content Retainer

Monthly value:
€1,500

Status:
ACTIVE

Now the system contains the full relationship:

discovered company
→ lead
→ presentation
→ engagement
→ follow-up
→ meeting
→ proposal
→ client
→ active project

This is the intended long-term Shapeviz workflow.

---

# 49. ACCEPTANCE CRITERIA — PHASE 2A

Phase 2A is complete when:

1. Overview has a useful Today / Action Center.
2. Overdue and today's follow-ups appear there.
3. Recent meaningful CRM/presentation activity is visible.
4. The system can recommend follow-ups based on deterministic rules.
5. Suggestions can be acted on, snoozed or dismissed where appropriate.
6. A presentation can have recipient-specific secure tracking links.
7. Recipient presentation visits are linked to the correct contact/company.
8. Generic presentation links still work.
9. Recipient analytics appear in CRM.
10. Quick notes can be added without deep navigation.
11. Lead filter combinations can be saved as Saved Views.

---

# 50. ACCEPTANCE CRITERIA — PHASE 2B

Phase 2B is complete when:

1. Priority, Fit and Engagement are clearly separate.
2. Engagement is derived from real presentation analytics.
3. Engagement explains its underlying signals.
4. A lead can be added from a company website URL.
5. Extracted website data can be reviewed before saving.
6. SSRF/security protections exist for URL fetching.
7. Duplicate companies are detected using normalized domains.
8. Duplicate warnings do not silently destroy/merge data.

---

# 51. ACCEPTANCE CRITERIA — PHASE 2C

Phase 2C is complete when:

1. Presentation creation can start from Company Detail.
2. The presentation automatically belongs to the company.
3. Multiple presentations/versions preserve separate analytics.
4. A Won lead can be converted into a Client.
5. Conversion preserves the entire relationship history.
6. Clients have their own searchable page.
7. Lightweight projects can be created under clients.
8. Project values distinguish one-time vs recurring where applicable.

---

# 52. ACCEPTANCE CRITERIA — PHASE 2D

Phase 2D is complete when:

1. Opportunity value reporting is meaningful.
2. One-time and monthly pipeline value remain separate.
3. Funnel conversion analytics use actual CRM stages/events.
4. Lost reasons can be analyzed.
5. Leads can be imported through CSV safely.
6. Duplicate/import errors are reviewed before commit.
7. Leads can be exported to CSV.
8. Global Cmd/Ctrl+K search works across core CRM objects.

---

# 53. AFTER IMPLEMENTATION

After each major phase:

run existing:

typecheck

lint

tests

build

database checks / migration validation

Fix regressions.

Specifically verify:

public presentation pages

presentation analytics ingestion

admin auth

existing leads

existing presentation relationships

existing follow-ups

existing dashboard

mobile layouts

---

# 54. DELIVERABLE SUMMARY

After implementation provide:

1. summary of features completed
2. files created
3. files modified
4. migrations created
5. schema changes
6. routes added
7. new business-rule modules
8. security decisions
9. tests added
10. any manual configuration required
11. features intentionally deferred
12. recommended next development step

Do not claim a feature is finished if it is only mocked.

Do not leave production UI backed by fake lead/client analytics.

---

# FINAL PRODUCT PRINCIPLE

Shapeviz Studio should not merely store leads.

It should reduce the amount of information I need to remember manually.

The system should continuously make the next useful sales action obvious.

The ideal workflow is:

DISCOVER
→ QUALIFY
→ CREATE PITCH
→ SEND
→ TRACK
→ FOLLOW UP
→ MEET
→ PROPOSE
→ WIN
→ CLIENT
→ PROJECT

All while preserving the premium, minimal, custom Shapeviz visual identity.
