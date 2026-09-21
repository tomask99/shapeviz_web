// Best-effort notification, claimed atomically across serverless instances.
// Never log Telegram URLs: the bot token is part of their path.
export async function notifyPresentationOpened(event, project, {env, send=fetch}) {
  if(event.eventType!=='session_started' || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || !env.SITE_URL)return;
  try {
    const origin=new URL(env.SITE_URL);
    if(origin.protocol!=='https:')return;
    const query=new URLSearchParams({id:`eq.${event.sessionId}`,deck_slug:`eq.${event.deck}`,telegram_claimed_at:'is.null',select:'id'});
    const claim=await send(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/presentation_sessions?${query}`,{
      method:'PATCH',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',Prefer:'return=representation'},
      body:JSON.stringify({telegram_claimed_at:new Date().toISOString()}),signal:AbortSignal.timeout(5000)
    });
    if(!claim.ok)throw new Error('claim failed');
    const rows=await claim.json();
    if(!Array.isArray(rows) || !rows.length)return;
    const title=[project.client,project.title].filter(Boolean).join(' — ') || event.deck;
    const url=new URL(`/p/${encodeURIComponent(event.deck)}`,origin).href;
    const response=await send(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN.trim()}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),
      body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:`👀 Niekto otvoril tvoju prezentáciu\n\n${title.slice(0,500)}\n${url}`,link_preview_options:{is_disabled:true}})
    });
    const result=await response.json();
    if(!response.ok || !result.ok)throw new Error('delivery failed');
  }catch{
    // Analytics remains successful. A failed/uncertain delivery is not retried
    // automatically, preventing duplicate notifications after a timeout.
    console.warn('Telegram presentation notification failed');
  }
}
