import test from 'node:test';
import assert from 'node:assert/strict';
import {executeReadTool,listReadTools} from '../src/tools/service.js';
import {READ_TOOLS} from '../src/tools/catalog.js';
import {candidateProposal} from '../src/research/refresh-domain.js';
import {validateResearchCandidate} from '../src/research/validation.js';
import {SERVICE_CATALOG} from '../public/admin/service-catalog.js';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',reportId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const date = '2026-09-23T10:00:00.000Z';
const scopes = ['crm:read','research:read','catalog:read'];
const status = code => error => error.status === code;
const company = changes => ({id,company_name:'Example Furniture',website:'https://furniture.example/',country:'SK',city:'',industry:'Furniture',short_description:'Business profile',services:['Product visualization'],fit:'HIGH',pipeline_status:'WON',archived_at:null,version:2,is_client:false,...changes});
const research = changes => candidateProposal(validateResearchCandidate({company_name:'Example Furniture',website:'https://furniture.example/',country:'SK',research_summary:'Untrusted saved research',sources:[{url:'https://furniture.example/about',title:'About the business'}],...changes}).candidate);
const candidate = changes => ({...research(),id,version:1,research_status:'REJECTED',approved_company_id:null,created_at:date,updated_at:date,...changes});
const listRow = changes => ({id,company_name:'Example Furniture',normalized_domain:'furniture.example',country:'SK',country_category:'SK',city:'',industry:'Furniture',business_type:'Manufacturer',product_categories:['Sofas'],market_segments:['Architects'],positioning_value:'',positioning_status:'UNKNOWN',fit:null,research_confidence:null,research_status:'REJECTED',source_origin:'IMPORT',source_count:1,signal_count:0,created_at:date,last_researched_at:null,summary:'Bounded summary',best_services:['Product CGI'],top_signals:[],approved_company_id:null,...changes});
const page = (items,changes = {}) => ({items,total:items.length,page:1,pageSize:25,...changes});
const match = changes => ({kind:'company',id,company_name:'Example Furniture',website:'https://furniture.example/',country:'SK',status:'WON',archived_at:null,match:'domain',...changes});

function harness(changes = {}) {
  const state = {membership:[{user_id:owner,role:'owner'}],companies:[{...company(),crm_clients:null}],candidate:[candidate()],latest:[],approved:[],leads:page([company()]),research:page([listRow()]),duplicates:[{row:1,matches:[match()],match_count:1,fingerprint:'internal'}],exclusions:{domains:['furniture.example'],count:1,overflow:false},rejected:{domains:['furniture.example'],total:1,page:1,pageSize:100,hasMore:false},...changes};
  const calls = [];
  const call = async(path,request) => {
    calls.push({path,request});
    if (path.startsWith('/rest/v1/presentation_admins?')) return state.membership;
    if (path.startsWith('/rest/v1/crm_companies?')) return state.companies;
    if (path.startsWith('/rest/v1/crm_company_research?')) return state.latest;
    if (path.startsWith('/rest/v1/crm_research_candidates?')) return path.includes('approved_company_id=') ? state.approved : state.candidate;
    const routes = {'crm_tool_search_leads':'leads','crm_research_list':'research','crm_research_duplicates':'duplicates','crm_research_excluded_domains':'exclusions','crm_tool_rejected_domains':'rejected'};
    if (routes[path.split('/').at(-1)]) return state[routes[path.split('/').at(-1)]];
    throw new Error('Unexpected read '+path);
  };
  const context = {user:{id:owner},token:'verified-owner-jwt',scopes,call};
  return {state,calls,run:(name,args = {},override = {}) => executeReadTool({name,args,...context,...override}),list:(override = {}) => listReadTools({...context,...override})};
}

test('Read-tool manifest contains exactly eight immutable read-only definitions with strict schemas',async () => {
  const h = harness(),catalog = await h.list();
  assert.equal(catalog.length,8);assert.equal(new Set(catalog.map(tool => tool.name)).size,8);
  for (const tool of catalog) {assert.equal(tool.read_only,true);assert.equal(tool.inputSchema.additionalProperties,false);assert.ok(tool.required_scopes.length);if (tool.inputSchema.properties.filters) assert.equal(tool.inputSchema.properties.filters.additionalProperties,false);}
  catalog[0].inputSchema.properties.filters.properties.fit.enum.push('SECRET');
  assert.equal(READ_TOOLS[0].inputSchema.properties.filters.properties.fit.enum.includes('SECRET'),false);
  assert.ok(Object.isFrozen(READ_TOOLS[0].inputSchema.properties.filters));
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].request.token,'verified-owner-jwt');
});

test('Every entry point requires verified identity and current owner membership, including static catalog',async () => {
  const h = harness();
  for (const override of [{user:null},{user:{id:'bad'}},{token:''},{token:null}]) {await assert.rejects(h.list(override),status(401));await assert.rejects(h.run('get_research_catalog',{},override),status(401));}
  assert.equal(h.calls.length,0);
  h.state.membership=[];
  await assert.rejects(h.list(),status(403));await assert.rejects(h.run('get_research_catalog'),status(403));
  assert.ok(h.calls.every(item => item.path.startsWith('/rest/v1/presentation_admins?')));
  h.state.membership=[{user_id:other,role:'owner'}];await assert.rejects(h.run('get_research_catalog'),status(502));
});

test('Scopes filter discovery and reject missing tool grants before business reads',async () => {
  const h = harness(),catalog = await h.list({scopes:['research:read']});
  assert.deepEqual(catalog.map(tool => tool.name),['get_research_candidates','get_research_candidate','get_rejected_domains']);
  await assert.rejects(h.run('get_lead',{id},{scopes:['crm:read']}),status(403));
  await assert.rejects(h.run('get_research_catalog',{}, {scopes:undefined}),status(403));
  assert.equal(h.calls.length,1);
});

test('Unknown tools, unexpected keys and malformed inputs cannot reach business data',async () => {
  const h = harness();
  for (const [name,args] of [['write_lead',{}],['get_research_catalog',{owner_id:owner}],['get_research_catalog',null],['get_research_catalog',[]],['search_leads',{filters:{table:'crm_contacts'}}],['search_leads',{filters:[]}],['search_leads',{page:'1'}],['search_leads',{page:0}],['search_leads',{page:10001}],['search_leads',{page:1.1}],['search_leads',{filters:{service:'Product visualization'}}],['search_leads',{filters:{country:'Slovakia'}}],['search_leads',{filters:{q:'nul\0text'}}],['search_leads',{filters:{q:'lone\ud800'}}],['get_lead',{id:'no'}],['get_research_candidates',{filters:{fit:'EXTREME'}}],['get_research_candidates',{filters:{q:'x'.repeat(161)}}]]) await assert.rejects(h.run(name,args),status(400),JSON.stringify({name,args}));
  assert.equal(h.calls.length,0);
});

test('Lead search maps only canonical services and country while forwarding literal query and owner JWT',async () => {
  const h = harness({leads:page([{...company(),owner_id:owner,estimated_value:100,notes:'Private',contact_email:'private@example.test'}])});
  const result = await h.run('search_leads',{filters:{country:'sk',service:'Product Visualization',q:'%_ literal',archived:'all',sort:'updated'},page:1});
  assert.deepEqual(result.items,[company()]);assert.equal(result.hasMore,false);
  assert.deepEqual(h.calls[1].request.body,{p_filters:{country:'SK',service:'Product visualization',q:'%_ literal',archived:'all',sort:'updated'},p_page:1});
  assert.equal(h.calls[1].request.token,'verified-owner-jwt');assert.doesNotMatch(JSON.stringify(result),/owner_id|private|estimated_value/);
});

test('Lead search rejects incomplete, oversized or contradictory pages instead of implying absence',async () => {
  const h = harness();
  for (const value of [null,{},page([],{total:1}),page([company()],{page:2}),page([company()],{pageSize:100}),page([company()],{hasMore:true}),page([company()],{total:'1'}),page(Array(26).fill(company())),page([{...company(),services:['secret']}]),page([{...company(),fit:'EXTREME'}])]) {h.state.leads=value;await assert.rejects(h.run('search_leads'),status(502));}
  h.state.leads=page([company()],{internal:'x'.repeat(1_000_001)});await assert.rejects(h.run('search_leads'),status(413));
});

test('get_lead distinguishes Clients by relation, strips operational data, scopes all reads and does not query contacts/history',async () => {
  const h = harness({companies:[{...company({archived_at:date,pipeline_status:'NEW_LEAD'}),crm_clients:{company_id:id,account_notes:'PRIVATE'},priority:'HIGH',owner_id:owner}],approved:[{...research(),id:other,approved_at:date,manual_fields:['fit']}]});
  const result = await h.run('get_lead',{id:id.toUpperCase()});
  assert.equal(result.company.is_client,true);assert.equal(result.company.archived_at,date);assert.equal(result.insight.kind,'approved_candidate');assert.deepEqual(result.approved_candidate,{id:other,company_name:'Example Furniture'});
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|manual_fields|priority|owner_id|crm_clients/);
  assert.ok(h.calls.every(item => item.request.token==='verified-owner-jwt'));
  assert.ok(h.calls.slice(1).every(item => item.path.includes('owner_id=eq.'+owner)));
  assert.ok(h.calls.every(item => !/crm_contacts|offset=|limit=11/.test(item.path)));
});

test('get_lead returns latest evidence report with original approval link and preserves unknowns',async () => {
  const fresh = research({source_origin:'ENRICHMENT',suggested_pitch_angle:'A specific proposal'});
  const h = harness({latest:[{id:reportId,company_id:id,company_version:2,created_at:date,research:fresh}],approved:[{...research(),id:other,approved_at:date}]});
  const result = await h.run('get_lead',{id});
  assert.deepEqual(result.insight,{id:reportId,kind:'enrichment',research:fresh,created_at:date,company_version:2});assert.equal(result.approved_candidate.id,other);assert.equal(result.company.is_client,false);
});

test('get_lead accepts unique relation representations and rejects malformed or unrelated Client rows',async () => {
  const h = harness();
  for (const [relation,expected] of [[null,false],[[],false],[{company_id:id},true],[[{company_id:id}],true]]) {h.state.companies=[{...company(),crm_clients:relation}];assert.equal((await h.run('get_lead',{id})).company.is_client,expected);}
  for (const relation of [undefined,false,'Client',{company_id:other},[{company_id:id},{company_id:id}],{account_notes:'private'}]) {h.state.companies=[{...company(),crm_clients:relation}];await assert.rejects(h.run('get_lead',{id}),status(502));}
});

test('get_lead fails closed for missing/cross-owner records and malformed stored insight',async () => {
  const h = harness({companies:[]});await assert.rejects(h.run('get_lead',{id}),status(404));assert.equal(h.calls.length,2);
  h.state.companies=[{...company(),id:other,crm_clients:null}];await assert.rejects(h.run('get_lead',{id}),status(502));
  h.state.companies=[{...company(),crm_clients:null}];
  for (const latest of [{id:reportId,company_id:other,company_version:2,created_at:date,research:research()},{id:reportId,company_id:id,company_version:2,created_at:date,research:{...research(),sources:[{url:'https://source.example/',secret:'PRIVATE'}]}},{id:reportId,company_id:id,company_version:2,created_at:date,research:{company_name:'Incomplete'}}]) {h.state.latest=[latest];await assert.rejects(h.run('get_lead',{id}),status(502));}
});

test('Duplicate lookup normalizes domain or name/country and retains lifecycle/archive context without fingerprints',async () => {
  const h = harness({duplicates:[{row:1,matches:[match({archived_at:date,owner_id:owner}),match({kind:'candidate',id:other,status:'REJECTED'})],match_count:2,fingerprint:'PRIVATE'}]});
  const result = await h.run('check_company_duplicates',{website:'https://www.Furniture.example./catalog#part',company_name:'  Example   FURNITURE ',country:'sk'});
  assert.deepEqual(h.calls[1].request.body,{p_rows:[{row:1,normalized_domain:'furniture.example',normalized_company_name:'example furniture',country:'SK'}]});assert.equal(result.checked.normalized_domain,'furniture.example');assert.equal(result.matches[0].archived_at,date);assert.equal(result.matches[1].status,'REJECTED');assert.equal(result.truncated,false);assert.doesNotMatch(JSON.stringify(result),/fingerprint|PRIVATE|owner_id/);
  await h.run('check_company_duplicates',{company_name:'  Example   FURNITURE ',country:'sk'});assert.equal(h.calls.at(-1).request.body.p_rows[0].normalized_domain,'');
});

test('Duplicate identities reject unsafe URLs and insufficient names before all data reads',async () => {
  const h = harness();
  for (const args of [{},{company_name:'Name'},{country:'SK'},{company_name:' ',country:'SK'},{website:''},{website:'https://user:pass@example.test/'},{website:'ftp://example.test/'},{website:'https:\\example.test'},{website:'https://example.test/\nother'},{website:'https://exa mple.test/'},{website:'//example.test'}]) await assert.rejects(h.run('check_company_duplicates',args),status(400),JSON.stringify(args));
  assert.equal(h.calls.length,0);
});

test('Duplicate snapshots explicitly mark bounded matches and fail on incomplete upstream checks',async () => {
  const h = harness({duplicates:[{row:1,matches:Array.from({length:10},(_,index)=>match({company_name:'Company '+index})),match_count:12,fingerprint:'hidden'}]});
  const result=await h.run('check_company_duplicates',{website:'example.test'});assert.equal(result.matches.length,10);assert.equal(result.match_count,12);assert.equal(result.truncated,true);
  for (const value of [[],[{row:1,matches:[],match_count:2}],[{row:2,matches:[],match_count:0}],[{row:1,matches:Array(11).fill(match()),match_count:11}],[{row:1,matches:[match({archived_at:undefined})],match_count:1}]]) {h.state.duplicates=value;await assert.rejects(h.run('check_company_duplicates',{website:'example.test'}),status(502));}
});

test('Research list preserves existing canonical filters but returns only bounded metadata',async () => {
  const h = harness({research:page([{...listRow(),owner_id:owner,duplicate_candidate_id:other,rejection_reason:'PRIVATE',events:[{metadata:'PRIVATE'}],sources:[{url:'https://large.example/'}]}])});
  const result = await h.run('get_research_candidates',{filters:{country:'sk',research_status:'REJECTED',potential_service:'Product Visualization',q:' saved ',last_researched:'never'}});
  assert.deepEqual(result.items,[listRow()]);assert.deepEqual(h.calls[1].request.body.p_filters,{country:'SK',research_status:'REJECTED',potential_service:'Product Visualization',q:'saved',last_researched:'never'});assert.doesNotMatch(JSON.stringify(result),/PRIVATE|sources|duplicate_candidate_id|owner_id/);
  h.state.research=page([listRow({best_services:[{secret:'PRIVATE'}]})]);await assert.rejects(h.run('get_research_candidates'),status(502));
});

test('Full Research candidate preserves canonical evidence while excluding rejection and internal metadata',async () => {
  const h = harness({candidate:[candidate({rejection_reason:'PRIVATE',owner_id:owner,manual_fields:['fit'],duplicate_checked_at:date,events:[{metadata:'PRIVATE'}]})]});
  const result = await h.run('get_research_candidate',{id});assert.deepEqual(result.candidate,candidate());assert.doesNotMatch(JSON.stringify(result),/PRIVATE|manual_fields|owner_id|duplicate_checked_at/);
  assert.match(h.calls[1].path,new RegExp('owner_id=eq.'+owner));assert.doesNotMatch(h.calls[1].path,/rejection_reason|manual_fields|events|select=\*/);
});

test('Full Research reads reject malformed nested evidence and missing canonical fields',async () => {
  const h = harness();
  for (const row of [candidate({id:other}),candidate({sources:[{url:'https://source.example/',private_note:'secret'}]}),candidate({field_provenance:{city:{status:'VERIFIED',source_urls:[]}}}),candidate({version:0}),candidate({created_at:'not-a-date'})]) {h.state.candidate=[row];await assert.rejects(h.run('get_research_candidate',{id}),status(502));}
  const missing = candidate();delete missing.research_summary;h.state.candidate=[missing];await assert.rejects(h.run('get_research_candidate',{id}),status(502));
  h.state.candidate=[];await assert.rejects(h.run('get_research_candidate',{id}),status(404));
});

test('Existing domains include the complete set before deterministic pagination and never silently truncate',async () => {
  const domains = Array.from({length:205},(_,index)=>`d${String(index).padStart(3,'0')}.example`),h=harness({exclusions:{domains:[...domains].reverse(),count:205,overflow:false}});
  const result=await h.run('get_existing_domains',{page:2});assert.deepEqual(result,{domains:domains.slice(100,200),total:205,page:2,pageSize:100,hasMore:true});
  h.state.exclusions={domains:[],count:0,overflow:true};await assert.rejects(h.run('get_existing_domains'),status(413));
  for (const value of [{domains:['a.example','a.example'],count:2,overflow:false},{domains:['a.example'],count:2,overflow:false},{domains:['https://a.example'],count:1,overflow:false},{domains:Array.from({length:10001},(_,index)=>`d${index}.example`),count:10001,overflow:false}]) {h.state.exclusions=value;await assert.rejects(h.run('get_existing_domains'),status(502));}
});

test('Rejected domain pages contain only domains, enforce stable order/counts and carry owner JWT',async () => {
  const h=harness({rejected:{domains:['z.example'],total:101,page:2,pageSize:100,hasMore:false,rejection_reason:'PRIVATE'}});
  const result=await h.run('get_rejected_domains',{page:2});assert.deepEqual(result,{domains:['z.example'],total:101,page:2,pageSize:100,hasMore:false});assert.deepEqual(h.calls[1].request,{token:'verified-owner-jwt',method:'POST',body:{p_page:2}});
  for (const value of [{domains:['z.example','a.example'],total:2,page:1,pageSize:100},{domains:['a.example','a.example'],total:2,page:1,pageSize:100},{domains:[],total:1,page:1,pageSize:100}]) {h.state.rejected=value;await assert.rejects(h.run('get_rejected_domains'),status(502));}
});

test('Existing domain pagination accepts a complete legitimate input larger than the tool response limit',async () => {
  const domains=Array.from({length:6000},(_,index)=>`${String(index).padStart(4,'0')}.${'a'.repeat(60)}.${'b'.repeat(60)}.${'c'.repeat(60)}.example`);
  assert.ok(Buffer.byteLength(JSON.stringify(domains),'utf8')>1_000_000);
  const h=harness({exclusions:{domains,count:domains.length,overflow:false}}),result=await h.run('get_existing_domains');
  assert.equal(result.total,6000);assert.deepEqual(result.domains,domains.slice(0,100));assert.equal(result.hasMore,true);assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<100_000);
});

test('Shared research catalogs and nested schema are copied, with explicit non-scoring ICP guidance',async () => {
  const h=harness(),result=await h.run('get_research_catalog');assert.deepEqual(result.services,SERVICE_CATALOG);assert.match(result.profile_guidance,/not scores/);assert.ok(result.import_schema.properties.candidates.items.properties.field_provenance);assert.ok(result.ideal_client_profiles.length);
  result.services[0].name='Changed';result.ideal_client_profiles[0].industries.push('Changed');result.import_schema.properties.candidates.items.properties.sources.items.properties.url.maxLength=1;
  const next=await h.run('get_research_catalog');assert.equal(next.services[0].name,'Product CGI');assert.equal(next.ideal_client_profiles[0].industries.includes('Changed'),false);assert.equal(next.import_schema.properties.candidates.items.properties.sources.items.properties.url.maxLength,2048);
  assert.equal(h.calls.length,2);
});
