/** LOGIC_ONLY_SYNTHETIC: in-process measurements, never browser/UI/weak-device certification. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {platform,arch,cpus} from 'node:os';
import {fileURLToPath} from 'node:url';
import {planFreeReplica,freeReplicaRequests,assembleFreeReplica} from '../../src/data/free-replica.mjs';
import {freeNavigationSnapshot} from '../../src/navigation/free-view.mjs';
import {currentIndex} from '../../src/navigation/current-index.mjs';
import {knownMatches} from '../../src/navigation/search.mjs';
import {createFreeViewSession} from '../../src/data/free-time-policy.mjs';
const clock='2026-10-13T12:00:00Z',session=createFreeViewSession({now:clock,timeZone:'Asia/Shanghai'}),scope='logic-only-synthetic-replica';
const ms=value=>Math.round(value*1000)/1000;
function timed(action){const start=performance.now(),value=action();return {value,ms:ms(performance.now()-start)};}
function samples(action,n){const values=[];for(let i=0;i<n;i++)values.push(timed(()=>action(i)).ms);values.sort((a,b)=>a-b);return {samples:n,p50Ms:values[Math.floor((n-1)*.5)],p95Ms:values[Math.ceil(n*.95)-1],maxMs:values.at(-1)};}
function fixture(size,distribution){
 const refs=new Map(),projects=new Map(),projectVersions={},refVersions={},activityVersions={};
 for(let i=0;i<size;i++){
  const id='r'+String(i).padStart(6,'0'),grouped=distribution==='project-heavy'||i%10===0,projectId=grouped?'p'+Math.floor(i/100):null;
  if(grouped&&!projects.has(projectId)){projects.set(projectId,{id:projectId,key:JSON.stringify([scope,projectId]),scope,nativeName:'原生项目 '+projectId,nativeUrl:'https://fixture.test/project/'+projectId});projectVersions[projectId]=1;}
  const age=i%360,candidateTime=new Date(Date.parse(clock)-age*86400000).toISOString(),activityDecision={objectKey:id,evidenceRevision:1,basis:age<30?'exact':'provisional',candidateDay:session.T-age,candidateTime,segment:Math.floor(age/30),reason:age<30?'positive-send':'historical-anchor-incomplete',nextCheck:null,validUntil:null};
  refs.set(id,{id,scope,nativeTitle:'原生中文会话 '+id+' 长标题用于测试历史阅读、原生项目成员与账户隔离的可达性，包含中文和 mixed English 2026',nativeUrl:'https://fixture.test/c/'+id,membership:grouped?'PROJECT':'NONE',projectId,activityDecision});refVersions[id]=1;activityVersions[id]=1;
 }
 return {header:{scope,revision:1,evidenceRevision:1,activitySourceRevision:'active-synthetic-source',visibilityRevision:1,evaluatedAt:clock,viewSession:session,inventoryComplete:true,manifest:{projectVersions,refVersions,activityVersions}},refs,projects};
}
const pagesFor=(data,header,plan)=>freeReplicaRequests(plan,1000).map(request=>({scope,revision:header.revision,evidenceRevision:header.evidenceRevision,projects:request.projects.map(id=>data.projects.get(id)),refs:request.refs.map(id=>data.refs.get(id))}));
export function runReplicaBenchmark({size,distribution,searchSamples=11}){
 const data=fixture(size,distribution),header=data.header,tail='r'+String(size-1).padStart(6,'0'),tailUrl=data.refs.get(tail).nativeUrl;
 const firstPlan=timed(()=>planFreeReplica(null,header)),pagePreparation=timed(()=>pagesFor(data,header,firstPlan.value));
 const full=timed(()=>assembleFreeReplica(null,header,pagePreparation.value,firstPlan.value)),view=timed(()=>freeNavigationSnapshot(full.value.snapshot)),index=timed(()=>currentIndex(view.value,view.value.groups));
 const snapshot=view.value,prior=full.value;
 assert.equal(snapshot.refs.length,size);assert.equal(new Set(snapshot.refs.map(r=>r.id)).size,size);assert.equal(index.value.at(tailUrl).ref.id,tail);
 assert.equal(snapshot.noProject.length,distribution==='project-heavy'?0:size-Math.ceil(size/10));
 const unchanged=samples(()=>{const p=planFreeReplica(prior,header);assert.equal(p.refs.length,0);assert.equal(p.projects.length,0);},11);
 // The route index is built above; this measures only cached route lookup, not painting.
 const navigation=samples(i=>{const id='r'+String((i*997)%size).padStart(6,'0');assert.equal(index.value.at('https://fixture.test/c/'+id).ref.id,id);},1001);
 const search=samples(()=>{const found=knownMatches(snapshot,tail);assert.equal(found.length,1);assert.equal(found[0].id,tail);},searchSamples);
 const recentActivity={...data.refs.get(tail).activityDecision,candidateDay:session.T,candidateTime:clock,segment:0,basis:'exact'};
 const changedRef={...data.refs.get(tail),nativeTitle:'尾部原生增量 '+tail,activityDecision:recentActivity};
 const nativeHeader={...header,revision:2,manifest:{...header.manifest,refVersions:{...header.manifest.refVersions,[tail]:2}}};
 const nativePlan=timed(()=>planFreeReplica(prior,nativeHeader));assert.deepEqual(nativePlan.value.refs,[tail]);assert.equal(nativePlan.value.projects.length,0);
 const nativeDelta=timed(()=>assembleFreeReplica(prior,nativeHeader,[{scope,revision:2,evidenceRevision:1,projects:[],refs:[changedRef]}],nativePlan.value));
 const nativeDeltaView=timed(()=>freeNavigationSnapshot(nativeDelta.value.snapshot)),nativeDeltaIndex=timed(()=>currentIndex(nativeDeltaView.value,nativeDeltaView.value.groups));
 assert.equal(nativeDeltaIndex.value.at(tailUrl).ref.nativeTitle,'尾部原生增量 '+tail);assert.equal(nativeDeltaIndex.value.at(tailUrl).ref.activityDecision.segment,0);
 // Real activity storage has a separate evidence revision. Report its actual invalidation fan-out.
 const activityHeader={...header,evidenceRevision:2,manifest:{...header.manifest,activityVersions:{...header.manifest.activityVersions,[tail]:2}}},activityPlan=timed(()=>planFreeReplica(prior,activityHeader));
 assert.deepEqual(activityPlan.value.refs,[tail]);assert.equal(activityPlan.value.projects.length,0);
 const activityData={...data,refs:new Map(data.refs)};activityData.refs.set(tail,{...data.refs.get(tail),activityDecision:{...recentActivity,evidenceRevision:2}});
 const activityPages=timed(()=>pagesFor(activityData,activityHeader,activityPlan.value)),activityDelta=timed(()=>assembleFreeReplica(prior,activityHeader,activityPages.value,activityPlan.value));
 assert.equal(activityDelta.value.refs.get(tail).activityDecision.segment,0);assert.equal(activityDelta.value.snapshot.refs.length,size);
 return {size,distribution,evidence:'LOGIC_ONLY_SYNTHETIC',projectCount:data.projects.size,noProjectCount:snapshot.noProject.length,tailReachable:true,
  initial:{planMs:firstPlan.ms,pagePreparationMs:pagePreparation.ms,pageCount:pagePreparation.value.length,assembleMs:full.ms,navigationSnapshotMs:view.ms,currentIndexBuildMs:index.ms},
  unchangedPlan:unchanged,cachedNavigation:navigation,knownTailSearch:search,
  nativeSingleRefDelta:{requestedRefs:nativePlan.value.refs.length,requestedProjects:nativePlan.value.projects.length,planMs:nativePlan.ms,assembleMs:nativeDelta.ms,navigationSnapshotMs:nativeDeltaView.ms,currentIndexBuildMs:nativeDeltaIndex.ms,totalMs:ms(nativePlan.ms+nativeDelta.ms+nativeDeltaView.ms+nativeDeltaIndex.ms)},
  singleRefActivityDelta:{requestedRefs:activityPlan.value.refs.length,requestedProjects:activityPlan.value.projects.length,pageCount:activityPages.value.length,planMs:activityPlan.ms,pagePreparationMs:activityPages.ms,assembleMs:activityDelta.ms,fullRefetch:activityPlan.value.refs.length===size},
  targets:{cachedNavigationP95Under150ms:navigation.p95Ms<150,knownSearchP95Under300ms:search.p95Ms<300},
  limitations:['No browser DOM rendering, extension messaging, IndexedDB, throttling or physical weak device measured.','Logic timing cannot certify F1 S or real-user navigation.']};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const sizes=(process.env.FREE_REPLICA_SIZES??'1000,10000,100000').split(',').map(Number);
 if(sizes.some(n=>!Number.isSafeInteger(n)||n<1||n>100000))throw Error('invalid-benchmark-size');
 const files=['src/data/free-replica.mjs','src/data/free-activity.mjs','src/data/free-time-policy.mjs','src/navigation/free-view.mjs','src/navigation/current-index.mjs','src/navigation/search.mjs','tests/free/replica-performance.mjs'];
 const hashes=()=>Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')]));
 const sourceHashes=Object.fromEntries(await hashes());
 const results=[];for(const size of sizes)for(const distribution of ['project-heavy','none-heavy']){const result=runReplicaBenchmark({size,distribution});results.push(result);console.log(JSON.stringify({size,distribution,assembleMs:result.initial.assembleMs,searchP95Ms:result.knownTailSearch.p95Ms,nativeDeltaMs:result.nativeSingleRefDelta.totalMs,activityRefetch:result.singleRefActivityDelta.requestedRefs}));}
 assert.deepEqual(Object.fromEntries(await hashes()),sourceHashes,'benchmark source changed during run; rerun after writer completes');
 const report={evidence:'LOGIC_ONLY_SYNTHETIC',measuredAt:new Date().toISOString(),environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model},sourceHashes,results};
 const output=process.env.FREE_REPLICA_REPORT??'/private/tmp/free-replica-performance.json';await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:output,cases:results.length}));
}
