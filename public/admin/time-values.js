// Shared validation/formatting. Money arithmetic uses integer cents and BigInt.
export function rateCents(value) {
 const text=String(value??'').trim().replace(',','.');
 if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(text))throw new Error('Enter a positive hourly rate with at most two decimal places.');
 const [whole,fraction='']=text.split('.'),cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(cents<=0||cents>999999999)throw new Error('Hourly rate must be between EUR 0.01 and EUR 9,999,999.99.');
 return cents;
}
export function durationSeconds(value) {
 const text=String(value??'').trim().replace(',','.');
 if(!/^\d{1,2}(?:\.\d{1,4})?$/.test(text))throw new Error('Enter hours as a decimal, for example 2.5 (maximum four decimal places).');
 const [whole,fraction='']=text.split('.'),units=BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));
 const seconds=Number((units*3600n+5000n)/10000n);
 if(seconds<1||units>240000n)throw new Error('Duration must be at least one second and at most 24 hours.');
 return seconds;
}
export function earnedCents(seconds,cents){return ((BigInt(Math.floor(seconds))*BigInt(cents)+1800n)/3600n).toString();}
export function durationParts(hours,minutes,seconds=0){
 const parts=[hours,minutes,seconds].map(v=>String(v??'').trim());
 if(parts.some(v=>!/^\d{1,2}$/.test(v)))throw new Error('Enter whole hours and minutes.');
 const [h,m,s]=parts.map(Number),total=h*3600+m*60+s;
 if(h>24||m>59||s>59||total<1||total>86400)throw new Error('Enter a duration between one second and 24 hours. Minutes must be between 0 and 59.');
 return total;
}
export function euro(cents){const n=BigInt(cents??0);return '€'+(n/100n).toLocaleString('en-GB')+'.'+String(n%100n).padStart(2,'0');}
export function clockTime(seconds){const n=Math.max(0,Math.floor(Number(seconds)||0));return [Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(v=>String(v).padStart(2,'0')).join(':');}
export const timeZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Bratislava';
export function localDate(value=new Date(),zone=timeZone()){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(value);}
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
