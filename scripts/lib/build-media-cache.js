import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const hash=data=>createHash('sha256').update(data).digest('hex');

// node_modules is restored by Vercel's build cache. This directory is private
// build input, never a public output or a committed copy of client media.
export function createBuildMediaCache(root,send=fetch){
  const directory=path.join(root,'node_modules/.cache/shapeviz-media-v1');
  return async url=>{
    const key=hash(url),bodyPath=path.join(directory,key+'.bin'),metaPath=path.join(directory,key+'.json');
    let cached,etag;
    try{
      const metadata=JSON.parse(await readFile(metaPath,'utf8'));
      const data=await readFile(bodyPath);
      if(data.length&&hash(data)===metadata.digest&&typeof metadata.etag==='string'&&metadata.etag){
        cached=data;etag=metadata.etag;
      }
    }catch{/* A missing or damaged cache is a normal cold build. */}
    const response=await send(url,{headers:etag?{'If-None-Match':etag}:{},signal:AbortSignal.timeout(90000)});
    if(response.status===304&&cached)return {data:cached,reused:true};
    // Never deploy stale cached data when Storage fails or the file was removed.
    if(!response.ok)throw new Error(`Presentation media download failed (${response.status})`);
    const data=Buffer.from(await response.arrayBuffer());
    if(!data.length)throw new Error('Empty presentation media');
    const currentEtag=response.headers.get('etag');
    if(currentEtag){
      await mkdir(directory,{recursive:true});
      await writeFile(bodyPath,data);
      await writeFile(metaPath,JSON.stringify({etag:currentEtag,digest:hash(data)}));
    }
    return {data,reused:false};
  };
}
