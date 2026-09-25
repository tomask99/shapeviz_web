import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const id='22222222-2222-4222-8222-222222222222',companyId='33333333-3333-4333-8333-333333333333';
const example=JSON.parse(await readFile(new URL('../../docs/examples/research-candidates.v1.json',import.meta.url),'utf8')).candidates[0];
const initial={positioning:{},field_provenance:{},secondary_categories:[],market_segments:[],...example,id,company_name:'Example Furniture',version:1,research_status:'NEEDS_REVIEW',manual_fields:[],created_at:'2026-09-23T08:00:00Z',updated_at:'2026-09-23T08:00:00Z',normalized_domain:'furniture.example'};
const company={id:companyId,version:1,company_name:'Example Furniture',country:'CZ',city:'Prague',industry:'Furniture',services:['Product CGI'],priority:'MEDIUM',pipeline_status:'NEW_LEAD',lead_source:'AI Research',fit:'HIGH',created_at:initial.created_at,updated_at:initial.updated_at};

async function fixture(page,{duplicates=[],saveFailures=[],approveFailures=[],status='NEEDS_REVIEW',events=[],overrides={}}={}) {
  let candidate={...structuredClone(initial),research_status:status,...overrides},lastPreview=null;
  const calls=[];
  await page.route('**/api/admin?*',async route=>{
    const request=route.request(),url=new URL(request.url()),action=url.searchParams.get('action'),body=request.postDataJSON();
    calls.push({action,body});
    if(action==='me')return route.fulfill({json:{email:'owner@example.test'}});
    if(action==='crm-research-detail')return route.fulfill({json:{candidate,events}});
    if(action==='crm-research-save'){
      const failure=saveFailures.shift();if(failure)return route.fulfill({status:failure,json:{error:failure===409?'Candidate changed in another session.':'Connection to database interrupted.'}});
      candidate={...candidate,...body.candidate,version:candidate.version+1,manual_fields:['fit','fit_reason','company_name']};
      events=[{id:'event1',event_type:'candidate_updated',metadata:{changed_fields:['fit','fit_reason'],from_fit:'HIGH',to_fit:candidate.fit},created_at:initial.created_at}];
      return route.fulfill({json:{candidate_id:id,version:candidate.version}});
    }
    if(action==='crm-research-reject') {candidate={...candidate,version:candidate.version+1,research_status:'REJECTED',rejection_reason:body.reason,rejected_at:initial.created_at};return route.fulfill({json:{candidate_id:id,version:candidate.version}});}
    if(action==='crm-research-restore') {candidate={...candidate,version:candidate.version+1,research_status:'NEEDS_REVIEW',rejection_reason:'',rejected_at:null};return route.fulfill({json:{candidate_id:id,version:candidate.version}});}
    if(action==='crm-research-approval-preview') {
      lastPreview={...company,priority:body.priority,services:body.services,short_description:candidate.short_description,website:candidate.website};
      return route.fulfill({json:{candidate,lead:lastPreview,duplicates,match_count:duplicates.length,company_match_count:duplicates.filter(item=>item.kind==='company').length,can_approve:!duplicates.some(item=>item.kind==='company'),reviewToken:'review-'+calls.length}});
    }
    if(action==='crm-research-approve') {
      const failure=approveFailures.shift();if(failure)return route.fulfill({status:failure,json:{error:'Approval response interrupted.'}});
      candidate={...candidate,version:candidate.version+1,research_status:'APPROVED',approved_company_id:companyId,approved_at:initial.created_at};
      return route.fulfill({json:{candidate_id:id,company_id:companyId,version:candidate.version}});
    }
    if(action==='crm-detail')return route.fulfill({json:{company:{...company,...lastPreview}}});
    if(action==='crm-research-insight')return route.fulfill({json:{insight:{id,kind:'approved_candidate',research:candidate,created_at:initial.created_at},approved_candidate:{id,company_name:candidate.company_name},history:[],hasMore:false,page:1}});
    if(action==='crm-activity')return route.fulfill({json:{items:[{id:'activity1',event_type:'ai_research_approved',metadata:{candidate_id:id,fit:'HIGH'},created_at:initial.created_at}],hasMore:false}});
    return route.fulfill({json:{items:[],companies:[],total:0,page:1,pageSize:25,projects:[],summary:{},daily:[]}});
  });
  return calls;
}
const detail=async page=>{await page.goto('/admin/ai-research/'+id);await expect(page.getByRole('heading',{name:'Example Furniture.'})).toBeVisible();};

test('lead approval has a close cross after preview and also dismisses outside without approving',async({page})=>{
 const calls=await fixture(page);await detail(page);await page.getByRole('button',{name:'Approve as lead',exact:true}).click();
 let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Preview lead',exact:true}).click();await expect(dialog).toContainText('Lead preview');
 await expect(dialog.getByRole('button',{name:'Close dialog',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await dialog.evaluate(d=>d.scrollTop=d.scrollHeight);
 await expect(dialog.getByRole('button',{name:'Close dialog',exact:true})).toBeInViewport();await page.screenshot({path:'.cache/review-close-mobile.png'});
 await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'Approve as lead',exact:true}).click();dialog=page.getByRole('dialog');
 const box=await dialog.boundingBox();await page.mouse.click(Math.max(1,box.x-5),box.y+20);await expect(dialog).toHaveCount(0);
 expect(calls.filter(c=>c.action==='crm-research-approve')).toHaveLength(0);
});

test('Candidate editing retains rejected input, sends full proposal, and records manual Fit with escaped history',async({page})=>{
  const calls=await fixture(page,{saveFailures:[409],events:[{event_type:'candidate_rejected',metadata:{reason:'<img src=x onerror=alert(1)>'},created_at:initial.created_at}]});await detail(page);
  await expect(page.getByRole('heading',{name:'Review history'}).locator('..')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.research-history img')).toHaveCount(0);
  await page.getByRole('button',{name:'Edit candidate',exact:true}).click();const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('Changing a company fact clears its previous verification');
  await dialog.getByLabel('Company name').fill('Corrected Furniture');
  await dialog.getByRole('combobox',{name:'Fit',exact:true}).selectOption('MEDIUM');
  await dialog.getByLabel('Fit reason',{exact:true}).fill('Reviewed product range suggests a smaller initial project.');
  await dialog.getByLabel('Lifestyle CGI',{exact:true}).check();
  await dialog.getByLabel('Lifestyle CGI relevance').selectOption('HIGH');
  await dialog.getByLabel('Lifestyle CGI reason').fill('A reviewed lifestyle opportunity.');
  await dialog.getByRole('button',{name:'Save candidate'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Your input has been kept');
  await expect(dialog.getByLabel('Company name')).toHaveValue('Corrected Furniture');
  await expect(dialog.getByLabel('Company name')).toBeEnabled();
  const body=calls.find(call=>call.action==='crm-research-save').body;
  expect(Object.keys(body.candidate).sort()).toEqual(['company_name','website','country','city','industry','business_type','product_categories','secondary_categories','market_segments','positioning','short_description','research_summary','potential_services','opportunity_signals','suggested_pitch_angle','fit','fit_reason','research_confidence','sources','field_provenance','last_researched_at','source_origin'].sort());
  expect(body.candidate.potential_services).toContainEqual({service:'Lifestyle CGI',relevance:'HIGH',reason:'A reviewed lifestyle opportunity.'});
  await dialog.getByRole('button',{name:'Save candidate'}).click();
  await expect(page.getByRole('heading',{name:'Corrected Furniture.'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Shapeviz Fit'}).locator('..')).toContainText('Manually reviewed');
  await expect(page.locator('.research-history')).toContainText('Fit: High → Medium');
});

test('Ambiguous candidate save retries preserve the exact operation and draft across dialog reopening',async({page})=>{
  const services=[...initial.potential_services].reverse();
  const calls=await fixture(page,{saveFailures:[502],overrides:{product_categories:['Contract, hospitality'],potential_services:services}});await detail(page);
  await page.getByRole('button',{name:'Edit candidate',exact:true}).click();let dialog=page.getByRole('dialog');
  await dialog.getByLabel('Research summary',{exact:true}).fill('A manually checked research draft.');
  await dialog.getByRole('button',{name:'Save candidate'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Retry the same save');
  await expect(dialog.getByLabel('Research summary',{exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Edit candidate',exact:true}).click();dialog=page.getByRole('dialog');
  await expect(dialog.getByLabel('Research summary',{exact:true})).toHaveValue('A manually checked research draft.');
  await dialog.getByRole('button',{name:'Retry save'}).click();await expect(dialog).toHaveCount(0);
  const writes=calls.filter(call=>call.action==='crm-research-save');expect(writes).toHaveLength(2);expect(writes[1].body).toEqual(writes[0].body);expect(writes[0].body.candidate.product_categories).toEqual(['Contract, hospitality']);expect(writes[0].body.candidate.potential_services).toEqual(services);
});

test('Rejection closes review actions until the candidate is explicitly restored',async({page})=>{
  const calls=await fixture(page);await detail(page);await page.getByRole('button',{name:'Reject candidate'}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Reason category').selectOption('Wrong market');await dialog.getByLabel('Rejection reason').fill('Focus on local projects first.');
  await dialog.getByRole('button',{name:'Reject candidate',exact:true}).click();
  await expect(page.getByRole('button',{name:'Restore to review',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Edit candidate',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Approve as lead',exact:true})).toHaveCount(0);
  expect(calls.find(call=>call.action==='crm-research-reject').body.reason).toBe('Wrong market: Focus on local projects first.');
  await page.getByRole('button',{name:'Restore to review'}).click();await page.getByRole('dialog').getByRole('button',{name:'Restore to review'}).click();
  await expect(page.getByRole('button',{name:'Edit candidate',exact:true})).toBeVisible();
});

test('Approval previews options, invalidates changed choices, creates only on confirmation and links both directions',async({page})=>{
  const calls=await fixture(page);await detail(page);await page.getByRole('button',{name:'Approve as lead'}).click();const dialog=page.getByRole('dialog');
  expect(calls.filter(call=>call.action==='crm-research-approve')).toHaveLength(0);
  await dialog.getByRole('button',{name:'Preview lead'}).click();await expect(dialog.getByRole('heading',{name:'Lead preview'})).toBeVisible();
  await expect(dialog).toContainText('AI Research');await expect(dialog).toContainText('MEDIUM');
  await dialog.getByLabel('Lead priority').selectOption('HIGH');await expect(dialog.getByRole('button',{name:'Confirm and create lead'})).toHaveCount(0);
  await dialog.getByLabel('Product Animation',{exact:true}).check();await dialog.getByRole('button',{name:'Preview lead'}).click();
  await expect(dialog.locator('.research-lead-preview')).toContainText('HIGH');await expect(dialog.locator('.research-lead-preview')).toContainText('Product Animation');
  expect(calls.filter(call=>call.action==='crm-research-approve')).toHaveLength(0);
  await dialog.getByRole('button',{name:'Confirm and create lead'}).click();await expect(dialog.getByRole('heading',{name:'Lead created.'})).toBeVisible();
  await dialog.getByRole('button',{name:'Done'}).click();await expect(page.getByRole('button',{name:'Edit candidate'})).toHaveCount(0);
  await page.getByRole('link',{name:'Open lead',exact:true}).click();await expect(page).toHaveURL('/admin/leads/'+companyId);
  await expect(page.locator('.crm-company-research')).toContainText('Research behind this company.');
  await expect(page.getByRole('link',{name:'View approved research and sources'})).toHaveAttribute('href','/admin/ai-research/'+id);
  await page.getByRole('tab',{name:'Activity',exact:true}).click();await expect(page.getByRole('heading',{name:'AI research approved'})).toBeVisible();
  await expect(page.getByRole('link',{name:'View approved research'})).toHaveAttribute('href','/admin/ai-research/'+id);
  await expect(page.getByRole('button',{name:'Edit activity'})).toHaveCount(0);
});

test('Existing CRM companies block approval and link to the existing record',async({page})=>{
  const calls=await fixture(page,{duplicates:[{kind:'company',id:companyId,company_name:'Existing Furniture',status:'ACTIVE_CLIENT',match:'domain'}]});await detail(page);
  await page.getByRole('button',{name:'Approve as lead'}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Preview lead'}).click();
  await expect(dialog).toContainText('This company already exists in your CRM');
  await expect(dialog.getByRole('link',{name:'Existing Furniture'})).toHaveAttribute('href','/admin/leads/'+companyId);
  await expect(dialog.getByRole('button',{name:'Confirm and create lead'})).toHaveCount(0);
  expect(calls.filter(call=>call.action==='crm-research-approve')).toHaveLength(0);
});

test('Research matches require acknowledgment and ambiguous approvals retry the identical reviewed operation',async({page})=>{
  const calls=await fixture(page,{duplicates:[{kind:'candidate',id:companyId,company_name:'Rejected candidate',status:'REJECTED',match:'domain'}],approveFailures:[502]});await detail(page);
  await page.getByRole('button',{name:'Approve as lead'}).click();let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Preview lead'}).click();
  await expect(dialog.getByRole('button',{name:'Confirm and create lead'})).toBeDisabled();
  await dialog.getByLabel('I reviewed the research matches').check();await dialog.getByRole('button',{name:'Confirm and create lead'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Retry this approval');await expect(dialog.getByLabel('Lead priority')).toBeDisabled();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Approve as lead'}).click();dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Retry approval'}).click();await expect(dialog.getByRole('heading',{name:'Lead created.'})).toBeVisible();
  const approvals=calls.filter(call=>call.action==='crm-research-approve');expect(approvals).toHaveLength(2);expect(approvals[1].body).toEqual(approvals[0].body);expect(approvals[1].body.acknowledgeDuplicates).toBe(true);
});

test('Review forms and lead preview fit a mobile viewport; cancelling creates no Lead',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));const calls=await fixture(page);await page.setViewportSize({width:390,height:844});await detail(page);
  await page.getByRole('button',{name:'Edit candidate',exact:true}).click();let dialog=page.getByRole('dialog');
  await dialog.getByText('Evidence, sources and research metadata',{exact:true}).click();
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Approve as lead'}).click();dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Preview lead'}).click();await expect(dialog.getByRole('heading',{name:'Lead preview'})).toBeVisible();
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  await page.screenshot({path:'.cache/research-approval-mobile.png',fullPage:true});await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(calls.filter(call=>call.action==='crm-research-approve')).toHaveLength(0);expect(errors).toEqual([]);
});
