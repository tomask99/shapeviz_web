import {IDEAL_CLIENT_PROFILES} from './research-options.js';

const MAX_BYTES = 500_000;
const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const array = value => Array.isArray(value) ? value : [];
const duplicate = row => Number(row.match_count)>0 || array(row.duplicates).length>0 || array(row.within).length>0;
const issues = (items,kind) => array(items).length ? `<ul class="research-import-issues ${kind}">${items.map(item => `<li>${item.path ? `<code>${esc(item.path)}</code>: ` : ''}${esc(item.message || item.code || item)}</li>`).join('')}</ul>` : '';

function previewRow(row) {
  const valid = !!row.candidate && !array(row.errors).length, matches = array(row.duplicates);
  return `<article class="research-import-row" data-research-row="${Number(row.row)}">
    <div class="research-import-row-heading"><h3>Row ${Number(row.row)}${valid ? `: ${esc(row.candidate.company_name)}` : ': Needs correction'}</h3><span class="research-tag">${valid ? duplicate(row) ? 'Possible duplicate' : 'Valid' : 'Invalid'}</span></div>
    ${valid ? `<p class="fine">${esc([row.candidate.website || 'Website not recorded',row.candidate.country || 'Country unknown'].join(' · '))}</p>` : ''}
    ${issues(row.errors,'research-import-errors')}${issues(row.warnings,'')}
    ${matches.length ? `<ul class="research-import-matches">${matches.map(match => `<li><a href="/admin/${match.kind==='company' ? 'leads' : 'ai-research'}/${encodeURIComponent(match.id)}" target="_blank" rel="noopener noreferrer">${esc(match.company_name || 'Existing company')}</a> <span class="fine">${match.kind==='company' ? 'CRM' : 'Research'}${match.status ? ` · ${esc(match.status)}` : ''} · ${match.match==='domain' ? 'Same domain' : 'Same name and country'}${match.website ? ` · ${esc(match.website)}` : ''}</span></li>`).join('')}</ul>` : ''}
    ${Number(row.match_count)>matches.length ? `<p class="fine">${Number(row.match_count)} existing matches in total.</p>` : ''}
    ${array(row.within).length ? `<p class="fine">Also matches earlier ${row.within.length===1 ? 'row' : 'rows'} ${row.within.map(Number).join(', ')} in this import.</p>` : ''}
    ${valid ? `<details><summary>Review all candidate data, evidence and sources</summary><pre class="research-import-json">${esc(JSON.stringify(row.candidate,null,2))}</pre></details><label class="research-import-choice">Row ${Number(row.row)} decision<select data-research-choice="${Number(row.row)}" aria-label="Row ${Number(row.row)} decision"><option value="skip"${duplicate(row) ? ' selected' : ''}>Skip this row</option>${duplicate(row) ? '<option value="keep">Keep despite the possible match</option>' : '<option value="import" selected>Import candidate</option>'}</select></label>` : '<p class="fine">This row will be skipped. Correct the JSON and preview again to include it.</p>'}
  </article>`;
}

export function createResearchTools({api,onImported}) {
  let dialog = null, generation = 0, retry = null;

  function close() {
    generation++;
    const previous = dialog;
    dialog = null;
    if (previous?.open) previous.close();
    previous?.remove();
  }

  function openDialog(title,markup) {
    close();
    const element = document.createElement('dialog');
    element.className = 'crm-record-dialog research-dialog';
    element.setAttribute('aria-labelledby','research-dialog-title');
    element.innerHTML = `<h2 id="research-dialog-title">${esc(title)}</h2>${markup}`;
    document.body.append(element);dialog = element;
    const version = generation;
    element.addEventListener('close',() => {
      element.remove();
      if (dialog===element) {dialog=null;generation++;}
    });
    element.showModal();
    return {element,current:() => dialog===element && element.open && generation===version};
  }

  function openImport() {
    if (retry && retry.account!==document.querySelector('#account')?.textContent) retry=null;
    const {element,current} = openDialog('Import research JSON.',`
      <p class="fine">Paste the JSON returned by ChatGPT or choose a UTF-8 JSON file. Up to 100 candidates and 500,000 bytes. Preview every row before saving it to Research.</p>
      <label>JSON file<input type="file" accept=".json,application/json" data-research-file></label>
      <label>Research JSON<textarea data-research-json rows="8" spellcheck="false" placeholder='{"schema_version":1,"candidates":[…]}' autofocus></textarea></label>
      <div class="actions"><button class="secondary" data-research-preview>Preview import</button><button class="quiet" data-research-close>Cancel</button></div>
      <p role="alert" data-research-error></p><div data-research-review aria-live="polite"></div>`);
    const area = element.querySelector('[data-research-json]'), file = element.querySelector('[data-research-file]');
    const errorBox = element.querySelector('[data-research-error]'), reviewBox = element.querySelector('[data-research-review]');
    const previewButton = element.querySelector('[data-research-preview]'), closeButton = element.querySelector('[data-research-close]');
    let review = retry?.review || null, batchId = retry?.body.batchId || null, attempt = retry?.body || null;
    let previewSequence = 0, fileSequence = 0, pending = '', committed = false;

    function controls() {
      area.disabled = file.disabled = !!attempt || committed || pending==='commit';
      previewButton.disabled = !!attempt || committed || !!pending;
      closeButton.disabled = pending==='commit';
      element.querySelectorAll('[data-research-choice]').forEach(select => select.disabled = !!attempt || committed || pending==='commit');
      const commit = element.querySelector('[data-research-commit]');
      if (commit) {
        const selected = [...element.querySelectorAll('[data-research-choice]')].filter(select => select.value!=='skip').length;
        commit.disabled = !!pending || committed || !selected;
        commit.textContent = pending==='commit' ? 'Saving candidates…' : attempt ? 'Retry import' : `Import ${selected} ${selected===1 ? 'candidate' : 'candidates'}`;
      }
    }

    function renderPreview() {
      reviewBox.innerHTML = `<div class="research-import-review-heading"><h3>Review ${Number(review.count)} ${review.count===1 ? 'row' : 'rows'}</h3><p class="fine">${Number(review.valid_count)} valid · ${Number(review.count)-Number(review.valid_count)} invalid · ${review.rows.filter(duplicate).length} possible duplicates. Duplicate rows are skipped unless you explicitly keep them.</p></div>${review.rows.map(previewRow).join('')}<div class="actions research-import-confirm"><button class="primary" data-research-commit>Import candidates</button></div>`;
      if (attempt) for (const choice of attempt.choices) {
        const select = element.querySelector(`[data-research-choice="${Number(choice.row)}"]`);
        if (select) select.value=choice.decision;
      }
      controls();
    }

    function invalidate() {
      if (attempt || committed) return;
      previewSequence++;review=null;batchId=null;reviewBox.replaceChildren();
      errorBox.textContent='';controls();
    }
    area.addEventListener('input',() => {fileSequence++;invalidate();});
    file.addEventListener('change',async () => {
      if (attempt || committed) return;
      const chosen=file.files[0];if (!chosen) return;
      const version=++fileSequence;
      invalidate();
      if (chosen.size>MAX_BYTES) {errorBox.textContent='The JSON file exceeds 500,000 bytes.';return;}
      try {
        const value=await chosen.text();
        if (!current() || version!==fileSequence || attempt || committed) return;
        area.value=value;invalidate();
      } catch {if (current() && version===fileSequence) errorBox.textContent='The file could not be read. Try again or paste the JSON.';}
    });
    element.addEventListener('change',event => {if (event.target.matches('[data-research-choice]')) controls();});
    element.addEventListener('cancel',event => {if (pending==='commit') event.preventDefault();});
    closeButton.onclick=close;

    previewButton.onclick = async () => {
      if (pending || attempt || committed) return;
      invalidate();
      if (!area.value.trim()) {errorBox.textContent='Paste research JSON or choose a JSON file first.';area.focus();return;}
      if (new TextEncoder().encode(area.value).byteLength>MAX_BYTES) {errorBox.textContent='The research JSON exceeds 500,000 bytes.';return;}
      const json=area.value, version=++previewSequence;
      pending='preview';controls();reviewBox.textContent='Validating candidates and checking duplicates…';
      try {
        const result=await api('crm-research-import-preview',{json});
        if (!current() || version!==previewSequence) return;
        review=result;batchId=crypto.randomUUID();renderPreview();
      } catch (error) {
        if (current() && version===previewSequence) {reviewBox.replaceChildren();errorBox.textContent=error.message;}
      } finally {
        if (current()) {pending='';controls();if (version!==previewSequence) reviewBox.replaceChildren();}
      }
    };

    element.addEventListener('click',async event => {
      if (!event.target.closest('[data-research-commit]') || pending || !review || committed) return;
      if (!attempt) {
        const choices=review.rows.filter(row => row.candidate && !array(row.errors).length).map(row => ({row:row.row,decision:element.querySelector(`[data-research-choice="${Number(row.row)}"]`)?.value || 'skip'}));
        if (!choices.some(choice => choice.decision!=='skip')) return;
        attempt={json:area.value,previewToken:review.previewToken,batchId,choices,confirm:'import'};
        retry={review,body:attempt,account:document.querySelector('#account')?.textContent};
      }
      pending='commit';errorBox.textContent='';controls();
      try {
        const result=await api('crm-research-import-commit',attempt);
        retry=null;
        if (!current()) return;
        committed=true;
        const invalid=Number(review.count)-Number(review.valid_count);
        reviewBox.innerHTML=`<div class="research-import-success" role="status"><h3>Research import complete.</h3><p>${Number(result.imported)} imported · ${Number(result.skipped)} skipped.${invalid ? ` ${invalid} invalid ${invalid===1 ? 'row was' : 'rows were'} left out.` : ''}</p><p class="fine">${result.replayed ? 'The earlier import was already saved. No candidates were added again.' : 'The candidates are ready to review in your Research inbox.'}</p></div>`;
        closeButton.textContent='Done';
      } catch (error) {
        if (!current()) return;
        if (error.status>=400 && error.status<500) {
          retry=null;attempt=null;review=null;batchId=null;reviewBox.replaceChildren();
          errorBox.textContent=error.message+' Preview again to review the current data before importing.';
        } else {
          errorBox.textContent=error.message+' Retry this same import to check its outcome. Already saved candidates will not be added again.';
        }
      } finally {if (current()) {pending='';controls();}}
    });

    if (attempt) {
      area.value=attempt.json;renderPreview();
      errorBox.textContent='An earlier import needs its result checked. Retry the same import; already saved candidates will not be added again.';
    }
    element.addEventListener('close',() => {if (committed) onImported();},{once:true});
    area.focus();
  }

  function openPrompt() {
    const {element,current} = openDialog('Research prompt.',`
      <p class="fine">Copy this brief into ChatGPT, run the research there, then import its JSON response here. The prompt includes the schema, service catalog and domains already in your workspace.</p>
      <label>Ideal client profile<select data-research-profile><option value="">General research</option>${IDEAL_CLIENT_PROFILES.map(profile => `<option value="${esc(profile.id)}">${esc(profile.name)}</option>`).join('')}</select></label>
      <label>Prompt to copy<textarea rows="12" readonly data-research-prompt-text></textarea></label>
      <p class="fine" role="status" data-research-prompt-status></p><p role="alert" data-research-prompt-error></p>
      <div class="actions"><button class="primary" data-research-copy disabled>Copy prompt</button><button class="secondary" data-research-prompt-retry>Refresh prompt</button><a class="secondary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Open ChatGPT</a><button class="quiet" data-research-close>Close</button></div>`);
    const area=element.querySelector('[data-research-prompt-text]'), profile=element.querySelector('[data-research-profile]');
    const status=element.querySelector('[data-research-prompt-status]'), errorBox=element.querySelector('[data-research-prompt-error]'), copy=element.querySelector('[data-research-copy]');
    let sequence=0;
    async function load() {
      const version=++sequence;area.value='';copy.disabled=true;status.textContent='Preparing your research prompt…';errorBox.textContent='';
      try {
        const result=await api('crm-research-prompt',null,profile.value ? {profile:profile.value} : {});
        if (!current() || version!==sequence) return;
        area.value=result.prompt;copy.disabled=false;status.textContent=`${Number(result.excluded_count)} existing ${result.excluded_count===1 ? 'domain' : 'domains'} included for exclusion.`;
      } catch (error) {if (current() && version===sequence) {status.textContent='';errorBox.textContent=error.message;}}
    }
    profile.onchange=load;element.querySelector('[data-research-prompt-retry]').onclick=load;
    element.querySelector('[data-research-close]').onclick=close;
    copy.onclick=async () => {
      const version=sequence;
      try {
        await navigator.clipboard.writeText(area.value);
        if (current() && version===sequence) status.textContent='Prompt copied. Paste it into ChatGPT to begin your research.';
      } catch {
        if (!current() || version!==sequence) return;
        area.focus();area.select();status.textContent='Automatic copy is unavailable. The prompt is selected; copy it with Ctrl+C or your device’s Copy command.';
      }
    };
    load();
  }

  return {openImport,openPrompt,close};
}
