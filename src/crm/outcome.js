import {string,choice,fail,link} from './validation.js';
import {SERVICES} from '../../public/admin/crm-options.js';
import {opportunityValueInput} from '../../public/admin/crm-value.js';
export function outcomeInput(body){
 const result={};
 if(Object.hasOwn(body,'logo_url'))result.logo_url=link(body.logo_url,'logo URL');
 if(Object.hasOwn(body,'won_date')){
  const value=string(body.won_date,10,'won date');
  if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'9999-12-31'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw fail(400,'Enter a valid won date.');
  result.won_date=value||null;
 }
 if(Object.hasOwn(body,'won_service'))result.won_service=choice(body.won_service,['',...SERVICES],'sold service');
 if(Object.hasOwn(body,'won_notes'))result.won_notes=string(body.won_notes,3000,'won notes');
 for(const key of ['won_project_value','won_monthly_value'])if(Object.hasOwn(body,key)){
  try{result[key]=opportunityValueInput({estimated_value:body[key],value_type:'ONE_TIME'}).estimated_value;}catch(e){throw fail(400,e.message);}
 }
 return result;
}
