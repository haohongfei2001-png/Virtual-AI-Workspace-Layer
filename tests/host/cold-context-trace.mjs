import {cp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
// Offline test-package instrumentation only. No getters, network, authority,
// response changes, timers, or unbounded event/credential retention.
const recorder=`const __c2Trace=(stage,fields={})=>{try{const a=globalThis.__vaiwlColdTrace??= [];if(a.length<160)a.push({seq:a.length,at:Date.now(),stage,...Object.fromEntries(Object.entries(fields).slice(0,12).map(([k,v])=>[k,typeof v==="string"?v.slice(0,160):typeof v==="boolean"||typeof v==="number"?v:null]))});}catch{}};\n`;
function replaceOnce(source,from,to){if(source.split(from).length!==2)throw Error('cold-trace-anchor-mismatch:'+from.slice(0,70));return source.replace(from,to);}
export function instrumentColdSource(path,source){
 let out=source;
 const inject=(a,b)=>{out=replaceOnce(out,a,b);};
 if(path==='src/runtime/browser-request-context.mjs'){
  inject('function drop(document,reason){','function drop(document,reason){__c2Trace("receipt-drop",{reason,epoch:document.epoch});');
  inject('function send(details){','function send(details){__c2Trace("send-enter",{requestId:details?.requestId,documentId:details?.documentId,valid:validDetails(details)});');
  inject('requests.set(request.requestId,request);','requests.set(request.requestId,request);__c2Trace("send-admitted",{requestId:request.requestId,epoch:request.epoch,conflicted:request.conflicted===true});');
  inject('.then(([frame,tab])=>{','.then(([frame,tab])=>{__c2Trace("prepare-frame",{requestId:request.requestId,sameDocument:frame?.documentId===request.documentId,frameType:frame?.frameType,lifecycle:frame?.documentLifecycle,incognito:tab?.incognito,conflicted:request.conflicted===true});');
  inject('request.epoch=document.epoch;request.accepted=true;return true;','request.epoch=document.epoch;request.accepted=true;__c2Trace("prepared",{requestId:request.requestId,epoch:request.epoch});return true;');
  inject('function complete(details){','function complete(details){__c2Trace("complete-enter",{requestId:details?.requestId,tracked:requests.has(details?.requestId),statusCode:details?.statusCode,fromCache:details?.fromCache});');
  inject('r.document.receipt=receipt;','__c2Trace("receipt-issued",{requestId:r.requestId,epoch:r.epoch});r.document.receipt=receipt;');
  inject('async function verify(frame,{signal}={}){','async function verify(frame,{signal}={}){__c2Trace("verify-enter",{documentId:frame?.documentId,hasReceipt:!!documents.get(key(frame))?.receipt,aborted:signal?.aborted===true});');
  inject('for(const [event,listener,extra]of listeners)extra?event.addListener(listener,filter,extra):event.addListener(listener,filter);','for(const [event,listener,extra]of listeners)extra?event.addListener(listener,filter,extra):event.addListener(listener,filter);__c2Trace("listeners-registered");');
 }else if(['src/runtime/host-worker-runtime.mjs','src/runtime/host-browser-bootstrap.mjs'].includes(path)){
  out=out.replaceAll('chrome.tabs.sendMessage(', '__c2Send(');
  const anchor=path.endsWith('/host-browser-bootstrap.mjs')?' const enabled=scopeProfile.browserRequestContext===true;':' const policy=createURLPolicy(';
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
 return {unpacked:destination,kind:'PASSIVE_OFFLINE_PACKAGE_COPY',limit:160,changes,authorityChanged:false,originalPackageUntouched:true};
}

export async function verifyColdTracePackage(trace){
 const info=JSON.parse(await readFile(join(trace.unpacked,'build-manifest.json'),'utf8'));
 for(const [path,expected] of Object.entries(info.files)){
  const changed=trace.changes.find(row=>row.path===path);
  if(changed&&changed.originalSha256!==expected)throw Error('cold-trace-original-hash-mismatch');
  if(hash(await readFile(join(trace.unpacked,path)))!==(changed?.instrumentedSha256??expected))throw Error('cold-trace-package-changed:'+path);
 }
 return true;
}
