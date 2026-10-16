import {cp,readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';import {verifyHost} from '../../extension/package.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const J3_CONTEXT_PATHS=['src/runtime/browser-request-context.mjs','src/runtime/scope-authority.mjs','src/host/content-session.mjs'];
const recorder=`const __j3ContextTrace=(stage,fields={})=>{try{const rows=globalThis.__vaiwlJ3ContextTrace??=[];if(rows.length>=128)return;const row={stage,at:Date.now()};for(const [key,value]of Object.entries(fields))if(typeof value==='boolean'||typeof value==='number'||['HOST_HELLO','HOST_REFRESH','verified','ambiguous','unverified','pending','scope-not-verified','current-context-unproven'].includes(value))row[key]=value;rows.push(row);console.log('J3_CONTEXT_TRACE '+JSON.stringify(row));}catch{}};\n`;
function once(source,from,to){if(source.split(from).length!==2)throw Error('j3-context-trace-anchor-mismatch');return source.replace(from,to);}
export function instrumentJ3ContextSource(path,source,{ramOnly=false}={}){
 if(source.includes('__j3ContextTrace'))throw Error('j3-context-trace-already-instrumented');let out=source;
 if(path===J3_CONTEXT_PATHS[0]){
  out=once(out,' function send(details){',' function send(details){__j3ContextTrace("browser-send",{valid:!!validDetails(details),conversation:!!requestConversation(details.url),project:!!project(details.url,true)});');
  out=once(out,' function complete(details){',' function complete(details){__j3ContextTrace("browser-complete",{known:requests.has(details?.requestId),status:details?.statusCode,cached:details?.fromCache===true});');
  out=once(out,'r.document.receipt=receipt;','__j3ContextTrace("browser-receipt-created");r.document.receipt=receipt;');
  out=once(out,'const receipt=documents.get(key(frame))?.receipt;if(signal?.aborted','const receipt=documents.get(key(frame))?.receipt;__j3ContextTrace("browser-verify",{receipt:!!receipt,current:isCurrent(frame,receipt)});if(signal?.aborted');
  out=once(out,'   if(!current()||answer?.challenge!==challenge','   __j3ContextTrace("browser-association",{current:current(),answer:!!answer,challenge:answer?.challenge===challenge,url:answer?.actualURL===receipt.actualURL,conversation:answer?.conversationId===receipt.conversationId,body:answer?.association==="explicit-body-id"});if(!current()||answer?.challenge!==challenge');
  out=once(out,' function stop(){if(!active)return;', ' __j3ContextTrace("browser-listeners-installed");\n function stop(){if(!active)return;');
 }else if(path===J3_CONTEXT_PATHS[1]){
  out=once(out,'   if(!scope){entry.result=','   __j3ContextTrace("scope-selection",{contextReceipt:!!contextReceipt,scope:!!scope});if(!scope){entry.result=');
 }else if(path===J3_CONTEXT_PATHS[2]){
  if(ramOnly){
   out=once(out,"if(contextRecovery===true&&exactHostRecord(hello",'__j3ContextTrace("content-hello",{binding:!!hello?.binding,ok:hello?.ok===true,superseded:hello?.reason==="invalidated-during-check"});if(contextRecovery===true&&exactHostRecord(hello');
   out=once(out,"if(auth?.state!=='verified')",'__j3ContextTrace("content-auth",{state:auth?.state});if(auth?.state!=="verified")');
   out=once(out,' function contextPending(){',' function contextPending(){__j3ContextTrace("content-pending",{enabled,allowed:contextResumeAllowed});');
   out=once(out,' function contextReady(){',' function contextReady(){__j3ContextTrace("content-ready",{enabled,allowed:contextResumeAllowed});');
  }else{
  out=once(out,'return runtime.sendMessage(message);','__j3ContextTrace("content-request",{type:message.type});return runtime.sendMessage(message).then(result=>{__j3ContextTrace("content-response",{type:message.type,state:result?.state,binding:!!result?.binding,ok:result?.ok===true});return result;});');
  }
  out=once(out,'  }catch(error){\n   if(current===s){','  }catch(error){\n   __j3ContextTrace("content-begin-error",{reason:error?.message,sameSession:current===s,routeSame:doc.location.href===s.url});if(current===s){');
 }else throw Error('j3-context-trace-path');
 return (ramOnly?recorder.replace("console.log('J3_CONTEXT_TRACE '+JSON.stringify(row));",''):recorder)+out;
}
export async function createJ3ContextTracePackage(source,destination,{ramOnly=false}={}){
 if(verifyHost(source).status!=='OFFLINE_HOST_RECONSTRUCTION')throw Error('j3-context-trace-offline-only');await cp(source,destination,{recursive:true,force:false,errorOnExist:true});const changes=[];
 for(const path of J3_CONTEXT_PATHS){const original=await readFile(join(source,path),'utf8'),modified=instrumentJ3ContextSource(path,original,{ramOnly});await writeFile(join(destination,path),modified);changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(modified)});}
 const compiled=compileClassicWorker(destination);for(const [path,modified]of [['extension/worker.mjs',compiled.entry],['extension/classic-runtime.js',compiled.runtime]]){const original=await readFile(join(source,path),'utf8');await writeFile(join(destination,path),modified);changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(modified)});}
 const receipt={kind:'DIAGNOSTIC_ONLY_J3_CONTEXT_TIMING',unpacked:destination,ramOnly,changes};await verifyJ3ContextTracePackage(receipt);return receipt;
}
export async function verifyJ3ContextTracePackage(receipt){
 const info=JSON.parse(await readFile(join(receipt.unpacked,'build-manifest.json'),'utf8'));if(info.status!=='OFFLINE_HOST_RECONSTRUCTION'||receipt.kind!=='DIAGNOSTIC_ONLY_J3_CONTEXT_TIMING')throw Error('j3-context-trace-invalid-package');
 for(const [path,expected]of Object.entries(info.files)){const changed=receipt.changes.find(change=>change.path===path);if(changed&&changed.originalSha256!==expected)throw Error('j3-context-trace-original-hash');if(hash(await readFile(join(receipt.unpacked,path)))!==(changed?.instrumentedSha256??expected))throw Error('j3-context-trace-package-changed');}
 const compiled=compileClassicWorker(receipt.unpacked);if(await readFile(join(receipt.unpacked,'extension/worker.mjs'),'utf8')!==compiled.entry||await readFile(join(receipt.unpacked,'extension/classic-runtime.js'),'utf8')!==compiled.runtime)throw Error('j3-context-trace-classic-mismatch');return true;
}
