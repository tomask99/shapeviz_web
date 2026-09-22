import {displayDate} from './crm-dates.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=value=>Math.max(0,Number(value)||0);
const duration=value=>{const seconds=count(value);return `${Math.floor(seconds/60)}m ${seconds%60}s`;};

/** Render only the existing RPC's period/session cohort, never inferred people or lifetime totals. */
export function engagementMarkup(stats,project,days){
  if(!stats?.summary||!Array.isArray(stats.slides)||!Array.isArray(stats.sessions))throw new Error('Analytics response is incomplete. Please retry.');
  const s=stats.summary,unique=new Set(stats.slides.filter(s=>count(s.views)>0).map(s=>s.slide_index)).size;
  const last=stats.sessions.map(s=>s.started_at).filter(value=>Number.isFinite(Date.parse(value))).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
  return `<p class="fine">Visits started in the last ${days} days. Historical data may include admin visits; these are not identified people.</p>${project?.analytics_enabled===false?'<p class="fine">Tracking is currently disabled. Historical data is shown.</p>':''}<dl class="crm-engagement-metrics"><div><dt>Visits</dt><dd>${count(s.visits)}</dd></div><div><dt>Active time</dt><dd>${duration(s.seconds)}</dd></div><div><dt>Unique slides viewed</dt><dd>${unique} / ${count(project?.slide_count)||'—'}</dd></div><div><dt>Website clicks</dt><dd>${count(s.website_clicks)}</dd></div></dl><p class="fine">Last visit in period: ${last?esc(displayDate(last)):'No visits yet'}</p>`;
}

/** Small, bounded overview: one page of links, one selected deck's analytics on demand. */
export function mountEngagement({panel,company,api,onPresentations}){
  let disposed=false,seq=0,page=1,items=[],selected='',days=30;
  const read=(action,params={})=>api(action,null,{companyId:company.id,...params});
  function selection(){
    ++seq;selected=panel.querySelector('[data-engagement-deck]').value;
    const item=items.find(i=>i.id===selected),project=item?.project;
    panel.querySelector('[data-engagement-meta]').textContent=item?`${project?.status||'Unavailable'} · ${item.sent_at?'Sent '+displayDate(item.sent_at):'Not marked sent'}`:'';
    panel.querySelector('[data-engagement-result]').textContent='Choose a period and show engagement for this presentation.';
    panel.querySelector('[data-engagement-show]').disabled=!project;
  }
  async function load(){
    const ticket=++seq;panel.innerHTML='<h3>Presentation engagement</h3><p role="status">Loading linked presentations…</p>';
    try{
      const data=await read('crm-presentations',{page});if(disposed||ticket!==seq)return;
      items=data.items||[];
      if(!items.length&&page>1){page--;return load();}
      panel.innerHTML='<p class="eyebrow">PRESENTATION ENGAGEMENT</p><h3>How your pitch is being viewed.</h3><p class="fine">Statistics for one selected presentation, not a company-wide total.</p>';
      if(items.length){
        panel.insertAdjacentHTML('beforeend','<label>Linked presentation<select aria-label="Linked presentation" data-engagement-deck></select></label><p class="fine" data-engagement-meta></p><div class="crm-engagement-controls"><label>Engagement period<select aria-label="Engagement period" data-engagement-period><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><button type="button" class="secondary" data-engagement-show>Show engagement</button></div><div data-engagement-result aria-live="polite"></div>');
        const dropdown=panel.querySelector('[data-engagement-deck]');for(const item of items)dropdown.add(new Option(item.project?.title||item.deck_slug,item.id));
        panel.querySelector('[data-engagement-period]').value=String(days);selection();
        panel.insertAdjacentHTML('beforeend',`<div class="actions"><button class="quiet" data-engagement-page="-1" ${page<=1?'disabled':''}>Previous presentations</button><span class="fine">Page ${page}</span><button class="quiet" data-engagement-page="1" ${!data.hasMore?'disabled':''}>More presentations</button></div>`);
      }else panel.insertAdjacentHTML('beforeend','<p class="fine">No presentations linked to this company yet.</p>');
      panel.insertAdjacentHTML('beforeend','<div class="actions"><button class="quiet" data-engagement-refresh>Refresh linked presentations</button><button class="quiet" data-engagement-manage>Manage presentations</button></div>');
    }catch(error){if(!disposed&&ticket===seq)panel.innerHTML=`<h3>Presentation engagement</h3><p role="alert">${esc(error.message)}</p><button class="secondary" data-engagement-refresh>Retry linked presentations</button>`;}
  }
  async function show(){
    const item=items.find(i=>i.id===selected);if(!item?.project)return;
    const ticket=++seq,target=panel.querySelector('[data-engagement-result]'),button=panel.querySelector('[data-engagement-show]');
    button.disabled=true;target.textContent='Loading engagement…';
    const period=days;
    try{const result=await read('crm-presentation-stats',{id:item.id,days:period});if(disposed||ticket!==seq)return;target.innerHTML=engagementMarkup(result.stats,item.project,period);}
    catch(error){if(!disposed&&ticket===seq)target.innerHTML=`<p role="alert">${esc(error.message)} Use Show engagement to retry.</p>`;}
    finally{if(!disposed&&ticket===seq)button.disabled=false;}
  }
  const click=e=>{const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-engagement-show'))show();
    if(b.hasAttribute('data-engagement-refresh'))load();
    if(b.hasAttribute('data-engagement-manage'))onPresentations();
    if(b.dataset.engagementPage){page+=Number(b.dataset.engagementPage);load();}
  };
  const change=e=>{if(e.target.hasAttribute('data-engagement-deck'))selection();if(e.target.hasAttribute('data-engagement-period')){days=Number(e.target.value);selection();}};
  panel.addEventListener('click',click);panel.addEventListener('change',change);load();
  return ()=>{disposed=true;seq++;panel.removeEventListener('click',click);panel.removeEventListener('change',change);};
}
