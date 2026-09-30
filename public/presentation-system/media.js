(() => {
  'use strict';
  if(window.ShapevizMedia)return;
  const slideSelector='.slide,[data-slide]';
  const pending='[data-sv-media]';
  const hydrated=new WeakSet(),wantedPlayback=new Set();
  const nativePlay=HTMLMediaElement.prototype.play;
  let slides=[],observer,frame=0;

  function overlayOpen(){
    const overlay=document.getElementById('startOverlay');
    if(!overlay)return false;
    const style=getComputedStyle(overlay);
    return !overlay.hidden&&style.display!=='none'&&style.visibility!=='hidden';
  }
  function active(slide){
    if(!slide||overlayOpen()||slide.hidden||slide.getAttribute('aria-hidden')==='true')return false;
    const style=getComputedStyle(slide);
    if(style.display==='none'||style.visibility==='hidden')return false;
    // Stacked decks may position every slide in the viewport with opacity:0.
    if(document.querySelector('.slide.active,[data-slide].active'))return slide.classList.contains('active');
    const rect=slide.getBoundingClientRect();
    return Number(style.opacity)!==0&&rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth;
  }
  function restore(element,name){
    const attr='data-sv-'+name;
    if(!element.hasAttribute(attr))return false;
    element.setAttribute(name,element.getAttribute(attr));
    element.removeAttribute(attr);
    return true;
  }
  function hydrate(element){
    if(hydrated.has(element))return;
    if(element.matches('video,audio')){
      element.querySelectorAll('source,track').forEach(hydrate);
      restore(element,'poster');
      restore(element,'src');
      hydrated.add(element);
      element.preload='none';
      element.load();
      restore(element,'autoplay');
    }else{
      // Select a picture candidate before restoring its fallback image src.
      if(element.tagName==='IMG')element.parentElement?.matches('picture')&&element.parentElement.querySelectorAll('source').forEach(hydrate);
      restore(element,'srcset');restore(element,'src');
      hydrated.add(element);
    }
  }
  function activate(slide){
    if(!active(slide))return false;
    slide.querySelectorAll(pending).forEach(hydrate);
    return true;
  }

  // Existing decks call play() synchronously just after toggling .active.
  // Hydrate that managed element in the same user gesture (also on iOS), while
  // leaving lightboxes and all other media's native behavior unchanged.
  HTMLMediaElement.prototype.play=function(...args){
    if(this.matches(pending)){
      const slide=this.closest(slideSelector);
      if(!active(slide)){
        wantedPlayback.add(this);
        return Promise.reject(new DOMException('Media waits for its slide.','AbortError'));
      }
      wantedPlayback.delete(this);
      hydrate(this);
    }
    return nativePlay.apply(this,args);
  };

  function sync(){
    frame=0;
    for(const slide of slides){
      if(activate(slide)){
        for(const media of slide.querySelectorAll('video,audio')){
          if(wantedPlayback.delete(media))nativePlay.call(media).catch(()=>{});
        }
      }else{
        slide.querySelectorAll('video,audio').forEach(media=>{if(!media.paused)media.pause();});
      }
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(sync);}
  function observe(){
    slides=[...document.querySelectorAll(slideSelector)];
    observer?.disconnect();
    observer=new MutationObserver(schedule);
    for(const node of [...slides,document.body,document.getElementById('startOverlay')].filter(Boolean))observer.observe(node,{attributes:true,attributeFilter:['class','style','hidden','aria-hidden']});
    sync();
  }
  // Handle an immediate image/video lightbox click before an observer frame.
  for(const type of ['click','keydown'])document.addEventListener(type,event=>{
    if(type==='keydown'&&!['Enter',' '].includes(event.key))return;
    const slide=event.target.closest?.(slideSelector);if(slide)activate(slide);
  },true);
  window.addEventListener('resize',schedule,{passive:true});
  document.addEventListener('scroll',schedule,{passive:true,capture:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  window.ShapevizMedia={activate,refresh:observe};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});else observe();
})();
