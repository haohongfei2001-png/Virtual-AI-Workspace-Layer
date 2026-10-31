import {j2Within} from './j2-runner-bounds.mjs';
/** Real extension-origin IDB and production recovery owner; synthetic authority.
 * Selects last-write/commit timing, never directly aborts or invents a receipt.
 * Does not certify browser revocation delivery or real account access.
 */
export async function verifyRecoveryRetirement(probe){return j2Within('recovery-retirement-boundaries',()=>probe.evaluate(async()=>{
 const load=p=>import(chrome.runtime.getURL(p));
 const {createHostRecoveryService}=await load('src/runtime/host-recovery-service.mjs'),{ScopeRepository}=await load('src/b1/scope-repository.mjs'),{WorkspaceRepository}=await load('src/data/repository.mjs'),{NativeRepository}=await load('src/data/native-repository.mjs'),{FreeEvidenceRepository,freeEvidenceKey}=await load('src/data/free-evidence-repository.mjs'),{freeRecoveryStatus}=await load('src/data/free-recovery-status.mjs'),{normalizedScope}=await load('src/b1/identity.mjs');
 const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'recovery-boundary-fixture',organizationId:'personal'}),results=[],check=(ok,why)=>{if(!ok)throw Error(why);};
 for(const kind of ['workspace','native','evidence'])for(const action of ['normal','ui','parent','committed','ttl','ttl-committed']){
  const base=new ScopeRepository({indexedDB,databaseName:'recovery-boundary-'+kind+'-'+action});let service;
  try{
   const now='2026-10-13T12:00:00Z',validUntil='2026-10-14T00:00:00Z',gate=()=>({channel:'synthetic',sourceId:'fixture',generation:'first'}),workspace=new WorkspaceRepository({baseRepository:base}),native=new NativeRepository({baseRepository:base,observationGate:gate,clock:()=>now}),evidence=new FreeEvidenceRepository({baseRepository:base,observationGate:gate,clock:()=>now});
   for(const [i,id]of ['human_one','human_two'].entries())check((await workspace.command(scope,{operationId:id,expectedRevision:i,command:{type:'CREATE_WORKSPACE',id,name:id}})).ok,'human-seed');
   check((await native.apply(scope,{operationId:'native_seed',expectedRevision:0,batch:{scopeKey:scope.key,sourceRevision:1,observedAt:now,validUntil,projects:[],refs:[{id:'R',nativeTitle:'Fixture',nativeUrl:'https://fixture.test/c/R',availability:'available'}],membership:[{id:'R',state:'NONE',projectId:null}],inventory:{projects:'complete',conversations:'complete',cursor:null}}})).ok,'native-seed');
   check((await evidence.apply(scope,{operationId:'evidence_seed',expectedRevision:0,batch:{sources:[{id:'fixture',generation:'first',sourceRevision:1,observedAt:now,validUntil,channel:'synthetic'}],events:[{sourceId:'fixture',generation:'first',sourceRevision:1,observedAt:now,id:'send',conversationId:'R',messageId:'m',branchId:'b',actorVerified:true,actorScopeKey:scope.key,role:'user',kind:'new-send',sendState:'committed',precision:'second',sentAt:now}],hints:[],coverage:[]}})).ok,'evidence-seed');
   check((await native.migrateVersionIndex(scope,{operationId:'native_migrate',expectedRevision:1})).ok,'native-index');check((await evidence.migrateRefDirectory(scope,{operationId:'evidence_migrate',expectedRevision:1})).ok,'evidence-index');
   const targetRepo={workspace,native,evidence}[kind],rawBefore=await targetRepo.read(scope),factsBefore=kind==='workspace'?rawBefore.state:rawBefore;
   const db=await base.open(),human=JSON.stringify((await workspace.read(scope)).state.workspaces),storeName=kind==='workspace'?'b23_states':'native_states',key=kind==='evidence'?freeEvidenceKey(scope.key):scope.key;
   await new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite'),s=tx.objectStore(storeName),q=s.get(key);q.onsuccess=()=>s.put({...q.result,checksum:'0'.repeat(64)});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
   const snapshot=()=>new Promise((resolve,reject)=>{const names=[...db.objectStoreNames],tx=db.transaction(names),out={};for(const name of names){const q=tx.objectStore(name).getAll();q.onsuccess=()=>out[name]=q.result;}tx.oncomplete=()=>resolve(JSON.stringify(out));tx.onabort=()=>reject(tx.error);});
   let time=0,seq=0;const timers=new Map(),ttl=action.startsWith('ttl');
   const clock=ttl?{elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++seq;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)}:{};
   service=createHostRecoveryService({...clock,ui:{withScope:async(_,work)=>work({scope,scopeGrantId:'scope-grant',parentFrame:{documentId:'parent'},isCurrent:()=>true})},workspaceRepository:workspace,readService:{async freeRecoveryStatus(s,o){return {native:await freeRecoveryStatus(native,s,'native',o),evidence:await freeRecoveryStatus(evidence,s,'evidence',o)};},freeRecover:(s,r,o)=>(r.kind==='native'?native:evidence).recover(s,r,o)}});
   const request=(type,rest={})=>service.handle({v:1,type,grantId:'grant',mountId:'mount',...rest},{documentId:'ui'}),status=await request('HOST_UI_RECOVERY_STATUS');check(status.ok&&status.plans[kind].recoverable,'repair-plan');
   if(ttl)time=19998;
   const before=await snapshot(),transaction=db.transaction.bind(db),operations=kind==='workspace'?'b23_operations':'native_operations',method=kind==='workspace'?'add':'put';let reached=0,idleDuring;
   const retire=()=>{reached++;if(ttl){time=20000;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}else service.revokeDocument(action==='parent'?'parent':'ui');idleDuring=service.isIdle();};
   db.transaction=(stores,mode,...rest)=>{const tx=transaction(stores,mode,...rest);if(mode==='readwrite'&&Array.from(stores).includes(operations)){
    if(action==='committed'||action==='ttl-committed')tx.addEventListener('complete',retire,{once:true});
    else if(action!=='normal'){const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name),write=store[method].bind(store);if(name===operations)store[method]=value=>{const q=write(value),p=value.payload;if(p?.type==='RECOVER'||p?.kind===(kind==='native'?'RECOVER_NATIVE':'RECOVER_FREE_EVIDENCE'))queueMicrotask(retire);return q;};return store;};}
   }return tx;};
   const result=await request('HOST_UI_RECOVER',{kind,planId:status.plans[kind].planId,operationId:'boundary_repair'});db.transaction=transaction;
   const after=await snapshot(),committed=action==='normal'||action==='committed'||action==='ttl-committed';check(result.ok===(action==='normal'),'owner-result-'+kind+'-'+action);check((before!==after)===committed,'persistent-result-'+kind+'-'+action);
   if(action!=='normal')check(reached===1&&idleDuring===false,'boundary-or-accounting');
   if(committed){const raw=await targetRepo.read(scope),state=kind==='workspace'?raw.state:raw;check(state.revision>factsBefore.revision,'recovery-revision');
    if(kind!=='workspace'){check(Object.values(state.sources).length>0&&Object.values(state.sources).every(s=>s.revoked===true),'sources-revoked');for(const table of kind==='native'?['projects','refs','membership']:['events','hints','coverage'])check(JSON.stringify(state[table])===JSON.stringify(factsBefore[table]),'preserved-'+table);}
    const receipt=await new Promise((resolve,reject)=>{const tx=db.transaction(operations),q=tx.objectStore(operations).getAll();tx.oncomplete=()=>resolve(q.result.map(r=>r.payload).filter(p=>p?.operationId==='boundary_repair'||p?.id==='boundary_repair'));tx.onabort=()=>reject(tx.error);});
    check(receipt.length===1&&(kind==='workspace'?receipt[0].type==='RECOVER'&&receipt[0].resultRevision===state.revision:receipt[0].kind===(kind==='native'?'RECOVER_NATIVE':'RECOVER_FREE_EVIDENCE')&&receipt[0].revision===state.revision),'recovery-receipt');
   }
   if(committed||kind!=='workspace')check(JSON.stringify((await workspace.read(scope)).state.workspaces)===human,'human-assets');
   if(ttl)check(timers.size===0,'ttl-timer-cleanup');
   results.push({kind,action,clockEvidence:ttl?'CONTROLLED_ELAPSED_AND_DUE_TIMER_DELIVERY':'REAL_ELAPSED',ownerOK:result.ok,committed,storesUnchanged:before===after,retirementWitnessed:action!=='normal'});
  }finally{service?.stop();base.close();}
 }
 return {evidence:'PRODUCTION_RECOVERY_OWNER_REAL_IDB_SYNTHETIC_UI_AUTHORITY',results};
}),15000);}
