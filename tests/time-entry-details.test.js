import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {timeDatabase,owner,other,company,project} from './helpers/time-database.js';
import {handleCrm} from '../src/crm/handler.js';
import {durationParts} from '../public/admin/time-values.js';

test('manual entries preserve minute start times, midnight boundaries and legacy precision',async()=>{
 const {db,rpc}=await timeDatabase();const command=(data)=>rpc('crm_time_command',{p_action:'manual_save',p_request:randomUUID(),p_data:data});
 const data={company_id:company,project_id:project,work_date:'2026-10-06',work_time:'23:45',time_zone:'Europe/Bratislava',duration_seconds:5400};
 try{
  const saved=await command(data),entry=(await rpc('crm_time_history')).items[0];
  assert.equal(entry.work_time,'23:45:00');assert.equal(entry.time_zone,data.time_zone);assert.equal(Date.parse(entry.started_at),Date.parse('2026-10-06T21:45:00Z'));assert.equal(Date.parse(entry.ended_at),Date.parse('2026-10-06T23:15:00Z'));
  for(const day of ['2026-10-06','2026-10-07'])assert.equal((await rpc('crm_time_history',{p_from:day,p_to:day,p_zone:'Europe/Bratislava'})).items.length,1);
  assert.equal((await rpc('crm_time_history',{p_from:'2026-10-08',p_zone:'Europe/Bratislava'})).items.length,0);
  const {work_time,time_zone,...legacy}=data;await command({...legacy,id:saved.id,version:1,duration_seconds:5401});
  assert.equal((await rpc('crm_time_history')).items[0].work_time,'23:45:00');assert.equal((await rpc('crm_time_history')).items[0].duration_seconds,5401);
  const old=await command({...legacy,duration_seconds:61});assert.equal((await rpc('crm_time_history')).items.find(r=>r.id===old.id).started_at,null);
  await assert.rejects(command({...data,work_date:'2026-03-29',work_time:'02:30'}),/clocks change/);
  await assert.rejects(command({...data,time_zone:'not/a/zone'}),/Invalid time zone/);
  await assert.rejects(command({...data,work_time:'24:00'}),/check constraint/);
  const autumn=await command({...data,work_date:'2026-10-25',work_time:'02:30'});assert.equal(Date.parse((await rpc('crm_time_history')).items.find(r=>r.id===autumn.id).started_at),Date.parse('2026-10-25T01:30Z'));
  await db.exec(`reset role;delete from public.crm_time_manual;set role authenticated;`);
  const yesterday=(await db.query("select ((statement_timestamp() at time zone 'Europe/Bratislava')::date-1)::text as day")).rows[0].day;
  await command({...data,work_date:yesterday,work_time:'23:30'});assert.equal((await rpc('crm_time_summary',{p_zone:'Europe/Bratislava'})).today,3600);
 }finally{await db.close();}
});

test('deleting tracked and manual records removes earnings atomically and safely retries',async()=>{
 const {db,rpc}=await timeDatabase(),command=(action,data,key=randomUUID())=>rpc('crm_time_command',{p_action:action,p_data:data,p_request:key});
 const manual={company_id:company,project_id:project,work_date:'2026-10-07',duration_seconds:3600};
 try{
  const tracked=await command('start',{kind:'project',company_id:company,project_id:project});
  await db.exec(`reset role;update public.crm_time_sessions set started_at=started_at-interval '1 hour' where id='${tracked.id}';update public.crm_time_segments set started_at=started_at-interval '1 hour' where session_id='${tracked.id}';set role authenticated;`);
  await command('finish',{id:tracked.id,version:1});const row=await command('manual_save',manual);
  const before=Number((await rpc('crm_project_revenue')).one_time.amount);assert.ok(before>=120);
  await assert.rejects(command('entry_delete',{id:tracked.id,source:'Tracked',version:1,confirm:'delete'}),/changed/);
  await db.exec(`set request.jwt.claim.sub='${other}'`);await assert.rejects(command('entry_delete',{id:tracked.id,source:'Tracked',version:2,confirm:'delete'}),/not found/);await db.exec(`set request.jwt.claim.sub='${owner}'`);
  await assert.rejects(command('entry_delete',{id:tracked.id,source:'Tracked',version:2}),/Confirm/);
  const key=randomUUID(),body={id:tracked.id,source:'Tracked',version:2,confirm:'delete'};await command('entry_delete',body,key);await command('entry_delete',body,key);
  assert.equal((await rpc('crm_time_detail',{p_id:tracked.id})).segments.length,0);assert.equal((await rpc('crm_project_revenue')).one_time.amount,'60.00');
  await command('entry_delete',{id:row.id,source:'Manual',version:1,confirm:'delete'});assert.equal((await rpc('crm_project_time',{p_project:project,p_company:company})).earned_cents,'0');
  const custom=await command('start',{kind:'custom_activity',activity_name:'Accidental timer'});await command('entry_delete',{id:custom.id,source:'Tracked',version:1,confirm:'delete'});assert.equal((await rpc('crm_time_open')).item,null);assert.equal((await rpc('crm_time_history')).items.length,0);
  await assert.rejects(db.exec('delete from public.crm_time_manual'),/permission denied/);
  await db.exec(`reset role;delete from public.presentation_admins where user_id='${owner}';set role authenticated;`);await assert.rejects(command('entry_delete',body),/Owner access/);
 }finally{await db.close();}
});

test('Workspace projects filters across clients with stable paging and owner isolation',async()=>{
 const {db,rpc}=await timeDatabase(),second=randomUUID();try{
  await db.exec(`insert into public.crm_companies(id,owner_id,company_name) values('${second}','${owner}','Second studio');insert into public.crm_clients(company_id,owner_id) values('${second}','${owner}');
   insert into public.crm_projects(company_id,owner_id,name,status,monthly_value) select '${second}','${owner}','Animation '||n,'ACTIVE',500 from generate_series(1,27) n;
   insert into public.crm_projects(company_id,owner_id,name,status,project_value) values('${company}','${owner}','Finished campaign','COMPLETED',300),('${company}','${owner}','Waiting','ON_HOLD',200);`);
  const first=await rpc('crm_workspace_projects'),next=await rpc('crm_workspace_projects',{p_page:2});assert.equal(first.total,29);assert.equal(first.items.length,25);assert.equal(next.items.length,4);assert.equal(new Set([...first.items,...next.items].map(r=>r.id)).size,29);
  assert.equal((await rpc('crm_workspace_projects',{p_billing:'HOURLY'})).items[0].id,project);
  assert.equal((await rpc('crm_workspace_projects',{p_status:'COMPLETED'})).total,1);assert.equal((await rpc('crm_workspace_projects',{p_status:''})).total,30);
  assert.equal((await rpc('crm_workspace_projects',{p_company:second,p_q:'SECOND STUDIO',p_billing:'MONTHLY'})).total,27);
  assert.equal((await rpc('crm_workspace_projects',{p_company:other})).total,0);
  await db.exec(`update public.crm_companies set archived_at=now() where id='${second}'`);assert.equal((await rpc('crm_workspace_projects')).total,2);
  await db.exec(`set request.jwt.claim.sub='${other}'`);assert.equal((await rpc('crm_workspace_projects')).items[0].id,other);
  await db.exec('reset role;set role anon');await assert.rejects(rpc('crm_workspace_projects'),/permission denied/);
 }finally{await db.close();}
});

test('new API inputs validate clock, minute precision, deletion confirmation and project filters',async()=>{
 assert.equal(durationParts('2','35'),9300);assert.equal(durationParts('0','1'),60);
 for(const args of [['0','0'],['1','60'],['24','1'],['2.5','0']])assert.throws(()=>durationParts(...args));
 const calls=[],run=(action,body={},params={})=>handleCrm({action,body,url:new URL('https://test/?'+new URLSearchParams(params)),user:{id:owner},token:'user-jwt',call:async(path,options)=>{calls.push({path,options});return {};}});
 const data={companyId:company,projectId:project,requestId:randomUUID(),work_date:'2026-10-07',work_time:'09:35',timeZone:'Europe/Bratislava',hours:'2',minutes:'35'};
 await run('crm-time-manual-save',data);assert.equal(calls.at(-1).options.body.p_data.duration_seconds,9300);assert.equal(calls.at(-1).options.body.p_data.work_time,'09:35');
 for(const change of [{work_time:'24:00'},{work_time:'09:35:30'},{minutes:'60'},{timeZone:'bad'}])await assert.rejects(run('crm-time-manual-save',{...data,...change}),{status:400});
 await assert.rejects(run('crm-time-delete',{id:project,source:'Tracked',version:1,requestId:randomUUID()}),{status:400});
 await run('crm-workspace-projects',{}, {q:'Design',status:'ACTIVE',billing:'HOURLY'});assert.equal(calls.at(-1).path,'/rest/v1/rpc/crm_workspace_projects');assert.equal(calls.at(-1).options.token,'user-jwt');
 await assert.rejects(run('crm-workspace-projects',{}, {status:'bad'}),{status:400});
});
