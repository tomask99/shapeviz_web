import {test,expect} from '@playwright/test';
const company='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',fresh='44444444-4444-4444-8444-444444444444';
const mega='https://mega.nz/folder/abcdefgh#'+'A'.repeat(22);
async function fixture(page,{empty=false,failList=false,failCompanies=false,hasMore=false}={}){
 const companies=[{id:company,company_name:'milenium'},{id:other,company_name:'THE NEW FACE'},{id:fresh,company_name:'Oak studio'}];
 const portals=empty?[]:[{id:'55555555-5555-4555-8555-555555555555',company_id:company,company_name:'milenium',title:'Milenium files',slug:'milenium',description:'',public_token:'a'.repeat(32),active:true,version:1},{id:'66666666-6666-4666-8666-666666666666',company_id:other,company_name:'THE NEW FACE',title:'The New Face',slug:'the-new-face',description:'',public_token:'b'.repeat(32),active:false,version:1}];
 const calls=[];let lostCreate=false,failedList=failList,failedCompanies=failCompanies;
 await page.route('**/api/admin?*',async route=>{
  const query=new URL(route.request().url()).searchParams,action=query.get('action'),body=route.request().postDataJSON();calls.push({action,body,page:query.get('page')});let data={items:[],hasMore:false};
  if(action==='me')data={email:'owner@example.test'};
  if(action==='list')data={projects:[]};if(action==='stats')data={summary:{},daily:[],decks:[]};
  if(action==='crm-time-open')data={item:null};
  if(action==='cloud-storage'){
   if(failedList){failedList=false;return route.fulfill({status:503,json:{error:'Storage temporarily unavailable.'}});}
   data={items:hasMore&&query.get('page')==='2'?portals.slice(1):portals,hasMore:hasMore&&query.get('page')!=='2'};
  }
  if(action==='cloud-storage-companies'){
   if(failedCompanies){failedCompanies=false;return route.fulfill({status:503,json:{error:'Could not load companies.'}});}
   data={items:companies.map(c=>({...c,has_storage:portals.some(p=>p.company_id===c.id)})),hasMore:false};
  }
  if(action==='client-files-save'){
   if(body.id){const item=portals.find(p=>p.id===body.id);expect(body.companyId).toBe(item.company_id);expect(body.version).toBe(item.version);Object.assign(item,{title:body.title,slug:body.slug,description:body.description,version:item.version+1});data={item};}
   else{
    let item=portals.find(p=>p.requestId===body.requestId);
    if(!item){item={...body,id:'77777777-7777-4777-8777-777777777777',company_id:body.companyId,company_name:companies.find(c=>c.id===body.companyId).company_name,active:true,version:1,public_token:'c'.repeat(32)};portals.push(item);}
    data={item};if(!lostCreate){lostCreate=true;return route.fulfill({status:502,json:{error:'Connection interrupted.'}});}
   }
  }
  await route.fulfill({json:data});
 });
 await page.route('**/api/files?*',route=>{const slug=new URL(route.request().url()).searchParams.get('portal'),portal=portals.find(p=>p.slug===slug);return route.fulfill({json:{collection:{title:portal?.company_name||'Client',description:''},restricted:false,current:{id:'rootroot',name:'Files',directory:true},breadcrumbs:[],items:[],total:0,page:1,hasMore:false}});});
 return {portals,calls};
}

for(const width of [1440,390])test(`Cloud storage cards, links and creation at ${width}px`,async({page,context})=>{
 await page.setViewportSize({width,height:960});await context.grantPermissions(['clipboard-read','clipboard-write']);const f=await fixture(page),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/admin/cloud-storage');await expect(page.locator('#nav-cloud-storage')).toHaveAttribute('aria-current','page');await expect(page.locator('.cloud-storage-card')).toHaveCount(2);
 const card=page.locator('.cloud-storage-card').filter({has:page.getByRole('heading',{name:'milenium',exact:true})});
 await card.getByRole('button',{name:'Copy link',exact:true}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('http://127.0.0.1:4173/files/milenium#access='+'a'.repeat(32));await expect(card.getByRole('button',{name:'Copied',exact:true})).toBeVisible();
 await page.screenshot({path:`.cache/cloud-storage-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await card.getByRole('link',{name:'Open',exact:true}).click();await expect(page).toHaveURL(/\/files\/milenium#access=/);await expect(page.locator('#collection-title')).toContainText('milenium');await page.goBack();
 await card.click({position:{x:12,y:20}});await expect(page).toHaveURL(/\/files\/milenium#access=/);await page.goBack();
 await card.getByRole('button',{name:'Edit',exact:true}).click();const edit=page.getByRole('dialog',{name:'Edit cloud storage.',exact:true});await expect(edit.getByRole('combobox',{name:'Company',exact:true})).toBeDisabled();await expect(edit.getByLabel('Replace MEGA folder link',{exact:true})).toHaveValue('');
 await edit.getByText('Link settings',{exact:true}).click();await edit.getByLabel('Description',{exact:true}).fill('Approved files.');await edit.getByRole('button',{name:'Save',exact:true}).click();await expect(edit).toBeHidden();expect(f.portals[0].description).toBe('Approved files.');
 await page.getByRole('button',{name:'Add storage',exact:true}).click();const create=page.getByRole('dialog',{name:'Add cloud storage.',exact:true});await expect(create.getByRole('combobox',{name:'Company',exact:true}).locator(`option[value="${company}"]`)).toHaveJSProperty('disabled',true);await create.getByRole('combobox',{name:'Company',exact:true}).selectOption(fresh);await create.getByLabel('MEGA folder link',{exact:true}).fill(mega);
 await expect(create.getByLabel('Storage name',{exact:true})).toHaveValue('Oak studio');await expect(create.getByLabel('URL slug',{exact:true})).toHaveValue('oak-studio');await page.screenshot({path:`.cache/cloud-storage-create-${width}.png`,fullPage:true});
 await create.getByRole('button',{name:'Add storage',exact:true}).click();await expect(create.getByRole('alert')).toContainText('Connection interrupted');await expect(create.getByLabel('MEGA folder link',{exact:true})).toHaveValue(mega);await expect(create.getByLabel('MEGA folder link',{exact:true})).toBeDisabled();
 await create.getByRole('button',{name:'Add storage',exact:true}).click();await expect(create).toBeHidden();await expect(page.locator('.cloud-storage-card')).toHaveCount(3);const saves=f.calls.filter(c=>c.action==='client-files-save'&&!c.body.id);expect(saves).toHaveLength(2);expect(saves[0].body).toEqual(saves[1].body);
 await page.reload();await expect(page.locator('.cloud-storage-card')).toHaveCount(3);expect(errors).toEqual([]);
});

test('Cloud storage recovers failed lists and company choices and keeps pagination usable',async({page})=>{
 await fixture(page,{failList:true,failCompanies:true,hasMore:true});await page.goto('/admin/cloud-storage');await expect(page.getByRole('alert')).toContainText('temporarily unavailable');await page.getByRole('button',{name:'Retry cloud storage',exact:true}).click();await expect(page.locator('.cloud-storage-card')).toHaveCount(2);
 await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('.cloud-storage-card')).toHaveCount(1);await expect(page.getByRole('button',{name:'Next',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Previous',exact:true}).click();await expect(page.locator('.cloud-storage-card')).toHaveCount(2);
 await page.getByRole('button',{name:'Add storage',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('alert')).toContainText('Could not load');await expect(dialog.getByRole('button',{name:'Add storage',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'Retry companies',exact:true}).click();await expect(dialog.getByRole('button',{name:'Add storage',exact:true})).toBeEnabled();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});
