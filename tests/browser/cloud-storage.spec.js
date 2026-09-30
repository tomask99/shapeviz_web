import {test,expect} from '@playwright/test';

const token='a'.repeat(32),shared='b'.repeat(32);
async function fixture(context,{restricted=false,fail=false}={}){
  const clicks=[],completed=[];
  await context.route(/^https:\/\/(?:www\.)?shapeviz\.com\//,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Shapeviz main website</title><h1>Visual studio</h1>'}));
  await context.route('**/api/files?*',async route=>{
    const request=route.request(),params=new URL(request.url()).searchParams;
    if(params.get('action')==='website-click'){
      clicks.push({params:Object.fromEntries(params),headers:request.headers(),body:request.postDataJSON(),method:request.method()});
      await new Promise(resolve=>setTimeout(resolve,600));
      await route.fulfill({status:fail?503:204});completed.push(true);return;
    }
    return route.fulfill({json:{collection:{title:'MILENIUM'},restricted,current:{id:'rootroot',name:'Cloud folder',directory:true},breadcrumbs:[{id:'rootroot',name:'Cloud folder'}],items:[{id:'folder01',name:'Models',directory:true}],page:1,total:1,hasMore:false}});
  });
  return {clicks,completed,url:restricted?'/files/share/'+shared:'/files/milenium#access='+token};
}

for(const mobile of [false,true])test(`Cloud storage branding, immediate studio navigation and click attribution on ${mobile?'mobile':'desktop'}`,async({browser})=>{
  const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
  try{
    const f=await fixture(context),page=await context.newPage();
    for(const source of ['visual_studio','logo']){
      await page.goto(f.url);await expect(page.locator('.file-row')).toHaveCount(1);
      await expect(page).toHaveTitle('MILENIUM · Cloud storage · Shapeviz');
      await expect(page.locator('.cloud-label')).toHaveText('Cloud storage');
      await expect(page.locator('footer')).toHaveCount(0);
      await expect(page.locator('.intro')).toHaveCSS('border-bottom-width','0px');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      if(source==='visual_studio')await page.screenshot({path:`.cache/cloud-storage-${mobile?'mobile':'desktop'}.png`,fullPage:true});
      const link=page.locator(`[data-studio-link="${source}"]`);
      await expect(link).toHaveAttribute('href','https://shapeviz.com/');
      if(mobile)await link.tap();else{await link.focus();await page.keyboard.press('Enter');}
      await expect(page).toHaveURL('https://shapeviz.com/');
      await expect.poll(()=>f.completed.length).toBe(f.clicks.length);
      const click=f.clicks.at(-1);expect(click.method).toBe('POST');expect(click.body.source).toBe(source);expect(click.body.eventId).toMatch(/^[0-9a-f-]{36}$/);
      expect(Object.keys(click.body).sort()).toEqual(['eventId','source']);
      expect(click.params).toEqual({portal:'milenium',action:'website-click'});expect(click.headers['x-files-access']).toBe(token);
      expect(click.headers.referer).toBeUndefined();
    }
    expect(f.clicks).toHaveLength(2);
  }finally{await context.close();}
});

test('forwarded share attributes the click through its capability and still navigates when notification fails',async({context,page})=>{
  const f=await fixture(context,{restricted:true,fail:true});await page.goto(f.url);await expect(page.locator('.file-row')).toHaveCount(1);expect(f.clicks).toHaveLength(0);
  await page.getByRole('link',{name:'visual studio',exact:true}).click();await expect(page).toHaveURL('https://shapeviz.com/');
  await expect.poll(()=>f.completed.length).toBe(1);expect(f.clicks).toHaveLength(1);
  expect(f.clicks[0].params).toEqual({share:shared,action:'website-click'});expect(f.clicks[0].headers['x-files-access']).toBeUndefined();
});

test('middle-click retains native new-tab navigation and sends one notification event',async({context,page})=>{
  const f=await fixture(context);await page.goto(f.url);await expect(page.locator('.file-row')).toHaveCount(1);
  const popup=context.waitForEvent('page');await page.getByRole('link',{name:'visual studio',exact:true}).click({button:'middle'});
  const destination=await popup;await expect(destination).toHaveURL(/^https:\/\/(?:www\.)?shapeviz\.com\/$/);
  await expect.poll(()=>f.completed.length).toBe(1);expect(f.clicks).toHaveLength(1);await destination.close();
  await expect(page).toHaveURL(/\/files\/milenium/);
});
