import {test,expect} from '@playwright/test';
const id='22222222-2222-4222-8222-222222222222',candidateId='33333333-3333-4333-8333-333333333333';
async function fixture(page){
 let notes=[],failSave=false,failRead=false;
 const company={id,company_name:'Notes company',country:'SK',industry:'Furniture',services:[],priority:'HIGH',pipeline_status:'NEW_LEAD',version:1};
 const candidate={...company,id:candidateId,research_status:'NEW',summary:'Handmade furniture.',source_count:2};
 await page.route('**/api/admin?*',async route=>{
  const u=new URL(route.request().url()),action=u.searchParams.get('action'),body=route.request().method()==='POST'?route.request().postDataJSON():{};
  let data={items:[]};
  if(action==='me')data={email:'owner@example.test'};
  if(action==='crm-research-list')data={items:[candidate],total:1,page:1,pageSize:25};
  if(action==='crm-list')data={companies:[company],total:1,page:1,pageSize:25};
  if(action==='crm-detail')data={company};
  if(action==='crm-pipeline')data={columns:[{status:'NEW_LEAD',companies:[company],total:1,page:1}]};
  if(action==='crm-note-summaries')data={items:['company','candidate'].map(kind=>({kind,id:kind==='company'?id:candidateId,note_count:notes.length,latest_note:notes[0]?.content}))};
  if(action==='crm-notes'){
   if(failRead){failRead=false;return route.fulfill({status:502,json:{error:'Could not load notes'}});}
   data={items:notes,page:1,hasMore:false};
  }
  if(action==='crm-note-save'){
   if(failSave){failSave=false;return route.fulfill({status:502,json:{error:'Please retry saving'}});}
   const item={id:'44444444-4444-4444-8444-444444444444',content:body.content,version:1,created_at:'2026-09-29T10:00:00Z'};
   if(body.id){expect(body.version).toBe(notes[0].version);item.version=body.version+1;}
   notes=[item];data={item};
  }
  if(action==='crm-note-delete'){expect(body.confirm).toBe('delete');notes=[];data={ok:true};}
  return route.fulfill({json:data});
 });
 return {failSave:()=>failSave=true,failRead:()=>failRead=true};
}
test('company notes are visible, highlighted and editable across Research, Pipeline and Leads',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const f=await fixture(page);
 await page.setViewportSize({width:390,height:844});await page.goto('/admin/ai-research');
 const dialog=page.locator('#quick-note');
 await page.locator('.research-card [data-quick-note]').click();
 await expect(dialog).toContainText('No notes yet');
 await dialog.getByLabel('Note',{exact:true}).fill('Call on Friday <important>');f.failSave();
 await dialog.getByRole('button',{name:'Save note',exact:true}).click();
 await expect(dialog).toContainText('Please retry saving');await expect(dialog.getByLabel('Note',{exact:true})).toHaveValue('Call on Friday <important>');
 await dialog.getByRole('button',{name:'Save note',exact:true}).click();await expect(dialog).toBeHidden();
 await expect(page.locator('.research-card .has-notes')).toHaveText('Notes (1)');await expect(page.locator('.research-card [data-note-preview]')).toHaveText('Call on Friday <important>');
 await page.goto('/admin/pipeline');await expect(page.locator('.pipeline-card .has-notes')).toHaveText('Notes (1)');
 await page.locator('.pipeline-card').screenshot({path:'.cache/notes-pipeline-mobile.png'});
 f.failRead();await page.locator('.pipeline-card [data-quick-note]').click();await expect(dialog).toContainText('Could not load notes');await dialog.getByRole('button',{name:'Retry notes'}).click();
 await expect(dialog.locator('.crm-description')).toHaveText('Call on Friday <important>');
 await dialog.getByRole('button',{name:'Edit note',exact:true}).click();await dialog.getByLabel('Note',{exact:true}).fill('Follow up next week');await dialog.getByRole('button',{name:'Save changes'}).click();
 await expect(page.locator('.pipeline-card [data-note-preview]')).toHaveText('Follow up next week');
 await page.goto('/admin/leads');await expect(page.locator('.crm-row .has-notes')).toHaveText('Notes (1)');await page.locator('.crm-row [data-quick-note]').click();
 await expect(dialog.locator('.crm-description')).toHaveText('Follow up next week');
 await dialog.screenshot({path:'.cache/notes-dialog-mobile.png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'Delete note'}).click();await expect(dialog).toContainText('No notes yet');await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('.crm-row [data-quick-note]')).toHaveText('Notes');await expect(page.locator('.crm-row .has-notes')).toHaveCount(0);await expect(page.locator('.crm-row [data-note-preview]')).toBeHidden();
 await page.reload();await expect(page.locator('.crm-row [data-quick-note]')).toHaveText('Notes');expect(errors).toEqual([]);
});
