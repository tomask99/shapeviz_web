# SHAPEVIZ AI RESEARCH AGENT — PHASE 3 BRIEF

## 1. PURPOSE

This phase adds an AI Research Agent layer to the existing Shapeviz Studio / CRM.

The goal is not to build a generic chatbot.

The goal is to use ChatGPT as the research brain for Shapeviz sales while the Shapeviz admin remains the structured database, approval layer and source of truth.

The initial workflow should be:

DISCOVER COMPANIES
→ RESEARCH
→ CATEGORIZE
→ QUALIFY
→ RECOMMEND SHAPEVIZ SERVICES
→ IDENTIFY OPPORTUNITY
→ REVIEW
→ APPROVE AS LEAD
→ OUTREACH LATER

The AI should help build a structured database of potential clients over time.

---

# 2. COST CONSTRAINT

The system must respect this requirement:

> I already pay for ChatGPT and I do not want a separate paid AI API dependency for the core workflow.

Therefore:

- do NOT require an OpenAI API key for the MVP,
- do NOT require paid token usage for the main workflow,
- ChatGPT should remain the primary AI interface,
- Shapeviz should expose structured data/import/tool interfaces that ChatGPT can work with,
- future direct AI API integration can remain optional,
- do not tightly couple the system to one model provider.

---

# 3. EXISTING SYSTEM

Before implementing anything, inspect the actual repository and identify what already exists.

Expected existing functionality includes:

- Overview
- Leads
- Pipeline
- Follow-ups
- Contacts
- Notes
- Activity timeline
- Presentations
- Presentation analytics
- CRM search/filtering
- company ↔ presentation relationships
- lead status pipeline
- existing database/auth architecture
- existing Shapeviz visual system

Do NOT rebuild existing functionality.

Extend the current architecture.

---

# 4. CORE PRODUCT CONCEPT — AI RESEARCH INBOX

Create a new module:

# AI RESEARCH

AI-discovered companies should not normally go directly into Leads.

Use a staging layer:

CHATGPT
→ RESEARCH CANDIDATE
→ USER REVIEW
→ APPROVE AS LEAD

This protects the main CRM from low-quality, duplicate or incorrectly researched companies.

Suggested navigation:

OVERVIEW

SALES
- Leads
- Pipeline
- Follow-ups
- AI Research

CLIENTS
- Clients
- Projects

PRESENTATIONS
- Presentations
- Templates

---

# 5. AI RESEARCH PAGE

Create a dedicated AI Research page using the current routing convention.

It should support:

- candidate list/cards,
- candidate detail,
- search,
- filters,
- sorting,
- duplicate warnings,
- approve,
- reject,
- research status,
- Fit,
- service opportunities,
- sources.

Desktop is primary, but it must remain usable on mobile.

---

# 6. RESEARCH CANDIDATE DATA MODEL

Create a research candidate entity separate from normal Leads.

Suggested conceptual structure:

```text
research_candidates

id
workspace_id / user_id

company_name
normalized_company_name

website
normalized_domain

country
country_category
city

industry
business_type

product_categories[]
secondary_categories[]

market_segments[]

positioning

short_description
research_summary

potential_services[]
opportunity_signals[]

suggested_pitch_angle

fit
fit_reason

research_confidence

research_status

duplicate_company_id nullable

source_origin

created_at
updated_at
last_researched_at

approved_at nullable
rejected_at nullable
```

Use the repository's current conventions instead of blindly copying this exact schema if a better existing pattern exists.

---

# 7. RESEARCH STATUS

Support statuses such as:

- NEW
- RESEARCHED
- NEEDS_REVIEW
- NEEDS_MORE_RESEARCH
- APPROVED
- REJECTED
- DUPLICATE

Display human-readable labels.

---

# 8. COMPANY CLASSIFICATION

Do not store only one broad category such as `Furniture`.

Classify companies across several dimensions.

Example:

```text
Industry:
Furniture

Business type:
Manufacturer

Product category:
Sofas

Secondary categories:
Armchairs
Beds

Market:
B2C
Architects / Designers

Positioning:
Premium
```

Another example:

```text
Industry:
Lighting

Business type:
Manufacturer

Product categories:
Pendant lamps
Floor lamps
Decorative lighting

Market:
B2C
Architects
Hospitality

Positioning:
Premium / design-focused
```

This structure should make later filtering highly useful.

---

# 9. INDUSTRY

Initial values may include:

- Furniture
- Lighting
- Interior Design
- Architecture
- Real Estate / Development
- Hospitality
- Product Design
- Fashion
- Luxury
- Automotive
- Home Accessories
- Kitchens
- Bathrooms
- Materials / Surfaces
- Agency
- Technology
- Other

Allow future extensibility.

---

# 10. BUSINESS TYPE

Support values such as:

- Manufacturer
- Brand
- Retailer
- Distributor
- Architecture Studio
- Interior Design Studio
- Developer
- Agency
- Ecommerce
- Showroom
- Hospitality Company
- Product Design Studio
- Other

A company may have multiple relevant roles if the current architecture supports it cleanly.

---

# 11. PRODUCT CATEGORIES

Product categories should be more precise than Industry.

Examples:

Furniture:
- Sofas
- Armchairs
- Chairs
- Tables
- Beds
- Storage
- Outdoor Furniture
- Office Furniture
- Kitchens
- Custom Furniture

Lighting:
- Pendant Lamps
- Floor Lamps
- Table Lamps
- Architectural Lighting
- Decorative Lighting
- Outdoor Lighting

Home:
- Rugs
- Textiles
- Accessories
- Surfaces
- Flooring
- Sanitary Products
- Bathrooms

The list must be extensible.

---

# 12. MARKET SEGMENTS

Useful values:

- B2C
- B2B
- Architects
- Interior Designers
- Developers
- Hospitality
- Retail
- Ecommerce
- Contract / Commercial
- Luxury Residential

This matters because some Shapeviz services are especially relevant to architect/design audiences.

---

# 13. POSITIONING

Possible values:

- Mass Market
- Mid-Market
- Mid-Premium
- Premium
- Luxury
- Design-Focused
- Unknown

Positioning is often inferred.

Therefore its origin/confidence must be visible.

Do not present inferred positioning as verified fact.

---

# 14. SHAPEVIZ SERVICE CATALOG

Create one centralized configurable Shapeviz service catalog.

Initial values:

- Product CGI
- Lifestyle CGI
- Archviz
- Product Visualization
- 3D Modelling
- 3D Models for Architects
- Animation
- Product Animation
- Social Content
- Art Direction
- AI Content
- Web
- Automation
- Other

Do not scatter service names across components.

---

# 15. SERVICE RELEVANCE

The research system should identify which Shapeviz services are most relevant.

Example:

```text
Product CGI                 HIGH
3D Models for Architects    HIGH
Social Content              HIGH
Animation                   MEDIUM
Archviz                     LOW
```

Main UI should show only the strongest opportunities.

Example:

BEST OPPORTUNITIES

Product CGI
3D Models
Social Content

Detailed relevance can be visible in candidate detail.

---

# 16. IDEAL CLIENT PROFILES — ICP

Create configurable Ideal Client Profiles.

## ICP — Furniture Manufacturer

Typical signals:

- manufacturer
- visual physical products
- many product collections
- configurable products
- multiple fabrics/materials
- frequent launches
- architect/interior designer audience
- showroom / ecommerce / catalogue

Strong Shapeviz services:

- Product CGI
- Lifestyle CGI
- 3D Models for Architects
- Social Content
- Animation
- Art Direction

## ICP — Lighting Brand

Typical signals:

- design-oriented products
- multiple finishes
- architect audience
- international distribution
- large product catalogue

Strong services:

- Product CGI
- Lifestyle CGI
- 3D Models for Architects
- Product Animation
- Social Content

## ICP — Architecture / Interior Studio

Strong services:

- Archviz
- Animation
- AI-assisted concept visuals
- marketing visuals

Keep ICP configuration centralized and editable later.

---

# 17. FIT

Each candidate should have:

- LOW
- MEDIUM
- HIGH

Fit means:

> How relevant this company appears to be as a potential Shapeviz client.

Keep Fit separate from:

- Priority
- Engagement

Fit may initially be research-derived, but must remain manually editable.

---

# 18. FIT REASON

Every Fit value must explain itself.

Example:

```text
HIGH FIT

Furniture manufacturer with a large configurable product catalogue,
active visual marketing and a strong architect/design audience.

Shapeviz could reuse the same 3D assets across product CGI,
lifestyle scenes, social content and architect model downloads.
```

Do not use unexplained scores like `87/100`.

---

# 19. OPPORTUNITY SIGNALS

Research should identify concrete signals.

Suggested signals:

- LARGE_PRODUCT_CATALOG
- PREMIUM_BRAND
- DESIGN_FOCUSED
- ACTIVE_INSTAGRAM
- ACTIVE_SOCIAL_MEDIA
- WEAK_PRODUCT_VISUALS
- INCONSISTENT_VISUAL_IDENTITY
- ARCHITECT_AUDIENCE
- DESIGNER_AUDIENCE
- MULTIPLE_SHOWROOMS
- ECOMMERCE
- CUSTOM_PRODUCTS
- MULTIPLE_FINISHES
- MULTIPLE_FABRICS
- FREQUENT_COLLECTIONS
- INTERNATIONAL_MARKET
- NEW_COLLECTION
- DOWNLOAD_SECTION
- NO_3D_DOWNLOADS_FOUND
- HAS_3D_DOWNLOADS
- HAS_CAD_BIM_SECTION
- PRODUCT_CONFIGURATOR
- STRONG_VISUAL_CONTENT
- VIDEO_CONTENT
- OTHER

Display as concise tags.

---

# 20. SIGNAL EVIDENCE

Every signal should have evidence/confidence.

Example:

```text
NO_3D_DOWNLOADS_FOUND

Evidence:
No downloadable 3D/CAD/BIM assets were found during research
of the company's professional/download sections.

Confidence:
MEDIUM
```

Preferred wording:

"No 3D asset library was found during research."

Avoid claiming:

"They do not have 3D assets."

when research only failed to find them.

---

# 21. VERIFIED / INFERRED / UNKNOWN

Research facts need provenance.

Use:

- VERIFIED
- INFERRED
- UNKNOWN

Examples:

```text
Manufacturer
VERIFIED
Source: company About page

Premium positioning
INFERRED
Evidence: brand presentation/product positioning

Marketing Director
UNKNOWN
```

This is important to prevent AI guesses from becoming fake CRM facts.

---

# 22. RESEARCH CONFIDENCE

Each candidate may also have an overall research confidence:

- HIGH
- MEDIUM
- LOW

This is not the same as Fit.

It reflects confidence in the researched information.

---

# 23. SOURCE TRACKING

Every candidate should preserve sources.

Suggested source fields:

```text
url
title
source_type
retrieved_at
supports[]
```

Source types may include:

- Company Website
- About Page
- Product Page
- Contact Page
- Professional / Architect Page
- Download Page
- Instagram
- LinkedIn
- Press Article
- Other Public Source

Prefer first-party sources where available.

---

# 24. NO HALLUCINATED CONTACT DATA

Critical rule:

Never fabricate:

- email addresses
- phone numbers
- contact names
- job roles
- revenue
- addresses
- social profiles
- company size

Do not invent something like:

`marketing@company.com`

just because the domain exists.

If not found:

UNKNOWN

---

# 25. SUGGESTED PITCH ANGLE

Each promising candidate should have a strategic pitch angle.

This is not the final email.

Example:

```text
Instead of offering individual renders,
pitch a reusable 3D content ecosystem:

one accurate 3D product asset
→ product CGI
→ lifestyle scenes
→ social content
→ animations
→ architect downloads
```

Another:

```text
Create a consistent premium visual system across the whole product catalogue
and provide downloadable 3D assets for architects and interior designers.
```

This should later feed outreach and presentation creation.

---

# 26. AI RESEARCH CARD

Candidate cards should stay compact.

Example:

```text
NARIO

SK · Furniture · Sofas

HIGH FIT

Manufacturer
Premium

BEST OPPORTUNITIES
Product CGI
3D Models
Social Content

SIGNALS
Large catalogue
Architect audience
Multiple materials

Short summary...

[Approve as Lead]
[Research deeper]
[Reject]
```

Do not overload cards.

---

# 27. CANDIDATE DETAIL PAGE

Candidate detail should include:

- Overview
- What They Do
- Products
- Market
- Positioning
- Shapeviz Fit
- Recommended Services
- Opportunity Signals
- Suggested Pitch Angle
- Contacts Found
- Sources
- Research Notes
- Duplicate Check
- Actions

---

# 28. APPROVE AS LEAD

Key workflow:

`Approve as Lead`

Create a normal Lead using reviewed candidate data.

Map useful fields:

- company name
- website
- country
- industry
- business type
- product categories
- market segments
- description
- potential services
- Fit
- lead source = AI Research
- research summary
- research sources
- opportunity signals
- suggested pitch angle

If contacts were found and approved, optionally create them too.

---

# 29. APPROVAL REVIEW

Before final insert, allow a lightweight review/edit step.

The user should be able to correct:

- Industry
- Business Type
- Product Categories
- Country
- Fit
- Services
- Description
- Pitch Angle
- Contacts

Never require blind trust in AI output.

---

# 30. REJECT CANDIDATE

Allow Reject with optional reason:

- Not Relevant
- Too Small
- Wrong Market
- Already Known
- Poor Fit
- Competitor / Not Applicable
- Other

Preserve rejected history so future searches can avoid rediscovering the same company.

---

# 31. DUPLICATE DETECTION

Before creating candidates/leads compare normalized domain against:

- Leads
- Clients
- Research Candidates
- Rejected Candidates where useful

Strongest signal:

same normalized domain

Secondary signals:

same company name + country
same canonical website

Never silently create duplicates.

---

# 32. DUPLICATE UI

Example:

```text
POSSIBLE DUPLICATE

Nario already exists in Leads.

Status:
CONTACTED

[Open existing lead]
[Keep candidate]
[Discard candidate]
```

Do not automatically merge.

---

# 33. NORMALIZATION

Centralize helpers for:

- URL normalization
- Domain normalization
- Company-name normalization
- Social-profile normalization

These:

```text
https://www.example.com/
http://example.com
www.example.com
example.com
```

should normalize to:

`example.com`

---

# 34. RESEARCH DEEPER

Add:

`Research deeper`

Deeper research may seek:

- detailed product portfolio
- company story
- business model
- architect/professional section
- downloadable resources
- showrooms
- markets/countries
- social media
- current collections
- visual communication
- relevant public contacts
- marketing/management contacts
- catalogues
- CAD/BIM/3D availability
- ecommerce
- configurators
- campaigns

Update the existing candidate; do not create a duplicate.

---

# 35. FIND CONTACTS

Add optional research workflow:

`Find contacts`

Target public roles such as:

- Marketing Manager
- Marketing Director
- Brand Manager
- Creative Director
- Ecommerce Manager
- Social Media Manager
- CEO / Owner for smaller companies
- Sales Director
- Architect Relations
- Product Manager

Only store contact information with supporting evidence.

---

# 36. CONTACT CONFIDENCE

For discovered contacts store:

```text
Name
Role
Email if found
Source
Confidence
Fact status: VERIFIED / INFERRED
```

Never fabricate missing contact details.

---

# 37. FIND SIMILAR COMPANIES

Add action:

`Find similar companies`

Use an existing company/candidate as the reference profile.

Example:

Milenium
→ sofa manufacturer
→ premium
→ Slovakia
→ visual catalogue
→ architect relevance

Then allow target countries:

- Czech Republic
- Austria
- Poland
- Hungary
- etc.

The system should support importing the result as Research Candidates.

---

# 38. DISCOVERY MODE

Support natural ChatGPT requests such as:

```text
Find me 20 Czech sofa manufacturers
that could benefit from Product CGI,
3D models for architects or social content.

Exclude companies already in Shapeviz.
```

Another:

```text
Find 15 premium European lighting brands
that sell to architects and designers.
```

Another:

```text
Find companies similar to Milenium
in Czech Republic and Austria.
```

Return structured Research Candidate data.

---

# 39. ENRICH MODE

Support:

```text
Review my existing Leads that are missing
industry, product category or recommended services
and research those fields.
```

Do not overwrite manually edited data without approval.

Preferred flow:

AI proposes updates
→ user reviews
→ selected changes apply

---

# 40. QUALIFY MODE

Support:

```text
Review these leads and identify
which appear to have the strongest Shapeviz fit.
```

Use:

- ICP
- company data
- public research
- product categories
- markets
- opportunity signals

Avoid presenting this as objective certainty.

---

# 41. RE-RESEARCH MODE

Research becomes stale.

Store:

`Last researched`

Allow:

`Research again`

The system should refresh current information while preserving manual notes/history.

---

# 42. AI INSIGHT ON LEAD DETAIL

Once a candidate becomes a Lead, show:

# AI INSIGHT

Example:

```text
FIT
HIGH

BEST SERVICES
Product CGI
3D Models
Social Content

WHY
Furniture manufacturer with a large configurable product portfolio
and an architect/design audience.

BEST PITCH ANGLE
Build one reusable 3D product ecosystem across product marketing,
social content and architect assets.

SIGNALS
Large Product Catalogue
Architect Audience
Multiple Materials

MISSING INFORMATION
Marketing Contact
3D Asset Availability

LAST RESEARCH
22 Sep 2026
```

Actions:

- Research Again
- Find Contacts
- Find Similar

---

# 43. PRESERVE RESEARCH AFTER APPROVAL

Approved research must remain accessible from Lead Detail.

Preserve:

- research summary
- research date
- sources
- opportunity signals
- service recommendations
- pitch angle
- classification
- research confidence

---

# 44. MANUAL OVERRIDE

Manual edits should win over later AI suggestions unless explicitly replaced.

Protect fields such as:

- Fit
- Industry
- Categories
- Services
- Positioning
- Pitch Angle

If practical, store field-level origin such as:

`manual`
`research`
`import`

Do not silently overwrite manually corrected values.

---

# 45. CHATGPT CONNECTION — ARCHITECTURE

The long-term architecture should allow ChatGPT to interact with Shapeviz through a custom tool/MCP layer.

The backend should expose structured business operations, not raw database access.

Core categories:

- Read
- Research Queue
- Write Preparation

---

# 46. READ TOOLS

Useful operations:

```text
search_leads()
get_lead()
get_leads_by_domain()
get_existing_domains()
get_research_candidates()
get_research_candidate()
get_ideal_client_profiles()
get_service_catalog()
get_industries()
get_product_categories()
get_rejected_domains()
```

This lets ChatGPT understand Shapeviz data and avoid duplicates.

---

# 47. FUTURE WRITE TOOLS

Prepare backend services for future operations:

```text
create_research_candidate()
update_research_candidate()
approve_research_candidate()
reject_research_candidate()
create_lead()
update_lead_research()
create_contact()
add_research_source()
add_opportunity_signal()
```

Do not expose direct SQL.

---

# 48. TOOL DESIGN PRINCIPLE

Good:

```text
create_research_candidate(candidate)
```

Bad:

```text
execute_sql(query)
```

Never expose arbitrary database access to AI.

---

# 49. WRITE SAFETY

Validate all AI-produced data server-side.

Validate:

- workspace ownership
- required fields
- URL format
- allowed enums
- array lengths
- duplicate domain
- text limits
- source URLs
- contact structure

Never trust input solely because it came from ChatGPT.

---

# 50. ZERO-EXTRA-COST MVP BRIDGE

Because the MVP must avoid a separate paid AI API, implement a structured import bridge.

Preferred first version:

# Import AI Research

Allow structured data generated by ChatGPT to be pasted or uploaded into Shapeviz.

Supported format should preferably be JSON.

Optional future bridges:

- CSV
- Google Sheet sync
- direct MCP write

The import layer should be temporary and replaceable.

---

# 51. CANONICAL RESEARCH JSON SCHEMA

Create one canonical schema shared by:

- ChatGPT prompt output
- JSON import
- future MCP tools
- future API

Example:

```json
{
  "candidates": [
    {
      "company_name": "Example",
      "website": "https://example.com",
      "country": "Czech Republic",
      "industry": "Furniture",
      "business_type": "Manufacturer",
      "product_categories": ["Sofas", "Armchairs"],
      "market_segments": ["B2C", "Architects"],
      "positioning": {
        "value": "Premium",
        "status": "INFERRED"
      },
      "fit": "HIGH",
      "fit_reason": "...",
      "potential_services": [
        {
          "service": "Product CGI",
          "relevance": "HIGH"
        },
        {
          "service": "3D Models for Architects",
          "relevance": "HIGH"
        }
      ],
      "opportunity_signals": [
        {
          "signal": "LARGE_PRODUCT_CATALOG",
          "confidence": "HIGH",
          "evidence": "..."
        }
      ],
      "research_summary": "...",
      "suggested_pitch_angle": "...",
      "research_confidence": "HIGH",
      "sources": [
        {
          "url": "https://example.com/about",
          "title": "About",
          "source_type": "Company Website"
        }
      ]
    }
  ]
}
```

Use the project's current schema/validation library such as Zod if already available.

---

# 52. IMPORT PREVIEW

Before import commit, show:

- candidates found
- valid rows
- duplicates
- validation errors
- unknown categories
- unknown services
- missing websites

Actions:

- Import Valid
- Skip Duplicates
- Review Conflicts
- Cancel

Do not silently import malformed records.

---

# 53. FUTURE DIRECT CHATGPT WRITE

Future architecture should replace the import bridge with:

```text
ChatGPT
→ Shapeviz tool
→ create_research_candidate()
→ AI Research Inbox
```

The direct tool must reuse the same validation/domain logic as JSON import.

Do not build two separate insertion systems.

---

# 54. AI AGENT UI IN SHAPEVIZ

Do NOT require an embedded paid chatbot for the MVP.

Instead, AI Research can provide:

- Open Shapeviz Agent in ChatGPT
- Copy Research Prompt
- Import AI Research
- Review Candidates

The intelligence remains in ChatGPT initially.

Shapeviz handles:

- database
- approval
- structure
- filtering
- deduplication
- lead conversion

---

# 55. PROMPT HELPERS

Inside AI Research, optionally provide copyable research prompts.

Example:

```text
Find 20 Czech furniture manufacturers suitable for Shapeviz.

Focus on:
- sofas
- armchairs
- premium furniture
- companies selling to architects/designers

Look for opportunities in:
- Product CGI
- Lifestyle CGI
- 3D Models for Architects
- Social Content
- Animation

Exclude these existing domains:
[dynamic domain list]

Return the result using the Shapeviz Research JSON schema.
```

This makes the zero-cost workflow much easier before direct ChatGPT integration.

---

# 56. MISSING INFORMATION

Each candidate may show:

MISSING INFORMATION

Examples:

- Marketing Contact
- Architect Section
- 3D Asset Availability
- Social Channels
- Product Catalogue Details

This helps decide whether deeper research is worthwhile.

---

# 57. SUGGESTED NEXT RESEARCH ACTION

Optional field:

`Suggested next research action`

Examples:

- Find marketing contact
- Check architect downloads
- Review Instagram
- Research catalogue
- Find similar companies

This is only a suggestion.

---

# 58. SOURCE ORIGIN

Track how the candidate entered the system:

- CHATGPT
- MANUAL
- IMPORT
- SIMILAR_COMPANY
- ENRICHMENT
- OTHER

This is separate from the final Lead source.

---

# 59. LEAD SOURCE AFTER APPROVAL

Approved AI candidate should use:

Lead Source:
AI Research

Optional subsource:

- ChatGPT Discovery
- Similar Company
- Manual Import
- Enrichment

---

# 60. FILTERS — AI RESEARCH

Support filters for:

- Country
- Country Category
- Industry
- Business Type
- Product Category
- Market Segment
- Fit
- Potential Service
- Opportunity Signal
- Research Confidence
- Research Status
- Duplicate Status
- Source Origin
- Last Researched

---

# 61. SORTING

Useful sorting:

- Newest
- Highest Fit
- Recently Researched
- Company Name
- Country
- Research Confidence
- Most Opportunity Signals

---

# 62. BULK ACTIONS

Support:

- multi-select
- bulk approve
- bulk reject
- bulk mark for deeper research
- bulk category correction where useful

Use confirmation for destructive/high-impact operations.

---

# 63. REJECTED COMPANY MEMORY

Rejected candidates should remain known to the system.

Reason:

Future discovery should be able to exclude them.

Expose a read operation such as:

```text
get_rejected_domains()
```

so the same poor-fit company is not rediscovered repeatedly.

---

# 64. RESEARCH QUALITY RULES

Prefer:

1. official company website
2. official product pages
3. official contact/team pages
4. official professional/architect resources
5. official social profiles
6. credible press/directories where useful

Avoid low-quality scraped pages when first-party evidence exists.

---

# 65. RESEARCH SUMMARY STYLE

Research summaries should be concise, factual and sales-oriented.

Good:

```text
Czech manufacturer of modular upholstered furniture
with a large product catalogue and multiple material options.
The brand communicates through lifestyle interiors
and appears to target both end customers and design professionals.
```

Bad:

```text
This innovative company is committed to quality and excellence.
```

Avoid generic filler.

---

# 66. SHAPEVIZ OPPORTUNITY LOGIC

Research should think specifically from Shapeviz's service portfolio.

## Sofa / Furniture Manufacturer

Potential opportunities:

- Product CGI
- Lifestyle CGI
- configurable material variants
- 3D Models for Architects
- Product Animation
- Social Content
- Art Direction

## Lighting Manufacturer

Potential opportunities:

- Product CGI
- detailed product animation
- lighting/lifestyle scenes
- architect assets
- Social Content
- catalogue imagery

## Architecture Studio

Potential opportunities:

- Archviz
- Animation
- competition visuals
- AI-assisted concepts
- marketing imagery

## Real Estate Developer

Potential opportunities:

- Archviz
- Sales CGI
- Animation
- aerial/context visuals
- marketing content

## Product / Design Brand

Potential opportunities:

- Product Visualization
- Product Animation
- Art Direction
- Social Content
- Campaign CGI

Keep this configurable.

---

# 67. OVERVIEW INTEGRATION

Overview may later show a small section:

AI RESEARCH

12 candidates awaiting review
5 High Fit
3 duplicates

[Review Candidates]

Do not let AI Research overwhelm the main dashboard.

---

# 68. ACTIVITY TIMELINE

Approving or materially changing research should create meaningful activity.

Examples:

- AI Research Candidate Approved
- Research Updated
- Lead Created from AI Research
- Fit Updated
- Research Refreshed

Do not create timeline noise for every small field.

---

# 69. UI DESIGN

Maintain current Shapeviz visual language.

Use:

- near-black background
- dark warm surfaces
- orange / amber accent
- off-white text
- muted secondary typography
- rounded cards
- subtle borders
- strong editorial headings
- compact tags
- premium spacing

Avoid generic SaaS design.

Do not make AI UI purple/neon/gradient-heavy just because it is AI.

---

# 70. EMPTY STATE

Example:

```text
NO RESEARCH CANDIDATES

Use ChatGPT to discover potential Shapeviz clients,
then import them here for review.

[Import AI Research]
[Copy Research Prompt]
```

---

# 71. PERFORMANCE

The system may eventually contain thousands of candidates.

Use:

- pagination or efficient infinite loading
- indexed normalized domain
- indexed status
- indexed Fit
- indexed country
- indexed industry
- indexed created_at
- indexed last_researched_at
- indexed workspace ownership

Do not load detailed sources for every card if not needed.

---

# 72. SEARCH

AI Research search should match:

- Company Name
- Domain
- Description
- Industry
- Product Categories
- Suggested Pitch Angle
- Potential Services
- Contacts where appropriate

Use server-side search once datasets grow.

---

# 73. SECURITY

AI Research data is private CRM data.

Apply existing ownership/RLS consistently.

Public users must never access:

- research candidates
- research summaries
- Fit
- opportunity signals
- contacts
- pitch angles
- approval status
- notes

---

# 74. WEBSITE FETCH SECURITY

If Shapeviz later performs website enrichment itself, protect against SSRF.

Block:

- localhost
- loopback ranges
- private network ranges
- link-local addresses
- cloud metadata endpoints
- non-http protocols

Use:

- http/https allowlist
- timeout
- redirect limit
- response size limit
- content-type validation

---

# 75. NO AUTOMATIC OUTREACH IN THIS PHASE

Do NOT:

- send email
- send LinkedIn messages
- send Instagram DMs
- submit contact forms
- auto-run outreach sequences

This phase is:

DISCOVER
→ RESEARCH
→ QUALIFY
→ STRUCTURE
→ APPROVE

Outreach comes later.

---

# 76. FUTURE OUTREACH READINESS

Preserve fields that will later help with:

- email drafting
- presentation drafting
- follow-up preparation
- sales agent workflows

Important preserved context:

- research summary
- recommended services
- pitch angle
- contacts
- sources
- opportunity signals
- classifications

---

# 77. PHASE 3A — MVP

Implement first:

1. AI Research page
2. Research Candidate entity
3. Candidate detail
4. Industry
5. Business Type
6. Product Categories
7. Market Segments
8. Fit
9. Fit Reason
10. Recommended Shapeviz Services
11. Opportunity Signals
12. Suggested Pitch Angle
13. Source Tracking
14. VERIFIED / INFERRED / UNKNOWN
15. Research Confidence
16. Duplicate Detection
17. Approve as Lead
18. Reject Candidate
19. AI Research JSON Import
20. Import Preview/Validation
21. Prompt Helper
22. Canonical Research JSON Schema

This must create a fully usable zero-extra-AI-cost workflow.

---

# 78. PHASE 3B — RESEARCH WORKFLOW

Then add:

1. Research Deeper workflow support
2. Research Refresh
3. Missing Information
4. Suggested Next Research Action
5. Find Contacts structure
6. Find Similar support
7. Rejected-company exclusion
8. AI Insight on Lead Detail
9. Research Sources on Leads
10. Manual Override Protection

---

# 79. PHASE 3C — CHATGPT TOOL LAYER

Then prepare:

1. Shapeviz MCP/tool server layer
2. read-only CRM tools
3. research-candidate tools
4. secure auth
5. shared schema reuse
6. business-domain service layer
7. future direct write support

Do not block the MVP on this phase.

---

# 80. PHASE 3D — FUTURE

Later:

- direct ChatGPT → Research Inbox writes
- email drafting
- presentation drafting
- automatic daily research
- scheduled ICP searches
- client-specific pitch generation
- outreach approval system
- embedded Shapeviz Agent

These are not required for the first release.

---

# 81. EXAMPLE DISCOVERY WORKFLOW

User asks ChatGPT:

```text
Find 20 Czech manufacturers of sofas or premium upholstered furniture.

I am looking for companies that could benefit from:
- Product CGI
- Lifestyle CGI
- 3D Models for Architects
- Social Content

Exclude companies already in my Shapeviz CRM.

Research what they actually produce and return them using the Shapeviz Research schema.
```

ChatGPT researches the companies.

The structured output is imported into:

AI RESEARCH

The user reviews each candidate.

---

# 82. EXAMPLE CANDIDATE

```text
COMPANY
Example Furniture

COUNTRY
Czech Republic

INDUSTRY
Furniture

BUSINESS TYPE
Manufacturer

PRODUCTS
Sofas
Armchairs
Beds

MARKET
B2C
Architects

POSITIONING
Premium — INFERRED

FIT
HIGH

BEST SHAPEVIZ SERVICES
Product CGI
3D Models for Architects
Social Content

OPPORTUNITY SIGNALS
Large Product Catalogue
Multiple Fabric Options
Architect Audience

WHY IT FITS
Manufacturer with a visual product catalogue and a product structure
that can benefit from reusable 3D assets across marketing and professional channels.

PITCH ANGLE
Offer a reusable 3D content ecosystem instead of isolated renders.

MISSING INFO
Marketing Contact

RESEARCH CONFIDENCE
HIGH

SOURCES
Company Website
Product Catalogue
Professional Page
```

User clicks:

Approve as Lead

The company now appears in normal Leads with all relevant research preserved.

---

# 83. EXAMPLE — FIND SIMILAR

User opens:

Milenium

Clicks:

Find Similar Companies

Selects:

CZ
AT
PL

The workflow uses Milenium as the reference profile and produces new Research Candidates for review.

---

# 84. EXAMPLE — ENRICH EXISTING LEADS

User asks ChatGPT:

```text
Review my existing furniture leads that are missing
Product Category or recommended Shapeviz services.
```

ChatGPT proposes enrichment.

Shapeviz displays proposed changes.

The user approves selected updates.

Manual values are not overwritten automatically.

---

# 85. ACCEPTANCE CRITERIA — MVP

The feature is complete when I can:

1. open AI Research,
2. import structured candidate research generated by ChatGPT,
3. preview imported data,
4. see duplicates before import,
5. store companies as Research Candidates,
6. see what each company does,
7. see Industry,
8. see Business Type,
9. see Product Categories,
10. see Market Segments,
11. see Fit,
12. understand why Fit was assigned,
13. see recommended Shapeviz services,
14. see Opportunity Signals,
15. see Suggested Pitch Angle,
16. see Research Confidence,
17. distinguish VERIFIED / INFERRED / UNKNOWN data,
18. inspect Research Sources,
19. reject bad candidates,
20. preserve rejected domains,
21. approve good candidates as Leads,
22. edit candidate data before approval,
23. avoid duplicate Leads,
24. retain research after candidate becomes a Lead,
25. search/filter candidates,
26. use the entire MVP without requiring a separate paid AI API.

---

# 86. ACCEPTANCE CRITERIA — ARCHITECTURE

Implementation is architecturally complete when:

1. Research schema is centralized.
2. Candidate validation is centralized.
3. Candidate → Lead mapping is reusable.
4. Domain normalization is centralized.
5. Duplicate detection is reusable.
6. Manual override rules are respected.
7. Workspace/RLS ownership is secure.
8. Existing CRM functionality remains intact.
9. Presentation functionality remains intact.
10. Future MCP/direct ChatGPT tools can reuse the same domain services.
11. No arbitrary SQL/database tool is exposed.
12. No paid AI API is required for the MVP workflow.

---

# 87. BEFORE IMPLEMENTATION

Before writing significant code, inspect the repository and provide a short implementation plan.

Identify:

- framework
- routing
- database
- authentication
- CRM schema
- Lead schema
- current taxonomy/service structures
- validation library
- design system
- Supabase setup if present
- current RLS policies
- existing import functionality
- duplicate handling
- reusable UI components
- migration risks

Then implement incrementally.

Do not rebuild the app from scratch.

---

# 88. AFTER IMPLEMENTATION

Run available:

- typecheck
- lint
- tests
- build
- migration validation

Verify:

- Leads still work
- Pipeline still works
- Follow-ups still work
- Presentations still work
- Presentation analytics still work
- Auth still works
- AI Research is private
- candidate → Lead conversion works
- duplicates are handled correctly
- mobile layout remains usable

---

# 89. FINAL DELIVERY REPORT

After implementation provide:

- features implemented
- routes added
- components added
- database tables/fields added
- migrations created
- validation schema
- candidate import format
- candidate → Lead mapping
- duplicate logic
- RLS/security changes
- tests added
- manual configuration required
- deferred features
- recommended next development step

Do not claim direct ChatGPT write integration exists if the implementation still uses the structured import bridge.

---

# FINAL PRINCIPLE

The AI Research system should not merely create a list of websites.

It should transform public company research into structured sales intelligence.

The desired workflow is:

ASK CHATGPT
→ DISCOVER COMPANIES
→ UNDERSTAND WHAT THEY DO
→ CLASSIFY THEM
→ IDENTIFY WHAT SHAPEVIZ CAN OFFER
→ EXPLAIN WHY
→ PRESERVE SOURCES
→ REVIEW
→ APPROVE
→ LEAD

The system should help Shapeviz build a growing, high-quality database of potential clients without turning the CRM into a collection of random companies or AI-generated guesses.
