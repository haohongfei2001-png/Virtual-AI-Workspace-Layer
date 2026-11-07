/** Development measurement only: synthetic metadata + actual shared repository
 * code over MockIDB. This is NOT host/browser/disk/user performance evidence. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {checkActivityVersionFence} from '../../src/data/activity-version-fence.mjs';
import {aggregateFreeActivity} from '../../src/data/free-activity.mjs';
import {createFreeViewSession} from '../../src/data/free-time-policy.mjs';
import {freeNavigationSnapshot} from '../../src/navigation/free-view.mjs';
import {projectFreeFrame} from '../../src/runtime/free-frame-projection.mjs';
import {digest,sha256,stable} from '../../src/data/hash.mjs';
import {emptyOverlay,validateOverlay,reduceProCommand,planTransaction,placementId} from '../../src/pro/domain/index.mjs';
import {projectProFrame} from '../../src/pro/projection/project.mjs';
import {createSameDatabaseStore,proRootKey} from '../../src/pro/integration/same-db-store.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=process.env.VAIWL_PRO_PERFORMANCE_OUTPUT?path.resolve(process.env.VAIWL_PRO_PERFORMANCE_OUTPUT):path.join(repoRoot,'tests/pro/evidence/performance.json');
// Keep prior outcomes visible, including misses, when the same evidence path is
// remeasured after a change. Never select the fastest sample or discard outliers.
let priorObservations=[];
try{const old=JSON.parse(await fs.readFile(output,'utf8'));if(old.format==='vaiwl-pro-development-performance/1')priorObservations=[...(old.priorObservations??[]),{recordedAt:old.recordedAt,status:old.status,sourceDigests:old.sourceDigests,p95Milliseconds:Object.fromEntries(Object.entries(old.measurements).map(([key,value])=>[key,value.p95Ms]))}];}catch(error){if(error.code!=='ENOENT')throw error;}
async function readGitHead(){try{const head=(await fs.readFile(path.join(repoRoot,'.git/HEAD'),'utf8')).trim();if(/^[a-f0-9]{40}$/.test(head))return head;const ref=head.startsWith('ref: ')?head.slice(5):null;if(!ref||!ref.startsWith('refs/')||ref.includes('..'))return null;try{return (await fs.readFile(path.join(repoRoot,'.git',ref),'utf8')).trim();}catch{const packed=await fs.readFile(path.join(repoRoot,'.git/packed-refs'),'utf8');return packed.split('\n').find(line=>line.endsWith(' '+ref))?.split(' ')[0]??null;}}catch{return null;}}
const baselineGitHead=await readGitHead();
const sources=['src/pro/domain/index.mjs','src/pro/domain/schema.mjs','src/pro/projection/project.mjs','src/pro/integration/same-db-store.mjs','src/data/hash.mjs','src/data/native-repository.mjs','src/data/free-time-policy.mjs','tests/b23/mock-idb.mjs','tests/pro/performance.mjs'];
const sourceDigests=Object.fromEntries(await Promise.all(sources.map(async file=>[file,sha256(await fs.readFile(path.join(repoRoot,file),'utf8'))])));
const samples=Number(process.env.VAIWL_PRO_PERFORMANCE_SAMPLES??30);
if(!Number.isSafeInteger(samples)||samples<20||samples>100)throw Error('performance-samples-must-be-20-to-100');
const warmup=5,now='2026-10-31T12:00:00.000Z';
const scope=normalizedScope({verified:true,provider:'pro_perf_fixture',accountId:'synthetic_only',organizationId:'isolated'});
const sourceScope={kind:'verified-scope',key:scope.key,serverIdentity:'established',persistence:'same-idb'};
const session=createFreeViewSession({H:30,now,timeZone:'Asia/Shanghai',policyRevision:0});
const references=Array.from({length:1000},(_,i)=>{const id=`c_${String(i).padStart(4,'0')}`;return {id,nativeTitle:`合成研究任务 ${i}`,nativeUrl:`https://fixture.test/c/${id}`,membership:{state:'NONE',evidenceId:`none_${id}`,revision:1},available:true,freshness:'current',nativeRevision:1,sourceIds:['performance_fixture']};});
const control=()=>({mode:'human',locked:false,revision:1,lastHumanOperation:'synthetic_setup'});
const overlay=emptyOverlay(scope.key);overlay.revision=1;
for(let i=0;i<100;i++){const id=`t_${String(i).padStart(3,'0')}`;overlay.topics[id]={id,scopeKey:scope.key,name:`合成主题 ${i}`,aliases:[],icon:'◇',intent:null,nameControl:control(),membershipControl:{mode:'automatic',locked:false,revision:1,lastHumanOperation:null},lifecycle:'active',createdBy:'human',revision:1};}
for(let i=0;i<references.length;i++){const r=references[i],topicId=`t_${String(Math.floor(i/10)).padStart(3,'0')}`;overlay.placements[placementId(topicId,r.id)]={conversationId:r.id,topicId,role:'primary',activityContribution:'primary-only',state:'included',control:control(),constraintRefs:[],evidenceIds:[r.membership.evidenceId],revision:1};overlay.titles[r.id]={conversationId:r.id,title:`合成整理标题 ${i}`,aliases:[],control:control(),evidenceIds:[r.membership.evidenceId],revision:1,displayPreference:'derived'};}
validateOverlay(overlay);
const activityDecisions=Object.fromEntries(references.map((r,i)=>[r.id,{objectKey:r.id,evidenceRevision:0,basis:'provisional',candidateDay:20757,candidateTime:new Date(Date.parse(now)-i*1000).toISOString(),segment:0,reason:'synthetic-measurement',nextCheck:null,validUntil:null}]));
function versions(state,nativeRevision=1){return {scopeKey:scope.key,authorizationEpoch:1,sourceGeneration:{performance_fixture:1},nativeFields:{nativeRoot:nativeRevision,evidenceRoot:0},overlayRevision:state.revision,targets:{},constraintRevision:state.revision,policyVersion:'performance-synthetic-1',evidenceDigest:digest('fixed-approved-synthetic-metadata')};}
function snapshot(state,nativeRevision=1){return {scope:sourceScope,scopeKey:scope.key,authorized:true,references,versions:versions(state,nativeRevision),capabilities:{scope:sourceScope,metadata:'available',positiveNone:'available',selectedText:'unavailable',sentUserInput:'unavailable',historicalCompleteness:'known-domain-complete',reasonCodes:['synthetic-only']},viewSession:session,activityDecisions,partial:false};}
function context(state,operationId,nativeRevision=1){const snap=snapshot(state,nativeRevision);return {actor:'human',operationId,snapshot:snap,expected:snap.versions,mode:'pro-default-none'};}
const freeRefs=references.map(r=>({...r,scope:scope.key,membership:'NONE',projectId:null,displayTitle:r.nativeTitle,activityDecision:activityDecisions[r.id]}));
const freeSnapshot=freeNavigationSnapshot(aggregateFreeActivity({scope:scope.key,revision:1,viewMode:'free',refs:freeRefs,projects:[],noProject:freeRefs,unknown:[],inventoryComplete:true,workspaceRevision:0,evidenceRevision:0,viewRevision:0,viewSession:session,preferences:{}}));
const nativeDTO=projectFreeFrame({snapshot:freeSnapshot},{role:'workspace',segment:0,offset:0,limit:24,rowLimit:5});
function project(state,mode='pro-default-none'){return projectProFrame({state,snapshot:snapshot(state),native:nativeDTO,mode,role:'workspace',session,segment:0,offset:0,limit:24,rowLimit:5});}
function stats(values,cold,targetMs){const sorted=[...values].sort((a,b)=>a-b),round=v=>Math.round(v*1000)/1000,p95=sorted[Math.ceil(sorted.length*.95)-1];return {coldFirstInvocationMs:round(cold),warmupInvocations:warmup,sampleCount:values.length,minMs:round(sorted[0]),medianMs:round(sorted[Math.floor(sorted.length/2)]),p95Ms:round(p95),maxMs:round(sorted.at(-1)),targetP95Ms:targetMs,met:p95<=targetMs,rawSampleMs:values.map(round)};}
async function measure(fn,target){const first=performance.now();await fn(-1);const cold=performance.now()-first;for(let i=0;i<warmup;i++)await fn(i);const values=[];for(let i=0;i<samples;i++){const start=performance.now();await fn(i+warmup);values.push(performance.now()-start);}return stats(values,cold,target);}
const commandFor=i=>({type:'SET_DERIVED_TITLE',refId:references[(i+1000)%references.length].id,title:`人工测量编辑 ${i}`});
const pure=await measure(i=>{const command=commandFor(i),next=reduceProCommand(overlay,command,context(overlay,`pure_${i}`));assert.equal(next.titles[command.refId].title,command.title);assert.equal(next.revision,2);},100);
process.stdout.write(JSON.stringify({phase:'manualReducerFeedback',p95Ms:pure.p95Ms,targetMs:100})+'\n');
const cached=await measure(()=>{const free=project(overlay,'native'),pro=project(overlay);assert.equal(free.native,nativeDTO);assert.equal(pro.overlay.cards.length,24);assert.equal(pro.overlay.cards.flatMap(c=>c.rows).length,120);},150);
process.stdout.write(JSON.stringify({phase:'cachedFreeProSwitchProjection',p95Ms:cached.p95Ms,targetMs:150})+'\n');

const factory=new MockIDBFactory(),base=new ScopeRepository({indexedDB:factory,databaseName:'vaiwl_pro_performance_isolated'}),native=new NativeRepository({baseRepository:base,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'performance_fixture',generation:'one'})});
let valid=true;const grant=Object.freeze({fixtureOnly:true});
const verifyGrant=g=>{if(g!==grant||!valid)throw Error('invalid-performance-fixture-grant');return sourceScope;};
const store=createSameDatabaseStore({connection:()=>base.open(),verifyGrant,enabled:true,verifyInputFence(tx,_scope,expected,check,ready,fail){checkActivityVersionFence(tx,scope,{nativeRevision:expected.nativeFields.nativeRoot,evidenceRevision:0},check,ready,fail);}});
let full;const fullStageRows=[];
try{
  const seeded=await native.apply(scope,{operationId:'perf_native_seed',expectedRevision:0,batch:{scopeKey:scope.key,sourceRevision:1,observedAt:now,validUntil:'2026-11-01T12:00:00.000Z',projects:[],refs:references.map(r=>({id:r.id,nativeTitle:r.nativeTitle,nativeUrl:r.nativeUrl,availability:'available'})),membership:references.map(r=>({id:r.id,state:'NONE',projectId:null})),inventory:{projects:'complete',conversations:'complete',cursor:null}}});assert.equal(seeded.ok,true,seeded.reason);
  const source=await native.snapshot(scope);assert.equal(source.refs.length,1000);
  // One explicit synthetic checkpoint preload; avoid timing artificial 1000-row
  // setup commands or claiming a production migration took place.
  const db=await base.open(),key=proRootKey(scope.key),payload={format:'vaiwl-pro-root/1',minimumReader:'vaiwl-pro-overlay/1',scopeKey:key,targetScopeKey:scope.key,sequence:0,state:overlay,operationIds:[]};
  await new Promise((resolve,reject)=>{const tx=db.transaction(['b23_states','b23_checkpoints'],'readwrite'),row={key,payload,checksum:digest(payload)};tx.objectStore('b23_states').put(row);tx.objectStore('b23_checkpoints').put(row);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error??Error('fixture-preload-aborted'));tx.onerror=()=>{};});
  let serial=0;
  full=await measure(async(sampleIndex)=>{
    const stages={},chainStart=performance.now();let mark=chainStart;
    const currentNative=await native.snapshot(scope);assert.equal(currentNative.refs.length,1000);
    stages.nativeSnapshot=performance.now()-mark;mark=performance.now();
    const current=await store.read(grant),command=commandFor(++serial),operationId=`perf_manual_${serial}`,ctx=context(current.state,operationId,currentNative.revision);
    stages.initialOverlayRead=performance.now()-mark;mark=performance.now();
    const result=await store.transact(grant,{operationId,expected:ctx.expected,fingerprint:{command,expected:ctx.expected},execute(state){const planStart=performance.now(),plan=planTransaction(state,command,ctx);stages.domainPlannerWithinTransaction=performance.now()-planStart;return {state:plan.state,transaction:{operationId,actor:'human',provenance:'explicit-user-command',base:ctx.expected,planHash:plan.planHash,resultRevision:plan.state.revision,proposalId:null,inverse:plan.inverse,patch:plan.patch,inverseHash:plan.inverseHash,readSet:plan.readSet,status:'applied'}};}});
    stages.transactionIncludingPlanner=performance.now()-mark;mark=performance.now();
    assert.equal(result.ok,true,result.reason);const after=await store.read(grant);assert.equal(after.state.titles[command.refId].title,command.title);assert.equal(after.records.length,serial);
    stages.readback=performance.now()-mark;mark=performance.now();const projected=project(after.state);assert.equal(projected.overlay.cards.length,24);stages.projection=performance.now()-mark;
    if(sampleIndex>=warmup)fullStageRows.push(stages);
  },500);
  assert.equal(factory.databasesMap.size,1);
}finally{valid=false;base.close();}
const changedDuringMeasurement=(await Promise.all(sources.map(async file=>[file,sha256(await fs.readFile(path.join(repoRoot,file),'utf8'))]))).filter(([file,hash])=>sourceDigests[file]!==hash).map(([file])=>file);
const report={format:'vaiwl-pro-development-performance/1',recordedAt:new Date().toISOString(),status:[pure,cached,full].every(x=>x.met)?'PASS_DEVELOPMENT_TARGETS':'TARGETS_NOT_MET',
  baselineGitHead,sourceDigests,changedDuringMeasurement,priorObservations,
  environment:{runtime:process.version,v8:process.versions.v8,platform:os.platform(),release:os.release(),architecture:os.arch(),cpuModel:os.cpus()[0]?.model??'unknown',logicalCpuCount:os.cpus().length,totalMemoryGiB:Math.round(os.totalmem()/1024**3),storage:'MockIDBFactory in-process serial transaction double'},
  dataset:{synthetic:true,realUserData:false,positiveNoneRefs:1000,topics:100,placements:1000,derivedTitles:1000,refsPerTopic:10,initialOverlayBytes:new TextEncoder().encode(stable(overlay)).length,projectedCardLimit:24,projectedRowsPerCard:5,projectedVisibleRows:120,viewSession:{...session,TUnit:'local-calendar-day'},setup:'one direct synthetic checkpoint plus one real NativeRepository synthetic batch'},
  measurements:{manualReducerFeedback:pure,cachedFreeProSwitchProjection:cached,mockIDBCompleteChain:full},
  mockIDBPhaseMilliseconds:Object.fromEntries(Object.keys(fullStageRows[0]).map(k=>{const rows=fullStageRows.map(r=>r[k]).sort((a,b)=>a-b);return [k,{median:Math.round(rows[Math.floor(rows.length/2)]*1000)/1000,p95:Math.round(rows[Math.ceil(rows.length*.95)-1]*1000)/1000}];})),
  definitions:{cold:'First measured invocation in this process after module import and fixture construction; not cold disk or browser start.',warm:'Five unrecorded warmup invocations followed by recorded samples; no forced GC; elapsed wall time includes assertions and normal GC.',manualReducerFeedback:'Validated reducer on 1000 approved synthetic refs and a full 100-topic overlay, including clone and output validation.',cachedFreeProSwitchProjection:'Native mode then Pro mode using cached authorized metadata and the actual Free DTO. Existing activity aggregation reused; no DOM/layout.',mockIDBCompleteChain:'NativeRepository snapshot -> same-IDB overlay+journal read -> original native/evidence fence in transaction -> real domain plan/inverse -> overlay+checkpoint+journal commit -> readback -> bounded Pro projection. Journal grows across samples.',phases:'Warm-sample phase diagnostics. domainPlannerWithinTransaction is included in transactionIncludingPlanner, not additive; per-phase p95 values must not be summed.',p95:'Nearest-rank order statistic ceil(0.95*n), milliseconds.'},
  limits:['Synthetic Node development measurement only.','MockIDB does not establish physical disk durability, browser scheduling, MV3 lifecycle, real-host responsiveness or user-perceived DOM paint.','The 1000-reference/100-topic fixture does not qualify deferred 10k/100k scale.','No provider network, personal browser, production source, credentials or real user data used.']};
if(changedDuringMeasurement.length)report.status='SOURCE_CHANGED_REMEASURE';
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({status:report.status,output,measurements:Object.fromEntries(Object.entries(report.measurements).map(([k,v])=>[k,{coldMs:v.coldFirstInvocationMs,p95Ms:v.p95Ms,targetMs:v.targetP95Ms,samples:v.sampleCount,met:v.met}]))})+'\n');
if(report.status!=='PASS_DEVELOPMENT_TARGETS')process.exitCode=1;
