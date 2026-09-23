import {RESEARCH_STATUSES,LEVELS,SOURCE_ORIGINS,OPPORTUNITY_SIGNALS} from './research-options.js';
import {RESEARCH_SERVICES} from './service-catalog.js';

export const RESEARCH_SORTS = Object.freeze({
  newest:'Newest', fit:'Highest Fit', researched:'Recently researched', name:'Company name',
  country:'Country', confidence:'Research confidence', signals:'Most opportunity signals',
});
export const RESEARCH_FILTER_CHOICES = Object.freeze({
  research_status:Object.keys(RESEARCH_STATUSES), fit:LEVELS, research_confidence:LEVELS,
  country_category:['SK','CZ','INT'], potential_service:RESEARCH_SERVICES,
  opportunity_signal:OPPORTUNITY_SIGNALS, source_origin:SOURCE_ORIGINS,
  duplicate_status:['unchecked','possible','clear'], last_researched:['never','last30','older30'],
  sort:Object.keys(RESEARCH_SORTS),
});
const textLimits = {q:160,country:2,industry:120,business_type:120,product_category:120,market_segment:120};

export function researchFilters(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid research filters.');
  const output = {};
  for (const [key,raw] of Object.entries(input)) {
    if (!Object.hasOwn(textLimits,key) && !Object.hasOwn(RESEARCH_FILTER_CHOICES,key)) throw new Error(`Unknown research filter: ${key}.`);
    if (typeof raw !== 'string') throw new Error(`Invalid research filter: ${key}.`);
    const value = key === 'country' ? raw.trim().toUpperCase() : raw.trim();
    if (!value) continue;
    if (key === 'country' && !/^[A-Z]{2}$/.test(value)) throw new Error('Use a two-letter country code.');
    if (textLimits[key] && value.length > textLimits[key]) throw new Error(`Research filter ${key} is too long.`);
    if (RESEARCH_FILTER_CHOICES[key] && !RESEARCH_FILTER_CHOICES[key].includes(value)) throw new Error(`Invalid research filter: ${key}.`);
    output[key] = value;
  }
  return output;
}
