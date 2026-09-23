import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {validateResearchCandidate,validateResearchImport} from '../src/research/validation.js';
import {RESEARCH_IMPORT_SCHEMA,MAX_RESEARCH_BYTES} from '../src/research/schema.js';
import {SERVICE_CATALOG,RESEARCH_SERVICES} from '../public/admin/service-catalog.js';
import {SERVICES} from '../public/admin/crm-options.js';
import {IDEAL_CLIENT_PROFILES,OPPORTUNITY_SIGNALS,PROVENANCE_FIELDS} from '../public/admin/research-options.js';

const proposal = overrides => ({company_name:'Example Furniture',...overrides});
const rejects = (input,code) => assert.throws(() => validateResearchCandidate(input),error => error.status === 400 && error.issues.some(issue => issue.code === code));
const example = JSON.parse(await readFile(new URL('../docs/examples/research-candidates.v1.json',import.meta.url),'utf8'));

test('Research example is valid and retains sources, evidence and recommendations',() => {
  const result = validateResearchImport(example);
  assert.equal(result.valid_count,1);
  assert.deepEqual(result.rows[0].warnings,[]);
  const candidate = result.rows[0].candidate;
  assert.equal(candidate.normalized_domain,'furniture.example');
  assert.equal(candidate.positioning.status,'INFERRED');
  assert.equal(candidate.field_provenance.business_type.status,'VERIFIED');
  assert.deepEqual(candidate.sources,example.candidates[0].sources);
  assert.equal(candidate.potential_services[1].service,'3D Models for Architects');
});

test('Sparse candidates preserve unknowns without inventing facts, Fit or dates',() => {
  const {candidate,warnings} = validateResearchCandidate(proposal());
  assert.equal(candidate.fit,null);
  assert.equal(candidate.research_confidence,null);
  assert.equal(candidate.last_researched_at,null);
  assert.equal(candidate.country,'');
  assert.equal(candidate.normalized_domain,'');
  assert.equal(candidate.source_origin,'IMPORT');
  for (const field of PROVENANCE_FIELDS) assert.equal(candidate.field_provenance[field].status,'UNKNOWN');
  assert.equal(candidate.positioning.status,'UNKNOWN');
  assert.deepEqual(warnings.map(w => w.code),['missing_website','missing_sources']);
});

test('Research normalization reuses CRM company/domain identities and never mutates proposals',() => {
  for (const website of ['https://www.EXAMPLE.com/','http://example.com','www.example.com','example.com']) {
    const input = proposal({company_name:'  Example   Furniture  ',country:'cz',website});
    const original = structuredClone(input);
    const {candidate} = validateResearchCandidate(input);
    assert.equal(candidate.normalized_domain,'example.com');
    assert.equal(candidate.normalized_company_name,'example furniture');
    assert.equal(candidate.country,'CZ');
    assert.deepEqual(input,original);
  }
  rejects(proposal({country:'Czech Republic'}),'text_length');
});

test('Service catalog preserves existing CRM values and supports all fourteen research services in Leads',() => {
  assert.deepEqual(SERVICES,['Product CGI','Archviz','Product visualization','3D modelling','3D models for architects','Social content','Art direction','AI content','Animation','Web','Automation','Other','Lifestyle CGI','Product Animation']);
  assert.equal(SERVICE_CATALOG.length,14);
  const {candidate,warnings} = validateResearchCandidate(proposal({potential_services:[
    {service:'3D models for architects',relevance:'HIGH'},
    {service:'Lifestyle CGI',relevance:'MEDIUM'},
  ]}));
  assert.equal(candidate.potential_services[0].service,'3D Models for Architects');
  assert.ok(!warnings.some(w => w.code === 'crm_service_pending'));
  rejects(proposal({potential_services:[{service:'Made-up service',relevance:'HIGH'}]}),'invalid_choice');
  rejects(proposal({potential_services:[{service:'Product CGI',relevance:'HIGH'},{service:'product cgi',relevance:'LOW'}]}),'duplicate_service');
  for (const profile of IDEAL_CLIENT_PROFILES) {
    assert.ok(profile.services.every(service => RESEARCH_SERVICES.includes(service)));
    assert.ok(profile.signals.every(signal => OPPORTUNITY_SIGNALS.includes(signal)));
  }
});

test('Extensible taxonomies preserve unknown categories with review warnings',() => {
  const {candidate,warnings} = validateResearchCandidate(proposal({industry:'Lighting',product_categories:['floor lamps','Sculptural luminaires'],market_segments:['Architects']}));
  assert.deepEqual(candidate.product_categories,['Floor Lamps','Sculptural luminaires']);
  assert.equal(warnings.filter(w => w.code === 'unknown_category').length,1);
  rejects(proposal({product_categories:['Sofas','sofas']}),'duplicate_value');
});

test('Fit and inferred positioning must be explained',() => {
  rejects(proposal({fit:'HIGH'}),'fit_reason_required');
  rejects(proposal({fit_reason:'Relevant products.'}),'fit_required');
  rejects(proposal({fit:'87/100',fit_reason:'A score.'}),'invalid_choice');
  rejects(proposal({positioning:{value:'Premium'}}),'provenance_required');
  rejects(proposal({positioning:{value:'Premium',status:'INFERRED'}}),'evidence_required');
  const {candidate} = validateResearchCandidate(proposal({fit:'HIGH',fit_reason:'Reusable product assets.',research_confidence:'LOW'}));
  assert.equal(candidate.fit,'HIGH');
  assert.equal(candidate.research_confidence,'LOW');
});

test('Verified facts need sources, and references must resolve within the candidate',() => {
  rejects(proposal({industry:'Furniture',field_provenance:{industry:{status:'VERIFIED'}}}),'source_required');
  rejects(proposal({industry:'Furniture',field_provenance:{industry:{status:'VERIFIED',source_urls:['https://example.com/about']}}}),'missing_source');
  rejects(proposal({field_provenance:{industry:{status:'INFERRED',evidence:'Website presentation.'}}}),'value_required');
  rejects(proposal({sources:[{url:'https://EXAMPLE.com'},{url:'https://example.com/'}]}),'duplicate_source');
  rejects(proposal({positioning:{status:'VERIFIED',source_urls:['https://example.com/']},sources:[{url:'https://example.com/'}]}),'value_required');
});

test('Signals need evidence and confidence and cannot silently duplicate each other',() => {
  const signal = {signal:'NO_3D_DOWNLOADS_FOUND',confidence:'MEDIUM',evidence:'No 3D asset library was found in the pages reviewed.'};
  const {candidate} = validateResearchCandidate(proposal({opportunity_signals:[signal]}));
  assert.equal(candidate.opportunity_signals[0].status,'INFERRED');
  rejects(proposal({opportunity_signals:[{...signal,evidence:''}]}),'text_length');
  rejects(proposal({opportunity_signals:[{signal:signal.signal,evidence:signal.evidence}]}),'required');
  rejects(proposal({opportunity_signals:[signal,signal]}),'duplicate_signal');
  rejects(proposal({opportunity_signals:[{...signal,status:'VERIFIED'}]}),'source_required');
});

test('Research proposals cannot set ownership, workflow state, generated IDs or audit data',() => {
  for (const field of ['owner_id','user_id','workspace_id','id','research_status','approved_at','rejected_at','duplicate_company_id','created_at','updated_at','normalized_domain','priority','pipeline_status']) rejects(proposal({[field]:'spoof'}),'unknown_field');
  rejects(JSON.parse('{"company_name":"Example","__proto__":{"owner_id":"spoof"}}'),'unknown_field');
  rejects(proposal({field_provenance:{owner_id:{status:'VERIFIED'}}}),'unknown_field');
  rejects(proposal({sources:[{url:'https://example.com',owner_id:'spoof'}]}),'unknown_field');
});

test('Malformed shapes and excessive fields fail rather than being silently coerced',() => {
  for (const input of [null,[],42,'Example']) rejects(input,'invalid_type');
  rejects({},'required');
  rejects(proposal({company_name:'  '}),'text_length');
  rejects(proposal({company_name:'a'.repeat(161)}),'text_length');
  rejects(proposal({sources:{}}),'invalid_type');
  rejects(proposal({product_categories:Array(31).fill('Sofas')}),'array_size');
  rejects(proposal({fit:false}),'invalid_type');
});

test('Website and source links reject unsafe protocols, credentials and malformed URLs',() => {
  for (const website of ['javascript:alert(1)','ftp://example.com','https://user:pass@example.com','https://exa mple.com','https://example.com\\evil']) rejects(proposal({website}),'invalid_url');
  rejects(proposal({website:'https://example.com\u0000'}),'invalid_text');
  for (const url of ['example.com','data:text/plain,hello','https://user:pass@example.com','https://example.com\u0000']) rejects(proposal({sources:[{url}]}),'invalid_format');
  const {candidate} = validateResearchCandidate(proposal({sources:[{url:'https://EXAMPLE.com/page#team'}]}));
  assert.equal(candidate.sources[0].url,'https://example.com/page#team');
});

test('PostgreSQL-invalid Unicode is reported per row without rejecting valid supplementary characters',() => {
  const good = proposal({company_name:'Furniture \u{1F6CB}',short_description:'A \u{1F9F5} textile collection.'});
  const invalidCandidates = [
    proposal({company_name:'Null\u0000name'}),
    proposal({short_description:'Lone high \uD800'}),
    proposal({industry:'Lone low \uDFFF'}),
    proposal({product_categories:['Broken \uD800pair\uDFFF']}),
    proposal({sources:[{url:'https://example.com/',title:'Bad\u0000source'}]}),
    proposal({potential_services:[{service:'Product CGI',relevance:'HIGH',reason:'Bad \uD800'}]}),
  ];
  const result = validateResearchImport(JSON.stringify({candidates:[...invalidCandidates,good]}));
  assert.equal(result.valid_count,1);
  for (const row of result.rows.slice(0,-1)) {
    assert.equal(row.candidate,null);
    assert.ok(row.errors.some(error => error.code === 'invalid_text'));
  }
  assert.equal(result.rows.at(-1).candidate.company_name,good.company_name);
  assert.equal(result.rows.at(-1).candidate.short_description,good.short_description);
  assert.deepEqual(result.rows.at(-1).errors,[]);
});

test('Normalized research domains match the database length bound',() => {
  const domain = [...Array(3).fill('a'.repeat(63)),'b'.repeat(61)].join('.');
  assert.equal(domain.length,253);
  const accepted = validateResearchCandidate(proposal({website:`https://www.${domain}./catalog`})).candidate;
  assert.equal(accepted.normalized_domain,domain);
  const result = validateResearchImport({candidates:[proposal({website:`https://${domain}x/`}),proposal({website:`https://${domain}/`})]});
  assert.equal(result.valid_count,1);
  assert.ok(result.rows[0].errors.some(issue => issue.code === 'invalid_url' && issue.message.includes('253')));
  assert.equal(result.rows[1].candidate.normalized_domain,domain);
});

test('Normalized website URLs cannot expand beyond the database length bound',() => {
  const website = 'https://example.com/'+'\u00e9'.repeat(400);
  assert.ok(website.length < 2048);
  assert.ok(new URL(website).href.length > 2048);
  const result = validateResearchImport({candidates:[proposal({website}),proposal({website:'https://example.com/'+'\u00e9'.repeat(300)})]});
  assert.equal(result.valid_count,1);
  assert.ok(result.rows[0].errors.some(issue => issue.code === 'text_length' && issue.message.includes('normalized URL')));
  assert.ok(result.rows[1].candidate.website.length <= 2048);
});

test('Research dates require real calendar timestamps and preserve unknown retrieval dates',() => {
  for (const last_researched_at of ['yesterday','2026-02-30T12:00:00Z','2026-09-23','2026-09-23T24:00:00Z']) rejects(proposal({last_researched_at}),'invalid_format');
  const {candidate} = validateResearchCandidate(proposal({last_researched_at:'2026-09-23T12:00:00+02:00',sources:[{url:'https://example.com'}]}));
  assert.equal(candidate.last_researched_at,'2026-09-23T10:00:00.000Z');
  assert.equal(candidate.sources[0].retrieved_at,null);
});

test('Batch validation keeps valid rows and indexed errors without committing partial data',() => {
  const result = validateResearchImport({candidates:[proposal(),proposal({fit:'HIGH'}),{company_name:42}]});
  assert.equal(result.schema_version,1);
  assert.equal(result.count,3);
  assert.equal(result.valid_count,1);
  assert.equal(result.rows[1].row,2);
  assert.equal(result.rows[1].candidate,null);
  assert.ok(result.rows[1].errors.some(error => error.code === 'fit_reason_required'));
  assert.equal(result.rows[2].candidate,null);
});

test('Batch envelope is strict and bounded by rows and UTF-8 bytes',() => {
  for (const value of ['{bad','```json\n{}\n```',[],null,{}, {candidates:[]},{schema_version:2,candidates:[proposal()]},{owner_id:'spoof',candidates:[proposal()]},{candidates:Array(101).fill(proposal())}]) assert.throws(() => validateResearchImport(value),{status:400});
  assert.equal(validateResearchImport({candidates:Array(100).fill(proposal())}).valid_count,100);
  assert.throws(() => validateResearchImport(' '.repeat(MAX_RESEARCH_BYTES+1)),{status:413});
  assert.throws(() => validateResearchImport('€'.repeat(Math.ceil(MAX_RESEARCH_BYTES/3))),{status:413});
});

test('CLI exports the canonical schema and validates the documented example without credentials',() => {
  const schema = JSON.parse(execFileSync(process.execPath,['scripts/research-schema.js'],{encoding:'utf8'}));
  assert.deepEqual(schema,RESEARCH_IMPORT_SCHEMA);
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.candidates.maxItems,100);
  const output = execFileSync(process.execPath,['scripts/validate-research.js','docs/examples/research-candidates.v1.json'],{encoding:'utf8'});
  assert.match(output,/1\/1 valid research candidates/);
  assert.match(output,/nothing was saved/);
  assert.throws(() => execFileSync(process.execPath,['scripts/validate-research.js'],{stdio:'pipe'}),error => error.status === 1 && /Usage/.test(error.stderr.toString()));
});
