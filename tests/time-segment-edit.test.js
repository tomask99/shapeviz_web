import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {timeDatabase,owner,other,company,project} from './helpers/time-database.js';
import {handleTime} from '../src/crm/time-tracker.js';
import {segmentInstant,segmentLocalTime} from '../public/admin/time-segment-detail.js';

test('editing segments persists descriptions and exact time, refreshes totals and rejects unsafe writes',async()=>{
 const {db,rpc}=await timeDatabase(),command=(action,data,key=randomUUID())=>rpc('crm_time_command',{p_action:action,p_data:data,p_request:key});
 try{
  const {id}=await command('start',{kind:'project',company_id:company,project_id:project,description:'Original work'});
  await db.exec(`reset role;update public.crm_time_sessions set started_at='2026-01-01T10:00Z',ended_at='2026-01-01T12:00Z',status='finished' where id='${id}';update public.crm_time_segments set started_at='2026-01-01T10:00Z',ended_at='2026-01-01T11:00Z' where session_id='${id}';insert into public.crm_time_segments(session_id,owner_id,started_at,ended_at) values('${id}','${owner}','2026-01-01T11:30Z','2026-01-01T12:00Z');set role authenticated;`);
  const original=await rpc('crm_time_detail',{p_id:id});assert.equal(original.segments[0].description,'Original work');
  const input={id,segment_id:original.segments[0].id,version:1,started_at:'2026-01-01T09:30:00Z',ended_at:'2026-01-01T11:00:01Z',description:'Revised work'},key=randomUUID();
  await command('segment_save',input,key);assert.equal((await command('segment_save',input,key)).replayed,true);
  const detail=await rpc('crm_time_detail',{p_id:id});assert.equal(detail.item.version,2);assert.equal(detail.item.duration_seconds,7201);assert.equal(detail.item.earned_cents,'12002');assert.equal(detail.segments[0].description,'Revised work');assert.equal(detail.segments[1].description,'Original work');assert.match(detail.item.description,/Revised work/);assert.match(detail.item.description,/Original work/);
  assert.equal(Date.parse(detail.item.started_at),Date.parse(input.started_at));
  assert.equal((await rpc('crm_project_time',{p_project:project,p_company:company})).tracked_seconds,7201);
  assert.equal((await rpc('crm_time_history',{p_from:'2026-01-01',p_to:'2026-01-01'})).items[0].duration_seconds,7201);
  await assert.rejects(command('segment_save',input),/Session changed/);
  await assert.rejects(command('segment_save',{...input,version:2,ended_at:'2026-01-01T11:30:01Z'}),/overlaps/);
  await assert.rejects(command('segment_save',{...input,version:2,ended_at:input.started_at}),/valid times/);
  await assert.rejects(command('segment_save',{...input,version:2,ended_at:'2099-01-01T12:00:00Z'}),/valid times/);
  await assert.rejects(command('segment_save',{...input,version:2,segment_id:randomUUID()}),/Segment not found/);
  await assert.rejects(command('segment_save',{...input,version:2,description:'x'.repeat(5001)}),/check constraint/);
  await db.exec(`set request.jwt.claim.sub='${other}'`);
  assert.equal((await rpc('crm_time_detail',{p_id:id})).segments.length,0);
  await assert.rejects(command('segment_save',{...input,version:2}),/Session not found/);
  await db.exec(`set request.jwt.claim.sub='${owner}'`);
  await command('segment_save',{...input,version:2,segment_id:detail.segments[1].id,started_at:'2026-01-01T11:30:00Z',ended_at:'2026-01-01T13:00:00Z',description:''});
  assert.equal(Date.parse((await rpc('crm_time_detail',{p_id:id})).item.ended_at),Date.parse('2026-01-01T13:00Z'));
  const open=await command('start',{kind:'custom_activity',activity_name:'Study'}),running=await rpc('crm_time_detail',{p_id:open.id});
  await assert.rejects(command('segment_save',{...input,id:open.id,segment_id:running.segments[0].id,version:1}),/Pause or finish/);
  await db.exec(`reset role;update public.crm_time_sessions set started_at=started_at-interval '1 hour' where id='${open.id}';update public.crm_time_segments set started_at=started_at-interval '1 hour' where session_id='${open.id}';set role authenticated;`);
  await command('pause',{id:open.id,version:1});const paused=await rpc('crm_time_detail',{p_id:open.id});
  await command('segment_save',{...input,id:open.id,segment_id:paused.segments[0].id,version:2});
  assert.equal((await rpc('crm_time_open')).item.status,'paused');
  await command('resume',{id:open.id,version:3});assert.equal((await rpc('crm_time_open')).item.status,'running');
 }finally{await db.close();}
});

test('segment API validates timestamps, version and IDs and forwards only editable fields',async()=>{
 const input={id:project,segmentId:company,version:1,requestId:randomUUID(),started_at:'2026-01-01T10:00:00Z',ended_at:'2026-01-01T11:00:01Z',description:'Work',owner_id:other,rate_cents:1};
 const run=body=>handleTime({action:'crm-time-segment-save',body,request:async(path,options)=>options.body});
 const result=await run(input);assert.equal(result.p_action,'segment_save');assert.equal(result.p_data.owner_id,undefined);assert.equal(result.p_data.rate_cents,undefined);assert.equal(result.p_data.segment_id,company);
 for(const patch of [{version:0},{segmentId:'bad'},{started_at:'2026-02-30T10:00:00Z'},{started_at:'2026-01-01T10:00:00'},{ended_at:input.started_at},{ended_at:'2026-01-01T11:00:01.100Z'}])await assert.rejects(run({...input,...patch}),e=>e.status===400);
 const original='2026-10-25T01:30:01Z';assert.equal(segmentInstant(segmentLocalTime(original),original),new Date(original).toISOString());
});
