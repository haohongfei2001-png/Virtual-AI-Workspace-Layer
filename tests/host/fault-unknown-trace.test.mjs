import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
import {digest} from '../../src/data/hash.mjs';
import {createFaultUnknownTracePackage,verifyFaultUnknownTracePackage,captureFaultUnknownTrace,instrumentFaultUnknownSource,FAULT_UNKNOWN_TRACE_RECORDER,FAULT_UNKNOWN_TRACE_PATHS,FAULT_UNKNOWN_TRACE_KIND,summarizeFaultUnknownTrace} from './fault-unknown-trace.mjs';
async function setup(t){const dir=await mkdtemp(join(tmpdir(),'fault-unknown-trace-'));t.after(()=>rm(dir,{recursive:true,force:true}));const source=join(dir,'formal');buildHost(source,{offlineOrigin:'http://127.0.0.1:1234',offlineHistory:true});const trace=await createFaultUnknownTracePackage(source,join(dir,'copy'));return {source,trace};}
test('verified offline copy retains exact original manifest, seven hash receipts and classic build closure',async t=>{
 const {source,trace}=await setup(t);assert.equal(trace.changes.length,7);assert.equal(trace.kind,FAULT_UNKNOWN_TRACE_KIND);assert(await verifyFaultUnknownTracePackage(trace));assert.equal(verifyHost(source).status,'OFFLINE_HOST_RECONSTRUCTION');assert.equal(await readFile(join(source,'build-manifest.json'),'utf8'),await readFile(join(trace.unpacked,'build-manifest.json'),'utf8'));
 for(const path of FAULT_UNKNOWN_TRACE_PATHS){const original=await readFile(join(source,path),'utf8');assert(!original.includes('__fu'));assert.throws(()=>instrumentFaultUnknownSource(path,'changed source'),/anchor/);assert.throws(()=>instrumentFaultUnknownSource(path,original+'\n__fu'),/already-instrumented/);}
 await writeFile(join(trace.unpacked,'unexpected.txt'),'not permitted');await assert.rejects(verifyFaultUnknownTracePackage(trace),/files/);await rm(join(trace.unpacked,'unexpected.txt'));
 await writeFile(join(trace.unpacked,FAULT_UNKNOWN_TRACE_PATHS[0]),'modified');await assert.rejects(verifyFaultUnknownTracePackage(trace),/trace-hash/);
});
test('recorder drops overflow, only allows fixed schema and keeps associations private',()=>{
 const context=vm.createContext({performance:{now:()=>1,timeOrigin:100}});vm.runInContext(FAULT_UNKNOWN_TRACE_RECORDER+`;__fu.emit('execute-error',{call:1,reason:'secret-token',raw:'secret-body',url:'secret-url'});for(let i=0;i<300;i++)__fu.emit('entry-start',{entry:i});`,context);
 const value=JSON.parse(JSON.stringify(context.__vaiwlFaultUnknownTrace));assert.equal(value.events.length,256);assert.equal(value.dropped,45);assert(!JSON.stringify(value).includes('secret'));assert.deepEqual(Object.keys(value).sort(),['clock','dropped','events','kind','timeOrigin']);
});
test('actual instrumented provider consumes EOF, records real parser rejection, then cleanup abort without extra fetch',async t=>{
 const {trace}=await setup(t);delete globalThis.__vaiwlFaultUnknownTrace;t.after(()=>delete globalThis.__vaiwlFaultUnknownTrace);
 const {createSessionProvider}=await import(pathToFileURL(join(trace.unpacked,'src/runtime/session-provider.mjs')));const calls=[];
 const provider=createSessionProvider({origin:'http://127.0.0.1:1234',profile:{currentConversationReadEnabled:true},fetch:async(url,options)=>{calls.push(url);let payload=url.endsWith('/api/auth/session')?{user:{id:'fixture-user'},accessToken:'NEVER_RECORD_CREDENTIAL',expires:'2099-01-01T00:00:00.000Z'}:url.includes('/accounts/check/')?{accounts:{personal:{account:{account_id:'personal',structure:'personal'}}}}:{protocol:'future-99',payload:{opaque:true}};const response=new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;}});
 await assert.rejects(provider.readCurrentConversation({conversationId:'33333333-3333-4333-8333-333333333333',expectedPrincipalKey:'principal_'+digest(['chatgpt-principal-v1','fixture-user']),expectedContextKey:'context_'+digest(['chatgpt-context-v1','fixture-user','personal'])}),/invalid-conversation-metadata/);
 assert.equal(calls.length,3);const traceJSON=JSON.parse(JSON.stringify(globalThis.__vaiwlFaultUnknownTrace)),events=traceJSON.events;for(const secret of ['NEVER_RECORD_CREDENTIAL','fixture-user','33333333','opaque','http://'])assert(!JSON.stringify(traceJSON).includes(secret));
 const eof=events.find(e=>e.stage==='body-eof'),protocol=events.find(e=>e.stage==='protocol'),reject=events.find(e=>e.stage==='parser-reject'),cleanup=events.find(e=>e.stage==='execute-cleanup'),abort=events.find(e=>e.stage==='signal-abort');assert.equal(eof.bytes,50);assert.equal(protocol.protocolClass,'EXPECTED_UNKNOWN_PROTOCOL');assert.equal(reject.reason,'conversation-identity-conflict');assert(eof.seq<protocol.seq&&protocol.seq<reject.seq&&reject.seq<cleanup.seq&&cleanup.seq<abort.seq);assert.equal(abort.source,'provider');
});
const snapshot=events=>({kind:FAULT_UNKNOWN_TRACE_KIND,timeOrigin:10,dropped:0,events});
const events=[{seq:1,stage:'entry-start',entry:1},{seq:2,stage:'detail-dispatch',entry:1,call:1,detail:1},{seq:3,stage:'body-eof',call:1,bytes:50},{seq:4,stage:'protocol',call:1,protocolClass:'EXPECTED_UNKNOWN_PROTOCOL'},{seq:5,stage:'parser-reject',call:1,reason:'conversation-identity-conflict'},{seq:6,stage:'execute-cleanup',call:1},{seq:7,stage:'signal-abort',call:1,source:'provider'}];
const args=()=>({before:snapshot([]),after:snapshot(structuredClone(events)),rows:[{worker:true,method:'GET',requestStart:1,bodyRead:'FAILED'}],start:0,end:1});
test('unique ordered action still cannot certify cross-process identity or upgrade missing body',()=>{const r=summarizeFaultUnknownTrace(args());assert.equal(r.status,'INCOMPLETE');assert.equal(r.correlationComplete,false);assert.equal(r.candidate.observation,'CANDIDATE_EOF_PARSE_REJECTION_BEFORE_CLEANUP');assert.equal(r.candidate.browserBodyRead,'FAILED');});
for(const [name,change]of Object.entries({dropped:a=>a.after.dropped=1,browserDropped:a=>a.browserDropped=1,restarted:a=>a.after.timeOrigin=20,priorActive:a=>a.before.events=[{seq:0,stage:'detail-dispatch',call:8}],noTarget:a=>a.rows=[],multipleTargets:a=>{a.rows.push({...a.rows[0],requestStart:2});a.end=2;},oldEntry:a=>a.after.events[0].entry=2,missingDispatch:a=>a.after.events.splice(1,1)}))test('trace rejects attribution for '+name,()=>{const a=args();change(a);const r=summarizeFaultUnknownTrace(a);assert.equal(r.status,'INCOMPLETE');assert.equal(r.correlationComplete,false);assert(!r.candidate);});
test('abort before EOF stays distinguished without interpreting it as parsed unknown',()=>{const a=args();a.after.events=[events[0],events[1],{seq:3,stage:'signal-abort',call:1,source:'attempt'}];const r=summarizeFaultUnknownTrace(a);assert.equal(r.candidate.observation,'CANDIDATE_ABORT_BEFORE_EOF');assert.equal(r.candidate.bodyEOF,false);assert.equal(r.candidate.protocolClass,null);});
test('runner is single-case opt-in, retains formal oracle, separate diagnostic contract and nonzero exit',async()=>{const s=await readFile(new URL('./fault-package-matrix-browser.mjs',import.meta.url),'utf8');for(const literal of ["FREE_FAULT_UNKNOWN_TRACE==='1'","assert.deepEqual(requestedCases,['unknown-protocol']",'assertFaultObservation(result)','contractOutcome','correlationComplete=false','process.exitCode=integrity?2:1','trace?.unpacked??built.unpacked','verifyFaultUnknownTracePackage(trace)'])assert(s.includes(literal),literal);assert(!s.includes('FREE_FAULT_CASES'));});
test('snapshot is one read only and bounded even if worker never answers',async()=>{let reads=0;await assert.rejects(captureFaultUnknownTrace({evaluate:()=>{reads++;return new Promise(()=>{});}}),/snapshot-timeout/);assert.equal(reads,1);await assert.rejects(captureFaultUnknownTrace(null),/worker-unavailable/);});
for(const abortEarly of [false,true])test('original and instrumented provider preserve request options and rejection: '+(abortEarly?'abort before EOF':'unknown parser rejection'),async t=>{
 const {source,trace}=await setup(t);delete globalThis.__vaiwlFaultUnknownTrace;t.after(()=>delete globalThis.__vaiwlFaultUnknownTrace);const runs=[];
 for(const root of [source,trace.unpacked]){
  const {createSessionProvider}=await import(pathToFileURL(join(root,'src/runtime/session-provider.mjs'))),owner=new AbortController(),requests=[],signals=[];
  const provider=createSessionProvider({origin:'http://127.0.0.1:1234',profile:{currentConversationReadEnabled:true},fetch:async(url,options)=>{
   const {signal,...rest}=options;requests.push({url,...rest});signals.push(signal);let body;
   if(url.endsWith('/api/auth/session'))body=JSON.stringify({user:{id:'fixture-user'},accessToken:'fixture-token',expires:'2099-01-01T00:00:00.000Z'});
   else if(url.includes('/accounts/check/'))body=JSON.stringify({accounts:{personal:{account:{account_id:'personal',structure:'personal'}}}});
   else if(abortEarly)body=new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(Error('aborted-stream')),{once:true});},pull(){owner.abort();}},{highWaterMark:0});
   else body=JSON.stringify({protocol:'future-99',payload:{opaque:true}});
   const response=new Response(body,{status:200,headers:{'Content-Type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;
  }});
  let error;try{await provider.readCurrentConversation({conversationId:'33333333-3333-4333-8333-333333333333',expectedPrincipalKey:'principal_'+digest(['chatgpt-principal-v1','fixture-user']),expectedContextKey:'context_'+digest(['chatgpt-context-v1','fixture-user','personal']),signal:owner.signal});}catch(e){error=e.message;}
  runs.push({requests,error,aborted:signals.map(s=>s.aborted)});
 }
 assert.deepEqual(runs[0],runs[1]);assert.equal(runs[0].requests.length,3);assert.equal(runs[0].error,abortEarly?'session-aborted':'invalid-conversation-metadata');const events=globalThis.__vaiwlFaultUnknownTrace.events;
 if(abortEarly){assert(!events.some(e=>e.stage==='body-eof'));assert(!events.some(e=>e.stage==='protocol'||e.stage==='parser-reject'));assert(events.some(e=>e.stage==='signal-abort'&&e.source==='attempt'));}else assert(events.some(e=>e.stage==='parser-reject'));
});
