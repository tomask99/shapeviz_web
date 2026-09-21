const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const duration=n=>`${Math.floor((Number(n)||0)/60)}m ${(Number(n)||0)%60}s`;
let version=0;
export async function refreshWebsiteStats(api) {
  const request=++version;
  const $=id=>document.getElementById(id), days=Number($('website-days').value);
  try {
    const stats=await api('website-stats',null,{days});
    if(request!==version)return;
    const summary=stats.summary||{};
    $('website-metrics').innerHTML=[['Website visits',summary.visits||0],['Active time',duration(summary.seconds)],['Average / visit',duration(summary.average_seconds)]].map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${escape(value)}</strong></div>`).join('');
    const rows=stats.daily||[], counts=new Map(rows.map(r=>[r.day,r])), max=Math.max(1,...rows.map(r=>Number(r.visits)));
    $('website-chart').innerHTML=Array.from({length:days},(_,i)=>{
      const date=new Date();date.setUTCDate(date.getUTCDate()-(days-1-i));
      const day=date.toISOString().slice(0,10), row=counts.get(day)||{}, visits=Number(row.visits)||0;
      const label=`${day}: ${visits} visits · ${duration(row.seconds)} active`;
      return `<button class="bar-column" type="button" aria-label="${escape(label)}" title="${escape(label)}" data-readout="${escape(label)}"><span class="bar" style="height:${visits/max*100}%"></span>${i===0 || i===days-1 || i%Math.ceil(days/6)===0 ? `<small>${day.slice(5).replace('-','/')}</small>` : ''}</button>`;
    }).join('');
    $('website-chart').scrollLeft=$('website-chart').scrollWidth;
    $('website-readout').textContent=summary.visits ? 'Hover, focus or tap a day. Daily sessions · UTC' : 'No website visits in this period yet.';
    for(const group of ['devices','sources','locations'])$('website-'+group).innerHTML=(stats[group]||[]).length ? stats[group].map(row=>`<p class="fine">${escape(row.label)} <strong>— ${Number(row.visits)||0} visits</strong></p>`).join('') : '<p class="fine">No data yet.</p>';
  } catch {
    if(request!==version)return;
    $('website-metrics').textContent='Website statistics are temporarily unavailable. Use Refresh to try again.';
    $('website-chart').replaceChildren();
    for(const group of ['devices','sources','locations'])$('website-'+group).replaceChildren();
    $('website-readout').textContent='';
  }
}
const chart=document.getElementById('website-chart');
new ResizeObserver(()=>{chart.scrollLeft=chart.scrollWidth;}).observe(chart);
for(const event of ['pointerover','focusin','click'])chart.addEventListener(event,e=>{
  const bar=e.target.closest('[data-readout]');if(bar)document.getElementById('website-readout').textContent=bar.dataset.readout;
});
