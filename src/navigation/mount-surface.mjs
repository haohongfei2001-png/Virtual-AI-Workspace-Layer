/** Mount geometry only. UI authorization and projection transport belong to the owner. */
import {validateFrameAppearance} from '../host/frame-appearance.mjs';
export function createMountSurface({document:doc,createFrameURL,hasNativeLayer=()=>false}){
 const mounts=new Map();
 const lookup=handle=>{const m=mounts.get(handle?.id);if(!m||m.handle!==handle)throw Error('stale-mount');return m;};
 // Only extension-owned empty space participates in Project flow. Native
 // nodes and styles remain untouched. Restore our scroll write only while it
 // is still ours; a later user scroll must never be pulled back.
 const releaseProjectFlow=m=>{
  const flow=m.projectFlow;if(!flow)return;m.projectFlow=null;
  const live=flow.viewport.isConnected&&flow.panel.isConnected&&flow.panel.parentElement===flow.parent&&flow.viewport.contains(flow.panel)&&doc.location.href===flow.url;
  const restore=live&&Math.abs(flow.viewport.scrollTop-flow.written)<1;
  flow.workspace.removeAttribute('data-va-layout-preparing');flow.workspace.removeAttribute('data-va-reading-probe');
  const mutation=m.projectFlowMutations.get(flow.slot);if(mutation&&flow.slot.parentNode)mutation.removed=flow.slot.parentNode;
  flow.slot.remove();
  if(restore)flow.viewport.scrollTop=flow.before;
 };
 // The real composer is never moved in the DOM, copied, or rebound. Removing
 // this owned rule (or closing/removing the workspace) restores native CSS even
 // when the owner has stopped. No native inline style is overwritten.
 const releaseHomeDock=m=>{
  const dock=m.homeDock;if(!dock)return;m.homeDock=null;
  dock.observer?.disconnect();if(m.homePointerTimer)doc.defaultView.clearTimeout(m.homePointerTimer);m.homePointerTimer=null;m.homePointer=false;
  dock.style.remove();dock.workspace.removeAttribute('data-va-layout-preparing');dock.workspace.removeAttribute('data-va-reading-probe');
  if(dock.composer.getAttribute('data-va-home-dock')===m.handle.id){if(dock.previous===null)dock.composer.removeAttribute('data-va-home-dock');else dock.composer.setAttribute('data-va-home-dock',dock.previous);}
 };
 // Programmatic withdrawal is not a user's request to leave the workspace.
 // beforetoggle is synchronous, toggle is queued: retain the close origin on
 // each role until a subsequent open, so neither edge changes display intent.
 const hide=(m,role=null,reason='suspended')=>{if(role===null||role==='workspace'){releaseProjectFlow(m);releaseHomeDock(m);}if(m.readingProbe&&(role===null||role==='workspace'))m.readingProbe.cancelled=true;for(const s of m.surfaces)if((role===null||s.role===role)&&s.node.matches(':popover-open')){if(s.role==='sidebar'&&m.slotProved&&m.slot&&!['role-retired','native-list','disposed'].includes(reason))m.slot.setAttribute('data-va-slot-retained','');s.closeReason=reason;s.node.hidePopover();}};
 const surrender=(m,role=null,reason='native-change')=>{const roles=m.surfaces.filter(s=>(role===null||s.role===role)&&s.node.matches(':popover-open')).map(s=>s.role);hide(m,role,reason);for(const role of roles)try{m.onSurrender({role,reason});}catch{/* Withdrawal remains effective when its consumer has stopped. */}};
 // The frame stays in its original top-layer surface. Only this empty owned
 // block joins native flow; closing the browser popover releases its space.
 const syncSlot=(m,placement)=>{
  const sidebar=m.surfaces.find(s=>s.role==='sidebar');
  const wasComposed=sidebar?.node.getAttribute('data-va-composed-sidebar')!==null;
  if(sidebar){if(placement)sidebar.node.setAttribute('data-va-composed-sidebar','');else sidebar.node.removeAttribute('data-va-composed-sidebar');}
  if(sidebar&&wasComposed&&!placement){
   for(const key of ['position','left','top','height','width','flex'])sidebar.frame.style.removeProperty(key);
   sidebar.frame.style.cssText='border:0;width:100%;min-height:0;flex:1;display:block';
   sidebar.boundary?.style.removeProperty('top');sidebar.close?.style.removeProperty('top');
  }
  if(m.slot&&(m.slot.parentElement!==placement?.parent||m.slot.nextElementSibling!==placement?.before)){
   hide(m,'sidebar','sidebar-anchor');m.slot.remove();m.slot=null;m.slotProved=false;
  }
  if(!placement)return;
  if(!m.slot){
   const slot=doc.createElement('div');slot.id=m.handle.id+'_slot';slot.dataset.vaSidebarSlot='';slot.dataset.vaOwned=m.handle.id;
   slot.setAttribute('aria-hidden','true');slot.style.setProperty('--va-slot-height',placement.height+'px');
   m.slot=slot;placement.parent.insertBefore(slot,placement.before);
  }
 };
 const placeSidebar=(m,placement)=>{
  // Keep hidden flow stable. Apply a cached intrinsic size only when this
  // role is actually being presented, and recalculate its current viewport cap.
  if(m.slot&&m.sidebarDesiredHeight){const height=Math.max(placement.minHeight??240,Math.min(placement.maxHeight??placement.height,m.sidebarDesiredHeight));if(m.slot.style.getPropertyValue('--va-slot-height')!==height+'px')m.slot.style.setProperty('--va-slot-height',height+'px');}
  const rect=placement?.measure(m.slot);if(!rect)return false;
  if([m.inspection.header,m.inspection.composer,...m.inspection.protectedRegions].some(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&rect.x<r.right&&rect.x+rect.width>r.left&&rect.y<r.bottom&&rect.y+rect.height>r.top;}))return false;
  const sidebar=m.surfaces.find(s=>s.role==='sidebar');
  for(const [key,value]of Object.entries({left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'}))if(sidebar.node.style[key]!==value)sidebar.node.style[key]=value;
  const full=rect.contentRect??rect,offsetX=full.x-rect.x,offsetY=full.y-rect.y;
  // Clip only owned pixels. The surface still occupies the freshly proved
  // visible rectangle; the frame retains its full layout and scroll position.
  for(const [key,value]of Object.entries({position:'absolute',left:offsetX+'px',top:offsetY+'px',width:full.width+'px',height:Math.max(0,full.height-28)+'px',flex:'none'}))if(sidebar.frame.style[key]!==value)sidebar.frame.style[key]=value;
  const closeTop=(offsetY+full.height-60)+'px',boundaryTop=(offsetY+full.height-28)+'px';
  if(sidebar.close&&sidebar.close.style.top!==closeTop)sidebar.close.style.top=closeTop;
  if(sidebar.boundary&&sidebar.boundary.style.top!==boundaryTop)sidebar.boundary.style.top=boundaryTop;
  m.slotProved=true;return true;
 };
 // Native scrolling must also reveal keyboard focus in our out-of-flow
 // frame. Adjust only the proved scrollport to reveal our own existing slot;
 // never activate a surface, move native nodes or inspect frame content.
 const revealSidebar=(m,focus)=>{
  const placement=m.inspection.sidebarPlacement,sidebar=m.surfaces.find(s=>s.role==='sidebar');
  if(!placement||!m.slotProved||!sidebar?.node.matches(':popover-open')||hasNativeLayer()||![sidebar.frame,sidebar.close].includes(doc.activeElement)||!placement.measure(m.slot))return false;
  const measured=placement.measure(m.slot),port=placement.scrollPort,slot=m.slot.getBoundingClientRect(),clip=measured?.scrollRect;
  if(!clip||!focus||!Number.isFinite(focus.top)||!Number.isFinite(focus.bottom)||focus.top<0||focus.bottom<=focus.top||focus.bottom>slot.height)return false;
  const top=slot.top+focus.top,bottom=slot.top+focus.bottom,end=clip.y+clip.height;
  const delta=top<clip.y||bottom-top>clip.height?top-clip.y:bottom>end?bottom-end:0;
  if(delta){port.scrollTop+=delta;return placeSidebar(m,placement);}return true;
 };
 // The top-layer frame is not a DOM child of the native scrollport, so the
 // browser cannot chain its wheel there. Only the owned, visible hit location
 // may forward a bounded vertical delta; no presentation or native action.
 const scrollSidebar=(m,input)=>{
  const placement=m.inspection.sidebarPlacement,sidebar=m.surfaces.find(s=>s.role==='sidebar');
  if(!placement||!m.slotProved||!sidebar?.node.matches(':popover-open')||hasNativeLayer())return false;
  const measured=placement.measure(m.slot),frame=sidebar.frame.getBoundingClientRect();
  if(!measured||!input||![input.x,input.y,input.delta].every(Number.isFinite)||input.delta===0||Math.abs(input.delta)>1024||input.x<0||input.y<0||input.x>=frame.width||input.y>=frame.height)return false;
  const x=frame.x+input.x,y=frame.y+input.y;
  if(x<measured.x||x>=measured.x+measured.width||y<measured.y||y>=measured.y+measured.height||doc.elementFromPoint(x,y)!==sidebar.frame)return false;
  const port=placement.scrollPort,before=port.scrollTop;
  port.scrollTop=Math.max(0,Math.min(port.scrollHeight-port.clientHeight,before+input.delta));
  if(port.scrollTop===before)return false;
  // A completely clipped slot withdraws only this role. Its retained flow
  // space allows ordinary native scrolling to reveal it again.
  if(!placeSidebar(m,placement))surrender(m,'sidebar','sidebar-geometry');
  return true;
 };
 const refreshGeometry=(m,inspection)=>{
  const prior=m.inspection;
  if(m.homeDock&&(!inspection?.homeCanvasProved||m.homeDock.destinationClear?.()!==true)){surrender(m,'workspace','home-destination-obstructed');return false;}
  const protectedNodes=[inspection?.header,inspection?.composer,...(inspection?.protectedRegions??[])];
  const safeRect=rect=>rect&&['x','y','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.width>0&&rect.height>0&&!protectedNodes.some(node=>{const r=node?.getBoundingClientRect();return !r||r.width>0&&r.height>0&&rect.x<r.right&&rect.x+rect.width>r.left&&rect.y<r.bottom&&rect.y+rect.height>r.top;});
  if(!inspection?.ok||inspection.viewMask!=='declarative-css'||inspection.regionEpoch!==m.handle.regionEpoch||['reading','header','composer','readingViewport'].some(key=>inspection[key]!==prior[key])||[...protectedNodes,inspection.reading,...(inspection.readingViewport?[inspection.readingViewport]:[])].some(node=>!node?.isConnected||node.ownerDocument!==doc)||!safeRect(inspection.readingRect)){surrender(m,'workspace','workspace-geometry');return false;}
  const workspace=m.surfaces.find(s=>s.role==='workspace');
  const layout=(surface,rect)=>{for(const [key,value]of Object.entries({left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'}))if(surface.node.style[key]!==value)surface.node.style[key]=value;};
  layout(workspace,inspection.readingRect);
  const sidebar=m.surfaces.find(s=>s.role==='sidebar');
  syncSlot(m,inspection.sidebarPlacement);
  const roots=inspection.historyMaskRoots??[],old=m.markers.filter(x=>x.attr==='data-va-mask-sidebar');
  const usable=inspection.preserveNativeSidebar!==true&&safeRect(inspection.sidebarRect)&&(inspection.sidebarPlacement?!!m.slot:roots.length>0)&&roots.every(root=>root?.isConnected&&root.ownerDocument===doc&&!protectedNodes.some(n=>root===n||root.contains(n))&&root!==inspection.reading&&!root.contains(inspection.reading)&&!inspection.reading.contains(root));
  const changed=old.length!==roots.length||old.some((x,i)=>x.root!==roots[i]);
  if(sidebar&&(!usable||changed))hide(m,'sidebar','sidebar-geometry');
  if(changed){
   for(const {root,attr,previous}of old)if(root.getAttribute(attr)===m.handle.id){if(previous===null)root.removeAttribute(attr);else root.setAttribute(attr,previous);}
   m.markers=m.markers.filter(x=>x.attr!=='data-va-mask-sidebar');
   if(usable)for(const root of roots){const attr='data-va-mask-sidebar';m.markers.push({root,attr,previous:root.getAttribute(attr),nativeClass:root.getAttribute('class'),nativeStyle:root.getAttribute('style'),nativeHidden:root.getAttribute('hidden'),nativeAriaHidden:root.getAttribute('aria-hidden'),wasVisible:doc.defaultView.getComputedStyle(root).visibility==='visible'});root.setAttribute(attr,m.handle.id);}
  }
  if(sidebar&&usable){if(inspection.sidebarPlacement&&sidebar.node.matches(':popover-open')){if(!placeSidebar(m,inspection.sidebarPlacement))hide(m,'sidebar','sidebar-obstructed');}else layout(sidebar,inspection.sidebarRect);}
  m.inspection={...inspection,preserveNativeSidebar:!usable};
  return true;
 };
 const rebindCurrent=(m,inspection)=>{
  const handle=m.handle,prior=m.inspection,same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((node,i)=>node===b[i]);
  return !!inspection?.ok&&inspection.viewMask==='declarative-css'&&inspection.regionEpoch===handle.regionEpoch&&['reading','header','composer','readingViewport'].every(key=>inspection[key]===prior[key])&&same(inspection.protectedRegions,prior.protectedRegions)&&m.surfaces.length===2&&m.style.isConnected&&m.style.ownerDocument===doc&&m.style.dataset.vaOwned===handle.id&&m.style.textContent===m.styleText&&m.surfaces.filter(s=>!s.retired).every(({node,frame})=>node.isConnected&&node.ownerDocument===doc&&node.dataset.vaOwned===handle.id&&!node.matches(':popover-open')&&frame.isConnected&&frame.ownerDocument===doc&&frame.parentElement===node)&&[inspection.reading,inspection.header,inspection.composer,...(inspection.readingViewport?[inspection.readingViewport]:[]),...inspection.protectedRegions].every(node=>node?.isConnected&&node.ownerDocument===doc)&&m.markers.filter(x=>x.attr==='data-va-mask-workspace').every(({root,attr,nativeClass,nativeStyle,nativeHidden,nativeAriaHidden})=>root.getAttribute(attr)===handle.id&&root.getAttribute('class')===nativeClass&&root.getAttribute('style')===nativeStyle&&root.getAttribute('hidden')===nativeHidden&&root.getAttribute('aria-hidden')===nativeAriaHidden);
 };
 return {
  prepareWorkspace(handle,{explicitEntry=true}={}){
   const m=lookup(handle),proof=m.inspection.workspaceFlow,workspace=m.surfaces.find(s=>s.role==='workspace')?.node;
   if(!workspace||hasNativeLayer()||doc.querySelector('dialog[open]:not([data-va-owned]),[popover]:popover-open:not([data-va-owned])'))return null;
   const home=m.inspection.homeDock;
   if(home&&!m.homeDock){
    const {composer,root,reading,parent,rect,bottom,leftBound,rightInset,centerOffset,url}=home;
    if(composer!==m.inspection.composer||reading!==m.inspection.reading||!composer.isConnected||!root.isConnected||composer.parentElement!==parent||!root.contains(composer)||doc.location.href!==url||composer.contains(doc.activeElement))return null;
    if(!rect||![rect.x,rect.y,rect.width,rect.height,bottom,leftBound,rightInset,centerOffset].every(Number.isFinite)||rect.width<=0||rect.height<=0||bottom<0)return null;
    const previous=composer.getAttribute('data-va-home-dock');if(previous!==null)return null;
    const style=doc.createElement('style'),id=m.handle.id;
    const selector=`body:not(:has(dialog[open]:not([data-va-owned]),[popover]:popover-open:not([data-va-owned]))):has(#${id}_workspace:popover-open,#${id}_workspace[data-va-layout-preparing],#${id}_workspace[data-va-reading-probe]) [data-va-home-dock="${id}"]`;
    style.textContent=`${selector}{position:fixed!important;box-sizing:border-box!important;left:max(${leftBound}px,calc(50vw + ${centerOffset-rect.width/2}px))!important;right:auto!important;top:auto!important;bottom:${bottom}px!important;width:${rect.width}px!important;max-width:calc(100vw - ${leftBound+rightInset}px)!important;margin:0!important}`;
    m.homeDock={...home,style,css:style.textContent,previous,workspace,nativeStyle:composer.getAttribute('style'),nativeClass:composer.getAttribute('class')};
    workspace.setAttribute('data-va-layout-preparing','');composer.setAttribute('data-va-home-dock',id);doc.head.append(style);
    const actual=composer.getBoundingClientRect();
    if(Math.abs(actual.x-rect.x)>1||Math.abs(actual.y-rect.y)>1||Math.abs(actual.width-rect.width)>1||Math.abs(actual.height-rect.height)>1){releaseHomeDock(m);return null;}
    const dock=m.homeDock;
    dock.observer=new doc.defaultView.MutationObserver(()=>{
     if(m.homeDock!==dock)return;
     if(!style.isConnected||style.textContent!==dock.css||!workspace.isConnected||!composer.isConnected||composer.parentElement!==parent||!root.contains(composer)||doc.location.href!==url||composer.getAttribute('data-va-home-dock')!==id||composer.getAttribute('style')!==dock.nativeStyle||composer.getAttribute('class')!==dock.nativeClass||dock.destinationClear?.()!==true)surrender(m,'workspace','home-layout-invalid');
    });
    dock.observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-va-home-dock','style','class'],characterData:true});
    let settled=false;return accepted=>{if(settled)return;settled=true;if(m.homeDock!==dock)return;if(!accepted||!workspace.matches(':popover-open'))releaseHomeDock(m);else workspace.removeAttribute('data-va-layout-preparing');};
   }
   if(!explicitEntry||m.projectFlow||!proof)return null;
   const {viewport,panel,top,height}=proof;
   if(panel!==m.inspection.reading||viewport!==m.inspection.readingViewport||!panel.isConnected||!viewport.isConnected||!viewport.contains(panel)||!Number.isFinite(height)||height<=0||height>doc.defaultView.innerHeight||!Number.isFinite(top))return null;
   const before=viewport.scrollTop,delta=panel.getBoundingClientRect().top-top;
   if(delta<=1)return null;
   const slot=doc.createElement('div');slot.id=m.handle.id+'_project_flow';slot.dataset.vaOwned=m.handle.id;slot.setAttribute('aria-hidden','true');
   const flow={slot,viewport,panel,parent:panel.parentElement,before,written:before,workspace,url:doc.location.href};
   m.projectFlow=flow;m.projectFlowMutations.set(slot,{added:panel,removed:null});
   try{
    workspace.setAttribute('data-va-layout-preparing','');panel.append(slot);
    viewport.scrollTop=before+delta;flow.written=viewport.scrollTop;
    if(Math.abs(panel.getBoundingClientRect().top-top)>1)throw Error('project-flow-not-aligned');
    let settled=false;
    return accepted=>{if(settled)return;settled=true;if(m.projectFlow!==flow)return;if(!accepted||!workspace.matches(':popover-open'))releaseProjectFlow(m);else workspace.removeAttribute('data-va-layout-preparing');};
   }catch{releaseProjectFlow(m);return null;}
  },
  setAppearance(handle,role,value){
   const appearance=validateFrameAppearance(value),s=lookup(handle).surfaces.find(s=>s.role===role&&!s.retired);if(!s)return false;
   const canvas=appearance.canvas??(appearance.theme==='dark'?(role==='sidebar'?'#171717':'#212121'):(role==='sidebar'?'#f9f9f9':'#ffffff'));
   if(s.node.style.getPropertyValue('--va-canvas')!==canvas)s.node.style.setProperty('--va-canvas',canvas);
   if(s.node.style.colorScheme!==appearance.theme)s.node.style.colorScheme=appearance.theme;
   return true;
  },
  revealSidebar(handle,focus){return revealSidebar(lookup(handle),focus);},
  scrollSidebar(handle,input){return scrollSidebar(lookup(handle),input);},
  resizeSidebar(handle,height,{apply=true}={}){
   const m=lookup(handle),placement=m.inspection.sidebarPlacement;
   if(!placement||!Number.isInteger(height)||height<(placement.minHeight??240)||height>1024)return false;
   m.sidebarDesiredHeight=height;
   const sidebar=m.surfaces.find(s=>s.role==='sidebar');
   if(apply&&!hasNativeLayer()&&m.slotProved&&sidebar?.node.matches(':popover-open')&&!placeSidebar(m,placement))hide(m,'sidebar','sidebar-obstructed');
   return true;
  },
  refreshGeometry(handle,inspection){return refreshGeometry(lookup(handle),inspection);},
  isRebindCurrent(handle,inspection){try{return rebindCurrent(lookup(handle),inspection);}catch{return false;}},
  // Reuse only a fully closed, intact local surface. This replaces no authority;
  // its owner must register the returned handle under a fresh binding and rejoin.
  rebind(handle,context,inspection){
   const m=lookup(handle),token=context?.binding?.documentToken;
   if(typeof token!=='string'||!token||token.length>128||!/^[A-Za-z0-9_-]+$/.test(token)||!rebindCurrent(m,inspection))throw Error('invalid-mount-rebind');
   if(!refreshGeometry(m,inspection))throw Error('invalid-mount-rebind');
   const next=Object.freeze({id:handle.id,documentToken:token,regionEpoch:inspection.regionEpoch});m.handle=next;return next;
  },
  async mount(context,inspection,{onSurrender=()=>{}}={}){
   const win=doc.defaultView;if(!win.CSS?.supports('interactivity','inert')||!win.HTMLElement.prototype.showPopover)throw Error('unsupported-mount-surface');
   if(!inspection?.ok||inspection.viewMask!=='declarative-css'||!context?.binding?.documentToken)throw Error('invalid-mount-inspection');
   if(!Array.isArray(inspection.historyMaskRoots)||!Array.isArray(inspection.protectedRegions))throw Error('invalid-mount-inspection');
   const roots=[inspection.reading,...inspection.historyMaskRoots],protectedNodes=[inspection.composer,inspection.header,...inspection.protectedRegions];
   if(roots.some(root=>!root?.isConnected||root.ownerDocument!==doc||protectedNodes.some(node=>!node||root===node||root.contains(node)))||new Set(roots).size!==roots.length||roots.some((root,i)=>roots.some((other,j)=>i!==j&&root.contains(other))))throw Error('unsafe-mask-region');
   const id='va_'+win.crypto.randomUUID().replaceAll('-',''),handle=Object.freeze({id,documentToken:context.binding.documentToken,regionEpoch:inspection.regionEpoch}),surfaces=[],markers=[];
   const specifications=[['workspace',inspection.readingRect,[inspection.reading]],['sidebar',inspection.sidebarRect,inspection.historyMaskRoots]];
   const urls=new Map();for(const [role,rect] of specifications){
    if(rect&&(!['x','y','width','height'].every(k=>Number.isFinite(rect[k]))||rect.width<=0||rect.height<=0))throw Error('invalid-mount-rect');
    if(rect&&protectedNodes.some(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&rect.x<r.right&&rect.x+rect.width>r.left&&rect.y<r.bottom&&rect.y+rect.height>r.top;}))throw Error('unsafe-mask-geometry');
    const url=new URL(createFrameURL({role,mountId:id}));if(url.protocol!=='chrome-extension:')throw Error('invalid-ui-frame-origin');urls.set(role,url.href);
   }
   const style=doc.createElement('style');style.dataset.vaOwned=id;
   const nativeOpen=`dialog[open]:not([data-va-owned]),[popover]:popover-open:not([data-va-owned])`;
   const allowed=`body:not(:has(${nativeOpen}))`;
   for(const [role,initialRect,maskRoots] of specifications){
    const rect=initialRect??{x:0,y:0,width:1,height:1};if(!['x','y','width','height'].every(k=>Number.isFinite(rect[k]))||rect.width<=0||rect.height<=0)throw Error('invalid-mount-rect');
    const node=doc.createElement('section');node.id=id+'_'+role;node.dataset.vaOwned=id;node.setAttribute('popover','manual');node.style.cssText=`position:fixed;inset:auto;margin:0;box-sizing:border-box;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;padding:0;border:0;background:var(--va-canvas,Canvas);color:CanvasText;`;
    const button=doc.createElement('button');button.type='button';button.setAttribute('popovertarget',node.id);button.setAttribute('popovertargetaction','hide');button.textContent='×';button.setAttribute('aria-label',role==='workspace'?'返回原生阅读':'显示原生列表');button.title=button.getAttribute('aria-label');
    const frame=doc.createElement('iframe');frame.src=urls.get(role);frame.title=role==='workspace'?'工作空间':'导航';frame.style.cssText='border:0;width:100%;min-height:0;flex:1;display:block';node.append(button,frame);surfaces.push({role,node,frame,close:button,url:urls.get(role)});
    // A label for the following native region, not a copied Project list or a
    // disclosure that pretends to control native descendants. Its layout stays
    // entirely inside our proven slot; native controls/order/state are untouched.
    if(role==='sidebar'){const boundary=doc.createElement('div');boundary.dataset.vaNativeBoundary='';boundary.textContent='ChatGPT 项目管理与最近聊天';node.append(boundary);surfaces.at(-1).boundary=boundary;}
    for(const root of maskRoots){const attr='data-va-mask-'+role;markers.push({root,attr,previous:root.getAttribute(attr),nativeClass:root.getAttribute('class'),nativeStyle:root.getAttribute('style'),nativeHidden:root.getAttribute('hidden'),nativeAriaHidden:root.getAttribute('aria-hidden'),wasVisible:win.getComputedStyle?.(root).visibility==='visible'});root.setAttribute(attr,id);}
    // Keep the owned iframe's layout through native-input surrender. Removing
    // its layout on close can leave Chromium's cross-process hit target stale
    // on immediate re-entry. Closed surfaces remain invisible and inert; the
    // browser's popover state alone continues to control each native mask.
    style.textContent+=`#${node.id}:not(:popover-open){display:flex;flex-direction:column;visibility:hidden;interactivity:inert;}\n`;
    // The declarative exit belongs to this surface. Host-wide button typography
    // and padding must not consume the small native history rectangle.
    style.textContent+=`#${node.id}:popover-open{display:flex;flex-direction:column}#${node.id}>button{position:absolute;${role==='sidebar'?'top:auto;bottom:8px':'top:6px'};right:4px;z-index:2;display:grid;place-items:center;box-sizing:border-box;width:24px;height:24px;margin:0;padding:0;border:0;border-radius:8px;font:12px/18px system-ui;color:inherit;background:transparent;cursor:pointer;overflow-wrap:anywhere}#${node.id}>button:hover{background:color-mix(in srgb,CanvasText 6%,Canvas)}#${node.id}>button:focus-visible{outline:2px solid currentColor;outline-offset:-2px}\n`;
    style.textContent+=`${allowed}:has(#${node.id}:popover-open) [data-va-mask-${role}="${id}"]{visibility:hidden;interactivity:inert;}body:has(${nativeOpen}) #${node.id}{visibility:hidden;interactivity:inert;}\n`;
   }
   style.textContent+=`#${id}_sidebar[data-va-composed-sidebar]{overflow:hidden}#${id}_sidebar>[data-va-native-boundary]{display:none}#${id}_sidebar[data-va-composed-sidebar]>[data-va-native-boundary]{display:block;position:absolute;left:0;width:100%;box-sizing:border-box;height:28px;padding:5px 12px 4px;border-top:1px solid color-mix(in srgb,CanvasText 10%,Canvas);font:11px/18px system-ui;color:color-mix(in srgb,CanvasText 60%,Canvas);background:var(--va-canvas,Canvas);pointer-events:none}`;
   style.textContent+=`#${id}_slot{display:block;box-sizing:border-box;width:100%;height:0;min-height:0;flex:0 0 auto;margin:0;padding:0;border:0;overflow:hidden;pointer-events:none;} body:has(#${id}_sidebar:popover-open) #${id}_slot,#${id}_slot[data-va-slot-retained]{height:var(--va-slot-height);}`;
   // The admitted native viewport fits inside the window. Reserve one live
   // viewport of owned space, not its entry-time pixel height: resizing must
   // not clamp native scrolling before geometry can be re-proved. This CSS
   // changes no native styles and requires no compensating scroll writes.
   style.textContent+=`#${id}_project_flow{display:block;box-sizing:border-box;height:0;min-height:0;flex:0 0 auto;margin:0;padding:0;border:0;overflow:hidden;pointer-events:none}body:has(#${id}_workspace:popover-open,#${id}_workspace[data-va-layout-preparing],#${id}_workspace[data-va-reading-probe]) #${id}_project_flow{height:100vh}`;
   const m={handle,surfaces,markers,style,styleText:style.textContent,onSurrender,projectFlowMutations:new WeakMap(),inspection:{...inspection,preserveNativeSidebar:inspection.preserveNativeSidebar===true||!inspection.sidebarRect,historyMaskRoots:[...inspection.historyMaskRoots],protectedRegions:[...inspection.protectedRegions]}};mounts.set(id,m);syncSlot(m,inspection.sidebarPlacement);
   const workspace=surfaces.find(s=>s.role==='workspace')?.node;
   // toggle is queued and can merge close/reopen into open→open. Invalidate
   // old presentation intent at the synchronous, non-cancellable close edge.
   // The owner must not hide/reopen surfaces from this notification.
   let closing=false;
   const ownWorkspace=surfaces.find(s=>s.role==='workspace');
   const workspaceClosing=e=>{if(ownWorkspace.closeReason||m.readingProbe?.ownClosing&&e.target===workspace&&e.oldState==='open'&&e.newState==='closed'||m.readingProbe?.ownOpening&&e.target===workspace&&e.oldState==='closed'&&e.newState==='open')return;if(m.readingProbe)m.readingProbe.cancelled=true;if(closing||e.target!==workspace||e.oldState!=='open'||e.newState!=='closed'||mounts.get(id)!==m||!workspace.isConnected||!workspace.matches(':popover-open'))return;closing=true;releaseProjectFlow(m);releaseHomeDock(m);try{onSurrender({role:'workspace',reason:'native-reading',phase:'closing'});}catch{}finally{closing=false;}};
   const workspaceClosed=e=>{if(ownWorkspace.closeReason||e.target!==workspace||e.newState!=='closed'||mounts.get(id)!==m||!workspace.isConnected||workspace.matches(':popover-open'))return;try{onSurrender({role:'workspace',reason:'native-reading'});}catch{}};
   const ownSidebar=surfaces.find(s=>s.role==='sidebar'),sidebar=ownSidebar.node;
   const revealExit=()=>{const height=ownSidebar.frame.getBoundingClientRect().height;revealSidebar(m,{top:height-32,bottom:height-8});};ownSidebar.close.addEventListener('focus',revealExit);
   const sidebarClosing=e=>{if(!ownSidebar.closeReason&&e.target===sidebar&&e.newState==='closed')m.slot?.removeAttribute('data-va-slot-retained');if(ownSidebar.closeReason||m.readingProbe?.ownClosing||m.readingProbe?.ownOpening||e.target!==sidebar||e.oldState!=='open'||e.newState!=='closed'||mounts.get(id)!==m||!sidebar.isConnected)return;try{onSurrender({role:'sidebar',reason:'native-list',phase:'closing'});}catch{}};
   const sidebarClosed=e=>{if(ownSidebar.closeReason||e.target!==sidebar||e.newState!=='closed'||mounts.get(id)!==m||!sidebar.isConnected||sidebar.matches(':popover-open'))return;try{onSurrender({role:'sidebar',reason:'native-list'});}catch{}};
   sidebar.addEventListener('beforetoggle',sidebarClosing);sidebar.addEventListener('toggle',sidebarClosed);
   // Match the proved reading/composer order without relocating native nodes.
   // Project home places reading below its composer; its workspace follows the
   // native branch while the sidebar still precedes it. Chat keeps its order.
   let before=inspection.composer;
   while(before?.parentElement&&before.parentElement!==doc.body)before=before.parentElement;
   const composerBox=inspection.composer.getBoundingClientRect(),afterComposer=inspection.readingRect.y>=composerBox.bottom;
   workspace?.addEventListener('beforetoggle',workspaceClosing);workspace?.addEventListener('toggle',workspaceClosed);doc.head.append(style);
   for(const s of surfaces)if(before?.parentElement===doc.body)doc.body.insertBefore(s.node,afterComposer&&s.role==='workspace'?before.nextSibling:before);else doc.body.append(s.node);
   const inspectLayer=()=>{if(m.homeDock&&(!m.homeDock.style.isConnected||m.homeDock.style.textContent!==m.homeDock.css||!m.homeDock.composer.isConnected||m.homeDock.composer.parentElement!==m.homeDock.parent||doc.location.href!==m.homeDock.url))surrender(m,'workspace','home-layout-invalid');if(m.inspection.sidebarPlacement&&sidebar.matches(':popover-open')&&!placeSidebar(m,m.inspection.sidebarPlacement))surrender(m,'sidebar','sidebar-obstructed');if(hasNativeLayer()||doc.querySelector(nativeOpen)){surrender(m,null,'native-layer');return;}for(const role of ['workspace','sidebar'])if(m.markers.some(({root,attr,nativeClass,nativeStyle,nativeHidden,nativeAriaHidden})=>attr==='data-va-mask-'+role&&(!root.isConnected||root.ownerDocument!==doc||root.getAttribute('class')!==nativeClass||root.getAttribute('style')!==nativeStyle||root.getAttribute('hidden')!==nativeHidden||root.getAttribute('aria-hidden')!==nativeAriaHidden)))surrender(m,role);};
   const observer=new win.MutationObserver(inspectLayer);observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','class','style','hidden','aria-hidden','aria-expanded']});
   const beforeToggle=e=>{if(e.newState==='open'&&!e.target.closest?.('[data-va-owned]'))hide(m);};doc.addEventListener('beforetoggle',beforeToggle,true);
   // Merely focusing a proved native header/composer control is not a popup.
   // Both regions are outside the sidebar's verified rectangle. Keep that
   // independent surface; actual native layers still synchronously hide both.
   const handoffHomeInput=()=>{if(!m.homePointer)return;if(m.homePointerTimer)win.clearTimeout(m.homePointerTimer);m.homePointerTimer=win.setTimeout(()=>{m.homePointerTimer=null;if(!m.homePointer)return;m.homePointer=false;hide(m,'workspace','native-input');try{onSurrender({reason:'native-input'});}catch{}},0);};
   const nativeInput=e=>{if(protectedNodes.some(n=>n===e.target||n.contains(e.target))){
    // Do not move a pointer's target between down/up: focusin precedes click.
    // Finish the native click first, then surrender and restore the same node.
    if(m.homeDock&&m.inspection.composer.contains(e.target)){
     if(e.type==='pointerdown'){m.homePointer=true;return;}
     if(m.homePointer)return;
    }
    const separate=[m.inspection.composer,m.inspection.header].some(n=>n===e.target||n.contains(e.target));hide(m,separate?'workspace':null,'native-input');try{onSurrender({reason:'native-input'});}catch{}
   }};doc.addEventListener('pointerdown',nativeInput,true);doc.addEventListener('focusin',nativeInput,true);doc.addEventListener('pointerup',handoffHomeInput,true);doc.addEventListener('pointercancel',handoffHomeInput,true);win.addEventListener('blur',handoffHomeInput);
   m.cleanup=()=>{ownSidebar.close.removeEventListener('focus',revealExit);sidebar.removeEventListener('beforetoggle',sidebarClosing);sidebar.removeEventListener('toggle',sidebarClosed);workspace?.removeEventListener('beforetoggle',workspaceClosing);workspace?.removeEventListener('toggle',workspaceClosed);observer.disconnect();doc.removeEventListener('beforetoggle',beforeToggle,true);doc.removeEventListener('pointerdown',nativeInput,true);doc.removeEventListener('focusin',nativeInput,true);doc.removeEventListener('pointerup',handoffHomeInput,true);doc.removeEventListener('pointercancel',handoffHomeInput,true);win.removeEventListener('blur',handoffHomeInput);};return handle;
  },
  // Only directory-relevant records reach this method from the adapter. Release
  // an affected mask before discovery; never treat cached visibility as evidence.
  surrenderChanged(records){
   if(!Array.isArray(records)||!records.length)return false;let changed=false;
   const contains=(parent,child)=>parent===child||parent?.contains?.(child)===true;
   for(const m of mounts.values()){
    // Consume only our exact single append/remove once. The same owned node
    // being removed or reinserted later by the host is a native layout change.
    const nativeRecords=records.filter(record=>{
     if(record.type!=='childList')return true;
     const added=[...(record.addedNodes??[])],removed=[...(record.removedNodes??[])];
     const kind=added.length===1&&removed.length===0?'added':removed.length===1&&added.length===0?'removed':null;
     if(!kind)return true;const token=m.projectFlowMutations.get(kind==='added'?added[0]:removed[0]);
     if(token?.[kind]!==record.target)return true;token[kind]=null;return false;
    });
    for(const role of ['workspace','sidebar']){const affected=m.markers.some(({root,attr})=>attr==='data-va-mask-'+role&&m.surfaces.some(s=>s.role===role&&s.node.matches(':popover-open'))&&nativeRecords.some(record=>
     contains(root,record.target)||record.type==='attributes'&&contains(record.target,root)||record.type==='childList'&&[...(record.addedNodes??[]),...(record.removedNodes??[])].some(node=>contains(node,root))));
    if(affected){surrender(m,role);changed=true;}}
   }return changed;
  },
  isOwnedSurface(node){
   return !!node&&node.isConnected&&node.ownerDocument===doc&&[...mounts.values()].some(m=>(m.slot===node||m.surfaces.some(surface=>surface.node===node)));
  },
  isMasked(root){
   for(const m of mounts.values()){
    const marker=m.markers.find(value=>value.root===root);if(!marker)continue;
    const role=marker.attr==='data-va-mask-workspace'?'workspace':'sidebar',surface=m.surfaces.find(value=>value.role===role);
    return marker.wasVisible&&root.isConnected&&m.style.isConnected&&m.style.textContent===m.styleText&&root.getAttribute(marker.attr)===m.handle.id&&root.getAttribute('class')===marker.nativeClass&&root.getAttribute('style')===marker.nativeStyle&&surface.node.isConnected&&surface.node.matches(':popover-open');
   }return false;
  },
  showWorkspace(handle,{roles=['workspace','sidebar']}={}){const m=lookup(handle);if(hasNativeLayer()||doc.querySelector('dialog[open]:not([data-va-owned]),[popover]:popover-open:not([data-va-owned])')){hide(m);return false;}// Re-entry follows the controller's fresh inspection. Capture only presently
   // visible native roots while their own mask is closed, never hidden history.
   for(const role of roles){
    const target=m.surfaces.find(s=>s.role===role);if(!target||target.retired||target.node.matches(':popover-open')||role==='sidebar'&&m.inspection.preserveNativeSidebar===true)continue;
    const markers=m.markers.filter(marker=>marker.attr==='data-va-mask-'+role);
    if(markers.some(({root})=>!root.isConnected||root.ownerDocument!==doc||root.hidden||root.getAttribute('aria-hidden')==='true'||doc.defaultView.getComputedStyle(root).visibility!=='visible'||doc.defaultView.getComputedStyle(root).display==='none')){hide(m,role,'native-change');if(role==='workspace')return false;continue;}
    for(const marker of markers){marker.nativeClass=marker.root.getAttribute('class');marker.nativeStyle=marker.root.getAttribute('style');marker.nativeHidden=marker.root.getAttribute('hidden');marker.nativeAriaHidden=marker.root.getAttribute('aria-hidden');marker.wasVisible=true;}
    target.closeReason=null;target.node.showPopover();
    if(role==='sidebar'&&m.inspection.sidebarPlacement){if(!placeSidebar(m,m.inspection.sidebarPlacement))hide(m,'sidebar','sidebar-obstructed');else m.slot?.removeAttribute('data-va-slot-retained');}
   }return m.surfaces.find(s=>s.role==='workspace')?.node.matches(':popover-open')===true;},
  retireRole(handle,role){
   if(role!=='sidebar')throw Error('invalid-optional-role');const m=lookup(handle),target=m.surfaces.find(s=>s.role===role);if(!target)return;
   hide(m,role,'role-retired');m.slot?.removeAttribute('data-va-slot-retained');target.retired=true;target.frame.remove();
  },
  restoreRole(handle,role){
   if(role!=='sidebar')throw Error('invalid-optional-role');const m=lookup(handle),target=m.surfaces.find(s=>s.role===role);
   if(!target?.retired||m.inspection.preserveNativeSidebar||target.boundary?.parentElement!==target.node)return null;
   const previous=target.frame,frame=doc.createElement('iframe');frame.src=target.url;frame.title=previous.title;frame.style.cssText=previous.style.cssText;
   // Publish a recovered role only after its owned partition is still intact.
   target.node.insertBefore(frame,target.boundary);target.frame=frame;target.retired=false;return {role,frame};
  },
  // Synchronous visibility check only: no authority renewal, DOM replacement,
  // sidebar reopening or asynchronous work is permitted inside this window.
  withNativeReading(handle,read,guard){
   const m=lookup(handle),workspace=m.surfaces.find(s=>s.role==='workspace')?.node;
   if(m.readingProbe||typeof read!=='function'||typeof guard!=='function')return null;
   const states=m.surfaces.map(s=>s.node.matches(':popover-open'));
   // A composed sidebar covers only its own slot, so scanning native data does
   // not require closing it. Collapsing that slot would clamp native scrollTop
   // and turn a read-only observation into a visible navigation jump.
   const keepSidebar=!!m.inspection.sidebarPlacement?.measure(m.slot)&&!m.markers.some(x=>x.attr==='data-va-mask-sidebar');
   const intact=()=>(!m.homeDock||m.homeDock.style.isConnected&&m.homeDock.style.textContent===m.homeDock.css&&m.homeDock.composer.getAttribute('data-va-home-dock')===handle.id)&&mounts.get(handle.id)===m&&m.handle===handle&&m.style.isConnected&&m.style.textContent===m.styleText&&m.surfaces.every(({node,frame,role},i)=>role==='sidebar'||node.isConnected&&node.ownerDocument===doc&&node.dataset.vaOwned===handle.id&&frame.isConnected&&frame.parentElement===node)&&m.markers.filter(x=>x.attr==='data-va-mask-workspace').every(({root,attr,nativeClass,nativeStyle,nativeHidden,nativeAriaHidden})=>root.isConnected&&root.ownerDocument===doc&&root.getAttribute(attr)===handle.id&&root.getAttribute('class')===nativeClass&&root.getAttribute('style')===nativeStyle&&root.getAttribute('hidden')===nativeHidden&&root.getAttribute('aria-hidden')===nativeAriaHidden)&&!hasNativeLayer()&&!doc.querySelector('dialog[open]:not([data-va-owned]),[popover]:popover-open:not([data-va-owned])')&&guard();
   if(!intact())return null;
   const probe=m.readingProbe={cancelled:false,ownClosing:true};let value=null,ok=false;
   if(m.projectFlow||m.homeDock)workspace.setAttribute('data-va-reading-probe','');
   const changes=new doc.defaultView.MutationObserver(()=>{probe.cancelled=true;});
   changes.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
   try{
    for(const target of m.surfaces)if(target.node.matches(':popover-open')&&!(keepSidebar&&target.role==='sidebar')){target.closeReason='reading-probe';target.node.hidePopover();}probe.ownClosing=false;
    if(probe.cancelled||!intact())return null;
    value=read();if(value?.then||probe.cancelled||!intact())return null;
    probe.ownOpening=true;for(const [i,target] of m.surfaces.entries())if(states[i]&&!target.node.matches(':popover-open')){target.closeReason=null;target.node.showPopover();}probe.ownOpening=false;
    ok=!probe.cancelled&&intact()&&changes.takeRecords().length===0&&m.surfaces.every((s,i)=>s.node.matches(':popover-open')===states[i]);return ok?value:null;
   }catch{return null;}finally{changes.disconnect();workspace.removeAttribute('data-va-reading-probe');m.readingProbe=null;if(!ok)surrender(m);}
  },
  showReading(handle){hide(lookup(handle),'workspace','native-reading');},
  suspend(handle,reason='suspended',role=null){hide(lookup(handle),role,reason);},
  frames(handle){return lookup(handle).surfaces.filter(s=>!s.retired).map(({role,frame})=>({role,frame}));},
  visibility(handle){
   const m=lookup(handle);
   if(m.surfaces.filter(s=>s.role==='workspace').some(({node,frame})=>!node.isConnected||node.ownerDocument!==doc||node.dataset.vaOwned!==handle.id||!frame.isConnected||frame.parentElement!==node))return null;
   return Object.fromEntries(m.surfaces.map(({role,node})=>[role,node.matches(':popover-open')]));
  },
  dispose(handle){const m=lookup(handle);m.cleanup();hide(m);for(const s of m.surfaces)s.node.remove();m.slot?.remove();m.style.remove();for(const {root,attr,previous} of m.markers)if(root.getAttribute(attr)===handle.id){if(previous===null)root.removeAttribute(attr);else root.setAttribute(attr,previous);}mounts.delete(handle.id);},
 };
}
