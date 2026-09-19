import {test,expect} from '@playwright/test';
test('rounded studio shows chart numbers, cursor glow and confirms deletion',async({page})=>{
 let deleted=false;const today=new Date().toISOString().slice(0,10);
 await page.route('**/api/admin?*',route=>{const action=new URL(route.request().url()).searchParams.get('action');let data={};if(action==='me')data={email:'owner@example.com'};if(action==='list')data={projects:deleted?[]:[{deck_slug:'sample',client:'Sample studio',title:'Visual direction',is_template:false,status:'published',slide_count:3}]};if(action==='stats')data={summary:{visits:7,seconds:180,average_seconds:26,slide_views:18},daily:[{day:today,visits:7,seconds:180}],decks:[],slides:[],sessions:[]};if(action==='delete'){expect(route.request().postDataJSON()).toEqual({slug:'sample',confirmSlug:'sample'});deleted=true;data={ok:true};}return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/adminlogin');const bar=page.locator(`[data-day="${today}"]`);await bar.hover();await expect(page.locator('#chart-readout')).toContainText('7 visits');await bar.click();await expect(bar).toHaveAttribute('aria-pressed','true');await expect(page.locator('#chart-readout')).toContainText('3m 0s active');
 await page.mouse.move(650,220);await expect.poll(()=>page.locator('.glow-head').evaluate(el=>Number(getComputedStyle(el).opacity))).toBeGreaterThan(0);
 await expect(page.locator('.metric').first()).toHaveCSS('border-radius','24px');await page.screenshot({path:'.cache/admin-rounded-desktop.png',fullPage:true});
 await page.locator('[data-delete=sample]').click();await page.getByRole('button',{name:'Keep presentation'}).click();expect(deleted).toBe(false);await page.locator('[data-delete=sample]').click();await page.locator('#delete-form input').fill('sample');await page.locator('#delete-form button[type=submit]').click();await expect(page.locator('#projects')).toContainText('No presentations');expect(deleted).toBe(true);
 await page.setViewportSize({width:390,height:844});await bar.click();await expect(page.locator('#chart-readout')).toContainText('7 visits');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'.cache/admin-rounded-mobile.png',fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.studio-glow')).toBeHidden();
});
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
