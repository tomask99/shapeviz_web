import {fail} from '../crm/validation.js';
import {normalizedURL,normalizedDomain,normalizedName} from '../../public/admin/crm-normalize.js';
import {canonicalService,SERVICE_CATALOG} from '../../public/admin/service-catalog.js';
import {INDUSTRIES,BUSINESS_TYPES,PRODUCT_CATEGORIES,MARKET_SEGMENTS,POSITIONINGS} from '../../public/admin/research-options.js';
import {RESEARCH_CANDIDATE_SCHEMA,RESEARCH_IMPORT_SCHEMA,MAX_RESEARCH_BYTES} from './schema.js';

const plainObject = value => value !== null && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const issue = (issues,path,code,message) => { if (issues.length < 100) issues.push({path,code,message}); };
const invalid = issues => Object.assign(fail(400,issues[0].message),{issues});

function httpURL(value, allowBareDomain = false) {
  if (/[\s\u0000-\u001f\u007f\\]/u.test(value) || (!allowBareDomain && !/^https?:\/\//i.test(value))) throw new Error('Use an HTTP(S) URL without credentials or whitespace.');
  const url = new URL(allowBareDomain ? normalizedURL(value) : value);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) URL without credentials.');
  return url.href;
}

function instant(value) {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) throw new Error();
  const day = new Date(`${value.slice(0,10)}T00:00:00.000Z`);
  if (!Number.isFinite(Date.parse(value)) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== value.slice(0,10)) throw new Error();
  return new Date(value).toISOString();
}

// Deliberately limited to the JSON Schema keywords used in schema.js; not a
// general-purpose validator for arbitrary externally supplied schemas.
function readShape(schema, value, path, issues) {
  if (value === undefined && Object.hasOwn(schema,'default')) value = structuredClone(schema.default);
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (!types.includes(type) && !(types.includes('integer') && Number.isInteger(value))) {
    issue(issues,path,'invalid_type',`${path}: expected ${types.join(' or ')}.`);
    return undefined;
  }
  if (type === 'string') value = value.trim();
  if (schema.enum && !schema.enum.includes(value)) issue(issues,path,'invalid_choice',`${path}: unsupported value ${JSON.stringify(value)}.`);
  if (value === null) return null;
  if (type === 'object') {
    if (!plainObject(value)) {
      issue(issues,path,'invalid_type',`${path}: expected a plain object.`);
      return undefined;
    }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties,key)) issue(issues,`${path}.${key}`,'unknown_field',`${path}.${key}: this field is not accepted in research data.`);
    }
    const output = {};
    for (const [key,child] of Object.entries(schema.properties)) {
      if (schema.required.includes(key) && !Object.hasOwn(value,key)) {
        issue(issues,`${path}.${key}`,'required',`${path}.${key}: this field is required.`);
      } else {
        output[key] = readShape(child,Object.hasOwn(value,key) ? value[key] : undefined,`${path}.${key}`,issues);
      }
    }
    return output;
  }
  if (type === 'array') {
    if (value.length > schema.maxItems || value.length < (schema.minItems ?? 0)) {
      issue(issues,path,'array_size',`${path}: expected ${schema.minItems ?? 0}–${schema.maxItems} items.`);
      return [];
    }
    const output = schema.items ? value.map((item,index) => readShape(schema.items,item,`${path}[${index}]`,issues)) : [...value];
    if (schema.uniqueItems && new Set(output.map(item => JSON.stringify(item))).size !== output.length) issue(issues,path,'duplicate_value',`${path}: repeated values are not allowed.`);
    return output;
  }
  if (type === 'string') {
    // With the Unicode flag, valid surrogate pairs are a single code point and
    // do not match this range. PostgreSQL text/jsonb cannot store NUL or lone
    // surrogates; report them per row before sending anything to the database.
    if (/[\u0000\uD800-\uDFFF]/u.test(value)) issue(issues,path,'invalid_text',`${path}: remove null characters or malformed Unicode.`);
    const length = [...value].length;
    if (length > schema.maxLength || length < (schema.minLength ?? 0)) issue(issues,path,'text_length',`${path}: expected ${schema.minLength ?? 0}–${schema.maxLength} characters.`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) issue(issues,path,'invalid_format',`${path}: ${schema.description ?? 'invalid format'}`);
    try {
      if (schema.format === 'uri') value = httpURL(value);
      if (schema.format === 'date-time') value = instant(value);
    } catch {
      issue(issues,path,'invalid_format',`${path}: use ${schema.format === 'uri' ? 'a full HTTP(S) URL without credentials' : 'a valid ISO timestamp with a timezone'}.`);
    }
  }
  return value;
}

const taxonomies = {
  industry:INDUSTRIES, business_type:BUSINESS_TYPES, product_categories:PRODUCT_CATEGORIES,
  secondary_categories:PRODUCT_CATEGORIES, market_segments:MARKET_SEGMENTS,
};

function taxonomy(value, options, path, warnings) {
  if (!value) return value;
  const known = options.find(option => option.toLowerCase() === value.toLowerCase());
  if (!known) issue(warnings,path,'unknown_category',`${path}: ${JSON.stringify(value)} is a custom category; review before importing.`);
  return known ?? value;
}

function checkEvidence(item, path, sourceURLs, issues) {
  if (item.status === 'VERIFIED' && item.source_urls.length === 0) issue(issues,path,'source_required',`${path}: VERIFIED data requires a source.`);
  if (item.status === 'INFERRED' && !item.evidence) issue(issues,path,'evidence_required',`${path}: explain the inference.`);
  for (const [index,url] of item.source_urls.entries()) {
    if (!sourceURLs.has(url)) issue(issues,`${path}.source_urls[${index}]`,'missing_source',`${path}: referenced URL is missing from sources.`);
  }
}

/** Pure validation: accepts research proposals, never owner IDs or workflow state. */
export function validateResearchCandidate(input) {
  const issues = [], warnings = [];
  // Accept the CRM's historical capitalization without creating another catalog.
  if (plainObject(input) && Array.isArray(input.potential_services)) {
    input = {...input,potential_services:input.potential_services.map(item => plainObject(item) ? {...item,service:canonicalService(item.service) ?? item.service} : item)};
  }
  const candidate = readShape(RESEARCH_CANDIDATE_SCHEMA,input,'candidate',issues);
  if (issues.length) throw invalid(issues);
  try { if (candidate.website) candidate.website = httpURL(candidate.website,true); }
  catch { issue(issues,'candidate.website','invalid_url','candidate.website: use an HTTP(S) website without credentials or whitespace.'); }
  const maxWebsiteLength = RESEARCH_CANDIDATE_SCHEMA.properties.website.maxLength;
  if (candidate.website.length > maxWebsiteLength) issue(issues,'candidate.website','text_length',`candidate.website: the normalized URL must be at most ${maxWebsiteLength} characters.`);
  const domain = normalizedDomain(candidate.website);
  if (domain.length > 253) issue(issues,'candidate.website','invalid_url','candidate.website: the normalized domain must be at most 253 characters.');
  candidate.country = candidate.country.toUpperCase();
  for (const [field,options] of Object.entries(taxonomies)) {
    const value = candidate[field];
    candidate[field] = Array.isArray(value)
      ? value.map((entry,index) => taxonomy(entry,options,`candidate.${field}[${index}]`,warnings))
      : taxonomy(value,options,`candidate.${field}`,warnings);
    if (Array.isArray(value) && new Set(candidate[field].map(entry => entry.toLowerCase())).size !== value.length) issue(issues,`candidate.${field}`,'duplicate_value',`candidate.${field}: repeated categories are not allowed.`);
  }
  candidate.positioning.value = taxonomy(candidate.positioning.value,POSITIONINGS,'candidate.positioning.value',warnings);
  if (candidate.fit && !candidate.fit_reason) issue(issues,'candidate.fit_reason','fit_reason_required','candidate.fit_reason: explain the assigned Fit.');
  if (!candidate.fit && candidate.fit_reason) issue(issues,'candidate.fit','fit_required','candidate.fit: select a Fit for this explanation, or leave both empty.');
  if (candidate.positioning.value && candidate.positioning.status === 'UNKNOWN') issue(issues,'candidate.positioning.status','provenance_required','candidate.positioning: label the proposed positioning VERIFIED or INFERRED.');
  const sourceURLs = new Set(candidate.sources.map(source => source.url));
  if (sourceURLs.size !== candidate.sources.length) issue(issues,'candidate.sources','duplicate_source','candidate.sources: each source URL must occur only once.');
  checkEvidence(candidate.positioning,'candidate.positioning',sourceURLs,issues);
  if (!candidate.positioning.value && candidate.positioning.status !== 'UNKNOWN') issue(issues,'candidate.positioning.value','value_required','candidate.positioning: add the positioning value or use UNKNOWN.');
  for (const [field,provenance] of Object.entries(candidate.field_provenance)) {
    checkEvidence(provenance,`candidate.field_provenance.${field}`,sourceURLs,issues);
    if (provenance.status !== 'UNKNOWN' && !candidate[field].length) issue(issues,`candidate.field_provenance.${field}`,'value_required',`candidate.${field}: cannot label a missing value VERIFIED or INFERRED.`);
  }
  const signals = new Set();
  candidate.opportunity_signals.forEach((signal,index) => {
    const path = `candidate.opportunity_signals[${index}]`;
    checkEvidence(signal,path,sourceURLs,issues);
    if (signals.has(signal.signal)) issue(issues,path,'duplicate_signal',`${path}: combine the evidence for the repeated signal.`);
    signals.add(signal.signal);
  });
  const services = new Set();
  candidate.potential_services.forEach((service,index) => {
    const path = `candidate.potential_services[${index}].service`;
    if (services.has(service.service)) issue(issues,path,'duplicate_service',`${path}: repeated service recommendations are not allowed.`);
    services.add(service.service);
    if (!SERVICE_CATALOG.find(entry => entry.name === service.service).crmValue) issue(warnings,path,'crm_service_pending',`${service.service} is valid research data; CRM catalog support is scheduled with lead approval.`);
  });
  if (issues.length) throw invalid(issues);
  if (!candidate.website) issue(warnings,'candidate.website','missing_website','No company website was provided; domain duplicate checking will be unavailable.');
  if (!candidate.sources.length) issue(warnings,'candidate.sources','missing_sources','No sources were provided; research needs review.');
  return {
    candidate:{...candidate,normalized_company_name:normalizedName(candidate.company_name),normalized_domain:domain},
    warnings,
  };
}

/** Validate a bounded JSON batch, retaining row errors for a later import preview. */
export function validateResearchImport(input) {
  let serialized;
  try { serialized = typeof input === 'string' ? input : JSON.stringify(input); }
  catch { throw fail(400,'Research import must be JSON.'); }
  if (typeof serialized !== 'string') throw fail(400,'Research import must be JSON.');
  if (Buffer.byteLength(serialized,'utf8') > MAX_RESEARCH_BYTES) throw fail(413,`Research import exceeds ${MAX_RESEARCH_BYTES} bytes.`);
  let value;
  try { value = JSON.parse(serialized); }
  catch { throw fail(400,'Research import must be valid JSON without markdown fences.'); }
  const issues = [];
  // Validate the envelope first; candidate errors belong to individual rows.
  const envelope = readShape({...RESEARCH_IMPORT_SCHEMA,properties:{
    ...RESEARCH_IMPORT_SCHEMA.properties,
    candidates:{...RESEARCH_IMPORT_SCHEMA.properties.candidates,items:undefined},
  }},value,'import',issues);
  if (issues.length) throw invalid(issues);
  const rows = envelope.candidates.map((input,index) => {
    try { return {row:index+1,...validateResearchCandidate(input),errors:[]}; }
    catch (error) {
      if (error.status !== 400) throw error;
      return {row:index+1,candidate:null,warnings:[],errors:error.issues};
    }
  });
  return {schema_version:envelope.schema_version,count:rows.length,valid_count:rows.filter(row => !row.errors.length).length,rows};
}
