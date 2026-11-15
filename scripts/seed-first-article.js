import {firstArticle} from '../src/articles/first-article.js';
import {validateArticle} from '../src/articles/store.js';
const env=process.env;
if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw new Error('Configure the project Supabase URL and server key.');
const article=validateArticle(firstArticle,env);
const response=await fetch(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/articles?on_conflict=slug',{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({...article,published_at:new Date().toISOString()}),signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error('Article seed failed: HTTP '+response.status);
const rows=await response.json();console.log(rows.length?'First article published.':'First article already exists; existing content was preserved.');
