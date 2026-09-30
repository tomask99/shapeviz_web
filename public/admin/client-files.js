const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountClientFiles({ root, api, notify, company }) {
  let disposed=false,busy=false,portal,requestId=crypto.randomUUID();
  const dialog=document.createElement('dialog');dialog.className='crm-record-dialog';document.body.append(dialog);
  const portalUrl=item=>new URL(`/files/${item.slug}#access=${item.public_token}`,location.origin).href;
  async function load() {
    root.innerHTML='<p role="status">Loading client files…</p>';
    try {
      const data=await api('client-files',null,{companyId:company.id});
      if (disposed) return;
      portal=data.items[0];
      root.innerHTML=`<div class="section-title"><div><p class="eyebrow">CLIENT DELIVERY</p><h2>Files.</h2></div><button class="primary" data-edit-portal ${company.archived_at?'disabled':''}>${portal?'Portal settings':'Connect MEGA folder'}</button></div><p class="fine">Send the portal link to your client. Copying a file or folder link inside the portal shares only that selection.</p>${portal?`<article class="research-card file-collection"><div class="file-collection-heading"><span class="research-tag ${portal.active?'research-tag-accent':''}">${portal.active?'Portal enabled':'Portal disabled'}</span><button type="button" class="project-icon-button project-icon-delete file-collection-remove" data-delete-portal title="Remove file portal" aria-label="Remove file portal" ${company.archived_at?'disabled':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><h3>${esc(portal.title)}</h3><p class="crm-description">${esc(portal.description)}</p><p class="fine">/files/${esc(portal.slug)} · MEGA folder connected</p><a href="${esc(portalUrl(portal))}" target="_blank" rel="noopener noreferrer">Open file portal ↗</a><div class="actions"><button class="secondary" data-copy-portal>Copy portal URL</button><button class="quiet" data-toggle-portal ${company.archived_at?'disabled':''}>${portal.active?'Disable portal':'Enable portal'}</button></div><p class="fine">The complete portal URL includes a private access token. Anyone with it can browse this client's files.</p><p role="alert"></p></article>`:'<div class="research-empty"><h3>Your client’s file portal.</h3><p>Connect one dedicated MEGA folder. Its subfolders and files will appear automatically.</p></div>'}`;
    } catch(error) { if(!disposed)root.innerHTML=`<p role="alert">${esc(error.message)}</p><button class="secondary" data-retry-files>Retry files</button>`; }
  }
  function edit() {
    requestId=crypto.randomUUID();const item=portal;
    dialog.innerHTML=`<form><p class="eyebrow">SHAPEVIZ CLIENT FILES</p><h2>${item?'Portal settings':'Connect a folder'}.</h2><label>Client name<input name="title" maxlength="160" required></label><label>Files URL slug<input name="slug" maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" required autocomplete="off" spellcheck="false"></label><label>Public description<textarea name="description" rows="3" maxlength="1500"></textarea></label><label>${item?'Replace MEGA folder link':'MEGA folder link'}<input name="megaUrl" type="url" ${item?'':'required'} maxlength="250" placeholder="${item?'Leave empty to keep the connected folder':'https://mega.nz/folder/…#…'}" autocomplete="off" spellcheck="false"></label><p class="fine">${item?'Replacing the MEGA folder disables existing file and folder links. The portal URL stays the same unless you change its slug.':'Use a dedicated MEGA folder containing only files ready to share.'} File changes appear when the portal is refreshed. Files stay in MEGA.</p><p role="alert"></p><div class="actions"><button class="secondary" type="button" data-close>Cancel</button><button class="primary">${item?'Save settings':'Connect & create link'}</button></div></form>`;
    const form=dialog.querySelector('form');
    form.elements.title.value=item?.title||company.company_name;
    form.elements.slug.value=item?.slug||company.company_name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80).replace(/-$/,'');
    form.elements.description.value=item?.description||'';
    dialog.querySelector('[data-close]').onclick=()=>{if(!busy)dialog.close();};
    form.onsubmit=async event=>{
      event.preventDefault();if(busy)return;busy=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);form.querySelector('[role=alert]').textContent='';
      try {
        await api('client-files-save',{companyId:company.id,...Object.fromEntries(new FormData(form)),...(item?{id:item.id,version:item.version}:{requestId})});
        if(disposed)return;dialog.close();notify(item?'Portal settings saved.':'Client file portal connected.');await load();
      } catch(error) {if(!disposed)form.querySelector('[role=alert]').textContent=error.message;}
      finally {busy=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
    };
    dialog.showModal();
  }
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  root.onclick=async event=>{
    const button=event.target.closest('button');if(!button||busy||button.disabled)return;
    if(button.hasAttribute('data-edit-portal'))return edit();
    if(button.hasAttribute('data-retry-files'))return load();
    const deleting=button.hasAttribute('data-delete-portal');
    if(deleting&&!confirm(`Remove the file portal for “${portal.title}”? Its Shapeviz links will stop working. Files in MEGA will not be deleted.`))return;
    const card=button.closest('.file-collection');
    if(button.hasAttribute('data-copy-portal')){
      try {await navigator.clipboard.writeText(portalUrl(portal));notify('Shapeviz link copied.');}
      catch {card.querySelector('[role=alert]').textContent='Open the link and copy the address from your browser.';}return;
    }
    busy=true;
    const controls=[...card.querySelectorAll('button')].map(button=>({button,disabled:button.disabled}));
    controls.forEach(({button})=>button.disabled=true);card.setAttribute('aria-busy','true');
    card.querySelector('[role=alert]').textContent='';
    try {
      if(deleting){await api('client-files-delete',{companyId:company.id,id:portal.id,version:portal.version,confirm:'delete'});notify('File portal removed. Your MEGA files are unchanged.');}
      else if(button.hasAttribute('data-toggle-portal'))await api('client-files-status',{companyId:company.id,id:portal.id,version:portal.version,active:!portal.active});
      if(!disposed)await load();
      if(deleting&&!disposed)root.querySelector('[data-edit-portal]')?.focus();
    } catch(error) {if(!disposed)card.querySelector('[role=alert]').textContent=error.message;}
    finally {busy=false;controls.forEach(({button,disabled})=>{if(button.isConnected)button.disabled=disabled;});card.removeAttribute('aria-busy');}
  };
  load();return()=>{disposed=true;root.onclick=null;dialog.close();dialog.remove();};
}
