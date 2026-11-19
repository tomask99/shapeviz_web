import test from 'node:test';
import assert from 'node:assert/strict';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {renderTimeReport,reportTotals,timeReportFilename} from '../src/crm/time-report-pdf.js';
import {handleCrm} from '../src/crm/handler.js';
import {owner,company,project,other} from './helpers/time-database.js';

const report={project:{name:'Žltý projekt / test',hourly_rate_cents:1700},company:{company_name:'THE NEW FACE'},from:'2026-11-01',to:'2026-11-19',timeZone:'Europe/Bratislava',generatedAt:'2026-11-19T09:30:00Z',items:[
 {source:'Tracked',status:'finished',duration_seconds:97955,started_at:'2026-11-16T08:00:00Z',ended_at:'2026-11-18T12:00:00Z',description:'Príprava vizualizácie. Žltá, šťastný, ľavá, čučoriedka.'},
 {source:'Manual',status:'finished',duration_seconds:28800,work_date:'2026-11-18',description:'Manual work'},
 {source:'Tracked',status:'paused',duration_seconds:3600,started_at:'2026-11-19T08:00:00Z',description:'Unfinished work'}
]};

test('report totals use the current rate, round per entry and exclude open timers',()=>{
 assert.deepEqual(reportTotals(report.items,1700),{tracked:97955,manual:28800,earned:59857n,open:3600,openEarned:1700n,completed:2});
 assert.equal(reportTotals([{source:'Manual',status:'finished',duration_seconds:1},{source:'Manual',status:'finished',duration_seconds:1}],1700).earned,0n);
 assert.equal(timeReportFilename(report),'zlty-projekt-test-time-report-2026-11-01-2026-11-19.pdf');
});

test('PDF preserves diacritics, totals and complete long descriptions across pages',async()=>{
 const long='A long description with Slovak text: čučoriedka a ľavá strana. '.repeat(80)+'END OF DESCRIPTION';
 const pdf=await renderTimeReport({...report,items:[...report.items,{...report.items[1],description:long}]});
 const task=getDocument({data:new Uint8Array(pdf),useSystemFonts:false}),document=await task.promise;
 try{
  assert.ok(document.numPages>1);const texts=[];
  for(let i=1;i<=document.numPages;i++){
   const page=await document.getPage(i),items=(await page.getTextContent()).items;
   texts.push(items.map(item=>item.str).join(' '));
   assert.match(texts.at(-1),new RegExp(`Page ${i}`));
   assert.match(texts.at(-1),/SHAPEVIZ/);
   for(const item of items)if(item.str.includes('čučoriedka'))assert.equal(item.height,10,'Body font stays consistent after a page break');
   for(const item of items)if(item.str.trim()){assert.ok(item.transform[4]>=40,`Left overflow: ${item.str}`);assert.ok(item.transform[4]+item.width<=page.view[2]-35,`Right overflow: ${item.str}`);assert.ok(item.transform[5]>=25,`Bottom overflow: ${item.str}`);}
  }
  const text=texts.join(' ');assert.match(text,/Žltý projekt/);assert.match(text,/čučoriedka/);assert.match(text,/END OF DESCRIPTION/);assert.match(text,/Open timers \(excluded from totals\): 01:00:00/);assert.match(text,/€734.57/);
 }finally{await task.destroy();}
});

test('report reads every page under the verified JWT and validates date filters',async()=>{
 const calls=[];
 const run=(params={},overrides={})=>handleCrm({action:'crm-project-time-report',url:new URL('https://test/?'+new URLSearchParams({projectId:project,companyId:company,from:'2026-11-01',to:'2026-11-19',timeZone:'Europe/Bratislava',...params})),user:{id:owner},token:'owner-jwt',call:async(path,options)=>{
  calls.push({path,options});
  if(path.startsWith('/rest/v1/crm_projects'))return [{id:project,name:'Test',hourly_rate_cents:1700}];
  if(path.startsWith('/rest/v1/crm_companies'))return [{id:company,company_name:'Client'}];
  return {items:[{id:String(options.body.p_page),source:'Manual'}],hasMore:options.body.p_page<3};
 },...overrides});
 const result=await run({page:9,kind:'custom_activity'});assert.equal(result.items.length,3);
 assert.ok(calls.every(call=>call.options.token==='owner-jwt'));
 assert.ok(calls.slice(0,2).every(call=>call.path.includes('owner_id=eq.'+owner)));
 for(const call of calls.slice(2)){assert.equal(call.options.body.p_project,project);assert.equal(call.options.body.p_company,company);assert.equal(call.options.body.p_from,'2026-11-01');assert.equal(call.options.body.p_kind,'');}
 await assert.rejects(run({from:'2026-11-20'}),{status:400});
 await assert.rejects(run({from:'2026-02-30'}),{status:400});
 await assert.rejects(run({timeZone:'bad/zone'}),{status:400});
 await assert.rejects(run({projectId:'bad'}),{status:400});
 await assert.rejects(run({companyId:other},{call:async()=>[]}),{status:404});
 await assert.rejects(run({},{token:null}),{status:401});
 await assert.rejects(run({},{call:async path=>path.includes('rpc/')?{items:[{id:'same',source:'Manual'}],hasMore:true}:path.includes('crm_projects')?[report.project]:[report.company]}),{status:409});
});
