const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decimal=value=>typeof value==='string' && /^\d{1,30}(\.\d{1,2})?$/.test(value);
const count=value=>Number.isSafeInteger(value)&&value>=0;

// Aggregate totals arrive as decimal strings, avoiding JSON floating-point loss.
export function formatPipelineEUR(value,locale) {
  if(!decimal(value))throw new Error('Invalid pipeline amount.');
  const [whole,fraction='']=value.split('.');
  const digits=new Intl.NumberFormat(locale,{useGrouping:false});
  const cents=fraction.padEnd(2,'0').split('').map(d=>digits.format(Number(d))).join('');
  return new Intl.NumberFormat(locale,{style:'currency',currency:'EUR'}).formatToParts(BigInt(whole)).map(p=>p.type==='fraction'?cents:p.value).join('');
}

export function pipelineValueMarkup(value) {
  const valid=value?.currency==='EUR' && count(value.missing_count) && count(value.unknown_frequency_count) &&
    ['one_time','monthly'].every(k=>count(value[k]?.count)&&decimal(value[k]?.amount)&&(value[k].count>0||/^0+(\.0{1,2})?$/.test(value[k].amount)));
  if(!valid)return '<section class="business-value"><h3>Open pipeline estimates</h3><p class="fine" role="status">Value summary unavailable. Refresh sales to try again.</p></section>';
  return `<section class="business-value"><h3>Open pipeline estimates</h3><p class="fine">EUR estimates for non-archived Replied, Meeting and Proposal companies only. Not confirmed revenue. One-time and monthly amounts are never combined.</p><div class="business-cards business-value-cards">${[['one_time','One-time pipeline',''],['monthly','Monthly opportunities',' / month']].map(([key,title,suffix])=>`<div data-value-kind="${key}"><span>${title}</span><strong>${value[key].count?escape(formatPipelineEUR(value[key].amount)+suffix):'Not estimated'}</strong><small>${value[key].count} companies with an estimate</small></div>`).join('')}</div><p class="fine">Excluded from these sums: ${value.missing_count} without an amount; ${value.unknown_frequency_count} with an amount but frequency unspecified.</p></section>`;
}
