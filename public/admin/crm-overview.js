import {STATUSES} from './crm-options.js';
import {localDayBounds,displayDate} from './crm-dates.js';
import {pipelineValueMarkup,formatPipelineEUR} from './crm-pipeline-value.js';
import {createActionCenter} from './crm-action-center.js';
import {createRecentActivity} from './crm-recent-activity.js';
import {createSuggestions} from './crm-suggestions.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=value=>value.toLowerCase().replaceAll('_',' ');
export function createBusinessOverview({api,notify}){
  const root=document.createElement('section');root.id='business-overview';root.className='chart-panel';root.hidden=true;
  document.querySelector('.workspace > .toolbar').before(root);
  const actions=createActionCenter({api,notify,onChanged:()=>{refresh(true);recent.refresh();suggestions.refresh();}});
  const suggestions=createSuggestions({api,notify,schedule:prefill=>actions.schedule(prefill)});
  const recent=createRecentActivity({api});
  let seq=0,enabled=false,day='',loading=false;
  const active=()=>enabled&&!root.hidden&&!document.querySelector('#studio').hidden&&!/^\/admin\/(leads|pipeline|follow-ups)/.test(location.pathname);
  async function refresh(force=false){
    if(!active()||(loading&&!force))return;
    const ticket=++seq,bounds=localDayBounds();day=bounds.today;loading=true;
    root.innerHTML='<p class="eyebrow">SALES OVERVIEW</p><p role="status">Loading business overview…</p>';
    try{
      const d=await api('crm-overview',null,bounds);if(ticket!==seq)return;
      if(!Number.isFinite(d.total_leads)||!d.stages||!d.followups||!Array.isArray(d.next_tasks))throw new Error('Business overview is unavailable.');
      const n=key=>Number(d.stages[key])||0;
      const cards=[['Total leads',d.total_leads],['Contacted · current stage',n('CONTACTED')],['Replies recorded',d.replies_recorded],['Meetings · current stage',n('MEETING')],['Open opportunities',n('REPLIED')+n('MEETING')+n('PROPOSAL')],['Won · current stage',n('WON')]];
      root.innerHTML=`<div class="section-title"><div><p class="eyebrow">SALES OVERVIEW</p><h2>Your business, at a glance.</h2></div><button class="quiet" data-business-refresh>Refresh sales</button></div><p class="fine">Non-archived companies, including won and lost. Current pipeline states, not a historical conversion funnel. Replies recorded counts companies with a manually recorded reply. Open opportunities means Replied, Meeting or Proposal.</p><div class="business-cards">${cards.map(([name,value])=>`<div><span>${esc(name)}</span><strong>${Number(value)||0}</strong></div>`).join('')}</div><div class="section-title"><h3>Follow-ups</h3><a class="quiet" href="/admin/follow-ups">Manage follow-ups</a></div><p class="fine">Local day: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}. Incomplete tasks for non-archived companies.</p><div class="business-cards business-tasks">${['overdue','today','upcoming'].map(k=>`<div><span>${k}</span><strong>${Number(d.followups[k])||0}</strong></div>`).join('')}</div><h3>Next tasks · earliest 5</h3>${d.next_tasks.length?`<ul class="business-next">${d.next_tasks.map(t=>`<li><a href="/admin/leads/${encodeURIComponent(t.company_id)}">${esc(t.company_name)}</a><span>${esc(t.title)} · ${esc(displayDate(t.due_at))}</span></li>`).join('')}</ul>`:'<p class="fine">No pending follow-ups.</p>'}<div class="section-title"><h3>Sales pipeline</h3><a class="quiet" href="/admin/pipeline">Open pipeline</a></div><div class="business-stages">${STATUSES.map(s=>`<a href="/admin/leads?pipeline_status=${s}"><span>${esc(label(s))}</span><strong>${n(s)}</strong></a>`).join('')}</div>${d.total_leads===0?'<p class="fine">No leads yet. Start by adding your first company.</p>':''}<a class="quiet" href="/admin/leads">Open leads</a>`;
      root.querySelector('.business-cards').insertAdjacentHTML('afterend',pipelineValueMarkup(d.pipeline_value));
      if(Array.isArray(d.source_report))root.insertAdjacentHTML('beforeend',`<section class="crm-source-report"><h3>Lead sources</h3><p class="fine">Non-archived companies, current stages — not historical conversions. Agreed WON values only; missing values are excluded, monthly amounts stay separate.</p>${d.source_report.length?`<div class="crm-report-scroll"><table><thead><tr><th>Source</th><th>Leads</th><th>Open</th><th>Won</th><th>Lost</th><th>Won projects (EUR)</th><th>Won monthly (EUR/mo)</th></tr></thead><tbody>${d.source_report.map(r=>`<tr><th scope="row">${esc(r.lead_source)}</th><td>${Number(r.leads)||0}</td><td>${Number(r.open)||0}</td><td>${Number(r.won)||0}</td><td>${Number(r.lost)||0}</td><td>${esc(formatPipelineEUR(r.won_project))}</td><td>${esc(formatPipelineEUR(r.won_monthly))}</td></tr>`).join('')}</tbody></table></div>`:'<p class="fine">No sources yet.</p>'}</section>`);
    }catch(e){if(ticket===seq)root.innerHTML=`<h2>Sales overview</h2><p role="alert">${esc(e.message)}</p><button class="secondary" data-business-refresh>Retry sales overview</button>`;}
    finally{if(ticket===seq)loading=false;}
  }
  root.onclick=e=>{if(e.target.closest('[data-business-refresh]'))refresh();};
  const rollover=()=>{if(active()&&!document.hidden&&localDayBounds().today!==day)refresh();};
  setInterval(rollover,60000);document.addEventListener('visibilitychange',rollover);
  return {refresh,show(){enabled=true;root.hidden=false;refresh();actions.show();suggestions.show();recent.show();},hide(){enabled=false;root.hidden=true;seq++;loading=false;root.replaceChildren();actions.hide();suggestions.hide();recent.hide();}};
}
