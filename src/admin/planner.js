import {fail,uuid} from '../crm/validation.js';

export const plannerActions=['planner-list','planner-save','planner-delete'];
const fields='id,kind,title,content,checklist,color,priority,planned_date,planned_time,completed,version,created_at,updated_at';
export function plannerDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'9999-12-31')return false;
 const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function text(value,max,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw fail(400,'Enter valid planner text.');return value.trim();}
export function plannerValues(body){
 if(!['note','checklist','event'].includes(body.kind))throw fail(400,'Invalid planner type.');
 if(!['sand','sage','blue','rose'].includes(body.color))throw fail(400,'Invalid card color.');
 if(typeof body.completed!=='boolean')throw fail(400,'Invalid completion state.');
 const priority=body.priority??1;if(!Number.isInteger(priority)||priority<0||priority>3)throw fail(400,'Choose a valid priority.');
 const checklist=body.checklist;
 if(!Array.isArray(checklist)||checklist.length>80||checklist.some(item=>!item||!uuid(item.id)||typeof item.done!=='boolean'||typeof item.text!=='string'||!item.text.trim()||item.text.length>240)||new Set(checklist.map(item=>item.id)).size!==checklist.length)throw fail(400,'Use up to 80 tasks, each with a description.');
 if(body.kind!=='checklist'&&checklist.length)throw fail(400,'Only to-do lists can contain tasks.');
 if(body.kind==='event'&&!plannerDate(body.planned_date))throw fail(400,'Choose a valid date.');
 if(body.planned_time!==null&&(typeof body.planned_time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.planned_time)))throw fail(400,'Choose a valid time.');
 return {kind:body.kind,title:text(body.title,160,true),content:text(body.content,5000),checklist:checklist.map(item=>({id:item.id,text:item.text.trim(),done:item.done})),color:body.color,priority,completed:body.completed,planned_date:body.kind==='event'?body.planned_date:null,planned_time:body.kind==='event'?body.planned_time:null};
}
export async function handlePlanner({action,body,url,user,token,call}){
 const request=(path,options={})=>call(path,{...options,token});
 const owner=`owner_id=eq.${encodeURIComponent(user.id)}`;
 if(action==='planner-list'){
  const month=url.searchParams.get('month');if(!/^\d{4}-\d{2}$/.test(month||'')||!plannerDate(month+'-01'))throw fail(400,'Choose a valid month.');
  const [year,m]=month.split('-').map(Number),last=new Date(Date.UTC(year,m,0)).getUTCDate();
  const [board,events]=await Promise.all([
   request(`/rest/v1/workspace_planner?${owner}&kind=in.(note,checklist)&select=${fields}&order=priority.desc,created_at.desc,id&limit=501`),
   request(`/rest/v1/workspace_planner?${owner}&kind=eq.event&planned_date=gte.${month}-01&planned_date=lte.${month}-${last}&select=${fields}&order=planned_date,planned_time.asc.nullsfirst,created_at,id&limit=1001`)
  ]);
  return {board:board.slice(0,500),events:events.slice(0,1000),truncated:board.length>500||events.length>1000};
 }
 if(!uuid(body.id)||!Number.isInteger(body.version)||body.version<0)throw fail(400,'Invalid planner item.');
 const path=`/rest/v1/workspace_planner?${owner}&id=eq.${body.id}`;
 if(action==='planner-delete'){
  if(body.version<1||body.confirm!=='delete')throw fail(400,'Confirm deletion.');
  const rows=await request(path+`&version=eq.${body.version}`,{method:'DELETE',headers:{Prefer:'return=representation'}});
  if(!rows.length)throw fail(409,'This item changed or was removed. Reload it before deleting.');return {ok:true};
 }
 const values=plannerValues(body);
 if(body.version===0){
  // A stable client ID makes a retry after a lost creation response safe.
  const rows=await request('/rest/v1/workspace_planner?on_conflict=id',{method:'POST',body:{...values,id:body.id,owner_id:user.id},headers:{Prefer:'resolution=ignore-duplicates,return=representation'}});
  const item=rows[0]||(await request(path+`&select=${fields}`))[0];
  if(!item)throw fail(409,'Could not create this planner item.');
  const same=(key)=>key==='checklist'?item.checklist.length===values.checklist.length&&item.checklist.every((task,i)=>['id','text','done'].every(field=>task[field]===values.checklist[i][field])):item[key]===values[key];
  if(!rows.length&&Object.keys(values).some(key=>!same(key)))throw fail(409,'An earlier version of this item was saved. Your edits are kept here. Refresh to see the saved version.');
  return {item};
 }
 const rows=await request(path+`&version=eq.${body.version}`,{method:'PATCH',body:values,headers:{Prefer:'return=representation'}});
 if(!rows.length)throw fail(409,'This item changed in another tab. Your edits are kept here; reload the saved item before editing again.');
 return {item:rows[0]};
}
