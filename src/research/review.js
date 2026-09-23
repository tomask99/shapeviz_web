import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {fail,uuid} from '../crm/validation.js';
import {validateResearchCandidate} from './validation.js';
import {RESEARCH_CANDIDATE_SCHEMA} from './schema.js';
import {PROVENANCE_FIELDS} from '../../public/admin/research-options.js';
import {researchLeadInput} from './mapping.js';

export const reviewReadActions = ['crm-research-company'];
export const reviewWriteActions = ['crm-research-save','crm-research-reject','crm-research-restore','crm-research-approval-preview','crm-research-approve'];
const FIELDS = Object.keys(RESEARCH_CANDIDATE_SCHEMA.properties);
const CANDIDATE_FIELDS = [...FIELDS,'id','research_status','version','approved_company_id','manual_fields','approved_at','rejected_at','rejection_reason'].join(',');
const PREVIEW_LIFETIME_MS = 60 * 60 * 1000;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const unknownEvidence = () => ({status:'UNKNOWN',confidence:null,evidence:'',source_urls:[]});
const canonical = value => JSON.stringify(sortKeys(value));
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  return plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key,sortKeys(value[key])])) : value;
}

function input(body,required,optional = []) {
  if (!plain(body) || required.some(key => !Object.hasOwn(body,key)) || Object.keys(body).some(key => ![...required,...optional].includes(key))) throw fail(400,'Invalid research review request.');
  if (!uuid(body.id) || !Number.isSafeInteger(body.version) || body.version < 1 || body.version > 2_147_483_647) throw fail(400,'Choose a valid research candidate and version.');
  if (required.includes('operationId') && !uuid(body.operationId)) throw fail(400,'Invalid research operation.');
}

function signingSecret(key) {
  if (!(typeof key === 'string' || Buffer.isBuffer(key)) || !key.length) throw fail(503,'Research approval is not configured.');
  return key;
}

function signedPreview(payload,key) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${createHmac('sha256',signingSecret(key)).update(encoded).digest('base64url')}`;
}

function expectedSnapshot(value) {
  return plain(value) && Number.isSafeInteger(value.match_count) && value.match_count >= 0 &&
    Number.isSafeInteger(value.company_match_count) && value.company_match_count >= 0 && value.company_match_count <= value.match_count &&
    typeof value.fingerprint === 'string' && value.fingerprint.length > 0 && value.fingerprint.length <= 128;
}

function readPreview(value,key,userId,id,version) {
  signingSecret(key);
  const invalid = () => fail(400,'Preview this candidate again before approval.');
  if (typeof value !== 'string' || value.length > 50_000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw invalid();
  const [encoded,signature] = value.split('.');
  const supplied = Buffer.from(signature,'base64url');
  const expected = createHmac('sha256',key).update(encoded).digest();
  if (supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) throw invalid();
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')); }
  catch { throw invalid(); }
  if (!plain(payload) || payload.v !== 1 || payload.purpose !== 'research-approval' || payload.owner !== userId || payload.id !== id || payload.version !== version || !plain(payload.lead) || !expectedSnapshot(payload.expected) || !Number.isSafeInteger(payload.expiresAt)) throw invalid();
  if (payload.expiresAt <= Date.now()) throw fail(409,'This approval preview expired. Preview the candidate again.');
  return payload;
}

function duplicateSnapshot(value) {
  const invalid = () => fail(502,'Research duplicate checking returned an incomplete result. Please try again.');
  if (!expectedSnapshot(value) || !Array.isArray(value.matches) || value.matches.length > value.match_count) throw invalid();
  const seen = new Set();
  const matches = value.matches.map(match => {
    if (!plain(match) || !['company','candidate'].includes(match.kind) || !uuid(match.id) || !['domain','name_country'].includes(match.match) || ['company_name','website','country','status'].some(key => typeof match[key] !== 'string')) throw invalid();
    const key = `${match.kind}:${match.id}`;
    if (seen.has(key)) throw invalid();
    seen.add(key);
    return {kind:match.kind,id:match.id,company_name:match.company_name,website:match.website,country:match.country,status:match.status,match:match.match};
  });
  if (matches.filter(match => match.kind === 'company').length > value.company_match_count || matches.filter(match => match.kind === 'candidate').length > value.match_count-value.company_match_count) throw invalid();
  return {matches,match_count:value.match_count,company_match_count:value.company_match_count,fingerprint:value.fingerprint};
}

async function candidateForReview({id,user,token,call}) {
  const rows = await call(`/rest/v1/crm_research_candidates?id=eq.${encodeURIComponent(id)}&owner_id=eq.${user.id}&select=${CANDIDATE_FIELDS}&limit=1`,{token});
  if (!rows?.[0]) throw fail(404,'Research candidate not found.');
  return rows[0];
}

// Equality treats omitted evidence defaults and harmless whitespace consistently,
// but malformed or unexpected evidence properties still reach schema validation.
function evidenceSignature(value = {}) {
  if (!plain(value) || Object.keys(value).some(key => !['status','confidence','evidence','source_urls'].includes(key))) return null;
  const evidence = {...unknownEvidence(),...value};
  if (typeof evidence.status !== 'string' || !(evidence.confidence === null || typeof evidence.confidence === 'string') || typeof evidence.evidence !== 'string' || !Array.isArray(evidence.source_urls) || evidence.source_urls.some(url => typeof url !== 'string')) return null;
  try {
    return canonical({...evidence,status:evidence.status.trim(),confidence:evidence.confidence?.trim() ?? null,evidence:evidence.evidence.trim(),source_urls:evidence.source_urls.map(url => new URL(url.trim()).href)});
  } catch { return null; }
}

function editedCandidate(proposal,existing) {
  if (!plain(proposal) || FIELDS.some(field => !Object.hasOwn(proposal,field))) throw fail(400,'Save the complete candidate so omitted fields cannot erase existing research.');
  if (!plain(proposal.field_provenance)) throw fail(400,'Candidate field provenance must be an object.');
  // Normalize proposed facts first; stale evidence for a cleared fact must not
  // prevent us from dropping that obsolete evidence before final validation.
  const normalized = validateResearchCandidate({...proposal,field_provenance:{}}).candidate;
  const provenance = {...proposal.field_provenance};
  const reset = [];
  for (const field of PROVENANCE_FIELDS) {
    const before = evidenceSignature(existing.field_provenance?.[field]);
    if (canonical(normalized[field]) !== canonical(existing[field]) && before !== null && before === evidenceSignature(provenance[field])) {
      provenance[field] = unknownEvidence();
      reset.push({path:`candidate.field_provenance.${field}`,code:'provenance_reset',message:`${field}: previous evidence was cleared after the manual change.`});
    }
  }
  const positioningEvidence = value => plain(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'value')) : value;
  if (normalized.positioning.value !== existing.positioning?.value && normalized.positioning.value && evidenceSignature(positioningEvidence(proposal.positioning)) === evidenceSignature(positioningEvidence(existing.positioning))) throw fail(400,'Explain the changed positioning with updated evidence before saving.');
  const result = validateResearchCandidate({...proposal,field_provenance:provenance});
  return {...result,warnings:[...result.warnings,...reset]};
}

/** Owner reads use JWT/RLS; reviewed writes use narrowly scoped server RPCs. */
export async function handleResearchReview({action,body,url,user,token,call,signingKey,validateCompany}) {
  if (!token || !uuid(user?.id)) throw fail(401,'Please sign in.');
  const params = url.searchParams;
  const allowedParams = action === 'crm-research-company' ? ['action','companyId'] : ['action'];
  if ([...params.keys()].some(key => !allowedParams.includes(key) || params.getAll(key).length !== 1)) throw fail(400,'Invalid research review options.');
  if (action === 'crm-research-company') {
    const companyId = params.get('companyId');
    if (!uuid(companyId)) throw fail(400,'Invalid company.');
    const rows = await call(`/rest/v1/crm_research_candidates?approved_company_id=eq.${encodeURIComponent(companyId)}&owner_id=eq.${user.id}&select=id,company_name,fit,fit_reason,research_summary,source_origin,approved_at,manual_fields&limit=1`,{token});
    return {candidate:rows?.[0] ?? null};
  }
  if (!reviewWriteActions.includes(action)) throw fail(400,'Unknown research review action.');
  if (action === 'crm-research-approval-preview') {
    input(body,['id','version','priority','services']);
    signingSecret(signingKey);
    const candidate = await candidateForReview({id:body.id,user,token,call});
    if (candidate.version !== body.version) throw fail(409,'This candidate changed. Reload it before approval.');
    if (['APPROVED','REJECTED'].includes(candidate.research_status)) throw fail(409,'Only an open research candidate can be approved. Restore rejected research before approval.');
    const lead = researchLeadInput(candidate,{priority:body.priority,services:body.services},validateCompany);
    const duplicates = duplicateSnapshot(await call('/rest/v1/rpc/crm_research_review_duplicates',{token,method:'POST',body:{p_id:body.id,p_version:body.version}}));
    const expected = {match_count:duplicates.match_count,fingerprint:duplicates.fingerprint,company_match_count:duplicates.company_match_count};
    return {candidate,lead,duplicates:duplicates.matches,match_count:duplicates.match_count,company_match_count:duplicates.company_match_count,can_approve:duplicates.company_match_count === 0,
      reviewToken:signedPreview({v:1,purpose:'research-approval',owner:user.id,id:body.id,version:body.version,lead,expected,expiresAt:Date.now()+PREVIEW_LIFETIME_MS},signingKey)};
  }
  if (action === 'crm-research-approve') {
    input(body,['id','version','operationId','reviewToken','acknowledgeDuplicates','confirm']);
    if (body.confirm !== 'approve' || typeof body.acknowledgeDuplicates !== 'boolean') throw fail(400,'Preview and confirm Lead approval first.');
    const preview = readPreview(body.reviewToken,signingKey,user.id,body.id,body.version);
    if (preview.expected.company_match_count) throw fail(409,'A matching Lead or Client already exists. Open that company instead of creating a duplicate Lead.');
    if (preview.expected.match_count && !body.acknowledgeDuplicates) throw fail(409,'Review and acknowledge the matching research candidates before approval.');
    // No preflight read: the transaction must replay a successful request before
    // checking the now-closed candidate, version or duplicate snapshot.
    return call('/rest/v1/rpc/crm_research_approve',{method:'POST',body:{
      p_owner:user.id,p_id:body.id,p_operation:body.operationId,
      p_hash:hash({action,id:body.id,version:body.version,lead:preview.lead,expected:preview.expected,acknowledgeDuplicates:body.acknowledgeDuplicates}),
      p_version:body.version,p_lead:preview.lead,p_expected:preview.expected,p_acknowledge_duplicates:body.acknowledgeDuplicates,
    }});
  }
  const operation = action.slice('crm-research-'.length);
  input(body,['id','version','operationId',...(operation === 'save' ? ['candidate'] : [])],operation === 'reject' ? ['reason'] : []);
  let reason = '',record = null,warnings;
  if (operation === 'reject') {
    if (body.reason !== undefined && (typeof body.reason !== 'string' || [...body.reason].length > 3000 || /[\u0000\uD800-\uDFFF]/u.test(body.reason))) throw fail(400,'Use a rejection reason of at most 3000 characters.');
    reason = body.reason?.trim() ?? '';
  }
  if (operation === 'save') {
    if (!plain(body.candidate) || FIELDS.some(field => !Object.hasOwn(body.candidate,field)) || Object.keys(body.candidate).some(field => !FIELDS.includes(field))) throw fail(400,'Save the complete candidate using only research fields.');
    const existing = await candidateForReview({id:body.id,user,token,call});
    if (existing.version === body.version) {
      const validated = editedCandidate(body.candidate,existing);
      const {normalized_company_name,...data} = validated.candidate;
      record = data;
      warnings = validated.warnings;
    }
  }
  // Bind the incoming full proposal, before resets that depend on the stored
  // version. A retried save keeps its identity after its first successful write.
  const requestHash = hash({action,id:body.id,version:body.version,...(operation === 'save' ? {candidate:body.candidate} : {reason})});
  const result = await call('/rest/v1/rpc/crm_research_review',{method:'POST',body:{
    p_owner:user.id,p_id:body.id,p_operation:body.operationId,p_hash:requestHash,p_action:operation,p_version:body.version,p_candidate:record,p_reason:reason,
  }});
  return warnings ? {...result,warnings} : result;
}
