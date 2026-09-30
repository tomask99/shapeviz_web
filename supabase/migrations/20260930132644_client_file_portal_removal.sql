-- Remove portal metadata and its scoped links atomically. No MEGA operation.
alter table public.client_file_links
 drop constraint client_file_links_portal_id_company_id_owner_id_fkey,
 add constraint client_file_links_portal_id_company_id_owner_id_fkey
 foreign key(portal_id,company_id,owner_id)
 references public.client_file_shares(id,company_id,owner_id) on delete cascade;
create index client_file_links_portal_idx on public.client_file_links(portal_id);

-- Existing owner RLS applies to DELETE as well; anonymous access stays revoked.
grant delete on public.client_file_shares to authenticated;
create function crm_private.file_portal_before_delete() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.crm_companies
 where id=old.company_id and owner_id=old.owner_id and archived_at is null for update;
 if not found then raise exception 'Client unavailable' using errcode='42501';end if;
 return old;
end;$$;
revoke all on function crm_private.file_portal_before_delete() from public,anon,authenticated;
create trigger client_file_portal_before_delete before delete on public.client_file_shares
 for each row execute function crm_private.file_portal_before_delete();
