import {seoFields} from '../../public/shop/seo-fields.js';
import {validateGallery} from '../website/gallery.js';

const fail = message => Object.assign(new Error(message), {status:400});
export function validateProductSeo(value, env = {}) {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value) || typeof value.enabled !== 'boolean') throw fail('Check the product page settings.');
  const seo = {enabled:value.enabled};
  if (!Array.isArray(value.gallery ?? []) || (value.gallery?.length ?? 0) > 24) throw fail('Use up to 24 product gallery images.');
  seo.gallery = validateGallery(value.gallery ?? [], env);
  if (seo.gallery.some(item => item.type !== 'image')) throw fail('Use images in the product gallery.');
  for (const field of seoFields) {
    const text = value[field.name] ?? '';
    if (typeof text !== 'string' || text.length > field.max) throw fail(`${field.label} must contain at most ${field.max} characters.`);
    seo[field.name] = text.trim();
  }
  if (seo.slug && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seo.slug) || ['index', 'index-html'].includes(seo.slug))) throw fail('Use lowercase words separated by hyphens for the page address.');
  if (seo.image) {
    let url;
    try {url = new URL(seo.image);} catch {throw fail('Use a valid Gumroad cover image URL.');}
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !['public-files.gumroad.com', 'assets.gumroad.com'].includes(url.hostname)) throw fail('Use a cover image hosted by Gumroad.');
  }
  if (!Array.isArray(value.faqs ?? []) || (value.faqs?.length ?? 0) > 8) throw fail('Use up to eight questions and answers.');
  seo.faqs = (value.faqs || []).map(faq => {
    if (!faq || typeof faq.question !== 'string' || typeof faq.answer !== 'string' || !faq.question.trim() || !faq.answer.trim() || faq.question.length > 200 || faq.answer.length > 2000) throw fail('Complete each question and answer.');
    return {question:faq.question.trim(), answer:faq.answer.trim()};
  });
  if (seo.enabled && ['heading', 'slug', 'title', 'description', 'body'].some(field => !seo[field])) throw fail('Complete the product name, address, SEO title, meta description and product description before publishing the page.');
  return seo;
}
