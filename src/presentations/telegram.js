// Best-effort notification, claimed atomically across serverless instances.
// Never log Telegram URLs: the bot token is part of their path.
function singleLine(value, limit=150) {
  return typeof value==='string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,limit) : '';
}

export function deviceLabel(headers) {
  const ua=singleLine(headers['user-agent'],2000);
  if(/ipad/i.test(ua))return 'iPad (tablet)';
  if(/iphone/i.test(ua))return 'iPhone (mobil)';
  if(/android/i.test(ua))return /mobile/i.test(ua) ? 'Android (mobil)' : 'Android (tablet)';
  if(/tablet/i.test(ua))return 'Tablet';
  if(/mobile/i.test(ua))return 'Mobil';
  if(/windows/i.test(ua))return 'Počítač · Windows';
  if(/macintosh|mac os/i.test(ua))return 'Počítač · macOS';
  if(/cros/i.test(ua))return 'Počítač · ChromeOS';
  if(/linux/i.test(ua))return 'Počítač · Linux';
  return 'Neznáme zariadenie';
}

export function locationLabel(headers, env) {
  // Only use platform geolocation on Vercel, never caller-supplied event data.
  if(env.VERCEL!=='1')return 'Nedostupná';
  let city=singleLine(headers['x-vercel-ip-city']);
  try{city=singleLine(decodeURIComponent(city));}catch{city='';}
  const code=singleLine(headers['x-vercel-ip-country']).toUpperCase();
  const country=/^[A-Z]{2}$/.test(code) ? new Intl.DisplayNames(['sk'],{type:'region'}).of(code) : '';
  return [city,country].filter(Boolean).join(', ') || 'Nedostupná';
}

export async function notifyPresentationOpened(event, project, {env, send=fetch, headers={}}) {
  if(event.eventType!=='session_started' || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)return;
  try {
    const query=new URLSearchParams({id:`eq.${event.sessionId}`,deck_slug:`eq.${event.deck}`,telegram_claimed_at:'is.null',select:'id'});
    const claim=await send(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/presentation_sessions?${query}`,{
      method:'PATCH',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',Prefer:'return=representation'},
      body:JSON.stringify({telegram_claimed_at:new Date().toISOString()}),signal:AbortSignal.timeout(5000)
    });
    if(!claim.ok)throw new Error('claim failed');
    const rows=await claim.json();
    if(!Array.isArray(rows) || !rows.length)return;
    const title=[singleLine(project.client,250),singleLine(project.title,250)].filter(Boolean).join(' — ') || event.deck;
    const text=`👀 Niekto otvoril tvoju prezentáciu!\n\n📊 ${title}\n📱 Zariadenie: ${deviceLabel(headers)}\n📍 Približná poloha: ${locationLabel(headers,env)}`;
    const response=await send(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN.trim()}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),
      body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text,link_preview_options:{is_disabled:true}})
    });
    const result=await response.json();
    if(!response.ok || !result.ok)throw new Error('delivery failed');
  }catch{
    // Analytics remains successful. A failed/uncertain delivery is not retried
    // automatically, preventing duplicate notifications after a timeout.
    console.warn('Telegram presentation notification failed');
  }
}

// The website insert RPC returns true only once, including concurrent retries.
export async function notifyWebsiteOpened({env, send=fetch, headers={}}) {
  if(!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)return;
  try {
    const response=await send(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN.trim()}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),
      body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,
        text:`🌐 Niekto otvoril tvoj web!\n\n✨ SHAPEVIZ\n📱 Zariadenie: ${deviceLabel(headers)}\n📍 Približná poloha: ${locationLabel(headers,env)}`,
        link_preview_options:{is_disabled:true}})
    });
    if(!response.ok || !(await response.json()).ok)throw new Error('delivery failed');
  } catch { console.warn('Telegram website notification failed'); }
}
