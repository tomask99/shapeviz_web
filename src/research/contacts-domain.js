import {fail,uuid} from '../crm/validation.js';
import {validateResearchCandidate} from './validation.js';
import {RESEARCH_CANDIDATE_SCHEMA} from './schema.js';
import {LEVELS} from '../../public/admin/research-options.js';
import {normalizedName} from '../../public/admin/crm-normalize.js';
import {plain,stableJSON} from './refresh-domain.js';

export const MAX_CONTACT_RESEARCH_BYTES = 200_000;
export const CONTACT_FIELDS = ['full_name','job_title','email','phone','linkedin'];
const limits = {full_name:160,job_title:160,email:254,phone:80,linkedin:2048};
const fieldBridge = {full_name:'company_name',job_title:'city',email:'industry',phone:'business_type',linkedin:'short_description'};
const evidenceSchema = RESEARCH_CANDIDATE_SCHEMA.properties.field_provenance.properties.company_name;
const sourceSchema = RESEARCH_CANDIDATE_SCHEMA.properties.sources.items;
export const RESEARCH_CONTACT_SCHEMA = {
  type:'object',additionalProperties:false,required:['full_name','confidence','sources','field_provenance'],properties:{
    ...Object.fromEntries(CONTACT_FIELDS.map(field => [field,{type:'string',maxLength:limits[field],...(field === 'full_name' ? {minLength:1} : {default:''})}])),
    confidence:{type:'string',enum:LEVELS},sources:{type:'array',minItems:1,maxItems:10,items:sourceSchema},
    field_provenance:{type:'object',additionalProperties:false,properties:Object.fromEntries(CONTACT_FIELDS.map(field => [field,evidenceSchema]))},
  },
};
export const RESEARCH_CONTACT_IMPORT_SCHEMA = {
  $schema:'https://json-schema.org/draft/2020-12/schema',title:'Shapeviz contact research proposals v1',
  type:'object',additionalProperties:false,required:['schema_version','candidate_id','contacts'],properties:{
    schema_version:{type:'integer',const:1},candidate_id:{type:'string',format:'uuid'},contacts:{type:'array',minItems:0,maxItems:20,items:RESEARCH_CONTACT_SCHEMA},
  },
};

function invalid(path,code,message) { return Object.assign(fail(400,message),{issues:[{path,code,message}]}); }
function translated(error) {
  const translate = value => String(value).replace(/candidate\.field_provenance\.(company_name|city|industry|business_type|short_description)/g,(_,field) => `contact.field_provenance.${Object.keys(fieldBridge).find(key => fieldBridge[key] === field)}`).replaceAll('candidate.sources','contact.sources');
  if (!error.issues) return error;
  return Object.assign(fail(400,translate(error.message)),{issues:error.issues.map(issue => ({...issue,path:translate(issue.path),message:translate(issue.message)}))});
}

export function validateResearchContact(input) {
  const allowed = [...CONTACT_FIELDS,'confidence','sources','field_provenance'];
  if (!plain(input) || Object.keys(input).some(key => !allowed.includes(key))) throw invalid('contact','unknown_field','Use only the supported contact proposal fields.');
  const strings = {};
  for (const field of CONTACT_FIELDS) {
    const value = Object.hasOwn(input,field) ? input[field] : (field === 'full_name' ? undefined : '');
    if (typeof value !== 'string' || [...value.trim()].length > limits[field] || /[\u0000\uD800-\uDFFF]/u.test(value)) throw invalid(`contact.${field}`,'invalid_text',`contact.${field}: use a string of at most ${limits[field]} characters without malformed text.`);
    strings[field] = value.trim();
  }
  if (!strings.full_name) throw invalid('contact.full_name','required','A public contact name is required.');
  if (strings.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strings.email)) throw invalid('contact.email','invalid_email','Use a valid public email address; do not guess one.');
  if (strings.linkedin) {
    try {
      if (!/^https?:\/\//i.test(strings.linkedin) || /[\s\u0000-\u001f\u007f\\]/u.test(strings.linkedin)) throw new Error();
      const url = new URL(strings.linkedin);
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      strings.linkedin = url.href;
      if (strings.linkedin.length > limits.linkedin) throw new Error();
    } catch { throw invalid('contact.linkedin','invalid_url','Use a full public HTTP(S) LinkedIn URL without credentials.'); }
  }
  if (!LEVELS.includes(input.confidence)) throw invalid('contact.confidence','invalid_choice','Choose LOW, MEDIUM or HIGH contact confidence.');
  if (!Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > 10) throw invalid('contact.sources','array_size','Each contact needs 1–10 public evidence sources.');
  if (!plain(input.field_provenance) || Object.keys(input.field_provenance).some(field => !CONTACT_FIELDS.includes(field))) throw invalid('contact.field_provenance','invalid_provenance','Use provenance only for the five supported contact fields.');
  // Reuse the canonical source/evidence shape and URL/date/reference checks.
  // The bridge fields carry only text; contact-specific evidence rules follow.
  let canonical;
  try {
    canonical = validateResearchCandidate({
      ...Object.fromEntries(CONTACT_FIELDS.map(field => [fieldBridge[field],strings[field] ? 'Present' : ''])),sources:input.sources,
      field_provenance:Object.fromEntries(CONTACT_FIELDS.filter(field => Object.hasOwn(input.field_provenance,field)).map(field => [fieldBridge[field],input.field_provenance[field]])),
    }).candidate;
  } catch (error) { throw translated(error); }
  const provenance = Object.fromEntries(CONTACT_FIELDS.map(field => [field,canonical.field_provenance[fieldBridge[field]]]));
  const warnings = [];
  for (const field of CONTACT_FIELDS) {
    const proof = provenance[field];
    if (!strings[field]) {
      if (proof.status !== 'UNKNOWN' || proof.confidence !== null || proof.evidence || proof.source_urls.length) throw invalid(`contact.field_provenance.${field}`,'empty_field_evidence',`An empty ${field} must use UNKNOWN without asserted evidence.`);
      continue;
    }
    const allowedStatus = field === 'job_title' ? ['VERIFIED','INFERRED'] : ['VERIFIED'];
    if (!allowedStatus.includes(proof.status) || !LEVELS.includes(proof.confidence) || !proof.evidence || !proof.source_urls.length) throw invalid(`contact.field_provenance.${field}`,'verified_evidence_required',`${field}: provide ${field === 'job_title' ? 'VERIFIED or explained INFERRED' : 'VERIFIED'} public evidence, confidence and a cited source.`);
    if (field === 'job_title' && proof.status === 'INFERRED') warnings.push({path:'contact.job_title',code:'inferred_role_not_copied',message:'The inferred job title remains research only; the CRM contact will have an empty job title.'});
  }
  return {contact:{...strings,confidence:input.confidence,sources:canonical.sources,field_provenance:provenance},warnings};
}

export function validateResearchContactsImport(json,id) {
  if (typeof json !== 'string') throw fail(400,'Paste or upload contact research JSON.');
  if (Buffer.byteLength(json,'utf8') > MAX_CONTACT_RESEARCH_BYTES) throw fail(413,`Contact research exceeds ${MAX_CONTACT_RESEARCH_BYTES} UTF-8 bytes.`);
  let value;
  try { value = JSON.parse(json); } catch { throw fail(400,'Contact research must be valid JSON without Markdown fences.'); }
  if (!plain(value) || Object.keys(value).some(key => !['schema_version','candidate_id','contacts'].includes(key)) || value.schema_version !== 1 || !uuid(value.candidate_id) || value.candidate_id !== id || !Array.isArray(value.contacts) || value.contacts.length > 20) throw fail(400,'Use the contact research envelope for this candidate with 0–20 contacts.');
  const rows = value.contacts.map((input,index) => {
    try { return {row:index+1,...validateResearchContact(input),errors:[]}; }
    catch (error) { if (error.status !== 400) throw error; return {row:index+1,contact:null,warnings:[],errors:error.issues ?? [{path:'contact',code:'invalid_contact',message:error.message}]}; }
  });
  const canonical = stableJSON({...value,contacts:rows.map((row,index) => row.contact ?? value.contacts[index])});
  if (Buffer.byteLength(canonical,'utf8') > MAX_CONTACT_RESEARCH_BYTES) throw fail(413,`Normalized contact research exceeds ${MAX_CONTACT_RESEARCH_BYTES} UTF-8 bytes.`);
  return {count:rows.length,valid_count:rows.filter(row => row.contact).length,rows,canonical};
}

export function sameResearchContact(a,b) {
  const email = value => String(value || '').trim().toLowerCase();
  return !!((email(a.email) && email(a.email) === email(b.email)) || (normalizedName(a.full_name) && normalizedName(a.full_name) === normalizedName(b.full_name)));
}

export function contactReference(candidate) {
  return {company_name:candidate.company_name,website:candidate.website,country:candidate.country};
}

export function staleContactReference(reference,candidate) {
  return ['company_name','website','country'].some(field => reference[field] !== candidate[field]);
}
