import {gumroadUrl} from './url.js';
import {svgIcon} from '../ui/icons.js';
let scriptRequested = false;
export function loadGumroad() {
  if (scriptRequested) return;
  scriptRequested = true;
  const script=document.createElement('script');
  script.src='https://gumroad.com/js/gumroad-embed.js';
  script.async=true;
  document.head.append(script);
}

export function mountProduct(root, product) {
  const url=gumroadUrl(product.url);
  const status=document.createElement('p');status.className='shop-embed-status';status.setAttribute('role','status');status.textContent='Loading product from Gumroad…';
  const slot=document.createElement('div');slot.className='shop-embed-slot';
  const embed=document.createElement('div');embed.className='gumroad-product-embed';embed.hidden=true;
  const link=document.createElement('a');link.href=url;link.textContent='View on Gumroad';embed.append(link);slot.append(embed);
  const fallback=document.createElement('a');fallback.href=url;fallback.target='_blank';fallback.rel='noopener noreferrer';fallback.className='shop-fallback';fallback.textContent='View on Gumroad';
  root.append(status,slot,fallback);
  // The official script replaces its div and owns iframe sizing. Keep a separate
  // fallback because an iframe load event alone does not prove the product loaded.
  const observer=new MutationObserver(()=>{
    const frame=slot.querySelector('iframe');
    if(frame){frame.title='Gumroad product '+url.split('/').at(-1);observer.disconnect();}
  });
  observer.observe(slot,{childList:true});
  const timeout=setTimeout(()=>{status.hidden=false;status.textContent='Taking longer than expected. You can view this product directly on Gumroad.';},20000);
  const onMessage=event=>{
    const frame=slot.querySelector('iframe');
    if(event.source!==frame?.contentWindow || event.origin!==new URL(url).origin || event.data?.type!=='height' || !Number.isFinite(event.data.height) || event.data.height<=0)return;
    clearTimeout(timeout);status.hidden=true;
  };
  window.addEventListener('message',onMessage);loadGumroad();
  return ()=>{clearTimeout(timeout);observer.disconnect();window.removeEventListener('message',onMessage);root.replaceChildren();};
}

export function mountCatalog(root, data) {
  root.innerHTML=`<div class="shop-catalog-layout">
    <aside class="shop-sidebar" aria-label="Product filters">
      <h2 class="shop-filter-heading">${svgIcon('filter')} Filters</h2>
      <button type="button" class="shop-filter-toggle" aria-expanded="false" aria-controls="shop-category-panel">${svgIcon('filter')} <span>Filters</span>${svgIcon('chevronDown')}</button>
      <div id="shop-category-panel" class="shop-category-panel"><h3>Categories</h3><div class="shop-filters" role="group" aria-label="Product categories"></div></div>
    </aside>
    <div class="shop-results"><div class="shop-results-heading"><h2>All products</h2><p class="shop-result-count" role="status" aria-live="polite"></p>${svgIcon('overview')}</div>
      <div class="shop-products"></div><div class="shop-empty" hidden><h3>No products here yet.</h3><p>Try another category or come back soon.</p><button type="button">View all products</button></div>
    </div>
  </div>`;
  const filters=root.querySelector('.shop-filters'), list=root.querySelector('.shop-products'),empty=root.querySelector('.shop-empty');
  const toggle=root.querySelector('.shop-filter-toggle'),sidebar=root.querySelector('.shop-sidebar');
  toggle.onclick=()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));sidebar.classList.toggle('is-open',open);};
  const cleanups=[], cards=[];
  for(const product of data.products){
    const article=document.createElement('article');article.className='shop-product';article.dataset.category=product.categoryId;
    const label=document.createElement('p');label.className='shop-category-label';label.textContent=data.categories.find(c=>c.id===product.categoryId)?.name || '';
    const widget=document.createElement('div');widget.className='shop-card-widget';
    article.append(label,widget);list.append(article);cards.push(article);cleanups.push(mountProduct(widget,product));
  }
  const buttons=[];
  const select=category=>{
    for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.category===category.id));
    for(const card of cards)card.hidden=category.id!=='all'&&card.dataset.category!==category.id;
    const count=cards.filter(card=>!card.hidden).length;
    empty.hidden=count>0;
    root.querySelector('.shop-results-heading h2').textContent=category.id==='all'?'All products':category.name;
    root.querySelector('.shop-result-count').textContent=`${count} ${count===1?'product':'products'}`;
    toggle.querySelector('span').textContent=category.id==='all'?'Filters':category.name;
  };
  for(const category of [{id:'all',name:'All'},...data.categories]){
    const button=document.createElement('button');button.type='button';button.dataset.category=category.id;button.setAttribute('aria-label',category.name);
    const name=document.createElement('span');name.textContent=category.name;
    const count=document.createElement('span');count.className='shop-category-count';count.setAttribute('aria-hidden','true');count.textContent=String(category.id==='all'?cards.length:cards.filter(card=>card.dataset.category===category.id).length);
    button.append(name,count);button.onclick=()=>select(category);buttons.push(button);filters.append(button);
  }
  empty.querySelector('button').onclick=()=>select({id:'all'});
  select({id:'all'});
  return ()=>{cleanups.forEach(cleanup=>cleanup());root.replaceChildren();};
}
