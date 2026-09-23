import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../server.js';
import {validateResearchCandidate} from '../../src/research/validation.js';

test.use({trace:'off',screenshot:'off'});
test('live similar-company prompts keep owner scope and feed the reviewed Research import',async({page})=>{
  test.skip(process.env.LIVE_RESEARCH_TEST!=='true','Opt-in isolated Supabase owners; all fixtures cleaned in finally');
  test.setTimeout(240000);
  process.loadEnvFile('.env');
  const env={...process.env,SUPABASE_URL:'https://psqykqbewphchalfyrsp.supabase.co',SITE_URL:'',VERCEL:'',PRESENTATIONS_REMOTE:'true',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
  const accounts=[],fixtureUsers=[];
  let server,origin,signedOut=false;
  const request=async(path,{method='GET',body,jwt,representation=false}={})=>{
    const response=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',...(jwt?{Authorization:`Bearer ${jwt}`}:{ }),...(representation?{Prefer:'return=representation'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Object.assign(new Error(`Similar fixture ${method} ${path.split('?')[0]} failed: ${response.status}`),{status:response.status});
    const text=await response.text();return text?JSON.parse(text):null;
  };
  const appPost=(action,body)=>page.request.post(origin+'/api/admin?action='+action,{headers:{Origin:origin},data:body});
  const similarRequest=(referenceType,referenceId)=>page.request.get(origin+'/api/admin?'+new URLSearchParams({action:'crm-research-similar-prompt',referenceType,referenceId,countries:'CZ,AT',count:'10'}));
  const research=(company_name,domain,source_origin='CHATGPT')=>{
    const sourceURL=`https://${domain}/catalogue`;
    return {company_name,website:`https://${domain}/`,country:'CZ',industry:'Furniture',business_type:'Manufacturer',product_categories:['Sofas'],market_segments:['Architects'],
      short_description:'A fictional furniture company used only in this isolated live test.',research_summary:'Fictional source-backed research kept separate from the CRM Lead.',
      fit:'HIGH',fit_reason:'Illustrative product catalogue and architect audience.',potential_services:[{service:'Product CGI',relevance:'HIGH',reason:'Illustrative catalogue visuals.'}],source_origin,
      sources:[{url:sourceURL,title:'Fictional catalogue source',source_type:'Product Page',retrieved_at:null,supports:['industry','product_categories']}],
      field_provenance:{industry:{status:'VERIFIED',confidence:'HIGH',evidence:'The fictional catalogue describes furniture.',source_urls:[sourceURL]},product_categories:{status:'VERIFIED',confidence:'HIGH',evidence:'The fictional catalogue lists sofas.',source_urls:[sourceURL]}}};
  };
  try {
    for(let index=0;index<2;index++){
      const email=`research-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
      const user=await request('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});fixtureUsers.push(user);
      await request('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
      const auth=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
      accounts.push({user,email,password,jwt:auth.access_token});
    }
    const [owner,other]=accounts;
    const seedCandidate=async(account,name,domain,workflow={})=>{
      const {candidate}=validateResearchCandidate(research(name,domain)),{normalized_company_name,...record}=candidate,id=randomUUID();
      await request('/rest/v1/crm_research_candidates',{method:'POST',body:{...record,id,owner_id:account.user.id,research_status:'NEEDS_REVIEW',...workflow}});
      return {...record,id};
    };
    // Existing company audit triggers must receive the fixture owner's JWT.
    const seedCompany=async(account,name,domain,archived=false)=>{
      const rows=await request('/rest/v1/crm_companies',{method:'POST',jwt:account.jwt,representation:true,body:{owner_id:account.user.id,company_name:name,website:`https://${domain}/`,country:'SK',industry:'Lighting',short_description:'Current manually maintained lighting profile.',services:['Product CGI','Product Animation'],fit:'MEDIUM',priority:'LOW',pipeline_status:'NEW_LEAD',lead_source:'Manual research'}});
      const company=rows[0];
      if(archived)await request(`/rest/v1/crm_companies?id=eq.${company.id}&owner_id=eq.${account.user.id}`,{method:'PATCH',jwt:account.jwt,body:{archived_at:new Date().toISOString()}});
      return company;
    };
    const candidate=await seedCandidate(owner,'Similar reference furniture','similar-reference.example');
    const rejected=await seedCandidate(owner,'Previously rejected fixture','similar-rejected.example',{research_status:'REJECTED',rejected_at:new Date().toISOString(),rejection_reason:'Not a suitable market.'});
    const company=await seedCompany(owner,'Similar current lighting Lead','similar-existing-lead.example');
    const archived=await seedCompany(owner,'Archived lighting reference','similar-archived.example',true);
    const approved=await seedCandidate(owner,'Historical approved furniture reference','similar-historical.example',{research_status:'APPROVED',approved_company_id:company.id,approved_at:new Date().toISOString()});
    const otherCandidate=await seedCandidate(other,'Other owner private research','similar-private-research.example');
    const otherCompany=await seedCompany(other,'Other owner private Lead','similar-private-lead.example');
    const candidateRows=()=>request(`/rest/v1/crm_research_candidates?owner_id=eq.${owner.user.id}&select=*&order=id`,{jwt:owner.jwt});
    const companyRows=()=>request(`/rest/v1/crm_companies?owner_id=eq.${owner.user.id}&select=*&order=id`,{jwt:owner.jwt});
    const initialCandidates=await candidateRows(),initialCompanies=await companyRows();
    const exclusions=['similar-reference.example','similar-rejected.example','similar-existing-lead.example','similar-archived.example','similar-historical.example'];
    const verifyExclusions=prompt=>{
      for(const domain of exclusions)expect(prompt).toContain(domain);
      for(const privateText of ['similar-private-research.example','similar-private-lead.example','Other owner private research','Other owner private Lead',other.user.id])expect(prompt).not.toContain(privateText);
      expect(prompt).toContain('SIMILAR_COMPANY');expect(prompt).toContain('CZ');expect(prompt).toContain('AT');expect(prompt).toContain('CANONICAL JSON SCHEMA');
    };
    server=createApp({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
    const errors=[],promptCalls=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.url().includes('action=crm-research-similar-prompt'))promptCalls.push(new URL(request.url()));});
    await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.similarCopiedPrompt=text;}}}));
    await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/admin/ai-research/'+candidate.id);
    await page.locator('#signin [name=email]').fill(owner.email);await page.locator('#signin [name=password]').fill(owner.password);await page.locator('#signin button').click();
    await expect(page.getByRole('heading',{name:'Similar reference furniture.'})).toBeVisible();
    await page.getByRole('button',{name:'Find similar companies',exact:true}).click();let dialog=page.getByRole('dialog');
    await dialog.getByLabel('Target country codes',{exact:true}).fill('CZ, AT');
    await dialog.getByLabel('Number of companies',{exact:true}).fill('10');
    await dialog.getByRole('button',{name:'Prepare prompt',exact:true}).click();
    await expect(dialog.getByLabel('Similar-company research prompt',{exact:true})).toHaveValue(/Similar reference furniture/);
    const candidatePrompt=await dialog.getByLabel('Similar-company research prompt',{exact:true}).inputValue();verifyExclusions(candidatePrompt);
    expect(promptCalls.at(-1).searchParams.get('referenceType')).toBe('candidate');expect(promptCalls.at(-1).searchParams.get('referenceId')).toBe(candidate.id);
    await dialog.getByRole('button',{name:'Copy prompt',exact:true}).click();expect(await page.evaluate(()=>window.similarCopiedPrompt)).toBe(candidatePrompt);
    await dialog.screenshot({path:'.cache/research-similar-live-desktop.png'});
    await page.setViewportSize({width:390,height:844});expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);await dialog.screenshot({path:'.cache/research-similar-live-mobile.png'});
    await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.setViewportSize({width:1440,height:1000});

    await page.goto(origin+'/admin/leads/'+company.id);await expect(page.getByRole('heading',{name:'Similar current lighting Lead.'})).toBeVisible();
    await page.getByRole('button',{name:'Find similar companies',exact:true}).click();dialog=page.getByRole('dialog');
    await dialog.getByLabel('Target country codes',{exact:true}).fill('CZ, AT');await dialog.getByLabel('Number of companies',{exact:true}).fill('10');
    await dialog.getByRole('button',{name:'Prepare prompt',exact:true}).click();await expect(dialog.getByLabel('Similar-company research prompt',{exact:true})).toHaveValue(/Similar current lighting Lead/);
    const companyPrompt=await dialog.getByLabel('Similar-company research prompt',{exact:true}).inputValue();verifyExclusions(companyPrompt);
    expect(companyPrompt).toContain('Current manually maintained lighting profile.');expect(companyPrompt).not.toContain('Historical approved furniture reference');
    expect(companyPrompt).not.toContain('Fictional source-backed research kept separate from the CRM Lead.');expect(companyPrompt).toContain('Product Animation');
    expect(promptCalls.at(-1).searchParams.get('referenceType')).toBe('company');expect(promptCalls.at(-1).searchParams.get('referenceId')).toBe(company.id);

    for(const [type,reference] of [['candidate',rejected],['candidate',approved],['company',archived]]){
      const response=await similarRequest(type,reference.id);expect(response.status()).toBe(200);const data=await response.json();
      expect(data.reference).toMatchObject({type,id:reference.id});expect(data.reference.version).toBeGreaterThan(0);expect(data.countries).toEqual(['CZ','AT']);expect(data.count).toBe(10);expect(data.excluded_count).toBe(exclusions.length);verifyExclusions(data.prompt);
    }
    for(const [type,id] of [['candidate',otherCandidate.id],['company',otherCompany.id]]){
      const response=await similarRequest(type,id);expect(response.status()).toBe(404);expect(await response.text()).not.toContain('Other owner private');
    }
    expect(await candidateRows()).toEqual(initialCandidates);expect(await companyRows()).toEqual(initialCompanies);

    // Similar results use the existing import preview and duplicate decisions.
    const fresh=research('Fresh similar-company prospect','similar-fresh-result.example','SIMILAR_COMPANY');
    const known=research('Rediscovered rejected prospect','similar-rejected.example','SIMILAR_COMPANY');
    const json=JSON.stringify({schema_version:1,candidates:[fresh,known]});
    await dialog.getByRole('button',{name:'Import research JSON',exact:true}).click();dialog=page.getByRole('dialog');
    await dialog.getByLabel('Research JSON',{exact:true}).fill(json);await dialog.getByRole('button',{name:'Preview import',exact:true}).click();
    await expect(dialog).toContainText('2 valid · 0 invalid · 1 possible duplicates');await expect(dialog.getByLabel('Row 1 decision')).toHaveValue('import');await expect(dialog.getByLabel('Row 2 decision')).toHaveValue('skip');
    await expect(dialog.getByRole('link',{name:'Previously rejected fixture',exact:true})).toBeVisible();
    await dialog.getByRole('button',{name:'Import 1 candidate',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('1 imported · 1 skipped.');
    await dialog.getByRole('button',{name:'Done',exact:true}).click();await page.goto(origin+'/admin/ai-research');await expect(page.locator('.research-card').filter({hasText:'Fresh similar-company prospect'})).toBeVisible();
    const afterCandidates=await candidateRows(),inserted=afterCandidates.find(row=>row.normalized_domain==='similar-fresh-result.example');
    expect(afterCandidates).toHaveLength(initialCandidates.length+1);expect(inserted).toBeTruthy();
    const canonical=validateResearchCandidate(fresh).candidate;
    expect(inserted).toMatchObject({company_name:fresh.company_name,research_status:'NEW',source_origin:'SIMILAR_COMPANY',research_summary:canonical.research_summary,sources:canonical.sources,field_provenance:canonical.field_provenance,approved_company_id:null});
    expect(afterCandidates.filter(row=>row.normalized_domain==='similar-rejected.example')).toHaveLength(1);
    expect(afterCandidates.filter(row=>row.id!==inserted.id)).toEqual(initialCandidates);expect(await companyRows()).toEqual(initialCompanies);
    const promptAfter=await similarRequest('candidate',candidate.id);expect(promptAfter.status()).toBe(200);expect((await promptAfter.json()).prompt).toContain('similar-fresh-result.example');
    await page.getByRole('button',{name:'Sign out'}).click();await expect(page.locator('#signin')).toBeVisible();signedOut=true;
    expect((await similarRequest('candidate',candidate.id)).status()).toBe(401);expect((await similarRequest('company',company.id)).status()).toBe(401);expect(errors).toEqual([]);
  } finally {
    const failures=[];
    if(server&&origin&&!signedOut){try{const response=await appPost('logout',{});if(![200,401].includes(response.status()))failures.push('Application sign-out failed: '+response.status());}catch{failures.push('Application sign-out request failed.');}}
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    for(const user of fixtureUsers){
      for(const path of [`/rest/v1/crm_research_candidates?owner_id=eq.${user.id}`,`/rest/v1/crm_activities?owner_id=eq.${user.id}`,`/rest/v1/crm_companies?owner_id=eq.${user.id}`,`/rest/v1/presentation_admins?user_id=eq.${user.id}`,`/auth/v1/admin/users/${user.id}`]){
        try{await request(path,{method:'DELETE'});}catch(error){failures.push(error.message);}
      }
    }
    if(failures.length)throw new Error('Similar fixture cleanup failed: '+failures.join('; '));
  }
});
