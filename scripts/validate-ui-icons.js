import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {iconPolicyViolations} from '../src/ui/icon-policy.js';

// Tests deliberately include bad examples; docs and user data are not rendered
// application source. Scan all authored runtime and generator code, including SVG.
const roots=['public','src','api','scripts','presentation-templates','presentations'];
const sourceExtension=/\.(?:[cm]?js|html|css|json|svg)$/i;
export async function validateUiIcons(root=process.cwd()){
  const failures=[];let checked=0;
  async function inspect(filename){
    checked++;
    for(const result of iconPolicyViolations(await readFile(filename,'utf8')))failures.push(`${path.relative(root,filename)}:${result.line} ${result.points.join(', ')}`);
  }
  async function visit(directory){
    let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const entry of entries){
      const filename=path.join(directory,entry.name);
      if(entry.isDirectory())await visit(filename);
      else if(entry.isFile()&&sourceExtension.test(entry.name))await inspect(filename);
    }
  }
  for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isFile()&&/\.(?:[cm]?js|html|css|svg)$/i.test(entry.name))await inspect(path.join(root,entry.name));
  for(const directory of roots)await visit(path.join(root,directory));
  if(failures.length)throw new Error('Use SVG icons instead of emoji/Unicode UI glyphs. See AGENTS.md.\n'+failures.join('\n'));
  return checked;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{console.log(`SVG icon policy passed (${await validateUiIcons()} source files).`);}catch(error){console.error(error.message);process.exitCode=1;}
}
