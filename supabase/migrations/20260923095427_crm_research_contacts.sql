-- Phase 3B.2b: immutable, reviewed public-contact proposals. Company import v1,
-- candidate approval and manually maintained CRM contact fields stay independent.
create function crm_private.research_contact_valid(p jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare field text; e jsonb; s jsonb; v jsonb; urls text[]:='{}'; max_size integer;
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>200000
    or not p ?& array['full_name','job_title','email','phone','linkedin','confidence','sources','field_provenance']
    or p-array['full_name','job_title','email','phone','linkedin','confidence','sources','field_provenance']<>'{}'::jsonb
    or coalesce(p->>'confidence','') not in ('LOW','MEDIUM','HIGH')
    or jsonb_typeof(p->'sources') is distinct from 'array'
    or jsonb_typeof(p->'field_provenance') is distinct from 'object' then return false; end if;
  if jsonb_array_length(p->'sources') not between 1 and 10
    or not (p->'field_provenance') ?& array['full_name','job_title','email','phone','linkedin']
    or (p->'field_provenance')-array['full_name','job_title','email','phone','linkedin']<>'{}'::jsonb then return false; end if;
  for s in select value from jsonb_array_elements(p->'sources') loop
    if jsonb_typeof(s)<>'object' or not s ?& array['url','title','source_type','retrieved_at','supports']
      or s-array['url','title','source_type','retrieved_at','supports']<>'{}'::jsonb
      or jsonb_typeof(s->'url') is distinct from 'string' or length(s->>'url') not between 1 and 2048
      or s->>'url' !~ '^https?://[^/?#[:space:]@]+([/?#][^[:space:]]*)?$'
      or jsonb_typeof(s->'title') is distinct from 'string' or length(s->>'title')>300
      or coalesce(s->>'source_type','') not in ('Company Website','About Page','Product Page','Contact Page','Professional / Architect Page','Download Page','Instagram','LinkedIn','Press Article','Other Public Source')
      or jsonb_typeof(s->'supports') is distinct from 'array'
      or jsonb_typeof(s->'retrieved_at') not in ('string','null') then return false; end if;
    if s->>'url'=any(urls) or jsonb_array_length(s->'supports')>30 then return false; end if;
    urls:=array_append(urls,s->>'url');
    if s->>'retrieved_at' is not null and not isfinite((s->>'retrieved_at')::timestamptz) then return false; end if;
    for v in select value from jsonb_array_elements(s->'supports') loop
      if jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 120 then return false; end if;
    end loop;
  end loop;
  foreach field in array array['full_name','job_title','email','phone','linkedin'] loop
    max_size:=case field when 'email' then 254 when 'phone' then 80 when 'linkedin' then 2048 else 160 end;
    if jsonb_typeof(p->field) is distinct from 'string' or length(p->>field)>max_size
      or p->>field<>btrim(p->>field) then return false; end if;
    e:=p->'field_provenance'->field;
    if jsonb_typeof(e) is distinct from 'object' or not e ?& array['status','confidence','evidence','source_urls']
      or e-array['status','confidence','evidence','source_urls']<>'{}'::jsonb
      or jsonb_typeof(e->'evidence') is distinct from 'string' or length(e->>'evidence')>3000
      or jsonb_typeof(e->'source_urls') is distinct from 'array' then return false; end if;
    if jsonb_array_length(e->'source_urls')>30 then return false; end if;
    if p->>field='' then
      if e->>'status' is distinct from 'UNKNOWN' or e->'confidence' is distinct from 'null'::jsonb
        or e->>'evidence'<>'' or e->'source_urls'<>'[]'::jsonb then return false; end if;
    else
      if coalesce(e->>'confidence','') not in ('LOW','MEDIUM','HIGH') or btrim(e->>'evidence')=''
        or jsonb_array_length(e->'source_urls')=0
        or (case when field='job_title' then coalesce(e->>'status','') not in ('VERIFIED','INFERRED') else e->>'status' is distinct from 'VERIFIED' end) then return false; end if;
    end if;
    for v in select value from jsonb_array_elements(e->'source_urls') loop
      if jsonb_typeof(v)<>'string' or not (v#>>'{}'=any(urls)) then return false; end if;
    end loop;
  end loop;
  return length(p->>'full_name')>0
    and (p->>'email'='' or p->>'email' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    and (p->>'linkedin'='' or p->>'linkedin' ~ '^https?://[^/?#[:space:]@]+([/?#][^[:space:]]*)?$');
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return false;
end;
$$;
revoke all on function crm_private.research_contact_valid(jsonb) from public,anon,authenticated;
grant execute on function crm_private.research_contact_valid(jsonb) to authenticated,service_role;

create table public.crm_research_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  candidate_id uuid not null,
  proposal jsonb not null check(crm_private.research_contact_valid(proposal)),
  reference_identity jsonb not null check(jsonb_typeof(reference_identity)='object'
    and reference_identity ?& array['company_name','website','country']
    and reference_identity-array['company_name','website','country']='{}'::jsonb
    and jsonb_typeof(reference_identity->'company_name')='string'
    and jsonb_typeof(reference_identity->'website')='string'
    and jsonb_typeof(reference_identity->'country')='string' and octet_length(reference_identity::text)<=10000),
  status text not null default 'PROPOSED' check(status in ('PROPOSED','CREATED','DISMISSED')),
  version integer not null default 1 check(version>0),
  created_company_id uuid,
  created_contact_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(candidate_id,owner_id) references public.crm_research_candidates(id,owner_id) on delete cascade,
  foreign key(created_company_id,owner_id) references public.crm_companies(id,owner_id),
  foreign key(created_contact_id,created_company_id,owner_id) references public.crm_contacts(id,company_id,owner_id) on delete set null(created_contact_id),
  check((status='CREATED')=(created_company_id is not null) and (created_contact_id is null or status='CREATED'))
);
create index crm_research_contacts_candidate_idx on public.crm_research_contacts(candidate_id,owner_id,created_at,id);
create index crm_research_contacts_company_idx on public.crm_research_contacts(created_company_id,owner_id) where created_company_id is not null;
create index crm_research_contacts_contact_idx on public.crm_research_contacts(created_contact_id,created_company_id,owner_id) where created_contact_id is not null;
alter table public.crm_research_contacts enable row level security;
revoke all on public.crm_research_contacts from public,anon,authenticated,service_role;
grant select on public.crm_research_contacts to authenticated;
grant select,insert,update,delete on public.crm_research_contacts to service_role;
create policy crm_research_contacts_read on public.crm_research_contacts for select to authenticated using(
  owner_id=(select auth.uid()) and exists(select 1 from public.presentation_admins where user_id=(select auth.uid()) and role='owner'));

create function crm_private.research_contact_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,731903));
    if (select count(*) from public.crm_research_contacts where candidate_id=new.candidate_id and owner_id=new.owner_id)>=100 then
      raise exception 'A candidate can retain at most 100 contact proposals' using errcode='PT409'; end if;
    new.version:=1; new.created_at:=clock_timestamp(); new.updated_at:=new.created_at;
  else
    if new.id<>old.id or new.owner_id<>old.owner_id or new.candidate_id<>old.candidate_id
      or new.proposal is distinct from old.proposal or new.reference_identity is distinct from old.reference_identity
      or not ((old.status='PROPOSED' and new.status in ('CREATED','DISMISSED'))
        or (old.status='CREATED' and new.status='CREATED' and old.created_contact_id is not null and new.created_contact_id is null
          and new.created_company_id=old.created_company_id)) then
      raise exception 'Research contact evidence and completed decisions are immutable' using errcode='42501'; end if;
    new.version:=old.version+1; new.created_at:=old.created_at; new.updated_at:=clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function crm_private.research_contact_stamp() from public,anon,authenticated,service_role;
create trigger crm_research_contacts_stamp before insert or update on public.crm_research_contacts for each row execute function crm_private.research_contact_stamp();

alter table public.crm_contacts add column research_evidence jsonb check(research_evidence is null or
  (jsonb_typeof(research_evidence)='object' and octet_length(research_evidence::text)<=220000));
-- Existing authenticated grants enumerate editable columns, excluding evidence.
-- Manual edits retain the original evidence even when their current values differ.
create function crm_private.contact_research_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and new.research_evidence is distinct from old.research_evidence then
    raise exception 'Original research evidence is immutable' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function crm_private.contact_research_guard() from public,anon,authenticated,service_role;
create trigger crm_contacts_00_research_guard before update of research_evidence on public.crm_contacts for each row execute function crm_private.contact_research_guard();

-- A scalar JSON response retains complete counts despite PostgREST row limits.
create function public.crm_research_contact_context(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  with candidate as (
    select id,company_name,website,country,version,research_status,approved_company_id
    from public.crm_research_candidates where id=p_id and owner_id=(select auth.uid())
  ), company as (
    select co.id,co.company_name,co.archived_at from public.crm_companies co join candidate c on c.approved_company_id=co.id where co.owner_id=(select auth.uid())
  ), contacts as (
    select ct.id,ct.full_name,ct.email from public.crm_contacts ct join company c on c.id=ct.company_id
    where ct.owner_id=(select auth.uid()) order by ct.id limit 1001
  ), items as (
    select r.* from public.crm_research_contacts r join candidate c on c.id=r.candidate_id
    where r.owner_id=(select auth.uid()) order by r.created_at,r.id limit 101
  )
  select jsonb_build_object('candidate',to_jsonb(c),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at,i.id) from items i),'[]'::jsonb),
    'company',(select to_jsonb(co) from company co),
    'contacts',coalesce((select jsonb_agg(to_jsonb(ct) order by ct.id) from contacts ct),'[]'::jsonb),
    'overflow',(select count(*)>1000 from contacts) or (select count(*)>100 from items)) from candidate c;
$$;
revoke all on function public.crm_research_contact_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.crm_research_contact_context(uuid) to authenticated;

create function public.crm_research_contacts_import(p_owner uuid,p_id uuid,p_operation uuid,p_hash text,p_version integer,p_contacts jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare c public.crm_research_candidates; previous crm_private.research_review_operations; p jsonb; result jsonb;
  ids jsonb:='[]'; saved_id uuid; name_key text; email_key text; total integer;
begin
  if current_user<>'service_role' or p_owner is null then raise exception 'Research access denied' using errcode='42501'; end if;
  if p_id is null or p_operation is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_version is null or p_version<1 then
    raise exception 'Invalid contact import request' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,731903));
  perform 1 from public.presentation_admins where user_id=p_owner and role='owner' for share;
  if not found then raise exception 'Research access denied' using errcode='42501'; end if;
  select * into previous from crm_private.research_review_operations where owner_id=p_owner and id=p_operation;
  if found then
    if previous.payload_hash<>p_hash then raise exception 'Contact import operation changed' using errcode='PT409'; end if;
    return previous.result||'{"replayed":true}'::jsonb;
  end if;
  select * into c from public.crm_research_candidates where id=p_id and owner_id=p_owner for update;
  if not found then raise exception 'Candidate not found' using errcode='PT404'; end if;
  if c.version<>p_version or c.research_status='REJECTED' then raise exception 'Candidate changed or was rejected' using errcode='PT409'; end if;
  if p_contacts is null or jsonb_typeof(p_contacts)<>'array' or octet_length(p_contacts::text)>200000 then
    raise exception 'Invalid contact proposals' using errcode='22023'; end if;
  total:=jsonb_array_length(p_contacts);
  if total not between 1 and 20 or (select count(*) from public.crm_research_contacts where candidate_id=p_id and owner_id=p_owner)+total>100 then
    raise exception 'Contact proposal count is outside the allowed limit' using errcode='PT409'; end if;
  if c.approved_company_id is not null then
    perform 1 from public.crm_companies where id=c.approved_company_id and owner_id=p_owner for update;
    if not found then raise exception 'Approved company not found' using errcode='PT409'; end if;
  end if;
  for p in select value from jsonb_array_elements(p_contacts) loop
    if not crm_private.research_contact_valid(p) then raise exception 'Contact proposal lacks valid public evidence' using errcode='22023'; end if;
    name_key:=lower(regexp_replace(btrim(p->>'full_name'),'\s+',' ','g')); email_key:=lower(btrim(p->>'email'));
    if exists(select 1 from public.crm_research_contacts r where r.owner_id=p_owner and r.candidate_id=p_id and r.status<>'DISMISSED'
      and (lower(regexp_replace(btrim(r.proposal->>'full_name'),'\s+',' ','g'))=name_key
        or (email_key<>'' and lower(btrim(r.proposal->>'email'))=email_key)))
      or exists(select 1 from public.crm_contacts ct where ct.owner_id=p_owner and ct.company_id=c.approved_company_id
        and (lower(regexp_replace(btrim(ct.full_name),'\s+',' ','g'))=name_key or (email_key<>'' and lower(btrim(ct.email))=email_key))) then
      raise exception 'A matching contact or proposal already exists; preview again' using errcode='PT409'; end if;
    insert into public.crm_research_contacts(owner_id,candidate_id,proposal,reference_identity)
      values(p_owner,p_id,p,jsonb_build_object('company_name',c.company_name,'website',c.website,'country',c.country)) returning id into saved_id;
    ids:=ids||jsonb_build_array(saved_id);
  end loop;
  result:=jsonb_build_object('saved',total,'skipped',0,'ids',ids);
  insert into crm_private.research_review_operations(owner_id,id,payload_hash,result) values(p_owner,p_operation,p_hash,result);
  return result;
end;
$$;
revoke all on function public.crm_research_contacts_import(uuid,uuid,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.crm_research_contacts_import(uuid,uuid,uuid,text,integer,jsonb) to service_role;

create function public.crm_research_contact_decide(p_owner uuid,p_id uuid,p_operation uuid,p_hash text,p_version integer,p_decision text) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare r public.crm_research_contacts; c public.crm_research_candidates; co public.crm_companies;
  previous crm_private.research_review_operations; result jsonb; contact_id uuid; name_key text; email_key text;
  old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
  if current_user<>'service_role' or p_owner is null then raise exception 'Research access denied' using errcode='42501'; end if;
  if p_id is null or p_operation is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_version is null or p_version<1
    or p_decision is null or p_decision not in ('create','dismiss') then raise exception 'Invalid contact decision' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,731903));
  perform 1 from public.presentation_admins where user_id=p_owner and role='owner' for share;
  if not found then raise exception 'Research access denied' using errcode='42501'; end if;
  select * into previous from crm_private.research_review_operations where owner_id=p_owner and id=p_operation;
  if found then
    if previous.payload_hash<>p_hash then raise exception 'Contact decision operation changed' using errcode='PT409'; end if;
    return previous.result||'{"replayed":true}'::jsonb;
  end if;
  select * into r from public.crm_research_contacts where id=p_id and owner_id=p_owner for update;
  if not found then raise exception 'Contact proposal not found' using errcode='PT404'; end if;
  select * into c from public.crm_research_candidates where id=r.candidate_id and owner_id=p_owner for update;
  if not found then raise exception 'Candidate not found' using errcode='PT404'; end if;
  if r.version<>p_version or r.status<>'PROPOSED' or c.research_status='REJECTED' then
    raise exception 'Contact proposal changed or its candidate was rejected' using errcode='PT409'; end if;
  if p_decision='dismiss' then
    update public.crm_research_contacts set status='DISMISSED' where id=p_id and owner_id=p_owner returning * into r;
  else
    if c.research_status<>'APPROVED' or c.approved_company_id is null then raise exception 'Approve the candidate before creating contacts' using errcode='PT409'; end if;
    if r.reference_identity is distinct from jsonb_build_object('company_name',c.company_name,'website',c.website,'country',c.country) then
      raise exception 'Company identity changed; research contacts again' using errcode='PT409'; end if;
    select * into co from public.crm_companies where id=c.approved_company_id and owner_id=p_owner for update;
    if not found or co.archived_at is not null then raise exception 'An active approved company is required' using errcode='PT409'; end if;
    name_key:=lower(regexp_replace(btrim(r.proposal->>'full_name'),'\s+',' ','g')); email_key:=lower(btrim(r.proposal->>'email'));
    if exists(select 1 from public.crm_contacts ct where ct.owner_id=p_owner and ct.company_id=co.id
      and (lower(regexp_replace(btrim(ct.full_name),'\s+',' ','g'))=name_key or (email_key<>'' and lower(btrim(ct.email))=email_key))) then
      raise exception 'A matching CRM contact already exists' using errcode='PT409'; end if;
    perform set_config('request.jwt.claim.sub',p_owner::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',p_owner,'role','authenticated')::text,true);
    insert into public.crm_contacts(company_id,owner_id,full_name,job_title,email,phone,linkedin,primary_contact,research_evidence)
      values(co.id,p_owner,r.proposal->>'full_name',case when r.proposal->'field_provenance'->'job_title'->>'status'='VERIFIED' then r.proposal->>'job_title' else '' end,
        r.proposal->>'email',r.proposal->>'phone',r.proposal->>'linkedin',false,
        jsonb_build_object('proposal_id',r.id,'candidate_id',r.candidate_id,'reference_identity',r.reference_identity,'proposal',r.proposal)) returning id into contact_id;
    perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
    perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
    update public.crm_research_contacts set status='CREATED',created_company_id=co.id,created_contact_id=contact_id
      where id=p_id and owner_id=p_owner returning * into r;
  end if;
  result:=jsonb_build_object('id',r.id,'status',r.status,'version',r.version,'contact_id',r.created_contact_id,'company_id',r.created_company_id);
  insert into crm_private.research_review_operations(owner_id,id,payload_hash,result) values(p_owner,p_operation,p_hash,result);
  return result;
end;
$$;
revoke all on function public.crm_research_contact_decide(uuid,uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.crm_research_contact_decide(uuid,uuid,uuid,text,integer,text) to service_role;
