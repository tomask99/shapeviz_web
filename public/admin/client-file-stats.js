const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value||0).toLocaleString('en');
export function mountFileStats({root,api,notify,company}) {
  let disposed=false,saving=false,generation=0;
  const pages=new Map();
  root.className='file-download-stats';
  root.innerHTML=`<div class="section-title"><div><p class="eyebrow">CLOUD STORAGE / INSIGHTS</p><h2>Download statistics.</h2></div><button class="secondary" data-refresh-stats>Refresh statistics</button></div><p class="fine">Track completed downloads from a folder and all its subfolders, including individual file links. Lifetime totals never reset automatically.</p><form class="file-tracking-form"><label>Folder link<input type="url" name="link" placeholder="Paste a Shapeviz folder link" required maxlength="1000" autocomplete="off" spellcheck="false" ${company.archived_at?'disabled':''}></label><button class="primary" ${company.archived_at?'disabled':''}>Track folder</button><p role="alert"></p></form><div data-tracked-folders aria-live="polite"></div>`;
  const list=root.querySelector('[data-tracked-folders]'),form=root.querySelector('form');
  async function renderStats(card,id,page=1){
    const version=Number(card.dataset.statsVersion||0)+1;card.dataset.statsVersion=String(version);
    const target=card.querySelector('[data-download-ranking]');
    target.innerHTML='<p class="fine" role="status">Loading downloads...</p>';
    try{
      const data=await api('client-file-download-stats',null,{companyId:company.id,trackerId:id,page});
      if(disposed||!card.isConnected||Number(card.dataset.statsVersion)!==version)return;
      pages.set(id,data.page);card.querySelector('[data-total-downloads]').textContent=number(data.tracker.total_downloads);
      target.innerHTML=data.items.length?`<div class="file-stats-table-wrap"><table class="file-stats-table"><thead><tr><th scope="col">File</th><th scope="col">Downloads</th><th scope="col">Last downloaded</th></tr></thead><tbody>${data.items.map(item=>`<tr><td><strong>${esc(item.file_name)}</strong><small>${esc(item.file_path)}</small></td><td class="download-count">${number(item.download_count)}</td><td><time datetime="${esc(item.last_download_at)}">${esc(new Date(item.last_download_at).toLocaleString())}</time></td></tr>`).join('')}</tbody></table></div>${data.page>1||data.hasMore?`<div class="actions file-stats-pagination"><button class="secondary" data-stats-page="${data.page-1}" ${data.page===1?'disabled':''}>Previous files</button><span class="fine">Page ${data.page}</span><button class="secondary" data-stats-page="${data.page+1}" ${data.hasMore?'':'disabled'}>Next files</button></div>`:''}`:'<p class="fine file-stats-empty">No completed downloads yet. Files will appear here after they are downloaded through Shapeviz.</p>';
    }catch(error){if(!disposed&&card.isConnected&&Number(card.dataset.statsVersion)===version)target.innerHTML=`<p role="alert">${esc(error.message)}</p><button class="secondary" data-stats-page="${page}">Retry statistics</button>`;}
  }
  async function load(){
    const version=++generation;
    list.innerHTML='<p class="fine" role="status">Loading tracked folders...</p>';
    try{
      const data=await api('client-file-tracking',null,{companyId:company.id});
      if(disposed||version!==generation)return;
      list.innerHTML=data.items.map(item=>`<article class="research-card tracked-folder" data-tracker="${esc(item.id)}"><div class="tracked-folder-heading"><div><span class="research-tag ${item.active&&item.connected&&item.portal_active?'research-tag-accent':''}">${!item.connected?'History saved':!item.portal_active?'Portal disabled':item.active?'Tracking active':'Tracking paused'}</span><h3>${esc(item.folder_name)}</h3><p class="fine tracked-folder-path">${esc(item.folder_path)}</p></div><div class="download-total"><strong data-total-downloads>${number(item.total_downloads)}</strong><span class="fine">completed downloads</span></div></div><p class="fine">Tracking since ${esc(new Date(item.created_at).toLocaleDateString())}. Includes subfolders.${!item.connected?' The original portal was removed or its MEGA source was replaced. These totals are preserved.':''}</p><div data-download-ranking></div>${item.connected?`<div class="actions"><button class="quiet" data-tracking-active="${!item.active}" ${company.archived_at?'disabled':''}>${item.active?'Pause tracking':'Resume tracking'}</button><span class="fine">Pausing keeps all existing counts.</span></div>`:''}<p role="alert" data-tracker-error></p></article>`).join('')||'<p class="fine">Paste a folder link above to start tracking. Earlier downloads cannot be counted retroactively.</p>';
      // Avoid a request burst when many folders have been added.
      for(const item of data.items){if(disposed||version!==generation)return;const card=[...list.querySelectorAll('[data-tracker]')].find(el=>el.dataset.tracker===item.id);await renderStats(card,item.id,pages.get(item.id)||1);}
    }catch(error){if(!disposed&&version===generation)list.innerHTML=`<p role="alert">${esc(error.message)}</p>`;}
  }
  form.onsubmit=async event=>{
    event.preventDefault();if(saving)return;saving=true;form.querySelector('button').disabled=true;form.querySelector('[role=alert]').textContent='';
    try{
      const data=await api('client-file-tracking-add',{companyId:company.id,link:form.elements.link.value});
      if(disposed)return;
      form.reset();notify(data.existing?'This folder is already tracked. Its counts were kept.':'Folder tracking enabled.');await load();
    }catch(error){if(!disposed)form.querySelector('[role=alert]').textContent=error.message;}
    finally{saving=false;if(!disposed)form.querySelector('button').disabled=!!company.archived_at;}
  };
  root.onclick=async event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.hasAttribute('data-refresh-stats'))return load();
    const card=button.closest('[data-tracker]');if(!card)return;
    if(button.hasAttribute('data-stats-page'))return renderStats(card,card.dataset.tracker,Number(button.dataset.statsPage));
    if(!button.hasAttribute('data-tracking-active'))return;
    button.disabled=true;card.querySelector('[data-tracker-error]').textContent='';
    try{await api('client-file-tracking-status',{companyId:company.id,trackerId:card.dataset.tracker,active:button.dataset.trackingActive==='true'});if(!disposed)await load();}
    catch(error){if(!disposed){card.querySelector('[data-tracker-error]').textContent=error.message;button.disabled=false;}}
  };
  void load();return()=>{disposed=true;generation++;root.onclick=null;form.onsubmit=null;};
}
