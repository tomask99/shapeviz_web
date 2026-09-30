import {test,expect} from '@playwright/test';
import {companyId,shareToken,mockTrackingAdmin} from './fixtures/file-tracking.js';

test('owner adds a folder below Cloud storage, sees lifetime rankings, retries, pauses and reloads on mobile',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});
  const fixture=await mockTrackingAdmin(page);
  await page.goto('/admin/clients/'+companyId+'?tab=files');
  await expect(page.getByRole('heading',{name:'Downloads',exact:true})).toBeVisible();
  const input=page.getByRole('textbox',{name:'Folder link',exact:true});
  await input.fill('https://www.shapeviz.com/files/share/wrong');await page.getByRole('button',{name:'Track folder',exact:true}).click();
  await expect(page.locator('.file-tracking-form [role=alert]')).toContainText('different client');
  await input.fill('https://www.shapeviz.com/files/share/'+shareToken);await page.getByRole('button',{name:'Track folder',exact:true}).click();
  await expect(page.locator('.file-download-list li')).toHaveCount(2);
  await expect(page.locator('.file-download-list li').first()).toHaveText('Great Sofa.fbx12');
  await expect(page.locator('.file-download-list li').nth(1)).toHaveText('Great Sofa.3ds5');
  await expect(page.locator('.file-download-stats .research-card,.file-download-stats table,.file-download-stats time,[data-total-downloads]')).toHaveCount(0);
  const portal=await page.locator('.file-collection').boundingBox(),stats=await page.locator('.file-download-stats').boundingBox();expect(stats.y).toBeGreaterThan(portal.y+portal.height);
  await page.getByRole('button',{name:'Pause tracking',exact:true}).click();await expect(page.locator('.tracked-folder-caption')).toContainText('Paused');
  await page.reload();await expect(page.locator('.file-download-list .download-count')).toHaveText(['12','5']);
  await page.getByRole('button',{name:'Resume tracking',exact:true}).click();await expect(page.locator('.tracked-folder-caption')).not.toContainText('Paused');
  await input.fill('https://www.shapeviz.com/files/share/'+shareToken);await page.getByRole('button',{name:'Track folder',exact:true}).click();
  await expect(page.locator('.tracked-folder')).toHaveCount(1);await expect(page.locator('.file-download-list .download-count')).toHaveText(['12','5']);
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'.cache/download-stats-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.cache/download-stats-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Track folder',exact:true})).toBeVisible();
  expect(fixture.calls.some(c=>c.action==='client-file-tracking-add')).toBe(true);
  expect(fixture.calls.filter(c=>c.action==='client-file-download-stats')).toHaveLength(0);expect(errors).toEqual([]);
});

test('rankings use the embedded first page, fetch later pages and retain pagination on refresh',async({page})=>{
  const fixture=await mockTrackingAdmin(page,{many:true,trackedInitially:true});
  await page.goto('/admin/clients/'+companyId+'?tab=files');
  await expect(page.locator('.file-download-list li')).toHaveCount(50);
  const reads=()=>fixture.calls.filter(c=>c.action==='client-file-download-stats');
  expect(reads()).toHaveLength(0);
  await page.getByRole('button',{name:'Next files',exact:true}).click();
  await expect(page.locator('.file-download-list li')).toHaveCount(1);expect(reads()).toHaveLength(1);expect(reads()[0].page).toBe('2');
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.locator('.file-stats-pagination')).toContainText('Page 2');expect(reads()).toHaveLength(2);
  await page.getByRole('button',{name:'Previous files',exact:true}).click();
  await expect(page.locator('.file-download-list li')).toHaveCount(50);
});

for(const outcome of ['success','integrity-error','cancel'])test('download receipt is sent only after a completed transfer: '+outcome,async({page})=>{
  const receipts=[],downloadResponses=[];const size=1024*1024;
  const receipt=Buffer.from(JSON.stringify({exp:Date.now()+3600000})).toString('base64url')+'.mock';
  await page.addInitScript(()=>{window.showSaveFilePicker=async()=>({createWritable:async()=>({async write(){},async close(){window.writerClosed=true;},async abort(){}})});});
  await page.route('**/files/vendor/megajs.mjs',route=>route.fulfill({contentType:'text/javascript',body:`export class API{request(){}close(){}}export class File{download(){let cancelled=false;return{destroy(){cancelled=true;},async *[Symbol.asyncIterator](){for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,40));if(cancelled)throw new DOMException('Cancelled','AbortError');yield new Uint8Array(131072);}${outcome==='integrity-error'?"throw new Error('Integrity check failed');":''}}}}}`}));
  await page.route('**/api/files?*',async route=>{
    const action=new URL(route.request().url()).searchParams.get('action');
    const file={id:'model001',parent:null,directory:false,name:'Great Sofa.fbx',size};
    if(action==='download'){downloadResponses.push(true);return route.fulfill({json:{file,download:{downloadId:['abcdefgh','model001'],key:'mock'},receipt}});}
    if(action==='download-complete'){
      if(!receipts.length)expect(await page.evaluate(()=>window.writerClosed)).toBe(true);receipts.push(route.request().postDataJSON());
      // First response is lost/unavailable. A reload must retry the SAME receipt.
      return route.fulfill({status:receipts.length===1?503:200,json:{recorded:receipts.length===2}});
    }
    return route.fulfill({json:{collection:{title:'Milenium'},current:file,items:[],breadcrumbs:[file],restricted:true,total:0,page:1,hasMore:false}});
  });
  await page.goto('/files/share/'+shareToken);expect(receipts).toHaveLength(0);
  await page.locator('.detail-actions').getByRole('button',{name:'Download file'}).click();
  if(outcome==='cancel'){await expect.poll(()=>downloadResponses.length).toBe(1);await page.getByRole('button',{name:'Cancel download',exact:true}).click();}
  await expect(page.locator('#download-status')).toContainText(outcome==='success'?'Download complete':outcome==='cancel'?'Download cancelled':'Download failed');
  if(outcome==='success'){
    await expect.poll(()=>receipts.length).toBe(1);expect(receipts[0]).toEqual({receipt});
    await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('shapeviz.completedDownload.')).length)).toBe(1);
    await page.reload();await expect.poll(()=>receipts.length).toBe(2);expect(receipts[1]).toEqual(receipts[0]);
    await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('shapeviz.completedDownload.')).length)).toBe(0);
  }else expect(receipts).toHaveLength(0);
});
