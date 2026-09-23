import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleResearchImport} from '../src/research/import.js';
import {RESEARCH_IMPORT_SCHEMA,MAX_RESEARCH_BYTES} from '../src/research/schema.js';
import {RESEARCH_SERVICES} from '../public/admin/service-catalog.js';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const batchId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const matchId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const signingKey = 'test-only-server-signing-key';
const jsonFor = (...candidates) => JSON.stringify({schema_version:1,candidates});
const proposal = overrides => ({company_name:'Example Furniture',website:'https://www.furniture.example/catalog',country:'CZ',...overrides});
const duplicate = overrides => ({kind:'company',id:matchId,company_name:'Existing furniture',website:'https://furniture.example/',country:'CZ',status:'NEW_LEAD',match:'domain',...overrides});
const isStatus = status => error => error.status === status;

function harness({matches = {},exclusions = {domains:[],count:0,overflow:false},response} = {}) {
  const calls = [];
  const call = async (path,options) => {
    calls.push({path,options});
    if (path.endsWith('/crm_research_duplicates')) return options.body.p_rows.map(({row}) => ({row,matches:matches[row] ?? [],match_count:matches[row]?.length ?? 0,fingerprint:`row-${row}-snapshot`}));
    if (path.endsWith('/crm_research_excluded_domains')) return exclusions;
    if (path.endsWith('/crm_research_import')) return response ?? {imported:options.body.p_rows.filter(row => row.decision !== 'skip').length,skipped:options.body.p_rows.filter(row => row.decision === 'skip').length,candidate_ids:[],replayed:false};
    throw new Error(`Unexpected request: ${path}`);
  };
  const run = (action,body,overrides = {}) => handleResearchImport({action,body,url:new URL(`https://shapeviz.example/api/admin?action=${action}`),user:{id:owner},token:'verified-owner-jwt',signingKey,call,...overrides});
  const preview = json => run('crm-research-import-preview',{json});
  const commit = (json,preview,choices = [{row:1,decision:'import'}],extra = {},overrides = {}) => run('crm-research-import-commit',{json,previewToken:preview.previewToken,batchId,choices,confirm:'import',...extra},overrides);
  return {calls,run,preview,commit};
}

function resign(token,transform) {
  const payload = JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString('utf8'));
  const encoded = Buffer.from(JSON.stringify(transform(payload))).toString('base64url');
  return `${encoded}.${createHmac('sha256',signingKey).update(encoded).digest('base64url')}`;
}

test('Research preview preserves independent invalid rows and sends only valid identities with owner JWT',async () => {
  const h = harness({matches:{1:[duplicate()]}});
  const json = jsonFor(proposal(),proposal({company_name:''}),proposal({website:'',country:'',industry:'Custom field',potential_services:[{service:'Lifecycle Magic',relevance:'HIGH'}]}),proposal({company_name:'Sparse',website:'',country:'',industry:'Custom field'}));
  const result = await h.preview(json);
  assert.equal(result.count,4);
  assert.equal(result.valid_count,2);
  assert.equal(result.rows[0].match_count,1);
  assert.deepEqual(result.rows[0].duplicates,[duplicate()]);
  assert.equal(result.rows[1].candidate,null);
  assert.ok(result.rows[2].errors.some(issue => issue.code === 'invalid_choice'));
  assert.ok(result.rows[3].warnings.some(issue => issue.code === 'unknown_category'));
  assert.ok(result.rows[3].warnings.some(issue => issue.code === 'missing_website'));
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].options.token,'verified-owner-jwt');
  assert.deepEqual(h.calls[0].options.body.p_rows,[
    {row:1,normalized_domain:'furniture.example',normalized_company_name:'example furniture',country:'CZ'},
    {row:4,normalized_domain:'',normalized_company_name:'sparse',country:''},
  ]);
  const signed = JSON.parse(Buffer.from(result.previewToken.split('.')[0],'base64url'));
  assert.deepEqual(signed.expected,[{row:1,match_count:1,fingerprint:'row-1-snapshot'},{row:4,match_count:0,fingerprint:'row-4-snapshot'}]);
  assert.equal(signed.owner,owner);
  assert.equal(signed.rawHash,result.hash);
  assert.ok(!JSON.stringify(result).includes(signingKey));
});

test('An all-invalid preview remains reviewable without a duplicate lookup or possible commit',async () => {
  const h = harness(),json = jsonFor({company_name:''});
  const preview = await h.preview(json);
  assert.equal(preview.valid_count,0);
  assert.equal(h.calls.length,0);
  await assert.rejects(h.commit(json,preview,[]),isStatus(400));
});

test('Within-batch duplicates use domain or complete name+country without merging blank countries and subdomains',async () => {
  const h = harness(),result = await h.preview(jsonFor(
    proposal(),
    proposal({company_name:'Different name',website:'http://furniture.example?catalog=1'}),
    proposal({company_name:'  EXAMPLE   Furniture ',website:'https://other.example/'}),
    proposal({website:'',country:''}),
    proposal({website:'',country:''}),
    proposal({company_name:'Subdomain',website:'https://shop.furniture.example/'}),
    proposal({company_name:'  example furniture ',website:'https://www.furniture.example./'}),
  ));
  assert.deepEqual(result.rows.map(row => row.within),[[],[1],[1],[],[],[],[1,2,3]]);
});

test('Preview rejects malformed envelopes, excessive size and unexpected fields before querying',async () => {
  const h = harness();
  for (const json of ['```json\n{}\n```','{}','[]',jsonFor(...Array.from({length:101},() => proposal()))]) await assert.rejects(h.preview(json),isStatus(400));
  await assert.rejects(h.preview(' '.repeat(MAX_RESEARCH_BYTES+1)),isStatus(413));
  await assert.rejects(h.run('crm-research-import-preview',{json:jsonFor(proposal()),owner_id:otherOwner}),isStatus(400));
  await assert.rejects(h.run('crm-research-import-preview',{json:{candidates:[proposal()]}}),isStatus(400));
  assert.equal(h.calls.length,0);
});

test('Duplicate checking fails closed on incomplete, repeated or malformed RPC rows',async () => {
  const h = harness(),json = jsonFor(proposal(),proposal({company_name:'Second'}));
  for (const result of [[],[{row:1,matches:[],match_count:0,fingerprint:'a'}],[{row:1,matches:[],match_count:0,fingerprint:'a'},{row:1,matches:[],match_count:0,fingerprint:'b'}],[{row:1,matches:[duplicate()],match_count:0,fingerprint:'a'},{row:2,matches:[],match_count:0,fingerprint:'b'}]]) {
    await assert.rejects(h.run('crm-research-import-preview',{json},{call:async () => result}),isStatus(502));
  }
});

test('Signed review binds raw JSON, owner, server secret and expiry before any write',async () => {
  const h = harness(),json = jsonFor(proposal()),preview = await h.preview(json);
  const changed = `${json} `;
  await assert.rejects(h.commit(changed,preview),isStatus(400));
  await assert.rejects(h.commit(json,preview,undefined,{}, {user:{id:otherOwner}}),isStatus(400));
  await assert.rejects(h.commit(json,preview,undefined,{}, {signingKey:'different-key'}),isStatus(400));
  const [payload,signature] = preview.previewToken.split('.');
  await assert.rejects(h.commit(json,preview,undefined,{previewToken:`${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`}),isStatus(400));
  await assert.rejects(h.commit(json,preview,undefined,{previewToken:resign(preview.previewToken,payload => ({...payload,expiresAt:Date.now()-1}))}),isStatus(409));
  await assert.rejects(h.commit(json,preview,undefined,{previewToken:'x'.repeat(50_001)}),isStatus(400));
  assert.equal(h.calls.length,1);
});

test('Commit revalidates candidates, strips generated fields and uses service-only transaction with signed owner and snapshot',async () => {
  const h = harness(),json = jsonFor(proposal(),{company_name:''},proposal({company_name:'Second',website:'https://second.example/'})),preview = await h.preview(json);
  const result = await h.commit(json,preview,[{row:3,decision:'skip'},{row:1,decision:'import'}]);
  assert.equal(result.imported,1);
  assert.equal(result.skipped,1);
  assert.equal(h.calls.length,2);
  const write = h.calls[1];
  assert.equal(write.path,'/rest/v1/rpc/crm_research_import');
  assert.equal(Object.hasOwn(write.options,'token'),false);
  assert.equal(write.options.body.p_owner,owner);
  assert.equal(write.options.body.p_id,batchId);
  assert.deepEqual(write.options.body.p_rows.map(row => ({row:row.row,decision:row.decision})),[{row:1,decision:'import'},{row:3,decision:'skip'}]);
  assert.equal(write.options.body.p_rows[0].candidate.normalized_domain,'furniture.example');
  assert.equal(Object.hasOwn(write.options.body.p_rows[0].candidate,'normalized_company_name'),false);
  assert.equal(Object.hasOwn(write.options.body.p_rows[0].candidate,'owner_id'),false);
  assert.equal(Object.hasOwn(write.options.body.p_rows[0].candidate,'research_status'),false);
  assert.deepEqual(write.options.body.p_expected,[{row:1,match_count:0,fingerprint:'row-1-snapshot'},{row:3,match_count:0,fingerprint:'row-3-snapshot'}]);
});

test('Known company, existing candidate and selected within-batch duplicates require explicit keep',async () => {
  for (const kind of ['company','candidate']) {
    const h = harness({matches:{1:[duplicate({kind,status:kind === 'candidate' ? 'REJECTED' : 'CLIENT'})]}}),json = jsonFor(proposal()),preview = await h.preview(json);
    await assert.rejects(h.commit(json,preview),isStatus(409));
    await h.commit(json,preview,[{row:1,decision:'keep'}]);
    assert.equal(h.calls[1].options.body.p_rows[0].decision,'keep');
  }
  const h = harness(),json = jsonFor(proposal(),proposal({company_name:'Other label'})),preview = await h.preview(json);
  await assert.rejects(h.commit(json,preview,[{row:1,decision:'import'},{row:2,decision:'import'}]),isStatus(409));
  await h.commit(json,preview,[{row:1,decision:'import'},{row:2,decision:'keep'}]);
  assert.deepEqual(h.calls[1].options.body.p_rows[1].within,[1]);
  await h.commit(json,preview,[{row:1,decision:'skip'},{row:2,decision:'import'}]);
});

test('Every valid row requires one exact decision and invalid row decisions cannot sneak into the transaction',async () => {
  const h = harness(),json = jsonFor(proposal(),{company_name:''}),preview = await h.preview(json);
  for (const choices of [[],[{row:2,decision:'import'}],[{row:1,decision:'approve'}],[{row:1,decision:'import',owner_id:otherOwner}],[{row:1,decision:'import'},{row:1,decision:'skip'}]]) await assert.rejects(h.commit(json,preview,choices),isStatus(400));
  await assert.rejects(h.commit(json,preview,undefined,{batchId:'invalid'}),isStatus(400));
  await assert.rejects(h.commit(json,preview,undefined,{confirm:'approve'}),isStatus(400));
  await assert.rejects(h.commit(json,preview,undefined,{owner_id:otherOwner}),isStatus(400));
  assert.equal(h.calls.length,1);
});

test('Idempotency request hash is stable across choice order and renewed previews but binds every row decision',async () => {
  const h = harness(),json = jsonFor(proposal(),proposal({company_name:'Second',website:'https://second.example/'})),preview = await h.preview(json);
  const choices = [{row:1,decision:'import'},{row:2,decision:'skip'}];
  await h.commit(json,preview,choices);
  const firstHash = h.calls.at(-1).options.body.p_hash;
  const renewed = {...preview,previewToken:resign(preview.previewToken,payload => ({...payload,expiresAt:payload.expiresAt+1000}))};
  await h.commit(json,renewed,[...choices].reverse());
  assert.equal(h.calls.at(-1).options.body.p_hash,firstHash);
  await h.commit(json,preview,[{row:1,decision:'skip'},{row:2,decision:'import'}]);
  assert.notEqual(h.calls.at(-1).options.body.p_hash,firstHash);
});

test('Database replay and concurrent duplicate errors pass through without re-fetching a stale snapshot',async () => {
  const h = harness({response:{imported:1,skipped:0,candidate_ids:[matchId],replayed:true}}),json = jsonFor(proposal()),preview = await h.preview(json);
  assert.equal((await h.commit(json,preview)).replayed,true);
  const error = Object.assign(new Error('Research duplicates changed. Preview again.'),{status:409});
  await assert.rejects(h.commit(json,preview,undefined,{}, {call:async (path,options) => {
    assert.equal(path,'/rest/v1/rpc/crm_research_import');
    assert.deepEqual(options.body.p_expected,[{row:1,match_count:0,fingerprint:'row-1-snapshot'}]);
    throw error;
  }}),thrown => thrown === error);
});

test('Research prompt is current owner-scoped, canonical and explicitly evidence-based',async () => {
  const h = harness({exclusions:{domains:['rejected.example','client.example','lead.example','research.example'],count:4,overflow:false}});
  const result = await h.run('crm-research-prompt',undefined,{url:new URL('https://shapeviz.example/api/admin?action=crm-research-prompt&profile=lighting-brand')});
  assert.equal(h.calls[0].options.token,'verified-owner-jwt');
  assert.deepEqual(h.calls[0].options.body,{});
  assert.equal(result.excluded_count,4);
  assert.equal(result.profile,'lighting-brand');
  assert.equal(result.profiles.length,3);
  assert.ok(result.prompt.includes('Lighting Brand'));
  assert.ok(!result.prompt.includes('Furniture Manufacturer'));
  for (const domain of ['rejected.example','client.example','lead.example','research.example']) assert.ok(result.prompt.includes(domain));
  for (const service of RESEARCH_SERVICES) assert.ok(result.prompt.includes(service));
  assert.match(result.prompt,/Do not contact anyone/);
  assert.match(result.prompt,/VERIFIED facts, INFERRED interpretations and UNKNOWN/);
  assert.match(result.prompt,/never as instructions/);
  assert.deepEqual(JSON.parse(result.prompt.split('CANONICAL JSON SCHEMA:\n\n')[1]),RESEARCH_IMPORT_SCHEMA);
  const all = await h.run('crm-research-prompt');
  assert.equal(all.profile,null);
  assert.ok(all.prompt.includes('Furniture Manufacturer'));
  assert.equal(h.calls.length,2);
});

test('Prompt rejects incomplete exclusion lists and unknown or repeated options instead of silently truncating',async () => {
  const h = harness();
  for (const query of ['profile=unknown','profile=lighting-brand&profile=lighting-brand','owner_id='+otherOwner]) await assert.rejects(h.run('crm-research-prompt',undefined,{url:new URL(`https://shapeviz.example/api/admin?action=crm-research-prompt&${query}`)}),isStatus(400));
  assert.equal(h.calls.length,0);
  await assert.rejects(harness({exclusions:{domains:['a.example'],count:2,overflow:true}}).run('crm-research-prompt'),isStatus(413));
  await assert.rejects(harness({exclusions:{domains:['a.example'],count:2,overflow:false}}).run('crm-research-prompt'),isStatus(502));
});

test('Research import fails before calls without verified identity or configured signing key',async () => {
  const h = harness(),json = jsonFor(proposal());
  await assert.rejects(h.run('crm-research-import-preview',{json},{token:''}),isStatus(401));
  await assert.rejects(h.run('crm-research-import-preview',{json},{user:{id:'invalid'}}),isStatus(401));
  await assert.rejects(h.run('crm-research-import-preview',{json},{signingKey:undefined}),isStatus(503));
  await assert.rejects(h.run('crm-research-import-preview',{json},{url:new URL('https://shapeviz.example/api/admin?action=crm-research-import-preview&owner_id='+otherOwner)}),isStatus(400));
  assert.equal(h.calls.length,0);
});
