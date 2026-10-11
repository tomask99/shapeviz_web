import {setShopNavigation} from './nav.js';
import {mountCatalog} from './embed.js';
const $=s=>document.querySelector(s), preview=new URLSearchParams(location.search).get('preview')==='1';
let cleanup;
async function load(){
  cleanup?.();cleanup=null;$('#shop-catalog').hidden=true;$('#shop-checkout-note').hidden=true;$('#shop-preview-banner').hidden=true;
  $('#shop-status').textContent=preview?'Checking admin access…':'Checking shop availability…';$('#shop-retry').hidden=true;
  if(preview)$('#shop-coming').hidden=true;
  try{
    const response=await fetch(preview?'/api/admin?action=shop-preview':'/api/shop',{cache:'no-store',signal:AbortSignal.timeout(25000)});
    if(!response.ok){const error=await response.json();throw new Error(preview&&[401,403].includes(response.status)?'Sign in to the Shapeviz admin to open this private preview.':error.error||'The shop is temporarily unavailable.');}
    const data=await response.json();setShopNavigation(data.launched===true);$('#shop-status').textContent='';
    const show=data.launched===true || (preview&&data.preview===true);$('#shop-coming').hidden=show;
    $('#shop-state-label').textContent=preview?'PRIVATE PREVIEW':show?'MADE FOR CREATORS':'COMING SOON';
    if(show){$('#shop-preview-banner').hidden=!preview;$('#shop-catalog').hidden=false;$('#shop-checkout-note').hidden=false;cleanup=mountCatalog($('#shop-catalog'),data);}
  }catch(error){$('#shop-coming').hidden=true;$('#shop-status').textContent=error.message;$('#shop-retry').hidden=false;if(preview){const link=document.createElement('a');link.href='/admin/shop';link.textContent=' Open admin';$('#shop-status').append(link);}}
}
$('#year').textContent=new Date().getFullYear();$('#shop-retry').onclick=load;load();
window.addEventListener('pageshow',event=>{if(event.persisted)load();});
