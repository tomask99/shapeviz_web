import {seoFields} from '../shop/seo-fields.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountShopSeo(form, api) {
  const panel=document.createElement('section');panel.className='shop-seo';
  panel.innerHTML=`<h3>Product page &amp; SEO</h3><p class="fine">Create an English page on Shapeviz that people can discover in search. Payments and downloads stay on Gumroad.</p>
    <label class="check"><input type="checkbox" name="seo_enabled">Publish product page</label>
    <p class="fine">Requires a visible product and a live shop. Turn this off to keep the page content as a draft.</p>
    <button type="button" class="secondary" data-import>Load name and cover from Gumroad</button><p data-import-status role="status"></p>
    <div class="seo-fields">${seoFields.map(f=>`<label>${esc(f.label)}${f.multiline?`<textarea rows="${f.name==='body'?8:3}" name="seo_${f.name}" maxlength="${f.max}"></textarea>`:`<input name="seo_${f.name}" maxlength="${f.max}" ${f.name==='image'?'type="url"':''}>`}<small>${esc(f.hint)}</small></label>`).join('')}</div>
    <h4>Questions &amp; answers</h4><p class="fine">Answer practical questions about installation, compatibility and using the product.</p><div data-faqs></div><button type="button" class="secondary" data-add-faq>Add question</button>
    <div class="seo-preview"><p class="fine">Search appearance preview</p><span data-preview-url></span><strong data-preview-title></strong><p data-preview-description></p></div><ul data-seo-checks></ul><p class="fine">This preview is a guide. Google may choose different text, and publication does not guarantee indexing or rankings.</p>`;
  form.querySelector('.actions').before(panel);
  const field=name=>form.elements['seo_'+name], faqs=panel.querySelector('[data-faqs]');
  const addFaq=(value={})=>{
    if(faqs.children.length>=8)return;
    const row=document.createElement('fieldset');row.className='seo-faq';
    row.innerHTML=`<legend>Question and answer</legend><label>Question<input data-question maxlength="200" required value="${esc(value.question)}"></label><label>Answer<textarea data-answer maxlength="2000" required rows="3">${esc(value.answer)}</textarea></label><button type="button" class="quiet">Remove question</button>`;
    row.querySelector('button').onclick=()=>{row.remove();};faqs.append(row);
  };
  panel.querySelector('[data-add-faq]').onclick=()=>addFaq();
  const refresh=()=>{
    panel.querySelector('[data-preview-url]').textContent='www.shapeviz.com/shop/'+(field('slug').value||'your-product');
    panel.querySelector('[data-preview-title]').textContent=field('title').value||'Your product title';
    panel.querySelector('[data-preview-description]').textContent=field('description').value||'Describe the product and its main benefit.';
    const phrase=field('focusPhrase').value.trim().toLowerCase();
    const checks=[`SEO title: ${field('title').value.length} characters (guide: 50–60).`,`Meta description: ${field('description').value.length} characters (guide: 140–160).`,field('image').value&&field('imageAlt').value?'Cover image and description added.':'Add a cover image and a description of what it shows.',phrase?([field('heading'),field('body')].some(el=>el.value.toLowerCase().includes(phrase))?'Target phrase appears in the page content.':'Consider using the target phrase naturally in the page content.'):'Choose a target search phrase to guide your writing.'];
    panel.querySelector('[data-seo-checks]').innerHTML=checks.map(c=>`<li>${esc(c)}</li>`).join('');
  };
  panel.addEventListener('input',refresh);
  panel.querySelector('[data-import]').onclick=async event=>{
    const button=event.currentTarget,status=panel.querySelector('[data-import-status]');button.disabled=true;status.textContent='Loading Gumroad metadata…';
    const source=form.elements.url.value;
    try{const data=await api('shop-metadata',{url:source});if(source!==form.elements.url.value)return;
      if(!data.title&&!data.image)throw new Error('Could not read this product. Check the URL or fill the fields manually.');
      if(!field('heading').value)field('heading').value=(data.title||'').slice(0,160);
      if(!field('title').value)field('title').value=(data.title||'').slice(0,120);
      if(!field('slug').value&&!field('slug').readOnly)field('slug').value=(data.title||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100).replace(/-$/,'');
      if(!field('image').value)field('image').value=data.image||'';
      status.textContent='Metadata loaded into empty fields. Add your own description, features and image description.';refresh();
    }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  };
  return {
    open(product){for(const f of seoFields)field(f.name).value=product?.seo?.[f.name]||'';field('enabled').checked=product?.seo?.enabled===true;field('slug').readOnly=product?.seo?.enabled===true;faqs.replaceChildren();(product?.seo?.faqs||[]).forEach(addFaq);panel.querySelector('[data-import-status]').textContent='';refresh();},
    value(){return {enabled:field('enabled').checked,...Object.fromEntries(seoFields.map(f=>[f.name,field(f.name).value])),faqs:[...faqs.children].map(row=>({question:row.querySelector('[data-question]').value,answer:row.querySelector('[data-answer]').value}))};}
  };
}
