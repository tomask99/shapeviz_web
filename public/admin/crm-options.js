export const STATUSES = ['NEW_LEAD','PRESENTATION_READY','CONTACTED','PRESENTATION_VIEWED','REPLIED','MEETING','PROPOSAL','WON','LOST'];
export {CRM_SERVICES as SERVICES} from './service-catalog.js';
export const SOURCES = ['Google','Instagram','LinkedIn','Referral','Existing contact','Trade fair / event','Inbound','Manual research','Other','AI Research'];
export const INDUSTRIES = ['Furniture','Interior design','Architecture','Real estate / developer','Lighting','Product design','Fashion','Shoes','Eyewear','Jewelry','Beauty / Cosmetics','Consumer Electronics','Sports / Outdoor','Luxury','Hospitality','Automotive','Agency','Other'];
export const PRIORITIES = ['LOW','MEDIUM','HIGH'];
export const label = value => String(value || '').toLowerCase().replaceAll('_',' ').replace(/^./, c => c.toUpperCase());
