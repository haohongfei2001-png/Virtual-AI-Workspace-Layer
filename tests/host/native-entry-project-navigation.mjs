import assert from 'node:assert/strict';
/** Clear composer + available original project anchor: production uses the
 * native-control plan, not the frame anchor's static _blank fallback. */
export async function openNativeProjectEntry({page,context,link,projectURL,readActions}){
 const path=new URL(projectURL).pathname,beforePages=context.pages(),beforeActions=readActions().length;
 assert.notEqual(page.url(),projectURL,'entry must start outside target project');
 const original=await page.locator(`aside section[aria-label="Projects"] a[href="${path}"]`).elementHandle();assert(original,'original-native-project-anchor-required');
 const opened=[];const onPage=value=>opened.push(value);context.on('page',onPage);
 let witness;
 try{
  witness=await original.evaluateHandle(node=>{
   const state={clicks:0,originalNode:true,href:node.href};
   const listener=event=>{state.clicks++;state.originalNode&&=event.currentTarget===node&&node.isConnected;};
   node.addEventListener('click',listener);
   return {state,stop(){node.removeEventListener('click',listener);}};
  });
  await Promise.all([page.waitForURL(projectURL,{timeout:15000}),link.click()]);
  const observed=await witness.evaluate(value=>value.state);
  assert.equal(observed.href,projectURL);assert.equal(observed.clicks,1,'exactly one original native anchor activation');assert.equal(observed.originalNode,true);
  assert.equal(page.url(),projectURL);assert.equal(opened.length,0,'no page event during real native navigation observation');assert.deepEqual(context.pages(),beforePages,'native-control must not open a fallback popup');
  const actions=readActions().slice(beforeActions).filter(a=>a.kind==='navigate');assert.equal(actions.length,1);assert.equal(actions[0].path,path);
  return {mode:'SAME_PAGE_NATIVE_CONTROL',originalNativeAnchor:observed,nativeNavigations:actions.length,newPages:opened.length,pageObservationWindow:'Before user click through exact native route and action confirmation; max 15 seconds, no timeout-as-pass',scope:'Clear composer with existing Project liveHandle only; not href fallback coverage',destination:page.url()};
 }finally{context.off('page',onPage);try{if(witness)await witness.evaluate(value=>value.stop());}finally{await witness?.dispose();await original.dispose();}}
}
