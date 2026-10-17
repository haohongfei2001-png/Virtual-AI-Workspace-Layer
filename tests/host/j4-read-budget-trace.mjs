import {cp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const J4_READ_TRACE_PATHS=['src/runtime/current-metadata-reader.mjs','src/runtime/host-entry-calibration.mjs','src/runtime/session-provider.mjs'];
// All identifiers stay in bounded private maps; neither raw keys nor signal
// associations are enumerable in the worker collector's JSON snapshot.
export const J4_READ_TRACE_RECORDER=`
const __j4ReadTrace=globalThis.__j4ReadBudgetTrace??=(()=>{
 const maps=new Map(),links=new WeakMap();let ordinal=0;
 const state={kind:'DIAGNOSTIC_ONLY_J4_READ_BUDGET',generation:globalThis.crypto?.randomUUID?.()??String(Date.now()),events:[],dropped:0};
 const stages=['boot','reader-start','reader-preempt','reader-join','reader-reject','reader-context','reader-terminal','entry-start','entry-proof','entry-terminal','provider-start','provider-terminal','request-start','request-reserved','request-response'];
 const numeric=['attempt','provider','proof','scope','document','producer','conversation','bodyEpoch','wantedCount','window'];
 const emit=(stage,fields={})=>{try{if(!stages.includes(stage))return;const row={stage,seq:++ordinal};for(const key of numeric)if(Number.isSafeInteger(fields[key])&&fields[key]>=0)row[key]=fields[key];for(const key of ['ok','present','budgetWindowPresent'])if(typeof fields[key]==='boolean')row[key]=fields[key];if(['foreground','history'].includes(fields.entryKind))row.entryKind=fields.entryKind;if(['ordinary','calibration','identity','current'].includes(fields.mode))row.mode=fields.mode;if(['session','accounts','detail'].includes(fields.endpoint))row.endpoint=fields.endpoint;if(['budget','retry-budget','aborted','timeout','other'].includes(fields.error))row.error=fields.error;if(state.events.length===256){state.events.shift();state.dropped++;}state.events.push(row);}catch{}};
 const id=(category,value)=>{try{if(!['proof','scope','document','producer','conversation','window'].includes(category)||typeof value!=='string'||value.length>2048)return 0;let map=maps.get(category);if(!map)maps.set(category,map=new Map());if(!map.has(value)){if(map.size>=256)return 0;map.set(value,map.size+1);}return map.get(value);}catch{return 0;}};
 Object.defineProperties(state,{emit:{value:emit},id:{value:id},next:{value:()=>++ordinal},link:{value:(signal,fields)=>{try{links.set(signal,fields);}catch{}}},linked:{value:signal=>{try{return links.get(signal)??{};}catch{return {};}}}});emit('boot');return state;
})();
`;
export const J4_READ_TRACE_ANCHORS={
 [J4_READ_TRACE_PATHS[0]]:[
  ["  if(busy&&busy.calibration&&!calibration){busy.abort.abort();busy=null;}","  const __j4Attempt=__j4ReadTrace.next(),__j4Mode=calibration?'calibration':'ordinary';__j4ReadTrace.emit('reader-start',{attempt:__j4Attempt,mode:__j4Mode,proof:__j4ReadTrace.id('proof',proofId),window:__j4ReadTrace.id('window',budgetWindow===undefined?null:String(budgetWindow)),budgetWindowPresent:budgetWindow!==undefined});if(busy&&busy.calibration&&!calibration){__j4ReadTrace.emit('reader-preempt',{attempt:__j4Attempt,mode:__j4Mode});busy.abort.abort();busy=null;}"],
  ["  if(busy)return !calibration&&!busy.calibration&&busy.proofId===proofId&&busy.budgetWindow===budgetWindow?busy.promise:Promise.reject(Error('current-metadata-busy'));","  if(busy){const __j4Join=!calibration&&!busy.calibration&&busy.proofId===proofId&&busy.budgetWindow===budgetWindow;__j4ReadTrace.emit(__j4Join?'reader-join':'reader-reject',{attempt:__j4Attempt,mode:__j4Mode,proof:__j4ReadTrace.id('proof',proofId)});return __j4Join?busy.promise:Promise.reject(Error('current-metadata-busy'));}"],
  ["   const conversationId=context.conversationId,bodyEpoch=context.bodyEpoch,principalTransport=context.providerTransport,wanted=new Set(context.messageIds);","   const conversationId=context.conversationId,bodyEpoch=context.bodyEpoch,principalTransport=context.providerTransport,wanted=new Set(context.messageIds);__j4ReadTrace.emit('reader-context',{attempt:__j4Attempt,mode:__j4Mode,proof:__j4ReadTrace.id('proof',proofId),scope:__j4ReadTrace.id('scope',JSON.stringify([context.scope?.accountId,context.scope?.organizationId])),document:__j4ReadTrace.id('document',context.documentToken),producer:__j4ReadTrace.id('producer',context.producerToken),conversation:__j4ReadTrace.id('conversation',conversationId),bodyEpoch,wantedCount:wanted.size});"],
  ["    let result;try{result=await Promise.race([track(()=>readCurrent(","    __j4ReadTrace.link(signal,{attempt:__j4Attempt,mode:__j4Mode});let result;try{result=await Promise.race([track(()=>readCurrent("],
  ["  attempt.promise=Promise.resolve().then(()=>withCurrent(","  let __j4ReaderOK=false;attempt.promise=Promise.resolve().then(()=>withCurrent("],
  ["  })).then(result=>{check();return result;}).finally(()=>{attempt.abort.abort();if(busy===attempt)busy=null;});","  })).then(result=>{check();__j4ReaderOK=true;return result;}).finally(()=>{__j4ReadTrace.emit('reader-terminal',{attempt:__j4Attempt,mode:__j4Mode,ok:__j4ReaderOK});attempt.abort.abort();if(busy===attempt)busy=null;});"],
 ],
 [J4_READ_TRACE_PATHS[1]]:[
  ["  const attempt={active:true,abort:new AbortController(),started:elapsedNow()};busy=attempt;","  const attempt={active:true,abort:new AbortController(),started:elapsedNow()};busy=attempt;const __j4Entry=__j4ReadTrace.next();__j4ReadTrace.emit('entry-start',{attempt:__j4Entry,mode:'calibration',entryKind:message.kind});"],
  ["   const proof=observations.currentProofForParent(context);if(!proof)return failure();","   const proof=observations.currentProofForParent(context);__j4ReadTrace.emit('entry-proof',{attempt:__j4Entry,mode:'calibration',present:!!proof,proof:__j4ReadTrace.id('proof',proof)});if(!proof)return failure();"],
  ["  finally{attempt.active=false;attempt.abort.abort();if(busy===attempt)busy=null;}","  finally{__j4ReadTrace.emit('entry-terminal',{attempt:__j4Entry,mode:'calibration'});attempt.active=false;attempt.abort.abort();if(busy===attempt)busy=null;}"],
 ],
 [J4_READ_TRACE_PATHS[2]]:[
  ["  let budgetWindow=current?.budgetWindow??null;","  let budgetWindow=current?.budgetWindow??null;const __j4Provider=__j4ReadTrace.next(),__j4Linked=__j4ReadTrace.linked(signal),__j4ProviderFields={...__j4Linked,provider:__j4Provider,mode:__j4Linked.mode??(current?'current':'identity'),scope:current?__j4ReadTrace.id('scope',JSON.stringify([current.expectedPrincipalKey,current.expectedContextKey])):0,conversation:__j4ReadTrace.id('conversation',current?.conversationId),window:__j4ReadTrace.id('window',budgetWindow===null?null:String(budgetWindow)),budgetWindowPresent:budgetWindow!==null};let __j4ProviderOK=false;__j4ReadTrace.emit('provider-start',__j4ProviderFields);"],
  ["  const json=async(path,token,{raw=false,contextId=null}={})=>{","  const json=async(path,token,{raw=false,contextId=null}={})=>{const __j4Endpoint=path==='/api/auth/session'?'session':path==='/backend-api/accounts/check/v4-2023-04-27'?'accounts':'detail';__j4ReadTrace.emit('request-start',{...__j4ProviderFields,endpoint:__j4Endpoint});"],
  ["budgetWindow=reservation.windowStartedAt;check();}","budgetWindow=reservation.windowStartedAt;check();__j4ProviderFields.window=__j4ReadTrace.id('window',String(budgetWindow));__j4ProviderFields.budgetWindowPresent=true;__j4ReadTrace.emit('request-reserved',{...__j4ProviderFields,endpoint:__j4Endpoint});}"],
  ["   return readSessionJSON(response,{target,raw,limit:","   __j4ReadTrace.emit('request-response',{...__j4ProviderFields,endpoint:__j4Endpoint});return readSessionJSON(response,{target,raw,limit:"],
  ["  try{return await withRequestDeadline(()=>Promise.race(","  try{const __j4Result=await withRequestDeadline(()=>Promise.race("],
  ["  })()]),{timeoutMs:6000,now:elapsedNow});}catch(error){const code=error?.message;","  })()]),{timeoutMs:6000,now:elapsedNow});__j4ProviderOK=true;return __j4Result;}catch(error){const code=error?.message;__j4ReadTrace.emit('provider-terminal',{...__j4ProviderFields,ok:false,error:code==='read-budget-exhausted'?'budget':code==='read-budget-retries-exhausted'?'retry-budget':code==='session-aborted'?'aborted':code==='request-timeout'?'timeout':'other'});"],
  ["}finally{combined.removeEventListener('abort',onAbort);controller.abort();}","}finally{if(__j4ProviderOK)__j4ReadTrace.emit('provider-terminal',{...__j4ProviderFields,ok:true});combined.removeEventListener('abort',onAbort);controller.abort();}"],
 ],
};
export function instrumentJ4ReadBudgetSource(path,source){
 if(source.includes('__j4ReadTrace'))throw Error('j4-read-trace-already-instrumented');const anchors=J4_READ_TRACE_ANCHORS[path];if(!anchors)throw Error('j4-read-trace-unknown-source');
 let out=source;for(const [before,after]of anchors){if(out.split(before).length!==2)throw Error('j4-read-trace-anchor-mismatch');out=out.replace(before,after);}return J4_READ_TRACE_RECORDER+out;
}
export async function createJ4ReadBudgetTracePackage(source,destination){
 await cp(source,destination,{recursive:true,errorOnExist:true,force:false});const changes=[];
 for(const path of J4_READ_TRACE_PATHS){const original=await readFile(join(source,path),'utf8'),instrumented=instrumentJ4ReadBudgetSource(path,original);await writeFile(join(destination,path),instrumented);changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(instrumented)});}
 const compiled=compileClassicWorker(destination);
 for(const [path,instrumented]of [['extension/worker.mjs',compiled.entry],['extension/classic-runtime.js',compiled.runtime]]){const original=await readFile(join(source,path),'utf8');await writeFile(join(destination,path),instrumented);changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(instrumented)});}
 const trace={kind:'DIAGNOSTIC_ONLY_J4_READ_BUDGET',unpacked:destination,limit:256,changes};await verifyJ4ReadBudgetTracePackage(trace);return trace;
}
export async function verifyJ4ReadBudgetTracePackage(trace){
 const info=JSON.parse(await readFile(join(trace.unpacked,'build-manifest.json'),'utf8'));
 for(const path of [...J4_READ_TRACE_PATHS,'extension/worker.mjs','extension/classic-runtime.js'])if(!Object.hasOwn(info.files,path)||trace.changes.filter(row=>row.path===path).length!==1)throw Error('j4-read-trace-missing-file');
 for(const [path,expected]of Object.entries(info.files)){const changed=trace.changes.find(row=>row.path===path);if(changed&&changed.originalSha256!==expected)throw Error('j4-read-trace-original-hash-mismatch');if(hash(await readFile(join(trace.unpacked,path)))!==(changed?.instrumentedSha256??expected))throw Error('j4-read-trace-package-changed');}
 const compiled=compileClassicWorker(trace.unpacked);if(await readFile(join(trace.unpacked,'extension/worker.mjs'),'utf8')!==compiled.entry||await readFile(join(trace.unpacked,'extension/classic-runtime.js'),'utf8')!==compiled.runtime)throw Error('j4-read-trace-worker-build-mismatch');return true;
}
