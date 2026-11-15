import {escapeHtml as esc} from '../../public/articles/content.js';
export const articleIndexPath=language=>language==='sk'?'/articles?lang=sk':'/articles';
export function preferredArticles(items,language) {
  const groups=new Map();
  for(const item of items) {
    const key=item.translation_group||item.id||item.slug;
    if(!groups.has(key)||item.language===language)groups.set(key,item);
  }
  return [...groups.values()];
}
export function articleLanguages(items,language,{index=false}={}) {
  const versions=index?['sk','en'].map(language=>({language,href:articleIndexPath(language)})):items.map(item=>({language:item.language||'en',href:'/articles/'+item.slug}));
  if(!index&&versions.length<2)return '';
  return `<nav class="article-languages" aria-label="${language==='sk'?'Jazyk článku':'Article language'}">${versions.sort((a,b)=>b.language.localeCompare(a.language)).map(item=>`<a href="${esc(item.href)}" lang="${item.language}" hreflang="${item.language}" ${item.language===language?'aria-current="page"':''} aria-label="${item.language==='sk'?'Slovenčina':'English'}">${item.language.toUpperCase()}</a>`).join('')}</nav>`;
}
