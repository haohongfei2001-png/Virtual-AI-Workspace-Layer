import {cp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const TRACE_PATHS=['src/data/native-repository.mjs','src/runtime/host-view-service.mjs','src/host/chatgpt-adapter.mjs'];
export const TRACE_KINDS=['native-start','native-root','native-commit','native-abort','view-begin','view-run','view-error','view-retry','view-terminal','view-stop','pass-start','pass-complete','pass-drained'];
const fields=['realmOrdinal','dropped','waitCount','waitFirstMs','waitLastMs','producer','generation','attempt','elapsed','revision','expectedRevision','refsCount','pages','fragments','candidates','busy','pending','ok','replayed','format','error'];
// Ring retains latest events; dropped counts disclose missing early history.
// Fixed schema; no arbitrary string fields, identifiers, URLs or thrown text.
export const TRACE_RECORDER=`
const __scaleKinds=${JSON.stringify(TRACE_KINDS)},__scaleFields=${JSON.stringify(fields)};
const __scaleStore=()=>globalThis.__vaiwlScaleTrace??={events:[],bytes:0,dropped:0,producers:0};
const __scaleOrdinal=()=>{try{const s=__scaleStore();return s.producers=Math.min(1000000000,s.producers+1);}catch{return 0;}};
const __scaleError=value=>['snapshot-revision-changed','stale-free-page','revision-conflict','read-budget-exhausted','stale-binding'].includes(value)?value:'other';
const __scaleEmit=(kind,fields={})=>{try{
 if(!__scaleKinds.includes(kind))return;const s=__scaleStore(),row={kind,at:Date.now(),realm:"__SCALE_REALM__",dropped:s.dropped};
 for(const key of __scaleFields){const value=fields[key];if(value===undefined)continue;
 if(key==='format'){if(['ABSENT','FACTS','PARTITIONED','VERSION_INDEX'].includes(value))row[key]=value;}
 else if(key==='error')row[key]=__scaleError(value);
 else if(typeof value==='boolean')row[key]=value;
 else if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e15)row[key]=value;}
 const encoded=JSON.stringify(row),bytes=new TextEncoder().encode(encoded).length;
 while(s.events.length&&(s.events.length>=1024||s.bytes+bytes>131072)){const old=s.events.shift();s.bytes-=new TextEncoder().encode(JSON.stringify(old)).length;s.dropped=Math.min(1000000000,s.dropped+1);}
 s.events.push(row);s.bytes+=bytes;__SCALE_CONSOLE__
}catch{}};
`;
function once(source,from,to){if(source.split(from).length!==2)throw Error('scale-trace-anchor-mismatch');return source.replace(from,to);}
export function instrumentScaleSource(path,source){
 if(source.includes('const __scaleKinds='))throw Error('scale-trace-anchor-mismatch');
 let out=source;const add=(a,b)=>{out=once(out,a,b);};
 if(path===TRACE_PATHS[0]){
  const cut=out.indexOf('  async mutate(scope,');if(cut<0)throw Error('scale-trace-anchor-mismatch');const prefix=out.slice(0,cut);out=out.slice(cut);
  add('    command=structuredClone(command);','    command=structuredClone(command);const __scaleProducer=__scaleOrdinal(),__scaleStarted=Date.now();let __scaleFormat="ABSENT";__scaleEmit("native-start",{producer:__scaleProducer,expectedRevision,refsCount:command.batch?.refs?.length??0});');
  add('          const indexReader=payload?.format', '          __scaleFormat=payload?.format===NATIVE_INDEX_FORMAT?"VERSION_INDEX":isNativePartitioned(payload)?"PARTITIONED":payload?"FACTS":"ABSENT";__scaleEmit("native-root",{producer:__scaleProducer,revision:payload?.revision??0,format:__scaleFormat,elapsed:Date.now()-__scaleStarted});\n          const indexReader=payload?.format');
  add('      transaction.oncomplete = () => {','      transaction.oncomplete = () => {__scaleEmit("native-commit",{producer:__scaleProducer,revision:result?.revision??expectedRevision,ok:result?.ok===true,replayed:result?.replayed===true,elapsed:Date.now()-__scaleStarted});');
  add('      transaction.onabort = () => {','      transaction.onabort = () => {__scaleEmit("native-abort",{producer:__scaleProducer,expectedRevision,format:__scaleFormat,error:__scaleError(result?.reason),elapsed:Date.now()-__scaleStarted});');out=prefix+out;
 }else if(path===TRACE_PATHS[1]){
  add('if(entry){entry.prepareGeneration=', 'if(entry){__scaleEmit("view-stop",{generation:entry.prepareGeneration??0,pending:entry.pending===true,error:__scaleError(entry.error)});entry.prepareGeneration=');
  add('started=elapsedNow();let retries=0;', 'started=elapsedNow();let retries=0;let __scaleLastBusy,__scaleWaitCount=0,__scaleWaitFirst,__scaleWaitLast;const __scaleProducer=__scaleOrdinal();__scaleEmit("view-begin",{producer:__scaleProducer,generation,attempt:1,elapsed:0});');
  add('if(nativeWritePending(entry.scopeKey)){', 'const __scaleBusy=nativeWritePending(entry.scopeKey);__scaleLastBusy=__scaleBusy;if(__scaleBusy){__scaleWaitCount++;__scaleWaitLast=elapsedNow()-started;__scaleWaitFirst??=__scaleWaitLast;');
  add('   entry.owner.refresh().then(', '   __scaleEmit("view-run",{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast,busy:__scaleLastBusy});entry.owner.refresh().then(');
  add("entry.pending=false;if(elapsedNow()-started>=30000)entry.error='read-budget-exhausted';", "entry.pending=false;if(elapsedNow()-started>=30000)entry.error='read-budget-exhausted';__scaleEmit(\"view-terminal\",{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast,ok:!entry.error,error:__scaleError(entry.error)});");
  add("    if(['snapshot-revision-changed','stale-free-page'].includes(error?.message)", "    __scaleEmit(\"view-error\",{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast,error:__scaleError(error?.message)});if(['snapshot-revision-changed','stale-free-page'].includes(error?.message)");
  add('retries++;entry.deferPreparation=queueRetry;', 'retries++;__scaleEmit("view-retry",{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast});entry.deferPreparation=queueRetry;');
  add('entry.pending=false;entry.error=reason(error);', 'entry.pending=false;entry.error=reason(error);__scaleEmit("view-terminal",{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast,ok:false,error:__scaleError(entry.error)});');
  const budget="entry.error='read-budget-exhausted';return;";if(out.split(budget).length!==3)throw Error('scale-trace-anchor-mismatch');out=out.replaceAll(budget,"entry.error='read-budget-exhausted';__scaleEmit(\"view-terminal\",{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast,ok:false,error:'read-budget-exhausted'});return;");
 }else if(path===TRACE_PATHS[2]){
  add('const surfaceAccepted=new Map(),surfaceFailed=new Map();','let __scalePass=0,__scaleFragments=0,__scaleCandidates=0;const surfaceAccepted=new Map(),surfaceFailed=new Map();');
  add('surfacePage=0;surfaceScanning=true;', 'surfacePage=0;surfaceScanning=true;__scalePass=__scaleOrdinal();__scaleFragments=0;__scaleCandidates=0;__scaleEmit("pass-start",{producer:__scalePass});');
  add('if(!surfaceParts.length&&(surfaceScanning||surfaceWanted))schedule();','if(!surfaceParts.length&&!surfaceScanning)__scaleEmit("pass-drained",{producer:__scalePass,pages:surfacePage,fragments:__scaleFragments,candidates:__scaleCandidates});if(!surfaceParts.length&&(surfaceScanning||surfaceWanted))schedule();');
  add("if(p.kind==='surface-delta'){surfaceParts.shift();", "if(p.kind==='surface-delta'){__scaleFragments++;__scaleCandidates+=p.payload.candidates.length;surfaceParts.shift();if(!surfaceParts.length&&!surfaceScanning)__scaleEmit(\"pass-complete\",{producer:__scalePass,pages:surfacePage,fragments:__scaleFragments,candidates:__scaleCandidates});");
 }else throw Error('unknown-scale-trace-source');
 return TRACE_RECORDER.replace('__SCALE_REALM__',path===TRACE_PATHS[2]?'content':'worker').replace('__SCALE_CONSOLE__',path===TRACE_PATHS[2]?'console.log("HOST_SCALE_TRACE "+encoded);':'')+out;
}
export async function createScaleTracePackage(source,destination){
 await cp(source,destination,{recursive:true,errorOnExist:true,force:false});const changes=[];
 for(const path of TRACE_PATHS){const original=await readFile(join(source,path),'utf8'),instrumented=instrumentScaleSource(path,original);await writeFile(join(destination,path),instrumented);changes.push({path,originalSha256:hash(original),instrumentedSha256:hash(instrumented)});}
 return {unpacked:destination,kind:'DIAGNOSTIC_ONLY_INSTRUMENTED_COPY',limit:1024,maxBytes:131072,changes,authorityChanged:false,originalPackageUntouched:true};
}
export async function verifyScaleTracePackage(trace){
 const info=JSON.parse(await readFile(join(trace.unpacked,'build-manifest.json'),'utf8'));
 for(const [path,expected]of Object.entries(info.files)){const changed=trace.changes.find(row=>row.path===path);if(changed&&changed.originalSha256!==expected)throw Error('scale-trace-original-hash-mismatch');if(hash(await readFile(join(trace.unpacked,path)))!==(changed?.instrumentedSha256??expected))throw Error('scale-trace-package-changed');}
 if(TRACE_PATHS.some(path=>!Object.hasOwn(info.files,path)))throw Error('scale-trace-manifest-missing-source');return true;
}
/** Validate console / worker rows again before adding to the report. */
export function appendScaleTrace(target,row){
 try{if(!row||!TRACE_KINDS.includes(row.kind)||!Number.isFinite(row.at)||row.at<0||row.at>1e15)throw Error();
  for(const [key,value]of Object.entries(row)){if(['kind','at'].includes(key))continue;if(key==='realm'){if(!['worker','content'].includes(value))throw Error();continue;}if(!fields.includes(key))throw Error();if(key==='format'){if(!['ABSENT','FACTS','PARTITIONED','VERSION_INDEX'].includes(value))throw Error();}else if(key==='error'){if(!['snapshot-revision-changed','stale-free-page','revision-conflict','read-budget-exhausted','stale-binding','other'].includes(value))throw Error();}else if(typeof value!=='boolean'&&!(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e15))throw Error();}
  const bytes=new TextEncoder().encode(JSON.stringify(row)).length;while(target.events.length&&(target.events.length>=1024||target.bytes+bytes>131072)){target.bytes-=new TextEncoder().encode(JSON.stringify(target.events.shift())).length;target.dropped++;}target.events.push(row);target.bytes+=bytes;
 }catch{target.dropped++;}
}
/** Observe only already-existing worker; never wait for or create/warm one. */
export async function collectScaleWorkerTrace(context,extensionId,{timeout=1000}={}){
 const deadline=performance.now()+timeout;let timer;
 try{const workers=context?.serviceWorkers().filter(worker=>worker.url()===`chrome-extension://${extensionId}/extension/worker.mjs`)??[];if(workers.length!==1)return {status:'NO_UNIQUE_EXISTING_WORKER'};
  const result=await Promise.race([workers[0].evaluate(()=>{const s=globalThis.__vaiwlScaleTrace;return s?{status:'RAM_SNAPSHOT',events:s.events,dropped:s.dropped,bytes:s.bytes,producers:s.producers}:{status:'TRACE_NOT_PRESENT'};}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),Math.max(0,deadline-performance.now()));})]);
  if(performance.now()>=deadline)return {status:'DEADLINE'};const clean={status:result?.status==='RAM_SNAPSHOT'?'RAM_SNAPSHOT':'TRACE_NOT_PRESENT',events:[],bytes:0,dropped:0};if(result?.status==='RAM_SNAPSHOT'){for(const row of (Array.isArray(result.events)?result.events:[]).slice(-1024))appendScaleTrace(clean,row);clean.producerDropped=Number.isSafeInteger(result.dropped)&&result.dropped>=0&&result.dropped<=1e9?result.dropped:0;clean.producers=Number.isSafeInteger(result.producers)&&result.producers>=0&&result.producers<=1e9?result.producers:0;}return clean;
 }catch{return {status:'UNAVAILABLE'};}finally{clearTimeout(timer);}
}
