// The same two-layer warm glow and easing used on the public Shapeviz site.
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(pointer: fine)');
const glow=document.createElement('div');glow.className='studio-glow';glow.setAttribute('aria-hidden','true');
glow.innerHTML='<span class="glow-head"></span><span class="glow-tail"></span>';document.body.append(glow);
const head=glow.firstElementChild,tail=glow.lastElementChild;
let x=innerWidth*.72,y=innerHeight*.28,hx=x,hy=y,tx=x,ty=y,frame=0,last=0,moved=0;
function render(time){frame=0;if(document.hidden||reduced.matches||!fine.matches)return;
 const elapsed=last?Math.min(3,Math.max(.25,(time-last)/16.667)):1;last=time;
 const px=hx,py=hy;hx+=(x-hx)*(1-Math.pow(1-.105,elapsed));hy+=(y-hy)*(1-Math.pow(1-.105,elapsed));tx+=(hx-tx)*(1-Math.pow(1-.047,elapsed));ty+=(hy-ty)*(1-Math.pow(1-.047,elapsed));
 const speed=Math.min(46,Math.hypot(hx-px,hy-py)/elapsed),distance=Math.hypot(hx-tx,hy-ty),moving=time-moved<900;
 head.style.opacity=moving?.42:.36;tail.style.opacity=moving?.22:.16;
 head.style.transform=`translate3d(${hx}px,${hy}px,0) rotate(${Math.atan2(hy-py,hx-px)}rad) scale(${1+Math.min(.34,speed*.013)},${1-Math.min(.13,speed*.0048)})`;
 tail.style.transform=`translate3d(${tx}px,${ty}px,0) rotate(${Math.atan2(hy-ty,hx-tx)}rad) scale(${1.06+Math.min(.72,distance/340)},${.94-Math.min(.18,distance/1500)})`;
 if(moving||Math.hypot(x-hx,y-hy)>.1||distance>.1)requestFrame();
}
function requestFrame(){if(!frame&&!document.hidden&&fine.matches&&!reduced.matches)frame=requestAnimationFrame(render);}
addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;x=e.clientX;y=e.clientY;moved=performance.now();requestFrame();},{passive:true});
for(const query of [fine,reduced])query.addEventListener('change',()=>{if(frame)cancelAnimationFrame(frame);frame=0;head.style.opacity=tail.style.opacity=0;requestFrame();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{last=0;requestFrame();}});
