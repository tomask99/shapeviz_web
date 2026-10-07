import {esc,euro,clockTime,timeZone} from './time-values.js';
import {svgIcon} from '../ui/icons.js';
import {createManualTimeEditor} from './time-manual-editor.js';
import {announceTimeChange} from './time-store.js';
export const stamp=value=>value?new Date(value).toLocaleString('en-GB',{timeZone:timeZone(),dateStyle:'medium',timeStyle:'medium'}):'Not finished';
export async function timeOptions(api,companyId){
 const items=[];for(let page=1;page<=10000;page++){const data=await api('crm-time-options',null,{page,...(companyId?{companyId}:{})});items.push(...data.items);if(!data.hasMore)break;}return items;
}
export function mountTimeHistory({root,api,projectId,companyId,readOnly=false}){
 let disposed=false,sequence=0,page=1,rows=[],clientSequence=0,pendingDelete=false;
 const deleting=new Map(),editor=createManualTimeEditor({api});
 root.innerHTML=`<div class="section-title"><h3>Time entries.</h3><button type="button" class="quiet" data-refresh>Refresh entries</button></div>
 <form class="time-filters"><label>From<input name="from" type="date"></label><label>To<input name="to" type="date"></label>${projectId?'':`<label>Client filter<select name="companyId"><option value="">All clients</option></select></label><label>Project filter<select name="projectId"><option value="">All projects</option></select></label><label>Activity type<select name="kind"><option value="">All types</option><option value="project">Client work</option><option value="custom_activity">Custom activity</option></select></label>`}<button class="secondary">Apply filters</button></form>
 <details class="ui-help"><summary>About time entries</summary><p>${esc(timeZone())}. Date filters include sessions with work in the period. Each row shows its full active duration.</p></details><div data-time-rows aria-live="polite"></div>`;
 const form=root.querySelector('form'),target=root.querySelector('[data-time-rows]');
 if(!projectId){timeOptions(api).then(items=>{if(disposed)return;form.elements.companyId.innerHTML+items.map(c=>`<option value="${esc(c.id)}">${esc(c.company_name)}</option>`).join('');}).catch(e=>{if(!disposed)target.textContent=e.message;});
  form.elements.companyId.onchange=async()=>{const seq=++clientSequence,value=form.elements.companyId.value;form.elements.projectId.innerHTML='<option value="">All projects</option>';if(!value)return;try{const items=await timeOptions(api,value);if(!disposed&&seq===clientSequence)form.elements.projectId.innerHTML+=items.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');}catch(e){if(!disposed)target.textContent=e.message;}};
 }
 async function load(){
  const ticket=++sequence;root.querySelector('[data-delete-error]')?.remove();target.setAttribute('aria-busy','true');
  try{const data=await api('crm-time-history',null,{...Object.fromEntries(new FormData(form)),...(projectId?{projectId,companyId}:{}),page,timeZone:timeZone()});if(disposed||ticket!==sequence)return;
   rows=data.items||[];if(!rows.length&&page>1){page--;return load();}
   target.innerHTML=rows.length?rows.map((r,i)=>`<article class="time-entry">
    <div><span class="research-tag">${esc(r.source)}${r.status==='finished'?'':' · '+esc(r.status)}</span><h4>${esc(r.kind==='custom_activity'?r.activity_name:r.project_name)}</h4>${r.company_id?`<a data-lead href="/admin/clients/${encodeURIComponent(r.company_id)}?project=${encodeURIComponent(r.project_id)}">${esc(r.company_name)}</a>`:'<span class="fine">Custom activity</span>'}<p class="time-description">${esc(r.description)}</p></div>
    <div class="time-entry-dates">${r.source==='Manual'?`<span>Work date</span><strong>${esc(r.work_date)}</strong><span>Start time</span><strong>${r.work_time?esc(r.work_time.slice(0,5)):'Not recorded'}</strong>${r.time_zone?`<small>${esc(r.time_zone)}</small>`:''}`:`<span>Start</span><strong>${esc(stamp(r.started_at))}</strong><span>End</span><strong>${r.status==='finished'?esc(stamp(r.ended_at)):esc(r.status==='paused'?'Paused, still open':'Running, still open')}</strong>`}</div>
    <div class="time-entry-value"><strong>${clockTime(r.duration_seconds)}</strong><span>${r.rate_cents!=null?euro(r.earned_cents)+(r.status==='finished'?'':' estimated'):'Unbilled'}</span>${r.rate_cents!=null?`<small>${euro(r.rate_cents)}/h</small>`:''}</div>
    <div class="actions">${r.source==='Tracked'?`<button type="button" class="quiet" data-time-detail="${i}">View segments</button>`:!readOnly?`<button type="button" class="quiet" data-time-edit="${i}">Edit time</button>`:''}<button type="button" class="quiet delete-action" data-time-delete="${i}">${svgIcon('trash')} Delete time</button></div></article>`).join(''):'<div class="research-empty"><h4>No time entries yet.</h4><p>Start tracking or add time manually to record your work.</p></div>';
   target.insertAdjacentHTML('beforeend',`<div class="actions"><button type="button" class="quiet" data-time-page="-1" ${page===1?'disabled':''}>Previous entries</button><span class="fine">Page ${page}</span><button type="button" class="quiet" data-time-page="1" ${!data.hasMore?'disabled':''}>Next entries</button></div>`);
  }catch(e){if(!disposed&&ticket===sequence)target.innerHTML=`<p role="alert">${esc(e.message)}</p>`;}finally{if(!disposed)target.removeAttribute('aria-busy');}
 }
 const dialog=document.createElement('dialog');dialog.className='time-detail';dialog.setAttribute('aria-label','Session details');document.body.append(dialog);
 async function detail(row){dialog.innerHTML='<p role="status">Loading session…</p><button type="button" class="secondary" data-close>Close</button>';dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.showModal();
  try{const data=await api('crm-time-detail',null,{id:row.id});if(disposed||!dialog.open)return;if(!data.item)throw new Error('Session no longer available.');
   dialog.innerHTML=`<div class="dialog-head"><h2>Session details.</h2><button type="button" data-close aria-label="Close session details">${svgIcon('close')}</button></div><h3>${esc(data.item.project_name||data.item.activity_name)}</h3><p>${esc(data.item.description)}</p><p>${clockTime(data.item.duration_seconds)} active · ${esc(data.item.status)}</p><p class="fine">${esc(timeZone())}. Gaps between these active segments are pauses.</p><ol class="time-segments">${data.segments.map(g=>`<li><span>${esc(stamp(g.started_at))}</span><span>${g.ended_at?esc(stamp(g.ended_at)):'Still running'}</span></li>`).join('')}</ol>`;dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  }catch(e){if(!disposed)dialog.querySelector('[role=status]').textContent=e.message;}
 }
 form.onsubmit=e=>{e.preventDefault();page=1;load();};root.querySelector('[data-refresh]').onclick=load;
 async function remove(row){
  if(pendingDelete||!row)return;
  const message=row.status==='finished'?'Delete this time entry? Its worked time and earned value will be removed.':'Delete this open timer and all of its recorded time?';
  if(!confirm(message))return;
  pendingDelete=true;target.querySelectorAll('[data-time-delete],[data-time-edit],[data-time-detail]').forEach(b=>b.disabled=true);
  const key=row.source+row.id,requestId=deleting.get(key)||crypto.randomUUID();deleting.set(key,requestId);
  try{await api('crm-time-delete',{id:row.id,source:row.source,version:row.version,confirm:'delete',requestId});deleting.delete(key);if(!disposed){announceTimeChange();await load();}}
  catch(e){if(e.status&&e.status<500)deleting.delete(key);if(!disposed){let error=root.querySelector('[data-delete-error]');if(!error){error=document.createElement('p');error.setAttribute('role','alert');error.dataset.deleteError='';target.before(error);}error.textContent=e.message+(e.status===409?' Refresh entries before trying again.':'');}}
  finally{pendingDelete=false;if(!disposed)target.querySelectorAll('button[data-time-delete],button[data-time-edit],button[data-time-detail]').forEach(b=>b.disabled=false);}
 }
 target.onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled||pendingDelete)return;if(b.dataset.timePage){page+=Number(b.dataset.timePage);load();}if(b.hasAttribute('data-time-detail'))detail(rows[Number(b.dataset.timeDetail)]);if(b.hasAttribute('data-time-edit')){const row=rows[Number(b.dataset.timeEdit)];editor.open({record:row,project:{id:row.project_id,name:row.project_name,hourly_rate_cents:row.rate_cents},company:{id:row.company_id}});}if(b.hasAttribute('data-time-delete'))remove(rows[Number(b.dataset.timeDelete)]);};
 load();return {refresh:load,destroy(){disposed=true;editor.destroy();dialog.close();dialog.remove();}};
}
