import {fail,uuid,string} from './validation.js';
import {filterConfig} from '../../public/admin/crm-filter-config.js';
export const savedViewActions=['crm-saved-views','crm-saved-view-save','crm-saved-view-delete','crm-saved-view-default'];
export async function handleSavedViews({action,body,user,request,owner}){
 if(action==='crm-saved-views')return {items:await request(`/rest/v1/crm_saved_views?${owner}&select=*&order=created_at,id&limit=101`)};
 if(action==='crm-saved-view-default'){if(body.id!==null&&!uuid(body.id))throw fail(400,'Invalid view.');await request('/rest/v1/rpc/crm_default_view',{method:'POST',body:{p_id:body.id}});return {ok:true};}
 const id=body.id||null;if(id&&!uuid(id))throw fail(400,'Invalid view.');
 if(id&&(!Number.isInteger(body.version)||body.version<1))throw fail(400,'Reload the view.');
 const path='/rest/v1/crm_saved_views'+(id?`?id=eq.${id}&${owner}&version=eq.${body.version}`:'');
 if(action==='crm-saved-view-delete'){if(!id||body.confirm!=='delete')throw fail(400,'Confirm deletion.');const rows=await request(path,{method:'DELETE',headers:{Prefer:'return=representation'}});if(!rows.length)throw fail(409,'View changed. Refresh first.');return {ok:true};}
 const name=string(body.name,80,'view name');if(!name)throw fail(400,'Enter a view name.');let config;try{config=filterConfig(body.filter_config);}catch(e){throw fail(400,e.message);}
 const rows=await request(path,{method:id?'PATCH':'POST',body:{name,filter_config:config,...(!id?{owner_id:user.id}:{})},headers:{Prefer:'return=representation'}});if(!rows.length)throw fail(409,'View changed. Refresh first.');return {item:rows[0]};
}
