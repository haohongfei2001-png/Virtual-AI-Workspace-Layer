import {tokenOK} from '../b1/identity.mjs';
/** Passive candidate only. Profile selectors must distinguish send from stop/upload/regenerate.
 * Submit is deliberately not observed: requestSubmit is not proof of a trusted gesture,
 * and a native click/Enter may also dispatch submit. No body or editor value is read. */
export function createNativeSendIntentObserver({document:doc,profile,onIntent,onPrepare=null,makeId=()=>crypto.randomUUID(),now=Date.now}={}){
 if(!doc?.defaultView||typeof doc.addEventListener!=='function'||typeof onIntent!=='function'||onPrepare!==null&&typeof onPrepare!=='function'||typeof makeId!=='function'||typeof now!=='function')throw Error('invalid-native-send-intent');
 const config=profile?.sendIntent?{...profile.sendIntent}:null;
 if(config&&!['formSelector','editorSelector','sendButtonSelector'].every(k=>typeof config[k]==='string'&&config[k].length>0&&config[k].length<=256))throw Error('invalid-send-intent-profile');
 if(config&&config.enterSends!==undefined&&typeof config.enterSends!=='boolean')throw Error('invalid-send-intent-profile');
 let stopped=false,composing=null,last=null;const listeners=[];
 function shown(node){if(!node?.isConnected||node.ownerDocument!==doc||!node.getClientRects().length)return false;let depth=0;for(let p=node;p;p=p.parentElement){if(++depth>64)return false;const s=doc.defaultView.getComputedStyle(p);if(p.hidden||p.inert||p.getAttribute('aria-hidden')==='true'||s.display==='none'||['hidden','collapse'].includes(s.visibility))return false;}return true;}
 function available(node){return !node.disabled&&node.getAttribute('aria-disabled')!=='true'&&!node.matches(':disabled');}
 function boundary(allowDisabledButton=false){const forms=doc.querySelectorAll(config.formSelector),editors=doc.querySelectorAll(config.editorSelector),buttons=doc.querySelectorAll(config.sendButtonSelector);if(forms.length!==1||editors.length!==1||buttons.length!==1)return null;const [form]=forms,[editor]=editors,[button]=buttons;if(form.tagName!=='FORM'||!form.contains(editor)||!form.contains(button)||button.form!==form||editor.form&&editor.form!==form||![form,editor,button].every(shown)||(!available(editor)||!allowDisabledButton&&!available(button))||editor.readOnly||['file','reset'].includes(button.type)||!['BUTTON','INPUT'].includes(button.tagName))return null;return {form,editor,button};}
 function handle(event){if(stopped||event.isTrusted!==true)return;try{
  // A native rerender can remove/disable Send before compositionend. End only
  // the tracked editor's composition; this grants no intent or body authority.
  if(event.type==='compositionend'){if(composing&&(composing===event.target||composing.contains(event.target)))composing=null;return;}
  const preparing=event.type==='focusin'||event.type==='pointerdown';
  const b=boundary(event.type==='compositionstart'||preparing);if(!b)return;const inEditor=b.editor===event.target||b.editor.contains(event.target);
  if(event.type==='compositionstart'){if(inEditor)composing=b.editor;return;}
  if(composing===b.editor||event.isComposing===true||event.keyCode===229||event.defaultPrevented||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey)return;
  if(preparing){if((inEditor||available(b.button)&&(b.button===event.target||b.button.contains(event.target)))&&(event.type!=='pointerdown'||event.button===0)){try{onPrepare?.();}catch{/* Preparation cannot interfere with native focus or input. */}}return;}
  if(event.type==='keydown'){if(config.enterSends!==true||!inEditor||event.key!=='Enter'||event.repeat)return;}else if(event.type==='click'){if(event.button!==0||!(b.button===event.target||b.button.contains(event.target)))return;}else return;
  const time=now();if(!Number.isFinite(time))return;const observedAt=new Date(time).toISOString();
  // Enter can activate the same native send button. Consume just its following click;
  // independent repeated clicks or Enter presses are not collapsed into one intent.
  if(event.type==='click'&&event.detail===0&&last?.form===b.form&&last.type==='keydown'&&time>=last.time&&time-last.time<=500){last=null;return;}
  const intentId=makeId();if(!tokenOK(intentId))return;last={form:b.form,type:event.type,time};
  try{onIntent(Object.freeze({intentId,kind:'send',isComposing:false,observedAt}));}catch{/* Candidate consumer cannot interfere with the host gesture. */}
 }catch{/* Unsupported or changing native DOM fails closed. */}}
 if(config)for(const type of ['click','keydown','compositionstart','compositionend',...(onPrepare?['focusin','pointerdown']:[])]){doc.addEventListener(type,handle,{capture:true,passive:true});listeners.push(type);}
 function stop(){if(stopped)return;stopped=true;for(const type of listeners)doc.removeEventListener(type,handle,true);listeners.length=0;composing=null;last=null;}
 return Object.freeze({stop});
}
