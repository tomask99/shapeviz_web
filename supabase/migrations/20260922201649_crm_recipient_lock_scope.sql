-- Do not share-lock company rows: verified visits may advance their status.
-- Revocation and unassignment still serialize on recipient/association rows.
create or replace function public.crm_resolve_recipient(p_deck text,p_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare found_id uuid;
begin
 select r.id into found_id from public.crm_presentation_recipients r
 join public.crm_presentation_links l on l.id=r.association_id and l.company_id=r.company_id and l.owner_id=r.owner_id and l.deck_slug=r.deck_slug
 join public.crm_companies c on c.id=r.company_id and c.owner_id=r.owner_id
 where r.deck_slug=p_deck and r.token_hash=p_hash and r.revoked_at is null and c.archived_at is null
 and exists(select 1 from public.presentation_admins a where a.user_id=r.owner_id and a.role='owner')
 for share of r,l;
 return found_id;
end;$$;
revoke all on function public.crm_resolve_recipient(text,text) from public,anon,authenticated;
grant execute on function public.crm_resolve_recipient(text,text) to service_role;
