import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleResearchEnrich,enrichReadActions,enrichWriteActions} from '../src/research/enrich.js';
import {ENRICH_FIELDS,enrichmentGroups,validateEnrichmentProposal} from '../src/research/enrich-domain.js';
import {candidateProposal} from '../src/research/refresh-domain.js';
import {validateResearchCandidate} from '../src/research/validation.js';
import {MAX_RESEARCH_BYTES,RESEARCH_CANDIDATE_SCHEMA} from '../src/research/schema.js';
import {companyInput} from '../src/crm/handler.js';
import {researchReadActions,researchWriteActions} from '../src/research/handler.js';
import {SERVICE_CATALOG} from '../public/admin/service-catalog.js';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',otherOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const companyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',operationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const reportId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',candidateId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const sourceURL = 'https://furniture.example/about',signingKey = 'test-only-company-enrichment-key';
const verified = () => ({status:'VERIFIED',confidence:'HIGH',evidence:'Published on the official company page.',source_urls:[sourceURL]});
const company = changes => ({id:companyId,company_name:'Example Furniture',website:'https://furniture.example/',country:'CZ',city:'',industry:'',short_description:'',services:[],fit:null,version:3,archived_at:null,...changes});
const research = changes => candidateProposal(validateResearchCandidate({company_name:'Example Furniture',website:'https://furniture.example/',country:'CZ',city:'Prague',industry:'Furniture',short_description:'Makes furniture for homes.',research_summary:'Publicly documented furniture business.',potential_services:[{service:'Product CGI',relevance:'HIGH',reason:'Product catalog imagery.'}],fit:'HIGH',fit_reason:'Furniture products need visual presentation.',sources:[{url:sourceURL}],field_provenance:{city:verified(),industry:verified(),short_description:verified()},source_origin:'ENRICHMENT',...changes}).candidate);
const proposal = changes => ({schema_version:1,company_id:companyId,base_version:3,research:research(),...changes});
const report = changes => ({id:reportId,company_id:companyId,company_version:4,research:research(),selected_fields:['city'],overwritten_fields:[],before_values:{city:''},after_values:{city:'Prague'},created_at:'2026-09-23T10:00:00.000Z',...changes});
const isStatus = status => error => error.status === status;

function harness(options = {}) {
  const state = {company:company(),latest:null,approved:null,history:[],contacts:[],...options},calls = [];
  const call = async(path,request) => {
    calls.push({path,request});
    if (path.startsWith('/rest/v1/crm_companies?')) return state.company ? [state.company] : [];
    if (path.startsWith('/rest/v1/crm_research_candidates?')) return state.approved ? [state.approved] : [];
    if (path.startsWith('/rest/v1/crm_contacts?')) return state.contacts;
    if (path.startsWith('/rest/v1/crm_company_research?')) {
      if (path.includes('limit=11')) return state.history;
      return state.latest ? [state.latest] : [];
    }
    if (path === '/rest/v1/rpc/crm_research_enrich') return state.result ?? {company_id:companyId,version:4,insight_id:reportId};
    throw new Error(`Unexpected path: ${path}`);
  };
  const run = (action,body,overrides = {}) => handleResearchEnrich({action,body,user:{id:owner},token:'owner-jwt',call,signingKey,validateCompany:companyInput,url:new URL(`https://shapeviz.example/api/admin?action=${action}${enrichReadActions.includes(action) ? '&companyId='+companyId+(action === 'crm-research-insight-report' ? '&id='+reportId : '') : ''}`),...overrides});
  const preview = (input = proposal(),extra = {},overrides = {}) => run('crm-research-enrich-preview',{companyId,proposal:input,...extra},overrides);
  const commit = (review,input = proposal(),extra = {},overrides = {}) => run('crm-research-enrich-commit',{companyId,proposal:input,reviewToken:review.reviewToken,selectedFields:['city'],overwriteFields:[],acceptInsight:true,operationId,confirm:'apply_enrichment',...extra},overrides);
  return {state,calls,run,preview,commit};
}

function resign(token,transform) {
  const payload = JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString('utf8'));
  const encoded = Buffer.from(JSON.stringify(transform(payload))).toString('base64url');
  return `${encoded}.${createHmac('sha256',signingKey).update(encoded).digest('base64url')}`;
}

test('Enrichment uses a separate full canonical envelope and registers reads/writes without replacing approved company lookup',() => {
  assert.deepEqual(Object.keys(validateEnrichmentProposal(proposal(),companyId).proposal.research).sort(),Object.keys(RESEARCH_CANDIDATE_SCHEMA.properties).sort());
  for (const action of enrichReadActions) assert.ok(researchReadActions.includes(action));
  for (const action of enrichWriteActions) assert.ok(researchWriteActions.includes(action));
  assert.ok(researchReadActions.includes('crm-research-company'));
  const missing = proposal();delete missing.research.city;
  for (const input of [missing,{...proposal(),owner_id:owner},{...proposal(),company_id:otherOwner},{...proposal(),base_version:0},{...proposal(),base_version:3.1},{...proposal(),schema_version:2},{...proposal(),research:{...research(),normalized_domain:'furniture.example'}},{...proposal(),research:research({source_origin:'IMPORT'})}]) assert.throws(() => validateEnrichmentProposal(input,companyId),isStatus(400));
});

test('Enrichment bounds JSON bytes, requires actual sources and service reasons, and does not invent research dates',() => {
  assert.throws(() => validateEnrichmentProposal(' '.repeat(MAX_RESEARCH_BYTES+1),companyId),isStatus(413));
  for (const input of ['```json\n{}\n```','[]','null']) assert.throws(() => validateEnrichmentProposal(input,companyId),isStatus(400));
  const noSources = research({sources:[],field_provenance:{}});
  assert.throws(() => validateEnrichmentProposal(proposal({research:noSources}),companyId),isStatus(400));
  assert.throws(() => validateEnrichmentProposal(proposal({research:research({potential_services:[{service:'Product CGI',relevance:'HIGH',reason:''}]})}),companyId),isStatus(400));
  const now = Date.parse('2026-09-23T10:00:00Z');
  assert.equal(validateEnrichmentProposal(proposal(),companyId,now).proposal.research.last_researched_at,null);
  assert.throws(() => validateEnrichmentProposal(proposal({research:research({last_researched_at:'2026-09-23T10:06:00Z'})}),companyId,now),isStatus(400));
  assert.equal(validateEnrichmentProposal(proposal({research:research({last_researched_at:'2026-09-23T10:05:00Z'})}),companyId,now).proposal.research.last_researched_at,'2026-09-23T10:05:00.000Z');
  assert.ok(validateEnrichmentProposal(proposal({research:research({last_researched_at:'2025-01-01T00:00:00Z'})}),companyId,now).warnings.some(warning => warning.code === 'older_research'));
});

test('Preview is owner-JWT read-only and offers only populated, changed and sufficiently evidenced groups',async () => {
  const h = harness({company:company({city:'Prague',industry:'Existing sector'})});
  const input = proposal({research:research({field_provenance:{city:verified(),industry:{...verified(),status:'INFERRED'},short_description:verified()}})});
  const result = await h.preview(input);
  assert.equal(h.calls.length,3);assert.ok(h.calls.every(call=>call.request.token==='owner-jwt'));assert.match(h.calls[0].path,new RegExp(`owner_id=eq.${owner}`));
  assert.deepEqual(result.groups.map(group => group.key),ENRICH_FIELDS);
  assert.equal(result.groups.find(group => group.key === 'city').eligible,false);
  assert.equal(result.groups.find(group => group.key === 'industry').eligible,false);
  assert.equal(result.groups.find(group => group.key === 'industry').protected,true);
  assert.equal(result.groups.find(group => group.key === 'short_description').eligible,true);
  assert.equal(result.research.field_provenance.industry.status,'INFERRED');
  assert.deepEqual(result.groups.find(group => group.key === 'fit').evidence,{fit:'HIGH',fit_reason:input.research.fit_reason});
  assert.deepEqual(result.groups.find(group => group.key === 'services').evidence,input.research.potential_services);
  assert.equal(Object.hasOwn(result.groups[0],'selected'),false);
});

test('All 14 service recommendations map in order; company validation cannot leak Lead-creation defaults into the patch',async () => {
  const h = harness(),input = proposal({research:research({potential_services:SERVICE_CATALOG.map(service => ({service:service.name,relevance:'MEDIUM',reason:`Public product use for ${service.name}.`}))})});
  const review = await h.preview(input);await h.commit(review,input,{selectedFields:['services','fit','industry','short_description','city']});
  const write = h.calls.at(-1);
  assert.equal(write.path,'/rest/v1/rpc/crm_research_enrich');assert.equal(Object.hasOwn(write.request,'token'),false);
  assert.deepEqual(Object.keys(write.request.body.p_patch).sort(),[...ENRICH_FIELDS].sort());
  assert.deepEqual(write.request.body.p_patch.services,SERVICE_CATALOG.map(service => service.crmValue));
  assert.equal(write.request.body.p_owner,owner);assert.equal(write.request.body.p_company,companyId);assert.equal(write.request.body.p_version,3);
  for (const field of ['company_name','website','country','pipeline_status','priority','lead_source','instagram','linkedin','contacts','estimated_value','client_status','lost_reason']) assert.equal(Object.hasOwn(write.request.body.p_patch,field),false);
  assert.deepEqual(write.request.body.p_research,input.research);
});

test('Existing nonempty scalar and array values require exactly their selected overwrite acknowledgements',async () => {
  const h = harness({company:company({city:'Brno',industry:'Other',short_description:'Reviewed old description',services:['Web'],fit:'LOW'})}),review = await h.preview();
  assert.ok(review.groups.every(group => group.protected));
  await assert.rejects(h.commit(review),isStatus(400));
  await assert.rejects(h.commit(review,undefined,{overwriteFields:['city','industry']}),isStatus(400));
  await assert.rejects(h.commit(review,undefined,{overwriteFields:['city','city']}),isStatus(400));
  await h.commit(review,undefined,{selectedFields:['industry','city'],overwriteFields:['city','industry']});
  assert.deepEqual(h.calls.at(-1).request.body.p_overrides,['city','industry']);
});

test('Empty and inferred proposals may be accepted as Insight only, never clear or overwrite CRM facts',async () => {
  const h = harness({company:company({city:'Prague',industry:'Furniture',short_description:'Reviewed',services:['Web'],fit:'HIGH'})});
  const input = proposal({research:research({city:'',industry:'',short_description:'',potential_services:[],fit:null,fit_reason:'',field_provenance:{}})}),review = await h.preview(input);
  assert.ok(review.groups.every(group => !group.eligible));
  await assert.rejects(h.commit(review,input),isStatus(400));
  await h.commit(review,input,{selectedFields:[]});assert.deepEqual(h.calls.at(-1).request.body.p_patch,{});
  await assert.rejects(h.commit(review,input,{selectedFields:[],acceptInsight:false}),isStatus(400));
  const inferred = proposal({research:research({field_provenance:{city:{...verified(),status:'INFERRED'},industry:{...verified(),status:'INFERRED'},short_description:{...verified(),status:'INFERRED'}},potential_services:[],fit:null,fit_reason:''})});
  const inferredReview = await h.preview(inferred);assert.ok(inferredReview.groups.every(group => !group.eligible));
  await h.commit(inferredReview,inferred,{selectedFields:[]});assert.equal(h.calls.at(-1).request.body.p_research.field_provenance.city.status,'INFERRED');
});

test('Current name/country/domain and company version bind previews, while equivalent website normalization is accepted',async () => {
  const h = harness();
  for (const changes of [{company_name:'Different company'},{country:'SK'},{website:'https://other.example/'}]) await assert.rejects(h.preview(proposal({research:research(changes)})),isStatus(400));
  await h.preview(proposal({research:research({website:'http://www.furniture.example/catalog'})}));
  await assert.rejects(h.preview(proposal({base_version:2})),isStatus(409));
  h.state.company.archived_at='2026-09-23T10:00:00Z';
  await assert.rejects(h.preview(),isStatus(409));await assert.rejects(h.run('crm-research-enrich-prompt'),isStatus(409));
});

test('Signed review rejects input, owner, company, version, purpose, eligibility tampering and expiration without writes',async () => {
  const h = harness(),review = await h.preview();
  await assert.rejects(h.commit(review,undefined,{}, {user:{id:otherOwner}}),isStatus(400));
  await assert.rejects(h.commit(review,undefined,{}, {signingKey:'different'}),isStatus(400));
  await assert.rejects(h.commit(review,proposal({base_version:4})),isStatus(400));
  await assert.rejects(h.commit(review,proposal({research:research({city:'Brno'})})),isStatus(400));
  for (const transform of [payload=>({...payload,purpose:'research-refresh'}),payload=>({...payload,companyId:otherOwner}),payload=>({...payload,eligible:['city','city']}),payload=>({...payload,protected:['pipeline_status']})]) await assert.rejects(h.commit(review,undefined,{reviewToken:resign(review.reviewToken,transform)}),isStatus(400));
  await assert.rejects(h.commit(review,undefined,{reviewToken:resign(review.reviewToken,payload=>({...payload,expiresAt:Date.now()-1}))}),isStatus(409));
  const [encoded,signature] = review.reviewToken.split('.');
  await assert.rejects(h.commit(review,undefined,{reviewToken:`${encoded}.${signature[0]==='A'?'B':'A'}${signature.slice(1)}`}),isStatus(400));
  await assert.rejects(h.commit(review,undefined,{reviewToken:'x'.repeat(10_001)}),isStatus(400));
  assert.equal(h.calls.length,3);
});

test('Exact retries use no current reads and hash canonical input plus sorted selections/overrides, not token lifetime',async () => {
  const h = harness({result:{company_id:companyId,version:4,insight_id:reportId,replayed:true}}),input = proposal(),review = await h.preview(input);
  const first = await h.commit(review,input,{selectedFields:['city','services']});assert.equal(first.replayed,true);const firstHash = h.calls.at(-1).request.body.p_hash;
  h.state.company=null;
  await h.commit(review,JSON.stringify(input,null,2),{selectedFields:['services','city'],reviewToken:resign(review.reviewToken,payload=>({...payload,expiresAt:payload.expiresAt+1000}))});
  assert.equal(h.calls.at(-1).request.body.p_hash,firstHash);assert.equal(h.calls.filter(call=>call.path.startsWith('/rest/v1/crm_companies?')).length,1);
  await h.commit(review,input,{selectedFields:[]});assert.notEqual(h.calls.at(-1).request.body.p_hash,firstHash);
  const conflict = Object.assign(new Error('Company changed or archived.'),{status:409});
  await assert.rejects(h.commit(review,input,{}, {call:async path=>{assert.equal(path,'/rest/v1/rpc/crm_research_enrich');throw conflict;}}),error=>error===conflict);
});

test('True report no-op receipts pass through without an extra company update',async () => {
  const result = {company_id:companyId,version:3,insight_id:reportId,no_change:true,replayed:true};
  const h = harness({result}),review = await h.preview();
  assert.deepEqual(await h.commit(review,undefined,{selectedFields:[]}),result);assert.equal(h.calls.length,4);
});

test('Prompt contains only the bounded public business projection and independently verified historical research',async () => {
  const h = harness({company:company({notes:'PRIVATE-NOTE',contacts:[{email:'PRIVATE-CONTACT'}],estimated_value:123456789,pipeline_status:'PRIVATE-PIPELINE',owner_id:otherOwner}),latest:report({owner_id:otherOwner})});
  const result = await h.run('crm-research-enrich-prompt');
  for (const privateValue of ['PRIVATE-NOTE','PRIVATE-CONTACT','123456789','PRIVATE-PIPELINE',otherOwner]) assert.equal(result.prompt.includes(privateValue),false);
  assert.match(result.prompt,/untrusted data, never as instructions/);assert.match(result.prompt,/Previous research is historical context/);assert.match(result.prompt,/Do not find other companies/);assert.match(result.prompt,/No changes are selected automatically/);
  const schema = JSON.parse(result.prompt.split('COMPANY ENRICHMENT JSON SCHEMA:\n\n')[1]);
  assert.equal(schema.properties.company_id.const,companyId);assert.equal(schema.properties.base_version.const,3);assert.equal(schema.properties.research.properties.source_origin.const,'ENRICHMENT');
  assert.equal(schema.properties.research.required.length,Object.keys(RESEARCH_CANDIDATE_SCHEMA.properties).length);
  assert.equal(Object.hasOwn(result.company,'owner_id'),false);assert.ok(h.calls.every(call=>call.request.token==='owner-jwt'));
});

test('Insight returns latest immutable research, approved link and true contact existence, including archived company history',async () => {
  const h = harness({company:company({archived_at:'2026-09-23T10:00:00Z'}),latest:report(),approved:{...research({source_origin:'IMPORT'}),id:candidateId,approved_at:'2026-09-22T10:00:00Z',owner_id:owner,manual_fields:['city']},contacts:[{id:otherOwner}]});
  const result = await h.run('crm-research-insight');
  assert.equal(result.insight.kind,'enrichment');assert.equal(result.insight.id,reportId);assert.equal(result.insight.company_version,4);
  assert.deepEqual(result.approved_candidate,{id:candidateId,company_name:'Example Furniture'});assert.equal(result.has_contacts,true);
  assert.equal(Object.hasOwn(result.insight.research,'manual_fields'),false);
  assert.ok(h.calls.every(call=>call.request.token==='owner-jwt'&&call.path.includes(`owner_id=eq.${owner}`)));
  const contactRead = h.calls.find(call=>call.path.startsWith('/rest/v1/crm_contacts?'));assert.match(contactRead.path,/select=id&limit=1/);
  h.state.latest=null;h.state.contacts=[];
  const fallback = await h.run('crm-research-insight');assert.equal(fallback.insight.kind,'approved_candidate');assert.equal(fallback.insight.company_version,null);assert.equal(fallback.insight.research.source_origin,'IMPORT');assert.equal(fallback.has_contacts,false);
  h.state.approved=null;assert.equal((await h.run('crm-research-insight')).insight,null);
});

test('Insight history fetches 11 metadata rows and returns ten with exact page offset, without returning whole historical reports',async () => {
  const h = harness({history:Array.from({length:11},(_,index)=>({...report({company_version:20-index}),last_researched_at:null,owner_id:owner}))});
  const result = await h.run('crm-research-insight',undefined,{url:new URL(`https://shapeviz.example/api/admin?action=crm-research-insight&companyId=${companyId}&page=2`)});
  assert.equal(result.history.length,10);assert.equal(result.hasMore,true);assert.equal(result.page,2);
  const query = h.calls.find(call=>call.path.includes('limit=11')).path;assert.match(query,/offset=10/);assert.match(query,/last_researched_at:research->>last_researched_at/);
  assert.equal(Object.hasOwn(result.history[0],'research'),false);assert.equal(Object.hasOwn(result.history[0],'owner_id'),false);
});

test('Historical report lookup scopes owner and company and never exposes unrelated stored metadata',async () => {
  const h = harness({latest:report({owner_id:owner,before_values:{city:'',owner_id:otherOwner,notes:'PRIVATE'},after_values:{city:'Prague',pipeline_status:'WON'}})});
  const result = await h.run('crm-research-insight-report');
  assert.equal(result.report.id,reportId);assert.deepEqual(result.report.before_values,{city:''});assert.deepEqual(result.report.after_values,{city:'Prague'});assert.equal(Object.hasOwn(result.report,'owner_id'),false);
  const query = h.calls.at(-1).path;assert.match(query,new RegExp(`company_id=eq.${companyId}`));assert.match(query,new RegExp(`owner_id=eq.${owner}`));assert.match(query,new RegExp(`id=eq.${reportId}`));
  h.state.latest=null;await assert.rejects(h.run('crm-research-insight-report'),isStatus(404));
  h.state.company=null;await assert.rejects(h.run('crm-research-insight'),isStatus(404));
});

test('Unknown ownership, query/body field injection and unreviewed selection never reach enrichment RPC',async () => {
  const h = harness();
  await assert.rejects(h.preview(undefined,{}, {token:''}),isStatus(401));await assert.rejects(h.preview(undefined,{}, {user:{id:'invalid'}}),isStatus(401));await assert.rejects(h.preview(undefined,{}, {signingKey:undefined}),isStatus(503));
  for (const query of ['&page=0','&page=10001','&page=1.5','&owner_id='+otherOwner,'&companyId='+companyId]) await assert.rejects(h.run('crm-research-insight',undefined,{url:new URL(`https://shapeviz.example/api/admin?action=crm-research-insight&companyId=${companyId}${query}`)}),isStatus(400));
  await assert.rejects(h.preview(undefined,{owner_id:otherOwner}),isStatus(400));
  const review = await h.preview();
  for (const extra of [{selectedFields:['city','city']},{selectedFields:['pipeline_status']},{overwriteFields:['city']},{acceptInsight:'true'},{acceptInsight:false},{confirm:'approve'},{operationId:'invalid'},{p_patch:{city:'Injected'}},{owner_id:otherOwner},{companyId:otherOwner}]) await assert.rejects(h.commit(review,undefined,extra),isStatus(400));
  assert.equal(h.calls.some(call=>call.path.includes('/rpc/')),false);
});

test('Read failures propagate rather than inventing no contacts or missing research',async () => {
  const h = harness(),unavailable = Object.assign(new Error('Current owner membership was revoked.'),{status:403});
  await assert.rejects(h.run('crm-research-insight',undefined,{call:async(path,request)=>{if(path.startsWith('/rest/v1/crm_companies?'))return [company()];assert.equal(request.token,'owner-jwt');throw unavailable;}}),error=>error===unavailable);
});

test('A recent report older than the accepted Insight gets one warning without preventing review or adding commit reads',async () => {
  const now = Date.now(),previousDate = new Date(now-24*60*60*1000).toISOString(),incomingDate = new Date(now-2*24*60*60*1000).toISOString();
  const h = harness({latest:report({research:research({last_researched_at:previousDate})})});
  const input = proposal({research:research({last_researched_at:incomingDate})}),review = await h.preview(input);
  assert.equal(review.warnings.filter(warning=>warning.code==='older_research').length,1);assert.match(review.warnings.find(warning=>warning.code==='older_research').message,/predates/);
  const before = h.calls.length;await h.commit(review,input,{selectedFields:[]});assert.equal(h.calls.length,before+1);assert.equal(h.calls.at(-1).path,'/rest/v1/rpc/crm_research_enrich');
  const old = await h.preview(proposal({research:research({last_researched_at:new Date(now-100*24*60*60*1000).toISOString()})}));assert.equal(old.warnings.filter(warning=>warning.code==='older_research').length,1);
});

test('Canonical Unicode facts that exceed CRM limits remain in Insight while only independently valid targets may be copied',async () => {
  const h = harness(),input = proposal({research:research({city:'😀'.repeat(100),short_description:'😀'.repeat(2000)})}),review = await h.preview(input);
  for (const key of ['city','short_description']) { const group = review.groups.find(group=>group.key===key);assert.equal(group.eligible,false);assert.match(group.reason,/CRM field limits/); }
  assert.equal(review.groups.find(group=>group.key==='fit').eligible,true);assert.equal(review.groups.find(group=>group.key==='services').eligible,true);
  await h.commit(review,input,{selectedFields:[]});assert.deepEqual(h.calls.at(-1).request.body.p_patch,{});assert.equal(h.calls.at(-1).request.body.p_research.city,input.research.city);
  await h.commit(review,input,{selectedFields:['fit','services']});assert.deepEqual(h.calls.at(-1).request.body.p_patch,{fit:'HIGH',services:['Product CGI']});
  const before = h.calls.length;
  await assert.rejects(h.commit(review,input),isStatus(400));
  await assert.rejects(h.commit(review,input,{reviewToken:resign(review.reviewToken,payload=>({...payload,eligible:[...payload.eligible,'city']}))}),isStatus(400));
  assert.equal(h.calls.length,before);
});
