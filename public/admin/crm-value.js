export const VALUE_TYPES = ['UNKNOWN','ONE_TIME','MONTHLY'];

// Exact decimal text is sent to Postgres; never round user input silently.
export function opportunityValueInput(body) {
  if (!Object.hasOwn(body,'estimated_value') && !Object.hasOwn(body,'value_type')) return {};
  if (!Object.hasOwn(body,'estimated_value') || !VALUE_TYPES.includes(body.value_type)) throw new Error('Enter an amount and choose its value type.');
  const raw=body.estimated_value;
  if (raw===null || raw==='') return {estimated_value:null,value_type:'UNKNOWN'};
  if (!['string','number'].includes(typeof raw)) throw new Error('Enter a valid amount in EUR.');
  const value=String(raw).trim().replace(',','.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) throw new Error('Use 0–999,999,999.99 EUR with at most two decimal places.');
  const [whole,fraction='']=value.split('.');
  return {estimated_value:`${Number(whole)}.${fraction.padEnd(2,'0')}`,value_type:body.value_type};
}

export function opportunityValueText(company) {
  if (company.estimated_value===null || company.estimated_value===undefined || company.estimated_value==='') return 'Not specified';
  const amount=Number(company.estimated_value);
  if (!Number.isFinite(amount) || amount<0) return 'Not specified';
  const money=new Intl.NumberFormat(undefined,{style:'currency',currency:'EUR'}).format(amount);
  return `${money}${company.value_type==='MONTHLY'?' / month':company.value_type==='ONE_TIME'?' · one-time':' · frequency unspecified'}`;
}
