import {svgIcon} from '../ui/icons.js';
import {companyProjectUrl} from '../site/company-url.js';
import {uploadGalleryImage} from './gallery-upload.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export function mountCompanies({root, api, notify}) {
  let content;
  let dirty = false;
  let pending = false;
  let disposed = false;
  let gallery = [];
  const expanded = new Set();

  function setExpanded(row, open) {
    if (!row) return;
    const id = row.dataset.companyId;
    if (open) expanded.add(id);
    else expanded.delete(id);
    row.querySelector('[data-company-body]').hidden = !open;
    const toggle = row.querySelector('[data-company-toggle]');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} project ${row.querySelector('[data-company-title]').textContent}`);
  }

  function revealInvalid(event) {
    setExpanded(event.target.closest('[data-company-id]'), true);
  }

  function imageEditor(company) {
    const image = company.image;
    const choices = [...gallery];
    if (image && !choices.some(item => item.src === image.src)) choices.unshift(image);
    return `<div class="site-company-image">
      <div class="site-company-preview">${image ? `<img src="${escape(image.src)}" alt="Project image preview" style="object-position:${image.positionX}% ${image.positionY}%" loading="lazy">` : '<span class="fine">No preview image</span>'}</div>
      <div class="site-company-image-controls"><label>Project image<select data-image-choice><option value="">No image</option>${choices.map(item => `<option value="${escape(item.id)}" ${image?.src === item.src ? 'selected' : ''}>${escape(item.alt || item.filename)}</option>`).join('')}</select></label>
      <div class="actions"><button type="button" class="secondary" data-image-upload>${svgIcon('upload')} Upload image</button>${image ? '<button type="button" class="quiet" data-image-remove>Remove image</button>' : ''}</div>
      <input type="file" data-image-file accept="image/jpeg,image/png,image/webp,image/avif" aria-label="Upload project image" hidden>
      ${image ? `<label>Vertical crop<input type="range" data-image-crop min="0" max="100" value="${image.positionY}"></label>` : ''}</div>
    </div>`;
  }

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
      <div class="site-companies">
          <div class="section-title"><h2>Clients &amp; collaborations</h2></div>
          <p class="fine">Add a company name, project link, preview image and a short description of your role and collaborators. Save changes to update the website. Project links open in a new tab.</p>
          <form data-companies-form>
            <fieldset class="site-company-fields">
              <legend class="site-editing-sr">Companies on the website</legend>
              <div class="site-company-list">
                ${content.companies.map((company, index) => `
                  <div class="site-company-row" data-company-id="${escape(company.id)}">
                    <div class="site-company-header">
                      <button type="button" class="quiet site-company-toggle" data-company-toggle aria-expanded="${expanded.has(company.id)}" aria-controls="company-body-${escape(company.id)}" aria-label="${expanded.has(company.id) ? 'Collapse' : 'Expand'} project ${escape(company.name.trim() || 'New project')}">${svgIcon('chevronDown')}<span data-company-title>${escape(company.name.trim() || 'New project')}</span></button>
                    <div class="site-company-actions">
                      <button type="button" class="quiet" data-move="-1" aria-label="Move company ${index + 1} up" ${index === 0 ? 'disabled' : ''}>${svgIcon('arrowUp')}</button>
                      <button type="button" class="quiet" data-move="1" aria-label="Move company ${index + 1} down" ${index === content.companies.length - 1 ? 'disabled' : ''}>${svgIcon('arrowDown')}</button>
                      <button type="button" class="quiet" data-remove aria-label="Remove company ${index + 1}">${svgIcon('trash')}</button>
                    </div>
                    </div>
                    <div class="site-company-body" data-company-body id="company-body-${escape(company.id)}" ${expanded.has(company.id) ? '' : 'hidden'}>
                    <label>Company name<input name="name-${escape(company.id)}" data-field="name" value="${escape(company.name)}" maxlength="120" required autocomplete="off"></label>
                    <label>Project link <span class="fine">(optional)</span><input name="url-${escape(company.id)}" data-field="url" value="${escape(company.url)}" maxlength="2048" inputmode="url" placeholder="https://… or /p/project" autocomplete="off" spellcheck="false"></label>
                    ${imageEditor(company)}
                    <div class="site-company-descriptions">
                      ${['sk', 'en'].map(locale => `<div class="site-company-language"><h3>${locale === 'sk' ? 'Slovak' : 'English'}</h3>
                        <label>Collaboration (${locale.toUpperCase()})<input data-detail="collaboration" data-locale="${locale}" maxlength="200" value="${escape(company.collaboration?.[locale] || '')}" placeholder="Studio, partner or team"></label>
                        <label>My contribution (${locale.toUpperCase()})<textarea data-detail="contributions" data-locale="${locale}" rows="5" placeholder="One contribution per line">${escape((company.contributions?.[locale] || []).join('\n'))}</textarea></label>
                        <label>Short description (${locale.toUpperCase()})<textarea data-description="${locale}" maxlength="500" rows="3" placeholder="Short project context for the right-hand block">${escape(company.description?.[locale] || '')}</textarea></label>
                      </div>`).join('')}
                      <p class="fine">Collaboration and contributions appear on the left; the short description appears on the right. Enter up to 6 contribution lines, 120 characters each. Leave all fields empty to keep the company name.</p>
                    </div>
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
            <p data-upload-status role="status"></p>
          </form>
      </div>`;
    updateStatus();
  }

  async function load() {
    if (pending || disposed) return;
    if (dirty && !confirm('Discard your unsaved changes and reload the saved company list?')) return;
    pending = true;
    root.innerHTML = '<p role="status">Loading site content…</p>';
    try {
      const [companiesResult, galleryResult] = await Promise.allSettled([api('site-content-list'), api('site-gallery-list')]);
      if (companiesResult.status === 'rejected') throw companiesResult.reason;
      content = companiesResult.value;
      gallery = galleryResult.status === 'fulfilled' ? galleryResult.value.items.filter(item => item.type === 'image') : [];
      expanded.clear();
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
    if (company && ['collaboration', 'contributions'].includes(input.dataset.detail)) {
      const field = input.dataset.detail, locale = input.dataset.locale;
      const value = field === 'contributions' ? input.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : input.value;
      input.setCustomValidity(field === 'contributions' && (value.length > 6 || value.some(line => line.length > 120)) ? 'Use up to 6 lines of at most 120 characters each.' : '');
      company[field] = {...(field === 'contributions' ? {sk:[], en:[]} : {sk:'', en:''}), ...company[field], [locale]:value};
      markDirty();
      return;
    }
    if (company && ['sk', 'en'].includes(input.dataset.description)) {
      company.description = {...{sk:'', en:''}, ...company.description, [input.dataset.description]:input.value};
      markDirty();
      return;
    }
    if (company?.image && input.hasAttribute('data-image-crop')) {
      company.image.positionY = Number(input.value);
      input.closest('[data-company-id]').querySelector('.site-company-preview img').style.objectPosition = `${company.image.positionX}% ${company.image.positionY}%`;
      markDirty();
      return;
    }
    if (!company || !['name', 'url'].includes(input.dataset.field)) return;
    input.setCustomValidity('');
    company[input.dataset.field] = input.value;
    if (input.dataset.field === 'name') {
      const row = input.closest('[data-company-id]');
      row.querySelector('[data-company-title]').textContent = input.value.trim() || 'New project';
      setExpanded(row, expanded.has(id));
    }
    markDirty();
  };

  root.onchange = async event => {
    const input = event.target;
    const row = input.closest('[data-company-id]');
    const company = content?.companies.find(item => item.id === row?.dataset.companyId);
    if (!company || pending) return;
    if (input.hasAttribute('data-image-choice')) {
      const image = gallery.find(item => item.id === input.value) || (company.image?.id === input.value ? company.image : null);
      company.image = image ? {...image} : null;
      markDirty(); draw();
      root.querySelector(`[data-company-id="${company.id}"] [data-image-choice]`).focus();
    }
    if (input.hasAttribute('data-image-file') && input.files[0]) {
      pending = true;
      root.querySelector('fieldset').disabled = true;
      root.querySelector('[data-error]').textContent = '';
      root.querySelector('[data-upload-status]').textContent = 'Uploading project image...';
      updateStatus();
      try {
        const image = await uploadGalleryImage(input.files[0], api, message => {if (!disposed) root.querySelector('[data-upload-status]').textContent = message;});
        if (disposed) return;
        company.image = image;
        dirty = true;
        pending = false;
        draw();
        root.querySelector(`[data-company-id="${company.id}"] [data-image-upload]`).focus();
        root.querySelector('[data-upload-status]').textContent = 'Image uploaded. Save changes to update the website.';
      } catch (error) {
        if (!disposed) {root.querySelector('[data-error]').textContent = error.message; root.querySelector('[data-upload-status]').textContent = '';}
      } finally {
        pending = false;
        if (!disposed) {input.value = ''; root.querySelector('fieldset').disabled = false; updateStatus();}
      }
    }
  };

  root.onclick = event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || pending) return;
    if (button.hasAttribute('data-reload')) return load();
    if (button.hasAttribute('data-add')) {
      const id = crypto.randomUUID();
      content.companies.push({id, name: '', url: ''});
      expanded.add(id);
      dirty = true;
      draw();
      root.querySelector('.site-company-row:last-child input').focus();
      return;
    }
    const id = button.closest('[data-company-id]')?.dataset.companyId;
    const index = content?.companies.findIndex(company => company.id === id);
    if (index === undefined || index < 0) return;
    if (button.hasAttribute('data-company-toggle')) {
      setExpanded(button.closest('[data-company-id]'), !expanded.has(id));
      return;
    }
    if (button.hasAttribute('data-image-upload')) return button.closest('[data-company-id]').querySelector('[data-image-file]').click();
    if (button.hasAttribute('data-image-remove')) {
      content.companies[index].image = null;
      markDirty(); draw();
      root.querySelectorAll('[data-image-upload]')[index].focus();
      return;
    }
    let focusIndex = index;
    if (button.hasAttribute('data-remove')) {
      expanded.delete(id);
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
    (root.querySelectorAll('[data-company-toggle]')[focusIndex] || root.querySelector('[data-add]')).focus();
  };

  const beforeUnload = event => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  root.onsubmit = save;
  root.addEventListener('invalid', revealInvalid, true);
  window.addEventListener('beforeunload', beforeUnload);
  load();
  return () => {
    disposed = true;
    root.onclick = null;
    root.oninput = null;
    root.onchange = null;
    root.onsubmit = null;
    root.removeEventListener('invalid', revealInvalid, true);
    window.removeEventListener('beforeunload', beforeUnload);
  };
}
