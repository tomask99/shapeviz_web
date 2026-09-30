import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('batched Pipeline matches every legacy column, bounds pages and isolates owners with RLS',async()=>{
  const db=new PGlite(),owner='11111111-1111-4111-8111-111111111111';
  const sql=async name=>readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create table public.crm_companies(id uuid primary key,owner_id uuid,company_name text,website text,short_description text,
        country_category text,pipeline_status text,fit text,priority text,lead_source text,industry text,services text[],
        archived_at timestamptz,updated_at timestamptz,created_at timestamptz);
      create table public.crm_contacts(company_id uuid,owner_id uuid,full_name text,email text);
      create table public.test_signals(id uuid,owner_id uuid,presentation_count bigint,last_contact timestamptz,next_followup timestamptz,
        last_activity timestamptz,has_replied boolean,visits bigint,seconds bigint,clicks bigint,last_visit timestamptz,engagement text,presentation_status text);
      create view public.crm_company_signals with(security_invoker=true) as select * from public.test_signals;
      alter table public.crm_companies enable row level security;alter table public.crm_contacts enable row level security;alter table public.test_signals enable row level security;
      create policy owned on public.crm_companies for select to authenticated using(owner_id=(select auth.uid()));
      create policy owned on public.crm_contacts for select to authenticated using(owner_id=(select auth.uid()));
      create policy owned on public.test_signals for select to authenticated using(owner_id=(select auth.uid()));
      grant select on all tables in schema public to authenticated;
      insert into public.crm_companies select md5(g::text)::uuid,'${owner}', 'Company '||g,'example.test','Sofa',
        case when g%2=0 then 'SK' else 'CZ' end,
        (array['NEW_LEAD','PRESENTATION_READY','CONTACTED','PRESENTATION_VIEWED','REPLIED','MEETING','PROPOSAL','WON','LOST'])[g%9+1],
        case when g%2=0 then 'HIGH' else 'LOW' end,case when g%2=0 then 'HIGH' else 'MEDIUM' end,
        case when g%2=0 then 'WEBSITE' else 'OTHER' end,'Furniture',array[case when g%2=0 then '3D' else 'WEB' end],
        case when g%13=0 then now() end,now()-(g%5)*interval '1 day',now()-(g%3)*interval '1 day'
        from generate_series(0,287) g;
      insert into public.crm_companies select md5('other')::uuid,'22222222-2222-4222-8222-222222222222','Private','private.test','','SK','NEW_LEAD','HIGH','HIGH','OTHER','',array[]::text[],null,now(),now();
      insert into public.crm_contacts select id,owner_id,'Contact special', 'contact@example.test' from public.crm_companies where company_name='Company 1';
      insert into public.test_signals select id,owner_id,1,
        case when priority='HIGH' then now()-interval '2 days' when fit='LOW' then now()-interval '40 days' end,
        case when priority='HIGH' then now()+interval '1 day' end,now(),priority='HIGH',1,120,0,now(),
        case when priority='HIGH' then 'HOT' else 'COLD' end,case when priority='HIGH' then 'VIEWED' else 'NONE' end from public.crm_companies;`);
    // Use the original list implementation (including its later fit filter) as
    // the compatibility oracle, rather than duplicating the new ranking logic.
    const source=await sql('20260922191133_crm_engagement.sql');
    const baseline=source.match(/create or replace function public\.crm_list_companies[\s\S]*?\$\$;/)[0]
      .replace("and (coalesce(p_filters->>'priority'", "and (coalesce(p_filters->>'fit','')='' or c.fit=p_filters->>'fit') and (coalesce(p_filters->>'priority'");
    await db.exec(baseline);
    await db.exec(await sql('20260930180330_crm_pipeline_batch.sql'));
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
    const filters=[{}, {archived:'all',pipeline_status:'LOST',sort:'name'}, {q:'Contact special'}, {q:'no match'},
      {country_category:'CZ'}, {fit:'HIGH'}, {priority:'HIGH'}, {lead_source:'WEBSITE'}, {industry:'furniture'}, {service:'3D'},
      {presentation_status:'VIEWED'}, {engagement:'HOT'}, {has_followup:'yes'}, {has_followup:'no'},
      {has_replied:'yes'}, {has_replied:'no'}, {last_contacted:'never'}, {last_contacted:'7'}, {last_contacted:'30'}, {last_contacted:'older30'},
      {q:'Sofa',country_category:'SK',engagement:'HOT'}];
    for(const mode of ['active','lost'])for(const filter of filters){
      const {rows:[{actual,expected}]}=await db.query(`select public.crm_pipeline($1,$2) as actual,
        (select jsonb_build_object('columns',jsonb_agg(jsonb_build_object('status',status)||public.crm_list_companies(
          $1::jsonb||jsonb_build_object('archived','active','sort','updated','pipeline_status',status),1) order by n))
          from unnest(case when $2='lost' then array['LOST'] else array['NEW_LEAD','PRESENTATION_READY','CONTACTED','PRESENTATION_VIEWED','REPLIED','MEETING','PROPOSAL','WON'] end)
          with ordinality as s(status,n)) as expected`,[JSON.stringify(filter),mode]);
      assert.deepEqual(actual,expected,JSON.stringify({mode,filter}));
      assert.ok(actual.columns.every(c=>c.companies.length<=25&&c.companies.every(row=>row.owner_id===owner&&!row.archived_at)));
      if(!Object.keys(filter).length)assert.ok(actual.columns.some(c=>c.total>25&&c.companies.length===25));
    }
    await assert.rejects(db.query(`select public.crm_pipeline('{}','invalid')`),/Invalid pipeline mode/);
    await db.exec(`set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'`);
    const other=(await db.query('select public.crm_pipeline() as data')).rows[0].data;
    assert.equal(other.columns.reduce((sum,c)=>sum+c.total,0),1);assert.equal(other.columns[0].companies[0].company_name,'Private');
    await db.exec(`set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333'`);
    assert.ok((await db.query('select public.crm_pipeline() as data')).rows[0].data.columns.every(c=>c.total===0));
    await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.crm_pipeline()'),/permission denied/);
  }finally{await db.close();}
});
