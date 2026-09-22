import {mountPresentations} from './crm-presentations.js';
import {createReplyRecorder} from './crm-replies.js';
import {mountEngagement} from './crm-engagement.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const events={lead_created:'Lead added',status_changed:'Pipeline status changed',lead_archived:'Lead archived',lead_restored:'Lead restored',contact_added:'Contact added',contact_updated:'Contact updated',contact_removed:'Contact removed',note_added:'Note added',note_updated:'Note updated',note_removed:'Note removed',manual_activity:'Manual activity',followup_created:'Follow-up scheduled',followup_updated:'Follow-up updated',followup_rescheduled:'Follow-up rescheduled',followup_completed:'Follow-up completed'};
const status=value=>String(value||'').toLowerCase().replaceAll('_',' ');
Object.assign(events,{presentation_assigned:'Presentation assigned',presentation_unassigned:'Presentation unassigned',presentation_sent:'Presentation sent',reply_received:'Client reply received'});
Object.assign(events,{presentation_viewed:'Presentation viewed · checked visit',website_clicked:'Website clicked · checked visit'});
events.presentation_returned='Returned to presentation · checked visit';
const field=(name,label,max=160,type='text')=>`<label>${label}<input name="${name}" type="${type}" maxlength="${max}"></label>`;
const area=(name,label,max=5000)=>`<label>${label}<textarea name="${name}" rows="5" maxlength="${max}" ${name==='content'?'required':''}></textarea></label>`;
const activity=item=>`<article class="crm-entry"><p class="fine"><time datetime="${esc(item.created_at)}">${esc(date(item.created_at))}</time></p><h3>${esc(events[item.event_type]||'Activity')}</h3>${item.event_type==='status_changed'?`<p>${esc(status(item.metadata?.from_status))} → ${esc(status(item.metadata?.to_status))}</p>`:''}${item.metadata?.name?`<p>${esc(item.metadata.name)}</p>`:''}${['manual_activity','reply_received'].includes(item.event_type)?`<p class="crm-description">${esc(item.metadata?.content)}</p>`:''}${item.event_type==='reply_received'?`<p class="fine">Received: ${esc(date(item.metadata.received_at))}${item.metadata.contact_name?` · ${esc(item.metadata.contact_name)}`:''} · Manually recorded; pipeline unchanged.</p>`:''}</article>`;

/** Mount the company tabs independently from the Leads list and company editor. */
export function mountRelations({root,company,api,notify}) {
  const overview=root.querySelector('.crm-detail-grid');
  const tabs=document.createElement('div');tabs.className='crm-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Company sections');
  const sections=['overview','contacts','presentations','notes','activity'];
  tabs.innerHTML=sections.map(s=>`<button id="crm-tab-${s}" role="tab" aria-controls="${s==='overview'?'crm-panel-overview':'crm-related-panel'}" data-tab="${s}">${s[0].toUpperCase()+s.slice(1)}</button>`).join('');
  overview.before(tabs);overview.id='crm-panel-overview';overview.setAttribute('role','tabpanel');overview.setAttribute('aria-labelledby','crm-tab-overview');
  const panel=document.createElement('section');panel.id='crm-related-panel';panel.className='crm-related-panel';panel.setAttribute('role','tabpanel');panel.hidden=true;overview.after(panel);
  const summary=document.createElement('section');summary.className='chart-panel crm-summary';overview.append(summary);
  const engagement=document.createElement('section');engagement.className='chart-panel crm-company-engagement';overview.append(engagement);
  const dialog=document.createElement('dialog');dialog.className='crm-record-dialog';dialog.setAttribute('aria-labelledby','crm-record-title');document.body.append(dialog);
  let disposed=false,seq=0,tab='overview',page=1,items=[],pending=false,cleanupPresentations,cleanupEngagement;
  const replies=createReplyRecorder({company,api,notify,onSaved:()=>{page=1;render();}});
  const read=async(kind,p=1)=>api('crm-'+kind,null,{companyId:company.id,page:p});
  function detailsContact(c) {
    return `<h3>${esc(c.full_name)}</h3>${c.primary_contact?'<span class="badge">Primary contact</span>':''}<p class="fine">${esc(c.job_title)}</p><div class="crm-contact-links">${c.email?`<a href="mailto:${encodeURIComponent(c.email)}">${esc(c.email)}</a>`:''}${c.phone?`<span>${esc(c.phone)}</span>`:''}${['linkedin','instagram'].filter(k=>/^https?:\/\//i.test(c[k])).map(k=>`<a href="${esc(c[k])}" target="_blank" rel="noopener noreferrer">${k==='linkedin'?'LinkedIn':'Instagram'}</a>`).join('')}</div>${c.notes?`<p class="crm-description">${esc(c.notes)}</p>`:''}`;
  }
  async function loadSummary(ticket) {
    summary.innerHTML='<p class="fine">Loading company summary…</p>';
    try {
      const [contacts,notes,history,reply]=await Promise.all([read('contacts'),read('notes'),read('activity'),api('crm-reply-summary',null,{companyId:company.id})]);
      if(disposed||ticket!==seq)return;
      summary.innerHTML=`<p class="eyebrow">AT A GLANCE</p><div class="crm-summary-grid"><div><h3>Contact summary</h3>${contacts.items?.[0]?detailsContact(contacts.items[0]):'<p class="fine">No contacts yet.</p>'}<button class="quiet" data-open="contacts">View contacts</button></div><div><h3>Latest note</h3><p class="crm-description">${esc(notes.items?.[0]?.content?.slice(0,300)||'No notes yet.')}</p><button class="quiet" data-open="notes">View notes</button></div><div><h3>Latest activity</h3>${history.items?.[0]?activity(history.items[0]):'<p class="fine">No activity yet.</p>'}<button class="quiet" data-open="activity">View activity</button></div></div>`;
      summary.querySelector('.crm-summary-grid').insertAdjacentHTML('beforeend',`<div><h3>Latest client reply</h3>${reply.item?`<p class="fine">Received: ${esc(date(reply.item.metadata.received_at))}${reply.item.metadata.contact_name?` · ${esc(reply.item.metadata.contact_name)}`:''}</p><p class="crm-description">${esc(reply.item.metadata.content.slice(0,300))}</p>`:'<p class="fine">No reply recorded yet.</p>'}<button class="quiet" data-record-reply ${company.archived_at?'disabled':''}>Record reply</button></div>`);
    }catch(error){if(!disposed&&ticket===seq)summary.innerHTML=`<p role="alert">${esc(error.message)}</p><button class="secondary" data-retry>Retry summary</button>`;}
  }
  async function render() {
    replies.close();
    cleanupPresentations?.();cleanupPresentations=null;
    cleanupEngagement?.();cleanupEngagement=null;
    const ticket=++seq;
    tabs.querySelectorAll('button').forEach(b=>{const selected=b.dataset.tab===tab;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
    overview.hidden=tab!=='overview';panel.hidden=tab==='overview';
    if(tab==='overview'){loadSummary(ticket);cleanupEngagement=mountEngagement({panel:engagement,company,api,onPresentations:()=>select('presentations')});return;}
    panel.setAttribute('aria-labelledby','crm-tab-'+tab);
    if(tab==='presentations'){cleanupPresentations=mountPresentations({panel,company,api,notify});return;}
    panel.innerHTML='<p role="status">Loading…</p>';
    try {
      const data=await read(tab,page);
      if(disposed||ticket!==seq)return;
      items=data.items||[];
      if(!items.length&&page>1){page--;render();return;}
      const singular=tab==='contacts'?'contact':tab==='notes'?'note':'activity';
      panel.innerHTML=`<div class="section-title"><h2>${tab[0].toUpperCase()+tab.slice(1)}</h2><button class="primary" data-add-record>Add ${singular}</button></div>`+
        (items.length?items.map(item=>{
          if(tab==='activity')return activity(item);
          return `<article class="crm-entry">${tab==='contacts'?detailsContact(item):`<p class="fine">${esc(date(item.created_at))}${item.version>1?' · Edited':''}</p><p class="crm-description">${esc(item.content)}</p>`}<div class="actions"><button class="quiet" data-edit-record="${esc(item.id)}">Edit ${singular}</button><button class="quiet" data-delete-record="${esc(item.id)}">Delete ${singular}</button></div></article>`;
        }).join(''):`<div class="empty">No ${tab} yet.</div>`)+
        `<div class="actions crm-pagination"><button class="secondary" data-record-page="-1" ${page<=1?'disabled':''}>Previous</button><span class="fine">Page ${page}</span><button class="secondary" data-record-page="1" ${!data.hasMore?'disabled':''}>Next</button></div>`;
      if(tab==='activity')panel.querySelector('.section-title').insertAdjacentHTML('beforeend',`<button class="secondary" data-record-reply ${company.archived_at?'disabled':''}>Record reply</button>`);
    }catch(error){if(!disposed&&ticket===seq)panel.innerHTML=`<p role="alert">${esc(error.message)}</p><button class="secondary" data-retry>Try again</button>`;}
  }
  function select(next,push=true) {
    if(!sections.includes(next))next='overview';
    tab=next;page=1;
    if(push){const url=new URL(location.href);url.searchParams.set('tab',tab);history.pushState(null,'',url.pathname+url.search);}
    render();
  }
  tabs.onclick=e=>{const b=e.target.closest('[data-tab]');if(b)select(b.dataset.tab);};
  tabs.onkeydown=e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const i=sections.indexOf(tab);
    const next=e.key==='Home'?0:e.key==='End'?sections.length-1:(i+(e.key==='ArrowRight'?1:sections.length-1))%sections.length;
    select(sections[next]);tabs.querySelector('[data-tab='+sections[next]+']').focus();
  };
  function edit(record=null) {
    const kind=tab==='contacts'?'contact':tab==='notes'?'note':'activity';
    dialog.innerHTML=`<form><div class="dialog-head"><h2 id="crm-record-title">${record?'Edit':'Add'} ${kind}.</h2><button type="button" data-cancel aria-label="Close">×</button></div>${kind==='contact'?`
      <label>Full name *<input name="full_name" maxlength="160" required autocomplete="name"></label>
      ${field('job_title','Position')}${field('email','Email',254,'email')}${field('phone','Phone',80,'tel')}
      ${field('linkedin','LinkedIn',2048,'url')}${field('instagram','Instagram',2048,'url')}
      <label class="check"><input name="primary_contact" type="checkbox">Primary contact</label><p class="fine">Selecting this contact replaces the current primary contact.</p>
      ${area('notes','Contact notes',3000)}` : area('content',kind==='note'?'Note':'What happened?')}
      <p role="alert" data-error></p><div class="actions"><button type="button" class="secondary" data-cancel>Cancel</button><button type="submit" class="primary">Save ${kind}</button></div></form>`;
    const form=dialog.querySelector('form');
    for(const [key,value]of Object.entries(record||{})){const field=form.elements[key];if(field){if(field.type==='checkbox')field.checked=value;else field.value=value??'';}}
    dialog.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>{if(!pending)dialog.close();});
    form.onsubmit=async e=>{
      e.preventDefault();if(pending)return;pending=true;
      const controls=[...form.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);form.querySelector('[data-error]').textContent='';
      const data=Object.fromEntries(new FormData(form));
      if(kind==='contact')data.primary_contact=form.elements.primary_contact.checked;
      try{
        await api(kind==='activity'?'crm-activity-add':`crm-${kind}-save`,{...data,companyId:company.id,...(record?{id:record.id,version:record.version}:{})});
        if(disposed)return;dialog.close();notify(`${kind[0].toUpperCase()+kind.slice(1)} saved.`);page=1;render();
      }catch(error){if(!disposed)form.querySelector('[data-error]').textContent=error.message;}
      finally{pending=false;controls.forEach(b=>b.disabled=false);}
    };
    dialog.showModal();form.querySelector('input,textarea').focus();
  }
  dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
  async function click(e) {
    if(tab==='presentations')return;
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-record-reply')){replies.open();return;}
    if(b.dataset.open){select(b.dataset.open);return;}
    if(b.hasAttribute('data-retry')){render();return;}
    if(b.hasAttribute('data-add-record')){edit();return;}
    if(b.dataset.editRecord){edit(items.find(i=>i.id===b.dataset.editRecord));return;}
    if(b.dataset.recordPage){page+=Number(b.dataset.recordPage);render();return;}
    if(b.dataset.deleteRecord) {
      const item=items.find(i=>i.id===b.dataset.deleteRecord),kind=tab==='contacts'?'contact':'note';
      if(!item||!confirm(`Delete this ${kind}? The company and activity history will stay. This cannot be undone.`))return;
      b.disabled=true;
      try{await api(`crm-${kind}-delete`,{companyId:company.id,id:item.id,version:item.version,confirm:'delete'});if(!disposed){notify(`${kind} deleted.`);render();}}
      catch(error){if(!disposed)notify(error.message);}finally{b.disabled=false;}
    }
  }
  panel.addEventListener('click',click);summary.addEventListener('click',click);
  const noteSaved=e=>{if(e.detail.companyId===company.id&&!disposed&&['overview','notes','activity'].includes(tab)){page=1;render();}};
  document.addEventListener('crm-note-saved',noteSaved);
  select(new URLSearchParams(location.search).get('tab')||'overview',false);
  return ()=>{disposed=true;seq++;document.removeEventListener('crm-note-saved',noteSaved);replies.dispose();cleanupPresentations?.();cleanupEngagement?.();dialog.close();dialog.remove();};
}
