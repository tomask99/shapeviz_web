export function createClientEditor({api,notify,onSaved}){
 const dialog=document.createElement('dialog');
 dialog.className='crm-record-dialog client-editor';dialog.id='client-editor';dialog.setAttribute('aria-labelledby','client-editor-title');
 dialog.innerHTML=`<form>
  <div class="dialog-head"><h2 id="client-editor-title">Add client.</h2><button type="button" data-close aria-label="Close"><svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
  <label>Company name<input name="company_name" required maxlength="160" autocomplete="organization"></label>
  <label>Website<input name="website" maxlength="2048" inputmode="url" placeholder="example.com"></label>
  <label>What the company does<input name="industry" maxlength="120" placeholder="e.g. Furniture manufacturer"></label>
  <label>Short description<textarea name="short_description" rows="3" maxlength="3000" placeholder="A few words about the company"></textarea></label>
  <p role="alert"></p><div class="actions"><button type="button" class="secondary" data-close>Cancel</button><button type="submit" class="primary">Add client</button></div>
 </form>`;
 document.body.append(dialog);
 const form=dialog.querySelector('form'),submit=form.querySelector('[type=submit]');
 let company=null,requestId=null,pending=false,disposed=false;
 function open(record=null){
  if(disposed||pending)return;
  company=record;requestId=record?null:crypto.randomUUID();form.reset();form.querySelector('[role=alert]').textContent='';
  for(const name of ['company_name','website','industry','short_description'])form.elements[name].value=record?.[name]||'';
  form.querySelector('h2').textContent=record?'Edit client.':'Add client.';submit.textContent=record?'Save changes':'Add client';
  dialog.showModal();form.elements.company_name.focus();
 }
 dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!pending)dialog.close();});
 dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
 form.onsubmit=async e=>{
  e.preventDefault();if(pending||disposed)return;
  const fields=Object.fromEntries(new FormData(form));
  pending=true;dialog.dataset.dismissPending='true';form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);form.querySelector('[role=alert]').textContent='';
  try{
   const result=await api(company?'crm-client-update':'crm-client-create',{
    ...fields,...(company?{companyId:company.id,version:company.version}:{requestId})
   });
   if(disposed)return;
   dialog.close();notify(company?'Client updated.':'Client added.');onSaved(result);
  }catch(error){if(!disposed)form.querySelector('[role=alert]').textContent=error.message;}
  finally{pending=false;if(!disposed){dialog.dataset.dismissPending='false';form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=false);}}
 };
 return {open,destroy(){disposed=true;dialog.close();dialog.remove();}};
}
