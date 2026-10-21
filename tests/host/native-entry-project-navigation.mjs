import assert from 'node:assert/strict';
/** Clear composer + available original project anchor: production uses the
 * native-control plan, not the frame anchor's static _blank fallback. */
export async function openNativeProjectEntry({page,context,link,projectURL,readActions}){
 const path=new URL(projectURL).pathname,beforePages=context.pages(),beforeActions=readActions().length;
 assert.notEqual(page.url(),projectURL,'entry must start outside target project');
 const original=await page.locator(`aside section[aria-label="Projects"] a[href="${path}"]`).elementHandle();assert(original,'original-native-project-anchor-required');
 const opened=[];const onPage=value=>opened.push(value);context.on('page',onPage);
 let witness,frameWitness,failure;
 const diagnostic={status:'DIAGNOSTIC_ONLY',limits:'Rendered marker is not private owner-plan authority; DOM anchor presence does not certify a liveHandle. No branch admitted by these observations.',sourceBefore:page.url(),expectedDestination:projectURL};
 try{frameWitness=await link.evaluateHandle(observeNativeProjectFrameClick);}catch(error){diagnostic.frameProbeError=error.message;}
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
   if(frameWitness)try{diagnostic.frame=await frameWitness.evaluate(value=>value.state);}catch(error){diagnostic.frameProbeReadError=error.message;}
  }catch(error){diagnostic.captureError=error.message;}
  if(failure)failure.nativeProjectEntryDiagnostic=diagnostic;
  context.off('page',onPage);
  // Diagnostic teardown must not mask the original navigation failure.
  let cleanupFailure;
  for(const [name,close] of [['frame-listeners',async()=>frameWitness?.evaluate(value=>value.stop())],['native-listener',async()=>witness?.evaluate(value=>value.stop())],['frame-handle',async()=>frameWitness?.dispose()],['native-witness',async()=>witness?.dispose()],['native-element',async()=>original.dispose()]])try{await close();}catch(error){(diagnostic.cleanupErrors??=[]).push({name,message:error.message});cleanupFailure??=error;}
  if(!failure&&cleanupFailure){cleanupFailure.nativeProjectEntryDiagnostic=diagnostic;throw cleanupFailure;}
 }
}

/** Passive extension-frame-link event observer, not a plan fetch or an input action. */
export function observeNativeProjectFrameClick(original){
 const doc=original.ownerDocument,href=original.href,root=original.getRootNode();
 const sample=node=>({href:node.href,target:node.getAttribute('target'),rel:node.getAttribute('rel'),delegationMarker:node.hasAttribute('data-native-plan-control'),ariaDisabled:node.getAttribute('aria-disabled'),navigationReason:node.getAttribute('data-navigation-reason'),connected:node.isConnected,originalNode:node===original,visibility:doc.visibilityState,documentFocused:doc.hasFocus()});
 const state={before:sample(original),events:[]};
 const record=(event,phase)=>{const path=typeof event.composedPath==='function'?event.composedPath():[];const node=path.find(n=>n?.nodeType===1&&n.tagName==='A'&&n.getRootNode()===root&&n.href===href);if(!node||state.events.length>=8)return;state.events.push({...sample(node),phase,defaultPrevented:event.defaultPrevented,trusted:event.isTrusted,button:event.button,modifiers:{ctrl:event.ctrlKey,meta:event.metaKey,shift:event.shiftKey,alt:event.altKey}});};
 const capture=event=>record(event,'capture'),bubble=event=>record(event,'bubble');
 doc.addEventListener('click',capture,true);doc.addEventListener('click',bubble,false);
 return {state,stop(){doc.removeEventListener('click',capture,true);doc.removeEventListener('click',bubble,false);}};
}
