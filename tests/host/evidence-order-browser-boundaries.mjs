import assert from 'node:assert/strict';
/** Follow the production target, never retarget the anchor or synthesize a goto. */
export async function openEvidenceProjectPage({context,sourcePage,link,projectURL,onPageError}){
 assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('href'),projectURL);
 const sourceURL=sourcePage.url();const [opened]=await Promise.all([context.waitForEvent('page'),link.click()]);
 assert.notEqual(opened,sourcePage);opened.on('pageerror',onPageError);await opened.waitForURL(projectURL);assert.equal(sourcePage.url(),sourceURL,'external project action must not replace original conversation');return opened;
}
export async function verifyEvidencePackage({verify,readManifest,initialManifestHash,hash}){
 const result=await verify();assert.equal(result.status,'OFFLINE_HOST_RECONSTRUCTION');const finalHash=hash(await readManifest());assert.equal(finalHash,initialManifestHash,'built manifest changed');return {status:result.status,buildManifestHash:finalHash,buildManifestUnchanged:true};
}
/** One shared elapsed deadline; working state needs no return button. No authority/UI injection. */
export async function waitEvidenceWorkspace({sample,clickReturn,now=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=25000}){
 const started=now(),deadline=started+timeoutMs;let returnClicks=0,lastFlags=null;
 const remaining=()=>Math.max(0,deadline-now());
 const failure=reason=>{const error=Error(reason);error.readiness={elapsedMs:now()-started,returnClicks,flags:lastFlags};return error;};
 async function bounded(work){const left=remaining();if(!left)throw failure('workspace-readiness-deadline');let timer;try{return await Promise.race([work(left),new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure('workspace-readiness-deadline')),left);})]);}catch(error){error.readiness??={elapsedMs:now()-started,returnClicks,flags:lastFlags};throw error;}finally{clearTimeout(timer);}}
 while(remaining()>0){
  lastFlags=await bounded(()=>sample());
  if(lastFlags.bothSurfacesOpen&&lastFlags.exactWorkspaceFrame&&lastFlags.workspaceUsable)return {elapsedMs:now()-started,returnClicks,flags:lastFlags};
  if(lastFlags.ambiguousVisibleReturn)throw failure('workspace-ambiguous-return');
  if(!lastFlags.bothSurfacesOpen&&lastFlags.uniqueVisibleReturn&&returnClicks===0){returnClicks++;await bounded(left=>clickReturn(left));}
  if(remaining()>0)await bounded(left=>sleep(Math.min(75,left)));
 }
 throw failure('workspace-readiness-deadline');
}
