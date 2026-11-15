import {productVisualizationArticleEn} from '../src/articles/product-visualization-article-en.js';
import {productVisualizationArticle} from '../src/articles/product-visualization-article.js';
import {validateArticle} from '../src/articles/store.js';
const env=process.env;
if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw new Error('Configure the project Supabase URL and server key.');
const root=env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/articles';
const headers={apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'};
async function call(query,options={}) {
  const r=await fetch(root+query,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('Article translation request failed: HTTP '+r.status);
  return r.json();
}
const [source]=await call('?'+new URLSearchParams({slug:'eq.'+productVisualizationArticle.slug,select:'id,version,translation_group'}));
if(!source)throw new Error('Publish the Slovak article first.');
const group=productVisualizationArticleEn.translation_group;
if(source.translation_group&&source.translation_group!==group)throw new Error('Source belongs to a different translation group.');
const english=validateArticle(productVisualizationArticleEn,env);
const rows=await call('?on_conflict=slug',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({...english,published_at:new Date().toISOString()})});
if(!source.translation_group){
  const changed=await call('?'+new URLSearchParams({id:'eq.'+source.id,version:'eq.'+source.version}),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({translation_group:group,version:source.version+1,updated_at:new Date().toISOString()})});
  if(changed.length!==1)throw new Error('Source changed during publication. Retry to link the current version.');
}
console.log(rows.length?'English translation published and linked.':'Existing translation preserved; language links checked.');
