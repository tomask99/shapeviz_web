export const STATUSES = ['NEW_LEAD','QUALIFIED','PRESENTATION_READY','CONTACTED','PRESENTATION_VIEWED','REPLIED','MEETING','PROPOSAL','WON','LOST'];
export const SERVICES = ['Product CGI','Archviz','Product visualization','3D modelling','3D models for architects','Social content','Art direction','AI content','Animation','Web','Automation','Other'];
export const SOURCES = ['Google','Instagram','LinkedIn','Referral','Existing contact','Trade fair / event','Inbound','Manual research','Other'];
export const INDUSTRIES = ['Furniture','Interior design','Architecture','Real estate / developer','Lighting','Product design','Fashion','Luxury','Hospitality','Automotive','Agency','Other'];
export const PRIORITIES = ['LOW','MEDIUM','HIGH'];
export const label = value => String(value || '').toLowerCase().replaceAll('_',' ').replace(/^./, c => c.toUpperCase());
