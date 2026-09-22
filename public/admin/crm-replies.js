import {localInput,localInstant} from './crm-dates.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createReplyRecorder({company,api,notify,onSaved}){
  const dialog=document.createElement('dialog');dialog.id='crm-reply-dialog';dialog.className='crm-record-dialog';dialog.setAttribute('aria-labelledby','crm-reply-title');document.body.append(dialog);
  let seq=0,pending=false,disposed=false;
  dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
  return {
    close(){seq++;dialog.close();},
    dispose(){disposed=true;seq++;dialog.close();dialog.remove();},
    open(){
      if(company.archived_at||pending||disposed)return;
      const ticket=++seq,id=crypto.randomUUID();let page=0,loading=false,submission=null;
      const alive=()=>!disposed&&seq===ticket&&dialog.open;
      dialog.innerHTML=`<form><div class="dialog-head"><h2 id="crm-reply-title">Record client reply.</h2><button type="button" data-cancel aria-label="Close">×</button></div><p class="fine">Record a reply you already received. No email is sent and the pipeline status stays unchanged. Saved replies remain in the activity history.</p><label>Received date and time *<input type="datetime-local" name="received_at" required></label><p class="fine">Local time: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}. Repeated autumn times use the first occurrence.</p><label>From contact (optional)<select name="contact_id" aria-label="From contact (optional)"><option value="">No contact specified</option></select></label><button type="button" class="quiet" data-more hidden>Load more contacts</button><label>Reply summary *<textarea name="content" maxlength="5000" rows="5" required></textarea></label><p role="alert" data-error></p><div class="actions"><button type="button" class="secondary" data-cancel>Cancel</button><button type="submit" class="primary">Record reply</button></div></form>`;
      const form=dialog.querySelector('form'),submit=form.querySelector('[type=submit]'),error=form.querySelector('[data-error]'),more=form.querySelector('[data-more]');
      form.elements.received_at.value=localInput(new Date());
      form.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>{if(!pending)dialog.close();});
      async function contacts(){
        if(loading||pending||submission)return;loading=true;more.disabled=true;submit.disabled=true;
        try{const data=await api('crm-contacts',null,{companyId:company.id,page:page+1});if(!alive())return;for(const c of data.items||[])form.elements.contact_id.add(new Option(c.full_name,c.id));page++;more.hidden=!data.hasMore;error.textContent='';}
        catch(e){if(alive()){error.textContent=e.message;more.hidden=false;}}
        finally{loading=false;if(alive()){more.disabled=false;submit.disabled=false;}}
      }
      more.onclick=contacts;
      form.onsubmit=async e=>{
        e.preventDefault();if(pending||loading)return;error.textContent='';
        if(!submission){
          try{
            const received_at=localInstant(form.elements.received_at.value),content=form.elements.content.value.trim();
            if(Date.parse(received_at)>Date.now()+60000)throw new Error('The reply date cannot be in the future.');
            if(!content)throw new Error('Enter a reply summary.');
            submission={id,companyId:company.id,received_at,content,contact_id:form.elements.contact_id.value||null};
          }catch(e){error.textContent=e.message;return;}
        }
        pending=true;form.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
        try{await api('crm-reply-add',submission);if(!alive())return;dialog.close();notify('Client reply recorded. Pipeline status unchanged.');onSaved();}
        catch(e){if(alive()){error.textContent=`${e.message} Retry this same reply, or close and check Activity before entering another.`;submit.textContent='Retry recording reply';}}
        finally{pending=false;if(alive()){submit.disabled=false;form.querySelectorAll('[data-cancel]').forEach(b=>b.disabled=false);}}
      };
      dialog.showModal();form.elements.content.focus();contacts();
    }
  };
}
