import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../server.js';
import {validateResearchCandidate} from '../../src/research/validation.js';
import {candidateProposal} from '../../src/research/refresh-domain.js';

test.use({trace:'off',screenshot:'off'});
test('live Lead enrichment preserves manual CRM values and immutable research while applying selected evidence',async({page})=>{
  test.skip(process.env.LIVE_RESEARCH_TEST!=='true','Opt-in isolated Supabase owners; fixtures cleaned in finally');
  test.setTimeout(240000);process.loadEnvFile('.env');
  const env={...process.env,SUPABASE_URL:'https://psqykqbewphchalfyrsp.supabase.co',SITE_URL:'',VERCEL:'',PRESENTATIONS_REMOTE:'true',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
  const users=[],accounts=[];let server,origin,signedOut=false;
  const request=async(path,{method='GET',body,jwt,representation=false}={})=>{
    const response=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',...(jwt?{Authorization:`Bearer ${jwt}`}:{ }),...(representation?{Prefer:'return=representation'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Object.assign(new Error(`Enrichment fixture ${method} ${path.split('?')[0]} failed: ${response.status}`),{status:response.status});
    const text=await response.text();return text?JSON.parse(text):null;
  };
  const appPost=(action,body)=>page.request.post(origin+'/api/admin?action='+action,{headers:{Origin:origin},data:body});
  const appRead=(action,query)=>page.request.get(origin+'/api/admin?'+new URLSearchParams({action,...query}));
  const research=(company)=>{
    const source='https://enrichment.example/catalogue',proof={status:'VERIFIED',confidence:'HIGH',evidence:'Fictional catalogue explicitly records this detail for the isolated test.',source_urls:[source]};
    return candidateProposal(validateResearchCandidate({company_name:company.company_name,website:company.website,country:company.country,
      city:'Bratislava',industry:'Furniture',business_type:'Manufacturer',short_description:'A proposed catalogue description.',product_categories:['Sofas'],market_segments:['Architects'],
      research_summary:'Fictional evidence supports a reusable product visual system.',fit:'HIGH',fit_reason:'The illustrated product range benefits from consistent product visuals.',
      potential_services:[{service:'Product CGI',relevance:'HIGH',reason:'Illustrative product catalogue.'},{service:'Product Animation',relevance:'MEDIUM',reason:'Illustrative product demonstrations.'}],
      suggested_pitch_angle:'Reuse the same product models across the catalogue and animations.',research_confidence:'HIGH',source_origin:'ENRICHMENT',last_researched_at:new Date().toISOString(),
      sources:[{url:source,title:'Fictional enrichment catalogue',source_type:'Product Page',retrieved_at:null,supports:['city','industry','short_description','business_type','product_categories']}],
      field_provenance:{city:proof,industry:proof,short_description:proof,business_type:proof,product_categories:proof},
      opportunity_signals:[{signal:'LARGE_PRODUCT_CATALOG',status:'VERIFIED',confidence:'HIGH',evidence:'Fictional source describes multiple products.',source_urls:[source]}],
    }).candidate);
  };
  const envelope=(company,record)=>({schema_version:1,company_id:company.id,base_version:company.version,research:record});
  const commit=(company,proposal,preview,selectedFields=[],overwriteFields=[])=>({companyId:company.id,proposal,reviewToken:preview.reviewToken,selectedFields,overwriteFields,acceptInsight:true,operationId:randomUUID(),confirm:'apply_enrichment'});
  try{
    for(let index=0;index<2;index++){
      const email=`research-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
      const user=await request('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});users.push(user);
      await request('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
      const auth=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});accounts.push({user,email,password,jwt:auth.access_token});
    }
    const [owner,other]=accounts;
    const seedCompany=async(account,name)=>(await request('/rest/v1/crm_companies',{method:'POST',jwt:account.jwt,representation:true,body:{owner_id:account.user.id,company_name:name,website:'https://enrichment.example/',country:'SK',industry:'Manually selected industry',short_description:'Keep the manual company description.',fit:'LOW',services:['Web'],pipeline_status:'PRESENTATION_READY',priority:'HIGH',lead_source:'Referral',estimated_value:'12345.67',value_type:'ONE_TIME',instagram:'https://instagram.com/private-fixture-reference'}}))[0];
    const company=await seedCompany(owner,'Enrichment linked fixture'),manual=await seedCompany(owner,'Enrichment manual fixture'),privateCompany=await seedCompany(other,'Other private enrichment company');
    const {candidate:original}=validateResearchCandidate({company_name:company.company_name,website:company.website,country:company.country,research_summary:'Original approved research remains immutable.',fit:'MEDIUM',fit_reason:'Original research assessment.',suggested_pitch_angle:'Original approved pitch.'}),{normalized_company_name,...storedCandidate}=original,candidateId=randomUUID();
    await request('/rest/v1/crm_research_candidates',{method:'POST',body:{...storedCandidate,id:candidateId,owner_id:owner.user.id,research_status:'APPROVED',approved_company_id:company.id,approved_at:new Date().toISOString()}});
    const readCompany=async id=>(await request(`/rest/v1/crm_companies?id=eq.${id}&owner_id=eq.${owner.user.id}&select=*`,{jwt:owner.jwt}))[0];
    const readCandidate=async()=>(await request(`/rest/v1/crm_research_candidates?id=eq.${candidateId}&select=*`,{jwt:owner.jwt}))[0];
    const reports=()=>request(`/rest/v1/crm_company_research?company_id=eq.${company.id}&owner_id=eq.${owner.user.id}&select=*&order=company_version`,{jwt:owner.jwt});
    const originalCandidate=await readCandidate();
    server=createApp({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
    const errors=[];page.on('pageerror',error=>errors.push(error.message));let lastCommit;
    page.on('request',request=>{if(request.url().includes('action=crm-research-enrich-commit'))lastCommit=request.postDataJSON();});
    await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.enrichmentCopied=text;}}}));
    await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/admin/leads/'+company.id);
    await page.locator('#signin [name=email]').fill(owner.email);await page.locator('#signin [name=password]').fill(owner.password);await page.locator('#signin button').click();
    const panel=page.locator('[data-company-insight]');await expect(panel).toContainText('Original approved pitch.');
    await panel.getByRole('button',{name:'Research again',exact:true}).click();let dialog=page.getByRole('dialog');
    await dialog.getByRole('button',{name:'Prepare prompt',exact:true}).click();await expect(dialog.getByLabel('Company research prompt',{exact:true})).toHaveValue(/Enrichment linked fixture/);
    const prompt=await dialog.getByLabel('Company research prompt',{exact:true}).inputValue();expect(prompt).toContain(company.id);expect(prompt).toContain('ENRICHMENT');expect(prompt).not.toContain(owner.email);expect(prompt).not.toContain('12345.67');expect(prompt).not.toContain('private-fixture-reference');
    await dialog.getByRole('button',{name:'Copy prompt',exact:true}).click();expect(await page.evaluate(()=>window.enrichmentCopied)).toBe(prompt);expect(await reports()).toHaveLength(0);
    const proposedResearch=research(company),proposal=envelope(company,proposedResearch),json=JSON.stringify(proposal);
    await dialog.getByLabel('Company research JSON',{exact:true}).fill(json);await dialog.getByRole('button',{name:'Preview enrichment',exact:true}).click();
    await expect(dialog.locator('[data-enrich-select]:checked')).toHaveCount(0);await expect(dialog.getByLabel('Accept this AI Insight',{exact:true})).not.toBeChecked();
    for(const key of ['city','industry','services','fit'])await dialog.locator(`[data-enrich-select="${key}"]`).check();
    await dialog.getByLabel('Accept this AI Insight',{exact:true}).check();await expect(dialog.getByRole('button',{name:'Apply 4 selected changes',exact:true})).toBeDisabled();
    for(const key of ['industry','services','fit'])await dialog.locator(`[data-enrich-overwrite="${key}"]`).check();
    await dialog.getByRole('button',{name:'Apply 4 selected changes',exact:true}).click();await expect(dialog.getByRole('button',{name:'Done',exact:true})).toBeVisible();
    const submitted=structuredClone(lastCommit);expect([...submitted.selectedFields].sort()).toEqual(['city','fit','industry','services']);expect([...submitted.overwriteFields].sort()).toEqual(['fit','industry','services']);
    let saved=await readCompany(company.id);expect(saved.version).toBe(company.version+1);expect(saved).toMatchObject({city:'Bratislava',industry:'Furniture',fit:'HIGH',services:['Product CGI','Product Animation'],short_description:company.short_description});
    for(const field of ['company_name','website','country','pipeline_status','priority','lead_source','estimated_value','value_type','instagram','linkedin'])expect(saved[field]).toEqual(company[field]);
    expect(await readCandidate()).toEqual(originalCandidate);const storedReports=await reports();expect(storedReports).toHaveLength(1);expect(storedReports[0].research).toEqual(proposedResearch);
    const replay=await appPost('crm-research-enrich-commit',submitted);expect(replay.status()).toBe(200);expect((await replay.json()).replayed).toBe(true);expect(await reports()).toHaveLength(1);
    await dialog.getByRole('button',{name:'Done',exact:true}).click();await expect(panel).toContainText(proposedResearch.suggested_pitch_angle);await expect(panel).toContainText('Product Animation');
    await expect(panel.getByRole('link',{name:/approved research|research and sources/i})).toHaveAttribute('href','/admin/ai-research/'+candidateId);
    await panel.locator(`[data-insight-report="${storedReports[0].id}"]`).click();
    const historyDialog=page.getByRole('dialog');await expect(historyDialog).toContainText('Accepted CRM changes');await expect(historyDialog).toContainText(company.industry);await expect(historyDialog).toContainText(proposedResearch.suggested_pitch_angle);
    await historyDialog.getByRole('button',{name:'Close report',exact:true}).click();
    await panel.evaluate(element=>element.scrollIntoView({block:'start'}));await page.screenshot({path:'.cache/research-enrich-live-desktop.png'});
    await page.setViewportSize({width:390,height:844});await panel.evaluate(element=>element.scrollIntoView({block:'start'}));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'.cache/research-enrich-live-mobile.png'});
    const reportResponse=await appRead('crm-research-insight-report',{companyId:company.id,id:storedReports[0].id});expect(reportResponse.status()).toBe(200);expect((await reportResponse.json()).report.research.sources).toEqual(proposedResearch.sources);
    expect((await appRead('crm-research-insight',{companyId:privateCompany.id})).status()).toBe(404);
    expect((await appRead('crm-research-insight-report',{companyId:manual.id,id:storedReports[0].id})).status()).toBe(404);
    expect(await request(`/rest/v1/crm_company_research?company_id=eq.${company.id}&select=id`,{jwt:other.jwt})).toEqual([]);

    // Later manual edits invalidate old previews and leave original reports unchanged.
    await request(`/rest/v1/crm_companies?id=eq.${company.id}&owner_id=eq.${owner.user.id}`,{method:'PATCH',jwt:owner.jwt,body:{fit:'LOW',industry:'Manual correction after research'}});saved=await readCompany(company.id);
    expect((await appPost('crm-research-enrich-commit',{...submitted,operationId:randomUUID()})).status()).toBe(409);
    const noOpProposal=envelope(saved,proposedResearch),noOpPreview=await appPost('crm-research-enrich-preview',{companyId:company.id,proposal:noOpProposal});expect(noOpPreview.status()).toBe(200);
    const noOp=await appPost('crm-research-enrich-commit',commit(saved,noOpProposal,await noOpPreview.json()));expect(noOp.status()).toBe(200);expect((await noOp.json()).no_change).toBe(true);expect((await readCompany(company.id)).version).toBe(saved.version);expect(await reports()).toHaveLength(1);
    const laterResearch={...proposedResearch,suggested_pitch_angle:'A separately accepted refreshed pitch.'},laterProposal=envelope(saved,laterResearch),laterPreview=await appPost('crm-research-enrich-preview',{companyId:company.id,proposal:laterProposal});expect(laterPreview.status()).toBe(200);
    const laterBody=commit(saved,laterProposal,await laterPreview.json()),later=await appPost('crm-research-enrich-commit',laterBody);expect(later.status()).toBe(200);
    const afterReportOnly=await readCompany(company.id);expect(afterReportOnly.version).toBe(saved.version+1);for(const field of ['fit','industry','services','short_description','pipeline_status','estimated_value'])expect(afterReportOnly[field]).toEqual(saved[field]);
    expect(await reports()).toHaveLength(2);expect((await reports())[0].research).toEqual(proposedResearch);expect(await readCandidate()).toEqual(originalCandidate);
    const historyResponse=await appRead('crm-research-insight',{companyId:company.id});expect(historyResponse.status()).toBe(200);expect((await historyResponse.json()).history).toHaveLength(2);

    // Manually created companies have the same research path without a candidate.
    const manualRead=await appRead('crm-research-insight',{companyId:manual.id});expect(manualRead.status()).toBe(200);expect(await manualRead.json()).toMatchObject({insight:null,approved_candidate:null});
    expect((await appRead('crm-research-enrich-prompt',{companyId:manual.id})).status()).toBe(200);
    const manualProposal=envelope(manual,research(manual)),manualPreview=await appPost('crm-research-enrich-preview',{companyId:manual.id,proposal:manualProposal});expect(manualPreview.status()).toBe(200);
    expect((await appPost('crm-research-enrich-commit',commit(manual,manualProposal,await manualPreview.json()))).status()).toBe(200);expect((await readCompany(manual.id)).fit).toBe('LOW');
    // Two independently reviewed reports for one version cannot both advance it.
    const manualCurrent=await readCompany(manual.id),raceProposals=['First competing report.','Second competing report.'].map(pitch=>envelope(manualCurrent,{...manualProposal.research,suggested_pitch_angle:pitch}));
    const racePreviews=await Promise.all(raceProposals.map(proposal=>appPost('crm-research-enrich-preview',{companyId:manual.id,proposal})));
    for(const response of racePreviews)expect(response.status()).toBe(200);
    const raceBodies=await Promise.all(racePreviews.map(async(response,index)=>commit(manualCurrent,raceProposals[index],await response.json())));
    const raceResults=await Promise.all(raceBodies.map(body=>appPost('crm-research-enrich-commit',body)));expect(raceResults.map(response=>response.status()).sort()).toEqual([200,409]);
    expect((await readCompany(manual.id)).version).toBe(manualCurrent.version+1);
    expect(await request(`/rest/v1/crm_company_research?company_id=eq.${manual.id}&select=id`,{jwt:owner.jwt})).toHaveLength(2);
    await request(`/rest/v1/crm_companies?id=eq.${company.id}&owner_id=eq.${owner.user.id}`,{method:'PATCH',jwt:owner.jwt,body:{archived_at:new Date().toISOString()}});
    expect((await appRead('crm-research-enrich-prompt',{companyId:company.id})).status()).toBe(409);expect((await appRead('crm-research-insight',{companyId:company.id})).status()).toBe(200);
    expect((await appPost('crm-research-enrich-commit',laterBody)).status()).toBe(200);expect(await reports()).toHaveLength(2);
    await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Sign out'}).click();await expect(page.locator('#signin')).toBeVisible();signedOut=true;expect((await appRead('crm-research-insight',{companyId:company.id})).status()).toBe(401);expect(errors).toEqual([]);
  }finally{
    const failures=[];
    if(server&&origin&&!signedOut){try{const response=await appPost('logout',{});if(![200,401].includes(response.status()))failures.push('Application sign-out failed: '+response.status());}catch{failures.push('Application sign-out request failed.');}}
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    for(const user of users){for(const path of [`/rest/v1/crm_research_candidates?owner_id=eq.${user.id}`,`/rest/v1/crm_activities?owner_id=eq.${user.id}`,`/rest/v1/crm_companies?owner_id=eq.${user.id}`,`/rest/v1/presentation_admins?user_id=eq.${user.id}`,`/auth/v1/admin/users/${user.id}`]){try{await request(path,{method:'DELETE'});}catch(error){failures.push(error.message);}}}
    if(failures.length)throw new Error('Enrichment fixture cleanup failed: '+failures.join('; '));
  }
});
