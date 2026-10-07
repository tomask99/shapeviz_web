import {mountProjectWorkspace} from './crm-project-workspace.js';
import {svgIcon} from '../ui/icons.js';
import {esc} from './time-values.js';

export function createWorkspaceProjectDialog({api,notify,navigate,onChanged}){
 const dialog=document.createElement('dialog');dialog.className='workspace-project-dialog';
 dialog.innerHTML=`<div class="project-dialog-bar"><p class="eyebrow" data-dialog-client></p><button type="button" class="quiet" data-close-project aria-label="Close project details">${svgIcon('close')}</button></div><div class="project-dialog-content"></div>`;
 document.body.append(dialog);
 const content=dialog.querySelector('.project-dialog-content'),close=dialog.querySelector('[data-close-project]');
 let disposed=false,sequence=0,cleanup=()=>{},changed=false,pending=0,item=null;
 const request=async(action,body,params)=>{
  const writing=!!body;if(writing){pending++;dialog.dataset.dismissPending='true';close.disabled=true;}
  try{const result=await api(action,body,params);if(writing)changed=true;return result;}
  finally{if(writing){pending--;dialog.dataset.dismissPending=String(pending>0);close.disabled=pending>0;}}
 };
 function dismiss(){if(!pending)dialog.close();}
 close.onclick=dismiss;
 dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});
 dialog.addEventListener('close',()=>{
  sequence++;cleanup();cleanup=()=>{};content.innerHTML='';document.body.classList.remove('project-dialog-open');
  if(!disposed&&changed)onChanged(item.id);changed=false;
 });
 // The detail is mounted outside the page's router root. Keep its existing links
 // in the same tab, including Start tracking and project history links.
 content.addEventListener('click',event=>{
  const link=event.target.closest('a[data-lead]');if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();if(pending)return;
  const href=link.getAttribute('href'),url=new URL(href,location.origin);
  if(url.pathname==='/admin/clients/'+item.company_id&&url.searchParams.get('project')===item.id)return;
  dismiss();navigate(href);
 });
 async function load(){
  const ticket=++sequence;content.innerHTML='<p class="project-dialog-loading" role="status">Loading project…</p>';
  try{
   const data=await request('crm-project',null,{companyId:item.company_id,projectId:item.id});if(disposed||ticket!==sequence||!dialog.open)return;
   if(!data.item||!data.company)throw new Error('This project is no longer available.');
   cleanup=mountProjectWorkspace({root:content,api:request,notify,navigate,company:data.company,projectId:item.id,initialProject:data.item,embedded:true});
  }catch(error){if(!disposed&&ticket===sequence&&dialog.open){content.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" class="secondary" data-retry-project>Retry project</button>`;content.querySelector('button').onclick=load;}}
 }
 return {open(project){
  if(disposed||dialog.open)return;item=project;changed=false;
  dialog.setAttribute('aria-label',project.name+' project details');dialog.querySelector('[data-dialog-client]').textContent=project.company_name;
  dialog.showModal();dialog.scrollTop=0;document.body.classList.add('project-dialog-open');close.focus({preventScroll:true});load();
 },destroy(){disposed=true;sequence++;cleanup();cleanup=()=>{};dialog.close();dialog.remove();document.body.classList.remove('project-dialog-open');}};
}
