import {svgIcon} from '../ui/icons.js';
import {translate} from '../i18n/messages.js';
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
  return `<img draggable="false" src="${escape(imageSource(photo))}"${srcset} width="${Number(photo.width)}" height="${Number(photo.height)}" alt="${escape(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

function figure(photo, copy, labels, sizes, {eager = false, preview = true, slide = false} = {}) {
  const alt = clean(copy.alt) || clean(copy.caption);
  const description = alt ? ': ' + alt : '';
  const url = portfolioLink(clean(copy.url));
  const external = /^https?:\/\//i.test(url);
  const render = picture(photo, alt, sizes, eager);
  if (!preview && !url) return `<figure>${render}</figure>`;
  const gallery = slide ? ` data-portfolio-slide="${escape(imageSource(photo))}" style="--photo-ratio:${Number(photo.width) / Number(photo.height)}"` : '';
  const linkIcon = url ? `<span class="service-image-zoom" aria-hidden="true">${svgIcon('arrowUpRight')}</span>` : '';
  return `<figure><a class="service-image" draggable="false" href="${escape(url || imageSource(photo))}"${gallery}${url ? (external ? ' target="_blank" rel="noopener noreferrer"' : '') : ' data-service-image'} aria-label="${escape((url ? labels.openLink : labels.enlarge) + description)}"><span class="service-image-clip">${render}</span>${linkIcon}</a></figure>`;
}

function list(value, label) {
  const items = clean(value).split(/\r?\n/).map(clean).filter(Boolean);
  return items.length ? `<ul${label ? ` aria-label="${escape(label)}"` : ''}>${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : '';
}

function projectContributions(value, label) {
  const entries = clean(value).split(/\r?\n/).map(clean).filter(Boolean);
  if (!entries.length) return '';
  const rows = entries.map(entry => {
    const split = entry.indexOf(' — ');
    if (split < 0) return `<li>${escape(entry)}</li>`;
    return `<li><span>${escape(entry.slice(0, split))}</span> <span class="portfolio-tool-name">${escape(entry.slice(split + 3))}</span></li>`;
  });
  return `<div class="portfolio-contributions">${label ? `<span class="portfolio-meta-label">${escape(label)}</span>` : ''}<ul${label ? ` aria-label="${escape(label)}"` : ''}>${rows.join('')}</ul></div>`;
}

export function renderPortfolioLayout(content, locale, {origin, preview = false} = {}) {
  const sk = locale === 'sk';
  const t = value => escape(translate(value, locale));
  const copy = item => Object.fromEntries(Object.entries(item.copy?.[locale] ?? {}).map(([key, value]) => [key, clean(value)]));
  const settings = copy(content);
  const labels = {
    enlarge: settings.enlarge || (sk ? 'Zväčšiť obrázok' : 'Enlarge image'),
    close: settings.close || (sk ? 'Zavrieť náhľad' : 'Close preview'),
    openLink: settings.openLink || (sk ? 'Otvoriť odkaz obrázka' : 'Open image link'),
    previous: settings.previousImage || (sk ? 'Predchádzajúci obrázok' : 'Previous image'),
    next: settings.nextImage || (sk ? 'Nasledujúci obrázok' : 'Next image'),
  };
  const blocks = content.blocks.map(block => ({...block, fields: copy(block)}));
  const intro = blocks.find(block => block.type === 'intro');
  const landing = intro && intro === blocks[0];
  const projects = blocks.find(block => block.type === 'index' && (block.fields.title || blocks.some(other => other.type === 'project' && other.fields.title)))
    ?? blocks.find(block => block.type === 'project' && (block.fields.title || block.images.length));
  let primaryHeading = false;
  const projectLinks = blocks.filter(({type, fields}) => type === 'project' && fields.title)
    .map(({id, fields, images}) => {
      const preview = images[0] ? picture(images[0], '', '44px', false) : '';
      return `<a href="#${escape(id)}">${preview}<span>${escape(fields.title)}</span>${svgIcon('arrowDown')}</a>`;
    }).join('');
  const cover = blocks.find(block => block.type === 'cover' && block.images.length)?.images[0];
  const fullWidth = '100vw';
  const pair = '(max-width: 950px) 44vw, 29vw';
  const tight = '(max-width: 700px) 44vw, (max-width: 950px) 29vw, 20vw';
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
        if (landing && block === intro) {
          primaryHeading = true;
          return `<section id="${escape(block.id)}" data-portfolio-block="${escape(block.id)}" class="hero-stage" aria-labelledby="hero-heading">
            <div class="hero">
              <div class="hero-backdrop" aria-hidden="true">
                <img src="/media/hero-wireframe-1920.webp" srcset="/media/hero-wireframe-960.webp 960w, /media/hero-wireframe-1920.webp 1920w" sizes="100vw" width="1920" height="2339" alt="" fetchpriority="high" decoding="async" draggable="false">
                <img class="hero-wireframe" data-src="/media/hero-background-01-1920.webp" data-srcset="/media/hero-background-01-960.webp 960w, /media/hero-background-01-1920.webp 1920w" sizes="100vw" width="1920" height="2339" alt="" decoding="async" draggable="false">
              </div>
              <div class="hero-top micro hero-fade"><span><i class="status-dot"></i> ${t('A VISUAL STUDIO')}</span><span>${t('IDEAS INTO IMPACT.')}</span></div>
              <div class="hero-title-wrap"><div class="hero-annotation micro hero-fade"><span>${t('FORM. FEELING. IDENTITY.')}</span><span class="accent">${t('( HERE TO CREATE )')}</span></div>
                <div id="hero-title" aria-hidden="true">${Array.from('PORTFOLIO', letter => `<span>${letter}</span>`).join('')}</div>
                <div class="hero-title-line hero-fade"></div>
              </div>
              <div class="hero-bottom hero-fade"><div><p>${t('I create visuals')} <span>${t('that stay with you.')}</span></p><h1 id="hero-heading" class="hero-specialties"><span class="sr-only">Portfolio. </span>${t('I create 3D models, visualizations & videos.')}</h1></div>
                ${projects ? `<a class="scroll-link micro" href="#${escape(projects.id)}">${t('SCROLL TO EXPLORE')} <span class="circle-arrow" aria-hidden="true">${svgIcon('arrowDown','arrow-icon')}</span></a>` : ''}
              </div>
            </div></section>`;
        }
        const headline = [f.title ? lines(f.title) : '', f.secondTitle ? `<span>${lines(f.secondTitle)}</span>` : ''].filter(Boolean).join('<br>');
        const tag = primaryHeading ? 'h2' : 'h1';
        if (headline) primaryHeading = true;
        const bottom = text || introLink ? `<div class="portfolio-intro-bottom">${text}${introLink}</div>` : '';
        return section(block, 'portfolio-intro portfolio-shell', kicker(f.kicker) + (headline ? `<${tag}>${headline}</${tag}>` : '') + bottom);
      }
      case 'cover':
        return section(block, 'portfolio-cover', images.length ? photo(images[0], fullWidth, {eager: images[0] === cover}) : '');
      case 'services': {
        const columns = [kicker(f.kicker) + title + text, kicker(f.secondKicker) + heading('h2', f.secondTitle) + paragraphs(f.secondText)]
          .filter(Boolean).map(column => `<div>${column}</div>`).join('');
        return section(block, 'portfolio-services portfolio-shell', columns, f.sectionLabel);
      }
      case 'index': {
        const label = settings.projectIndex || (sk ? 'Prejsť na projekt' : 'Jump to project');
        return section(block, 'portfolio-shell portfolio-index',
          title +
          (projectLinks ? `<nav class="portfolio-project-index" aria-label="${escape(label)}">${projectLinks}</nav>` : ''));
      }
      case 'project': {
        const layout = Object.hasOwn(portfolioLayouts, block.layout) ? block.layout : 'pair';
        const credit = f.credit ? `<div class="portfolio-credit">${settings.credit ? `<span class="portfolio-meta-label">${escape(settings.credit)}</span> ` : ''}${escape(f.credit)}</div>` : '';
        const caption = kicker(f.kicker) + heading('h3', f.title);
        const detail = text + credit + projectContributions(f.items, settings.contribution) + link(f.button, f.url, 'portfolio-original', 'arrowUpRight');
        const header = caption || detail ? `<div class="portfolio-project-heading">${caption ? `<div>${caption}</div>` : ''}${detail ? `<div class="portfolio-project-copy">${detail}</div>` : ''}</div>` : '';
        const grid = images.map((image, index) => {
          const lead = layout === 'wide' || (layout === 'architecture' && index === 0);
          const sizes = lead ? '(max-width: 950px) 92vw, 62vw' :
            ['compact', 'architecture', 'triptych'].includes(layout) ? tight : pair;
          return photo(image, 'auto, ' + sizes, {slide: true});
        }).join('');
        return section(block, `portfolio-project portfolio-shell portfolio-project--${layout}`, header + (grid ? `<div class="portfolio-grid">${grid}</div>` : ''), f.title);
      }
      case 'about': {
        const firstList = list(f.items);
        const secondList = list(f.secondItems);
        const tools = (firstList ? heading('h3', f.itemsTitle) + firstList : '') + (secondList ? heading('h3', f.secondItemsTitle) + secondList : '');
        const detail = kicker(f.kicker) + title + text + (tools ? `<div class="portfolio-tools">${tools}</div>` : '');
        const portrait = images.length ? `<div class="portfolio-portrait">${photo(images[0], '(max-width: 700px) 80vw, 30vw', {preview: false})}</div>` : '';
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

  const rendered = blocks.filter((block, i) => !(i > 0 && block.type === 'cover' && blocks[i - 1] === intro))
    .map(block => ({...block, html: renderBlock(block)})).filter(block => block.html);
  const sections = rendered.map(block => block.html);
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
  const studioHeader = `<header class="site-header">
    <a class="brand" href="/${locale}" aria-label="${t('Shapeviz — home')}"><img src="/media/shapeviz-logo.webp" alt="Shapeviz" width="360" height="75"></a>
    <nav aria-label="${t('Main navigation')}"><a href="/${locale}#about">${t('Studio')}</a><a href="/${locale}#services">${t('Services')}</a><a href="/${locale}#work">${t('Work')}</a><a href="/articles${sk ? '?lang=sk' : ''}">${t('Articles')}</a><span class="shop-nav" data-shop-nav aria-disabled="true">${t('Shop')} <small>${t('Coming soon')}</small></span><a class="nav-contact" href="/${locale}#contact">${t('Contact me')} <span aria-hidden="true">${svgIcon('arrowUpRight','arrow-icon')}</span></a></nav>
    <div class="language-switch" role="group" aria-label="${t('Language')}">${language}</div></header>`;
  const pageUrl = origin + (sk ? '/portfolio' : '/portfolio?lang=en');
  const description = escape(settings.description);
  const socialImage = cover ? new URL(imageSource(cover), origin).href : '';
  const pageTitle = escape(settings.title || 'Portfolio');
  const footer = settings.footer ? `<span>${escape(settings.footer.replaceAll('{year}', new Date().getFullYear()))}</span>` : '';
  const gallery = rendered.some(block => block.html.includes(' data-service-image'));
  const modal = gallery && !preview ? `<dialog class="service-lightbox portfolio-viewer" aria-label="${escape(labels.enlarge)}">
    <button class="portfolio-viewer-photo" type="button" aria-label="${escape(labels.close)}" autofocus><img draggable="false" alt=""></button>
    <div class="portfolio-viewer-nav" data-gallery-nav hidden>
      <button type="button" data-gallery-prev aria-label="${escape(labels.previous)}">${svgIcon('arrowLeft')}</button>
      <button type="button" data-gallery-next aria-label="${escape(labels.next)}">${svgIcon('arrowRight')}</button>
    </div>
    <div class="portfolio-viewer-description"><p id="service-lightbox-caption" hidden></p><span data-gallery-count aria-live="polite" hidden></span></div>
  </dialog>` : '';
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle}</title><meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#000000">
<link rel="canonical" href="${pageUrl}"><meta property="og:url" content="${pageUrl}"><meta property="og:type" content="website"><meta property="og:title" content="${pageTitle}">
${description ? `<meta name="description" content="${description}"><meta property="og:description" content="${description}">` : ''}
${socialImage ? `<meta property="og:image" content="${escape(socialImage)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/service-pages.css"><link rel="stylesheet" href="/portfolio.css">
${preview ? '<style>html{background:var(--bg);scroll-behavior:auto}[data-portfolio-selected]{outline:2px solid var(--accent);outline-offset:-2px}</style>' : landing ? '<script type="module" src="/site/hero-motion.js"></script>' : '<link rel="stylesheet" href="/cursor.css"><script type="module" src="/admin/cursor.js"></script>'}
${gallery && !preview ? '<script type="module" src="/service-gallery.js"></script>' : ''}
${landing && !preview ? '<script type="module" src="/shop/nav.js"></script>' : ''}
</head><body class="portfolio-page">
${settings.skip ? `<a href="#main" class="skip-link">${escape(settings.skip)}</a>` : ''}
${landing ? '<div id="fluid-glow" aria-hidden="true"><div class="glow-head"></div><div class="glow-tail"></div></div><div class="reading-progress" aria-hidden="true"></div>' + studioHeader : logo || nav || language ? `<header class="portfolio-header">${logo}${nav ? `<nav aria-label="${escape(settings.menu || (sk ? 'Navigácia' : 'Navigation'))}">${nav}</nav>` : ''}${language ? `<div class="portfolio-languages" role="group" aria-label="${escape(settings.language || (sk ? 'Jazyk' : 'Language'))}">${language}</div>` : ''}</header>` : ''}
<main id="main">${sections.join('\n')}</main>
<footer class="portfolio-footer portfolio-shell">${footer}${link(settings.back, '#main', '', 'arrowUp')}</footer>${modal}
</body></html>`;
}
