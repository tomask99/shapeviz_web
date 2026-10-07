import {svgIcon} from '../ui/icons.js';
import {esc,euro,clockTime,timeZone,earnedCents} from './time-values.js';
import {timeOptions,mountTimeHistory,stamp} from './time-history.js';

export function mountMiniTimer({root,timer,navigate}){
 root.innerHTML=`<button type="button" class="mini-timer" hidden><span data-mini-state></span><strong data-mini-clock></strong><span data-mini-name></span></button>`;
 const button=root.querySelector('button');button.onclick=()=>navigate('/admin/time-tracker');
 const tick=()=>{root.querySelector('[data-mini-clock]').textContent=clockTime(timer.elapsed());};
 const unsubscribe=timer.subscribe(s=>{button.hidden=!s.item;root.querySelector('[data-mini-name]').textContent=s.item?.project_name||s.item?.activity_name||'';root.querySelector('[data-mini-state]').innerHTML=svgIcon(s.item?.status==='running'?'clock':'pause')+` ${s.uncertain?'Sync needed':s.item?.status==='paused'?'Paused':'Running'}`;tick();});
 const interval=setInterval(tick,1000);return ()=>{unsubscribe();clearInterval(interval);};
}

export function mountTimeTracker({root,api,timer}){
 let disposed=false,clients=[],projects=[],selectSeq=0,startId='',metricsSeq=0;
 root.innerHTML=`<div class="page-heading"><div><p class="eyebrow">MAKE YOUR TIME COUNT.</p><h1>Time Tracker<span>.</span></h1></div><button type="button" class="secondary" data-sync>${svgIcon('refresh')} Synchronize</button></div>
 <section class="research-panel time-live"><div data-current></div><div data-start></div><p role="alert" data-timer-error></p><button type="button" class="secondary" data-retry hidden>Retry command</button></section>
 <div class="time-metrics" aria-label="Worked time"><div><span>Today</span><strong data-period="today">00:00:00</strong></div><div><span>This week</span><strong data-period="week">00:00:00</strong></div><div><span>This month</span><strong data-period="month">00:00:00</strong></div></div><p class="fine">Tracked and manual work · ${esc(timeZone())} · includes the open timer at the last synchronization.</p><p role="alert" data-metrics-error></p>
 <section class="research-panel time-history"></section>`;
 const current=root.querySelector('[data-current]'),start=root.querySelector('[data-start]');
 start.innerHTML=`<p class="eyebrow">READY WHEN YOU ARE</p><h2>Start tracking.</h2><form class="time-start-form"><label>Track<select aria-label="Track" name="kind"><option value="project">Client project</option><option value="custom_activity">Custom activity</option></select></label>
 <div data-client-fields><div class="two-columns"><label>Client<select aria-label="Client" name="companyId" required><option value="">Choose a client</option></select></label><label>Hourly project<select aria-label="Hourly project" name="projectId" required><option value="">Choose a client first</option></select></label></div><p class="fine" data-project-hint></p><p class="project-price" data-rate></p></div>
 <label data-activity-field hidden>Activity name<input name="activity_name" maxlength="160" placeholder="e.g. Learning Houdini" disabled></label><label>Description (optional)<textarea name="description" rows="2" maxlength="5000" placeholder="What are you working on?"></textarea></label><p role="alert" data-start-error></p><button class="primary" type="submit">${svgIcon('play')} Start tracking</button></form>`;
 const form=start.querySelector('form');
 function mode(){const custom=form.elements.kind.value==='custom_activity';form.querySelector('[data-client-fields]').hidden=custom;form.querySelector('[data-activity-field]').hidden=!custom;form.elements.companyId.disabled=custom;form.elements.projectId.disabled=custom;form.elements.activity_name.disabled=!custom;form.elements.activity_name.required=custom;}
 form.elements.kind.onchange=mode;
 form.elements.projectId.onchange=()=>{const p=projects.find(p=>p.id===form.elements.projectId.value);form.querySelector('[data-rate]').textContent=p?euro(p.hourly_rate_cents)+'/h':'';};
 async function selectClient(preselect=''){
  const ticket=++selectSeq,companyId=form.elements.companyId.value;projects=[];form.elements.projectId.innerHTML='<option value="">Choose a project</option>';form.querySelector('[data-rate]').textContent='';
  const hint=form.querySelector('[data-project-hint]');hint.textContent=companyId?'Loading hourly projects…':'';if(!companyId)return;
  try{const items=await timeOptions(api,companyId);if(disposed||ticket!==selectSeq)return;projects=items;
   form.elements.projectId.innerHTML='<option value="">Choose an hourly project</option>'+items.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
   hint.innerHTML=items.length?'':`No hourly projects for this client. <a data-lead href="/admin/clients/${encodeURIComponent(companyId)}">Open client</a> and create a project with Hourly billing.`;
   if(preselect&&items.some(p=>p.id===preselect))form.elements.projectId.value=preselect;form.elements.projectId.onchange();
  }catch(e){if(!disposed&&ticket===selectSeq)hint.textContent=e.message;}
 }
 form.elements.companyId.onchange=()=>selectClient();
 async function loadClients(){try{clients=await timeOptions(api);if(disposed)return;form.elements.companyId.innerHTML='<option value="">Choose a client</option>'+clients.filter(c=>!c.archived_at).map(c=>`<option value="${esc(c.id)}">${esc(c.company_name)}</option>`).join('');
  const params=new URLSearchParams(location.search);if(params.get('companyId')&&clients.some(c=>c.id===params.get('companyId')&&!c.archived_at)){form.elements.companyId.value=params.get('companyId');selectClient(params.get('projectId'));}
  if(!clients.some(c=>!c.archived_at))form.querySelector('[data-project-hint]').innerHTML='No clients available. <a data-lead href="/admin/clients">Create a client</a> or track a custom activity.';
 }catch(e){if(!disposed)form.querySelector('[data-start-error]').textContent=e.message;}}
 form.onsubmit=e=>{e.preventDefault();if(!timer.state.ready||timer.state.item||timer.state.busy)return;timer.command('crm-time-start',Object.fromEntries(new FormData(form)));};
 function tick(){if(!timer.state.item)return;current.querySelector('[data-clock]')?.replaceChildren(clockTime(timer.elapsed()));const estimate=current.querySelector('[data-estimate]');if(estimate)estimate.textContent=euro(earnedCents(timer.elapsed(),timer.state.item.rate_cents))+' live estimate';}
 const unsubscribe=timer.subscribe(s=>{
  start.hidden=!!s.item;current.hidden=!s.item;
  form.querySelector('button[type=submit]').disabled=!s.ready||s.busy||s.uncertain||timer.canRetry;
  root.querySelector('[data-timer-error]').textContent=s.error||(!s.ready?'Synchronizing timer…':'');root.querySelector('[data-retry]').hidden=!timer.canRetry;root.querySelector('[data-retry]').disabled=s.busy;root.querySelector('[data-sync]').disabled=s.busy;
  if(s.item){const item=s.item,key=[item.id,item.version,s.busy,s.uncertain].join(':');if(key!==startId){startId=key;current.innerHTML=`<div class="section-title"><span class="research-tag">${s.uncertain?'Last confirmed state: ':''}${item.status==='paused'?'Paused':'Running'}</span><span class="fine">Started ${esc(stamp(item.started_at))}</span></div><h2>${esc(item.project_name||item.activity_name)}</h2>${item.company_name?`<p>${esc(item.company_name)} · ${euro(item.rate_cents)}/h</p>`:'<p class="fine">Custom activity · unbilled</p>'}<div class="time-clock" data-clock>${clockTime(timer.elapsed())}</div>${item.rate_cents!=null?'<p class="project-price" data-estimate></p>':''}<p class="time-description">${esc(item.description)}</p><div class="actions"><button type="button" class="primary" data-command="${item.status==='running'?'pause':'resume'}" ${s.busy||s.uncertain?'disabled':''}>${svgIcon(item.status==='running'?'pause':'play')} ${item.status==='running'?'Pause':'Resume'}</button><button type="button" class="secondary" data-command="finish" ${s.busy||s.uncertain?'disabled':''}>${svgIcon('stop')} Finish</button></div>${item.status==='paused'?'<p class="fine">Paused time is excluded from your worked time and earnings.</p>':''}`;}tick();}else{current.innerHTML='';startId='';}
 });
 current.onclick=e=>{const b=e.target.closest('[data-command]');if(b&&!b.disabled){const s=timer.state.item;timer.command('crm-time-'+b.dataset.command,{id:s.id,version:s.version});}};
 root.querySelector('[data-sync]').onclick=()=>{timer.refresh();loadMetrics();history.refresh();loadClients();};root.querySelector('[data-retry]').onclick=()=>timer.retry();
 const history=mountTimeHistory({root:root.querySelector('.time-history'),api});
 async function loadMetrics(){const ticket=++metricsSeq;try{const data=await api('crm-time-summary',null,{timeZone:timeZone()});if(!disposed&&ticket===metricsSeq){for(const key of ['today','week','month'])root.querySelector(`[data-period=${key}]`).textContent=clockTime(data[key]);root.querySelector('[data-metrics-error]').textContent='';}}catch(e){if(!disposed)root.querySelector('[data-metrics-error]').textContent=e.message;}}
 const changed=()=>{loadMetrics();history.refresh();};window.addEventListener('shapeviz-time-changed',changed);
 const interval=setInterval(tick,1000),summaryInterval=setInterval(()=>{if(!document.hidden)loadMetrics();},30000);
 mode();loadClients();loadMetrics();timer.refresh();return ()=>{disposed=true;unsubscribe();clearInterval(interval);clearInterval(summaryInterval);window.removeEventListener('shapeviz-time-changed',changed);history.destroy();};
}
