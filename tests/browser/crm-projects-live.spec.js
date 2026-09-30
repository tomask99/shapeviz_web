import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../server.js';
test.use({trace:'off',screenshot:'off'});
test('Live client projects persist through UI and API, enforce scope and calculate revenue once',async({page})=>{
 test.skip(process.env.LIVE_CLIENT_PROJECTS!=='true','Opt-in isolated temporary owner and records; cleaned in finally.');
 test.setTimeout(180000);process.loadEnvFile('.env');
 const env={...process.env,SITE_URL:'',VERCEL:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
 const email=`project-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();let user,server,origin;
 const db=async(path,{method='GET',body,jwt}={})=>{
  const response=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',...(jwt?{Authorization:'Bearer '+jwt}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new Error(`Fixture ${method} ${path.split('?')[0]} failed (${response.status})`);const raw=await response.text();return raw?JSON.parse(raw):null;
 };
 try{
  user=await db('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});
  await db('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
  const auth=await db('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  if(process.env.LIVE_CLIENT_PROJECTS_ORIGIN){
   const target=new URL(process.env.LIVE_CLIENT_PROJECTS_ORIGIN);
   if(target.protocol!=='http:'||!['localhost','127.0.0.1'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw new Error('Live project verification requires a local server origin.');
   origin=target.origin;
  }else{
   server=createApp({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  }
  const post=async(action,body,status=200)=>{const response=await page.request.post(origin+'/api/admin?action='+action,{headers:{Origin:origin},data:body});const data=await response.json();expect(response.status(),data.error||action).toBe(status);return data;};
  const get=async(action,params={},status=200)=>{const response=await page.request.get(origin+'/api/admin?'+new URLSearchParams({action,...params}));const data=await response.json();expect(response.status(),data.error||action).toBe(status);return data;};
  await post('login',{email,password});
  const client=await post('crm-client-create',{requestId:randomUUID(),company_name:'Isolated project workspace',website:'https://fixture.example',industry:'Furniture',short_description:'Test data'});const companyId=client.company.id;
  await page.goto(origin+'/admin/clients/'+companyId);await page.getByRole('button',{name:'New project',exact:true}).click();const editor=page.locator('#project-editor');await editor.getByLabel('Project name',{exact:true}).fill('Live render project');await editor.getByLabel('Price (EUR)',{exact:true}).fill('1500,25');await editor.getByLabel('Short description',{exact:true}).fill('Live project summary');await editor.getByRole('button',{name:'Create project',exact:true}).click();await expect(page.locator('.project-heading')).toContainText('Live render project',{timeout:20000});
  const projectId=new URL(page.url()).searchParams.get('project');expect(projectId).toBeTruthy();
  await page.getByLabel('Detailed brief',{exact:true}).fill('A detailed assignment.\nKeep <material> references & line breaks.');await page.getByRole('button',{name:'Save brief',exact:true}).click();await expect(page.locator('[data-brief-status]')).toHaveText('Saved');
  const taskPanel=page.locator('.project-tasks'),notePanel=page.locator('.project-notes');await taskPanel.locator('input[name=title]').fill('Prepare the model');await taskPanel.getByRole('button',{name:'Add task',exact:true}).click();await expect(taskPanel.getByRole('checkbox')).toBeVisible();await taskPanel.getByRole('checkbox').check();await expect(taskPanel.getByRole('checkbox')).toBeEnabled();
  await notePanel.getByLabel('New project note',{exact:true}).fill('Approved material sample.');await notePanel.getByRole('button',{name:'Save note',exact:true}).click();await expect(notePanel.locator('.client-note')).toContainText('Approved material sample.');
  await page.reload();await expect(page.getByLabel('Detailed brief',{exact:true})).toHaveValue('A detailed assignment.\nKeep <material> references & line breaks.');await expect(taskPanel.getByRole('checkbox')).toBeChecked();
  const stored=await get('crm-project',{companyId,projectId});expect(Number(stored.item.project_value)).toBe(1500.25);expect(stored.item.monthly_value).toBeNull();
  const monthlyBody={companyId,name:'Monthly content',status:'ACTIVE',description:'Monthly agreement',billing_type:'MONTHLY',amount:'600',requestId:randomUUID()};const monthly=await post('crm-project-save',monthlyBody);const retry=await post('crm-project-save',monthlyBody);expect(retry.item.id).toBe(monthly.item.id);
  await post('crm-project-save',{companyId,name:'Planned monthly',status:'PLANNED',billing_type:'MONTHLY',amount:'250',requestId:randomUUID()});
  await post('crm-project-save',{companyId,name:'Cancelled work',status:'CANCELLED',billing_type:'ONE_TIME',amount:'900',requestId:randomUUID()});
  await db(`/rest/v1/crm_companies?id=eq.${companyId}`,{method:'PATCH',jwt:auth.access_token,body:{won_project_value:99999,won_monthly_value:88888}});
  const overview=()=>get('crm-overview',{today:'2026-09-30T00:00:00.000Z',tomorrow:'2026-10-01T00:00:00.000Z'});
  let totals=(await overview()).revenue;expect(Number(totals.one_time.amount)).toBe(1500.25);expect(Number(totals.monthly.amount)).toBe(600);expect(totals.monthly.count).toBe(1);
  await page.goto(origin+'/admin/clients/'+companyId);const monthlyCard=page.locator(`[data-project-id="${monthly.item.id}"]`);
  await monthlyCard.getByRole('button',{name:'Pause project: Monthly content',exact:true}).click();await expect(monthlyCard.locator('.research-tag')).toHaveText('On hold');totals=(await overview()).revenue;expect(Number(totals.monthly.amount)).toBe(0);
  await monthlyCard.getByRole('button',{name:'Complete project: Monthly content',exact:true}).click();await expect(monthlyCard.locator('.research-tag')).toHaveText('Completed');totals=(await overview()).revenue;expect(Number(totals.monthly.amount)).toBe(0);
  await monthlyCard.getByRole('button',{name:'Reopen project: Monthly content',exact:true}).click();await expect(monthlyCard.locator('.research-tag')).toHaveText('Active');totals=(await overview()).revenue;expect(Number(totals.monthly.amount)).toBe(600);
  await monthlyCard.getByRole('button',{name:'Pause project: Monthly content',exact:true}).click();await expect(monthlyCard.locator('.research-tag')).toHaveText('On hold');const paused=await get('crm-project',{companyId,projectId:monthly.item.id});
  await post('crm-project-save',{...monthlyBody,id:monthly.item.id,version:paused.item.version,billing_type:'ONE_TIME',amount:'800'});totals=(await overview()).revenue;expect(Number(totals.one_time.amount)).toBe(2300.25);expect(Number(totals.monthly.amount)).toBe(0);
  await post('crm-project-brief-save',{companyId,projectId,version:1,brief:'Stale replacement'},409);
  const other=await post('crm-client-create',{requestId:randomUUID(),company_name:'Other isolated client'});await get('crm-project',{companyId:other.company.id,projectId},404);await post('crm-project-task-save',{companyId:other.company.id,projectId,title:'Wrong project'},404);
  expect((await get('crm-client-tasks',{companyId})).items).toHaveLength(0);expect((await get('crm-notes',{companyId})).items).toHaveLength(0);
  await post('crm-project-delete',{companyId,projectId,version:stored.item.version},400);await post('crm-project-delete',{companyId,projectId,version:1,confirm:'delete'},409);await post('crm-project-delete',{companyId:other.company.id,projectId,version:stored.item.version,confirm:'delete'},404);
  expect((await get('crm-project-tasks',{companyId,projectId})).items).toHaveLength(1);expect((await get('crm-project-notes',{companyId,projectId})).items).toHaveLength(1);
  await page.reload();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete project: Live render project',exact:true}).click();await expect(page.locator(`[data-project-id="${projectId}"]`)).toHaveCount(0);
  await get('crm-project',{companyId,projectId},404);expect(await db(`/rest/v1/crm_project_tasks?project_id=eq.${projectId}&select=id`,{jwt:auth.access_token})).toEqual([]);expect(await db(`/rest/v1/crm_project_notes?project_id=eq.${projectId}&select=id`,{jwt:auth.access_token})).toEqual([]);expect((await get('crm-client',{companyId})).item.company_id).toBe(companyId);
  totals=(await overview()).revenue;expect(Number(totals.one_time.amount)).toBe(800);
  await db(`/rest/v1/crm_companies?id=eq.${companyId}`,{method:'PATCH',jwt:auth.access_token,body:{archived_at:new Date().toISOString()}});totals=(await overview()).revenue;expect(Number(totals.one_time.amount)).toBe(0);expect(Number(totals.monthly.amount)).toBe(0);await post('crm-project-task-save',{companyId,projectId:monthly.item.id,title:'Archived write'},409);await post('crm-project-delete',{companyId,projectId:monthly.item.id,version:1,confirm:'delete'},409);
 }finally{
  const failures=[];
  if(user){for(const table of ['crm_project_tasks','crm_project_notes','crm_projects','crm_clients','crm_activities','crm_companies','presentation_admins']){try{await db(`/rest/v1/${table}?${table==='presentation_admins'?'user_id':'owner_id'}=eq.${user.id}`,{method:'DELETE'});}catch(error){failures.push(error.message);}}
   try{await db('/auth/v1/admin/users/'+user.id,{method:'DELETE'});}catch(error){failures.push(error.message);}}
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  expect(failures,'Temporary fixture cleanup').toEqual([]);
 }
});
