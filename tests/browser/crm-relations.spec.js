import {test,expect} from '@playwright/test';
const companyId='22222222-2222-4222-8222-222222222222';
const company={id:companyId,version:1,company_name:'Nario',country:'SK',city:'',industry:'Furniture',website:'',instagram:'',linkedin:'',short_description:'',services:['Product CGI'],priority:'HIGH',lead_source:'Instagram',pipeline_status:'NEW_LEAD',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};

async function fixture(page) {
  let contacts=[],notes=[],events=[],counter=0;
  const create=data=>({...data,id:'fixture-'+(++counter),version:1,created_at:new Date().toISOString()});
  await page.route('**/api/admin?*',async route=>{
    const p=new URL(route.request().url()).searchParams,action=p.get('action'),body=route.request().postDataJSON();
    let data={};
    if(action==='me')data={email:'owner@example.com'};
    if(action==='crm-detail')data={company};
    if(action==='crm-contact-save'){
      if(body.primary_contact)contacts=contacts.map(c=>({...c,primary_contact:false}));
      let item=body.id?{...contacts.find(c=>c.id===body.id),...body}:create(body);
      contacts=contacts.filter(c=>c.id!==item.id).concat(item);
      events.unshift(create({event_type:body.id?'contact_updated':'contact_added',metadata:{name:item.full_name}}));
      data={item};
    }
    if(action==='crm-note-save'){
      let item=body.id?{...notes.find(n=>n.id===body.id),...body,version:2}:create(body);
      notes=notes.filter(n=>n.id!==item.id);notes.unshift(item);
      events.unshift(create({event_type:body.id?'note_updated':'note_added',metadata:{}}));data={item};
    }
    if(action==='crm-contact-delete'){contacts=contacts.filter(c=>c.id!==body.id);events.unshift(create({event_type:'contact_removed',metadata:{name:'Jane'}}));data={ok:true};}
    if(action==='crm-note-delete'){notes=notes.filter(n=>n.id!==body.id);events.unshift(create({event_type:'note_removed',metadata:{}}));data={ok:true};}
    if(action==='crm-activity-add'){const item=create({event_type:'manual_activity',metadata:{content:body.content}});events.unshift(item);data={item};}
    if(action==='crm-contacts')data={items:[...contacts].sort((a,b)=>Number(b.primary_contact)-Number(a.primary_contact)),page:1,hasMore:false};
    if(action==='crm-notes')data={items:notes,page:1,hasMore:false};
    if(action==='crm-activity')data={items:events,page:1,hasMore:false};
    await route.fulfill({json:data});
  });
}

test('company contacts, primary choice, notes and manual activity persist across tabs and reload',async({page})=>{
  await fixture(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('/admin/leads/'+companyId);
  await page.getByRole('tab',{name:'Contacts',exact:true}).click();
  await expect(page.getByRole('tabpanel',{name:'Contacts',exact:true}).getByText('No contacts yet.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Add contact',exact:true}).click();
  let dialog=page.locator('.crm-record-dialog');
  await dialog.getByLabel('Full name').fill('Jane <marketing>');
  await dialog.getByLabel('Email',{exact:true}).fill('jane@example.com');
  await dialog.getByLabel('Primary contact',{exact:true}).check();
  await dialog.getByRole('button',{name:'Save contact'}).click();
  await expect(page.locator('.crm-related-panel')).toContainText('Jane <marketing>');
  await page.getByRole('button',{name:'Add contact',exact:true}).click();
  await dialog.getByLabel('Full name').fill('John');
  await dialog.getByLabel('Primary contact',{exact:true}).check();
  await dialog.getByRole('button',{name:'Save contact'}).click();
  await expect(page.locator('.crm-related-panel .badge')).toHaveCount(1);
  await expect(page.locator('.crm-related-panel .crm-entry').first()).toContainText('John');
  await page.reload();await expect(page.getByRole('tab',{name:'Contacts',exact:true})).toHaveAttribute('aria-selected','true');
  await page.locator('.crm-entry').filter({hasText:'John'}).getByRole('button',{name:'Edit contact'}).click();
  await dialog.getByLabel('Position',{exact:true}).fill('Marketing director');
  await dialog.getByRole('button',{name:'Save contact'}).click();
  await expect(page.locator('.crm-related-panel')).toContainText('Marketing director');
  await page.getByRole('tab',{name:'Notes',exact:true}).click();
  await page.getByRole('button',{name:'Add note',exact:true}).click();
  await dialog.getByLabel('Note',{exact:true}).fill('Interested in CGI. <script>not executable</script>');
  await dialog.getByRole('button',{name:'Save note'}).click();
  await expect(page.locator('.crm-related-panel')).toContainText('<script>not executable</script>');
  await page.getByRole('button',{name:'Edit note',exact:true}).click();
  await dialog.getByLabel('Note',{exact:true}).fill('Updated note');
  await dialog.getByRole('button',{name:'Save note'}).click();
  await page.getByRole('tab',{name:'Activity',exact:true}).click();
  await expect(page.locator('.crm-related-panel')).toContainText('Note updated');
  await page.getByRole('button',{name:'Add activity',exact:true}).click();
  await dialog.getByLabel('What happened?').fill('Called the marketing team.');
  await dialog.getByRole('button',{name:'Save activity'}).click();
  await expect(page.locator('.crm-related-panel')).toContainText('Called the marketing team.');
  await page.screenshot({path:'.cache/crm-activity-desktop.png',fullPage:true});
  await page.getByRole('tab',{name:'Notes',exact:true}).click();
  await page.getByRole('button',{name:'Delete note',exact:true}).click();
  await expect(page.getByRole('tabpanel',{name:'Notes',exact:true}).getByText('No notes yet.',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Contacts',exact:true}).click();
  await page.locator('.crm-entry').filter({hasText:'Jane <marketing>'}).getByRole('button',{name:'Delete contact'}).click();
  await expect(page.locator('#crm h1')).toContainText('Nario');
  await expect(page.locator('.crm-related-panel .crm-entry')).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'.cache/crm-contacts-mobile.png',fullPage:true});
  await page.getByRole('tab',{name:'Overview',exact:true}).click();
  await expect(page.locator('.crm-summary')).toContainText('Marketing director');
  await expect(page.locator('.crm-summary')).toContainText('Contact removed');
  await page.goBack();await expect(page.getByRole('tab',{name:'Contacts',exact:true})).toHaveAttribute('aria-selected','true');
  expect(errors).toEqual([]);
});

test('contact errors preserve draft, recoverable load errors and keyboard tabs work',async({page})=>{
  await fixture(page);let fail=true;
  await page.route('**/api/admin?*',route=>{
    const action=new URL(route.request().url()).searchParams.get('action');
    if(action==='crm-contacts'&&fail)return route.fulfill({status:502,json:{error:'Contacts unavailable'}});
    if(action==='crm-contact-save')return route.fulfill({status:409,json:{error:'This contact changed. Reload before saving.'}});
    return route.fallback();
  });
  await page.goto('/admin/leads/'+companyId+'?tab=contacts');
  await expect(page.locator('.crm-related-panel [role=alert]')).toContainText('Contacts unavailable');
  fail=false;await page.getByRole('button',{name:'Try again'}).click();
  await page.getByRole('button',{name:'Add contact',exact:true}).click();
  const dialog=page.locator('.crm-record-dialog');await dialog.getByLabel('Full name').fill('Keep my draft');
  await dialog.getByRole('button',{name:'Save contact'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Reload');
  await expect(dialog.getByLabel('Full name')).toHaveValue('Keep my draft');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('tab',{name:'Contacts',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{name:'Presentations',exact:true})).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{name:'Notes',exact:true})).toHaveAttribute('aria-selected','true');
});
