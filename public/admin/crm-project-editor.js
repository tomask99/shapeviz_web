import {opportunityValueText} from './crm-value.js';
export const projectStatuses={PLANNED:'Planned',ACTIVE:'Active',ON_HOLD:'On hold',COMPLETED:'Completed',CANCELLED:'Cancelled'};
export const projectBilling=p=>p.monthly_value!=null?(p.project_value!=null?'MIXED':'MONTHLY'):'ONE_TIME';
export function projectPrice(p){
 const price=(amount,type)=>opportunityValueText({estimated_value:amount,value_type:type});
 return projectBilling(p)==='MIXED'?price(p.project_value,'ONE_TIME')+' + '+price(p.monthly_value,'MONTHLY'):price(p.monthly_value??p.project_value,projectBilling(p));
}
export function createProjectEditor({api,notify,companyId,onSaved}){
 const dialog=document.createElement('dialog');dialog.id='project-editor';dialog.className='crm-record-dialog client-editor';dialog.setAttribute('aria-labelledby','project-editor-title');
 dialog.innerHTML=`<form><div class="dialog-head"><h2 id="project-editor-title">New project.</h2><button type="button" data-close aria-label="Close">×</button></div>
  <label>Project name<input name="name" required maxlength="160"></label>
  <div class="two-columns"><label>Billing<select name="billing_type" aria-label="Billing"><option value="ONE_TIME">One-time</option><option value="MONTHLY">Monthly</option><option value="MIXED" hidden>One-time + monthly (existing)</option></select></label><label>Price (EUR)<input name="amount" required inputmode="decimal" maxlength="12" placeholder="e.g. 1500"></label></div>
  <label data-legacy-monthly hidden>Monthly price (EUR)<input name="monthly_value" inputmode="decimal" maxlength="12"></label>
  <label>Short description<textarea name="description" rows="3" maxlength="5000" placeholder="A short summary of the work"></textarea></label>
  <label>Project status<select name="status" aria-label="Project status">${Object.entries(projectStatuses).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label>
  <p role="alert"></p><div class="actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Create project</button></div></form>`;
 document.body.append(dialog);const form=dialog.querySelector('form');let current=null,requestId=null,pending=false,disposed=false;
 function billing(){const mixed=form.elements.billing_type.value==='MIXED';form.querySelector('[data-legacy-monthly]').hidden=!mixed;form.elements.monthly_value.required=mixed;}
 form.elements.billing_type.onchange=billing;
 dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!pending)dialog.close();});dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
 function open(project=null){
  if(pending||disposed)return;current=project;requestId=project?null:crypto.randomUUID();form.reset();form.querySelector('[role=alert]').textContent='';
  form.querySelector('h2').textContent=project?'Edit project.':'New project.';form.querySelector('[type=submit]').textContent=project?'Save project':'Create project';
  const type=project?projectBilling(project):'ONE_TIME';form.querySelector('option[value=MIXED]').hidden=type!=='MIXED';
  for(const [key,value] of Object.entries({name:project?.name||'',description:project?.description||'',status:project?.status||'ACTIVE',billing_type:type,amount:type==='MONTHLY'?project?.monthly_value:project?.project_value,monthly_value:project?.monthly_value}))form.elements[key].value=value??'';
  billing();dialog.showModal();form.elements.name.focus();
 }
 form.onsubmit=async e=>{
  e.preventDefault();if(pending||disposed)return;const values=Object.fromEntries(new FormData(form));pending=true;dialog.dataset.dismissPending='true';form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);form.querySelector('[role=alert]').textContent='';
  try{const data=await api('crm-project-save',{companyId,...values,...(current?{id:current.id,version:current.version}:{requestId})});if(disposed)return;dialog.close();notify(current?'Project updated.':'Project created.');onSaved(data.item);}
  catch(error){if(!disposed)form.querySelector('[role=alert]').textContent=error.message;}
  finally{pending=false;if(!disposed){dialog.dataset.dismissPending='false';form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=false);}}
 };
 return {open,destroy(){disposed=true;dialog.close();dialog.remove();}};
}
