import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleResearchRefresh} from '../src/research/refresh.js';
import {candidateProposal,mergeResearchRefresh,researchRefreshGroups,validateResearchRefreshProposal} from '../src/research/refresh-domain.js';
import {validateResearchCandidate} from '../src/research/validation.js';
import {MAX_RESEARCH_BYTES,RESEARCH_CANDIDATE_SCHEMA} from '../src/research/schema.js';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const operationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const signingKey = 'test-only-refresh-key';
const source = {url:'https://furniture.example/',title:'Company',source_type:'Company Website',retrieved_at:'2025-01-01T12:00:00.000Z'};
const newSource = {url:'https://furniture.example/about',title:'About the company',source_type:'About Page',retrieved_at:'2025-02-01T12:00:00.000Z'};
const evidence = {status:'VERIFIED',confidence:'HIGH',evidence:'Headquarters are listed on the company website.',source_urls:[source.url]};
const full = overrides => candidateProposal(validateResearchCandidate({company_name:'Example Furniture',website:source.url,country:'CZ',city:'Prague',business_type:'Manufacturer',fit:'HIGH',fit_reason:'A relevant catalog.',sources:[source],field_provenance:{city:evidence},last_researched_at:'2025-01-01T12:00:00.000Z',...overrides}).candidate);
const stored = overrides => ({...full(),id,version:1,research_status:'NEEDS_REVIEW',manual_fields:[],...overrides});
const envelope = (candidate = full({research_summary:'Freshly checked product catalog.'}),extra = {}) => ({schema_version:1,candidate_id:id,base_version:1,mode:'deeper',candidate,...extra});
const isStatus = status => error => error.status === status;

function harness({candidate = stored(),response} = {}) {
  const state = {candidate},calls = [];
  const call = async(path,options) => {
    calls.push({path,options});
    if (path.startsWith('/rest/v1/crm_research_candidates?')) return state.candidate ? [state.candidate] : [];
    if (path.endsWith('/crm_research_refresh')) return response ?? {candidate_id:id,version:2};
    throw new Error(`Unexpected call: ${path}`);
  };
  const run = (action,body,overrides = {}) => handleResearchRefresh({action,body,url:new URL(`https://shapeviz.example/api/admin?action=${action}`),user:{id:owner},token:'verified-owner-jwt',signingKey,call,...overrides});
  const preview = (proposal = envelope(),extra = {},overrides = {}) => run('crm-research-refresh-preview',{id,version:1,proposal,...extra},overrides);
  const commit = (review,proposal = envelope(),extra = {},overrides = {}) => run('crm-research-refresh-commit',{id,version:1,operationId,proposal,selectedFields:['research_summary'],overwriteManualFields:[],reviewToken:review.reviewToken,confirm:'apply',...extra},overrides);
  const prompt = (query = 'id='+id+'&mode=deeper&version=1',overrides = {}) => run('crm-research-refresh-prompt',undefined,{url:new URL(`https://shapeviz.example/api/admin?action=crm-research-refresh-prompt&${query}`),...overrides});
  return {state,calls,run,preview,commit,prompt};
}

function resign(token,transform) {
  const payload = JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString('utf8'));
  const encoded = Buffer.from(JSON.stringify(transform(payload))).toString('base64url');
  return `${encoded}.${createHmac('sha256',signingKey).update(encoded).digest('base64url')}`;
}

test('Refresh envelope requires exact identity, version, mode and every canonical field without server metadata',() => {
  const valid = envelope();
  assert.deepEqual(validateResearchRefreshProposal(valid,id,1).proposal,valid);
  const missing = structuredClone(valid);
  delete missing.candidate.sources;
  for (const proposal of [null,JSON.stringify(valid),[],{...valid,schema_version:2},{...valid,candidate_id:otherOwner},{...valid,base_version:2},{...valid,mode:'automatic'},missing,{...valid,owner_id:otherOwner},{...valid,candidate:{...valid.candidate,research_status:'APPROVED'}},{...valid,candidate:{...valid.candidate,normalized_domain:'other.example'}}]) assert.throws(() => validateResearchRefreshProposal(proposal,id,1),isStatus(400));
  assert.throws(() => validateResearchRefreshProposal({...valid,padding:'x'.repeat(MAX_RESEARCH_BYTES)},id,1),isStatus(413));
});

test('Refresh preview groups facts with provenance, Fit with reason, and whole arrays while preserving origin',async () => {
  const proposal = envelope(full({city:'Brno',fit:'MEDIUM',fit_reason:'Focused initial scope.',research_summary:'New summary.',potential_services:[{service:'Lifestyle CGI',relevance:'HIGH',reason:'Reusable interiors.'}],field_provenance:{city:{...evidence,evidence:'Current headquarters are in Brno.'}}}));
  const h = harness(),preview = await h.preview(proposal);
  assert.deepEqual(preview.groups.map(group => group.key),['city','research_summary','potential_services','fit']);
  const city = preview.groups.find(group => group.key === 'city');
  assert.deepEqual(city.fields,['city','field_provenance.city']);
  assert.equal(city.before.value,'Prague');
  assert.equal(city.after.value,'Brno');
  assert.equal(city.after.provenance.evidence,'Current headquarters are in Brno.');
  assert.equal(city.manual,false);
  assert.deepEqual(preview.groups.find(group => group.key === 'fit').fields,['fit','fit_reason']);
  assert.equal(preview.mode,'deeper');
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].options.token,'verified-owner-jwt');
  assert.ok(h.calls[0].path.includes(`id=eq.${id}&owner_id=eq.${owner}`));
  await assert.rejects(h.preview(envelope(full({source_origin:'CHATGPT'}))),isStatus(400));
});

test('Manual groups include exact fact markers, granular provenance, coarse provenance, Fit reason and source additions',() => {
  const incoming = full({city:'Brno',business_type:'Brand',fit_reason:'New explanation.',sources:[source,newSource]});
  for (const manual_fields of [['city','fit_reason','sources'],['field_provenance.city','fit_reason','sources'],['field_provenance','fit_reason','sources']]) {
    const groups = researchRefreshGroups(stored({manual_fields}),incoming).groups;
    for (const key of ['city','fit','sources']) assert.equal(groups.find(group => group.key === key).manual,true);
    assert.equal(groups.find(group => group.key === 'business_type').manual,manual_fields.includes('field_provenance'));
  }
});

test('Selecting one change leaves unchecked data and all manual markers intact and uses a service-only RPC',async () => {
  const candidate = stored({manual_fields:['fit','fit_reason']}),h = harness({candidate});
  const proposal = envelope(full({fit:'LOW',fit_reason:'AI proposal only.',research_summary:'New checked summary.'}));
  const preview = await h.preview(proposal);
  const result = await h.commit(preview,proposal);
  assert.equal(result.candidate_id,id);
  const {path,options} = h.calls.at(-1);
  assert.equal(path,'/rest/v1/rpc/crm_research_refresh');
  assert.equal(Object.hasOwn(options,'token'),false);
  assert.equal(options.body.p_owner,owner);
  assert.equal(options.body.p_operation,operationId);
  assert.equal(options.body.p_mode,'deeper');
  assert.deepEqual(options.body.p_selected,['research_summary']);
  assert.deepEqual(options.body.p_overrides,[]);
  assert.equal(options.body.p_candidate.research_summary,'New checked summary.');
  assert.equal(options.body.p_candidate.fit,'HIGH');
  assert.equal(options.body.p_candidate.fit_reason,'A relevant catalog.');
  assert.equal(options.body.p_candidate.normalized_domain,'furniture.example');
  for (const key of ['manual_fields','owner_id','normalized_company_name','research_status','id']) assert.equal(Object.hasOwn(options.body.p_candidate,key),false);
  assert.deepEqual(candidate.manual_fields,['fit','fit_reason']);
});

test('Protected selected groups require exactly the explicit overrides, not blanket or unselected permission',async () => {
  const h = harness({candidate:stored({manual_fields:['fit_reason']})}),proposal = envelope(full({fit:'MEDIUM',fit_reason:'New public evidence.',research_summary:'Updated summary.'})),preview = await h.preview(proposal);
  await assert.rejects(h.commit(preview,proposal,{selectedFields:['fit']}),isStatus(409));
  await assert.rejects(h.commit(preview,proposal,{overwriteManualFields:['fit']}),isStatus(400));
  await assert.rejects(h.commit(preview,proposal,{overwriteManualFields:['research_summary']}),isStatus(400));
  await h.commit(preview,proposal,{selectedFields:['fit'],overwriteManualFields:['fit']});
  assert.equal(h.calls.at(-1).options.body.p_candidate.fit,'MEDIUM');
  assert.equal(h.calls.at(-1).options.body.p_candidate.fit_reason,'New public evidence.');
});

test('Sources are additive and same-URL metadata is retained with a visible warning, including omitted history',() => {
  const existing = stored(),incoming = full({sources:[{...source,title:'Rewritten historical title'},newSource]});
  const result = researchRefreshGroups(existing,incoming);
  const sourceGroup = result.groups.find(group => group.key === 'sources');
  assert.equal(sourceGroup.after.length,2);
  assert.deepEqual(sourceGroup.after[0],existing.sources[0]);
  assert.equal(sourceGroup.after[1].url,newSource.url);
  assert.ok(result.warnings.some(warning => warning.code === 'source_metadata_preserved'));
  const metadataOnly = full({sources:[{...source,title:'Attempted rewrite'}]});
  assert.deepEqual(researchRefreshGroups(existing,metadataOnly).groups,[]);
  const omitted = full({sources:[newSource],field_provenance:{}});
  const merged = mergeResearchRefresh(existing,omitted,['sources'],[]).candidate;
  assert.deepEqual(merged.sources[0],existing.sources[0]);
  assert.equal(merged.sources[1].url,newSource.url);
  assert.deepEqual(merged.field_provenance.city,existing.field_provenance.city);
});

test('Selected evidence needs its new source group and the value/provenance pair is applied together',async () => {
  const proposal = envelope(full({city:'Brno',sources:[source,newSource],field_provenance:{city:{...evidence,evidence:'About page lists the new headquarters.',source_urls:[newSource.url]}}}));
  const h = harness(),preview = await h.preview(proposal);
  await assert.rejects(h.commit(preview,proposal,{selectedFields:['city']}),error => error.status === 400 && /Also select Add research sources/.test(error.message));
  await h.commit(preview,proposal,{selectedFields:['city','sources']});
  const record = h.calls.at(-1).options.body.p_candidate;
  assert.equal(record.city,'Brno');
  assert.deepEqual(record.field_provenance.city.source_urls,[newSource.url]);
  assert.equal(record.sources.length,2);
  assert.deepEqual(record.sources[0],full().sources[0]);
});

test('Source history cannot overflow the shared 50-source limit during an additive update',() => {
  const sources = [source,...Array.from({length:49},(_,i) => ({url:`https://furniture.example/source-${i}`}))];
  const existing = stored(full({sources})),incoming = full({sources:[source,newSource]});
  assert.throws(() => researchRefreshGroups(existing,incoming),error => error.status === 400 && error.issues.some(issue => issue.path === 'candidate.sources' && issue.code === 'array_size'));
});

test('No change is automatically selected, and no-op, repeated, unknown or unreviewed selections cannot commit',async () => {
  const h = harness(),proposal = envelope(full()),preview = await h.preview(proposal);
  assert.deepEqual(preview.groups,[]);
  await assert.rejects(h.commit(preview,proposal,{selectedFields:[]}),isStatus(400));
  await assert.rejects(h.commit(preview,proposal),isStatus(400));
  const changed = await h.preview();
  for (const selectedFields of [[],['research_summary','research_summary'],['source_origin'],['field_provenance'],['owner_id'],['city'],'research_summary']) await assert.rejects(h.commit(changed,envelope(),{selectedFields}),isStatus(400));
  assert.equal(h.calls.some(call => call.path.endsWith('/crm_research_refresh')),false);
});

test('Research timestamps remain user-reviewed, cannot regress or advance into the future, and are never fabricated',() => {
  const existing = stored(),now = Date.parse('2025-02-01T12:00:00.000Z');
  for (const last_researched_at of [null,'2024-12-31T12:00:00.000Z','2025-02-01T12:06:00.000Z']) assert.throws(() => researchRefreshGroups(existing,full({last_researched_at}),now),isStatus(400));
  const next = full({last_researched_at:'2025-02-01T12:00:00.000Z',research_summary:'Refreshed.'});
  const unselected = mergeResearchRefresh(existing,next,['research_summary'],[],now).candidate;
  assert.equal(unselected.last_researched_at,existing.last_researched_at);
  assert.equal(mergeResearchRefresh(existing,next,['last_researched_at'],[],now).candidate.last_researched_at,next.last_researched_at);
  const historical = stored(full({last_researched_at:'2099-01-01T12:00:00.000Z'}));
  assert.equal(researchRefreshGroups(historical,{...candidateProposal(historical),research_summary:'Other update.'},now).groups.length,1);
});

test('Refresh tokens bind normalized proposal, owner, candidate, version, mode, purpose, server secret and expiry',async () => {
  const h = harness(),proposal = envelope(),preview = await h.preview(proposal);
  await assert.rejects(h.commit(preview,proposal,{}, {user:{id:otherOwner}}),isStatus(400));
  await assert.rejects(h.commit(preview,{...proposal,mode:'refresh'}),isStatus(400));
  await assert.rejects(h.commit(preview,envelope(full({research_summary:'Another proposal.'}))),isStatus(400));
  await assert.rejects(h.commit(preview,{...proposal,candidate_id:otherOwner},{id:otherOwner}),isStatus(400));
  await assert.rejects(h.commit(preview,{...proposal,base_version:2},{version:2}),isStatus(400));
  await assert.rejects(h.commit(preview,proposal,{}, {signingKey:'different-secret'}),isStatus(400));
  await assert.rejects(h.commit(preview,proposal,{reviewToken:resign(preview.reviewToken,p => ({...p,purpose:'research-approval'}))}),isStatus(400));
  await assert.rejects(h.commit(preview,proposal,{reviewToken:resign(preview.reviewToken,p => ({...p,expiresAt:Date.now()-1}))}),isStatus(409));
  const [payload,signature] = preview.reviewToken.split('.');
  await assert.rejects(h.commit(preview,proposal,{reviewToken:`${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`}),isStatus(400));
  await assert.rejects(h.commit(preview,proposal,{reviewToken:'x'.repeat(10_001)}),isStatus(400));
  assert.equal(h.calls.length,1);
});

test('Refresh retry hash survives normalized JSON and selection ordering, token renewal and a newer closed candidate',async () => {
  const h = harness({candidate:stored({manual_fields:['city']})});
  const proposal = envelope(full({city:'Brno',research_summary:'Refreshed summary.'})),preview = await h.preview(proposal);
  const choices = {selectedFields:['research_summary','city'],overwriteManualFields:['city']};
  await h.commit(preview,proposal,choices);
  const first = h.calls.at(-1).options.body;
  h.state.candidate = stored({...first.p_candidate,version:2,research_status:'APPROVED',manual_fields:['city']});
  const reordered = {...proposal,candidate:Object.fromEntries(Object.entries(proposal.candidate).reverse())};
  reordered.candidate.research_summary = '  Refreshed summary.  ';
  const renewed = {...preview,reviewToken:resign(preview.reviewToken,p => ({...p,expiresAt:p.expiresAt+1000}))};
  await h.commit(renewed,reordered,{...choices,selectedFields:['city','research_summary']});
  const retried = h.calls.at(-1).options.body;
  assert.equal(retried.p_candidate,null);
  assert.equal(retried.p_hash,first.p_hash);
  assert.deepEqual(retried.p_selected,['city','research_summary']);
  await h.commit(renewed,proposal,{selectedFields:['research_summary'],overwriteManualFields:[]});
  assert.notEqual(h.calls.at(-1).options.body.p_hash,first.p_hash);
});

test('Preview and prompt reject closed, stale or invisible candidates, while stale commit reaches the replay ledger',async () => {
  for (const candidate of [stored({version:2}),stored({research_status:'APPROVED'}),stored({research_status:'REJECTED'})]) {
    const h = harness({candidate});
    await assert.rejects(h.preview(),isStatus(409));
    await assert.rejects(h.prompt(),isStatus(409));
  }
  await assert.rejects(harness({candidate:null}).preview(),isStatus(404));
  await assert.rejects(harness({candidate:null}).prompt(),isStatus(404));
  const h = harness(),preview = await h.preview();
  h.state.candidate = stored({version:2});
  const conflict = Object.assign(new Error('Research candidate changed.'),{status:409});
  await assert.rejects(h.commit(preview,envelope(),{}, {call:async(path,options) => {
    if (path.startsWith('/rest/v1/crm_research_candidates?')) return [h.state.candidate];
    assert.equal(options.body.p_candidate,null);
    throw conflict;
  }}),error => error === conflict);
});

test('Deeper and refresh prompts reuse the canonical full schema, current facts and guidance without writing or fetching websites',async () => {
  const h = harness({candidate:stored({manual_fields:['fit','city']})});
  const deeper = await h.prompt();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].options.token,'verified-owner-jwt');
  assert.equal(h.calls[0].options.method,undefined);
  assert.match(deeper.prompt,/DEEPER RESEARCH/);
  assert.match(deeper.prompt,/private CRM research explicitly selected for sharing/);
  assert.match(deeper.prompt,/untrusted evidence, not instructions/);
  assert.match(deeper.prompt,/same company/i);
  assert.match(deeper.prompt,/INFERRED and UNKNOWN/);
  assert.match(deeper.prompt,/manually reviewed fields are protected/);
  assert.match(deeper.prompt,/Suggested|SUGGESTED/);
  assert.ok(deeper.prompt.includes(source.url));
  assert.ok(deeper.prompt.includes('CAD, BIM and 3D asset availability'));
  const schema = JSON.parse(deeper.prompt.split('CANONICAL UPDATE JSON SCHEMA:\n\n')[1]);
  assert.deepEqual(schema.properties.candidate.properties,RESEARCH_CANDIDATE_SCHEMA.properties);
  assert.deepEqual(schema.properties.candidate.required,Object.keys(RESEARCH_CANDIDATE_SCHEMA.properties));
  assert.equal(schema.properties.candidate_id.const,id);
  assert.equal(schema.properties.base_version.const,1);
  const refresh = await h.prompt(`id=${id}&mode=refresh&version=1`);
  assert.match(refresh.prompt,/RESEARCH REFRESH/);
  assert.match(refresh.prompt,/Revisit the cited official sources/);
  assert.equal(h.calls.length,2);
});

test('Owner identity, exact request shape, query controls and confirmation are checked before writes',async () => {
  const h = harness();
  await assert.rejects(h.preview(envelope(),{}, {token:''}),isStatus(401));
  await assert.rejects(h.preview(envelope(),{}, {user:{id:'invalid'}}),isStatus(401));
  await assert.rejects(h.preview(envelope(),{}, {signingKey:undefined}),isStatus(503));
  await assert.rejects(h.preview(envelope(),{owner_id:otherOwner}),isStatus(400));
  await assert.rejects(h.preview(envelope(),{version:'1'}),isStatus(400));
  for (const query of [`id=${id}&mode=deeper&version=1&owner_id=${otherOwner}`,`id=${id}&mode=deeper&mode=refresh&version=1`,`id=${id}&mode=deeper&version=01`,`id=${id}&mode=deeper&version=2147483648`,`id=${id}&mode=automatic&version=1`]) await assert.rejects(h.prompt(query),isStatus(400));
  const preview = await h.preview();
  for (const extra of [{confirm:'approve'},{operationId:'invalid'},{owner_id:otherOwner},{selectedFields:['source_origin']}]) await assert.rejects(h.commit(preview,envelope(),extra),isStatus(400));
  assert.equal(h.calls.some(call => call.path.endsWith('/crm_research_refresh')),false);
});

test('Canonical evidence and Fit rules remain mandatory in refresh proposals',async () => {
  const h = harness(),base = envelope();
  for (const change of [
    {fit:'HIGH',fit_reason:''},
    {potential_services:[{service:'Invented service',relevance:'HIGH'}]},
    {field_provenance:{city:{...evidence,source_urls:['https://missing.example/']}}},
    {positioning:{value:'Premium',status:'UNKNOWN'}},
    {opportunity_signals:[{signal:'NO_3D_DOWNLOADS_FOUND',confidence:'HIGH',evidence:''}]},
  ]) await assert.rejects(h.preview({...base,candidate:{...base.candidate,...change}}),isStatus(400));
  assert.equal(h.calls.length,0);
});
