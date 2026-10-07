import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {timeDatabase,owner,other,company,project} from './helpers/time-database.js';
import {rateCents,durationSeconds,earnedCents} from '../public/admin/time-values.js';
import {projectInput} from '../src/crm/clients.js';
import {projectPrice} from '../public/admin/crm-project-editor.js';
import {handleCrm} from '../src/crm/handler.js';

test('hourly rates and manual durations use exact cents with comma and dot support',()=>{
 assert.equal(rateCents('45,50'),4550);assert.equal(rateCents('60'),6000);assert.equal(durationSeconds('2,5'),9000);assert.equal(durationSeconds('24'),86400);
 assert.equal(earnedCents(11700+9000,6000),'34500');assert.equal(earnedCents(1,6000),'2');
 for(const v of ['0','-2','1.001','1e3','','Infinity'])assert.throws(()=>rateCents(v));
 for(const v of ['0','-2','24.0001','25','2h','NaN'])assert.throws(()=>durationSeconds(v));
 const p=projectInput({name:'Design',status:'ACTIVE',billing_type:'HOURLY',amount:'60,00'});assert.equal(p.hourly_rate_cents,6000);assert.equal(p.project_value,null);assert.equal(p.monthly_value,null);assert.equal(projectPrice(p),'€60.00/h');
});

test('timer and manual SQL lifecycle, retries, snapshots, totals, scope and deletion protection',async()=>{
 const {db,rpc}=await timeDatabase();
 const command=(action,data,request=randomUUID())=>rpc('crm_time_command',{p_action:action,p_data:data,p_request:request});
 async function advance(id,seconds){await db.exec(`reset role;update public.crm_time_sessions set started_at=started_at-interval '${seconds} seconds' where id='${id}';update public.crm_time_segments set started_at=started_at-interval '${seconds} seconds' where session_id='${id}' and ended_at is null;set role authenticated;`);}
 try{
  const startData={kind:'project',project_id:project,company_id:company,description:'Modeling'},startKey=randomUUID();
  const started=await command('start',startData,startKey);const id=started.id;assert.equal((await command('start',startData,startKey)).id,id);
  await assert.rejects(command('start',{kind:'custom_activity',activity_name:'Another'}),/Finish your existing timer/);
  assert.equal((await rpc('crm_time_open')).item.status,'running');
  await assert.rejects(db.exec(`insert into public.crm_time_segments(session_id,owner_id,started_at) values('${id}','${owner}',now())`),/permission denied/);
  await advance(id,1800);const pauseKey=randomUUID();await command('pause',{id,version:1},pauseKey);
  const paused=await rpc('crm_time_open');assert.equal(paused.item.status,'paused');assert.ok(paused.item.duration_seconds>=1800);assert.equal(paused.item.ended_at,null);
  await command('resume',{id,version:2});await command('pause',{id,version:1},pauseKey);assert.equal((await rpc('crm_time_open')).item.status,'running');
  await assert.rejects(command('finish',{id,version:1}),/another tab/);
  await advance(id,1800);const finishKey=randomUUID();await command('finish',{id,version:3},finishKey);await command('finish',{id,version:3},finishKey);assert.equal((await rpc('crm_time_open')).item,null);
  const detail=await rpc('crm_time_detail',{p_id:id});assert.equal(detail.item.status,'finished');assert.equal(detail.segments.length,2);assert.ok(detail.item.duration_seconds>=3600&&detail.item.duration_seconds<3610);
  await db.exec(`reset role;delete from public.crm_time_segments where session_id='${id}';update public.crm_time_sessions set started_at='2026-10-01 08:00Z',ended_at='2026-10-01 11:15Z' where id='${id}';insert into public.crm_time_segments(session_id,owner_id,started_at,ended_at) values('${id}','${owner}','2026-10-01 08:00Z','2026-10-01 11:15Z');set role authenticated;`);
  const manualData={project_id:project,company_id:company,work_date:'2026-10-01',duration_seconds:9000,description:'Manual'},manualKey=randomUUID();
  const manual=await command('manual_save',manualData,manualKey);await command('manual_save',manualData,manualKey);
  const totals=await rpc('crm_project_time',{p_project:project,p_company:company});assert.deepEqual(totals,{tracked_seconds:11700,manual_seconds:9000,earned_cents:'34500',open_seconds:0,open_earned_cents:'0'});
  await db.exec(`update public.crm_projects set hourly_rate_cents=9000 where id='${project}'`);
  await command('manual_save',{...manualData,id:manual.id,version:1,duration_seconds:3600});
  const newer=await command('manual_save',{...manualData,duration_seconds:3600});
  const entries=await rpc('crm_time_history',{p_project:project});assert.equal(entries.items.length,3);assert.equal(entries.items.find(e=>e.id===manual.id).rate_cents,6000);assert.equal(entries.items.find(e=>e.id===newer.id).rate_cents,9000);
  await assert.rejects(command('manual_save',{...manualData,duration_seconds:0}),/check constraint/);await assert.rejects(command('manual_save',{...manualData,duration_seconds:86401}),/check constraint/);
  await assert.rejects(command('manual_save',{...manualData,project_id:other}),/hourly project/);
  await assert.rejects(db.exec(`delete from public.crm_projects where id='${project}'`),/foreign key/);
  await assert.rejects(db.exec(`update public.crm_projects set hourly_rate_cents=null where id='${project}'`),/Keep Hourly billing/);
  const deleteKey=randomUUID();await command('manual_delete',{...manualData,id:manual.id,version:2},deleteKey);await command('manual_delete',{...manualData,id:manual.id,version:2},deleteKey);
  await db.exec(`set request.jwt.claim.sub='${other}'`);assert.equal((await rpc('crm_time_history')).items.length,0);assert.equal((await rpc('crm_time_detail',{p_id:id})).item,null);await assert.rejects(command('resume',{id,version:4}),/not found/);
  await db.exec(`set request.jwt.claim.sub='${owner}'`);
  const custom=await command('start',{kind:'custom_activity',activity_name:'Learning Houdini'});await advance(custom.id,5);await command('pause',{id:custom.id,version:1});await command('finish',{id:custom.id,version:2});assert.equal((await rpc('crm_time_detail',{p_id:custom.id})).item.earned_cents,null);
  await db.exec(`reset role;delete from public.presentation_admins where user_id='${owner}';set role authenticated;`);await assert.rejects(command('start',{kind:'custom_activity',activity_name:'Denied'}),/Owner access/);assert.equal((await rpc('crm_time_history')).items.length,0);
  await db.exec('reset role;set role anon');await assert.rejects(rpc('crm_time_open'),/permission denied/);await assert.rejects(command('start',{kind:'custom_activity',activity_name:'Denied'}),/permission denied/);
 }finally{await db.close();}
});

test('SQL reports include midnight and IANA daylight-saving boundaries',async()=>{
 const {db,rpc}=await timeDatabase();try{
  const id=randomUUID();await db.exec(`reset role;insert into public.crm_time_sessions(id,owner_id,kind,activity_name,status,started_at,ended_at) values('${id}','${owner}','custom_activity','Overnight','finished','2026-03-28 22:30Z','2026-03-29 02:30Z');insert into public.crm_time_segments(session_id,owner_id,started_at,ended_at) values('${id}','${owner}','2026-03-28 22:30Z','2026-03-29 02:30Z');set role authenticated;`);
  for(const day of ['2026-03-28','2026-03-29'])assert.equal((await rpc('crm_time_history',{p_from:day,p_to:day,p_zone:'Europe/Bratislava'})).items.length,1);
  assert.equal((await rpc('crm_time_history',{p_from:'2026-03-30',p_to:'2026-03-30',p_zone:'Europe/Bratislava'})).items.length,0);
  assert.equal((await rpc('crm_time_detail',{p_id:id})).item.duration_seconds,14400);
  await db.exec(`reset role;update public.crm_time_sessions set started_at=(date_trunc('day',now() at time zone 'Europe/Bratislava') at time zone 'Europe/Bratislava')-interval '1 hour',ended_at=now() where id='${id}';update public.crm_time_segments set started_at=(select started_at from public.crm_time_sessions where id='${id}'),ended_at=least((date_trunc('day',now() at time zone 'Europe/Bratislava') at time zone 'Europe/Bratislava')+interval '1 hour',date_trunc('second',now())) where session_id='${id}';set role authenticated;`);
  const summary=await rpc('crm_time_summary',{p_zone:'Europe/Bratislava'});assert.ok(summary.today>0&&summary.today<=3600);assert.ok(summary.week>=summary.today);
 }finally{await db.close();}
});

test('time API validates inputs, ignores forged money/owner, and uses owner JWT',async()=>{
 const calls=[];const run=(action,body={},params={})=>handleCrm({action,body,url:new URL('https://test/?'+new URLSearchParams(params)),user:{id:owner},token:'user-jwt',call:async(path,options)=>{calls.push({path,options});return {};}});
 await run('crm-time-manual-save',{companyId:company,projectId:project,requestId:randomUUID(),work_date:'2026-10-07',hours:'2,5',rate_cents:1,owner_id:other});const args=calls.at(-1).options;assert.equal(args.token,'user-jwt');assert.equal(args.body.p_data.duration_seconds,9000);assert.equal(args.body.p_data.rate_cents,undefined);assert.equal(args.body.p_data.owner_id,undefined);
 for(const hours of ['0','-1','25'])await assert.rejects(run('crm-time-manual-save',{companyId:company,projectId:project,requestId:randomUUID(),work_date:'2026-10-07',hours}),{status:400});
 await assert.rejects(run('crm-time-start',{kind:'project',companyId:company,projectId:'bad',requestId:randomUUID()}),{status:400});
 await assert.rejects(run('crm-time-summary',{}, {timeZone:'fake/zone'}),{status:400});await assert.rejects(run('crm-time-history',{}, {from:'2026-02-30'}),{status:400});
});
