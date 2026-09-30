const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountClientFiles({ root, api, notify, company }) {
  let disposed=false,busy=false,portal,links=[],page=1,hasMore=false,requestId=crypto.randomUUID();
  const dialog=document.createElement('dialog');dialog.className='crm-record-dialog';document.body.append(dialog);
  const portalUrl=item=>new URL(`/files/${item.slug}#access=${item.public_token}`,location.origin).href;
  const linkUrl=item=>new URL('/files/share/'+item.token,location.origin).href;
  async function load() {
    root.innerHTML='<p role="status">Loading client files…</p>';
    try {
      const data=await api('client-files',null,{companyId:company.id});
      if (disposed) return;
      portal=data.items[0];
      const shares=portal?await api('client-file-links',null,{companyId:company.id,page}):{items:[],hasMore:false};
      if (disposed) return;
      links=shares.items;hasMore=shares.hasMore;
      root.innerHTML=`<div class="section-title"><div><p class="eyebrow">CLIENT DELIVERY</p><h2>Files.</h2></div><button class="primary" data-edit-portal ${company.archived_at?'disabled':''}>${portal?'Portal settings':'Connect MEGA folder'}</button></div><p class="fine">Send the portal link to your client. Copying a file or folder link inside the portal shares only that selection.</p>${portal?`<article class="research-card file-collection"><span class="research-tag ${portal.active?'research-tag-accent':''}">${portal.active?'Portal enabled':'Portal disabled'}</span><h3>${esc(portal.title)}</h3><p class="crm-description">${esc(portal.description)}</p><p class="fine">/files/${esc(portal.slug)} · MEGA folder connected</p><a href="${esc(portalUrl(portal))}" target="_blank" rel="noopener noreferrer">Open file portal ↗</a><div class="actions"><button class="secondary" data-copy-portal>Copy portal URL</button><button class="quiet" data-toggle-portal ${company.archived_at?'disabled':''}>${portal.active?'Disable portal':'Enable portal'}</button></div><p class="fine">The complete portal URL includes a private access token. Anyone with it can browse this client's files.</p><p role="alert"></p></article><div class="section-title"><div><h3>Shared files & folders</h3><p class="fine">Names shown as originally shared. Disabling a folder link also disables access through links created from it.</p></div><button class="quiet" data-retry-files>Refresh links</button></div><div class="file-share-list">${links.map((item,i)=>{
        const available=portal.active&&item.enabled&&item.source_version===portal.source_version&&item.ancestors_enabled!==false;
        const state=!item.enabled?'Disabled':item.source_version!==portal.source_version?'Source replaced':!portal.active?'Portal disabled':item.ancestors_enabled===false?'Parent link disabled':'Enabled';
        return `<article class="research-card" data-share="${i}"><div><span class="research-tag ${available?'research-tag-accent':''}">${state}</span><h4>${esc(item.name)}</h4><p class="fine">${item.type==='folder'?'Folder':'File'} · ${esc(new Date(item.created_at).toLocaleDateString())}</p></div><div class="actions"><a class="quiet" href="${esc(linkUrl(item))}" target="_blank" rel="noopener noreferrer">Open ↗</a><button class="secondary" data-copy-share>Copy link</button><button class="quiet" data-disable-share ${!item.enabled||company.archived_at?'disabled':''}>Disable link</button></div><p role="alert"></p></article>`;
      }).join('')||'<p class="fine">No shared links yet. Open the portal and use Copy link on a file or folder.</p>'}</div>${page>1||hasMore?`<div class="actions"><button class="secondary" data-page="${page-1}" ${page===1?'disabled':''}>Previous</button><span>Page ${page}</span><button class="secondary" data-page="${page+1}" ${!hasMore?'disabled':''}>Next</button></div>`:''}`:'<div class="research-empty"><h3>Your client’s file portal.</h3><p>Connect one dedicated MEGA folder. Its subfolders and files will appear automatically.</p></div>'}`;
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
    if(button.hasAttribute('data-page')){page=Number(button.dataset.page);return load();}
    const card=button.closest('[data-share]')||button.closest('.file-collection'),item=links[Number(card?.dataset.share)];
    if(button.hasAttribute('data-copy-portal')||button.hasAttribute('data-copy-share')){
      try {await navigator.clipboard.writeText(button.hasAttribute('data-copy-portal')?portalUrl(portal):linkUrl(item));notify('Shapeviz link copied.');}
      catch {card.querySelector('[role=alert]').textContent='Open the link and copy the address from your browser.';}return;
    }
    busy=true;button.disabled=true;
    try {
      if(button.hasAttribute('data-toggle-portal'))await api('client-files-status',{companyId:company.id,id:portal.id,version:portal.version,active:!portal.active});
      if(button.hasAttribute('data-disable-share'))await api('client-file-link-disable',{companyId:company.id,id:item.id,version:item.version});
      if(!disposed)await load();
    } catch(error) {if(!disposed)card.querySelector('[role=alert]').textContent=error.message;}
    finally {busy=false;button.disabled=false;}
  };
  load();return()=>{disposed=true;root.onclick=null;dialog.close();dialog.remove();};
}
