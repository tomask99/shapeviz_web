import test from 'node:test';import assert from 'node:assert/strict';
import {signTracking,verifyTracking,trackingClassification,trackingCookie} from '../src/presentations/tracking-proof.js';
test('tracking classification and visit proofs reject tampering and expiration',()=>{
 const secret='test-key',p={kind:'visit',deck:'fixture',exp:Date.now()+10000},token=signTracking(p,secret);
 assert.deepEqual(verifyTracking(token,secret),p);assert.equal(verifyTracking(token,'wrong'),null);assert.equal(verifyTracking(token+'a',secret),null);assert.equal(verifyTracking(signTracking({...p,exp:0},secret),secret),null);
 const cookie=trackingCookie(true,{SUPABASE_SECRET_KEY:secret,SITE_URL:'https://example.test'});assert.match(cookie,/HttpOnly; SameSite=Lax; Path=\//);assert.match(cookie,/Secure/);assert.equal(trackingClassification({headers:{cookie}},secret).exclude,true);
});
