import {parse} from 'parse5';

const arrowSvg='<svg class="shapeviz-cta-arrow" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false" style="display:inline-block;vertical-align:-.125em;flex-shrink:0"><path d="M5 19 19 5M5 5h14v14"/></svg>';
const escapeText=value=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// Replace only visible arrow text inside links/buttons, never scripts, CSS,
// attributes or other slide content. Source edits preserve the uploaded layout.
export function normalizePresentationCtaArrows(html) {
  const document=parse(html,{sourceCodeLocationInfo:true}),edits=[];
  function walk(node,inControl=false) {
    if(['script','style','textarea','title','code','pre','svg','math'].includes(node.tagName))return;
    const control=inControl || node.tagName==='a' || node.tagName==='button';
    if(control && node.nodeName==='#text' && node.value.includes('↗') && node.sourceCodeLocation){
      edits.push({...node.sourceCodeLocation,text:node.value.split(/↗[\uFE0E\uFE0F]?/u).map(escapeText).join(arrowSvg)});
    }
    node.childNodes?.forEach(child=>walk(child,control));
  }
  walk(document);
  for(const edit of edits.sort((a,b)=>b.startOffset-a.startOffset))html=html.slice(0,edit.startOffset)+edit.text+html.slice(edit.endOffset);
  return html;
}
