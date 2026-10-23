import {CHATGPT_SIDEBAR_SELECTOR} from './native-surface-boundary.mjs';
import {CHATGPT_SELECTION_CURRENT_BODY} from './current-body-discovery.mjs';
import {LEGACY_SURFACE_PROFILE} from './surface-discovery.mjs';
// The observed Chinese desktop surface is a candidate, not an authority profile.
// Unsupported membership/send/risk grammars stay absent; no synthetic NONE/ACK.
export const CHATGPT_OBSERVED_PROFILE=Object.freeze({
 id:'chatgpt-zh-desktop-observed-20261018',revision:5,reconstruction:false,liveVerified:false,
 memberAssociation:'route-linked-project-panel-v1',
 nativeProjectLayout:'panel-after-composer',
 sidebarBoundary:CHATGPT_SIDEBAR_SELECTOR,
 projectListBoundary:'main[data-app-shell-main-surface] [data-app-shell-main-content-layout] [role="main"]:has(h1 > button):has([role="tabpanel"])',
 regions:Object.freeze({projects:'nav:not([data-app-navigation-rail])',history:'nav:not([data-app-navigation-rail])',members:'[role="tabpanel"]',moveMenu:':not(*)'}),
 controls:'a[href]',conversationControls:'a[href]',maxCandidates:256,
 currentBody:CHATGPT_SELECTION_CURRENT_BODY,
 nativeLayout:Object.freeze({
  header:'[data-app-shell-titlebar]',navigationSlot:'[data-app-shell-main-titlebar]',
  readingViewport:'[data-app-action-timeline-scroll]',viewportFocus:'native-scroll-region',
  reading:'[data-app-action-timeline-scroll] > :not([data-thread-scroll-footer])',
  composer:'[data-app-action-timeline-scroll] > [data-thread-scroll-footer]',
  historyList:'nav:not([data-app-navigation-rail]) [data-app-action-sidebar-section] > div > div[aria-hidden]:has([data-sidebar-chatgpt-conversation-key])',
  returnPlacement:'header-gap',returnHitRoot:'[data-app-shell-main-content-layout]',
 }),
 // The native home composer is centered, outside the welcome region. Never
 // use the whole home main/scroll container: it also owns input and tools.
 nativeHomeLayout:Object.freeze({
  header:'[data-app-shell-titlebar]',navigationSlot:'[data-app-shell-main-titlebar]',
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
export function waitForNativeHomeLayout({document,profile,timeoutMs=6000,signal=null}){
 if(!profile?.nativeHomeLayout||document.location.pathname!=='/')return Promise.resolve(true);
 const layout=profile.nativeHomeLayout,href=document.location.href,win=document.defaultView;
 return new Promise(resolve=>{
  let settled=false,observer,timer,stableTimer=null,prior=[];const started=win.performance.now();
  const finish=value=>{if(settled)return;settled=true;observer?.disconnect();win.clearTimeout(timer);win.clearTimeout(stableTimer);signal?.removeEventListener('abort',leave);win.removeEventListener('pagehide',leave);win.removeEventListener('popstate',check);win.removeEventListener('hashchange',check);resolve(value);};
  const leave=()=>finish(false);
  const check=()=>{
   const elapsed=win.performance.now()-started;
   if(signal?.aborted||document.location.href!==href||!Number.isFinite(elapsed)||elapsed<0||elapsed>=timeoutMs){finish(false);return;}
   try{
    // Presentation readiness only. Adapter inspection still proves purity,
    // geometry and native control protection after a fresh worker handshake.
    const groups=['header','reading','composer','navigationSlot','historyList','returnHitRoot'].map(k=>document.querySelectorAll(layout[k]));
    const nodes=groups.every(items=>items.length===1)?groups.map(items=>items[0]):[];
    if(nodes.length&&nodes.length===prior.length&&nodes.every((node,i)=>node===prior[i]))return;
    win.clearTimeout(stableTimer);stableTimer=null;prior=nodes;
    if(nodes.length)stableTimer=win.setTimeout(()=>{
     const elapsed=win.performance.now()-started;
     if(!signal?.aborted&&document.location.href===href&&elapsed>=0&&elapsed<timeoutMs&&groups.every((_,i)=>{const current=document.querySelectorAll(layout[['header','reading','composer','navigationSlot','historyList','returnHitRoot'][i]]);return current.length===1&&current[0]===nodes[i];}))finish(true);else finish(false);
    },150);
   }catch{finish(false);}
  };
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>6000){finish(false);return;}
  observer=new win.MutationObserver(check);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','role','data-composer-placement','data-chatgpt-composer','data-sidebar-chatgpt-conversation-key','aria-hidden']});
  signal?.addEventListener('abort',leave,{once:true});win.addEventListener('pagehide',leave);win.addEventListener('popstate',check);win.addEventListener('hashchange',check);timer=win.setTimeout(()=>finish(false),timeoutMs);check();
 });
}
