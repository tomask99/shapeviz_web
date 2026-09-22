import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePresentationCtaArrows} from '../src/presentations/cta-arrows.js';
import {transformDeck} from '../src/admin/html.js';
import {preparePublishedHtml} from '../src/presentations/publish-html.js';

test('CTA arrows use SVG for literal, entity and emoji variants, preserving links and icon wrappers',()=>{
 for(const arrow of ['↗','↗\uFE0F','↗\uFE0E','&#8599;','&#x2197;','&nearr;']){
  const result=normalizePresentationCtaArrows(`<a href="https://shapevizweb.vercel.app/" target="_blank" aria-label="Visit ↗">Visit &amp; explore <span class="final-brand-cta-icon">${arrow}</span></a>`);
  assert.match(result,/<span class="final-brand-cta-icon"><svg class="shapeviz-cta-arrow"/);
  assert.match(result,/Visit &amp; explore/);
  assert.match(result,/href="https:\/\/shapevizweb.vercel.app\/" target="_blank" aria-label="Visit ↗"/);
  assert.match(result,/stroke="currentColor"/);
  assert.match(result,/aria-hidden="true" focusable="false"/);
  assert.doesNotMatch(result,/[\uFE0E\uFE0F]/);
  assert.equal(normalizePresentationCtaArrows(result),result);
 }
});

test('only control text changes, preserving scripts, styles, other text and existing SVG',()=>{
 const unchanged='<style>.cta:after{content:"↗"}</style><script>const arrow="↗";</script><p>Direction ↗</p><a href="/↗"><svg><text>↗</text></svg><code>↗</code></a>';
 assert.equal(normalizePresentationCtaArrows(unchanged),unchanged);
 const result=normalizePresentationCtaArrows(unchanged+'<button>A ↗ B ↗</button>');
 assert.ok(result.startsWith(unchanged));
 assert.equal((result.match(/class="shapeviz-cta-arrow"/g)||[]).length,2);
});

test('admin previews, newly saved variants and CLI publishing all normalize CTA arrows',()=>{
 const html='<!doctype html><html><head></head><body><a href="https://shapevizweb.vercel.app/">Visit <span>↗</span></a></body></html>';
 assert.match(transformDeck(html,{slug:'preview',analytics:false}).html,/shapeviz-cta-arrow/);
 assert.match(preparePublishedHtml(html,{slug:'published',mediaBase:'https://example.supabase.co/media/',analytics:true}),/shapeviz-cta-arrow/);
});
