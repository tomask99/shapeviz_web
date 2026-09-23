import {RESEARCH_SERVICES} from './service-catalog.js';
import {LEVELS,SOURCE_ORIGINS} from './research-options.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const array = value => Array.isArray(value) ? value : [];
const label = value => String(value ?? '').toLowerCase().replaceAll('_',' ').replace(/^./,c => c.toUpperCase());
const options = values => values.map(value => `<option value="${esc(value)}">${esc(label(value))}</option>`).join('');
const fields = ['company_name','website','country','city','industry','business_type','product_categories','secondary_categories','market_segments','positioning','short_description','research_summary','potential_services','opportunity_signals','suggested_pitch_angle','fit','fit_reason','research_confidence','sources','field_provenance','last_researched_at','source_origin'];
const jsonFields = ['positioning','opportunity_signals','sources','field_provenance'];
const lists = ['product_categories','secondary_categories','market_segments'];
const proposal = candidate => Object.fromEntries(fields.map(key => [key,candidate[key] ?? (lists.includes(key) || ['potential_services','opportunity_signals','sources'].includes(key) ? [] : ['positioning','field_provenance'].includes(key) ? {} : ['fit','research_confidence','last_researched_at'].includes(key) ? null : '')]));

export function researchReviewActions(candidate) {
  if (candidate.research_status==='APPROVED') return `<div class="actions research-review-actions">${candidate.approved_company_id ? `<a class="primary" href="/admin/leads/${encodeURIComponent(candidate.approved_company_id)}">Open lead</a>` : ''}<p class="fine">Approved research is preserved. Further company changes belong in the Lead.</p></div>`;
  if (candidate.research_status==='REJECTED') return '<div class="actions research-review-actions"><button class="secondary" data-research-restore>Restore to review</button><p class="fine">Rejected candidates remain in your research history and duplicate checks.</p></div>';
  return '<div class="actions research-review-actions"><button class="secondary" data-research-edit>Edit candidate</button><button class="primary" data-research-approve>Approve as lead</button><button class="quiet" data-research-reject>Reject candidate</button></div>';
}

export function researchHistory(events) {
  const names={candidate_updated:'Candidate updated',candidate_rejected:'Candidate rejected',candidate_restored:'Restored to review',candidate_approved:'Approved as lead',candidate_refreshed:'Research refreshed'};
  return `<section class="research-panel research-wide"><h2>Review history</h2>${array(events).length ? `<ol class="research-history">${events.map(event => {
    const metadata=event.metadata || {},time=Number.isFinite(Date.parse(event.created_at)) ? new Date(event.created_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}) : 'Time not recorded';
    const refresh=event.event_type==='candidate_refreshed';
    const context=refresh ? `<p>${metadata.mode==='deeper'?'Deeper research':'Research refresh'} · Selected changes reviewed</p>${array(metadata.manual_overrides).length ? `<p>Manual replacements confirmed: ${esc(metadata.manual_overrides.map(label).join(', '))}</p>` : ''}${metadata.last_researched_at!==metadata.previous_researched_at ? `<p>Research date: ${esc(metadata.previous_researched_at || 'Not recorded')} → ${esc(metadata.last_researched_at || 'Not recorded')}</p>` : ''}` : '';
    return `<li><h3>${esc(names[event.event_type] || 'Research reviewed')}</h3><p class="fine">${esc(time)}</p>${context}${array(metadata.changed_fields).length ? `<p>Changed: ${esc(metadata.changed_fields.map(label).join(', '))}</p>` : ''}${Object.hasOwn(metadata,'to_fit') && (!refresh || metadata.from_fit!==metadata.to_fit) ? `<p>Fit: ${esc(label(metadata.from_fit) || 'Not assessed')} → ${esc(label(metadata.to_fit) || 'Not assessed')}</p>` : ''}${metadata.reason ? `<p class="research-prose">${esc(metadata.reason)}</p>` : ''}${metadata.company_id ? `<a class="research-source-link" href="/admin/leads/${encodeURIComponent(metadata.company_id)}">Open lead</a>` : ''}</li>`;
  }).join('')}</ol><p class="fine">Latest 50 review events.</p>` : '<p class="fine">No review changes recorded yet.</p>'}</section>`;
}

function leadPreview(lead = {}) {
  const names={company_name:'Company',website:'Website',country:'Country',city:'City',industry:'Industry',short_description:'Description',services:'Services',priority:'Priority',fit:'Fit',lead_source:'Lead source',pipeline_status:'Pipeline status'};
  return `<dl class="research-record research-lead-preview">${Object.entries(names).map(([key,name]) => `<dt>${name}</dt><dd>${esc(Array.isArray(lead[key]) ? lead[key].join(', ') || 'None selected' : lead[key] || 'Not recorded')}</dd>`).join('')}</dl>`;
}

export function createResearchReview({api,onChanged}) {
  let dialog=null,generation=0;
  const retries=new Map();
  const account=()=>document.querySelector('#account')?.textContent || '';
  function close() {generation++;const old=dialog;dialog=null;old?.close();old?.remove();}
  function openDialog(title,content) {
    close();const element=document.createElement('dialog');element.className='crm-record-dialog research-dialog research-review-dialog';element.setAttribute('aria-labelledby','research-review-title');
    element.innerHTML=`<h2 id="research-review-title">${esc(title)}</h2>${content}`;document.body.append(element);dialog=element;
    const version=generation;let busy=false;
    const current=()=>dialog===element && element.open && generation===version;
    element.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    element.addEventListener('close',()=>{element.remove();if(dialog===element){dialog=null;generation++;}});
    element.addEventListener('click',event=>{if(event.target.closest('[data-review-close]')&&!busy)close();});
    element.showModal();return {element,current,setBusy(value){busy=value;}};
  }
  function retryKey(candidate,action) {return `${account()}:${candidate.id}:${action}`;}
  function mutationForm(candidate,action,title,content,makePayload,buttonText) {
    const key=retryKey(candidate,action),retry=retries.get(key);
    const context=openDialog(title,`<form><fieldset data-review-fields>${content}</fieldset><p role="alert" data-review-error></p><div class="actions"><button class="secondary" type="button" data-review-close>Cancel</button><button class="primary" type="submit">${esc(buttonText)}</button></div></form>`);
    const {element,current,setBusy}=context,form=element.querySelector('form'),fieldset=form.querySelector('fieldset'),errorBox=form.querySelector('[data-review-error]'),submit=form.querySelector('[type=submit]');
    let attempt=retry?.body || null,pending=false;
    function controls(){fieldset.disabled=!!attempt || pending;submit.disabled=pending;submit.textContent=pending ? 'Saving...' : attempt ? 'Retry save' : buttonText;form.querySelector('[data-review-close]').disabled=pending;}
    if(attempt)errorBox.textContent='An earlier save needs its result checked. Retry the same request to avoid repeating the change.';
    form.onsubmit=async event=>{
      event.preventDefault();if(pending)return;
      try {if(!attempt){attempt={id:candidate.id,version:candidate.version,operationId:crypto.randomUUID(),...makePayload(form)};retries.set(key,{body:attempt});}}
      catch(error){errorBox.textContent=error.message;return;}
      pending=true;setBusy(true);errorBox.textContent='';controls();
      try {const result=await api(action,attempt);retries.delete(key);if(!current())return;close();onChanged(result);}
      catch(error){if(!current())return;if(error.status>=400&&error.status<500){retries.delete(key);attempt=null;errorBox.textContent=error.message+' Your input has been kept.';}else errorBox.textContent=error.message+' Retry the same save to check its outcome.';}
      finally{pending=false;setBusy(false);if(current())controls();}
    };
    controls();return {form,retry:attempt};
  }
  function openEdit(candidate) {
    const retry=retries.get(retryKey(candidate,'crm-research-save')),value=proposal(retry?.body.candidate || candidate);
    const textField=(key,title,max=120)=>`<label>${title}<input name="${key}" maxlength="${max}" ${key==='company_name'?'required':''} value="${esc(value[key])}"></label>`;
    const area=(key,title,max)=>`<label>${title}<textarea name="${key}" aria-label="${esc(title)}" rows="3" maxlength="${max}">${esc(value[key])}</textarea></label>`;
    const result=mutationForm(candidate,'crm-research-save','Edit research candidate.',`
      <p class="fine">Corrections are recorded as manual changes. Changing a company fact clears its previous verification unless you also supply updated evidence. Fit remains a human decision.</p>
      <div class="research-edit-grid">${textField('company_name','Company name *',160)}${textField('website','Website',2048)}${textField('country','Country code',2)}${textField('city','City')}${textField('industry','Industry')}${textField('business_type','Business type')}</div>
      ${lists.map(key=>`<label>${esc(label(key))}<textarea name="${key}" rows="2">${esc(value[key].join(', '))}</textarea><span class="fine">Separate values with commas or new lines.</span></label>`).join('')}
      ${area('short_description','Short description',3000)}${area('research_summary','Research summary',12000)}${area('suggested_pitch_angle','Suggested pitch angle',6000)}
      <div class="research-edit-grid"><label>Fit<select name="fit"><option value="">Not assessed</option>${options(LEVELS)}</select></label><label>Research confidence<select name="research_confidence"><option value="">Unknown</option>${options(LEVELS)}</select></label></div>
      ${area('fit_reason','Fit reason',3000)}<p class="fine">A Fit assessment needs a reason. To clear Fit, also clear its reason.</p>
      <fieldset class="research-edit-services"><legend>Recommended services</legend>${RESEARCH_SERVICES.map((service,index)=>{const selected=value.potential_services.find(item=>item.service===service);return `<div data-service-index="${index}"><label class="check"><input type="checkbox" name="service" value="${esc(service)}" ${selected?'checked':''}>${esc(service)}</label><div data-service-fields ${selected?'':'hidden'}><label>${esc(service)} relevance<select name="relevance_${index}">${options(LEVELS)}</select></label><label>${esc(service)} reason<textarea name="reason_${index}" rows="2" maxlength="3000">${esc(selected?.reason || '')}</textarea></label></div></div>`;}).join('')}</fieldset>
      <details class="research-advanced"><summary>Evidence, sources and research metadata</summary><p class="fine">Edit these structured fields as valid JSON, preserving the research schema and source references.</p>${jsonFields.map(key=>`<label>${esc(label(key))} JSON<textarea name="${key}" rows="7" spellcheck="false">${esc(JSON.stringify(value[key],null,2))}</textarea></label>`).join('')}<label>Source origin<select name="source_origin">${SOURCE_ORIGINS.map(origin=>`<option>${esc(origin)}</option>`).join('')}</select></label><label>Last researched at (ISO date and time)<input name="last_researched_at" value="${esc(value.last_researched_at || '')}" placeholder="2026-09-23T12:00:00Z"></label></details>`,form=>{
        const data=new FormData(form),result={};
        for(const key of fields) {
          if(key==='potential_services')result[key]=[...value.potential_services.map(item=>item.service),...RESEARCH_SERVICES.filter(service=>!value.potential_services.some(item=>item.service===service))].flatMap(service=>{const index=RESEARCH_SERVICES.indexOf(service);return data.getAll('service').includes(service)?[{service,relevance:data.get(`relevance_${index}`),reason:String(data.get(`reason_${index}`)||'')}]:[];});
          else if(jsonFields.includes(key)){try{result[key]=JSON.parse(data.get(key));}catch{throw new Error(`${label(key)} must contain valid JSON.`);}}
          else if(lists.includes(key)){const text=String(data.get(key)||'');result[key]=text===value[key].join(', ')?value[key]:text.split(/[,\n]/).map(item=>item.trim()).filter(Boolean);}
          else if(['fit','research_confidence','last_researched_at'].includes(key))result[key]=data.get(key)||null;
          else result[key]=String(data.get(key)||'');
        }
        if(!!result.fit!==!!result.fit_reason.trim())throw new Error('Select Fit and provide its reason, or clear both fields.');
        return {candidate:result};
      },'Save candidate');
    const {form}=result;
    for(const key of ['fit','research_confidence','source_origin'])form.elements[key].value=value[key]||'';
    RESEARCH_SERVICES.forEach((service,index)=>{form.elements[`relevance_${index}`].value=value.potential_services.find(item=>item.service===service)?.relevance || 'MEDIUM';});
    form.addEventListener('change',event=>{if(event.target.name==='service')event.target.closest('[data-service-index]').querySelector('[data-service-fields]').hidden=!event.target.checked;});
  }
  function openReject(candidate) {
    const stored=retries.get(retryKey(candidate,'crm-research-reject'))?.body.reason || '';
    const {form}=mutationForm(candidate,'crm-research-reject','Reject research candidate.',`<p class="fine">The candidate and its research will stay in your inbox history. It can be restored later.</p><label>Reason category (optional)<select name="category"><option value="">No category</option>${['Not relevant','Too small','Wrong market','Already known','Poor fit','Competitor','Other'].map(reason=>`<option>${reason}</option>`).join('')}</select></label><label>Rejection reason (optional)<textarea name="reason" rows="4" maxlength="3000">${esc(stored)}</textarea></label>`,form=>({reason:[form.elements.category.value,form.elements.reason.value.trim()].filter(Boolean).join(': ')}),'Reject candidate');
    form.elements.reason.focus();
  }
  function openRestore(candidate) {mutationForm(candidate,'crm-research-restore','Restore candidate to review.',`<p>Restore ${esc(candidate.company_name)} to Needs review?</p><p class="fine">The previous rejection remains in review history.</p>`,()=>({}),'Restore to review');}
  function openApproval(candidate) {
    const key=retryKey(candidate,'crm-research-approve'),stored=retries.get(key);
    const {element,current,setBusy}=openDialog('Review lead approval.',`<p class="fine">Review the company, Fit and selected services before creating a Lead.</p><fieldset data-approval-options><label>Lead priority<select name="priority">${options(LEVELS)}</select></label><fieldset class="crm-services"><legend>Lead services</legend>${RESEARCH_SERVICES.map(service=>`<label class="check"><input type="checkbox" name="services" value="${esc(service)}" ${array(candidate.potential_services).some(item=>item.service===service)?'checked':''}>${esc(service)}</label>`).join('')}</fieldset><div class="actions"><button class="secondary" data-approval-preview>Preview lead</button><button class="quiet" data-approval-edit>Edit candidate</button></div></fieldset><p role="alert" data-review-error></p><div data-approval-review aria-live="polite"></div><div class="actions"><button class="secondary" data-review-close>Cancel</button></div>`);
    const optionBox=element.querySelector('[data-approval-options]'),priority=element.querySelector('[name=priority]'),errorBox=element.querySelector('[data-review-error]'),reviewBox=element.querySelector('[data-approval-review]');
    let review=stored?.review || null,attempt=stored?.body || null,pending=false,sequence=0,approved=false;
    priority.value=stored?.priority || 'MEDIUM';
    if(stored)element.querySelectorAll('[name=services]').forEach(input=>input.checked=stored.services.includes(input.value));
    const services=()=>[...element.querySelectorAll('[name=services]:checked')].map(input=>input.value);
    function controls(){optionBox.disabled=pending||!!attempt||approved;element.querySelector('[data-review-close]').disabled=pending;const confirm=element.querySelector('[data-approval-confirm]');if(confirm){const check=element.querySelector('[name=acknowledge]');confirm.disabled=pending||approved||!review?.can_approve||(!attempt&&Number(review.match_count)>0&&!check?.checked);confirm.textContent=pending?'Saving lead...':attempt?'Retry approval':'Confirm and create lead';}const check=element.querySelector('[name=acknowledge]');if(check)check.disabled=pending||!!attempt;}
    function render(){
      reviewBox.innerHTML=`<section class="research-approval-preview"><h3>Lead preview</h3>${leadPreview(review.lead)}${review.candidate?.fit_reason ? `<p><strong>Fit reason:</strong> ${esc(review.candidate.fit_reason)}</p>` : ''}${Number(review.match_count)>0 ? `<div class="research-approval-matches"><h3>Existing matches</h3><ul>${array(review.duplicates).map(match=>`<li><a class="research-source-link" href="/admin/${match.kind==='company'?'leads':'ai-research'}/${encodeURIComponent(match.id)}" target="_blank" rel="noopener noreferrer">${esc(match.company_name)}</a><p class="fine">${match.kind==='company'?'Existing CRM company':'Research candidate'} · ${esc(match.status || '')} · ${match.match==='domain'?'Same domain':'Same name and country'}</p></li>`).join('')}</ul>${Number(review.match_count)>array(review.duplicates).length?`<p>${Number(review.match_count)} matches in total.</p>`:''}</div>` : '<p class="fine">No existing matches found at this review.</p>'}${Number(review.company_match_count)>0 ? '<p role="alert">This company already exists in your CRM. Open the existing company to continue.</p>' : Number(review.match_count)>0 ? '<label class="check"><input type="checkbox" name="acknowledge">I reviewed the research matches and want a separate Lead.</label>' : ''}${review.can_approve ? '<button class="primary" data-approval-confirm>Confirm and create lead</button>' : '<p class="fine">Approval is unavailable. Edit the candidate or open an existing match.</p>'}</section>`;
      if(attempt&&element.querySelector('[name=acknowledge]'))element.querySelector('[name=acknowledge]').checked=attempt.acknowledgeDuplicates;
      controls();
    }
    optionBox.addEventListener('change',()=>{if(attempt)return;sequence++;review=null;reviewBox.replaceChildren();errorBox.textContent='Options changed. Preview the Lead again before confirming.';});
    element.querySelector('[data-approval-edit]').onclick=()=>{if(!pending&&!attempt){close();openEdit(candidate);}};
    element.querySelector('[data-approval-preview]').onclick=async()=>{
      if(pending||attempt)return;pending=true;setBusy(true);const ticket=++sequence;review=null;errorBox.textContent='';reviewBox.textContent='Checking the current candidate and duplicate matches...';controls();
      try{const result=await api('crm-research-approval-preview',{id:candidate.id,version:candidate.version,priority:priority.value,services:services()});if(!current()||ticket!==sequence)return;review=result;render();const title=reviewBox.querySelector('h3');title.tabIndex=-1;title.focus();}
      catch(error){if(current()&&ticket===sequence){reviewBox.replaceChildren();errorBox.textContent=error.message;}}
      finally{pending=false;setBusy(false);if(current())controls();}
    };
    element.addEventListener('change',event=>{if(event.target.name==='acknowledge')controls();});
    element.addEventListener('click',async event=>{
      if(!event.target.closest('[data-approval-confirm]')||pending||approved||!review?.can_approve)return;
      if(!attempt){const acknowledgement=!!element.querySelector('[name=acknowledge]')?.checked;if(Number(review.match_count)>0&&!acknowledgement)return;attempt={id:candidate.id,version:candidate.version,operationId:crypto.randomUUID(),reviewToken:review.reviewToken,acknowledgeDuplicates:acknowledgement,confirm:'approve'};retries.set(key,{body:attempt,review,priority:priority.value,services:services()});}
      pending=true;setBusy(true);errorBox.textContent='';controls();
      try{const result=await api('crm-research-approve',attempt);retries.delete(key);if(!current())return;approved=true;reviewBox.innerHTML=`<div role="status"><h3>Lead created.</h3><p>${result.replayed?'The earlier approval was already saved.':'The candidate is approved and its research is linked to the Lead.'}</p><a class="primary" href="/admin/leads/${encodeURIComponent(result.company_id)}">Open lead</a></div>`;element.querySelector('[data-review-close]').textContent='Done';element.addEventListener('close',()=>onChanged(result),{once:true});}
      catch(error){if(!current())return;if(error.status>=400&&error.status<500){retries.delete(key);attempt=null;review=null;reviewBox.replaceChildren();errorBox.textContent=error.message+' Preview the Lead again before confirming.';}else errorBox.textContent=error.message+' Retry this approval to check its outcome. A saved Lead will not be created again.';}
      finally{pending=false;setBusy(false);if(current())controls();}
    });
    if(review){render();errorBox.textContent='An earlier approval needs its result checked. Retry this same approval.';}
  }
  return {openEdit,openReject,openRestore,openApproval,close};
}
