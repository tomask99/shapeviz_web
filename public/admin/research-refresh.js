const MAX_BYTES=500_000;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const array=value=>Array.isArray(value)?value:[];
const pretty=value=>value===null||value===undefined||value===''?'Not recorded':typeof value==='string'?value:JSON.stringify(value,null,2);
const warningsMarkup=warnings=>array(warnings).length?`<ul class="research-import-issues">${warnings.map(warning=>`<li>${esc(warning.message||warning)}</li>`).join('')}</ul>`:'';

export function researchRefreshActions(candidate) {
  if(['APPROVED','REJECTED'].includes(candidate.research_status))return `<p class="fine research-refresh-unavailable">${candidate.research_status==='APPROVED'?'Approved research is preserved; further research updates are unavailable for this record.':'Restore this candidate to review before researching it again.'}</p>`;
  return '<div class="actions research-refresh-actions"><button class="secondary" data-research-deeper>Research deeper</button><button class="secondary" data-research-again>Research again</button></div>';
}

function groupMarkup(group,index) {
  return `<article class="research-refresh-group" data-refresh-group="${index}"><div class="research-refresh-group-heading"><h3>${esc(group.label)}</h3>${group.manual?'<span class="research-tag research-tag-accent">Manually reviewed</span>':''}</div><div class="research-refresh-comparison"><div><h4>Current</h4><pre>${esc(pretty(group.before))}</pre></div><div><h4>Proposed</h4><pre>${esc(pretty(group.after))}</pre></div></div><label class="check"><input type="checkbox" data-refresh-select="${index}">Apply ${esc(group.label)}</label>${group.manual?`<label class="check research-refresh-override" hidden><input type="checkbox" data-refresh-override="${index}">Replace my manual review of ${esc(group.label)} with this proposal.</label>`:''}</article>`;
}

export function createResearchRefresh({api,onChanged}) {
  let dialog=null,generation=0;
  const retries=new Map();
  function close(){generation++;const previous=dialog;dialog=null;previous?.close();previous?.remove();}
  function open(candidate,mode='deeper') {
    if(['APPROVED','REJECTED'].includes(candidate.research_status))return;
    close();const version=generation,key=`${document.querySelector('#account')?.textContent||''}:${candidate.id}:${mode}`,saved=retries.get(key);
    const element=document.createElement('dialog');element.className='crm-record-dialog research-dialog research-refresh-dialog';element.setAttribute('aria-labelledby','research-refresh-title');
    element.innerHTML=`<h2 id="research-refresh-title">${mode==='deeper'?'Research deeper.':'Research again.'}</h2><p class="fine">${mode==='deeper'?'Investigate missing information and check the evidence for this company.':'Check whether the company information is still current.'} Review each proposed change before updating ${esc(candidate.company_name)}.</p>
      <section class="research-refresh-step"><h3>1. Prepare the research prompt</h3><p class="fine">The prompt includes this candidate's saved research. Choose what to share by copying it into ChatGPT.</p><div class="actions"><button class="secondary" data-refresh-prompt>Prepare prompt</button><button class="secondary" data-refresh-copy disabled>Copy prompt</button><a class="quiet" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Open ChatGPT</a></div><label>Candidate research prompt<textarea data-refresh-prompt-text rows="6" readonly></textarea></label><p role="status" data-refresh-prompt-status></p><p role="alert" data-refresh-prompt-error></p></section>
      <section class="research-refresh-step"><h3>2. Add the research result</h3><p class="fine">Paste or upload the single-candidate JSON returned by ChatGPT. Up to 500,000 bytes.</p><label>Research update file<input type="file" data-refresh-file accept=".json,application/json"></label><label>Research update JSON<textarea data-refresh-json rows="7" spellcheck="false" placeholder="Paste the complete JSON response here"></textarea></label><button class="secondary" data-refresh-preview>Preview updates</button></section>
      <p role="alert" data-refresh-error></p><div data-refresh-review aria-live="polite"></div><div class="actions"><button class="secondary" data-refresh-close>Cancel</button></div>`;
    document.body.append(element);dialog=element;
    const current=()=>dialog===element&&element.open&&generation===version;
    const jsonArea=element.querySelector('[data-refresh-json]'),file=element.querySelector('[data-refresh-file]'),errorBox=element.querySelector('[data-refresh-error]'),reviewBox=element.querySelector('[data-refresh-review]');
    const promptArea=element.querySelector('[data-refresh-prompt-text]'),promptStatus=element.querySelector('[data-refresh-prompt-status]'),promptError=element.querySelector('[data-refresh-prompt-error]'),copyButton=element.querySelector('[data-refresh-copy]'),promptButton=element.querySelector('[data-refresh-prompt]'),previewButton=element.querySelector('[data-refresh-preview]'),closeButton=element.querySelector('[data-refresh-close]');
    let review=saved?.review||null,proposal=saved?.body.proposal||null,attempt=saved?.body||null,pending='',promptPending=false,previewSequence=0,fileSequence=0,committed=false,result=null;
    const selected=()=>array(review?.groups).filter((_,index)=>element.querySelector(`[data-refresh-select="${index}"]`)?.checked);
    function controls(){
      const locked=!!attempt||pending==='commit'||committed;
      jsonArea.disabled=file.disabled=locked;previewButton.disabled=locked||!!pending;promptButton.disabled=promptPending||locked;copyButton.disabled=promptPending||!promptArea.value;closeButton.disabled=pending==='commit';
      element.querySelectorAll('[data-refresh-select],[data-refresh-override]').forEach(input=>input.disabled=locked);
      const commit=element.querySelector('[data-refresh-commit]');if(commit){const chosen=selected(),missingAck=chosen.some(group=>group.manual&&!element.querySelector(`[data-refresh-override="${review.groups.indexOf(group)}"]`)?.checked);commit.disabled=!!pending||committed||!chosen.length||missingAck;commit.textContent=pending==='commit'?'Applying updates...':attempt?'Retry selected updates':`Apply ${chosen.length} selected ${chosen.length===1?'update':'updates'}`;}
    }
    function invalidate(){if(attempt||committed)return;previewSequence++;review=null;proposal=null;reviewBox.replaceChildren();errorBox.textContent='';controls();}
    function renderPreview(){
      reviewBox.innerHTML=`<section class="research-refresh-step"><h3 tabindex="-1">3. Choose the updates to apply</h3><p class="fine">All updates start unselected. Company facts include their supporting evidence. Existing sources stay attached; select Sources when an update cites a new source.</p>${warningsMarkup(review.warnings)}${array(review.groups).length?review.groups.map(groupMarkup).join(''):'<p class="fine">This result proposes no changes to the saved research.</p>'}${array(review.groups).length?'<button class="primary" data-refresh-commit>Apply selected updates</button>':''}</section>`;
      if(attempt)review.groups.forEach((group,index)=>{const checkbox=element.querySelector(`[data-refresh-select="${index}"]`);checkbox.checked=attempt.selectedFields.includes(group.key);const override=element.querySelector(`[data-refresh-override="${index}"]`);if(override){override.closest('label').hidden=!checkbox.checked;override.checked=attempt.overwriteManualFields.includes(group.key);}});
      controls();
    }
    jsonArea.addEventListener('input',()=>{fileSequence++;invalidate();});
    file.addEventListener('change',async()=>{if(attempt||committed)return;const chosen=file.files[0];if(!chosen)return;const ticket=++fileSequence;invalidate();if(chosen.size>MAX_BYTES){errorBox.textContent='The JSON file exceeds 500,000 bytes.';return;}try{const contents=await chosen.text();if(!current()||ticket!==fileSequence||attempt||committed)return;jsonArea.value=contents;invalidate();}catch{if(current()&&ticket===fileSequence)errorBox.textContent='The file could not be read. Try again or paste the JSON.';}});
    promptButton.onclick=async()=>{
      if(promptPending||attempt||committed)return;promptPending=true;promptArea.value='';promptError.textContent='';promptStatus.textContent='Preparing the candidate research prompt...';controls();
      try{const response=await api('crm-research-refresh-prompt',null,{id:candidate.id,version:candidate.version,mode});if(!current())return;promptArea.value=response.prompt;promptStatus.textContent='Prompt ready. Copy it into ChatGPT, then review its JSON result below.';}
      catch(error){if(current()){promptError.textContent=error.message;promptStatus.textContent='';}}
      finally{promptPending=false;if(current())controls();}
    };
    copyButton.onclick=async()=>{const copied=promptArea.value;if(!copied)return;try{await navigator.clipboard.writeText(copied);if(current()&&promptArea.value===copied)promptStatus.textContent='Prompt copied. Paste it into ChatGPT to run the research.';}catch{if(!current()||promptArea.value!==copied)return;promptArea.focus();promptArea.select();promptStatus.textContent='Automatic copy is unavailable. The prompt is selected; use Ctrl+C or your device Copy command.';}};
    previewButton.onclick=async()=>{
      if(pending||attempt||committed)return;invalidate();
      let input;
      try{if(!jsonArea.value.trim())throw new Error('Paste a research result or choose a JSON file first.');if(new TextEncoder().encode(jsonArea.value).byteLength>MAX_BYTES)throw new Error('The research JSON exceeds 500,000 bytes.');try{input=JSON.parse(jsonArea.value);}catch{throw new Error('The research result must be valid JSON. Your input has been kept.');}if(!input||Array.isArray(input)||typeof input!=='object')throw new Error('Paste the complete single-candidate JSON response.');if(input.candidate_id!==candidate.id)throw new Error('This result belongs to another candidate. Prepare a prompt for this candidate.');if(input.base_version!==candidate.version)throw new Error('This result was prepared for another version. Prepare a new prompt for the current candidate.');if(input.mode!==mode)throw new Error(`This result belongs to ${input.mode==='refresh'?'Research again':'another research mode'}. Use the matching research action or prepare a new prompt.`);}
      catch(error){errorBox.textContent=error.message;return;}
      const ticket=++previewSequence;pending='preview';reviewBox.textContent='Comparing the result with your saved research...';controls();
      try{const response=await api('crm-research-refresh-preview',{id:candidate.id,version:candidate.version,proposal:input});if(!current()||ticket!==previewSequence)return;review=response;proposal=input;renderPreview();const title=reviewBox.querySelector('h3');title?.focus();title?.scrollIntoView({block:'start'});}
      catch(error){if(current()&&ticket===previewSequence){reviewBox.replaceChildren();errorBox.textContent=error.message;}}
      finally{if(current()){pending='';controls();if(ticket!==previewSequence)reviewBox.replaceChildren();}}
    };
    element.addEventListener('change',event=>{if(event.target.hasAttribute('data-refresh-select')){const override=element.querySelector(`[data-refresh-override="${Number(event.target.dataset.refreshSelect)}"]`);if(override){override.closest('label').hidden=!event.target.checked;if(!event.target.checked)override.checked=false;}controls();}else if(event.target.hasAttribute('data-refresh-override'))controls();});
    element.addEventListener('click',async event=>{
      if(!event.target.closest('[data-refresh-commit]')||pending||committed||!review)return;
      if(!attempt){const chosen=selected();if(!chosen.length)return;const protectedGroups=chosen.filter(group=>group.manual);if(protectedGroups.some(group=>!element.querySelector(`[data-refresh-override="${review.groups.indexOf(group)}"]`)?.checked))return;attempt={id:candidate.id,version:candidate.version,operationId:crypto.randomUUID(),proposal,selectedFields:chosen.map(group=>group.key),overwriteManualFields:protectedGroups.map(group=>group.key),reviewToken:review.reviewToken,confirm:'apply'};retries.set(key,{body:attempt,review,json:jsonArea.value});}
      pending='commit';errorBox.textContent='';controls();
      try{result=await api('crm-research-refresh-commit',attempt);retries.delete(key);if(!current())return;committed=true;reviewBox.innerHTML=`<section class="research-refresh-step" role="status"><h3>Research updated.</h3><p>${result.replayed?'The earlier update was already saved.':'Your selected updates were saved to this candidate.'}</p>${warningsMarkup(result.warnings)}</section>`;closeButton.textContent='Done';}
      catch(error){if(!current())return;if(error.status>=400&&error.status<500){retries.delete(key);attempt=null;review=null;proposal=null;reviewBox.replaceChildren();errorBox.textContent=error.message+' Your JSON has been kept. Preview it again before applying changes.';}else errorBox.textContent=error.message+' Retry these same selected updates to check their outcome. Saved changes will not be applied twice.';}
      finally{if(current()){pending='';controls();}}
    });
    element.addEventListener('cancel',event=>{if(pending==='commit')event.preventDefault();});
    element.addEventListener('close',()=>{element.remove();if(dialog===element){dialog=null;generation++;}if(committed)onChanged(result);});
    closeButton.onclick=close;
    element.showModal();
    if(saved){jsonArea.value=saved.json;renderPreview();errorBox.textContent='An earlier update needs its result checked. Retry the same selected updates.';}else controls();
  }
  return {open,close};
}
