import {notesButton} from './crm-quick-note.js';
import {SUGGESTION_RULES} from './crm-suggestion-rules.js';
import {displayDate} from './crm-dates.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createSuggestions({api,notify,schedule}){
 const root=document.createElement('section');root.id='crm-suggestions';root.className='chart-panel';root.hidden=true;
 document.querySelector('#business-overview').before(root);
 let seq=0,data=null,page=1,hidden=false,busy=false,life=0;
 function render(error=''){
  const info='Rule-based suggestions. No messages are sent automatically. Pending tasks prevent duplicate recommendations. One recommendation per company.';
  const items=data?data.items.map((r,i)=>{
   const reason=SUGGESTION_RULES[r.rule]?.reason(r,data.config)||'';
   return `<article class="crm-entry"><a class="suggestion-company" href="/admin/leads/${encodeURIComponent(r.company_id)}" title="${esc(r.company_name)}">${esc(r.company_name)}</a><div class="suggestion-content"><h3>${esc(SUGGESTION_RULES[r.rule]?.title||r.rule)}</h3><p class="suggestion-reason" title="${esc(reason)}">${esc(reason)}</p>${r.last_visit?`<p class="fine suggestion-meta">Last checked visit: ${esc(displayDate(r.last_visit))}</p>`:''}${hidden?`<p class="fine suggestion-meta">${r.dismissed_at?'Dismissed until restored':'Snoozed until '+esc(displayDate(r.dismissed_until))}</p>`:''}</div><div class="actions suggestion-actions">${hidden?`<button class="secondary" data-suggest="restore" data-index="${i}">Restore suggestion</button>`:`<button class="primary" data-suggest="create" data-index="${i}">Create follow-up</button><button class="secondary" data-suggest="snooze" data-index="${i}">Snooze ${Number(data.config.snoozeHours)}h</button><button class="quiet" data-suggest="dismiss" data-index="${i}">Dismiss</button>`}${notesButton(r,{preview:false})}</div></article>`;
  }).join(''):'';
  root.innerHTML=`<div class="section-title"><div><p class="eyebrow" title="${esc(info)}">SUGGESTED NEXT STEPS</p><h2>Where to follow up.</h2></div><div class="suggestion-toolbar"><button class="quiet" data-suggest="toggle" title="Hidden rules that still match. Dismissal lasts until restored; snoozing expires automatically.">${hidden?'Show active suggestions':'Show snoozed / dismissed'}</button><button class="quiet" data-suggest="refresh">Refresh suggestions</button></div></div><p role="alert">${esc(error)}</p>${error?'<button class="quiet" data-suggest="refresh">Retry suggestions</button>':''}${busy?'<p role="status">Loading suggestions...</p>':''}<div class="suggestion-list">${items}</div>${data&&!data.items.length?`<p class="fine suggestion-empty">${hidden?'No matching hidden suggestions.':'No suggestions right now.'}</p>`:''}${data&&(page>1||data.total>data.pageSize)?`<div class="actions suggestion-pagination"><button class="quiet" data-suggest="previous" ${page<=1?'disabled':''}>Previous</button><span class="fine">Page ${page} / ${Math.ceil(data.total/data.pageSize)}</span><button class="quiet" data-suggest="next" ${page*data.pageSize>=data.total?'disabled':''}>Next</button></div>`:data?.items.length?`<p class="fine suggestion-count">${data.total} ${data.total===1?'suggestion':'suggestions'}</p>`:''}`;
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
