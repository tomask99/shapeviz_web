import { test, expect } from '@playwright/test';
import { createApp } from '../../server.js';
import { createFolderLoader } from '../../src/files/mega.js';

// Explicit opt-in. Creates temporary link metadata, never uploads file bytes.
test('live Supabase + MEGA: scoped sharing, native download and parent revocation',async({page})=>{
  test.skip(!process.env.FILES_TEST_SLUG,'Set FILES_TEST_SLUG and server Supabase variables for an authorised portal.');
  test.setTimeout(120_000);
  const db=async(path,options={})=>{
    const response=await fetch(process.env.SUPABASE_URL+'/rest/v1/'+path,{...options,headers:{apikey:process.env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',Prefer:'return=representation'}});
    expect(response.ok).toBe(true);return response.status===204?[]:response.json();
  };
  const [portal]=await db('client_file_shares?slug=eq.'+encodeURIComponent(process.env.FILES_TEST_SLUG)+'&select=*');
  expect(portal?.active).toBe(true);
  const tree=await createFolderLoader()(portal.mega_url);
  const file=[...tree.nodes.values()].filter(node=>!node.directory&&node.size>0&&node.parent!==tree.rootId).sort((a,b)=>a.size-b.size)[0];
  expect(file).toBeTruthy();
  const before=await db('client_file_links?portal_id=eq.'+portal.id+'&select=id');
  const created=[];
  const remember=async(url)=>{
    const token=url.split('/').at(-1),[link]=await db('client_file_links?token=eq.'+token+'&select=id,token');
    if(!before.some(item=>item.id===link.id)&&!created.includes(link.id))created.push(link.id);
    return link;
  };
  const server=createApp({env:process.env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const api=(query,options={})=>fetch(origin+'/api/files?'+query,options);
  try {
    expect((await api('portal='+portal.slug)).status).toBe(404);
    const makeFolder=await api(`portal=${portal.slug}&node=${file.parent}&action=share`,{method:'POST',headers:{'X-Files-Access':portal.public_token}});
    expect(makeFolder.status).toBe(200);
    const parent=await remember((await makeFolder.json()).url);
    const folderPage=await(await api('share='+parent.token)).json();
    expect(folderPage.current.id).toBe(file.parent);expect(folderPage.current.parent).toBe(null);expect(folderPage.breadcrumbs).toHaveLength(1);
    expect((await api(`share=${parent.token}&node=${tree.rootId}`)).status).toBe(404);
    const makeFile=await api(`share=${parent.token}&node=${file.id}&action=share`,{method:'POST'});
    expect(makeFile.status).toBe(200);const childUrl=(await makeFile.json()).url,child=await remember(childUrl);
    expect((await api(`share=${child.token}&node=${file.parent}&action=download`)).status).toBe(404);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{window.showSaveFilePicker=async()=>{const directory=await navigator.storage.getDirectory();return directory.getFileHandle('scope-test-model',{create:true});};});
    await page.goto(origin+childUrl);
    await expect(page.locator('.file-detail h2')).toHaveText(file.name);
    await expect(page.locator('#breadcrumbs')).toHaveText(file.name);
    await expect(page.locator('a[href*="access="]')).toHaveCount(0);
    await page.screenshot({path:'.cache/files-scoped-live.png',fullPage:true});
    await page.locator('.detail-actions').getByRole('button',{name:'Download file'}).click();
    await expect(page.locator('#download-status')).toHaveText('Download complete. Your file is ready.',{timeout:60_000});
    expect(await page.evaluate(async()=>{const directory=await navigator.storage.getDirectory(),handle=await directory.getFileHandle('scope-test-model');return (await handle.getFile()).size;})).toBe(file.size);
    if(created.includes(parent.id)) {
      await db('client_file_links?id=eq.'+parent.id,{method:'PATCH',body:JSON.stringify({enabled:false})});
      expect((await api('share='+child.token+'&action=download')).status).toBe(404);
      await page.reload();await expect(page.getByRole('alert')).toContainText('unavailable');
    }
    expect(errors).toEqual([]);
    console.log(JSON.stringify({scopedLiveDownloadVerified:true,bytes:file.size,parentRevocationVerified:created.includes(parent.id)}));
  } finally {
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    for(const id of created.reverse())await db('client_file_links?id=eq.'+id,{method:'DELETE'});
  }
});
