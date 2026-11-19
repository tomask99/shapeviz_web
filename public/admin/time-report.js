import {svgIcon} from '../ui/icons.js';

export function mountTimeReport({button,status,projectId,companyId,filters}){
 let disposed=false,pending=null;
 const label=()=>{button.innerHTML=`${svgIcon('download')} Download PDF report`;};
 label();
 button.onclick=async()=>{
  if(pending)return;
  const dates=filters();if(!dates)return;
  const controller=new AbortController();pending=controller;
  const timeout=setTimeout(()=>controller.abort(),60000);
  button.disabled=true;button.textContent='Preparing PDF...';status.textContent='Preparing your time report...';
  try{
   const query=new URLSearchParams({action:'crm-project-time-report',projectId,companyId,...dates});
   const response=await fetch(`/api/admin?${query}`,{signal:controller.signal});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'The report could not be downloaded. Please try again.');}
   if(!response.headers.get('Content-Type')?.startsWith('application/pdf'))throw new Error('The server did not return a PDF. Please try again.');
   const blob=await response.blob();if(disposed)return;
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=/filename="([^"]+)"/.exec(response.headers.get('Content-Disposition')||'')?.[1]||'project-time-report.pdf';
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   status.textContent='PDF report downloaded.';
  }catch(error){if(!disposed)status.textContent=error.name==='AbortError'?'The report took too long. Try a shorter date range.':error.message;}
  finally{clearTimeout(timeout);pending=null;if(!disposed){button.disabled=false;label();}}
 };
 return ()=>{disposed=true;pending?.abort();button.onclick=null;};
}
