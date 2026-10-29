/** Finite parent-document geometry only; never reads native titles or inputs. */
export function observeHostFlowSurfaces({extensionId}){
 const visible=node=>{
  if(!node?.isConnected||node.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
  for(let n=node,depth=0;n;n=n.parentElement){if(++depth>64)return false;const s=getComputedStyle(n);if(s.display==='none'||s.visibility!=='visible'||s.opacity==='0')return false;}
  return true;
 };
 const geometry=node=>{if(!node)return {visible:false,hit:false};const r=node.getBoundingClientRect(),left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom),shown=visible(node)&&right-left>=24&&bottom-top>=24;return {visible:shown,hit:shown&&node.contains(document.elementFromPoint((left+right)/2,(top+bottom)/2))};};
 const surface=role=>{const nodes=document.querySelectorAll(`iframe[src="chrome-extension://${extensionId}/${role}.html"]`),frame=nodes.length===1?nodes[0]:null,parent=frame?.parentElement,r=frame?.getBoundingClientRect();return {count:nodes.length,withinNativeSidebar:!!aside&&!!frame&&aside.contains(frame),zeroRect:!!r&&r.width===0&&r.height===0,flow:!!parent?.hasAttribute('data-va-owned')&&parent.id.endsWith('_'+role)&&!parent.hasAttribute('popover'),...geometry(frame)};};
 const unique=selector=>{const nodes=document.querySelectorAll(selector);return nodes.length===1?nodes[0]:null;},aside=unique('aside'),history=unique('aside nav[aria-label="Chat history"]');
 return {workspace:surface('workspace'),sidebar:surface('sidebar'),nativeSidebar:{present:!!aside,...geometry(aside),history:geometry(history),historyInside:!!aside&&!!history&&aside.contains(history),collapsed:!!aside&&getComputedStyle(aside).display==='none',toggle:geometry(unique('#sidebar-toggle'))},viewport:{width:innerWidth,height:innerHeight}};
}

/** Test-only readonly observation. One shared budget; never repeats a UI action.
 * Existing historical callers retain their explicit dual-surface oracle.
 * Current flow callers must name the applicable native-sidebar contract. */
export async function waitHostScaleSurfaces(page,{extensionId,backend='manual-popover',sidebarMode='FORMAL',timeout=30000,deadline=null,now=()=>performance.now(),pause=ms=>new Promise(r=>setTimeout(r,ms)),onObservation=()=>{}}={}){
 if(!['manual-popover','document-flow'].includes(backend)||!['FORMAL','NATIVE_RETAINED','FORMAL_RESPONSIVE_COLLAPSED'].includes(sidebarMode)||backend==='manual-popover'&&sidebarMode!=='FORMAL')throw Error('invalid-surface-contract');
 const until=deadline??now()+timeout,roles=sidebarMode==='NATIVE_RETAINED'?['workspace']:['workspace','sidebar'];
 if(!Number.isFinite(until)||until<=now())throw Error('host-scale-surfaces-deadline');
 const current=()=>roles.map(role=>{const found=page.frames().filter(frame=>!frame.isDetached()&&frame.url()===`chrome-extension://${extensionId}/${role}.html`);return found.length===1?found[0]:null;});
 const bounded=async operation=>{
  const remaining=until-now();if(remaining<=0)throw Error('host-scale-surfaces-deadline');let timer;
  try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('host-scale-surfaces-deadline')),remaining);})]);}finally{clearTimeout(timer);}
 };
 while(now()<until){
  if(page.isClosed())throw Error('native-parent-closed');
  const frames=current();let open=null,workspaceVisible=false,flow=null;
  const flowReady=value=>value?.workspace.count===1&&value.workspace.flow&&value.workspace.visible&&value.workspace.hit&&(sidebarMode==='FORMAL'?value.sidebar.count===1&&value.sidebar.flow&&value.sidebar.visible&&value.sidebar.hit:value.nativeSidebar.present&&value.nativeSidebar.historyInside&&(sidebarMode==='NATIVE_RETAINED'?value.sidebar.count===0&&value.nativeSidebar.visible&&value.nativeSidebar.hit&&value.nativeSidebar.history.visible&&value.nativeSidebar.history.hit:value.sidebar.count===1&&value.sidebar.flow&&value.sidebar.withinNativeSidebar&&value.sidebar.zeroRect&&!value.sidebar.visible&&!value.sidebar.hit&&value.nativeSidebar.collapsed&&!value.nativeSidebar.visible&&value.nativeSidebar.toggle.visible&&value.nativeSidebar.toggle.hit));
  if(backend==='document-flow')flow=await bounded(()=>page.evaluate(observeHostFlowSurfaces,{extensionId}));else open=await bounded(()=>page.locator('[data-va-owned]:popover-open').count());
  const admitted=()=>backend==='document-flow'?flowReady(flow):open===2;
  try{
   if(admitted()&&frames.every(Boolean)){workspaceVisible=await bounded(()=>frames[0].locator('.workspace').isVisible());if(workspaceVisible&&backend==='document-flow'&&sidebarMode==='FORMAL')workspaceVisible=await bounded(()=>frames[1].locator('.toolbar').isVisible());}
  }catch(error){
   const replaced=frames.some((frame,index)=>frame&&(frame.isDetached()||current()[index]!==frame));
   if(!replaced||page.isClosed()||error.message==='host-scale-surfaces-deadline')throw error;
   onObservation({kind:'frame-replaced-during-read',remainingMs:Math.max(0,until-now()),error:error.message});
  }
  const stable=frames.every((frame,index)=>frame&&!frame.isDetached()&&current()[index]===frame);
  onObservation({kind:'surface-observation',remainingMs:Math.max(0,until-now()),backend,sidebarMode,openSurfaces:open,...(flow?{flow}:{}),roles:frames.map((frame,index)=>({role:roles[index],present:!!frame,attached:!!frame&&!frame.isDetached()})),workspaceVisible,stable});
  if(admitted()&&workspaceVisible&&stable&&now()<until){
   const finalReady=backend==='document-flow'?flowReady(await bounded(()=>page.evaluate(observeHostFlowSurfaces,{extensionId}))):await bounded(()=>page.locator('[data-va-owned]:popover-open').count())===2;
   if(finalReady&&frames.every((frame,index)=>!frame.isDetached()&&current()[index]===frame)&&now()<until)return sidebarMode==='NATIVE_RETAINED'?[frames[0],null]:frames;
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
 result.nativeDOM=await read(()=>page.evaluate(()=>{
  const number=value=>Number.isFinite(value)&&Math.abs(value)<=100000000?value:null;
  const selectors={aside:'aside',projects:'aside section[aria-label="Projects"]',history:'aside nav[aria-label="Chat history"]',header:'main > header',reading:'main > #reading',composer:'main > form#composer',returnSlot:'main > header > .navigation-slot'};
  const geometry={};for(const [role,selector]of Object.entries(selectors)){
   const nodes=document.querySelectorAll(selector),node=nodes.length===1?nodes[0]:null;
   if(!node){geometry[role]={count:Math.min(nodes.length,10001)};continue;}
   const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
   geometry[role]={count:1,x:number(rect.x),y:number(rect.y),width:number(rect.width),height:number(rect.height),scrollHeight:number(node.scrollHeight),clientHeight:number(node.clientHeight),display:['none','block','flex','grid'].includes(style.display)?style.display:'other',overflowY:['visible','hidden','clip','scroll','auto'].includes(style.overflowY)?style.overflowY:'other',minHeight:typeof style.minHeight==='string'&&/^(auto|0|[0-9]{1,8}(\.[0-9]{1,4})?px)$/.test(style.minHeight)?style.minHeight:null};
  }
  const state=document.documentElement.dataset.vaiwlState,reason=document.documentElement.dataset.vaiwlReason;
  return {readyState:document.readyState,contentState:['WAITING','ACTIVE','PARTIAL','NATIVE_LAYER','NATIVE_ONLY','STOPPED'].includes(state)?state:null,contentReason:typeof reason==='string'&&/^[a-z0-9-]{1,80}$/.test(reason)?reason:null,geometry,openSurfaces:document.querySelectorAll('[data-va-owned]:popover-open').length,ownedSurfaces:document.querySelectorAll('[data-va-owned]').length,iframeCount:document.querySelectorAll('iframe').length,readingPresent:!!document.querySelector('#reading'),composerPresent:!!document.querySelector('textarea'),returnButtons:[...document.querySelectorAll('button[aria-label="返回工作空间"]')].length};
 }));
 for(let i=0;i<frames.length;i++)if(!frames[i].isDetached()&&frames[i].url().startsWith('chrome-extension://'))result.frames[i].workspaceVisible=await read(()=>frames[i].locator('.workspace').isVisible());
 return result;
}
