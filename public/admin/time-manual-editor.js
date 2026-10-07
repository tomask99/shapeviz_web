import {esc,euro,durationParts,earnedCents,localDate,timeZone} from './time-values.js';
import {svgIcon} from '../ui/icons.js';
import {announceTimeChange} from './time-store.js';

export function createManualTimeEditor({api,onSaved=()=>{}}){
 const dialog=document.createElement('dialog'),title='manual-time-'+crypto.randomUUID();
 dialog.className='client-editor crm-record-dialog';dialog.setAttribute('aria-labelledby',title);
 dialog.innerHTML=`<form><div class="dialog-head"><div><p class="eyebrow" data-project-name></p><h2 id="${title}">Add time manually.</h2></div><button type="button" data-close aria-label="Close manual time">${svgIcon('close')}</button></div>
  <div class="two-columns"><label>Date<input name="work_date" type="date" min="1900-01-01" max="9999-12-31" required></label><label>Start time<input name="work_time" type="time" step="60" required></label></div><p class="fine" data-zone></p>
  <fieldset class="manual-duration"><legend>Time worked</legend><div class="two-columns"><label>Hours<input name="hours" type="number" min="0" max="24" step="1" inputmode="numeric" required></label><label>Minutes<input name="minutes" type="number" min="0" max="59" step="1" inputmode="numeric" required></label></div><label data-seconds hidden>Seconds<input name="seconds" type="number" min="0" max="59" step="1" inputmode="numeric" value="0"></label></fieldset>
  <label>Description<textarea name="description" rows="3" maxlength="5000"></textarea></label><p class="manual-preview" data-preview aria-live="polite"></p><p role="alert"></p><div class="actions"><button class="secondary" type="button" data-close>Cancel</button><button class="primary" type="submit">Save time</button></div></form>`;
 document.body.append(dialog);const form=dialog.querySelector('form');let disposed=false,pending=false,context=null,intent=null;
 const seconds=()=>durationParts(form.elements.hours.value,form.elements.minutes.value,form.elements.seconds.value);
 function preview(){try{form.querySelector('[data-preview]').textContent=euro(context.record?.rate_cents??context.project.hourly_rate_cents)+'/h · '+euro(earnedCents(seconds(),context.record?.rate_cents??context.project.hourly_rate_cents));}catch(e){form.querySelector('[data-preview]').textContent=e.message;}}
 form.oninput=()=>{if(context)preview();};
 dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!pending)dialog.close();});dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
 form.onsubmit=async e=>{
  e.preventDefault();if(pending||!context)return;
  try{seconds();}catch(error){form.querySelector('[role=alert]').textContent=error.message;return;}
  if(!intent)intent={...Object.fromEntries(new FormData(form)),projectId:context.project.id,companyId:context.company.id,timeZone:context.record?.time_zone||timeZone(),requestId:crypto.randomUUID(),...(context.record?{id:context.record.id,version:context.record.version}:{})};
  pending=true;dialog.dataset.dismissPending='true';form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);
  try{await api('crm-time-manual-save',intent);if(disposed)return;intent=null;dialog.close();announceTimeChange();onSaved();}
  catch(error){if(!disposed){form.querySelector('[role=alert]').textContent=error.message+(!error.status||error.status>=500?' Retry Save time to confirm the same entry.':'');if(error.status&&error.status<500)intent=null;}}
  finally{pending=false;if(!disposed){dialog.dataset.dismissPending='false';form.querySelectorAll('button').forEach(el=>el.disabled=false);form.querySelectorAll('input,textarea').forEach(el=>el.disabled=!!intent);}}
 };
 return {open({project,company,record=null}){
  if(pending||disposed)return;context={project,company,record};intent=null;form.reset();form.querySelector('h2').textContent=record?'Edit manual time.':'Add time manually.';
  form.querySelector('[data-project-name]').textContent=project.name;form.querySelector('[role=alert]').textContent='';
  const zone=record?.time_zone||timeZone();form.elements.work_date.value=record?.work_date||localDate();
  form.elements.work_time.value=record?record.work_time?.slice(0,5)||'':new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  form.elements.work_time.required=!record||!!record.work_time;
  form.querySelector('[data-zone]').textContent=zone+(record&&!record.work_time?' · Start time was not recorded.':'');
  const duration=Number(record?.duration_seconds??3600);form.elements.hours.value=String(Math.floor(duration/3600));form.elements.minutes.value=String(Math.floor(duration%3600/60));form.elements.seconds.value=String(duration%60);form.querySelector('[data-seconds]').hidden=duration%60===0;
  form.elements.description.value=record?.description||'';form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=false);preview();dialog.showModal();form.elements.work_date.focus();
 },destroy(){disposed=true;dialog.close();dialog.remove();}};
}
