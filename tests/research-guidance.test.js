import test from 'node:test';
import assert from 'node:assert/strict';
import {researchGuidance} from '../public/admin/research-guidance.js';

test('research guidance distinguishes missing data from unverified facts and never infers a negative signal',()=>{
  const result=researchGuidance({website:'https://example.test',product_categories:['Chairs'],field_provenance:{product_categories:{status:'INFERRED'}}});
  assert.equal(result.missing.find(item=>item.key==='product_categories').reason,'Needs verification');
  assert.equal(result.missing.find(item=>item.key==='business_type').reason,'Not recorded');
  assert.equal(result.missing.find(item=>item.key==='asset_availability').reason,'Not yet researched');
  assert.match(result.nextAction,/sources/);
  assert.doesNotMatch(JSON.stringify(result),/no 3d|no downloads|not available/i);
});

test('recorded research signals remove only the corresponding research gap',()=>{
  const candidate={website:'https://example.test',product_categories:['Chairs'],sources:[{source_type:'Professional / Architect Page'}],field_provenance:{product_categories:{status:'VERIFIED'}},opportunity_signals:[{signal:'NO_3D_DOWNLOADS_FOUND',status:'INFERRED'}]};
  const before=JSON.stringify(candidate),result=researchGuidance(candidate);
  assert.ok(!result.missing.some(item=>['product_categories','professional_resources','asset_availability'].includes(item.key)));
  assert.ok(result.missing.some(item=>item.key==='fit'));
  assert.equal(JSON.stringify(candidate),before);
  assert.match(researchGuidance().nextAction,/official company website/);
});
