-- Same permissions, one INSERT policy. Preserve manual activity on archived companies.
drop policy crm_activity_manual on public.crm_activities;
drop policy crm_activity_reply on public.crm_activities;
create policy crm_activity_manual_reply on public.crm_activities for insert to authenticated with check(
 owner_id=(select auth.uid())
 and (
  (event_type='manual_activity' and jsonb_typeof(metadata->'content')='string'
   and length(btrim(metadata->>'content')) between 1 and 5000 and (metadata-'content')='{}'::jsonb)
  or event_type='reply_received'
 )
 and exists(select 1 from public.crm_companies c where c.id=company_id and c.owner_id=(select auth.uid())
  and (event_type='manual_activity' or c.archived_at is null))
);
