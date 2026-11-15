import {t} from '../i18n/runtime.js';
import {setShopNavigation} from './nav.js';
import {mountCatalog} from './embed.js';
const $=s=>document.querySelector(s), preview=new URLSearchParams(location.search).get('preview')==='1';
let cleanup;
let initialData=document.getElementById('shop-initial-data');
async function load(){
  cleanup?.();cleanup=null;$('#shop-catalog').hidden=true;$('#shop-checkout-note').hidden=true;$('#shop-preview-banner').hidden=true;
  $('#shop-status').textContent=preview?t('Checking admin access…'):t('Checking shop availability…');$('#shop-retry').hidden=true;
  if(preview)$('#shop-coming').hidden=true;
  try{
    let data;
    if(initialData&&!preview){data=JSON.parse(initialData.textContent);initialData.remove();initialData=null;}
    else{const response=await fetch(preview?'/api/admin?action=shop-preview':'/api/shop',{cache:'no-store',signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw new Error(preview&&[401,403].includes(response.status)?t('Sign in to the Shapeviz admin to open this private preview.'):t('The shop is temporarily unavailable.'));
      data=await response.json();}
    setShopNavigation(data.launched===true);$('#shop-status').textContent='';
    const show=data.launched===true || (preview&&data.preview===true);$('#shop-coming').hidden=show;
    $('#shop-state-label').textContent=preview?t('PRIVATE PREVIEW'):show?t('MADE FOR CREATORS'):t('COMING SOON');
    if(show){$('#shop-preview-banner').hidden=!preview;$('#shop-catalog').hidden=false;$('#shop-checkout-note').hidden=false;cleanup=mountCatalog($('#shop-catalog'),data);}
  }catch(error){$('#shop-coming').hidden=true;$('#shop-status').textContent=error.name==='Error'?error.message:t('The shop is temporarily unavailable.');$('#shop-retry').hidden=false;if(preview){const link=document.createElement('a');link.href='/admin/shop';link.textContent=' '+t('Open admin');$('#shop-status').append(link);}}
}
$('#year').textContent=new Date().getFullYear();$('#shop-retry').onclick=load;load();
window.addEventListener('pageshow',event=>{if(event.persisted)load();});
