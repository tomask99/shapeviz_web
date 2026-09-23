import {fail} from '../crm/validation.js';
import {SERVICE_CATALOG} from '../../public/admin/service-catalog.js';

/** Reusable, explicit mapping: research evidence stays on its linked candidate. */
export function researchLeadInput(candidate,{priority = 'MEDIUM',services} = {},validateCompany) {
  if (typeof validateCompany !== 'function') throw fail(503,'Research approval is not configured.');
  const selected = services === undefined ? candidate.potential_services.map(item => item.service) : services;
  if (!Array.isArray(selected) || selected.length > SERVICE_CATALOG.length || new Set(selected).size !== selected.length) throw fail(400,'Choose each Lead service only once.');
  const mapped = selected.map(name => {
    const entry = SERVICE_CATALOG.find(service => service.name === name);
    if (!entry?.crmValue) throw fail(400,'Choose a supported canonical Lead service.');
    return entry.crmValue;
  });
  return validateCompany({
    company_name:candidate.company_name,website:candidate.website,country:candidate.country,
    city:candidate.city,industry:candidate.industry,short_description:candidate.short_description,
    fit:candidate.fit ?? '',services:mapped,priority,lead_source:'AI Research',pipeline_status:'NEW_LEAD',
    instagram:'',linkedin:'',estimated_value:null,value_type:'UNKNOWN',
  });
}
