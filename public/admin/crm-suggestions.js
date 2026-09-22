import {SUGGESTION_RULES} from './crm-suggestion-rules.js';
import {displayDate} from './crm-dates.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createSuggestions({api,notify,schedule}){
 const root=document.createElement('section');root.id='crm-suggestions';root.className='chart-panel';root.hidden=true;
 document.querySelector('#business-overview').before(root);
 let seq=0,data=null,page=1,hidden=false,busy=false,life=0;
 function render(error=''){
  root.innerHTML=`<div class="section-title"><div><p class="eyebrow">SUGGESTED NEXT STEPS</p><h2>Where to follow up.</h2></div><button class="quiet" data-suggest="refresh">Refresh suggestions</button></div><p class="fine">Rule-based suggestions, not AI. No messages are sent automatically. Pending tasks, including overdue ones, prevent duplicate recommendations. One recommendation per company.</p><button class="quiet" data-suggest="toggle">${hidden?'Show active suggestions':'Show snoozed / dismissed'}</button>${hidden?'<p class="fine">Hidden rules that still match. Dismissal lasts until restored; snoozing expires automatically. A different rule may still appear for the company.</p>':''}<p role="alert">${esc(error)}</p>${error?'<button class="quiet" data-suggest="refresh">Retry suggestions</button>':''}${busy?'<p role="status">Loading suggestions…</p>':''}<div class="suggestion-list">${data?data.items.map((r,i)=>`<article class="crm-entry"><a href="/admin/leads/${encodeURIComponent(r.company_id)}">${esc(r.company_name)}</a><h3>${esc(SUGGESTION_RULES[r.rule]?.title||r.rule)}</h3><p>${esc(SUGGESTION_RULES[r.rule]?.reason(r,data.config)||'')}</p>${r.last_visit?`<p class="fine">Last checked visit: ${esc(displayDate(r.last_visit))}</p>`:''}${hidden?`<p class="fine">${r.dismissed_at?'Dismissed until restored':'Snoozed until '+esc(displayDate(r.dismissed_until))}</p>`:''}<div class="actions">${hidden?`<button class="secondary" data-suggest="restore" data-index="${i}">Restore suggestion</button>`:`<button class="primary" data-suggest="create" data-index="${i}">Create follow-up</button><button class="secondary" data-suggest="snooze" data-index="${i}">Snooze ${Number(data.config.snoozeHours)}h</button><button class="quiet" data-suggest="dismiss" data-index="${i}">Dismiss</button>`}</div></article>`).join(''):''}</div>${data&&!data.items.length?`<p class="fine">${hidden?'No matching hidden suggestions.':'No suggestions right now.'}</p>`:''}${data?`<div class="actions"><button class="quiet" data-suggest="previous" ${page<=1?'disabled':''}>Previous</button><span class="fine">Page ${page} · ${data.total} suggestions</span><button class="quiet" data-suggest="next" ${page*data.pageSize>=data.total?'disabled':''}>Next</button></div>`:''}`;
  if(busy)root.querySelectorAll('button').forEach(b=>b.disabled=true);
 }
 async function refresh(){
  if(root.hidden)return;const ticket=++seq;busy=true;render();
  try{const r=await api('crm-suggestions',null,{page,hidden:String(hidden)});if(ticket!==seq||root.hidden)return;
   if(!Array.isArray(r.items)||!r.config||!Number.isFinite(r.total))throw new Error('Suggestions unavailable.');
   if(!r.items.length&&page>1){page--;return refresh();}data=r;busy=false;render();
  }catch(e){if(ticket===seq&&!root.hidden){busy=false;render(e.message);}}
 }
 root.onclick=async e=>{
  const b=e.target.closest('[data-suggest]');if(!b||busy)return;const action=b.dataset.suggest,r=data?.items[Number(b.dataset.index)];
  if(action==='create'&&r){schedule({company_id:r.company_id,company_name:r.company_name,title:SUGGESTION_RULES[r.rule].title});return;}
  if(['snooze','dismiss','restore'].includes(action)&&r){
   const ticket=life;busy=true;render();
   try{await api('crm-suggestion-state',{companyId:r.company_id,rule:r.rule,action});if(ticket!==life||root.hidden)return;notify(action==='restore'?'Suggestion restored.':action==='dismiss'?'Suggestion dismissed. Restore it from hidden suggestions.':'Suggestion snoozed.');await refresh();}
   catch(e){if(ticket===life&&!root.hidden){busy=false;render(e.message);}}return;
  }
  if(action==='toggle'){hidden=!hidden;page=1;data=null;}
  if(action==='next'){page++;data=null;}if(action==='previous'){page--;data=null;}
  refresh();
 };
 function clear(){life++;seq++;data=null;page=1;hidden=false;busy=false;root.replaceChildren();}
 new MutationObserver(()=>{if(root.hidden)clear();}).observe(root,{attributes:true,attributeFilter:['hidden']});
 return {refresh,show(){root.hidden=false;refresh();},hide(){root.hidden=true;clear();}};
}
