const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function notesButton(record,{candidate=false,preview=true}={}) {
 const id=candidate?record.id:record.company_id||record.id;
 return `<div class="crm-notes-control"><button type="button" class="secondary crm-notes-button" data-quick-note="${esc(id)}" data-note-kind="${candidate?'candidate':'company'}" data-company-name="${esc(record.company_name)}" aria-label="Notes for ${esc(record.company_name)}">Notes</button>${preview?'<p class="crm-note-preview" data-note-preview hidden></p>':''}</div>`;
}

// One shared reader/editor and batched summaries for every company surface.
export function installQuickNotes({api,notify}) {
 const dialog=document.createElement('dialog');dialog.id='quick-note';dialog.className='crm-record-dialog';dialog.setAttribute('aria-labelledby','quick-note-title');
 dialog.innerHTML='<div class="dialog-head"><h2 id="quick-note-title">Notes.</h2><button type="button" data-close aria-label="Close">×</button></div><p data-company></p><section data-notes-list aria-live="polite"></section><form><label>Note<textarea name="content" rows="4" maxlength="5000" required></textarea></label><p role="alert"></p><div class="actions"><button type="button" class="secondary" data-close>Cancel</button><button type="button" class="quiet" data-reset hidden>Cancel edit</button><button type="submit" class="primary">Save note</button></div></form>';
 document.body.append(dialog);
 const form=dialog.querySelector('form'),list=dialog.querySelector('[data-notes-list]');
 let target=null,pending=false,ticket=0,page=1,items=[],editing=null,seen=new WeakSet(),summaryEpoch=0,scheduled=false;
 const buttons=()=>[...document.querySelectorAll('#studio [data-quick-note],#crm-command [data-quick-note]')];
 const reset=()=>{editing=null;form.reset();form.querySelector('[data-reset]').hidden=true;form.querySelector('[type=submit]').textContent='Save note';};
 const params=()=>target.kind==='candidate'?{candidateId:target.id}:{companyId:target.id};
 function schedule(){if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;hydrate();});}}
 async function hydrate(){
  const fresh=buttons().filter(b=>!seen.has(b));fresh.forEach(b=>seen.add(b));
  const epoch=summaryEpoch;
  for(let offset=0;offset<fresh.length;offset+=150){
   const batch=fresh.slice(offset,offset+150),ids=kind=>[...new Set(batch.filter(b=>(b.dataset.noteKind||'company')===kind).map(b=>b.dataset.quickNote))].join(',');
   try{
    const data=await api('crm-note-summaries',null,{companyIds:ids('company'),candidateIds:ids('candidate')});
    if(epoch!==summaryEpoch)return;
    for(const b of batch){
     if(!b.isConnected)continue;
     const summary=(data.items||[]).find(s=>s.id===b.dataset.quickNote&&s.kind===(b.dataset.noteKind||'company'));
     const count=Number(summary?.note_count)||0;
     b.classList.toggle('has-notes',count>0);b.textContent=count?`Notes (${count})`:'Notes';
     b.setAttribute('aria-label',`Notes${count?` (${count})`:''} for ${b.dataset.companyName||'company'}`);
     b.title=count?`${count} notes — open to read or add a note`:'Open notes';
     const preview=b.parentElement.querySelector('[data-note-preview]');
     if(preview){preview.textContent=summary?.latest_note||'';preview.hidden=!count;}
    }
   }catch{
    if(epoch!==summaryEpoch)return;
    batch.filter(b=>b.isConnected).forEach(b=>{b.textContent='Notes · ?';b.title='Note count unavailable. Open Notes to retry.';});
   }
  }
 }
 const observer=new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('[data-quick-note]')||n.querySelector('[data-quick-note]')))))schedule();});
 observer.observe(document.body,{childList:true,subtree:true});schedule();
 document.addEventListener('crm-note-saved',()=>{summaryEpoch++;seen=new WeakSet();schedule();});
 async function load(){
  const current=++ticket,query={...params(),page};
  list.innerHTML='<p class="fine">Loading notes…</p>';
  try{
   const data=await api('crm-notes',null,query);
   if(current!==ticket||!dialog.open)return;
   items=data.items||[];
   if(!items.length&&page>1){page--;return load();}
   list.innerHTML=(items.length?items.map(n=>`<article class="crm-entry"><p class="fine">${esc(new Date(n.created_at).toLocaleString())}${n.version>1?' · Edited':''}</p><p class="crm-description">${esc(n.content)}</p><div class="actions"><button type="button" class="quiet" data-note-edit="${esc(n.id)}">Edit note</button><button type="button" class="quiet" data-note-delete="${esc(n.id)}">Delete note</button></div></article>`).join(''):'<p class="fine">No notes yet. Add the first note below.</p>')+`<div class="actions"><button type="button" class="secondary" data-note-page="-1" ${page===1?'disabled':''}>Previous notes</button><span class="fine">Page ${page}</span><button type="button" class="secondary" data-note-page="1" ${!data.hasMore?'disabled':''}>Next notes</button></div>`;
  }catch(error){if(current===ticket&&dialog.open)list.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" class="secondary" data-note-retry>Retry notes</button>`;}
 }
 function changed(item){document.dispatchEvent(new CustomEvent('crm-note-saved',{detail:{...params(),item}}));}
 function lock(value){pending=value;dialog.dataset.dismissPending=String(value);form.querySelectorAll('button').forEach(b=>b.disabled=value);form.elements.content.disabled=value;}
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-quick-note]');if(!b||document.querySelector('#studio')?.hidden||pending)return;
  e.preventDefault();target={id:b.dataset.quickNote,kind:b.dataset.noteKind||'company'};page=1;items=[];reset();form.querySelector('[role=alert]').textContent='';dialog.querySelector('[data-company]').textContent=b.dataset.companyName||'Company notes';dialog.showModal();load();form.elements.content.focus();
 });
 dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
 dialog.addEventListener('close',()=>{ticket++;target=null;reset();});
 dialog.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||pending)return;
  if(b.hasAttribute('data-close'))dialog.close();
  if(b.hasAttribute('data-reset'))reset();
  if(b.hasAttribute('data-note-retry'))load();
  if(b.dataset.notePage){page+=Number(b.dataset.notePage);load();}
  if(b.dataset.noteEdit){editing=items.find(n=>n.id===b.dataset.noteEdit);if(editing){form.elements.content.value=editing.content;form.querySelector('[data-reset]').hidden=false;form.querySelector('[type=submit]').textContent='Save changes';form.elements.content.focus();}}
  if(b.dataset.noteDelete){
   const note=items.find(n=>n.id===b.dataset.noteDelete);if(!note||!confirm('Delete this note?'))return;
   lock(true);form.querySelector('[role=alert]').textContent='';
   try{await api('crm-note-delete',{...params(),id:note.id,version:note.version,confirm:'delete'});changed();if(editing?.id===note.id)reset();notify('Note deleted.');await load();}
   catch(error){form.querySelector('[role=alert]').textContent=error.message;}finally{lock(false);}
  }
 });
 form.onsubmit=async e=>{
  e.preventDefault();if(pending)return;
  const content=form.elements.content.value.trim();if(!content){form.querySelector('[role=alert]').textContent='Enter some text.';return;}
  lock(true);form.querySelector('[role=alert]').textContent='';
  try{const {item}=await api('crm-note-save',{...params(),content,...(editing?{id:editing.id,version:editing.version}:{})});changed(item);notify('Note saved.');dialog.close();}
  catch(error){form.querySelector('[role=alert]').textContent=error.message;}finally{lock(false);}
 };
}
