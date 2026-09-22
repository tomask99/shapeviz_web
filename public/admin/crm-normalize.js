export function normalizedURL(value){const raw=String(value||'').trim();if(!raw)return '';const u=new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)?raw:'https://'+raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Use an http(s) company website without credentials.');u.hash='';return u.href;}
export const normalizedDomain=value=>{try{return new URL(normalizedURL(value)).hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');}catch{return '';}};
export const normalizedName=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
export const emailDomain=value=>{const s=String(value||'').trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s.split('@')[1]:'';};
