import {cp,readFile,writeFile,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
import {verifyHost} from '../../extension/package.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const FAULT_UNKNOWN_TRACE_KIND='DIAGNOSTIC_ONLY_FAULT_UNKNOWN';
export const FAULT_UNKNOWN_TRACE_PATHS=['src/runtime/session-provider.mjs','src/host/session-identity.mjs','src/host/conversation-metadata.mjs','src/runtime/current-metadata-reader.mjs','src/runtime/host-entry-calibration.mjs'];
export const FAULT_UNKNOWN_TRACE_RECORDER=`
const __fu=globalThis.__vaiwlFaultUnknownTrace??=(()=>{
 const signals=new WeakMap(),responses=new WeakMap();let serial=0,detail=0,parse=null;
 const state={kind:'DIAGNOSTIC_ONLY_FAULT_UNKNOWN',events:[],dropped:0,clock:'worker-performance-relative',timeOrigin:performance.timeOrigin};
 const stages=['entry-start','entry-abort','reader-start','reader-abort','signal-abort','execute-start','detail-dispatch','detail-response','body-eof','body-cleanup','protocol','parser-reject','execute-error','execute-cleanup'];
 const reasons=['invalid-conversation-metadata','conversation-identity-conflict','invalid-conversation-mapping','invalid-conversation-json','session-aborted','request-timeout','current-metadata-aborted','stale-body-proof','stale-calibration-entry','other'];
 const emit=(stage,fields={})=>{try{if(!stages.includes(stage))return;const row={seq:++serial,at:performance.now(),stage};for(const key of ['call','entry','reader','detail','bytes','status'])if(Number.isSafeInteger(fields[key])&&fields[key]>=0)row[key]=fields[key];for(const key of ['eof','alreadyAborted','mappingPresent'])if(typeof fields[key]==='boolean')row[key]=fields[key];if(['context','entry','attempt','provider','reader-preempt','reader-stop','reader-finally','entry-stop','entry-finally','provider-finally'].includes(fields.source))row.source=fields.source;if(['identity','current','calibration'].includes(fields.mode))row.mode=fields.mode;if(['EXPECTED_UNKNOWN_PROTOCOL','OTHER_PROTOCOL','NO_PROTOCOL'].includes(fields.protocolClass))row.protocolClass=fields.protocolClass;if(reasons.includes(fields.reason))row.reason=fields.reason;if(typeof fields.responseTag==='string'&&/^fxu-[a-f0-9]{32}-[1-9][0-9]{0,2}$/.test(fields.responseTag)&&Number(fields.responseTag.split('-').at(-1))<=256)row.responseTag=fields.responseTag;if(state.events.length>=256){state.dropped++;return;}state.events.push(row);}catch{}};
 Object.defineProperties(state,{emit:{value:emit},next:{value:()=>++serial},detail:{value:()=>++detail},link:{value:(signal,fields)=>{try{signals.set(signal,fields);}catch{}}},linked:{value:signal=>signals.get(signal)??{}},response:{value:(response,fields)=>{try{responses.set(response,fields);}catch{}}},responseFields:{value:response=>responses.get(response)??null},watch:{value:(signal,fields)=>{try{if(signal?.aborted)emit('signal-abort',{...fields,alreadyAborted:true});else signal?.addEventListener('abort',()=>emit('signal-abort',{...fields,alreadyAborted:false}),{once:true});}catch{}}},parse:{get:()=>parse,set:value=>{parse=value;}},reason:{value:error=>reasons.includes(error?.message)?error.message:'other'}});return state;
})();
`;
export function instrumentFaultUnknownSource(path,source){
 if(source.includes('__fu'))throw Error('fault-unknown-already-instrumented');let out=source;
 const inject=(before,after)=>{if(out.split(before).length!==2)throw Error('fault-unknown-anchor:'+path+':'+before);out=out.replace(before,after);};
 if(path===FAULT_UNKNOWN_TRACE_PATHS[0]){
  inject('  let budgetWindow=current?.budgetWindow??null,requestOrdinal=0;',"  let budgetWindow=current?.budgetWindow??null,requestOrdinal=0;const __f={...__fu.linked(signal),call:__fu.next(),mode:current?'current':'identity'};__fu.emit('execute-start',__f);__fu.watch(signal,{...__f,source:'attempt'});__fu.watch(controller.signal,{...__f,source:'provider'});");
  inject('   requestOrdinal++;const target=origin+path,response=await fetch(target,',"   requestOrdinal++;const __detail=raw?__fu.detail():0;if(raw){__f.detail=__detail;__fu.emit('detail-dispatch',__f);}const target=origin+path,response=await fetch(target,");
  inject('   return readSessionJSON(response,{target,raw,limit:',"   if(raw){__f.responseTag=response.headers.get('x-vaiwl-offline-response');__fu.emit('detail-response',{...__f,status:response.status});__fu.response(response,{...__f});}return readSessionJSON(response,{target,raw,limit:");
  inject("    let metadata;try{metadata=parseMetadata({conversationId:current.conversationId,principalId,payload:raw});}catch{throw Error('invalid-conversation-metadata');}","    let metadata;__fu.parse={...__f};try{metadata=parseMetadata({conversationId:current.conversationId,principalId,payload:raw});}catch(error){__fu.emit('parser-reject',{...__f,reason:__fu.reason(error)});throw Error('invalid-conversation-metadata');}finally{__fu.parse=null;}");
  inject('}catch(error){const code=error?.message;',"}catch(error){const code=error?.message;__fu.emit('execute-error',{...__f,reason:__fu.reason(error)});");
  inject("}finally{combined.removeEventListener('abort',onAbort);controller.abort();}","}finally{combined.removeEventListener('abort',onAbort);__fu.emit('execute-cleanup',{...__f,source:'provider-finally',alreadyAborted:combined.aborted});controller.abort();}");
 }else if(path===FAULT_UNKNOWN_TRACE_PATHS[1]){
  inject(" const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';"," const __f=__fu.responseFields(response);let __eof=false;const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';");
  inject('if(chunk.done)break;',"if(chunk.done){__eof=true;if(__f)__fu.emit('body-eof',{...__f,bytes,eof:true});break;}");
  inject('}finally{try{await reader.cancel();}',"}finally{if(__f)__fu.emit('body-cleanup',{...__f,bytes,eof:__eof});try{await reader.cancel();}");
 }else if(path===FAULT_UNKNOWN_TRACE_PATHS[2]){
  inject(" if(!plain(payload))throw Error('invalid-conversation-json');"," if(__fu.parse)__fu.emit('protocol',{...__fu.parse,protocolClass:payload?.protocol==='future-99'?'EXPECTED_UNKNOWN_PROTOCOL':typeof payload?.protocol==='string'?'OTHER_PROTOCOL':'NO_PROTOCOL',mappingPresent:!!payload&&typeof payload==='object'&&Object.hasOwn(payload,'mapping')});if(!plain(payload))throw Error('invalid-conversation-json');");
 }else if(path===FAULT_UNKNOWN_TRACE_PATHS[3]){
  inject('  const attempt={proofId,budgetWindow,calibration,abort:new AbortController(),promise:null};busy=attempt;',"  const attempt={proofId,budgetWindow,calibration,abort:new AbortController(),promise:null};busy=attempt;const __f={...__fu.linked(calibration?.signal),reader:__fu.next(),mode:calibration?'calibration':'current'};__fu.emit('reader-start',__f);__fu.link(attempt.abort.signal,__f);");
  inject('   const currentGuard=context.guard,currentSignal=',"   __fu.watch(context.signal,{...__f,source:'context'});__fu.watch(calibration?.signal,{...__f,source:'entry'});__fu.watch(attempt.abort.signal,{...__f,source:'attempt'});const currentGuard=context.guard,currentSignal=");
  inject('    let onAbort;const cancelled=',"    __fu.link(signal,__f);let onAbort;const cancelled=");
  inject('busy.abort.abort();busy=null;',"__fu.emit('reader-abort',{...__fu.linked(busy.abort.signal),source:'reader-preempt'});busy.abort.abort();busy=null;");
  inject('}).finally(()=>{attempt.abort.abort();',"}).finally(()=>{__fu.emit('reader-abort',{...__f,source:'reader-finally'});attempt.abort.abort();");
  inject('stopped=true;busy?.abort.abort();',"stopped=true;__fu.emit('reader-abort',{...__fu.linked(busy?.abort.signal),source:'reader-stop'});busy?.abort.abort();");
 }else if(path===FAULT_UNKNOWN_TRACE_PATHS[4]){
  inject('  const attempt={active:true,abort:new AbortController(),started:elapsedNow()};busy=attempt;',"  const attempt={active:true,abort:new AbortController(),started:elapsedNow()};busy=attempt;const __f={entry:__fu.next(),mode:'calibration'};__fu.link(attempt.abort.signal,__f);__fu.emit('entry-start',__f);");
  inject('finally{attempt.active=false;attempt.abort.abort();',"finally{__fu.emit('entry-abort',{...__f,source:'entry-finally'});attempt.active=false;attempt.abort.abort();");
  inject('if(busy){busy.active=false;busy.abort.abort();}',"if(busy){__fu.emit('entry-abort',{...__fu.linked(busy.abort.signal),source:'entry-stop'});busy.active=false;busy.abort.abort();}");
 }else throw Error('fault-unknown-path');
 return FAULT_UNKNOWN_TRACE_RECORDER+out;
}
async function names(root,prefix=''){const result=[];for(const name of await readdir(join(root,prefix))){const path=prefix?prefix+'/'+name:name,stat=await lstat(join(root,path));if(stat.isSymbolicLink())throw Error('fault-unknown-symlink');if(stat.isDirectory())result.push(...await names(root,path));else if(stat.isFile())result.push(path);else throw Error('fault-unknown-special-file');}return result.sort();}
export async function createFaultUnknownTracePackage(source,destination){
 if(verifyHost(source).status!=='OFFLINE_HOST_RECONSTRUCTION')throw Error('fault-unknown-offline-only');
 const manifest=await readFile(join(source,'build-manifest.json'));await cp(source,destination,{recursive:true,errorOnExist:true,force:false});const changes=[];
 for(const path of FAULT_UNKNOWN_TRACE_PATHS){const original=await readFile(join(source,path),'utf8'),modified=instrumentFaultUnknownSource(path,original);await writeFile(join(destination,path),modified);changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(modified)});}
 const compiled=compileClassicWorker(destination);for(const [path,modified]of [['extension/worker.mjs',compiled.entry],['extension/classic-runtime.js',compiled.runtime]]){const original=await readFile(join(source,path));await writeFile(join(destination,path),modified);changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(modified)});}
 const receipt={kind:FAULT_UNKNOWN_TRACE_KIND,unpacked:destination,source,manifestSha256:hash(manifest),limit:256,changes};await verifyFaultUnknownTracePackage(receipt);return receipt;
}
export async function verifyFaultUnknownTracePackage(receipt){
 const expectedPaths=[...FAULT_UNKNOWN_TRACE_PATHS,'extension/worker.mjs','extension/classic-runtime.js'];
 if(receipt.kind!==FAULT_UNKNOWN_TRACE_KIND||receipt.changes?.length!==expectedPaths.length||new Set(receipt.changes.map(c=>c.path)).size!==expectedPaths.length||receipt.changes.some(c=>!expectedPaths.includes(c.path)))throw Error('fault-unknown-changes');
 if(verifyHost(receipt.source).status!=='OFFLINE_HOST_RECONSTRUCTION')throw Error('fault-unknown-original');
 const manifest=await readFile(join(receipt.unpacked,'build-manifest.json'));if(hash(manifest)!==receipt.manifestSha256||hash(await readFile(join(receipt.source,'build-manifest.json')))!==receipt.manifestSha256)throw Error('fault-unknown-manifest');
 const info=JSON.parse(manifest);if(JSON.stringify(await names(receipt.unpacked))!==JSON.stringify([...Object.keys(info.files),'build-manifest.json'].sort()))throw Error('fault-unknown-files');
 for(const [path,digest]of Object.entries(info.files)){const changed=receipt.changes.find(c=>c.path===path);if(changed&&changed.originalSha256!==digest)throw Error('fault-unknown-original-hash');if(hash(await readFile(join(receipt.unpacked,path)))!==(changed?.instrumentedSha256??digest))throw Error('fault-unknown-trace-hash');}
 for(const path of FAULT_UNKNOWN_TRACE_PATHS)if(await readFile(join(receipt.unpacked,path),'utf8')!==instrumentFaultUnknownSource(path,await readFile(join(receipt.source,path),'utf8')))throw Error('fault-unknown-instrumentation-mismatch');
 const compiled=compileClassicWorker(receipt.unpacked);if(compiled.entry!==await readFile(join(receipt.unpacked,'extension/worker.mjs'),'utf8')||compiled.runtime!==await readFile(join(receipt.unpacked,'extension/classic-runtime.js'),'utf8'))throw Error('fault-unknown-compile');return true;
}
/** Diagnostic attribution only. This never changes unknownSchema or admits a formal observation. */
export function summarizeFaultUnknownTrace({before,after,rows,start,end,browserEvents=[],browserDropped=0,fixtureResponseTrace=null}){
 const out={status:'INCOMPLETE',acceptance:'NOT_ESTABLISHED',correlation:'NOT_ESTABLISHED',correlationComplete:false,reason:'missing-or-dropped-trace'};
 if(browserDropped!==0||before?.kind!==FAULT_UNKNOWN_TRACE_KIND||after?.kind!==FAULT_UNKNOWN_TRACE_KIND||before.dropped!==0||after.dropped!==0||before.timeOrigin!==after.timeOrigin||!Array.isArray(before.events)||!Array.isArray(after.events))return out;
 const boundary=before.events.at(-1)?.seq??0,events=after.events.filter(e=>e.seq>boundary),dispatches=after.events.filter(e=>e.stage==='detail-dispatch');
 // An already-dispatched, unfinished call can cross the action boundary: never attribute it to this action.
 if(before.events.some(e=>e.stage==='detail-dispatch'&&!before.events.some(t=>t.stage==='execute-cleanup'&&t.call===e.call)))return {...out,reason:'prior-detail-still-active'};
 const targetRows=rows.filter(r=>r.worker&&r.method==='GET'&&r.requestStart>start&&r.requestStart<=end),calls=events.filter(e=>e.stage==='detail-dispatch'),entries=events.filter(e=>e.stage==='entry-start');
 if(targetRows.length!==1||calls.length!==1||entries.length!==1||calls[0].entry!==entries[0].entry||calls[0].seq<=entries[0].seq)return {...out,reason:'nonunique-calibration-action'};
 const workerRows=rows.filter(r=>r.worker&&r.method==='GET');
 if(dispatches.length!==workerRows.length||new Set(dispatches.map(e=>e.detail)).size!==dispatches.length||dispatches.some((e,i)=>e.detail!==i+1))return {...out,reason:'dispatch-request-cardinality'};
 const call=calls[0],index=dispatches.indexOf(call),target=targetRows[0];
 if(workerRows[index]!==target)return {...out,reason:'request-order-mismatch'};
 // No request ID is propagated across fetch and Playwright. Even this unique,
 // quiescent, same-action match is explicitly a candidate, not strong identity.
 const relevant=events.filter(e=>e.call===call.call),eof=relevant.find(e=>e.stage==='body-eof'),protocol=relevant.find(e=>e.stage==='protocol'),reject=relevant.find(e=>e.stage==='parser-reject'),cleanup=relevant.find(e=>e.stage==='execute-cleanup');
 const firstAbort=relevant.find(e=>e.stage==='signal-abort');
 const observation=eof&&protocol&&reject&&cleanup&&eof.seq<protocol.seq&&protocol.seq<reject.seq&&reject.seq<cleanup.seq&&(!firstAbort||firstAbort.seq>reject.seq)?'CANDIDATE_EOF_PARSE_REJECTION_BEFORE_CLEANUP':firstAbort&&(!eof||firstAbort.seq<eof.seq)?'CANDIDATE_ABORT_BEFORE_EOF':'UNRESOLVED';
 // This opt-in fixture tag can identify the same response across processes,
 // but altered diagnostic response headers and probes do not prove causality
 // or replace the formal body evidence. Keep the enclosing result INCOMPLETE.
 const responseIdentity=matchFaultUnknownResponse({events:after.events,rows,call,target,start,end,fixture:fixtureResponseTrace});
 return {...out,responseIdentity,reason:responseIdentity.state==='MATCHED_SYNTHETIC_RESPONSE'?'response-linked-causality-unproven':'no-cross-process-request-identity',correlation:responseIdentity.state==='MATCHED_SYNTHETIC_RESPONSE'?'SYNTHETIC_RESPONSE_TAG_CAUSALITY_UNPROVEN':'UNIQUE_ACTION_ORDER_CANDIDATE_NOT_STRONG_IDENTITY',candidate:{call:call.call,detail:call.detail,entry:call.entry,requestStart:target.requestStart,observation,bodyEOF:!!eof,bodyBytes:eof?.bytes??null,protocolClass:protocol?.protocolClass??null,parserReason:reject?.reason??null,firstAbortSource:firstAbort?.source??null,browserBodyRead:target.bodyRead,browserEvents:browserEvents.filter(e=>e.requestStart===target.requestStart)},limits:['No raw body, identifiers or credentials retained.','Synchronous copy-only probes can perturb timing.','Candidate association is not formal body evidence or a product correctness verdict.']};
}
/** Join one opt-in synthetic response, never infer identity from arrival order. */
export function matchFaultUnknownResponse({events,rows,call,target,start,end,fixture}) {
 const missing={state:'INCOMPLETE',reason:'missing-or-ambiguous-response-tag'};
 if(!fixture||typeof fixture.runToken!=='string'||!/^([a-f0-9]{32})$/.test(fixture.runToken)||!Number.isSafeInteger(fixture.responseCount)||fixture.responseCount<1||fixture.responseCount>256)return missing;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||!Number.isSafeInteger(target?.requestStart)||target.requestStart<=start||target.requestStart>end)return missing;
 if(!target||target.worker!==true||target.expectedWorker!==true||target.method!=='GET'||!Number.isSafeInteger(call?.call)||!Number.isSafeInteger(call?.detail))return missing;
 const responses=events.filter(e=>e.stage==='detail-response'),own=responses.filter(e=>e.call===call.call&&e.detail===call.detail);
 if(own.length!==1||own[0].seq<=call.seq)return missing;
 const tag=own[0].responseTag;
 if(typeof tag!=='string'||!/^fxu-[a-f0-9]{32}-[1-9][0-9]{0,2}$/.test(tag)||Number(tag.split('-').at(-1))>256||target.responseTag!==tag||tag.split('-')[1]!==fixture.runToken||Number(tag.split('-').at(-1))>fixture.responseCount)return missing;
 if(responses.filter(e=>e.responseTag===tag).length!==1||rows.filter(r=>r.responseTag===tag).length!==1)return missing;
 if(own[0].status!==200||target.status!==200||events.some(e=>e.call===call.call&&e.responseTag!==undefined&&e.responseTag!==tag))return missing;
 return {state:'MATCHED_SYNTHETIC_RESPONSE',basis:'UNIQUE_FIXTURE_RESPONSE_HEADER',responseTag:tag,call:call.call,detail:call.detail,requestStart:target.requestStart,causality:'NOT_ESTABLISHED',formalBodyEvidence:'UNCHANGED'};
}
/** One read-only snapshot, bounded independently of the product's unchanged deadline. */
export async function captureFaultUnknownTrace(worker){
 if(typeof worker?.evaluate!=='function')throw Error('fault-unknown-worker-unavailable');let timer;
 try{return await Promise.race([worker.evaluate(()=>globalThis.__vaiwlFaultUnknownTrace??null),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('fault-unknown-snapshot-timeout')),1000);})]);}finally{clearTimeout(timer);}
}
