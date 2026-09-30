import {parse} from 'parse5';
import {svgIcon} from '../../public/ui/icons.js';

const glyphIcons=new Map([[0x2197,'arrowUpRight'],[0x2192,'arrowRight'],[0x2190,'arrowLeft'],[0x2193,'arrowDown'],[0x2191,'arrowUp'],[0x21bb,'refresh'],[0x25a4,'templates'],[0xff0b,'plus'],[0x25b6,'play'],[0x2161,'pause'],[0xd7,'close']].map(([code,name])=>[String.fromCodePoint(code),name]));
const escapeText=value=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// Replace only visible icon text inside links/buttons, never scripts, CSS,
// attributes or other slide content. Source edits preserve the uploaded layout.
export function normalizePresentationCtaArrows(html) {
  const document=parse(html,{sourceCodeLocationInfo:true}),edits=[];
  function walk(node,inControl=false) {
    if(['script','style','textarea','title','code','pre','svg','math'].includes(node.tagName))return;
    const control=inControl || node.tagName==='a' || node.tagName==='button';
    if(control && node.nodeName==='#text' && [...node.value].some(char=>glyphIcons.has(char)) && node.sourceCodeLocation){
      let text='',previousIcon=false;
      for(const char of node.value){
        const name=glyphIcons.get(char);
        if(name){text+=svgIcon(name,'shapeviz-cta-arrow').replace('><path',' style="display:inline-block;vertical-align:-.125em;flex-shrink:0"><path');previousIcon=true;}
        else if(!(previousIcon&&[65038,65039].includes(char.codePointAt(0)))){text+=escapeText(char);previousIcon=false;}
      }
      edits.push({...node.sourceCodeLocation,text});
    }
    node.childNodes?.forEach(child=>walk(child,control));
  }
  walk(document);
  for(const edit of edits.sort((a,b)=>b.startOffset-a.startOffset))html=html.slice(0,edit.startOffset)+edit.text+html.slice(edit.endOffset);
  return html;
}
