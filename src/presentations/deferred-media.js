import {parse} from 'parse5';

const loaderPath='/presentation-system/media.js';
const attributeNames={img:['src','srcset'],video:['src','poster','autoplay'],audio:['src','autoplay'],source:['src','srcset'],track:['src']};

// Remove fetch-triggering attributes before the browser's preload scanner sees
// them. Editing source ranges leaves uploaded scripts, CSS and layout intact.
export function deferPresentationMedia(html){
  const document=parse(html,{sourceCodeLocationInfo:true}),edits=[];
  let count=0,head,loaderPresent=false;
  function walk(node,inSlide=false){
    const attrs=new Map(node.attrs?.map(a=>[a.name,a.value])||[]);
    const slide=inSlide||attrs.has('data-slide')||(attrs.get('class')||'').split(/\s+/).includes('slide');
    if(node.tagName==='head')head=node.sourceCodeLocation?.startTag;
    if(node.tagName==='script'&&attrs.get('src')===loaderPath)loaderPresent=true;
    const loc=node.sourceCodeLocation;
    if(slide&&attributeNames[node.tagName]&&loc?.startTag){
      const tag=html.slice(loc.startTag.startOffset,loc.startTag.endOffset);
      const insertAt=loc.startTag.startOffset+tag.search(/\/?\s*>$/);
      const alreadyManaged=attrs.has('data-sv-media');
      const names=attributeNames[node.tagName].filter(name=>loc.attrs?.[name]&&!attrs.has('data-sv-'+name));
      for(const name of names){
        const attr=loc.attrs[name];
        const raw=html.slice(attr.startOffset,attr.endOffset);
        edits.push({start:attr.startOffset,end:attr.endOffset,text:raw.replace(new RegExp('^'+name,'i'),'data-sv-'+name)});
      }
      if(names.length||alreadyManaged){
        count++;
        if(!alreadyManaged)edits.push({start:insertAt,end:insertAt,text:' data-sv-media=""'});
      }
      if(['audio','video'].includes(node.tagName)){
        const attr=loc.attrs?.preload;
        if(attr)edits.push({start:attr.startOffset,end:attr.endOffset,text:'preload="none"'});
        else edits.push({start:insertAt,end:insertAt,text:' preload="none"'});
        // <video><source> needs its own marker even without a src attribute.
        if(!alreadyManaged&&!names.length){count++;edits.push({start:insertAt,end:insertAt,text:' data-sv-media=""'});}
      }
    }
    // Explicit media preload links would otherwise bypass the deferred attrs.
    if(node.tagName==='link'&&/^(preload|prefetch)$/i.test(attrs.get('rel')||'')&&/^(image|video|audio)$/i.test(attrs.get('as')||'')){
      for(const name of ['href','imagesrcset']){const attr=loc?.attrs?.[name];if(attr)edits.push({start:attr.startOffset,end:attr.endOffset,text:html.slice(attr.startOffset,attr.endOffset).replace(new RegExp('^'+name,'i'),'data-sv-'+name)});}
    }
    if(['script','style','textarea','template','noscript'].includes(node.tagName))return;
    node.childNodes?.forEach(child=>walk(child,slide));
  }
  walk(document);
  if(!count)return html;
  if(!loaderPresent){
    // Blocking head script installs the scoped play hook before deck scripts.
    const at=head?.endOffset??0;
    edits.push({start:at,end:at,text:`<script src="${loaderPath}"></script>`});
  }
  for(const edit of edits.sort((a,b)=>b.start-a.start))html=html.slice(0,edit.start)+edit.text+html.slice(edit.end);
  return html;
}
