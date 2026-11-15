import {svgIcon} from '../ui/icons.js';
import {companyProjectUrl} from '../site/company-url.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export function mountSiteEditing({root, api, notify}) {
  let content;
  let dirty = false;
  let pending = false;
  let disposed = false;

  function updateStatus() {
    root.querySelector('[data-save]').disabled = pending || !dirty;
    root.querySelector('[data-save-status]').textContent = pending
      ? 'Saving changes…'
      : dirty ? 'Unsaved changes' : 'All changes saved';
  }

  function markDirty() {
    dirty = true;
    root.querySelector('[data-error]').textContent = '';
    updateStatus();
  }

  function draw() {
    if (disposed) return;
    root.innerHTML = `
      <div class="site-editing">
        <div class="page-heading">
          <div><p class="eyebrow">WEBSITE</p><h1>Site Editing<span>.</span></h1></div>
          <a class="secondary" href="/#collaborations" target="_blank" rel="noopener">View website ${svgIcon('arrowUpRight')}</a>
        </div>
        <div class="site-editing-tabs" role="tablist" aria-label="Site sections">
          <button type="button" role="tab" id="companies-tab" aria-controls="companies-panel" aria-selected="true">Companies</button>
        </div>
        <section id="companies-panel" role="tabpanel" aria-labelledby="companies-tab">
          <div class="section-title"><h2>Clients &amp; collaborations</h2></div>
          <p class="fine">Add a company name and an optional project link. Save changes to update the website. Project links open in a new tab.</p>
          <form data-companies-form>
            <fieldset class="site-company-fields">
              <legend class="site-editing-sr">Companies on the website</legend>
              <div class="site-company-list">
                ${content.companies.map((company, index) => `
                  <div class="site-company-row" data-company-id="${escape(company.id)}">
                    <label>Company name<input name="name-${escape(company.id)}" data-field="name" value="${escape(company.name)}" maxlength="120" required autocomplete="off"></label>
                    <label>Project link <span class="fine">(optional)</span><input name="url-${escape(company.id)}" data-field="url" value="${escape(company.url)}" maxlength="2048" inputmode="url" placeholder="https://… or /p/project" autocomplete="off" spellcheck="false"></label>
                    <div class="site-company-actions">
                      <button type="button" class="quiet" data-move="-1" aria-label="Move company ${index + 1} up" ${index === 0 ? 'disabled' : ''}>${svgIcon('arrowUp')}</button>
                      <button type="button" class="quiet" data-move="1" aria-label="Move company ${index + 1} down" ${index === content.companies.length - 1 ? 'disabled' : ''}>${svgIcon('arrowDown')}</button>
                      <button type="button" class="quiet" data-remove aria-label="Remove company ${index + 1}">${svgIcon('trash')}</button>
                    </div>
                  </div>
                `).join('')}
              </div>
              ${content.companies.length ? '' : '<p class="empty">Add your first company.</p>'}
              <button type="button" class="secondary" data-add ${content.companies.length >= 100 ? 'disabled' : ''}>${svgIcon('plus')} Add company</button>
              <div class="site-editing-save">
                <p data-save-status role="status"></p>
                <div class="actions">
                  <button type="button" class="secondary" data-reload>${svgIcon('refresh')} Reload saved list</button>
                  <button type="submit" class="primary" data-save>Save changes</button>
                </div>
              </div>
            </fieldset>
            <p data-error role="alert"></p>
          </form>
        </section>
      </div>`;
    updateStatus();
  }

  async function load() {
    if (pending || disposed) return;
    if (dirty && !confirm('Discard your unsaved changes and reload the saved company list?')) return;
    pending = true;
    root.innerHTML = '<p role="status">Loading site content…</p>';
    try {
      content = await api('site-content-list');
      dirty = false;
      pending = false;
      draw();
    } catch (error) {
      if (!disposed) root.innerHTML = `<h1>Site Editing</h1><p role="alert">${escape(error.message)}</p><button type="button" class="secondary" data-reload>Retry</button>`;
    } finally {
      pending = false;
    }
  }

  async function save(event) {
    event.preventDefault();
    if (pending || !dirty) return;
    const form = event.target;
    const errorMessage = form.querySelector('[data-error]');
    errorMessage.textContent = '';
    for (const input of form.querySelectorAll('[data-field="url"]')) {
      try {
        companyProjectUrl(input.value);
      } catch (error) {
        input.setCustomValidity(error.message);
        input.reportValidity();
        return;
      }
    }
    pending = true;
    form.querySelector('fieldset').disabled = true;
    updateStatus();
    try {
      content = await api('site-content-save', {version: content.version, companies: content.companies});
      dirty = false;
      if (!disposed) notify('Company list saved. The website is updated.');
    } catch (error) {
      if (!disposed) errorMessage.textContent = error.message;
    } finally {
      pending = false;
      if (!disposed) {
        if (dirty) {
          form.querySelector('fieldset').disabled = false;
          updateStatus();
        } else draw();
      }
    }
  }

  root.oninput = event => {
    const input = event.target;
    const id = input.closest('[data-company-id]')?.dataset.companyId;
    const company = content?.companies.find(item => item.id === id);
    if (!company || !['name', 'url'].includes(input.dataset.field)) return;
    input.setCustomValidity('');
    company[input.dataset.field] = input.value;
    markDirty();
  };

  root.onclick = event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || pending) return;
    if (button.hasAttribute('data-reload')) return load();
    if (button.hasAttribute('data-add')) {
      content.companies.push({id: crypto.randomUUID(), name: '', url: ''});
      dirty = true;
      draw();
      root.querySelector('.site-company-row:last-child input').focus();
      return;
    }
    const id = button.closest('[data-company-id]')?.dataset.companyId;
    const index = content?.companies.findIndex(company => company.id === id);
    if (index === undefined || index < 0) return;
    let focusIndex = index;
    if (button.hasAttribute('data-remove')) {
      content.companies.splice(index, 1);
      focusIndex = Math.min(index, content.companies.length - 1);
    } else if (button.dataset.move) {
      focusIndex = index + Number(button.dataset.move);
      if (focusIndex < 0 || focusIndex >= content.companies.length) return;
      const [company] = content.companies.splice(index, 1);
      content.companies.splice(focusIndex, 0, company);
    } else return;
    dirty = true;
    draw();
    (root.querySelectorAll('.site-company-row input[data-field="name"]')[focusIndex] || root.querySelector('[data-add]')).focus();
  };

  const beforeUnload = event => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  root.onsubmit = save;
  window.addEventListener('beforeunload', beforeUnload);
  load();
  return () => {
    disposed = true;
    root.onclick = null;
    root.oninput = null;
    root.onsubmit = null;
    window.removeEventListener('beforeunload', beforeUnload);
  };
}
