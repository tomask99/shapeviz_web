import {randomUUID} from 'node:crypto';
import {validateDocument,validateImage,documentText} from '../../public/articles/content.js';
const fail = (status,message) => Object.assign(new Error(message),{status});
export const articleActions = ['articles-list','articles-get','articles-save','articles-delete','articles-upload'];
export const articleReads = ['articles-list','articles-get'];
export const articleListFields = 'id,slug,title,excerpt,cover,status,version,created_at,updated_at,published_at';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function validateArticle(input,env) {
  if (!input || !['draft','published'].includes(input.status)) throw fail(400,'Choose draft or published.');
  const result = {status:input.status};
  for (const [key,max] of Object.entries({title:180,slug:120,excerpt:500,seo_title:100,seo_description:320})) {
    if (typeof input[key] !== 'string' || input[key].length > max) throw fail(400,`Check the ${key.replaceAll('_',' ')} field.`);
    result[key] = input[key].trim();
  }
  if (!result.title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug)) throw fail(400,'Enter a title and a URL name such as creating-pbr-maps.');
  result.content = validateDocument(input.content,env.SUPABASE_URL);
  result.cover = input.cover ? validateImage(input.cover,env.SUPABASE_URL) : null;
  if (result.status === 'published' && (!result.cover || !result.excerpt || !documentText(result.content).trim())) throw fail(400,'Add a cover, a short introduction and article content before publishing.');
  return result;
}
export async function handleArticles({action,body={},url,call,env,user}) {
  if (action === 'articles-upload') {
    if (!uuid.test(body.uploadId || '')) throw fail(400,'Invalid upload ID.');
    const root=env.SUPABASE_URL.replace(/\/$/,'');
    const result={};
    for (const name of ['image','thumb']) {
      const object=`uploads/${user.id}/${body.uploadId}/${name}.webp`;
      const signed=await call(`/storage/v1/object/upload/sign/article-images/${object}`,{method:'POST',body:{}});
      result[name]={url:root+'/storage/v1'+signed.url,publicUrl:root+'/storage/v1/object/public/article-images/'+object};
    }
    return result;
  }
  if (action === 'articles-list') return {items:await call(`/rest/v1/articles?select=${articleListFields}&order=updated_at.desc&limit=500`)};
  const id = action === 'articles-get' ? url.searchParams.get('id') : body.id;
  if (id && !uuid.test(id)) throw fail(400,'Invalid article ID.');
  const current = id ? (await call(`/rest/v1/articles?id=eq.${id}&select=*`))?.[0] : null;
  if (id && !current || !id && ['articles-get','articles-delete'].includes(action)) throw fail(404,'Article not found.');
  if (action === 'articles-get') return {article:current};
  const conflict = () => fail(409,'This article changed in another window. Your edits are still here. Reopen the saved article before trying again.');
  if (current && body.version !== current.version) throw conflict();
  const filter = current ? `?id=eq.${id}&version=eq.${body.version}` : '';
  if (action === 'articles-delete') {
    const deleted = await call('/rest/v1/articles'+filter,{method:'DELETE',headers:{Prefer:'return=representation'}});
    if (!deleted?.length) throw conflict();
    return {deleted:true};
  }
  const article = validateArticle(body,env);
  if (current?.published_at && article.slug !== current.slug) throw fail(400,'Published URLs stay fixed so existing links keep working.');
  const now=new Date().toISOString();
  const saved=await call('/rest/v1/articles'+filter,{method:current?'PATCH':'POST',headers:{Prefer:'return=representation'},body:{...article,...(!current?{id:randomUUID()}:{}),version:(current?.version||0)+1,updated_at:now,published_at:current?.published_at || (article.status==='published'?now:null)}});
  if (!saved?.length) throw conflict();
  return {article:saved[0]};
}
