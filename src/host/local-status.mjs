import {projectSurfaceFailureReasons,projectClipDiagnostic} from './native-project-surface.mjs';
import {historyFailureReasons} from './native-history-list.mjs';
import {validHistoryStructureReport} from './history-structure-diagnostic.mjs';
// Shared fixed frame failures; arbitrary renderer/transport error text stays private.
export const frameFailureReasons=Object.freeze(['ui-grant-expired','ui-renew-failed','ui-join-failed','ui-port-disconnected','ui-renderer-failed','read-budget-exhausted','frame-preparation-limit','free-frame-page-too-large','frame-view-unavailable','invalid-preparation-response','invalid-frame-view','invalid-search-snippets','invalid-frame-current','invalid-frame-current-ref','invalid-frame-navigation','invalid-frame-presentation','request-timeout']);
export const foregroundFailureStates=Object.freeze(['invalid-host-document','stale-host-document','scope-not-verified','replayed-sequence','host-refresh-unavailable','host-unavailable','capacity','transport-unavailable','scope-unverified','scope-changed'].map(reason=>'foreground-'+reason));
export const helloFailureStates=Object.freeze(['transport-unavailable','invalid-binding','invalid-host-hello','invalid-sender','not-current-document','invalidated-during-check','replayed-sequence','capacity','bad-document-token','epoch-capacity','host-document-unavailable','host-unavailable'].map(reason=>'hello-'+reason));
export const layoutFailureStates=Object.freeze(['layout-history-row-unstable',...historyFailureReasons.map(reason=>'layout-history-'+reason),...projectSurfaceFailureReasons.map(reason=>'layout-project-'+reason),...['missing','capacity','ambiguous','changed','list-not-in-boundary','no-unique-visible','excluded-branch','no-rect','ancestor-limit','hidden-attribute','aria-hidden','display-none','visibility','opacity-zero','check-visibility','unavailable'].map(reason=>'layout-sidebar-'+reason),...['header','reading','composer','navigationSlot','historyList','returnHitRoot','readingViewport'].flatMap(key=>['layout-missing-'+key,'layout-ambiguous-'+key]),...['roots','header-gap','button','hit-root','viewport','reading-root','reading-paint','reading-paint-capacity','reading-paint-budget','reading-paint-opaque','reading-paint-decoration','reading-paint-overlap','protected-regions','header-paint','hit-test','header-layer','region-rect'].map(key=>'layout-geometry-'+key),'layout-geometry-empty','layout-check-failed']);
// Readiness recovery still requires a fresh complete layout proof; this only
// identifies failures that may settle after the first bounded preparation.
export const recoverableLayoutFailure=state=>typeof state==='string'&&(state.startsWith('layout-missing-')||['layout-ambiguous-header','layout-ambiguous-navigationSlot','layout-project-rows','layout-history-row-order','layout-history-row-replaced','layout-history-row-unstable'].includes(state));
export const surfaceFailureStates=Object.freeze([...frameFailureReasons.map(reason=>'frame-'+reason),...historyFailureReasons.map(reason=>'unsafe-native-history-list-'+reason),'frame-policy-blocked','frame-resource-failed','frame-script-failed','mount-registration-pending','frame-join-rejected','frame-module-pending','frame-join-pending','frame-grant-pending','frame-presentation-pending','geometry-paused','document-stale','binding-expired','grants-incomplete','grants-expired','frames-detached','controller-absent','ui-authority-revoked','close-cancellation-failed','dormant-resume-failed','idle-frame-unavailable','idle-suspend-failed','ui-grant-expired','ui-frame-suspended','session-renew-failed','session-renew-document','session-renew-scope','session-renew-ui-pair','session-renew-local-validity','session-renew-ack','session-renew-adapter','stale-session-renewal','region-identity-changed','native-region-changed','native-geometry-changed','dormant-document-changed','missing-history','missing-header','missing-reading','missing-composer','missing-navigationSlot','missing-or-ambiguous-native-boundary','unsafe-native-home-layout','unsafe-native-history-list','return-slot-outside-native-header','unsafe-native-reading-viewport','overlapping-native-boundary','native-content-occupies-return-slot','unsafe-native-geometry','unsafe-native-project-layout','invalid-return-slot','unsupported-mount-surface','invalid-mount-inspection','unsafe-mask-region','invalid-mount-rect','unsafe-mask-geometry','invalid-ui-frame-origin','incomplete-dual-surface','mount-registration-denied','stale-mount-registration'].map(reason=>'surface-'+reason));
const states=new Set([...foregroundFailureStates,...helloFailureStates,...layoutFailureStates,...surfaceFailureStates,'ready','reading','suspended','dormant','connecting','waiting','verification-required','frame-blocked','layout-failed','hello-failed','adapter-failed','authorization-failed','surface-failed','foreground-failed','unavailable']);
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
// Bounded layout categories or numeric computed inset geometry only; never
// native text, IDs, URLs, arbitrary CSS, attribute values or credential material.
export function validLayoutShape(value){
 if(exact(value,['navigation','delivery','presentation'])){
  const p=value.presentation;
  return validLayoutShape({navigation:value.navigation,delivery:value.delivery})&&(p===null||exact(p,['mode','attempt','registered','frames','grants','workspace','sidebar','geometryPaused','returnPresent'])&&['waiting','workspace','reading','suspended','dormant'].includes(p.mode)&&['not-attempted','showing','show-refused','show-returned','join-exception'].includes(p.attempt)&&['registered','geometryPaused','returnPresent'].every(k=>typeof p[k]==='boolean')&&['workspace','sidebar'].every(k=>p[k]===null||typeof p[k]==='boolean')&&['frames','grants'].every(k=>Number.isInteger(p[k])&&p[k]>=0&&p[k]<=2));
 }

 if(exact(value,['navigation','delivery'])){
  const d=value.delivery;
  return exact(d,['pages','resolvedProjects','resolvedChats','acceptedPackets','acceptedProjects','acceptedChats','rejectedPackets','capped'])&&typeof d.capped==='boolean'&&Object.entries(d).every(([k,v])=>k==='capped'||Number.isSafeInteger(v)&&v>=0&&v<=1000000)&&validLayoutShape({navigation:value.navigation});
 }
 if(exact(value,['navigation'])){
  const n=value.navigation,counts=values=>Array.isArray(values)&&values.every(v=>Number.isInteger(v)&&v>=0&&v<=256);
  const geometry=(values,lengths)=>Array.isArray(values)&&lengths.includes(values.length)&&values.every(v=>Number.isInteger(v)&&Math.abs(v)<=65536);
  const topology=rows=>Array.isArray(rows)&&rows.length<=20&&rows.every((r,i)=>Array.isArray(r)&&r.length===3&&Number.isInteger(r[0])&&r[0]>=-1&&r[0]<i&&Number.isInteger(r[1])&&r[1]>=-1&&r[1]<=9&&Number.isInteger(r[2])&&r[2]>=0&&r[2]<=256);
  return exact(n,['phase','roots','matched','visible','firstOutside','firstClip','memberShape','headingShape','memberReject','rejected','titles','association','candidates','claims'])
   &&['not-scanned','scanned','accepted','duplicate','rejected','retry-after','failed','scan-failed'].includes(n.phase)
   &&counts(n.memberReject)&&n.memberReject.length===7&&counts(n.rejected)&&n.rejected.length===11
   &&topology(n.memberShape)&&topology(n.headingShape)&&geometry(n.firstClip,[0,3])&&geometry(n.firstOutside,[0,6])
   &&Array.isArray(n.roots)&&n.roots.length===3&&n.roots.every(v=>v===0||v===1)
   &&counts(['matched','visible','titles','association','candidates','claims'].map(k=>n[k]));
 }
 if(exact(value,['projectClip']))return typeof value.projectClip==='string'&&(['inset','rect','xywh','circle','ellipse','polygon','path','url','shape','border-box','padding-box','content-box','margin-box','fill-box','stroke-box','view-box','empty','unavailable','other'].includes(value.projectClip)||projectClipDiagnostic(value.projectClip).projectClip===value.projectClip);
 return exact(value,['counts','branches'])&&Array.isArray(value.counts)&&value.counts.length===7&&value.counts.every(n=>Number.isInteger(n)&&n>=0&&n<=33)&&Array.isArray(value.branches)&&value.branches.length<=12&&value.branches.every(row=>Array.isArray(row)&&row.length===6&&['DIV','STYLE','SCRIPT','TEMPLATE','FOOTER','BUTTON','OTHER'].includes(row[0])&&row.slice(1,5).every(v=>typeof v==='boolean')&&Number.isInteger(row[5])&&row[5]>=0&&row[5]<=33);
}
/** Numeric local pipeline snapshot; no identities, query or row content. */
export function validLocalPipeline(p){
 if(exact(p,['storage','nativeRevision','projects','refs','lastWorkspaceDelivery','workspaceReceipt'])){
  const {workspaceReceipt:r,...rest}=p;
  return validLocalPipeline(rest)&&(r===null||exact(r,['deliveryId','phase','cards','rows'])&&Number.isSafeInteger(r.deliveryId)&&r.deliveryId>0&&['sent','received','rendered'].includes(r.phase)&&['cards','rows'].every(k=>r.phase==='rendered'?Number.isInteger(r[k])&&r[k]>=0&&r[k]<=4096:r[k]===null));
 }

 const num=v=>Number.isSafeInteger(v)&&v>=0,optional=v=>v===null||num(v),pair=v=>Array.isArray(v)&&v.length===2&&v.every(optional);
 if(!exact(p,['storage','nativeRevision','projects','refs','lastWorkspaceDelivery'])||!['session','personal'].includes(p.storage)||!num(p.nativeRevision)||![p.projects,p.refs].every(optional))return false;
 const d=p.lastWorkspaceDelivery;
 return d===null||exact(d,['versions','segment','inventory','groups','noProject','unknown'])&&Array.isArray(d.versions)&&d.versions.length===4&&d.versions.every((v,i)=>optional(v)||i===2&&pair(v))&&optional(d.segment)&&['inventory','groups','noProject','unknown'].every(k=>pair(d[k]));
}
/** Passive isolated-world status. This is not an authority or recovery channel. */
export function installLocalStatus({runtime,readState,readLayout=()=>null,observeHistory=null}){
 const listener=(message,sender,reply)=>{
  if(exact(message,['v','type'])&&message.v===1&&message.type==='HOST_LOCAL_HISTORY_STRUCTURE'&&sender?.id===runtime.id&&sender?.url===runtime.getURL('status.html')&&sender.tab===undefined&&observeHistory){
   Promise.resolve().then(observeHistory).then(report=>reply({v:1,report:validHistoryStructureReport(report)?report:null}),()=>reply({v:1,report:null}));return true;
  }
  if(!exact(message,['v','type'])||message.v!==1||!['HOST_LOCAL_STATUS','HOST_LOCAL_LAYOUT'].includes(message.type)||sender?.id!==runtime.id||sender?.url!==runtime.getURL('status.html')||sender.tab!==undefined)return;
  if(message.type==='HOST_LOCAL_LAYOUT'){let shape=null;try{const value=readLayout();if(validLayoutShape(value))shape=value;}catch{}reply({v:1,shape});return;}
  let state='unavailable';try{const value=readState();if(states.has(value))state=value;}catch{}
  reply({v:1,state});
 };
 runtime.onMessage.addListener(listener);
 return ()=>runtime.onMessage.removeListener(listener);
}
/** One local query. Browser URL stays in memory for document binding only;
 * no page content, permissions, authentication or retry. */
export function readActiveLocalStatus({tabs,webNavigation=null,schedule=setTimeout,cancel=clearTimeout,onFailure=()=>{},onTarget=()=>{},onProbeTarget=()=>{}}){
 return new Promise(resolve=>{
  let stage='query',settled=false,timer,target=null,documentId=null,documentURL=null;const failure=code=>{try{onFailure(code);}catch{}};const finish=value=>{if(settled)return;settled=true;cancel(timer);resolve(value);};
  timer=schedule(()=>{failure('timeout');finish('unavailable');},1000);
  Promise.resolve().then(()=>tabs.query({active:true,currentWindow:true})).then(async rows=>{
   if(settled)return;
   if(!Array.isArray(rows)||rows.length!==1||!Number.isSafeInteger(rows[0]?.id)||rows[0].id<0){failure('tab-unavailable');finish('unavailable');return;}
   target=rows[0].id;
   if(webNavigation){
    stage='frame';const frame=await webNavigation.getFrame({tabId:target,frameId:0});if(settled)return;
    if(typeof frame?.documentId!=='string'||!frame.documentId||frame.documentLifecycle!=='active'){failure('document-unavailable');finish('unavailable');return;}
    documentId=frame.documentId;documentURL=frame.url;
   }
   if(documentId)try{onProbeTarget({tabId:target,documentId,url:documentURL});}catch{}
   stage='send';const reply=await tabs.sendMessage(target,{v:1,type:'HOST_LOCAL_STATUS'},documentId?{documentId}:{frameId:0});
   if(settled)return;
   if(documentId){stage='frame';const check=await webNavigation.getFrame({tabId:target,frameId:0});if(settled)return;if(check?.documentId!==documentId||check.url!==documentURL||check.documentLifecycle!=='active'){failure('document-changed');finish('unavailable');return;}}
   if(documentId)try{onTarget({tabId:target,documentId,url:documentURL});}catch{}
   return reply;
  }).then(value=>{if(settled)return;const valid=exact(value,['v','state'])&&value.v===1&&states.has(value.state);if(!valid)failure('invalid-reply');finish(valid?value.state:'unavailable');},error=>{if(settled)return;
   // Inspect only known platform error strings in memory; never return raw text.
   const text=typeof error?.message==='string'?error.message:'';
   const code=stage==='query'?'tab-query-failed':stage==='frame'?'document-query-failed':text.includes('Receiving end does not exist')?'receiver-unavailable':text.includes('message port closed')||text.includes('message channel closed')?'receiver-disconnected':text.includes('No tab with id')?'tab-closed':'transport-error';
   failure(code);finish('unavailable');});
 });
}

/** Optional same-document layout failure shape, with the same private sender gate. */
export function readActiveLocalLayout({tabs,webNavigation=null,target=null,schedule=setTimeout,cancel=clearTimeout}){
 return new Promise(resolve=>{
  let settled=false,timer;const finish=value=>{if(settled)return;settled=true;cancel(timer);resolve(value);};
  timer=schedule(()=>finish(null),1000);
  Promise.resolve().then(()=>target?[{id:target.tabId}]:tabs.query({active:true,currentWindow:true})).then(async rows=>{
   if(settled)return;
   if(!Array.isArray(rows)||rows.length!==1||!Number.isSafeInteger(rows[0]?.id)||rows[0].id<0){finish(null);return;}
   const current=async()=>{if(!target)return true;if(!webNavigation)return false;const frame=await webNavigation.getFrame({tabId:target.tabId,frameId:0});return frame?.documentId===target.documentId&&frame.url===target.url&&frame.documentLifecycle==='active';};
   if(!await current()||settled){finish(null);return;}
   const result=await tabs.sendMessage(rows[0].id,{v:1,type:'HOST_LOCAL_LAYOUT'},target?{documentId:target.documentId}:{frameId:0});
   return !settled&&await current()?result:null;
  }).then(r=>{if(!settled)finish(exact(r,['v','shape'])&&r.v===1&&validLayoutShape(r.shape)?r.shape:null);},()=>finish(null));
 });
}

/** Independent bootstrap probe, bound to the exact document sampled above.
 * It cannot bootstrap, inject, retry, authorize, or change the page. */
export async function readLocalBoot({tabs,webNavigation,target,schedule=setTimeout,cancel=clearTimeout}){
 if(!target||!webNavigation)return null;
 let active=true,timer;
 const current=async()=>{const frame=await webNavigation.getFrame({tabId:target.tabId,frameId:0});return active&&frame?.documentId===target.documentId&&frame.url===target.url&&frame.documentLifecycle==='active';};
 const work=async()=>{
  if(!await current())return null;
  const r=await tabs.sendMessage(target.tabId,{v:1,type:'HOST_LOCAL_BOOT'},{documentId:target.documentId});
  if(!await current())return null;
  return exact(r,['v','stage','build'])&&r.v===1&&['module-loading','module-loaded','module-load-failed'].includes(r.stage)&&typeof r.build==='string'&&/^[a-f0-9]{64}$/.test(r.build)?r:null;
 };
 try{return await Promise.race([work(),new Promise(resolve=>{timer=schedule(()=>resolve(null),1000);})]);}catch{return null;}finally{active=false;cancel(timer);}
}
