import {test,expect} from '@playwright/test';

async function fixture(page,changes={}){
  const state={signedIn:true,enabled:true,connections:[],writes:[],previewError:false,revokeError:false,logoutError:false,previewEmail:'owner@example.test',...changes};
  await page.route('**/api/admin?*',async route=>{
    const action=new URL(route.request().url()).searchParams.get('action'),body=route.request().method()==='POST'?route.request().postDataJSON():null;
    const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(action==='login'){state.signedIn=true;return reply({email:'owner@example.test'});}
    if(!state.signedIn)return reply({error:'Please sign in.'},401);
    if(action==='me')return reply({email:'owner@example.test'});
    if(action==='oauth-connections')return reply({enabled:state.enabled,connections:state.connections});
    if(action==='oauth-preview')return state.previewError?reply({error:'This request expired. Start connecting again.'},400):reply({review:'review-fixture',client_name:'ChatGPT <script>unsafe</script>',scopes:[{id:'crm:read',label:'Read company profiles and Leads'},{id:'research:read',label:'Read Research and evidence'}],expires_at:new Date(Date.now()+1800000).toISOString(),request_expires_at:new Date(Date.now()+600000).toISOString(),account_email:state.previewEmail});
    state.writes.push({action,body});
    if(action==='oauth-decide')return reply({redirect:`http://127.0.0.1:4173/fixture-callback?${body.approve?'code=test-code':'error=access_denied'}`});
    if(action==='oauth-disconnect'){if(state.revokeError)return reply({error:'Try disconnecting again.'},503);state.connections=state.connections.map(c=>c.id===body.id?{...c,status:'revoked'}:c);return reply({ok:true});}
    if(action==='logout'){if(state.logoutError)return reply({error:'Sign-out could not be completed. Try again.'},503);state.signedIn=false;return reply({ok:true});}
    return reply({error:'Unexpected action'},400);
  });
  await page.route('**/fixture-callback?*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><p>Returned to the application.</p>'}));return state;
}
test('Consent displays the account, exact permissions and expiry without approving automatically',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const state=await fixture(page,{previewEmail:'reviewed-owner@example.test'});await page.goto('/admin/connections#request=synthetic-request');await expect(page.locator('#connection-consent')).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:4173/admin/connections');await expect(page.locator('#connection-email')).toHaveText('reviewed-owner@example.test');await expect(page.locator('#consent-title')).toContainText('<script>unsafe</script>');await expect(page.locator('#consent-title script')).toHaveCount(0);await expect(page.locator('#consent-scopes li')).toHaveCount(2);await expect(page.locator('#consent-expiry')).toContainText('Access will expire');expect(state.writes).toEqual([]);
  await expect(page.getByRole('heading',{name:'Connections.',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'.cache/oauth-consent-mobile.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Allow read access',exact:true}).click();await expect(page).toHaveURL(/fixture-callback\?code=/);expect(state.writes).toEqual([{action:'oauth-decide',body:{request:'synthetic-request',review:'review-fixture',approve:true}}]);
});
test('Consent requires sign-in and decline returns to the application with no approval',async({page})=>{
  const state=await fixture(page,{signedIn:false});await page.goto('/admin/connections#request=synthetic-request');await expect(page.locator('#connection-login')).toBeVisible();await expect(page.locator('#connection-consent')).toBeHidden();
  await page.locator('[name=email]').fill('owner@example.test');await page.locator('[name=password]').fill('synthetic-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#connection-consent')).toBeVisible();
  await page.getByRole('button',{name:'Decline',exact:true}).click();await expect(page).toHaveURL(/error=access_denied/);expect(state.writes[0].body.approve).toBe(false);expect(state.writes).toHaveLength(1);
});
test('Disconnect needs confirmation and preserves the dialog after a failed request',async({page})=>{
  const state=await fixture(page,{connections:[{id:'33333333-3333-4333-8333-333333333333',client_name:'ChatGPT',scopes:['catalog:read'],status:'active',expires_at:new Date(Date.now()+1000000).toISOString()}]});
  await page.goto('/admin/connections');await page.getByRole('button',{name:'Disconnect',exact:true}).click();await page.locator('#connection-revoke').getByRole('button',{name:'Cancel',exact:true}).click();expect(state.writes).toEqual([]);
  await page.getByRole('button',{name:'Disconnect',exact:true}).click();state.revokeError=true;await page.locator('#connection-revoke-confirm').click();await expect(page.locator('#revoke-error')).toContainText('Try disconnecting again');await expect(page.locator('#connection-revoke')).toBeVisible();
  state.revokeError=false;await page.locator('#connection-revoke-confirm').click();await expect(page.locator('#connection-revoke')).toBeHidden();await expect(page.locator('#connection-list')).toContainText('Revoked');expect(state.writes.at(-1).body.confirm).toBe(true);
});
test('Expired consent and a disabled workspace never expose an approval button',async({page})=>{
  const state=await fixture(page);await page.goto('/admin/connections#request=synthetic-request');await expect(page.locator('#connection-consent')).toBeVisible();state.previewError=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.locator('#connection-message')).toContainText('expired');await expect(page.locator('#connection-consent')).toBeHidden();
  state.enabled=false;await page.reload();await expect(page.locator('#connection-message')).toContainText('have not been enabled');await expect(page.locator('#connection-consent')).toBeHidden();expect(state.writes).toEqual([]);
});
test('Sign-out reports failure and clears connection data only after confirmed completion',async({page})=>{
  const state=await fixture(page,{logoutError:true});await page.goto('/admin/connections');await expect(page.locator('#connection-list-panel')).toBeVisible();await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.locator('#connection-message')).toContainText('could not be completed');await expect(page.locator('#connection-account')).toBeVisible();
  state.logoutError=false;await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.locator('#connection-login')).toBeVisible();await expect(page.locator('#connection-list-panel')).toBeHidden();expect(await page.locator('#connection-list').textContent()).toBe('');
});
