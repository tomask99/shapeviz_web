import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {createPresentationPageHandler} from '../../src/presentations/page.js';
import {transformDeck} from '../../src/admin/html.js';

const source='<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#100c08;color:#f1ede6;padding:30px;font-family:Arial}.final-brand-cta{display:inline-flex;align-items:center;gap:14px;padding:18px;background:#d88739;color:#000}.final-brand-cta-icon{font-size:24px;line-height:1}</style></head><body><a class="final-brand-cta" href="https://shapevizweb.vercel.app/" target="_blank" aria-label="Visit Shapeviz">Visit Shapeviz <span class="final-brand-cta-icon" aria-hidden="true">↗</span></a></body></html>';

for(const mobile of [false,true]){
 test(`stored presentation and template preview use a visible SVG CTA on ${mobile?'mobile':'desktop'}`,async({browser})=>{
  const server=createServer(createPresentationPageHandler({
   env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'test'},
   send:async url=>{
    if(url.includes('/presentation_projects?'))return Response.json([{deck_slug:'arrow-test',status:'published',access_mode:'unlisted',source_type:'standalone',source_bucket:'presentation-source',source_path:'arrow-test/index.html'}]);
    return new Response(source);
   }
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
  try{
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await context.route('https://shapevizweb.vercel.app/**',route=>route.fulfill({body:'Destination'}));
   await page.goto(`http://127.0.0.1:${server.address().port}/?slug=arrow-test&sv_gate=1`);
   for(const preview of [false,true]){
    if(preview){
     await page.setContent('<iframe title="Template preview" sandbox="allow-scripts" style="border:0;width:100%;height:250px"></iframe>');
     await page.locator('iframe').evaluate((frame,html)=>{frame.srcdoc=html;},transformDeck(source,{analytics:false}).html);
    }
    const root=preview?page.frameLocator('iframe'):page;
    const link=root.getByRole('link',{name:'Visit Shapeviz'}),icon=link.locator('svg');
    await expect(icon).toBeVisible();await expect(icon).toHaveCount(1);
    await expect(link).not.toContainText('↗');
    expect(await icon.evaluate(node=>node.namespaceURI)).toBe('http://www.w3.org/2000/svg');
    await expect(icon).toHaveCSS('stroke','rgb(0, 0, 0)');
    const bounds=await icon.boundingBox();expect(bounds.width).toBeGreaterThan(15);expect(bounds.height).toBeGreaterThan(15);
    if(!preview){
     await link.screenshot({path:`.cache/cta-arrow-${mobile?'mobile':'desktop'}.png`});
     const popupPromise=context.waitForEvent('page');await link.click();const popup=await popupPromise;await popup.close();
    }
   }
   expect(errors).toEqual([]);
  }finally{await context.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 });
}
