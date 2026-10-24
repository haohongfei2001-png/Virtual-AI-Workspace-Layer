import {projectSurfaceFailureReasons,projectClipDiagnostic} from './native-project-surface.mjs';
import {historyFailureReasons} from './native-history-list.mjs';
// Shared fixed frame failures; arbitrary renderer/transport error text stays private.
export const frameFailureReasons=Object.freeze(['ui-grant-expired','ui-renew-failed','ui-join-failed','ui-port-disconnected','ui-renderer-failed','read-budget-exhausted','frame-preparation-limit','free-frame-page-too-large','frame-view-unavailable','invalid-preparation-response','invalid-frame-view','invalid-search-snippets','invalid-frame-current','invalid-frame-current-ref','invalid-frame-navigation','invalid-frame-presentation','request-timeout']);
export const foregroundFailureStates=Object.freeze(['invalid-host-document','stale-host-document','scope-not-verified','replayed-sequence','host-refresh-unavailable','host-unavailable','capacity','transport-unavailable','scope-unverified','scope-changed'].map(reason=>'foreground-'+reason));
export const helloFailureStates=Object.freeze(['transport-unavailable','invalid-binding','invalid-host-hello','invalid-sender','not-current-document','invalidated-during-check','replayed-sequence','capacity','bad-document-token','epoch-capacity','host-document-unavailable','host-unavailable'].map(reason=>'hello-'+reason));
export const layoutFailureStates=Object.freeze([...projectSurfaceFailureReasons.map(reason=>'layout-project-'+reason),...['missing','capacity','ambiguous','changed','list-not-in-boundary','no-unique-visible','excluded-branch','no-rect','ancestor-limit','hidden-attribute','aria-hidden','display-none','visibility','opacity-zero','check-visibility','unavailable'].map(reason=>'layout-sidebar-'+reason),...['header','reading','composer','navigationSlot','historyList','returnHitRoot','readingViewport'].flatMap(key=>['layout-missing-'+key,'layout-ambiguous-'+key]),...['roots','header-gap','button','hit-root','viewport','reading-root','reading-paint','reading-paint-capacity','reading-paint-budget','reading-paint-opaque','reading-paint-decoration','reading-paint-overlap','protected-regions','header-paint','hit-test','header-layer','region-rect'].map(key=>'layout-geometry-'+key),'layout-geometry-empty','layout-check-failed']);
export const surfaceFailureStates=Object.freeze([...frameFailureReasons.map(reason=>'frame-'+reason),...historyFailureReasons.map(reason=>'unsafe-native-history-list-'+reason),'frame-policy-blocked','frame-resource-failed','frame-script-failed','mount-registration-pending','frame-join-rejected','frame-module-pending','frame-join-pending','frame-grant-pending','frame-presentation-pending','geometry-paused','document-stale','binding-expired','grants-incomplete','grants-expired','frames-detached','controller-absent','ui-authority-revoked','close-cancellation-failed','dormant-resume-failed','idle-frame-unavailable','idle-suspend-failed','ui-grant-expired','ui-frame-suspended','session-renew-failed','session-renew-document','session-renew-scope','session-renew-ui-pair','session-renew-local-validity','session-renew-ack','session-renew-adapter','stale-session-renewal','region-identity-changed','native-region-changed','native-geometry-changed','dormant-document-changed','missing-history','missing-header','missing-reading','missing-composer','missing-navigationSlot','missing-or-ambiguous-native-boundary','unsafe-native-home-layout','unsafe-native-history-list','return-slot-outside-native-header','unsafe-native-reading-viewport','overlapping-native-boundary','native-content-occupies-return-slot','unsafe-native-geometry','unsafe-native-project-layout','invalid-return-slot','unsupported-mount-surface','invalid-mount-inspection','unsafe-mask-region','invalid-mount-rect','unsafe-mask-geometry','invalid-ui-frame-origin','incomplete-dual-surface','mount-registration-denied','stale-mount-registration'].map(reason=>'surface-'+reason));
const states=new Set([...foregroundFailureStates,...helloFailureStates,...layoutFailureStates,...surfaceFailureStates,'ready','reading','suspended','dormant','connecting','waiting','verification-required','frame-blocked','layout-failed','hello-failed','adapter-failed','authorization-failed','surface-failed','foreground-failed','unavailable']);
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
// Bounded layout categories or numeric computed inset geometry only; never
// native text, IDs, URLs, arbitrary CSS, attribute values or credential material.
export function validLayoutShape(value){
 if(exact(value,['projectClip']))return typeof value.projectClip==='string'&&(['inset','rect','xywh','circle','ellipse','polygon','path','url','shape','border-box','padding-box','content-box','margin-box','fill-box','stroke-box','view-box','empty','unavailable','other'].includes(value.projectClip)||projectClipDiagnostic(value.projectClip).projectClip===value.projectClip);
 return exact(value,['counts','branches'])&&Array.isArray(value.counts)&&value.counts.length===7&&value.counts.every(n=>Number.isInteger(n)&&n>=0&&n<=33)&&Array.isArray(value.branches)&&value.branches.length<=12&&value.branches.every(row=>Array.isArray(row)&&row.length===6&&['DIV','STYLE','SCRIPT','TEMPLATE','FOOTER','BUTTON','OTHER'].includes(row[0])&&row.slice(1,5).every(v=>typeof v==='boolean')&&Number.isInteger(row[5])&&row[5]>=0&&row[5]<=33);
}
/** Passive isolated-world status. This is not an authority or recovery channel. */
export function installLocalStatus({runtime,readState,readLayout=()=>null}){
 const listener=(message,sender,reply)=>{
  if(!exact(message,['v','type'])||message.v!==1||!['HOST_LOCAL_STATUS','HOST_LOCAL_LAYOUT'].includes(message.type)||sender?.id!==runtime.id||sender?.url!==runtime.getURL('status.html')||sender.tab!==undefined)return;
  if(message.type==='HOST_LOCAL_LAYOUT'){let shape=null;try{const value=readLayout();if(validLayoutShape(value))shape=value;}catch{}reply({v:1,shape});return;}
  let state='unavailable';try{const value=readState();if(states.has(value))state=value;}catch{}
  reply({v:1,state});
 };
 runtime.onMessage.addListener(listener);
 return ()=>runtime.onMessage.removeListener(listener);
}
/** One local query; no URL/title reads, permissions, authentication or retry. */
export function readActiveLocalStatus({tabs,schedule=setTimeout,cancel=clearTimeout,onFailure=()=>{}}){
 return new Promise(resolve=>{
  let settled=false,timer;const failure=code=>{try{onFailure(code);}catch{}};const finish=value=>{if(settled)return;settled=true;cancel(timer);resolve(value);};
  timer=schedule(()=>{failure('timeout');finish('unavailable');},1000);
  Promise.resolve().then(()=>tabs.query({active:true,currentWindow:true})).then(rows=>{
   if(settled)return;
   if(!Array.isArray(rows)||rows.length!==1||!Number.isSafeInteger(rows[0]?.id)||rows[0].id<0){failure('tab-unavailable');finish('unavailable');return;}
   return tabs.sendMessage(rows[0].id,{v:1,type:'HOST_LOCAL_STATUS'},{frameId:0});
  }).then(value=>{if(settled)return;const valid=exact(value,['v','state'])&&value.v===1&&states.has(value.state);if(!valid)failure('invalid-reply');finish(valid?value.state:'unavailable');},()=>{if(settled)return;failure('transport-error');finish('unavailable');});
 });
}

/** Optional same-document layout failure shape, with the same private sender gate. */
export function readActiveLocalLayout({tabs,schedule=setTimeout,cancel=clearTimeout}){
 return new Promise(resolve=>{
  let settled=false,timer;const finish=value=>{if(settled)return;settled=true;cancel(timer);resolve(value);};
  timer=schedule(()=>finish(null),1000);
  Promise.resolve().then(()=>tabs.query({active:true,currentWindow:true})).then(rows=>{
   if(settled)return;
   if(!Array.isArray(rows)||rows.length!==1||!Number.isSafeInteger(rows[0]?.id)||rows[0].id<0){finish(null);return;}
   return tabs.sendMessage(rows[0].id,{v:1,type:'HOST_LOCAL_LAYOUT'},{frameId:0});
  }).then(r=>{if(!settled)finish(exact(r,['v','shape'])&&r.v===1&&validLayoutShape(r.shape)?r.shape:null);},()=>finish(null));
 });
}
