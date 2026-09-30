import { test, expect } from '@playwright/test';
import { stat, open } from 'node:fs/promises';
import { createApp } from '../../server.js';
import { createFolderLoader } from '../../src/files/mega.js';

// Opt-in only. Never commit an actual folder key or persist a client share here.
test('real MEGA folder → Shapeviz file page → verified streamed download',async({page})=>{
  test.skip(!process.env.MEGA_TEST_FOLDER,'Set MEGA_TEST_FOLDER to an authorized test folder link.');
  test.setTimeout(180_000);
  const folder=await createFolderLoader()(process.env.MEGA_TEST_FOLDER);
  const files=[...folder.nodes.values()].filter(node=>!node.directory).sort((a,b)=>b.size-a.size);
  expect(files.length).toBeGreaterThan(0);
  const file=files[0];expect(file.size).toBeLessThanOrEqual(2*1024**3);
  const env={SUPABASE_URL:'https://file-test.local',SUPABASE_SECRET_KEY:'fixture-not-a-secret'};
  const send=(url,options)=>String(url).startsWith(env.SUPABASE_URL)?Promise.resolve(Response.json([{title:'Sofa collection.',description:'3D models for your next interior.',mega_url:process.env.MEGA_TEST_FOLDER}])):fetch(url,options);
  const server=createApp({env,send});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{window.showSaveFilePicker=undefined;});
    const address=`http://127.0.0.1:${server.address().port}/files/test?node=${file.id}#access=${'t'.repeat(32)}`;
    await page.goto(address);await expect(page.locator('.file-detail h2')).toHaveText(file.name);
    await page.screenshot({path:'.cache/files-live-detail.png',fullPage:true});
    const promise=page.waitForEvent('download');
    await page.locator('.detail-actions').getByRole('button',{name:'Download file'}).click();
    const download=await promise,path=await download.path();expect(await download.failure()).toBe(null);expect((await stat(path)).size).toBe(file.size);
    await expect(page.locator('#download-status')).toHaveText('Download complete. Your file is ready.');
    expect(page.url()).toBe(address);expect(errors).toEqual([]);
    const output=await open(path,'r');const prefix=Buffer.alloc(24);try{await output.read(prefix,0,24,0);}finally{await output.close();}
    console.log(JSON.stringify({verified:true,bytes:file.size,extension:file.name.split('.').at(-1),fbxBinaryHeader:prefix.toString().startsWith('Kaydara FBX Binary')}));
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('real MEGA file writes and commits through a native FileSystemWritableFileStream',async({page})=>{
  test.skip(!process.env.MEGA_TEST_FOLDER,'Set MEGA_TEST_FOLDER to an authorized test folder link.');
  test.setTimeout(90_000);
  const folder=await createFolderLoader()(process.env.MEGA_TEST_FOLDER);
  const file=[...folder.nodes.values()].filter(node=>!node.directory&&node.size>0).sort((a,b)=>a.size-b.size)[0];
  expect(file).toBeTruthy();
  const env={SUPABASE_URL:'https://file-test.local',SUPABASE_SECRET_KEY:'fixture-not-a-secret'};
  const send=(url,options)=>String(url).startsWith(env.SUPABASE_URL)?Promise.resolve(Response.json([{title:'Native writer test',description:'',mega_url:process.env.MEGA_TEST_FOLDER}])):fetch(url,options);
  const server=createApp({env,send});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    // Real browser disk writer in the disposable test origin. Replace only the
    // OS picker, which cannot be operated in a headless automated test.
    await page.addInitScript(()=>{window.showSaveFilePicker=async()=>{const directory=await navigator.storage.getDirectory();return directory.getFileHandle('live-model',{create:true});};});
    await page.goto(`http://127.0.0.1:${server.address().port}/files/test?node=${file.id}#access=${'t'.repeat(32)}`);
    await page.locator('.detail-actions').getByRole('button',{name:'Download file'}).click();
    await expect(page.locator('#download-status')).toHaveText('Download complete. Your file is ready.',{timeout:60_000});
    expect(await page.evaluate(async()=>{const directory=await navigator.storage.getDirectory(),handle=await directory.getFileHandle('live-model');return (await handle.getFile()).size;})).toBe(file.size);
    console.log(JSON.stringify({nativeWriterVerified:true,bytes:file.size}));
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
