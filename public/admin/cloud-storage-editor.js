import {esc} from './time-values.js';
import {svgIcon} from '../ui/icons.js';

const slugFor=company=>{
 const base=company.company_name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70).replace(/-$/,'');
 return !base||['share','transfer','vendor','index'].includes(base)?'client-'+company.id.slice(0,8):base;
};
export function createCloudStorageEditor({api,notify,onSaved}){
 const dialog=document.createElement('dialog');dialog.className='crm-record-dialog cloud-storage-editor';dialog.setAttribute('aria-labelledby','cloud-storage-editor-title');document.body.append(dialog);
 let disposed=false,pending=false,sequence=0,current=null,companies=[],intent=null,requestId=null;
 const errorText=error=>error.message+(error.status===409?(current?' Close and reopen Edit to refresh the saved settings.':' Refresh the storage list before trying again.'):!error.status||error.status>=500?` Retry ${current?'Save':'Add storage'} to confirm the same storage.`:'');
 async function open(item=null){
  if(disposed||pending)return;current=item;intent=null;requestId=crypto.randomUUID();const ticket=++sequence;
  dialog.innerHTML=`<form><div class="dialog-head"><h2 id="cloud-storage-editor-title">${item?'Edit cloud storage.':'Add cloud storage.'}</h2><button type="button" data-close aria-label="Close cloud storage settings">${svgIcon('close')}</button></div>
   <label>Company<select name="companyId" required aria-label="Company" ${item?'disabled':''}><option value="">${item?esc(item.company_name):'Loading companies…'}</option></select></label>
   <label>${item?'Replace MEGA folder link':'MEGA folder link'}<input name="megaUrl" type="url" maxlength="250" ${item?'':'required'} autocomplete="off" spellcheck="false" placeholder="https://mega.nz/folder/…#…"></label>
   <p class="fine">${item?'Leave the link empty to keep the current folder. A replacement resets existing file and folder shares.':'Paste the full folder link, including its key. Your files stay in MEGA.'}</p>
   <details class="cloud-storage-settings"><summary>Link settings</summary><label>Storage name<input name="title" maxlength="160" required></label><label>URL slug<input name="slug" maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" required spellcheck="false"></label><label>Description<textarea name="description" rows="3" maxlength="1500"></textarea></label></details>
   <p role="alert"></p><div data-company-help></div><div class="actions"><button type="button" class="secondary" data-close>Cancel</button><button type="submit" class="primary" ${item?'':'disabled'}>${item?'Save':'Add storage'}</button></div></form>`;
  const form=dialog.querySelector('form'),submit=form.querySelector('[type=submit]'),companyField=form.elements.companyId;
  if(item){companyField.innerHTML=`<option value="${esc(item.company_id)}">${esc(item.company_name)}</option>`;form.elements.title.value=item.title;form.elements.slug.value=item.slug;form.elements.description.value=item.description||'';}
  form.addEventListener('invalid',event=>{if(event.target.closest('details'))form.querySelector('details').open=true;},true);
  dialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>{if(!pending)dialog.close();});
  companyField.onchange=()=>{const company=companies.find(c=>c.id===companyField.value);if(company){form.elements.title.value=company.company_name;form.elements.slug.value=slugFor(company);}};
  form.onsubmit=async event=>{
   event.preventDefault();if(pending)return;
   if(!intent)intent={...Object.fromEntries(new FormData(form)),companyId:current?.company_id||companyField.value,...(current?{id:current.id,version:current.version}:{requestId})};
   pending=true;dialog.dataset.dismissPending='true';form.querySelector('[role=alert]').textContent='';form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);
   try{await api('client-files-save',intent);if(disposed)return;intent=null;dialog.close();notify(current?'Cloud storage updated.':'Cloud storage connected.');onSaved();}
   catch(error){if(!disposed){form.querySelector('[role=alert]').textContent=errorText(error);if(error.status&&error.status<500){intent=null;form.querySelector('details').open=true;}}}
   finally{pending=false;if(!disposed){dialog.dataset.dismissPending='false';form.querySelectorAll('button').forEach(el=>el.disabled=false);form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=!!intent||(el===companyField&&!!current));}}
  };
  dialog.showModal();(item?form.elements.megaUrl:companyField).focus();
  if(item)return;
  async function loadCompanies(){
   try{const list=[];for(let page=1;page<=10000;page++){const data=await api('cloud-storage-companies',null,{page});if(disposed||ticket!==sequence||!dialog.open)return;list.push(...data.items);if(!data.hasMore)break;}
    companies=list.sort((a,b)=>a.company_name.localeCompare(b.company_name));companyField.innerHTML='<option value="">Select a company</option>'+companies.map(company=>`<option value="${esc(company.id)}" ${company.has_storage?'disabled':''}>${esc(company.company_name)}${company.has_storage?' — already connected':''}</option>`).join('');
    const available=companies.some(company=>!company.has_storage);submit.disabled=!available;form.querySelector('[role=alert]').textContent='';form.querySelector('[data-company-help]').innerHTML=available?'':'<p class="fine">No companies available. Add a client first, or edit an existing storage.</p><a class="quiet" href="/admin/clients">Open clients</a>';
   }catch(error){if(!disposed&&ticket===sequence&&dialog.open){companyField.innerHTML='<option value="">Companies unavailable</option>';form.querySelector('[role=alert]').textContent=error.message;form.querySelector('[data-company-help]').innerHTML='<button type="button" class="secondary" data-retry-companies>Retry companies</button>';form.querySelector('[data-retry-companies]').onclick=()=>{form.querySelector('[data-company-help]').innerHTML='';loadCompanies();};}}
  }
  loadCompanies();
 }
 dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});dialog.addEventListener('close',()=>sequence++);
 return {open,destroy(){disposed=true;sequence++;dialog.close();dialog.remove();}};
}
