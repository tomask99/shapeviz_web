-- Replies are immutable business events, not a second copy of the activity timeline.
alter table public.crm_activities drop constraint crm_activities_event_type_check;
alter table public.crm_activities add constraint crm_activities_event_type_check check(event_type in (
 'lead_created','status_changed','lead_archived','lead_restored','contact_added','contact_updated','contact_removed',
 'note_added','note_updated','note_removed','manual_activity','followup_created','followup_updated','followup_rescheduled','followup_completed',
 'presentation_assigned','presentation_unassigned','presentation_sent','reply_received'
));
-- Client-generated identity makes retries of the same submission idempotent.
grant insert(id) on public.crm_activities to authenticated;
create policy crm_activity_reply on public.crm_activities for insert to authenticated with check(
 event_type='reply_received' and owner_id=(select auth.uid())
 and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid()) and c.archived_at is null)
);
create function crm_private.validate_reply_activity() returns trigger
language plpgsql security invoker set search_path='' as $$
declare received timestamptz; contact uuid; contact_name text; content text;
begin
 if new.event_type<>'reply_received' then return new;end if;
 if auth.uid() is null or new.owner_id<>auth.uid() then raise exception 'CRM access denied' using errcode='42501';end if;
 if jsonb_typeof(new.metadata)<>'object' or jsonb_typeof(new.metadata->'content') is distinct from 'string'
 or jsonb_typeof(new.metadata->'received_at') is distinct from 'string'
 then raise exception 'Invalid reply metadata' using errcode='23514';end if;
 content:=btrim(new.metadata->>'content');
 if (new.metadata->>'received_at')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
 then raise exception 'Use an ISO UTC reply date' using errcode='23514';end if;
 if length(content) not between 1 and 5000 then raise exception 'Enter a reply summary' using errcode='23514';end if;
 received:=(new.metadata->>'received_at')::timestamptz;
 if not isfinite(received) or received>clock_timestamp()+interval '1 minute' then raise exception 'Invalid reply date' using errcode='23514';end if;
 contact:=nullif(new.metadata->>'contact_id','')::uuid;
 if contact is not null then
  select c.full_name into contact_name from public.crm_contacts c where c.id=contact and c.company_id=new.company_id and c.owner_id=auth.uid();
  if not found then raise exception 'Choose a contact from this company' using errcode='23514';end if;
 end if;
 -- Keep a historical name, not an FK that could erase a reply when a contact is deleted.
 new.metadata:=jsonb_build_object('content',content,'received_at',to_char(received at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'contact_id',contact,'contact_name',contact_name);
 return new;
end;
$$;
revoke all on function crm_private.validate_reply_activity() from public,anon,authenticated,service_role;
create trigger crm_activities_reply_validate before insert on public.crm_activities for each row execute function crm_private.validate_reply_activity();
create index crm_activities_latest_reply_idx on public.crm_activities(owner_id,company_id,(metadata->>'received_at') desc,id) where event_type='reply_received';
