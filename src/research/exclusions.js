import {fail} from '../crm/validation.js';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));

/** Owner-JWT lookup; never return a silently incomplete prompt exclusion list. */
export async function researchExcludedDomains({token,call}) {
  const exclusions = await call('/rest/v1/rpc/crm_research_excluded_domains',{token,method:'POST',body:{}});
  if (!plain(exclusions) || !Array.isArray(exclusions.domains) || !Number.isSafeInteger(exclusions.count) || exclusions.count < 0 || typeof exclusions.overflow !== 'boolean') throw fail(502,'Research exclusions could not be loaded. Please try again.');
  if (exclusions.overflow) throw fail(413,'The exclusion list is too large for one research prompt. No incomplete prompt was generated.');
  if (exclusions.count !== exclusions.domains.length || exclusions.domains.some(domain => typeof domain !== 'string' || !domain.length || domain.length > 253 || /[\s\u0000-\u001f\u007f]/u.test(domain))) throw fail(502,'Research exclusions could not be loaded. Please try again.');
  return [...new Set(exclusions.domains)].sort();
}
