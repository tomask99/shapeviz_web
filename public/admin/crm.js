import {STATUSES,SERVICES,SOURCES,INDUSTRIES,PRIORITIES,label} from './crm-options.js';
import {mountRelations} from './crm-relations.js';
import {createPipeline} from './crm-pipeline.js';
import {createFollowups} from './crm-followups.js';
import {nextActionText} from './crm-dates.js';
import {opportunityValueInput,opportunityValueText} from './crm-value.js';
import {LOST_REASONS,WON_FIELDS} from './crm-outcome.js';
import {signalSummary,mountCompanySignals} from './crm-signals.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options = (values, pretty = false) => values.map(v => `<option value="${escape(v)}">${escape(pretty ? label(v) : v)}</option>`).join('');
const select = (name, title, values, pretty = false) => `<label>${title}<select name="${name}"><option value="">All</option>${options(values,pretty)}</select></label>`;
const input = (name, title, max = 120, type = 'text') => `<label>${title}<input name="${name}" type="${type}" maxlength="${max}"></label>`;
const date = value => new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});

export function createCrm({api,notify}) {
  const root = document.createElement('section');
  root.id = 'crm'; root.hidden = true;
  document.querySelector('.workspace footer').before(root);
  const pipeline=createPipeline({root,api,notify});
  const followups=createFollowups({root,api,notify});
  const dialog = document.createElement('dialog');
  dialog.id = 'lead-dialog'; dialog.setAttribute('aria-labelledby','lead-form-title');
  dialog.innerHTML = `<form id="lead-form"><div class="dialog-head"><div><p class="eyebrow">SALES / COMPANY</p><h2 id="lead-form-title">Add lead.</h2></div><button type="button" data-cancel aria-label="Close">×</button></div>
    <label>Company name *<input name="company_name" maxlength="160" autocomplete="organization" required></label>
    ${input('website','Website',2048,'url')}
    ${input('logo_url','Logo URL (optional)',2048,'url')}
    <details data-initial-contact><summary>First contact (optional)</summary>${input('initial_name','Contact name',160)}${input('initial_position','Contact position',160)}${input('initial_email','Contact email',254,'email')}${input('initial_phone','Contact phone',80)}</details>
    <div class="two-columns"><label>Country<select name="country"><option value="">International / not specified</option><option value="SK">Slovakia</option><option value="CZ">Czech Republic</option><option value="OTHER">Other country</option></select></label><label id="country-code-label" hidden>Country code (e.g. AT)<input name="country_code" maxlength="2" pattern="[A-Za-z]{2}" placeholder="AT"></label></div>
    <div class="two-columns">${input('city','City')}<label>Industry<input name="industry" maxlength="120" list="crm-industries"></label></div>
    <fieldset class="crm-services"><legend>Potential services</legend>${SERVICES.map(v=>`<label class="check"><input type="checkbox" name="services" value="${escape(v)}">${escape(v)}</label>`).join('')}</fieldset>
    <div class="two-columns"><label>Priority<select name="priority">${options(PRIORITIES,true)}</select></label><label>Lead source<select name="lead_source">${options(SOURCES)}</select></label></div>
    <label>Pipeline status<select name="pipeline_status">${options(STATUSES,true)}</select></label>
    <details data-won-fields hidden><summary>Won details (optional)</summary><p class="fine">Agreed values in EUR, separate from estimates. Retained when the lead changes stage; clear fields explicitly when needed.</p><label>Won date<input type="date" name="won_date" min="1900-01-01" max="9999-12-31"></label><label>Service sold<select name="won_service"><option value="">Not specified</option>${options(SERVICES)}</select></label><div class="two-columns"><label>Won project value (EUR)<input name="won_project_value" inputmode="decimal" maxlength="12"></label><label>Won monthly value (EUR)<input name="won_monthly_value" inputmode="decimal" maxlength="12"></label></div><label>Won notes<textarea name="won_notes" maxlength="3000" rows="3"></textarea></label></details>
    <div data-lost-fields hidden><label>Lost reason (optional)<select name="lost_reason"><option value="">Not specified</option>${options(LOST_REASONS)}</select></label><p class="fine">Saved independently of the current stage. Reopening a lead keeps this reason; choose Not specified to clear it.</p></div>
    <details data-opportunity><summary>Estimated opportunity value (optional)</summary><p class="fine">Estimate only, in EUR — not confirmed revenue. Leave the amount blank if unknown.</p><div class="two-columns"><label>Estimated value (EUR)<input name="estimated_value" inputmode="decimal" maxlength="12" placeholder="e.g. 3000.00"></label><label>Value type<select name="value_type"><option value="UNKNOWN">Frequency unspecified</option><option value="ONE_TIME">One-time project</option><option value="MONTHLY">Monthly</option></select></label></div></details>
    <details><summary>Social links & description</summary>${input('instagram','Instagram',2048,'url')}${input('linkedin','LinkedIn',2048,'url')}<label>Short description<textarea name="short_description" maxlength="3000" rows="4"></textarea></label></details>
    <p data-error role="alert"></p><div class="actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="primary" type="submit">Save lead</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  let active = false, requestId = 0, current = null, editing = null, pending = false, timer, cleanupDetail;
  const shell = () => document.querySelectorAll('.workspace > .page-heading,.workspace > .toolbar,.workspace > .metrics,.workspace > .chart-panel,.workspace > .library');
  function activate(value) {
    pipeline.hide();
    followups.hide();
    cleanupDetail?.();cleanupDetail=null;
    active = value; root.hidden = !value; requestId++; clearTimeout(timer);
    shell().forEach(e=>e.hidden=value);
    document.querySelector('#nav-leads').classList.toggle('active',value);
    document.querySelector('#nav-pipeline').classList.remove('active');
    document.querySelector('#nav-followups').classList.remove('active');
    if (value) document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));
  }
  function navigate(path, replace = false) {
    history[replace ? 'replaceState' : 'pushState'](null,'',path);
    show();
  }
  function heading(title, kicker, action = '') {
    return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${escape(title)}<span>.</span></h1></div>${action}</div>`;
  }
  function listShell() {
    const p = new URLSearchParams(location.search);
    root.innerHTML = heading('Leads','YOUR NEXT COLLABORATION.', '<button class="primary" data-add>Add lead +</button>') +
      `<form id="lead-filters"><label>Search companies, contacts, websites or descriptions<input name="q" type="search" maxlength="160" placeholder="Search companies, contacts, websites…"></label>
      <details class="crm-filters"><summary>Filters & sorting</summary><div class="crm-filter-grid">
      ${select('country_category','Country',['SK','CZ','INT'])}${select('pipeline_status','Status',STATUSES,true)}
      ${select('priority','Priority',PRIORITIES,true)}${select('service','Service',SERVICES)}
      ${select('lead_source','Source',SOURCES)}<label>Industry<input name="industry" list="crm-industries" maxlength="120"></label>
      ${select('presentation_status','Presentation',['NONE','ASSIGNED','SENT','VIEWED'],true)}${select('engagement','Engagement · 30 days',['COLD','ACTIVE','HOT'])}${select('has_followup','Pending follow-up',['yes','no'],true)}${select('has_replied','Recorded reply',['yes','no'],true)}<label>Last presentation sent<select name="last_contacted"><option value="">Any time</option><option value="never">Never recorded</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="older30">Over 30 days ago</option></select></label>
      <label>Show<select name="archived"><option value="active">Active leads</option><option value="archived">Archived leads</option><option value="all">All leads</option></select></label>
      <label>Sort<select name="sort"><option value="recent">Recently added</option><option value="name">Company name</option><option value="updated">Recently updated</option><option value="priority">Priority</option><option value="last_activity">Last activity</option><option value="last_contact">Last presentation sent</option><option value="next_followup">Next follow-up</option><option value="engagement">Most engaged · 30 days</option></select></label>
      </div></details><div class="actions"><button type="submit" class="secondary">Apply filters</button><button type="button" class="quiet" data-clear>Clear filters</button><button type="button" class="quiet" data-reload>Refresh</button></div></form>
      <datalist id="crm-industries">${options(INDUSTRIES)}</datalist><div id="lead-results" aria-live="polite"></div>`;
    const filters = root.querySelector('#lead-filters');
    for (const element of filters.elements) if (element.name && p.has(element.name)) element.value=p.get(element.name);
    if ([...p.keys()].some(k=>!['q','page'].includes(k))) filters.querySelector('details').open=true;
    const apply = () => {
      const params = new URLSearchParams();
      for (const [key,value] of new FormData(filters)) if (value) params.set(key,value);
      history.replaceState(null,'',`/admin/leads?${params}`); loadList();
    };
    filters.onsubmit=e=>{e.preventDefault();clearTimeout(timer);apply();};
    filters.elements.q.oninput=()=>{clearTimeout(timer);timer=setTimeout(apply,300);};
    filters.onchange=e=>{if(e.target.name!=='q')apply();};
    root.querySelector('[data-clear]').onclick=()=>navigate('/admin/leads');
    loadList();
  }
  async function loadList() {
    const seq=++requestId, target=root.querySelector('#lead-results');
    target.textContent='Loading leads…';
    try {
      const data=await api('crm-list',null,Object.fromEntries(new URLSearchParams(location.search)));
      if (!active || seq!==requestId) return;
      const pages=Math.max(1,Math.ceil(data.total/data.pageSize));
      if(data.page>pages){const p=new URLSearchParams(location.search);p.set('page',pages);navigate('/admin/leads?'+p,true);return;}
      target.innerHTML=`<p class="fine">${data.total} leads</p>`+(data.companies.length ?
        `<div class="crm-table"><div class="crm-row crm-table-head"><span>Company</span><span>Country / Industry</span><span>Status</span><span>Services</span><span>Priority</span><span>Next action</span></div>${data.companies.map(c=>`<a class="crm-row" data-lead href="/admin/leads/${encodeURIComponent(c.id)}"><strong>${escape(c.company_name)}<small>${signalSummary(c)}</small>${c.archived_at?'<small>Archived</small>':''}</strong><span>${escape(c.country||'INT')}<small>${escape(c.industry||'Industry not set')}</small></span><span class="badge">${escape(label(c.pipeline_status))}</span><span class="crm-tags">${c.services.map(s=>`<small>${escape(s)}</small>`).join('')||'—'}</span><span class="crm-priority">${escape(label(c.priority))}</span><span class="crm-next-action">${escape(nextActionText(c.next_action))}</span></a>`).join('')}</div>` :
        '<div class="empty"><h2>No leads here yet.</h2><p>Add a company or adjust your filters.</p><button class="primary" data-add>Add lead +</button></div>')+
        `<div class="actions crm-pagination"><button class="secondary" data-page="${data.page-1}" ${data.page<=1?'disabled':''}>Previous</button><span class="fine">Page ${data.page} / ${pages}</span><button class="secondary" data-page="${data.page+1}" ${data.page>=pages?'disabled':''}>Next</button></div>`;
    } catch(error) {if(active&&seq===requestId) target.innerHTML=`<p role="alert">${escape(error.message)}</p><button class="secondary" data-reload>Try again</button>`;}
  }
  async function detail(id) {
    cleanupDetail?.();cleanupDetail=null;
    const seq=++requestId; current=null;
    root.innerHTML='<a href="/admin/leads" data-lead class="quiet">← All leads</a><p role="status">Loading company…</p>';
    try {
      const {company:c}=await api('crm-detail',null,{id});
      if(!active||seq!==requestId)return; current=c;
      root.innerHTML='<a href="/admin/leads" data-lead class="quiet">← All leads</a>'+
        heading(c.company_name,'SALES / COMPANY', '<button class="primary" data-edit>Edit company</button>')+
        `<div class="actions"><span class="badge">${escape(label(c.pipeline_status))}</span><span class="badge">${escape(c.country||'INT')}</span><span class="fine">Priority: ${escape(label(c.priority))}</span>${c.archived_at?'<span class="badge">Archived</span>':''}</div>
        <div class="crm-detail-grid"><section class="chart-panel"><p class="eyebrow">COMPANY INFORMATION</p><h2>${escape(c.industry||'Industry not set')}</h2><p class="crm-description">${escape(c.short_description||'No description yet.')}</p><dl><dt>Country / city</dt><dd>${escape([c.country,c.city].filter(Boolean).join(' / ')||'Not specified')}</dd><dt>Lead source</dt><dd>${escape(c.lead_source)}</dd><dt>Added</dt><dd>${escape(date(c.created_at))}</dd><dt>Updated</dt><dd>${escape(date(c.updated_at))}</dd></dl><div class="actions">${['website','instagram','linkedin'].filter(k=>/^https?:\/\//i.test(c[k])).map(k=>`<a class="secondary" href="${escape(c[k])}" target="_blank" rel="noopener noreferrer">${label(k)} ↗</a>`).join('')}</div></section>
        <section class="chart-panel"><p class="eyebrow">POTENTIAL SHAPEVIZ SERVICES</p><h2>Ways to collaborate.</h2><div class="crm-tags">${c.services.map(s=>`<span class="badge">${escape(s)}</span>`).join('')||'<p class="fine">No services selected.</p>'}</div><hr><p class="fine">Archiving keeps the company and its history. You can restore it at any time.</p><button class="secondary" data-archive>${c.archived_at?'Restore lead':'Archive lead'}</button></section></div>`;
      const next=document.createElement("section");next.className="chart-panel crm-next-panel";next.innerHTML=`<p class="eyebrow">NEXT ACTION</p><p class="crm-next-action">${escape(nextActionText(c.next_action))}</p><a class="secondary" data-lead href="/admin/follow-ups?companyId=${encodeURIComponent(c.id)}">Manage follow-ups</a>`;root.querySelector(".crm-detail-grid").append(next);
      cleanupDetail=mountRelations({root,company:c,api,notify});
      const cleanupRelations=cleanupDetail,cleanupSignals=mountCompanySignals({root,company:c,api});cleanupDetail=()=>{cleanupRelations();cleanupSignals();};
      const valuePanel=document.createElement('section');valuePanel.className='chart-panel crm-value-panel';
      valuePanel.innerHTML=`<p class="eyebrow">ESTIMATED OPPORTUNITY</p><h2>${escape(opportunityValueText(c))}</h2><p class="fine">Estimate in EUR, not confirmed revenue. Use Edit company to change it.</p>`;
      root.querySelector('.crm-detail-grid').append(valuePanel);
      if(/^https?:\/\//i.test(c.logo_url||'')){
        const logo=document.createElement('img');logo.src=c.logo_url;logo.alt=c.company_name+' logo';logo.className='crm-company-logo';logo.referrerPolicy='no-referrer';logo.onerror=()=>logo.remove();root.querySelector('.page-heading').prepend(logo);
      }
      if(c.pipeline_status==='WON'||WON_FIELDS.some(k=>c[k]!=null&&c[k]!=='')){
        const won=document.createElement('section');won.className='chart-panel crm-won-panel';
        const money=k=>opportunityValueText({estimated_value:c[k],value_type:k==='won_monthly_value'?'MONTHLY':'ONE_TIME'});
        won.innerHTML=`<p class="eyebrow">${c.pipeline_status==='WON'?'WON DETAILS':'PREVIOUSLY SAVED WON DETAILS'}</p><dl><dt>Won date</dt><dd>${escape(c.won_date||'Not specified')}</dd><dt>Service sold</dt><dd>${escape(c.won_service||'Not specified')}</dd><dt>Project value</dt><dd>${escape(money('won_project_value'))}</dd><dt>Monthly value</dt><dd>${escape(money('won_monthly_value'))}</dd></dl><p class="crm-description">${escape(c.won_notes||'')}</p><p class="fine">Agreed values, not estimated pipeline or proof of payment. Retained independently of current stage.</p>`;root.querySelector('.crm-detail-grid').append(won);
      }
      if(c.pipeline_status==='LOST'||c.lost_reason){
        const lost=document.createElement('section');lost.className='chart-panel crm-lost-panel';
        lost.innerHTML=`<p class="eyebrow">${c.pipeline_status==='LOST'?'LOST REASON':'PREVIOUSLY SAVED LOST REASON'}</p><h2>${escape(c.lost_reason||'Not specified')}</h2><p class="fine">${c.pipeline_status==='LOST'?'Optional. Add or change it using Edit company.':'This is a retained reason, not the current pipeline outcome. Edit company to change or clear it.'}</p>`;
        root.querySelector('.crm-detail-grid').append(lost);
      }
    }catch(error){if(active&&seq===requestId)root.innerHTML=`<a href="/admin/leads" data-lead class="quiet">← All leads</a><p role="alert">${escape(error.message)}</p><button class="secondary" data-reload>Try again</button>`;}
  }
  function countryField() {
    const other=form.elements.country.value==='OTHER';
    form.querySelector('#country-code-label').hidden=!other;form.elements.country_code.required=other;
  }
  function edit(company = null) {
    editing=company;form.reset();form.querySelector('[data-error]').textContent='';
    form.querySelector('h2').textContent=company?'Edit company.':'Add lead.';
    const defaults={priority:'MEDIUM',lead_source:'Manual research',pipeline_status:'NEW_LEAD',estimated_value:'',value_type:'UNKNOWN',lost_reason:'',...Object.fromEntries(WON_FIELDS.map(k=>[k,''])),...company};
    form.querySelector('[data-initial-contact]').hidden=!!company;
    form.querySelector('[data-initial-contact]').open=false;
    form.querySelector('[data-won-fields]').open=company?.pipeline_status==='WON';
    form.querySelector('[data-opportunity]').open=company?.estimated_value!=null;
    for(const [name,value] of Object.entries(defaults)) {
      if(name==='services'||name==='country')continue;
      if(form.elements[name])form.elements[name].value=value??'';
    }
    form.elements.country.value=company?.country ? (['SK','CZ'].includes(company.country)?company.country:'OTHER') : '';
    form.elements.country_code.value=company?.country||'';
    form.querySelectorAll('[name=services]').forEach(e=>e.checked=(company?.services||[]).includes(e.value));
    countryField();lostFields();dialog.showModal();form.elements.company_name.focus();
  }
  function lostFields(){form.querySelector('[data-lost-fields]').hidden=form.elements.pipeline_status.value!=='LOST'&&!form.elements.lost_reason.value;form.querySelector('[data-won-fields]').hidden=form.elements.pipeline_status.value!=='WON'&&!WON_FIELDS.some(k=>form.elements[k].value);}
  form.elements.pipeline_status.onchange=lostFields;
  form.elements.country.onchange=countryField;
  dialog.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>dialog.close());
  dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
  form.onsubmit=async e=>{
    e.preventDefault();if(pending)return;pending=true;
    const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    const values=Object.fromEntries(new FormData(form));values.services=new FormData(form).getAll('services');
    if(values.country==='OTHER')values.country=values.country_code.toUpperCase();
    delete values.country_code;
    try {
      Object.assign(values,opportunityValueInput(values));
      if(!editing&&['initial_name','initial_position','initial_email','initial_phone'].some(k=>values[k]?.trim()))values.initial_contact={full_name:values.initial_name,job_title:values.initial_position,email:values.initial_email,phone:values.initial_phone};
      for(const k of ['initial_name','initial_position','initial_email','initial_phone'])delete values[k];
      const {company}=await api(editing?'crm-update':'crm-create',{...values,...(editing?{id:editing.id,version:editing.version}:{})});
      dialog.close();notify('Lead saved.');navigate('/admin/leads/'+company.id);
    }catch(error){form.querySelector('[data-error]').textContent=error.message;}
    finally{pending=false;buttons.forEach(b=>b.disabled=false);}
  };
  root.onclick=async e=>{
    const target=e.target.closest('a,button');if(!target)return;
    if(target.hasAttribute('data-lead')&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.button===0){e.preventDefault();navigate(target.getAttribute('href'));return;}
    if(target.hasAttribute('data-add'))edit();
    if(target.hasAttribute('data-edit'))edit(current);
    if(target.hasAttribute('data-reload'))show();
    if(target.dataset.page){const p=new URLSearchParams(location.search);p.set('page',target.dataset.page);navigate('/admin/leads?'+p);}
    if(target.hasAttribute('data-archive')&&current){
      if(!current.archived_at&&!confirm('Archive this lead? Its data and history will be kept.'))return;
      const selected=current;target.disabled=true;
      try{await api('crm-archive',{id:selected.id,version:selected.version,archived:!selected.archived_at});notify(selected.archived_at?'Lead restored.':'Lead archived.');if(location.pathname==='/admin/leads/'+selected.id)await detail(selected.id);}
      catch(error){notify(error.message);}finally{target.disabled=false;}
    }
  };
  function show() {
    activate(true);
    if(/^\/admin\/follow-ups\/?$/.test(location.pathname)){
      document.querySelector('#nav-leads').classList.remove('active');
      document.querySelector('#nav-followups').classList.add('active');
      followups.show();return;
    }
    if(/^\/admin\/pipeline\/?$/.test(location.pathname)){
      document.querySelector('#nav-leads').classList.remove('active');
      document.querySelector('#nav-pipeline').classList.add('active');
      pipeline.show();return;
    }
    const match=location.pathname.match(/^\/admin\/leads\/([^/]+)\/?$/);
    if(match)detail(match[1]);else listShell();
  }
  return {show, hide:()=>activate(false), isActive:()=>active, navigate};
}
