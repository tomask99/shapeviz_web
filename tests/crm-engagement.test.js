import test from 'node:test';
import assert from 'node:assert/strict';
import {engagementMarkup} from '../public/admin/crm-engagement.js';
test('engagement renders session cohort, unique slide indices not max_slide, disabled tracking and clicks',()=>{
  const html=engagementMarkup({summary:{visits:3,seconds:268,website_clicks:2},slides:[{slide_index:2,views:2},{slide_index:8,views:1},{slide_index:8,views:1},{slide_index:10,views:0}],sessions:[{started_at:'2026-01-01T10:00:00Z',max_slide:27}]},{slide_count:27,analytics_enabled:false},7);
  assert.match(html,/4m 28s/);assert.match(html,/2 \/ 27/);assert.match(html,/last 7 days/);assert.match(html,/admin visits/);assert.match(html,/Tracking is currently disabled/);assert.match(html,/Website clicks<\/dt><dd>2/);
});
test('empty visits render explicit zero, but missing response is not fabricated into zero',()=>{
  const html=engagementMarkup({summary:{visits:0,seconds:0},slides:[],sessions:[]},{slide_count:12},30);assert.match(html,/No visits yet/);assert.match(html,/0 \/ 12/);
  assert.throws(()=>engagementMarkup({},null,30),/incomplete/);
});
