import {parseFragment} from 'parse5';

const allowedBrandMarks=new Set([0xa9,0xae,0x2122]);
const pictograph=/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;
const ranges=[[0x2190,0x21ff],[0x2300,0x23ff],[0x25a0,0x27ff],[0x2b00,0x2bff]];
const controls=new Set([0xd7,0x2161,0xff0b,0xfe0f,0x20e3]);
function forbidden(char){
  const point=char.codePointAt(0);
  if(allowedBrandMarks.has(point))return false;
  return pictograph.test(char)||controls.has(point)||ranges.some(([from,to])=>point>=from&&point<=to);
}
function decode(source){
  // Check escaped spellings as well as literal glyphs: HTML entities, JS
  // escapes (including astral/surrogate forms), and CSS content escapes.
  return source.replace(/&(?:#[xX][\da-fA-F]+|#\d+|[a-zA-Z][\da-zA-Z]+);/g,entity=>parseFragment(entity).childNodes[0]?.value??entity)
    .replace(/\\u\{([\da-fA-F]{1,6})\}|\\u([\da-fA-F]{4})|\\x([\da-fA-F]{2})/g,(match,...args)=>{
      const point=parseInt(args[0]||args[1]||args[2],16);return point<=0x10ffff?String.fromCodePoint(point):match;
    })
    .replace(/\\([\da-fA-F]{1,6})(?:[ \t\r\n\f])?/g,(match,hex)=>{
      const point=parseInt(hex,16);return point<=0x10ffff?String.fromCodePoint(point):match;
    });
}
export function iconPolicyViolations(source){
  const findings=[];
  for(const [index,line] of source.split(/\r?\n/).entries()){
    const points=[...new Set([...decode(line)].filter(forbidden).map(char=>'U+'+char.codePointAt(0).toString(16).toUpperCase()))];
    if(points.length)findings.push({line:index+1,points});
  }
  return findings;
}
