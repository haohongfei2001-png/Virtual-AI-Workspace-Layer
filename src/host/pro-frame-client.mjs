import {createFreeFrameClient} from './free-frame-client.mjs';
import {createRemoteProController} from '../pro/ui/remote-controller.mjs';
import {createProWorkspace,createProSidebar} from '../pro/ui/workspace.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';

/** Optional composition. The Free client keeps its existing grant/lifecycle,
 * renderer and navigation. No second UI join or alternative host is created. */
export function createUnifiedFrameClient(options={}) {
  return createFreeFrameClient({...options,modeCompanionFactory:createProFrameCompanion});
}

export function createProFrameCompanion({document:doc,runtime,role,privateRoot,freeRoot,getGrant,isCurrent,onLayout=()=>{},onSidebarRestore=()=>{},onBackup=()=>{},onExit=()=>{},now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}) {
  if(!doc||!runtime||!privateRoot||!freeRoot||typeof getGrant!=='function'||typeof isCurrent!=='function')throw Error('invalid-pro-companion');
  const el=(tag,attrs={},value='')=>{const node=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);node.textContent=value;return node;};
  const toolbar=el('div',{'data-vaiwl-mode-switch':'','role':'group','aria-label':'VAIWL 模式'}),free=el('button',{'type':'button','aria-label':'Free'},'Free'),pro=el('button',{'type':'button','aria-label':'Pro'},'Pro');
  const note=el('span',{'role':'status','aria-live':'polite'}),proRoot=el('div',{'data-vaiwl-pro-root':'','data-pro-role':role});
  toolbar.append(free,pro,note);privateRoot.prepend(toolbar);privateRoot.append(proRoot);proRoot.hidden=true;
  let stopped=false,active=false,busy=false,forcedNative=false,ui=null,embedded=null,embedStyle=null,observer=null,invalidating=null,sidebarScroll=0,returning=false,retainedView=null,proSidebarScroll=null,freeSidebarScroll=null;
  const requests=new Set();
  const live=()=>!stopped&&isCurrent()===true;
  function restoreFree(){
    embedStyle?.remove();embedStyle=null;embedded=null;
    if(live()&&freeRoot.parentNode!==privateRoot)toolbar.after(freeRoot);
    else if(!live())freeRoot.remove();
    freeRoot.style.removeProperty('height');freeRoot.style.removeProperty('flex');
  }
  function visible(mode){
    if(!live())return;if(forcedNative)mode='native';
    if(active&&mode==='native')retainedView=ui?.captureView?.()??null;
    if(role==='sidebar'&&active!==(mode!=='native')){if(active){proSidebarScroll=sidebarScroll;onSidebarRestore(freeSidebarScroll);}else freeSidebarScroll=sidebarScroll;}
    active=mode!=='native';free.setAttribute('aria-pressed',String(!active));pro.setAttribute('aria-pressed',String(active));
    if(!active)restoreFree();
    proRoot.hidden=!active;
    // Only owned renderer roots are affected. Original native host nodes,
    // composer, draft, tools, model controls and navigation are untouched.
    freeRoot.hidden=active&&role==='workspace'&&!embedded;
    onLayout();
  }
  async function request(action,payload){
    if(!live())throw Error('pro-frame-unavailable');
    const g=getGrant(),controller=new AbortController(),entry={controller,g};requests.add(entry);
    let rejectAbort;
    const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('pro-frame-unavailable'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});
    try{
      const response=await withRequestDeadline(()=>Promise.race([Promise.resolve().then(()=>runtime.sendMessage({v:1,type:'HOST_UI_PRO',grantId:g.id,mountId:g.mountId,action,payload})),aborted]),{timeoutMs:6000,now:elapsedNow,schedule,cancel});
      const current=getGrant();
      if(!live()||['id','mountId','scopeGrantId','parentDocumentId','uiDocumentId'].some(k=>g[k]!==current?.[k])||now()>=Date.parse(current.expiresAt))throw Error('pro-frame-unavailable');
      return response;
    }finally{controller.signal.removeEventListener('abort',rejectAbort);requests.delete(entry);}
  }
  function nativeBridge(container,unused,{projectsOnly=false}={}) {
    let retired=false;
    const fit=()=>{
      if(retired||!live()||!active)return;
      // Reuse the very same approved Free renderer, including its current
      // Host-issued plans. Only extension-owned nodes are reparented.
      embedded=container;freeRoot.hidden=false;if(freeRoot.parentNode!==container)container.append(freeRoot);
      freeRoot.style.height='100%';freeRoot.style.flex='1';
      const shadow=freeRoot.firstElementChild?.shadowRoot;
      if(projectsOnly&&shadow&&!embedStyle){embedStyle=el('style',{'data-vaiwl-pro-native-layout':''});embedStyle.textContent='.workspace{padding:0;overflow:visible;height:auto}.workspace-layout{display:block}.workspace-layout>.arrows,.workspace>.toolbar,.workspace-settings-layer,.free-list,.empty-inventory{display:none}.cards{padding-bottom:0;max-width:1200px}.workspace-core{padding:0}';shadow.append(embedStyle);}
      const height=projectsOnly?(shadow?.querySelector('.workspace-core')?.scrollHeight??240):null;
      if(height){container.style.height=Math.max(130,height+4)+'px';container.style.maxHeight='none';}
      onLayout();
    };
    return {update(){fit();doc.defaultView.requestAnimationFrame?.(fit);},stop(){if(retired)return;retired=true;if(embedded===container){restoreFree();if(live())freeRoot.hidden=active&&role==='workspace';}},destroy(){this.stop();}};
  }
  const controller=createRemoteProController({request,isCurrent:live,onMode:visible,mountNativeView:role==='workspace'?nativeBridge:null,
    sidebarViewport:()=>sidebarScroll,openBackup:async()=>{await controller.setMode('native');if(live())onBackup();}});
  function mount(){if(ui||!live())return;ui=role==='workspace'?createProWorkspace(proRoot,controller):createProSidebar(proRoot,controller);}
  async function restoreView(){const value=retainedView;retainedView=null;if(value&&live())await ui?.restoreView?.(value);if(role==='sidebar'&&live()&&proSidebarScroll!==null){const scroll=proSidebarScroll;proSidebarScroll=null;onSidebarRestore(scroll);}}
  async function change(mode){
    if(busy||!live())return;forcedNative=mode==='native';if(forcedNative)visible('native');busy=true;free.disabled=pro.disabled=true;note.textContent='';
    try{if(mode==='native')await controller.setMode(mode);else await controller.resumePro();forcedNative=false;const selected=controller.getStatus().mode;if(selected!=='native'){mount();await ui?.render?.();await restoreView();}if(!live())return;visible(selected);}
    catch{if(live()){forcedNative=true;visible('native');controller.clear();note.textContent='整理暂不可用，Free 仍可使用。';}}
    finally{busy=false;if(live())free.disabled=pro.disabled=false;}
  }
  free.addEventListener('click',()=>{void change('native');});pro.addEventListener('click',()=>{void change('pro-default-none');});
  if(typeof doc.defaultView?.ResizeObserver==='function'){observer=new doc.defaultView.ResizeObserver(onLayout);observer.observe(proRoot);}
  function appearance(){const theme=doc.documentElement?.getAttribute?.('data-vaiwl-theme');if(['light','dark'].includes(theme))proRoot.setAttribute('data-vaiwl-theme',theme);else proRoot.removeAttribute('data-vaiwl-theme');}
  appearance();visible('native');
  function invalidate(){
    if(!live()||forcedNative||invalidating)return invalidating;
    invalidating=(async()=>{try{const status=await controller.synchronizeMode();if(!live())return;if(forcedNative){visible('native');return;}if(status.mode!=='native'){mount();await ui?.render?.();await restoreView();}else visible('native');}catch{if(live()){visible('native');controller.clear();}}finally{invalidating=null;}})();return invalidating;
  }
  // Initial status is a bounded, metadata-free mode query. Failure leaves the
  // original Free client completely usable and does not retry in a loop.
  void invalidate();
  return Object.freeze({invalidate,appearance,sidebarViewport(value){if(Number.isSafeInteger(value)&&value>=0&&value<=1e8)sidebarScroll=value;},
    workspaceEntered(){if(role!=='workspace'||!active||!live()||returning||!controller.getStatus().launchContext)return;returning=true;void Promise.resolve(ui?.returnToWorkspace?.()??controller.returnToWorkspace()).catch(()=>{if(live())void controller.refresh().catch(()=>{});}).finally(()=>{returning=false;});},
    stop(){if(stopped)return;stopped=true;for(const entry of requests)entry.controller.abort();requests.clear();observer?.disconnect();controller.destroy();ui?.destroy();ui=null;embedStyle?.remove();embedStyle=null;toolbar.remove();proRoot.remove();},
  });
}
