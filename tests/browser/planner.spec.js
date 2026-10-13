import {test,expect} from '@playwright/test';
import {plannerFixture} from '../helpers/planner-fixture.js';

for(const width of [1440,390])test(`Personal planner persists notes, lists and calendar plans at ${width}px`,async({page,context})=>{
 test.setTimeout(90000);const f=await plannerFixture(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:960});
 try{
  await context.addCookies([{name:'sv_access',value:'test',url:f.origin}]);await page.goto(f.origin+'/admin/planner');
  await expect(page.getByRole('link',{name:'Planner',exact:true})).toHaveAttribute('aria-current','page');await expect(page.getByRole('heading',{name:'My board'})).toBeVisible();
  await page.getByRole('button',{name:'New note',exact:true}).click();let note=page.getByRole('form',{name:'Sticky note'});
  await note.getByLabel('Title',{exact:true}).fill('Ideas for the studio');await note.getByLabel('Details').fill('<script>alert("test")</script>\nDesign a material library');await note.getByLabel('Color').selectOption('blue');
  f.failSave();await note.getByRole('button',{name:'Save',exact:true}).click();await expect(note.getByRole('alert')).toContainText('could not complete');await expect(note.getByLabel('Title',{exact:true})).toHaveValue('Ideas for the studio');
  await note.getByRole('button',{name:'Save',exact:true}).click();await expect(note.getByRole('status')).toHaveText('Saved');
  await page.getByRole('button',{name:'New to-do list',exact:true}).click();let list=page.getByRole('form',{name:'To-do list'});await list.getByLabel('Title',{exact:true}).fill('This week');
  await list.getByRole('button',{name:'Add task',exact:true}).click();await list.getByLabel('Task description').fill('Prepare renders');await list.getByRole('button',{name:'Add task',exact:true}).click();await list.getByLabel('Task description').nth(1).fill('Review lighting');await list.getByLabel('Complete task').first().check();
  await list.getByRole('button',{name:'Save',exact:true}).click();await expect(list.getByRole('status')).toHaveText('Saved');
  await page.reload();await expect(note.getByLabel('Title',{exact:true})).toHaveValue('Ideas for the studio');await expect(list.getByLabel('Complete task').first()).toBeChecked();
  await page.locator('.planner').screenshot({path:`.cache/planner-board-${width}.png`});
  await page.getByRole('button',{name:'Next month',exact:true}).click();await expect(page.locator('[data-day]').first()).toBeEnabled();const day=page.locator('[data-day]').nth(14);const date=await day.getAttribute('data-day');await day.click();
  await page.getByRole('button',{name:'Add plan',exact:true}).click();let plan=page.getByRole('form',{name:'Day plan'});await plan.getByLabel('Title',{exact:true}).fill('Material research');await plan.getByLabel('Time (optional)').fill('10:30');await expect(plan.getByLabel('Date',{exact:true})).toHaveValue(date);await plan.getByRole('button',{name:'Save',exact:true}).click();await expect(plan.getByRole('status')).toHaveText('Saved');
  await page.locator('.planner-calendar-section').screenshot({path:`.cache/planner-calendar-${width}.png`});
  await page.reload();await page.getByRole('button',{name:'Next month',exact:true}).click();await page.locator(`[data-day="${date}"]`).click();await expect(plan.getByLabel('Title',{exact:true})).toHaveValue('Material research');await expect(plan.getByLabel('Time (optional)')).toHaveValue('10:30');
  await plan.getByLabel('Completed',{exact:true}).check();await plan.getByRole('button',{name:'Save',exact:true}).click();await expect(plan.getByRole('status')).toHaveText('Saved');
  page.once('dialog',d=>d.accept());await plan.getByRole('button',{name:'Delete plan',exact:true}).click();await expect(plan).toHaveCount(0);
  await list.getByRole('button',{name:'Remove task',exact:true}).last().click();await list.getByRole('button',{name:'Save',exact:true}).click();await expect(list.getByRole('status')).toHaveText('Saved');
  page.once('dialog',d=>d.accept());await note.getByRole('button',{name:'Delete card',exact:true}).click();await expect(note).toHaveCount(0);
  await page.reload();await expect(note).toHaveCount(0);await expect(list.getByLabel('Task description')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
 }finally{await f.close();}
});

test('Planner keeps stale edits and retries a failed month load',async({page,context})=>{
 test.setTimeout(60000);const f=await plannerFixture();
 try{
  await context.addCookies([{name:'sv_access',value:'test',url:f.origin}]);f.failList();await page.goto(f.origin+'/admin/planner');await expect(page.locator('[data-planner-error]')).toContainText('Refresh');await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByRole('button',{name:'New note',exact:true}).click();const note=page.getByRole('form',{name:'Sticky note'});await note.getByLabel('Title',{exact:true}).fill('Draft');await note.getByRole('button',{name:'Save',exact:true}).click();await expect(note.getByRole('status')).toHaveText('Saved');
  await f.db.query("update workspace_planner set title='Other tab'");await note.getByLabel('Title',{exact:true}).fill('My edits');await note.getByRole('button',{name:'Save',exact:true}).click();await expect(note.getByRole('alert')).toContainText('another tab');await expect(note.getByLabel('Title',{exact:true})).toHaveValue('My edits');
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(note.getByLabel('Title',{exact:true})).toHaveValue('My edits');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(note.getByLabel('Title',{exact:true})).toHaveValue('Other tab');
 }finally{await f.close();}
});
