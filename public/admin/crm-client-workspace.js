import {mountTasks,mountNotes} from './crm-client-records.js';
import {notesButton} from './crm-quick-note.js';
import {createClientEditor} from './crm-client-editor.js';
import {mountProjectWorkspace} from './crm-project-workspace.js';
import {mountClientFiles} from './client-files.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function website(value){
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url:null;}catch{return null;}
}
function websiteLink(value){
 const url=website(value);
 return url?`<a class="client-website" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(url.hostname.replace(/^www\./,''))} <span aria-hidden="true">↗</span></a>`:'<span class="fine">Website not added</span>';
}
const back='<a href="/admin/clients" data-lead class="quiet">← All clients</a>';

export function showClients({root,api,navigate,notify}){
 let disposed=false,seq=0;
 const params=new URLSearchParams(location.search);
 let page=Math.max(1,Number(params.get('page'))||1);
 root.innerHTML='<div class="page-heading"><div><p class="eyebrow">ONGOING RELATIONSHIPS</p><h1>Clients<span>.</span></h1></div></div><form class="client-filters"><label>Search clients<input name="q" maxlength="160" type="search" placeholder="Company or website"></label><label>Account status<select name="active"><option value="">All clients</option><option value="yes">Active</option><option value="no">Inactive</option></select></label><button class="secondary">Search clients</button></form><div data-client-results aria-live="polite"></div>';
 const form=root.querySelector('form'),target=root.querySelector('[data-client-results]');
 const editor=createClientEditor({api,notify,onSaved:({company})=>navigate('/admin/clients/'+encodeURIComponent(company.id))});
 const add=document.createElement('button');add.className='primary';add.textContent='Add client';add.onclick=()=>editor.open();root.querySelector('.page-heading').append(add);
 form.elements.q.value=params.get('q')||'';form.elements.active.value=params.get('active')||'';
 const go=next=>{const query=new URLSearchParams(new FormData(form));if(next>1)query.set('page',next);navigate('/admin/clients?'+query);};
 async function load(){
  const ticket=++seq;target.textContent='Loading clients…';
  try{
   const data=await api('crm-clients',null,{...Object.fromEntries(new FormData(form)),page});
   if(disposed||ticket!==seq)return;
   const pages=Math.max(1,Math.ceil(data.total/25));
   if(page>pages){page=pages;return go(page);}
   target.innerHTML=`<p class="fine">${Number(data.total)||0} ${data.total===1?'client':'clients'}</p>`+((data.items||[]).length?`<div class="research-grid client-grid">${data.items.map(c=>`<article class="research-card client-card">
    <div class="research-card-top"><span class="research-tag ${c.active?'research-tag-accent':''}">${c.active?'Active client':'Inactive client'}</span>${c.archived_at?'<span class="research-tag">Archived</span>':''}</div>
    <h2><a class="research-card-link" data-lead href="/admin/clients/${encodeURIComponent(c.company_id)}">${esc(c.company_name)}</a></h2>
    <p class="client-industry">${esc(c.industry||'Industry not added')}</p>
    ${websiteLink(c.website)}
    <p class="client-card-description">${esc(c.short_description||'No company summary yet.')}</p>
    <div class="research-card-footer"><span>Client since ${esc(c.client_since)}</span><span class="client-open">Open client <span aria-hidden="true">↗</span></span></div>
   </article>`).join('')}</div>`:'<div class="research-empty"><h2>No clients found.</h2><p>Use Add client to create your first client, or try another search.</p></div>')+
   `<div class="actions crm-pagination"><button class="secondary" data-client-page="${page-1}" ${page===1?'disabled':''}>Previous</button><span class="fine">Page ${page} / ${pages}</span><button class="secondary" data-client-page="${page+1}" ${page>=pages?'disabled':''}>Next</button></div>`;
  }catch(error){if(!disposed&&ticket===seq)target.innerHTML=`<p role="alert">${esc(error.message)}</p><button class="secondary" data-client-retry>Retry clients</button>`;}
 }
 form.onsubmit=e=>{e.preventDefault();go(1);};
 target.onclick=e=>{const b=e.target.closest('button');if(b?.dataset.clientPage)go(Number(b.dataset.clientPage));if(b?.hasAttribute('data-client-retry'))load();};
 load();return ()=>{disposed=true;editor.destroy();};
}

export function showClientDetail({root,api,notify,companyId,navigate}){
 let disposed=false,cleanup=()=>{},ticket=0;
 async function load(){
  const current=++ticket;cleanup();cleanup=()=>{};
  root.innerHTML=back+'<p role="status">Loading client…</p>';
  try{
   const {item:client,company}=await api('crm-client',null,{companyId});
   if(disposed||current!==ticket)return;
   if(!client)throw new Error('This company has not been converted to a client.');
   root.innerHTML=back+`<div class="page-heading"><div><p class="eyebrow">CLIENT WORKSPACE</p><h1>${esc(company.company_name)}${company.company_name.endsWith('.')?'':'<span>.</span>'}</h1></div><div class="client-heading-actions"><button type="button" class="secondary" data-edit-client ${company.archived_at?'disabled':''}>Edit client</button><span class="research-tag ${client.active?'research-tag-accent':''}">${client.active?'Active client':'Inactive client'}</span></div></div>
    ${company.archived_at?'<p class="fine">This company is archived. Restore it in Leads to change its tasks.</p>':''}
    <section class="research-panel client-summary"><div><p class="eyebrow">AT A GLANCE</p><h2>${esc(company.industry||'Company summary')}</h2><p class="crm-description">${esc(company.short_description||'No company summary yet.')}</p></div><div class="client-summary-meta">${websiteLink(company.website)}<p class="fine">Client since ${esc(client.client_since)}</p></div></section>
    <div class="client-workspace-grid">
     <section class="research-panel client-tasks" aria-labelledby="client-tasks-title"><p class="eyebrow">WHAT’S NEXT</p><h2 id="client-tasks-title">Task list.</h2><p class="fine">Keep track of the work to do for this client.</p>
      <form data-task-form><label>New task<input name="title" maxlength="160" required placeholder="What needs to be done?" ${company.archived_at?'disabled':''}></label><div class="actions"><button class="primary" ${company.archived_at?'disabled':''}>Add task</button><button type="button" class="quiet" data-cancel-task hidden>Cancel edit</button></div><p role="alert" data-task-error></p></form>
      <div data-task-list aria-live="polite"></div>
     </section>
     <section class="research-panel client-notes" aria-labelledby="client-notes-title"><div class="section-title"><div><p class="eyebrow">IDEAS & UPDATES</p><h2 id="client-notes-title">Notes.</h2></div>${notesButton(company,{preview:false})}</div>
      ${client.account_notes?`<details class="client-account-notes"><summary>Account notes</summary><p class="crm-description">${esc(client.account_notes)}</p></details>`:''}
      <form data-client-note-form><label>New note<textarea name="content" rows="4" maxlength="5000" required placeholder="Write a note about this client…"></textarea></label><button class="primary">Save note</button><p role="alert"></p></form><div data-client-notes aria-live="polite"></div>
     </section>
    </div>`;
   const projectId=new URLSearchParams(location.search).get('project');
   const filesTab=new URLSearchParams(location.search).get('tab')==='files';
   const tabNav=document.createElement('nav');tabNav.className='client-file-tabs';tabNav.setAttribute('aria-label','Client workspace');
   const clientBase='/admin/clients/'+encodeURIComponent(companyId);
   tabNav.innerHTML=`<a data-lead href="${clientBase}" ${!filesTab?'aria-current="page"':''}>Overview & projects</a><a data-lead href="${clientBase}?tab=files" ${filesTab?'aria-current="page"':''}>Files</a>`;
   root.querySelector('.page-heading').after(tabNav);
   const general=root.querySelector('.client-workspace-grid');general.id='client-general-panel';general.hidden=!!projectId;
   root.querySelector('.client-summary').hidden=!!projectId;
   const projects=document.createElement('section');projects.id='client-projects-panel';projects.setAttribute('aria-label',projectId?'Project workspace':'Client projects');general.after(projects);
   const files=document.createElement('section');files.id='client-files-panel';files.hidden=!filesTab;projects.after(files);
   if(filesTab){general.hidden=true;projects.hidden=true;root.querySelector('.client-summary').hidden=true;}
   const stopFiles=filesTab?mountClientFiles({root:files,api,notify,company}):()=>{};
   const stopProjects=filesTab?()=>{}:mountProjectWorkspace({root:projects,api,notify,company,navigate,projectId});
   const stopTasks=projectId||filesTab?()=>{}:mountTasks({root:root.querySelector('.client-tasks'),api,notify,companyId,archived:!!company.archived_at});
   const stopNotes=projectId||filesTab?()=>{}:mountNotes({root:root.querySelector('.client-notes'),api,notify,companyId});
   const editor=createClientEditor({api,notify,onSaved:({company:updated})=>{
    Object.assign(company,updated);
    root.querySelector('.page-heading h1').innerHTML=esc(company.company_name)+(company.company_name.endsWith('.')?'':'<span>.</span>');
    root.querySelector('.client-summary h2').textContent=company.industry||'Company summary';
    root.querySelector('.client-summary .crm-description').textContent=company.short_description||'No company summary yet.';
    root.querySelector('.client-summary-meta').innerHTML=websiteLink(company.website)+`<p class="fine">Client since ${esc(client.client_since)}</p>`;
    const notes=root.querySelector('[data-quick-note]');notes.dataset.companyName=company.company_name;notes.setAttribute('aria-label','Notes for '+company.company_name);
   }});
   root.querySelector('[data-edit-client]').onclick=()=>editor.open(company);
   cleanup=()=>{stopTasks();stopNotes();stopProjects();stopFiles();editor.destroy();};
  }catch(error){if(!disposed&&current===ticket){root.innerHTML=back+`<p role="alert">${esc(error.message)}</p><button class="secondary" data-retry-client>Retry client</button>`;root.querySelector('[data-retry-client]').onclick=load;}}
 }
 load();return ()=>{disposed=true;cleanup();};
}
