import {createFollowups} from './crm-followups.js';
export function createActionCenter({api,notify,onChanged}){
 const root=document.createElement('section');root.id='action-center';root.className='chart-panel';root.hidden=true;
 document.querySelector('#business-overview').before(root);
 const tasks=createFollowups({root,api,notify,onChanged,todayOnly:true});
 // CRM route activation hides shared panels without calling the Overview controller.
 new MutationObserver(()=>{if(root.hidden){tasks.hide();root.replaceChildren();}}).observe(root,{attributes:true,attributeFilter:['hidden']});
 return {schedule:tasks.schedule,show(){root.hidden=false;tasks.show();},hide(){root.hidden=true;tasks.hide();root.replaceChildren();}};
}
