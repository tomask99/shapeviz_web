const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function signalSummary(s){
 if(!s?.engagement)return '';
 const date=s.last_contact?new Date(s.last_contact).toLocaleDateString():'Not marked sent';
 return `${escape(s.engagement)} · ${Number(s.visits)||0} visits / 30d · ${escape(s.presentation_status)}<br>Last presentation sent: ${escape(date)}`;
}
export function mountCompanySignals({root,company,api}){
 const panel=document.createElement('section');panel.className='chart-panel crm-signals';root.querySelector('.crm-detail-grid').append(panel);let disposed=false;
 async function load(){
  panel.textContent='Loading company engagement…';
  try{const {signals:s,config:c}=await api('crm-signals',null,{companyId:company.id});if(disposed)return;if(!s?.engagement)throw new Error('Company engagement unavailable.');
   panel.innerHTML=`<p class="eyebrow">COMPANY ENGAGEMENT · 30 DAYS</p><h2>${escape(s.engagement)}</h2><p>${signalSummary(s)}</p><p>${Number(s.seconds)||0}s active · ${Number(s.clicks)||0} website clicks · ${Number(s.presentation_count)||0} linked presentations · Best known deck progress: ${s.best_progress==null?'Unknown':Math.round(Number(s.best_progress)*100)+'%'}</p><p class="fine">All currently linked presentations. Checked non-admin visits only; historical unchecked visits excluded. ${c?`NONE: no visits. COLD: short interaction. ACTIVE: ${Number(c.activeVisits)} visits, ${Number(c.activeSeconds)} seconds, ${Number(c.activeProgress)*100}% progress, or a website click. HOT requires at least ${Number(c.hotSignals)} signals: ${Number(c.hotVisits)} visits, ${Number(c.hotSeconds)} seconds, ${Number(c.hotProgress)*100}% progress, website click.`:'Scoring explanation unavailable.'} Signals are not identified people or a guarantee of interest. Manual priority and fit are unchanged.</p>`;
  }catch(e){if(!disposed)panel.innerHTML=`<p role="alert">${escape(e.message)}</p><button class="secondary" data-signals-retry>Retry company engagement</button>`;}
 }
 panel.onclick=e=>{if(e.target.closest('[data-signals-retry]'))load();};load();return ()=>{disposed=true;};
}
