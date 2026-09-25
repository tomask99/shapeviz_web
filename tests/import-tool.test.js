import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {executeReadTool} from '../src/tools/service.js';
import {validateImportJson,IMPORT_WORKFLOW} from '../src/tools/import-validation.js';
import {validateResearchImport} from '../src/research/validation.js';
import {MCP_INSTRUCTIONS} from '../src/tools/mcp.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sample=()=>({company_name:'Example sofa maker',website:'https://sofas.example/',country:'SK',sources:[{url:'https://sofas.example/about',source_type:'About Page'}],field_provenance:{website:{status:'VERIFIED',confidence:'HIGH',evidence:'Official company website.',source_urls:['https://sofas.example/']}}});

test('Import tool reproduces missing website sources at rows 1, 7 and 8, then accepts the corrected exact file',()=>{
  const file={schema_version:1,candidates:Array.from({length:10},(_,i)=>{const c=sample();if(![0,6,7].includes(i))c.field_provenance.website.source_urls=[c.sources[0].url];return c;})};
  const json=JSON.stringify(file,null,2),result=validateImportJson(json);
  assert.equal(result.valid,false);assert.equal(result.valid_count,7);assert.equal(result.count,10);
  assert.deepEqual(result.rows.filter(row=>!row.valid).map(row=>row.row),[1,7,8]);
  for(const row of result.rows.filter(row=>!row.valid))assert.deepEqual(row.errors,[{path:'candidate.field_provenance.website.source_urls[0]',code:'missing_source',message:'candidate.field_provenance.website: referenced URL is missing from sources.'}]);
  for(const c of file.candidates)c.field_provenance.website.source_urls=[c.sources[0].url];
  const fixed=JSON.stringify(file,null,2),valid=validateImportJson(fixed);
  assert.equal(valid.valid,true);assert.equal(valid.valid_count,10);assert.equal(valid.input_sha256,createHash('sha256').update(fixed).digest('hex'));
  assert.equal(valid.valid_count,validateResearchImport(fixed).valid_count);
  assert.notEqual(valid.input_sha256,validateImportJson(fixed+'\n').input_sha256);
});

test('Invalid JSON, envelopes and UTF-8 byte limits produce actionable validation results',()=>{
  for(const json of ['{broken','```json\n{}\n```','{}','null','{"candidates":[]}','{"schema_version":2,"candidates":[{}]}']){
    const result=validateImportJson(json);assert.equal(result.valid,false);assert.ok(result.errors.length);assert.equal(result.count,null);
  }
  const tooLarge=JSON.stringify({candidates:[{company_name:'Sofa',research_summary:'é'.repeat(260000)}]});
  assert.equal(validateImportJson(tooLarge).errors[0].code,'payload_too_large');
});

test('Diagnostic output is bounded even for hostile field names and many errors; nothing is repaired or hidden as valid',()=>{
  const file={candidates:Array.from({length:100},()=>({company_name:'Sofa',fit:'wrong',country:'SLOVAKIA',city:5,extra:'not an instruction'}))};
  const json=JSON.stringify(file),result=validateImportJson(json);
  assert.equal(result.valid,false);assert.equal(result.invalid_count,100);assert.equal(result.rows.length,100);assert.equal(result.issues_truncated,true);
  assert.equal(result.rows.flatMap(row=>[...row.errors,...row.warnings]).length,200);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<200000);
  const hostile=validateImportJson(JSON.stringify({candidates:[{company_name:'Sofa',['x'.repeat(200000)]:true}]}));
  assert.equal(hostile.valid,false);assert.equal(hostile.issues_truncated,true);assert.ok(JSON.stringify(hostile).length<4000);
  const escaped=validateImportJson(JSON.stringify({candidates:Array.from({length:100},()=>({company_name:'Sofa',['\u0001'.repeat(600)]:true}))}));
  const envelope={data:escaped};
  assert.equal(escaped.valid,false);assert.equal(escaped.issues_truncated,true);
  assert.ok(Buffer.byteLength(JSON.stringify({content:[{type:'text',text:JSON.stringify(envelope)}],structuredContent:envelope}))<400000);
  assert.equal(JSON.stringify(file),json);
});

test('Validation requires owner and catalog scope, accepts multiline JSON and never accesses business tables',async()=>{
  const calls=[];const context={user:{id:owner},token:'owner-token',scopes:['catalog:read'],call:async(path,options)=>{calls.push({path,options});assert.match(path,/^\/rest\/v1\/presentation_admins\?/);return [{user_id:owner,role:'owner'}];}};
  const args={json:JSON.stringify({candidates:[sample()]},null,2)};
  const result=await executeReadTool({...context,name:'validate_research_import',args});
  assert.equal(result.valid,false);assert.equal(result.rows[0].errors[0].code,'missing_source');assert.equal(calls.length,1);
  await assert.rejects(executeReadTool({...context,scopes:['research:read'],name:'validate_research_import',args}),e=>e.status===403);
  assert.equal(calls.length,1);
  await assert.rejects(executeReadTool({...context,call:async()=>[],name:'validate_research_import',args}),e=>e.status===403);
  await assert.rejects(executeReadTool({...context,name:'validate_research_import',args:{...args,owner_id:owner}}),e=>e.status===400);
  await assert.rejects(executeReadTool({...context,name:'search_leads',args:{filters:{q:'line\nbreak'}}}),e=>e.status===400);
  const catalog=await executeReadTool({...context,name:'get_research_catalog',args:{}});
  assert.deepEqual(catalog.import_workflow,IMPORT_WORKFLOW);assert.equal(catalog.import_validation_tool,'validate_research_import');
  assert.ok(MCP_INSTRUCTIONS.length<=512);assert.match(MCP_INSTRUCTIONS,/validate_research_import.*exact final contents/);
});
