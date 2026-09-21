import { test, expect } from '@playwright/test';
import { createApp } from '../../server.js';
import path from 'node:path';

for (const mobile of [false, true]) {
  test(`sandboxed analytics reaches the API on ${mobile ? 'mobile without randomUUID' : 'desktop'}`, async ({ browser }) => {
    const writes = [];
    const project = {
      deck_slug: 'analytics-test', source_type: 'template', template_key: 'test-template',
      client: 'Test', title: 'Test', presentation_date: '2026', description: 'Test', locale: 'en',
      status: 'published', access_mode: 'unlisted', analytics_enabled: true,
      content: { headline: 'Test', intro: 'Test', opportunity: 'Test', focus: 'Test', cta: 'Test' }
    };
    const server = createApp({
      templatesRoot:path.resolve(import.meta.dirname,'../fixtures/presentation-templates'),
      env: { PRESENTATIONS_REMOTE: 'true', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SECRET_KEY: 'test' },
      send: async (url, options) => {
        if (url.includes('/presentation_projects?')) return Response.json([project]);
        if (url.endsWith('/rpc/record_presentation_event')) {
          writes.push(JSON.parse(options.body));
          return new Response(null, { status: 204 });
        }
        throw new Error(`Unexpected request: ${url}`);
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const context = await browser.newContext(mobile ? {
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
    } : {});
    try {
      if (mobile) await context.addInitScript(() => {
        Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined });
        Object.defineProperty(Navigator.prototype, 'sendBeacon', { value: () => false });
      });
      const page = await context.newPage();
      const failures = [];
      page.on('pageerror', error => failures.push(error.message));
      const response = await page.goto(`${origin}/p/analytics-test`);
      expect(response.headers()['content-security-policy']).toContain(`connect-src 'self' ${origin}`);
      expect(await page.evaluate(() => window.origin)).toBe('null');
      await expect.poll(() => writes.some(e => e.p_event_type === 'session_started')).toBe(true);
      await expect.poll(() => writes.some(e => e.p_event_type === 'slide_viewed')).toBe(true);
      await context.route('https://shapevizweb.vercel.app/**',route=>route.fulfill({contentType:'text/html',body:'<title>Website destination</title>'}));
      await page.evaluate(()=>{
        const link=document.createElement('a');link.id='website-cta';link.href='https://shapevizweb.vercel.app/#contact';link.target='_blank';link.textContent='Visit website';
        link.style='position:fixed;top:0;left:0;z-index:99999;background:white;color:black;padding:20px';document.body.append(link);
      });
      for(let i=0;i<2;i++) {
        const popupPromise=context.waitForEvent('page');await page.locator('#website-cta').click();
        const popup=await popupPromise;await popup.close();
      }
      await expect.poll(()=>writes.filter(e=>e.p_event_type==='website_clicked').length).toBe(2);
      // Synthetic clicks must not inflate conversion statistics.
      await page.evaluate(()=>document.querySelector('#website-cta').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));
      await page.waitForTimeout(1100);
      await page.evaluate(() => dispatchEvent(new Event('pagehide')));
      await expect.poll(() => writes.some(e => e.p_event_type === 'session_ended')).toBe(true);
      expect(writes.some(e => e.p_event_type === 'session_heartbeat' && e.p_active_seconds >= 1)).toBe(true);
      expect(new Set(writes.map(e => e.p_session_id)).size).toBe(1);
      expect(writes.filter(e=>e.p_event_type==='website_clicked')).toHaveLength(2);
      expect(new Set(writes.map(e => e.p_event_id)).size).toBe(writes.length);
      expect(writes.every(e => e.p_user_agent_category === (mobile ? 'mobile' : 'desktop'))).toBe(true);
      expect(failures).toEqual([]);
    } finally {
      await context.close();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
}
