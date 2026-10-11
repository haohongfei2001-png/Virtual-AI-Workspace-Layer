/** Audit counterexamples. Mock IDB exercises ordering/abort contracts, NOT disk persistence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockIDBFactory } from './mock-idb.mjs';
import { harness, A } from './contracts.mjs';
import { createDocumentBindingBroker } from '../../src/b1/document-binding-broker.mjs';
import { normalizedScope } from '../../src/b1/identity.mjs';
import { reduceCommand } from '../../src/data/state.mjs';
import { persistentSeed } from '../../simulator/persistent-seed.mjs';
import { FIXTURE_NOW } from '../../simulator/data.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const view={segment:2,oldOpen:[],sidebarOpen:[],capacities:[],scroll:150,sidebarVisible:true};
async function corrupt(h, revision){
  const db=await h.base.open();
  await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite'),s=tx.objectStore('b23_states'),r=s.get(normalizedScope(A).key);r.onsuccess=()=>{const row=r.result;row.checksum='intentional-audit-corruption';if(revision!==undefined)row.payload.revision=revision;s.put(row);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
}
function interceptPut(db,storeName,action){
  const original=db.transaction.bind(db);
  db.transaction=(names,mode)=>{const tx=original(names,mode),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const s=objectStore(name);if(name===storeName){const put=s.put.bind(s);s.put=value=>{const req=put(value);action();return req;};}return s;};return tx;};
  return ()=>{db.transaction=original;};
}

test('AUDIT01 final awaited frame cannot outlive explicit broker revocation',async()=>{
  const entered=deferred(),release=deferred();let armed=false,calls=0;
  const frame={documentId:'audit_doc',url:'http://127.0.0.1:48173/b1-fixture/A.html',documentLifecycle:'active'};
  const sender={id:'audit_ext',tab:{id:1},frameId:0,...frame};
  const broker=createDocumentBindingBroker({extensionId:'audit_ext',
    getFrame:async()=>{if(armed&&++calls===4){entered.resolve();await release.promise;}return {...frame};},
    resolveScope:async()=>A,repository:{},workspaceRepository:{snapshot:async()=>({syntheticSecret:'A'})}});
  const bound=await broker.handle({v:1,type:'BIND',clientId:'client',seq:1},sender);assert(bound.ok);
  armed=true;const pending=broker.handle({v:1,type:'B23_SNAPSHOT',clientId:'client',seq:2,leaseId:bound.leaseId,now:FIXTURE_NOW,timeZone:'UTC',size:120},sender);
  await entered.promise;broker.invalidate({tabId:1});release.resolve();
  const result=await pending;assert.equal(result.ok,false);assert.equal('snapshot' in result,false);
});

test('AUDIT02 view transaction aborts on revocation after put is queued',async()=>{
  const h=await harness(new MockIDBFactory()),abort=new AbortController();let restore;
  try{const db=await h.base.open();restore=interceptPut(db,'b23_views',()=>abort.abort());
    const result=await h.repo.saveView(A,view,0,{signal:abort.signal});restore();
    assert.equal(result.ok,false);assert.equal((await h.repo.read(A)).view,null);
  }finally{restore?.();h.close();}
});

test('AUDIT03 recovery never resurrects revoked source or activity evidence',async()=>{
  const h=await harness(new MockIDBFactory());
  try{await h.command({type:'SET_TITLE',refId:'T0',title:'keep-checkpoint'});
    await h.command({type:'REVOKE_SOURCE',sourceId:'fixture_v1'});await corrupt(h);
    const status=await h.repo.recoveryStatus(A);assert(status.recoverable);
    assert((await h.repo.recover(A,{operationId:'recovery_revocation',damagedHash:status.damagedHash})).ok);
    const data=await h.repo.snapshot(A,FIXTURE_NOW,'UTC');
    assert(data.groups.every(w=>w.segment===null),'checkpoint has resurrected revoked activity');
    assert.equal(data.refs.find(r=>r.id==='T0').displayTitle,'keep-checkpoint');
  }finally{h.close();}
});

test('AUDIT04 recovery makes discarded operation receipts non-replayable',async()=>{
  const h=await harness(new MockIDBFactory());
  try{const request={operationId:'lost_edit',expectedRevision:1,command:{type:'SET_TITLE',refId:'T0',title:'lost-by-explicit-recovery'}};
    assert((await h.repo.command(A,request)).ok);await corrupt(h);
    const status=await h.repo.recoveryStatus(A);assert((await h.repo.recover(A,{operationId:'recover_receipts',damagedHash:status.damagedHash})).ok);
    assert.notEqual((await h.repo.read(A)).state.identities.T0.title,request.command.title);
    const replay=await h.repo.command(A,request);
    assert.equal(replay.ok,false,'a discarded operation cannot be reported successful again');
  }finally{h.close();}
});

test('AUDIT05 recovery revision exceeds trusted operation high-water',async()=>{
  const h=await harness(new MockIDBFactory());
  try{await h.command({type:'SET_TITLE',refId:'T0',title:'checkpoint'});await h.command({type:'SET_TITLE',refId:'T1',title:'last-committed'});
    const before=(await h.repo.read(A)).state.revision;await corrupt(h,0);
    const status=await h.repo.recoveryStatus(A);assert((await h.repo.recover(A,{operationId:'recover_revision',damagedHash:status.damagedHash})).ok);
    assert((await h.repo.read(A)).state.revision>before,'untrusted corrupt revision causes CAS ABA');
  }finally{h.close();}
});

test('AUDIT06 reserved inherited foreign keys cannot impersonate evidence sources',()=>{
  const state=persistentSeed(A,'https://vaiwl-hf.test'),event={...state.events.event_T0,id:'forged_source',sourceId:'__proto__'};delete event.revoked;
  const batch={schema:'vaiwl-internal-evidence-v1',refs:[],sources:[],events:[event],coverage:[]};
  assert.throws(()=>reduceCommand(state,{type:'INGEST',batch},'evidence'));
});

test('AUDIT07 recovery itself observes an abort after put is queued',async()=>{
  const h=await harness(new MockIDBFactory()),abort=new AbortController();let restore;
  try{await h.command({type:'SET_TITLE',refId:'T0',title:'checkpoint'});await corrupt(h);const status=await h.repo.recoveryStatus(A);
    restore=interceptPut(await h.base.open(),'b23_states',()=>abort.abort());
    const result=await h.repo.recover(A,{operationId:'abort_recovery',damagedHash:status.damagedHash},{signal:abort.signal});restore();
    assert.equal(result.ok,false);assert.equal((await h.repo.recoveryStatus(A)).corrupt,true);
  }finally{restore?.();h.close();}
});
