import {svgIcon} from '../ui/icons.js';
import {uploadGalleryImage} from './gallery-upload.js';
import {escapeHtml as esc,renderDocument,documentText,safeLink} from '../articles/content.js';

const slugify = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120).replace(/-$/,'');
const blank = () => ({translation_group:'',language:'en',title:'',slug:'',excerpt:'',seo_title:'',seo_description:'',cover:null,status:'draft',content:{type:'doc',content:[{type:'paragraph'}]}});
let dependencies;
export function mountArticles({root,api,notify}) {
  let disposed=false,items=[],editor=null,dialog=null,dirty=false,busy=false,current=null,cover=null;
  const date = value => new Date(value).toLocaleDateString('en',{day:'numeric',month:'short',year:'numeric'});
  root.innerHTML=`<div class="article-admin"><div class="article-admin-heading"><div><h2>Stories worth sharing.</h2><p class="fine">Write, preview and publish guides from the studio.</p></div><div class="actions"><a class="secondary" href="/articles" target="_blank" rel="noopener">View articles ${svgIcon('arrowUpRight')}</a><button class="primary" type="button" data-new-article>${svgIcon('plus')} New article</button></div></div><p data-articles-error role="alert"></p><div class="article-admin-grid" aria-live="polite"><p class="fine">Loading articles…</p></div></div>`;
  const grid=root.querySelector('.article-admin-grid'),error=root.querySelector('[data-articles-error]');
  function draw() {
    grid.innerHTML=items.length ? items.map(item=>`<article class="article-admin-card"><button type="button" data-open="${item.id}" aria-label="Edit ${esc(item.title)}"><div class="article-card-image">${item.cover?`<img src="${esc(item.cover.src.replace('/image.webp','/thumb.webp'))}" alt="" loading="lazy">`:`<span>SHAPEVIZ<br>FIELD NOTES</span>`}<span class="article-status ${item.status}">${item.status==='published'?'Published':'Draft'}</span></div><div class="article-card-copy"><small>${item.language==='sk'?'SK':'EN'} · Updated ${date(item.updated_at)}</small><h3>${esc(item.title)}</h3><p>${esc(item.excerpt||'Your next story starts here.')}</p><span class="article-card-edit">Edit article ${svgIcon('arrowUpRight')}</span></div></button><div class="article-card-actions">${item.status==='published'?`<a href="/articles/${esc(item.slug)}" target="_blank" rel="noopener">Open article</a>`:'<span>Only visible to you</span>'}<button type="button" class="quiet" data-delete="${item.id}" aria-label="Delete ${esc(item.title)}">${svgIcon('trash')}</button></div></article>`).join('') : '<div class="article-empty"><p class="eyebrow">A NEW CHAPTER</p><h3>Share what you know.</h3><p>Create your first guide, tutorial or studio story.</p><button type="button" class="primary" data-new-article>Create an article</button></div>';
  }
  async function load() {
    try { const data=await api('articles-list');if(disposed)return;items=data.items;error.textContent='';draw(); }
    catch(e) {if(!disposed){error.textContent=e.message;grid.innerHTML='<button type="button" class="secondary" data-retry-articles>Try again</button>';}}
  }
  function setDirty() {dirty=true;updateStatus();}
  function updateStatus() {
    if(!dialog)return;
    dialog.querySelector('[data-editor-status]').textContent=busy?'Working…':dirty?'Unsaved changes':current?.id?'All changes saved':'New draft';
    for(const button of dialog.querySelectorAll('[data-save-article],[data-publish-article],[data-close-editor],[data-cover-upload],[data-image-upload],[data-preview-article]')) button.disabled=busy;
    dialog.dataset.dismissPending=String(busy||dirty);
    const words=documentText(editor?.getJSON()||current.content).trim().split(/\s+/).filter(Boolean).length;
    dialog.querySelector('[data-word-count]').textContent=`${words} words · ${Math.max(1,Math.ceil(words/220))} min read`;
  }
  function closeEditor(force=false) {
    if(busy||!force&&dirty&&!confirm('Discard your unsaved article changes?'))return;
    editor?.destroy();editor=null;dialog?.close();dialog?.remove();dialog=null;dirty=false;current=null;
  }
  function coverPreview() {
    dialog.querySelector('[data-cover-preview]').innerHTML=cover?`<img src="${esc(cover.src)}" alt="${esc(cover.alt)}"><button type="button" class="quiet" data-cover-remove aria-label="Remove cover">${svgIcon('trash')}</button>`:'<span>A strong first impression.</span>';
  }
  function values(status) {
    const data=Object.fromEntries(new FormData(dialog.querySelector('form')));
    return {...current,...data,status,cover:cover?{...cover,alt:data.cover_alt||cover.alt}:null,content:editor.getJSON()};
  }
  function updateSeo() {
    const form=dialog.querySelector('form');
    dialog.querySelector('[data-search-title]').textContent=form.elements.seo_title.value||form.elements.title.value||'Your article title';
    dialog.querySelector('[data-search-url]').textContent='shapeviz.com/articles/'+(form.elements.slug.value||'your-article');
    dialog.querySelector('[data-search-description]').textContent=form.elements.seo_description.value||form.elements.excerpt.value||'Write a helpful introduction to tell readers what they will learn.';
    dialog.querySelector('[data-title-count]').textContent=form.elements.seo_title.value.length+' / 100';
    dialog.querySelector('[data-description-count]').textContent=form.elements.seo_description.value.length+' / 320';
  }
  async function save(status) {
    if(busy)return;
    const form=dialog.querySelector('form');
    if(!form.reportValidity())return;
    busy=true;updateStatus();dialog.querySelector('[data-editor-error]').textContent='';editor.setEditable(false,false);
    for(const input of form.querySelectorAll('input,textarea'))input.readOnly=true;
    try {
      const {article}=await api('articles-save',values(status));
      if(disposed)return;
      current=article;dirty=false;cover=article.cover;
      form.elements.slug.readOnly=!!article.published_at;
      dialog.querySelector('[data-publish-article]').textContent=article.status==='published'?'Update live article':'Publish article';
      dialog.querySelector('[data-save-article]').textContent=article.status==='published'?'Move to draft':'Save draft';
      dialog.querySelector('[data-live-link]').innerHTML=article.status==='published'?`<a href="/articles/${esc(article.slug)}" target="_blank" rel="noopener">Open live article ${svgIcon('arrowUpRight')}</a>`:'';
      notify(status==='published'?'Article published.':'Draft saved.');await load();
    } catch(e) {if(dialog)dialog.querySelector('[data-editor-error]').textContent=e.message;}
    finally {busy=false;if(dialog){editor.setEditable(true,false);for(const input of form.querySelectorAll('input,textarea'))input.readOnly=false;form.elements.slug.readOnly=!!current.published_at;updateStatus();}}
  }
  // Small accessible modal forms keep link/image editing out of browser prompts.
  function editFields(title,fields,onSave) {
    const modal=document.createElement('dialog');modal.className='article-fields-dialog';
    modal.setAttribute('aria-label',title);
    modal.innerHTML=`<form><h2>${esc(title)}</h2>${fields.map(f=>`<label>${esc(f.label)}<input name="${f.name}" value="${esc(f.value||'')}" maxlength="${f.max||2048}" ${f.required?'required':''}></label>`).join('')}<p role="alert" data-field-error></p><div class="actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="primary" type="submit">Apply</button></div></form>`;
    dialog.append(modal);modal.querySelector('[data-cancel]').onclick=()=>modal.close();
    modal.addEventListener('close',()=>modal.remove(),{once:true});
    modal.querySelector('form').onsubmit=e=>{e.preventDefault();try{onSave(Object.fromEntries(new FormData(e.currentTarget)));modal.close();}catch(error){modal.querySelector('[data-field-error]').textContent=error.message;}};
    modal.showModal();
  }
  function imageDetails(media,existing=false) {
    editFields('Image details',[{name:'alt',label:'Image description (alt text)',value:media.alt,required:true,max:500},{name:'title',label:'Caption / image credit',value:media.title,max:1000}],data=>{
      const attrs={...media,...data};
      if(existing)editor.chain().focus().updateAttributes('image',attrs).run();else editor.chain().focus().setImage(attrs).run();
    });
  }
  async function upload(file,isCover) {
    if(!file||busy)return;
    busy=true;updateStatus();
    try {
      const uploaded=await uploadGalleryImage(file,api,()=>{},'articles-upload');
      if(disposed||!dialog)return;
      const media={src:uploaded.full,width:uploaded.width,height:uploaded.height,alt:uploaded.alt,title:''};
      if(isCover){cover=media;dialog.querySelector('[name=cover_alt]').value=media.alt;coverPreview();setDirty();}
      else imageDetails(media);
    }catch(e){if(dialog)dialog.querySelector('[data-editor-error]').textContent=e.message;}
    finally{busy=false;updateStatus();}
  }
  async function open(id) {
    if(dialog||busy)return;
    busy=true;
    try {
      dependencies ||= import('/admin/vendor/article-editor.js');
      const [deps,data]=await Promise.all([dependencies,id?api('articles-get',undefined,{id}):{article:blank()}]);
      if(disposed)return;
      current=data.article;cover=current.cover;dirty=false;
      dialog=document.createElement('dialog');dialog.className='article-editor-dialog';dialog.setAttribute('aria-label','Article editor');
      const field=(name,label,max,textarea=false)=>`<label>${label}${textarea?`<textarea name="${name}" rows="3" maxlength="${max}">${esc(current[name])}</textarea>`:`<input name="${name}" maxlength="${max}" value="${esc(current[name])}">`}</label>`;
      dialog.innerHTML=`<form class="article-editor-form"><header class="article-editor-top"><div><p class="eyebrow">SHAPEVIZ / ARTICLES</p><p data-editor-status role="status"></p></div><div class="actions"><button class="secondary" type="button" data-preview-article>Preview</button><button class="secondary" type="button" data-save-article>${current.status==='published'?'Move to draft':'Save draft'}</button><button class="primary" type="submit" data-publish-article>${current.status==='published'?'Update live article':'Publish article'}</button><button class="quiet" type="button" data-close-editor aria-label="Close article editor">${svgIcon('close')}</button></div></header><p data-editor-error role="alert"></p><div class="article-editor-layout"><div class="article-writing"><label class="article-title-label">ARTICLE TITLE<textarea class="article-title-input" name="title" rows="2" placeholder="Give your story a title" maxlength="180" required>${esc(current.title)}</textarea></label>${field('excerpt','Introduction',500,true)}<div class="article-toolbar" role="toolbar" aria-label="Text formatting"><select data-block aria-label="Text style"><option value="paragraph">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select>${[['bold','Bold'],['italic','Italic'],['bulletList','Bullets'],['orderedList','Numbered list'],['blockquote','Quote'],['link','Link'],['image','Image'],['undo','Undo'],['redo','Redo']].map(([key,label])=>`<button type="button" class="quiet" data-command="${key}" ${key==='image'?'data-image-upload':''} ${['bold','italic','bulletList','orderedList','blockquote','link'].includes(key)?'aria-pressed="false"':''}>${label}</button>`).join('')}</div><div class="article-prose article-rich-editor" data-rich-editor></div><div class="article-writing-bottom"><span data-word-count></span><span>Select text to format it. Drag images to move them.</span></div></div><div class="article-editor-sidebar"><section><p class="eyebrow">COVER IMAGE</p><div class="article-cover-preview" data-cover-preview></div><button class="secondary" type="button" data-cover-upload>${svgIcon('upload')} ${cover?'Replace':'Add'} cover</button><label>Cover description<input name="cover_alt" value="${esc(cover?.alt||'')}" maxlength="500" placeholder="Describe what the image shows"></label><p class="fine">JPG, PNG, WebP or AVIF. Optimized automatically. Up to 25 MB.</p></section><details open><summary>Search &amp; sharing</summary><label>Article language<select name="language" aria-label="Article language"><option value="en" ${current.language!=='sk'?'selected':''}>English</option><option value="sk" ${current.language==='sk'?'selected':''}>Slovenčina</option></select></label><label>Translation group (optional)<input name="translation_group" value="${esc(current.translation_group||'')}" maxlength="120" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="product-visualization"></label><p class="fine">Use the same group on the Slovak and English versions to connect their language switch. One article per language in each group.</p><label>Article URL<input name="slug" value="${esc(current.slug)}" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="120" required ${current.published_at?'readonly':''}></label><p class="fine">${current.published_at?'The published URL is fixed to protect existing links.':'Short, descriptive words separated by hyphens.'}</p>${field('seo_title','SEO title (optional)',100)}<small data-title-count></small>${field('seo_description','SEO description (optional)',320,true)}<small data-description-count></small><p class="fine">Aim for a concise title and a clear summary. Empty fields use the article title and introduction.</p><div class="article-search-preview"><small data-search-url></small><strong data-search-title></strong><p data-search-description></p></div></details><div data-live-link>${current.status==='published'?`<a href="/articles/${esc(current.slug)}" target="_blank" rel="noopener">Open live article ${svgIcon('arrowUpRight')}</a>`:''}</div></div></div><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-cover-file hidden><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-inline-file hidden></form>`;
      root.append(dialog);
      const {Editor,StarterKit,Image,Placeholder,mergeAttributes}=deps;
      const ArticleImage=Image.extend({
        addAttributes(){return {...this.parent?.(),width:{default:1200},height:{default:800}};},
        renderHTML({HTMLAttributes}){const {title,...attrs}=HTMLAttributes;return ['figure',{},['img',mergeAttributes(attrs)],...(title?[['figcaption',{},title]]:[])];}
      });
      editor=new Editor({element:dialog.querySelector('[data-rich-editor]'),extensions:[StarterKit.configure({heading:{levels:[2,3]},link:{openOnClick:false,autolink:false,linkOnPaste:false,isAllowedUri:url=>!!safeLink(url)}}),ArticleImage.configure({allowBase64:false}),Placeholder.configure({placeholder:'Start writing. Share the useful details, show your process…'})],content:current.content,editorProps:{attributes:{role:'textbox','aria-label':'Article content','aria-multiline':'true',spellcheck:'true'},handlePaste:(view,event,slice)=>{let hasImage=false;slice.content.descendants(n=>{if(n.type.name==='image')hasImage=true;});if(hasImage){dialog.querySelector('[data-editor-error]').textContent='Upload images with the Image button so they are optimized and hosted on your website.';return true;}return false;}},onUpdate:setDirty,onSelectionUpdate:()=>{
        for(const button of dialog.querySelectorAll('[data-command][aria-pressed]'))button.setAttribute('aria-pressed',String(editor.isActive(button.dataset.command)));
        dialog.querySelector('[data-block]').value=editor.isActive('heading',{level:2})?'h2':editor.isActive('heading',{level:3})?'h3':'paragraph';
      }});
      dialog.querySelector('[data-rich-editor]').addEventListener('dblclick',event=>{if(event.target.closest('figure')&&editor.isActive('image'))imageDetails(editor.getAttributes('image'),true);});
      function resizeTitle(){const title=dialog.querySelector('[name=title]');title.style.height='auto';title.style.height=title.scrollHeight+'px';}
      let manualSlug=!!current.slug;
      dialog.querySelector('form').addEventListener('input',event=>{if(event.target.name==='slug')manualSlug=true;if(event.target.name==='title'&&!manualSlug)dialog.querySelector('[name=slug]').value=slugify(event.target.value);resizeTitle();setDirty();updateSeo();});
      dialog.querySelector('form').onsubmit=event=>{event.preventDefault();save('published');};
      dialog.querySelector('[data-block]').onchange=event=>{const v=event.target.value;v==='paragraph'?editor.chain().focus().setParagraph().run():editor.chain().focus().setHeading({level:Number(v[1])}).run();};
      dialog.querySelector('[data-cover-file]').onchange=e=>upload(e.target.files[0],true).finally(()=>e.target.value='');
      dialog.querySelector('[data-inline-file]').onchange=e=>upload(e.target.files[0],false).finally(()=>e.target.value='');
      dialog.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
      dialog.addEventListener('click',event=>{
        const b=event.target.closest('button');if(!b||busy)return;
        if(b.hasAttribute('data-close-editor'))closeEditor();
        if(b.hasAttribute('data-save-article')){if(current.status!=='published'||confirm('Remove this article from the public website and save it as a draft?'))save('draft');}
        if(b.hasAttribute('data-cover-upload'))dialog.querySelector('[data-cover-file]').click();
        if(b.hasAttribute('data-cover-remove')){cover=null;coverPreview();setDirty();}
        if(b.hasAttribute('data-preview-article'))preview();
        const command=b.dataset.command;
        if(command==='image'){if(editor.isActive('image'))imageDetails(editor.getAttributes('image'),true);else dialog.querySelector('[data-inline-file]').click();}
        else if(command==='link')editFields('Add or change link',[{name:'href',label:'Website address (leave empty to remove)',value:editor.getAttributes('link').href}],({href})=>{if(href&&!safeLink(href))throw new Error('Enter an http, https or website link.');href?editor.chain().focus().extendMarkRange('link').setLink({href:safeLink(href)}).run():editor.chain().focus().extendMarkRange('link').unsetLink().run();});
        else if(command){const method={bold:'toggleBold',italic:'toggleItalic',bulletList:'toggleBulletList',orderedList:'toggleOrderedList',blockquote:'toggleBlockquote',undo:'undo',redo:'redo'}[command];if(method)editor.chain().focus()[method]().run();}
      });
      coverPreview();updateSeo();dialog.showModal();resizeTitle();
    }catch(e){error.textContent=e.message;editor?.destroy();editor=null;dialog?.remove();dialog=null;dirty=false;}
    finally{busy=false;updateStatus();}
  }
  function preview() {
    const data=values(current.status),modal=document.createElement('dialog');modal.className='article-preview-dialog';modal.setAttribute('aria-label','Article preview');
    modal.innerHTML=`<header><p class="eyebrow">PRIVATE PREVIEW</p><button type="button" class="quiet" aria-label="Close preview">${svgIcon('close')}</button></header><div class="article-preview-inner"><p class="eyebrow">SHAPEVIZ / FIELD NOTES</p><h1>${esc(data.title||'Untitled article')}</h1><p class="article-preview-intro">${esc(data.excerpt)}</p>${data.cover?`<img class="article-preview-cover" src="${esc(data.cover.src)}" alt="${esc(data.cover.alt)}">`:''}<div class="article-prose">${renderDocument(data.content)}</div></div>`;
    dialog.append(modal);modal.querySelector('button').onclick=()=>modal.close();modal.addEventListener('close',()=>modal.remove(),{once:true});modal.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();});modal.showModal();
  }
  root.addEventListener('click',async event=>{
    if(dialog?.contains(event.target))return;
    const button=event.target.closest('button');if(!button||busy)return;
    if(button.hasAttribute('data-new-article'))open();
    if(button.dataset.open)open(button.dataset.open);
    if(button.hasAttribute('data-retry-articles'))load();
    if(button.dataset.delete){const article=items.find(item=>item.id===button.dataset.delete);if(!confirm(`Delete “${article.title}”? ${article.status==='published'?'Its public page will be removed.':'This cannot be undone.'}`))return;busy=true;button.disabled=true;try{await api('articles-delete',{id:article.id,version:article.version});await load();notify('Article deleted.');}catch(e){error.textContent=e.message;}finally{busy=false;button.disabled=false;}}
  });
  const beforeUnload=event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}};
  addEventListener('beforeunload',beforeUnload);
  load();
  return()=>{disposed=true;editor?.destroy();editor=null;dialog?.remove();dialog=null;removeEventListener('beforeunload',beforeUnload);};
}
