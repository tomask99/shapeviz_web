import {svgIcon} from '../ui/icons.js';
import {gallerySort} from './gallery-sort.js';
import {uploadGalleryImage} from './gallery-upload.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));

export function mountGallery({root, api, notify}) {
  let content;
  let dirty = false;
  let busy = false;
  let disposed = false;
  let stopSort = () => {};
  let editId;
  root.innerHTML = `<div class="gallery-editor">
    <div class="gallery-editor-heading"><div><h2>Gallery</h2><p class="fine" id="gallery-instructions">Drag an image to rearrange. With a keyboard, focus an image, press Space and use arrow keys.</p></div><button class="primary" type="button" data-upload>${svgIcon('plus')} Add images</button></div>
    <input type="file" data-files accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden>
    <div class="gallery-dropzone" data-dropzone><span>${svgIcon('upload')} Drop images here or choose Add images</span><small>JPG, PNG, WebP, AVIF · up to 25 MB each</small></div>
    <p data-gallery-error role="alert"></p><p data-progress role="status"></p>
    <div class="gallery-editor-grid" aria-label="Gallery items" aria-describedby="gallery-instructions"></div>
    <p data-empty hidden>Your gallery is empty. Add images to get started.</p>
    <div class="site-editing-save"><p data-gallery-status role="status">Loading gallery...</p><div class="actions"><button class="secondary" type="button" data-gallery-reload>${svgIcon('refresh')} Reload saved gallery</button><button class="primary" type="button" data-gallery-save disabled>Save changes</button></div></div>
    <p class="site-editing-sr" data-announcement aria-live="polite"></p>
    <dialog class="gallery-edit-dialog" aria-labelledby="gallery-edit-title"><form data-edit-form><div class="gallery-dialog-heading"><h2 id="gallery-edit-title">Edit gallery item</h2><button type="button" class="quiet" data-edit-close aria-label="Close image editor">${svgIcon('close')}</button></div><img data-edit-preview alt="Crop preview"><label>Caption<input name="caption" maxlength="120"></label><label>Image description<input name="alt" maxlength="500" required></label><label>Card width<select name="size"><option value="narrow">Standard</option><option value="wide">Wide</option><option value="film">Film</option></select></label><label>Horizontal crop<input name="positionX" type="range" min="0" max="100"></label><label>Vertical crop<input name="positionY" type="range" min="0" max="100"></label><div class="actions"><button type="button" class="secondary" data-edit-close>Cancel</button><button type="submit" class="primary">Apply changes</button></div></form></dialog>
  </div>`;
  const grid = root.querySelector('.gallery-editor-grid');
  const dialog = root.querySelector('dialog');
  const form = root.querySelector('[data-edit-form]');
  const error = root.querySelector('[data-gallery-error]');
  const progress = root.querySelector('[data-progress]');
  const announce = message => {root.querySelector('[data-announcement]').textContent = message;};

  function status() {
    if (disposed) return;
    root.querySelector('[data-gallery-status]').textContent = busy ? 'Working...' : dirty ? 'Unsaved changes' : 'All changes saved';
    root.querySelector('[data-gallery-save]').disabled = busy || !dirty;
    root.querySelector('[data-upload]').disabled = busy || !content || content.items.length >= 100;
    root.querySelector('[data-gallery-reload]').disabled = busy;
    grid.querySelectorAll('button').forEach(button => {button.disabled = busy;});
  }
  function changed() {dirty = true; error.textContent = ''; status();}
  function draw() {
    if (disposed) return;
    stopSort();
    grid.innerHTML = content.items.map((item, index) => `<article class="gallery-editor-card gallery-editor-card--${item.size}" data-id="${escape(item.id)}">
      <img src="${escape(item.type === 'video' ? item.poster : item.src)}" alt="${escape(item.alt)}" draggable="false" style="object-position:${item.positionX}% ${item.positionY}%" loading="lazy">
      <button class="gallery-drag-surface" type="button" data-drag aria-label="Move ${escape(item.alt)}" aria-pressed="false" aria-describedby="gallery-instructions"></button>
      <div class="gallery-card-controls"><div><button type="button" data-edit aria-label="Edit ${escape(item.alt)}">${svgIcon('edit')}</button><button type="button" data-remove aria-label="Remove ${escape(item.alt)} from gallery">${svgIcon('trash')}</button></div></div>
      <div class="gallery-card-caption"><span>${item.type === 'video' ? svgIcon('play') : ''}${escape(item.caption || item.filename)}</span><span data-order>${String(index + 1).padStart(2, '0')}</span></div>
    </article>`).join('');
    root.querySelector('[data-empty]').hidden = content.items.length > 0;
    stopSort = gallerySort({grid, disabled:() => busy, changed, announce, move(from, to) {
      const [item] = content.items.splice(from, 1);
      content.items.splice(to, 0, item);
    }});
    status();
  }
  async function load() {
    if (busy || (dirty && !confirm('Discard your unsaved gallery changes?'))) return;
    busy = true;
    error.textContent = '';
    status();
    try {
      const loaded = await api('site-gallery-list');
      stopSort();
      content = loaded;
      dirty = false;
      draw();
    } catch (failure) {if (!disposed) error.textContent = failure.message;}
    finally {busy = false; status();}
  }
  async function save() {
    if (busy || !dirty) return;
    busy = true;
    status();
    error.textContent = '';
    try {
      const saved = await api('site-gallery-save', {version:content.version, items:content.items});
      content = saved;
      dirty = false;
      if (!disposed) notify('Gallery saved. The website is updated.');
    } catch (failure) {if (!disposed) error.textContent = failure.message;}
    finally {busy = false; status();}
  }
  async function upload(files) {
    if (busy || !content || !files.length) return;
    if (content.items.length + files.length > 100) {error.textContent = 'The gallery can contain up to 100 items.'; return;}
    busy = true;
    error.textContent = '';
    status();
    const failures = [];
    let added = 0;
    for (const [index, file] of [...files].entries()) {
      if (disposed) break;
      progress.textContent = `Uploading ${index + 1} of ${files.length} - ${file.name}`;
      try {
        const item = await uploadGalleryImage(file, api, message => {if (!disposed) progress.textContent = message;});
        if (disposed) break;
        content.items.push(item);
        dirty = true;
        added++;
        draw();
      } catch (failure) {failures.push(`${file.name}: ${failure.message}`);}
    }
    busy = false;
    if (!disposed) {
      progress.textContent = added ? `${added} image${added === 1 ? '' : 's'} added. Save changes to update the website.` : '';
      error.textContent = failures.join(' ');
      status();
    }
  }
  function preview() {
    const image = form.querySelector('[data-edit-preview]');
    image.style.objectPosition = `${form.elements.positionX.value}% ${form.elements.positionY.value}%`;
    image.style.aspectRatio = form.elements.size.value === 'wide' ? '2.4' : '1.2';
  }
  root.onclick = event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-edit-close')) {dialog.close(); return;}
    if (busy) return;
    if (button.hasAttribute('data-upload')) return root.querySelector('[data-files]').click();
    if (button.hasAttribute('data-gallery-save')) return save();
    if (button.hasAttribute('data-gallery-reload')) return load();
    const id = button.closest('[data-id]')?.dataset.id;
    const item = content?.items.find(entry => entry.id === id);
    if (!item) return;
    if (button.hasAttribute('data-remove')) {
      content.items = content.items.filter(entry => entry.id !== id);
      changed();
      draw();
      root.querySelector('[data-upload]').focus();
    }
    if (button.hasAttribute('data-edit')) {
      editId = id;
      for (const name of ['caption', 'alt', 'size', 'positionX', 'positionY']) form.elements[name].value = item[name];
      form.elements.size.disabled = item.type === 'video';
      form.elements.size.querySelector('[value="film"]').hidden = item.type !== 'video';
      form.querySelector('[data-edit-preview]').src = item.poster || item.src;
      preview();
      dialog.showModal();
    }
  };
  form.oninput = preview;
  form.onsubmit = event => {
    event.preventDefault();
    const item = content.items.find(entry => entry.id === editId);
    for (const name of ['caption', 'alt', 'size']) item[name] = form.elements[name].value;
    item.positionX = Number(form.elements.positionX.value);
    item.positionY = Number(form.elements.positionY.value);
    dialog.close();
    changed();
    draw();
    grid.querySelector(`[data-id="${editId}"] [data-edit]`).focus();
  };
  root.querySelector('[data-files]').onchange = event => {
    upload([...event.target.files]);
    event.target.value = '';
  };
  const dropzone = root.querySelector('[data-dropzone]');
  dropzone.ondragover = event => {event.preventDefault(); dropzone.classList.add('is-over');};
  dropzone.ondragleave = () => dropzone.classList.remove('is-over');
  dropzone.ondrop = event => {event.preventDefault(); dropzone.classList.remove('is-over'); upload([...event.dataTransfer.files]);};
  const beforeUnload = event => {if (dirty || busy) {event.preventDefault(); event.returnValue = '';}};
  window.addEventListener('beforeunload', beforeUnload);
  load();
  return () => {
    disposed = true;
    stopSort();
    dialog.close();
    root.onclick = null;
    window.removeEventListener('beforeunload', beforeUnload);
  };
}
