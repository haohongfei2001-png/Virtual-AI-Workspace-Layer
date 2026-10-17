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
 const readContinuity=()=>page.evaluate(()=>{const reading=document.querySelector('#reading'),editor=document.querySelector('#prompt-textarea');return {sameDocument:document===globalThis.c2ColdDocument,sameEditor:editor===globalThis.c2ColdEditor,draft:editor?.value,conversationId:reading?.getAttribute('data-conversation-id'),nativeReadingVisible:!!reading&&getComputedStyle(reading).visibility==='visible'&&reading.getBoundingClientRect().height>0,nativeComposerVisible:!!editor&&getComputedStyle(editor).visibility==='visible'&&editor.getBoundingClientRect().height>0,popovers:document.querySelectorAll('[data-va-owned]:popover-open').length,returns:document.querySelectorAll('button[data-va-owned][aria-label="返回工作空间"]').length};});
 let proof,reading;
 while(!proof){const candidate=await within(()=>currentJ4Grant(page,id,scopeKey,options));if(candidate){reading=await within(readContinuity);assert.equal(reading.popovers,0,'native navigation must not reopen workspace');assert(reading.returns<=1,'return must stay unique');if(reading.returns===1)proof=candidate;}if(!proof)await sleep(Math.min(50,remaining()));}
 assert.deepEqual(reading,{sameDocument:true,sameEditor:true,draft:expectedDraft,conversationId:currentRef,nativeReadingVisible:true,nativeComposerVisible:true,popovers:0,returns:1},'new native route must stay in reading with the original editor and unique return');
 const returnButton=page.getByRole('button',{name:'返回工作空间',exact:true});
 await within(()=>returnButton.click({timeout:remaining()}));
 // Keep the existing exact two-open-popover oracle, now after the real return.
 await within(()=>waitMounted(remaining()));
 const after=await within(()=>currentJ4Grant(page,id,scopeKey,options));
 assert(after&&after.frame===proof.frame&&after.grant===proof.grant,'return must retain the freshly authorized current frame and its actual VIEW');
 const restored=await within(readContinuity);
 assert.equal(restored.sameDocument,true);assert.equal(restored.sameEditor,true);assert.equal(restored.draft,expectedDraft);assert.equal(restored.conversationId,currentRef);assert.equal(restored.nativeComposerVisible,true);assert.equal(restored.nativeReadingVisible,false);assert.equal(restored.popovers,2);assert.equal(restored.returns,0);
 return {freshGrantAndActualVIEW:true,scopeKey,currentRef,reading,explicitReturn:true,workspacePopovers:2,elapsedMs:timeoutMs-remaining()};
}
