import {svgIcon} from '../ui/icons.js';
const links=[...document.querySelectorAll('[data-product-image]')];
if(links.length){
  const dialog=document.createElement('dialog');dialog.className='product-lightbox';dialog.setAttribute('aria-label','Product image viewer');
  dialog.innerHTML=`<header><p data-counter aria-live="polite"></p><button type="button" data-close aria-label="Close image viewer">${svgIcon('close')}</button></header><div class="product-lightbox-stage"><button type="button" data-prev aria-label="Previous image">${svgIcon('arrowLeft')}</button><img alt=""><button type="button" data-next aria-label="Next image">${svgIcon('arrowRight')}</button></div><p data-image-caption></p><p data-image-error role="status"></p>`;
  document.body.append(dialog);let index=0,returnFocus;
  const image=dialog.querySelector('img');
  function show(next){index=(next+links.length)%links.length;const link=links[index];image.alt=link.querySelector('img').alt;image.src=link.href;dialog.querySelector('[data-counter]').textContent=`${index+1} / ${links.length}`;dialog.querySelector('[data-image-caption]').textContent=link.dataset.caption||image.alt;dialog.querySelector('[data-image-error]').textContent='';}
  image.onerror=()=>{dialog.querySelector('[data-image-error]').textContent='This image could not load. Please try again.';};
  links.forEach((link,i)=>link.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();returnFocus=link;show(i);dialog.showModal();document.body.classList.add('modal-open');}));
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('[data-prev]').onclick=()=>show(index-1);dialog.querySelector('[data-next]').onclick=()=>show(index+1);
  if(links.length===1){dialog.querySelector('[data-prev]').hidden=true;dialog.querySelector('[data-next]').hidden=true;}
  dialog.addEventListener('close',()=>{document.body.classList.remove('modal-open');returnFocus?.focus({preventScroll:true});});
  dialog.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();show(index+(event.key==='ArrowRight'?1:-1));}});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  let touch;
  image.addEventListener('touchstart',event=>{touch=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;},{passive:true});
  image.addEventListener('touchend',event=>{if(!touch)return;const t=event.changedTouches[0],dx=t.clientX-touch.x,dy=t.clientY-touch.y;touch=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)show(index+(dx<0?1:-1));},{passive:true});
}
