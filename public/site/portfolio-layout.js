import {svgIcon} from '../ui/icons.js';
import {portfolioLanguages, portfolioLayouts, portfolioLink} from './portfolio-fields.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const clean = value => typeof value === 'string' ? value.trim() : '';
const lines = value => escape(value).replace(/\r?\n/g, '<br>');
const paragraphs = value => value ? clean(value).split(/\r?\n\s*\r?\n/).map(p => `<p>${lines(p)}</p>`).join('') : '';
const kicker = value => value ? `<p class="portfolio-kicker">${escape(value)}</p>` : '';
const relativeOrAbsolute = url => /^\//.test(url) ? url : /^https?:/i.test(url) ? url : '';
const imageSource = image => relativeOrAbsolute(image.src ?? '');

function link(label, destination, className, icon) {
  const url = portfolioLink(clean(destination));
  if (!clean(label) || !url) return '';
  const external = /^https?:\/\//i.test(url);
  return `<a class="${className}" href="${escape(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(label)}${icon ? svgIcon(icon) : ''}</a>`;
}

function picture(photo, alt, sizes, eager) {
  const srcset = photo.small && photo.smallWidth < photo.width
    ? ` srcset="${escape(relativeOrAbsolute(photo.small))} ${Number(photo.smallWidth)}w, ${escape(imageSource(photo))} ${Number(photo.width)}w" sizes="${sizes}"`
    : '';
  return `<img src="${escape(imageSource(photo))}"${srcset} width="${Number(photo.width)}" height="${Number(photo.height)}" alt="${escape(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

function figure(photo, copy, labels, sizes, {eager = false, preview = true, slide = false} = {}) {
  const alt = clean(copy.alt) || clean(copy.caption);
  const caption = clean(copy.caption) ? `<figcaption>${escape(copy.caption)}</figcaption>` : '';
  const description = alt ? ': ' + alt : '';
  const url = portfolioLink(clean(copy.url));
  const external = /^https?:\/\//i.test(url);
  const render = picture(photo, alt, sizes, eager);
  if (!preview && !url) return `<figure>${render}${caption}</figure>`;
  const gallery = slide ? ` data-portfolio-slide="${escape(imageSource(photo))}"${url ? ' data-portfolio-link' : ''}` : '';
  return `<figure><a class="service-image" href="${escape(url || imageSource(photo))}"${gallery}${url ? (external ? ' target="_blank" rel="noopener noreferrer"' : '') : ' data-service-image'} aria-label="${escape((url ? labels.openLink : labels.enlarge) + description)}"><span class="service-image-clip">${render}</span><span class="service-image-zoom" aria-hidden="true">${svgIcon(url ? 'arrowUpRight' : 'search')}</span></a>${caption}</figure>`;
}

function list(value, label) {
  const items = clean(value).split(/\r?\n/).map(clean).filter(Boolean);
  return items.length ? `<ul${label ? ` aria-label="${escape(label)}"` : ''}>${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : '';
}

export function renderPortfolioLayout(content, locale, {origin, preview = false} = {}) {
  const sk = locale === 'sk';
  const copy = item => Object.fromEntries(Object.entries(item.copy?.[locale] ?? {}).map(([key, value]) => [key, clean(value)]));
  const settings = copy(content);
  const labels = {
    enlarge: settings.enlarge || (sk ? 'Zväčšiť obrázok' : 'Enlarge image'),
    close: settings.close || (sk ? 'Zavrieť náhľad' : 'Close preview'),
    openLink: settings.openLink || (sk ? 'Otvoriť odkaz obrázka' : 'Open image link'),
    gallery: settings.gallery || (sk ? 'Otvoriť galériu' : 'Open gallery'),
    details: settings.projectDetails || (sk ? 'O projekte' : 'Project details'),
    previous: settings.previousImage || (sk ? 'Predchádzajúci obrázok' : 'Previous image'),
    next: settings.nextImage || (sk ? 'Nasledujúci obrázok' : 'Next image'),
  };
  const blocks = content.blocks.map(block => ({...block, fields: copy(block)}));
  let primaryHeading = false;
  const projectLinks = blocks.filter(({type, fields}) => type === 'project' && fields.title)
    .map(({id, fields}) => `<a href="#${escape(id)}">${escape(fields.title)}</a>`).join('');
  const cover = blocks.find(block => block.type === 'cover' && block.images.length)?.images[0];
  const cardSize = '(max-width: 355px) 90vw, (max-width: 900px) 47vw, (max-width: 1450px) 32vw, 420px';
  const photo = (image, sizes, options) => figure(image, copy(image), labels, sizes, options);
  const heading = (tag, value) => value ? `<${tag}>${lines(value)}</${tag}>` : '';
  const section = (block, css, body, label = '') => body
    ? `<section id="${escape(block.id)}" data-portfolio-block="${escape(block.id)}" class="${css}"${label ? ` aria-label="${escape(label)}"` : ''}${block.type === 'project' && block.images.length ? ` data-portfolio-gallery="${escape(label)}"` : ''}>${body}</section>`
    : '';

  function renderBlock(block) {
    const {type, fields: f, images} = block;
    const introLink = link(f.button, f.url, 'portfolio-work-link', 'arrowDown');
    const title = heading('h2', f.title);
    const text = paragraphs(f.text);
    switch (type) {
      case 'intro': {
        const headline = [f.title ? lines(f.title) : '', f.secondTitle ? `<span>${lines(f.secondTitle)}</span>` : ''].filter(Boolean).join('<br>');
        const tag = primaryHeading ? 'h2' : 'h1';
        if (headline) primaryHeading = true;
        const bottom = text || introLink ? `<div class="portfolio-intro-bottom">${text}${introLink}</div>` : '';
        return section(block, 'portfolio-intro portfolio-shell', kicker(f.kicker) + (headline ? `<${tag}>${headline}</${tag}>` : '') + bottom);
      }
      case 'cover':
        return section(block, 'portfolio-cover portfolio-shell', images.length
          ? photo(images[0], '(max-width: 740px) 94vw, (max-width: 1440px) 62vw, 850px', {eager: images[0] === cover}) : '');
      case 'services': {
        const columns = [kicker(f.kicker) + title + text, kicker(f.secondKicker) + heading('h2', f.secondTitle) + paragraphs(f.secondText)]
          .filter(Boolean).map(column => `<div>${column}</div>`).join('');
        return section(block, 'portfolio-services portfolio-shell', columns, f.sectionLabel);
      }
      case 'index': {
        const label = settings.projectIndex || (sk ? 'Prejsť na projekt' : 'Jump to project');
        return section(block, 'portfolio-shell portfolio-index',
          (title ? `<div class="portfolio-section-label">${title}</div>` : '') +
          (projectLinks ? `<details class="portfolio-index-menu"><summary>${escape(label)}${svgIcon('chevronDown')}</summary><nav class="portfolio-project-index" aria-label="${escape(label)}">${projectLinks}</nav></details>` : ''));
      }
      case 'project': {
        const layout = Object.hasOwn(portfolioLayouts, block.layout) ? block.layout : 'pair';
        const credit = f.credit ? `<p class="portfolio-credit">${settings.credit ? escape(settings.credit) + ': ' : ''}${escape(f.credit)}</p>` : '';
        const [first, ...remaining] = images;
        const title = first && f.title
          ? `<h3><a href="${escape(imageSource(first))}" data-portfolio-open-gallery>${lines(f.title)}</a></h3>`
          : heading('h3', f.title);
        const caption = kicker(f.kicker) + title;
        const detail = text + credit + list(f.items, settings.contribution) + link(f.button, f.url, 'portfolio-original', 'arrowUpRight');
        const cover = first ? `<div class="portfolio-project-cover">${photo(first, cardSize, {slide:true})}</div>` : '';
        const gallery = first && images.length > 1
          ? `<a class="portfolio-card-gallery" href="${escape(imageSource(first))}" data-portfolio-open-gallery aria-label="${escape(f.title ? labels.gallery + ': ' + f.title : labels.gallery)}">${svgIcon('overview')}<span aria-hidden="true">${images.length}</span></a>`
          : '';
        const header = caption || gallery ? `<div class="portfolio-project-heading"><div>${caption}</div>${gallery}</div>` : '';
        const grid = remaining.map(image => photo(image, '(max-width: 600px) 42vw, 220px', {slide:true})).join('');
        const more = detail || grid ? `<details class="portfolio-project-details"><summary>${escape(labels.details)}${svgIcon('chevronDown')}</summary>${detail ? `<div class="portfolio-project-copy">${detail}</div>` : ''}${grid ? `<div class="portfolio-grid">${grid}</div>` : ''}</details>` : '';
        return section(block, `portfolio-project portfolio-project--${layout}`, cover + header + more, f.title);
      }
      case 'about': {
        const firstList = list(f.items);
        const secondList = list(f.secondItems);
        const tools = (firstList ? heading('h3', f.itemsTitle) + firstList : '') + (secondList ? heading('h3', f.secondItemsTitle) + secondList : '');
        const detail = kicker(f.kicker) + title + text + (tools ? `<div class="portfolio-tools">${tools}</div>` : '');
        const portrait = images.length ? `<div class="portfolio-portrait">${photo(images[0], '(max-width: 700px) 80vw, 30vw', {preview:false})}</div>` : '';
        return section(block, 'portfolio-about portfolio-shell', portrait + (detail ? `<div>${detail}</div>` : ''), f.title);
      }
      case 'contact':
        return section(block, 'portfolio-contact portfolio-shell', kicker(f.kicker) + title + text +
          link(f.button, f.url, 'portfolio-email', 'arrowUpRight') + link(f.secondButton, f.secondUrl, 'portfolio-form-link'));
      case 'text':
        return section(block, 'portfolio-text portfolio-shell', kicker(f.kicker) + title + text +
          link(f.button, f.url, 'portfolio-original', 'arrowUpRight'));
      default:
        return '';
    }
  }

  const rendered = blocks.map(block => ({...block, html: renderBlock(block)})).filter(block => block.html);
  const flow = [];
  for (let i = 0; i < rendered.length; i++) {
    const block = rendered[i];
    if (block.type === 'intro' && rendered[i + 1]?.type === 'cover') {
      flow.push(`<div class="portfolio-hero portfolio-shell">${block.html}${rendered[++i].html}</div>`);
    } else if (block.type === 'project') {
      const cards = [block.html];
      while (rendered[i + 1]?.type === 'project') cards.push(rendered[++i].html);
      flow.push(`<div class="portfolio-projects portfolio-shell">${cards.join('')}</div>`);
    } else flow.push(block.html);
  }
  const nav = rendered.filter(block => block.fields.nav).map(block => `<a href="#${escape(block.id)}">${escape(block.fields.nav)}</a>`).join('');
  const brand = content.logo ? picture(content.logo, settings.brand, '142px', true) : escape(settings.brand);
  const brandUrl = portfolioLink(settings.brandUrl);
  const logo = brand && (brandUrl
    ? `<a class="portfolio-brand" href="${escape(brandUrl)}" aria-label="${escape(settings.brand || 'Shapeviz')}">${brand}</a>`
    : `<span class="portfolio-brand">${brand}</span>`);
  const language = portfolioLanguages.flatMap(lang => {
    const name = settings[lang + 'Name'];
    const label = settings[lang + 'Link'];
    return label ? [`<a href="/portfolio${lang === 'en' ? '?lang=en' : ''}" lang="${lang}"${name ? ` aria-label="${escape(name)}"` : ''}${lang === locale ? ' aria-current="true"' : ''}>${escape(label)}</a>`] : [];
  }).join('');
  const pageUrl = origin + (sk ? '/portfolio' : '/portfolio?lang=en');
  const description = escape(settings.description);
  const socialImage = cover ? new URL(imageSource(cover), origin).href : '';
  const pageTitle = escape(settings.title || 'Portfolio');
  const footer = settings.footer ? `<span>${escape(settings.footer.replaceAll('{year}', new Date().getFullYear()))}</span>` : '';
  const gallery = rendered.some(block => / data-service-image| data-portfolio-open-gallery/.test(block.html));
  const modal = gallery && !preview ? `<dialog class="service-lightbox portfolio-viewer" aria-label="${escape(labels.enlarge)}">
    <header class="portfolio-viewer-head"><span data-gallery-title></span><button class="service-lightbox-close" type="button" aria-label="${escape(labels.close)}" autofocus>${svgIcon('close')}</button></header>
    <div class="portfolio-viewer-stage"><img alt=""><div class="portfolio-viewer-nav" data-gallery-nav hidden>
      <button type="button" data-gallery-prev aria-label="${escape(labels.previous)}">${svgIcon('arrowLeft')}</button>
      <button type="button" data-gallery-next aria-label="${escape(labels.next)}">${svgIcon('arrowRight')}</button>
    </div></div>
    <footer class="portfolio-viewer-meta"><p id="service-lightbox-caption" hidden></p><a data-gallery-link hidden>${escape(labels.openLink)}${svgIcon('arrowUpRight')}</a><span data-gallery-count aria-live="polite" hidden></span></footer>
  </dialog>` : '';
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle}</title><meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#11100e">
<link rel="canonical" href="${pageUrl}"><meta property="og:url" content="${pageUrl}"><meta property="og:type" content="website"><meta property="og:title" content="${pageTitle}">
${description ? `<meta name="description" content="${description}"><meta property="og:description" content="${description}">` : ''}
${socialImage ? `<meta property="og:image" content="${escape(socialImage)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/service-pages.css"><link rel="stylesheet" href="/portfolio.css">
${preview ? '<style>html{background:#11100e;scroll-behavior:auto}[data-portfolio-selected]{outline:2px solid #ff9d57;outline-offset:-2px}</style>' : gallery ? '<script type="module" src="/service-gallery.js"></script>' : ''}
</head><body class="portfolio-page">
${settings.skip ? `<a href="#main" class="skip-link">${escape(settings.skip)}</a>` : ''}
${logo || nav || language ? `<header class="portfolio-header portfolio-shell">${logo}${nav ? `<nav aria-label="${escape(settings.menu || (sk ? 'Navigácia' : 'Navigation'))}">${nav}</nav>` : ''}${language ? `<div class="portfolio-languages" role="group" aria-label="${escape(settings.language || (sk ? 'Jazyk' : 'Language'))}">${language}</div>` : ''}</header>` : ''}
<main id="main">${flow.join('\n')}</main>
<footer class="portfolio-footer portfolio-shell">${footer}${link(settings.back, '#main', '', 'arrowUp')}</footer>${modal}
</body></html>`;
}
