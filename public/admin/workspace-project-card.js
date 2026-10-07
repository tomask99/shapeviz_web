import {esc} from './time-values.js';
import {svgIcon} from '../ui/icons.js';
import {projectPrice,projectStatuses} from './crm-project-editor.js';
export const workspaceStatuses={...projectStatuses,ON_HOLD:'Paused',COMPLETED:'Done'};
export const statusChoices={ACTIVE:'Active',ON_HOLD:'Paused',COMPLETED:'Done'};

export function workspaceProjectCard(p){
 return `<article class="research-card workspace-project-card" data-workspace-project-id="${esc(p.id)}">
  <div class="project-card-top"><div class="project-status-picker"><button type="button" class="research-tag project-status-toggle project-status-${esc(p.status.toLowerCase())}" data-status-toggle aria-expanded="false" aria-controls="project-status-${esc(p.id)}" aria-label="Change status for ${esc(p.name)}: ${esc(workspaceStatuses[p.status]||p.status)}">${esc(workspaceStatuses[p.status]||p.status)}${svgIcon('chevronDown')}</button>
   <div class="project-status-options" id="project-status-${esc(p.id)}" role="group" aria-label="Project status" hidden>${Object.entries(statusChoices).map(([status,label])=>`<button type="button" data-set-status="${status}" aria-pressed="${p.status===status}"><span class="project-status-dot project-status-${status.toLowerCase()}" aria-hidden="true"></span>${label}${p.status===status?svgIcon('check'):''}</button>`).join('')}</div></div>${svgIcon(p.hourly_rate_cents!=null?'clock':'folder')}</div>
  <span class="workspace-project-client">${esc(p.company_name)}</span><h2><button type="button" class="workspace-project-open" data-open-project aria-haspopup="dialog">${esc(p.name)}</button></h2>
  <p class="project-price">${esc(projectPrice(p))}</p>${p.description?`<p class="client-card-description">${esc(p.description)}</p>`:''}
  <div class="workspace-project-error" hidden><p role="alert"></p><button type="button" class="quiet" data-projects-retry>Refresh projects</button></div>
  <div class="research-card-footer"><span>${p.end_date?'Due '+esc(p.end_date):'Brief · Tasks · Time'}</span>${svgIcon('arrowUpRight')}</div></article>`;
}
