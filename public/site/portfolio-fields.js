export const portfolioLimits = {blocks: 60, imagesPerBlock: 30, images: 300, bytes: 900_000};
export const portfolioLanguages = ['sk', 'en'];

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
  ['gallery', 'Project gallery accessible label'], ['projectDetails', 'Project details link text'],
  ['previousImage', 'Previous image accessible label'], ['nextImage', 'Next image accessible label'],
];

export const portfolioBlockTypes = {
  project: {label: 'Project', images: true, layouts: true, fields: [
    ['title', 'Project name'], ['kicker', 'Category'], text, ['credit', 'Collaboration'],
    ['items', 'Contributions, one per line', 'multiline'], button, url,
  ]},
  intro: {label: 'Intro', fields: [kicker, title, ['secondTitle', 'Second heading line'], text, button, url]},
  cover: {label: 'Cover image', images: true, singleImage: true, fields: []},
  services: {label: 'Services', fields: [
    ['sectionLabel', 'Section accessible label'], kicker, title, text,
    ['secondKicker', 'Second small heading'], ['secondTitle', 'Second heading'], ['secondText', 'Second text', 'multiline'],
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
  ['alt', 'Image description', 'short'], ['caption', 'Visible caption', 'short'],
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
