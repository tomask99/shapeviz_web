// The server owns state and elapsed time. performance.now only animates the last
// confirmed server reading; every focus/reconnect/poll reconciles it again.
export function announceTimeChange(){
 window.dispatchEvent(new Event('shapeviz-time-changed'));
 if(typeof BroadcastChannel==='function'){const channel=new BroadcastChannel('shapeviz-time');channel.postMessage('changed');channel.close();}
}
export function createTimeStore(api){
 let state={item:null,ready:false,busy:false,error:'',uncertain:false},anchor=0,active=false,poll,sequence=0,pending=null;
 const listeners=new Set(),channel=typeof BroadcastChannel==='function'?new BroadcastChannel('shapeviz-time'):null;
 const emit=()=>listeners.forEach(fn=>fn(state));
 async function refresh(){
  if(!active||state.busy)return;const ticket=++sequence;
  try{const result=await api('crm-time-open');if(!active||ticket!==sequence)return;
   state={...state,item:result.item||null,ready:true,error:pending?state.error:'',uncertain:!!pending};anchor=performance.now();emit();
  }catch(error){if(active&&ticket===sequence){state={...state,error:'Timer could not synchronize. '+error.message,uncertain:true};emit();}}
 }
 async function send(){
  if(!pending||state.busy)return;sequence++;state={...state,busy:true,error:''};emit();
  try{
   await api(pending.action,pending.body);pending=null;state={...state,busy:false,uncertain:false};
   await refresh();channel?.postMessage('changed');window.dispatchEvent(new Event('shapeviz-time-changed'));
  }catch(error){
   const uncertain=!error.status||error.status>=500;
   if(!uncertain)pending=null;
   state={...state,busy:false,uncertain,error:uncertain?'The command was not confirmed. Synchronize or retry the same command. '+error.message:error.message};emit();
  }
 }
 const wake=()=>{if(!document.hidden)refresh();};
 channel?.addEventListener('message',()=>window.dispatchEvent(new Event('shapeviz-time-changed')));
 window.addEventListener('focus',wake);window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);
 window.addEventListener('shapeviz-time-changed',wake);
 return {
  get state(){return state;},get canRetry(){return !!pending;},
  elapsed(){return Number(state.item?.duration_seconds||0)+(state.item?.status==='running'?Math.floor((performance.now()-anchor)/1000):0);},
  subscribe(fn){listeners.add(fn);fn(state);return ()=>listeners.delete(fn);},refresh,
  command(action,body){if(state.busy||pending)return;pending={action,body:{...body,requestId:crypto.randomUUID()}};return send();},retry:send,
  activate(){if(active)return;active=true;refresh();poll=setInterval(wake,15000);},
  deactivate(){active=false;sequence++;clearInterval(poll);pending=null;state={item:null,ready:false,busy:false,error:'',uncertain:false};emit();}
 };
}
