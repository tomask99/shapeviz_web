import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {plannerValues,plannerDate} from '../src/admin/planner.js';
import {monthDays,localDay} from '../public/admin/planner.js';
import {plannerFixture,plannerDatabase,owner,other,regular} from './helpers/planner-fixture.js';
const note=()=>({id:randomUUID(),version:0,kind:'note',title:'Personal note',content:'Some text',color:'sand',checklist:[],planned_date:null,planned_time:null,completed:false});
test('planner validates dates, time, task types and leap-year month boundaries',()=>{
 assert.equal(plannerDate('2028-02-29'),true);assert.equal(plannerDate('2026-02-29'),false);assert.equal(plannerDate('2026-13-01'),false);
 assert.deepEqual(monthDays('2028-02'),{offset:1,last:29});assert.deepEqual(monthDays('2026-03'),{offset:6,last:31});assert.equal(localDay(new Date(2026,0,1,0)), '2026-01-01');
 for(const override of [{priority:4},{priority:-1},{priority:'2'},{priority:1.5},{title:''},{color:'red'},{kind:'event',planned_date:null},{kind:'event',planned_date:'2026-02-30'},{planned_time:'25:00'},{completed:'true'},{checklist:[{id:randomUUID(),text:'x',done:false}]}])assert.throws(()=>plannerValues({...note(),...override}),{status:400});
});
test('planner HTTP persistence, ownership, optimistic concurrency, retry and origin protection',async()=>{
 const f=await plannerFixture();
 const request=(action,body,headers={})=>fetch(f.origin+'/api/admin?action='+action,{method:body?'POST':'GET',headers:{Cookie:'sv_access=test',...(body?{Origin:f.origin,'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await request('planner-list&month=2026-10',null,{Cookie:''})).status,401);
  assert.equal((await request('planner-save',note(),{Origin:'https://wrong.example'})).status,403);
  const data=note();f.loseCreate();assert.equal((await request('planner-save',data)).status,502);
  let response=await request('planner-save',data);assert.equal(response.status,200);let item=(await response.json()).item;assert.equal(item.version,1);
  assert.equal((await f.db.query('select * from workspace_planner')).rows.length,1);
  response=await request('planner-save',{...item,title:'Updated'});assert.equal(response.status,200);const updated=(await response.json()).item;assert.equal(updated.version,2);
  assert.equal((await request('planner-save',{...item,title:'Stale'})).status,409);
  assert.equal((await request('planner-delete',{id:item.id,version:1,confirm:'delete'})).status,409);
  const event={...note(),kind:'event',title:'Tomorrow',planned_date:'2026-11-01',planned_time:'09:00'};assert.equal((await request('planner-save',event)).status,200);
  const october=await (await request('planner-list&month=2026-10')).json();assert.equal(october.board.length,1);assert.equal(october.events.length,0);
  const november=await (await request('planner-list&month=2026-11')).json();assert.equal(november.events.length,1);
  assert.equal((await request('planner-delete',{id:item.id,version:updated.version,confirm:'delete'})).status,200);
  const low={...note(),priority:0},high={...note(),kind:'checklist',content:'Addon development notes',priority:3,checklist:[{id:randomUUID(),text:'Build the UI',done:true}]};
  assert.equal((await request('planner-save',high)).status,200);assert.equal((await request('planner-save',low)).status,200);
  const sorted=await (await request('planner-list&month=2026-10')).json();assert.deepEqual(sorted.board.map(p=>p.priority),[3,0]);assert.equal(sorted.board[0].content,high.content);assert.equal(sorted.board[0].checklist[0].done,true);
  assert.equal((await request('planner-list',{month:'2026-10'})).status,405);
 }finally{await f.close();}
});
test('planner RLS denies other owners, non-admins and anonymous users; protects ownership and validates DB data',async()=>{
 const db=await plannerDatabase(),id=randomUUID();
 try{
  await db.query("insert into workspace_planner(id,owner_id,kind,title) values($1,$2,'note','Private')",[id,owner]);
  await db.exec(`set request.jwt.claim.sub='${other}'`);
  assert.equal((await db.query('select * from workspace_planner')).rows.length,0);
  assert.equal((await db.query("update workspace_planner set title='Stolen' where id=$1 returning id",[id])).rows.length,0);
  assert.equal((await db.query('delete from workspace_planner where id=$1 returning id',[id])).rows.length,0);
  await assert.rejects(db.query("insert into workspace_planner(id,owner_id,kind,title) values($1,$2,'note','Bad')",[randomUUID(),owner]));
  await db.exec(`set request.jwt.claim.sub='${owner}'`);
  await assert.rejects(db.query('update workspace_planner set owner_id=$1 where id=$2',[other,id]));
  await assert.rejects(db.query("insert into workspace_planner(id,owner_id,kind,title) values($1,$2,'event','Missing date')",[randomUUID(),owner]));
  await assert.rejects(db.query("insert into workspace_planner(id,owner_id,kind,title,checklist) values($1,$2,'checklist','Bad',$3)",[randomUUID(),owner,JSON.stringify([{id:randomUUID(),text:'x',done:'true'}])]));
  await db.exec(`set request.jwt.claim.sub='${regular}'`);assert.equal((await db.query('select * from workspace_planner')).rows.length,0);
  await assert.rejects(db.query("insert into workspace_planner(id,owner_id,kind,title) values($1,$2,'note','Bad')",[randomUUID(),regular]));
  await db.exec('set role anon');await assert.rejects(db.query('select * from workspace_planner'));
 }finally{await db.close();}
});
