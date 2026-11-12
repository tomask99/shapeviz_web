import {test,expect} from '@playwright/test';

for(const width of [320,390,768,1440])test(`Slovak public page and language selection at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/shop?status=1',route=>route.fulfill({json:{launched:true}}));
 await page.goto('/sk');await expect(page.locator('html')).toHaveAttribute('lang','sk');
 await expect(page.getByRole('group',{name:'Jazyk'}).getByRole('link',{name:'Slovenčina'})).toHaveAttribute('aria-current','true');
 await expect(page.locator('[data-shop-nav]')).toHaveAttribute('href','/sk/shop');
 await expect(page.locator('#about-title')).toContainText('NÁPADOM');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 for(const id of ['#about-title','#digital-title','#work-title','.contact-heading h2']){
   const box=await page.locator(id).boundingBox();expect(box.x+box.width).toBeLessThanOrEqual(width+1);
 }
 await page.screenshot({path:`.cache/slovak-home-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'OTVORIŤ GALÉRIU',exact:true}).click();
 await expect(page.locator('#gallery-toggle')).toHaveText('ZAVRIEŤ GALÉRIU');
 await page.locator('#expanded-gallery [data-lightbox]').first().click();
 await expect(page.getByRole('dialog',{name:'Zväčšený vizuál projektu'})).toBeVisible();
 await expect(page.locator('.lightbox p')).toContainText('Krémová');
 await page.getByRole('button',{name:'Zavrieť zväčšený obrázok'}).click();
 await page.locator('.gallery-collapse').first().click();await expect(page.locator('#gallery-toggle')).toHaveAttribute('aria-expanded','false');
 await page.evaluate(()=>location.hash='contact');
 await page.getByRole('link',{name:'English',exact:true}).click();await expect(page).toHaveURL(/\/en#contact$/);
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.goto('/');await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.getByRole('link',{name:'Slovenčina',exact:true}).click();await page.goto('/');await expect(page.locator('html')).toHaveAttribute('lang','sk');
 expect(errors).toEqual([]);
});

test('browser language selects Slovak, contact feedback and media controls stay localized',async({browser})=>{
 const context=await browser.newContext({locale:'sk-SK',reducedMotion:'reduce'});const page=await context.newPage();
 try{
  await page.goto('/');await expect(page.locator('html')).toHaveAttribute('lang','sk');
  await page.getByRole('button',{name:'Zapnúť zvuk videa',exact:true}).first().click();
  await expect(page.getByRole('button',{name:'Vypnúť zvuk videa',exact:true}).first()).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Prehrať video',exact:true}).first().click();
  await expect(page.getByRole('button',{name:'Pozastaviť video',exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Pozastaviť video',exact:true}).first().click();
  await page.getByLabel('Vaše meno').fill('Jana Nováková');await page.getByLabel('E-mailová adresa').fill('jana@example.test');
  await page.getByLabel('High-end 3D modelovanie',{exact:true}).check();await page.getByLabel('Pár slov o vašom projekte').fill('Potrebujeme detailný 3D model nášho produktu.');
  await page.locator('[name=consent]').check();
  let payload;await page.route('**/api/contact',route=>{payload=route.request().postDataJSON();return route.fulfill({status:503,json:{ok:false,message:'The contact form is not accepting messages yet. Your message has not been sent. Please try again later.'}});});
  await page.getByRole('button',{name:'ODOSLAŤ DOPYT'}).click();await expect(page.locator('.form-status')).toContainText('Vaša správa nebola odoslaná');
  expect(payload.services).toEqual(['High-end 3D modeling']);expect(payload.name).toBe('Jana Nováková');await expect(page.getByLabel('Vaše meno')).toHaveValue('Jana Nováková');
  await page.route('**/api/contact',route=>route.fulfill({json:{ok:true,message:'Thank you. Your inquiry is on its way. We’ll be in touch.'}}));
  await page.getByRole('button',{name:'ODOSLAŤ DOPYT'}).click();await expect(page.locator('.form-status')).toHaveText('Ďakujeme. Váš dopyt bol odoslaný. Ozveme sa vám.');
  await expect(page.getByLabel('Vaše meno')).toHaveValue('');
 }finally{await context.close();}
});

test('Slovak shop has translated filters and preserves product content',async({page})=>{
 await page.setViewportSize({width:390,height:900});
 await page.route('**/api/shop*',route=>route.fulfill({json:{launched:true,categories:[{id:'custom',name:'Studio'}],products:[{url:'https://shapeviz.gumroad.com/l/sample',categoryId:'custom',preview:{title:'Studio'}}]}}));
 await page.route('https://gumroad.com/**',route=>route.abort());
 await page.goto('/sk/shop');await expect(page.locator('#shop-state-label')).toHaveText('PRE TVORCOV');
 await expect(page.locator('.shop-result-count')).toHaveText('1 produkt');
 await page.getByRole('button',{name:'Filtre',exact:true}).click();await expect(page.getByRole('button',{name:'Všetky',exact:true})).toBeVisible();
 await expect(page.locator('.shop-product-title')).toHaveText('Studio');
 await page.locator('.shop-product-card').click();await expect(page.getByRole('link',{name:'Zobraziť na Gumroad',exact:true}).last()).toBeVisible();
 await page.getByRole('button',{name:'Zavrieť podrobnosti produktu'}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 await page.screenshot({path:'.cache/slovak-shop-390.png',fullPage:true});
 await page.getByRole('link',{name:'English',exact:true}).click();await expect(page).toHaveURL(/\/en\/shop$/);await expect(page.locator('.shop-result-count')).toHaveText('1 product');
});

test('language selection and translated content work without JavaScript',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false,locale:'sk-SK'});
 try{
  const page=await context.newPage();await page.goto('/');await expect(page.locator('html')).toHaveAttribute('lang','sk');
  await expect(page.locator('noscript p').last()).toContainText('zapnite JavaScript');
  await page.getByRole('link',{name:'English',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('lang','en');
  await page.goto('/');await expect(page.locator('html')).toHaveAttribute('lang','en');
 }finally{await context.close();}
});
