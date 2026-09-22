/** Private CRM association. Saving the deck and assigning it are separate, retryable steps. */
export function createStudioCompany(form,api) {
  const root=document.createElement('section');root.className='studio-company';
  root.innerHTML='<details><summary>CRM company (optional)</summary><p class="fine">Link to an existing lead. This does not change the client name or send the presentation.</p><label>Search CRM companies<input type="search" maxlength="160" data-company-search></label><button type="button" class="secondary" data-company-find>Find companies</button><label>CRM company<select data-company-select><option value="">No company selected</option></select></label></details><p class="fine" role="status" data-company-status></p>';
  const submit=form.querySelector('[type=submit]');(submit.closest('.actions')||submit).before(root);
  const select=root.querySelector('select'),search=root.querySelector('input'),status=root.querySelector('[role=status]'),details=root.querySelector('details');
  select.setAttribute('aria-label','CRM company');
  search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();root.querySelector('button').click();}});
  let generation=0,pending=null,linked=null,lookup=null,lookupError=null,saving=false;
  form.closest('dialog').addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  const locked=new Map();
  function lock(){for(const field of form.querySelectorAll('input,select,textarea')){if(!locked.has(field))locked.set(field,field.disabled);field.disabled=true;}}
  function unlock(){for(const [field,disabled] of locked)field.disabled=disabled;locked.clear();}
  root.querySelector('[data-company-find]').onclick=async()=>{
    if(pending)return;
    const current=++generation,button=root.querySelector('button');button.disabled=true;status.textContent='Loading companies…';
    try{
      const data=await api('crm-list',null,{q:search.value,archived:'active',sort:'name',page:1});
      if(current!==generation)return;
      const previous=select.selectedOptions[0]?.cloneNode(true);
      select.replaceChildren(new Option('No company selected',''));
      for(const company of data.companies||[])select.add(new Option(company.company_name,company.id));
      if(previous?.value){if(![...select.options].some(o=>o.value===previous.value))select.add(previous);select.value=previous.value;}
      status.textContent=data.total>25?'Showing the first 25 companies. Refine your search.':data.companies?.length?'Choose a company, or leave it unassigned.':'No matching companies.';
    }catch(error){if(current===generation)status.textContent=error.message;}
    finally{if(current===generation)button.disabled=false;}
  };
  return {
    reset({hidden=false,slug,company}={}){
      ++generation;unlock();pending=null;linked=null;lookup=null;lookupError=null;
      root.hidden=hidden;details.hidden=false;details.open=false;search.value='';select.replaceChildren(new Option('No company selected',''));status.replaceChildren();root.querySelector('button').disabled=false;
      if(company&&!hidden){select.add(new Option(company.company_name,company.id,true,true));select.value=company.id;details.open=true;status.textContent='The new presentation will be linked to this company.';}
      if(slug&&!hidden){
        const current=generation;details.hidden=true;status.textContent='Loading CRM association…';
        lookup=api('crm-presentation-company',null,{slug}).then(data=>{
          if(current!==generation)return;
          linked=data.item||null;details.hidden=!!linked;status.textContent='';
          if(linked){const link=document.createElement('a');link.href=`/admin/leads/${encodeURIComponent(linked.company_id)}?tab=presentations`;link.textContent=linked.company?.company_name||'Open linked company';status.append('Linked to ',link,'. Manage or remove the association in the company detail.');}
        }).catch(error=>{if(current===generation){lookupError=error;status.textContent='Could not load the association. Close and reopen to retry.';}});
      }
    },
    async save(task,{slug,isTemplate=false,archived=false}={}){
      saving=true;
      try{
      await lookup;
      if(lookupError)throw lookupError;
      const companyId=pending?.companyId||(!root.hidden&&!linked?select.value:'');
      if(!pending&&linked&&isTemplate)throw new Error('Remove the CRM association in the company detail before turning this presentation into a template.');
      if(!pending&&companyId&&(isTemplate||archived))throw new Error('Only non-archived client presentations can be assigned to a CRM company.');
      if(!pending){
        // task captures the form values before inputs are locked; never repeat it after a successful save.
        lock();
        let result;
        try{result=await task();}catch(error){unlock();throw error;}
        pending={result,companyId,slug:result?.project?.deck_slug||result?.url?.split('/').pop()||slug};
      }
      if(pending.companyId){
        status.textContent=`Presentation saved at /p/${pending.slug}. Linking CRM company…`;
        try{await api('crm-presentation-ensure',{companyId:pending.companyId,slug:pending.slug});}
        catch(error){throw new Error(`Presentation saved at /p/${pending.slug}, but the CRM link failed: ${error.message} Press Save again to retry only the link, or close and assign it from the company detail.`);}
      }
      return pending.result;
      }finally{saving=false;}
    }
  };
}
