import './cursor.js';
import {createCrm} from './crm.js';
import {refreshWebsiteStats} from './website-stats.js';
import {uploadPresentation} from './upload.js';
const arrowIcon='<svg class="arrow-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false" style="vertical-align:-.125em"><path d="M5 19 19 5M5 5h14v14"/></svg>';
const $=s=>document.querySelector(s);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let projects=[],statistics={},view='all',selected=null,noticeTimer;
const duration=n=>{n=Number(n)||0;return n>=3600?`${Math.floor(n/3600)}h ${Math.floor(n%3600/60)}m`:n>=60?`${Math.floor(n/60)}m ${n%60}s`:`${n}s`;};
const notify=message=>{clearTimeout(noticeTimer);$('#notice').textContent=message;$('#notice').classList.add('visible');noticeTimer=setTimeout(()=>$('#notice').classList.remove('visible'),9000);};
async function api(action,body,params={}) {
 const query=new URLSearchParams({...params,action});
 const response=await fetch(`/api/admin?${query}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 const data=await response.json().catch(()=>({error:'The server did not finish this request. Please try again.'}));if(!response.ok){if(response.status===401 && action!=='login' && action!=='verify')showLogin();throw Object.assign(new Error(data.error||'Request failed.'),{status:response.status,retryAfter:response.headers.get('Retry-After')});}return data;
}
function showLogin(setup=false){document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());$('#studio').hidden=true;$('#login').hidden=false;$('#signin').hidden=setup;$('#set-password').hidden=!setup;$('#login-title').textContent=setup?'Make it yours.':'Welcome back.';$('#login-hint').textContent=setup?'Set a password with at least 12 characters.':'Sign in to your Shapeviz studio.';}
function formData(form){const data=Object.fromEntries(new FormData(form));for(const name of ['publish','isTemplate'])if(form.elements[name])data[name]=form.elements[name].checked;return data;}
async function busy(form,task){const buttons=[...form.querySelectorAll('button')];let errorBox=form.querySelector('[data-form-error]');if(!errorBox){errorBox=document.createElement('p');errorBox.dataset.formError='';errorBox.setAttribute('role','alert');form.append(errorBox);}errorBox.textContent='';buttons.forEach(b=>b.disabled=true);try{await task();}catch(error){errorBox.textContent=error.message;notify(error.message);}finally{buttons.forEach(b=>b.disabled=false);}}
function metricMarkup(summary={}){return [['Visits',summary.visits||0],['Active time',duration(summary.seconds)],['Average / visit',duration(summary.average_seconds)],['Slide views',summary.slide_views||0],['Website clicks',summary.website_clicks||0],['Visits with a click',summary.website_click_sessions||0],['Click-through rate',`${summary.visits ? Math.round((summary.website_click_sessions||0)/summary.visits*100) : 0}%`]].map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');}
function drawChart() {
 const days=Number($('#days').value), rows=statistics.daily||[];
 const counts=new Map(rows.map(r=>[r.day,r])), max=Math.max(1,...rows.map(r=>Number(r.visits)));
 let content='';
 for(let i=days-1;i>=0;i--) {
  const date=new Date();date.setUTCDate(date.getUTCDate()-i);
  const day=date.toISOString().slice(0,10),row=counts.get(day)||{},count=Number(row.visits)||0;
  const label=day+': '+count+' visits · '+duration(row.seconds)+' active';
  content+='<button type="button" class="bar-column" data-day="'+day+'" data-readout="'+escape(label)+'" aria-label="'+escape(label)+'" aria-pressed="false"><span class="bar" style="height:'+count/max*100+'%">'+(count&&days<=30?'<span class="bar-value">'+count+'</span>':'')+'</span>'+(i===0||i===days-1||i%Math.ceil(days/6)===0?'<small>'+day.slice(5).replace('-','/')+'</small>':'')+'</button>';
 }
 $('#visits-chart').innerHTML=content;
 $('#chart-readout').textContent='Hover, focus or tap a day to see its numbers.';
}
function readChart(event) {
 const button=event.target.closest('[data-day]');if(!button)return;
 $('#chart-readout').textContent=button.dataset.readout;
 if(event.type==='click')$('#visits-chart').querySelectorAll('[data-day]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
}
['pointerover','focusin','click'].forEach(type=>$('#visits-chart').addEventListener(type,readChart));
const isTemplate = project => project.is_template || project.source_type === 'template';
function renderProjects() {
 const query=$('#search').value.toLowerCase();
 const filtered=projects.filter(p=>(view==='templates' ? isTemplate(p) : !isTemplate(p)) && `${p.client} ${p.title} ${p.deck_slug}`.toLowerCase().includes(query));
 $('#library-count').textContent=`${filtered.length} ${view==='templates'?'templates':'presentations'}`;
 $('#projects').innerHTML=filtered.length ? filtered.map(p=>{
  if(isTemplate(p)) return `<article class="project-row template-row"><button type="button" class="project-icon" data-template-preview="${p.deck_slug}" aria-label="Preview ${escape(p.client)}" ${p.status==='archived'?'disabled':''}>${arrowIcon}</button><button class="project-name" data-template-preview="${p.deck_slug}" ${p.status==='archived'?'disabled':''}><strong>${escape(p.client)}</strong><small>${escape(p.title)} · Reusable template</small></button><span class="badge">${p.status==='archived'?'Archived':'Template'}</span><div class="row-actions"><button class="secondary" data-variant="${p.deck_slug}" ${p.status==='archived'?'disabled':''}>Use template</button><button class="quiet" data-edit="${p.deck_slug}" aria-label="Edit template ${escape(p.client)}">Edit</button><button class="quiet delete-action" data-delete="${p.deck_slug}" aria-label="Delete template ${escape(p.client)}">Delete template</button></div></article>`;
  const stats=statistics.decks?.find(d=>d.deck_slug===p.deck_slug)||{};
  return `<article class="project-row"><a class="project-icon" href="/p/${p.deck_slug}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escape(p.client)}" title="Open presentation in a new tab">${arrowIcon}</a><button class="project-name" data-detail="${p.deck_slug}"><strong>${escape(p.client)}</strong><small>${escape(p.title)} · /p/${p.deck_slug}</small></button><span class="badge ${p.status}">${p.status}</span><div class="row-stats">${stats.visits||0}<small>visits · ${duration(stats.seconds)}</small><small>${Number(stats.website_clicks)||0} website clicks · ${Number(stats.website_click_sessions)||0} visits with a click</small></div><div class="row-actions"><button class="quiet" data-edit="${p.deck_slug}" aria-label="Edit ${escape(p.client)}">Edit</button><button type="button" class="quiet" data-reset-stats="${p.deck_slug}" aria-label="Reset statistics for ${escape(p.client)}">Reset statistics</button><button class="quiet delete-action" data-delete="${p.deck_slug}" aria-label="Delete ${escape(p.client)}">Delete</button>${p.status==='published'?`<button type="button" class="quiet" data-copy-link="${p.deck_slug}" aria-label="Copy link for ${escape(p.client)}">Copy link</button>`:''}</div></article>`;
 }).join('') : `<div class="empty">${view==='templates'?'No templates saved yet. Upload a template to reuse it for different companies.':'No presentations here yet. Create one from a template or upload a finished HTML presentation.'}</div>`;
}
async function copyPresentationLink(slug){const url=new URL(`/p/${slug}`,location.origin).href;try{await navigator.clipboard.writeText(url);notify('Link copied.');}catch{notify(`Could not copy automatically. Copy this link: ${url}`);}}
async function refresh(){const website=refreshWebsiteStats(api);const list=await api('list');projects=list.projects;renderProjects();try{const stats=await api('stats',null,{days:$('#days').value});statistics=stats;$('#metrics').innerHTML=metricMarkup(stats.summary);drawChart();renderProjects();}catch(error){$('#metrics').textContent='Statistics are temporarily unavailable.';$('#chart-readout').textContent=error.message;}await website;}
$('#website-days').onchange=()=>refreshWebsiteStats(api);
const crm=createCrm({api,notify});
const isCrmPath=()=>/^\/admin\/(?:leads(?:\/[^/]+)?|pipeline)\/?$/.test(location.pathname);
async function enter(email){$('#login').hidden=true;$('#studio').hidden=false;$('#account').textContent=email;$('#today').textContent=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});if(isCrmPath())crm.show();else{setView(new URLSearchParams(location.search).get('view')==='templates'?'templates':'all',false);await refresh();}}
$('#nav-leads').onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.button!==0)return;e.preventDefault();crm.navigate('/admin/leads');};
$('#nav-pipeline').onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.button!==0)return;e.preventDefault();crm.navigate('/admin/pipeline');};
window.addEventListener('popstate',()=>{if($('#studio').hidden)return;if(isCrmPath())crm.show();else setView(new URLSearchParams(location.search).get('view')==='templates'?'templates':'all',false);});
$('#signin').onsubmit=e=>{e.preventDefault();busy(e.currentTarget,async()=>{const data=await api('login',formData(e.target));e.target.reset();await enter(data.email);});};
$('#set-password').onsubmit=e=>{e.preventDefault();busy(e.currentTarget,async()=>{const data=formData(e.target);if(data.password!==data.confirm)throw new Error('Passwords do not match.');await api('password',{password:data.password});e.target.reset();const user=await api('me');await enter(user.email);notify('Password saved.');});};
$('#logout').onclick=async()=>{try{await api('logout',{});showLogin();}catch(e){notify(e.message);}};
$('#change-password').onclick=()=>showLogin(true);
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{const dialog=b.closest('dialog');if(dialog.id==='preview-dialog')$('#variant-preview').srcdoc='';dialog.close();});
function openUpload(kind='presentation') {
 const form=$('#upload-form'),template=kind==='template';form.reset();pendingUpload=null;
 form.querySelector('[data-form-error]')?.remove();form.elements.kind.value=kind;
 $('#upload-title').textContent=template?'Upload a template.':'Upload a presentation.';
 $('#upload-name-label').textContent=template?'Template name':'Company name';
 form.elements.client.placeholder=template?'Universal pitch':'Milenium';
 $('#upload-template-hint').hidden=!template;$('#upload-slug-label').hidden=template;
 $('#publish-label').hidden=template;$('#upload-progress').textContent='';$('#upload-dialog').showModal();
}
function setView(next,push=true) {
 const wasCrm=crm.isActive();crm.hide();
 if(push){const path=next==='templates'?'/admin?view=templates':'/admin';if(location.pathname+location.search!==path)history.pushState(null,'',path);}
 if(wasCrm)refresh().catch(error=>notify(error.message));
 view=next;document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===view));
 $('#page-title').innerHTML=view==='templates'?'Templates<span>.</span>':'Overview<span>.</span>';
 $('#page-kicker').textContent=view==='templates'?'CREATE ONCE. MAKE IT PERSONAL.':'YOUR WORK, IN MOTION.';
 $('#library-title').textContent=view==='templates'?'Reusable templates':'Your presentations';
 document.querySelectorAll('.workspace > .metrics,.workspace > .chart-panel,.toolbar .range-label').forEach(element=>element.hidden=view==='templates');
 $('#search').placeholder=view==='templates'?'Search templates…':'Search a company or presentation…';
 $('#upload-top').textContent=view==='templates'?'Upload template ＋':'New presentation ＋';renderProjects();
}
$('#open-upload').onclick=()=>openUpload();
$('#open-template-upload').onclick=()=>{setView('templates');openUpload('template');};
$('#upload-top').onclick=()=>view==='templates'?openUpload('template'):$('#new-dialog').showModal();
$('#create-from-template').onclick=()=>{$('#new-dialog').close();openVariant();};
$('#create-from-upload').onclick=()=>{$('#new-dialog').close();openUpload();};
$('#upload-template-from-create').onclick=()=>{$('#variant-dialog').close();openUpload('template');};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('#search').oninput=renderProjects;$('#days').onchange=()=>refresh().catch(e=>notify(e.message));$('#refresh').onclick=()=>refresh().catch(e=>notify(e.message));
const slugify=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
$('#upload-form').elements.client.addEventListener('input',e=>{const form=$('#upload-form');form.elements.slug.value=(form.elements.kind.value==='template'?'template-':'')+slugify(e.target.value).slice(0,90).replace(/-$/,'');});
let pendingUpload=null;
$('#html-file').addEventListener('change',()=>pendingUpload=null);
$('#asset-files').addEventListener('change',()=>pendingUpload=null);
$('#upload-form').onsubmit=e=>{e.preventDefault();busy(e.currentTarget,async()=>{const form=e.target,data=formData(form);data.isTemplate=data.kind==='template';if(data.isTemplate)data.publish=false;if(!pendingUpload)pendingUpload=await uploadPresentation($('#html-file').files[0],[...$('#asset-files').files],api,message=>$('#upload-progress').textContent=message);$('#upload-progress').textContent='Files uploaded. Saving…';await api('finalize',{...data,object:pendingUpload.object});pendingUpload=null;$('#upload-dialog').close();$('#search').value='';setView(data.isTemplate?'templates':'all');notify(data.isTemplate?'Template saved to your library. Use it later from New presentation → From template.':`Presentation saved at /p/${data.slug}`);await refresh();});};
function openVariant(slug='') {
 const form=$('#variant-form'),templates=projects.filter(p=>isTemplate(p)&&p.status!=='archived');form.reset();form.querySelector('[data-form-error]')?.remove();
 form.elements.template.innerHTML='<option value="">Select a saved template…</option>'+templates.map(p=>`<option value="${p.deck_slug}">${escape(p.client)} — ${escape(p.title)}</option>`).join('');
 form.elements.template.value=slug;form.elements.template.disabled=!templates.length;form.elements.client.disabled=!templates.length;
 $('#no-templates').hidden=!!templates.length;$('#preview-variant').disabled=!templates.length;form.querySelector('[type=submit]').disabled=!templates.length;
 $('#variant-preview').hidden=true;$('#replacement-count').textContent='';$('#variant-dialog').showModal();
 if(slug)form.elements.client.focus();else form.elements.template.focus();
}
$('#variant-form').addEventListener('input',()=>{$('#replacement-count').textContent='';});
function openEdit(slug){const p=projects.find(p=>p.deck_slug===slug);if(isTemplate(p)){const form=$('#template-edit-form');form.reset();form.querySelector('[data-form-error]')?.remove();for(const name of ['client','title'])form.elements[name].value=p[name];form.elements.slug.value=slug;$('#template-edit-dialog').showModal();return;}const form=$('#edit-form');form.elements.slug.value=slug;form.elements.title.value=p.title;form.elements.status.value=p.status;form.elements.isTemplate.checked=p.is_template;form.elements.match.required=false;form.elements.match.closest('label').hidden=true;$('#edit-dialog').showModal();}
$('#template-edit-form').onsubmit=e=>{e.preventDefault();busy(e.currentTarget,async()=>{await api('update',formData(e.target));$('#template-edit-dialog').close();await refresh();notify('Template settings saved.');});};
$('#edit-form').onsubmit=e=>{e.preventDefault();busy(e.currentTarget,async()=>{await api('update',formData(e.target));$('#edit-dialog').close();await refresh();notify('Presentation settings saved.');});};
$('#preview-variant').onclick=()=>{const form=$('#variant-form');if(!form.reportValidity())return;busy(form,async()=>{const result=await api('preview',formData(form));const iframe=$('#variant-preview');iframe.hidden=false;iframe.srcdoc=result.html;$('#preview-dialog').showModal();$('#replacement-count').textContent=`${result.replacements} client fields · ${result.slides} slides. Review the presentation before saving.`;});};
$('#variant-form').onsubmit=e=>{e.preventDefault();busy(e.currentTarget,async()=>{const result=await api('variant',formData(e.target));$('#variant-dialog').close();$('#search').value='';setView('all');await refresh();notify(`Your company presentation is ready: ${location.origin}${result.url}`);});};
async function showDetail(slug){selected=slug;const p=projects.find(p=>p.deck_slug===slug);$('#detail-title').textContent=p.client;$('#detail-metrics').innerHTML='<p class="empty">Loading statistics…</p>';$('#slide-chart').innerHTML='';$('#sessions').innerHTML='';$('#detail-actions').innerHTML=`<span class="badge ${p.status}">${p.status}</span><span class="fine">/p/${slug} · ${p.slide_count} slides</span>${p.status==='published'?`<button class="secondary" id="copy-link">Copy link ${arrowIcon}</button>`:''}`;$('#detail-dialog').showModal();if($('#copy-link'))$('#copy-link').onclick=()=>copyPresentationLink(slug);try{const stats=await api('stats',null,{slug,days:$('#days').value});if(selected!==slug)return;$('#detail-metrics').innerHTML=metricMarkup(stats.summary);const max=Math.max(1,...stats.slides.map(s=>Number(s.views)));$('#slide-chart').innerHTML=Array.from({length:Math.min(p.slide_count,1000)},(_,i)=>{const row=stats.slides.find(s=>s.slide_index===i+1)||{};return `<div class="slide-row"><span>Slide ${i+1}</span><div class="slide-track"><div class="slide-fill" style="width:${(row.views||0)/max*100}%"></div></div><small>${row.views||0} views · ${duration(row.seconds)}</small></div>`;}).join('');$('#sessions').innerHTML=stats.sessions.length?`<div class="session-cards">${stats.sessions.map(s=>`<article class="session-card"><div><strong>${escape(new Date(s.started_at).toLocaleString())}</strong><span class="badge">${escape(s.user_agent_category)}</span></div><dl><div><dt>Active time</dt><dd>${duration(s.active_seconds)}</dd></div><div><dt>Slides viewed</dt><dd>${s.slides_viewed} / ${p.slide_count}</dd></div><div><dt>Website clicks</dt><dd>${Number(s.website_clicks)||0}</dd></div><div><dt>Furthest slide</dt><dd>${s.max_slide}</dd></div></dl></article>`).join('')}</div>`:'<p class="empty">No visits in this period yet. Share the presentation link to start collecting insights.</p>';}catch(e){notify(e.message);$('#detail-metrics').innerHTML='<p class="empty">Could not load statistics. Close and try again.</p>';}}
async function resetStatistics(button) {
 const slug=button.dataset.resetStats;
 if(!window.confirm(`Reset all statistics for /p/${slug}? This cannot be undone. The presentation and its files will remain available.`))return;
 button.disabled=true;
 try{await api('reset-statistics',{slug,confirmSlug:slug});await refresh();notify(`Statistics reset for /p/${slug}.`);}
 catch(error){notify(error.message);}
 finally{button.disabled=false;}
}
async function previewTemplate(slug){const p=projects.find(project=>project.deck_slug===slug);try{const result=await api('preview',{template:slug,client:p.client});const iframe=$('#variant-preview');iframe.hidden=false;iframe.srcdoc=result.html;$('#preview-dialog').showModal();}catch(error){notify(error.message);}}
$('#projects').onclick=e=>{const b=e.target.closest('[data-detail],[data-variant],[data-edit],[data-delete],[data-copy-link],[data-reset-stats],[data-template-preview]');if(!b)return;if(b.dataset.resetStats)resetStatistics(b);if(b.dataset.copyLink)copyPresentationLink(b.dataset.copyLink);if(b.dataset.detail)showDetail(b.dataset.detail);if(b.dataset.variant)openVariant(b.dataset.variant);if(b.dataset.edit)openEdit(b.dataset.edit);if(b.dataset.delete)openDelete(b.dataset.delete);if(b.dataset.templatePreview)previewTemplate(b.dataset.templatePreview);};
let deletingSlug=null;
function openDelete(slug){const p=projects.find(p=>p.deck_slug===slug),template=isTemplate(p);deletingSlug=slug;$('#delete-name').textContent=p.client;$('#delete-slug').textContent=template?'delete':slug;$('#delete-form').reset();$('#delete-form').querySelector('[data-form-error]')?.remove();$('#delete-kind').textContent=template?'REMOVE TEMPLATE':'REMOVE PRESENTATION';$('#delete-submit').textContent=template?'Delete template & files':'Delete presentation';$('#keep-item').textContent=template?'Keep template':'Keep presentation';$('#delete-description').textContent=`Permanently delete this ${template?'template':'presentation'}, its saved HTML, uploaded files and associated records from Supabase. This cannot be undone. Files still used by other presentations stay available and are removed when their last presentation is deleted.`;$('#delete-dialog').showModal();}
$('#delete-form').onsubmit=e=>{e.preventDefault();busy(e.currentTarget,async()=>{
 const slug=deletingSlug,template=isTemplate(projects.find(p=>p.deck_slug===slug));
 const confirmation=e.target.elements.confirmSlug.value.trim();
 if(confirmation!==(template?'delete':slug))throw new Error(template?'Type delete to confirm deletion.':'Type the exact URL name to confirm deletion.');
 const label=template?'Template':'Presentation';let result;
 // Keep the server-side target confirmation and Storage cleanup unchanged.
 try{result=await api('delete',{slug,confirmSlug:slug});}catch(error){await refresh().catch(()=>{});throw error;}
 $('#delete-dialog').close();await refresh();notify(`${label} deleted. ${result.deletedFiles||0} Storage files removed.${result.sharedFiles?' Shared files remain for other presentations.':''}`);
});};
try{const hash=new URLSearchParams(location.hash.slice(1));const token=hash.get('token_hash');if(token){history.replaceState(null,'','/adminlogin');await api('verify',{tokenHash:token});showLogin(true);}else{const user=await api('me');await enter(user.email);}}catch(error){showLogin();if(!/sign in/i.test(error.message))notify(error.message);}
