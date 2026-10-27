import {captureNativeBaseline,isSameNativeRegions,flowLayoutRules,validateActiveLayout} from '../host/document-flow-layout.mjs';
import {observeNativeProjectManagement} from '../host/native-project-management.mjs';
import {validateFrameAppearance} from '../host/frame-appearance.mjs';

/** Dual extension-origin frames, actual native flow membership. Only the empty
 * exit switches enter the top layer; no private payload is placed there. */
export function createFlowMountSurface({document:doc,createFrameURL,hasNativeLayer=()=>false}) {
 const mounts=new Map(),win=doc.defaultView;
 const lookup=handle=>{const m=mounts.get(handle?.id);if(!m||m.handle!==handle)throw Error('stale-mount');return m;};
 const owned=node=>!!node&&[...mounts.values()].some(m=>m.roles.some(s=>s.node===node||s.exit===node));
 const open=s=>s.exit.matches(':popover-open');
 const intact=(m,s)=>s.node.isConnected&&s.frame.isConnected&&s.frame.parentElement===s.node&&!s.frame.hasAttribute('srcdoc')&&s.frame.src===s.url&&s.node.ownerDocument===doc&&m.style.isConnected&&m.style.textContent===m.css;
 const nativeLayer=()=>hasNativeLayer()||!!doc.querySelector('dialog[open]:not([data-va-owned]),[aria-modal="true"]:not([data-va-owned]),[popover]:popover-open:not([data-va-owned])');
 function hide(m,role,reason='suspended'){
  for(const s of m.roles)if(!role||s.role===role){s.reason=reason;if(['native-layer','workspace-geometry'].includes(reason)&&s.role==='workspace'&&m.inputPointerActive?.()&&intact(m,s)&&isSameNativeRegions(m.plan,{allowPresentationChange:true})){s.node.setAttribute('data-va-input-handoff','');continue;}if(open(s))s.exit.hidePopover();}
 }
 function sidebarIntact(m){
  const p=m.inspection.sidebarPlacement,s=m.roles[1];
  return !!p&&intact(m,s)&&p.parent.isConnected&&s.node.parentElement===p.parent&&s.node.nextElementSibling===p.before&&p.before.parentElement===p.parent&&p.recent.parentElement===p.parent&&p.scrollPort.contains(p.parent);
 }
 // These observers belong to the proved native partition, not to the mount's
 // lifetime. Replacing a Project or NAV must discard old management intent.
 function bindSidebar(m){
  const p=sidebarIntact(m)?m.inspection.sidebarPlacement:null,old=m.sidebarBinding;
  if(old?.project===p?.project&&old?.scrollPort===p?.scrollPort)return;
  m.unbindSidebar?.();m.management?.stop();m.sidebarBinding=p;
  const cancel=e=>{if(e.isTrusted)m.pendingScroll=undefined;};
  const scrolled=()=>{if(sidebarIntact(m)&&open(m.roles[1])&&!nativeLayer())m.onSidebarScroll(Math.round(p.scrollPort.scrollTop));};
  for(const type of ['wheel','pointerdown','keydown'])p?.scrollPort.addEventListener(type,cancel,true);
  p?.scrollPort.addEventListener('scroll',scrolled,{passive:true});
  m.unbindSidebar=()=>{for(const type of ['wheel','pointerdown','keydown'])p?.scrollPort.removeEventListener(type,cancel,true);p?.scrollPort.removeEventListener('scroll',scrolled);};
  m.management=observeNativeProjectManagement({document:doc,root:p?.project,isCurrent:()=>mounts.get(m.handle.id)===m&&m.sidebarBinding===p&&sidebarIntact(m),onChanged:m.onManagementChanged});
  if(old)m.onManagementChanged();
 }
 function active(m){return intact(m,m.roles[0])&&validateActiveLayout(m.plan,{workspace:m.roles[0].node,style:m.style,styleText:m.css,exit:m.roles[0].exit,isOwnedSurface:owned});}
 function mark(m,node,name){const attr='data-va-flow-'+name,previous=node.getAttribute(attr);if(previous!==null)throw Error('flow-marker-conflict');m.markers.push({node,attr,previous});node.setAttribute(attr,m.handle.id);}
 function restorePendingScroll(m){const s=m.roles[1],p=m.inspection.sidebarPlacement?.scrollPort;if(m.pendingScroll===undefined||!sidebarIntact(m)||!open(s)||s.pendingHeight||nativeLayer())return;const value=m.pendingScroll;m.pendingScroll=undefined;if(value!==null)p.scrollTop=value;m.onSidebarScroll(Math.round(p.scrollTop));}
 function applySidebarSize(m){const s=m.roles[1];if(!s.pendingHeight||!sidebarIntact(m)||nativeLayer())return;const height=s.pendingHeight;s.pendingHeight=null;s.frame.style.height=height+'px';s.node.style.setProperty('--va-slot-height',(height+28)+'px');restorePendingScroll(m);}
 function geometry(m){
  if(!isSameNativeRegions(m.plan)){hide(m,'workspace','workspace-geometry');return false;}
  if(open(m.roles[0])&&!active(m)){hide(m,'workspace','workspace-geometry');return false;}
  if(open(m.roles[1])&&!sidebarIntact(m))hide(m,'sidebar','sidebar-geometry');
  return true;
 }
 return Object.freeze({
  backend:'document-flow',
  async mount(context,inspection,{onSurrender=()=>{},onSidebarScroll=()=>{},onManagementChanged=()=>{}}={}){
   if(!win.CSS?.supports('interactivity','inert')||!win.CSS?.supports('selector(:has(*))')||!win.HTMLElement.prototype.showPopover)throw Error('unsupported-mount-surface');
   if(!context?.binding?.documentToken)throw Error('invalid-mount-inspection');
   const plan=captureNativeBaseline({document:doc,inspection,isOwnedSurface:owned});if(!plan)throw Error('unsupported-native-flow-topology');
   const id='va_'+win.crypto.randomUUID().replaceAll('-',''),handle=Object.freeze({id,documentToken:context.binding.documentToken,regionEpoch:inspection.regionEpoch});
   const m={handle,plan,inspection,roles:[],markers:[],style:doc.createElement('style'),css:'',onSurrender,onSidebarScroll,onManagementChanged,cleanup:()=>{}};mounts.set(id,m);
   try{
    for(const role of ['workspace','sidebar']){
     const url=new URL(createFrameURL({role,mountId:id}));if(url.protocol!=='chrome-extension:')throw Error('invalid-ui-frame-origin');
     const node=doc.createElement('section'),exit=doc.createElement('div'),button=doc.createElement('button'),frame=doc.createElement('iframe');
     node.id=id+'_'+role;node.dataset.vaOwned=id;node.style.cssText='display:none;visibility:hidden;position:relative;box-sizing:border-box;margin:0;padding:0;border:0;min-width:0;';
     exit.id=node.id+'_exit';exit.dataset.vaOwned=id;exit.setAttribute('popover','manual');exit.style.cssText='position:fixed;inset:0 auto auto 0;width:0;height:0;margin:0;padding:0;border:0;pointer-events:none;overflow:hidden;';
     button.type='button';button.textContent='×';button.setAttribute('aria-label',role==='workspace'?'返回原生阅读':'显示原生列表');button.setAttribute('popovertarget',exit.id);button.setAttribute('popovertargetaction','hide');
     frame.src=url.href;frame.title=role==='workspace'?'工作空间':'导航';frame.style.cssText='display:block;min-width:0;width:100%;border:0;';node.append(button,frame);
     if(role==='sidebar'){node.dataset.vaSidebarSlot='';node.style.setProperty('--va-slot-height','128px');const label=doc.createElement('div');label.textContent='ChatGPT 项目管理与最近聊天';label.dataset.vaNativeBoundary='';node.append(label);}
     const s={role,node,exit,frame,url:url.href,button,reason:null,retired:false};m.roles.push(s);
     const closing=e=>{if(e.target!==exit||e.newState!=='closed'||s.reason)return;onSurrender({role,reason:role==='workspace'?'native-reading':'native-list',phase:e.type==='beforetoggle'?'closing':undefined});};
     exit.addEventListener('beforetoggle',closing);exit.addEventListener('toggle',closing);s.cleanup=()=>{exit.removeEventListener('beforetoggle',closing);exit.removeEventListener('toggle',closing);};
     doc.body.append(exit);
    }
    const [workspace,sidebar]=m.roles;
    plan.root.insertBefore(workspace.node,plan.root.firstChild);
    const p=inspection.sidebarPlacement;if(p)p.parent.insertBefore(sidebar.node,p.before);else doc.body.append(sidebar.node);
    mark(m,plan.root,'root');mark(m,plan.reading,'reading');mark(m,plan.composer,'composer');
    for(const shell of plan.shells)if(shell!==plan.root)mark(m,shell,'shell');
    for(const node of plan.protectedNodes)if(node!==plan.composer)mark(m,node,node===plan.header?'header':node.getAttribute('role')==='tablist'?'tabs':'title');
    const enabled=s=>`body:has(#${s.exit.id}:popover-open):not(:has(dialog[open]:not([data-va-owned]),[aria-modal="true"]:not([data-va-owned]),[popover]:popover-open:not([data-va-owned]))) #${s.node.id}`;
    m.css=flowLayoutRules(plan,{id,exitId:workspace.exit.id,workspaceId:workspace.node.id});
    for(const s of m.roles)m.css+=`${enabled(s)}{display:${s.role==='workspace'?'flex':'block'}!important;visibility:visible!important;background:var(--va-canvas,Canvas);color:CanvasText}#${s.node.id}>button{position:absolute;right:4px;top:4px;z-index:1;width:24px;height:24px;padding:0;margin:0;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer}#${s.node.id}>iframe{flex:1;min-height:0;}\n`;
    m.css+=`${enabled(workspace)}[data-va-input-handoff]{visibility:hidden!important;pointer-events:none!important}#${workspace.node.id}[data-va-input-handoff]>iframe{visibility:hidden!important}#${sidebar.node.id}{height:auto;flex:none}#${sidebar.node.id}>[data-va-native-boundary]{box-sizing:border-box;min-height:28px;padding:5px 12px;border-top:1px solid color-mix(in srgb,CanvasText 10%,Canvas);font:11px/18px system-ui;color:color-mix(in srgb,CanvasText 60%,Canvas)}#${sidebar.node.id}>button{top:auto;bottom:32px}#${workspace.node.id}>iframe{height:100%}`;
    m.style.dataset.vaOwned=id;m.style.textContent=m.css;doc.head.append(m.style);
    // Let the original control finish its first trusted gesture before
    // releasing geometry. Never move its target between pointer down and up,
    // dispatch replacement input, or blur/refocus the native composer.
    let pointer=null,inputTimer=null,gestureDeadline=null;
    m.inputPointerActive=()=>pointer!==null;
    const inputTarget=e=>plan.composer.contains(e.target);
    const releaseInput=()=>{inputTimer=null;if(pointer!==null||!mounts.has(id))return;workspace.exit.removeAttribute('data-va-gesture');workspace.node.removeAttribute('data-va-input-handoff');hide(m,'workspace','native-input');onSurrender({role:'workspace',reason:'native-input'});};
    const queueInput=()=>{if(inputTimer!==null)win.clearTimeout(inputTimer);inputTimer=win.setTimeout(releaseInput,0);};
    const down=e=>{if(e.isTrusted&&inputTarget(e)&&open(workspace)&&pointer===null){pointer=e.pointerId;workspace.exit.setAttribute('data-va-gesture',id);gestureDeadline=win.setTimeout(()=>{gestureDeadline=null;pointer=null;releaseInput();},3000);}};
    const up=e=>{if(e.isTrusted&&pointer===e.pointerId){pointer=null;if(gestureDeadline!==null)win.clearTimeout(gestureDeadline);gestureDeadline=null;queueInput();}};
    const input=e=>{if(e.isTrusted&&inputTarget(e)&&pointer===null&&open(workspace))queueInput();};
    doc.addEventListener('pointerdown',down,true);doc.addEventListener('pointerup',up,true);doc.addEventListener('pointercancel',up,true);
    for(const type of ['focusin','click','keydown','beforeinput','compositionstart'])doc.addEventListener(type,input,true);
    const leaveGesture=()=>{pointer=null;if(gestureDeadline!==null)win.clearTimeout(gestureDeadline);gestureDeadline=null;workspace.exit.removeAttribute('data-va-gesture');workspace.node.removeAttribute('data-va-input-handoff');if(['native-layer','workspace-geometry'].includes(workspace.reason)&&open(workspace))workspace.exit.hidePopover();};const visibility=()=>{if(doc.visibilityState==='hidden')leaveGesture();};win.addEventListener('blur',leaveGesture);win.addEventListener('pagehide',leaveGesture);doc.addEventListener('visibilitychange',visibility);
    const observe=()=>{if(!mounts.has(id))return;if(nativeLayer()){hide(m,null,'native-layer');onSurrender({reason:'native-layer'});return;}if(!geometry(m))onSurrender({role:'workspace',reason:'workspace-geometry'});};
    const observer=new win.MutationObserver(observe);observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','role','tabindex','contenteditable','inert','open','aria-modal']});
    bindSidebar(m);
    m.cleanup=()=>{m.unbindSidebar?.();m.management?.stop();leaveGesture();win.removeEventListener('blur',leaveGesture);win.removeEventListener('pagehide',leaveGesture);doc.removeEventListener('visibilitychange',visibility);if(inputTimer!==null)win.clearTimeout(inputTimer);doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('pointerup',up,true);doc.removeEventListener('pointercancel',up,true);for(const type of ['focusin','click','keydown','beforeinput','compositionstart'])doc.removeEventListener(type,input,true);observer.disconnect();for(const s of m.roles)s.cleanup();};return handle;
   }catch(error){m.cleanup();for(const s of m.roles){s.node.remove();s.exit.remove();}m.style.remove();for(const {node,attr,previous} of m.markers)if(node.getAttribute(attr)===id){if(previous===null)node.removeAttribute(attr);else node.setAttribute(attr,previous);}mounts.delete(id);throw error;}
  },
  readNativeManagement(handle){return lookup(handle).management?.read()??[];},
  validateActiveLayout(handle){return active(lookup(handle));},
  isSameNativeRegions(handle){return isSameNativeRegions(lookup(handle).plan);},
  hasNativeInputFocus(handle){const m=lookup(handle);return m.plan.composer.contains(doc.activeElement);},
  prepareWorkspace(){return null;},
  refreshGeometry(handle,inspection){const m=lookup(handle);if(!inspection?.ok||inspection.regionEpoch!==handle.regionEpoch)return false;m.inspection=inspection;bindSidebar(m);applySidebarSize(m);restorePendingScroll(m);return geometry(m);},
  setAppearance(handle,role,value){const appearance=validateFrameAppearance(value),s=lookup(handle).roles.find(s=>s.role===role);if(!s)return false;s.node.style.setProperty('--va-canvas',appearance.canvas??(appearance.theme==='dark'?'#212121':'#ffffff'));s.node.style.colorScheme=appearance.theme;return true;},
  showWorkspace(handle,{roles=['workspace','sidebar']}={}){
   const m=lookup(handle);if(nativeLayer()){hide(m,null);return false;}
   const workspaceCurrent=isSameNativeRegions(m.plan);if(!workspaceCurrent)hide(m,'workspace','workspace-geometry');
   for(const s of m.roles){if(!roles.includes(s.role)||s.retired||!intact(m,s)||s.role==='workspace'&&!workspaceCurrent||s.role==='sidebar'&&!sidebarIntact(m))continue;s.reason=null;s.node.removeAttribute('data-va-input-handoff');if(!open(s))s.exit.showPopover();if(s.role==='workspace'&&!active(m))hide(m,'workspace','workspace-geometry');}
   restorePendingScroll(m);return open(m.roles[0]);
  },
  showReading(handle){hide(lookup(handle),'workspace','native-reading');},
  suspend(handle,reason='suspended',role=null){hide(lookup(handle),role,reason);},
  visibility(handle){const m=lookup(handle);if(!intact(m,m.roles[0]))return null;return Object.fromEntries(m.roles.map(s=>[s.role,!s.retired&&open(s)&&!s.node.hasAttribute('data-va-input-handoff')]));},
  isRoleCurrent(handle,role){return role==='sidebar'?sidebarIntact(lookup(handle)):intact(lookup(handle),lookup(handle).roles[0]);},
  frames(handle){return lookup(handle).roles.filter(s=>!s.retired).map(({role,frame})=>({role,frame}));},
  retireRole(handle,role){if(role!=='sidebar')throw Error('invalid-optional-role');const m=lookup(handle),s=m.roles[1];hide(m,role,'role-retired');s.retired=true;s.frame.remove();bindSidebar(m);},
  restoreRole(handle,role){
   if(role!=='sidebar')return null;const m=lookup(handle),s=m.roles[1],p=m.inspection.sidebarPlacement;
   // Reinsert only our own empty slot at the newly proved anchor. Never move
   // native siblings or retain the old iframe/document grant through a move.
   if(!s.retired||!p||!p.parent.isConnected||!p.scrollPort.contains(p.parent)||p.before!==p.project||p.before.parentElement!==p.parent||p.recent.parentElement!==p.parent||!m.style.isConnected||m.style.textContent!==m.css)return null;
   const children=[...p.parent.children].filter(n=>n!==s.node);
   if(children.length!==2||children[0]!==p.project||children[1]!==p.recent)return null;
   const frame=doc.createElement('iframe');frame.src=s.url;frame.title=s.frame.title;frame.style.cssText=s.frame.style.cssText;
   p.parent.insertBefore(s.node,p.before);s.button.after(frame);s.frame=frame;s.retired=false;bindSidebar(m);return {role,frame};
  },
  resizeSidebar(handle,height,{apply=true}={}){const m=lookup(handle),s=m.roles[1];if(!Number.isSafeInteger(height)||height<1||height>1000000||!sidebarIntact(m))return false;s.pendingHeight=height;if(apply)applySidebarSize(m);return true;},
  revealSidebar(handle,{top,bottom}){const m=lookup(handle);if(!sidebarIntact(m)||!open(m.roles[1])||nativeLayer()||![top,bottom].every(Number.isFinite)||top<0||bottom<=top||bottom>m.roles[1].frame.getBoundingClientRect().height)return false;const p=m.inspection.sidebarPlacement.scrollPort,b=p.getBoundingClientRect(),f=m.roles[1].frame.getBoundingClientRect();if(f.y+top<b.y)p.scrollTop+=f.y+top-b.y;else if(f.y+bottom>b.bottom)p.scrollTop+=f.y+bottom-b.bottom;return true;},
  restoreSidebar(handle,scroll,{apply=true}={}){const m=lookup(handle);if(!sidebarIntact(m)||scroll!==null&&(!Number.isSafeInteger(scroll)||scroll<0||scroll>100000000))return false;m.pendingScroll=scroll;if(apply)restorePendingScroll(m);return true;},
  isOwnedSurface:owned,
  isMasked(node){return [...mounts.values()].some(m=>node===m.plan.reading&&open(m.roles[0])&&isSameNativeRegions(m.plan));},
  surrenderChanged(){for(const m of mounts.values())geometry(m);return false;},
  withNativeReading(handle,read,guard){const m=lookup(handle);if(open(m.roles[0])||!guard()||!isSameNativeRegions(m.plan))return null;const result=read();return guard()&&!result?.then?result:null;},
  isRebindCurrent(handle,inspection){try{const m=lookup(handle);return !m.roles.some(open)&&inspection?.regionEpoch===handle.regionEpoch&&isSameNativeRegions(m.plan)&&m.roles.filter(s=>!s.retired).every(s=>intact(m,s));}catch{return false;}},
  rebind(handle,context,inspection){const m=lookup(handle);if(m.roles.some(open)||!isSameNativeRegions(m.plan)||!context?.binding?.documentToken||inspection?.regionEpoch!==handle.regionEpoch)throw Error('invalid-flow-rebind');m.handle=Object.freeze({...handle,documentToken:context.binding.documentToken});return m.handle;},
  dispose(handle){const m=lookup(handle);m.cleanup();hide(m,null,'disposed');for(const s of m.roles){s.node.remove();s.exit.remove();}m.style.remove();for(const {node,attr,previous} of m.markers)if(node.getAttribute(attr)===handle.id){if(previous===null)node.removeAttribute(attr);else node.setAttribute(attr,previous);}mounts.delete(handle.id);}
 });
}
