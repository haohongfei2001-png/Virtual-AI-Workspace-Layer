import {cp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const TRACE_PATHS=['src/data/native-repository.mjs','src/runtime/host-view-service.mjs','src/host/chatgpt-adapter.mjs','src/runtime/free-view-owner.mjs'];
export const TRACE_KINDS=['native-start','native-root','native-commit','native-abort','view-begin','view-run','view-error','view-retry','view-terminal','view-stop','pass-start','pass-complete','pass-drained','pass-summary','migration-start','migration-end','window-reserve','window-expire','window-release','window-refused','view-version-restart','replica-terminal'];
const phaseFields=['headerMs','pagesMs','assembleMs','snapshotMs','indexMs','versionMs','elapsed','txMs','rootMs','saveMs','reduceMs','sharedMs','publishMs','queuedMs','scanCount','scanMs','scanMaxMs','splitCount','splitMs','splitMaxMs','emitCount','emitMs','emitMaxMs','accepted','duplicate','retry','rejected','samples'];
const fields=['window','refusal','shared','nativeChanged','workspaceChanged','evidenceChanged','viewChanged','freshnessChanged','realmOrdinal','dropped','waitCount','waitFirstMs','waitLastMs','producer','generation','attempt','elapsed','revision','expectedRevision','refsCount','pages','fragments','candidates','busy','pending','ok','replayed','format','error',...phaseFields];
// Ring retains latest events; dropped counts disclose missing early history.
// Fixed schema; no arbitrary string fields, identifiers, URLs or thrown text.
export const TRACE_RECORDER=`
const __scaleKinds=${JSON.stringify(TRACE_KINDS)},__scaleFields=${JSON.stringify(fields)};
const __scalePhaseFields=${JSON.stringify(phaseFields)};
const __scaleNow=()=>{try{return performance.now();}catch{return null;}};
const __scaleDelta=start=>{const end=__scaleNow();return start!==null&&end!==null&&end>=start?end-start:null;};
const __scalePassStats=producer=>({producer,scanCount:0,scanMs:0,scanMaxMs:0,splitCount:0,splitMs:0,splitMaxMs:0,emitCount:0,emitMs:0,emitMaxMs:0,accepted:0,duplicate:0,retry:0,rejected:0,samples:0});
const __scaleAdd=(s,key,start)=>{try{if(!s)return;const ms=__scaleDelta(start);s[key+'Count']++;if(ms!==null){s[key+'Ms']+=ms;s[key+'MaxMs']=Math.max(s[key+'MaxMs'],ms);}}catch{}};
const __scaleStore=()=>globalThis.__vaiwlScaleTrace??={events:[],bytes:0,dropped:0,producers:0};
const __scaleOrdinal=()=>{try{const s=__scaleStore();return s.producers=Math.min(1000000000,s.producers+1);}catch{return 0;}};
const __scaleError=value=>['snapshot-revision-changed','stale-free-page','revision-conflict','read-budget-exhausted','stale-binding'].includes(value)?value:'other';
const __scaleEmit=(kind,fields={})=>{try{
 if(!__scaleKinds.includes(kind))return;const s=__scaleStore(),row={kind,at:Date.now(),realm:"__SCALE_REALM__",dropped:s.dropped};
 for(const key of __scaleFields){const value=fields[key];if(value===undefined)continue;
 if(value===null&&__scalePhaseFields.includes(key))row[key]=null;
 else if(key==='format'){if(['ABSENT','FACTS','PARTITIONED','VERSION_INDEX'].includes(value))row[key]=value;}
 else if(key==='error')row[key]=__scaleError(value);
 else if(typeof value==='boolean')row[key]=value;
 else if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e15)row[key]=value;}
 const encoded=JSON.stringify(row),bytes=new TextEncoder().encode(encoded).length;
 while(s.events.length&&(s.events.length>=1024||s.bytes+bytes>131072)){const old=s.events.shift();s.bytes-=new TextEncoder().encode(JSON.stringify(old)).length;s.dropped=Math.min(1000000000,s.dropped+1);}
 s.events.push(row);s.bytes+=bytes;__SCALE_CONSOLE__
}catch{}};
`;
function once(source,from,to){if(source.split(from).length!==2)throw Error('scale-trace-anchor-mismatch');return source.replace(from,to);}
// Test-only phase offsets are monotonic relative to mutate entry. Differences
// delimit work + scheduling, never exclusive CPU/IDB time. publishMs is the
// shared enlist callback; queuedMs is synchronous writer/bookkeeping return,
// not completion of asynchronous index/GC requests. The transaction terminal
// is the only drain boundary. Unreached stages stay null; a native-start without
// a terminal can mean pre-transaction failure or an unfinished operation.
// Pass summaries cover the private surface scan/hash/split and emit await only;
// body discovery, transport, owner admission, and scheduling remain separate gaps.
export function instrumentScaleSource(path,source){
 if(source.includes('const __scaleKinds='))throw Error('scale-trace-anchor-mismatch');
 let out=source;const add=(a,b)=>{out=once(out,a,b);};
 if(path===TRACE_PATHS[0]){
  const cut=out.indexOf('  async mutate(scope,');if(cut<0)throw Error('scale-trace-anchor-mismatch');const prefix=out.slice(0,cut);out=out.slice(cut);
  add('    command=structuredClone(command);','    command=structuredClone(command);const __scaleProducer=__scaleOrdinal();const __scaleMono=__scaleNow(),__scaleStages={txMs:null,rootMs:null,saveMs:null,reduceMs:null,sharedMs:null,publishMs:null,queuedMs:null};let __scaleFormat="ABSENT";__scaleEmit("native-start",{producer:__scaleProducer,expectedRevision,refsCount:command.batch?.refs?.length??0});');
  add('          const indexReader=payload?.format', '          __scaleStages.rootMs=__scaleDelta(__scaleMono);__scaleFormat=payload?.format===NATIVE_INDEX_FORMAT?"VERSION_INDEX":isNativePartitioned(payload)?"PARTITIONED":payload?"FACTS":"ABSENT";__scaleEmit("native-root",{producer:__scaleProducer,revision:payload?.revision??0,format:__scaleFormat,elapsed:__scaleDelta(__scaleMono)});\n          const indexReader=payload?.format');
  add('      transaction.oncomplete = () => {','      transaction.oncomplete = () => {__scaleEmit("native-commit",{...__scaleStages,producer:__scaleProducer,revision:result?.revision??expectedRevision,ok:result?.ok===true,replayed:result?.replayed===true,elapsed:__scaleDelta(__scaleMono)});');
  add('      transaction.onabort = () => {','      transaction.onabort = () => {__scaleEmit("native-abort",{...__scaleStages,producer:__scaleProducer,expectedRevision,format:__scaleFormat,error:__scaleError(result?.reason),elapsed:__scaleDelta(__scaleMono)});');out=prefix+out;
  add("      const states = transaction.objectStore('native_states')", "      __scaleStages.txMs=__scaleDelta(__scaleMono);const states = transaction.objectStore('native_states')");
  add('                  const save = (partial, storage = null) => {','                  const save = (partial, storage = null) => {__scaleStages.saveMs=__scaleDelta(__scaleMono);');
  add('                      const next = reduce(partial);','                      const next = reduce(partial);__scaleStages.reduceMs=__scaleDelta(__scaleMono);');
  add('                      const publish=()=>{','                      const publish=()=>{__scaleStages.publishMs=__scaleDelta(__scaleMono);');
  add('                        this.shared.registerNativeReferences(', '                        __scaleStages.sharedMs=__scaleDelta(__scaleMono);this.shared.registerNativeReferences(');
  add('                          check();result = {ok: true, replayed: false, revision: next.revision, operationId};', '                          __scaleStages.queuedMs=__scaleDelta(__scaleMono);check();result = {ok: true, replayed: false, revision: next.revision, operationId};');
  add("try{fence(options);await this.migrateVersionIndex(normalized,{operationId:'host_initial_index_'+digest([normalized.key,request.operationId]),expectedRevision:1},options);}catch{/* Keep the actual committed observation result. */}", "const __scaleMigration=__scaleOrdinal(),__scaleMigrationStart=__scaleNow();__scaleEmit('migration-start',{producer:__scaleMigration,expectedRevision:1});try{fence(options);const __scaleMigrationResult=await this.migrateVersionIndex(normalized,{operationId:'host_initial_index_'+digest([normalized.key,request.operationId]),expectedRevision:1},options);__scaleEmit('migration-end',{producer:__scaleMigration,elapsed:__scaleDelta(__scaleMigrationStart),ok:__scaleMigrationResult?.ok===true,revision:__scaleMigrationResult?.revision,error:__scaleError(__scaleMigrationResult?.reason)});}catch{__scaleEmit('migration-end',{producer:__scaleMigration,elapsed:__scaleDelta(__scaleMigrationStart),ok:false,error:'other'});/* Keep the actual committed observation result. */}");
 }else if(path===TRACE_PATHS[1]){
  // Trace-only WeakMap associates live window objects with anonymous ordinals.
  // Refusal: 1=used, 2=capacity, 3=clock. Expiry: 1=clock, 2=deadline, 3=no live reader.
  add('const views=new Map(),resumes=new Map(),readWindows=new Map();', 'const views=new Map(),resumes=new Map(),readWindows=new Map();const __scaleWindows=new WeakMap();const __scaleWindow=w=>{try{return w?__scaleWindows.get(w):undefined;}catch{return undefined;}};');
  add('){window.active=false;return false;}', '){__scaleEmit("window-expire",{window:__scaleWindow(window),elapsed:Number.isFinite(at)?Math.max(0,at-(window.until-1000)):null,refusal:!Number.isFinite(at)||at<window.last?1:at>=window.until?2:3});window.active=false;return false;}');
  add('if(window?.used&&!liveWindow(entry.scopeKey))return;', 'if(window?.used&&!liveWindow(entry.scopeKey)){__scaleEmit("window-refused",{window:__scaleWindow(window),generation:entry.prepareGeneration,refusal:1});return;}');
  add('if(!window&&readWindows.size>=maxViews)return;', 'if(!window&&readWindows.size>=maxViews){__scaleEmit("window-refused",{generation:entry.prepareGeneration,refusal:2});return;}');
  add('const at=elapsedNow();if(!Number.isFinite(at))return;', 'const at=elapsedNow();if(!Number.isFinite(at)){__scaleEmit("window-refused",{generation:entry.prepareGeneration,refusal:3});return;}');
  add('readWindows.set(entry.scopeKey,window);', 'readWindows.set(entry.scopeKey,window);__scaleWindows.set(window,__scaleOrdinal());');
  add('  entry.readWindow=window;', '  __scaleEmit("window-reserve",{window:__scaleWindow(window),generation:entry.prepareGeneration,shared:[...views.values()].some(value=>value!==entry&&value.readWindow===window),elapsed:Math.max(0,window.last-(window.until-1000))});entry.readWindow=window;');
  add('if(entry.prepareGeneration!==generation||entry.readWindow!==window)return;entry.awaitingDelivery=false;entry.readWindow=null;liveWindow(entry.scopeKey);', 'if(entry.prepareGeneration!==generation||entry.readWindow!==window){__scaleEmit("window-release",{window:__scaleWindow(window),generation,ok:false});return;}__scaleEmit("window-release",{window:__scaleWindow(window),generation,ok:true});entry.awaitingDelivery=false;entry.readWindow=null;liveWindow(entry.scopeKey);');
  const versionCheck='if(freshnessChanged||version.nativeRevision!==value.revision||version.revision!==value.workspaceRevision||version.evidenceRevision!==value.evidenceRevision||version.viewRevision!==value.viewRevision){';
  add(versionCheck,versionCheck+'__scaleEmit("view-version-restart",{window:__scaleWindow(entry.readWindow),generation:entry.prepareGeneration,freshnessChanged,nativeChanged:version.nativeRevision!==value.revision,workspaceChanged:version.revision!==value.workspaceRevision,evidenceChanged:version.evidenceRevision!==value.evidenceRevision,viewChanged:version.viewRevision!==value.viewRevision});');
  add('if(entry){entry.prepareGeneration=', 'if(entry){__scaleEmit("view-stop",{generation:entry.prepareGeneration??0,pending:entry.pending===true,error:__scaleError(entry.error)});entry.prepareGeneration=');
  add('started=elapsedNow();let retries=0;', 'started=elapsedNow();let retries=0;let __scaleLastBusy,__scaleWaitCount=0,__scaleWaitFirst,__scaleWaitLast;const __scaleProducer=__scaleOrdinal();__scaleEmit("view-begin",{producer:__scaleProducer,generation,attempt:1,elapsed:0});');
  add('if(nativeWritePending(entry.scopeKey)){', 'const __scaleBusy=nativeWritePending(entry.scopeKey);__scaleLastBusy=__scaleBusy;if(__scaleBusy){__scaleWaitCount++;__scaleWaitLast=elapsedNow()-started;__scaleWaitFirst??=__scaleWaitLast;');
  add('   entry.owner.refresh().then(', '   __scaleEmit("view-run",{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast,busy:__scaleLastBusy});entry.owner.refresh().then(');
  add("entry.pending=false;entry.awaitingDelivery=true;if(elapsedNow()-started>=30000)entry.error='read-budget-exhausted';", "entry.pending=false;entry.awaitingDelivery=true;if(elapsedNow()-started>=30000)entry.error='read-budget-exhausted';__scaleEmit(\"view-terminal\",{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast,ok:!entry.error,error:__scaleError(entry.error)});");
  add("    if(['snapshot-revision-changed','stale-free-page'].includes(error?.message)", "    __scaleEmit(\"view-error\",{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast,error:__scaleError(error?.message)});if(['snapshot-revision-changed','stale-free-page'].includes(error?.message)");
  add('retries++;entry.deferPreparation=queueRetry;', 'retries++;__scaleEmit("view-retry",{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast});entry.deferPreparation=queueRetry;');
  add('entry.pending=false;entry.error=reason(error);', 'entry.pending=false;entry.error=reason(error);__scaleEmit("view-terminal",{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast,ok:false,error:__scaleError(entry.error)});');
  const budget="entry.error='read-budget-exhausted';return;";if(out.split(budget).length!==3)throw Error('scale-trace-anchor-mismatch');out=out.replaceAll(budget,"entry.error='read-budget-exhausted';__scaleEmit(\"view-terminal\",{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast,ok:false,error:'read-budget-exhausted'});return;");
  add("entry.error='read-budget-exhausted';releaseRead(entry);completed();entry.owner.invalidate();", "entry.error='read-budget-exhausted';__scaleEmit('view-terminal',{producer:__scaleProducer,generation,attempt:retries+1,elapsed:elapsedNow()-started,waitCount:__scaleWaitCount,waitFirstMs:__scaleWaitFirst,waitLastMs:__scaleWaitLast,ok:false,error:'read-budget-exhausted'});releaseRead(entry);completed();entry.owner.invalidate();");
 }else if(path===TRACE_PATHS[2]){
  add('const surfaceAccepted=new Map(),surfaceFailed=new Map();','let __scaleStatsOwner=null,__scaleStats=null,__scalePass=0,__scaleFragments=0,__scaleCandidates=0;const surfaceAccepted=new Map(),surfaceFailed=new Map();');
  add('surfacePage=0;surfaceScanning=true;', 'surfacePage=0;surfaceScanning=true;__scalePass=__scaleOrdinal();__scaleStats=__scalePassStats(__scalePass);__scaleStatsOwner=pass;__scaleFragments=0;__scaleCandidates=0;__scaleEmit("pass-start",{producer:__scalePass});');
  add('if(!surfaceParts.length&&(surfaceScanning||surfaceWanted))schedule();','if(!surfaceParts.length&&!surfaceScanning)__scaleEmit("pass-drained",{producer:__scalePass,pages:surfacePage,fragments:__scaleFragments,candidates:__scaleCandidates});if(!surfaceParts.length&&(surfaceScanning||surfaceWanted))schedule();');
  add("if(p.kind==='surface-delta'){surfaceParts.shift();", "if(p.kind==='surface-delta'){__scaleFragments++;__scaleCandidates+=p.payload.candidates.length;surfaceParts.shift();if(!surfaceParts.length&&!surfaceScanning)__scaleEmit(\"pass-complete\",{producer:__scalePass,pages:surfacePage,fragments:__scaleFragments,candidates:__scaleCandidates});");
  add('const found=page?discovery.scanPage(surfaceCursor):null,payload=', 'let found=null;const __scaleScanStats=__scaleStats,__scaleScanStart=__scaleNow();try{found=page?discovery.scanPage(surfaceCursor):null;}finally{if(page)__scaleAdd(__scaleScanStats,"scan",__scaleScanStart);}const payload=');
  add('surfaceKey=publicationKey(source);', 'const __scaleSplitStats=__scaleStats,__scaleSplitStart=__scaleNow();try{surfaceKey=publicationKey(source);');
  add('surfaceParts=splitSurfacePayload(source.payload,source);', 'surfaceParts=splitSurfacePayload(source.payload,source);}finally{__scaleAdd(__scaleSplitStats,"split",__scaleSplitStart);}');
  add('  const send=async()=>{', '  const __scaleSendStats=p.kind==="surface-delta"?__scaleStats:null;const send=async()=>{');
  add("let ack;try{ack=await emit(p);}catch{return finish('host-observation-ack-unknown');}", "let ack;const __scaleEmitStart=__scaleNow();try{try{ack=await emit(p);}finally{__scaleAdd(__scaleSendStats,'emit',__scaleEmitStart);}}catch{return finish('host-observation-ack-unknown');}");
  add("   if(ack?.localSeq!==p.localSeq)", "   if(__scaleSendStats){if(ack?.state==='accepted')__scaleSendStats.accepted++;else if(ack?.state==='duplicate')__scaleSendStats.duplicate++;else if(ack?.state==='retry-after')__scaleSendStats.retry++;else __scaleSendStats.rejected++;if(__scaleSendStats.emitCount%32===0&&__scaleSendStats.samples<8){__scaleSendStats.samples++;__scaleEmit('pass-summary',__scaleSendStats);}}if(ack?.localSeq!==p.localSeq)");
  add('if(surfaceEpoch!==surfaceSnapshotEpoch){pass=null;', "if(surfaceEpoch!==surfaceSnapshotEpoch){if(__scaleStats)__scaleEmit('pass-summary',{...__scaleStats,ok:false});__scaleStats=null;__scaleStatsOwner=null;pass=null;");
  add('terminal:false};pass=entry;', 'terminal:false};__scaleStats=null;__scaleStatsOwner=null;pass=entry;');
  add("function stop(){finishPass('cancel');", "function stop(){finishPass('cancel');__scaleStats=null;__scaleStatsOwner=null;");
  add('  if(entry.terminal)return;entry.terminal=true;', "  if(entry.terminal)return;entry.terminal=true;if(__scaleStats&&__scaleStatsOwner===entry){__scaleEmit('pass-summary',{...__scaleStats,ok:phase==='end'});__scaleStats=null;__scaleStatsOwner=null;}");
 }else if(path===TRACE_PATHS[3]){
  // Monotonic cumulative offsets, not CPU times. Null means a phase was not
  // reached (including the compatible-snapshot path); one terminal per refresh.
  add('  budget.begin();','  const __scaleReplica=__scaleOrdinal(),__scaleReplicaStart=__scaleNow(),__scaleReplicaStages={headerMs:null,pagesMs:null,assembleMs:null,snapshotMs:null,indexMs:null,versionMs:null};let __scaleReplicaOK=false;budget.begin();');
  add('   const header=reply.header,plan=planFreeReplica(replica,header);','   __scaleReplicaStages.headerMs=__scaleDelta(__scaleReplicaStart);const header=reply.header,plan=planFreeReplica(replica,header);');
  add('   check();let candidate=replica,snapshot,index=published?.index??cachedIndex;','   __scaleReplicaStages.pagesMs=__scaleDelta(__scaleReplicaStart);check();let candidate=replica,snapshot,index=published?.index??cachedIndex;');
  add('candidate=await assembleFreeReplicaAsync(replica,header,pages,plan,valid);snapshot=freeNavigationSnapshot(candidate.snapshot);','candidate=await assembleFreeReplicaAsync(replica,header,pages,plan,valid);__scaleReplicaStages.assembleMs=__scaleDelta(__scaleReplicaStart);snapshot=freeNavigationSnapshot(candidate.snapshot);__scaleReplicaStages.snapshotMs=__scaleDelta(__scaleReplicaStart);');
  add('index=(!plan.full&&index?await index.rebindCompatibleAsync(snapshot,snapshot.groups,valid):null)??await currentIndexAsync(snapshot,snapshot.groups,valid,!plan.full?index:null);','index=(!plan.full&&index?await index.rebindCompatibleAsync(snapshot,snapshot.groups,valid):null)??await currentIndexAsync(snapshot,snapshot.groups,valid,!plan.full?index:null);__scaleReplicaStages.indexMs=__scaleDelta(__scaleReplicaStart);');
  add('   check();const version=await request(()=>readService.version(bound,options));check();','   if(__scaleReplicaStages.snapshotMs===null)__scaleReplicaStages.snapshotMs=__scaleDelta(__scaleReplicaStart);check();const version=await request(()=>readService.version(bound,options));check();__scaleReplicaStages.versionMs=__scaleDelta(__scaleReplicaStart);');
  add('published=Object.freeze({snapshot,index});return published;','published=Object.freeze({snapshot,index});__scaleReplicaOK=true;return published;');
  add('}).finally(()=>{budget.complete();','}).finally(()=>{__scaleEmit("replica-terminal",{...__scaleReplicaStages,producer:__scaleReplica,ok:__scaleReplicaOK,elapsed:__scaleDelta(__scaleReplicaStart)});budget.complete();');
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
  for(const [key,value]of Object.entries(row)){if(['kind','at'].includes(key))continue;if(key==='realm'){if(!['worker','content'].includes(value))throw Error();continue;}if(!fields.includes(key))throw Error();if(value===null&&phaseFields.includes(key))continue;if(key==='format'){if(!['ABSENT','FACTS','PARTITIONED','VERSION_INDEX'].includes(value))throw Error();}else if(key==='error'){if(!['snapshot-revision-changed','stale-free-page','revision-conflict','read-budget-exhausted','stale-binding','other'].includes(value))throw Error();}else if(typeof value!=='boolean'&&!(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e15))throw Error();}
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
