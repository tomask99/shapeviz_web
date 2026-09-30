export const companyId='22222222-2222-4222-8222-222222222222';
export const shareToken='b'.repeat(32);
export const trackerId='44444444-4444-4444-8444-444444444444';
export async function mockTrackingAdmin(page,{many=false,trackedInitially=false}={}){
  let tracked=trackedInitially,paused=false;const calls=[];
  const downloads=[
    {file_name:'Great Sofa.fbx',download_count:12},
    {file_name:'Great Sofa.3ds',download_count:5}
  ];
  if(many)downloads.push(...Array.from({length:49},(_,i)=>({file_name:`Model ${i}.fbx`,download_count:1})));
  const stats=page=>({page,hasMore:downloads.length>page*50,items:downloads.slice((page-1)*50,page*50)});
  const tracker=()=>({id:trackerId,folder_name:'3D_Modely',folder_path:'01 Pre Architektov / 3D_Modely',active:!paused,connected:true,portal_active:true,total_downloads:17,created_at:'2026-09-30T12:00:00Z'});
  await page.route('**/api/admin?*',route=>{
    const params=new URL(route.request().url()).searchParams,action=params.get('action'),body=route.request().postDataJSON();calls.push({action,body,page:params.get('page')});
    let data={items:[]};
    if(action==='me')data={email:'owner@example.test'};
    if(action==='crm-client')data={item:{company_id:companyId,active:true,client_since:'2026-09-30'},company:{id:companyId,company_name:'MILENIUM',industry:'Furniture',website:'',short_description:''}};
    if(action==='client-files')data={items:[{id:companyId,title:'MILENIUM',slug:'milenium',public_token:'a'.repeat(32),active:true,version:1}]};
    if(action==='client-file-tracking')data={items:tracked?[{...tracker(),stats:stats(1)}]:[]};
    if(action==='client-file-tracking-add'){
      if(body.link.includes('wrong'))return route.fulfill({status:400,json:{error:'This folder belongs to a different client.'}});
      data={item:tracker(),existing:tracked};tracked=true;
    }
    if(action==='client-file-tracking-status'){paused=!body.active;data={item:tracker()};}
    if(action==='client-file-download-stats')data={tracker:tracker(),...stats(Number(params.get('page')||1))};
    return route.fulfill({json:data});
  });
  return {calls};
}
