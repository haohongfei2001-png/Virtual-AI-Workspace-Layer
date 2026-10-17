import assert from 'node:assert/strict';
const draft='HISTORICAL_UPDATE_UNSENT_DRAFT';
async function bounded(task){let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('live-page-inspection-timeout')),1500);})]);}finally{clearTimeout(timer);}}
export async function inspectHistoricalPrivate(frames){
 const states=[];
 for(const frame of frames){if(frame.isDetached()){states.push({detached:true,privatePresent:false});continue;}
  try{states.push(await bounded(frame.evaluate(()=>{let privatePresent=false;const walk=root=>{for(const node of root.childNodes??[]){if(node.nodeType===Node.TEXT_NODE){if(['Research','Ordinary conversation','Membership not loaded','J4 retained'].some(text=>(node.textContent??'').includes(text)))privatePresent=true;}else walk(node);if(node.shadowRoot)walk(node.shadowRoot);}};walk(document);return {detached:false,privatePresent};})));}
  catch(error){if(!frame.isDetached())throw error;states.push({detached:true,privatePresent:false});}}
 return {privateProjectionAbsent:states.every(s=>!s.privatePresent),frames:states};
}
export async function captureHistoricalLivePage({page,extensionId}){
 const urls=['workspace','sidebar'].map(role=>`chrome-extension://${extensionId}/${role}.html`),frames=urls.map(url=>page.frames().find(f=>f.url()===url));assert(frames.every(Boolean),'old dual frames required');
 const positive=await inspectHistoricalPrivate(frames);assert.equal(positive.privateProjectionAbsent,false,'old private DOM positive control');
 await page.bringToFront();await page.locator('textarea').fill(draft);
 await page.evaluate(()=>{globalThis.__historicalLive={document,editor:document.querySelector('textarea'),url:location.href,pageHides:0};addEventListener('pagehide',()=>__historicalLive.pageHides++);});
 return {frames,urls,positive};
}
export function assertHistoricalLiveState(state,{typed=false}={}){
 for(const key of ['sameDocument','sameEditor','editorConnected','sameURL'])assert.equal(state[key],true,key);
 assert.equal(state.pageHides,0);assert.equal(state.draft,draft+(typed?'_AFTER_UPDATE':''));assert.equal(state.openOwned,0,'update itself must close old surfaces');
 for(const region of [state.reading,state.history]){assert.equal(region.visibility,'visible');assert.notEqual(region.interactivity,'inert');assert.equal(region.htmlInert,false);}
 if(typed)assert.equal(state.focused,true);
}
export async function verifyHistoricalLivePage({page,capture}){
 let privateState;const until=Date.now()+5000;
 do{privateState=await inspectHistoricalPrivate(capture.frames);if(privateState.privateProjectionAbsent)break;await page.waitForTimeout(100);}while(Date.now()<until);
 assert.equal(privateState.privateProjectionAbsent,true,'old private projection survives actual update');
 const liveFrames=page.frames().filter(f=>capture.urls.includes(f.url()));assert(liveFrames.every(f=>capture.frames.includes(f)),'update unexpectedly revived a private UI document before reauthorization');
 const connected=await page.locator('iframe').evaluateAll((nodes,urls)=>nodes.filter(n=>urls.includes(n.src)).length,capture.urls);assert(connected<=capture.frames.filter(f=>!f.isDetached()).length,'connected old frame escaped inspection');
 const state=()=>bounded(page.evaluate(()=>{const s=globalThis.__historicalLive;const style=n=>({visibility:getComputedStyle(n).visibility,interactivity:getComputedStyle(n).interactivity,htmlInert:!!n.closest('[inert]')});return {sameDocument:s.document===document,sameEditor:s.editor===document.querySelector('textarea'),editorConnected:s.editor.isConnected,sameURL:s.url===location.href,pageHides:s.pageHides,draft:s.editor.value,focused:document.activeElement===s.editor,openOwned:document.querySelectorAll('[data-va-owned]:popover-open').length,reading:style(document.querySelector('#reading')),history:style(document.querySelector('nav[aria-label="Chat history"]'))};}));
 const natural=await state();assertHistoricalLiveState(natural);
 await page.bringToFront();await page.locator('textarea').press('End');await page.locator('textarea').pressSequentially('_AFTER_UPDATE');
 const native=await state();assertHistoricalLiveState(native,{typed:true});assert.equal((await inspectHistoricalPrivate(capture.frames)).privateProjectionAbsent,true);
 return {privateDetectorPositiveControl:true,privateState,natural,native,nativeOperable:true,privateProjectionAbsent:true,oldProjectionNotRevived:true,manualCloseUsed:false,reloadUsed:false};
}
