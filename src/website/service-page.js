import {services, servicePath} from './services.js';
import {seoMarkup} from './seo.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels = {
  en: {skip:'Skip to content', home:'Home', nav:'Main navigation', breadcrumb:'Breadcrumb', language:'Language', services:'Services', work:'Work', contact:'Let’s talk', scope:'What we can create', process:'How the project develops', brief:'What to include in your brief', faq:'Before we start', related:'Related services', cta:'Discuss your project', portfolio:'Explore selected work', end:'Have a project in mind?', endText:'Share your references, the intended use and the outputs you need. We can define the production scope together.', video:'Milenium furniture animation'},
  sk: {skip:'Prejsť na obsah', home:'Domov', nav:'Hlavná navigácia', breadcrumb:'Navigačná cesta', language:'Jazyk', services:'Služby', work:'Práce', contact:'Porozprávajme sa', scope:'Čo pre vás vytvoríme', process:'Ako prebieha projekt', brief:'Čo uviesť v zadaní', faq:'Pred začiatkom spolupráce', related:'Súvisiace služby', cta:'Prediskutovať projekt', portfolio:'Pozrieť vybrané práce', end:'Máte projekt v hlave?', endText:'Pošlite nám referencie, plánované použitie a požadované výstupy. Spoločne nastavíme rozsah produkcie.', video:'Animácia nábytku Milenium'},
};

export function renderServicePage(service, locale) {
  const copy = service[locale], ui = labels[locale], home = `/${locale}`, image = service.image;
  const inquiryUrl = `${home}?interest=${service.id}#project-form`;
  const paragraph = value => `<p>${escape(value)}</p>`;
  const link = (href, text, className='') => `<a${className ? ` class="${className}"` : ''} href="${href}">${escape(text)}</a>`;
  return `<!doctype html>
<html lang="${locale}"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#000000">
<title>${escape(copy.title)}</title><meta name="description" content="${escape(copy.description)}">
<meta property="og:title" content="${escape(copy.title)}"><meta property="og:description" content="${escape(copy.description)}"><meta property="og:type" content="website">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/service-pages.css">
${seoMarkup({locale,title:copy.title,description:copy.description,service})}
<script src="/i18n/switcher.js" type="module"></script><script src="/site-tracker.js" type="module"></script>
</head><body class="service-page">
${link('#main',ui.skip,'skip-link')}
<header class="site-header">
<a class="brand" href="${home}" aria-label="Shapeviz — ${ui.home}"><img src="/media/shapeviz-logo.webp" alt="Shapeviz" width="1515" height="314"></a>
<nav aria-label="${ui.nav}">${link(home+'#services',ui.services)}${link(home+'#work',ui.work)}${link(inquiryUrl,ui.contact,'nav-contact')}</nav>
<div class="language-switch" role="group" aria-label="${ui.language}">${['sk','en'].map(lang=>`<a href="${servicePath(service,lang)}" data-language="${lang}" lang="${lang}" hreflang="${lang}" aria-label="${lang==='sk'?'Slovenčina':'English'}"${lang===locale?' aria-current="true"':''}>${lang.toUpperCase()}</a>`).join('')}</div>
</header>
<main id="main" class="section-shell">
<nav class="service-breadcrumb" aria-label="${ui.breadcrumb}"><ol><li>${link(home,'Shapeviz')}</li><li aria-current="page">${escape(copy.name)}</li></ol></nav>
<section class="service-hero" aria-labelledby="service-title">
<div><p class="micro accent">SHAPEVIZ / ${ui.services.toUpperCase()}</p><h1 id="service-title">${escape(copy.name)}</h1><p class="service-intro">${escape(copy.intro)}</p><div class="service-actions">${link(inquiryUrl,ui.cta,'primary-button')}${link(home+'#work',ui.portfolio,'service-text-link')}</div></div>
<figure>${service.video
    ? `<video controls playsinline preload="none" width="${image.width}" height="${image.height}" poster="${image.src}" src="${service.video}" aria-label="${ui.video}">${link(service.video,ui.video)}</video>`
    : `<img src="${image.src}" srcset="${image.small} ${image.smallWidth || 640}w, ${image.src} ${image.width}w" sizes="(max-width: 900px) 90vw, 44vw" width="${image.width}" height="${image.height}" alt="${escape(copy.imageAlt)}" fetchpriority="high" decoding="async">`}
<figcaption>${escape(copy.caption)}</figcaption></figure>
</section>
<section class="service-section" aria-labelledby="scope-title"><h2 id="scope-title">${ui.scope}</h2><div class="service-columns">${copy.deliverables.map(([heading,body])=>`<article><h3>${escape(heading)}</h3>${paragraph(body)}</article>`).join('')}</div></section>
<section class="service-section" aria-labelledby="process-title"><h2 id="process-title">${ui.process}</h2><ol class="service-process">${copy.process.map(([heading,body])=>`<li><h3>${escape(heading)}</h3>${paragraph(body)}</li>`).join('')}</ol></section>
<section class="service-section service-brief" aria-labelledby="brief-title"><h2 id="brief-title">${ui.brief}</h2><div>${paragraph(copy.brief)}${link(inquiryUrl,ui.cta,'service-text-link')}</div></section>
<section class="service-section service-faq" aria-labelledby="faq-title"><h2 id="faq-title">${ui.faq}</h2>${copy.questions.map(([question,answer])=>`<details><summary>${escape(question)}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg></summary>${paragraph(answer)}</details>`).join('')}</section>
<section class="service-section" aria-labelledby="related-title"><h2 id="related-title">${ui.related}</h2><nav class="service-columns service-related" aria-label="${ui.related}">${services.filter(item=>item.id!==service.id).map(item=>link(servicePath(item,locale),item[locale].name)).join('')}</nav></section>
<section class="service-section service-cta"><h2>${ui.end}</h2>${paragraph(ui.endText)}${link(inquiryUrl,ui.cta,'primary-button')}</section>
</main><footer class="site-footer section-shell"><span>© SHAPEVIZ</span>${link(home+'#services',ui.services)}${link(inquiryUrl,ui.contact)}</footer>
</body></html>`;
}
