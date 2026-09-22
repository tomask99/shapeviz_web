import {localInput,localInstant,displayDate} from './crm-dates.js';
import {engagementMarkup} from './crm-engagement.js';
import {createRecipientSharing} from './crm-recipient-sharing.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arrow='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';

/** Company-local presentation associations. Never embeds a deck in this admin tab. */
export function mountPresentations({panel,company,api,notify}) {
  let disposed=false,seq=0,page=1,items=[],pending=false,dialogSeq=0;
  const dialog=document.createElement('dialog');dialog.className='crm-record-dialog';dialog.id='crm-presentation-dialog';document.body.append(dialog);
  const read=(action,params={})=>api(action,null,{companyId:company.id,...params});
  const sharing=createRecipientSharing({company,api,notify});
  const clones=new Map();
  async function load(){
    const ticket=++seq;panel.innerHTML='<p role="status">Loading presentations…</p>';
    try{
      const data=await read('crm-presentations',{page});if(disposed||ticket!==seq)return;
      items=data.items;
      if(!items.length&&page>1){page--;load();return;}
      panel.innerHTML=`<div class="section-title"><h2>Presentations</h2><button class="primary" data-link-deck ${company.archived_at?'disabled':''}>Assign presentation</button></div>
        <p class="fine">Assign a finished deck, not a reusable template. Marking sent records a past action; it does not send an email or change the pipeline.</p>
        <div class="actions"><button class="secondary" data-create-company-deck ${company.archived_at?'disabled':''}>Create from template</button><button class="secondary" data-upload-company-deck ${company.archived_at?'disabled':''}>Upload finished presentation</button></div><p role="alert" data-presentation-error></p>`+
        (items.length?items.map(item=>{
          const p=item.project;
          return `<article class="crm-entry" data-presentation-link="${esc(item.id)}"><h3>${esc(p?.title||'Presentation unavailable')}</h3><p class="fine">${esc(p?.client||'')} · /p/${esc(item.deck_slug)}</p>
          <span class="badge">${esc(p?.status||'Unavailable')}</span><p class="fine">Assigned ${esc(displayDate(item.created_at))}</p>
          <p>${item.sent_at?`Sent ${esc(displayDate(item.sent_at))}${item.contact?' · '+esc(item.contact.full_name):''}`:'Not marked sent'}</p>
          <div class="actions">${p?.status==='published'&&!p.is_template?`<a class="secondary" href="/p/${encodeURIComponent(item.deck_slug)}" target="_blank" rel="noopener noreferrer">Open presentation ${arrow}</a>`:''}
          ${!item.sent_at?`<button class="primary" data-mark-sent="${esc(item.id)}" ${company.archived_at||p?.status!=='published'||p?.is_template?'disabled':''}>Mark sent</button>`:''}
          <button class="secondary" data-share="${esc(item.id)}">Share / recipients</button><button class="quiet" data-clone="${esc(item.id)}" ${company.archived_at?'disabled':''}>Duplicate as new version</button><button class="quiet" data-unlink-deck="${esc(item.id)}" ${company.archived_at?'disabled':''}>Unassign</button></div>
          <div class="crm-engagement-controls"><label>Analytics period<select data-analytics-days="${esc(item.id)}"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select></label><button class="secondary" data-deck-analytics="${esc(item.id)}">Show analytics</button></div>
          <div data-engagement="${esc(item.id)}" aria-live="polite"></div></article>`;
        }).join(''):'<div class="empty">No presentations assigned yet.</div>')+
        `<div class="actions crm-pagination"><button class="secondary" data-deck-page="-1" ${page<=1?'disabled':''}>Previous</button><span class="fine">Page ${page}</span><button class="secondary" data-deck-page="1" ${!data.hasMore?'disabled':''}>Next</button></div><button class="quiet" data-deck-refresh>Refresh presentations</button>`;
    }catch(e){if(!disposed&&ticket===seq)panel.innerHTML=`<p role="alert">${esc(e.message)}</p><button class="secondary" data-deck-refresh>Try again</button>`;}
  }
  function cancelButtons(){dialog.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>{if(!pending){dialog.close();dialogSeq++;}});}
  async function catalog(){
    const ticket=++dialogSeq;let catalogPage=1,query='',searchSeq=0;
    dialog.setAttribute('aria-labelledby','crm-assign-title');
    dialog.innerHTML='<div class="dialog-head"><h2 id="crm-assign-title">Assign presentation.</h2><button type="button" data-cancel aria-label="Close">×</button></div><form data-catalog-search><label>Search presentations<input name="q" type="search" maxlength="160" placeholder="Client, title or URL name"></label><button class="secondary" type="submit">Search</button></form><p class="fine">Existing presentations only. One presentation can belong to one company.</p><p role="alert" data-error></p><div data-catalog-results></div>';
    const alive=()=>!disposed&&ticket===dialogSeq&&dialog.open;
    cancelButtons();dialog.showModal();dialog.querySelector('input').focus();
    async function search(){
      const turn=++searchSeq,target=dialog.querySelector('[data-catalog-results]');target.textContent='Loading…';
      try{
        const data=await read('crm-presentation-catalog',{q:query,page:catalogPage});if(!alive()||turn!==searchSeq)return;
        target.innerHTML=(data.items.length?data.items.map(p=>`<article class="crm-entry"><h3>${esc(p.title)}</h3><p class="fine">${esc(p.client)} · ${esc(p.status)} · /p/${esc(p.deck_slug)}</p><button class="primary" data-assign-slug="${esc(p.deck_slug)}">Assign this presentation</button></article>`).join(''):'<p class="empty">No available presentations. Create a client deck first or adjust the search.</p>')+`<div class="actions"><button class="secondary" data-catalog-page="-1" ${catalogPage<=1?'disabled':''}>Previous</button><span class="fine">Page ${catalogPage}</span><button class="secondary" data-catalog-page="1" ${!data.hasMore?'disabled':''}>Next</button></div>`;
      }catch(e){if(alive()&&turn===searchSeq){dialog.querySelector('[data-error]').textContent=e.message;target.innerHTML='<button class="secondary" data-catalog-retry>Try again</button>';}}
    }
    dialog.querySelector('form').onsubmit=e=>{e.preventDefault();if(pending)return;query=e.target.elements.q.value;catalogPage=1;search();};
    dialog.onclick=async e=>{
      const b=e.target.closest('button');if(!b||pending)return;
      if(b.dataset.catalogPage){catalogPage+=Number(b.dataset.catalogPage);search();}
      if(b.hasAttribute('data-catalog-retry'))search();
      if(!b.dataset.assignSlug)return;
      pending=true;const controls=[...dialog.querySelectorAll('button,input')].map(e=>({e,disabled:e.disabled}));controls.forEach(({e})=>e.disabled=true);
      try{await api('crm-presentation-assign',{companyId:company.id,slug:b.dataset.assignSlug});if(!alive())return;dialog.close();notify('Presentation assigned.');await load();}
      catch(e){if(alive())dialog.querySelector('[data-error]').textContent=e.message;}
      finally{pending=false;if(alive())controls.forEach(({e,disabled})=>e.disabled=disabled);}
    };
    search();
  }
  async function markSent(item){
    const ticket=++dialogSeq;let contactPage=0,loading=false;
    dialog.onclick=null;dialog.setAttribute('aria-labelledby','crm-sent-title');
    dialog.innerHTML=`<form><div class="dialog-head"><h2 id="crm-sent-title">Record presentation sent.</h2><button type="button" data-cancel aria-label="Close">×</button></div><p>${esc(item.project?.title||item.deck_slug)}</p><p class="fine">This only records an action you already performed. No email is sent.</p><label>Sent date and time *<input name="sent_at" type="datetime-local" required></label><p class="fine">Local time: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}. Repeated autumn times use the first occurrence.</p><label>Sent to contact (optional)<select name="contact_id"><option value="">No contact specified</option></select></label><button type="button" class="quiet" data-contact-more hidden>Load more contacts</button><p role="alert" data-error></p><div class="actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="primary" type="submit">Record sent</button></div></form>`;
    const form=dialog.querySelector('form'),alive=()=>!disposed&&ticket===dialogSeq&&dialog.open;
    form.elements.sent_at.value=localInput(new Date());cancelButtons();dialog.showModal();form.elements.sent_at.focus();
    async function contacts(){
      loading=true;form.querySelector('[type=submit]').disabled=true;const more=form.querySelector('[data-contact-more]');more.disabled=true;
      try{const data=await read('crm-contacts',{page:contactPage+1});if(!alive())return;data.items.forEach(c=>form.elements.contact_id.add(new Option(c.full_name,c.id)));contactPage++;more.hidden=!data.hasMore;}
      catch(e){if(alive()){form.querySelector('[data-error]').textContent=e.message;more.hidden=false;}}
      finally{loading=false;if(alive()){form.querySelector('[type=submit]').disabled=false;more.disabled=false;}}
    }
    form.querySelector('[data-contact-more]').onclick=contacts;
    form.onsubmit=async e=>{
      e.preventDefault();if(pending||loading)return;
      const error=form.querySelector('[data-error]');error.textContent='';let sent_at;
      try{sent_at=localInstant(form.elements.sent_at.value);}catch(e){error.textContent=e.message;return;}
      const contact_id=form.elements.contact_id.value||null;pending=true;form.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);
      try{await api('crm-presentation-sent',{companyId:company.id,id:item.id,version:item.version,sent_at,contact_id});if(!alive())return;dialog.close();notify('Presentation marked sent.');await load();}
      catch(e){if(alive())error.textContent=e.message;}
      finally{pending=false;if(alive())form.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);}
    };
    contacts();
  }
  async function analytics(item,button){
    const ticket=seq,card=button.closest('[data-presentation-link]'),target=card.querySelector('[data-engagement]'),select=card.querySelector('select'),days=Number(select.value);
    button.disabled=true;select.disabled=true;target.textContent='Loading analytics…';
    try{
      const {stats}=await read('crm-presentation-stats',{id:item.id,days});if(disposed||ticket!==seq)return;
      target.innerHTML=engagementMarkup(stats,item.project,days);
    }catch(e){if(!disposed&&ticket===seq)target.innerHTML=`<p role="alert">${esc(e.message)} Use Show analytics to retry.</p>`;}
    finally{if(!disposed&&ticket===seq){button.disabled=false;select.disabled=false;}}
  }
  async function click(e){
    const b=e.target.closest('button');if(!b||pending)return;
    if(b.hasAttribute('data-link-deck'))catalog();
    if(b.hasAttribute('data-deck-refresh'))load();
    if(b.dataset.deckPage){page+=Number(b.dataset.deckPage);load();}
    const item=items.find(i=>i.id===(b.dataset.markSent||b.dataset.unlinkDeck||b.dataset.deckAnalytics||b.dataset.share||b.dataset.clone));if(!item)return;
    if(b.dataset.clone){let data=clones.get(item.id);if(!data){const title=prompt('Title of the new draft version',item.project?.title+' v2');if(title===null)return;data={companyId:company.id,source:item.deck_slug,slug:item.deck_slug.slice(0,70)+'-v-'+crypto.randomUUID().slice(0,8),title};clones.set(item.id,data);}pending=true;b.disabled=true;try{const result=await api('clone-presentation',data);clones.delete(item.id);notify('New draft version: '+result.url+'. Publish it from Presentation Studio when ready.');await load();}catch(e){if(!disposed)panel.querySelector('[data-presentation-error]').textContent=e.message+' Retry this button to finish the same version.';}finally{pending=false;b.disabled=false;}return;}
    if(b.dataset.share)sharing.open(item);
    if(b.dataset.markSent)markSent(item);
    if(b.dataset.deckAnalytics)analytics(item,b);
    if(b.dataset.unlinkDeck){
      if(!confirm('Remove this company association? The presentation, its files, analytics and existing company history will remain.'))return;
      pending=true;b.disabled=true;
      try{await api('crm-presentation-unassign',{companyId:company.id,id:item.id,version:item.version,confirm:'unlink'});if(!disposed){notify('Association removed. Presentation retained.');await load();}}
      catch(e){if(!disposed)panel.querySelector('[data-presentation-error]').textContent=e.message;}
      finally{pending=false;b.disabled=false;}
    }
  }
  dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
  const createClick=e=>{const b=e.target.closest('[data-create-company-deck],[data-upload-company-deck]');if(b)document.dispatchEvent(new CustomEvent('crm-create-presentation',{detail:{companyId:company.id,mode:b.hasAttribute('data-upload-company-deck')?'upload':'template'}}));};panel.addEventListener('click',createClick);
  panel.addEventListener('click',click);load();
  return ()=>{disposed=true;seq++;dialogSeq++;sharing.dispose();panel.removeEventListener('click',createClick);panel.removeEventListener('click',click);dialog.close();dialog.remove();};
}
