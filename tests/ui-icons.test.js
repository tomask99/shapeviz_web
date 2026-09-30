import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {iconPolicyViolations} from '../src/ui/icon-policy.js';
import {validateUiIcons} from '../scripts/validate-ui-icons.js';
import {svgIcon} from '../public/ui/icons.js';

test('icon policy catches literals, entities, JS and CSS escapes before they reach mobile browsers',()=>{
  for(const source of [
    '\u2197','\u25b6','\u2161','\u00d7','\u{1f600}','\u{1f1f8}\u{1f1f0}','1\ufe0f\u20e3',
    '&#8599;','&#x2197;','&nearr;','&times;',
    String.raw`'\u2197'`,String.raw`'\u{1F600}'`,String.raw`'\uD83D\uDE00'`,String.raw`'\xD7'`,
    String.raw`.icon::after{content:"\2197 "}`,String.raw`.icon::after{content:"\01F600"}`
  ])assert.ok(iconPolicyViolations(source).length,JSON.stringify(source));
  assert.deepEqual(iconPolicyViolations('Normal text\nOpen &#8599;'),[{line:2,points:['U+2197']}]);
});

test('ordinary typography, brand marks, numeric values and SVG remain valid',()=>{
  const source='Shapeviz \u00ae \u00a9 2026 \u2122 &reg; &copy; 1 + 2 = 3; 100%; #123456; folder/file.zip';
  assert.deepEqual(iconPolicyViolations(source+'\n'+svgIcon('arrowUpRight')),[]);
  assert.ok(iconPolicyViolations('\u00ae\ufe0f').length);
});

test('shared SVG has accessible decoration and rejects unsafe icon parameters',()=>{
  assert.match(svgIcon('arrowDown'),/stroke="currentColor"/);
  assert.match(svgIcon('close'),/aria-hidden="true" focusable="false"/);
  assert.throws(()=>svgIcon('unknown'));
  assert.throws(()=>svgIcon('close','bad" onload="alert(1)'));
});

test('all application sources satisfy the icon policy used by the build',async()=>{
  assert.ok(await validateUiIcons(fileURLToPath(new URL('../',import.meta.url)))>100);
});

test('build validator rejects new glyph icons in root server and nested UI sources with file and line',async()=>{
  const prefix=path.join(tmpdir(),'shapeviz-icon-policy-'),fixture=await mkdtemp(prefix);
  try{
    await mkdir(path.join(fixture,'public','new-feature'),{recursive:true});
    await writeFile(path.join(fixture,'public','new-feature','index.html'),'<button>Open &#8599;</button>');
    await writeFile(path.join(fixture,'server.js'),'// test\nconst icon="'+String.fromCodePoint(0x25b6)+'";');
    await assert.rejects(validateUiIcons(fixture),error=>error.message.includes('server.js:2 U+25B6')&&error.message.includes('index.html:1 U+2197'));
    await writeFile(path.join(fixture,'public','new-feature','index.html'),'<button>Open '+svgIcon('arrowUpRight')+'</button>');
    await writeFile(path.join(fixture,'server.js'),'// valid server');
    assert.equal(await validateUiIcons(fixture),2);
  }finally{
    if(!path.resolve(fixture).startsWith(path.resolve(prefix)))throw new Error('Unexpected fixture directory');
    await rm(fixture,{recursive:true,force:true});
  }
});
