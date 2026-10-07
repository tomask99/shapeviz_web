import {STATUSES} from './crm-options.js';
import {localDayBounds} from './crm-dates.js';
import {pipelineValueMarkup,formatPipelineEUR} from './crm-pipeline-value.js';
import {createRecentActivity} from './crm-recent-activity.js';
import {projectRevenueMarkup} from './crm-project-revenue.js';
import {svgIcon} from '../ui/icons.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=value=>value.toLowerCase().replaceAll('_',' ');
export function createBusinessOverview({api}){
 const root=document.createElement('section');root.id='business-overview';root.className='chart-panel overview-layout';root.hidden=true;
 document.querySelector('.workspace > .toolbar').before(root);
 const recent=createRecentActivity({api});
 let seq=0,enabled=false,day='',loading=false;
 const active=()=>enabled&&!root.hidden&&!document.querySelector('#studio').hidden;
 async function refresh(force=false){
  if(!active()||(loading&&!force))return;
  const ticket=++seq,bounds=localDayBounds();day=bounds.today;loading=true;
  if(!root.children.length)root.innerHTML='<p role="status" class="overview-loading">Loading your overview…</p>';
  root.setAttribute('aria-busy','true');
  try{
   const d=await api('crm-overview',null,bounds);if(ticket!==seq)return;
   if(!Number.isFinite(d.total_leads)||!d.stages)throw new Error('Business overview is unavailable.');
   const n=key=>Number(d.stages[key])||0;
   const cards=[['Total leads',d.total_leads,'company',''],['Open opportunities',n('REPLIED')+n('MEETING')+n('PROPOSAL'),'pipeline','REPLIED'],['Meetings',n('MEETING'),'calendar','MEETING'],['Won',n('WON'),'briefcase','WON']];
   root.innerHTML=`<div class="overview-title"><span class="fine">Your business, at a glance.</span><button class="quiet icon-button" data-business-refresh aria-label="Refresh sales" title="Refresh sales">${svgIcon('refresh')}</button></div>
    ${projectRevenueMarkup(d.revenue)}
    <div class="business-cards overview-metrics">${cards.map(([name,value,icon,stage])=>`<a href="${name==='Open opportunities'?'/admin/pipeline':'/admin/leads'+(stage?'?pipeline_status='+stage:'')}"><span class="metric-label">${svgIcon(icon)}${name}</span><strong>${Number(value)||0}</strong></a>`).join('')}</div>
    <div class="overview-grid"><section class="overview-panel"><div class="section-title"><h3>Sales pipeline</h3><a class="quiet icon-button" href="/admin/pipeline" aria-label="Open pipeline" title="Open pipeline">${svgIcon('arrowUpRight')}</a></div><div class="business-stages">${STATUSES.map(s=>`<a href="/admin/leads?pipeline_status=${s}"><span>${esc(label(s))}</span><strong>${n(s)}</strong><span class="stage-track" aria-hidden="true"><span style="width:${Math.min(100,n(s)/Math.max(1,d.total_leads)*100)}%"></span></span></a>`).join('')}</div><details class="ui-help"><summary>About pipeline numbers</summary><p>Current stages, not a historical conversion funnel. Archived companies are excluded.</p><p>${Number(d.replies_recorded)||0} companies with a recorded reply. Open opportunities include Replied, Meeting and Proposal.</p></details></section>${pipelineValueMarkup(d.pipeline_value)}</div>
    ${Array.isArray(d.source_report)?`<details class="crm-source-report overview-panel"><summary>Lead sources <span class="fine">${d.source_report.length} sources</span></summary>${d.source_report.length?`<div class="crm-report-scroll"><table><thead><tr><th>Source</th><th>Leads</th><th>Open</th><th>Won</th><th>Lost</th><th>Won projects</th><th>Won monthly</th></tr></thead><tbody>${d.source_report.map(r=>`<tr><th scope="row">${esc(r.lead_source)}</th><td>${Number(r.leads)||0}</td><td>${Number(r.open)||0}</td><td>${Number(r.won)||0}</td><td>${Number(r.lost)||0}</td><td>${esc(formatPipelineEUR(r.won_project))}</td><td>${esc(formatPipelineEUR(r.won_monthly))}</td></tr>`).join('')}</tbody></table></div><p class="fine">Current stages and agreed Won values in EUR; monthly amounts stay separate.</p>`:'<p class="fine">No sources yet.</p>'}</details>`:''}`;
  }catch(e){if(ticket===seq)root.innerHTML=`<div class="overview-panel"><h2>Sales overview</h2><p role="alert">${esc(e.message)}</p><button class="secondary" data-business-refresh>Retry sales overview</button></div>`;}
  finally{if(ticket===seq){loading=false;root.setAttribute('aria-busy','false');}}
 }
 root.onclick=e=>{if(e.target.closest('[data-business-refresh]')){api.invalidate?.();refresh();}};
 const rollover=()=>{if(active()&&!document.hidden&&localDayBounds().today!==day)refresh();};
 setInterval(rollover,60000);document.addEventListener('visibilitychange',rollover);
 return {refresh,show(){enabled=true;root.hidden=false;refresh();recent.show();},hide(){enabled=false;root.hidden=true;seq++;loading=false;root.replaceChildren();recent.hide();}};
}
