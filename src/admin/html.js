import { parse, serialize } from 'parse5';

export function transformDeck(html, { from, company, slug, analytics = true } = {}) {
  if (typeof html !== 'string' || Buffer.byteLength(html) > 4_000_000) throw new Error('HTML must be smaller than 4 MB after media extraction.');
  const document = parse(html);
  let replacements = 0, slides = 0;
  const pattern = from ? new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null;
  const replace = value => pattern ? value.replace(pattern, matched => {
    replacements++;
    return matched === matched.toUpperCase() ? company.toUpperCase() : matched === matched.toLowerCase() ? company.toLowerCase() : company;
  }) : value;
  function walk(node, excluded = false) {
    const skip = excluded || ['script', 'style'].includes(node.tagName);
    if (node.nodeName === '#text' && !skip && pattern) node.value = replace(node.value);
    for (const attribute of node.attrs || []) {
      if (pattern && ['title','alt','aria-label','placeholder'].includes(attribute.name)) attribute.value = replace(attribute.value);
    }
    if ((node.attrs || []).some(a => a.name === 'data-slide' || a.name === 'class' && a.value.split(/\s+/).includes('slide'))) slides++;
    if (node.childNodes) {
      node.childNodes = node.childNodes.filter(child => {
        if (child.tagName === 'base') return false;
        if (child.tagName === 'script' && child.attrs?.some(a => a.name === 'src' && a.value.includes('/presentation-system/tracker.js'))) return false;
        return !(child.tagName === 'meta' && child.attrs?.some(a => a.name === 'http-equiv'));
      });
      node.childNodes.forEach(child => walk(child, skip));
    }
  }
  walk(document);
  let output = serialize(document);
  if (slug) output = output.replace('<head>', `<head><base href="/p/${slug}/">`).replace('</body>', `<script src="/presentation-system/tracker.js" data-deck="${slug}" data-analytics="${analytics}" defer></script></body>`);
  return {html:output, replacements, slides:Math.max(1, slides)};
}
