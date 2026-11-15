import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
import {CONSENT_MAX_AGE, readConsent} from '../public/privacy/consent.js';
import {legalPaths} from '../src/website/legal.js';

test('analytics consent fails closed for missing, expired, duplicate or malformed choices',()=>{
  const now=Date.now();
  for(const cookie of ['',`sv_analytics=1.yes.${now+1}`,`sv_analytics=1.yes.${now-CONSENT_MAX_AGE*1000}`,`sv_analytics=2.yes.${now}`,`sv_analytics=1.yes.${now}; sv_analytics=1.no.${now}`])assert.equal(readConsent(cookie,now),null);
  assert.equal(readConsent(`sv_analytics=1.no.${now}`,now).analytics,false);
  assert.equal(readConsent(`sv_analytics=1.yes.${now}`,now).analytics,true);
});
test('public legal routes work without JS, including Vercel rewrites and HEAD',async()=>{
  const server=createApp({env:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const [locale,paths] of Object.entries(legalPaths))for(const [page,path] of Object.entries(paths)){
      for(const route of [path,`/api/site-events?route=page&locale=${locale}&legal=${page}`]){
        const r=await fetch(origin+route),html=await r.text();assert.equal(r.status,200);assert.equal(r.headers.get('content-language'),locale);
        assert.match(html,/57 820 970/);assert.match(html,/shapeviz3d@gmail.com/);assert.match(html,/class="legal-links"/);assert.doesNotMatch(html,/src="\/site-tracker.js"/);
      }
      assert.equal((await fetch(origin+path,{method:'HEAD'})).status,200);
    }
    const r=await fetch(origin+'/api/site-events',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
    assert.equal(r.status,204);assert.equal(r.headers.get('x-analytics-status'),null);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
