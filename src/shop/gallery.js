import {svgIcon} from '../../public/ui/icons.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderProductGallery(items=[]) {
  if(!items.length)return '';
  return `<section class="product-gallery" aria-labelledby="product-gallery-title"><div class="product-gallery-heading"><h2 id="product-gallery-title">Gallery</h2><p>Explore the details</p></div><div class="product-gallery-grid">${items.map((item,index)=>`<figure><a href="${esc(item.full)}" data-product-image data-caption="${esc(item.caption)}" aria-label="Enlarge: ${esc(item.alt)}"><img src="${esc(item.src)}" ${item.srcset?`srcset="${esc(item.srcset)}"`:''} sizes="(max-width:700px) 100vw, 50vw" width="${item.width}" height="${item.height}" alt="${esc(item.alt)}" loading="lazy" decoding="async"><span class="product-image-open" aria-hidden="true">${svgIcon('arrowUpRight')}</span></a><figcaption><span>${esc(item.caption)}</span><span>${String(index+1).padStart(2,'0')}</span></figcaption></figure>`).join('')}</div></section>`;
}
