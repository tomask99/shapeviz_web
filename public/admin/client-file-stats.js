const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value||0).toLocaleString('en');
export function mountFileStats({root,api,notify,company}) {
  let disposed=false,saving=false,generation=0;
  const pages=new Map();
  root.className='file-download-stats';
  root.innerHTML=`<div class="file-stats-heading"><h2>Downloads</h2><button class="file-stats-action" data-refresh-stats>Refresh</button></div><form class="file-tracking-form"><label class="sr-only" for="tracking-folder-link">Folder link</label><input id="tracking-folder-link" type="url" name="link" placeholder="Paste a Shapeviz folder link" required maxlength="1000" autocomplete="off" spellcheck="false" ${company.archived_at?'disabled':''}><button class="file-stats-action" ${company.archived_at?'disabled':''}>Track folder</button><p role="alert"></p></form><div data-tracked-folders aria-live="polite"></div>`;
  const list=root.querySelector('[data-tracked-folders]'),form=root.querySelector('form');
  async function renderStats(card,id,page=1,initial=null){
    const version=Number(card.dataset.statsVersion||0)+1;card.dataset.statsVersion=String(version);
    const target=card.querySelector('[data-download-ranking]');
    target.innerHTML='<p class="fine" role="status">Loading downloads...</p>';
    try{
      const data=initial||await api('client-file-download-stats',null,{companyId:company.id,trackerId:id,page});
      if(disposed||!card.isConnected||Number(card.dataset.statsVersion)!==version)return;
      pages.set(id,data.page);
      target.innerHTML=data.items.length?`<ul class="file-download-list" aria-label="File download counts">${data.items.map(item=>`<li><span class="download-name">${esc(item.file_name)}</span><span class="download-count" aria-label="${number(item.download_count)} downloads">${number(item.download_count)}</span></li>`).join('')}</ul>${data.page>1||data.hasMore?`<div class="file-stats-pagination"><button class="file-stats-action" data-stats-page="${data.page-1}" ${data.page===1?'disabled':''}>Previous files</button><span>Page ${data.page}</span><button class="file-stats-action" data-stats-page="${data.page+1}" ${data.hasMore?'':'disabled'}>Next files</button></div>`:''}`:'<p class="fine">No downloads yet.</p>';
    }catch(error){if(!disposed&&card.isConnected&&Number(card.dataset.statsVersion)===version)target.innerHTML=`<p role="alert">${esc(error.message)}</p><button class="file-stats-action" data-stats-page="${page}">Retry statistics</button>`;}
  }
  async function load(){
    const version=++generation;
    list.innerHTML='<p class="fine" role="status">Loading tracked folders...</p>';
    try{
      const data=await api('client-file-tracking',null,{companyId:company.id});
      if(disposed||version!==generation)return;
      list.innerHTML=data.items.map(item=>`<div class="tracked-folder" data-tracker="${esc(item.id)}"><div class="tracked-folder-caption"><span>${esc(item.folder_name)}${!item.connected?' / History':!item.portal_active?' / Portal disabled':!item.active?' / Paused':''}</span>${item.connected?`<button class="file-stats-action" data-tracking-active="${!item.active}" ${company.archived_at?'disabled':''}>${item.active?'Pause tracking':'Resume tracking'}</button>`:''}</div><div data-download-ranking></div><p role="alert" data-tracker-error></p></div>`).join('')||'<p class="fine">Paste a folder link to start tracking.</p>';
      // First pages arrive with the folder list; fetch only later pages. Keep
      // the fallback for an older API response during a rolling deployment.
      for(const item of data.items){if(disposed||version!==generation)return;const card=[...list.querySelectorAll('[data-tracker]')].find(el=>el.dataset.tracker===item.id),page=pages.get(item.id)||1;await renderStats(card,item.id,page,page===1?item.stats:null);}
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
