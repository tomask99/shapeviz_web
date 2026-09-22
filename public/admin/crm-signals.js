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
  try{const {signals:s}=await api('crm-signals',null,{companyId:company.id});if(disposed)return;if(!s?.engagement)throw new Error('Company engagement unavailable.');
   panel.innerHTML=`<p class="eyebrow">COMPANY ENGAGEMENT · 30 DAYS</p><h2>${escape(s.engagement)}</h2><p>${signalSummary(s)}</p><p>${Number(s.seconds)||0}s active · ${Number(s.clicks)||0} website clicks · ${Number(s.presentation_count)||0} linked presentations</p><p class="fine">All currently linked presentations. New visits with admin-exclusion checks only; historical unchecked visits are excluded. HOT: 3 visits, 180 active seconds or a website click. ACTIVE: at least 1 visit. Signals are not identified people or a guarantee of interest. Manual priority is unchanged.</p>`;
  }catch(e){if(!disposed)panel.innerHTML=`<p role="alert">${escape(e.message)}</p><button class="secondary" data-signals-retry>Retry company engagement</button>`;}
 }
 panel.onclick=e=>{if(e.target.closest('[data-signals-retry]'))load();};load();return ()=>{disposed=true;};
}
