import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const id='22222222-2222-4222-8222-222222222222';
const example=JSON.parse(await readFile(new URL('../../docs/examples/research-candidates.v1.json',import.meta.url),'utf8')).candidates[0];
const initial={...example,id,company_name:'Example Furniture',version:3,research_status:'NEEDS_REVIEW',manual_fields:['fit','fit_reason'],normalized_domain:'furniture.example',created_at:'2026-09-23T08:00:00Z',updated_at:'2026-09-23T08:00:00Z'};
const result=(mode='deeper')=>({schema_version:1,candidate_id:id,base_version:3,mode,candidate:{...example,company_name:'Proposed Furniture',research_summary:'Updated research with checked product sources.',fit:'MEDIUM',fit_reason:'A smaller opportunity after reviewing the catalogue.'}});
const groups=[
  {key:'company_name',label:'Company name',before:'Example Furniture',after:'Proposed Furniture',manual:false,fields:['company_name','field_provenance.company_name']},
  {key:'research_summary',label:'Research summary',before:example.research_summary,after:'Updated research with checked product sources.',manual:false,fields:['research_summary']},
  {key:'fit',label:'Shapeviz Fit',before:{fit:'HIGH',fit_reason:example.fit_reason},after:{fit:'MEDIUM',fit_reason:'A smaller opportunity after reviewing the catalogue.'},manual:true,fields:['fit','fit_reason']},
];

async function fixture(page,{commitFailures=[],previewFailures=[],previewDelay=0,promptDelay=0,recordStatus='NEEDS_REVIEW',changes=groups}={}) {
  let candidate={...structuredClone(initial),research_status:recordStatus},events=[];
  const calls=[];
  await page.route('**/api/admin?*',async route=>{
    const request=route.request(),url=new URL(request.url()),action=url.searchParams.get('action'),body=request.postDataJSON();calls.push({action,body,method:request.method(),params:Object.fromEntries(url.searchParams)});
    if(action==='me')return route.fulfill({json:{email:'owner@example.test'}});
    if(action==='crm-research-detail')return route.fulfill({json:{candidate,events}});
    if(action==='crm-research-refresh-prompt'){if(promptDelay)await new Promise(resolve=>setTimeout(resolve,promptDelay));return route.fulfill({json:{prompt:`Research ${candidate.company_name}; mode=${url.searchParams.get('mode')}; version=${candidate.version}. Return single-candidate JSON with source evidence.`}});}
    if(action==='crm-research-refresh-preview'){
      if(previewDelay)await new Promise(resolve=>setTimeout(resolve,previewDelay));const failure=previewFailures.shift();if(failure)return route.fulfill({status:failure,json:{error:'Candidate changed after this result was prepared.'}});
      return route.fulfill({json:{groups:changes,reviewToken:'review-'+calls.length,warnings:[{message:'Verify proposed claims against the linked sources.'}],mode:body.proposal.mode}});
    }
    if(action==='crm-research-refresh-commit'){
      const failure=commitFailures.shift();if(failure)return route.fulfill({status:failure,json:{error:failure===409?'The candidate changed after preview.':'The update response was interrupted.'}});
      for(const key of body.selectedFields){if(key==='fit'){candidate.fit=body.proposal.candidate.fit;candidate.fit_reason=body.proposal.candidate.fit_reason;}else candidate[key]=body.proposal.candidate[key];}
      candidate.version++;candidate.last_researched_at='2026-09-23T12:00:00Z';events=[{event_type:'candidate_refreshed',metadata:{changed_fields:body.selectedFields},created_at:candidate.last_researched_at}];
      return route.fulfill({json:{candidate_id:id,version:candidate.version,warnings:[]}});
    }
    return route.fulfill({json:{items:[],companies:[],projects:[],total:0,page:1,pageSize:25,summary:{},daily:[]}});
  });
  return calls;
}
async function open(page,mode='deeper') {await page.goto('/admin/ai-research/'+id);await page.getByRole('button',{name:mode==='deeper'?'Research deeper':'Research again',exact:true}).click();return page.getByRole('dialog');}
async function preview(dialog,proposal=result()){await dialog.getByLabel('Research update JSON',{exact:true}).fill(JSON.stringify(proposal));await dialog.getByRole('button',{name:'Preview updates',exact:true}).click();await expect(dialog.getByRole('heading',{name:'3. Choose the updates to apply'})).toBeVisible();}

test('Candidate guidance and copyable prompt describe missing research without saving any changes',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedResearch=text;}}}));
  const calls=await fixture(page);const dialog=await open(page);
  await dialog.getByRole('button',{name:'Prepare prompt'}).click();await expect(dialog.getByLabel('Candidate research prompt')).toHaveValue(/Research Example Furniture; mode=deeper; version=3/);
  await expect(dialog.getByLabel('Candidate research prompt')).toHaveAttribute('readonly','');await dialog.getByRole('button',{name:'Copy prompt'}).click();
  await expect(dialog.locator('[data-refresh-prompt-status]')).toContainText('Prompt copied');expect(await page.evaluate(()=>window.copiedResearch)).toContain('Example Furniture');
  expect(calls.find(call=>call.action==='crm-research-refresh-prompt')).toMatchObject({method:'GET',body:null,params:{id,mode:'deeper',version:'3'}});
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('heading',{name:'Missing information',exact:true})).toBeVisible();
  await expect(page.locator('.research-missing')).toContainText('Not yet researched');await expect(page.getByRole('heading',{name:'Suggested next research action'})).toBeVisible();
  expect(calls.every(call=>call.method==='GET')).toBe(true);
});

test('All update groups start unchecked and manual Fit replacement needs a separate acknowledgment',async({page})=>{
  const calls=await fixture(page),dialog=await open(page);await preview(dialog);
  await expect(dialog.locator('[data-refresh-select]:checked')).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Apply 0 selected updates'})).toBeDisabled();
  await dialog.getByLabel('Apply Research summary',{exact:true}).check();await dialog.getByLabel('Apply Shapeviz Fit',{exact:true}).check();
  await expect(dialog.getByRole('button',{name:'Apply 2 selected updates'})).toBeDisabled();await expect(dialog).toContainText('Manually reviewed');
  await dialog.getByLabel('Replace my manual review of Shapeviz Fit').check();await expect(dialog.getByRole('button',{name:'Apply 2 selected updates'})).toBeEnabled();
  await dialog.getByLabel('Apply Shapeviz Fit',{exact:true}).uncheck();await dialog.getByLabel('Apply Shapeviz Fit',{exact:true}).check();await expect(dialog.getByLabel('Replace my manual review of Shapeviz Fit')).not.toBeChecked();
  await dialog.getByLabel('Replace my manual review of Shapeviz Fit').check();
  expect(calls.filter(call=>call.action==='crm-research-refresh-commit')).toHaveLength(0);
  await dialog.getByRole('button',{name:'Apply 2 selected updates'}).click();await expect(dialog.getByRole('heading',{name:'Research updated.'})).toBeVisible();
  const commit=calls.find(call=>call.action==='crm-research-refresh-commit').body;expect(commit.selectedFields).toEqual(['research_summary','fit']);expect(commit.overwriteManualFields).toEqual(['fit']);expect(commit.confirm).toBe('apply');
  await dialog.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByRole('heading',{name:'Example Furniture.'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Research summary',exact:true}).locator('..')).toContainText('Updated research with checked product sources.');
  await expect(page.getByRole('heading',{name:'Shapeviz Fit',exact:true}).locator('..')).toContainText('Medium Fit');await expect(page.locator('.research-history')).toContainText('Research refreshed');
});

test('Ambiguous refresh retries preserve exactly the reviewed proposal and selections across reopening',async({page})=>{
  const calls=await fixture(page,{commitFailures:[502]});let dialog=await open(page,'refresh');await preview(dialog,result('refresh'));
  await dialog.getByLabel('Apply Research summary',{exact:true}).check();await dialog.getByRole('button',{name:'Apply 1 selected update',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Retry these same selected updates');await expect(dialog.getByLabel('Research update JSON')).toBeDisabled();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Research again',exact:true}).click();dialog=page.getByRole('dialog');
  await expect(dialog.getByLabel('Apply Research summary',{exact:true})).toBeChecked();await expect(dialog.getByLabel('Apply Shapeviz Fit',{exact:true})).not.toBeChecked();
  await dialog.getByRole('button',{name:'Retry selected updates'}).click();await expect(dialog.getByRole('heading',{name:'Research updated.'})).toBeVisible();
  const commits=calls.filter(call=>call.action==='crm-research-refresh-commit');expect(commits).toHaveLength(2);expect(commits[1].body).toEqual(commits[0].body);expect(commits[0].body.overwriteManualFields).toEqual([]);
});

test('Stale commit errors retain JSON and require a new preview with unchecked choices',async({page})=>{
  const calls=await fixture(page,{commitFailures:[409]}),dialog=await open(page);const proposal=result();await preview(dialog,proposal);
  await dialog.getByLabel('Apply Research summary',{exact:true}).check();await dialog.getByRole('button',{name:'Apply 1 selected update',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Your JSON has been kept');await expect(dialog.getByLabel('Research update JSON')).toHaveValue(JSON.stringify(proposal));await expect(dialog.getByLabel('Research update JSON')).toBeEnabled();
  await expect(dialog.locator('[data-refresh-select]')).toHaveCount(0);await dialog.getByRole('button',{name:'Preview updates',exact:true}).click();await expect(dialog.getByLabel('Apply Research summary',{exact:true})).not.toBeChecked();
  expect(calls.filter(call=>call.action==='crm-research-refresh-commit')).toHaveLength(1);
});

test('Invalid, mismatched and oversized inputs never reach preview; file results preserve the envelope',async({page})=>{
  const calls=await fixture(page),dialog=await open(page),input=dialog.getByLabel('Research update JSON',{exact:true}),button=dialog.getByRole('button',{name:'Preview updates',exact:true});
  await input.fill('{unfinished');await button.click();await expect(dialog.getByRole('alert')).toContainText('must be valid JSON');await expect(input).toHaveValue('{unfinished');
  await input.fill(JSON.stringify(result('refresh')));await button.click();await expect(dialog.getByRole('alert')).toContainText('Use the matching research action');
  await input.fill(JSON.stringify({...result(),candidate_id:'another-candidate'}));await button.click();await expect(dialog.getByRole('alert')).toContainText('another candidate');
  await input.fill(JSON.stringify({...result(),base_version:2}));await button.click();await expect(dialog.getByRole('alert')).toContainText('another version');
  await dialog.getByLabel('Research update file').setInputFiles({name:'large.json',mimeType:'application/json',buffer:Buffer.alloc(500_001,'x')});await expect(dialog.getByRole('alert')).toContainText('exceeds 500,000 bytes');
  expect(calls.filter(call=>call.action==='crm-research-refresh-preview')).toHaveLength(0);
  await dialog.getByLabel('Research update file').setInputFiles({name:'update.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(result()))});await expect(input).toHaveValue(JSON.stringify(result()));
  await button.click();await expect(dialog.getByRole('heading',{name:'3. Choose the updates to apply'})).toBeVisible();expect(calls.find(call=>call.action==='crm-research-refresh-preview').body.proposal).toEqual(result());
});

test('Editing JSON during preview discards the stale response; closing discards a late prompt',async({page})=>{
  const calls=await fixture(page,{previewDelay:400,promptDelay:400}),dialog=await open(page);
  await dialog.getByLabel('Research update JSON').fill(JSON.stringify(result()));const response=page.waitForResponse(response=>response.url().includes('action=crm-research-refresh-preview'));
  await dialog.getByRole('button',{name:'Preview updates'}).click();await dialog.getByLabel('Research update JSON').fill('{new draft');await response;
  await expect(dialog.locator('[data-refresh-select]')).toHaveCount(0);await expect(dialog.getByLabel('Research update JSON')).toHaveValue('{new draft');
  const promptResponse=page.waitForResponse(response=>response.url().includes('action=crm-research-refresh-prompt'));await dialog.getByRole('button',{name:'Prepare prompt'}).click();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await promptResponse;
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Example Furniture.'})).toBeVisible();expect(calls.filter(call=>call.action==='crm-research-refresh-commit')).toHaveLength(0);
});

test('Untrusted differences remain text and comparison controls fit mobile',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));const unsafe='<img src=x onerror="window.researchRefreshInjected=true">';
  await fixture(page,{changes:[{key:'research_summary',label:'Summary <script>',before:unsafe,after:{research_summary:unsafe},manual:false,fields:['research_summary']}]});await page.setViewportSize({width:390,height:844});const dialog=await open(page);await preview(dialog);
  await expect(dialog.locator('.research-refresh-group')).toContainText(unsafe);await expect(dialog.locator('.research-refresh-group img,.research-refresh-group script')).toHaveCount(0);expect(await page.evaluate(()=>window.researchRefreshInjected)).toBeUndefined();
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);await page.screenshot({path:'.cache/research-refresh-mobile.png'});expect(errors).toEqual([]);
});

for(const status of ['APPROVED','REJECTED'])test(`${status} candidates do not offer further research actions`,async({page})=>{
  await fixture(page,{recordStatus:status});await page.goto('/admin/ai-research/'+id);await expect(page.getByRole('heading',{name:'Example Furniture.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Research deeper',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Research again',exact:true})).toHaveCount(0);await expect(page.locator('.research-refresh-unavailable')).toContainText(status==='APPROVED'?'Approved research is preserved':'Restore this candidate');
});
