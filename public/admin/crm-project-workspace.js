import {createProjectEditor,projectPrice,projectStatuses} from './crm-project-editor.js';
import {mountTasks,mountNotes} from './crm-client-records.js';
import {projectActionsMarkup} from './crm-project-actions.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mountProjectWorkspace({root,api,notify,company,navigate,projectId=null}){
 const companyId=company.id,base='/admin/clients/'+encodeURIComponent(companyId);
 let disposed=false,pendingAction=false,seq=0,page=1,project=null,cleanupRecords=()=>{};
 const editor=createProjectEditor({api,notify,companyId,onSaved:item=>{
  if(projectId){project=item;renderHeader();}
  else navigate(base+'?project='+encodeURIComponent(item.id));
 }});
 function renderHeader(){
  const header=root.querySelector('[data-project-header]');
  header.innerHTML=`<div><p class="eyebrow">CLIENT PROJECT</p><h2>${esc(project.name)}</h2><p class="project-price">${esc(projectPrice(project))}</p><span class="research-tag">${esc(projectStatuses[project.status]||project.status)}</span></div><button type="button" class="secondary" data-edit-project ${company.archived_at?'disabled':''}>Edit project</button>`;
  root.querySelector('[data-project-description]').textContent=project.description||'No short description yet.';
  header.querySelector('button').onclick=()=>editor.open(project);
 }
 async function list(){
  const ticket=++seq;
  root.innerHTML=`<div class="section-title"><div><p class="eyebrow">WORK FOR THIS CLIENT</p><h2>Projects.</h2></div><button type="button" class="primary" data-new-project ${company.archived_at?'disabled':''}>New project</button></div><p class="fine">One-time work and monthly agreements, each with its own brief, tasks and notes.</p><div data-project-results aria-live="polite">Loading projects…</div>`;
  root.querySelector('[data-new-project]').onclick=()=>{if(!pendingAction)editor.open();};const target=root.querySelector('[data-project-results]');
  try{
   const data=await api('crm-projects',null,{companyId,page});if(disposed||ticket!==seq)return;
   if(!data.items?.length&&page>1){page--;return list();}
   target.innerHTML=data.items?.length?`<div class="research-grid project-grid">${data.items.map(p=>`<article class="research-card project-card" data-project-id="${esc(p.id)}" data-project-status="${esc(p.status)}"><div class="project-card-top"><span class="research-tag">${esc(projectStatuses[p.status]||p.status)}</span>${projectActionsMarkup(p,company.archived_at)}</div><h3><a class="research-card-link" data-lead href="${base}?project=${encodeURIComponent(p.id)}">${esc(p.name)}</a></h3><p class="project-price">${esc(projectPrice(p))}</p><p class="client-card-description">${esc(p.description||'No short description yet.')}</p><div class="project-card-error" hidden><p role="alert"></p><button type="button" class="quiet" data-project-refresh>Refresh projects</button></div><div class="research-card-footer"><span>Brief · Tasks · Notes</span><span class="client-open">Open project <svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 19 19 5M5 5h14v14"/></svg></span></div></article>`).join('')}</div>`:'<div class="research-empty"><h3>No projects yet.</h3><p>Add your first project to keep its price, brief and work in one place.</p></div>';
   target.insertAdjacentHTML('beforeend',`<div class="actions client-list-pagination"><button type="button" class="quiet" data-project-page="-1" ${page===1?'disabled':''}>Previous projects</button><span class="fine">Page ${page}</span><button type="button" class="quiet" data-project-page="1" ${!data.hasMore?'disabled':''}>Next projects</button></div>`);
   target.onclick=e=>{
    const b=e.target.closest('button');if(!b||b.disabled||pendingAction)return;
    if(b.dataset.projectPage){page+=Number(b.dataset.projectPage);list();}
    if(b.hasAttribute('data-project-refresh'))list();
    if(b.dataset.projectAction){e.preventDefault();e.stopPropagation();const card=b.closest('[data-project-id]'),item=data.items.find(p=>p.id===card.dataset.projectId);if(item)changeProject(item,b.dataset.projectAction,card);}
   };
  }catch(error){if(!disposed&&ticket===seq){target.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" class="secondary">Retry projects</button>`;target.querySelector('button').onclick=list;}}
 }
 async function changeProject(item,action,card){
  if(pendingAction||company.archived_at)return;
  const deleting=action==='delete';
  if(deleting&&!confirm(`Delete project “${item.name}”? Its tasks, notes and brief will be permanently deleted, and its price removed from Overview.`))return;
  const status=action==='pause'?(item.status==='ON_HOLD'?'ACTIVE':'ON_HOLD'):(item.status==='COMPLETED'?'ACTIVE':'COMPLETED');
  const controls=[...root.querySelectorAll('button')].map(button=>({button,disabled:button.disabled}));
  pendingAction=true;controls.forEach(({button})=>button.disabled=true);card.setAttribute('aria-busy','true');
  const error=card.querySelector('.project-card-error');error.hidden=true;
  try{
   await api(deleting?'crm-project-delete':'crm-project-status',{companyId,projectId:item.id,version:item.version,...(deleting?{confirm:'delete'}:{status})});
   if(disposed)return;
   notify(deleting?'Project deleted.':status==='ON_HOLD'?'Project paused.':status==='COMPLETED'?'Project completed.':'Project active again.');
   await list();if(disposed)return;
   const updated=[...root.querySelectorAll('[data-project-id]')].find(el=>el.dataset.projectId===item.id);
   (updated?.querySelector(`[data-project-action="${action}"]`)||root.querySelector('[data-new-project]'))?.focus({preventScroll:true});
  }catch(reason){if(!disposed){error.hidden=false;error.querySelector('[role=alert]').textContent=reason.message;}}
  finally{pendingAction=false;if(!disposed){controls.forEach(({button,disabled})=>{if(button.isConnected)button.disabled=disabled;});card.removeAttribute('aria-busy');}}
 }
 async function detail(){
  const ticket=++seq;root.innerHTML='<p role="status">Loading project…</p>';
  try{
   const data=await api('crm-project',null,{companyId,projectId});if(disposed||ticket!==seq)return;project=data.item;
   root.innerHTML=`<a class="quiet" data-lead href="${base}"><svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 12H4m7-7-7 7 7 7"/></svg> All projects</a><section class="research-panel project-summary"><div class="project-heading" data-project-header></div><p class="crm-description" data-project-description></p></section>
    <section class="research-panel project-brief"><div class="section-title"><div><p class="eyebrow">THE ASSIGNMENT</p><h3>Project brief.</h3></div></div><form><label>Detailed brief<textarea aria-label="Detailed brief" name="brief" rows="10" maxlength="50000" placeholder="Paste the full assignment, deliverables, references and requirements here…" ${company.archived_at?'disabled':''}>${esc(project.brief||'')}</textarea></label><div class="actions"><button class="primary" ${company.archived_at?'disabled':''}>Save brief</button><span class="fine" data-brief-status role="status"></span></div><p role="alert"></p></form></section>
    <div class="client-workspace-grid project-records">
     <section class="research-panel project-tasks" aria-labelledby="project-tasks-title"><p class="eyebrow">PROJECT CHECKLIST</p><h3 id="project-tasks-title">Task list.</h3><form data-task-form><label>New project task<input name="title" maxlength="160" required placeholder="What needs to be done?" ${company.archived_at?'disabled':''}></label><div class="actions"><button class="primary" ${company.archived_at?'disabled':''}>Add task</button><button type="button" class="quiet" data-cancel-task hidden>Cancel edit</button></div><p role="alert" data-task-error></p></form><div data-task-list aria-live="polite"></div></section>
     <section class="research-panel project-notes" aria-labelledby="project-notes-title"><p class="eyebrow">PROJECT UPDATES</p><h3 id="project-notes-title">Notes.</h3>${project.notes?`<details><summary>Earlier project notes</summary><p class="crm-description">${esc(project.notes)}</p></details>`:''}<form><label>New project note<textarea name="content" rows="4" maxlength="5000" required placeholder="Add an idea, decision or update…"></textarea></label><button class="primary">Save note</button><p role="alert"></p></form><div data-client-notes aria-live="polite"></div></section>
    </div>`;
   renderHeader();
   const stopTasks=mountTasks({root:root.querySelector('.project-tasks'),api,notify,companyId,projectId,archived:!!company.archived_at});
   const stopNotes=mountNotes({root:root.querySelector('.project-notes'),api,notify,companyId,projectId,archived:!!company.archived_at});cleanupRecords=()=>{stopTasks();stopNotes();};
   const form=root.querySelector('.project-brief form');let pending=false;
   form.elements.brief.oninput=()=>{form.querySelector('[data-brief-status]').textContent='Unsaved changes';};
   form.onsubmit=async e=>{
    e.preventDefault();if(pending||company.archived_at)return;pending=true;form.querySelector('button').disabled=true;form.elements.brief.disabled=true;form.querySelector('[role=alert]').textContent='';root.querySelector('[data-edit-project]').disabled=true;
    try{const result=await api('crm-project-brief-save',{companyId,projectId,version:project.version,brief:form.elements.brief.value});if(disposed)return;project=result.item;form.querySelector('[data-brief-status]').textContent='Saved';notify('Project brief saved.');}
    catch(error){if(!disposed)form.querySelector('[role=alert]').textContent=error.message;}
    finally{pending=false;if(!disposed){form.querySelector('button').disabled=false;form.elements.brief.disabled=false;root.querySelector('[data-edit-project]').disabled=false;}}
   };
  }catch(error){if(!disposed&&ticket===seq){root.innerHTML=`<a class="quiet" data-lead href="${base}"><svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 12H4m7-7-7 7 7 7"/></svg> All projects</a><p role="alert">${esc(error.message)}</p><button class="secondary" data-project-retry>Retry project</button>`;root.querySelector('[data-project-retry]').onclick=detail;}}
 }
 if(projectId)detail();else list();
 return ()=>{disposed=true;cleanupRecords();editor.destroy();};
}
