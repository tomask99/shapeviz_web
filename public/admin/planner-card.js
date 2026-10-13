import {svgIcon} from '../ui/icons.js';
import {esc} from './time-values.js';

export function plannerCard(item,{save,remove,changed}){
 const project=item.kind!=='event';
 const form=document.createElement('form');form.className='planner-card';form.dataset.color=item.color;form.dataset.id=item.id;form.dataset.priority=String(item.priority??1);form.dataset.created=item.created_at||new Date().toISOString();
 form.setAttribute('aria-label',project?'Personal project':'Day plan');
 form.innerHTML=`<div class="planner-card-top"><span class="eyebrow">${project?'PERSONAL PROJECT':'DAY PLAN'}</span><div class="planner-card-tools">${project?`<label class="planner-priority-label">Priority<select name="priority" aria-label="Priority">${[[3,'Urgent'],[2,'High'],[1,'Normal'],[0,'Low']].map(([value,label])=>`<option value="${value}" ${(item.priority??1)===value?'selected':''}>${label}</option>`).join('')}</select></label>`:''}<button type="button" class="quiet icon-button" data-remove aria-label="Delete ${project?'project':'plan'}">${svgIcon('trash')}</button></div></div>
  <label class="planner-title-label">Title<input name="title" aria-label="Title" maxlength="160" required placeholder="${project?'Project name, e.g. Blender add-on':'What is the plan?'}" value="${esc(item.title)}"></label>
  ${item.kind==='event'?`<div class="planner-date-fields"><label>Date<input type="date" name="planned_date" min="1900-01-01" max="9999-12-31" required value="${esc(item.planned_date)}"></label><label>Time (optional)<input type="time" name="planned_time" value="${esc(item.planned_time||'')}"></label></div>`:''}
  <label class="planner-content-label">${project?'Notes':'Details'}<textarea name="content" maxlength="5000" rows="3" placeholder="${project?'Describe the project or keep a note here…':'Write something down…'}">${esc(item.content)}</textarea></label>
  ${project?'<div class="planner-checklist-heading">To-do list</div><div class="planner-tasks"></div><button type="button" class="quiet" data-add-task>'+svgIcon('plus')+' Add task</button>':''}
  <div class="planner-card-options"><label>Color<select name="color">${[['sand','Sand'],['sage','Sage'],['blue','Blue'],['rose','Rose']].map(([value,label])=>`<option value="${value}" ${item.color===value?'selected':''}>${label}</option>`).join('')}</select></label>${item.kind==='event'?`<label class="check"><input name="completed" type="checkbox" ${item.completed?'checked':''}> Completed</label>`:''}</div>
  <div class="planner-card-footer"><span role="status" data-save-state>${item.version?'Saved':'Not saved yet'}</span><button type="submit" class="secondary" ${item.version?'disabled':''}>Save</button></div><p role="alert" data-error></p>${project?'<div class="planner-completion"><div><span data-progress></span><strong data-percent></strong></div><progress aria-label="Project completion" max="100" value="0"></progress></div>':''}`;
 let dirty=!item.version,pending=false;
 const mark=()=>{dirty=true;form.dataset.dirty='true';form.querySelector('[type=submit]').disabled=false;form.querySelector('[data-save-state]').textContent='Unsaved changes';form.dataset.color=form.elements.color.value;form.dataset.priority=form.elements.priority?.value||'1';progress();changed();};
 function progress(){const rows=[...form.querySelectorAll('[data-task]')],done=rows.filter(row=>row.querySelector('[type=checkbox]').checked).length,total=rows.length,percent=total?Math.round(done/total*100):0;const p=form.querySelector('[data-progress]');if(p){p.textContent=total?`${done} of ${total} tasks completed`:'Add tasks to track progress';form.querySelector('[data-percent]').textContent=percent+'%';const bar=form.querySelector('progress');bar.value=percent;bar.setAttribute('aria-valuetext',`${done} of ${total} tasks completed (${percent}%)`);}}
 function addTask(task,focus=false){
  const row=document.createElement('div');row.className='planner-task';row.dataset.task=task.id;
  row.innerHTML=`<input type="checkbox" aria-label="Complete task" ${task.done?'checked':''}><input type="text" aria-label="Task description" maxlength="240" required placeholder="Add a task" value="${esc(task.text)}"><button type="button" class="quiet icon-button" aria-label="Remove task">${svgIcon('close')}</button>`;
  row.querySelector('button').onclick=()=>{row.remove();mark();form.querySelector('[data-add-task]').focus();};form.querySelector('.planner-tasks').append(row);if(focus)row.querySelector('[type=text]').focus();progress();
 }
 for(const task of item.checklist)addTask(task);progress();
 form.querySelector('[data-add-task]')?.addEventListener('click',()=>{if(form.querySelectorAll('[data-task]').length>=80){form.querySelector('[data-error]').textContent='A list can contain up to 80 tasks.';return;}addTask({id:crypto.randomUUID(),text:'',done:false},true);mark();});
 form.oninput=mark;form.onchange=e=>{mark();if(item.version&&(e.target.type==='checkbox'||e.target.name==='priority')&&form.checkValidity())form.requestSubmit();};
 function values(){return {...item,kind:project?'checklist':'event',title:form.elements.title.value,content:form.elements.content.value,color:form.elements.color.value,priority:Number(form.elements.priority?.value??1),planned_date:form.elements.planned_date?.value||null,planned_time:form.elements.planned_time?.value||null,completed:form.elements.completed?.checked||false,checklist:[...form.querySelectorAll('[data-task]')].map(row=>({id:row.dataset.task,text:row.querySelector('[type=text]').value,done:row.querySelector('[type=checkbox]').checked}))};}
 async function run(fn,label='Saving…'){
  if(pending)return;pending=true;changed();form.setAttribute('aria-busy','true');form.querySelector('[data-save-state]').textContent=label;const focus=document.activeElement,controls=[...form.elements];controls.forEach(el=>el.disabled=true);form.querySelector('[data-error]').textContent='';
  try{await fn();}catch(error){form.querySelector('[data-error]').textContent=error.message;form.querySelector('[data-save-state]').textContent='Not saved';}
  finally{pending=false;form.removeAttribute('aria-busy');controls.forEach(el=>el.disabled=false);form.querySelector('[type=submit]').disabled=!dirty;if(form.contains(focus)&&focus.isConnected&&!focus.disabled)focus.focus({preventScroll:true});changed();}
 }
 form.onsubmit=e=>{e.preventDefault();const data=values();run(async()=>{const result=await save(data);item=result;dirty=false;form.dataset.dirty='false';form.querySelector('[data-save-state]').textContent='Saved';});};
 form.querySelector('[data-remove]').onclick=()=>{if(!confirm(`Delete ${form.elements.title.value||'this '+(item.kind==='event'?'plan':'card')}?`))return;run(async()=>{await remove(item);dirty=false;form.remove();},'Deleting…');};
 return {form,isDirty:()=>dirty,isPending:()=>pending};
}
