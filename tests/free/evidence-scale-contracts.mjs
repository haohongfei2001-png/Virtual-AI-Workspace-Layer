import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {FreeEvidenceRepository,freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {emptyFreeEvidence,applyFreeEvidence} from '../../src/data/free-evidence.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {digest} from '../../src/data/hash.mjs';
const now='2026-10-13T12:00:00Z',scope=scopeOf('A');
const check=(value,message)=>{if(!value)throw Error(message);};
const elapsed=start=>Math.round((performance.now()-start)*100)/100;
async function fixture(){
 const name='free_evidence_scale_'+crypto.randomUUID(),base=new ScopeRepository({indexedDB,databaseName:name}),otherBase=new ScopeRepository({indexedDB,databaseName:name});
 let sourceId='scale';
 const gate=()=>({channel:'synthetic',sourceId,generation:'first'}),make=baseRepository=>new FreeEvidenceRepository({baseRepository,observationGate:gate,clock:()=>now});
 return {base,otherBase,repo:make(base),other:make(otherBase),setSource:value=>{sourceId=value;},get sourceId(){return sourceId;},
  async close(){base.close();otherBase.close();await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(name);request.onsuccess=resolve;request.onerror=()=>reject(request.error);});}};
}
const source=(id,revision)=>({id,generation:'first',sourceRevision:revision,observedAt:now,validUntil:'2026-10-14T00:00:00Z',channel:'synthetic'});
function event(i,revision,sourceId='scale'){
 return {id:`e${i}`,sourceId,generation:'first',sourceRevision:revision,observedAt:now,conversationId:`c${i}`,messageId:`m${i}`,branchId:'main',actorVerified:true,actorScopeKey:emptyFreeEvidence(scope).scopeKey,role:'user',kind:'new-send',sendState:'committed',precision:'second',sentAt:now};
}
const batch=(revision,events=[],hints=[],sourceId='scale')=>({sources:[source(sourceId,revision)],events,hints,coverage:[]});
const pageEvidence=page=>page.evidence;
export async function runEvidenceScale(size){
 const h=await fixture(),result={size,distribution:'one-event-per-conversation',evidence:'REAL_BROWSER_INDEXEDDB_SYNTHETIC_ONLY'};let revision=0;
 try{
  let start=performance.now();
  for(let offset=0;offset<size;offset+=5000){const events=Array.from({length:Math.min(5000,size-offset)},(_,i)=>event(offset+i,revision+1));
   const applied=await h.repo.apply(scope,{operationId:`seed${offset}`,expectedRevision:revision,batch:batch(revision+1,events)});check(applied.ok,'seed:'+JSON.stringify(applied));revision++;
  }
  result.seedMs=elapsed(start);start=performance.now();const header=await h.repo.header(scope);result.headerMs=elapsed(start);
  check(Object.keys(header.manifest.refVersions).length===size,'header-ref-count');
  start=performance.now();const tail=await h.repo.page(scope,{revision,offset:size-50,limit:50});result.tailPageMs=elapsed(start);
  check(tail.selectedRefs.length===50&&tail.selectedRefs.includes(`c${size-1}`),'tail-not-reachable');
  check(Object.keys(pageEvidence(tail).events).length===50,'tail-event-count-or-unbounded');
  start=performance.now();const all=await h.repo.read(scope);result.fullReadMs=elapsed(start);check(Object.keys(all.events).length===size,'full-read-lost-events');
  const hint={id:'tail_hint',sourceId:'scale',generation:'first',sourceRevision:revision+1,observedAt:now,conversationId:`c${size-1}`,eventKey:'tail_send',hintType:'local-confirmed-send',validUntil:'2026-10-13T12:10:00Z',candidateInterval:null,actorVerified:true,actorScopeKey:all.scopeKey};
  const request={operationId:'first',expectedRevision:revision,batch:batch(revision+1,[],[hint])};
  start=performance.now();const raced=await Promise.all([h.repo.apply(scope,request),h.other.apply(scope,{...request,operationId:'second'})]);result.concurrentIncrementalMs=elapsed(start);
  check(raced.filter(row=>row.ok).length===1&&raced.filter(row=>row.reason==='revision-conflict').length===1,'CAS');
  const winner=raced[0].ok?'first':'second';check((await h.repo.apply(scope,{...request,operationId:winner})).replayed,'receipt-replay');revision++;
  let stale=false;try{await h.repo.page(scope,{revision:revision-1,offset:0,limit:50});}catch(error){stale=error.message.includes('revision');}check(stale,'old-page-not-refused');
  const after=await h.repo.page(scope,{revision,ids:[`c${size-1}`],offset:0,limit:1});check(Object.keys(pageEvidence(after).hints).length===1,'incremental-hint-missing');
  check((await h.repo.read(scopeOf('B'))).revision===0,'cross-scope');
  check((await h.repo.invalidate(scope,{operationId:'revoke',expectedRevision:revision,sourceId:'scale'})).ok,'revoke');revision++;
  h.base.close();const revoked=await h.repo.header(scope);check(revoked.sources.scale.revoked===true,'revocation-not-durable');
  const denied=await h.repo.apply(scope,{operationId:'late',expectedRevision:revision,batch:batch(revision+1,[])});check(!denied.ok&&denied.reason.includes('revoked'),'source-replayed');
  result.status='PASS';
 }catch(error){result.status='FAIL';result.error=error.stack;}
 finally{await h.close();}
 return result;
}

export async function runEvidenceMigrationRecovery(){
 const h=await fixture(),result={name:'v1 migration and root recovery revoke sources without losing events',evidence:'REAL_BROWSER_INDEXEDDB_SYNTHETIC_ONLY'};
 try{
  const legacy=applyFreeEvidence(emptyFreeEvidence(scope),{type:'OBSERVE_FREE_EVIDENCE',batch:batch(1,[event(0,1)])},{scope,now,channel:'synthetic'}),key=freeEvidenceKey(legacy.scopeKey);
  const db=await h.base.open();await new Promise((resolve,reject)=>{const tx=db.transaction(['native_states','native_operations'],'readwrite');for(const [store,payload]of [['native_states',legacy],['native_operations',{revision:legacy.revision}]])tx.objectStore(store).put({key,payload,checksum:digest(payload)});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  check((await h.repo.read(scope)).format==='vaiwl-free-evidence-v1','v1-reader');
  const migrated=await h.repo.apply(scope,{operationId:'migrate',expectedRevision:1,batch:batch(2,[event(1,2)])});check(migrated.ok,'migrate:'+JSON.stringify(migrated));
  const head=await h.repo.header(scope);check(Object.keys(head.manifest.refVersions).length===2,'migration-refs');
  const damagedHash=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),request=store.get(key);let hash;request.onsuccess=()=>{const row={...request.result,checksum:'damaged'};hash=digest(row);store.put(row);};tx.oncomplete=()=>resolve(hash);tx.onabort=()=>reject(tx.error);});
  const recovered=await h.repo.recover(scope,{operationId:'recover',damagedHash});check(recovered.ok&&recovered.evidenceInvalidated,'recovery:'+JSON.stringify(recovered));
  const facts=await h.repo.read(scope);check(Object.keys(facts.events).length===2&&facts.sources.scale.revoked,'recovery-lost-history-or-authority');
  check(!(await h.repo.apply(scope,{operationId:'revoked-replay',expectedRevision:facts.revision,batch:batch(3,[])})).ok,'recovery-replayed-grant');
  h.setSource('new_authority');const fresh=await h.repo.apply(scope,{operationId:'fresh',expectedRevision:facts.revision,batch:batch(1,[event(2,1,'new_authority')],[],'new_authority')});check(fresh.ok,'fresh-source:'+JSON.stringify(fresh));
  check((await h.repo.recover(scope,{operationId:'recover',damagedHash})).replayed,'recovery-receipt');check((await h.repo.read(scope)).sources.new_authority.revoked===false,'recovery-replay-erased-fresh-authority');
  result.status='PASS';
 }catch(error){result.status='FAIL';result.error=error.stack;}
 finally{await h.close();}
 return result;
}
