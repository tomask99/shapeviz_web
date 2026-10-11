import {svgIcon} from '../ui/icons.js';
import {gumroadUrl,productKey} from '../shop/url.js';
import {mountProduct} from '../shop/embed.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountShopAdmin({root,api,notify}) {
  let catalog,disposed=false,pending=false,editing=null,cleanupPreview;
  const dialog=document.createElement('dialog');dialog.className='shop-editor';dialog.setAttribute('aria-labelledby','shop-editor-title');
  dialog.innerHTML=`<form><div class="dialog-head"><div><p class="eyebrow">SHOP / GUMROAD</p><h2 id="shop-editor-title">Add product.</h2></div><button type="button" data-close aria-label="Close product editor">${svgIcon('close')}</button></div>
    <p class="fine">Manage images, prices, descriptions and downloads on Gumroad. Add only the product link here.</p>
    <label>Gumroad product URL<input name="url" type="url" required maxlength="512" placeholder="https://creator.gumroad.com/l/product"></label>
    <div class="two-columns"><label>Category<select name="categoryId" required></select></label><label>Internal name (optional)<input name="name" maxlength="100" placeholder="Only shown in admin"></label></div>
    <label class="check"><input type="checkbox" name="visible">Visible in catalog</label><p class="fine">Hidden items are drafts. Visible items stay private until the shop is launched.</p>
    <div class="actions"><button type="button" class="secondary" data-preview>Preview product</button><button type="submit" class="primary">Save product</button></div>
    <p data-editor-error role="alert"></p><div data-product-preview></div></form>`;
  document.body.append(dialog);
  const form=dialog.querySelector('form'),editorError=dialog.querySelector('[data-editor-error]');
  const error=message=>{const el=root.querySelector('[data-shop-error]');if(el)el.textContent=message;notify(message);};
  async function task(fn){
    if(pending)return;pending=true;dialog.dataset.dismissPending='true';
    const controls=[...root.querySelectorAll('button,input,select'),...dialog.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);
    try{await fn();}catch(e){if(!disposed){editorError.textContent=e.message;error(e.message);}}
    finally{pending=false;delete dialog.dataset.dismissPending;controls.forEach(([el,disabled])=>el.disabled=disabled);}
  }
  async function save(next){catalog=await api('shop-save',{version:catalog.version,categories:next.categories,products:next.products});if(!disposed){draw();notify('Shop catalog saved.');}}
  function open(product){
    editing=product||null;form.reset();editorError.textContent='';cleanupPreview?.();cleanupPreview=null;
    dialog.querySelector('h2').textContent=product?'Edit product.':'Add product.';
    form.elements.categoryId.innerHTML=catalog.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    if(product){form.elements.url.value=product.url;form.elements.name.value=product.name;form.elements.categoryId.value=product.categoryId;form.elements.visible.checked=product.visible;}
    dialog.showModal();if(product)preview();
  }
  function preview(){try{const url=gumroadUrl(form.elements.url.value);cleanupPreview?.();cleanupPreview=mountProduct(dialog.querySelector('[data-product-preview]'),{url});editorError.textContent='';}catch(e){editorError.textContent=e.message;}}
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('[data-preview]').onclick=preview;
  dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});
  dialog.addEventListener('close',()=>{cleanupPreview?.();cleanupPreview=null;});
  form.elements.url.addEventListener('input',()=>{cleanupPreview?.();cleanupPreview=null;});
  form.onsubmit=event=>{event.preventDefault();task(async()=>{
    const url=gumroadUrl(form.elements.url.value);
    if(catalog.products.some(p=>p.id!==editing?.id&&productKey(p.url)===productKey(url)))throw new Error('This Gumroad product is already in the catalog. Edit the existing item.');
    const next=structuredClone(catalog),product={id:editing?.id||crypto.randomUUID(),url,categoryId:form.elements.categoryId.value,visible:form.elements.visible.checked,name:form.elements.name.value};
    if(editing)next.products[next.products.findIndex(p=>p.id===editing.id)]=product;else next.products.push(product);
    await save(next);if(!disposed)dialog.close();
  });};
  function draw(){
    if(disposed)return;
    root.innerHTML=`<div class="shop-admin"><div class="page-heading"><div><p class="eyebrow">ASSETS & TOOLS</p><h1>Shop<span>.</span></h1></div><button type="button" class="primary" data-add>${svgIcon('plus')} Add product</button></div>
      <section class="shop-launch-panel"><div><p class="eyebrow">${catalog.launched?'LIVE ON SHAPEVIZ':'IN PREPARATION'}</p><h2>${catalog.launched?'Your shop is live.':'Build your collection.'}</h2><p>${catalog.launched?'Visible products are available at /shop.':'Visitors see Coming soon. Prepare your catalog privately.'}</p></div><div class="shop-launch-actions"><label class="check"><input type="checkbox" role="switch" data-launch ${catalog.launched?'checked':''}>Shop live</label><a class="secondary" href="/shop?preview=1" target="_blank" rel="noopener">Private catalog preview ${svgIcon('arrowUpRight')}</a></div></section>
      <p data-shop-error role="alert"></p><div class="section-title"><h2>Products <small>${catalog.products.length}</small></h2><button type="button" class="quiet" data-reload>${svgIcon('refresh')} Reload</button></div>
      <div class="shop-admin-products">${catalog.products.length?catalog.products.map((p,i)=>`<article class="shop-admin-product" data-id="${esc(p.id)}"><div class="shop-admin-product-info"><strong>${esc(p.name||productKey(p.url))}</strong><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.url)}</a><small>${esc(catalog.categories.find(c=>c.id===p.categoryId)?.name)}</small></div><span class="badge">${p.visible?'Visible':'Draft'}</span><div class="shop-admin-product-actions"><button type="button" class="quiet" data-edit>Edit</button><button type="button" class="quiet" data-toggle>${p.visible?'Hide':'Show'}</button><button type="button" class="quiet" data-move="-1" aria-label="Move ${esc(p.name||productKey(p.url))} up" ${i===0?'disabled':''}>${svgIcon('arrowUp')}</button><button type="button" class="quiet" data-move="1" aria-label="Move ${esc(p.name||productKey(p.url))} down" ${i===catalog.products.length-1?'disabled':''}>${svgIcon('arrowDown')}</button><button type="button" class="quiet" data-delete>Remove</button></div></article>`).join(''):'<div class="empty"><h3>Your collection starts here.</h3><p>Add a Gumroad URL and choose a category. No uploads or copied product content.</p></div>'}</div>
      <details class="shop-categories"><summary>Manage categories</summary><p class="fine">Rename a category or add Decals &amp; Textures for decal packs. Existing products keep their category when it is renamed.</p><form data-categories>${catalog.categories.map(c=>`<label>Category name<input name="${esc(c.id)}" value="${esc(c.name)}" maxlength="60" required></label>`).join('')}<button type="submit" class="secondary">Save category names</button></form><form data-new-category><label>New category<input name="name" maxlength="60" required placeholder="Decals &amp; Textures"></label><button type="submit" class="secondary">Add category</button></form></details></div>`;
    root.querySelector('[data-launch]').onchange=event=>{const launched=event.target.checked;const toggle=event.target;task(async()=>{try{catalog=await api('shop-launch',{version:catalog.version,launched});}catch(error){toggle.checked=catalog.launched;throw error;}draw();notify(launched?'Shop launched. Visible products are now public.':'Shop is back to Coming soon.');});};
    root.querySelector('[data-categories]').onsubmit=event=>{event.preventDefault();const names=new FormData(event.target);task(()=>{const next=structuredClone(catalog);next.categories.forEach(c=>c.name=String(names.get(c.id)));return save(next);});};
    root.querySelector('[data-new-category]').onsubmit=event=>{event.preventDefault();const name=new FormData(event.target).get('name');task(()=>{const next=structuredClone(catalog);next.categories.push({id:crypto.randomUUID(),name});return save(next);});};
  }
  root.onclick=event=>{
    const button=event.target.closest('button');if(!button||button.disabled||pending)return;
    if(button.hasAttribute('data-add'))return open();
    if(button.hasAttribute('data-reload'))return load();
    const id=button.closest('[data-id]')?.dataset.id,index=catalog?.products.findIndex(p=>p.id===id),product=catalog?.products[index];if(!product)return;
    if(button.hasAttribute('data-edit'))return open(product);
    if(button.hasAttribute('data-delete')&&!confirm('Remove this item from Shapeviz? The product on Gumroad will stay unchanged.'))return;
    task(()=>{
      const next=structuredClone(catalog);
      if(button.hasAttribute('data-toggle'))next.products[index].visible=!product.visible;
      else if(button.hasAttribute('data-delete'))next.products.splice(index,1);
      else if(button.dataset.move){const to=index+Number(button.dataset.move);if(to<0||to>=next.products.length)return;[next.products[index],next.products[to]]=[next.products[to],next.products[index]];}
      else return;
      return save(next);
    });
  };
  async function load(){root.innerHTML='<p role="status">Loading shop catalog…</p>';try{catalog=await api('shop-list');draw();}catch(e){if(!disposed)root.innerHTML=`<h1>Shop</h1><p role="alert">${esc(e.message)}</p><button type="button" class="secondary" data-reload>Retry</button>`;}}
  load();
  return ()=>{disposed=true;cleanupPreview?.();dialog.remove();root.onclick=null;};
}
