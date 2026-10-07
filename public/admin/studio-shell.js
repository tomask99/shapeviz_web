import {svgIcon} from '../ui/icons.js';
export function installStudioShell(){
 const nav=document.querySelector('aside nav');
 const items=[['[data-view="all"]','overview','Overview'],['#nav-leads','company','Leads'],['#nav-pipeline','pipeline','Pipeline'],['#nav-followups','calendar','Follow-ups'],['#nav-research','search','AI Research'],['#nav-clients','briefcase','Clients'],['#nav-projects','folder','Projects'],['#nav-time','clock','Time Tracker'],['a[href="/admin/reports"]','chart','Reports'],['[data-view="presentations"]','presentation','Presentations'],['[data-view="templates"]','templates','Templates'],['#open-template-upload','upload','Upload template'],['#open-upload','upload','Upload HTML']];
 for(const [selector,icon,label] of items){const item=nav.querySelector(selector);if(item)item.innerHTML=svgIcon(icon)+`<span>${label}</span>`;}
 const work=document.createElement('span');work.className='eyebrow crm-nav-label';work.textContent='Workspace';
 nav.querySelector('[data-view="all"]').after(work,nav.querySelector('#nav-clients'),nav.querySelector('#nav-projects'),nav.querySelector('#nav-time'),nav.querySelector('a[href="/admin/reports"]'));
 const library=nav.querySelector('[data-view="presentations"]').previousElementSibling;
 if(library?.classList.contains('crm-nav-label'))library.textContent='Library';
 const add=document.createElement('details');add.className='nav-create';
 const addLabel=document.createElement('summary');addLabel.innerHTML=svgIcon('plus')+'<span>Add to library</span>'+svgIcon('chevronDown');
 add.append(addLabel,nav.querySelector('#open-template-upload'),nav.querySelector('#open-upload'));nav.querySelector('[data-view="templates"]').after(add);
 const storageLabel=document.createElement('span');storageLabel.className='eyebrow crm-nav-label';storageLabel.textContent='Cloud storage';
 const storage=nav.querySelector('#nav-cloud-storage');storage.innerHTML=svgIcon('cloud')+'<span>Cloud storage</span>';nav.append(storageLabel,storage);
 const search=nav.querySelector('button.secondary');
 if(search){search.className='quiet studio-search';search.setAttribute('aria-label','Search / Ctrl+K');search.innerHTML=svgIcon('search')+'<span>Search workspace</span><kbd>Ctrl K</kbd>';document.querySelector('.workspace>header .eyebrow').replaceWith(search);}
 const account=document.querySelector('.aside-bottom'),details=document.createElement('details');details.className='studio-account';
 const summary=document.createElement('summary');summary.setAttribute('aria-label','Workspace settings');summary.innerHTML=svgIcon('settings')+'<span>Workspace settings</span>'+svgIcon('chevronDown');
 const content=document.createElement('div');content.className='studio-account-content';
 while(account.firstChild)content.append(account.firstChild);
 details.append(summary,content);account.append(details);
 document.querySelector('#logout').innerHTML=svgIcon('logout')+' Sign out';
 const current=()=>{nav.querySelectorAll('a,button').forEach(item=>{if(item.classList.contains('active'))item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');});
  const selected=nav.querySelector('[aria-current=page]');if(selected&&matchMedia('(max-width:900px)').matches){const item=selected.getBoundingClientRect(),bounds=nav.getBoundingClientRect();if(item.left<bounds.left)nav.scrollLeft+=item.left-bounds.left-8;else if(item.right>bounds.right)nav.scrollLeft+=item.right-bounds.right+8;}
 };
 new MutationObserver(current).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});current();
}
