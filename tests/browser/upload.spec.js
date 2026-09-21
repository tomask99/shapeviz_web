import {test,expect} from '@playwright/test';
test('finalization errors remain visible and retry reuses uploaded files',async({page})=>{
 let uploads=0,finalizes=0,saved=false;
 await page.route('**/api/admin?*',async route=>{
  const action=new URL(route.request().url()).searchParams.get('action');
  let data={};
  if(action==='me')data={email:'owner@example.com'};
  if(action==='list')data={projects:saved?[{deck_slug:'test',client:'Test',title:'Test',status:'published'}]:[]};
  if(action==='stats')return route.fulfill({status:502,json:{error:'Stats unavailable'}});
  if(action==='sign-upload'){uploads++;data={uploadId:'test-id',object:'uploads/owner/test-id/source.html',url:'/mock-upload'};}
  if(action==='finalize'){if(++finalizes===1)return route.fulfill({status:502,json:{error:'Could not save presentation. Retry.'}});saved=true;data={url:'/p/test'};}
  await route.fulfill({json:data});
 });
 await page.route('**/mock-upload',route=>route.fulfill({json:{}}));
 await page.goto('/adminlogin');await page.locator('#upload-top').click();
 await page.locator('#html-file').setInputFiles({name:'test.html',mimeType:'text/html',buffer:Buffer.from('<h1>Test</h1>')});
 await page.locator('#upload-form [name=client]').fill('Test');await page.locator('#upload-form [name=title]').fill('Test');
 await page.locator('#upload-form button[type=submit]').click();
 await expect(page.locator('#upload-form [role=alert]')).toHaveText('Could not save presentation. Retry.');
 await expect(page.locator('#upload-dialog')).toBeVisible();
 await page.locator('#upload-form button[type=submit]').click();
 await expect(page.locator('#upload-dialog')).not.toBeVisible();
 await expect(page.locator('#projects')).toContainText('/p/test');
 expect(uploads).toBe(1);expect(finalizes).toBe(2);
});
