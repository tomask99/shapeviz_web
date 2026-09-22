// Calendar arithmetic in the browser's zone: a local day is not always 24 hours.
export function localDayBounds(now=new Date()) {
  return {today:new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString(),
    tomorrow:new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).toISOString()};
}
export function localInput(value) {
  const d=new Date(value),pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localInstant(value) {
  const d=new Date(value);
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)||!Number.isFinite(d.getTime())||localInput(d)!==value)
    throw new Error('This local time does not exist. Choose another date or time.');
  // At the autumn overlap Date chooses the first occurrence. The dialog shows the zone.
  return d.toISOString();
}
export const displayDate=value=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
export const nextActionText=item=>item?`${item.title} · ${displayDate(item.due_at)}`:'No follow-up scheduled';
