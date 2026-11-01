import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
/** Clear composer + available original project anchor: production uses the
 * native-control plan, not the frame anchor's static _blank fallback. */
export async function openNativeProjectEntry({page,context,link,projectURL,readActions}){
 const path=new URL(projectURL).pathname,beforePages=context.pages(),beforeActions=readActions().length;
 assert.notEqual(page.url(),projectURL,'entry must start outside target project');
 const original=await page.locator(`aside section[aria-label="Projects"] a[href="${path}"]`).elementHandle();assert(original,'original-native-project-anchor-required');
 const opened=[];const onPage=value=>opened.push(value);context.on('page',onPage);
 let witness,frameWitness,frameElement,sourceFrame,sourceFrameURL,failure;
 const diagnostic={status:'DIAGNOSTIC_ONLY',limits:'Rendered marker is not private owner-plan authority; DOM anchor presence does not certify a liveHandle. No branch admitted by these observations.',sourceBefore:page.url(),expectedDestination:projectURL};
 const token='vaiwl-native-entry-diagnostic:'+randomUUID()+':';let liveFrameSnapshots=0;
 const onConsole=message=>{try{if(message.type()!=='debug'||message.page()!==page||liveFrameSnapshots>=9)return;const text=message.text();if(!text.startsWith(token)||text.length>20000)return;const value=JSON.parse(text.slice(token.length));if(!sourceFrameURL||!validNativeFrameDiagnostic(value,{href:projectURL,frameURL:sourceFrameURL}))return;diagnostic.frame=value;liveFrameSnapshots++;diagnostic.liveFrameSnapshots=liveFrameSnapshots;}catch{/* Non-authoritative diagnostic transport only. */}};
 page.on('console',onConsole);
 try{frameElement=await link.elementHandle();sourceFrame=await frameElement.ownerFrame();sourceFrameURL=sourceFrame?.url();if(!/^chrome-extension:\/\/[a-p]{32}\/workspace\.html$/.test(sourceFrameURL??''))throw Error('unexpected-diagnostic-source-frame');frameWitness=await frameElement.evaluateHandle(observeNativeProjectFrameClick,{token});}catch(error){diagnostic.frameProbeError=error.message;}
 try{
  witness=await original.evaluateHandle(node=>{
   const state={clicks:0,originalNode:true,href:node.href,connected:node.isConnected,evidence:'DOM_NODE_ONLY_NOT_LIVE_HANDLE'};
   const listener=event=>{state.clicks++;state.originalNode&&=event.currentTarget===node&&node.isConnected;};
   node.addEventListener('click',listener);
   return {state,stop(){node.removeEventListener('click',listener);}};
  });
  await Promise.all([page.waitForURL(projectURL,{timeout:15000}),link.click()]);
  const observed=await witness.evaluate(value=>value.state);
  assert.equal(observed.href,projectURL);assert.equal(observed.clicks,1,'exactly one original native anchor activation');assert.equal(observed.originalNode,true);
  assert.equal(page.url(),projectURL);assert.equal(opened.length,0,'no page event during real native navigation observation');assert.deepEqual(context.pages(),beforePages,'native-control must not open a fallback popup');
  const actions=readActions().slice(beforeActions).filter(a=>a.kind==='navigate');assert.equal(actions.length,1);assert.equal(actions[0].path,path);
  return {diagnostic,mode:'SAME_PAGE_NATIVE_CONTROL',originalNativeAnchor:observed,nativeNavigations:actions.length,newPages:opened.length,pageObservationWindow:'Before user click through exact native route and action confirmation; max 15 seconds, no timeout-as-pass',scope:'Clear composer with existing Project liveHandle only; not href fallback coverage',destination:page.url()};
 }catch(error){failure=error;throw error;}
 finally{
  // Capture while the actual frame/native probes still exist. On failure this
  // accompanies the original exception, never changes the acceptance result.
  try{
   diagnostic.sourceAfter=page.url();diagnostic.openedPages=opened.slice(0,8).map(p=>({url:p.url(),closed:p.isClosed()}));diagnostic.openedPageCount=opened.length;
   diagnostic.actions=readActions().slice(beforeActions,beforeActions+16).map(a=>({kind:a.kind,path:a.path??null,projectId:a.projectId??null}));
   if(witness)try{diagnostic.nativeAnchor=await witness.evaluate(value=>value.state);}catch(error){diagnostic.nativeProbeReadError=error.message;}
   if(frameWitness&&!sourceFrame?.isDetached())try{diagnostic.frame=await frameWitness.evaluate(value=>value.state);}catch(error){diagnostic.frameProbeReadError=error.message;}
   else if(sourceFrame?.isDetached())diagnostic.frameProbeRead='REALM_DETACHED_USING_LIVE_CAPTURE';
  }catch(error){diagnostic.captureError=error.message;}
  if(failure)failure.nativeProjectEntryDiagnostic=diagnostic;
  context.off('page',onPage);page.off('console',onConsole);
  // Diagnostic teardown must not mask the original navigation failure.
  let cleanupFailure;
  for(const [name,close] of [['frame-listeners',async()=>{if(!frameWitness)return;if(sourceFrame?.isDetached()){const proof=await detachedProbeParentProof({sourceFrame,page,context,expectedURL:projectURL});if(!proof.ok)throw Error('detached-frame-probe-parent-not-live');diagnostic.frameCleanup={status:'ALREADY_GONE',...proof};return;}await frameWitness.evaluate(value=>value.stop());}],['native-listener',async()=>witness?.evaluate(value=>value.stop())],['frame-handle',async()=>frameWitness?.dispose()],['frame-element',async()=>frameElement?.dispose()],['native-witness',async()=>witness?.dispose()],['native-element',async()=>original.dispose()]])try{await close();}catch(error){if(['frame-listeners','frame-handle','frame-element'].includes(name)&&sourceFrame?.isDetached()){const proof=await detachedProbeParentProof({sourceFrame,page,context,expectedURL:projectURL});if(proof.ok){diagnostic.frameCleanup={status:'ALREADY_GONE',...proof};(diagnostic.alreadyGoneCleanup??=[]).push(name);continue;}}(diagnostic.cleanupErrors??=[]).push({name,message:error.message});cleanupFailure??=error;}
  if(!failure&&cleanupFailure){cleanupFailure.nativeProjectEntryDiagnostic=diagnostic;throw cleanupFailure;}
 }
}

/** Passive extension-frame-link event observer, not a plan fetch or an input action. */
export function observeNativeProjectFrameClick(original,{token}={}){
 const doc=original.ownerDocument,href=original.href,root=original.getRootNode();
 const sample=node=>({href:node.href,target:node.getAttribute('target'),rel:node.getAttribute('rel'),delegationMarker:node.hasAttribute('data-native-plan-control'),ariaDisabled:node.getAttribute('aria-disabled'),navigationReason:node.getAttribute('data-navigation-reason'),connected:node.isConnected,originalNode:node===original,visibility:doc.visibilityState,documentFocused:doc.hasFocus()});
 const state={sourceURL:doc.location?.href,before:sample(original),events:[]};
 const publish=()=>{if(typeof token==='string')try{doc.defaultView.console.debug(token+JSON.stringify(state));}catch{/* Passive diagnostics cannot alter native input. */}};publish();
 const record=(event,phase)=>{const path=typeof event.composedPath==='function'?event.composedPath():[];const node=path.find(n=>n?.nodeType===1&&n.tagName==='A'&&n.getRootNode()===root&&n.href===href);if(!node||state.events.length>=8)return;state.events.push({...sample(node),phase,defaultPrevented:event.defaultPrevented,trusted:event.isTrusted,button:event.button,modifiers:{ctrl:event.ctrlKey,meta:event.metaKey,shift:event.shiftKey,alt:event.altKey}});publish();};
 const capture=event=>record(event,'capture'),bubble=event=>record(event,'bubble');
 doc.addEventListener('click',capture,true);doc.addEventListener('click',bubble,false);
 return {state,stop(){doc.removeEventListener('click',capture,true);doc.removeEventListener('click',bubble,false);}};
}

/** Only the particular destroyed frame may skip listener teardown. A browser
 * crash, parent closure, or responsive-frame cleanup error must still fail. */
export async function detachedProbeParentProof({sourceFrame,page,context,expectedURL}){
 const proof={frameDetached:sourceFrame?.isDetached()===true,parentOpen:!page.isClosed(),browserConnected:context.browser()?.isConnected()===true,parentStillInContext:context.pages().includes(page),expectedParentURL:page.url()===expectedURL,parentDocumentResponsive:false};
 if(proof.frameDetached&&proof.parentOpen&&proof.browserConnected&&proof.parentStillInContext&&proof.expectedParentURL){
  // Diagnostic-only responsiveness gets one short deadline, never a retry or
  // an unbounded finally wait. Late read-only evaluation cannot grant cleanup.
  let timer;try{proof.parentDocumentResponsive=await Promise.race([Promise.resolve().then(()=>page.evaluate(()=>document.defaultView===window)),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1000);})]);}catch{}finally{clearTimeout(timer);}
 }
 return {ok:Object.values(proof).every(v=>v===true),...proof};
}

export function validNativeFrameDiagnostic(value,{href,frameURL}){
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
 const sampleKeys=['href','target','rel','delegationMarker','ariaDisabled','navigationReason','connected','originalNode','visibility','documentFocused'];
 const sample=v=>v.href===href&&['target','rel','ariaDisabled','navigationReason'].every(k=>v[k]===null||typeof v[k]==='string'&&v[k].length<=160)&&['delegationMarker','connected','originalNode','documentFocused'].every(k=>typeof v[k]==='boolean')&&['hidden','visible'].includes(v.visibility);
 return !!(exact(value,['sourceURL','before','events'])&&value.sourceURL===frameURL&&exact(value.before,sampleKeys)&&sample(value.before)&&Array.isArray(value.events)&&value.events.length<=8&&value.events.every(v=>exact(v,[...sampleKeys,'phase','defaultPrevented','trusted','button','modifiers'])&&sample(v)&&['capture','bubble'].includes(v.phase)&&typeof v.defaultPrevented==='boolean'&&typeof v.trusted==='boolean'&&Number.isInteger(v.button)&&v.button>=0&&v.button<=4&&exact(v.modifiers,['ctrl','meta','shift','alt'])&&Object.values(v.modifiers).every(b=>typeof b==='boolean')));
}
