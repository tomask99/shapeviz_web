import {RECENT_TYPES} from './crm-recent-types.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createRecentActivity({api}){
 const root=document.createElement('section');root.id='recent-activity';root.className='chart-panel';root.hidden=true;
 document.querySelector('#business-overview').before(root);
 let seq=0,data=null,cursor=null,pending=null,loading=false;
 function render(error=''){
  root.innerHTML=`<div class="section-title"><div><p class="eyebrow">RECENT ACTIVITY</p><h2>What happened.</h2></div><button class="quiet" data-recent="latest" ${loading?'disabled':''}>Refresh activity</button></div><p class="fine">Recorded events for non-archived companies. Visits and clicks show the first checked event per presentation, not every visit or an identified person.</p>${error?`<p role="alert">${esc(error)}</p><button class="quiet" data-recent="retry">Retry activity</button>`:''}${loading?'<p role="status">Loading activity…</p>':''}${data?`<ul class="recent-events">${data.items.map(r=>`<li><a href="/admin/leads/${encodeURIComponent(r.company_id)}?tab=activity">${esc(r.company_name)}</a><strong>${esc(RECENT_TYPES[r.event_type]||'Activity')}</strong>${r.detail?`<p>${esc(r.detail)}</p>`:''}<span class="fine">Recorded <time datetime="${esc(r.created_at)}">${esc(new Date(r.created_at).toLocaleString())}</time></span></li>`).join('')}</ul>${!data.items.length?'<p class="fine">No recent activity.</p>':''}<div class="crm-actions">${cursor?'<button class="quiet" data-recent="latest">Latest activities</button>':''}${data.next?'<button class="quiet" data-recent="older">Older activities</button>':''}</div>`:''}`;
  if(loading)root.querySelectorAll('button').forEach(b=>b.disabled=true);
 }
 async function refresh(next=null){
  if(root.hidden)return;
  const ticket=++seq;pending=next;loading=true;render();
  try{const result=await api('crm-recent-activity',null,next||{});if(ticket!==seq||root.hidden)return;if(!Array.isArray(result.items))throw new Error('Activity is unavailable.');data=result;cursor=next;loading=false;render();}
  catch(e){if(ticket===seq&&!root.hidden){loading=false;render(e.message);}}
 }
 function clear(){seq++;data=null;cursor=null;pending=null;loading=false;root.replaceChildren();}
 root.onclick=e=>{const action=e.target.closest('[data-recent]')?.dataset.recent;if(!action||loading)return;refresh(action==='older'?data?.next:action==='retry'?pending:null);};
 new MutationObserver(()=>{if(root.hidden)clear();}).observe(root,{attributes:true,attributeFilter:['hidden']});
 return {refresh,show(){root.hidden=false;refresh();},hide(){root.hidden=true;clear();}};
}
