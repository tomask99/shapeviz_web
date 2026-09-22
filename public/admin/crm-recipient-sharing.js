import {displayDate} from './crm-dates.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createRecipientSharing({company,api,notify}){
 const dialog=document.createElement('dialog');dialog.id='crm-share-dialog';dialog.className='crm-record-dialog';dialog.setAttribute('aria-labelledby','crm-share-title');document.body.append(dialog);
 let epoch=0,pending=false,disposed=false;
 const clear=()=>{epoch++;pending=false;const link=dialog.querySelector('[data-link]');if(link)link.value='';dialog.onclick=null;dialog.replaceChildren();};
 dialog.addEventListener('close',clear);dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
 function open(item){
  if(disposed||dialog.open)return;const life=++epoch;let page=1,rows=[],contactPage=0,contactsLoading=false,listSeq=0,created=false;
  const alive=()=>!disposed&&epoch===life&&dialog.open;
  const writable=!company.archived_at&&item.project?.status==='published'&&!item.project?.is_template;
  const read=(action,params={})=>api(action,null,{companyId:company.id,...params});
  dialog.innerHTML=`<div class="dialog-head"><h2 id="crm-share-title">Share / recipients.</h2><button type="button" data-close aria-label="Close">×</button></div><p>${esc(item.project?.title||item.deck_slug)}</p>
   <p class="fine">No email is sent here. Activity belongs to a link, not a verified person; forwarded links keep the original attribution.</p>
   <label>General presentation link<input readonly data-general></label><button class="secondary" data-copy-general>Copy general link</button>
   <form data-create><h3>Create recipient link</h3><label>Recipient type<select name="mode"><option value="contact">Existing contact</option><option value="adhoc">Ad-hoc recipient</option></select></label>
   <div data-contact-fields><label>Contact<select name="contact_id" aria-label="Contact"><option value="">Choose contact…</option></select></label><button type="button" class="quiet" data-contacts>Load contacts</button><a class="quiet" href="/admin/leads/${encodeURIComponent(company.id)}?tab=contacts">Manage / add contacts</a></div>
   <div data-adhoc hidden><label>Recipient name<input name="name" maxlength="160"></label><label>Email (optional)<input name="email" type="email" maxlength="254"></label></div>
   <p class="fine">The full link is shown only once. Copy it before closing. If creation fails with an uncertain result, refresh recipients before generating another link.</p><button class="primary" type="submit">Generate tracked link</button></form>
   <p role="alert" data-error></p><div data-created hidden><label>New tracked link<input readonly data-link></label><button class="primary" data-copy>Copy tracked link</button><button class="quiet" data-another>Create another recipient</button></div>
   <div class="section-title"><h3>Recipients</h3><button class="quiet" data-refresh>Refresh recipients</button></div><div data-list></div>`;
  const form=dialog.querySelector('form'),error=dialog.querySelector('[data-error]'),target=dialog.querySelector('[data-list]');
  dialog.querySelector('[data-general]').value=new URL('/p/'+encodeURIComponent(item.deck_slug),location.origin).href;
  const syncForm=()=>{form.querySelectorAll('input,select,button').forEach(el=>el.disabled=!writable||pending||created||contactsLoading);};
  form.elements.mode.onchange=()=>{const contact=form.elements.mode.value==='contact';dialog.querySelector('[data-contact-fields]').hidden=!contact;dialog.querySelector('[data-adhoc]').hidden=contact;form.elements.name.required=!contact;form.elements.contact_id.required=contact;};form.elements.mode.onchange();
  async function contacts(){
   if(contactsLoading||pending)return;contactsLoading=true;syncForm();const button=dialog.querySelector('[data-contacts]');
   try{const d=await read('crm-contacts',{page:contactPage+1});if(!alive())return;const existing=new Set([...form.elements.contact_id.options].map(o=>o.value));d.items.forEach(c=>{if(!existing.has(c.id))form.elements.contact_id.add(new Option(c.full_name,c.id));});contactPage++;button.hidden=!d.hasMore;button.textContent='Load more contacts';}
   catch(e){if(alive()){error.textContent=e.message;button.hidden=false;button.textContent='Retry contacts';}}
   finally{if(alive()){contactsLoading=false;syncForm();}}
  }
  async function load(){
   const ticket=++listSeq;target.textContent='Loading recipients…';
   try{const d=await read('crm-recipients',{associationId:item.id,page});if(!alive()||ticket!==listSeq)return;rows=d.items;
    if(!rows.length&&page>1){page--;return load();}
    target.innerHTML=rows.map((r,i)=>`<article class="crm-entry" data-recipient="${i}"><h3>${esc(r.recipient_name)}</h3><p class="fine">${esc(r.recipient_email)}</p><p>${r.revoked_at?'Revoked':r.sent_at?'Sent '+esc(displayDate(r.sent_at)):'Not marked sent'}</p><div class="actions">${!r.revoked_at&&!r.sent_at&&writable?`<button class="secondary" data-sent="${i}">Mark recipient sent</button>`:''}${!r.revoked_at?`<button class="quiet" data-revoke="${i}">Revoke link</button>`:''}</div><label>Analytics period<select data-days><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select></label><button class="secondary" data-stats="${i}">Show recipient analytics</button><div data-stats-output aria-live="polite"></div></article>`).join('')||'<p class="fine">No recipient links yet.</p>';
    target.insertAdjacentHTML('beforeend',`<div class="actions"><button class="quiet" data-page="-1" ${page<=1?'disabled':''}>Previous recipients</button><span class="fine">Page ${page}</span><button class="quiet" data-page="1" ${!d.hasMore?'disabled':''}>Next recipients</button></div>`);
   }catch(e){if(alive()&&ticket===listSeq)target.innerHTML=`<p role="alert">${esc(e.message)}</p><button class="quiet" data-refresh>Retry recipients</button>`;}
  }
  async function copy(input){try{await navigator.clipboard.writeText(input.value);if(alive())notify('Link copied.');}catch{if(alive()){input.focus();input.select();error.textContent='Copy the selected link manually (Ctrl/Cmd+C).';}}}
  form.onsubmit=async e=>{
   e.preventDefault();if(pending||created||contactsLoading||!writable)return;error.textContent='';pending=true;syncForm();
   const body={companyId:company.id,associationId:item.id,...(form.elements.mode.value==='contact'?{contact_id:form.elements.contact_id.value}:{name:form.elements.name.value,email:form.elements.email.value})};
   try{const d=await api('crm-recipient-create',body);if(!alive())return;created=true;dialog.querySelector('[data-link]').value=new URL(d.url,location.origin).href;dialog.querySelector('[data-created]').hidden=false;page=1;await load();}
   catch(e){if(alive())error.textContent=e.message+' Refresh recipients to check whether a link was created before retrying.';}
   finally{if(alive()){pending=false;syncForm();}}
  };
  dialog.onclick=async e=>{
   const b=e.target.closest('button');if(!b||pending)return;
   if(b.hasAttribute('data-close')){dialog.close();return;}
   if(b.hasAttribute('data-contacts'))contacts();
   if(b.hasAttribute('data-copy'))copy(dialog.querySelector('[data-link]'));
   if(b.hasAttribute('data-copy-general'))copy(dialog.querySelector('[data-general]'));
   if(b.hasAttribute('data-another')){created=false;dialog.querySelector('[data-created]').hidden=true;dialog.querySelector('[data-link]').value='';form.reset();form.elements.mode.onchange();syncForm();}
   if(b.hasAttribute('data-refresh'))load();
   if(b.dataset.page){page+=Number(b.dataset.page);load();}
   if(b.hasAttribute('data-stats')){
    const r=rows[Number(b.dataset.stats)],card=b.closest('article'),out=card.querySelector('[data-stats-output]'),select=card.querySelector('[data-days]'),ticket=listSeq;b.disabled=true;select.disabled=true;out.textContent='Loading analytics…';
    try{const {stats:s}=await read('crm-recipient-stats',{id:r.id,days:select.value});if(!alive()||ticket!==listSeq)return;if(!s||!Number.isFinite(s.visits))throw new Error('Analytics unavailable.');out.innerHTML=`<p>${Number(s.visits)} checked visits · ${Number(s.seconds)}s active · ${Number(s.slides_viewed)} distinct slides${s.slide_count?' / '+Number(s.slide_count):''} · ${Number(s.website_clicks)} website clicks</p><p class="fine">Last visit in period: ${s.last_viewed_at?esc(displayDate(s.last_viewed_at)):'None'}. Session start dates define this period. ${s.analytics_enabled?'':'Tracking is currently disabled; historical data is retained.'}</p>`;}
    catch(e){if(alive()&&ticket===listSeq)out.innerHTML=`<p role="alert">${esc(e.message)} Use Show recipient analytics to retry.</p>`;}
    finally{if(alive()&&ticket===listSeq){b.disabled=false;select.disabled=false;}}return;
   }
   const action=b.hasAttribute('data-sent')?'sent':b.hasAttribute('data-revoke')?'revoke':null;if(!action)return;const r=rows[Number(b.dataset[action])];
   if(!confirm(action==='sent'?'Record this recipient link as sent now? No email will be sent.':'Revoke this link permanently? Existing analytics and the general presentation link remain available.'))return;
   pending=true;b.disabled=true;syncForm();error.textContent='';
   try{await api('crm-recipient-'+action,{companyId:company.id,id:r.id,...(action==='sent'?{sent_at:new Date().toISOString()}:{})});if(alive())await load();}
   catch(e){if(alive())error.textContent=e.message;}
   finally{if(alive()){pending=false;b.disabled=false;syncForm();}}
  };
  dialog.showModal();syncForm();contacts();load();
 }
 return {open,dispose(){disposed=true;clear();dialog.close();dialog.remove();}};
}
