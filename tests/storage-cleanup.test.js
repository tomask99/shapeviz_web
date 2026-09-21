import test from 'node:test';
import assert from 'node:assert/strict';
import {removeProjectFiles, referencedMedia} from '../src/admin/storage.js';

const project={deck_slug:'sample',source_bucket:'presentation-source',source_path:'sample/rev/index.html',content:{_storageScopes:[{bucket:'presentation-source',path:'uploads/owner/id/source.html'},{bucket:'presentation-media',prefix:'uploads/owner/id/'}]}};
test('deletion removes uploaded source, saved HTML and nested media through Storage API',async()=>{
 const deleted=[];
 const call=async(url,options={})=>{
  if(url.startsWith('/rest/'))return [];
  if(options.method==='DELETE'){deleted.push([url,options.body.prefixes]);return [];}
  if(options.body.prefix==='uploads/owner/id/')return [{id:'1',name:'video.mp4'},{id:null,name:'nested'}];
  return [{id:'2',name:'image.png'}];
 };
 assert.deepEqual(await removeProjectFiles(project,call),{deletedFiles:4,sharedFiles:0});
 assert.deepEqual(deleted,[['/storage/v1/object/presentation-media',['uploads/owner/id/video.mp4','uploads/owner/id/nested/image.png']],['/storage/v1/object/presentation-source',['uploads/owner/id/source.html','sample/rev/index.html']]]);
});
test('shared media survives until its last reference is removed',async()=>{
 const deleted=[];
 const call=async(url,options={})=>{
  if(url.startsWith('/rest/'))return [{deck_slug:'variant',content:{_storageScopes:[{bucket:'presentation-media',prefix:'uploads/owner/id/'}]}}];
  if(options.method==='DELETE'){deleted.push(options.body.prefixes);return [];}
  return [{id:'1',name:'video.mp4'}];
 };
 assert.deepEqual(await removeProjectFiles(project,call),{deletedFiles:2,sharedFiles:1});
 assert.ok(deleted.flat().every(path=>!path.endsWith('.mp4')));
});
test('Storage failure aborts cleanup and can be retried from persisted metadata',async()=>{
 let attempts=0;
 const call=async(url,options={})=>{
  if(url.startsWith('/rest/'))return [];
  if(options.method==='DELETE'){if(attempts++===0)throw new Error('Storage unavailable');return [];}
  return [];
 };
 await assert.rejects(removeProjectFiles(project,call),/Storage unavailable/);
 assert.equal((await removeProjectFiles(project,call)).deletedFiles,2);
});
test('cleanup rejects unsafe buckets and prefixes',async()=>{
 for(const scope of [{bucket:'avatars',path:'user.png'},{bucket:'presentation-media',prefix:''},{bucket:'presentation-media',prefix:'uploads/'},{bucket:'presentation-media',prefix:'a/../'}]){
  await assert.rejects(removeProjectFiles({deck_slug:'x',content:{_storageScopes:[scope]}},()=>{throw new Error('Unexpected request');}),/storage|Storage/);
 }
});
test('external assets never become local Storage deletion targets',()=>{
 assert.deepEqual(referencedMedia('<img src="https://other.supabase.co/storage/v1/object/public/presentation-media/a.png"><img src="https://ours.supabase.co/storage/v1/object/public/presentation-media/a%20b.png">','https://ours.supabase.co'),[{bucket:'presentation-media',path:'a b.png'}]);
});
