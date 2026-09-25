import {test,expect} from '@playwright/test';

async function studio(page){
 await page.route('**/api/admin?*',route=>{const action=new URL(route.request().url()).searchParams.get('action');return route.fulfill({json:action==='me'?{email:'owner@example.test'}:action==='list'?{projects:[]}:{summary:{},daily:[],decks:[],items:[]}});});
 await page.goto('/admin');
}
async function backdrop(page,dialog){const box=await dialog.boundingBox();await page.mouse.click(Math.max(1,box.x-8),Math.max(1,box.y+10));}
test('existing Studio dialogs close outside and with Escape without duplicate close buttons',async({page})=>{
 await studio(page);await page.locator('#upload-top').click();const dialog=page.locator('#new-dialog');
 await expect(dialog.getByRole('button',{name:'Close',exact:true})).toHaveCount(1);
 const box=await dialog.boundingBox();await page.mouse.click(box.x+5,box.y+5);await expect(dialog).toBeVisible();
 await backdrop(page,dialog);await expect(dialog).toBeHidden();
 await page.locator('#upload-top').click();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});
test('dynamic dialogs get a sticky cross, retain cancel guards, and ignore drags from inside',async({page})=>{
 await studio(page);
 await page.evaluate(()=>{const d=document.createElement('dialog');d.id='dynamic-fixture';d.innerHTML='<h2>Long review</h2><div style="height:1200px">Review content</div>';d.addEventListener('cancel',event=>{if(d.dataset.saving==='true')event.preventDefault();});d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();});
 const dialog=page.locator('#dynamic-fixture'),close=dialog.getByRole('button',{name:'Close dialog',exact:true});
 await expect(close).toBeVisible();await dialog.evaluate(d=>d.scrollTop=500);await expect(close).toBeInViewport();
 const box=await dialog.boundingBox();await page.mouse.move(box.x+100,box.y+100);await page.mouse.down();await page.mouse.move(box.x-8,box.y+100);await page.mouse.up();await expect(dialog).toBeVisible();
 await dialog.evaluate(d=>d.dataset.saving='true');await close.click();await backdrop(page,dialog);await expect(dialog).toBeVisible();
 await dialog.evaluate(d=>delete d.dataset.saving);await close.click();await expect(dialog).toHaveCount(0);
});
test('nested dialog dismissal leaves the parent open and supports requestClose fallback',async({page})=>{
 await studio(page);await page.locator('#upload-top').click();
 await page.evaluate(()=>{const d=document.createElement('dialog');d.id='nested-fixture';d.innerHTML='<h2>Nested</h2>';d.requestClose=undefined;document.body.append(d);d.showModal();});
 const child=page.locator('#nested-fixture');await backdrop(page,child);await expect(child).toBeHidden();await expect(page.locator('#new-dialog')).toBeVisible();
});
test('public image dialog retains one close cross and closes on the backdrop',async({page})=>{
 await page.goto('/');await page.locator('[data-lightbox]').first().click();const dialog=page.locator('dialog.lightbox');await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Close enlarged image'})).toHaveCount(1);await expect(dialog.locator('[data-dialog-dismiss]')).toHaveCount(0);
 await backdrop(page,dialog);await expect(dialog).toBeHidden();await expect(page.locator('body')).not.toHaveClass(/modal-open/);
});
