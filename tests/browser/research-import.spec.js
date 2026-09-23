import {test,expect} from '@playwright/test';

const valid = (row,extra={}) => ({row,candidate:{company_name:`Research company ${row}`,website:`https://research-${row}.example`,country:'SK',sources:[],field_provenance:{},research_summary:'Public research evidence.'},warnings:[],errors:[],duplicates:[],match_count:0,within:[],...extra});
const duplicate = valid(2,{duplicates:[{kind:'company',id:'11111111-1111-4111-8111-111111111111',company_name:'Existing client',website:'https://research-2.example',country:'SK',status:'CLIENT',match:'domain'},{kind:'candidate',id:'22222222-2222-4222-8222-222222222222',company_name:'Rejected research',status:'REJECTED',match:'name_country'}],match_count:2});
const invalid = {row:3,candidate:null,warnings:[],errors:[{path:'candidates[2].potential_services[0].service',code:'enum',message:'Unknown service.'}],duplicates:[],match_count:0,within:[]};
const review = rows => ({schema_version:1,count:rows.length,valid_count:rows.filter(row=>row.candidate).length,rows,hash:'reviewed-hash',previewToken:'signed-preview-token'});
const json='{"schema_version":1,"candidates":[{"company_name":"Research company"}]}';

async function fixture(page,{preview=review([valid(1)]),onPreview,onCommit,onPrompt}={}) {
  const calls=[];
  await page.route('**/api/admin?*',async route => {
    const request=route.request(),params=Object.fromEntries(new URL(request.url()).searchParams),action=params.action;
    const body=request.method()==='POST' ? request.postDataJSON() : null;
    calls.push({action,params,body});
    if (action==='me') return route.fulfill({json:{email:'research-owner@example.test'}});
    if (action==='crm-research-list') return route.fulfill({json:{items:[],total:0,page:1,pageSize:25}});
    if (action==='crm-research-import-preview') return onPreview ? onPreview(route,body,calls) : route.fulfill({json:preview});
    if (action==='crm-research-import-commit') return onCommit ? onCommit(route,body,calls) : route.fulfill({json:{imported:1,skipped:0,candidate_ids:[]}});
    if (action==='crm-research-prompt') return onPrompt ? onPrompt(route,params) : route.fulfill({json:{prompt:'Research companies. Return schema_version 1 JSON.',excluded_count:12}});
    if (action==='crm-list') return route.fulfill({json:{companies:[],total:0,page:1,pageSize:25}});
    return route.fulfill({json:{items:[],projects:[],summary:{},daily:[]}});
  });
  await page.goto('/admin/ai-research');
  await expect(page.getByRole('heading',{name:'AI Research.'})).toBeVisible();
  return calls;
}

async function openPreview(page,value=json) {
  await page.getByRole('button',{name:'Import JSON',exact:true}).click();
  await page.getByLabel('Research JSON',{exact:true}).fill(value);
  await page.getByRole('button',{name:'Preview import',exact:true}).click();
}

test('Research JSON preview separates invalid rows and defaults duplicate matches to skip',async({page}) => {
  const calls=await fixture(page,{preview:review([valid(1,{warnings:[{path:'website',message:'Website was not recorded.'}]}),duplicate,invalid,valid(4,{within:[1]})]),onCommit:(route)=>route.fulfill({json:{imported:2,skipped:1,candidate_ids:[]}})});
  await openPreview(page);
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('3 valid · 1 invalid · 2 possible duplicates');
  await expect(dialog).toContainText('Website was not recorded.');
  await expect(dialog).toContainText('Unknown service.');
  await expect(dialog).toContainText('Also matches earlier row 1');
  await expect(dialog.getByRole('link',{name:'Existing client'})).toHaveAttribute('href','/admin/leads/11111111-1111-4111-8111-111111111111');
  await expect(dialog.getByRole('link',{name:'Rejected research'})).toHaveAttribute('href','/admin/ai-research/22222222-2222-4222-8222-222222222222');
  await expect(dialog.getByLabel('Row 1 decision')).toHaveValue('import');
  await expect(dialog.getByLabel('Row 2 decision')).toHaveValue('skip');
  await expect(dialog.getByLabel('Row 4 decision')).toHaveValue('skip');
  await expect(dialog.getByLabel('Row 3 decision')).toHaveCount(0);
  await dialog.getByLabel('Row 2 decision').selectOption('keep');
  await dialog.getByRole('button',{name:'Import 2 candidates',exact:true}).click();
  await expect(dialog.getByRole('status')).toContainText('2 imported · 1 skipped. 1 invalid row was left out.');
  const commit=calls.find(call=>call.action==='crm-research-import-commit').body;
  expect(commit).toMatchObject({json,previewToken:'signed-preview-token',confirm:'import',choices:[{row:1,decision:'import'},{row:2,decision:'keep'},{row:4,decision:'skip'}]});
  expect(commit.batchId).toMatch(/^[0-9a-f-]{36}$/);
  await dialog.getByRole('button',{name:'Done',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(()=>calls.filter(call=>call.action==='crm-research-list').length).toBe(2);
});

test('Research JSON upload keeps invalid input and enforces UTF-8 limits before preview requests',async({page}) => {
  const calls=await fixture(page,{onPreview:route=>route.fulfill({status:400,json:{error:'Research JSON is not valid JSON.'}})});
  await page.getByRole('button',{name:'Import JSON',exact:true}).click();
  const area=page.getByLabel('Research JSON',{exact:true});
  await page.getByLabel('JSON file',{exact:true}).setInputFiles({name:'research.json',mimeType:'application/json',buffer:Buffer.from('{broken JSON')});
  await expect(area).toHaveValue('{broken JSON');
  await page.getByRole('button',{name:'Preview import',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Research JSON is not valid JSON.');
  await expect(area).toHaveValue('{broken JSON');
  await area.fill('ž'.repeat(250_001));
  await page.getByRole('button',{name:'Preview import',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('exceeds 500,000 bytes');
  expect(calls.filter(call=>call.action==='crm-research-import-preview')).toHaveLength(1);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Import JSON',exact:true})).toBeFocused();
});

test('Editing JSON invalidates reviewed data and stale previews cannot restore it or another route',async({page}) => {
  let fulfill;
  await fixture(page,{onPreview:route=>new Promise(resolve=>{fulfill=async()=>{await route.fulfill({json:review([valid(1)])});resolve();};})});
  await openPreview(page);
  await expect(page.getByRole('dialog')).toContainText('Validating candidates');
  await page.getByLabel('Research JSON',{exact:true}).fill('{"changed":true}');
  await fulfill();
  await expect(page.getByRole('button',{name:'Preview import',exact:true})).toBeEnabled();
  await expect(page.locator('.research-import-row')).toHaveCount(0);
  await page.getByRole('button',{name:'Preview import',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Validating candidates');
  await fulfill();
  await expect(page.locator('.research-import-row')).toHaveCount(1);
  await page.getByLabel('Research JSON',{exact:true}).fill(json);
  await expect(page.locator('.research-import-row')).toHaveCount(0);
  await page.getByRole('button',{name:'Preview import',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Validating candidates');
  await page.evaluate(()=>{history.pushState(null,'','/admin/leads');dispatchEvent(new PopStateEvent('popstate'));});
  await fulfill();
  await expect(page.getByRole('heading',{name:'Leads.'})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.research-import-row')).toHaveCount(0);
});

test('Ambiguous import errors retry the unchanged batch and render the replay result',async({page}) => {
  let commits=0;
  const calls=await fixture(page,{onCommit:route=>++commits===1 ? route.abort('failed') : route.fulfill({json:{imported:1,skipped:0,candidate_ids:[],replayed:true}})});
  await openPreview(page);
  await page.getByRole('button',{name:'Import 1 candidate',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Retry this same import');
  await expect(page.getByLabel('Research JSON',{exact:true})).toBeDisabled();
  await expect(page.getByLabel('Row 1 decision')).toBeDisabled();
  await expect(page.getByRole('button',{name:'Preview import',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Retry import',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('No candidates were added again.');
  const bodies=calls.filter(call=>call.action==='crm-research-import-commit').map(call=>call.body);
  expect(bodies).toHaveLength(2);expect(bodies[1]).toEqual(bodies[0]);
});

test('Changed duplicates require a fresh preview without discarding JSON',async({page}) => {
  const calls=await fixture(page,{onCommit:route=>route.fulfill({status:409,json:{error:'Duplicate matches changed.'}})});
  await openPreview(page);
  await page.getByRole('button',{name:'Import 1 candidate',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Preview again');
  await expect(page.getByLabel('Research JSON',{exact:true})).toHaveValue(json);
  await expect(page.getByLabel('Research JSON',{exact:true})).toBeEnabled();
  await expect(page.locator('.research-import-row')).toHaveCount(0);
  await page.getByRole('button',{name:'Preview import',exact:true}).click();
  await expect(page.locator('.research-import-row')).toHaveCount(1);
  expect(calls.filter(call=>call.action==='crm-research-import-preview')).toHaveLength(2);
});

test('Research prompt profiles refresh exclusions and offer clipboard fallback',async({page}) => {
  const calls=await fixture(page,{onPrompt:(route,params)=>route.fulfill({json:{prompt:`Research ${params.profile || 'all companies'}. Exclude example.test.`,excluded_count:1}})});
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('Clipboard unavailable'))}}));
  await page.getByRole('button',{name:'Research prompt',exact:true}).click();
  const dialog=page.getByRole('dialog'),area=dialog.getByLabel('Prompt to copy');
  await expect(area).toHaveValue('Research all companies. Exclude example.test.');
  await expect(dialog.getByRole('status')).toContainText('1 existing domain');
  await dialog.getByLabel('Ideal client profile').selectOption('lighting-brand');
  await expect(area).toHaveValue('Research lighting-brand. Exclude example.test.');
  await dialog.getByRole('button',{name:'Copy prompt',exact:true}).click();
  await expect(dialog.getByRole('status')).toContainText('Automatic copy is unavailable');
  await expect(area).toBeFocused();
  expect(await area.evaluate(element=>element.selectionEnd-element.selectionStart)).toBeGreaterThan(0);
  await expect(dialog.getByRole('link',{name:'Open ChatGPT',exact:true})).toHaveAttribute('href','https://chatgpt.com/');
  expect(calls.filter(call=>call.action==='crm-research-prompt').at(-1).params.profile).toBe('lighting-brand');
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});

test('Mobile import review escapes research content and keeps evidence inspectable',async({page}) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await fixture(page,{preview:review([valid(1,{candidate:{company_name:'Company <img src=x onerror="window.injected=true">',website:'https://research.example',research_summary:'<script>window.injected=true</script>',sources:[{url:'javascript:alert(1)',title:'<b>Source</b>'}],field_provenance:{company_name:{status:'VERIFIED',evidence:'Evidence is retained in the full preview.'}}},warnings:[{message:'Unknown category <img src=x onerror="window.injected=true">'}]})])});
  await openPreview(page);
  await page.getByText('Review all candidate data, evidence and sources',{exact:true}).click();
  await expect(page.locator('.research-import-json')).toContainText('Evidence is retained in the full preview.');
  await expect(page.locator('.research-import-json')).toContainText('javascript:alert(1)');
  await expect(page.getByRole('dialog').locator('img,script')).toHaveCount(0);
  expect(await page.evaluate(()=>window.injected)).toBeUndefined();
  expect(await page.getByRole('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  await page.screenshot({path:'.cache/research-import-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});
