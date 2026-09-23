import {fail,uuid} from '../crm/validation.js';
import {validateResearchCandidate} from './validation.js';
import {MAX_RESEARCH_BYTES,RESEARCH_CANDIDATE_SCHEMA} from './schema.js';
import {PROVENANCE_FIELDS} from '../../public/admin/research-options.js';

export const REFRESH_CANDIDATE_FIELDS = Object.keys(RESEARCH_CANDIDATE_SCHEMA.properties);
export const REFRESH_MODES = ['deeper','refresh'];
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const envelopeFields = ['schema_version','candidate_id','base_version','mode','candidate'];
const factFields = new Set(PROVENANCE_FIELDS);
const labels = {company_name:'Company name',website:'Website',country:'Country',city:'City',industry:'Industry',business_type:'Business type',product_categories:'Product categories',secondary_categories:'Secondary categories',market_segments:'Market segments',positioning:'Positioning',short_description:'Description',research_summary:'Research summary',potential_services:'Recommended services',opportunity_signals:'Opportunity signals',suggested_pitch_angle:'Suggested pitch angle',fit:'Fit and reason',research_confidence:'Research confidence',sources:'Add research sources',last_researched_at:'Last researched'};
export const REFRESH_GROUP_KEYS = REFRESH_CANDIDATE_FIELDS.filter(field => !['fit_reason','field_provenance','source_origin'].includes(field));

export function stableJSON(value) {
  const sorted = value => Array.isArray(value) ? value.map(sorted) : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key,sorted(value[key])])) : value;
  return JSON.stringify(sorted(value));
}

export function candidateProposal(candidate) {
  return Object.fromEntries(REFRESH_CANDIDATE_FIELDS.map(field => [field,candidate[field]]));
}

export function validateResearchRefreshProposal(input,id,version) {
  let serialized;
  try { serialized = JSON.stringify(input); }
  catch { throw fail(400,'Research updates must be a JSON object.'); }
  if (typeof serialized !== 'string' || !plain(input)) throw fail(400,'Research updates must be a JSON object.');
  if (Buffer.byteLength(serialized,'utf8') > MAX_RESEARCH_BYTES) throw fail(413,`Research updates exceed ${MAX_RESEARCH_BYTES} UTF-8 bytes.`);
  if (Object.keys(input).some(key => !envelopeFields.includes(key)) || envelopeFields.some(key => !Object.hasOwn(input,key)) || input.schema_version !== 1 || !uuid(input.candidate_id) || input.candidate_id !== id || input.base_version !== version || !REFRESH_MODES.includes(input.mode)) throw fail(400,'Use the update envelope for this candidate, version and research mode.');
  if (!plain(input.candidate) || REFRESH_CANDIDATE_FIELDS.some(field => !Object.hasOwn(input.candidate,field))) throw fail(400,'Research updates require the complete canonical candidate, including unchanged fields.');
  const validated = validateResearchCandidate(input.candidate);
  return {proposal:{schema_version:1,candidate_id:id,base_version:version,mode:input.mode,candidate:candidateProposal(validated.candidate)},warnings:validated.warnings};
}

function validResearchDate(before,after,now) {
  if (before === after) return;
  if (before && (!after || Date.parse(after) < Date.parse(before))) throw fail(400,'Last researched cannot move backwards or erase a known research date.');
  if (after && Date.parse(after) > now + 5 * 60 * 1000) throw fail(400,'Last researched cannot be in the future. Use the actual research timestamp.');
}

/** Only new URLs are appended. Stored citations and their metadata are immutable here. */
function appendSources(current,incoming) {
  const previous = new Map(current.map(source => [source.url,source]));
  const warnings = [];
  for (const source of incoming) {
    if (previous.has(source.url) && stableJSON(source) !== stableJSON(previous.get(source.url))) warnings.push({path:'candidate.sources',code:'source_metadata_preserved',message:`Existing source metadata was retained for ${source.url}. Refresh can add sources, not rewrite their history.`});
  }
  return {sources:[...current,...incoming.filter(source => !previous.has(source.url))],warnings};
}

function values(candidate,key) {
  if (factFields.has(key)) return {value:candidate[key],provenance:candidate.field_provenance[key]};
  if (key === 'fit') return {fit:candidate.fit,fit_reason:candidate.fit_reason};
  return candidate[key];
}

/** Build independently selectable, evidence-preserving changes without writing data. */
export function researchRefreshGroups(existing,incoming,now = Date.now()) {
  const current = candidateProposal(validateResearchCandidate(candidateProposal(existing)).candidate);
  if (incoming.source_origin !== current.source_origin) throw fail(400,'Research refresh must preserve the original source origin.');
  validResearchDate(current.last_researched_at,incoming.last_researched_at,now);
  const appended = appendSources(current.sources,incoming.sources);
  const validated = validateResearchCandidate({...incoming,sources:appended.sources});
  const after = candidateProposal(validated.candidate);
  const manual = new Set(Array.isArray(existing.manual_fields) ? existing.manual_fields : []);
  const groups = REFRESH_GROUP_KEYS.flatMap(key => {
    const beforeValue = values(current,key),afterValue = values(after,key);
    if (stableJSON(beforeValue) === stableJSON(afterValue)) return [];
    const fields = factFields.has(key) ? [key,`field_provenance.${key}`] : key === 'fit' ? ['fit','fit_reason'] : [key];
    return [{key,label:labels[key],before:beforeValue,after:afterValue,manual:fields.some(field => manual.has(field)) || (factFields.has(key) && manual.has('field_provenance')),fields}];
  });
  return {groups,current,after,warnings:[...validated.warnings,...appended.warnings]};
}

export function researchRefreshChoices(selected,overrides) {
  const validList = value => Array.isArray(value) && value.length <= REFRESH_GROUP_KEYS.length && value.every(key => typeof key === 'string' && REFRESH_GROUP_KEYS.includes(key)) && new Set(value).size === value.length;
  if (!validList(selected) || !selected.length) throw fail(400,'Choose at least one changed research group to apply.');
  if (!validList(overrides) || overrides.some(key => !selected.includes(key))) throw fail(400,'Manual override choices must belong to the selected research groups.');
  return {selected:[...selected].sort(),overrides:[...overrides].sort()};
}

export function mergeResearchRefresh(existing,incoming,selectedFields,overwriteManualFields,now = Date.now()) {
  const choices = researchRefreshChoices(selectedFields,overwriteManualFields);
  const result = researchRefreshGroups(existing,incoming,now);
  const groups = new Map(result.groups.map(group => [group.key,group]));
  if (choices.selected.some(key => !groups.has(key))) throw fail(400,'Select only the changes shown in this research preview.');
  if (choices.overrides.some(key => !groups.get(key)?.manual)) throw fail(400,'Only a manually protected research group needs an override.');
  if (choices.selected.some(key => groups.get(key).manual && !choices.overrides.includes(key))) throw fail(409,'Explicitly allow replacement of every selected manually reviewed group.');
  const merged = structuredClone(result.current);
  for (const key of choices.selected) {
    if (factFields.has(key)) {
      merged[key] = result.after[key];
      merged.field_provenance[key] = result.after.field_provenance[key];
    } else if (key === 'fit') {
      merged.fit = result.after.fit;
      merged.fit_reason = result.after.fit_reason;
    } else merged[key] = result.after[key];
  }
  let validated;
  try { validated = validateResearchCandidate(merged); }
  catch (error) {
    if (error.issues?.some(issue => issue.code === 'missing_source')) error.message = 'Selected research references new sources. Also select Add research sources, then apply again.';
    throw error;
  }
  const {normalized_company_name,...record} = validated.candidate;
  return {candidate:record,warnings:[...validated.warnings,...result.warnings.filter(warning => warning.code === 'source_metadata_preserved')],...choices};
}
