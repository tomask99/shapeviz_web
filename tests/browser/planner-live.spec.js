import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../server.js';
test.use({trace:'off',screenshot:'off'});

test('live Planner saves a personal project with notes, priority and task progress',async({page})=>{
 test.skip(process.env.LIVE_PLANNER!=='true','Opt-in isolated temporary owner, removed in finally.');test.setTimeout(120000);process.loadEnvFile('.env');
 const env={...process.env,SITE_URL:'',VERCEL:''},email=`planner-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();let user,server;
 const db=async(path,{method='GET',body}={})=>{
  const response=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new Error(`Fixture ${method} ${path.split('?')[0]} failed (${response.status})`);const text=await response.text();return text?JSON.parse(text):null;
 };
 try{
  user=await db('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});await db('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
  let origin=process.env.LIVE_PLANNER_URL;
  if(!origin){server=createApp({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;}
  const login=await page.request.post(origin+'/api/admin?action=login',{headers:{Origin:origin},data:{email,password}});expect(login.status()).toBe(200);
  await page.goto(origin+'/admin/planner');await expect(page.getByRole('button',{name:'New project',exact:true})).toBeEnabled();await expect(page.locator('[data-planner-error]')).toBeEmpty();
  await page.getByRole('button',{name:'New project',exact:true}).click();const card=page.getByRole('form',{name:'Personal project'});
  await card.getByLabel('Title',{exact:true}).fill('Planner verification project');await card.getByLabel('Notes').fill('Temporary verification of live persistence.');await card.getByLabel('Priority').selectOption('3');
  await card.getByRole('button',{name:'Add task',exact:true}).click();await card.getByLabel('Task description').fill('Verify database');await card.getByRole('button',{name:'Save',exact:true}).click();await expect(card.getByRole('status')).toHaveText('Saved');
  await card.getByLabel('Complete task').check();await expect(card.getByRole('status')).toHaveText('Saved');await page.reload();await expect(card.getByRole('progressbar')).toHaveAttribute('value','100');await expect(card.getByLabel('Priority')).toHaveValue('3');await expect(card.getByLabel('Notes')).toHaveValue('Temporary verification of live persistence.');
  const rows=await db('/rest/v1/workspace_planner?owner_id=eq.'+user.id+'&select=priority,checklist');expect(rows).toHaveLength(1);expect(rows[0].priority).toBe(3);expect(rows[0].checklist[0].done).toBe(true);
  page.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Delete project',exact:true}).click();await expect(card).toHaveCount(0);
 }finally{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(user)await db('/auth/v1/admin/users/'+user.id,{method:'DELETE'});
 }
});
