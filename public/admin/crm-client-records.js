const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountTasks({root,api,notify,companyId,archived,projectId=null}){
 if(projectId){const request=api;api=(action,body,params)=>request(action.replace('crm-client-task','crm-project-task'),body?{...body,projectId}:null,{...params,projectId});}
 const form=root.querySelector('form'),list=root.querySelector('[data-task-list]'),error=root.querySelector('[data-task-error]');
 let disposed=false,pending=false,seq=0,page=1,items=[],editing=null;
 function lock(value){pending=value;root.querySelectorAll('input,button').forEach(el=>{if(value){el.dataset.wasDisabled=String(el.disabled);el.disabled=true;}else el.disabled=el.dataset.wasDisabled==='true';});}
 function reset(){editing=null;form.reset();form.querySelector('label').firstChild.textContent='New task';form.querySelector('[type=button]').hidden=true;form.querySelector('.primary').textContent='Add task';}
 async function load(){
  const ticket=++seq;list.textContent='Loading tasks…';
  try{
   const data=await api('crm-client-tasks',null,{companyId,page});if(disposed||ticket!==seq)return;
   items=data.items||[];
   if(!items.length&&page>1){page--;return load();}
   list.innerHTML=(items.length?`<ul class="client-task-items">${items.map(t=>`<li class="client-task ${t.completed?'is-complete':''}"><label class="client-task-check"><input type="checkbox" data-task-check="${esc(t.id)}" ${t.completed?'checked':''} ${archived?'disabled':''}><span>${esc(t.title)}</span></label><div class="client-task-actions"><button type="button" class="quiet" data-task-edit="${esc(t.id)}" aria-label="Edit task: ${esc(t.title)}" ${archived?'disabled':''}>Edit</button><button type="button" class="quiet" data-task-delete="${esc(t.id)}" aria-label="Delete task: ${esc(t.title)}" ${archived?'disabled':''}>Delete</button></div></li>`).join('')}</ul>`:'<p class="client-empty">No tasks yet. Add the first thing to do above.</p>')+
    `<div class="actions client-list-pagination"><button type="button" class="quiet" data-task-page="-1" ${page===1?'disabled':''}>Previous tasks</button><span class="fine">Page ${page}</span><button type="button" class="quiet" data-task-page="1" ${!data.hasMore?'disabled':''}>Next tasks</button></div>`;
   // A successful mutation may still be waiting for this refresh.
   if(pending)list.querySelectorAll('input,button').forEach(el=>{el.dataset.wasDisabled=String(el.disabled);el.disabled=true;});
  }catch(e){if(!disposed&&ticket===seq)list.innerHTML=`<p role="alert">${esc(e.message)}</p><button type="button" class="quiet" data-task-retry>Retry tasks</button>`;}
 }
 async function save(action,body,onSuccess){
  if(pending||archived)return;lock(true);error.textContent='';
  try{await api(action,{companyId,...body});if(disposed)return true;onSuccess?.();notify(action==='crm-client-task-delete'?'Task deleted.':'Task saved.');await load();return true;}
  catch(e){if(!disposed)error.innerHTML=`${esc(e.message)} <button type="button" class="quiet" data-task-retry>Refresh tasks</button>`;return false;}
  finally{if(!disposed)lock(false);}
 }
 form.onsubmit=e=>{e.preventDefault();save('crm-client-task-save',{title:form.elements.title.value,...(editing?{id:editing.id,version:editing.version}:{})},()=>{reset();page=1;});};
 root.onclick=e=>{
  const b=e.target.closest('button');if(!b||pending)return;
  if(b.hasAttribute('data-cancel-task'))reset();
  if(b.hasAttribute('data-task-retry'))load();
  if(b.dataset.taskPage){page+=Number(b.dataset.taskPage);load();}
  if(b.dataset.taskEdit){editing=items.find(t=>t.id===b.dataset.taskEdit);if(!editing)return;form.elements.title.value=editing.title;form.querySelector('label').firstChild.textContent='Edit task';form.querySelector('[type=button]').hidden=false;form.querySelector('.primary').textContent='Save task';form.elements.title.focus();}
  if(b.dataset.taskDelete){const task=items.find(t=>t.id===b.dataset.taskDelete);if(task&&confirm('Delete this task?'))save('crm-client-task-delete',{id:task.id,version:task.version,confirm:'delete'},()=>{if(editing?.id===task.id)reset();});}
 };
 list.onchange=async e=>{
  const task=items.find(t=>t.id===e.target.dataset.taskCheck);if(!task)return;
  const checkbox=e.target,completed=checkbox.checked;
  const saved=await save('crm-client-task-save',{id:task.id,version:task.version,completed},()=>{if(editing?.id===task.id)reset();});
  if(!saved&&!disposed&&checkbox.isConnected)checkbox.checked=task.completed;
 };
 load();return ()=>{disposed=true;};
}

export function mountNotes({root,api,notify,companyId,projectId=null,archived=false}){
 if(projectId){const request=api;api=(action,body,params)=>request(action.replace('crm-note','crm-project-note'),body?{...body,projectId}:null,{...params,projectId});}
 const form=root.querySelector('form'),list=root.querySelector('[data-client-notes]');
 const eventName=projectId?'crm-project-note-saved':'crm-note-saved';
 let disposed=false,pending=false,page=1,seq=0,items=[],editing=null;
 const cancel=document.createElement('button');cancel.type='button';cancel.className='quiet';cancel.textContent='Cancel edit';cancel.hidden=true;
 if(projectId)form.querySelector('button').after(cancel);
 const reset=()=>{editing=null;form.reset();cancel.hidden=true;form.querySelector('button').textContent='Save note';};
 cancel.onclick=()=>{if(!pending)reset();};
 function lock(value){pending=value;form.querySelectorAll('button,textarea').forEach(el=>el.disabled=value||archived);}
 async function load(){
  const ticket=++seq;list.textContent='Loading notes…';
  try{
   const data=await api('crm-notes',null,{companyId,page});if(disposed||ticket!==seq)return;
   items=data.items||[];
   if(!data.items?.length&&page>1){page--;return load();}
   list.innerHTML=(data.items?.length?data.items.map(n=>`<article class="client-note"><p class="fine"><time datetime="${esc(n.created_at)}">${esc(new Date(n.created_at).toLocaleString())}</time></p><p class="crm-description">${esc(n.content)}</p>${projectId?`<div class="actions"><button type="button" class="quiet" data-record-edit="${esc(n.id)}" ${archived?'disabled':''}>Edit note</button><button type="button" class="quiet" data-record-delete="${esc(n.id)}" ${archived?'disabled':''}>Delete note</button></div>`:''}</article>`).join(''):'<p class="client-empty">No notes yet. Keep ideas and updates here.</p>')+
    `<div class="actions client-list-pagination"><button type="button" class="quiet" data-note-page="-1" ${page===1?'disabled':''}>Previous notes</button><span class="fine">Page ${page}</span><button type="button" class="quiet" data-note-page="1" ${!data.hasMore?'disabled':''}>Next notes</button></div>`;
  }catch(e){if(!disposed&&ticket===seq)list.innerHTML=`<p role="alert">${esc(e.message)}</p><button type="button" class="quiet" data-note-retry>Retry notes</button>`;}
 }
 const changed=e=>{if(e.detail?.companyId===companyId&&(!projectId||e.detail.projectId===projectId)){page=1;load();}};
 document.addEventListener(eventName,changed);
 form.onsubmit=async e=>{
  e.preventDefault();if(pending||archived)return;lock(true);form.querySelector('[role=alert]').textContent='';
  try{await api('crm-note-save',{companyId,content:form.elements.content.value,...(editing?{id:editing.id,version:editing.version}:{})});if(disposed)return;reset();notify('Note saved.');document.dispatchEvent(new CustomEvent(eventName,{detail:{companyId,projectId}}));}
  catch(error){if(!disposed)form.querySelector('[role=alert]').textContent=error.message;}
  finally{if(!disposed)lock(false);}
 };
 list.onclick=async e=>{
  const b=e.target.closest('button');if(!b||pending)return;
  if(b.hasAttribute('data-note-retry'))load();if(b.dataset.notePage){page+=Number(b.dataset.notePage);load();}
  if(archived)return;
  if(b.dataset.recordEdit){editing=items.find(n=>n.id===b.dataset.recordEdit);if(editing){form.elements.content.value=editing.content;cancel.hidden=false;form.querySelector('button').textContent='Save changes';form.elements.content.focus();}}
  if(b.dataset.recordDelete){const note=items.find(n=>n.id===b.dataset.recordDelete);if(!note||!confirm('Delete this note?'))return;lock(true);form.querySelector('[role=alert]').textContent='';
   try{await api('crm-note-delete',{companyId,id:note.id,version:note.version,confirm:'delete'});if(disposed)return;if(editing?.id===note.id)reset();notify('Note deleted.');await load();}catch(error){if(!disposed)form.querySelector('[role=alert]').textContent=error.message;}finally{if(!disposed)lock(false);}
  }
 };
 lock(false);load();return ()=>{disposed=true;document.removeEventListener(eventName,changed);};
}
