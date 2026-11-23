import {withLegalFooter} from './legal.js';
import {services, servicePath} from './services.js';
import {seoMarkup} from './seo.js';
import {svgIcon} from '../../public/ui/icons.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels = {
  en: {skip:'Skip to content', home:'Home', nav:'Main navigation', breadcrumb:'Breadcrumb', language:'Language', services:'Services', work:'Work', contact:'Contact me', scope:'What I can create', process:'How the project develops', brief:'What to include in your brief', faq:'Before we start', related:'Related services', cta:'Discuss your project', portfolio:'Explore selected work', end:'Have a project in mind?', endText:'Share your references, the intended use and the outputs you need. I’ll help you define the production scope.', video:'Milenium furniture animation'},
  sk: {skip:'Prejsť na obsah', home:'Domov', nav:'Hlavná navigácia', breadcrumb:'Navigačná cesta', language:'Jazyk', services:'Služby', work:'Práce', contact:'Napíšte mi', scope:'Čo pre vás vytvorím', process:'Ako prebieha projekt', brief:'Čo uviesť v zadaní', faq:'Pred začiatkom spolupráce', related:'Súvisiace služby', cta:'Prediskutovať projekt', portfolio:'Pozrieť vybrané práce', end:'Máte projekt v hlave?', endText:'Pošlite mi referencie, plánované použitie a požadované výstupy. Pomôžem vám nastaviť rozsah produkcie.', video:'Animácia nábytku Milenium'},
};

export function renderServicePage(service, locale) {
  const copy = service[locale], ui = labels[locale], home = `/${locale}`, image = service.image;
  const inquiryUrl = `${home}?interest=${service.parent || service.id}#project-form`;
  const exampleUrl = service.parent ? `#${copy.stories[0].id}` : home+'#work';
  const related = services.filter(item => item.id !== service.id && (!item.parent || item.parent === (service.parent || service.id)));
  const enlargeLabel = locale === 'sk' ? 'Zväčšiť obrázok' : 'Enlarge image';
  const closeLabel = locale === 'sk' ? 'Zavrieť náhľad' : 'Close enlarged image';
  const paragraph = value => `<p>${escape(value)}</p>`;
  const link = (href, text, className='') => `<a${className ? ` class="${className}"` : ''} href="${href}">${escape(text)}</a>`;
  const modelFigure = ({image: photo, caption, alt}, eager = false, wide = false) => `<figure class="modeling-figure"><a class="service-image" href="${photo.src}" data-service-image aria-label="${enlargeLabel}: ${escape(caption)}"><span class="service-image-clip"><img src="${photo.src}" srcset="${photo.small} ${photo.smallWidth}w, ${photo.src} ${photo.width}w" sizes="${wide ? '(max-width: 1220px) 90vw, 1100px' : service.id === 'marketing' ? (eager ? '(max-width: 600px) 90vw, 30vw' : '(max-width: 359px) 90vw, (max-width: 900px) 45vw, 22vw') : '(max-width: 700px) 90vw, 45vw'}" width="${photo.width}" height="${photo.height}" alt="${escape(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></span><span class="service-image-zoom" aria-hidden="true">${svgIcon('search')}</span></a><figcaption>${escape(caption)}</figcaption></figure>`;
  const modelingStories = (copy.stories || []).map(story => `<section class="service-section modeling-story modeling-story--${story.layout || 'pair'}" aria-labelledby="${story.id}-title"><div class="modeling-story-heading"><p class="modeling-label">${escape(story.label)}</p><h2 id="${story.id}-title">${escape(story.title)}</h2><p class="modeling-story-copy">${escape(story.text)}</p></div><div class="modeling-images">${story.figures.map(item => modelFigure(item, false, story.layout === 'wide')).join('')}</div></section>`).join('');
  return withLegalFooter(`<!doctype html>
<html lang="${locale}"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#000000">
<title>${escape(copy.title)}</title><meta name="description" content="${escape(copy.description)}">
<meta property="og:title" content="${escape(copy.title)}"><meta property="og:description" content="${escape(copy.description)}"><meta property="og:type" content="website">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/service-pages.css">
${seoMarkup({locale,title:copy.title,description:copy.description,service})}
<script src="/i18n/switcher.js" type="module"></script><script src="/site-tracker.js" type="module"></script>
${copy.stories ? '<script src="/service-gallery.js" type="module"></script>' : ''}
</head><body class="service-page${copy.stories ? ' modeling-page' : ''}${service.id === 'visualization' ? ' visualization-page' : ''}${service.id === 'architecture' ? ' architecture-page' : ''}${service.id === 'marketing' ? ' marketing-page' : ''}${service.id === 'websites' ? ' websites-page' : ''}">
${link('#main',ui.skip,'skip-link')}
<header class="site-header">
<a class="brand" href="${home}" aria-label="Shapeviz — ${ui.home}"><img src="/media/shapeviz-logo.webp" alt="Shapeviz" width="1515" height="314"></a>
<nav aria-label="${ui.nav}">${link(home+'#services',ui.services)}${link(home+'#work',ui.work)}${link(locale==='sk'?'/articles?lang=sk':'/articles',locale==='sk'?'Články':'Articles')}${link(inquiryUrl,ui.contact,'nav-contact')}</nav>
<div class="language-switch" role="group" aria-label="${ui.language}">${['sk','en'].map(lang=>`<a href="${servicePath(service,lang)}" data-language="${lang}" lang="${lang}" hreflang="${lang}" aria-label="${lang==='sk'?'Slovenčina':'English'}"${lang===locale?' aria-current="true"':''}>${lang.toUpperCase()}</a>`).join('')}</div>
</header>
<main id="main" class="section-shell">
<nav class="service-breadcrumb" aria-label="${ui.breadcrumb}"><ol><li>${link(home,'Shapeviz')}</li><li aria-current="page">${escape(copy.name)}</li></ol></nav>
<section class="service-hero${copy.heroImages ? ' modeling-hero' : ''}" aria-labelledby="service-title">
<div><p class="micro accent">SHAPEVIZ / ${ui.services.toUpperCase()}</p><h1 id="service-title">${escape(copy.name)}</h1><p class="service-intro">${escape(copy.intro)}</p><div class="service-actions">${link(inquiryUrl,ui.cta,'primary-button')}${link(exampleUrl,ui.portfolio,'service-text-link')}</div></div>
${copy.heroHighlights ? `<aside class="service-highlights" aria-label="${escape(copy.heroNote)}"><p class="modeling-label">${escape(copy.heroNote)}</p><dl>${copy.heroHighlights.map(([title,body])=>`<div><dt>${escape(title)}</dt><dd>${escape(body)}</dd></div>`).join('')}</dl></aside>` : copy.heroImages ? `<div class="modeling-hero-media${copy.heroLayout === 'wide' ? ' service-hero-media--wide' : ''}"><p class="modeling-label">${escape(copy.heroNote)}</p><div class="modeling-images">${copy.heroImages.map(item=>modelFigure(item,true,copy.heroLayout === 'wide')).join('')}</div></div>` : `<figure>${service.video
    ? `<video controls playsinline preload="none" width="${image.width}" height="${image.height}" poster="${image.src}" src="${service.video}" aria-label="${ui.video}">${link(service.video,ui.video)}</video>`
    : `<img src="${image.src}" srcset="${image.small} ${image.smallWidth || 640}w, ${image.src} ${image.width}w" sizes="(max-width: 900px) 90vw, 44vw" width="${image.width}" height="${image.height}" alt="${escape(copy.imageAlt)}" fetchpriority="high" decoding="async">`}
<figcaption>${escape(copy.caption)}</figcaption></figure>`}
</section>
<section class="service-section" aria-labelledby="scope-title"><h2 id="scope-title">${escape(copy.scopeTitle || ui.scope)}</h2><div class="service-columns">${copy.deliverables.map(([heading,body])=>`<article><h3>${escape(heading)}</h3>${paragraph(body)}</article>`).join('')}</div></section>
${modelingStories}
<section class="service-section" aria-labelledby="process-title"><h2 id="process-title">${ui.process}</h2><ol class="service-process">${copy.process.map(([heading,body])=>`<li><h3>${escape(heading)}</h3>${paragraph(body)}</li>`).join('')}</ol></section>
<section class="service-section service-brief" aria-labelledby="brief-title"><h2 id="brief-title">${ui.brief}</h2><div>${paragraph(copy.brief)}${link(inquiryUrl,ui.cta,'service-text-link')}</div></section>
<section class="service-section service-faq" aria-labelledby="faq-title"><h2 id="faq-title">${ui.faq}</h2>${copy.questions.map(([question,answer])=>`<details><summary>${escape(question)}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg></summary>${paragraph(answer)}</details>`).join('')}</section>
<section class="service-section" aria-labelledby="related-title"><h2 id="related-title">${ui.related}</h2><nav class="service-related" aria-label="${ui.related}">${related.map(item=>link(servicePath(item,locale),item[locale].name,'primary-button')).join('')}</nav></section>
<section class="service-section service-cta"><h2>${ui.end}</h2>${paragraph(copy.endText || ui.endText)}${link(inquiryUrl,ui.cta,'primary-button')}</section>
</main><footer class="site-footer section-shell"><span>© SHAPEVIZ</span>${link(home+'#services',ui.services)}${link(inquiryUrl,ui.contact)}</footer>
${copy.stories ? `<dialog class="service-lightbox" aria-label="${enlargeLabel}" aria-describedby="service-lightbox-caption"><button class="service-lightbox-close" type="button" aria-label="${closeLabel}" autofocus>${svgIcon('close')}</button><img alt=""><p id="service-lightbox-caption"></p></dialog>` : ''}
</body></html>`, locale);
}
