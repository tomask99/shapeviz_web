import {esc} from './time-values.js';
import {svgIcon} from '../ui/icons.js';
import {workspaceProjectCard,workspaceStatuses as projectStatuses,statusChoices} from './workspace-project-card.js';
import {createWorkspaceProjectDialog} from './workspace-project-dialog.js';
import {timeOptions} from './time-history.js';

export function mountWorkspaceProjects({root,api,navigate,notify}){
 let disposed=false,sequence=0,pending=false,items=[];
 const detail=createWorkspaceProjectDialog({api,notify,navigate,onChanged:id=>load(id,'[data-open-project]')});
 const params=new URLSearchParams(location.search),page=Math.max(1,Number(params.get('page'))||1);
 root.innerHTML=`<div class="page-heading"><div><p class="eyebrow">WORKSPACE</p><h1>Projects<span>.</span></h1></div><button type="button" class="secondary" data-projects-refresh>${svgIcon('refresh')} Refresh</button></div>
  <form class="workspace-project-filters"><label class="project-search">Search projects<input type="search" name="q" maxlength="160" placeholder="Project or client"></label><label>Client<select name="companyId"><option value="">All clients</option></select></label><label>Status<select name="status"><option value="OPEN">In progress</option><option value="">All statuses</option>${Object.entries(projectStatuses).map(([key,name])=>`<option value="${key}">${esc(name)}</option>`).join('')}</select></label><label>Billing<select name="billing"><option value="">All billing</option><option value="HOURLY">Hourly</option><option value="ONE_TIME">One-time</option><option value="MONTHLY">Monthly</option></select></label><button class="secondary">Apply filters</button></form>
  <div data-workspace-projects aria-live="polite"></div>`;
 const form=root.querySelector('form'),target=root.querySelector('[data-workspace-projects]');
 for(const name of ['q','status','billing'])if(params.has(name))form.elements[name].value=params.get(name);
 if(params.get('companyId'))form.elements.companyId.add(new Option('Selected client',params.get('companyId'),true,true));
 async function clients(){try{const items=await timeOptions(api);if(disposed)return;const selected=form.elements.companyId.value;form.elements.companyId.innerHTML='<option value="">All clients</option>'+items.filter(c=>!c.archived_at).map(c=>`<option value="${esc(c.id)}">${esc(c.company_name)}</option>`).join('');if(selected&&!items.some(c=>c.id===selected))form.elements.companyId.add(new Option('Selected client',selected));form.elements.companyId.value=selected;root.querySelector('[data-client-error]')?.remove();}catch{if(!disposed&&!root.querySelector('[data-client-error]'))form.insertAdjacentHTML('afterend','<p class="fine" role="status" data-client-error>Client filters could not load. Use Refresh to retry.</p>');}}
 clients();
 const go=(nextPage=1)=>{const query=new URLSearchParams(new FormData(form));query.set('page',String(nextPage));navigate('/admin/projects?'+query);};
 form.onsubmit=e=>{e.preventDefault();if(!pending)go();};root.querySelector('[data-projects-refresh]').onclick=()=>{if(pending)return;api.invalidate?.();clients();load();};
 async function load(focusId=null,focusControl='[data-status-toggle]'){
  const ticket=++sequence;target.setAttribute('aria-busy','true');target.innerHTML='<p role="status" class="fine">Loading projects…</p>';
  try{
   const filters=Object.fromEntries(['q','companyId','status','billing'].map(name=>[name,form.elements[name].value]));
   const data=await api('crm-workspace-projects',null,{...filters,page});if(disposed||ticket!==sequence)return;
   if(!Array.isArray(data.items)||!Number.isFinite(data.total))throw new Error('Projects are unavailable.');items=data.items;
   if(!data.items.length&&page>1){go(page-1);return;}
   target.innerHTML=`<p class="fine">${data.total} ${data.total===1?'project':'projects'}</p>`+(data.items.length?`<div class="research-grid workspace-project-grid">${data.items.map(workspaceProjectCard).join('')}</div>`:`<div class="research-empty"><h3>No projects found.</h3><p>Try other filters or add a project from a client workspace.</p><a class="secondary" data-lead href="/admin/clients">Open clients</a></div>`);
   if(data.total>25)target.insertAdjacentHTML('beforeend',`<div class="actions crm-pagination"><button type="button" class="secondary" data-project-page="${page-1}" ${page<=1?'disabled':''}>Previous projects</button><span class="fine">Page ${page} / ${Math.ceil(data.total/25)}</span><button type="button" class="secondary" data-project-page="${page+1}" ${page*25>=data.total?'disabled':''}>Next projects</button></div>`);
   if(focusId)(target.querySelector(`[data-workspace-project-id="${CSS.escape(focusId)}"] ${focusControl}`)||root.querySelector('[data-projects-refresh]')).focus({preventScroll:true});
  }catch(error){if(!disposed&&ticket===sequence){target.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" class="secondary" data-projects-retry>Retry projects</button>`;}}
  finally{if(!disposed&&ticket===sequence)target.removeAttribute('aria-busy');}
 }
 function closeStatuses(except=null){target.querySelectorAll('[data-status-toggle]').forEach(button=>{if(button===except)return;button.setAttribute('aria-expanded','false');button.nextElementSibling.hidden=true;button.closest('article').classList.remove('status-open');});}
 async function setStatus(item,status,card){
  if(pending)return;if(status===item.status){closeStatuses();card.querySelector('[data-status-toggle]').focus();return;}
  pending=true;const controls=[...root.querySelectorAll('button,input,select')].map(el=>({el,disabled:el.disabled}));controls.forEach(({el})=>el.disabled=true);
  card.setAttribute('aria-busy','true');const error=card.querySelector('.workspace-project-error');error.hidden=true;
  try{
   api.invalidate?.();const current=await api('crm-project',null,{companyId:item.company_id,projectId:item.id});
   if(disposed)return;if(current.item?.status!==item.status)throw new Error('Project changed. Refresh projects before trying again.');
   await api('crm-project-status',{companyId:item.company_id,projectId:item.id,version:current.item.version,status});if(disposed)return;
   notify('Project '+statusChoices[status].toLowerCase()+'.');await load(item.id);
  }catch(reason){if(!disposed){error.hidden=false;error.querySelector('[role=alert]').textContent=reason.message;}}
  finally{pending=false;if(!disposed){controls.forEach(({el,disabled})=>{if(el.isConnected)el.disabled=disabled;});card.removeAttribute('aria-busy');}}
 }
 target.onclick=e=>{
  const button=e.target.closest('button');if(!button||button.disabled||pending)return;
  if(button.dataset.projectPage){go(Number(button.dataset.projectPage));return;}
  if(button.hasAttribute('data-projects-retry')){api.invalidate?.();load();return;}
  const card=button.closest('[data-workspace-project-id]'),item=items.find(p=>p.id===card?.dataset.workspaceProjectId);if(!item)return;
  if(button.hasAttribute('data-status-toggle')){const expanded=button.getAttribute('aria-expanded')!=='true';closeStatuses(button);button.setAttribute('aria-expanded',String(expanded));button.nextElementSibling.hidden=!expanded;card.classList.toggle('status-open',expanded);return;}
  if(button.dataset.setStatus){setStatus(item,button.dataset.setStatus,card);return;}
  if(button.hasAttribute('data-open-project')){closeStatuses();detail.open(item);}
 };
 const outside=e=>{if(!e.target.closest('.project-status-picker'))closeStatuses();};document.addEventListener('click',outside);
 target.onkeydown=e=>{if(e.key==='Escape'){const button=target.querySelector('[data-status-toggle][aria-expanded=true]');if(button){e.preventDefault();closeStatuses();button.focus();}}};
 load();return ()=>{disposed=true;sequence++;document.removeEventListener('click',outside);detail.destroy();};
}
