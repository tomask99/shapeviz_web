import {svgIcon} from '../ui/icons.js';
import {uploadGalleryImage} from './gallery-upload.js';
import {gallerySort} from './gallery-sort.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mountProductGallery(form, api) {
  let items=[],busy=false,generation=0,stopSort=()=>{};
  const root=document.createElement('section');root.className='shop-gallery-editor';
  root.innerHTML=`<h3>Product gallery</h3><p class="fine" id="product-gallery-help">Upload screenshots and product images. Drag any image to reorder, or focus it and use Space and arrow keys. Save product to publish changes.</p><button type="button" class="secondary" data-add-images>${svgIcon('plus')} Add images</button><input type="file" data-gallery-files multiple accept="image/jpeg,image/png,image/webp,image/avif" hidden><div class="gallery-dropzone" data-product-dropzone>Drop images here <small>JPG, PNG, WebP, AVIF · up to 25 MB each · 24 images maximum</small></div><p data-gallery-progress role="status"></p><p data-gallery-error role="alert"></p><div class="shop-gallery-grid" aria-describedby="product-gallery-help"></div><p data-gallery-empty class="fine">No images yet. The gallery will appear on the product page after you add images and save.</p><p data-gallery-announcement class="site-editing-sr" aria-live="polite"></p>`;
  form.querySelector('.shop-seo').before(root);
  const grid=root.querySelector('.shop-gallery-grid'),dialog=form.closest('dialog'),status=root.querySelector('[data-gallery-progress]'),error=root.querySelector('[data-gallery-error]');
  const locked=()=>busy||!!dialog.dataset.dismissPending;
  function draw(){
    stopSort();
    grid.innerHTML=items.map((item,index)=>`<article class="shop-gallery-card" data-id="${esc(item.id)}"><div class="shop-gallery-image"><img src="${esc(item.src)}" alt="${esc(item.alt)}" draggable="false"><button type="button" class="gallery-drag-surface" data-drag aria-label="Move image ${index+1}" aria-pressed="false"></button><button type="button" class="shop-gallery-remove quiet" data-remove aria-label="Remove image ${index+1}">${svgIcon('trash')}</button><span data-order>${String(index+1).padStart(2,'0')}</span></div><label>Image description<input data-alt required maxlength="500" value="${esc(item.alt)}"></label><label>Caption (optional)<input data-caption maxlength="120" value="${esc(item.caption)}"></label></article>`).join('');
    root.querySelector('[data-gallery-empty]').hidden=items.length>0;
    stopSort=gallerySort({grid,disabled:locked,ghostRoot:dialog,scrollContainer:dialog,announce:message=>{root.querySelector('[data-gallery-announcement]').textContent=message;},changed:()=>{status.textContent='Order changed. Save product to publish.';},move(from,to){const [item]=items.splice(from,1);items.splice(to,0,item);}});
  }
  async function upload(files){
    if(locked()||!files.length)return;
    if(items.length+files.length>24){error.textContent='Use up to 24 images per product.';return;}
    busy=true;error.textContent='';const version=generation;
    const controls=[...form.querySelectorAll('button,input,textarea,select')].map(el=>[el,el.disabled]);controls.forEach(([el])=>{el.disabled=true;});
    let added=0;const failures=[];
    try{for(const file of files){if(version!==generation)break;status.textContent=`Uploading ${file.name}…`;try{const item=await uploadGalleryImage(file,api,message=>{if(version===generation)status.textContent=message;});if(version===generation){items.push(item);added++;}}catch(e){failures.push(`${file.name}: ${e.message}`);}}}
    finally{controls.forEach(([el,disabled])=>{el.disabled=disabled;});busy=false;if(version===generation){draw();status.textContent=`${added} images added. Save product to publish.`;error.textContent=failures.join(' ');}}
  }
  root.querySelector('[data-add-images]').onclick=()=>root.querySelector('[data-gallery-files]').click();
  root.querySelector('[data-gallery-files]').onchange=event=>{upload([...event.target.files]);event.target.value='';};
  const drop=root.querySelector('[data-product-dropzone]');
  drop.ondragover=event=>{event.preventDefault();if(!locked())drop.classList.add('is-over');};drop.ondragleave=()=>drop.classList.remove('is-over');
  drop.ondrop=event=>{event.preventDefault();drop.classList.remove('is-over');upload([...event.dataTransfer.files]);};
  grid.onclick=event=>{if(locked())return;const button=event.target.closest('[data-remove]');if(button){items=items.filter(item=>item.id!==button.closest('[data-id]').dataset.id);draw();status.textContent='Image removed. Save product to publish.';root.querySelector('[data-add-images]').focus();}};
  grid.oninput=event=>{const card=event.target.closest('[data-id]'),item=items.find(item=>item.id===card?.dataset.id);if(!item)return;if(event.target.matches('[data-alt]'))item.alt=event.target.value;if(event.target.matches('[data-caption]'))item.caption=event.target.value;};
  const cancel=event=>{if(busy)event.preventDefault();};dialog.addEventListener('cancel',cancel);
  const close=()=>{generation++;stopSort();};dialog.addEventListener('close',close);
  return {open(product){generation++;items=structuredClone(product?.seo?.gallery||[]);status.textContent='';error.textContent='';draw();},value(){if(busy)throw new Error('Wait for image uploads to finish.');return structuredClone(items);},dispose(){generation++;stopSort();dialog.removeEventListener('cancel',cancel);dialog.removeEventListener('close',close);}};
}
