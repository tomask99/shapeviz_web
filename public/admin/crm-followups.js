import {localDayBounds,localInput,localInstant,displayDate} from './crm-dates.js';
import {label} from './crm-options.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const groupNames={overdue:'Overdue',today:'Today',upcoming:'Upcoming',completed:'Completed'};

export function createFollowups({root,api,notify,todayOnly=false,onChanged=()=>{}}) {
  const prefix=todayOnly?'action-':'';
  const dialog=document.createElement('dialog');dialog.className='crm-record-dialog';dialog.id=prefix+'followup-dialog';dialog.setAttribute('aria-labelledby',prefix+'followup-title');document.body.append(dialog);
  let active=false,sequence=0,epoch=0,groups=[],company=null,pending=false,clock,bounds,dialogSequence=0,loading=false;
  const companyId=()=>todayOnly?'':new URLSearchParams(location.search).get('companyId')||'';
  const query=()=>({...bounds,...(companyId()?{companyId:companyId()}:{})});
  function render() {
    root.querySelector(`#${prefix}followup-groups`).innerHTML=groups.map(g=>`<section class="followup-group" aria-label="${groupNames[g.key]}"><header><h2>${groupNames[g.key]}</h2><span class="badge">${g.total}</span></header>${g.items.map(f=>`<article class="crm-entry" data-followup="${esc(f.id)}">
      <a href="/admin/leads/${encodeURIComponent(f.company_id)}" data-lead class="followup-company">${esc(f.company_name)}</a><button class="quiet" data-quick-note="${esc(f.company_id)}" data-company-name="${esc(f.company_name)}">+ Note</button><p class="fine">${esc(label(f.pipeline_status))}${f.contact_name?' · '+esc(f.contact_name):''}</p>
      <h3>${esc(f.title)}</h3><p class="fine"><time datetime="${esc(f.due_at)}">${esc(displayDate(f.due_at))}</time>${f.completed_at?' · Completed '+esc(displayDate(f.completed_at)):''}</p>
      ${f.description?`<p class="crm-description">${esc(f.description)}</p>`:''}${!f.completed_at?`<div class="actions"><button class="primary" data-followup-complete="${esc(f.id)}">Mark complete</button><button class="secondary" data-followup-edit="${esc(f.id)}">Edit / reschedule</button></div>`:''}</article>`).join('')||`<p class="empty">No ${g.key==='completed'?'completed follow-ups':g.key==='today'?'follow-ups today':g.key+' follow-ups'}.</p>`}
      ${g.total>g.pageSize||g.page>1?`<div class="actions crm-pagination"><button class="secondary" data-followup-page="${g.page-1}" data-group="${g.key}" ${g.page<=1?'disabled':''}>Previous</button><span class="fine">Page ${g.page} / ${Math.max(1,Math.ceil(g.total/g.pageSize))}</span><button class="secondary" data-followup-page="${g.page+1}" data-group="${g.key}" ${g.page*g.pageSize>=g.total?'disabled':''}>Next</button></div>`:''}</section>`).join('');
  }
  async function load(group=null,page=1) {
    bounds=localDayBounds();
    const ticket=++sequence;
    loading=true;
    const target=root.querySelector(`#${prefix}followup-groups`),error=root.querySelector(`#${prefix}followup-error`);
    error.textContent='';target.setAttribute('aria-busy','true');
    root.querySelectorAll('[data-followup-complete],[data-followup-edit],[data-followup-page]').forEach(b=>b.disabled=true);
    if(!groups.length)target.textContent='Loading follow-ups…';
    try {
      const data=await api(todayOnly?'crm-action-center':'crm-followups',null,{...query(),...(group?{group,page}:{})});
      if(!active||ticket!==sequence)return;
      if(!Array.isArray(data.groups)||data.groups.some(g=>!Array.isArray(g.items)||!Number.isFinite(g.total)))throw new Error('Follow-ups are unavailable.');
      if(group){const replacement=data.groups[0];if(!replacement.items.length&&page>1){await load(group,page-1);return;}groups=groups.map(g=>g.key===group?replacement:g);}
      else groups=data.groups;
      render();
    }catch(e){if(active&&ticket===sequence){error.textContent=e.message;target.innerHTML='<button class="secondary" data-followup-retry>Try again</button>';}}
    finally{if(active&&ticket===sequence){loading=false;target.setAttribute('aria-busy','false');}}
  }
  async function edit(record=null,prefill=null) {
    if(pending)return;
    const life=epoch,ticket=++dialogSequence;
    dialog.innerHTML=`<form><div class="dialog-head"><h2 id="${prefix}followup-title">${record?'Reschedule':'Schedule'} follow-up.</h2><button type="button" data-cancel aria-label="Close">×</button></div>
      ${record||company||prefill?`<p class="fine">${esc(record?.company_name||company?.company_name||prefill.company_name)}</p>`:`<label>Find company<input name="company_search" type="search" maxlength="160" placeholder="Search name or website"></label><button type="button" class="secondary" data-find-company>Search companies</button><label>Company *<select name="company_id" required><option value="">Choose a company…</option></select></label><p class="fine" data-company-hint></p>`}
      <label>Title *<input name="title" maxlength="160" required></label><label>Due date and time *<input name="due" type="datetime-local" required></label>
      <p class="fine">Local time: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}. At the autumn clock change, repeated times use the first occurrence.</p>
      <label>Contact (optional)<select name="contact_id"><option value="">No contact</option></select></label><button type="button" class="quiet" data-more-contacts hidden>Load more contacts</button>
      <label>Description<textarea name="description" rows="4" maxlength="5000"></textarea></label><p role="alert" data-error></p><div class="actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="primary" type="submit" data-save>Save follow-up</button></div></form>`;
    const form=dialog.querySelector('form'),error=form.querySelector('[data-error]');
    let selected=record?.company_id||company?.id||prefill?.company_id||'',contactsPage=0,contactSeq=0,finding=0,contactsBusy=false;
    const alive=()=>active&&epoch===life&&ticket===dialogSequence&&dialog.open;
    form.elements.title.value=record?.title||prefill?.title||'';form.elements.description.value=record?.description||'';
    form.elements.due.value=localInput(record?.due_at||new Date(Date.now()+86400000));
    async function contacts(more=false) {
      const turn=++contactSeq;contactsBusy=true;form.querySelector('[data-save]').disabled=true;form.elements.contact_id.disabled=true;
      const button=form.querySelector('[data-more-contacts]');button.disabled=true;
      if(!more){contactsPage=0;form.elements.contact_id.innerHTML='<option value="">No contact</option>';if(record?.contact_id&&selected===record.company_id)form.elements.contact_id.add(new Option(record.contact_name||'Selected contact',record.contact_id));form.elements.contact_id.value=record?.contact_id||'';}
      try{
        const data=selected?await api('crm-contacts',null,{companyId:selected,page:contactsPage+1}):{items:[],hasMore:false};
        if(!alive()||turn!==contactSeq)return;
        const ids=new Set([...form.elements.contact_id.options].map(o=>o.value));
        for(const c of data.items)if(!ids.has(c.id))form.elements.contact_id.add(new Option(c.full_name,c.id));
        contactsPage++;button.hidden=!data.hasMore;
      }catch(e){if(alive()&&turn===contactSeq){error.textContent=e.message;button.hidden=false;}}
      finally{if(alive()&&turn===contactSeq){contactsBusy=false;form.querySelector('[data-save]').disabled=false;form.elements.contact_id.disabled=false;button.disabled=false;}}
    }
    async function findCompanies() {
      const turn=++finding,b=form.querySelector('[data-find-company]');b.disabled=true;error.textContent='';
      selected='';form.elements.company_id.value='';form.elements.company_id.disabled=true;form.querySelector('[data-save]').disabled=true;
      try{
        const data=await api('crm-list',null,{q:form.elements.company_search.value,archived:'active',sort:'name'});
        if(!alive()||turn!==finding)return;
        selected='';form.elements.company_id.innerHTML='<option value="">Choose a company…</option>';
        data.companies.forEach(c=>form.elements.company_id.add(new Option(c.company_name,c.id)));
        form.querySelector('[data-company-hint]').textContent=`${data.total} matches. Showing up to 25; refine your search if needed.`;contacts();
      }catch(e){if(alive()&&turn===finding)error.textContent=e.message;}finally{if(alive()&&turn===finding){b.disabled=false;form.elements.company_id.disabled=false;if(!contactsBusy)form.querySelector('[data-save]').disabled=false;}}
    }
    form.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>{if(!pending){dialog.close();dialogSequence++;}});
    if(form.elements.company_id){form.elements.company_id.onchange=()=>{selected=form.elements.company_id.value;contacts();};form.querySelector('[data-find-company]').onclick=findCompanies;}
    form.querySelector('[data-more-contacts]').onclick=()=>contacts(true);
    form.onsubmit=async e=>{
      e.preventDefault();if(pending||contactsBusy)return;
      error.textContent='';let due;
      try{due=localInstant(form.elements.due.value);}catch(e){error.textContent=e.message;return;}
      if(!selected){error.textContent='Choose a company.';return;}
      const data={companyId:selected,title:form.elements.title.value,description:form.elements.description.value,contact_id:form.elements.contact_id.value||null,due_at:due,...(record?{id:record.id,version:record.version}:{})};
      pending=true;form.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=true);
      try{await api('crm-followup-save',data);if(!alive())return;dialog.close();notify('Follow-up saved.');onChanged();await load();}
      catch(e){if(alive())error.textContent=e.message;}
      finally{if(epoch===life){pending=false;form.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=false);}}
    };
    dialog.showModal();form.elements.title.focus();
    if(form.elements.company_id)findCompanies();else contacts();
  }
  async function complete(id) {
    const record=groups.flatMap(g=>g.items).find(f=>f.id===id);if(!record||pending)return;
    const life=epoch;pending=true;
    root.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{await api('crm-followup-complete',{companyId:record.company_id,id,version:record.version});if(active&&life===epoch){notify('Follow-up completed.');onChanged();await load();}}
    catch(e){if(active&&life===epoch){root.querySelector(`#${prefix}followup-error`).textContent=e.message+' Refresh before retrying.';render();}}
    finally{if(life===epoch){pending=false;root.querySelectorAll('[data-schedule-followup],[data-followup-refresh]').forEach(b=>b.disabled=!!company?.archived_at);}}
  }
  function checkDay(){if(active&&!pending&&!loading&&!dialog.open&&!root.hidden&&!document.hidden&&(todayOnly||bounds.today!==localDayBounds().today)){bounds=localDayBounds();load();}}
  async function show() {
    active=true;pending=false;loading=false;groups=[];company=null;const life=++epoch;bounds=localDayBounds();
    root.innerHTML=`<div class="page-heading"><div><p class="eyebrow">YOUR NEXT CONVERSATION.</p><h1>Follow-ups<span>.</span></h1></div><button class="primary" data-schedule-followup disabled>Schedule follow-up +</button></div>
      <p class="fine" id="${prefix}followup-scope">Loading…</p><div class="actions"><button class="secondary" data-followup-refresh>Refresh</button><a class="quiet" href="/admin/follow-ups" data-lead>All follow-ups</a><a class="quiet" href="/admin/leads" data-lead>Open Leads</a></div>
      <p class="fine">Dates use your local timezone. Overdue means before today; archived companies are hidden.</p><p id="${prefix}followup-error" role="alert"></p><div id="${prefix}followup-groups"></div>`;
    if(todayOnly){
      root.querySelector('.page-heading').innerHTML='<div><p class="eyebrow">TODAY / ACTION CENTER</p><h2>Your next conversations.</h2></div><button class="primary" data-schedule-followup disabled>Schedule follow-up +</button>';
      root.querySelector('.page-heading').className='section-title';
      root.querySelector(`#${prefix}followup-scope`).hidden=true;
      root.querySelector(`#${prefix}followup-error`).previousElementSibling.textContent='Overdue includes tasks earlier today. Today shows the remaining tasks before local midnight. Completed tasks and archived companies are hidden. Refreshes every minute while visible.';
    }
    try {
      if(companyId()){const data=await api('crm-detail',null,{id:companyId()});if(!active||epoch!==life)return;company=data.company;}
      root.querySelector(`#${prefix}followup-scope`).textContent=company?`${company.company_name}${company.archived_at?' — archived. Restore this company to manage its follow-ups.':''}`:'All active companies';
      root.querySelector('[data-schedule-followup]').disabled=!!company?.archived_at;
      await load();
    }catch(e){if(active&&epoch===life)root.querySelector(`#${prefix}followup-error`).textContent=e.message;}
    if(active&&epoch===life){clearInterval(clock);clock=setInterval(checkDay,60000);}
  }
  dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
  window.addEventListener('focus',checkDay);
  root.addEventListener('click',e=>{
    if(!active||pending)return;const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-schedule-followup'))edit();
    if(b.hasAttribute('data-followup-refresh')||b.hasAttribute('data-followup-retry')){api.invalidate?.();bounds=localDayBounds();load();}
    if(b.dataset.followupEdit)edit(groups.flatMap(g=>g.items).find(f=>f.id===b.dataset.followupEdit));
    if(b.dataset.followupComplete)complete(b.dataset.followupComplete);
    if(b.dataset.followupPage)load(b.dataset.group,Number(b.dataset.followupPage));
  });
  return {show,schedule(prefill){if(active&&!dialog.open)edit(null,prefill);},hide(){active=false;epoch++;sequence++;dialogSequence++;clearInterval(clock);dialog.close();dialog.replaceChildren();groups=[];company=null;}};
}
