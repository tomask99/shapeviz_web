// A deliberately small document schema shared by the editor and server renderer.
// Never render arbitrary HTML pasted into the editor or saved in the database.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail = message => { throw Object.assign(new Error(message), {status:400}); };
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
export function safeLink(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f]/.test(value)) return null;
  if (/^\/(?!\/)/.test(value) || /^#[a-zA-Z0-9_-]+$/.test(value)) return value;
  try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function validateImage(value, storageOrigin) {
  if (!value || typeof value.src !== 'string') fail('Choose an article image.');
  const local = /^\/media\/articles\/[a-z0-9-]+\.webp$/.test(value.src);
  const prefix = storageOrigin?.replace(/\/$/,'') + '/storage/v1/object/public/article-images/';
  const uploaded = value.src.startsWith(prefix) && new RegExp(`^uploads/${uuid}/${uuid}/image\\.webp$`).test(value.src.slice(prefix.length));
  if (!local && !uploaded) fail('Upload images using the article editor.');
  const alt = typeof value.alt === 'string' ? value.alt.trim() : '';
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!alt || alt.length > 500 || title.length > 1000) fail('Add an image description (up to 500 characters).');
  if (![value.width,value.height].every(n => Number.isInteger(n) && n > 0 && n <= 2400)) fail('Invalid image dimensions.');
  return {src:value.src, alt, title, width:value.width, height:value.height};
}
export function validateDocument(doc, storageOrigin) {
  if (!doc || doc.type !== 'doc' || JSON.stringify(doc).length > 250000) fail('The article is too large or has an invalid format.');
  let count = 0;
  const blocks = ['paragraph','heading','bulletList','orderedList','blockquote','horizontalRule','image','codeBlock'];
  function node(n, parent, depth = 0) {
    if (!n || depth > 16 || ++count > 6000) fail('The article has too many nested blocks.');
    const allowed = parent === null ? ['doc'] : parent === 'doc' || parent === 'blockquote' || parent === 'listItem' ? blocks : ['bulletList','orderedList'].includes(parent) ? ['listItem'] : ['text','hardBreak'];
    if (!allowed.includes(n.type)) fail('Unsupported article formatting.');
    if (n.type === 'text') {
      if (typeof n.text !== 'string' || n.text.length > 60000) fail('Invalid article text.');
      const marks = (Array.isArray(n.marks) ? n.marks : []).map(mark => {
        if (['bold','italic','underline','strike','code'].includes(mark.type)) return {type:mark.type};
        if (mark.type === 'link' && safeLink(mark.attrs?.href)) return {type:'link', attrs:{href:safeLink(mark.attrs.href)}};
        fail('Use a valid http, https or website link.');
      });
      if (marks.length > 8) fail('Too much formatting on one text span.');
      return {type:'text', text:n.text, ...(marks.length ? {marks} : {})};
    }
    if (n.type === 'image') return {type:'image', attrs:validateImage(n.attrs,storageOrigin)};
    if (['horizontalRule','hardBreak'].includes(n.type)) return {type:n.type};
    const result = {type:n.type};
    if (n.type === 'heading') result.attrs = {level:n.attrs?.level === 3 ? 3 : 2};
    if (n.type === 'orderedList') result.attrs = {start:Number.isInteger(n.attrs?.start) && n.attrs.start > 0 && n.attrs.start < 10000 ? n.attrs.start : 1};
    if (!Array.isArray(n.content ?? [])) fail('Invalid article blocks.');
    result.content = (n.content || []).map(child => node(child,n.type,depth+1));
    return result;
  }
  return node(doc,null);
}
export function documentText(doc) {
  return doc?.type === 'text' ? doc.text : (doc?.content || []).map(documentText).join(' ');
}
export function imageHtml(img, {hero = false, sizes = '(max-width: 760px) 92vw, 900px'} = {}) {
  const thumb = img.src.includes('/storage/v1/object/public/article-images/') ? img.src.replace(/image\.webp$/, 'thumb.webp') : img.src.replace(/\.webp$/, '-small.webp');
  const thumbWidth = Math.max(1,Math.round(img.width * Math.min(1,800/Math.max(img.width,img.height))));
  return `<img src="${escapeHtml(img.src)}" srcset="${escapeHtml(thumb)} ${thumbWidth}w, ${escapeHtml(img.src)} ${img.width}w" sizes="${escapeHtml(sizes)}" width="${img.width}" height="${img.height}" alt="${escapeHtml(img.alt)}" ${hero?'fetchpriority="high"':'loading="lazy"'} decoding="async">`;
}
export function renderDocument(doc) {
  let heading = 0;
  const render = n => {
    if (n.type === 'text') return (n.marks || []).reduce((html,mark) => {
      if (mark.type === 'link') return safeLink(mark.attrs?.href) ? `<a href="${escapeHtml(safeLink(mark.attrs.href))}">${html}</a>` : html;
      const tag = {bold:'strong',italic:'em',underline:'u',strike:'s',code:'code'}[mark.type];
      return tag ? `<${tag}>${html}</${tag}>` : html;
    },escapeHtml(n.text));
    if (n.type === 'image') return `<figure>${imageHtml(n.attrs)}${n.attrs.title?`<figcaption>${escapeHtml(n.attrs.title)}</figcaption>`:''}</figure>`;
    if (n.type === 'hardBreak') return '<br>';
    if (n.type === 'horizontalRule') return '<hr>';
    const content = (n.content || []).map(render).join('');
    if (n.type === 'doc') return content;
    if (n.type === 'heading') return `<h${n.attrs.level} id="section-${++heading}">${content}</h${n.attrs.level}>`;
    if (n.type === 'codeBlock') return `<pre><code>${content}</code></pre>`;
    const tag = {paragraph:'p',bulletList:'ul',orderedList:'ol',listItem:'li',blockquote:'blockquote'}[n.type];
    return tag ? `<${tag}${n.type==='orderedList'?` start="${n.attrs.start}"`:''}>${content}</${tag}>` : '';
  };
  return render(doc);
}
