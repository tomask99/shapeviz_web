import '../dialog-dismiss.js';
const $=selector=>document.querySelector(selector);
const request=new URLSearchParams(location.hash.slice(1)).get('request');
// Keep the pending request in memory, out of history, storage and referrers.
if(location.hash)history.replaceState(null,'','/admin/connections');
let currentAccount=null,revoking=null,busy=false,generation=0,review=null;
const labels={'crm:read':'Company profiles and Leads','research:read':'Research and evidence','catalog:read':'Services and research guidance'};
const date=value=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const message=(text,error=false)=>{const node=$('#connection-message');node.textContent=text;node.dataset.error=String(error);};
async function api(action,body){
  const response=await fetch('/api/admin?action='+action,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'The request could not be completed.'),{status:response.status});return data;
}
function signedOut(){generation++;currentAccount=null;review=null;$('#connection-login').hidden=false;$('#connection-account').hidden=true;$('#connection-consent').hidden=true;$('#connection-list-panel').hidden=true;$('#connection-list').replaceChildren();$('#connection-revoke').close();}
function failure(error){if([401,403].includes(error.status))signedOut();message(error.message,true);}
function node(tag,text){const element=document.createElement(tag);element.textContent=text;return element;}
async function load(){
  const turn=++generation;
  review=null;$('#connection-consent').hidden=true;
  try{
    const account=await api('me');if(turn!==generation)return;currentAccount=account;
    $('#connection-email').textContent=account.email;$('#connection-login').hidden=true;$('#connection-account').hidden=false;
    const data=await api('oauth-connections');if(turn!==generation)return;
    $('#connection-list-panel').hidden=false;const list=$('#connection-list');list.replaceChildren();
    if(!data.enabled){message('External connections have not been enabled for this workspace.');return;}
    if(!data.connections.length)list.append(node('p','No applications are connected.'));
    for(const connection of data.connections){
      const article=node('article','');article.append(node('h3',connection.client_name),node('p',connection.scopes.map(scope=>labels[scope]||scope).join(' · ')),node('p',`${connection.status[0].toUpperCase()+connection.status.slice(1)} · Access expires ${date(connection.expires_at)}`));
      if(['active','pending'].includes(connection.status)){
        const button=node('button','Disconnect');button.type='button';button.className='secondary';button.addEventListener('click',()=>{revoking=connection;$('#revoke-description').textContent=`Remove ${connection.client_name} access to your Shapeviz data?`;$('#revoke-error').textContent='';$('#connection-revoke').showModal();});article.append(button);
      }
      list.append(article);
    }
    message('');
    if(request){
      const preview=await api('oauth-preview',{request});if(turn!==generation)return;
      review=preview.review;
      // The account may have changed in another tab since the initial /me read.
      // Display the identity bound to this exact review receipt.
      $('#connection-email').textContent=preview.account_email;
      $('#consent-title').textContent=`Connect ${preview.client_name}?`;$('#consent-scopes').replaceChildren(...preview.scopes.map(scope=>node('li',scope.label)));$('#consent-expiry').textContent=`Access will expire by ${date(preview.expires_at)}.`;$('#connection-consent').hidden=false;
    }
  }catch(error){if(turn!==generation)return;failure(error);}
}
$('#connection-signin').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;const button=event.target.querySelector('button');button.disabled=true;
  try{const fields=new FormData(event.target);await api('login',{email:fields.get('email'),password:fields.get('password')});event.target.reset();await load();}catch(error){failure(error);}finally{busy=false;button.disabled=false;}
});
async function decide(approve){
  if(busy||!currentAccount||!review)return;busy=true;$('#connection-allow').disabled=true;$('#connection-deny').disabled=true;
  try{
    const result=await api('oauth-decide',{request,review,approve});
    const target=new URL(result.redirect);if(!['https:','http:'].includes(target.protocol))throw new Error('Invalid application return address.');
    location.assign(target.href);
  }catch(error){$('#connection-consent').hidden=true;failure(error);message('The connection could not be completed. Start connecting again from the application.',true);}
  finally{busy=false;$('#connection-allow').disabled=false;$('#connection-deny').disabled=false;}
}
$('#connection-allow').addEventListener('click',()=>decide(true));$('#connection-deny').addEventListener('click',()=>decide(false));
$('#connection-refresh').addEventListener('click',load);
$('#connection-signout').addEventListener('click',async()=>{if(busy)return;busy=true;generation++;try{await api('logout',{});signedOut();message('Signed out.');}catch(error){failure(error);}finally{busy=false;}});
$('#connection-revoke-confirm').addEventListener('click',async()=>{
  if(busy||!revoking)return;busy=true;const button=$('#connection-revoke-confirm');button.disabled=true;
  try{await api('oauth-disconnect',{id:revoking.id,confirm:true});$('#connection-revoke').close();revoking=null;await load();}catch(error){if([401,403].includes(error.status))failure(error);else $('#revoke-error').textContent=error.message;}finally{busy=false;button.disabled=false;}
});
$('#connection-revoke').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
load();
