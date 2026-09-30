import { test, expect } from '@playwright/test';
import { stat, open } from 'node:fs/promises';

const share='a'.repeat(32),companyId='22222222-2222-4222-8222-222222222222';
const shared='b'.repeat(32);
const portalUrl=(node='')=>'/files/sofas'+(node?'?node='+node:'')+'#access='+share;
const root={id:'rootroot',parent:null,name:'Models',directory:true,size:0};
const folder={id:'folder01',parent:root.id,name:'Sofas',directory:true,size:0};
const file={id:'model001',parent:folder.id,name:'Sofa <oak>.fbx',directory:false,size:16*1024*1024};
async function library(page,{size=file.size,fail=false,slow=false}={}) {
  const model={...file,size};
  await page.route('**/api/files?*',route=>{
    const p=new URL(route.request().url()).searchParams,restricted=!!p.get('share'),node=p.get('node')||(restricted?file.id:root.id);
    if(!restricted)expect(route.request().headers()['x-files-access']).toBe(share);
    if(p.get('action')==='share') { expect(route.request().method()).toBe('POST');return route.fulfill({json:{url:'/files/share/'+shared}}); }
    if(node==='missing1')return route.fulfill({status:404,json:{error:'This file is no longer available.'}});
    if(p.get('action')==='download')return route.fulfill({json:{file:model,download:{downloadId:['abcdefgh',file.id],key:'mock'}}});
    const current=node===root.id?root:node===folder.id?folder:model;
    const items=current===root?[folder]:current===folder?[model]:[];
    return route.fulfill({json:{collection:{title:'Sofa collection.',description:'3D models for your next interior.'},restricted,current,breadcrumbs:restricted?[model]:current===root?[root]:current===folder?[root,folder]:[root,folder,model],items:items.filter(item=>!p.get('q')||item.name.toLowerCase().includes(p.get('q').toLowerCase())),total:items.length,page:1,hasMore:false}});
  });
  // Exercise the actual download writer with bounded, generated file chunks.
  // Real MEGA decryption is covered separately by the supplied live fixture.
  await page.route('**/files/vendor/megajs.mjs',route=>route.fulfill({contentType:'text/javascript',body:`
    export class API { request() {} close() { this.closed=true; } }
    export class File {
      download() {
        let cancelled=false;
        return {
          destroy(){cancelled=true;},
          async *[Symbol.asyncIterator](){
            const chunk=new Uint8Array(1024*1024).fill(42);
            for(let bytes=0;bytes<${size};bytes+=chunk.length){
              if(cancelled)throw new DOMException('Cancelled','AbortError');
              ${slow?'await new Promise(resolve=>setTimeout(resolve,100));':''}
              yield chunk.subarray(0,Math.min(chunk.length,${size}-bytes));
            }
            ${fail?"throw new Error('Integrity check failed');":''}
          }
        };
      }
    }` }));
}

test('folder navigation, exact file links, reload, copying and mobile layout',async({page,context})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await library(page);await page.goto(portalUrl());
  await page.getByRole('link',{name:'Open Sofas',exact:true}).click();
  await page.getByRole('link',{name:/Sofa <oak>.fbx FBX/}).click();
  await expect(page).toHaveURL(new RegExp('node='+file.id));
  await expect(page.locator('.file-detail h2')).toHaveText(file.name);
  await page.locator('.detail-actions').getByRole('button',{name:'Copy file link'}).click();
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('http://127.0.0.1:4173/files/share/'+shared);
  const copied=await page.evaluate(()=>navigator.clipboard.readText());
  expect(copied).not.toContain('mega.nz');
  await page.reload();await expect(page.locator('.file-detail h2')).toHaveText(file.name);
  await page.setViewportSize({width:375,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'.cache/files-mobile.png',fullPage:true});
  await page.goBack();await expect(page.getByRole('button',{name:'Download '+file.name,exact:true})).toBeVisible();
  await page.getByRole('link',{name:'All files',exact:true}).click();await expect(page.getByRole('link',{name:'Open Sofas',exact:true})).toBeVisible();
  await page.goto(portalUrl('missing1'));await expect(page.getByRole('alert')).toHaveText('This file is no longer available.');expect(errors).toEqual([]);
  await page.goto(copied);await expect(page.locator('.file-detail h2')).toHaveText(file.name);
  await expect(page.locator('#breadcrumbs')).toHaveText(file.name);
  await expect(page.getByRole('link',{name:'All files',exact:true})).toHaveCount(0);
  await expect(page.locator('a[href*="access="]')).toHaveCount(0);
});

test('streamed attachment downloads exact bytes without an external download page',async({page})=>{
  test.setTimeout(180_000);
  const size=process.env.FILE_TEST_GB?Number(process.env.FILE_TEST_GB)*1024**3:file.size;
  await page.addInitScript(()=>{window.showSaveFilePicker=undefined;});
  await library(page,{size});await page.goto(portalUrl(file.id));
  const promise=page.waitForEvent('download');
  await page.locator('.detail-actions').getByRole('button',{name:'Download file'}).click();
  const download=await promise;
  expect(download.suggestedFilename()).toContain('Sofa');
  const path=await download.path();expect(await download.failure()).toBe(null);
  expect((await stat(path)).size).toBe(size);
  const output=await open(path,'r');try{for(const position of [0,size-1]){const b=Buffer.alloc(1);await output.read(b,0,1,position);expect(b[0]).toBe(42);}}finally{await output.close();}
  await expect(page.locator('#download-status')).toHaveText('Download complete. Your file is ready.');
  await expect(page).toHaveURL(new RegExp('/files/sofas'));
});

test('native file writer commits only after successful integrity verification',async({page})=>{
  await page.addInitScript(()=>{window.saved={bytes:0,closed:false,aborted:false};window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async bytes=>{window.saved.bytes+=bytes.byteLength;},close:async()=>{window.saved.closed=true;},abort:async()=>{window.saved.aborted=true;}})});});
  await library(page,{fail:true});await page.goto(portalUrl(file.id));
  await page.locator('.detail-actions').getByRole('button',{name:'Download file'}).click();
  await expect(page.locator('#download-status')).toContainText('Integrity check failed');
  expect(await page.evaluate(()=>window.saved)).toEqual({bytes:file.size,closed:false,aborted:true});
});

test('streamed integrity failure is not reported as a successful browser download',async({page})=>{
  await page.addInitScript(()=>{window.showSaveFilePicker=undefined;});
  await library(page,{fail:true});await page.goto(portalUrl(file.id));
  const promise=page.waitForEvent('download');
  await page.locator('.detail-actions').getByRole('button',{name:'Download file'}).click();
  const download=await promise;expect(await download.failure()).not.toBe(null);
  await expect(page.locator('#download-status')).toContainText('Integrity check failed');
  await expect(page.locator('.detail-actions').getByRole('button',{name:'Download file'})).toBeEnabled();
});

test('cancel stops the file writer and leaves a retry available',async({page})=>{
  await page.addInitScript(()=>{window.saved={aborted:false};window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async()=>{},close:async()=>{},abort:async()=>{window.saved.aborted=true;}})});});
  await library(page,{slow:true});await page.goto(portalUrl(file.id));
  await page.locator('.detail-actions').getByRole('button',{name:'Download file'}).click();
  await expect(page.locator('#download-status')).toContainText('downloading');
  await page.getByRole('button',{name:'Cancel download'}).click();
  await expect(page.locator('#download-status')).toContainText('Download cancelled');
  expect(await page.evaluate(()=>window.saved.aborted)).toBe(true);
  await expect(page.locator('.detail-actions').getByRole('button',{name:'Download file'})).toBeEnabled();
});

test('admin connects a collection, preserves a failed draft, copies branded URLs and pauses sharing',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  let items=[],fail=true;const calls=[];
  const link={id:companyId,name:'Milano.fbx',type:'file',token:shared,enabled:true,source_version:1,version:1,created_at:'2026-09-30T12:00:00Z'};
  await page.route('**/api/admin?*',route=>{
    const action=new URL(route.request().url()).searchParams.get('action'),body=route.request().postDataJSON();calls.push({action,body});
    let data={items:[]};
    if(action==='me')data={email:'owner@example.test'};
    if(action==='crm-client')data={item:{company_id:companyId,active:true,client_since:'2026-09-30'},company:{id:companyId,company_name:'Sofa Studio',industry:'Furniture',website:'',short_description:''}};
    if(action==='client-files')data={items};
    if(action==='client-file-links')data={items:[link],page:1,hasMore:false};
    if(action==='client-file-link-disable'){link.enabled=false;link.version++;data={item:link};}
    if(action==='client-files-save'){
      if(fail){fail=false;return route.fulfill({status:502,json:{error:'MEGA unavailable. Please retry.'}});}
      items=[{id:companyId,...body,public_token:share,active:true,version:1,source_version:1}];data={item:items[0]};
    }
    if(action==='client-files-status'){items[0].active=body.active;items[0].version++;data={item:items[0]};}
    return route.fulfill({json:data});
  });
  await page.goto('/admin/clients/'+companyId+'?tab=files');
  await page.getByRole('button',{name:'Connect MEGA folder'}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Client name').fill('Architecture files');
  await dialog.getByLabel('Files URL slug').fill('sofas');
  await dialog.getByLabel('MEGA folder link').fill('https://mega.nz/folder/abcdefgh#'+'A'.repeat(22));
  await dialog.getByRole('button',{name:'Connect & create link'}).click();await expect(dialog.getByRole('alert')).toContainText('MEGA unavailable');
  await expect(dialog.getByLabel('Client name')).toHaveValue('Architecture files');
  await dialog.getByRole('button',{name:'Connect & create link'}).click();await expect(dialog).toBeHidden();
  const requests=calls.filter(c=>c.action==='client-files-save');expect(requests[0].body.requestId).toBe(requests[1].body.requestId);
  await page.getByRole('button',{name:'Copy portal URL'}).click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('http://127.0.0.1:4173'+portalUrl());
  await page.getByRole('button',{name:'Disable portal',exact:true}).click();await expect(page.locator('.file-collection')).toContainText('Portal disabled');
  await page.getByRole('button',{name:'Enable portal',exact:true}).click();await expect(page.locator('.file-collection')).toContainText('Portal enabled');
  await page.getByRole('button',{name:'Disable link',exact:true}).click();await expect(page.locator('[data-share]')).toContainText('Disabled');
  await page.getByRole('button',{name:'Portal settings',exact:true}).click();
  await expect(dialog.getByLabel('Replace MEGA folder link')).toBeVisible();
  await expect(dialog.getByLabel('Files URL slug')).toHaveValue('sofas');
});
