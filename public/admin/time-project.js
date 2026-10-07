import {esc,euro,clockTime} from './time-values.js';
import {mountTimeHistory} from './time-history.js';
import {createManualTimeEditor} from './time-manual-editor.js';
import {svgIcon} from '../ui/icons.js';
export function mountProjectTime({root,api,notify,project,company}){
 let disposed=false,summarySeq=0;
 const projectId=project.id,companyId=company.id,archived=!!company.archived_at;
 root.innerHTML=`<div class="section-title"><div><p class="eyebrow">YOUR WORK, VALUED</p><h3>Time & earnings.</h3></div><div class="actions"><a class="secondary" data-lead href="/admin/time-tracker?companyId=${encodeURIComponent(companyId)}&projectId=${encodeURIComponent(projectId)}">${svgIcon('clock')} Start tracking</a><button type="button" class="primary" data-add-time ${archived?'disabled':''}>Add time manually</button></div></div><div class="time-metrics" data-totals></div><p class="fine">Earned value is work performed, separate from invoices and payments. Existing entries retain their original hourly rate.</p><p class="fine" data-live-estimate></p><p role="alert" data-summary-error></p><div data-history></div>`;
 const editor=createManualTimeEditor({api,onSaved:()=>notify('Time saved.')});
 async function totals(){const ticket=++summarySeq;try{const data=await api('crm-project-time',null,{projectId,companyId});if(disposed||ticket!==summarySeq)return;root.querySelector('[data-totals]').innerHTML=[['Hourly rate',euro(project.hourly_rate_cents)+'/h'],['Tracked time',clockTime(data.tracked_seconds)],['Manual time',clockTime(data.manual_seconds)],['Total worked',clockTime(Number(data.tracked_seconds)+Number(data.manual_seconds))],['Earned value',euro(data.earned_cents)]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('');root.querySelector('[data-live-estimate]').textContent=data.open_seconds?`Open timer: ${clockTime(data.open_seconds)} · ${euro(data.open_earned_cents)} estimated, excluded from completed totals.`:'';root.querySelector('[data-summary-error]').textContent='';}catch(e){if(!disposed)root.querySelector('[data-summary-error]').textContent=e.message;}}
 const history=mountTimeHistory({root:root.querySelector('[data-history]'),api,projectId,companyId,readOnly:archived});root.querySelector('[data-add-time]').onclick=()=>editor.open({project,company});
 const changed=()=>{totals();history.refresh();};window.addEventListener('shapeviz-time-changed',changed);totals();
 return ()=>{disposed=true;window.removeEventListener('shapeviz-time-changed',changed);history.destroy();editor.destroy();};
}
