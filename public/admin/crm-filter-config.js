import {STATUSES,SERVICES,SOURCES,PRIORITIES} from './crm-options.js';
export const FILTER_CHOICES={country_category:['SK','CZ','INT'],pipeline_status:STATUSES,priority:PRIORITIES,fit:['LOW','MEDIUM','HIGH'],service:SERVICES,lead_source:SOURCES,archived:['active','archived','all'],sort:['recent','name','updated','priority','last_activity','last_contact','next_followup','engagement'],presentation_status:['NONE','ASSIGNED','SENT','VIEWED'],engagement:['NONE','COLD','ACTIVE','HOT'],has_followup:['yes','no'],has_replied:['yes','no'],last_contacted:['never','7','30','older30']};
export function filterConfig(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid filters.');const out={};
 for(const [key,v] of Object.entries(value)){if(v==='')continue;if(typeof v!=='string')throw new Error('Invalid filter value.');if(key==='q'||key==='industry'){if(v.length>(key==='q'?160:120))throw new Error('Filter is too long.');out[key]=v.trim();}else if(FILTER_CHOICES[key]?.includes(v))out[key]=v;else throw new Error('Invalid filter: '+key);}
 return out;
}
