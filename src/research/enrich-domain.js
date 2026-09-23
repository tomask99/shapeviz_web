import {fail,uuid} from '../crm/validation.js';
import {normalizedDomain} from '../../public/admin/crm-normalize.js';
import {SERVICE_CATALOG} from '../../public/admin/service-catalog.js';
import {MAX_RESEARCH_BYTES,RESEARCH_CANDIDATE_SCHEMA} from './schema.js';
import {validateResearchCandidate} from './validation.js';
import {candidateProposal,plain,REFRESH_CANDIDATE_FIELDS,stableJSON} from './refresh-domain.js';

export const ENRICH_FIELDS = ['city','industry','short_description','services','fit'];
export const validEnrichmentVersion = value => Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
export const validEnrichmentFields = value => Array.isArray(value) && value.length <= ENRICH_FIELDS.length && value.every(field => ENRICH_FIELDS.includes(field)) && new Set(value).size === value.length;
const envelopeFields = ['schema_version','company_id','base_version','research'];
const labels = {city:'City',industry:'Industry',short_description:'Description',services:'Recommended services',fit:'Fit'};
const populated = value => Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '';

export function enrichmentSchema(company) {
  return {$schema:'https://json-schema.org/draft/2020-12/schema',title:'Shapeviz company enrichment v1',type:'object',additionalProperties:false,required:envelopeFields,properties:{
    schema_version:{type:'integer',const:1},company_id:{type:'string',const:company.id},base_version:{type:'integer',const:company.version},
    research:{...RESEARCH_CANDIDATE_SCHEMA,required:REFRESH_CANDIDATE_FIELDS,properties:{...RESEARCH_CANDIDATE_SCHEMA.properties,company_name:{type:'string',const:company.company_name},website:{type:'string',const:company.website},country:{type:'string',const:company.country},source_origin:{type:'string',const:'ENRICHMENT'}}},
  }};
}

/** Canonical full report, independent of current CRM state so exact retries work. */
export function validateEnrichmentProposal(input,companyId,now = Date.now()) {
  let serialized;
  try { serialized = typeof input === 'string' ? input : JSON.stringify(input); }
  catch { throw fail(400,'Company enrichment must be JSON.'); }
  if (typeof serialized !== 'string') throw fail(400,'Company enrichment must be JSON.');
  if (Buffer.byteLength(serialized,'utf8') > MAX_RESEARCH_BYTES) throw fail(413,`Company enrichment exceeds ${MAX_RESEARCH_BYTES} UTF-8 bytes.`);
  let value;
  try { value = JSON.parse(serialized); }
  catch { throw fail(400,'Paste valid enrichment JSON without Markdown fences.'); }
  if (!plain(value) || envelopeFields.some(field => !Object.hasOwn(value,field)) || Object.keys(value).some(field => !envelopeFields.includes(field)) || value.schema_version !== 1 || !uuid(value.company_id) || value.company_id !== companyId || !validEnrichmentVersion(value.base_version)) throw fail(400,'Use the enrichment envelope for this company and its current version.');
  if (!plain(value.research) || REFRESH_CANDIDATE_FIELDS.some(field => !Object.hasOwn(value.research,field))) throw fail(400,'Enrichment requires every canonical research field, including unknown values.');
  const {candidate,warnings} = validateResearchCandidate(value.research),research = candidateProposal(candidate);
  if (research.source_origin !== 'ENRICHMENT') throw fail(400,'Company enrichment requires source_origin ENRICHMENT.');
  if (!research.sources.length) throw fail(400,'Company enrichment requires at least one public source.');
  if (research.potential_services.some(service => !service.reason)) throw fail(400,'Explain every recommended service before accepting company enrichment.');
  if (research.last_researched_at && Date.parse(research.last_researched_at) > now + 5 * 60 * 1000) throw fail(400,'Last researched cannot be in the future. Use the actual research timestamp or null.');
  if (research.last_researched_at && Date.parse(research.last_researched_at) < now - 90 * 24 * 60 * 60 * 1000) warnings.push({path:'research.last_researched_at',code:'older_research',message:'This research is more than 90 days old. Check whether its facts and recommendations are still current.'});
  return {proposal:{schema_version:1,company_id:companyId,base_version:value.base_version,research},warnings};
}

export function assertEnrichmentCompany(company,proposal) {
  if (company.archived_at) throw fail(409,'Restore this archived company before preparing or accepting enrichment.');
  if (proposal && company.version !== proposal.base_version) throw fail(409,'This company changed. Reload it and prepare a new enrichment preview.');
  if (proposal && (proposal.research.company_name !== company.company_name || proposal.research.country !== company.country || normalizedDomain(proposal.research.website) !== normalizedDomain(company.website))) throw fail(400,'Enrichment must preserve the current company name, website identity and country.');
}

function proposedValues(research) {
  return {city:research.city,industry:research.industry,short_description:research.short_description,services:research.potential_services.map(service => SERVICE_CATALOG.find(entry => entry.name === service.service).crmValue),fit:research.fit};
}

/** Validate only selected CRM targets; a valid Insight can hold longer Unicode text. */
export function enrichmentValues(research,validateCompany,fields = ENRICH_FIELDS) {
  if (typeof validateCompany !== 'function') throw fail(503,'Company enrichment validation is unavailable.');
  const proposed = proposedValues(research);
  const selected = Object.fromEntries(fields.map(field => [field,proposed[field]]));
  if (selected.fit === null) selected.fit = '';
  // Required creation defaults satisfy the shared validator only. The return
  // whitelist prevents them from being copied to an existing Lead or Client.
  const values = validateCompany({company_name:research.company_name,website:research.website,country:research.country,
    city:'',industry:'',short_description:'',services:[],fit:'',...selected,
    priority:'MEDIUM',pipeline_status:'NEW_LEAD',lead_source:'AI Research',
  });
  return Object.fromEntries(fields.map(field => [field,values[field]]));
}

export function enrichmentGroups(company,research,validateCompany) {
  const values = proposedValues(research);
  return ENRICH_FIELDS.map(key => {
    const before = company[key] ?? (key === 'services' ? [] : key === 'fit' ? null : ''),after = values[key];
    const evidence = key === 'services' ? research.potential_services : key === 'fit' ? {fit:research.fit,fit_reason:research.fit_reason} : research.field_provenance[key];
    const supported = ['city','industry','short_description'].includes(key) ? evidence.status === 'VERIFIED' && evidence.source_urls.length > 0 : key === 'services' ? research.potential_services.every(service => !!service.reason) : !!research.fit_reason;
    let crmValid = true;
    try { enrichmentValues(research,validateCompany,[key]); }
    catch (error) { if (error.status !== 400) throw error; crmValid = false; }
    const same = stableJSON(before) === stableJSON(after),eligible = populated(after) && supported && crmValid && !same;
    const reason = !populated(after) ? 'No proposed value; existing CRM data will not be cleared.' : same ? 'Already matches the current CRM value.' : !supported ? 'This fact needs VERIFIED provenance with a public source before it can be copied into the CRM.' : !crmValid ? 'This value exceeds the CRM field limits. It can remain in the accepted Insight.' : populated(before) ? 'Select this change and explicitly allow replacement of the current CRM value.' : 'Available to copy after explicit selection.';
    return {key,label:labels[key],before,after,protected:populated(before),eligible,reason,evidence};
  });
}

export function enrichmentChoices(selectedFields,overwriteFields,eligible,protectedFields) {
  if (!validEnrichmentFields(selectedFields) || !validEnrichmentFields(overwriteFields) || selectedFields.some(field => !eligible.includes(field))) throw fail(400,'Select only eligible changes from this enrichment preview.');
  const selected = [...selectedFields].sort(),overrides = [...overwriteFields].sort();
  const expected = selected.filter(field => protectedFields.includes(field));
  if (stableJSON(overrides) !== stableJSON(expected)) throw fail(400,'Explicitly acknowledge exactly the selected CRM values that will be replaced.');
  return {selected,overrides};
}
