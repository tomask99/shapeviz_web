// Keep native navigation (including keyboard/new tabs) immediate. The small
// same-origin keepalive request can finish after leaving the cloud page.
export function mountStudioLinks({share,portal,access}) {
  let lastClick=-Infinity;
  function track(event) {
    if(!event.isTrusted || event.defaultPrevented || (event.type==='auxclick'&&event.button!==1))return;
    if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
    if(performance.now()-lastClick<1000 || (!share&&(!portal||!access)))return;
    lastClick=performance.now();
    try {
      const params=new URLSearchParams({...(share?{share}:{portal}),action:'website-click'});
      void fetch('/api/files?'+params,{
        method:'POST',keepalive:true,credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json',...(access?{'X-Files-Access':access}:{})},
        body:JSON.stringify({eventId:crypto.randomUUID(),source:event.currentTarget.dataset.studioLink})
      }).catch(()=>{});
    }catch{/* A notification must never prevent visiting the studio. */}
  }
  document.querySelectorAll('[data-studio-link]').forEach(link=>{
    link.addEventListener('click',track);
    link.addEventListener('auxclick',track);
  });
}
