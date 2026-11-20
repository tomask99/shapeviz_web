import {esc,clockTime,euro,earnedCents,timeZone} from './time-values.js';
import {svgIcon} from '../ui/icons.js';
import {announceTimeChange} from './time-store.js';

// datetime-local uses the same browser zone as the history. Keep the original
// instant on unchanged fields, including the repeated hour when DST ends.
export function segmentLocalTime(value){
 const d=new Date(value),pad=n=>String(n).padStart(2,'0');
 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function segmentInstant(value,original){
 const normalized=value.length===16?value+':00':value;
 if(normalized===segmentLocalTime(original))return new Date(original).toISOString();
 const date=new Date(normalized);
 if(!Number.isFinite(date.getTime())||segmentLocalTime(date)!==normalized)throw new Error('Enter a valid local time. This time may not exist because the clocks change.');
 return date.toISOString();
}
export function createSegmentDetail({api,readOnly=false,onSaved=()=>{}}){
 const dialog=document.createElement('dialog');dialog.className='time-detail client-editor';dialog.setAttribute('aria-label','Session details');document.body.append(dialog);
 let disposed=false,sequence=0,pending=false,data=null,intent=null;
 const stamp=value=>new Date(value).toLocaleString('en-GB',{timeZone:timeZone(),dateStyle:'medium',timeStyle:'medium'});
 const close=()=>{if(!pending)dialog.close();};
 dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
 dialog.addEventListener('close',()=>{sequence++;});
 function render(){
  dialog.innerHTML=`<div class="dialog-head"><h2>Session details.</h2><button type="button" data-close aria-label="Close session details">${svgIcon('close')}</button></div><h3>${esc(data.item.project_name||data.item.activity_name)}</h3><p data-session-duration>${clockTime(data.item.duration_seconds)} active · ${esc(data.item.status)}</p><p class="fine">${esc(timeZone())}. Gaps between these active segments are pauses.</p><ol class="time-segments">${data.segments.map((g,i)=>`<li><div class="time-segment-summary"><div><span>Start: ${esc(stamp(g.started_at))}</span><span>End: ${g.ended_at?esc(stamp(g.ended_at)):'Still running'}</span><p class="time-description">${esc(g.description)}</p>${g.ended_at?`<strong>${clockTime((Date.parse(g.ended_at)-Date.parse(g.started_at))/1000)}</strong>`:''}</div>${!readOnly&&g.ended_at?`<button type="button" class="quiet" data-segment-edit="${i}" aria-label="Edit segment ${i+1}">Edit</button>`:''}</div>${!readOnly&&!g.ended_at?'<p class="fine">Pause or finish the timer to edit this segment.</p>':''}<div data-segment-form></div></li>`).join('')}</ol><p role="status" data-save-status></p>`;
  dialog.querySelector('[data-close]').onclick=close;
  dialog.querySelectorAll('[data-segment-edit]').forEach(b=>b.onclick=()=>edit(Number(b.dataset.segmentEdit)));
 }
 function edit(index){
  if(pending)return;intent=null;render();
  const segment=data.segments[index],host=dialog.querySelectorAll('[data-segment-form]')[index];
  host.innerHTML=`<form class="time-segment-editor"><div class="two-columns"><label>Start<input name="started_at" type="datetime-local" step="1" min="1900-01-01T00:00:00" required></label><label>End<input name="ended_at" type="datetime-local" step="1" min="1900-01-01T00:00:00" required></label></div><label>Description<textarea name="description" rows="3" maxlength="5000"></textarea></label><p data-preview aria-live="polite"></p><p role="alert"></p><div class="actions"><button type="button" class="secondary" data-cancel>Cancel</button><button type="submit" class="primary">Save segment</button></div></form>`;
  const form=host.querySelector('form');
  for(const key of ['started_at','ended_at'])form.elements[key].value=segmentLocalTime(segment[key]);
  form.elements.description.value=segment.description||'';
  const values=()=>{
   const started_at=segmentInstant(form.elements.started_at.value,segment.started_at),ended_at=segmentInstant(form.elements.ended_at.value,segment.ended_at);
   if(ended_at<=started_at)throw new Error('End must be after start.');
   if(Date.parse(ended_at)>Date.now())throw new Error('End cannot be in the future.');
   return {started_at,ended_at};
  };
  const preview=()=>{try{const v=values(),seconds=(Date.parse(v.ended_at)-Date.parse(v.started_at))/1000;form.querySelector('[data-preview]').textContent=clockTime(seconds)+(data.item.rate_cents!=null?' · '+euro(earnedCents(seconds,data.item.rate_cents)):'');}catch(e){form.querySelector('[data-preview]').textContent=e.message;}};
  form.oninput=()=>{form.querySelector('[role=alert]').textContent='';preview();};preview();form.querySelector('[data-cancel]').onclick=()=>{if(!pending){render();dialog.querySelectorAll('[data-segment-edit]')[index]?.focus();}};
  form.onsubmit=async e=>{
   e.preventDefault();if(pending)return;
   try{if(!intent)intent={...values(),description:form.elements.description.value,id:data.item.id,segmentId:segment.id,version:data.item.version,requestId:crypto.randomUUID()};}
   catch(error){form.querySelector('[role=alert]').textContent=error.message;return;}
   pending=true;dialog.dataset.dismissPending='true';dialog.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);
   let saved=false;
   try{
    await api('crm-time-segment-save',intent);saved=true;intent=null;
    if(disposed)return;
    announceTimeChange();onSaved();
    data=await api('crm-time-detail',null,{id:data.item.id});
    if(disposed)return;if(!data.item)throw new Error('Session no longer available.');
    render();dialog.querySelector('[data-save-status]').textContent='Segment saved.';dialog.querySelectorAll('[data-segment-edit]')[index]?.focus();
   }catch(error){if(!disposed){form.querySelector('[role=alert]').textContent=(saved?'Saved, but details could not be refreshed. Close and reopen this session. ':error.status===409?'':(!error.status||error.status>=500)?'Retry Save segment to confirm the same change. ':'')+error.message;if(error.status&&error.status<500)intent=null;}}
   finally{pending=false;if(!disposed){dialog.dataset.dismissPending='false';dialog.querySelectorAll('button').forEach(el=>el.disabled=false);form.querySelectorAll('input,textarea').forEach(el=>el.disabled=!!intent||saved);if(saved&&form.isConnected)form.querySelector('[type=submit]').disabled=true;}}
  };
  form.elements.description.focus();
 }
 return {async open(row,editFirst=false){
  if(disposed||pending)return;const ticket=++sequence;
  dialog.innerHTML='<p role="status">Loading session…</p><button type="button" class="secondary" data-close>Close</button>';dialog.querySelector('[data-close]').onclick=close;if(!dialog.open)dialog.showModal();
  try{const result=await api('crm-time-detail',null,{id:row.id});if(disposed||ticket!==sequence||!dialog.open)return;if(!result.item)throw new Error('Session no longer available.');data=result;render();if(editFirst&&!readOnly){const index=data.segments.findIndex(g=>g.ended_at);if(index>=0)edit(index);}}
  catch(error){if(!disposed&&ticket===sequence)dialog.querySelector('[role=status]').textContent=error.message;}
 },destroy(){disposed=true;sequence++;dialog.close();dialog.remove();}};
}
