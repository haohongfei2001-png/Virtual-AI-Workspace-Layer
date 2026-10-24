/** Passive, bounded offline-runner diagnostic. No DOM writes, event cancellation,
 * native content, credentials, or authorization evidence. Evaluated in the page. */
export function installSnippetsPresentationProbe(){
 const ids=new WeakMap();let next=0,dropped=0;const events=[];
 const id=node=>{if(!node)return null;if(!ids.has(node))ids.set(node,++next);return ids.get(node);};
 const visible=node=>!!node.getClientRects().length&&getComputedStyle(node).visibility==='visible';
 const snapshot=()=>({
  surfaces:[...document.querySelectorAll('[popover][data-va-owned]')].slice(0,8).map(node=>({node:id(node),connected:node.isConnected,open:node.matches(':popover-open'),buttons:[...node.querySelectorAll(':scope > button')].slice(0,2).map(button=>({node:id(button),target:id(button.popoverTargetElement),action:button.popoverTargetAction}))})),
  returns:[...document.querySelectorAll('[aria-label="返回工作空间"]')].slice(0,4).map(node=>({node:id(node),connected:node.isConnected,visible:visible(node)})),
  readingVisible:!!document.querySelector('#reading')&&getComputedStyle(document.querySelector('#reading')).visibility==='visible'
 });
 const record=event=>{
  if(events.length>=128){dropped++;return;}
  const target=event.composedPath()[0];
  events.push({type:event.type,trusted:event.isTrusted,at:performance.now(),target:id(target),oldState:event.oldState??null,newState:event.newState??null,defaultPrevented:event.defaultPrevented,snapshot:snapshot()});
 };
 const types=['pointerdown','pointerup','click','beforetoggle','toggle'];
 const initial=snapshot();for(const type of types)document.addEventListener(type,record,true);
 globalThis.__vaiwlSnippetPresentationProbe={finish(){
  for(const type of types)document.removeEventListener(type,record,true);
  delete globalThis.__vaiwlSnippetPresentationProbe;
  return {kind:'PASSIVE_PRESENTATION_DIAGNOSTIC_NOT_ACCEPTANCE',initial,events,dropped,final:snapshot()};
 }};
}
