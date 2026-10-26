import {observeCurrentFrame} from './observe-current-frame.mjs';
import {j2Within} from './j2-runner-bounds.mjs';
/** A DOM iframe is not yet a navigated/authorized private frame. One shared deadline;
 * observations may follow replacement, but the native return action is never replayed. */
export async function waitPageCommandPrivateView(page,extensionId,{timeout=15000,now=Date.now,stage=()=>{}}={}){
 const end=now()+timeout,remaining=()=>{const value=end-now();if(value<=0)throw Error('page-command-private-readiness-deadline');return value;};
 const url=`chrome-extension://${extensionId}/workspace.html`;
 const current=()=>{const frames=page.frames().filter(f=>f.url()===url&&!f.isDetached());if(frames.length>1)throw Error('ambiguous-owned-workspace');return frames[0]??null;};
 const ownedState=async frame=>{const element=await frame.frameElement();try{
  const state=await element.evaluate((node,url)=>{const owner=node.closest('[data-va-owned][id$="_workspace"]');return {owned:node.isConnected&&node.src===url&&!!owner,visible:!!owner?.matches(':popover-open')&&owner.getClientRects().length>0&&getComputedStyle(owner).visibility==='visible'};},url);
  if(!state.owned)throw Error('foreign-workspace-frame');return state;
 }finally{await element.dispose();}};
 const observe=fn=>j2Within('page-command-private-readiness',()=>observeCurrentFrame(current,async frame=>fn(frame,await ownedState(frame)),{parentAlive:()=>!page.isClosed(),timeout:remaining(),now}),remaining());
 stage('await-owned-private-frame');
 await observe(async frame=>await frame.locator('.workspace[aria-label="主题工作区"]').count()===1);
 stage('await-private-presentation');
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-va-owned][id$="_workspace"]:popover-open')].some(n=>n.getClientRects().length&&getComputedStyle(n).visibility==='visible')||[...document.querySelectorAll('button[aria-label="返回工作空间"]')].some(n=>n.getClientRects().length&&getComputedStyle(n).visibility==='visible'),null,{timeout:remaining()});
 let nativeReturnClicked=false;
 const beforeReturn=current();if(!beforeReturn)throw Error('private-frame-lost-before-return');
 if(!(await j2Within('page-command-private-readiness',()=>ownedState(beforeReturn),remaining())).visible){
  const back=page.locator('button[aria-label="返回工作空间"]:visible');if(await back.count()!==1)throw Error('ambiguous-or-missing-native-return');
  stage('native-return-once');await back.click({timeout:remaining()});nativeReturnClicked=true;
 }
 // A populated UNKNOWN inventory is folded by the formal UI. Observe readiness
 // separately from its one user action; never replay disclosure after replacement.
 const ready=await observe(async (frame,state)=>state.visible&&await frame.locator('[data-free-list="unknown"]').getByRole('button',{name:'其他已知聊天',exact:true}).count()===1);
 const disclosure=ready.locator('[data-free-list="unknown"]').getByRole('button',{name:'其他已知聊天',exact:true});
 if(await disclosure.getAttribute('aria-expanded',{timeout:remaining()})==='false'){stage('disclose-known-chat-once');await disclosure.click({timeout:remaining()});}
 stage('verify-visible-private-view');
 const frame=await observe(async (frame,state)=>{
  const row=frame.locator('[data-free-list="unknown"]').locator('.row[data-ref-id="33333333-3333-4333-8333-333333333333"]');
  return state.visible&&await row.count()===1&&await row.locator('.window-title').textContent({timeout:remaining()})==='Ordinary conversation'&&await row.isVisible();
 });
 return {frame,nativeReturnClicked};
}
