import {svgIcon} from '../ui/icons.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));

export function mountAbout({root, api, notify}) {
  let content, dirty = false, pending = false, disposed = false, locale = 'sk';

  function status() {
    root.querySelector('[data-about-save]').disabled = pending || !dirty;
    root.querySelector('[data-about-reload]').disabled = pending;
    root.querySelector('[data-about-status]').textContent = pending ? 'Saving changes…' : dirty ? 'Unsaved changes' : 'All changes saved';
    root.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = pending; });
  }

  function draw() {
    if (disposed) return;
    root.innerHTML = `<div class="site-about">
      <div class="section-title"><h2>About me</h2></div>
      <p class="fine">Write your full bio in one text box. Separate paragraphs with a blank line.</p>
      <label class="site-about-language">Editing language<select data-about-language><option value="sk" ${locale==='sk'?'selected':''}>Slovak</option><option value="en" ${locale==='en'?'selected':''}>English</option></select></label>
      <form data-about-form>
        ${['sk','en'].map(language => `<fieldset class="site-about-fields" data-locale="${language}" ${language===locale?'':'hidden'}>
          <legend class="site-editing-sr">${language==='sk'?'Slovak':'English'} profile</legend>
          <label for="about-bio-${language}">${language==='sk'?'Text o mne':'About me text'}</label>
          <textarea id="about-bio-${language}" name="${language}-bio" data-field="bio" rows="14" required maxlength="10000">${escape(content.about[language].bio)}</textarea>
        </fieldset>`).join('')}
        <p data-about-error role="alert"></p>
        <div class="site-editing-save"><p data-about-status role="status"></p><div class="actions">
          <button type="button" class="secondary" data-about-reload>${svgIcon('refresh')} Reload saved profile</button>
          <button type="submit" class="primary" data-about-save>Save profile</button>
        </div></div>
      </form>
    </div>`;
    status();
  }

  async function load() {
    if (pending || disposed) return;
    if (dirty && !confirm('Discard your unsaved changes and reload the saved profile?')) return;
    pending = true;
    root.innerHTML = '<p role="status">Loading profile…</p>';
    try {
      content = await api('site-about-list');
      dirty = false;
      pending = false;
      draw();
    } catch (error) {
      if (!disposed) root.innerHTML = `<p role="alert">${escape(error.message)}</p><button type="button" class="secondary" data-about-reload>Retry</button>`;
    } finally { pending = false; }
  }

  function setLanguage(value) {
    locale = value;
    root.querySelector('[data-about-language]').value = value;
    root.querySelectorAll('[data-locale]').forEach(fieldset => { fieldset.hidden = fieldset.dataset.locale !== value; });
  }

  root.onchange = event => { if (event.target.matches('[data-about-language]')) setLanguage(event.target.value); };
  root.oninput = event => {
    const input = event.target;
    if (!input.dataset.field || pending) return;
    content.about[input.closest('[data-locale]').dataset.locale][input.dataset.field] = input.value;
    dirty = true;
    root.querySelector('[data-about-error]').textContent = '';
    status();
  };
  // Reveal the correct language before the browser focuses an invalid field.
  const invalid = event => {
    const language = event.target.closest('[data-locale]')?.dataset.locale;
    if (language) setLanguage(language);
  };
  root.addEventListener('invalid', invalid, true);
  root.onclick = event => { if (event.target.closest('[data-about-reload]')) load(); };
  root.onsubmit = async event => {
    event.preventDefault();
    if (pending || !dirty) return;
    pending = true;
    status();
    root.querySelector('[data-about-error]').textContent = '';
    try {
      content = await api('site-about-save', {version: content.version, about: content.about});
      dirty = false;
      if (!disposed) notify('Profile saved. Both language versions are updated.');
    } catch (error) {
      if (!disposed) root.querySelector('[data-about-error]').textContent = error.message;
    } finally {
      pending = false;
      if (!disposed) status();
    }
  };
  const beforeUnload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  load();
  return () => {
    disposed = true;
    root.onclick = root.oninput = root.onchange = root.onsubmit = null;
    root.removeEventListener('invalid', invalid, true);
    window.removeEventListener('beforeunload', beforeUnload);
  };
}
