import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createApp} from '../../server.js';
import {validateResearchCandidate} from '../../src/research/validation.js';

test.use({trace:'off',screenshot:'off'});
test('live Research login, reviewed import, concurrent retries and prompt use real Supabase ownership',async({page})=>{
  test.skip(process.env.LIVE_RESEARCH_TEST!=='true','Opt-in isolated Supabase fixture, cleaned in finally');
  test.setTimeout(180000);
  process.loadEnvFile('.env');
  const env={...process.env,SUPABASE_URL:'https://psqykqbewphchalfyrsp.supabase.co',SITE_URL:'',VERCEL:'',PRESENTATIONS_REMOTE:'true',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
  const email=`research-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID(),candidateId=randomUUID();
  let user,server;
  const request=async(path,{method='GET',body,jwt}={})=>{
    const response=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',...(jwt?{Authorization:`Bearer ${jwt}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Object.assign(new Error(`Research live fixture ${method} ${path.split('?')[0]} failed: ${response.status}`),{status:response.status});
    const text=await response.text();return text?JSON.parse(text):null;
  };
  try {
    user=await request('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});
    await request('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
    const example=JSON.parse(await readFile(new URL('../../docs/examples/research-candidates.v1.json',import.meta.url),'utf8')).candidates[0];
    const {candidate}=validateResearchCandidate({...example,company_name:'Research isolated live fixture'});
    const {normalized_company_name,...record}=candidate;
    await request('/rest/v1/crm_research_candidates',{method:'POST',body:{...record,id:candidateId,owner_id:user.id,research_status:'NEEDS_REVIEW'}});
    const auth=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
    await expect(request('/rest/v1/crm_research_candidates',{method:'POST',jwt:auth.access_token,body:{owner_id:user.id,company_name:'Bypass attempt'}})).rejects.toMatchObject({status:403});
    server=createApp({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(origin+'/admin/ai-research');
    await page.locator('#signin [name=email]').fill(email);await page.locator('#signin [name=password]').fill(password);await page.locator('#signin button').click();
    await expect(page.locator('.research-card')).toContainText('Research isolated live fixture',{timeout:30000});
    await expect(page.locator('.research-count')).toHaveText('1 candidate');
    await page.screenshot({path:'.cache/research-live-desktop.png',fullPage:true});
    await page.getByRole('combobox',{name:'Fit',exact:true}).selectOption('LOW');await page.getByRole('button',{name:'Apply filters'}).click();
    await expect(page.getByRole('heading',{name:'No matching candidates.'})).toBeVisible();
    await page.locator('#research-filters').getByRole('button',{name:'Clear filters'}).click();
    await page.getByRole('link',{name:'View research'}).click();
    await expect(page.getByRole('heading',{name:'Research isolated live fixture.'})).toBeVisible();
    await expect(page.getByRole('link',{name:'Fictional product catalogue'})).toBeVisible();
    await expect(page.locator('.research-detail-grid')).toContainText('Verified');
    await page.reload();
    await expect(page.getByRole('heading',{name:'Research isolated live fixture.'})).toBeVisible();
    await page.screenshot({path:'.cache/research-live-detail-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:'.cache/research-live-detail-mobile.png',fullPage:true});

    await page.getByRole('link',{name:'AI Research',exact:true}).click();
    const imported={...example,company_name:'Live imported candidate',website:'https://fresh-import.example',source_origin:'CHATGPT'};
    const json=JSON.stringify({schema_version:1,candidates:[imported,{...example,company_name:'Known candidate match'},{company_name:'Invalid proposal',fit:'HIGH'}]});
    let savedBody;
    page.on('request',request=>{if(request.url().includes('action=crm-research-import-commit'))savedBody=request.postDataJSON();});
    await page.getByRole('button',{name:'Import JSON',exact:true}).click();
    await page.getByLabel('Research JSON',{exact:true}).fill(json);
    await page.getByRole('button',{name:'Preview import',exact:true}).click();
    await expect(page.getByRole('dialog')).toContainText('2 valid · 1 invalid · 1 possible duplicates');
    await expect(page.getByLabel('Row 2 decision')).toHaveValue('skip');
    await expect(page.getByRole('dialog').getByRole('link',{name:'Research isolated live fixture'})).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
    await page.screenshot({path:'.cache/research-live-import-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:'.cache/research-live-import-desktop.png',fullPage:true});
    await page.getByRole('button',{name:'Import 1 candidate',exact:true}).click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('1 imported · 1 skipped. 1 invalid row was left out.');
    await page.getByRole('button',{name:'Done',exact:true}).click();
    await expect(page.locator('.research-count')).toHaveText('2 candidates');
    await expect(page.locator('.research-card').filter({hasText:'Live imported candidate'})).toBeVisible();
    const appPost=(action,body)=>page.request.post(origin+'/api/admin?action='+action,{headers:{Origin:origin},data:body});
    const replay=await appPost('crm-research-import-commit',savedBody);
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toMatchObject({replayed:true,imported:1});
    const stored=await request(`/rest/v1/crm_research_candidates?owner_id=eq.${user.id}&normalized_domain=eq.fresh-import.example&select=*`,{jwt:auth.access_token});
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({research_status:'NEW',source_origin:'CHATGPT',research_summary:example.research_summary,sources:candidate.sources,field_provenance:candidate.field_provenance});
    await expect(request('/rest/v1/rpc/crm_research_import',{method:'POST',jwt:auth.access_token,body:{p_owner:user.id,p_id:randomUUID(),p_hash:'a'.repeat(64),p_rows:[],p_expected:[]}})).rejects.toMatchObject({status:403});

    const concurrentJson=JSON.stringify({candidates:[{company_name:'Concurrent import fixture',website:'https://concurrent-import.example',country:'SK'}]});
    const previewResponse=await appPost('crm-research-import-preview',{json:concurrentJson});
    expect(previewResponse.status()).toBe(200);
    const preview=await previewResponse.json();
    const commit={json:concurrentJson,previewToken:preview.previewToken,batchId:randomUUID(),choices:[{row:1,decision:'import'}],confirm:'import'};
    const concurrent=await Promise.all([appPost('crm-research-import-commit',commit),appPost('crm-research-import-commit',{...commit,batchId:randomUUID()})]);
    expect(concurrent.map(response=>response.status()).sort()).toEqual([200,409]);
    const stale=await concurrent.find(response=>response.status()===409).json();
    expect(stale.error).toContain('duplicate check');
    const concurrentRecords=await request(`/rest/v1/crm_research_candidates?owner_id=eq.${user.id}&normalized_domain=eq.concurrent-import.example&select=id`,{jwt:auth.access_token});
    expect(concurrentRecords).toHaveLength(1);

    const retryJson=JSON.stringify({candidates:[{company_name:'Concurrent retry fixture',website:'https://retry-import.example'}]});
    const retryPreview=await (await appPost('crm-research-import-preview',{json:retryJson})).json();
    const retryBody={...commit,json:retryJson,previewToken:retryPreview.previewToken,batchId:randomUUID()};
    const retries=await Promise.all([appPost('crm-research-import-commit',retryBody),appPost('crm-research-import-commit',retryBody)]);
    expect(retries.map(response=>response.status())).toEqual([200,200]);
    const results=await Promise.all(retries.map(response=>response.json()));
    expect(results[0].candidate_ids).toEqual(results[1].candidate_ids);
    expect(results.filter(result=>result.replayed)).toHaveLength(1);

    await page.getByRole('button',{name:'Research prompt',exact:true}).click();
    await expect(page.getByLabel('Prompt to copy')).toHaveValue(/fresh-import\.example/);
    await expect(page.getByLabel('Prompt to copy')).toHaveValue(/concurrent-import\.example/);
    await expect(page.getByLabel('Prompt to copy')).toHaveValue(/CANONICAL JSON SCHEMA/);
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('4 existing domains');
    await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('link',{name:'Leads',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Leads.'})).toBeVisible();
    expect(await request(`/rest/v1/crm_companies?owner_id=eq.${user.id}&select=id`,{jwt:auth.access_token})).toHaveLength(0);
    await page.getByRole('button',{name:'Sign out'}).click();
    await expect(page.locator('#signin')).toBeVisible();
    const anonymous=await page.request.get(origin+'/api/admin?action=crm-research-detail&id='+candidateId);
    expect(anonymous.status()).toBe(401);
    expect(errors).toEqual([]);
  } finally {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(user){
      const failures=[];
      for(const path of [`/rest/v1/crm_research_candidates?owner_id=eq.${user.id}`,`/rest/v1/presentation_admins?user_id=eq.${user.id}`,`/auth/v1/admin/users/${user.id}`]){
        try{await request(path,{method:'DELETE'});}catch(error){failures.push(error.message);}
      }
      if(failures.length)throw new Error('Research fixture cleanup failed: '+failures.join('; '));
    }
  }
});
