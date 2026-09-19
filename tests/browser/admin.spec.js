import {test,expect} from '@playwright/test';
test('company variant can be previewed and then saved with a pointer',async({page})=>{
 let saved=false;
 await page.route('**/api/admin?*',route=>{const action=new URL(route.request().url()).searchParams.get('action');let data={};if(action==='me')data={email:'owner@example.com'};if(action==='list')data={projects:[{deck_slug:'sample',client:'Milenium',title:'Pitch',is_template:true,template_match:'MILENIUM',status:'draft',slide_count:1}]};if(action==='stats')data={summary:{},daily:[],decks:[]};if(action==='preview')data={html:'<h1>HRNO</h1><button onclick="this.textContent=\'Done\'">Test interaction</button>',replacements:1,slides:1};if(action==='variant'){saved=true;data={url:'/p/hrno'};}return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/adminlogin');await page.locator('[data-variant=sample]').click();await page.locator('#variant-form [name=client]').fill('Hrno');await page.locator('#preview-variant').click();await expect(page.locator('#preview-dialog')).toBeVisible();
 await page.frameLocator('#variant-preview').getByRole('button').click();await page.locator('#preview-dialog button.secondary').click();await page.locator('#variant-form button[type=submit]').click();await expect.poll(()=>saved).toBe(true);await expect(page.locator('#variant-dialog')).not.toBeVisible();
});
test('admin login is responsive and never shows private dashboard data before authentication',async({page})=>{
 await page.route('**/api/admin?*',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Please sign in.'})}));
 await page.goto('/adminlogin');await expect(page.locator('#signin')).toBeVisible();await expect(page.locator('#studio')).toBeHidden();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await expect(page.locator('#signin input[type=password]')).toHaveAttribute('autocomplete','current-password');
});
test('tracker counts revisits and flushes time for the slide being left',async({page})=>{
 const events=[];await page.route('**/api/presentation-events',route=>{events.push(route.request().postDataJSON());return route.fulfill({status:204});});
 await page.goto('/');
 await page.setContent('<section class="slide active">One</section><section class="slide">Two</section><script src="/presentation-system/tracker.js" data-deck="tracker-test" data-analytics="true"></script>');
 await expect.poll(()=>events.filter(e=>e.eventType==='slide_viewed').length).toBe(1);
 await page.waitForTimeout(1100);
 await page.evaluate(()=>document.querySelectorAll('.slide').forEach(s=>s.classList.toggle('active')));
 await expect.poll(()=>events.filter(e=>e.eventType==='slide_viewed').length).toBe(2);
 await page.evaluate(()=>document.querySelectorAll('.slide').forEach(s=>s.classList.toggle('active')));
 await expect.poll(()=>events.filter(e=>e.eventType==='slide_viewed'&&e.slideIndex===1).length).toBe(2);
 expect(events.some(e=>e.eventType==='session_heartbeat'&&e.slideIndex===1&&e.activeSeconds>=1)).toBe(true);
});
