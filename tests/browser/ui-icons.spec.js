import {test,expect} from '@playwright/test';
import {iconPolicyViolations} from '../../src/ui/icon-policy.js';

for(const mobile of [false,true])test(`file portal keeps SVG icons after navigation and copying on ${mobile?'mobile':'desktop'}`,async({browser})=>{
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
  try{
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    const root={id:'rootroot',name:'MILENIUM',directory:true};
    const folder={id:'folder01',name:'01 Pre Architektov',directory:true};
    const file={id:'file0001',name:'Sofa model.zip',directory:false,size:2048};
    await page.route('**/api/files?*',route=>{
      const params=new URL(route.request().url()).searchParams;
      if(params.get('action')==='share')return route.fulfill({json:{url:'/files/share/'+'b'.repeat(32)}});
      const current=params.get('node')===file.id?file:params.get('node')===folder.id?folder:root;
      return route.fulfill({json:{collection:{title:'MILENIUM'},current,breadcrumbs:current===root?[root]:current===folder?[root,folder]:[root,folder,file],items:current===root?[folder]:current===folder?[file]:[],total:1,page:1,hasMore:false}});
    });
    await page.goto('http://127.0.0.1:4173/files/icons#access='+'a'.repeat(32));
    const open=page.getByRole('link',{name:'Open '+folder.name,exact:true});
    await expect(open).toBeVisible();
    for(const control of [page.getByRole('link',{name:'visual studio'}),page.getByRole('button',{name:'Copy folder link',exact:true}),open]){
      const icon=control.locator('svg');await expect(icon).toBeVisible();
      expect(await icon.evaluate(node=>node.namespaceURI)).toBe('http://www.w3.org/2000/svg');
      await expect(icon).toHaveAttribute('aria-hidden','true');
      expect((await icon.boundingBox()).width).toBeGreaterThan(8);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`.cache/svg-icons-${mobile?'mobile':'desktop'}.png`,fullPage:true});
    await page.getByRole('button',{name:'Copy folder link',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toContain('/files/share/');
    await expect(page.getByRole('button',{name:'Copy folder link',exact:true}).locator('svg')).toBeVisible();
    await open.click();
    await expect(page.getByRole('button',{name:'Download '+file.name,exact:true}).locator('svg')).toBeVisible();
    await page.locator('.file-name').click();
    await expect(page.getByRole('button',{name:'Download file',exact:true}).locator('svg')).toBeVisible();
    await expect(page.locator('#copy-page')).toHaveAccessibleName('Copy file link');
    expect(iconPolicyViolations(await page.locator('body').innerText())).toEqual([]);
    await page.reload();
    await expect(page.getByRole('button',{name:'Download file',exact:true}).locator('svg')).toBeVisible();
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
