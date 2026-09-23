import {fail,uuid} from '../crm/validation.js';
import {READ_TOOLS} from './catalog.js';
import {readInsight} from '../research/enrich.js';
import {researchExcludedDomains} from '../research/exclusions.js';
import {candidateProposal,plain,REFRESH_CANDIDATE_FIELDS} from '../research/refresh-domain.js';
import {validateResearchCandidate} from '../research/validation.js';
import {RESEARCH_IMPORT_SCHEMA,MAX_RESEARCH_BYTES} from '../research/schema.js';
import {researchFilters} from '../../public/admin/research-filters.js';
import {normalizedURL,normalizedDomain,normalizedName} from '../../public/admin/crm-normalize.js';
import {STATUSES} from '../../public/admin/crm-options.js';
import {SERVICE_CATALOG,RESEARCH_SERVICES,CRM_SERVICES} from '../../public/admin/service-catalog.js';
import {IDEAL_CLIENT_PROFILES,INDUSTRIES,BUSINESS_TYPES,PRODUCT_CATEGORIES,MARKET_SEGMENTS,POSITIONINGS,LEVELS,FACT_STATUSES,OPPORTUNITY_SIGNALS,SOURCE_TYPES,SOURCE_ORIGINS,RESEARCH_STATUSES} from '../../public/admin/research-options.js';

const COMPANY_FIELDS = ['id','company_name','website','country','city','industry','short_description','services','fit','pipeline_status','archived_at','version','is_client'];
const CANDIDATE_METADATA = ['id','version','research_status','approved_company_id','created_at','updated_at'];
const LIST_FIELDS = ['id','company_name','normalized_domain','country','country_category','city','industry','business_type','product_categories','market_segments','positioning_value','positioning_status','fit','research_confidence','research_status','source_origin','source_count','signal_count','created_at','last_researched_at','summary','best_services','top_signals','approved_company_id'];
const pick = (value,keys) => Object.fromEntries(keys.map(key => [key,value[key]]));
const malformed = () => fail(502,'The requested data could not be loaded completely.');
const validText = (value,max = 3000) => typeof value === 'string' && [...value].length <= max && !/[\u0000\uD800-\uDFFF]/u.test(value);
const validDate = value => value === null || (typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)));
const validDomain = value => validText(value,253) && !!value && !/[\s\u0000-\u001f\u007f\\/@?#]/u.test(value) && normalizedDomain(value) === value;
const validVersion = value => Number.isSafeInteger(value) && value >= 1;
const validStrings = (value,maxItems,maxLength) => Array.isArray(value) && value.length <= maxItems && value.every(item => validText(item,maxLength)) && new Set(value).size === value.length;
const count = value => Number.isSafeInteger(value) && value >= 0;

function bounded(value,max = 1_000_000) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch { throw malformed(); }
  if (typeof encoded !== 'string') throw malformed();
  if (Buffer.byteLength(encoded,'utf8') > max) throw fail(413,'The tool result is too large. No incomplete result was returned.');
  return value;
}

function validateShape(schema,value) {
  const invalid = () => fail(400,'Invalid read-tool arguments. Use the tool input schema.');
  if (schema.type === 'object') {
    if (!plain(value) || Object.keys(value).some(key => !Object.hasOwn(schema.properties,key)) || schema.required.some(key => !Object.hasOwn(value,key))) throw invalid();
    for (const [key,item] of Object.entries(value)) validateShape(schema.properties[key],item);
    if (schema.anyOf && !schema.anyOf.some(option => option.required.every(key => Object.hasOwn(value,key)))) throw invalid();
  } else if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value) || value < schema.minimum || value > schema.maximum) throw invalid();
  } else if (schema.type === 'string') {
    if (!validText(value,schema.maxLength ?? 2048) || /[\u0000-\u001f\u007f]/u.test(value) || (schema.enum && !schema.enum.includes(value)) || (schema.pattern && !new RegExp(schema.pattern).test(value)) || (schema.format === 'uuid' && !uuid(value))) throw invalid();
  } else throw invalid();
}

function identity({user,token}) {
  if (!uuid(user?.id) || typeof token !== 'string' || !token.trim()) throw fail(401,'Please sign in.');
}

function grants(scopes) {
  if (!Array.isArray(scopes) || scopes.some(scope => typeof scope !== 'string')) throw fail(403,'Read-tool access is not granted.');
  return new Set(scopes);
}

async function membership({user,token,call}) {
  const rows = await call(`/rest/v1/presentation_admins?user_id=eq.${user.id}&role=eq.owner&select=user_id,role&limit=1`,{token});
  if (!Array.isArray(rows) || rows.length > 1 || (rows.length && (!plain(rows[0]) || rows[0].user_id !== user.id || rows[0].role !== 'owner'))) throw malformed();
  if (!rows.length) throw fail(403,'Owner access is required.');
}

function pageResult(value,page,pageSize,project,key = 'items') {
  bounded(value);
  if (!plain(value) || !Array.isArray(value[key]) || !count(value.total) || value.page !== page || value.pageSize !== pageSize || value[key].length !== Math.min(pageSize,Math.max(0,value.total-(page-1)*pageSize))) throw malformed();
  const hasMore = page*pageSize < value.total;
  if (Object.hasOwn(value,'hasMore') && value.hasMore !== hasMore) throw malformed();
  return {[key]:value[key].map(project),total:value.total,page,pageSize,hasMore};
}

function companyRow(row) {
  if (!plain(row) || !uuid(row.id) || !validVersion(row.version) || !validText(row.company_name,160) || !row.company_name || !validText(row.website,2048) || !validText(row.country,2) || !/^(?:[A-Z]{2})?$/.test(row.country) || !validText(row.city,120) || !validText(row.industry,120) || !validText(row.short_description,3000) || !validStrings(row.services,CRM_SERVICES.length,120) || row.services.some(service => !CRM_SERVICES.includes(service)) || ![null,...LEVELS].includes(row.fit) || !STATUSES.includes(row.pipeline_status) || !validDate(row.archived_at) || typeof row.is_client !== 'boolean') throw malformed();
  return structuredClone(pick(row,COMPANY_FIELDS));
}

function storedResearch(row) {
  if (!plain(row) || REFRESH_CANDIDATE_FIELDS.some(key => !Object.hasOwn(row,key))) throw malformed();
  bounded(row,MAX_RESEARCH_BYTES);
  try { return candidateProposal(validateResearchCandidate(candidateProposal(row)).candidate); }
  catch { throw malformed(); }
}

function researchListRow(row) {
  if (!plain(row) || !uuid(row.id) || !validText(row.company_name,160) || !row.company_name || !validText(row.normalized_domain,253) || !validText(row.country,2) || !['SK','CZ','INT'].includes(row.country_category) || ['city','industry','business_type','positioning_value'].some(key => !validText(row[key],120)) || !FACT_STATUSES.includes(row.positioning_status) || !validStrings(row.product_categories,30,120) || !validStrings(row.market_segments,30,120) || ![null,...LEVELS].includes(row.fit) || ![null,...LEVELS].includes(row.research_confidence) || !Object.hasOwn(RESEARCH_STATUSES,row.research_status) || !SOURCE_ORIGINS.includes(row.source_origin) || !count(row.source_count) || row.source_count > 50 || !count(row.signal_count) || row.signal_count > OPPORTUNITY_SIGNALS.length || !validDate(row.created_at) || row.created_at === null || !validDate(row.last_researched_at) || !validText(row.summary,260) || !validStrings(row.best_services,3,120) || row.best_services.some(service => !RESEARCH_SERVICES.includes(service)) || !validStrings(row.top_signals,3,120) || row.top_signals.some(signal => !OPPORTUNITY_SIGNALS.includes(signal)) || !(row.approved_company_id === null || uuid(row.approved_company_id))) throw malformed();
  return structuredClone(pick(row,LIST_FIELDS));
}

function duplicateIdentity(args) {
  let website = '',domain = '';
  if (args.website) {
    if (args.website.startsWith('/') || /[\s\u0000-\u001f\u007f\\]/u.test(args.website)) throw fail(400,'Use an HTTP(S) website without credentials or whitespace.');
    try { website = normalizedURL(args.website);domain = normalizedDomain(website); } catch { throw fail(400,'Use a valid HTTP(S) company website.'); }
    if (!domain || domain.length > 253 || website.length > 2048) throw fail(400,'Use a valid HTTP(S) company website.');
  }
  const name = normalizedName(args.company_name),country = args.country?.toUpperCase() ?? '';
  if (!domain && !(name && country)) throw fail(400,'Supply a website domain or a company name and country.');
  return {website,normalized_domain:domain,normalized_company_name:name,country};
}

async function duplicates(args,context) {
  const checked = duplicateIdentity(args);
  const response = bounded(await context.call('/rest/v1/rpc/crm_research_duplicates',{token:context.token,method:'POST',body:{p_rows:[{row:1,normalized_domain:checked.normalized_domain,normalized_company_name:checked.normalized_company_name,country:checked.country}]}}));
  if (!Array.isArray(response) || response.length !== 1) throw malformed();
  const row = response[0];
  if (!plain(row) || row.row !== 1 || !Array.isArray(row.matches) || !count(row.match_count) || row.matches.length !== Math.min(10,row.match_count)) throw malformed();
  const matches = row.matches.map(match => {
    if (!plain(match) || !['company','candidate'].includes(match.kind) || !uuid(match.id) || !validText(match.company_name,160) || !validText(match.website,2048) || !validText(match.country,2) || !(match.kind === 'company' ? STATUSES.includes(match.status) : Object.hasOwn(RESEARCH_STATUSES,match.status)) || !validDate(match.archived_at) || !['domain','name_country'].includes(match.match)) throw malformed();
    return pick(match,['kind','id','company_name','website','country','status','archived_at','match']);
  });
  return {checked,matches,match_count:row.match_count,truncated:row.match_count > matches.length};
}

async function lead(id,context) {
  const {user,token,call} = context;
  const rows = bounded(await call(`/rest/v1/crm_companies?id=eq.${id}&owner_id=eq.${user.id}&select=${COMPANY_FIELDS.filter(key => key !== 'is_client').join(',')},crm_clients(company_id)&limit=1`,{token}));
  if (!Array.isArray(rows) || rows.length > 1) throw malformed();
  if (!rows.length) throw fail(404,'Company not found.');
  const row = rows[0];
  if (!plain(row) || row.id !== id || !Object.hasOwn(row,'crm_clients')) throw malformed();
  // PostgREST embeds the unique company/client relationship as object-or-null;
  // array form is also safe for deployments that infer a to-many relation.
  const clients = row.crm_clients === null ? [] : Array.isArray(row.crm_clients) ? row.crm_clients : [row.crm_clients];
  if (clients.length > 1 || clients.some(client => !plain(client) || client.company_id !== id)) throw malformed();
  const company = companyRow({...row,is_client:clients.length > 0});
  // Reuse the established Insight lookup, but guard its raw upstream results.
  // This does not request contact existence or history pages.
  const scopedCall = async(path,request) => {
    const result = bounded(await call(path,request));
    if (!Array.isArray(result) || result.length > 1) throw malformed();
    const item = result[0];
    if (item) {
      if (!plain(item) || !uuid(item.id)) throw malformed();
      if (path.startsWith('/rest/v1/crm_company_research?')) {
        if (item.company_id !== id || !validVersion(item.company_version) || !validDate(item.created_at) || item.created_at === null) throw malformed();
        storedResearch(item.research);
      } else {
        if (!validDate(item.approved_at) || item.approved_at === null) throw malformed();
        storedResearch(item);
      }
    }
    return result;
  };
  let insight;
  try { insight = await readInsight({companyId:id,user,token,call:scopedCall}); }
  catch (error) { if (error.status === 400) throw malformed();throw error; }
  return {company,...insight};
}

async function candidate(id,{user,token,call}) {
  const rows = bounded(await call(`/rest/v1/crm_research_candidates?id=eq.${id}&owner_id=eq.${user.id}&select=${[...CANDIDATE_METADATA,...REFRESH_CANDIDATE_FIELDS].join(',')}&limit=1`,{token}));
  if (!Array.isArray(rows) || rows.length > 1) throw malformed();
  if (!rows.length) throw fail(404,'Research candidate not found.');
  const row = rows[0];
  if (!plain(row) || row.id !== id || !validVersion(row.version) || !Object.hasOwn(RESEARCH_STATUSES,row.research_status) || !(row.approved_company_id === null || uuid(row.approved_company_id)) || !validDate(row.created_at) || !row.created_at || !validDate(row.updated_at) || !row.updated_at) throw malformed();
  return {candidate:{...pick(row,CANDIDATE_METADATA),...storedResearch(row)}};
}

function researchCatalog() {
  return structuredClone({services:SERVICE_CATALOG,ideal_client_profiles:IDEAL_CLIENT_PROFILES,profile_guidance:'Ideal client profiles guide research; they are not scores or verified company facts.',industries:INDUSTRIES,business_types:BUSINESS_TYPES,product_categories:PRODUCT_CATEGORIES,market_segments:MARKET_SEGMENTS,positioning:POSITIONINGS,levels:LEVELS,fact_statuses:FACT_STATUSES,signals:OPPORTUNITY_SIGNALS,source_types:SOURCE_TYPES,source_origins:SOURCE_ORIGINS,import_schema:RESEARCH_IMPORT_SCHEMA});
}

/** Every transport must first verify the identity represented by user + token. */
export async function listReadTools(context) {
  identity(context);
  context = {...context,user:{...context.user,id:context.user.id.toLowerCase()}};
  const allowed = grants(context.scopes);
  await membership(context);
  return structuredClone(READ_TOOLS.filter(tool => tool.required_scopes.every(scope => allowed.has(scope))));
}

export async function executeReadTool({name,args,...context}) {
  identity(context);
  context = {...context,user:{...context.user,id:context.user.id.toLowerCase()}};
  const definition = READ_TOOLS.find(tool => tool.name === name);
  if (!definition) throw fail(400,'Unknown read tool.');
  validateShape(definition.inputSchema,args);
  const allowed = grants(context.scopes);
  if (!definition.required_scopes.every(scope => allowed.has(scope))) throw fail(403,'The required read scopes are not granted.');
  // Complete normalization before querying business data, including duplicate
  // identity semantics not expressible by the small static input schemas.
  if (name === 'check_company_duplicates') duplicateIdentity(args);
  let filters;
  if (name === 'get_research_candidates') {
    try { filters = researchFilters(args.filters); } catch { throw fail(400,'Invalid research filters.'); }
  }
  await membership(context);
  const {token,call} = context,page = args.page ?? 1;
  let result;
  switch (name) {
    case 'search_leads': {
      filters = Object.fromEntries(Object.entries(args.filters ?? {}).map(([key,value]) => [key,key === 'country' ? value.toUpperCase() : key === 'service' ? SERVICE_CATALOG.find(service => service.name === value).crmValue : value.trim()]));
      result = pageResult(await call('/rest/v1/rpc/crm_tool_search_leads',{token,method:'POST',body:{p_filters:filters,p_page:page}}),page,25,companyRow);break;
    }
    case 'get_lead': result = await lead(args.id.toLowerCase(),context);break;
    case 'check_company_duplicates': result = await duplicates(args,context);break;
    case 'get_research_candidates': result = pageResult(await call('/rest/v1/rpc/crm_research_list',{token,method:'POST',body:{p_filters:filters,p_page:page}}),page,25,researchListRow);break;
    case 'get_research_candidate': result = await candidate(args.id.toLowerCase(),context);break;
    case 'get_existing_domains': {
      const domains = await researchExcludedDomains({token,call:async(path,request) => {
        // The existing RPC loads at most 10,001 domain names to prove whether
        // the exclusion set overflowed. Only a 100-domain page is returned.
        const response = bounded(await call(path,request),2_600_500);
        if (!plain(response) || !Array.isArray(response.domains) || response.domains.length > 10001 || (!response.overflow && response.domains.length > 10000) || response.domains.some(domain => !validDomain(domain)) || new Set(response.domains).size !== response.domains.length) throw malformed();
        return response;
      }});
      result = {domains:domains.slice((page-1)*100,page*100),total:domains.length,page,pageSize:100,hasMore:page*100 < domains.length};break;
    }
    case 'get_rejected_domains': {
      result = pageResult(await call('/rest/v1/rpc/crm_tool_rejected_domains',{token,method:'POST',body:{p_page:page}}),page,100,domain => {if (!validDomain(domain)) throw malformed();return domain;},'domains');
      if (new Set(result.domains).size !== result.domains.length || result.domains.some((domain,index) => index > 0 && domain <= result.domains[index-1])) throw malformed();break;
    }
    case 'get_research_catalog': result = researchCatalog();break;
    default: throw fail(400,'Unknown read tool.');
  }
  return bounded(result);
}
