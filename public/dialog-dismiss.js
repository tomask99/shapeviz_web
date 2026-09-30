// One dismissal policy for static and dynamically rendered native dialogs.
const closeSelector='button[aria-label^="Close"],button[aria-label^="Zavrieť"],button[data-dialog-dismiss]';
const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='/dialog-dismiss.css';document.head.append(stylesheet);

function enhance(dialog){
  if(dialog.querySelector(closeSelector))return;
  const bar=document.createElement('div');bar.className='dialog-dismiss-bar';
  const button=document.createElement('button');button.type='button';button.dataset.dialogDismiss='';button.setAttribute('aria-label','Close dialog');button.title='Close';button.innerHTML='<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  bar.append(button);dialog.prepend(bar);dialog.classList.add('has-dialog-dismiss');
}
function dismiss(dialog){
  if(!dialog?.open)return;
  // Match Escape, including each form's existing in-flight save guard and close
  // cleanup. Calling close() directly would bypass those cancellation handlers.
  if(typeof dialog.requestClose==='function')dialog.requestClose();
  else if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();
}
document.querySelectorAll('dialog').forEach(enhance);
new MutationObserver(records=>{
  const dialogs=new Set();
  for(const record of records){
    const parent=record.target.closest?.('dialog');if(parent)dialogs.add(parent);
    for(const node of record.addedNodes||[]){if(node.nodeType!==1)continue;if(node.matches('dialog'))dialogs.add(node);node.querySelectorAll('dialog').forEach(dialog=>dialogs.add(dialog));}
  }
  for(const dialog of dialogs)if(dialog.isConnected)enhance(dialog);
}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});

const outside=(dialog,event)=>{const rect=dialog.getBoundingClientRect();return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;};
let down=null;
document.addEventListener('pointerdown',event=>{
  const dialog=event.target.closest?.('dialog[open]');
  down=event.button===0&&dialog&&event.target===dialog&&outside(dialog,event)?dialog:null;
},true);
document.addEventListener('pointercancel',()=>{down=null;},true);
document.addEventListener('click',event=>{
  const dialog=event.target.closest?.('dialog[open]'),button=event.target.closest?.('[data-dialog-dismiss]');
  const backdrop=dialog&&down===dialog&&event.target===dialog&&outside(dialog,event);down=null;
  if(!dialog||(!button&&!backdrop))return;
  event.preventDefault();event.stopImmediatePropagation();dismiss(dialog);
},true);
document.addEventListener('cancel',event=>{if(event.target.dataset?.dismissPending==='true')event.preventDefault();},true);
