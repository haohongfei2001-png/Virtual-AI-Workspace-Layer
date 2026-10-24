import {cp,readFile,writeFile,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
import {verifyHost} from '../../extension/package.mjs';
import {ui10NativeRows} from './fixtures/ui10-populated-native.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const UI10_ADMISSION_TRACE_KIND='DIAGNOSTIC_ONLY_UI10_ADMISSION';
export const UI10_ADMISSION_TRACE_PATHS=['src/runtime/host-binding-service.mjs','src/runtime/host-entry-calibration.mjs','src/runtime/current-metadata-reader.mjs'];
const ids=ui10NativeRows().map(row=>row.id);
/** Package-copy only. No output contains raw proof, message, principal or context IDs. */
export function admissionTraceRecorder(origin){
 if(!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origin)||new URL(origin).origin!==origin)throw Error('ui10-trace-origin');
 return `
const __ua=globalThis.__vaiwlUi10AdmissionTrace??=(()=>{
 const ids=${JSON.stringify(ids)},origin=${JSON.stringify(origin)},proofs=new Map();let serial=0,attempt=0;
 const state={kind:'DIAGNOSTIC_ONLY_UI10_ADMISSION',events:[],dropped:0,proofOverflow:false,timeOrigin:performance.timeOrigin,clock:'worker-performance-relative'};
 const reasons=['stopped','busy','invalid-message','wrong-role','no-proof','stale-entry','invalid-read-budget-window','current-metadata-stopped','current-metadata-disabled','invalid-body-proof','current-metadata-busy','invalid-current-metadata','stale-body-proof','stale-calibration-entry','current-metadata-aborted','read-budget-exhausted','read-budget-retries-exhausted','invalid-host-read-budget-state','unverified-host-scope','invalid-host-observation','failed-current-observation-batch','host-observation-timeout','request-timeout','session-aborted','invalid-conversation-metadata','conversation-principal-conflict','conversation-context-conflict','ui-mount-revoked','ui-authority-invalidated','ui-scope-changed','ui-request-expired','invalid-host-document','stale-host-document','scope-not-verified','replayed-host-proposal','host-native-apply-failed','other'];
 const emit=(phase,fields={})=>{try{if(!['ingest-start','ingest-result','ingest-error','delta-stage','delta-error','entry-start','entry-rejected','entry-proof','entry-result','entry-error','reader-start','reader-rejected','reader-context','provider-enter','reader-result','reader-error'].includes(phase))return;const row={seq:++serial,at:performance.now(),phase};for(const key of ['attempt','proof','entry','wanted'])if(Number.isSafeInteger(fields[key])&&fields[key]>=0)row[key]=fields[key];row.visit=Number.isInteger(fields.visit)&&fields.visit>=0&&fields.visit<64?fields.visit:null;for(const key of ['proofFound','oldTerminal','firstSend','sendCandidates','calibration'])if(typeof fields[key]==='boolean')row[key]=fields[key];if(['current-observation','current-object','surface-delta','send-candidate','send-gap'].includes(fields.kind))row.kind=fields.kind;if(['explicit-body-id','unproven'].includes(fields.association))row.association=fields.association;if(['accepted','duplicate','rejected','retry-after','checked-current','unavailable','candidate','partial','shared','old-terminal','first-send','send-candidates','complete'].includes(fields.outcome))row.outcome=fields.outcome;if(typeof fields.reason==='string')row.reason=reasons.includes(fields.reason)?fields.reason:'other';if(state.events.length>=512){state.dropped++;return;}state.events.push(row);}catch{}};
 const proof=value=>{if(typeof value!=='string'||!value)return 0;if(proofs.has(value))return proofs.get(value);if(proofs.size>=128){state.proofOverflow=true;return 0;}const next=proofs.size+1;proofs.set(value,next);return next;};
 Object.defineProperties(state,{emit:{value:emit},next:{value:()=>++attempt},proof:{value:proof},visit:{value:value=>{const index=ids.indexOf(value);return index<0?null:index;}},route:{value:value=>{try{const u=new URL(value);return u.origin===origin&&!u.search&&!u.hash?ids.findIndex(id=>u.pathname==='/c/'+id):null;}catch{return null;}}},reason:{value:error=>reasons.includes(error?.message)?error.message:'other'}});return state;
})();
`;
}
export function instrumentUi10AdmissionSource(path,source,origin){
 if(source.includes('__ua'))throw Error('ui10-trace-already-instrumented');let out=source;
 const inject=(before,after)=>{if(out.split(before).length!==2)throw Error('ui10-trace-anchor:'+path+':'+before);out=out.replace(before,after);};
 if(path===UI10_ADMISSION_TRACE_PATHS[0]){
  inject("onNativeDelta:proof=>track('background',async()=>{await oldSendTerminal?.observe(proof);if(firstSend)await firstSend.observe(proof);if(sendCandidatesEnabled)await sendCandidates?.observe(proof);})",`onNativeDelta:proof=>track('background',async()=>{const __f={attempt:__ua.next(),proof:__ua.proof(proof),oldTerminal:!!oldSendTerminal,firstSend:!!firstSend,sendCandidates:sendCandidatesEnabled};let __stage='old-terminal';try{__ua.emit('delta-stage',{...__f,outcome:__stage});await oldSendTerminal?.observe(proof);__stage='first-send';__ua.emit('delta-stage',{...__f,outcome:__stage});if(firstSend)await firstSend.observe(proof);__stage='send-candidates';__ua.emit('delta-stage',{...__f,outcome:__stage});if(sendCandidatesEnabled)await sendCandidates?.observe(proof);__ua.emit('delta-stage',{...__f,outcome:'complete'});}catch(error){__ua.emit('delta-error',{...__f,outcome:__stage,reason:__ua.reason(error)});throw error;}})`);
  inject('   const result=await observations.ingest(message,sender,nativeRepository);',`   const __body=message.kind==='current-observation'?message.payload?.body:message.kind==='current-object'?message.payload:null,__f={attempt:__ua.next(),kind:message.kind,visit:__ua.visit(__body?.conversationId),association:__body?.association,wanted:__body?.messageIds?.length};__ua.emit('ingest-start',__f);let result;try{result=await observations.ingest(message,sender,nativeRepository);}catch(error){__ua.emit('ingest-error',{...__f,reason:__ua.reason(error)});throw error;}__ua.emit('ingest-result',{...__f,outcome:result?.state,reason:result?.reason,proof:__ua.proof(result?.bodyProofId),proofFound:!!result?.bodyProofId});`);
 }else if(path===UI10_ADMISSION_TRACE_PATHS[1]){
  inject("  const failure=()=>({ok:false,state:'unavailable'});",`  const __f={attempt:__ua.next()};__ua.emit('entry-start',__f);const failure=()=>({ok:false,state:'unavailable'});`);
  inject("!['foreground','history'].includes(message.kind))return failure();",`!['foreground','history'].includes(message.kind)){__ua.emit('entry-rejected',{...__f,reason:stopped?'stopped':busy?'busy':'invalid-message'});return failure();}`);
  inject("   if(context.role!=='workspace')return failure();",`   __f.visit=__ua.route(context.parentFrame?.actualURL);if(context.role!=='workspace'){__ua.emit('entry-rejected',{...__f,reason:'wrong-role'});return failure();}`);
  inject('   const proof=observations.currentProofForParent(context);if(!proof)return failure();',`   const proof=observations.currentProofForParent(context);__f.proof=__ua.proof(proof);__ua.emit('entry-proof',{...__f,proofFound:!!proof});if(!proof){__ua.emit('entry-rejected',{...__f,reason:'no-proof'});return failure();}`);
  inject('   if(!isCurrent())return failure();',`   if(!isCurrent()){__ua.emit('entry-rejected',{...__f,reason:'stale-entry'});return failure();}`);
  inject("   return isCurrent()?{ok:true,state:'checked-current'}:failure();",`   const result=isCurrent()?{ok:true,state:'checked-current'}:failure();__ua.emit('entry-result',{...__f,outcome:result.state});return result;`);
  inject('});}catch{return failure();}',`});}catch(error){__ua.emit('entry-error',{...__f,reason:__ua.reason(error)});return failure();}`);
 }else if(path===UI10_ADMISSION_TRACE_PATHS[2]){
  inject(' function startRead(proofId,{budgetWindow}={},calibration){',` function startRead(proofId,{budgetWindow}={},calibration){
  const __f={attempt:__ua.next(),proof:__ua.proof(proofId),calibration:!!calibration};__ua.emit('reader-start',__f);`);
  for(const reason of ['invalid-read-budget-window','current-metadata-stopped','current-metadata-disabled','invalid-body-proof'])inject(`return Promise.reject(Error('${reason}'));`,`{__ua.emit('reader-rejected',{...__f,reason:'${reason}'});return Promise.reject(Error('${reason}'));}`);
  inject("  if(busy)return !calibration&&!busy.calibration&&busy.proofId===proofId&&busy.budgetWindow===budgetWindow?busy.promise:Promise.reject(Error('current-metadata-busy'));",`  if(busy){const shared=!calibration&&!busy.calibration&&busy.proofId===proofId&&busy.budgetWindow===budgetWindow;__ua.emit('reader-rejected',{...__f,outcome:shared?'shared':'rejected',reason:'current-metadata-busy'});return shared?busy.promise:Promise.reject(Error('current-metadata-busy'));}`);
  inject('   let acceptance=null,history=null,readExpiry=null;',`   __f.visit=__ua.visit(conversationId);__ua.emit('reader-context',{...__f,wanted:wanted.size});let acceptance=null,history=null,readExpiry=null;`);
  inject('    let result;try{result=await Promise.race([track(()=>readCurrent(',`    __ua.emit('provider-enter',__f);let result;try{result=await Promise.race([track(()=>readCurrent(`);
  inject('})).then(result=>{check();return result;}).finally(()=>{',`})).then(result=>{try{check();__ua.emit('reader-result',{...__f,outcome:result.state});return result;}catch(error){__ua.emit('reader-error',{...__f,reason:__ua.reason(error)});throw error;}},error=>{__ua.emit('reader-error',{...__f,reason:__ua.reason(error)});throw error;}).finally(()=>{`);
 }else throw Error('ui10-trace-path');
 return admissionTraceRecorder(origin)+out;
}
async function names(root,prefix=''){const result=[];for(const name of await readdir(join(root,prefix))){const path=prefix?prefix+'/'+name:name,stat=await lstat(join(root,path));if(stat.isSymbolicLink())throw Error('ui10-trace-symlink');if(stat.isDirectory())result.push(...await names(root,path));else if(stat.isFile())result.push(path);else throw Error('ui10-trace-special-file');}return result.sort();}
export async function createUi10AdmissionTracePackage(source,destination,origin){
 if(verifyHost(source).status!=='OFFLINE_HOST_RECONSTRUCTION')throw Error('ui10-trace-offline-only');
 const manifest=await readFile(join(source,'build-manifest.json'));if(JSON.parse(manifest).origin!==origin)throw Error('ui10-trace-origin-mismatch');await cp(source,destination,{recursive:true,errorOnExist:true,force:false});const changes=[];
 for(const path of UI10_ADMISSION_TRACE_PATHS){const original=await readFile(join(source,path),'utf8'),modified=instrumentUi10AdmissionSource(path,original,origin);await writeFile(join(destination,path),modified);changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(modified)});}
 const compiled=compileClassicWorker(destination);for(const [path,modified]of [['extension/worker.mjs',compiled.entry],['extension/classic-runtime.js',compiled.runtime]]){const original=await readFile(join(source,path));await writeFile(join(destination,path),modified);changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(modified)});}
 const receipt={kind:UI10_ADMISSION_TRACE_KIND,unpacked:destination,source,origin,manifestSha256:hash(manifest),limit:512,changes};await verifyUi10AdmissionTracePackage(receipt);return receipt;
}
export async function verifyUi10AdmissionTracePackage(receipt){
 const expectedPaths=[...UI10_ADMISSION_TRACE_PATHS,'extension/worker.mjs','extension/classic-runtime.js'];
 if(receipt.kind!==UI10_ADMISSION_TRACE_KIND||receipt.changes?.length!==expectedPaths.length||new Set(receipt.changes.map(c=>c.path)).size!==expectedPaths.length||receipt.changes.some(c=>!expectedPaths.includes(c.path)))throw Error('ui10-trace-changes');
 if(verifyHost(receipt.source).status!=='OFFLINE_HOST_RECONSTRUCTION')throw Error('ui10-trace-original');
 const manifest=await readFile(join(receipt.unpacked,'build-manifest.json'));if(hash(manifest)!==receipt.manifestSha256||hash(await readFile(join(receipt.source,'build-manifest.json')))!==receipt.manifestSha256)throw Error('ui10-trace-manifest');
 const info=JSON.parse(manifest);if(info.origin!==receipt.origin)throw Error('ui10-trace-origin-mismatch');if(JSON.stringify(await names(receipt.unpacked))!==JSON.stringify([...Object.keys(info.files),'build-manifest.json'].sort()))throw Error('ui10-trace-files');
 for(const [path,digest]of Object.entries(info.files)){const changed=receipt.changes.find(c=>c.path===path);if(changed&&changed.originalSha256!==digest)throw Error('ui10-trace-original-hash');if(hash(await readFile(join(receipt.unpacked,path)))!==(changed?.instrumentedSha256??digest))throw Error('ui10-trace-trace-hash');}
 for(const path of UI10_ADMISSION_TRACE_PATHS)if(await readFile(join(receipt.unpacked,path),'utf8')!==instrumentUi10AdmissionSource(path,await readFile(join(receipt.source,path),'utf8'),receipt.origin))throw Error('ui10-trace-instrumentation-mismatch');
 const compiled=compileClassicWorker(receipt.unpacked);if(compiled.entry!==await readFile(join(receipt.unpacked,'extension/worker.mjs'),'utf8')||compiled.runtime!==await readFile(join(receipt.unpacked,'extension/classic-runtime.js'),'utf8'))throw Error('ui10-trace-compile');return true;
}

export async function captureUi10AdmissionTrace(worker){
 if(typeof worker?.evaluate!=='function')throw Error('ui10-trace-worker-unavailable');let timer;
 try{return await Promise.race([worker.evaluate(()=>globalThis.__vaiwlUi10AdmissionTrace??null),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('ui10-trace-snapshot-timeout')),1000);})]);}finally{clearTimeout(timer);}
}

/** Verification failure is recorded, never allowed to skip browser cleanup. */
export async function checkUi10AdmissionTracePackage(receipt){
 try{await verifyUi10AdmissionTracePackage(receipt);return {verified:true,error:null};}catch{return {verified:false,error:'ui10-trace-package-verification-failed'};}
}
