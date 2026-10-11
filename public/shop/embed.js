import {gumroadUrl} from './url.js';
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
  const filters=document.createElement('div');filters.className='shop-filters';filters.setAttribute('role','group');filters.setAttribute('aria-label','Product categories');
  const list=document.createElement('div');list.className='shop-products';
  const empty=document.createElement('p');empty.className='shop-empty';empty.setAttribute('role','status');empty.hidden=true;empty.textContent='No products in this category yet. Check back soon.';
  root.replaceChildren(filters,list,empty);
  const cleanups=[], cards=[];
  for(const product of data.products){
    const article=document.createElement('article');article.className='shop-product';article.dataset.category=product.categoryId;
    const label=document.createElement('p');label.className='shop-category-label';label.textContent=data.categories.find(c=>c.id===product.categoryId)?.name || '';
    const widget=document.createElement('div');article.append(label,widget);list.append(article);cards.push(article);cleanups.push(mountProduct(widget,product));
  }
  for(const category of [{id:'all',name:'All'},...data.categories]){
    const button=document.createElement('button');button.type='button';button.textContent=category.name;button.setAttribute('aria-pressed',String(category.id==='all'));
    button.onclick=()=>{for(const b of filters.children)b.setAttribute('aria-pressed',String(b===button));for(const card of cards)card.hidden=category.id!=='all'&&card.dataset.category!==category.id;empty.hidden=cards.some(c=>!c.hidden);};
    filters.append(button);
  }
  empty.hidden=cards.length>0;
  return ()=>{cleanups.forEach(cleanup=>cleanup());root.replaceChildren();};
}
