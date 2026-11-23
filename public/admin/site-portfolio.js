import {svgIcon} from '../ui/icons.js';
import {uploadGalleryImage} from './gallery-upload.js';
import {renderPortfolioLayout} from '../site/portfolio-layout.js';
import {
  portfolioBlockTypes, portfolioFieldLimit, portfolioImageFields, portfolioLayouts, portfolioLimits, portfolioSettings,
} from '../site/portfolio-fields.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const accept = 'image/jpeg,image/png,image/webp,image/avif';
const actionButton = (name, label, icon, disabled = false) =>
  `<button type="button" class="quiet portfolio-editor-icon" data-${name} aria-label="${label}" title="${label}"${disabled ? ' disabled' : ''}>${svgIcon(icon)}</button>`;

function fields(spec, copy, lang) {
  return spec.map(([name, label, mode]) => {
    const value = escape(copy?.[lang]?.[name]);
    const attributes = `data-copy="${name}" maxlength="${portfolioFieldLimit(mode)}"`;
    const control = ['multiline', 'lines'].includes(mode)
      ? `<textarea ${attributes} rows="${mode === 'lines' ? '2' : '4'}">${value}</textarea>`
      : `<input type="text" ${attributes} value="${value}"${mode === 'url' ? ' inputmode="url" placeholder="https://, /path, #section or mailto:"' : ''}>`;
    return `<label>${label}${control}</label>`;
  }).join('');
}

function options(items) {
  return Object.entries(items).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
}

function move(items, from, to) {
  if (from === to || from < 0 || to < 0 || to >= items.length) return false;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return true;
}

export function mountPortfolio({root, api, notify}) {
  root.innerHTML = `<div class="portfolio-editor">
    <div class="portfolio-editor-toolbar">
      <div><h2>Portfolio</h2><a href="/portfolio" target="_blank" rel="noopener noreferrer">View published portfolio ${svgIcon('arrowUpRight')}</a></div>
      <div class="actions"><div class="portfolio-editor-select"><label for="portfolio-editor-language">Language</label><select id="portfolio-editor-language" data-language><option value="sk">Slovak</option><option value="en">English</option></select></div>
      <button type="button" class="secondary" data-reload>Reload published</button>
      <button type="button" class="primary" data-save disabled>Save and publish</button></div>
    </div>
    <p class="portfolio-editor-status" role="status" data-status>Loading portfolio…</p>
    <p class="portfolio-editor-error" role="alert" data-error hidden></p>
    <div class="portfolio-editor-workspace" hidden>
      <div class="portfolio-editor-controls">
        <fieldset class="portfolio-editor-blocks" aria-label="Portfolio blocks">
          <div class="portfolio-editor-add"><label>Block type<select data-type>${options(Object.fromEntries(Object.entries(portfolioBlockTypes).map(([type, spec]) => [type, spec.label])))}</select></label>
          <button type="button" class="secondary" data-add>${svgIcon('plus')} Add block</button></div>
          <button type="button" class="secondary" data-settings>Page settings</button>
          <ol class="portfolio-editor-order" data-blocks aria-label="Block order"></ol>
        </fieldset>
        <fieldset class="portfolio-editor-fields" data-editor aria-label="Selected block"></fieldset>
      </div>
      <section class="portfolio-editor-preview" aria-label="Live portfolio preview">
        <div class="portfolio-editor-preview-head"><h3>Live preview</h3><div class="portfolio-editor-select"><label for="portfolio-editor-viewport">Viewport</label><select id="portfolio-editor-viewport" data-viewport><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></div></div>
        <div class="portfolio-editor-frame"><iframe title="Portfolio preview" sandbox="allow-same-origin"></iframe></div>
      </section>
    </div>
  </div>`;
  const find = selector => root.querySelector(selector);
  const workspace = find('.portfolio-editor-workspace');
  const order = find('[data-blocks]');
  const editor = find('[data-editor]');
  const frameHost = find('.portfolio-editor-frame');
  const frame = find('iframe');
  const status = find('[data-status]');
  const errorBox = find('[data-error]');
  const saveButton = find('[data-save]');
  const reloadButton = find('[data-reload]');
  const language = find('[data-language]');
  const blockControls = find('.portfolio-editor-blocks');
  let content, version, active, dragging, scrollToBlock;
  let dirty = false;
  let busy = false;
  let disposed = false;
  let previewTimer = 0;

  const currentBlock = () => content?.blocks.find(block => block.id === active);
  const lang = () => language.value;
  const name = block => block.copy?.[lang()]?.title?.trim().split('\n')[0] || portfolioBlockTypes[block.type].label;
  const report = message => { status.textContent = message; };
  function showError(message = '') {
    errorBox.hidden = !message;
    errorBox.textContent = message;
  }

  function syncButtons() {
    saveButton.disabled = busy || !dirty;
    reloadButton.disabled = busy;
    language.disabled = busy;
    blockControls.disabled = busy;
    editor.disabled = busy;
    find('[data-add]').disabled = (content?.blocks.length || 0) >= portfolioLimits.blocks;
  }

  function resizePreview() {
    const viewport = find('[data-viewport]').value === 'mobile' ? 390 : 1280;
    const scale = Math.min(1, frameHost.clientWidth / viewport);
    if (!scale) return;
    frame.style.width = `${viewport}px`;
    frame.style.height = `${frameHost.clientHeight / scale}px`;
    frame.style.transform = `scale(${scale})`;
  }
  const observer = new ResizeObserver(resizePreview);
  observer.observe(frameHost);

  function highlightPreview() {
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.querySelector('[data-portfolio-selected]')?.removeAttribute('data-portfolio-selected');
    const selected = active && doc.getElementById(active);
    if (selected) {
      selected.setAttribute('data-portfolio-selected', '');
      if (scrollToBlock) frame.contentWindow.scrollTo(0, frame.contentWindow.scrollY + selected.getBoundingClientRect().top);
    } else if (scrollToBlock && !active) frame.contentWindow.scrollTo(0, 0);
    if (active && !selected) return;
    scrollToBlock = false;
  }

  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc?.body?.classList.contains('portfolio-page')) return;
    highlightPreview();
    doc.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (link) event.preventDefault();
      const id = event.target.closest('[data-portfolio-block]')?.dataset.portfolioBlock;
      if (id && !busy) select(id, false);
    });
  });

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (disposed || !content) return;
      const html = renderPortfolioLayout(content, lang(), {origin:location.origin, preview:true});
      const doc = frame.contentDocument;
      if (!doc?.body?.classList.contains('portfolio-page')) {
        frame.srcdoc = html;
        return;
      }
      const scrollPosition = frame.contentWindow.scrollY;
      const page = new DOMParser().parseFromString(html, 'text/html');
      doc.documentElement.lang = page.documentElement.lang;
      doc.body.replaceChildren(...page.body.childNodes);
      if (!scrollToBlock) frame.contentWindow.scrollTo(0, scrollPosition);
      highlightPreview();
    }, 160);
  }

  function renderOrder() {
    find('[data-settings]').setAttribute('aria-pressed', String(!active));
    const scrollTop = order.scrollTop;
    order.innerHTML = content.blocks.map((block, index) => `<li data-block="${block.id}">
      <span class="portfolio-editor-grip" draggable="true" aria-hidden="true" title="Drag to reorder">${svgIcon('grip')}</span>
      <button type="button" class="portfolio-editor-block-name" data-select="${block.id}" aria-pressed="${active === block.id}"><strong>${escape(name(block))}</strong>${name(block) === portfolioBlockTypes[block.type].label ? '' : `<small>${portfolioBlockTypes[block.type].label}</small>`}</button>
      <div class="portfolio-editor-moves">${actionButton('earlier', 'Move block up', 'arrowUp', index === 0)}${actionButton('later', 'Move block down', 'arrowDown', index === content.blocks.length - 1)}</div>
    </li>`).join('');
    order.scrollTop = scrollTop;
  }

  function imageEditor(block) {
    const count = block.images.length;
    const spec = portfolioBlockTypes[block.type];
    const rows = block.images.map((image, index) => `<details class="portfolio-editor-image" data-image="${index}">
      <summary><img src="${escape(image.small || image.src)}" alt=""><span>${escape(image.copy?.[lang()]?.caption || image.copy?.[lang()]?.alt || `Image ${index + 1}`)}</span>${svgIcon('chevronDown')}</summary>
      <div class="portfolio-editor-image-fields">${fields(portfolioImageFields, image.copy, lang())}</div>
      <div class="actions portfolio-editor-image-actions">
        <label class="secondary portfolio-editor-upload">Replace image<input type="file" accept="${accept}" data-replace></label>
        ${actionButton('image-earlier', 'Move image up', 'arrowUp', index === 0)}${actionButton('image-later', 'Move image down', 'arrowDown', index === count - 1)}
        <button type="button" class="quiet" data-remove-image>Remove image</button>
      </div></details>`).join('');
    const max = spec.singleImage ? 1 : portfolioLimits.imagesPerBlock;
    return `<div class="portfolio-editor-images"><h4>Images (${count})</h4>${rows}
      ${count < max ? `<label class="secondary portfolio-editor-upload">${svgIcon('plus')} Add images<input type="file" accept="${accept}" data-upload ${spec.singleImage ? '' : 'multiple'}></label>` : ''}</div>`;
  }

  function renderFields(openImage = -1) {
    const block = currentBlock();
    if (!block) {
      editor.innerHTML = `<h3>Page settings</h3><div class="portfolio-editor-logo">
      ${content.logo ? `<img src="${escape(content.logo.small || content.logo.src)}" alt="">` : ''}
      <label class="secondary portfolio-editor-upload">${content.logo ? 'Replace logo' : 'Upload logo'}<input type="file" accept="${accept}" data-logo></label>
      ${content.logo ? '<button type="button" class="quiet" data-remove-logo>Remove logo</button>' : ''}</div>
      <div class="portfolio-editor-copy">${fields(portfolioSettings.slice(0, 6), content.copy, lang())}</div>
      <details class="portfolio-editor-labels"><summary>Navigation and accessibility labels</summary>
      <div class="portfolio-editor-copy">${fields(portfolioSettings.slice(6), content.copy, lang())}</div></details>`;
      return;
    }
    const spec = portfolioBlockTypes[block.type];
    editor.innerHTML = `<div class="portfolio-editor-block-head"><h3>${spec.label}</h3>
      <button type="button" class="quiet" data-remove-block>Remove block</button></div>
      <div class="portfolio-editor-copy">${fields(spec.fields, block.copy, lang())}
      ${spec.layouts ? `<label>Image grid<select data-layout>${options(portfolioLayouts)}</select></label>` : ''}</div>
      ${spec.images ? imageEditor(block) : ''}`;
    if (spec.layouts) editor.querySelector('[data-layout]').value = block.layout;
    if (openImage >= 0) editor.querySelector(`[data-image="${openImage}"]`)?.setAttribute('open', '');
  }

  function select(id, scroll = true) {
    active = id;
    renderOrder();
    renderFields();
    scrollToBlock = scroll;
    highlightPreview();
  }

  function changed() {
    if (!dirty) report('Unsaved changes');
    dirty = true;
    showError();
    syncButtons();
    schedulePreview();
  }

  function reorderBlock(id, target) {
    const from = content.blocks.findIndex(block => block.id === id);
    if (!move(content.blocks, from, target)) return;
    renderOrder();
    changed();
    report(`Block moved to position ${target + 1}. Unsaved changes.`);
    order.querySelector(`[data-select="${id}"]`)?.focus({preventScroll:true});
  }

  order.addEventListener('dragstart', event => {
    if (busy || !event.target.closest('[draggable="true"]')) return;
    dragging = event.target.closest('[data-block]').dataset.block;
    event.dataTransfer.setData('text/plain', dragging);
    event.dataTransfer.effectAllowed = 'move';
  });
  order.addEventListener('dragover', event => {
    const row = event.target.closest('[data-block]');
    if (!dragging || !row) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    order.querySelector('[data-drop-target]')?.removeAttribute('data-drop-target');
    if (row.dataset.block !== dragging) row.setAttribute('data-drop-target', '');
  });
  order.addEventListener('drop', event => {
    if (!dragging) return;
    event.preventDefault();
    const destination = event.target.closest('[data-block]')?.dataset.block;
    reorderBlock(dragging, content.blocks.findIndex(block => block.id === destination));
    dragging = null;
    order.querySelector('[data-drop-target]')?.removeAttribute('data-drop-target');
  });
  order.addEventListener('dragend', () => {
    dragging = null;
    order.querySelector('[data-drop-target]')?.removeAttribute('data-drop-target');
  });

  order.addEventListener('click', event => {
    const command = event.target.closest('button');
    if (!command || busy) return;
    const {block: id} = command.closest('[data-block]').dataset;
    if (command.hasAttribute('data-select')) {
      select(id);
      order.querySelector(`[data-select="${id}"]`)?.focus({preventScroll:true});
      return;
    }
    const from = content.blocks.findIndex(block => block.id === id);
    if (command.hasAttribute('data-earlier')) reorderBlock(id, from - 1);
    if (command.hasAttribute('data-later')) reorderBlock(id, from + 1);
  });

  find('[data-add]').onclick = () => {
    const type = find('[data-type]').value;
    const id = 'block-' + crypto.randomUUID();
    const index = content.blocks.findIndex(block => block.id === active);
    const position = index === -1 ? content.blocks.length : index + 1;
    content.blocks.splice(position, 0, {
      id, type, copy:{sk:{}, en:{}}, images:[], ...(portfolioBlockTypes[type].layouts ? {layout:'pair'} : {}),
    });
    select(id);
    changed();
    (editor.querySelector('[data-copy], input[type="file"]') || order.querySelector(`[data-select="${id}"]`))?.focus();
  };
  find('[data-settings]').onclick = () => select(null);
  language.onchange = () => {
    renderOrder();
    renderFields();
    schedulePreview();
  };
  find('[data-viewport]').onchange = resizePreview;

  editor.addEventListener('input', event => {
    const field = event.target;
    if (!field.dataset.copy || busy) return;
    const card = field.closest('[data-image]');
    const target = card ? currentBlock().images[Number(card.dataset.image)] : currentBlock() || content;
    target.copy[lang()][field.dataset.copy] = field.value;
    if (field.dataset.copy === 'title' && !card && active) renderOrder();
    changed();
  });
  editor.addEventListener('click', event => {
    const command = event.target.closest('button');
    if (!command || busy) return;
    const block = currentBlock();
    if (command.hasAttribute('data-remove-logo')) {
      content.logo = null;
      renderFields();
      changed();
    } else if (command.hasAttribute('data-remove-block')) {
      const index = content.blocks.indexOf(block);
      content.blocks.splice(index, 1);
      select(content.blocks[index]?.id || content.blocks.at(-1)?.id || null);
      changed();
      (order.querySelector(`[data-select="${active}"]`) || find('[data-settings]')).focus();
    } else if (command.closest('[data-image]')) {
      const index = Number(command.closest('[data-image]').dataset.image);
      if (command.hasAttribute('data-remove-image')) {
        block.images.splice(index, 1);
        renderFields();
        changed();
        return;
      }
      const destination = index + (command.hasAttribute('data-image-earlier') ? -1 : 1);
      if (move(block.images, index, destination)) {
        renderFields(destination);
        changed();
        editor.querySelector(`[data-image="${destination}"] summary`)?.focus();
      }
    }
  });

  editor.addEventListener('change', async event => {
    if (busy) return;
    const input = event.target;
    const block = currentBlock();
    if (input.hasAttribute('data-layout')) {
      block.layout = input.value;
      changed();
      return;
    }
    if (input.type !== 'file' || !input.files.length) return;
    const isLogo = input.hasAttribute('data-logo');
    const replaces = input.hasAttribute('data-replace');
    const imageIndex = replaces ? Number(input.closest('[data-image]').dataset.image) : -1;
    const total = content.blocks.reduce((sum, item) => sum + item.images.length, 0);
    const available = !isLogo && !replaces ? Math.min(
      (portfolioBlockTypes[block.type].singleImage ? 1 : portfolioLimits.imagesPerBlock) - block.images.length,
      portfolioLimits.images - total,
    ) : 1;
    const files = [...input.files];
    input.value = '';
    if (files.length > available) {
      showError(`You can add ${Math.max(0, available)} more images here.`);
      return;
    }
    busy = true;
    syncButtons();
    showError();
    let added = 0;
    const errors = [];
    for (const file of files) {
      try {
        report(`Uploading ${file.name}…`);
        const image = await uploadGalleryImage(file, api, report, 'site-portfolio-upload');
        if (disposed) return;
        const media = {src:image.full, small:image.src, width:image.width, height:image.height,
          smallWidth:Math.max(1, Math.round(image.width * Math.min(1, 800 / Math.max(image.width, image.height)))),
          copy:{sk:{}, en:{}},
        };
        if (isLogo) content.logo = media;
        else if (replaces) block.images[imageIndex] = {...media, copy:block.images[imageIndex].copy};
        else block.images.push(media);
        added++;
      } catch (error) {
        if (disposed) return;
        errors.push(`${file.name}: ${error.message}`);
      }
    }
    busy = false;
    if (added) {
      renderFields(imageIndex);
      changed();
      report(`${added} ${added === 1 ? 'image uploaded' : 'images uploaded'}. Unsaved changes.`);
    } else {
      syncButtons();
      report(dirty ? 'Unsaved changes' : 'Published portfolio loaded');
    }
    if (errors.length) showError(errors.join(' '));
  });

  async function load() {
    busy = true;
    syncButtons();
    showError();
    report('Loading portfolio…');
    try {
      const saved = await api('site-portfolio-list');
      if (disposed) return;
      ({content, version} = saved);
      dirty = false;
      workspace.hidden = false;
      active = content.blocks[0]?.id || null;
      renderOrder();
      renderFields();
      schedulePreview();
      report('Published portfolio loaded');
    } catch (error) {
      if (disposed) return;
      showError(error.message);
      report(dirty ? 'Unsaved changes' : 'Portfolio could not be loaded');
    } finally {
      busy = false;
      if (!disposed) syncButtons();
    }
  }

  reloadButton.onclick = () => {
    if (dirty && !window.confirm('Discard unsaved changes and reload the published portfolio?')) return;
    void load();
  };
  saveButton.onclick = async () => {
    busy = true;
    syncButtons();
    showError();
    report('Publishing portfolio…');
    try {
      const saved = await api('site-portfolio-save', {content, version});
      if (disposed) return;
      ({content, version} = saved);
      dirty = false;
      renderOrder();
      renderFields();
      schedulePreview();
      report('Portfolio published');
      notify('Portfolio published.');
    } catch (error) {
      if (disposed) return;
      showError(error.status === 413 ? 'The portfolio is too large. Shorten the text or remove some images.' : error.message);
      report('Unsaved changes');
    } finally {
      busy = false;
      if (!disposed) syncButtons();
    }
  };

  function beforeUnload(event) {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  window.addEventListener('beforeunload', beforeUnload);
  void load();
  return () => {
    disposed = true;
    clearTimeout(previewTimer);
    observer.disconnect();
    window.removeEventListener('beforeunload', beforeUnload);
  };
}
