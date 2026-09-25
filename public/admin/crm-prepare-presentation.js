const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createPreparePresentation({api,notify,onPrepared}) {
  const dialog=document.createElement('dialog');dialog.className='crm-record-dialog';dialog.id='crm-prepare-presentation';document.body.append(dialog);
  const attempts=new Map();let busy=false,generation=0;
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  async function open(companyId){
    if(busy)return;
    const ticket=++generation;
    dialog.setAttribute('aria-labelledby','prepare-title');
    dialog.innerHTML='<div class="dialog-head"><h2 id="prepare-title">Prepare presentation</h2><button type="button" data-close aria-label="Close">×</button></div><p role="status">Loading company and templates…</p><p role="alert" data-error></p>';
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();
    const alive=()=>ticket===generation&&dialog.open;
    try{
      const [{company},{projects}]=await Promise.all([api('crm-detail',null,{id:companyId}),api('list')]);
      if(!alive())return;
      if(company.archived_at)throw new Error('Restore this company first.');
      const templates=projects.filter(p=>(p.is_template||p.source_type==='template')&&p.status!=='archived');
      const previous=attempts.get(companyId);
      dialog.innerHTML=`<form><div class="dialog-head"><h2 id="prepare-title">Prepare presentation</h2><button type="button" data-close aria-label="Close">×</button></div>
        <label>Company<input value="${esc(company.company_name)}" readonly></label>
        <label>Template<select name="template" aria-label="Template" required><option value="">Select a template…</option>${templates.map(p=>`<option value="${esc(p.deck_slug)}">${esc(p.client)} — ${esc(p.title)}</option>`).join('')}</select></label>
        <p class="fine">The company name will be filled in automatically. The presentation will be published, linked to this company and the lead moved to Presentation ready.</p>
        ${!templates.length?'<p>No templates available. Add a template in Presentation Studio first.</p>':''}
        <p role="alert" data-error></p><div class="actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">${previous?'Retry preparation':'Prepare presentation'}</button></div></form>`;
      const form=dialog.querySelector('form'),select=form.elements.template,submit=form.querySelector('[type=submit]');
      if(previous){if(![...select.options].some(o=>o.value===previous.template))select.add(new Option('Previously selected template',previous.template));select.value=previous.template;}
      select.disabled=!!previous||!templates.length;submit.disabled=!previous&&!templates.length;
      form.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>{if(!busy)dialog.close();});
      form.onsubmit=async event=>{
        event.preventDefault();if(busy)return;
        const attempt=attempts.get(companyId)||{companyId,version:company.version,template:select.value,operationId:crypto.randomUUID()};
        attempts.set(companyId,attempt);busy=true;form.querySelectorAll('button,select').forEach(e=>e.disabled=true);form.querySelector('[data-error]').textContent='';submit.textContent='Preparing…';
        try{
          const result=await api('prepare-presentation',attempt);attempts.delete(companyId);
          if(!alive())return;
          dialog.close();notify('Presentation prepared and linked. Lead moved to Presentation ready.');onPrepared?.(result);
        }catch(error){
          if(!alive())return;
          if(error.status>=400&&error.status<500){attempts.delete(companyId);form.querySelector('[data-error]').textContent=error.message+' Close and reopen this dialog before trying again.';}
          else form.querySelector('[data-error]').textContent=error.message+' Retry to finish the same presentation.';
        }finally{
          busy=false;if(alive()){form.querySelectorAll('[data-close]').forEach(e=>e.disabled=false);submit.textContent='Retry preparation';submit.disabled=!attempts.has(companyId);}
        }
      };
      select.focus();
    }catch(error){if(alive())dialog.querySelector('[data-error]').textContent=error.message;}
  }
  return {open};
}
