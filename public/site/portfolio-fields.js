export const portfolioLimits = {blocks: 60, imagesPerBlock: 30, images: 300, bytes: 900_000};
export const portfolioLanguages = ['sk', 'en'];

export const portfolioServices = {
  sk: {
    sectionLabel: 'Čo robím',
    title: '3D modely', text: 'Nábytok, produkty a 3D prostredia.',
    secondTitle: 'Vizualizácie', secondText: 'Fotorealistické rendery produktov, interiérov a architektúry.',
    thirdTitle: 'Animácie a videá', thirdText: 'Produktové animácie a 3D zábery do kampaní a videoklipov.',
  },
  en: {
    sectionLabel: 'What I do',
    title: '3D models', text: 'Furniture, products and 3D environments.',
    secondTitle: 'Visualization', secondText: 'Photorealistic renders of products, interiors and architecture.',
    thirdTitle: 'Animation and video', thirdText: 'Product animations and 3D shots for campaigns and music videos.',
  },
};

const previousPortfolioServices = {
  sk: {
    sectionLabel: 'Služby', kicker: '01 / GEOMETRIA', title: 'Modelovanie',
    text: 'Nábytok, produkty a prostredia. Od proporcií po posledný šev, s čistou topológiou a UV mapovaním.',
    secondKicker: '02 / ATMOSFÉRA', secondTitle: 'Vizualizácie',
    secondText: 'Produktové CGI, interiéry a architektúra. Materiály, svetlo a kompozícia, ktoré dávajú obrazu charakter.',
  },
  en: {
    sectionLabel: 'Services', kicker: '01 / GEOMETRY', title: 'Modeling',
    text: 'Furniture, products and environments. From proportions to the last seam, with clean topology and UV mapping.',
    secondKicker: '02 / ATMOSPHERE', secondTitle: 'Visualization',
    secondText: 'Product CGI, interiors and architecture. Materials, light and composition that give an image its character.',
  },
};

export const portfolioContact = {
  sk: {
    nav: 'Kontakt', title: 'Tomáš Krajčovič',
    text: '3D modelovanie, vizualizácie a animácia',
    button: 'shapeviz3d@gmail.com', url: 'mailto:shapeviz3d@gmail.com',
    secondButton: 'Kontaktný formulár', secondUrl: '/sk#project-form',
  },
  en: {
    nav: 'Contact', title: 'Tomáš Krajčovič',
    text: '3D modeling, visualization and animation',
    button: 'shapeviz3d@gmail.com', url: 'mailto:shapeviz3d@gmail.com',
    secondButton: 'Contact form', secondUrl: '/en#project-form',
  },
};

const previousPortfolioContact = {
  sk: {
    title: 'Vytvorme niečo\nspolu.', kicker: 'Ďalší projekt môže byť váš',
    secondButton: 'Alebo mi pošlite zadanie cez formulár',
  },
  en: {
    title: 'Let’s create\nsomething together.', kicker: 'The next project could be yours',
    secondButton: 'Or send your brief using the contact form',
  },
};

export function refreshPortfolioBlock(block) {
  if (block.id !== block.type || !['services', 'contact'].includes(block.type)) return block;
  // Refresh the original built-in copy on saved portfolios while keeping editor customizations.
  const copy = {...block.copy};
  for (const locale of portfolioLanguages) {
    if (block.type === 'contact') {
      const fields = copy[locale];
      if (!fields) continue;
      const previous = previousPortfolioContact[locale];
      const current = portfolioContact[locale];
      const updated = {...fields};
      if (fields.title === previous.title) {
        updated.title = current.title;
        updated.text ||= current.text;
      }
      if (fields.kicker === previous.kicker) delete updated.kicker;
      if (fields.secondButton === previous.secondButton) updated.secondButton = current.secondButton;
      copy[locale] = updated;
      continue;
    }
    const previous = Object.entries(previousPortfolioServices[locale]);
    if (Object.keys(copy[locale] ?? {}).length === previous.length &&
        previous.every(([key, value]) => copy[locale][key] === value)) {
      copy[locale] = {...portfolioServices[locale]};
    }
  }
  return {...block, copy};
}

const title = ['title', 'Heading', 'lines'];
const kicker = ['kicker', 'Small heading'];
const text = ['text', 'Text', 'multiline'];
const nav = ['nav', 'Navigation label'];
const button = ['button', 'Link text'];
const url = ['url', 'Link URL', 'url'];

export const portfolioSettings = [
  ['brand', 'Logo description or text'], ['brandUrl', 'Logo link', 'url'],
  ['title', 'Browser tab title'], ['description', 'Sharing description', 'multiline'],
  ['footer', 'Footer text'], ['back', 'Back-to-top link text'],
  ['skip', 'Skip-to-content link text'], ['menu', 'Navigation accessible label'],
  ['language', 'Language selector accessible label'],
  ['skLink', 'Slovak selector text'], ['enLink', 'English selector text'],
  ['skName', 'Slovak link accessible label'], ['enName', 'English link accessible label'],
  ['enlarge', 'Image preview accessible label'], ['close', 'Close preview accessible label'],
  ['openLink', 'Image link accessible label'], ['projectIndex', 'Project index accessible label'],
  ['contribution', 'Contributions accessible label'], ['credit', 'Collaboration label'],
];

export const portfolioBlockTypes = {
  project: {label: 'Project', images: true, layouts: true, fields: [
    ['title', 'Project name'], ['kicker', 'Category'], text, ['credit', 'Collaboration'],
    ['items', 'Contributions, one per line', 'multiline'], button, url,
  ]},
  intro: {label: 'Intro', fields: [kicker, title, ['secondTitle', 'Second heading line'], text, button, url]},
  cover: {label: 'Cover image', images: true, singleImage: true, fields: []},
  services: {label: 'Services', fields: [
    ['sectionLabel', 'Section heading'], kicker, title, text,
    ['secondKicker', 'Second small heading'], ['secondTitle', 'Second heading'], ['secondText', 'Second text', 'multiline'],
    ['thirdTitle', 'Third heading'], ['thirdText', 'Third text', 'multiline'],
  ]},
  index: {label: 'Project index', fields: [title, nav]},
  about: {label: 'About', images: true, singleImage: true, fields: [
    nav, kicker, title, text, ['itemsTitle', 'First list heading'], ['items', 'First list, one item per line', 'multiline'],
    ['secondItemsTitle', 'Second list heading'], ['secondItems', 'Second list, one item per line', 'multiline'],
  ]},
  contact: {label: 'Contact', fields: [nav, kicker, title, text, button, url, ['secondButton', 'Second link text'], ['secondUrl', 'Second link URL', 'url']]},
  text: {label: 'Text', fields: [nav, kicker, title, text, button, url]},
};

export const portfolioLayouts = {
  pair: 'Two columns', wide: 'One column', triptych: 'Three columns',
  compact: 'Four columns', mixed: 'Two columns, contained', architecture: 'Lead image and two columns',
};

export const portfolioImageFields = [
  ['alt', 'Image description', 'short'], ['caption', 'Fallback text for screen readers', 'short'],
  ['url', 'Image link URL', 'url'],
];

export function portfolioFieldLimit(mode) {
  if (mode === 'multiline') return 6000;
  if (mode === 'url') return 2048;
  return 300;
}

export function portfolioLink(value) {
  if (typeof value !== 'string' || /[\s\\<>"']/u.test(value)) return '';
  if (/^\/(?!\/)/.test(value) || /^#[a-z][a-z0-9_-]*$/i.test(value)) return value;
  if (/^mailto:[^?@]+@[^?@]+\.[^?@]+$/i.test(value)) return value;
  if (!/^https?:\/\//i.test(value)) return '';
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password ? value : '';
  } catch {
    return '';
  }
}
