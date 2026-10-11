export function setShopNavigation(launched) {
  for(const item of document.querySelectorAll('[data-shop-nav]')){
    const next=document.createElement(launched?'a':'span');next.dataset.shopNav='';next.className='shop-nav';next.textContent='Shop';
    if(launched){next.href='/shop';if(location.pathname==='/shop')next.setAttribute('aria-current','page');}
    else{next.setAttribute('aria-disabled','true');const badge=document.createElement('small');badge.textContent='Coming soon';next.append(badge);}
    item.replaceWith(next);
  }
}
async function refresh(){try{const response=await fetch('/api/shop?status=1',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(response.ok)setShopNavigation((await response.json()).launched===true);}catch{/* The default navigation stays safely inactive. */}}
refresh();
window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
