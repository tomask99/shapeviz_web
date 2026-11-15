import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
await mkdir('.cache/articles',{recursive:true});
const result=await build({entryPoints:['src/articles/editor-deps.js'],outfile:'.cache/articles/editor.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'inline',metafile:true});
const packages=new Set(Object.keys(result.metafile.inputs).filter(p=>p.startsWith('node_modules/')).map(p=>p.split('/').slice(0,p.startsWith('node_modules/@')?3:2).join('/')));
const licenses=[];
for(const pkg of packages){
  let license;
  for(const file of ['LICENSE','LICENSE.md','LICENSE-MIT','COPYING'])try{license=await readFile(pkg+'/'+file,'utf8');break;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!license)throw new Error('Missing editor dependency license: '+pkg);
  licenses.push(pkg+'\n\n'+license);
}
await writeFile('.cache/articles/LICENSE.txt',licenses.join('\n\n----------------------------------------\n\n'));
