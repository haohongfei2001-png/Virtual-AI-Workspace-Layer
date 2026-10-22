import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createHostNativeActivityOwner} from '../../src/runtime/host-native-activity-owner.mjs';
import {createHostActivitySourceAdmission} from '../../src/runtime/host-activity-source-admission.mjs';
import {projectFreeActivity} from '../../src/data/free-activity.mjs';
import {createFreeViewSession} from '../../src/data/free-time-policy.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
export const activityProfile={id:'test-native-recency',revision:1,providerProfile:'test-session',semantics:'native-object-update',timeUnit:'second',orderDomain:'recent-unpinned'};
export const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
export async function runNativeActivityCase(indexedDB){
 const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'test-account',organizationId:'test-space'}),other=normalizedScope({verified:true,provider:'chatgpt',accountId:'other',organizationId:'test-space'});
 let wall=Date.parse('2026-10-22T01:00:00Z'),valid=true,owner;
 const base=new ScopeRepository({indexedDB,databaseName:'native_activity_'+crypto.randomUUID().replaceAll('-','')}),repo=new FreeEvidenceRepository({baseRepository:base,clock:()=>new Date(wall).toISOString(),hostObservationGate:(s,r)=>owner.gate(s,r)});
 const makeOwner=()=>createHostNativeActivityOwner({evidenceRepository:()=>repo,profileFor:()=>activityProfile,now:()=>wall});owner=makeOwner();
 const send=items=>owner.consume({observation:{profileId:activityProfile.id,profileVersion:1,scopeKey:scope.key,observedAt:new Date(wall).toISOString(),items},context:{scope,providerProfile:'test-session'},guard:()=>valid});
 const rows=[{conversationId:A,updateTime:wall/1000-86400},{conversationId:B}];
 const snapshot={scope:scope.key,refs:[B,A].map(id=>({id,scope:scope.key,membership:'UNKNOWN'})),projects:[],noProject:[],unknown:[B,A]};
 const project=e=>projectFreeActivity(snapshot,e,createFreeViewSession({now:new Date(wall).toISOString(),timeZone:'UTC'}),new Date(wall).toISOString());
 try{
  check((await send(rows)).ok,'initial-write');const first=await repo.read(scope),time=project(first).refs.find(r=>r.id===A).activityDecision;
  check(time.basis==='provisional'&&time.candidateTime==='2026-10-21T01:00:00.000Z'&&!time.sentAt&&!time.sentInterval,'time-not-send');check(!Object.keys(first.events).length&&!Object.keys(first.coverage).length,'strict-untouched');
  wall+=3000;check((await send(rows)).replayed,'repeat-not-replayed');check((await repo.read(scope)).revision===first.revision,'repeat-renewed');
  let stale=false;try{await owner.consume({observation:{profileId:activityProfile.id,profileVersion:1,scopeKey:scope.key,observedAt:new Date(wall-1000).toISOString(),items:[...rows].reverse()},context:{scope,providerProfile:'test-session'},guard:()=>true});}catch{stale=true;}check(stale,'replay-lost-observation-watermark');wall+=120000;
  base.close();owner.stop();owner=makeOwner();check(project(await repo.read(scope)).refs.find(r=>r.id===A).activityDecision.candidateTime===time.candidateTime,'restart-lost-time');check((await repo.read(other)).revision===0,'scope-leak');
  const allow=createHostActivitySourceAdmission({nativeActivityProfile:activityProfile}),disabled=createHostActivitySourceAdmission();const src=Object.values(first.sources)[0];check(allow(scope,src,{store:'evidence',sources:first.sources}),'admission');check(!disabled(scope,src,{store:'evidence',sources:first.sources})&&!allow(scope,src,{store:'shared',sources:first.sources}),'default-or-shared-authority');
  // Changed order replaces one snapshot row per conversation, not a new log.
  for(const items of [[...rows].reverse(),rows,[...rows].reverse()]){wall+=1000;check((await send(items)).ok,'reorder');}
  const after=await repo.read(scope);check(Object.keys(after.hints).length===3,'unbounded-order-history');
  const undated=structuredClone(after);for(const [id,h]of Object.entries(undated.hints))if(h.hintType==='native-activity')delete undated.hints[id];
  const p=project(undated);check(p.unknown.map(r=>r.id).join()===`${B},${A}`,'latest-order');check(p.refs.every(r=>r.activityDecision.candidateDay===null&&r.activityDecision.segment===null),'rank-invented-date');
  // Only B appears: A remains reachable, but its older batch is not comparable.
  wall+=1000;await send([{conversationId:B}]);const partial=project(await repo.read(scope));check(partial.unknown.length===2&&!partial.refs.find(r=>r.id===A).activityDecision.nativeOrder,'old-batch-authority');
  valid=false;let denied=false;try{await send(rows);}catch{denied=true;}check(denied,'revocation-ignored');valid=true;
  const before=await repo.read(scope);const source=Object.values(before.sources)[0];check((await repo.invalidate(scope,{sourceId:source.id,operationId:'revoke',expectedRevision:before.revision})).ok,'source-revoke');check(project(await repo.read(scope)).refs.every(r=>r.activityDecision.basis==='undated'),'revoked-evidence-visible');
  wall+=1000;await send(rows);const recovered=await repo.read(scope);check(recovered.sources[source.id].revoked&&Object.keys(recovered.sources).length===2,'old-source-resurrected');
  wall+=40*86400000;check(project(recovered).refs.find(r=>r.id===A).activityDecision.segment>0,'old-time-did-not-age');
  return {status:'PASS',checks:['persist-reopen','scope-isolation','default-deny','time-not-ACK','repeat-idempotency','bounded-order-replacement','unknown-reachability','revoke-new-incarnation','natural-aging']};
 }finally{owner.stop();base.close();}
}
