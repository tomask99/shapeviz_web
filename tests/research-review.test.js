import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleResearchReview} from '../src/research/review.js';
import {researchLeadInput} from '../src/research/mapping.js';
import {validateResearchCandidate} from '../src/research/validation.js';
import {companyInput} from '../src/crm/handler.js';
import {SERVICE_CATALOG} from '../public/admin/service-catalog.js';
import {RESEARCH_CANDIDATE_SCHEMA} from '../src/research/schema.js';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const operationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const companyId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const signingKey = 'test-only-review-signing-key';
const fields = Object.keys(RESEARCH_CANDIDATE_SCHEMA.properties);
const source = {url:'https://furniture.example/',title:'Company',source_type:'Company Website'};
const evidence = {status:'VERIFIED',confidence:'HIGH',evidence:'The company names its home city.',source_urls:[source.url]};
const fullProposal = overrides => {
  const {candidate} = validateResearchCandidate({company_name:'Example Furniture',website:source.url,country:'CZ',city:'Prague',industry:'Furniture',short_description:'Furniture manufacturer.',fit:'HIGH',fit_reason:'Reusable product assets.',sources:[source],field_provenance:{city:evidence},potential_services:[{service:'Product CGI',relevance:'HIGH',reason:'Catalog variants.'}],...overrides});
  return Object.fromEntries(fields.map(field => [field,candidate[field]]));
};
const stored = overrides => ({...fullProposal(),id,version:1,research_status:'NEW',approved_company_id:null,manual_fields:[],...overrides});
const duplicate = overrides => ({kind:'candidate',id:companyId,company_name:'Related candidate',website:source.url,country:'CZ',status:'REJECTED',match:'domain',...overrides});
const isStatus = status => error => error.status === status;

function harness({candidate = stored(),matches = [],matchCount = matches.length,companyMatchCount = matches.filter(item => item.kind === 'company').length,response} = {}) {
  const calls = [];
  const state = {candidate};
  const call = async (path,options) => {
    calls.push({path,options});
    if (path.startsWith('/rest/v1/crm_research_candidates?')) return state.candidate ? [state.candidate] : [];
    if (path.endsWith('/crm_research_review_duplicates')) return {matches,match_count:matchCount,company_match_count:companyMatchCount,fingerprint:'review-snapshot'};
    if (path.endsWith('/crm_research_review')) return response ?? {candidate_id:id,version:2,replayed:false};
    if (path.endsWith('/crm_research_approve')) return response ?? {candidate_id:id,company_id:companyId,version:2,replayed:false};
    throw new Error(`Unexpected request: ${path}`);
  };
  const run = (action,body,overrides = {}) => handleResearchReview({action,body,url:new URL(`https://shapeviz.example/api/admin?action=${action}`),user:{id:owner},token:'owner-jwt',signingKey,validateCompany:companyInput,call,...overrides});
  const preview = (extra = {},overrides = {}) => run('crm-research-approval-preview',{id,version:1,priority:'MEDIUM',services:['Product CGI'],...extra},overrides);
  const approve = (preview,extra = {},overrides = {}) => run('crm-research-approve',{id,version:1,operationId,reviewToken:preview.reviewToken,acknowledgeDuplicates:false,confirm:'approve',...extra},overrides);
  const save = (candidate = fullProposal(),extra = {},overrides = {}) => run('crm-research-save',{id,version:1,operationId,candidate,...extra},overrides);
  return {calls,state,run,preview,approve,save};
}

function resign(token,transform) {
  const payload = JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString('utf8'));
  const encoded = Buffer.from(JSON.stringify(transform(payload))).toString('base64url');
  return `${encoded}.${createHmac('sha256',signingKey).update(encoded).digest('base64url')}`;
}

test('Candidate-to-Lead mapping uses all 14 canonical services and intentional empty CRM defaults',() => {
  const proposal = fullProposal(),before = structuredClone(proposal);
  const result = researchLeadInput(proposal,{services:SERVICE_CATALOG.map(entry => entry.name)},companyInput);
  assert.equal(result.company_name,proposal.company_name);
  assert.equal(result.website,proposal.website);
  assert.equal(result.fit,'HIGH');
  assert.equal(result.priority,'MEDIUM');
  assert.equal(result.lead_source,'AI Research');
  assert.equal(result.pipeline_status,'NEW_LEAD');
  assert.deepEqual(result.services,SERVICE_CATALOG.map(entry => entry.crmValue));
  assert.equal(result.services.length,14);
  assert.equal(result.instagram,'');
  assert.equal(result.linkedin,'');
  assert.equal(result.estimated_value,null);
  assert.equal(result.value_type,'UNKNOWN');
  for (const field of ['owner_id','contacts','research_summary','fit_reason','sources','positioning','research_status']) assert.equal(Object.hasOwn(result,field),false);
  assert.deepEqual(proposal,before);
  assert.deepEqual(researchLeadInput(proposal,{},companyInput).services,['Product CGI']);
  assert.equal(researchLeadInput(fullProposal({fit:null,fit_reason:''}),{priority:'LOW',services:[]},companyInput).fit,null);
});

test('Lead mapping rejects unsupported, repeated or noncanonical services and unsupported priorities',() => {
  for (const services of [['Product CGI','Product CGI'],['product cgi'],['Invented'],null,'Product CGI']) assert.throws(() => researchLeadInput(fullProposal(),{services},companyInput),isStatus(400));
  assert.throws(() => researchLeadInput(fullProposal(),{priority:'URGENT'},companyInput),isStatus(400));
  assert.throws(() => researchLeadInput(fullProposal()),isStatus(503));
});

test('Approval preview reads with owner JWT, maps selected services and signs the reviewed values and duplicate snapshot',async () => {
  const h = harness(),result = await h.preview({priority:'HIGH',services:['Lifestyle CGI','Social Content']});
  assert.equal(h.calls.length,2);
  assert.ok(h.calls[0].path.includes(`id=eq.${id}&owner_id=eq.${owner}`));
  for (const call of h.calls) assert.equal(call.options.token,'owner-jwt');
  assert.deepEqual(h.calls[1].options.body,{p_id:id,p_version:1});
  assert.deepEqual(result.lead.services,['Lifestyle CGI','Social content']);
  assert.equal(result.lead.priority,'HIGH');
  assert.equal(result.can_approve,true);
  assert.deepEqual(result.duplicates,[]);
  const payload = JSON.parse(Buffer.from(result.reviewToken.split('.')[0],'base64url'));
  assert.equal(payload.purpose,'research-approval');
  assert.equal(payload.owner,owner);
  assert.equal(payload.id,id);
  assert.equal(payload.version,1);
  assert.deepEqual(payload.lead,result.lead);
  assert.deepEqual(payload.expected,{match_count:0,company_match_count:0,fingerprint:'review-snapshot'});
  assert.ok(!JSON.stringify(result).includes(signingKey));
});

test('Approval preview refuses stale, closed and missing candidates before duplicate lookup',async () => {
  for (const candidate of [stored({version:2}),stored({research_status:'APPROVED'}),stored({research_status:'REJECTED'})]) {
    const h = harness({candidate});
    await assert.rejects(h.preview(),isStatus(409));
    assert.equal(h.calls.length,1);
  }
  await assert.rejects(harness({candidate:null}).preview(),isStatus(404));
});

test('Approval commits only signed values via the service-only transaction without a stale preflight read',async () => {
  const h = harness({response:{candidate_id:id,company_id:companyId,version:2,replayed:true}}),preview = await h.preview();
  h.state.candidate = stored({version:2,research_status:'APPROVED'});
  const result = await h.approve(preview);
  assert.equal(result.replayed,true);
  assert.equal(h.calls.length,3);
  const {path,options} = h.calls[2];
  assert.equal(path,'/rest/v1/rpc/crm_research_approve');
  assert.equal(Object.hasOwn(options,'token'),false);
  assert.equal(options.body.p_owner,owner);
  assert.equal(options.body.p_operation,operationId);
  assert.deepEqual(options.body.p_lead,preview.lead);
  assert.deepEqual(options.body.p_expected,{match_count:0,fingerprint:'review-snapshot',company_match_count:0});
  assert.equal(options.body.p_acknowledge_duplicates,false);
  assert.match(options.body.p_hash,/^[a-f0-9]{64}$/);
});

test('Signed approval cannot change owner, candidate, version, purpose, key, expiry or content',async () => {
  const h = harness(),preview = await h.preview();
  await assert.rejects(h.approve(preview,{}, {user:{id:otherOwner}}),isStatus(400));
  await assert.rejects(h.approve(preview,{id:companyId}),isStatus(400));
  await assert.rejects(h.approve(preview,{version:2}),isStatus(400));
  await assert.rejects(h.approve(preview,{}, {signingKey:'another-key'}),isStatus(400));
  for (const transform of [p => ({...p,purpose:'research-import'}),p => ({...p,expected:{...p.expected,company_match_count:1}}),p => ({...p,lead:null})]) await assert.rejects(h.approve(preview,{reviewToken:resign(preview.reviewToken,transform)}),isStatus(400));
  await assert.rejects(h.approve(preview,{reviewToken:resign(preview.reviewToken,p => ({...p,expiresAt:Date.now()-1}))}),isStatus(409));
  const [payload,signature] = preview.reviewToken.split('.');
  await assert.rejects(h.approve(preview,{reviewToken:`${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`}),isStatus(400));
  await assert.rejects(h.approve(preview,{reviewToken:'x'.repeat(50_001)}),isStatus(400));
  assert.equal(h.calls.length,2);
});

test('Research duplicates need explicit acknowledgment, while any company duplicate always prevents approval',async () => {
  const research = harness({matches:[duplicate()]}),researchPreview = await research.preview();
  assert.equal(researchPreview.can_approve,true);
  assert.equal(researchPreview.match_count,1);
  await assert.rejects(research.approve(researchPreview),isStatus(409));
  await research.approve(researchPreview,{acknowledgeDuplicates:true});
  assert.equal(research.calls.at(-1).options.body.p_acknowledge_duplicates,true);
  // Company count includes results outside the displayed match cap.
  const company = harness({matches:[duplicate()],matchCount:2,companyMatchCount:1}),companyPreview = await company.preview();
  assert.equal(companyPreview.can_approve,false);
  await assert.rejects(company.approve(companyPreview,{acknowledgeDuplicates:true}),isStatus(409));
  assert.equal(company.calls.length,2);
});

test('Malformed duplicate snapshots fail closed without signing a misleading approval',async () => {
  const h = harness();
  for (const result of [null,{}, {matches:[],match_count:0,company_match_count:0,fingerprint:''},{matches:[duplicate()],match_count:0,company_match_count:0,fingerprint:'x'},{matches:[duplicate({kind:'company'})],match_count:1,company_match_count:0,fingerprint:'x'},{matches:[duplicate(),duplicate()],match_count:2,company_match_count:0,fingerprint:'x'}]) await assert.rejects(h.preview({}, {call:async path => path.startsWith('/rest/v1/crm_research_candidates?') ? [stored()] : result}),isStatus(502));
});

test('Approval idempotency hash binds lead choices and acknowledgment but is independent of renewed token expiry',async () => {
  const h = harness(),preview = await h.preview();
  await h.approve(preview);
  const first = h.calls.at(-1).options.body.p_hash;
  await h.approve({...preview,reviewToken:resign(preview.reviewToken,p => ({...p,expiresAt:p.expiresAt+1000}))});
  assert.equal(h.calls.at(-1).options.body.p_hash,first);
  await h.approve(preview,{acknowledgeDuplicates:true});
  assert.notEqual(h.calls.at(-1).options.body.p_hash,first);
  const changed = await h.preview({priority:'HIGH'});
  await h.approve(changed);
  assert.notEqual(h.calls.at(-1).options.body.p_hash,first);
});

test('Save resets stale fact provenance without inventing facts and strips generated fields before service RPC',async () => {
  const h = harness(),proposal = fullProposal();
  proposal.city = 'Brno';
  const result = await h.save(proposal);
  assert.equal(h.calls[0].options.token,'owner-jwt');
  const write = h.calls[1];
  assert.equal(write.path,'/rest/v1/rpc/crm_research_review');
  assert.equal(Object.hasOwn(write.options,'token'),false);
  assert.equal(write.options.body.p_action,'save');
  assert.equal(write.options.body.p_owner,owner);
  const saved = write.options.body.p_candidate;
  assert.equal(saved.city,'Brno');
  assert.deepEqual(saved.field_provenance.city,{status:'UNKNOWN',confidence:null,evidence:'',source_urls:[]});
  assert.deepEqual(saved.sources,proposal.sources);
  assert.equal(saved.normalized_domain,'furniture.example');
  for (const field of ['normalized_company_name','owner_id','research_status','manual_fields','id','approved_company_id']) assert.equal(Object.hasOwn(saved,field),false);
  assert.ok(result.warnings.some(item => item.code === 'provenance_reset' && item.path.endsWith('.city')));
  assert.deepEqual(proposal.field_provenance.city,evidence);
});

test('Save retains deliberately replaced evidence and unchanged facts, while rejecting fabricated or stale positioning evidence',async () => {
  const h = harness(),proposal = fullProposal();
  proposal.city = 'Brno';
  proposal.field_provenance.city.evidence = 'Updated public page places headquarters in Brno.';
  await h.save(proposal);
  assert.equal(h.calls.at(-1).options.body.p_candidate.field_provenance.city.status,'VERIFIED');
  await h.save(fullProposal({research_summary:'Updated summary.'}));
  assert.deepEqual(h.calls.at(-1).options.body.p_candidate.field_provenance.city,evidence);
  const bad = fullProposal();
  bad.city = 'Brno';
  bad.field_provenance.city.source_urls = ['https://unknown.example/'];
  await assert.rejects(h.save(bad),isStatus(400));
  const positioned = fullProposal({positioning:{value:'Premium',status:'INFERRED',confidence:'MEDIUM',evidence:'Price range on public catalog.',source_urls:[source.url]}});
  const ph = harness({candidate:stored(structuredClone(positioned))});
  positioned.positioning.value = 'Luxury';
  await assert.rejects(ph.save(positioned),isStatus(400));
});

test('Cleared facts can discard stale source evidence and exact retries reach the ledger after the version changes',async () => {
  const h = harness(),proposal = fullProposal();
  proposal.city = '';
  proposal.sources = [];
  await h.save(proposal);
  const firstWrite = h.calls.at(-1).options.body;
  assert.deepEqual(firstWrite.p_candidate.field_provenance.city,{status:'UNKNOWN',confidence:null,evidence:'',source_urls:[]});
  h.state.candidate = stored({...firstWrite.p_candidate,version:2});
  await h.save(proposal);
  assert.equal(h.calls.at(-1).options.body.p_hash,firstWrite.p_hash);
  assert.equal(h.calls.at(-1).options.body.p_candidate,null);
  const reordered = Object.fromEntries(Object.entries(proposal).reverse());
  await h.save(reordered);
  assert.equal(h.calls.at(-1).options.body.p_hash,firstWrite.p_hash);
  await h.save({...proposal,research_summary:'Different requested change'});
  assert.notEqual(h.calls.at(-1).options.body.p_hash,firstWrite.p_hash);
});

test('Save refuses field omissions, metadata injection and malformed evidence rather than clearing protected research',async () => {
  const h = harness();
  const missing = fullProposal();
  delete missing.sources;
  for (const proposal of [missing,{...fullProposal(),owner_id:otherOwner},{...fullProposal(),research_status:'APPROVED'},{...fullProposal(),manual_fields:[]},{...fullProposal(),field_provenance:{city:{...evidence,owner_id:otherOwner}}},{...fullProposal(),field_provenance:[]}]) await assert.rejects(h.save(proposal),isStatus(400));
  assert.equal(h.calls.some(call => call.path.endsWith('/crm_research_review')),false);
});

test('Reject and restore preserve the owner, candidate version and operation identity without rereading before replay',async () => {
  const h = harness();
  await h.run('crm-research-reject',{id,version:1,operationId,reason:'  Outside target market.  '});
  const rejected = h.calls[0];
  assert.equal(rejected.options.body.p_action,'reject');
  assert.equal(rejected.options.body.p_reason,'Outside target market.');
  assert.equal(rejected.options.body.p_candidate,null);
  assert.equal(rejected.options.body.p_owner,owner);
  assert.equal(Object.hasOwn(rejected.options,'token'),false);
  await h.run('crm-research-restore',{id,version:2,operationId});
  assert.equal(h.calls[1].options.body.p_action,'restore');
  assert.equal(h.calls[1].options.body.p_reason,'');
  assert.equal(h.calls[1].options.body.p_candidate,null);
  for (const reason of [null,123,'x'.repeat(3001),'bad\u0000reason']) await assert.rejects(h.run('crm-research-reject',{id,version:1,operationId,reason}),isStatus(400));
});

test('Linked research lookup is explicit, owner-scoped and projects only context needed on the company page',async () => {
  const h = harness({candidate:null});
  const result = await h.run('crm-research-company',undefined,{url:new URL(`https://shapeviz.example/api/admin?action=crm-research-company&companyId=${companyId}`)});
  assert.deepEqual(result,{candidate:null});
  assert.equal(h.calls[0].options.token,'owner-jwt');
  assert.ok(h.calls[0].path.includes(`approved_company_id=eq.${companyId}&owner_id=eq.${owner}`));
  assert.ok(h.calls[0].path.includes('select=id,company_name,fit,fit_reason,research_summary,source_origin,approved_at,manual_fields'));
  assert.ok(!h.calls[0].path.includes('sources'));
  await assert.rejects(h.run('crm-research-company',undefined,{url:new URL('https://shapeviz.example/api/admin?action=crm-research-company&companyId=invalid')}),isStatus(400));
});

test('Every review entry point rejects unsigned identity and unexpected request or URL controls',async () => {
  const h = harness();
  await assert.rejects(h.preview({}, {token:''}),isStatus(401));
  await assert.rejects(h.preview({}, {user:{id:'invalid'}}),isStatus(401));
  await assert.rejects(h.preview({}, {signingKey:undefined}),isStatus(503));
  for (const extra of [{owner_id:otherOwner},{priority:'URGENT'},{version:0},{version:'1'},{services:['Made up']},{id:'invalid'}]) await assert.rejects(h.preview(extra),isStatus(400));
  for (const query of [`owner_id=${otherOwner}`,'action=crm-research-approval-preview']) await assert.rejects(h.preview({}, {url:new URL(`https://shapeviz.example/api/admin?action=crm-research-approval-preview&${query}`)}),isStatus(400));
  const preview = await h.preview();
  for (const extra of [{lead:{company_name:'Injected'}},{confirm:'save'},{acknowledgeDuplicates:'true'},{operationId:'invalid'}]) await assert.rejects(h.approve(preview,extra),isStatus(400));
});

test('Transactional stale-version and duplicate-race errors pass through untouched for a new review',async () => {
  const h = harness(),preview = await h.preview();
  const conflict = Object.assign(new Error('Research duplicates changed. Preview again.'),{status:409});
  await assert.rejects(h.approve(preview,{}, {call:async (path,options) => {
    assert.equal(path,'/rest/v1/rpc/crm_research_approve');
    assert.deepEqual(options.body.p_expected,{match_count:0,company_match_count:0,fingerprint:'review-snapshot'});
    throw conflict;
  }}),error => error === conflict);
});
