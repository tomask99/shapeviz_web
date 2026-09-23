import {RESEARCH_SERVICES} from '../../public/admin/service-catalog.js';
import {LEVELS, FACT_STATUSES, SOURCE_ORIGINS, SOURCE_TYPES, OPPORTUNITY_SIGNALS, PROVENANCE_FIELDS} from '../../public/admin/research-options.js';

export const RESEARCH_SCHEMA_VERSION = 1;
export const MAX_RESEARCH_BYTES = 500_000;
const text = (maxLength, options = {}) => ({type:'string', maxLength, default:'', ...options});
const choice = (values, fallback) => ({type:'string', enum:values, ...(fallback === undefined ? {} : {default:fallback})});
const list = (items, maxItems = 30) => ({type:'array', items, maxItems, default:[]});
const strings = (maxItems = 30) => ({...list(text(120,{minLength:1}),maxItems), uniqueItems:true});
const object = (properties, required = []) => ({type:'object', additionalProperties:false, properties, required});
const date = {type:['string','null'], format:'date-time', default:null};
const sourceURL = text(2048,{minLength:1,format:'uri'});
const sourceURLs = {...list(sourceURL,30),uniqueItems:true};
const evidence = {
  status:choice(FACT_STATUSES,'UNKNOWN'),
  confidence:{type:['string','null'],enum:[...LEVELS,null],default:null},
  evidence:text(3000), source_urls:sourceURLs,
};

// One JSON Schema drives structural validation and future prompt/tool exports.
// Cross-field evidence and Fit rules are enforced by validation.js.
export const RESEARCH_CANDIDATE_SCHEMA = object({
  company_name:text(160,{minLength:1}),
  website:text(2048,{description:'An HTTP(S) company URL; a bare domain is also accepted and normalized.'}),
  country:text(2,{pattern:'^(?:[A-Za-z]{2})?$',description:'A two-letter country code (e.g. CZ), or an empty string if unknown.'}),
  city:text(120), industry:text(120), business_type:text(120),
  product_categories:strings(), secondary_categories:strings(), market_segments:strings(),
  positioning:{...object({value:text(120),...evidence}),default:{}},
  short_description:text(3000), research_summary:text(12000),
  potential_services:list(object({
    service:choice(RESEARCH_SERVICES), relevance:choice(LEVELS), reason:text(3000),
  },['service','relevance']),RESEARCH_SERVICES.length),
  opportunity_signals:list(object({
    signal:choice(OPPORTUNITY_SIGNALS),
    status:choice(['VERIFIED','INFERRED'],'INFERRED'),
    confidence:choice(LEVELS), evidence:text(3000,{minLength:1}), source_urls:sourceURLs,
  },['signal','confidence','evidence']),OPPORTUNITY_SIGNALS.length),
  suggested_pitch_angle:text(6000),
  fit:{type:['string','null'],enum:[...LEVELS,null],default:null}, fit_reason:text(3000),
  research_confidence:{type:['string','null'],enum:[...LEVELS,null],default:null},
  sources:list(object({
    url:sourceURL, title:text(300), source_type:choice(SOURCE_TYPES,'Other Public Source'),
    retrieved_at:date, supports:strings(),
  },['url']),50),
  field_provenance:{...object(Object.fromEntries(PROVENANCE_FIELDS.map(field => [field,{...object(evidence),default:{}}]))),default:{}},
  last_researched_at:date,
  source_origin:choice(SOURCE_ORIGINS,'IMPORT'),
},['company_name']);

export const RESEARCH_IMPORT_SCHEMA = {
  $schema:'https://json-schema.org/draft/2020-12/schema',
  title:'Shapeviz Research Import v1',
  description:'Research proposals only. Ownership, workflow status, IDs and audit timestamps are assigned by Shapeviz.',
  ...object({
    schema_version:{type:'integer',enum:[RESEARCH_SCHEMA_VERSION],default:RESEARCH_SCHEMA_VERSION},
    candidates:{...list(RESEARCH_CANDIDATE_SCHEMA,100),minItems:1},
  },['candidates']),
};
