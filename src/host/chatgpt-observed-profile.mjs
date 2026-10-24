import {CHATGPT_SIDEBAR_SELECTOR,profileElement,sidebarBoundaryFailure} from './native-surface-boundary.mjs';
import {CHATGPT_SELECTION_CURRENT_BODY} from './current-body-discovery.mjs';
import {nativeReturnGapRect} from './native-return-gap.mjs';
import {createURLPolicy} from './url-policy.mjs';
import {LEGACY_SURFACE_PROFILE} from './surface-discovery.mjs';
// The observed Chinese desktop surface is a candidate, not an authority profile.
// Unsupported membership/send/risk grammars stay absent; no synthetic NONE/ACK.
export const CHATGPT_OBSERVED_PROFILE=Object.freeze({
 id:'chatgpt-zh-desktop-observed-20261018',revision:9,reconstruction:false,liveVerified:false,
 memberAssociation:'route-linked-project-panel-v1',
 nativeProjectLayout:'panel-after-composer',
 sidebarBoundary:CHATGPT_SIDEBAR_SELECTOR,
 sidebarBoundaryFallback:'nav:not([data-app-navigation-rail]):has([data-app-action-sidebar-section] [data-sidebar-chatgpt-conversation-key])',
 projectListBoundary:'main[data-app-shell-main-surface] [data-app-shell-main-content-layout] [role="main"]:has(h1 > button):has([role="tabpanel"])',
 regions:Object.freeze({projects:'nav:not([data-app-navigation-rail])',history:'nav:not([data-app-navigation-rail])',members:'[role="tabpanel"]',moveMenu:':not(*)'}),
 controls:'a[href]',conversationControls:'a[href]',maxCandidates:256,
 currentBody:CHATGPT_SELECTION_CURRENT_BODY,
 // The return slot must already be a strict descendant of its titlebar.
 // Scope selection to that relation; unrelated native titlebars are not
 // candidates. Multiple slot-bearing titlebars still fail the unique check.
 nativeLayout:Object.freeze({
  header:'[data-app-shell-titlebar]:has([data-app-shell-main-titlebar])',navigationSlot:'[data-app-shell-main-titlebar]',
  readingViewport:'[data-app-action-timeline-scroll]',viewportFocus:'native-scroll-region',viewportMarkers:'empty-div-v1',
  reading:'[data-app-action-timeline-scroll] > :not([data-thread-scroll-footer]):not(div:empty)',
  composer:'[data-app-action-timeline-scroll] > [data-thread-scroll-footer]',
  historyList:'nav:not([data-app-navigation-rail]) [data-app-action-sidebar-section] > div > div[aria-hidden]:has([data-sidebar-chatgpt-conversation-key])',
  returnPlacement:'header-gap',returnHitRoot:'[data-app-shell-main-content-layout]',
  headerLayout:'plain-containers',gapPolicy:'first-empty-header-gap',
 }),
 // The native home composer is centered, outside the welcome region. Never
 // use the whole home main/scroll container: it also owns input and tools.
 nativeHomeLayout:Object.freeze({
  header:'[data-app-shell-titlebar]:has([data-app-shell-main-titlebar])',navigationSlot:'[data-app-shell-main-titlebar]',
  reading:'main [role="main"] .home-composer-anchor',
  composer:'main form[data-chatgpt-composer][data-composer-placement="home"]',
  historyList:'nav:not([data-app-navigation-rail]) [data-app-action-sidebar-section] > div > div[aria-hidden]:has([data-sidebar-chatgpt-conversation-key])',
  returnPlacement:'header-gap',returnHitRoot:'[data-app-shell-main-content-layout]',
  headerLayout:'transparent-containers',
 }),
});
export function selectHostSurfaceProfile(id){
 if(id===undefined)return LEGACY_SURFACE_PROFILE;
 if(id===CHATGPT_OBSERVED_PROFILE.id)return CHATGPT_OBSERVED_PROFILE;
 throw Error('unsupported-host-surface-profile');
}

/** One bounded DOM-readiness wait before the first handshake. No account read,
 * retry or authority reuse: a changed document/route must start independently. */
export function waitForNativeLayout({document,profile,timeoutMs=6000,signal=null,onFailure=()=>{}}){
 const href=document.location.href,route=createURLPolicy({origin:new URL(href).origin}).parse(href);
 const layout=route.kind==='home'?profile?.nativeHomeLayout:route.kind==='conversation'?profile?.nativeLayout:null;
 if(!layout)return Promise.resolve(true);
 const keys=['header','reading','composer','navigationSlot','historyList','returnHitRoot',...(layout.readingViewport?['readingViewport']:[])],win=document.defaultView;
 let failure='layout-check-failed',shape=null;
 const geometryReady=nodes=>{
  if(layout.returnPlacement!=='header-gap')return true;
  const byKey=Object.fromEntries(keys.map((key,i)=>[key,nodes[i]])),{header,reading,composer,navigationSlot,historyList,returnHitRoot,readingViewport}=byKey;
  const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  let readingRect=rect(reading);
  if(readingViewport){const v=rect(readingViewport),h=rect(header),c=rect(composer),x=Math.max(0,v.x),y=Math.max(0,v.y,h.y+h.height);readingRect={x,y,width:Math.min(win.innerWidth,v.x+v.width)-x,height:Math.min(win.innerHeight,v.y+v.height,c.y)-y};}
  if(readingRect.width<=0||readingRect.height<=0){failure='layout-geometry-empty';return false;}
  return !!nativeReturnGapRect({document,header,slot:navigationSlot,hitRoot:returnHitRoot,onReject:stage=>{failure='layout-geometry-'+stage;},readingRoot:readingViewport?reading:null,readingViewport:readingViewport??null,viewportFocus:layout.viewportFocus??null,viewportMarkers:layout.viewportMarkers??null,headerLayout:layout.headerLayout??null,gapPolicy:layout.gapPolicy??null,excluded:[historyList,composer],excludedRects:[readingRect]});
 };

 return new Promise(resolve=>{
  let settled=false,observer,timer,stableTimer=null,prior=[];const started=win.performance.now();
  const finish=value=>{if(settled)return;settled=true;observer?.disconnect();win.clearTimeout(timer);win.clearTimeout(stableTimer);signal?.removeEventListener('abort',leave);win.removeEventListener('pagehide',leave);win.removeEventListener('popstate',check);win.removeEventListener('hashchange',check);if(value===false)try{onFailure(failure,shape);}catch{}resolve(value);};
  const leave=()=>finish(false);
  const check=()=>{
   const elapsed=win.performance.now()-started;
   if(signal?.aborted||document.location.href!==href||!Number.isFinite(elapsed)||elapsed<0||elapsed>=timeoutMs){finish(false);return;}
   try{
    // Presentation readiness only. Adapter inspection still proves purity,
    // geometry and native control protection after a fresh worker handshake.
    const groups=keys.map(k=>document.querySelectorAll(layout[k]));
    try{shape={counts:groups.map(items=>Math.min(33,items.length)),branches:[...document.querySelectorAll(layout.readingViewport??':not(*)')].slice(0,1).flatMap(v=>[...v.children].slice(0,12).map(n=>{const r=n.getBoundingClientRect(),style=win.getComputedStyle(n);return [['DIV','STYLE','SCRIPT','TEMPLATE','FOOTER','BUTTON'].includes(n.tagName)?n.tagName:'OTHER',style.display!=='none'&&style.visibility==='visible'&&r.width>0&&r.height>0,n.hasAttribute('data-thread-scroll-footer'),!!n.querySelector('[data-chatgpt-conversation-selection-target]'),n.matches('[contenteditable],input,textarea')||!!n.querySelector('[contenteditable],input,textarea'),Math.min(33,n.children.length)];}))};
    // A home layout has six keys; keep the fixed count schema independent of route.
    if(shape.counts.length===6)shape.counts.push(0);}catch{shape=null;}
    const bad=groups.findIndex(items=>items.length!==1);if(bad>=0)failure='layout-'+(groups[bad].length===0?'missing-':'ambiguous-')+keys[bad];
    let nodes=groups.every(items=>items.length===1)?groups.map(items=>items[0]):[];
    if(nodes.length){const mismatch=keys.findIndex((key,i)=>profileElement(document,profile,layout[key],route)!==nodes[i]);if(mismatch>=0){failure=keys[mismatch]==='historyList'?'layout-sidebar-'+sidebarBoundaryFailure(document,profile):'layout-missing-'+keys[mismatch];nodes=[];}}
    if(nodes.length&&!geometryReady(nodes))nodes=[];
    if(nodes.length&&nodes.length===prior.length&&nodes.every((node,i)=>node===prior[i]))return;
    win.clearTimeout(stableTimer);stableTimer=null;prior=nodes;
    if(nodes.length)stableTimer=win.setTimeout(()=>{
     const elapsed=win.performance.now()-started;
     if(!signal?.aborted&&document.location.href===href&&elapsed>=0&&elapsed<timeoutMs&&geometryReady(nodes)&&groups.every((_,i)=>{const current=document.querySelectorAll(layout[keys[i]]);return current.length===1&&current[0]===nodes[i]&&profileElement(document,profile,layout[keys[i]],route)===nodes[i];}))finish(true);else{prior=[];check();}
    },150);
   }catch{finish(false);}
  };
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>6000){finish(false);return;}
  observer=new win.MutationObserver(check);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','role','tabindex','data-composer-placement','data-chatgpt-composer','data-sidebar-chatgpt-conversation-key','aria-hidden']});
  signal?.addEventListener('abort',leave,{once:true});win.addEventListener('pagehide',leave);win.addEventListener('popstate',check);win.addEventListener('hashchange',check);timer=win.setTimeout(()=>finish(false),timeoutMs);check();
 });
}

// Compatibility for callers of the original home-only readiness helper.
export const waitForNativeHomeLayout=waitForNativeLayout;
