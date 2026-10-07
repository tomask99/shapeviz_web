import {notesButton} from './crm-quick-note.js';
import {RECENT_TYPES} from './crm-recent-types.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createRecentActivity({api}){
 const root=document.createElement('section');root.id='recent-activity';root.className='chart-panel';root.hidden=true;
 document.querySelector('#business-overview').after(root);
 let seq=0,data=null,cursor=null,pending=null,loading=false,expanded=false;
 const events=items=>`<ul class="recent-events">${items.map(r=>`<li><a class="recent-company" href="/admin/leads/${encodeURIComponent(r.company_id)}?tab=activity" title="${esc(r.company_name)}">${esc(r.company_name)}</a><div class="recent-event"><strong>${esc(RECENT_TYPES[r.event_type]||'Activity')}</strong>${r.detail&&r.detail.trim()!==r.company_name?.trim()?`<p title="${esc(r.detail)}">${esc(r.detail)}</p>`:''}</div><time class="recent-time" datetime="${esc(r.created_at)}" title="${esc(new Date(r.created_at).toLocaleString())}">${esc(new Date(r.created_at).toLocaleString(undefined,{dateStyle:'short',timeStyle:'short'}))}</time>${notesButton(r,{preview:false})}</li>`).join('')}</ul>`;
 function render(error=''){
  const remaining=data?.items.slice(3)||[];
  root.innerHTML=`<div class="section-title"><div><p class="eyebrow" title="Recorded events for non-archived companies. Visits and clicks show the first checked event per presentation, not every visit or an identified person.">RECENT ACTIVITY</p><h2>What happened.</h2></div><button class="quiet" data-recent="latest" ${loading?'disabled':''}>Refresh activity</button></div>${error?`<p role="alert">${esc(error)}</p><button class="quiet" data-recent="retry">Retry activity</button>`:''}${loading?'<p role="status">Loading activity...</p>':''}${data?`
   ${data.items.length?events(data.items.slice(0,3)):'<p class="fine">No recent activity.</p>'}
   ${remaining.length||data.next?`<details class="recent-older" ${expanded?'open':''}><summary><span class="recent-expand">Show older events${remaining.length?` (${remaining.length})`:''}</span><span class="recent-collapse">Hide older events</span></summary>${remaining.length?events(remaining):''}${data.next?'<div class="crm-actions"><button class="quiet" data-recent="older">Older activities</button></div>':''}</details>`:''}
   ${cursor?'<div class="crm-actions"><button class="quiet" data-recent="latest">Latest activities</button></div>':''}`:''}`;
  const older=root.querySelector('.recent-older');if(older)older.ontoggle=()=>{expanded=older.open;};
  if(loading)root.querySelectorAll('button').forEach(b=>b.disabled=true);
 }
 async function refresh(next=null){
  if(root.hidden)return;
  const ticket=++seq;pending=next;loading=true;render();
  try{const result=await api('crm-recent-activity',null,next||{});if(ticket!==seq||root.hidden)return;if(!Array.isArray(result.items))throw new Error('Activity is unavailable.');data=result;cursor=next;loading=false;expanded=false;render();}
  catch(e){if(ticket===seq&&!root.hidden){loading=false;render(e.message);}}
 }
 function clear(){seq++;data=null;cursor=null;pending=null;loading=false;expanded=false;root.replaceChildren();}
 root.onclick=e=>{const action=e.target.closest('[data-recent]')?.dataset.recent;if(!action||loading)return;refresh(action==='older'?data?.next:action==='retry'?pending:null);};
 new MutationObserver(()=>{if(root.hidden)clear();}).observe(root,{attributes:true,attributeFilter:['hidden']});
 return {refresh,show(){root.hidden=false;refresh();},hide(){root.hidden=true;clear();}};
}
