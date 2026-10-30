import assert from 'node:assert/strict';
import {currentJ4Grant} from './j4-joint-interruption.mjs';
// Recovery has the original single twenty-second mount budget. The first cold
// wait is unchanged. This reads real current grants and VIEW replies; it never
// supplies scope, sends native requests, or changes application presentation.
// The only presentation action is the user's real single return-button click.
export async function verifyColdNativeRecovery({page,id,scopeKey,currentRef,afterTime,previousGrant=null,expectedDraft,waitMounted,timeoutMs=20000,now=Date.now,elapsedNow=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 assert.equal(timeoutMs,20000,'original recovery budget must remain twenty seconds');
 const started=elapsedNow(),options={previousGrant,expectedCurrentRef:currentRef,afterTime,now};let last=started;
 const remaining=()=>{const time=elapsedNow(),left=timeoutMs-(time-started);if(!Number.isFinite(time)||time<last||left<=0)throw Error('cold-recovery-mount-timeout');last=time;return left;};
 const within=async work=>{let timer;try{const result=await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cold-recovery-mount-timeout')),remaining());})]);remaining();return result;}finally{clearTimeout(timer);}};
 // This C2 fixture deliberately has only 110px of native history (its full
 // sidebar variant is a separate UI10 case). Prove the preserved native role,
 // not a second owned exit which would require unsafe sidebar admission.
 const readContinuity=captureHistory=>page.evaluate(({id,captureHistory})=>{
  const reading=document.querySelector('#reading'),editor=document.querySelector('#prompt-textarea'),history=document.querySelector('aside nav[aria-label="Chat history"]');
  const visible=n=>!!n&&n.isConnected&&n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0;
  const historyRect=history?.getBoundingClientRect(),rect=r=>r&&[r.x,r.y,r.width,r.height],hit=(n,x,y)=>{const target=document.elementFromPoint(x,y);return target===n||!!target&&n.contains(target);};
  if(captureHistory&&history){
   const links=[...history.querySelectorAll('a[href]')].map(n=>({node:n,href:n.getAttribute('href')})),points=[];
   for(const {node} of links){const b=node.getBoundingClientRect(),left=Math.max(0,b.left,historyRect.left),right=Math.min(innerWidth,b.right,historyRect.right),top=Math.max(0,b.top,historyRect.top),bottom=Math.min(innerHeight,b.bottom,historyRect.bottom),x=(left+right)/2,y=(top+bottom)/2;if(right>left&&bottom>top&&hit(node,x,y))points.push({node,x,y});}
   globalThis.c2ColdHistoryProof={history,links,points,rect:rect(historyRect)};
  }
  const prior=globalThis.c2ColdHistoryProof,workspaces=[...document.querySelectorAll('[data-va-owned][id$="_workspace"]')],workspace=workspaces[0],frames=workspace?[...workspace.querySelectorAll('iframe')]:[],exits=[...document.querySelectorAll('[data-va-owned][id$="_workspace_exit"]')],exit=exits[0];
  return {sameDocument:document===globalThis.c2ColdDocument,sameEditor:editor===globalThis.c2ColdEditor,draft:editor?.value,conversationId:reading?.getAttribute('data-conversation-id'),nativeReadingVisible:visible(reading),nativeComposerVisible:visible(editor),popovers:document.querySelectorAll('[data-va-owned]:popover-open').length,returns:document.querySelectorAll('button[data-va-owned][aria-label="返回工作空间"]').length,
   nativeHistoryPreserved:!!prior&&history===prior.history&&visible(history)&&!history.closest('[hidden],[inert],[aria-hidden="true"]')&&rect(historyRect).every((v,i)=>Math.abs(v-prior.rect[i])<0.01)&&prior.links.length>0&&prior.links.every(({node,href})=>node.isConnected&&history.contains(node)&&node.getAttribute('href')===href)&&prior.points.length>0&&prior.points.every(({node,x,y})=>hit(node,x,y)),
   workspaceFrameIntact:workspaces.length===1&&!workspace.hasAttribute('popover')&&getComputedStyle(workspace).position==='relative'&&frames.length===1&&frames[0].isConnected&&frames[0].src===`chrome-extension://${id}/workspace.html`&&[...document.querySelectorAll('iframe')].filter(n=>n.src===`chrome-extension://${id}/workspace.html`).length===1,workspaceFlowVisible:visible(workspace)&&visible(frames[0]),
   workspaceExitEmpty:exits.length===1&&exit.childNodes.length===0&&exit.getBoundingClientRect().width===0&&exit.getBoundingClientRect().height===0,workspaceExitOpen:!!exit?.matches(':popover-open'),
   sidebarUnavailablePreserved:![...document.querySelectorAll('[data-va-owned][id$="_sidebar"]')].some(visible)&&document.querySelectorAll(`iframe[src="chrome-extension://${id}/sidebar.html"]`).length===0&&!document.querySelector('[data-va-owned][id$="_sidebar_exit"]:popover-open')};
 },{id,captureHistory});
 let proof,reading;
 while(!proof){const candidate=await within(()=>currentJ4Grant(page,id,scopeKey,options));if(candidate){reading=await within(()=>readContinuity(true));assert.equal(reading.popovers,0,'native navigation must not reopen workspace');assert(reading.returns<=1,'return must stay unique');if(reading.returns===1)proof=candidate;}if(!proof)await sleep(Math.min(50,remaining()));}
 assert.deepEqual(reading,{sameDocument:true,sameEditor:true,draft:expectedDraft,conversationId:currentRef,nativeReadingVisible:true,nativeComposerVisible:true,popovers:0,returns:1,nativeHistoryPreserved:true,workspaceFrameIntact:true,workspaceFlowVisible:false,workspaceExitEmpty:true,workspaceExitOpen:false,sidebarUnavailablePreserved:true},'new native route must stay in reading with the original editor and unique return');
 const returnButton=page.getByRole('button',{name:'返回工作空间',exact:true});
 await within(()=>returnButton.click({timeout:remaining()}));
 // Require the actual flow workspace, with the compact native sidebar intact.
 await within(()=>waitMounted(remaining()));
 const after=await within(()=>currentJ4Grant(page,id,scopeKey,options));
 assert(after&&after.frame===proof.frame&&after.grant===proof.grant,'return must retain the freshly authorized current frame and its actual VIEW');
 const restored=await within(()=>readContinuity(false));
 assert.equal(restored.sameDocument,true);assert.equal(restored.sameEditor,true);assert.equal(restored.draft,expectedDraft);assert.equal(restored.conversationId,currentRef);assert.equal(restored.nativeComposerVisible,true);assert.equal(restored.nativeReadingVisible,false);assert.equal(restored.popovers,1);assert.equal(restored.returns,0);
 for(const key of ['nativeHistoryPreserved','workspaceFrameIntact','workspaceFlowVisible','workspaceExitEmpty','workspaceExitOpen','sidebarUnavailablePreserved'])assert.equal(restored[key],true,key+' must hold after explicit Return');
 return {freshGrantAndActualVIEW:true,scopeKey,currentRef,reading,restored,explicitReturn:true,workspacePopovers:1,nativeSidebarPreserved:true,elapsedMs:timeoutMs-remaining()};
}
