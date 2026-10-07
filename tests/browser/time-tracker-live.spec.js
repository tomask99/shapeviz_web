import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../server.js';
import {euro} from '../../public/admin/time-values.js';
test.use({trace:'off',screenshot:'off'});

test('live hourly project, concurrent starts, persistent timer and manual earnings',async({page,context})=>{
 test.skip(process.env.LIVE_TIME_TRACKER!=='true','Opt-in temporary owner and isolated records, cleaned in finally.');test.setTimeout(180000);process.loadEnvFile('.env');
 const env={...process.env,SITE_URL:'',VERCEL:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
 const email=`time-test-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();let user,server;
 const db=async(path,{method='GET',body,jwt}={})=>{const r=await fetch(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',...(jwt?{Authorization:'Bearer '+jwt}:{})},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error(`Fixture ${method} ${path.split('?')[0]} failed (${r.status})`);const text=await r.text();return text?JSON.parse(text):null;};
 try{
  user=await db('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});await db('/rest/v1/presentation_admins',{method:'POST',body:{user_id:user.id,role:'owner'}});
  server=createApp({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const postRaw=(action,body)=>page.request.post(origin+'/api/admin?action='+action,{headers:{Origin:origin},data:body});
  const post=async(action,body,status=200)=>{const r=await postRaw(action,body),d=await r.json();expect(r.status(),d.error||action).toBe(status);return d;};
  const get=async(action,params={})=>{const r=await page.request.get(origin+'/api/admin?'+new URLSearchParams({action,...params})),d=await r.json();expect(r.status(),d.error||action).toBe(200);return d;};
  await post('login',{email,password});const client=await post('crm-client-create',{requestId:randomUUID(),company_name:'Time verification client'}),companyId=client.company.id;
  const project=(await post('crm-project-save',{companyId,name:'Hourly verification',status:'ACTIVE',billing_type:'HOURLY',amount:'60,00',requestId:randomUUID()})).item,projectId=project.id;
  const fixed=(await post('crm-project-save',{companyId,name:'One-time verification',status:'ACTIVE',billing_type:'ONE_TIME',amount:'1000',requestId:randomUUID()})).item;
  expect((await get('crm-time-options',{companyId})).items.map(p=>p.id)).toEqual([projectId]);
  await post('crm-time-start',{kind:'project',companyId,projectId:fixed.id,requestId:randomUUID()},400);
  const input={kind:'project',companyId,projectId};const starts=await Promise.all([postRaw('crm-time-start',{...input,requestId:randomUUID()}),postRaw('crm-time-start',{...input,requestId:randomUUID()})]);expect(starts.map(r=>r.status()).sort()).toEqual([200,409]);
  await page.goto(origin+'/admin/time-tracker');await expect(page.locator('[data-current] h2')).toHaveText('Hourly verification');await expect(page.locator('[data-clock]')).not.toHaveText('00:00:00');
  await page.getByRole('button',{name:'Pause',exact:true}).click();await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Resume',exact:true}).click();await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
  const second=await context.newPage();await second.goto(origin+'/admin/time-tracker');await expect(second.getByRole('button',{name:'Pause',exact:true})).toBeVisible();await second.close();
  const session=(await get('crm-time-open')).item;await expect(page.locator('[data-clock]')).not.toHaveText('00:00:00');
  const finish={id:session.id,version:session.version,requestId:randomUUID()};await post('crm-time-finish',finish);await post('crm-time-finish',finish);expect((await get('crm-time-open')).item).toBeNull();
  const manual={companyId,projectId,work_date:'2026-10-07',hours:'2.5',requestId:randomUUID()};const entry=await post('crm-time-manual-save',manual);await post('crm-time-manual-save',manual);
  expect((await get('crm-project-time',{companyId,projectId})).manual_seconds).toBe(9000);
  await post('crm-project-save',{companyId,id:projectId,version:project.version,name:project.name,status:'ACTIVE',billing_type:'HOURLY',amount:'90'});
  const history=await get('crm-time-history',{projectId});expect(history.items.find(r=>r.id===entry.id).rate_cents).toBe(6000);expect(history.items.filter(r=>r.source==='Tracked')).toHaveLength(1);
  await page.goto(origin+'/admin/clients/'+companyId+'?project='+projectId);await expect(page.locator('[data-totals]')).toContainText('02:30:00');await expect(page.locator('.project-price').first()).toHaveText('€90.00/h');
  await page.getByRole('button',{name:'Add time manually',exact:true}).click();const editor=page.getByRole('dialog');await editor.getByLabel('Date',{exact:true}).fill('2026-10-05');await editor.getByLabel('Start time',{exact:true}).fill('14:25');await editor.getByLabel('Hours',{exact:true}).fill('1');await editor.getByLabel('Minutes',{exact:true}).fill('15');await editor.getByRole('button',{name:'Save time',exact:true}).click();await expect(page.locator('[data-totals]')).toContainText('03:45:00');
  const timed=(await get('crm-time-history',{projectId})).items.find(r=>r.source==='Manual'&&r.id!==entry.id);expect(timed.work_date).toBe('2026-10-05');expect(timed.work_time).toBe('14:25:00');expect(timed.time_zone).toBe('Europe/Bratislava');expect(timed.duration_seconds).toBe(4500);expect(timed.earned_cents).toBe('11250');
  await page.locator('#nav-projects').click();await expect(page.locator('.workspace-project-card')).toHaveCount(2);await page.getByRole('button',{name:'Hourly verification',exact:true}).click();await expect(page.locator('.time-entry').filter({hasText:'14:25'})).toBeVisible();await page.getByRole('button',{name:'Close project details',exact:true}).click();
  const earned=(await get('crm-project-time',{companyId,projectId})).earned_cents;await page.locator('[data-view=all]').click();await expect(page.locator('[data-revenue=one_time] strong')).toHaveText(euro(100000n+BigInt(earned)));await expect(page.locator('[data-hourly-revenue]')).toHaveText(`Includes ${euro(earned)} of hourly work`);
  const updated=(await get('crm-project',{companyId,projectId})).item;await post('crm-project-delete',{companyId,projectId,version:updated.version,confirm:'delete'},409);
  const custom=await post('crm-time-start',{kind:'custom_activity',activity_name:'Learning Houdini',requestId:randomUUID()});await page.goto(origin+'/admin/time-tracker');await expect(page.locator('[data-current] h2')).toHaveText('Learning Houdini');await expect(page.locator('[data-clock]')).not.toHaveText('00:00:00');await page.getByRole('button',{name:'Finish',exact:true}).click();await expect(page.getByRole('button',{name:'Start tracking',exact:true})).toBeVisible();expect((await get('crm-time-detail',{id:custom.id})).item.rate_cents).toBeNull();
  await expect(page.locator('.time-entry')).toHaveCount(4);for(let left=4;left>0;left--){page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete time',exact:true}).first().click();await expect(page.locator('.time-entry')).toHaveCount(left-1);}
  expect((await get('crm-time-history')).items).toEqual([]);expect((await get('crm-project-time',{companyId,projectId})).earned_cents).toBe('0');await page.locator('[data-view=all]').click();await expect(page.locator('[data-revenue=one_time] strong')).toHaveText(euro(100000n));
 }finally{
  const failures=[];if(user){for(const table of ['crm_time_segments','crm_time_sessions','crm_time_manual','crm_project_tasks','crm_project_notes','crm_projects','crm_clients','crm_activities','crm_companies','presentation_admins']){try{await db(`/rest/v1/${table}?${table==='presentation_admins'?'user_id':'owner_id'}=eq.${user.id}`,{method:'DELETE'});}catch(e){failures.push(e.message);}}try{await db('/auth/v1/admin/users/'+user.id,{method:'DELETE'});}catch(e){failures.push(e.message);}}
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}expect(failures,'Temporary fixture cleanup').toEqual([]);
 }
});
