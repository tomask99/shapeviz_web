import {STATUSES,PRIORITIES,label} from './crm-options.js';
import {nextActionText} from './crm-dates.js';
import {signalSummary} from './crm-signals.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=values=>values.map(v=>`<option value="${esc(v)}">${esc(label(v))}</option>`).join('');

export function createPipeline({root,api,notify}) {
  let active=false,sequence=0,lifecycle=0,columns=[],saving=false,loading=false,timer,dragged=null;
  const params=()=>Object.fromEntries(new URLSearchParams(location.search));
  const cards=()=>columns.flatMap(c=>c.companies);
  function renderBoard() {
    const board=root.querySelector('#pipeline-board');if(!board)return;
    board.innerHTML=columns.map(col=>`<section class="pipeline-column" data-stage="${col.status}" aria-label="${esc(label(col.status))}">
      <header><h2>${esc(label(col.status))}</h2><span class="badge">${col.total}</span></header>
      <div class="pipeline-cards">${col.companies.map(c=>`<article class="pipeline-card" data-card="${esc(c.id)}" draggable="${!saving&&!loading}" aria-label="${esc(c.company_name)}">
        <a href="/admin/leads/${encodeURIComponent(c.id)}" data-lead><h3>${esc(c.company_name)}</h3></a>
        <p class="fine">${esc(c.country||'INT')} · ${esc(c.industry||'Industry not set')}</p>
        <span class="badge">${esc(label(c.priority))} priority</span>
        <button class="quiet" data-quick-note="${esc(c.id)}" data-company-name="${esc(c.company_name)}">+ Note</button>
        <p class="fine">${signalSummary(c)}</p>
        <p class="fine crm-next-action">${esc(nextActionText(c.next_action))}</p>
        <button class="secondary" data-prepare-presentation="${esc(c.id)}" ${saving||loading?'disabled':''}>Prepare presentation</button>
        <label>Move to<select data-move="${esc(c.id)}" aria-label="Status for ${esc(c.company_name)}" ${saving||loading?'disabled':''}>${STATUSES.map(s=>`<option value="${s}" ${s===c.pipeline_status?'selected':''}>${esc(label(s))}</option>`).join('')}</select></label>
      </article>`).join('')||'<p class="fine pipeline-empty">No leads in this stage.</p>'}</div>
      <p class="fine">${col.companies.length} of ${col.total} shown</p>
      ${col.companies.length<col.total?`<button class="secondary" data-stage-more="${col.status}" ${saving||loading?'disabled':''}>Load more</button>`:''}
    </section>`).join('');
  }
  function lock(value) {
    root.querySelectorAll('#pipeline-filters input,#pipeline-filters select,#pipeline-filters button,[data-move],[data-stage-more],[data-prepare-presentation]').forEach(e=>e.disabled=value);
    root.querySelectorAll('[data-card]').forEach(e=>e.draggable=!value);
  }
  async function load() {
    const ticket=++sequence;loading=true;lock(true);
    const board=root.querySelector('#pipeline-board'),errorBox=root.querySelector('#pipeline-error');
    errorBox.textContent='';board.setAttribute('aria-busy','true');
    if(!columns.length)board.textContent='Loading pipeline…';
    try {
      const data=await api('crm-pipeline',null,params());
      if(!active||ticket!==sequence)return;
      columns=data.columns;renderBoard();
      root.querySelector('#pipeline-status').textContent=`${columns.reduce((sum,c)=>sum+c.total,0)} leads in this view.`;
    }catch(error){if(active&&ticket===sequence){errorBox.textContent=error.message;board.innerHTML='<button class="secondary" data-pipeline-retry>Try again</button>';}}
    finally{if(active&&ticket===sequence){loading=false;lock(saving);board.setAttribute('aria-busy','false');}}
  }
  async function move(id,status) {
    const card=cards().find(c=>c.id===id);
    if(!card||saving||loading||card.pipeline_status===status)return;
    saving=true;lock(true);
    const ticket=sequence,life=lifecycle,errorBox=root.querySelector('#pipeline-error');
    errorBox.textContent='';root.querySelector('#pipeline-status').textContent='Saving status…';
    try{
      await api('crm-status',{id:card.id,version:card.version,pipeline_status:status});
      if(!active||ticket!==sequence)return;
      notify(`${card.company_name} moved to ${label(status)}.`);
      await load();
    }catch(error){
      if(active&&ticket===sequence){errorBox.textContent=error.message;renderBoard();root.querySelector('#pipeline-status').textContent='The move was not confirmed. Refresh to check the latest status before retrying.';}
    }finally{if(life===lifecycle){saving=false;if(active)lock(loading);}}
  }
  async function more(status) {
    if(saving||loading)return;
    const col=columns.find(c=>c.status===status);if(!col)return;
    const ticket=sequence;loading=true;lock(true);
    try{
      const data=await api('crm-list',null,{...params(),archived:'active',pipeline_status:status,sort:'updated',page:col.page+1});
      if(!active||ticket!==sequence)return;
      const ids=new Set(col.companies.map(c=>c.id));
      col.companies.push(...data.companies.filter(c=>!ids.has(c.id)));col.total=data.total;col.page=data.page;
      if(!data.companies.length&&col.companies.length<col.total){await load();return;}
      renderBoard();
    }catch(error){if(active&&ticket===sequence)root.querySelector('#pipeline-error').textContent=error.message;}
    finally{if(active&&ticket===sequence){loading=false;lock(saving);}}
  }
  function show() {
    active=true;saving=false;loading=false;columns=[];sequence++;lifecycle++;
    root.innerHTML=`<div class="page-heading"><div><p class="eyebrow">FROM FIRST CONTACT TO CLIENT.</p><h1>Pipeline<span>.</span></h1></div><a href="/admin/leads" data-lead class="secondary">Open Leads</a></div>
      <form id="pipeline-filters" class="pipeline-filters">
      <label>Search companies or contacts<input type="search" name="q" maxlength="160" placeholder="Search pipeline…"></label>
      <label>Country<select name="country_category"><option value="">All countries</option><option value="SK">Slovakia</option><option value="CZ">Czech Republic</option><option value="INT">International</option></select></label>
      <label>Priority<select name="priority"><option value="">All priorities</option>${options(PRIORITIES)}</select></label>
      <label>View<select name="mode"><option value="active">Active stages</option><option value="lost">Lost leads</option></select></label>
      <div class="actions"><button class="secondary" type="submit">Apply</button><button class="quiet" type="button" data-pipeline-clear>Clear</button><button class="quiet" type="button" data-pipeline-refresh>Refresh</button></div></form>
      <p class="fine">Drag a card into a stage, or use its Move to menu. Archived leads are hidden.</p>
      <p id="pipeline-status" class="fine" role="status"></p><p id="pipeline-error" role="alert"></p>
      <div id="pipeline-board" class="pipeline-board" role="region" aria-label="Sales pipeline board" tabindex="0"></div>`;
    const form=root.querySelector('#pipeline-filters'),p=new URLSearchParams(location.search);
    for(const e of form.elements)if(e.name&&p.has(e.name))e.value=p.get(e.name);
    const apply=()=>{
      const query=new URLSearchParams();for(const [key,value]of new FormData(form))if(value)query.set(key,value);
      history.replaceState(null,'','/admin/pipeline?'+query);columns=[];load();
    };
    form.onsubmit=e=>{e.preventDefault();clearTimeout(timer);apply();};
    form.onchange=e=>{if(e.target.type!=='search')apply();};
    form.elements.q.oninput=()=>{clearTimeout(timer);timer=setTimeout(apply,350);};
    root.querySelector('[data-pipeline-clear]').onclick=()=>{form.reset();apply();};
    root.querySelector('[data-pipeline-refresh]').onclick=()=>{api.invalidate?.();load();};
    load();
  }
  root.addEventListener('change',e=>{if(active&&e.target.dataset.move)move(e.target.dataset.move,e.target.value);});
  root.addEventListener('click',e=>{
    if(!active)return;
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-pipeline-retry'))load();
    if(b.dataset.stageMore)more(b.dataset.stageMore);
    if(b.dataset.preparePresentation&&!saving&&!loading)document.dispatchEvent(new CustomEvent('crm-create-presentation',{detail:{companyId:b.dataset.preparePresentation}}));
  });
  root.addEventListener('dragstart',e=>{
    const card=e.target.closest('[data-card]');
    if(!active||saving||loading||!card||e.target.closest('select')){e.preventDefault();return;}
    dragged=card.dataset.card;e.dataTransfer.setData('text/plain',dragged);e.dataTransfer.effectAllowed='move';card.classList.add('dragging');
  });
  root.addEventListener('dragover',e=>{
    const column=e.target.closest('[data-stage]');
    if(active&&dragged&&!saving&&!loading&&column){e.preventDefault();e.dataTransfer.dropEffect='move';column.classList.add('drop-target');}
  });
  const clearDrag=()=>{root.querySelectorAll('.drop-target,.dragging').forEach(e=>e.classList.remove('drop-target','dragging'));};
  root.addEventListener('dragleave',e=>{const c=e.target.closest('[data-stage]');if(c&&!c.contains(e.relatedTarget))c.classList.remove('drop-target');});
  root.addEventListener('drop',e=>{
    const column=e.target.closest('[data-stage]');
    if(active&&column&&dragged){e.preventDefault();const id=dragged;dragged=null;clearDrag();move(id,column.dataset.stage);}
  });
  root.addEventListener('dragend',()=>{dragged=null;clearDrag();});
  return {show,hide(){active=false;sequence++;lifecycle++;dragged=null;clearTimeout(timer);}};
}
