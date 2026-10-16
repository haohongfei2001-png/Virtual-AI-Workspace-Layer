import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {packageHost} from '../../extension/package.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {digest} from '../../src/data/hash.mjs';
import {emptyNativeFacts,applyNativeObservations} from '../../src/data/native-facts.mjs';
import {validateFreeEvidence} from '../../src/data/free-evidence.mjs';
import {freeEvidenceKey,evidenceRecord} from '../../src/data/free-evidence-partitions.mjs';

// Execute the exact read-only evaluate callback, not a replacement admission
// filter. Only Chrome URL resolution, wall clock and IndexedDB are test doubles.
// Packaged admission, repository validation and activity projection are real.
// This is Node/MockIDB coverage, not a browser or source-authority certificate.
const NOW='2026-10-16T00:04:23.000Z',OLD='2026-07-18T00:04:20.000Z',C='33333333-3333-4333-8333-333333333333',origin='http://127.0.0.1:1234';
const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1','user-host-fixture']),organizationId:'context_'+digest(['chatgpt-context-v1','user-host-fixture','account-host-personal'])});
const runners=[
 {file:'j2-package-journey.mjs',start:'return f.evaluate(',end:'\n });}',options:{offlineFirstSend:true,offlineHistory:true,offlineOldSendTerminal:true}},
 {file:'j2-fast-retry-package.mjs',start:'return f.evaluate(',end:'\n });}',options:{offlineFirstSend:true,offlineHistory:true,offlineOldSendTerminal:true}},
 {file:'j3-package-journey.mjs',start:'const projection=await reader.evaluate(',end:'\n },facts);',options:{offlineSnippets:true,offlineHistory:true}},
 {file:'sys05-stream-package-journey.mjs',start:'return f.evaluate(',end:'\n  },{scope:expected',options:{offlineContext:true,offlineExistingSend:true,offlineHistory:true}},
];
function actualCallback(row){
 const source=readFileSync(new URL('./'+row.file,import.meta.url),'utf8'),start=source.indexOf(row.start),end=source.indexOf(row.end,start);
 assert(start>=0&&end>start,'actual-evaluate-boundaries: '+row.file);
 const closing=source.indexOf('}',end);
 return source.slice(start+row.start.length,closing+1);
}
const witness=s=>({sourceId:s.id,generation:s.generation,sourceRevision:s.sourceRevision,observedAt:s.observedAt,revoked:false});
function source(profile,codecVersion){return {id:(codecVersion===1?'host_ack_':'host_history_')+digest(profile.id).slice(0,32),generation:'profile_'+profile.revision,sourceRevision:1,observedAt:'2026-10-16T00:04:22.000Z',validUntil:'2026-10-16T00:05:22.000Z',channel:'host-evidence',codecVersion,profileId:profile.id,profileVersion:profile.revision,revoked:false};}
function sample(config){
 const h=source(config.historicalSendProfile,2),evidence={format:'vaiwl-free-evidence-v1',scopeKey:scope.key,revision:3,sources:{[h.id]:h},events:{old:{id:'old',...witness(h),conversationId:C,messageId:'j4_original_old',branchId:'lineage',actorVerified:true,actorScopeKey:scope.key,role:'user',kind:'new-send',sendState:'committed',sentAt:OLD,precision:'millisecond'}},hints:{},coverage:{}};
 if(config.sendAckProfile){const a=source(config.sendAckProfile,1);evidence.sources[a.id]=a;evidence.hints.ack={id:'ack',...witness(a),conversationId:C,messageId:'new-message',eventKey:'ack',hintType:'observed-self-send',anchorVersion:1,firstObservedAt:a.observedAt,candidateInterval:{from:'2026-10-16T00:04:21.990Z',through:a.observedAt},clockBasis:'local-bounded',calibrationDueAt:a.validUntil,actorVerified:true,actorScopeKey:scope.key,ackWitness:{kind:'authenticated-message-readback',profileId:a.profileId,profileVersion:a.profileVersion,semanticFingerprint:digest('fixture-native-ACK')}};}
 const native=applyNativeObservations(emptyNativeFacts(scope),{scopeKey:scope.key,sourceRevision:1,observedAt:'2026-10-16T00:04:21.000Z',validUntil:'2026-10-16T00:10:00.000Z',projects:[],refs:[{id:C,nativeTitle:'Old native conversation',nativeUrl:origin+'/c/'+C,availability:'available'}],membership:[{id:C,state:'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}},{scope,channel:'synthetic',sourceId:'native-fixture',generation:'first',now:NOW});
 return {native,evidence};
}
async function setup(t,row){
 const dir=mkdtempSync(join(tmpdir(),'journey-source-callback-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const built=packageHost(join(dir,'package'),{offlineOrigin:origin,...row.options}),{HOST_CONFIG:config}=await import(pathToFileURL(join(built.unpacked,'extension/config.mjs')).href);
 const indexedDB=new MockIDBFactory(),base=new ScopeRepository({indexedDB}),db=await base.open();t.after(()=>base.close());
 // The existing MockIDB omits getAll. Add only this read operation through its
 // real cursor queue; never replace the callback's read or production modules.
 const storePrototype=Object.getPrototypeOf(db.transaction('b23_views','readonly').objectStore('b23_views')),priorGetAll=Object.getOwnPropertyDescriptor(storePrototype,'getAll');
 Object.defineProperty(storePrototype,'getAll',{configurable:true,value:function(){
  const result={result:undefined},rows=[],cursor=this.openCursor();
  cursor.onsuccess=()=>{if(cursor.result){rows.push(cursor.result.value);cursor.result.continue();}else{result.result=rows;result.onsuccess?.({target:result});}};
  cursor.onerror=()=>{result.error=cursor.error;result.onerror?.({target:result});};return result;
 }});
 t.after(()=>{if(priorGetAll)Object.defineProperty(storePrototype,'getAll',priorGetAll);else delete storePrototype.getAll;});
 const snapshot=sample(config),chrome={runtime:{getURL:path=>pathToFileURL(join(built.unpacked,path)).href}};
 class FixedDate extends Date {constructor(...args){super(...(args.length?args:[NOW]));}static now(){return Date.parse(NOW);}}
 const callback=Function('chrome','indexedDB','Date','"use strict";return ('+actualCallback(row)+');')(chrome,indexedDB,FixedDate);
 async function read(evidence=snapshot.evidence){
  validateFreeEvidence(evidence,scope);
  const key=freeEvidenceKey(scope.key);
  await new Promise((resolve,reject)=>{const tx=db.transaction(['native_states','native_operations'],'readwrite');for(const [id,payload]of [[scope.key,snapshot.native],[key,evidence]]){tx.objectStore('native_states').put(evidenceRecord(id,payload));tx.objectStore('native_operations').put(evidenceRecord(id,{revision:payload.revision}));}tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  // J3's actual outer historyFacts has already read/validated both snapshots.
  const {NativeRepository}=await import(pathToFileURL(join(built.unpacked,'src/data/native-repository.mjs')).href),{FreeEvidenceRepository}=await import(pathToFileURL(join(built.unpacked,'src/data/free-evidence-repository.mjs')).href);
  const native=await new NativeRepository({baseRepository:base}).read(scope),validated=await new FreeEvidenceRepository({baseRepository:base}).read(scope),before=JSON.stringify({native,evidence:validated});
  const result=await callback({scope,c:C,origin,native,evidence:validated});
  assert.equal(JSON.stringify({native,evidence:validated}),before,'callback cannot mutate validated inputs');
  assert.deepEqual(await new FreeEvidenceRepository({baseRepository:base}).read(scope),evidence,'callback cannot renew stored evidence');
  return result.activity??result.decisions.find(r=>r.id===C)?.activity;
 }
 return {read,evidence:snapshot.evidence,config};
}
for(const row of runners){
 test(row.file+': actual callback admits configured sources and preserves provisional/exact boundary',async t=>{
  const h=await setup(t,row),activity=await h.read();assert.equal(activity.basis,'provisional');assert.equal(activity.segment,h.config.sendAckProfile?0:3);assert.equal(activity.reason,h.config.sendAckProfile?'observed-self-send':'historical-anchor-incomplete');
  const historical=structuredClone(h.evidence);historical.hints={};const old=await h.read(historical);assert.equal(old.basis,'provisional');assert.equal(old.reason,'historical-anchor-incomplete');assert.equal(old.segment,3);
 });
 test(row.file+': actual callback requires complete source family, never reuses revoked predecessor evidence',async t=>{
  const h=await setup(t,row),recovered=structuredClone(h.evidence);
  for(const predecessor of Object.values(recovered.sources)){predecessor.revoked=true;const successor={...predecessor,id:predecessor.id+'_r1',generation:predecessor.generation+'_recovery_1',revoked:false};recovered.sources[successor.id]=successor;}
  assert.equal((await h.read(recovered)).basis,'undated');
  const history=Object.values(recovered.sources).find(s=>s.codecVersion===2&&!s.revoked);recovered.events.fresh={...recovered.events.old,id:'fresh',...witness(history)};
  const fresh=await h.read(recovered);assert.equal(fresh.basis,'provisional');assert.equal(fresh.segment,3);assert.equal(fresh.reason,'historical-anchor-incomplete');
  delete recovered.sources[history.id.slice(0,-3)];delete recovered.events.old;assert.equal((await h.read(recovered)).basis,'undated','missing family predecessor must not admit successor');
 });
}
