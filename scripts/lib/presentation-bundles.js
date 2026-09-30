import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {getPresentationProject,getPrivatePresentationSource,hasSupabase,slugPattern} from '../../src/presentations/remote.js';
import {referencedMedia} from '../../src/admin/storage.js';
import {presentationRevision} from '../../src/presentations/bundled.js';
import {createBuildMediaCache} from './build-media-cache.js';

const hash=data=>createHash('sha256').update(data).digest('hex');
const urlPattern=/https?:\/\/[^\s"'<>\\)]+/g;

// Client HTML and media are fetched in the private build environment, never
// committed to the public Git repository. Only media is emitted to the CDN.
export async function buildPresentationBundles({root=process.cwd(),env=process.env,send=fetch}={}){
  const downloadMedia=createBuildMediaCache(root,send);
  const {bundledSlugs}=JSON.parse(await readFile(path.join(root,'config/presentation-hosting.json'),'utf8'));
  if(!Array.isArray(bundledSlugs)||bundledSlugs.some(s=>!slugPattern.test(s)))throw new Error('Invalid bundled presentation configuration');
  const bundlesRoot=path.join(root,'build/presentation-bundles');
  await mkdir(bundlesRoot,{recursive:true});
  const manifest={version:1,presentations:{}};
  if(bundledSlugs.length&&!hasSupabase(env)&&env.VERCEL_ENV==='production')throw new Error('Supabase build credentials are required for presentation bundles');
  if(hasSupabase(env))for(const slug of bundledSlugs){
    const project=await getPresentationProject(slug,{env,send});
    if(!project||project.status!=='published'||project.access_mode!=='unlisted')continue;
    if(project.source_type!=='standalone'||!project.updated_at)throw new Error('Bundled presentation needs a versioned standalone source');
    let html=await getPrivatePresentationSource(project,{env,send});
    const refs=[...new Map(referencedMedia(html,env.SUPABASE_URL).map(ref=>[ref.path,ref])).values()];
    const rewrites=new Map();let bytes=0,reusedBytes=0;
    const queue=[...refs],destination=path.join(root,'dist/presentation-media',slug);
    await mkdir(destination,{recursive:true});
    async function worker(){
      while(queue.length){
        const ref=queue.shift(),extension=path.extname(ref.path).toLowerCase();
        if(!/^\.[a-z0-9]{1,8}$/.test(extension))throw new Error('Unsupported presentation media extension');
        const url=env.SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/object/public/presentation-media/'+ref.path.split('/').map(encodeURIComponent).join('/');
        const {data,reused}=await downloadMedia(url),filename=hash(data)+extension;
        if(reused)reusedBytes+=data.length;
        await writeFile(path.join(destination,filename),data);
        rewrites.set(ref.path,`/presentation-media/${slug}/${filename}`);bytes+=data.length;
      }
    }
    await Promise.all([worker(),worker(),worker()]);
    html=html.replace(urlPattern,raw=>{
      const [ref]=referencedMedia(raw,env.SUPABASE_URL);
      return ref?rewrites.get(ref.path)??raw:raw;
    });
    if(referencedMedia(html,env.SUPABASE_URL).length)throw new Error('Presentation still references remote media');
    // Recheck the registry after downloads; never deploy a half-updated source.
    const current=await getPresentationProject(slug,{env,send});
    if(!current||presentationRevision(current)!==presentationRevision(project)||current.status!=='published'||current.access_mode!=='unlisted')throw new Error('Presentation changed while bundling; rebuild required');
    const file=hash(html)+'.html';
    await writeFile(path.join(bundlesRoot,file),html);
    manifest.presentations[slug]={revision:presentationRevision(project),file,mediaFiles:refs.length,mediaBytes:bytes};
    console.log(`Bundled ${slug}: ${refs.length} media files, ${(bytes/1000000).toFixed(1)} MB; ${(reusedBytes/1000000).toFixed(1)} MB reused, ${((bytes-reusedBytes)/1000000).toFixed(1)} MB downloaded`);
  }
  await writeFile(path.join(bundlesRoot,'manifest.json'),JSON.stringify(manifest));
  return manifest;
}
