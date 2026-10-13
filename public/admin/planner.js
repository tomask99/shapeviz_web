import {svgIcon} from '../ui/icons.js';
import {esc} from './time-values.js';
import {plannerCard} from './planner-card.js';

export const localDay=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function monthDays(month){
 const [year,m]=month.split('-').map(Number),first=new Date(year,m-1,1,12),offset=(first.getDay()+6)%7,last=new Date(year,m,0,12).getDate();
 return {offset,last};
}
const dayTitle=day=>new Date(day+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
export function mountPlanner({root,api,notify}){
 let disposed=false,loading=false,loaded=false,sequence=0,selected=localDay(),month=selected.slice(0,7),events=[];
 const cards=new Map();
 root.innerHTML=`<div class="planner"><div class="page-heading"><div><p class="eyebrow">YOUR WORKSPACE</p><h1>Planner<span>.</span></h1><p class="fine">A little space for your ideas, to-dos and days ahead.</p></div><button class="secondary" type="button" data-refresh>${svgIcon('refresh')} Refresh</button></div>
 <p role="alert" data-planner-error></p><p role="status" class="fine" data-loading>Loading your planner…</p>
 <section class="planner-board-section" aria-labelledby="board-title"><div class="section-title"><div><p class="eyebrow">KEEP IT IN SIGHT</p><h2 id="board-title">My board</h2></div><div class="planner-actions"><button class="primary" data-new="checklist" disabled>${svgIcon('plus')} New project</button></div></div><p class="fine">A project, its notes and to-dos in one card. Highest priority first. Save text edits; checkboxes and priority save automatically.</p><div class="planner-board" data-board></div></section>
 <section class="planner-calendar-section" aria-labelledby="calendar-title"><div class="section-title"><div><p class="eyebrow">MAKE ROOM FOR WHAT MATTERS</p><h2 id="calendar-title">Monthly calendar</h2></div><button class="secondary" data-today>Today</button></div><div class="planner-calendar-layout"><div class="planner-month"><div class="planner-month-heading"><button class="quiet icon-button" data-month="-1" aria-label="Previous month">${svgIcon('arrowLeft')}</button><h3 data-month-title aria-live="polite"></h3><button class="quiet icon-button" data-month="1" aria-label="Next month">${svgIcon('arrowRight')}</button></div><div class="planner-weekdays" aria-hidden="true">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<span>${d}</span>`).join('')}</div><div class="planner-days" data-days></div><p class="fine">Select a day to view or edit its plans. Times follow your local calendar.</p></div><section class="planner-agenda" aria-labelledby="agenda-title"><div class="planner-agenda-heading"><h3 id="agenda-title"></h3><button class="secondary" data-new="event" disabled>${svgIcon('plus')} Add plan</button></div><div data-agenda></div></section></div></section></div>`;
 const board=root.querySelector('[data-board]'),agenda=root.querySelector('[data-agenda]'),error=root.querySelector('[data-planner-error]');
 const activeCards=()=>[...cards.values()].filter(c=>c.form.isConnected);
 const pending=()=>activeCards().some(c=>c.isPending());
 const dirty=(eventsOnly=false)=>activeCards().some(c=>(!eventsOnly||agenda.contains(c.form))&&c.isDirty());
 function mayDiscard(eventsOnly=false){if(pending()){notify('Wait for the planner to finish saving.');return false;}return !dirty(eventsOnly)||confirm('Discard unsaved planner changes?');}
 function updateControls(){root.querySelectorAll('[data-new]').forEach(b=>b.disabled=!loaded||loading);root.querySelector('[data-today]').disabled=loading;root.querySelector('[data-refresh]').disabled=loading;}
 function sortBoard(){
  const focus=document.activeElement,ordered=[...board.querySelectorAll('.planner-card')].sort((a,b)=>Number(b.dataset.priority)-Number(a.dataset.priority)||b.dataset.created.localeCompare(a.dataset.created)||a.dataset.id.localeCompare(b.dataset.id));
  ordered.forEach((card,index)=>{if(board.children[index]!==card)board.insertBefore(card,board.children[index]||null);});
  if(board.contains(focus)&&!focus.disabled)focus.focus({preventScroll:true});
 }
 function drawCalendar(){
  const {offset,last}=monthDays(month),today=localDay();
  root.querySelector('[data-month-title]').textContent=new Date(month+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  root.querySelector('[data-days]').innerHTML='<span class="planner-day-blank" aria-hidden="true"></span>'.repeat(offset)+Array.from({length:last},(_,i)=>{
   const day=month+'-'+String(i+1).padStart(2,'0'),items=events.filter(e=>e.planned_date===day);
   return `<button type="button" class="planner-day ${day===today?'is-today':''}" data-day="${day}" aria-pressed="${day===selected}" ${loading||!loaded?'disabled':''} ${day===today?'aria-current="date"':''} aria-label="${esc(dayTitle(day))}, ${items.length} ${items.length===1?'plan':'plans'}"><span class="planner-day-number">${i+1}</span><span class="planner-day-events">${items.slice(0,2).map(item=>`<span data-color="${item.color}" class="${item.completed?'is-completed':''}">${esc(item.title)}</span>`).join('')}${items.length>2?`<small>${items.length-2} more</small>`:''}</span>${items.length?`<span class="planner-day-count">${items.length}</span>`:''}</button>`;
  }).join('');
  root.querySelector('[data-month="-1"]').disabled=loading||month==='1900-01';root.querySelector('[data-month="1"]').disabled=loading||month==='9999-12';
 }
 function addCard(item,target){
  target.querySelector('[data-empty]')?.remove();
  const card=plannerCard(item,{changed:updateControls,save:async values=>{
   const data=await api('planner-save',values);if(disposed)return data.item;
   if(item.kind!=='event')sortBoard();
   if(item.kind==='event'){events=events.filter(e=>e.id!==item.id);if(data.item.planned_date.startsWith(month))events.push(data.item);drawCalendar();if(data.item.planned_date!==selected){card.form.remove();cards.delete(item.id);notify('Plan saved for '+dayTitle(data.item.planned_date)+'.');emptyAgenda();}}
   return data.item;
  },remove:async current=>{
   if(current.version)await api('planner-delete',{id:current.id,version:current.version,confirm:'delete'});if(disposed)return;
   cards.delete(current.id);events=events.filter(e=>e.id!==current.id);card.form.remove();drawCalendar();emptyBoard();emptyAgenda();
  }});cards.set(item.id,card);target.append(card.form);return card;
 }
 function emptyBoard(){if(!board.children.length)board.innerHTML='<div class="planner-empty" data-empty><span>'+svgIcon('edit')+'</span><h3>A clear space, a fresh start.</h3><p>Create a personal project, add notes and break it into tasks.</p></div>';}
 function emptyAgenda(){if(!agenda.children.length)agenda.innerHTML='<p class="planner-empty" data-empty>No plans for this day yet. Add one when you are ready.</p>';}
 function drawAgenda(){for(const [id,card] of cards)if(agenda.contains(card.form))cards.delete(id);agenda.replaceChildren();root.querySelector('#agenda-title').textContent=dayTitle(selected);events.filter(e=>e.planned_date===selected).sort((a,b)=>(a.planned_time||'').localeCompare(b.planned_time||'')).forEach(item=>addCard(item,agenda));emptyAgenda();}
 async function load(resetBoard=true){
  const ticket=++sequence;loading=true;error.textContent='';root.querySelector('[data-loading]').textContent='Loading your planner…';updateControls();drawCalendar();
  // Keep existing drafts on a failed read, but prevent edits racing a refresh.
  const controls=activeCards().flatMap(card=>[...card.form.elements].map(el=>({el,disabled:el.disabled})));controls.forEach(({el})=>el.disabled=true);
  try{const data=await api('planner-list',null,{month});if(disposed||ticket!==sequence)return;events=data.events;loaded=true;if(data.truncated)error.textContent='Showing up to 500 board cards and 1,000 plans per month. Remove old items and refresh to see more.';
   if(resetBoard){cards.clear();board.replaceChildren();data.board.forEach(item=>addCard(item,board));sortBoard();emptyBoard();}drawAgenda();
  }catch(e){if(!disposed&&ticket===sequence){loaded=false;error.textContent=e.message+' Use Refresh to retry.';events=[];agenda.replaceChildren();}}
  finally{if(!disposed&&ticket===sequence){controls.forEach(({el,disabled})=>{if(el.isConnected)el.disabled=disabled;});loading=false;root.querySelector('[data-loading]').textContent='';updateControls();drawCalendar();}}
 }
 root.querySelector('[data-refresh]').onclick=()=>{if(!loading&&mayDiscard())load();};
 root.querySelectorAll('[data-new]').forEach(button=>button.onclick=()=>{
  if(!loaded||loading)return;const kind=button.dataset.new,item={id:crypto.randomUUID(),version:0,kind,title:'',content:'',checklist:[],color:kind==='checklist'?'sage':'sand',priority:1,planned_date:kind==='event'?selected:null,planned_time:null,completed:false};
  const card=addCard(item,kind==='event'?agenda:board);card.form.elements.title.focus();
 });
 root.querySelector('[data-days]').onclick=e=>{const button=e.target.closest('[data-day]');if(!button||button.disabled||button.dataset.day===selected||!mayDiscard(true))return;selected=button.dataset.day;drawCalendar();drawAgenda();root.querySelector(`[data-day="${selected}"]`).focus({preventScroll:true});};
 async function changeMonth(next,day=next+'-01'){if(loading||!mayDiscard(true))return;month=next;selected=day;await load(false);}
 root.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+Number(b.dataset.month),1,12);changeMonth(localDay(d).slice(0,7));});
 root.querySelector('[data-today]').onclick=()=>{const today=localDay();if(month!==today.slice(0,7))changeMonth(today.slice(0,7),today);else if(mayDiscard(true)){selected=today;drawCalendar();drawAgenda();}};
 const unload=e=>{if(dirty()||pending()){e.preventDefault();e.returnValue='';}};
 const leave=e=>{if(!e.target.closest('aside nav a,aside nav button,[data-view],#logout,#change-password,.mini-timer'))return;if(!mayDiscard()){e.preventDefault();e.stopImmediatePropagation();}};
 window.addEventListener('beforeunload',unload);document.addEventListener('click',leave,true);
 load();return ()=>{disposed=true;sequence++;window.removeEventListener('beforeunload',unload);document.removeEventListener('click',leave,true);cards.clear();};
}
