import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createApp} from '../../server.js';
import {validateResearchCandidate} from '../../src/research/validation.js';
import {RESEARCH_SERVICES,CRM_SERVICES} from '../../public/admin/service-catalog.js';
import {RESEARCH_CANDIDATE_SCHEMA} from '../../src/research/schema.js';

test.use({trace:'off',screenshot:'off'});
test('live candidate edits, rejection, approval, preserved research and concurrent conversion',async({page})=>{
  test.skip(process.env.LIVE_RESEARCH_TEST!=='true','Opt-in isolated Supabase owner; all fixtures cleaned in finally');
  test.setTimeout(180000);
  process.loadEnvFile('.env');
  const env={...process.env,SUPABASE_URL:'https://psqykqbewphchalfyrsp.supabase.co',SITE_URL:'',VERCEL:'',PRESENTATIONS_REMOTE:'true',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
  const email=`research-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
  let user,server;
  const request=async(path,{method='GET',body,jwt}={})=>{
    const response=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',...(jwt?{Authorization:`Bearer ${jwt}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Object.assign(new Error(`Review fixture ${method} ${path.split('?')[0]} failed: ${response.status}`),{status:response.status});
    const text=await response.text();return text?JSON.parse(text):null;
  };
  try {
    user=await request('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});
    await request('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
    const example=JSON.parse(await readFile(new URL('../../docs/examples/research-candidates.v1.json',import.meta.url),'utf8')).candidates[0];
    const seed=async(overrides)=>{
      const {candidate}=validateResearchCandidate({...example,...overrides});
      const {normalized_company_name,...record}=candidate;
      const id=randomUUID();
      await request('/rest/v1/crm_research_candidates',{method:'POST',body:{...record,id,owner_id:user.id,research_status:'NEEDS_REVIEW'}});
      return {...record,id,version:1};
    };
    const candidate=await seed({company_name:'Live reviewed furniture',potential_services:RESEARCH_SERVICES.map(service=>({service,relevance:'HIGH',reason:'Review fixture recommendation.'}))});
    const auth=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
    server=createApp({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const appPost=(action,body)=>page.request.post(origin+'/api/admin?action='+action,{headers:{Origin:origin},data:body});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    let approvalBody;
    page.on('request',r=>{if(r.url().includes('action=crm-research-approve'))approvalBody=r.postDataJSON();});
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(origin+'/admin/ai-research/'+candidate.id);
    await page.locator('#signin [name=email]').fill(email);await page.locator('#signin [name=password]').fill(password);await page.locator('#signin button').click();
    await expect(page.getByRole('heading',{name:'Live reviewed furniture.'})).toBeVisible();
    await page.getByRole('button',{name:'Edit candidate',exact:true}).click();
    let dialog=page.getByRole('dialog');
    await dialog.getByLabel('Business type',{exact:true}).fill('Brand');
    await dialog.getByRole('combobox',{name:'Fit',exact:true}).selectOption('MEDIUM');
    await dialog.getByLabel('Fit reason',{exact:true}).fill('A manually reviewed opportunity for a focused first project.');
    await dialog.getByRole('button',{name:'Save candidate',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'Shapeviz Fit'}).locator('..')).toContainText('Manually reviewed');
    let saved=(await request(`/rest/v1/crm_research_candidates?id=eq.${candidate.id}&select=*`,{jwt:auth.access_token}))[0];
    expect(saved.fit).toBe('MEDIUM');expect(saved.business_type).toBe('Brand');
    expect(saved.field_provenance.business_type.status).toBe('UNKNOWN');
    expect(saved.manual_fields).toEqual(expect.arrayContaining(['business_type','fit','fit_reason']));
    expect(saved.sources).toEqual(candidate.sources);

    await page.getByRole('button',{name:'Reject candidate',exact:true}).click();dialog=page.getByRole('dialog');
    await dialog.getByLabel('Rejection reason').fill('Keep this decision in research history.');
    await dialog.getByRole('button',{name:'Reject candidate',exact:true}).click();
    await expect(page.getByRole('button',{name:'Restore to review',exact:true})).toBeVisible();
    const prompt=await page.request.get(origin+'/api/admin?action=crm-research-prompt');
    expect(prompt.status()).toBe(200);expect((await prompt.json()).prompt).toContain('furniture.example');
    await page.reload();await expect(page.locator('.research-history')).toContainText('Keep this decision in research history.');
    await page.getByRole('button',{name:'Restore to review',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Restore to review',exact:true}).click();
    await expect(page.getByRole('button',{name:'Approve as lead',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Approve as lead',exact:true}).click();dialog=page.getByRole('dialog');
    await dialog.getByRole('button',{name:'Preview lead',exact:true}).click();
    await expect(dialog.getByRole('heading',{name:'Lead preview',exact:true})).toBeVisible();
    await expect(dialog.locator('.research-lead-preview')).toContainText('Product Animation');
    await expect(dialog.locator('.research-lead-preview')).toContainText('Lifestyle CGI');
    await expect(dialog.locator('.research-lead-preview')).toContainText('MEDIUM');
    expect(await request(`/rest/v1/crm_companies?owner_id=eq.${user.id}&select=id`,{jwt:auth.access_token})).toHaveLength(0);
    await page.screenshot({path:'.cache/research-review-live-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
    await page.screenshot({path:'.cache/research-review-live-mobile.png',fullPage:true});
    await dialog.getByRole('button',{name:'Confirm and create lead',exact:true}).click();
    await expect(dialog.getByRole('heading',{name:'Lead created.',exact:true})).toBeVisible();
    const leadUrl=await dialog.getByRole('link',{name:'Open lead',exact:true}).getAttribute('href');
    const companyId=leadUrl.split('/').at(-1);
    const retry=await appPost('crm-research-approve',approvalBody);
    expect(retry.status()).toBe(200);expect(await retry.json()).toMatchObject({replayed:true,company_id:companyId});
    await dialog.getByRole('button',{name:'Done',exact:true}).click();
    await page.locator('.research-review-actions').getByRole('link',{name:'Open lead',exact:true}).click();
    await expect(page.locator('.crm-company-research')).toContainText('Research behind this lead.');
    await expect(page.getByRole('link',{name:'View research and sources'})).toHaveAttribute('href','/admin/ai-research/'+candidate.id);
    await page.getByRole('tab',{name:'Activity',exact:true}).click();
    await expect(page.getByRole('heading',{name:'AI research approved'})).toBeVisible();
    await page.getByRole('link',{name:'View approved research',exact:true}).click();
    await expect(page.getByRole('button',{name:'Edit candidate',exact:true})).toHaveCount(0);
    await expect(page.getByRole('link',{name:'Fictional product catalogue'})).toBeVisible();
    const company=(await request(`/rest/v1/crm_companies?id=eq.${companyId}&select=*`,{jwt:auth.access_token}))[0];
    expect(company).toMatchObject({lead_source:'AI Research',pipeline_status:'NEW_LEAD',fit:'MEDIUM',priority:'MEDIUM'});
    expect(company.services).toEqual(CRM_SERVICES);
    const history=await request(`/rest/v1/crm_research_events?candidate_id=eq.${candidate.id}&select=event_type`,{jwt:auth.access_token});
    expect(history.map(event=>event.event_type).sort()).toEqual(['candidate_approved','candidate_rejected','candidate_restored','candidate_updated']);
    await expect(request('/rest/v1/rpc/crm_research_approve',{method:'POST',jwt:auth.access_token,body:{p_owner:user.id,p_id:candidate.id,p_operation:randomUUID(),p_hash:'a'.repeat(64),p_version:1,p_lead:{},p_expected:{},p_acknowledge_duplicates:false}})).rejects.toMatchObject({status:403});

    const prepare=async(record)=>{
      const response=await appPost('crm-research-approval-preview',{id:record.id,version:record.version,priority:'MEDIUM',services:['Product CGI']});
      expect(response.status()).toBe(200);return response.json();
    };
    const confirm=(record,preview)=>({id:record.id,version:record.version,operationId:randomUUID(),reviewToken:preview.reviewToken,acknowledgeDuplicates:true,confirm:'approve'});
    const staleCandidate=await seed({company_name:'Stale review fixture',website:'https://stale-review.example'});
    const stalePreview=await prepare(staleCandidate);
    const proposal=Object.fromEntries(Object.keys(RESEARCH_CANDIDATE_SCHEMA.properties).map(key=>[key,staleCandidate[key]]));
    const edit=await appPost('crm-research-save',{id:staleCandidate.id,version:1,operationId:randomUUID(),candidate:{...proposal,fit_reason:'Changed since approval preview.'}});
    expect(edit.status()).toBe(200);
    expect((await appPost('crm-research-approve',confirm(staleCandidate,stalePreview))).status()).toBe(409);
    expect(await request(`/rest/v1/crm_companies?owner_id=eq.${user.id}&website=like.*stale-review.example*&select=id`,{jwt:auth.access_token})).toHaveLength(0);

    const first=await seed({company_name:'Competing approval A',website:'https://approval-race.example'});
    const second=await seed({company_name:'Competing approval B',website:'https://approval-race.example'});
    const previews=await Promise.all([prepare(first),prepare(second)]);
    expect(previews.map(value=>value.match_count)).toEqual([1,1]);
    const competing=await Promise.all([appPost('crm-research-approve',confirm(first,previews[0])),appPost('crm-research-approve',confirm(second,previews[1]))]);
    expect(competing.map(response=>response.status()).sort()).toEqual([200,409]);
    expect(await request(`/rest/v1/crm_companies?owner_id=eq.${user.id}&website=like.*approval-race.example*&select=id`,{jwt:auth.access_token})).toHaveLength(1);
    const remaining=await request(`/rest/v1/crm_research_candidates?owner_id=eq.${user.id}&normalized_domain=eq.approval-race.example&select=research_status`,{jwt:auth.access_token});
    expect(remaining.filter(row=>row.research_status==='APPROVED')).toHaveLength(1);

    const repeated=await seed({company_name:'Repeated approval fixture',website:'https://approval-retry.example'});
    const repeatedBody=confirm(repeated,await prepare(repeated));
    const retries=await Promise.all([appPost('crm-research-approve',repeatedBody),appPost('crm-research-approve',repeatedBody)]);
    expect(retries.map(response=>response.status())).toEqual([200,200]);
    const replayResults=await Promise.all(retries.map(response=>response.json()));
    expect(replayResults[0].company_id).toBe(replayResults[1].company_id);
    expect(replayResults.filter(result=>result.replayed)).toHaveLength(1);
    await page.getByRole('button',{name:'Sign out'}).click();
    expect(errors).toEqual([]);
  } finally {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(user){
      const failures=[];
      for(const path of [`/rest/v1/crm_research_candidates?owner_id=eq.${user.id}`,`/rest/v1/crm_activities?owner_id=eq.${user.id}`,`/rest/v1/crm_companies?owner_id=eq.${user.id}`,`/rest/v1/presentation_admins?user_id=eq.${user.id}`,`/auth/v1/admin/users/${user.id}`]){
        try{await request(path,{method:'DELETE'});}catch(error){failures.push(error.message);}
      }
      if(failures.length)throw new Error('Review fixture cleanup failed: '+failures.join('; '));
    }
  }
});
