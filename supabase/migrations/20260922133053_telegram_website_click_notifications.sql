-- One claim per recorded click, independent of the presentation-open notification.
-- Existing RLS and service_role-only writes remain unchanged.
alter table public.presentation_events
  add column telegram_claimed_at timestamptz;
