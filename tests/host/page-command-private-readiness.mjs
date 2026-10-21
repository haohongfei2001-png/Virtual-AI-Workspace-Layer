import {observeCurrentFrame} from './observe-current-frame.mjs';
import {j2Within} from './j2-runner-bounds.mjs';
/** A DOM iframe is not yet a navigated/authorized private frame. One shared deadline;
 * observations may follow replacement, but the native return action is never replayed. */
export async function waitPageCommandPrivateView(page,extensionId,{timeout=15000,now=Date.now,stage=()=>{}}={}){
 const end=now()+timeout,remaining=()=>{const value=end-now();if(value<=0)throw Error('page-command-private-readiness-deadline');return value;};
 const url=`chrome-extension://${extensionId}/workspace.html`;
 const current=()=>{const frames=page.frames().filter(f=>f.url()===url&&!f.isDetached());if(frames.length>1)throw Error('ambiguous-owned-workspace');return frames[0]??null;};
 const observe=fn=>j2Within('page-command-private-readiness',()=>observeCurrentFrame(current,fn,{parentAlive:()=>!page.isClosed(),timeout:remaining(),now}),remaining());
 stage('await-owned-private-frame');
 await observe(async frame=>{const element=await frame.frameElement();try{if(!await element.evaluate((node,url)=>node.isConnected&&node.src===url&&!!node.closest('[data-va-owned]'),url))throw Error('foreign-workspace-frame');}finally{await element.dispose();}return await frame.getByText('Ordinary conversation',{exact:true}).count()>0;});
 stage('await-private-presentation');
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2||[...document.querySelectorAll('button[aria-label="返回工作空间"]')].some(n=>n.getClientRects().length&&getComputedStyle(n).visibility==='visible'),null,{timeout:remaining()});
 let nativeReturnClicked=false;
 if(await page.locator('[data-va-owned]:popover-open').count()!==2){
  const back=page.locator('button[aria-label="返回工作空间"]:visible');if(await back.count()!==1)throw Error('ambiguous-or-missing-native-return');
  stage('native-return-once');await back.click({timeout:remaining()});nativeReturnClicked=true;
 }
 stage('verify-visible-private-view');
 const frame=await observe(async frame=>await page.locator('[data-va-owned]:popover-open').count()===2&&await frame.getByText('Ordinary conversation',{exact:true}).first().isVisible());
 return {frame,nativeReturnClicked};
}
