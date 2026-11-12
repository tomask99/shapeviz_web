import {translate} from './messages.js';
export const language = () => typeof document !== 'undefined' && document.documentElement.lang === 'sk' ? 'sk' : 'en';
export const t = text => translate(text, language());
export function publicPath(suffix = '') {
  if (!/^\/(?:sk|en)(?:\/|$)/.test(location.pathname) && language() === 'en') return suffix || '/';
  return '/' + language() + suffix;
}
export function productCount(count) {
  return language() === 'sk' ? `${count} ${count === 1 ? 'produkt' : count >= 2 && count <= 4 ? 'produkty' : 'produktov'}` : `${count} ${count === 1 ? 'product' : 'products'}`;
}
