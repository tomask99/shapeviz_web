-- Remove every presentation registry record. Foreign-key cascades also remove
-- presentation share links, analytics sessions, and analytics events.
delete from public.presentation_projects;
