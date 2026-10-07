import {esc} from './time-values.js';
import {svgIcon} from '../ui/icons.js';
import {createCloudStorageEditor} from './cloud-storage-editor.js';

export function mountCloudStorage({root,api,notify}){
 let disposed=false,sequence=0,page=1,items=[];
 const editor=createCloudStorageEditor({api,notify,onSaved:()=>{page=1;load();}});
 root.innerHTML=`<div class="page-heading"><div><p class="eyebrow">CLIENT FILES</p><h1>Cloud storage<span>.</span></h1></div><button type="button" class="primary" data-add-storage>${svgIcon('plus')} Add storage</button></div><div class="cloud-storage-list" aria-live="polite"></div>`;
 const target=root.querySelector('.cloud-storage-list');root.querySelector('[data-add-storage]').onclick=()=>editor.open();
 const portalUrl=item=>new URL('/files/'+encodeURIComponent(item.slug)+'#access='+encodeURIComponent(item.public_token),location.origin).href;
 async function load(){
  const ticket=++sequence;target.setAttribute('aria-busy','true');target.innerHTML='<p class="fine" role="status">Loading cloud storage…</p>';
  try{
   const data=await api('cloud-storage',null,{page});if(disposed||ticket!==sequence)return;items=data.items;
   if(!items.length&&page>1){page--;load();return;}
   target.innerHTML=items.length?items.map((item,index)=>`<article class="cloud-storage-card" data-storage-index="${index}"><div class="cloud-storage-symbol">${svgIcon('cloud')}</div><div class="cloud-storage-info"><h2><a class="cloud-storage-link" href="${esc(portalUrl(item))}" rel="noreferrer">${esc(item.company_name)}</a></h2><p>/files/${esc(item.slug)}${item.archived_at?' <span class="research-tag">Archived company</span>':!item.active?' <span class="research-tag">Disabled</span>':''}</p></div><div class="cloud-storage-actions"><button type="button" class="quiet" data-copy-storage>${svgIcon('copy')} Copy link</button><a class="quiet" href="${esc(portalUrl(item))}" rel="noreferrer">Open ${svgIcon('arrowUpRight')}</a><button type="button" class="quiet" data-edit-storage ${item.archived_at?'disabled':''}>${svgIcon('edit')} Edit</button></div><p class="cloud-storage-error" role="alert"></p></article>`).join(''):'<div class="research-empty cloud-storage-empty">'+svgIcon('cloud')+'<h2>No cloud storage yet.</h2><p>Connect a company’s MEGA folder to get started.</p><button type="button" class="secondary" data-add-storage>Add storage</button></div>';
   if(page>1||data.hasMore)target.insertAdjacentHTML('beforeend',`<div class="actions"><button type="button" class="secondary" data-storage-page="-1" ${page===1?'disabled':''}>Previous</button><span class="fine">Page ${page}</span><button type="button" class="secondary" data-storage-page="1" ${!data.hasMore?'disabled':''}>Next</button></div>`);
  }catch(error){if(!disposed&&ticket===sequence)target.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" class="secondary" data-retry-storage>Retry cloud storage</button>`;}
  finally{if(!disposed&&ticket===sequence)target.removeAttribute('aria-busy');}
 }
 target.onclick=async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.hasAttribute('data-add-storage'))return editor.open();
  if(button.hasAttribute('data-retry-storage'))return load();
  if(button.dataset.storagePage){page+=Number(button.dataset.storagePage);load();return;}
  const card=button.closest('[data-storage-index]'),item=items[Number(card?.dataset.storageIndex)];if(!item)return;
  if(button.hasAttribute('data-edit-storage'))return editor.open(item);
  if(button.hasAttribute('data-copy-storage')){
   button.disabled=true;card.querySelector('[role=alert]').textContent='';
   try{await navigator.clipboard.writeText(portalUrl(item));if(disposed||!button.isConnected)return;button.innerHTML=svgIcon('check')+' Copied';notify('Cloud storage link copied.');}
   catch{if(!disposed&&card.isConnected)card.querySelector('[role=alert]').textContent='Could not copy the link. Open the storage and copy the browser address.';}
   finally{if(!disposed&&button.isConnected)button.disabled=false;}
  }
 };
 load();return ()=>{disposed=true;sequence++;editor.destroy();};
}
