import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const defaultBundlesRoot=path.resolve(import.meta.dirname,'../../build/presentation-bundles');

// An admin edit invalidates a snapshot immediately. Normal remote delivery
// remains available until the next deployment creates an updated bundle.
export function presentationRevision(project){
  return createHash('sha256').update(JSON.stringify([
    project.deck_slug,project.source_type,project.source_bucket,
    project.source_path,project.updated_at
  ])).digest('hex');
}

export async function getBundledPresentationSource(project,{bundlesRoot=defaultBundlesRoot}={}){
  if(project.source_type!=='standalone'||!project.updated_at)return null;
  try{
    const manifest=JSON.parse(await readFile(path.join(bundlesRoot,'manifest.json'),'utf8'));
    const entry=manifest.version===1?manifest.presentations?.[project.deck_slug]:null;
    if(!entry||entry.revision!==presentationRevision(project)||! /^[a-f0-9]{64}\.html$/.test(entry.file))return null;
    const html=await readFile(path.join(bundlesRoot,entry.file),'utf8');
    if(createHash('sha256').update(html).digest('hex')!==entry.file.slice(0,-5))return null;
    return html;
  }catch(error){
    if(error.code!=='ENOENT')console.error('Presentation bundle unavailable; using remote source.');
    return null;
  }
}
