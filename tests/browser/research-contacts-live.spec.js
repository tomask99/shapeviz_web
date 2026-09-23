import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../server.js';
import {validateResearchCandidate} from '../../src/research/validation.js';

test.use({trace:'off',screenshot:'off'});
test('live contact research stages evidence and explicitly creates contacts after Lead approval',async({page})=>{
  test.skip(process.env.LIVE_RESEARCH_TEST!=='true','Opt-in isolated Supabase owners; fixtures cleaned in finally');
  test.setTimeout(240000);
  process.loadEnvFile('.env');
  const env={...process.env,SUPABASE_URL:'https://psqykqbewphchalfyrsp.supabase.co',SITE_URL:'',VERCEL:'',PRESENTATIONS_REMOTE:'true',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
  const accounts=[],fixtureUsers=[];
  let server,origin,signedOut=false;
  const request=async(path,{method='GET',body,jwt,representation=false}={})=>{
    const response=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',...(jwt?{Authorization:`Bearer ${jwt}`}:{ }),...(representation?{Prefer:'return=representation'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Object.assign(new Error(`Contacts fixture ${method} ${path.split('?')[0]} failed: ${response.status}`),{status:response.status});
    const text=await response.text();return text?JSON.parse(text):null;
  };
  const appPost=(action,body)=>page.request.post(origin+'/api/admin?action='+action,{headers:{Origin:origin},data:body});
  const appRead=(action,id)=>page.request.get(origin+'/api/admin?'+new URLSearchParams({action,id}));
  const contact=(full_name,email,roleStatus='VERIFIED')=>{
    const source='https://contact-research.example/team';
    const evidence=status=>({status,confidence:'HIGH',evidence:'Fictional public team page used only in this test.',source_urls:[source]});
    return {full_name,job_title:'Marketing manager',email,phone:'',linkedin:'',confidence:'HIGH',sources:[{url:source,title:'Fictional public team',source_type:'About Page',retrieved_at:null,supports:['full_name','job_title','email']}],field_provenance:{full_name:evidence('VERIFIED'),job_title:evidence(roleStatus),email:evidence('VERIFIED')}};
  };
  try{
    for(let index=0;index<2;index++){
      const email=`research-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
      const user=await request('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});fixtureUsers.push(user);
      await request('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
      const auth=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
      accounts.push({user,email,password,jwt:auth.access_token});
    }
    const [owner,other]=accounts;
    const seed=async(account,name)=>{
      const {candidate}=validateResearchCandidate({company_name:name,website:'https://contact-research.example/',country:'SK'}),{normalized_company_name,...record}=candidate,id=randomUUID();
      await request('/rest/v1/crm_research_candidates',{method:'POST',body:{...record,id,owner_id:account.user.id,research_status:'NEEDS_REVIEW'}});
      return {...record,id,version:1};
    };
    const candidate=await seed(owner,'Contact research fixture'),otherCandidate=await seed(other,'Other private contact research');
    const readCandidate=async()=>(await request(`/rest/v1/crm_research_candidates?id=eq.${candidate.id}&select=*`,{jwt:owner.jwt}))[0];
    const contacts=()=>request(`/rest/v1/crm_contacts?owner_id=eq.${owner.user.id}&select=*&order=full_name`,{jwt:owner.jwt});
    const proposals=()=>request(`/rest/v1/crm_research_contacts?candidate_id=eq.${candidate.id}&owner_id=eq.${owner.user.id}&select=*&order=created_at,id`,{jwt:owner.jwt});
    server=createApp({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
    const errors=[];page.on('pageerror',error=>errors.push(error.message));let lastStage,lastDecision;
    page.on('request',request=>{if(request.url().includes('action=crm-research-contacts-commit'))lastStage=request.postDataJSON();if(request.url().includes('action=crm-research-contact-decide'))lastDecision=request.postDataJSON();});
    await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.contactCopiedPrompt=text;}}}));
    await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/admin/ai-research/'+candidate.id);
    await page.locator('#signin [name=email]').fill(owner.email);await page.locator('#signin [name=password]').fill(owner.password);await page.locator('#signin button').click();
    await expect(page.getByRole('heading',{name:'Contact research fixture.'})).toBeVisible();
    await page.getByRole('button',{name:'Find contacts',exact:true}).click();let dialog=page.getByRole('dialog');
    await dialog.getByRole('button',{name:'Prepare prompt',exact:true}).click();await expect(dialog.getByLabel('Contact research prompt',{exact:true})).toHaveValue(/Contact research fixture/);
    const prompt=await dialog.getByLabel('Contact research prompt',{exact:true}).inputValue();expect(prompt).toContain(candidate.id);expect(prompt).not.toContain('Other private contact research');expect(prompt).not.toContain(owner.email);
    await dialog.getByRole('button',{name:'Copy prompt',exact:true}).click();expect(await page.evaluate(()=>window.contactCopiedPrompt)).toBe(prompt);expect(await proposals()).toHaveLength(0);
    const people=[contact('Alice Fixture','alice@contact-research.example'),contact('Blair Fixture','blair@contact-research.example','INFERRED')];
    const json=JSON.stringify({schema_version:1,candidate_id:candidate.id,contacts:people});
    await dialog.getByLabel('Contact research JSON',{exact:true}).fill(json);await dialog.getByRole('button',{name:'Preview contacts',exact:true}).click();
    await expect(dialog).toContainText('Alice Fixture');await expect(dialog).toContainText('Blair Fixture');
    const selections=dialog.locator('[data-contact-select]');await expect(selections).toHaveCount(2);await expect(dialog.locator('[data-contact-select]:checked')).toHaveCount(0);
    await selections.nth(0).check();await selections.nth(1).check();
    await dialog.getByRole('button',{name:'Save 2 selected proposals',exact:true}).click();
    await expect(dialog.locator('[data-contact-proposal]')).toHaveCount(2);
    const stageBody=structuredClone(lastStage),initialProposalRows=await proposals();expect(initialProposalRows).toHaveLength(2);expect(await contacts()).toHaveLength(0);expect((await readCandidate()).version).toBe(1);
    const stageReplay=await appPost('crm-research-contacts-commit',stageBody);expect(stageReplay.status()).toBe(200);expect(await proposals()).toHaveLength(2);
    const first=initialProposalRows.find(row=>row.proposal.full_name==='Alice Fixture'),second=initialProposalRows.find(row=>row.proposal.full_name==='Blair Fixture');
    const decision=(row,action='create')=>({id:row.id,version:row.version,operationId:randomUUID(),decision:action,confirm:action==='create'?'create_contact':'dismiss_contact'});
    expect((await appPost('crm-research-contact-decide',decision(first))).status()).toBe(409);
    const duplicatePreview=await appPost('crm-research-contacts-preview',{id:candidate.id,json});expect(duplicatePreview.status()).toBe(200);expect((await duplicatePreview.json()).rows.every(row=>row.duplicates.length>0)).toBe(true);
    expect((await appRead('crm-research-contacts',otherCandidate.id)).status()).toBe(404);
    expect(await request(`/rest/v1/crm_research_contacts?candidate_id=eq.${candidate.id}&select=id`,{jwt:other.jwt})).toEqual([]);

    const approvalPreviewResponse=await appPost('crm-research-approval-preview',{id:candidate.id,version:1,priority:'MEDIUM',services:[]});expect(approvalPreviewResponse.status()).toBe(200);const approvalPreview=await approvalPreviewResponse.json();
    const approve=await appPost('crm-research-approve',{id:candidate.id,version:1,operationId:randomUUID(),reviewToken:approvalPreview.reviewToken,acknowledgeDuplicates:false,confirm:'approve'});expect(approve.status()).toBe(200);
    const approved=await readCandidate();expect(approved.research_status).toBe('APPROVED');expect(await contacts()).toHaveLength(0);
    await page.goto(origin+'/admin/ai-research/'+candidate.id);await page.getByRole('button',{name:'Find contacts',exact:true}).click();dialog=page.getByRole('dialog');
    const firstCard=dialog.locator('[data-contact-proposal]').filter({hasText:'Alice Fixture'});await expect(firstCard).toBeVisible();
    await firstCard.getByRole('button',{name:'Create CRM contact',exact:true}).click();await dialog.getByRole('button',{name:'Confirm create contact',exact:true}).click();
    await expect(firstCard).toContainText('Created');
    const createBody=structuredClone(lastDecision),createReplay=await appPost('crm-research-contact-decide',createBody);expect(createReplay.status()).toBe(200);expect(await contacts()).toHaveLength(1);
    const concurrent=await Promise.all([appPost('crm-research-contact-decide',decision(second)),appPost('crm-research-contact-decide',decision(second))]);expect(concurrent.map(response=>response.status()).sort()).toEqual([200,409]);
    let stored=await contacts();expect(stored).toHaveLength(2);expect(stored.every(row=>row.primary_contact===false)).toBe(true);
    const alice=stored.find(row=>row.full_name==='Alice Fixture'),blair=stored.find(row=>row.full_name==='Blair Fixture');
    expect(alice.job_title).toBe('Marketing manager');expect(blair.job_title).toBe('');expect(blair.research_evidence.proposal.job_title).toBe('Marketing manager');expect(blair.research_evidence.proposal.field_provenance.job_title.status).toBe('INFERRED');
    expect(alice.research_evidence).toMatchObject({candidate_id:candidate.id,proposal_id:first.id,proposal:{email:people[0].email,sources:people[0].sources}});
    const snapshot=structuredClone(alice.research_evidence);
    const edit=await appPost('crm-contact-save',{companyId:approved.approved_company_id,id:alice.id,version:alice.version,full_name:alice.full_name,email:'manually-corrected@contact-research.example',job_title:'Updated manually',phone:'',linkedin:'',instagram:'',notes:'Manual correction after research.',primary_contact:false});expect(edit.status()).toBe(200);
    stored=await contacts();expect(stored.find(row=>row.id===alice.id).research_evidence).toEqual(snapshot);
    await page.goto(origin+'/admin/leads/'+approved.approved_company_id+'?tab=contacts');await expect(page.getByRole('heading',{name:'Contacts',exact:true})).toBeVisible();
    await expect(page.locator('.crm-entry').filter({hasText:'Alice Fixture'})).toContainText('Original reviewed research');
    const evidence=page.locator('.crm-entry').filter({hasText:'Alice Fixture'}).locator('details.research-contact-snapshot');await evidence.locator(':scope > summary').click();
    await expect(page.getByRole('link',{name:'Fictional public team'}).first()).toBeVisible();await evidence.locator(':scope > summary').scrollIntoViewIfNeeded();await page.screenshot({path:'.cache/research-contacts-live-desktop.png'});
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await evidence.locator(':scope > summary').scrollIntoViewIfNeeded();await page.screenshot({path:'.cache/research-contacts-live-mobile.png'});
    // Deleting a CRM contact preserves the CREATED history and prevents accidental recreation.
    const deleteResponse=await appPost('crm-contact-delete',{companyId:approved.approved_company_id,id:blair.id,version:blair.version,confirm:'delete'});expect(deleteResponse.status()).toBe(200);
    const retained=(await proposals()).find(row=>row.id===second.id);expect(retained.status).toBe('CREATED');expect(retained.created_contact_id).toBeNull();expect((await appPost('crm-research-contact-decide',decision(retained))).status()).toBe(409);
    expect((await readCandidate()).version).toBe(approved.version);
    await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Sign out'}).click();await expect(page.locator('#signin')).toBeVisible();signedOut=true;expect((await appRead('crm-research-contacts',candidate.id)).status()).toBe(401);expect(errors).toEqual([]);
  }finally{
    const failures=[];
    if(server&&origin&&!signedOut){try{const response=await appPost('logout',{});if(![200,401].includes(response.status()))failures.push('Application sign-out failed: '+response.status());}catch{failures.push('Application sign-out request failed.');}}
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    for(const user of fixtureUsers){
      const account=accounts.find(entry=>entry.user.id===user.id);
      // Contact activity triggers require the owner's verified UID even during fixture cleanup.
      if(account){try{await request(`/rest/v1/crm_contacts?owner_id=eq.${user.id}`,{method:'DELETE',jwt:account.jwt});}catch(error){failures.push(error.message);}}
      for(const path of [`/rest/v1/crm_research_candidates?owner_id=eq.${user.id}`,`/rest/v1/crm_activities?owner_id=eq.${user.id}`,`/rest/v1/crm_companies?owner_id=eq.${user.id}`,`/rest/v1/presentation_admins?user_id=eq.${user.id}`,`/auth/v1/admin/users/${user.id}`]){
        try{await request(path,{method:'DELETE'});}catch(error){failures.push(error.message);}
      }
    }
    if(failures.length)throw new Error('Contacts fixture cleanup failed: '+failures.join('; '));
  }
});
