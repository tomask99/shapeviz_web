// Canonical research names and the existing CRM storage values live together.
// CRM values retain their historical capitalization for compatibility.
export const SERVICE_CATALOG = Object.freeze([
  {name:'Product CGI', crmValue:'Product CGI'},
  {name:'Archviz', crmValue:'Archviz'},
  {name:'Product Visualization', crmValue:'Product visualization'},
  {name:'3D Modelling', crmValue:'3D modelling'},
  {name:'3D Models for Architects', crmValue:'3D models for architects'},
  {name:'Social Content', crmValue:'Social content'},
  {name:'Art Direction', crmValue:'Art direction'},
  {name:'AI Content', crmValue:'AI content'},
  {name:'Animation', crmValue:'Animation'},
  {name:'Web', crmValue:'Web'},
  {name:'Automation', crmValue:'Automation'},
  {name:'Other', crmValue:'Other'},
  {name:'Lifestyle CGI', crmValue:'Lifestyle CGI'},
  {name:'Product Animation', crmValue:'Product Animation'},
].map(Object.freeze));

export const RESEARCH_SERVICES = Object.freeze(SERVICE_CATALOG.map(service => service.name));
export const CRM_SERVICES = Object.freeze(SERVICE_CATALOG.flatMap(service => service.crmValue ? [service.crmValue] : []));

export function canonicalService(value) {
  if (typeof value !== 'string') return null;
  return SERVICE_CATALOG.find(service => service.name.toLowerCase() === value.trim().toLowerCase())?.name ?? null;
}
