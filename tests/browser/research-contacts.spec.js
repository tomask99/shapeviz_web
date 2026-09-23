import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const id='22222222-2222-4222-8222-222222222222',companyId='33333333-3333-4333-8333-333333333333',proposalId='44444444-4444-4444-8444-444444444444',contactId='55555555-5555-4555-8555-555555555555';
const example=JSON.parse(await readFile(new URL('../../docs/examples/research-candidates.v1.json',import.meta.url),'utf8')).candidates[0];
const candidate={...example,id,version:2,company_name:'Reference Furniture',research_status:'NEEDS_REVIEW',manual_fields:[],created_at:'2026-09-23T08:00:00Z',updated_at:'2026-09-23T08:00:00Z'};
const source={url:'https://furniture.example/team',title:'Public team page',source_type:'Contact Page',retrieved_at:null,supports:['full_name','job_title','email']};
function contact(name='Alice Example',inferred=true){const value={full_name:name,job_title:'Brand manager',email:'alice@furniture.example',phone:'',linkedin:'',confidence:'HIGH',sources:[source]};return {...value,field_provenance:Object.fromEntries(['full_name','job_title','email','phone','linkedin'].map(key=>[key,{status:value[key]?key==='job_title'&&inferred?'INFERRED':'VERIFIED':'UNKNOWN',confidence:value[key]?'HIGH':null,evidence:value[key]?`The public source records ${key}.`:'',source_urls:value[key]?[source.url]:[]}]))};}
const proposal=(extra={})=>({id:proposalId,proposal:contact(),reference_identity:{company_name:candidate.company_name,website:candidate.website,country:candidate.country},status:'PROPOSED',version:1,created_contact_id:null,created_company_id:null,duplicates:[],stale_reference:false,...extra});
const json=JSON.stringify({schema_version:1,candidate_id:id,contacts:[contact()]});
const row=(number,value=contact(),extra={})=>({row:number,contact:value,errors:[],warnings:[],duplicates:[],...extra});

async function fixture(page,{status='NEEDS_REVIEW',items=[],rows=[row(1)],saveFailures=[],decisionFailures=[],listFailures=0,listDelay=0,previewDelay=0,contextCompanyName='Approved CRM company',existingContact=null}={}) {
  const calls=[];let stored=structuredClone(items),contacts=existingContact?[existingContact]:[],lifecycle=status;
  await page.route('**/api/admin?*',async route=>{
    const request=route.request(),params=Object.fromEntries(new URL(request.url()).searchParams),action=params.action,body=request.postDataJSON();calls.push({action,body,params,method:request.method()});
    if(action==='me')return route.fulfill({json:{email:'owner@example.test'}});
    if(action==='crm-research-detail')return route.fulfill({json:{candidate:{...candidate,research_status:lifecycle,approved_company_id:lifecycle==='APPROVED'?companyId:null},events:[]}});
    if(action==='crm-research-contacts'){
      if(listDelay)await new Promise(resolve=>setTimeout(resolve,listDelay));if(listFailures-->0)return route.fulfill({status:502,json:{error:'Contact research temporarily unavailable.'}});
      return route.fulfill({json:{candidate:{...candidate,research_status:lifecycle,approved_company_id:lifecycle==='APPROVED'?companyId:null},company:lifecycle==='APPROVED'?{id:companyId,company_name:contextCompanyName,archived_at:null}:null,items:stored,can_research:lifecycle!=='REJECTED',can_create:lifecycle==='APPROVED'}});
    }
    if(action==='crm-research-contacts-prompt')return route.fulfill({json:{prompt:'Research verified public professional contacts. Return independently cited contact fields.',candidate:{id,company_name:candidate.company_name,version:2}}});
    if(action==='crm-research-contacts-preview'){
      if(previewDelay)await new Promise(resolve=>setTimeout(resolve,previewDelay));let parsed;try{parsed=JSON.parse(body.json);}catch{return route.fulfill({status:400,json:{error:'Contact research must be valid JSON.'}});}
      const resultRows=parsed.contacts?.length?rows:[];return route.fulfill({json:{candidate,rows:resultRows,valid_count:resultRows.filter(item=>item.contact&&!item.errors.length).length,count:resultRows.length,reviewToken:'contacts-preview-token'}});
    }
    if(action==='crm-research-contacts-commit'){
      const failure=saveFailures.shift();if(failure)return route.fulfill({status:failure,json:{error:failure===409?'The reference changed since preview.':'Contact proposal response interrupted.'}});
      const additions=rows.filter(item=>body.selected.includes(item.row)).map((item,index)=>proposal({id:index?proposalId.slice(0,-1)+index:proposalId,proposal:item.contact}));stored.push(...additions);return route.fulfill({json:{saved:additions.length,skipped:rows.length-additions.length,ids:additions.map(item=>item.id)}});
    }
    if(action==='crm-research-contact-decide'){
      const failure=decisionFailures.shift();if(failure)return route.fulfill({status:failure,json:{error:failure===409?'A matching contact was added after review.':'Contact decision response interrupted.'}});
      const item=stored.find(item=>item.id===body.id);item.version++;item.status=body.decision==='create'?'CREATED':'DISMISSED';if(body.decision==='create'){item.created_contact_id=contactId;item.created_company_id=companyId;contacts.push({id:contactId,company_id:companyId,version:1,full_name:'Manually changed display name',job_title:'',email:item.proposal.email,primary_contact:false,research_evidence:{proposal_id:item.id,candidate_id:id,reference_identity:item.reference_identity,proposal:item.proposal}});}
      return route.fulfill({json:{id:item.id,status:item.status,version:item.version,contact_id:item.created_contact_id,company_id:item.created_company_id}});
    }
    if(action==='crm-detail')return route.fulfill({json:{company:{id:companyId,company_name:contextCompanyName,country:'CZ',services:[],pipeline_status:'NEW_LEAD',priority:'MEDIUM',lead_source:'AI Research',created_at:candidate.created_at,updated_at:candidate.updated_at}}});
    if(action==='crm-contacts')return route.fulfill({json:{items:contacts,hasMore:false}});
    if(action==='crm-research-company')return route.fulfill({json:{candidate:null}});
    return route.fulfill({json:{items:[],companies:[],projects:[],total:0,page:1,pageSize:25,summary:{},daily:[]}});
  });
  return {calls,setStatus(value){lifecycle=value;}};
}
async function open(page){await page.goto('/admin/ai-research/'+id);await page.getByRole('button',{name:'Find contacts',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Saved contact proposals'})).toBeVisible();return dialog;}
async function preview(dialog,value=json){await dialog.getByLabel('Contact research JSON',{exact:true}).fill(value);await dialog.getByRole('button',{name:'Preview contacts',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Review contact evidence'})).toBeVisible();}

test('Contact prompt and preview stay read-only; only selected nonduplicate proposals are saved',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.contactPromptCopied=text;}}}));
  const {calls}=await fixture(page,{rows:[row(1),row(2,contact('Existing Person'),{duplicates:[{kind:'contact',id:contactId,full_name:'Existing Person',email:'existing@example.test'}]}),row(3,null,{errors:[{path:'contacts[2].full_name',message:'A verified name needs public evidence.'}]})]}),dialog=await open(page);
  await expect(dialog).toContainText('Approve this candidate as a Lead before creating CRM contacts');await dialog.getByRole('button',{name:'Prepare prompt'}).click();await expect(dialog.getByLabel('Contact research prompt')).toHaveValue(/verified public professional/);await expect(dialog.getByLabel('Contact research prompt')).toHaveAttribute('readonly','');await dialog.getByRole('button',{name:'Copy prompt'}).click();expect(await page.evaluate(()=>window.contactPromptCopied)).toContain('independently cited');
  await preview(dialog);await expect(dialog.locator('[data-contact-select]:checked')).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Save 0 selected proposals'})).toBeDisabled();await expect(dialog.locator('[data-contact-row="2"] input')).toHaveCount(0);await expect(dialog).toContainText('A verified name needs public evidence');await expect(dialog).toContainText('The role is inferred');
  expect(calls.filter(call=>call.action==='crm-research-contacts-commit')).toHaveLength(0);await dialog.getByLabel('Save Alice Example proposal').check();await dialog.getByRole('button',{name:'Save 1 selected proposal',exact:true}).click();await expect(dialog.locator('[data-contact-status]')).toContainText('CRM contacts were not created');
  const saved=dialog.locator('[data-contact-proposal]');await expect(saved).toContainText('Alice Example');await expect(saved.getByRole('button',{name:'Create CRM contact'})).toBeDisabled();expect(calls.find(call=>call.action==='crm-research-contacts-commit').body).toMatchObject({id,json,selected:[1],confirm:'save_contacts'});expect(calls.some(call=>call.action==='crm-research-contact-decide')).toBe(false);
});

test('Approved proposals require explicit creation confirmation, preserve inferred role evidence and expose original CRM research',async({page})=>{
  const {calls}=await fixture(page,{status:'APPROVED',items:[proposal()]}),dialog=await open(page),saved=dialog.locator('[data-contact-proposal]');
  await saved.getByRole('button',{name:'Create CRM contact'}).click();await expect(dialog.locator('[data-contact-confirmation]')).toContainText('Create this contact for Approved CRM company');await expect(dialog.locator('[data-contact-confirmation]')).toContainText('evidence was recorded for Reference Furniture');await expect(dialog.locator('[data-contact-confirmation]')).toContainText('inferred role will not be copied');expect(calls.filter(call=>call.action==='crm-research-contact-decide')).toHaveLength(0);
  await dialog.getByRole('button',{name:'Cancel decision'}).click();await expect(dialog.getByRole('button',{name:'Confirm create contact'})).toHaveCount(0);await saved.getByRole('button',{name:'Create CRM contact'}).click();await dialog.getByRole('button',{name:'Confirm create contact'}).click();await expect(saved).toContainText('Created');await expect(dialog.locator('[data-contact-status]')).toHaveText('CRM contact created.');
  const decision=calls.find(call=>call.action==='crm-research-contact-decide').body;expect(decision).toMatchObject({id:proposalId,version:1,decision:'create',confirm:'create_contact'});expect(Object.keys(decision).sort()).toEqual(['id','version','operationId','decision','confirm'].sort());
  await saved.getByRole('link',{name:'Open company contacts'}).click();await expect(page.getByRole('heading',{name:'Manually changed display name'})).toBeVisible();const snapshot=page.locator('#crm-related-panel .research-contact-snapshot');await snapshot.getByText('Original reviewed research',{exact:true}).click();await expect(snapshot).toContainText('Later manual changes to this contact may differ');await expect(snapshot).toContainText('Alice Example');await expect(snapshot).toContainText('Brand manager');await expect(snapshot).toContainText('Inferred');await expect(snapshot.getByRole('link',{name:'Open original research candidate'})).toHaveAttribute('href','/admin/ai-research/'+id);
});

test('Ambiguous proposal writes preserve JSON, selection and operation across dialog reopening',async({page})=>{
  const {calls}=await fixture(page,{saveFailures:[502]});let dialog=await open(page);await preview(dialog);await dialog.getByLabel('Save Alice Example proposal').check();await dialog.getByRole('button',{name:'Save 1 selected proposal'}).click();await expect(dialog.locator('[data-contact-error]')).toContainText('Retry the same request');await expect(dialog.getByLabel('Contact research JSON')).toBeDisabled();
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Find contacts',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Save Alice Example proposal')).toBeChecked();await expect(dialog.getByRole('button',{name:'Retry last request'})).toBeEnabled();await dialog.getByRole('button',{name:'Retry last request'}).click();await expect(dialog.locator('[data-contact-proposal]')).toContainText('Alice Example');
  const writes=calls.filter(call=>call.action==='crm-research-contacts-commit');expect(writes).toHaveLength(2);expect(writes[1].body).toEqual(writes[0].body);
});

test('Ambiguous creation retries the exact decision and dismissal preserves proposal history',async({page})=>{
  const second=proposal({id:proposalId.slice(0,-1)+'5',proposal:contact('Dismissed Person')});const {calls}=await fixture(page,{status:'APPROVED',items:[proposal(),second],decisionFailures:[502]});let dialog=await open(page);
  await dialog.locator(`[data-contact-proposal="${proposalId}"]`).getByRole('button',{name:'Create CRM contact'}).click();await dialog.getByRole('button',{name:'Confirm create contact'}).click();await expect(dialog.locator('[data-contact-error]')).toContainText('Retry the same request');await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Find contacts'}).click();dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'Retry last request'})).toBeEnabled();await dialog.getByRole('button',{name:'Retry last request'}).click();await expect(dialog.locator(`[data-contact-proposal="${proposalId}"]`)).toContainText('Created');
  const decisions=calls.filter(call=>call.action==='crm-research-contact-decide');expect(decisions[1].body).toEqual(decisions[0].body);
  const dismiss=dialog.locator(`[data-contact-proposal="${second.id}"]`);await dismiss.getByRole('button',{name:'Dismiss proposal'}).click();await dialog.getByRole('button',{name:'Confirm dismiss proposal'}).click();await expect(dismiss).toContainText('Dismissed');await expect(dismiss.getByRole('button',{name:'Create CRM contact'})).toHaveCount(0);await expect(dismiss).toContainText('public source records full_name');
});

test('Stale previews retain JSON and current duplicates or changed identity disable contact creation',async({page})=>{
  const {calls}=await fixture(page,{status:'APPROVED',items:[proposal({duplicates:[{id:contactId,full_name:'Existing Alice',email:'alice@furniture.example'}]}),proposal({id:proposalId.slice(0,-1)+'6',proposal:contact('Stale Person'),stale_reference:true})],saveFailures:[409]}),dialog=await open(page);
  await expect(dialog.locator('[data-contact-proposal]').first().getByRole('button',{name:'Create CRM contact'})).toBeDisabled();await expect(dialog.locator('[data-contact-proposal]').last()).toContainText('company identity changed');await expect(dialog.locator('[data-contact-proposal]').last().getByRole('button',{name:'Create CRM contact'})).toBeDisabled();
  await preview(dialog);await dialog.getByLabel('Save Alice Example proposal').check();await dialog.getByRole('button',{name:'Save 1 selected proposal'}).click();await expect(dialog.locator('[data-contact-error]')).toContainText('Your JSON has been kept');await expect(dialog.getByLabel('Contact research JSON')).toHaveValue(json);await expect(dialog.getByLabel('Contact research JSON')).toBeEnabled();await expect(dialog.locator('[data-contact-select]')).toHaveCount(0);await dialog.getByRole('button',{name:'Preview contacts'}).click();await expect(dialog.getByLabel('Save Alice Example proposal')).not.toBeChecked();expect(calls.filter(call=>call.action==='crm-research-contacts-commit')).toHaveLength(1);
});

test('Rejected candidate contact history is read-only and empty results create no selectable proposals',async({page})=>{
  const {calls}=await fixture(page,{status:'REJECTED',items:[proposal()]});let dialog=await open(page);await expect(dialog).toContainText('read-only contact history');await expect(dialog.getByRole('button',{name:'Prepare prompt'})).not.toBeVisible();await expect(dialog.getByRole('button',{name:'Create CRM contact'})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Dismiss proposal'})).toHaveCount(0);expect(calls.every(call=>call.method==='GET')).toBe(true);
  await page.unroute('**/api/admin?*');await fixture(page);dialog=await open(page);await preview(dialog,JSON.stringify({schema_version:1,candidate_id:id,contacts:[]}));await expect(dialog).toContainText('No public contacts were proposed');await expect(dialog.locator('[data-contact-select]')).toHaveCount(0);
});

test('Load errors retry; invalid and oversized contact JSON stays available without writes',async({page})=>{
  const {calls}=await fixture(page,{listFailures:1});await page.goto('/admin/ai-research/'+id);await page.getByRole('button',{name:'Find contacts'}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Contact research temporarily unavailable');await dialog.getByRole('button',{name:'Retry contact research'}).click();await expect(dialog.getByRole('heading',{name:'Saved contact proposals'})).toBeVisible();
  await dialog.getByLabel('Contact research JSON').fill('{invalid');await dialog.getByRole('button',{name:'Preview contacts'}).click();await expect(dialog.locator('[data-contact-error]')).toContainText('must be valid JSON');await expect(dialog.getByLabel('Contact research JSON')).toHaveValue('{invalid');
  await dialog.getByLabel('Contact research file').setInputFiles({name:'large.json',mimeType:'application/json',buffer:Buffer.alloc(200001,'x')});await expect(dialog.locator('[data-contact-error]')).toContainText('exceeds 200,000 bytes');expect(calls.filter(call=>call.action==='crm-research-contacts-preview')).toHaveLength(1);expect(calls.some(call=>call.action==='crm-research-contacts-commit')).toBe(false);
});

test('Delayed contact previews cannot restore edited JSON or overwrite another route',async({page})=>{
  await fixture(page,{previewDelay:350});const dialog=await open(page);await dialog.getByLabel('Contact research JSON').fill(json);const response=page.waitForResponse(response=>response.url().includes('action=crm-research-contacts-preview'));await dialog.getByRole('button',{name:'Preview contacts'}).click();await dialog.getByLabel('Contact research JSON').fill('{different draft');await response;await expect(dialog.locator('[data-contact-select]')).toHaveCount(0);await expect(dialog.getByLabel('Contact research JSON')).toHaveValue('{different draft');
  await dialog.getByLabel('Contact research JSON').fill(json);const late=page.waitForResponse(response=>response.url().includes('action=crm-research-contacts-preview'));await dialog.getByRole('button',{name:'Preview contacts'}).click();await page.evaluate(()=>{history.pushState(null,'','/admin/leads');dispatchEvent(new PopStateEvent('popstate'));});await late;await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Leads.'})).toBeVisible();
});

test('Contact evidence and unsafe source links stay escaped and readable on mobile',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));const unsafe=contact('<img src=x onerror="window.contactInjected=true">');unsafe.sources=[{...source,url:'javascript:alert(1)',title:'Unsafe source'}];unsafe.linkedin='javascript:alert(1)';unsafe.field_provenance.full_name={status:'VERIFIED',confidence:'HIGH',evidence:'<script>window.contactInjected=true</script>',source_urls:['javascript:alert(1)']};
  await fixture(page,{rows:[row(1,unsafe)]});await page.setViewportSize({width:390,height:844});const dialog=await open(page);await preview(dialog);await expect(dialog.locator('[data-contact-row]')).toContainText('<img src=x');await expect(dialog.locator('img,script,a[href^="javascript:"]')).toHaveCount(0);expect(await page.evaluate(()=>window.contactInjected)).toBeUndefined();expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);await page.screenshot({path:'.cache/research-contacts-mobile.png'});expect(errors).toEqual([]);
});
