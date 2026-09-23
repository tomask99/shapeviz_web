import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const candidateId='22222222-2222-4222-8222-222222222222',companyId='33333333-3333-4333-8333-333333333333';
const example=JSON.parse(await readFile(new URL('../../docs/examples/research-candidates.v1.json',import.meta.url),'utf8')).candidates[0];
const candidate={...example,id:candidateId,version:2,company_name:'Reference Furniture',country:'CZ',research_status:'NEEDS_REVIEW',manual_fields:[],created_at:'2026-09-23T08:00:00Z',updated_at:'2026-09-23T08:00:00Z'};
const company={id:companyId,version:3,company_name:'Reference Company',country:'AT',services:['Product CGI'],pipeline_status:'NEW_LEAD',priority:'MEDIUM',lead_source:'Google',created_at:candidate.created_at,updated_at:candidate.updated_at};
const importJSON=JSON.stringify({schema_version:1,candidates:[{company_name:'Similar company',source_origin:'SIMILAR_COMPANY'}]});

async function fixture(page,{candidateStatus='NEEDS_REVIEW',archived=false,client=false,name,onPrompt}={}) {
  const calls=[],record={...candidate,research_status:candidateStatus,...(name?{company_name:name}:{})},business={...company,pipeline_status:client?'WON':'NEW_LEAD',archived_at:archived?candidate.created_at:null,...(name?{company_name:name}:{})};
  await page.route('**/api/admin?*',async route=>{
    const request=route.request(),params=Object.fromEntries(new URL(request.url()).searchParams),action=params.action,body=request.postDataJSON();calls.push({action,params,body,method:request.method()});
    if(action==='me')return route.fulfill({json:{email:'owner@example.test'}});
    if(action==='crm-research-detail')return route.fulfill({json:{candidate:record,events:[]}});
    if(action==='crm-detail')return route.fulfill({json:{company:business}});
    if(action==='crm-research-company')return route.fulfill({json:{candidate:null}});
    if(action==='crm-client')return route.fulfill({json:{item:client?{id:'client1',company_id:companyId,version:1,active:true,account_notes:'',client_since:'2026-09-23'}:null}});
    if(action==='crm-research-similar-prompt'){
      if(onPrompt)return onPrompt(route,params,calls);
      const reference=params.referenceType==='candidate'?{type:'candidate',id:candidateId,name:record.company_name,status:record.research_status,version:record.version}:{type:'company',id:companyId,name:business.company_name,status:archived?'ARCHIVED':business.pipeline_status,version:business.version};
      return route.fulfill({json:{prompt:`Find ${params.count} companies similar to ${reference.name} in ${params.countries}. Exclude all recorded domains. Return schema_version 1 candidates with source_origin SIMILAR_COMPANY.`,excluded_count:12,reference,countries:params.countries.split(','),count:Number(params.count)}});
    }
    if(action==='crm-research-import-preview')return route.fulfill({json:{schema_version:1,count:1,valid_count:1,previewToken:'import-preview-token',rows:[{row:1,candidate:{company_name:'Similar company',website:'https://similar.example',country:'AT',source_origin:'SIMILAR_COMPANY'},warnings:[],errors:[],duplicates:[{kind:'company',id:companyId,company_name:'Existing company',status:'WON',match:'domain'}],match_count:1,within:[]}]}});
    if(action==='crm-research-import-commit')return route.fulfill({json:{imported:1,skipped:0,candidate_ids:[]}});
    return route.fulfill({json:{items:[],companies:[],projects:[],total:0,page:1,pageSize:25,summary:{},daily:[]}});
  });
  return calls;
}
async function open(page,type='candidate') {await page.goto(type==='candidate'?'/admin/ai-research/'+candidateId:'/admin/leads/'+companyId);await page.getByRole('button',{name:'Find similar companies',exact:true}).click();return page.getByRole('dialog');}

test('Similar research uses the reference, target markets and count in a read-only copyable prompt',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.similarCopied=text;}}}));
  const calls=await fixture(page),dialog=await open(page);await expect(dialog.getByLabel('Target country codes')).toHaveValue('CZ');await expect(dialog.getByLabel('Number of companies')).toHaveValue('10');
  await dialog.getByLabel('Target country codes').fill(' cz, at ');await dialog.getByLabel('Number of companies').fill('7');await dialog.getByRole('button',{name:'Prepare prompt'}).click();
  await expect(dialog.getByLabel('Similar-company research prompt')).toHaveValue(/Find 7 companies similar to Reference Furniture in CZ,AT/);await expect(dialog.getByLabel('Similar-company research prompt')).toHaveAttribute('readonly','');await expect(dialog.getByRole('status')).toContainText('12 existing domains included for exclusion');
  expect(calls.find(call=>call.action==='crm-research-similar-prompt')).toMatchObject({method:'GET',body:null,params:{referenceType:'candidate',referenceId:candidateId,countries:'CZ,AT',count:'7'}});
  await dialog.getByRole('button',{name:'Copy prompt'}).click();await expect(dialog.getByRole('status')).toContainText('Prompt copied');expect(await page.evaluate(()=>window.similarCopied)).toContain('SIMILAR_COMPANY');
  await expect(dialog.getByRole('link',{name:'Open ChatGPT'})).toHaveAttribute('href','https://chatgpt.com/');await expect(dialog.getByRole('link',{name:'Open ChatGPT'})).toHaveAttribute('rel','noopener noreferrer');expect(calls.every(call=>call.method==='GET')).toBe(true);
  await dialog.getByLabel('Number of companies').fill('8');await expect(dialog.getByLabel('Similar-company research prompt')).toHaveValue('');await expect(dialog.getByRole('button',{name:'Copy prompt'})).toBeDisabled();
});

for(const entry of ['candidate','company','client'])test(`${entry} discovery hands off to the existing reviewed importer with duplicate decisions intact`,async({page})=>{
  const calls=await fixture(page,{client:entry==='client'});let dialog=await open(page,entry==='candidate'?'candidate':'company');
  if(entry!=='candidate')await expect(dialog.getByLabel('Target country codes')).toHaveValue('AT');
  await dialog.getByRole('button',{name:'Prepare prompt'}).click();await expect(dialog.getByLabel('Similar-company research prompt')).not.toHaveValue('');
  expect(calls.find(call=>call.action==='crm-research-similar-prompt').params.referenceType).toBe(entry==='candidate'?'candidate':'company');
  await dialog.getByRole('button',{name:'Import research JSON'}).click();dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Import research JSON.'})).toBeVisible();await expect(dialog.getByLabel('Similar-company research prompt')).toHaveCount(0);
  await dialog.getByLabel('Research JSON',{exact:true}).fill(importJSON);await dialog.getByRole('button',{name:'Preview import'}).click();await expect(dialog.getByLabel('Row 1 decision')).toHaveValue('skip');await expect(dialog.getByRole('link',{name:'Existing company'})).toHaveAttribute('href','/admin/leads/'+companyId);
  expect(calls.filter(call=>call.action==='crm-research-import-commit')).toHaveLength(0);await dialog.getByLabel('Row 1 decision').selectOption('keep');await dialog.getByRole('button',{name:'Import 1 candidate',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('Research import complete.');
  const commit=calls.find(call=>call.action==='crm-research-import-commit').body;expect(JSON.parse(commit.json).candidates[0].source_origin).toBe('SIMILAR_COMPANY');expect(commit.choices).toEqual([{row:1,decision:'keep'}]);
  await dialog.getByRole('button',{name:'Done',exact:true}).click();await expect(dialog).toHaveCount(0);
  if(entry!=='candidate'){await expect(page.locator('.crm-company-similar')).toBeVisible();await expect(page.getByRole('link',{name:'Open Research inbox'})).toHaveAttribute('href','/admin/ai-research');}
  expect(calls.some(call=>['crm-create','crm-research-approve','crm-research-save','crm-research-refresh-commit'].includes(call.action))).toBe(false);
});

for(const state of ['REJECTED','APPROVED','ARCHIVED'])test(`${state} references allow read-only discovery while preserving their lifecycle`,async({page})=>{
  const calls=await fixture(page,{candidateStatus:state==='ARCHIVED'?'NEEDS_REVIEW':state,archived:state==='ARCHIVED'}),dialog=await open(page,state==='ARCHIVED'?'company':'candidate');
  await dialog.getByRole('button',{name:'Prepare prompt'}).click();await expect(dialog.getByLabel('Similar-company research prompt')).not.toHaveValue('');
  if(state!=='APPROVED')await expect(dialog.locator('[data-similar-reference-note]')).toContainText('not automatically an ideal client');
  await dialog.getByRole('button',{name:'Close',exact:true}).click();expect(calls.every(call=>call.method==='GET')).toBe(true);
  if(state==='REJECTED')await expect(page.getByRole('button',{name:'Restore to review'})).toBeVisible();if(state==='APPROVED')await expect(page.getByRole('button',{name:'Edit candidate'})).toHaveCount(0);
});

test('Invalid markets and counts stay local; server failures preserve choices and can be retried',async({page})=>{
  let attempts=0;const calls=await fixture(page,{onPrompt:(route,params)=>++attempts===1?route.fulfill({status:503,json:{error:'Reference temporarily unavailable.'}}):route.fulfill({json:{prompt:'A recovered prompt.',excluded_count:0,reference:{name:'Freshly saved company',status:'NEEDS_REVIEW'},countries:params.countries.split(','),count:Number(params.count)}})}),dialog=await open(page),countries=dialog.getByLabel('Target country codes'),count=dialog.getByLabel('Number of companies'),prepare=dialog.getByRole('button',{name:'Prepare prompt'});
  for(const invalid of ['', 'CZ,CZ','Czech Republic','CZ,SK,AT,DE,FR,IT,ES,PT,BE,NL,DK']){await countries.fill(invalid);await prepare.click();await expect(dialog.getByRole('alert')).toContainText('distinct two-letter country codes');}
  await countries.fill('CZ,AT');for(const invalid of ['0','21','1.5']){await count.fill(invalid);await prepare.click();await expect(dialog.getByRole('alert')).toContainText('between 1 and 20');}expect(calls.filter(call=>call.action==='crm-research-similar-prompt')).toHaveLength(0);
  await count.fill('4');await prepare.click();await expect(dialog.getByRole('alert')).toContainText('Reference temporarily unavailable.');await expect(countries).toHaveValue('CZ,AT');await expect(count).toHaveValue('4');
  await prepare.click();await expect(dialog.getByLabel('Similar-company research prompt')).toHaveValue('A recovered prompt.');await expect(dialog.locator('[data-similar-reference]')).toHaveText('Freshly saved company');
});

test('Changed choices and navigation discard delayed prompts, and clipboard fallback selects the current prompt',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Clipboard unavailable');}}}));
  await fixture(page,{onPrompt:async(route,params)=>{await new Promise(resolve=>setTimeout(resolve,350));return route.fulfill({json:{prompt:'Prompt for '+params.countries,excluded_count:2,reference:{name:'Latest reference',status:'NEEDS_REVIEW'},countries:params.countries.split(','),count:Number(params.count)}});}});
  let dialog=await open(page),countries=dialog.getByLabel('Target country codes');const first=page.waitForResponse(response=>response.url().includes('action=crm-research-similar-prompt'));await dialog.getByRole('button',{name:'Prepare prompt'}).click();await countries.fill('SK');await first;await expect(dialog.getByLabel('Similar-company research prompt')).toHaveValue('');await expect(dialog.getByRole('button',{name:'Copy prompt'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Prepare prompt'}).click();await expect(dialog.getByLabel('Similar-company research prompt')).toHaveValue('Prompt for SK');await dialog.getByRole('button',{name:'Copy prompt'}).click();await expect(dialog.getByRole('status')).toContainText('Automatic copy is unavailable');const area=dialog.getByLabel('Similar-company research prompt');await expect(area).toBeFocused();expect(await area.evaluate(element=>element.selectionEnd-element.selectionStart)).toBeGreaterThan(0);
  const late=page.waitForResponse(response=>response.url().includes('action=crm-research-similar-prompt'));await dialog.getByRole('button',{name:'Prepare prompt'}).click();await page.evaluate(()=>{history.pushState(null,'','/admin/leads');dispatchEvent(new PopStateEvent('popstate'));});await late;await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Leads.'})).toBeVisible();
  dialog=await open(page,'company');await page.evaluate(()=>document.querySelector('[data-tab="contacts"]').click());await expect(dialog).toHaveCount(0);await expect(page.getByRole('tab',{name:'Contacts',exact:true})).toHaveAttribute('aria-selected','true');
});

test('Reference names and returned prompts stay escaped and the shared dialog fits mobile',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));const unsafe='Reference <img src=x onerror="window.similarInjected=true">';await fixture(page,{name:unsafe});await page.setViewportSize({width:390,height:844});const dialog=await open(page,'company');
  await expect(dialog.locator('[data-similar-reference]')).toHaveText(unsafe);await dialog.getByRole('button',{name:'Prepare prompt'}).click();await expect(dialog.getByLabel('Similar-company research prompt')).toHaveValue(new RegExp('Reference <img'));
  await expect(dialog.locator('img,script')).toHaveCount(0);expect(await page.evaluate(()=>window.similarInjected)).toBeUndefined();expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);await page.screenshot({path:'.cache/research-similar-mobile.png'});expect(errors).toEqual([]);
});
