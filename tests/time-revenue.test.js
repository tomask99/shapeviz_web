import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {timeDatabase,owner,other,company,project} from './helpers/time-database.js';
import {projectRevenueMarkup} from '../public/admin/crm-project-revenue.js';
import {formatPipelineEUR} from '../public/admin/crm-pipeline-value.js';

test('revenue includes completed tracked and manual earnings once, at saved rates',async()=>{
 const {db,rpc}=await timeDatabase();try{
  const fixed=randomUUID(),monthly=randomUUID(),session=randomUUID(),open=randomUUID(),custom=randomUUID();
  await db.exec(`reset role;
   insert into public.crm_projects(id,company_id,owner_id,name,project_value,monthly_value) values
    ('${fixed}','${company}','${owner}','Fixed',1000.25,null),('${monthly}','${company}','${owner}','Monthly',null,500);
   insert into public.crm_time_sessions(id,owner_id,company_id,project_id,kind,status,rate_cents,started_at,ended_at) values
    ('${session}','${owner}','${company}','${project}','project','finished',6000,'2026-10-07 08:00Z','2026-10-07 12:15Z'),
    ('${open}','${owner}','${company}','${project}','project','paused',6000,'2026-10-07 13:00Z',null);
   insert into public.crm_time_sessions(id,owner_id,kind,activity_name,status,started_at,ended_at) values
    ('${custom}','${owner}','custom_activity','Learning','finished','2026-10-07 08:00Z','2026-10-07 10:00Z');
   insert into public.crm_time_segments(session_id,owner_id,started_at,ended_at) values
    ('${session}','${owner}','2026-10-07 08:00Z','2026-10-07 09:00Z'),
    ('${session}','${owner}','2026-10-07 10:00Z','2026-10-07 12:15Z'),
    ('${open}','${owner}','2026-10-07 13:00Z','2026-10-07 14:00Z'),
    ('${custom}','${owner}','2026-10-07 08:00Z','2026-10-07 10:00Z');set role authenticated;`);
  const command=(action,data,request=randomUUID())=>rpc('crm_time_command',{p_action:action,p_data:data,p_request:request});
  const body={company_id:company,project_id:project,work_date:'2026-10-07',duration_seconds:9000},key=randomUUID();
  const entry=await command('manual_save',body,key);await command('manual_save',body,key);
  const revenue=()=>rpc('crm_project_revenue');
  assert.deepEqual(await revenue(),{currency:'EUR',one_time:{amount:'1345.25',count:2,hourly_amount:'345.00',hourly_count:1},monthly:{amount:'500.00',count:1}});
  await db.exec(`update public.crm_projects set hourly_rate_cents=9000 where id='${project}'`);assert.equal((await revenue()).one_time.amount,'1345.25');
  const newer=await command('manual_save',{...body,duration_seconds:3600});assert.equal((await revenue()).one_time.amount,'1435.25');assert.equal((await revenue()).one_time.count,2);
  await command('manual_save',{...body,id:entry.id,version:1,duration_seconds:3600});assert.equal((await revenue()).one_time.amount,'1345.25');
  await command('manual_delete',{company_id:company,project_id:project,id:newer.id,version:1});assert.equal((await revenue()).one_time.amount,'1255.25');
  await db.exec(`update public.crm_projects set status='CANCELLED' where id='${project}'`);assert.equal((await revenue()).one_time.amount,'1000.25');assert.equal((await revenue()).one_time.hourly_count,0);
  await db.exec(`update public.crm_projects set status='COMPLETED' where id='${project}';update public.crm_projects set status='ON_HOLD' where id='${monthly}'`);assert.equal((await revenue()).one_time.amount,'1255.25');assert.equal((await revenue()).monthly.amount,'0');
  await db.exec(`update public.crm_companies set archived_at=now() where id='${company}'`);assert.equal((await revenue()).one_time.amount,'0');
  await db.exec(`set request.jwt.claim.sub='${other}'`);assert.equal((await revenue()).one_time.amount,'100.00');assert.equal((await revenue()).one_time.hourly_amount,'0');
  await db.exec('reset role;set role anon');await assert.rejects(revenue(),/permission denied/);
 }finally{await db.close();}
});

test('revenue card explains the hourly contribution and validates the breakdown',()=>{
 const value={currency:'EUR',one_time:{amount:'1345.25',count:2,hourly_amount:'345.00',hourly_count:1},monthly:{amount:'500.00',count:1}};
 const html=projectRevenueMarkup(value);assert.match(html,/One-time projects/);assert.ok(html.includes(`Includes ${formatPipelineEUR('345.00')} of hourly work`));assert.match(html,/2 projects · 1 hourly/);assert.match(html,/Open timers are excluded/);
 for(const change of [{hourly_amount:'<script>'},{hourly_count:-1},{hourly_amount:345}])assert.match(projectRevenueMarkup({...value,one_time:{...value.one_time,...change}}),/totals unavailable/);
});
