import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createApp} from '../../server.js';
import {validateResearchCandidate} from '../../src/research/validation.js';
import {candidateProposal} from '../../src/research/refresh-domain.js';

test.use({trace:'off',screenshot:'off'});
test('live research refresh preserves evidence, protects manual fields, replays safely and competes atomically with approval',async({page})=>{
  test.skip(process.env.LIVE_RESEARCH_TEST!=='true','Opt-in isolated Supabase owner; all fixtures cleaned in finally');
  test.setTimeout(240000);
  process.loadEnvFile('.env');
  const env={...process.env,SUPABASE_URL:'https://psqykqbewphchalfyrsp.supabase.co',SITE_URL:'',VERCEL:'',PRESENTATIONS_REMOTE:'true',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
  const email=`research-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
  let user,server,origin,signedOut=false;
  const request=async(path,{method='GET',body,jwt}={})=>{
    const response=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',...(jwt?{Authorization:`Bearer ${jwt}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Object.assign(new Error(`Refresh fixture ${method} ${path.split('?')[0]} failed: ${response.status}`),{status:response.status});
    const text=await response.text();return text?JSON.parse(text):null;
  };
  const appPost=(action,body)=>page.request.post(origin+'/api/admin?action='+action,{headers:{Origin:origin},data:body});
  const envelope=(record,changes={},mode='deeper')=>({schema_version:1,candidate_id:record.id,base_version:record.version,mode,candidate:{...candidateProposal(record),...changes}});
  const commitBody=(record,proposal,preview,selectedFields,overwriteManualFields=[])=>({id:record.id,version:record.version,operationId:randomUUID(),proposal,selectedFields,overwriteManualFields,reviewToken:preview.reviewToken,confirm:'apply'});
  try {
    user=await request('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});
    await request('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
    const example=JSON.parse(await readFile(new URL('../../docs/examples/research-candidates.v1.json',import.meta.url),'utf8')).candidates[0];
    const seed=async(overrides)=>{
      const {candidate}=validateResearchCandidate({...example,...overrides}),{normalized_company_name,...record}=candidate,id=randomUUID();
      await request('/rest/v1/crm_research_candidates',{method:'POST',body:{...record,id,owner_id:user.id,research_status:'NEEDS_REVIEW'}});
      return {...record,id,version:1};
    };
    const candidate=await seed({company_name:'Live refreshed furniture'});
    const auth=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
    const readCandidate=async id=>(await request(`/rest/v1/crm_research_candidates?id=eq.${id}&select=*`,{jwt:auth.access_token}))[0];
    const candidateCount=async()=>(await request(`/rest/v1/crm_research_candidates?owner_id=eq.${user.id}&select=id`,{jwt:auth.access_token})).length;
    const companyRows=()=>request(`/rest/v1/crm_companies?owner_id=eq.${user.id}&select=*`,{jwt:auth.access_token});
    server=createApp({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
    const errors=[];page.on('pageerror',error=>errors.push(error.message));let lastCommit;
    page.on('request',request=>{if(request.url().includes('action=crm-research-refresh-commit'))lastCommit=request.postDataJSON();});
    await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/admin/ai-research/'+candidate.id);
    await page.locator('#signin [name=email]').fill(email);await page.locator('#signin [name=password]').fill(password);await page.locator('#signin button').click();
    await expect(page.getByRole('heading',{name:'Live refreshed furniture.'})).toBeVisible();
    await page.getByRole('button',{name:'Edit candidate',exact:true}).click();let dialog=page.getByRole('dialog');
    await dialog.getByRole('combobox',{name:'Fit',exact:true}).selectOption('MEDIUM');await dialog.getByLabel('Fit reason',{exact:true}).fill('Manual assessment before further research.');await dialog.getByRole('button',{name:'Save candidate',exact:true}).click();await expect(dialog).toHaveCount(0);
    let saved=await readCandidate(candidate.id);expect(saved.version).toBe(2);expect(saved.manual_fields).toEqual(expect.arrayContaining(['fit','fit_reason']));
    const before=structuredClone(saved),initialCount=await candidateCount(),sourceURL='https://furniture.example/professionals?lang=cs',researchedAt=new Date().toISOString();
    const newSource={url:sourceURL,title:'Fictional professional resource',source_type:'Professional / Architect Page',retrieved_at:researchedAt,supports:['city']};
    const proposal=envelope(saved,{research_summary:'Updated fixture research after checking additional public sources.',city:'Brno',field_provenance:{...saved.field_provenance,city:{status:'VERIFIED',confidence:'HIGH',evidence:'The fictional professional page identifies the Brno office.',source_urls:[sourceURL]}},fit:'LOW',fit_reason:'New evidence suggests a smaller opportunity than the manual assessment.',sources:[{...saved.sources[0],title:'Attempted rewrite of an existing citation'},...saved.sources.slice(1),newSource],last_researched_at:researchedAt});
    await page.getByRole('button',{name:'Research deeper',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Prepare prompt'}).click();
    await expect(dialog.getByLabel('Candidate research prompt')).toHaveValue(/DEEPER RESEARCH/);await expect(dialog.getByLabel('Candidate research prompt')).toHaveAttribute('readonly','');expect(await dialog.getByLabel('Candidate research prompt').inputValue()).toContain(candidate.id);
    expect((await readCandidate(candidate.id)).version).toBe(before.version);expect(await candidateCount()).toBe(initialCount);
    await dialog.getByLabel('Research update JSON',{exact:true}).fill(JSON.stringify(proposal));await dialog.getByRole('button',{name:'Preview updates',exact:true}).click();await expect(dialog.getByRole('heading',{name:'3. Choose the updates to apply'})).toBeVisible();
    await expect(dialog.locator('[data-refresh-select]:checked')).toHaveCount(0);await expect(dialog).toContainText('Existing source metadata was retained');
    await dialog.getByLabel('Apply Research summary',{exact:true}).check();await dialog.getByLabel('Apply Fit and reason',{exact:true}).check();await expect(dialog.getByRole('button',{name:'Apply 2 selected updates'})).toBeDisabled();await dialog.getByLabel('Replace my manual review of Fit and reason').check();
    await dialog.getByLabel('Apply City',{exact:true}).check();await dialog.getByLabel('Apply Last researched',{exact:true}).check();
    await dialog.getByRole('button',{name:'Apply 4 selected updates'}).click();await expect(dialog.locator('[data-refresh-error]')).toContainText('Also select Add research sources');await expect(dialog.getByLabel('Research update JSON')).toHaveValue(JSON.stringify(proposal));
    expect((await readCandidate(candidate.id)).version).toBe(before.version);expect(await companyRows()).toHaveLength(0);
    await dialog.getByRole('button',{name:'Preview updates',exact:true}).click();await expect(dialog.getByRole('heading',{name:'3. Choose the updates to apply'})).toBeVisible();
    for(const name of ['City','Research summary','Fit and reason','Add research sources','Last researched'])await dialog.getByLabel('Apply '+name,{exact:true}).check();
    await dialog.getByLabel('Replace my manual review of Fit and reason').check();
    await dialog.locator('[data-refresh-group]').first().scrollIntoViewIfNeeded();await page.screenshot({path:'.cache/research-refresh-live-desktop.png'});await page.setViewportSize({width:390,height:844});expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);await dialog.getByText('Replace my manual review of Fit and reason with this proposal.',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'.cache/research-refresh-live-mobile.png'});
    await dialog.getByRole('button',{name:'Apply 5 selected updates'}).click();await expect(dialog.getByRole('heading',{name:'Research updated.'})).toBeVisible();
    const reviewedBody=structuredClone(lastCommit);expect(reviewedBody.overwriteManualFields).toEqual(['fit']);
    saved=await readCandidate(candidate.id);expect(saved.version).toBe(before.version+1);expect(saved).toMatchObject({id:candidate.id,company_name:before.company_name,city:'Brno',fit:'LOW',research_summary:proposal.candidate.research_summary});expect(saved.manual_fields).toEqual(before.manual_fields);expect(Date.parse(saved.last_researched_at)).toBe(Date.parse(researchedAt));
    expect(saved.sources.slice(0,before.sources.length)).toEqual(before.sources);expect(saved.sources.map(source=>source.url)).toEqual([...before.sources.map(source=>source.url),sourceURL]);expect(saved.field_provenance.city).toEqual(proposal.candidate.field_provenance.city);expect(await candidateCount()).toBe(initialCount);expect(await companyRows()).toHaveLength(0);
    const replay=await appPost('crm-research-refresh-commit',reviewedBody);expect(replay.status()).toBe(200);expect(await replay.json()).toMatchObject({replayed:true,candidate_id:candidate.id});expect((await readCandidate(candidate.id)).version).toBe(saved.version);
    await dialog.getByRole('button',{name:'Done',exact:true}).click();await expect(page.locator('.research-history')).toContainText('Research refreshed');await expect(page.getByRole('heading',{name:'Shapeviz Fit'}).locator('..')).toContainText('Manually reviewed');await expect(page.locator('.research-detail-meta')).not.toContainText('Last researched: Not recorded');await expect(page.getByRole('link',{name:'Fictional professional resource'})).toHaveAttribute('href',sourceURL);
    const events=await request(`/rest/v1/crm_research_events?candidate_id=eq.${candidate.id}&event_type=eq.candidate_refreshed&select=id`,{jwt:auth.access_token});expect(events).toHaveLength(1);
    await expect(request('/rest/v1/rpc/crm_research_refresh',{method:'POST',jwt:auth.access_token,body:{p_owner:user.id,p_id:candidate.id,p_operation:randomUUID(),p_hash:'a'.repeat(64),p_version:saved.version,p_candidate:null,p_mode:'refresh',p_selected:['research_summary'],p_overrides:[]}})).rejects.toMatchObject({status:403});

    const staleProposal=envelope(saved,{research_summary:'A proposal that will become stale.'},'refresh');
    const previewResponse=await appPost('crm-research-refresh-preview',{id:saved.id,version:saved.version,proposal:staleProposal});expect(previewResponse.status()).toBe(200);const stalePreview=await previewResponse.json();
    const editResponse=await appPost('crm-research-save',{id:saved.id,version:saved.version,operationId:randomUUID(),candidate:{...candidateProposal(saved),suggested_pitch_angle:'A later manual pitch correction.'}});expect(editResponse.status()).toBe(200);
    const staleCommit=await appPost('crm-research-refresh-commit',commitBody(saved,staleProposal,stalePreview,['research_summary']));expect(staleCommit.status()).toBe(409);const afterStale=await readCandidate(candidate.id);expect(afterStale.research_summary).toBe(saved.research_summary);expect(afterStale.suggested_pitch_angle).toBe('A later manual pitch correction.');expect(await candidateCount()).toBe(initialCount);

    const race=await seed({company_name:'Refresh approval race fixture',website:`https://refresh-race-${randomUUID().slice(0,8)}.example`}),raceProposal=envelope(race,{research_summary:'Research update competing with approval.'},'refresh');
    const raceRefreshResponse=await appPost('crm-research-refresh-preview',{id:race.id,version:race.version,proposal:raceProposal});expect(raceRefreshResponse.status()).toBe(200);const raceRefreshPreview=await raceRefreshResponse.json();
    const raceApprovalResponse=await appPost('crm-research-approval-preview',{id:race.id,version:race.version,priority:'MEDIUM',services:['Product CGI']});expect(raceApprovalResponse.status()).toBe(200);const raceApprovalPreview=await raceApprovalResponse.json();expect(raceApprovalPreview.can_approve).toBe(true);
    const competing=await Promise.all([appPost('crm-research-refresh-commit',commitBody(race,raceProposal,raceRefreshPreview,['research_summary'])),appPost('crm-research-approve',{id:race.id,version:race.version,operationId:randomUUID(),reviewToken:raceApprovalPreview.reviewToken,acknowledgeDuplicates:false,confirm:'approve'})]);
    expect(competing.map(response=>response.status()).sort()).toEqual([200,409]);const raceSaved=await readCandidate(race.id),companies=await companyRows();expect(raceSaved.version).toBe(2);expect(await candidateCount()).toBe(initialCount+1);
    if(competing[0].status()===200){expect(raceSaved).toMatchObject({research_status:'NEEDS_REVIEW',research_summary:raceProposal.candidate.research_summary,approved_company_id:null});expect(companies).toHaveLength(0);}
    else{expect(raceSaved).toMatchObject({research_status:'APPROVED',research_summary:race.research_summary});expect(companies).toHaveLength(1);expect(companies[0].id).toBe(raceSaved.approved_company_id);expect(companies[0]).toMatchObject({company_name:race.company_name,website:race.website,fit:race.fit,lead_source:'AI Research'});}
    const raceEvents=await request(`/rest/v1/crm_research_events?candidate_id=eq.${race.id}&select=event_type`,{jwt:auth.access_token});expect(raceEvents).toHaveLength(1);expect(raceEvents[0].event_type).toBe(competing[0].status()===200?'candidate_refreshed':'candidate_approved');
    await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Sign out'}).click();await expect(page.locator('#signin')).toBeVisible();signedOut=true;expect((await page.request.get(origin+'/api/admin?action=crm-research-detail&id='+candidate.id)).status()).toBe(401);expect(errors).toEqual([]);
  } finally {
    const failures=[];
    if(server&&origin&&!signedOut){try{const response=await appPost('logout',{});if(![200,401].includes(response.status()))failures.push('Application sign-out failed: '+response.status());}catch{failures.push('Application sign-out request failed.');}}
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(user){for(const path of [`/rest/v1/crm_research_candidates?owner_id=eq.${user.id}`,`/rest/v1/crm_activities?owner_id=eq.${user.id}`,`/rest/v1/crm_companies?owner_id=eq.${user.id}`,`/rest/v1/presentation_admins?user_id=eq.${user.id}`,`/auth/v1/admin/users/${user.id}`]){try{await request(path,{method:'DELETE'});}catch(error){failures.push(error.message);}}}
    if(failures.length)throw new Error('Refresh fixture cleanup failed: '+failures.join('; '));
  }
});
