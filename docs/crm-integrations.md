# CRM provider integration seams

Phase 2E prepares boundaries, not active external integrations.

## Email

Use existing contacts, recorded replies and activities; do not introduce a second contact/timeline model. Provider message/thread identifiers can be stored in activity metadata. An eventual server adapter must authenticate the provider connection, resolve it to the CRM owner, check company/contact ownership, verify webhook authenticity, and establish a database uniqueness/idempotency constraint before ingesting external messages. Metadata alone is not a deduplication guarantee.

Existing manual sent/replied actions remain authoritative manual records. No mailbox is connected and no email is sent by these new features. Do not infer a reply from a website visit or move a company to WON automatically.

## Calendar

`crm_followups.external_calendar_event_id` is reserved for a future provider adapter. Browser roles cannot write this field. Existing task due dates and meeting activities remain functional without calendar access.

Future work must add provider/account identity, OAuth secret storage outside public CRM records, timezone handling, retry-safe event mapping, conflict/deletion policy and a separate explicit user confirmation before creating an external event. A nullable event identifier is not a functioning sync system.

## External actions

Follow-up suggestions remain editable suggestions, not scheduled messages. Any later automation needs its own authorization, audit trail and opt-out policy. Public presentations must never expose provider identifiers, OAuth tokens, private CRM notes or recipient email addresses.
