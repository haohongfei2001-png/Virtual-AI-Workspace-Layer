/** Test-only readonly observation. One shared budget; never repeats a UI action. */
export async function waitHostScaleSurfaces(page,{extensionId,timeout=30000,now=()=>performance.now(),pause=ms=>new Promise(r=>setTimeout(r,ms)),onObservation=()=>{}}={}){
 const until=now()+timeout,roles=['workspace','sidebar'];
 const current=()=>roles.map(role=>{const found=page.frames().filter(frame=>!frame.isDetached()&&frame.url()===`chrome-extension://${extensionId}/${role}.html`);return found.length===1?found[0]:null;});
 const bounded=async operation=>{
  const remaining=until-now();if(remaining<=0)throw Error('host-scale-surfaces-deadline');let timer;
  try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('host-scale-surfaces-deadline')),remaining);})]);}finally{clearTimeout(timer);}
 };
 while(now()<until){
  if(page.isClosed())throw Error('native-parent-closed');
  const frames=current();let open=null,workspaceVisible=false;
  open=await bounded(()=>page.locator('[data-va-owned]:popover-open').count());
  try{
   if(open===2&&frames.every(Boolean))workspaceVisible=await bounded(()=>frames[0].locator('.workspace').isVisible());
  }catch(error){
   const replaced=frames.some((frame,index)=>frame&&(frame.isDetached()||current()[index]!==frame));
   if(!replaced||page.isClosed()||error.message==='host-scale-surfaces-deadline')throw error;
   onObservation({kind:'frame-replaced-during-read',remainingMs:Math.max(0,until-now()),error:error.message});
  }
  const stable=frames.every((frame,index)=>frame&&!frame.isDetached()&&current()[index]===frame);
  onObservation({kind:'surface-observation',remainingMs:Math.max(0,until-now()),openSurfaces:open,roles:frames.map((frame,index)=>({role:roles[index],present:!!frame,attached:!!frame&&!frame.isDetached()})),workspaceVisible,stable});
  if(open===2&&workspaceVisible&&stable&&now()<until){
   const finalOpen=await bounded(()=>page.locator('[data-va-owned]:popover-open').count());
   if(finalOpen===2&&frames.every((frame,index)=>!frame.isDetached()&&current()[index]===frame)&&now()<until)return frames;
  }
  const remaining=until-now();if(remaining<=0)break;await pause(Math.min(50,remaining));
 }
 throw Error('host-scale-surfaces-deadline');
}

/** Bounded, text-free failure facts; no input values, authority or action replay. */
export async function hostScaleFailureFacts(page,{timeout=1000}={}){
 const until=performance.now()+timeout,read=async fn=>{if(performance.now()>=until)return {error:'diagnostic-deadline'};let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('diagnostic-deadline')),Math.max(0,until-performance.now()));})]);}catch(error){return {error:error.message};}finally{clearTimeout(timer);}};
 if(!page||page.isClosed())return {closed:true};
 const frames=page.frames().slice(0,8),result={url:page.url(),closed:false,frames:frames.map(frame=>({url:frame.url(),detached:frame.isDetached()}))};
 result.nativeDOM=await read(()=>page.evaluate(()=>({readyState:document.readyState,openSurfaces:document.querySelectorAll('[data-va-owned]:popover-open').length,ownedSurfaces:document.querySelectorAll('[data-va-owned]').length,iframeCount:document.querySelectorAll('iframe').length,readingPresent:!!document.querySelector('#reading'),composerPresent:!!document.querySelector('textarea'),returnButtons:[...document.querySelectorAll('button[aria-label="返回工作空间"]')].length})));
 for(let i=0;i<frames.length;i++)if(!frames[i].isDetached()&&frames[i].url().startsWith('chrome-extension://'))result.frames[i].workspaceVisible=await read(()=>frames[i].locator('.workspace').isVisible());
 return result;
}
