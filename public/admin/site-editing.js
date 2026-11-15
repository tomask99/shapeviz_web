import {svgIcon} from '../ui/icons.js';
import {mountCompanies} from './site-companies.js';
import {mountGallery} from './site-gallery.js';

export function mountSiteEditing({root, api, notify}) {
  root.innerHTML = `<div class="site-editing">
    <div class="page-heading"><div><p class="eyebrow">WEBSITE</p><h1>Site Editing<span>.</span></h1></div><a class="secondary" href="/#work" target="_blank" rel="noopener">View website ${svgIcon('arrowUpRight')}</a></div>
    <div class="site-editing-tabs" role="tablist" aria-label="Site sections">
      <button type="button" role="tab" id="companies-tab" aria-controls="companies-panel" aria-selected="true">Companies</button>
      <button type="button" role="tab" id="gallery-tab" aria-controls="gallery-panel" aria-selected="false" tabindex="-1">Gallery</button>
    </div>
    <section id="companies-panel" role="tabpanel" aria-labelledby="companies-tab"></section>
    <section id="gallery-panel" role="tabpanel" aria-labelledby="gallery-tab" hidden></section>
  </div>`;
  const cleanups = [mountCompanies({root:root.querySelector('#companies-panel'), api, notify})];
  const container = root.querySelector('.site-editing');
  const stopEvent = event => event.stopPropagation();
  for (const name of ['click', 'input', 'change', 'submit']) container.addEventListener(name, stopEvent);
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  let galleryMounted = false;
  function select(tab) {
    tabs.forEach(button => {
      const active = button === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      root.querySelector('#' + button.getAttribute('aria-controls')).hidden = !active;
    });
    if (tab.id === 'gallery-tab' && !galleryMounted) {
      galleryMounted = true;
      cleanups.push(mountGallery({root:root.querySelector('#gallery-panel'), api, notify}));
    }
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => select(tab);
    tab.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + 1) % tabs.length];
      select(next);
      next.focus();
    };
  });
  return () => cleanups.forEach(cleanup => cleanup());
}
