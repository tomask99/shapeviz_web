const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** One read-only prompt dialog, shared by Research and company overview pages. */
export function createResearchSimilar({api,onImport}) {
  let dialog=null,generation=0;
  function close(){generation++;const previous=dialog;dialog=null;previous?.close();previous?.remove();}
  function open(reference) {
    close();const version=generation,element=document.createElement('dialog');element.className='crm-record-dialog research-dialog research-similar-dialog';element.setAttribute('aria-labelledby','research-similar-title');
    element.innerHTML=`<h2 id="research-similar-title">Find similar companies.</h2><p class="research-similar-reference">Based on <strong data-similar-reference>${esc(reference.name)}</strong></p><p class="fine">The prompt includes this reference's saved company profile and research. Share it with ChatGPT when you choose to copy it. Returned companies are reviewed through the Research import.</p><form novalidate><div class="research-similar-fields"><label>Target country codes<input name="countries" maxlength="80" placeholder="CZ, SK, AT" required value="${esc(/^[A-Za-z]{2}$/.test(reference.country||'')?reference.country.toUpperCase():'')}"></label><label>Number of companies<input name="count" type="number" min="1" max="20" step="1" value="10" required></label></div><p class="fine">Choose 1–10 distinct two-letter country codes and up to 20 companies.</p><button class="secondary" type="submit">Prepare prompt</button></form><p role="alert" data-similar-error></p><label>Similar-company research prompt<textarea data-similar-prompt rows="10" readonly></textarea></label><p role="status" data-similar-status></p><div class="actions"><button class="primary" data-similar-copy disabled>Copy prompt</button><a class="secondary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Open ChatGPT</a><button class="secondary" data-similar-import>Import research JSON</button><button class="quiet" data-similar-close>Close</button></div>`;
    document.body.append(element);dialog=element;
    const referenceNote=document.createElement('p');referenceNote.className='fine';referenceNote.dataset.similarReferenceNote='';referenceNote.textContent='This record is a comparison reference; it is not automatically an ideal client.';referenceNote.hidden=!['REJECTED','ARCHIVED'].includes(reference.status);element.querySelector('.research-similar-reference').after(referenceNote);
    const current=()=>dialog===element&&element.open&&generation===version,form=element.querySelector('form'),area=element.querySelector('[data-similar-prompt]'),status=element.querySelector('[data-similar-status]'),errorBox=element.querySelector('[data-similar-error]'),copy=element.querySelector('[data-similar-copy]'),prepare=form.querySelector('[type=submit]');
    let sequence=0,pending=false;
    function invalidate(){sequence++;area.value='';copy.disabled=true;errorBox.textContent='';status.textContent='Prepare a prompt for the selected countries and company count.';}
    form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);
    form.onsubmit=async event=>{
      event.preventDefault();if(pending)return;invalidate();
      const countries=form.elements.countries.value.split(',').map(value=>value.trim().toUpperCase()),rawCount=form.elements.count.value;
      if(!countries.length||countries.length>10||countries.some(value=>!/^[A-Z]{2}$/.test(value))||new Set(countries).size!==countries.length){errorBox.textContent='Enter 1–10 distinct two-letter country codes, separated by commas, such as CZ, SK, AT.';form.elements.countries.focus();return;}
      if(!/^[1-9]\d*$/.test(rawCount)||Number(rawCount)>20){errorBox.textContent='Choose a whole number of companies between 1 and 20.';form.elements.count.focus();return;}
      const ticket=++sequence;pending=true;prepare.disabled=true;status.textContent='Preparing the reference profile and excluded companies...';
      try{const response=await api('crm-research-similar-prompt',null,{referenceType:reference.type,referenceId:reference.id,countries:countries.join(','),count:Number(rawCount)});if(!current()||ticket!==sequence)return;area.value=response.prompt;copy.disabled=false;element.querySelector('[data-similar-reference]').textContent=response.reference?.name||reference.name;referenceNote.hidden=!['REJECTED','ARCHIVED'].includes(response.reference?.status);status.textContent=`${Number(response.excluded_count)||0} existing ${(Number(response.excluded_count)||0)===1?'domain':'domains'} included for exclusion. Copy the prompt, then import ChatGPT's JSON response for review.`;}
      catch(error){if(current()&&ticket===sequence){errorBox.textContent=error.message;status.textContent='Your country and company-count choices have been kept. Try preparing the prompt again.';}}
      finally{pending=false;if(current())prepare.disabled=false;}
    };
    copy.onclick=async()=>{const ticket=sequence,value=area.value;if(!value)return;try{await navigator.clipboard.writeText(value);if(current()&&ticket===sequence)status.textContent='Prompt copied. Paste it into ChatGPT to find similar companies.';}catch{if(!current()||ticket!==sequence)return;area.focus();area.select();status.textContent='Automatic copy is unavailable. The prompt is selected; use Ctrl+C or your device Copy command.';}};
    element.querySelector('[data-similar-close]').onclick=close;
    element.querySelector('[data-similar-import]').onclick=()=>{close();onImport();};
    element.addEventListener('close',()=>{element.remove();if(dialog===element){dialog=null;generation++;}});
    element.showModal();form.elements.countries.focus();
  }
  return {open,close};
}
