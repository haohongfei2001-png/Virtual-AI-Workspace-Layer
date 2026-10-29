import {instrumentJ4ReenableOwner,J4_REENABLE_TRACE_KIND} from './j4-reenable-owner-trace.mjs';
import {cp,readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';import {verifyHost} from '../../extension/package.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const J4_ORDER_PATHS=['src/runtime/browser-request-context.mjs','src/runtime/host-browser-bootstrap.mjs','src/host/context-association.mjs','src/host/content-session.mjs'];
const recorder=`const __j4Order=(stage,fields={})=>{try{const rows=globalThis.__vaiwlJ4LifecycleOrder??=[];if(rows.length<192)rows.push({stage,at:Date.now(),elapsed:performance.now(),...fields});}catch{}};
const __j4RequestHash=value=>{if(typeof value!=='string')return null;let h=2166136261;for(let i=0;i<Math.min(value.length,256);i++)h=Math.imul(h^value.charCodeAt(i),16777619);return (h>>>0).toString(16).padStart(8,'0');};\n`;
// Isolated-world RAM only. Explicit fields prevent accidental capability/body logging.
const contentRecorder=`const __j4Order=(stage,fields={})=>{try{const trace=globalThis.__vaiwlJ4ContentLifecycle??={rows:[],sequence:0,dropped:0};const row={stage,sequence:++trace.sequence};for(const key of ['run','epoch','routeEpoch'])row[key]=Number.isSafeInteger(fields[key])?fields[key]:null;for(const key of ['enabled','ready','scopePresent','readyPending','resumeAllowed','active','associationPending'])row[key]=fields[key]===true;row.document=typeof fields.document==='string'&&/^[0-9a-f]{8}$/.test(fields.document)?fields.document:null;if(trace.rows.length===192){trace.rows.shift();trace.dropped++;}trace.rows.push(row);}catch{}};
const __j4DocumentHash=value=>{if(typeof value!=='string')return null;let h=2166136261;for(let i=0;i<Math.min(value.length,256);i++)h=Math.imul(h^value.charCodeAt(i),16777619);return (h>>>0).toString(16).padStart(8,'0');};\n`;
function once(source,from,to){if(source.split(from).length!==2)throw Error('j4-order-anchor-mismatch');return source.replace(from,to);}
export function instrumentJ4LifecycleOrderSource(path,source){
 if(source.includes('__j4Order'))throw Error('j4-order-already-instrumented');let out=source;
 const inject=(from,to)=>{out=once(out,from,to);};
 if(path===J4_ORDER_PATHS[0]){
  inject('function invalidateHistory(details){','function invalidateHistory(details){__j4Order("history",{tab:details?.tabId,document:__j4RequestHash(details?.documentId),target:__j4RequestHash(target(details?.url)),pending:[...requests.values()].filter(r=>r.tabId===details?.tabId).slice(0,8).map(r=>({request:__j4RequestHash(r.requestId),document:__j4RequestHash(r.documentId),target:__j4RequestHash(targetOf(r)),accepted:r.accepted===true,retained:r.historyRetained===true,receipt:!!r.document.receipt,epochCurrent:r.epoch===r.document.epoch}))});');
  inject('request.epoch=document.epoch;request.accepted=true;diagnostic(\'request-prepared\');return true;','request.epoch=document.epoch;request.accepted=true;diagnostic(\'request-prepared\');__j4Order("prepared",{tab:request.tabId,document:__j4RequestHash(request.documentId),request:__j4RequestHash(request.requestId),target:__j4RequestHash(targetOf(request))});return true;');
  inject('requests.set(request.requestId,request);','requests.set(request.requestId,request);__j4Order("queued",{tab:request.tabId,document:__j4RequestHash(request.documentId),request:__j4RequestHash(request.requestId),target:__j4RequestHash(targetOf(request))});');
  inject('function send(details){','function send(details){__j4Order("send",{active,valid:!!validDetails(details),conversation:!!requestConversation(details?.url),project:!!project(details?.url,true),request:__j4RequestHash(details?.requestId)});');
  inject('function complete(details){','function complete(details){__j4Order("complete",{active,valid:!!validDetails(details),tracked:requests.has(details?.requestId),request:__j4RequestHash(details?.requestId)});');
  inject('function invalidateTab(tabId){','function invalidateTab(tabId){__j4Order("invalidate-tab",{active,documents:documents.size,requests:requests.size});');
  inject('function invalidateCommitted(details){','function invalidateCommitted(details){__j4Order("invalidate-committed",{active,commitDocumentSupplied:typeof details?.documentId==="string",sameDocument:[...documents.values()].some(d=>d.tabId===details?.tabId&&d.documentId===details?.documentId),sameRequestDocument:[...requests.values()].some(r=>r.tabId===details?.tabId&&r.documentId===details?.documentId),documents:documents.size,requests:requests.size});');
  inject('r.commitRetained=true;r.historyTargetURL=details.url;r.epoch=r.document.epoch;','r.commitRetained=true;r.historyTargetURL=details.url;r.epoch=r.document.epoch;__j4Order("commit-document-preserved",{preserved:true,accepted:r.accepted===true});');
  inject('function stop(){if(!active)return;','function stop(){__j4Order("stop",{active});if(!active)return;');
  inject('r.document.receipt=receipt;','__j4Order("receipt",{request:__j4RequestHash(r.requestId)});r.document.receipt=receipt;');
  inject('for(const [event,listener,extra]of listeners)extra?event.addListener(listener,filter,extra):event.addListener(listener,filter);','for(const [event,listener,extra]of listeners)extra?event.addListener(listener,filter,extra):event.addListener(listener,filter);__j4Order("listeners-registered",{active});');
 }else if(path===J4_ORDER_PATHS[1]){
  inject('if(replacement)contextObserver?.invalidateCommitted(details);','if(replacement){__j4Order("committed",{top:details.frameId===0});contextObserver?.invalidateCommitted(details);}');
 }else if(path===J4_ORDER_PATHS[2]){
  inject("{abort();onPending();return;}","{__j4Order('delivery-pending',{active,associationPending:!!pending});abort();onPending();return;}");
  inject("{onReady();return;}","{__j4Order('delivery-ready',{active,associationPending:!!pending});onReady();return;}");
 }else if(path===J4_ORDER_PATHS[3]){
  inject(' function dispose(s,keepObservation=false){'," function __j4State(stage){try{__j4Order(stage,{epoch,run:current?.run,routeEpoch:current?.binding?.routeEpoch,document:__j4DocumentHash(current?.binding?.browserDocumentId),enabled,ready:current?.ready===true,scopePresent:!!current?.scopeKey,readyPending:current?.contextReadyPending===true,resumeAllowed:contextResumeAllowed});}catch{}}\n function dispose(s,keepObservation=false){");
  for(const [anchor,stage]of [["function stop(){recoveryResume=null;recoveryBlocked=null;nativeUseIntent=null;contextWaitSuspended=false;verificationWaitURL=null;contextResumeAllowed=false;",'stop'],["function rebind(s,initialMode=null,expectedScope=null,freshInstant=false){",'rebind'],["function contextPending(preserveObservation=false){",'context-pending'],["function contextReady(){",'context-ready']])inject(anchor,anchor.replace('{',"{__j4State('"+stage+"');"));
  inject('current=s;doc.defaultView.addEventListener',"current=s;__j4State('begin');doc.defaultView.addEventListener");
  inject('s.scopeKey=auth.scopeKey;s.ackProjects',"s.scopeKey=auth.scopeKey;__j4State('auth-verified');s.ackProjects");
  inject("if(exactHostRecord(m,['type'])&&m.type==='HOST_DOCUMENT_INVALIDATED'){rebind(s);return;}","if(exactHostRecord(m,['type'])&&m.type==='HOST_DOCUMENT_INVALIDATED'){__j4State('delivery-invalidated');rebind(s);return;}");
  inject("reportStartup(handle?'ready':'surface-failed');","reportStartup(handle?'ready':'surface-failed');if(handle)__j4State('mount-ready');");
 }else throw Error('j4-order-path');
 return (J4_ORDER_PATHS.indexOf(path)>=2?contentRecorder:recorder)+out;
}
export async function createJ4LifecycleOrderTracePackage(source,destination,{ramOnly=false,reenableOwner=false}={}){
 if(verifyHost(source).status!=='OFFLINE_HOST_RECONSTRUCTION')throw Error('j4-lifecycle-order-trace-offline-only');await cp(source,destination,{recursive:true,force:false,errorOnExist:true});const changes=[];
 for(const path of (reenableOwner?J4_ORDER_PATHS.slice(0,2):J4_ORDER_PATHS)){const original=await readFile(join(source,path),'utf8'),modified=reenableOwner?instrumentJ4ReenableOwner(path,original):instrumentJ4LifecycleOrderSource(path,original,{ramOnly});await writeFile(join(destination,path),modified);changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(modified)});}
 const compiled=compileClassicWorker(destination);for(const [path,modified]of [['extension/worker.mjs',compiled.entry],['extension/classic-runtime.js',compiled.runtime]]){const original=await readFile(join(source,path),'utf8');await writeFile(join(destination,path),modified);changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(modified)});}
 const receipt={kind:reenableOwner?J4_REENABLE_TRACE_KIND:'DIAGNOSTIC_ONLY_J4_LIFECYCLE_ORDER',unpacked:destination,ramOnly,changes};await verifyJ4LifecycleOrderTracePackage(receipt);return receipt;
}
export async function verifyJ4LifecycleOrderTracePackage(receipt){
 if(receipt.kind===J4_REENABLE_TRACE_KIND){const paths=['src/runtime/browser-request-context.mjs','src/runtime/host-browser-bootstrap.mjs','extension/worker.mjs','extension/classic-runtime.js'];if(receipt.changes?.length!==4||new Set(receipt.changes.map(c=>c.path)).size!==4||receipt.changes.some(c=>!paths.includes(c.path)))throw Error('j4-owner-trace-changed-paths');}
 const info=JSON.parse(await readFile(join(receipt.unpacked,'build-manifest.json'),'utf8'));if(info.status!=='OFFLINE_HOST_RECONSTRUCTION'||!['DIAGNOSTIC_ONLY_J4_LIFECYCLE_ORDER',J4_REENABLE_TRACE_KIND].includes(receipt.kind))throw Error('j4-lifecycle-order-trace-invalid-package');
 for(const [path,expected]of Object.entries(info.files)){const changed=receipt.changes.find(change=>change.path===path);if(changed&&changed.originalSha256!==expected)throw Error('j4-lifecycle-order-trace-original-hash');if(hash(await readFile(join(receipt.unpacked,path)))!==(changed?.instrumentedSha256??expected))throw Error('j4-lifecycle-order-trace-package-changed');}
 const compiled=compileClassicWorker(receipt.unpacked);if(await readFile(join(receipt.unpacked,'extension/worker.mjs'),'utf8')!==compiled.entry||await readFile(join(receipt.unpacked,'extension/classic-runtime.js'),'utf8')!==compiled.runtime)throw Error('j4-lifecycle-order-trace-classic-mismatch');return true;
}
