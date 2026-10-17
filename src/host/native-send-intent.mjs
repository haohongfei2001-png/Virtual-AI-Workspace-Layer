import {tokenOK} from '../b1/identity.mjs';
/** Passive candidate only. Profile selectors must distinguish send from stop/upload/regenerate.
 * Submit is deliberately not observed: requestSubmit is not proof of a trusted gesture,
 * and a native click/Enter may also dispatch submit. No body or editor value is read. */
export function createNativeSendIntentObserver({document:doc,profile,onIntent,onFirstIntent=null,onPrepare=null,makeId=()=>crypto.randomUUID(),now=Date.now}={}){
 if(!doc?.defaultView||typeof doc.addEventListener!=='function'||typeof onIntent!=='function'||onPrepare!==null&&typeof onPrepare!=='function'||typeof makeId!=='function'||typeof now!=='function')throw Error('invalid-native-send-intent');
 if(onFirstIntent!==null&&typeof onFirstIntent!=='function')throw Error('invalid-first-intent-consumer');
 const supplied=profile?.sendIntent;
 let editorKinds=['textarea'];
 if(supplied&&Object.hasOwn(supplied,'editorKinds')){
  const entry=Object.getOwnPropertyDescriptor(supplied,'editorKinds');
  if(!entry||!Object.hasOwn(entry,'value'))throw Error('invalid-send-intent-profile');
  const kinds=entry.value,length=Object.getOwnPropertyDescriptor(kinds??{},'length')?.value;
  if(!Array.isArray(kinds)||Object.getPrototypeOf(kinds)!==Array.prototype||!Number.isSafeInteger(length)||length<1||length>2||Reflect.ownKeys(kinds).length!==length+1)throw Error('invalid-send-intent-profile');
  editorKinds=[];for(let i=0;i<length;i++){const item=Object.getOwnPropertyDescriptor(kinds,String(i));if(!item||!Object.hasOwn(item,'value')||!['textarea','contenteditable'].includes(item.value)||editorKinds.includes(item.value))throw Error('invalid-send-intent-profile');editorKinds.push(item.value);}
 }
 const config=supplied?{...supplied,editorKinds}:null;
 if(config&&!['formSelector','editorSelector','sendButtonSelector'].every(k=>typeof config[k]==='string'&&config[k].length>0&&config[k].length<=256))throw Error('invalid-send-intent-profile');
 if(config&&config.enterSends!==undefined&&typeof config.enterSends!=='boolean')throw Error('invalid-send-intent-profile');
 let stopped=false,composing=null,last=null;const listeners=[];
 function shown(node){if(!node?.isConnected||node.ownerDocument!==doc||!node.getClientRects().length)return false;let depth=0;for(let p=node;p;p=p.parentElement){if(++depth>64)return false;const s=doc.defaultView.getComputedStyle(p);if(p.hidden||p.inert||p.getAttribute('aria-hidden')==='true'||s.display==='none'||['hidden','collapse'].includes(s.visibility))return false;}return true;}
 function available(node){return !node.disabled&&node.getAttribute('aria-disabled')!=='true'&&!node.matches(':disabled');}
 function editable(node){return !node.readOnly&&node.getAttribute('aria-readonly')!=='true'&&(config.editorKinds.includes('textarea')&&node.tagName==='TEXTAREA'||config.editorKinds.includes('contenteditable')&&node.tagName==='DIV'&&node.getAttribute('role')==='textbox'&&['true','plaintext-only'].includes(node.getAttribute('contenteditable'))&&node.isContentEditable===true&&node.parentElement?.isContentEditable!==true);}
 function editorTarget(editor,target){
  if(editor===target)return true;
  if(editor.tagName!=='DIV'||!editor.contains(target))return false;
  // A rich editor may contain native widgets or a separate editing island.
  // Their Enter/focus events do not establish this editing host's send path.
  let depth=0;for(let node=target;node&&node!==editor;node=node.parentElement){
   if(++depth>64||node.ownerDocument!==doc||!node.isConnected||node.isContentEditable!==true||['INPUT','TEXTAREA','BUTTON','SELECT','OPTION'].includes(node.tagName)||node.getAttribute('contenteditable')!==null||node.getAttribute('role')==='textbox')return false;
   if(node.parentElement===editor)return true;
  }return false;
 }
 function boundary(allowDisabledButton=false){const forms=doc.querySelectorAll(config.formSelector),editors=doc.querySelectorAll(config.editorSelector),buttons=doc.querySelectorAll(config.sendButtonSelector);if(forms.length!==1||editors.length!==1||buttons.length!==1)return null;const [form]=forms,[editor]=editors,[button]=buttons;if(form.tagName!=='FORM'||!form.contains(editor)||!form.contains(button)||button.form!==form||editor.form&&editor.form!==form||![form,editor,button].every(shown)||(!available(editor)||!allowDisabledButton&&!available(button))||!editable(editor)||['file','reset'].includes(button.type)||!['BUTTON','INPUT'].includes(button.tagName))return null;return {form,editor,button};}
 function handle(event){if(stopped||event.isTrusted!==true)return;try{
  // A native rerender can remove/disable Send before compositionend. End only
  // the tracked editor's composition; this grants no intent or body authority.
  if(event.type==='compositionend'){if(composing&&(composing.target===event.target||editorTarget(composing.editor,event.target)))composing=null;return;}
  const preparing=event.type==='focusin'||event.type==='pointerdown';
  const b=boundary(event.type==='compositionstart'||preparing);if(stopped||!b)return;const inEditor=editorTarget(b.editor,event.target);
  if(event.type==='compositionstart'){if(inEditor)composing={editor:b.editor,target:event.target};return;}
  if(composing?.editor===b.editor||event.isComposing===true||event.keyCode===229||event.defaultPrevented||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey)return;
  if(preparing){if((inEditor||available(b.button)&&(b.button===event.target||b.button.contains(event.target)))&&(event.type!=='pointerdown'||event.button===0)){try{if(!stopped)onPrepare?.();}catch{/* Preparation cannot interfere with native focus or input. */}}return;}
  if(event.type==='keydown'){if(config.enterSends!==true||!inEditor||event.key!=='Enter'||event.repeat)return;}else if(event.type==='click'){if(event.button!==0||!(b.button===event.target||b.button.contains(event.target)))return;}else return;
  const time=now();if(stopped||!Number.isFinite(time))return;const observedAt=new Date(time).toISOString();
  // Enter can activate the same native send button. Consume just its following click;
  // independent repeated clicks or Enter presses are not collapsed into one intent.
  if(event.type==='click'&&event.detail===0&&last?.form===b.form&&last.type==='keydown'&&time>=last.time&&time-last.time<=500){last=null;return;}
  const intentId=makeId();if(stopped||!tokenOK(intentId))return;last={form:b.form,type:event.type,time};
  const first=profile?.firstSend;
  if(onFirstIntent&&first&&doc.location?.origin===first.origin&&doc.location?.href===first.origin+'/'){
   const operationId=b.form.getAttribute(first.operationAttribute),messageId=b.form.getAttribute(first.messageAttribute);
   if(!stopped&&tokenOK(operationId)&&tokenOK(messageId))try{onFirstIntent(Object.freeze({intentId,operationId,messageId,observedAt}));}catch{}
  }
  if(stopped)return;
  const terminal=profile?.oldSendTerminal;let operation=null;if(terminal&&doc.location?.origin===terminal.origin&&doc.location?.pathname?.startsWith('/c/')){const operationId=b.form.getAttribute(terminal.operationAttribute),messageId=b.form.getAttribute(terminal.messageAttribute);if(tokenOK(operationId)&&tokenOK(messageId))operation=Object.freeze({operationId,messageId});}
  // DOM reads and the first-send consumer may synchronously retire this observer.
  // A retired gesture cannot cross into the replacement producer.
  if(stopped)return;
  try{onIntent(Object.freeze({intentId,kind:'send',isComposing:false,observedAt,...(operation?{operation}: {})}));}catch{/* Candidate consumer cannot interfere with the host gesture. */}
 }catch{/* Unsupported or changing native DOM fails closed. */}}
 if(config)for(const type of ['click','keydown','compositionstart','compositionend',...(onPrepare?['focusin','pointerdown']:[])]){doc.addEventListener(type,handle,{capture:true,passive:true});listeners.push(type);}
 function stop(){if(stopped)return;stopped=true;for(const type of listeners)doc.removeEventListener(type,handle,true);listeners.length=0;composing=null;last=null;}
 return Object.freeze({stop});
}
