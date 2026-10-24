import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
import {cp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
// Offline test-package instrumentation only. No getters, network, authority,
// response changes, timers, or unbounded event/credential retention.
const recorder=`const __c2Trace=(stage,fields={})=>{try{const a=globalThis.__vaiwlColdTrace??= [];if(a.length<160)a.push({seq:a.length,at:Date.now(),stage,...Object.fromEntries(Object.entries(fields).slice(0,12).map(([k,v])=>[k,typeof v==="string"?v.slice(0,160):typeof v==="boolean"||typeof v==="number"?v:null]))});else globalThis.__vaiwlColdTraceDropped=Math.min(1000000,(globalThis.__vaiwlColdTraceDropped??0)+1);}catch{}};\n`;
function replaceOnce(source,from,to){if(source.split(from).length!==2)throw Error('cold-trace-anchor-mismatch:'+from.slice(0,70));return source.replace(from,to);}
export function instrumentColdSource(path,source){
 let out=source;
 const inject=(a,b)=>{out=replaceOnce(out,a,b);};
 if(path==='src/runtime/browser-request-context.mjs'){
  inject('function drop(document,reason){','function drop(document,reason){__c2Trace("receipt-drop",{reason,tabId:document.tabId,documentId:document.documentId,epoch:document.epoch,hadReceipt:!!document.receipt});');
  inject('function send(details){','function send(details){__c2Trace("send-enter",{requestId:details?.requestId,documentId:details?.documentId,valid:validDetails(details)});');
  // Record only inside the original rejection branch. Never re-evaluate the
  // stateful clock fence or add a browser lookup to explain a failed request.
  const reject=(guard,reason)=>inject(guard+'return;',guard+'{__c2Trace("send-rejected",{reason:"'+reason+'"});return;}');
  reject('if(!validDetails(details))','invalid-details');
  reject('if(!conversationId&&!projectId)','unsupported-endpoint');
  reject('if(!Array.isArray(headers)||headers.length>256)','invalid-headers');
  reject("if(['purpose','sec-purpose','x-purpose'].includes(name)&&typeof h.value==='string'&&/prefetch|prerender/i.test(h.value))",'prefetch');
  reject("if(count!==1||typeof contextId!=='string'||!contextId||contextId.length>256||/[\\s\\u0000-\\u001f\\u007f]/.test(contextId))",'invalid-account-header');
  reject('if(requests.has(details.requestId)||closedRequests.has(details.requestId)||requests.size>=maxRequests||closedRequests.size>=maxRequests*4)','request-duplicate-or-capacity');
  reject('if(documents.size>=maxDocuments)','document-capacity');
  inject('function invalidateCommitted(details){','function invalidateCommitted(details){__c2Trace("navigation-committed",{documentId:details?.documentId});');
  inject('function invalidateHistory(details){','function invalidateHistory(details){__c2Trace("navigation-history",{documentId:details?.documentId});');
  inject('function stop(){','function stop(){__c2Trace("owner-stop",{active});');
  inject('if(!frameMatches(frame,request)){','if(!frameMatches(frame,request)){__c2Trace("prepare-rejected",{reason:"frame-target"});');
  inject('if(request.conflicted||request.epoch!==document.epoch||tab?.id!==request.tabId||tab.incognito!==false||!active||requests.get(request.requestId)!==request||documents.get(key(request))!==document||!clockOK(request,6000))return false;',
   'if(request.conflicted||request.epoch!==document.epoch||tab?.id!==request.tabId||tab.incognito!==false||!active||requests.get(request.requestId)!==request||documents.get(key(request))!==document||!clockOK(request,6000)){__c2Trace("prepare-rejected",{reason:"lifecycle-epoch-or-deadline"});return false;}');
  inject('if(!validDetails(details)||details.url!==r.url||details.documentId!==r.documentId||details.tabId!==r.tabId||details.statusCode!==200||details.fromCache===true){fail(details);return;}',
   'if(!validDetails(details)||details.url!==r.url||details.documentId!==r.documentId||details.tabId!==r.tabId||details.statusCode!==200||details.fromCache===true){__c2Trace("complete-rejected",{reason:"invalid-completion"});fail(details);return;}');
  inject('if(!prepared||r.conflicted||!active||requests.get(r.requestId)!==r||documents.get(key(r))!==r.document||r.epoch!==r.document.epoch||!clockOK(r,6000))return;',
   'if(!prepared||r.conflicted||!active||requests.get(r.requestId)!==r||documents.get(key(r))!==r.document||r.epoch!==r.document.epoch||!clockOK(r,6000)){__c2Trace("complete-rejected",{reason:"preparation-epoch-or-deadline",prepared});return;}');
  inject('requests.set(request.requestId,request);','requests.set(request.requestId,request);__c2Trace("send-admitted",{requestId:request.requestId,epoch:request.epoch,conflicted:request.conflicted===true});');
  inject('.then(([frame,tab])=>{','.then(([frame,tab])=>{__c2Trace("prepare-frame",{requestId:request.requestId,sameDocument:frame?.documentId===request.documentId,frameMatches:frameMatches(frame,request),requestCurrent:requests.get(request.requestId)===request,documentCurrent:documents.get(key(request))===document,frameType:frame?.frameType,lifecycle:frame?.documentLifecycle,incognito:tab?.incognito,conflicted:request.conflicted===true});');
  inject('request.epoch=document.epoch;request.accepted=true;return true;','request.epoch=document.epoch;request.accepted=true;__c2Trace("prepared",{requestId:request.requestId,epoch:request.epoch});return true;');
  inject('function complete(details){','function complete(details){__c2Trace("complete-enter",{requestId:details?.requestId,tracked:requests.has(details?.requestId),statusCode:details?.statusCode,fromCache:details?.fromCache});');
  inject('if(r.conflicted||tab?.id!==r.tabId||tab.incognito!==false||!active||requests.get(r.requestId)!==r||r.epoch!==r.document.epoch||!clockOK(r,6000)||!frameMatches(frame,r))return;', '__c2Trace("complete-frame",{requestId:r.requestId,frameMatches:frameMatches(frame,r),requestCurrent:requests.get(r.requestId)===r,epochCurrent:r.epoch===r.document.epoch,conflicted:r.conflicted===true});if(r.conflicted||tab?.id!==r.tabId||tab.incognito!==false||!active||requests.get(r.requestId)!==r||r.epoch!==r.document.epoch||!clockOK(r,6000)||!frameMatches(frame,r)){__c2Trace("complete-rejected",{reason:"final-frame-epoch-or-deadline"});return;}');
  inject('r.document.receipt=receipt;','__c2Trace("receipt-issued",{requestId:r.requestId,epoch:r.epoch});r.document.receipt=receipt;');
  inject('async function verify(frame,{signal}={}){','async function verify(frame,{signal}={}){__c2Trace("verify-enter",{documentId:frame?.documentId,hasReceipt:!!documents.get(key(frame))?.receipt,aborted:signal?.aborted===true});');
  inject('for(const [event,listener,extra]of listeners)extra?event.addListener(listener,filter,extra):event.addListener(listener,filter);','for(const [event,listener,extra]of listeners)extra?event.addListener(listener,filter,extra):event.addListener(listener,filter);__c2Trace("listeners-registered");');
 }else if(['src/runtime/host-worker-runtime.mjs','src/runtime/host-browser-bootstrap.mjs'].includes(path)){
  out=out.replaceAll('chrome.tabs.sendMessage(', '__c2Send(');
  const anchor=path.endsWith('/host-browser-bootstrap.mjs')?' const enabled=scopeProfile.browserRequestContext===true,projectRequestContext=scopeProfile.projectRequestContext??null,conversationRequestContext=scopeProfile.conversationRequestContext??null;':' const policy=createURLPolicy(';
  inject(anchor,' const __c2Send=(...args)=>{const type=args[1]?.type;__c2Trace("outgoing",{type});const p=chrome.tabs.sendMessage(...args);p.then(r=>__c2Trace("outgoing-result",{type,hasResult:r!=null,association:r?.association,ok:r?.ok}),()=>__c2Trace("outgoing-rejected",{type}));return p;};\n'+anchor);
  if(path.endsWith('/host-browser-bootstrap.mjs'))return recorder+out;
  inject('const message=(value,sender,reply)=>{','const message=(value,sender,reply)=>{__c2Trace("incoming",{type:value?.type,documentId:sender?.documentId});');
  inject('.then(result=>{if(active)reply(result);}', '.then(result=>{__c2Trace("incoming-result",{type:value?.type,state:result?.state,reason:result?.reason,ok:result?.ok});if(active)reply(result);}');
 }else throw Error('unknown-cold-trace-source');
 return recorder+out;
}
export async function createColdTracePackage(source,destination){
 await cp(source,destination,{recursive:true,errorOnExist:true,force:false});
 const changes=[];
 for(const path of ['src/runtime/browser-request-context.mjs','src/runtime/host-browser-bootstrap.mjs','src/runtime/host-worker-runtime.mjs']){
  const original=await readFile(join(source,path),'utf8'),instrumented=instrumentColdSource(path,original);
  await writeFile(join(destination,path),instrumented);changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(instrumented)});
 }
 const compiled=compileClassicWorker(destination);
 for(const [path,instrumented] of [['extension/worker.mjs',compiled.entry],['extension/classic-runtime.js',compiled.runtime]]){
  const original=await readFile(join(source,path),'utf8');await writeFile(join(destination,path),instrumented);
  changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(instrumented)});
 }
 return {unpacked:destination,kind:'PASSIVE_OFFLINE_PACKAGE_COPY',limit:160,changes,authorityChanged:false,originalPackageUntouched:true};
}

export async function verifyColdTracePackage(trace){
 const info=JSON.parse(await readFile(join(trace.unpacked,'build-manifest.json'),'utf8'));
 for(const path of ['extension/worker.mjs','extension/classic-runtime.js'])if(!Object.hasOwn(info.files,path)||trace.changes.filter(row=>row.path===path).length!==1)throw Error('cold-trace-manifest-missing-generated');
 for(const [path,expected] of Object.entries(info.files)){
  const changed=trace.changes.find(row=>row.path===path);
  if(changed&&changed.originalSha256!==expected)throw Error('cold-trace-original-hash-mismatch');
  if(hash(await readFile(join(trace.unpacked,path)))!==(changed?.instrumentedSha256??expected))throw Error('cold-trace-package-changed:'+path);
 }
 const compiled=compileClassicWorker(trace.unpacked);if(await readFile(join(trace.unpacked,'extension/worker.mjs'),'utf8')!==compiled.entry||await readFile(join(trace.unpacked,'extension/classic-runtime.js'),'utf8')!==compiled.runtime)throw Error('cold-trace-worker-build-mismatch');
 return true;
}
