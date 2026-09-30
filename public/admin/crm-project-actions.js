const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={
 pause:'<path d="M8 5v14M16 5v14"/>',
 play:'<path d="m8 5 11 7-11 7Z"/>',
 complete:'<path d="m5 12 4 4L19 6"/>',
 delete:'<path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/>'
};
export function projectActionsMarkup(project,archived){
 const paused=project.status==='ON_HOLD',completed=project.status==='COMPLETED',cancelled=project.status==='CANCELLED';
 const button=(action,title,icon,{pressed,disabled=false}={})=>`<button type="button" class="project-icon-button project-icon-${action}" data-project-action="${action}" title="${title}" aria-label="${esc(title+': '+project.name)}" ${pressed==null?'':`aria-pressed="${pressed}"`} ${archived||disabled?'disabled':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[icon]}</svg></button>`;
 return `<div class="project-card-actions" role="group" aria-label="${esc('Actions for '+project.name)}">${button('pause',paused?'Resume project':'Pause project',paused?'play':'pause',{pressed:paused,disabled:completed||cancelled})}${button('complete',completed?'Reopen project':'Complete project','complete',{pressed:completed,disabled:cancelled})}${button('delete','Delete project','delete')}</div>`;
}
