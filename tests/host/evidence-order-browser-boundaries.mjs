import assert from 'node:assert/strict';
import {openNativeProjectEntry} from './native-entry-project-navigation.mjs';
/** This journey has an emptied native composer and an existing native handle.
 * The frame href/target describes fallback, not the selected native-control plan. */
export async function openEvidenceProjectPage({context,sourcePage,link,projectURL,readActions,navigate=openNativeProjectEntry}){
 assert.equal(await link.getAttribute('href'),projectURL);
 const preconditions=await sourcePage.evaluate(()=>{const editors=document.querySelectorAll('#prompt-textarea'),editor=editors[0],files=[...document.querySelectorAll('#composer input[type="file"]')];return {exactEditor:editors.length===1,plainEditor:editor?.tagName==='TEXTAREA',draftEmpty:editor?.value==='',filesEmpty:files.every(n=>(n.files?.length??0)===0)};});
 assert.deepEqual(preconditions,{exactEditor:true,plainEditor:true,draftEmpty:true,filesEmpty:true},'membership entry requires clear genuine native composer');
 const navigation=await navigate({page:sourcePage,context,link,projectURL,readActions});
 assert.equal(navigation.mode,'SAME_PAGE_NATIVE_CONTROL');
 return {page:sourcePage,preconditions,navigation};
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
  if(lastFlags.workspaceVisible&&lastFlags.exactWorkspaceFrame&&lastFlags.workspaceUsable)return {elapsedMs:now()-started,returnClicks,flags:lastFlags};
  if(lastFlags.ambiguousVisibleReturn)throw failure('workspace-ambiguous-return');
  if(!lastFlags.workspaceVisible&&lastFlags.uniqueVisibleReturn&&returnClicks===0){returnClicks++;await bounded(left=>clickReturn(left));}
  if(remaining()>0)await bounded(left=>sleep(Math.min(75,left)));
 }
 throw failure('workspace-readiness-deadline');
}
/** Observe native source identity while the workspace may correctly mask it.
 * This does not establish visual reachability; the runner separately clicks C in the real frame. */
export async function readEvidenceNativeMember({page,projectId,conversationId,title}){
 const selector=`#reading nav[aria-label="Project conversations"][data-project-id="${projectId}"] > a[href="/c/${conversationId}"]`,row=page.locator(selector);
 await row.waitFor({state:'attached',timeout:25000});assert.equal(await row.count(),1,'native member source must be unique');
 const evidence=await row.evaluate((node,{projectId,conversationId,title})=>{
  const doc=node.ownerDocument,reading=doc.querySelector('#reading'),nav=node.closest('nav'),style=doc.defaultView.getComputedStyle(node);
  return {connected:node.isConnected,insideNativeReading:!!reading?.contains(node),nativeProjectMatches:nav?.getAttribute('data-project-id')===projectId,nativeConversationMatches:node.getAttribute('href')==='/c/'+conversationId,titleMatches:node.textContent===title,readingHasWorkspaceMask:!!reading?.closest('[data-va-mask-workspace]'),sourceCssVisible:style.visibility==='visible'&&style.display!=='none',evidenceKind:'ATTACHED_NATIVE_SOURCE_IDENTITY_NOT_VISUAL_REACHABILITY'};
 },{projectId,conversationId,title});
 for(const key of ['connected','insideNativeReading','nativeProjectMatches','nativeConversationMatches','titleMatches'])assert.equal(evidence[key],true,key);
 return evidence;
}
