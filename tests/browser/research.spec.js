import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const id='22222222-2222-4222-8222-222222222222';
const example=JSON.parse(await readFile(new URL('../../docs/examples/research-candidates.v1.json',import.meta.url),'utf8')).candidates[0];
const candidate={...example,id,company_name:'Example Furniture',normalized_domain:'furniture.example',research_status:'NEEDS_REVIEW',source_origin:'CHATGPT',source_count:2,signal_count:1,created_at:'2026-09-23T08:00:00Z',updated_at:'2026-09-23T08:00:00Z',last_researched_at:'2026-09-23T08:00:00Z',duplicate_checked_at:null,duplicate_company_id:null};
const summary={id,company_name:candidate.company_name,country:'CZ',industry:'Furniture',business_type:'Manufacturer',product_categories:['Sofas','Armchairs'],positioning_value:'Premium',positioning_status:'INFERRED',normalized_domain:'furniture.example',fit:'HIGH',research_confidence:'MEDIUM',research_status:'NEEDS_REVIEW',source_count:2,best_services:['Product CGI','3D Models for Architects'],top_signals:['MULTIPLE_FABRICS'],summary:'Upholstered furniture for homes and design professionals.'};

async function fixture(page,{listFailures=0,detailFailures=0,empty=false,record=candidate,listDelay=0,items=null}={}) {
  const calls=[];
  await page.route('**/api/admin?*',async route=>{
    const request=route.request(),url=new URL(request.url()),action=url.searchParams.get('action');
    calls.push({action,params:Object.fromEntries(url.searchParams),method:request.method()});
    if(action==='me')return route.fulfill({json:{email:'owner@example.test'}});
    if(action==='crm-research-list') {
      if(listDelay)await new Promise(resolve=>setTimeout(resolve,listDelay));
      if(listFailures-->0)return route.fulfill({status:502,json:{error:'Research temporarily unavailable.'}});
      const pageNumber=Number(url.searchParams.get('page')||1),isEmpty=empty||url.searchParams.get('q')==='no-match';
      if(items) {
        const industry=url.searchParams.get('industry');
        const filtered=items.filter(item=>(!industry||item.industry.toLowerCase()===industry.toLowerCase())&&(url.searchParams.get('hide_in_leads')!=='true'||!item.approved_company_id));
        return route.fulfill({json:{items:filtered.slice((pageNumber-1)*25,pageNumber*25),total:filtered.length,page:pageNumber,pageSize:25}});
      }
      return route.fulfill({json:{items:isEmpty?[]:[{...summary,company_name:pageNumber===2?'Second page company':summary.company_name}],total:isEmpty?0:26,page:pageNumber,pageSize:25}});
    }
    if(action==='crm-research-detail') {
      if(detailFailures-->0)return route.fulfill({status:404,json:{error:'Research candidate not found.'}});
      return route.fulfill({json:{candidate:record}});
    }
    if(action==='crm-list')return route.fulfill({json:{companies:[],total:0,page:1,pageSize:25}});
    if(action==='crm-pipeline')return route.fulfill({json:{stages:[],totals:[]}});
    return route.fulfill({json:{items:[],projects:[],summary:{},daily:[]}});
  });
  return calls;
}

test('Research navigation, compact cards, evidence detail and list return work without write requests',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const calls=await fixture(page);
  await page.goto('/admin/leads');
  await page.getByRole('link',{name:'AI Research',exact:true}).click();
  await expect(page.getByRole('heading',{name:'AI Research.'})).toBeVisible();
  await expect(page.locator('#nav-research')).toHaveClass('active');
  await expect(page.locator('.research-card')).toContainText('High Fit');
  await expect(page.locator('.research-card')).toContainText('Duplicates not checked');
  await expect(page.locator('.research-card')).not.toContainText('Fictional product catalogue');
  await page.getByRole('link',{name:'View research'}).click();
  await expect(page).toHaveURL(new RegExp('/admin/ai-research/'+id));
  await expect(page.getByRole('heading',{name:'Example Furniture.'})).toBeVisible();
  await expect(page.locator('.research-detail-grid')).toContainText('Verified');
  await expect(page.locator('.research-detail-grid')).toContainText('Inferred');
  await expect(page.locator('.research-detail-grid')).toContainText('Unknown');
  await expect(page.getByRole('heading',{name:'Suggested pitch angle',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Fictional product catalogue'})).toHaveAttribute('href','https://furniture.example/products');
  await expect(page.getByRole('link',{name:'Fictional product catalogue'})).toHaveAttribute('rel','noopener noreferrer');
  await page.locator('.research-evidence summary').first().click();
  await page.locator('.research-evidence[open] [data-research-source]').first().click();
  await expect(page.locator('#research-source-1')).toBeFocused();
  expect(calls.filter(call=>call.action==='crm-research-detail')).toHaveLength(1);
  await expect(page.getByRole('heading',{name:'Duplicate check'}).locator('..')).toContainText('Not checked yet.');
  await page.getByRole('link',{name:'Research inbox'}).click();
  await expect(page.locator('.research-card')).toBeVisible();
  await page.getByRole('link',{name:'Leads',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Leads.'})).toBeVisible();
  await expect(page.locator('#nav-research')).not.toHaveClass('active');
  expect(calls.filter(call=>call.action.startsWith('crm-research')).every(call=>call.method==='GET')).toBe(true);
  expect(errors).toEqual([]);
});

test('The whole research card opens its detail, supports keyboard and native new-tab navigation',async({page})=>{
  await fixture(page);await page.goto('/admin/ai-research?industry=Furniture');
  const card=page.locator('.research-card');
  await card.click({position:{x:15,y:120}});
  await expect(page).toHaveURL('/admin/ai-research/'+id);
  await expect(page.getByRole('heading',{name:'Example Furniture.'})).toBeVisible();
  await page.getByRole('link',{name:'Research inbox'}).click();
  await expect(page).toHaveURL('/admin/ai-research?industry=Furniture');
  const popupPromise=page.context().waitForEvent('page');
  await card.click({position:{x:15,y:120},button:'middle'});
  const popup=await popupPromise;await expect(popup).toHaveURL('/admin/ai-research/'+id);await popup.close();
  await expect(page).toHaveURL('/admin/ai-research?industry=Furniture');
  await card.getByRole('link',{name:'Example Furniture',exact:true}).focus();
  await page.keyboard.press('Enter');await expect(page).toHaveURL('/admin/ai-research/'+id);
});

test('Research cards share the image hover effect, respect reduced motion and retain the separate lead link',async({page})=>{
  await fixture(page,{items:[{...summary,approved_company_id:id,research_status:'APPROVED'}]});
  await page.goto('/admin/ai-research');const card=page.locator('.research-card');
  await card.hover();
  await expect.poll(()=>card.evaluate(element=>getComputedStyle(element).boxShadow)).toContain('70px');
  await expect.poll(()=>card.evaluate(element=>new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(-8);
  await expect(card).toHaveCSS('background-color','rgb(216, 135, 57)');
  await page.screenshot({path:'.cache/research-card-hover.png',fullPage:true});
  await page.emulateMedia({reducedMotion:'reduce'});await card.hover();await expect(card).toHaveCSS('transform','none');
  await card.getByRole('link',{name:'Open lead'}).click();await expect(page).toHaveURL('/admin/leads/'+id);
});

test('Hide companies in Leads filters immediately, resets pagination and persists with industries and history',async({page})=>{
  const items=[{...summary,id:'approved',approved_company_id:id,research_status:'APPROVED'},
    {...summary,id:'possible',company_name:'Possible duplicate',duplicate_company_id:id},
    ...Array.from({length:25},(_,index)=>({...summary,id:'new-'+index,industry:'Shoes',company_name:'Shoes '+index}))];
  const calls=await fixture(page,{items});await page.goto('/admin/ai-research');
  const checkbox=page.getByRole('checkbox',{name:'Hide companies in Leads'});
  await expect(checkbox).not.toBeChecked();await expect(page.locator('.research-card-in-leads')).toHaveCount(1);
  await page.goto('/admin/ai-research?page=2');await checkbox.check();
  await expect(page.locator('.research-count')).toHaveText('26 matching candidates');
  await expect(page.locator('.research-card')).toHaveCount(25);
  await expect(page.locator('.research-card-in-leads')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Possible duplicate',exact:true})).toBeVisible();
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  expect(calls.filter(call=>call.action==='crm-research-list').at(-1).params.hide_in_leads).toBe('true');
  await page.getByRole('button',{name:'Shoes brands',exact:true}).click();
  await expect(checkbox).toBeChecked();await expect(page.locator('.research-count')).toHaveText('25 matching candidates');
  await page.reload();await expect(checkbox).toBeChecked();
  await checkbox.uncheck();await expect(page).not.toHaveURL(/hide_in_leads/);
  await page.goBack();await expect(checkbox).toBeChecked();
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await expect(checkbox).not.toBeChecked();await expect(page.locator('.research-card-in-leads')).toHaveCount(1);
  await expect(page.locator('.research-count')).toHaveText('27 candidates');
});

test('Industry shortcuts filter brands, preserve other filters and restore history',async({page})=>{
  const items=['Furniture','Shoes','Eyewear'].map((industry,index)=>({...summary,id:String(index),company_name:industry+' Example',industry}));
  const calls=await fixture(page,{items});
  await page.goto('/admin/ai-research?fit=HIGH&page=2');
  await page.getByRole('button',{name:'Shoes brands',exact:true}).click();
  await expect(page.locator('.research-card')).toHaveCount(1);
  await expect(page.locator('.research-card')).toContainText('Shoes Example');
  expect(calls.filter(call=>call.action==='crm-research-list').at(-1).params).toMatchObject({industry:'Shoes',fit:'HIGH'});
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await expect(page.getByRole('button',{name:'Shoes brands',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload();
  await expect(page.getByRole('button',{name:'Shoes brands',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Eyewear brands',exact:true}).click();
  await expect(page.locator('.research-card')).toContainText('Eyewear Example');
  await page.goBack();
  await expect(page.locator('.research-card')).toContainText('Shoes Example');
  await page.getByRole('button',{name:'All industries',exact:true}).click();
  await expect(page.locator('.research-card')).toHaveCount(3);
  await expect(page.getByRole('combobox',{name:'Fit',exact:true})).toHaveValue('HIGH');
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/ai-research$/);
});

test('Only companies moved to Leads have an orange card and a lead link on desktop and mobile',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await fixture(page,{items:[
    {...summary,company_name:'BRIK a.s.',research_status:'APPROVED',approved_company_id:id},
    {...summary,company_name:'Shoes Example',industry:'Shoes'},
    {...summary,company_name:'Possible match',industry:'Eyewear',duplicate_company_id:id},
  ]});
  await page.setViewportSize({width:1600,height:1100});
  await page.goto('/admin/ai-research');
  const lead=page.locator('.research-card-in-leads');
  await expect(lead).toHaveCount(1);
  await expect(lead).toContainText('BRIK a.s.');
  await expect(lead).toContainText('In Leads');
  await expect(lead.getByRole('link',{name:'Open lead'})).toHaveAttribute('href','/admin/leads/'+id);
  await expect(lead).toHaveCSS('background-color','rgb(216, 135, 57)');
  await page.screenshot({path:'.cache/research-industries-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'.cache/research-industries-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('Research filters, sort, pagination and browser history preserve URL state',async({page})=>{
  const calls=await fixture(page);await page.goto('/admin/ai-research');
  await page.getByLabel('Search research',{exact:true}).fill('sofas');
  await page.getByRole('combobox',{name:'Fit',exact:true}).selectOption('HIGH');
  await page.getByRole('combobox',{name:'Sort',exact:true}).selectOption('fit');
  await page.getByText('More filters',{exact:true}).click();
  await page.getByLabel('Country code',{exact:true}).fill('cz');
  await page.getByRole('combobox',{name:'Potential service',exact:true}).selectOption('Product CGI');
  await page.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.locator('.research-card')).toBeVisible();
  expect(calls.filter(call=>call.action==='crm-research-list').at(-1).params).toMatchObject({q:'sofas',fit:'HIGH',country:'CZ',sort:'fit',potential_service:'Product CGI'});
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('.research-card')).toContainText('Second page company');
  await expect(page.getByLabel('Search research')).toHaveValue('sofas');
  await page.getByRole('button',{name:'Previous',exact:true}).click();
  await expect(page.locator('.research-card')).toContainText('Example Furniture');
  await page.getByRole('link',{name:'View research'}).click();
  await page.getByRole('link',{name:'Research inbox'}).click();
  await expect(page.getByLabel('Search research')).toHaveValue('sofas');
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/ai-research$/);
  await page.goBack();
  await expect(page.getByLabel('Search research')).toHaveValue('sofas');
});

test('Research errors retry, empty search clears and empty inbox offers supported research actions',async({page})=>{
  await fixture(page,{listFailures:1,detailFailures:1});
  await page.goto('/admin/ai-research?q=sofas');
  await expect(page.getByRole('alert')).toContainText('Research temporarily unavailable.');
  await expect(page.getByLabel('Search research')).toHaveValue('sofas');
  await page.getByRole('button',{name:'Try again'}).click();
  await page.getByRole('link',{name:'View research'}).click();
  await expect(page.getByRole('alert')).toContainText('Research candidate not found.');
  await page.getByRole('button',{name:'Try again'}).click();
  await expect(page.getByRole('heading',{name:'Example Furniture.'})).toBeVisible();
  await page.getByRole('link',{name:'Research inbox'}).click();
  await page.getByLabel('Search research').fill('no-match');
  await page.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.getByRole('heading',{name:'No matching candidates.'})).toBeVisible();
  await page.locator('.research-empty').getByRole('button',{name:'Clear filters'}).click();
  await expect(page.locator('.research-card')).toBeVisible();
  await page.unroute('**/api/admin?*');await fixture(page,{empty:true});await page.reload();
  await expect(page.getByRole('heading',{name:'No research candidates yet.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Import JSON',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Research prompt',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Approve|Reject/})).toHaveCount(0);
});

test('Delayed research requests cannot overwrite another CRM page',async({page})=>{
  await fixture(page,{listDelay:500});await page.goto('/admin/ai-research');
  await expect(page.getByText('Loading research candidates…')).toBeVisible();
  await page.getByRole('link',{name:'Leads',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Leads.'})).toBeVisible();
  await page.waitForTimeout(650);
  await expect(page.getByRole('heading',{name:'Leads.'})).toBeVisible();
  await expect(page.locator('.research-card')).toHaveCount(0);
});

test('Research is readable on mobile and treats research content and links as untrusted',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const record={...candidate,company_name:'Example <img src=x onerror=alert(1)>',suggested_pitch_angle:'<script>window.researchInjected=true</script>',sources:[{url:'javascript:alert(1)',title:'Untrusted source'}]};
  await fixture(page,{record});await page.setViewportSize({width:390,height:844});
  await page.goto('/admin/ai-research');
  await expect(page.locator('.research-card')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'.cache/research-inbox-mobile.png',fullPage:true});
  await page.getByRole('link',{name:'View research'}).click();
  await expect(page.locator('#crm h1')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.research-sources a')).toHaveCount(0);
  expect(await page.evaluate(()=>window.researchInjected)).toBeUndefined();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'.cache/research-detail-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});
