import {nativeHistoryPresentation} from './native-history-list.mjs';
import {profileElement,NATIVE_LAYOUT_ATTRIBUTES} from './native-surface-boundary.mjs';
import {recoverableLayoutFailure} from './local-status.mjs';
import {createURLPolicy} from './url-policy.mjs';
import {exactHostRecord} from './contract.mjs';
import {inspectNativeProjectSurface} from './native-project-surface.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** A live isolated document retains confirmation across ordinary focus/SPA
 * activity. Only explicit account risks revoke it; new documents have no nonce. */
export function installBrowserLocalLifecycle({document:doc,runtime,session,profile}){
 let waiting=false,run=0,stopped=false,locked=Promise.resolve(true),nonce=null,until=0,riskRevision=0;
 const owned=target=>target?.closest?.('[data-va-owned]')||target?.tagName==='IFRAME'&&target.src?.startsWith(runtime.getURL(''));
 const clear=()=>{nonce=null;until=0;riskRevision++;};
 const restart=async()=>{
  if(stopped)return false;const ticket=++run,pending=locked;
  if(!await pending||stopped||ticket!==run||pending!==locked)return false;
  waiting=false;session.stop();await session.start();return !stopped&&ticket===run;
 };
 const lock=()=>{
  if(stopped)return;clear();waiting=true;run++;session.stop();
  locked=Promise.resolve().then(()=>runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'lock'})).then(r=>r?.ok===true,()=>false);
  const pending=locked;void pending.then(ok=>{if(ok&&!stopped&&locked===pending&&doc.visibilityState==='visible')void restart();});
 };
 // Labels classify risk only. They never identify an account or authorize data.
 const risk=e=>{
  if(!e.isTrusted||owned(e.target))return false;
  const control=e.target.closest?.('a[href],button,[role="button"],[role="menuitem"],[role="option"]');if(!control)return false;
  if(control.closest?.('[data-testid*="account"],[data-testid*="workspace"],[data-testid*="profile-menu"]'))return true;
  const label=(control.getAttribute?.('aria-label')||control.getAttribute?.('title')||'').trim().slice(0,160);
  if(/account|profile|log\s*out|sign\s*out|workspace|工作空间|工作区|账户|帐户|账号|个人资料|退出登录|登出|切换.*(空间|团队)/i.test(label))return true;
  if(control.matches?.('[role="menuitem"],[role="option"]')){
   const text=(control.innerText??'').trim();if(text.length<=160&&/^(log\s*out|sign\s*out|switch account|switch workspace|退出登录|登出|切换账号|切换账户|切换工作空间)$/i.test(text))return true;
  }
  const href=control.getAttribute?.('href')??'';return /(?:^|\/)(?:auth|logout|login|accounts?)(?:\/|\?|$)/i.test(href);
 };
 const pointer=e=>{if(risk(e))lock();};
 const keyboard=e=>{if(e.key==='Enter'||e.key===' ')pointer(e);};
 const navigation=e=>{
  if(risk(e)){if(!waiting)lock();return;}
  if(!e.isTrusted||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||owned(e.target))return;
  const link=e.target.closest?.('a[href]');
  if(!link||link.target&&link.target!=='_self'||link.hasAttribute('download'))return;
  if(![profile?.sidebarBoundary,profile?.projectListBoundary].filter(Boolean).some(s=>link.closest(s)))return;
  void runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'prepare-navigation',target:link.href}).catch(()=>{});
 };
 const focus=()=>{if(waiting&&doc.visibilityState==='visible')void restart();};
 // Missing initial sidebar/layout can become available after a native expand
 // or resize. Observe only configured boundaries; no polling, data read or RPC
 // until all are present. Session owns the single fresh-preparation allowance.
 let layoutQueued=false;
 const layoutChanged=()=>{
  if(stopped||layoutQueued||waiting||typeof session.recoverLayout!=='function')return;
  layoutQueued=true;queueMicrotask(()=>{layoutQueued=false;
   const state=session.localStatus?.();
   if(stopped||waiting||doc.visibilityState==='hidden'||!recoverableLayoutFailure(state))return;
   try{
    const route=createURLPolicy({origin:doc.location.origin}).parse(doc.location.href);
    const project=['project','project-candidate'].includes(route.kind)&&profile?.nativeProjectLayout==='panel-after-composer';
    const layout=route.kind==='home'?profile?.nativeHomeLayout:route.kind==='conversation'||project?profile?.nativeLayout:null;
    if(!layout||doc.querySelector('dialog[open], [aria-modal="true"]'))return;
    const keys=project?['header','navigationSlot','historyList']:['header','reading','composer','navigationSlot','historyList','returnHitRoot',...(layout.readingViewport?['readingViewport']:[])];
    if(!keys.every(key=>{const node=profileElement(doc,profile,layout[key],route);if(!node)return false;const rect=node.getBoundingClientRect();return node.isConnected&&rect.width>0&&rect.height>0&&!node.closest('[hidden],[inert],[aria-hidden="true"]');}))return;
    // A late history run must be completely safe before spending the existing
    // one-shot preparation. Empty/interleaved rows do not wake a retry loop.
    if(state.startsWith('layout-history-')&&!nativeHistoryPresentation({document:doc,source:profileElement(doc,profile,profile.regions.history,route),root:profileElement(doc,profile,layout.historyList,route),urlPolicy:createURLPolicy({origin:doc.location.origin})}))return;
    // A loading/skeleton row can outlive the initial bounded wait. Only a
    // complete current Project proof earns the one fresh preparation; repeated
    // skeleton mutations never consume it, authorize data, or extend a deadline.
    if(state==='layout-project-rows'&&(!project||!inspectNativeProjectSurface({document:doc,profile,urlPolicy:createURLPolicy({origin:doc.location.origin}),history:profileElement(doc,profile,layout.historyList,route),header:profileElement(doc,profile,layout.header,route),slot:profileElement(doc,profile,layout.navigationSlot,route)})))return;
    void session.recoverLayout().catch(()=>{});
   }catch{/* Unsupported structure stays native-only. */}
  });
 };
 const layoutObserver=doc.defaultView.MutationObserver?new doc.defaultView.MutationObserver(layoutChanged):null;
 layoutObserver?.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:NATIVE_LAYOUT_ATTRIBUTES});
 doc.defaultView.addEventListener('resize',layoutChanged);
 const pagehide=()=>{clear();}; // BFCache also needs a new explicit confirmation.
 const message=(m,sender,reply)=>{
  if(stopped||sender?.id!==runtime.id||sender.tab!==undefined)return;
  if(m?.type==='HOST_LOCAL_CONTINUITY'){
   if(m.action==='probe'&&exactHostRecord(m,['type','action','challenge'])&&tokenOK(m.challenge)){
    reply({challenge:m.challenge,nonce:Date.now()<until&&!waiting?nonce:null,revision:riskRevision});return;
   }
   if(m.action==='arm'&&exactHostRecord(m,['type','action','nonce','revision','expiresAt'])&&tokenOK(m.nonce)&&m.revision===riskRevision&&Number.isFinite(m.expiresAt)&&m.expiresAt>Date.now()&&m.expiresAt<=Date.now()+43200000){
    nonce=m.nonce;until=m.expiresAt;reply({ok:true});return;
   }
   reply({ok:false});return;
  }
  if(!exactHostRecord(m,['type']))return;
  if(m.type==='HOST_LOCAL_LOCKED'){clear();waiting=true;run++;session.stop();reply({ok:true});if(doc.visibilityState==='visible')void restart();return;}
  if(m.type==='HOST_LOCAL_RESTART'){void restart().then(ok=>reply({ok}),()=>reply({ok:false}));return true;}
  if(m.type==='HOST_DOCUMENT_INVALIDATED'){if(waiting)void restart();else void session.contextReady?.().catch(()=>{});}
 };
 doc.defaultView.addEventListener('focus',focus);doc.defaultView.addEventListener('pagehide',pagehide);doc.addEventListener('pointerdown',pointer,true);doc.addEventListener('keydown',keyboard,true);doc.addEventListener('click',navigation,true);runtime.onMessage.addListener(message);
 return ()=>{stopped=true;layoutObserver?.disconnect();doc.defaultView.removeEventListener('resize',layoutChanged);clear();run++;session.stop();doc.defaultView.removeEventListener('focus',focus);doc.defaultView.removeEventListener('pagehide',pagehide);doc.removeEventListener('pointerdown',pointer,true);doc.removeEventListener('keydown',keyboard,true);doc.removeEventListener('click',navigation,true);runtime.onMessage.removeListener(message);};
}
