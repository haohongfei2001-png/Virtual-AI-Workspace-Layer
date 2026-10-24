// Reconstructed portable synthetic contracts. MockIDB is not browser durability evidence.
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {FreeEvidenceRepository,freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {freeRecoveryStatus} from '../../src/data/free-recovery-status.mjs';
import {emptyState} from '../../src/data/state.mjs';
import {createBackup} from '../../src/data/backup.mjs';
import {syntheticEvidenceGate} from '../../simulator/persistent-seed.mjs';
import {createHostBackupService} from '../../src/runtime/host-backup-service.mjs';
import {createHostRecoveryService} from '../../src/runtime/host-recovery-service.mjs';
import {encodeBackupChunk,BACKUP_CHUNK_BYTES} from '../../src/host/backup-transfer.mjs';
const assert=(value,message)=>{if(!value)throw Error(message??'assertion failed');};
const scope=normalizedScope({verified:true,provider:'hf_synthetic_only',accountId:'A',organizationId:'fixture_org'});
const healthy={corrupt:false,recoverable:false};
export const recoveryDeadlineCases=()=>['backup','backup-ref','backup-retention','workspace','partitioned','shared','native','evidence'].flatMap(kind=>(['native','evidence'].includes(kind)?['before','expired','committed','aborted']:['before','expired','committed']).flatMap(boundary=>['ttl','rpc'].map(deadline=>({kind,boundary,deadline}))));
async function snapshot(db){return new Promise((resolve,reject)=>{const names=Array.from(db.objectStoreNames),tx=db.transaction(names),rows={};for(const name of names){rows[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const c=q.result;if(c){rows[name].push([c.primaryKey,c.value]);c.continue();}};}tx.oncomplete=()=>resolve(JSON.stringify(rows));tx.onabort=()=>reject(tx.error);});}
async function damage(db,store,key){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),s=tx.objectStore(store),q=s.get(key);q.onsuccess=()=>{assert(q.result,'damage requires existing root');s.put({...q.result,checksum:'0'.repeat(64)});};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
function seed(){const s=emptyState(scope);s.revision=1;s.channel='synthetic';s.refs.R={id:'R',nativeUrl:'https://fixture.test/c/R',nativeTitle:'R',projectId:null,available:true};s.identities.R={id:'R',title:'R',aliases:[],owner:'bootstrap',locked:false,revision:1};return s;}
function beforeEvent(target,name,fn){if(typeof target.addEventListener==='function'){target.addEventListener(name,fn,{once:true});return;}let handler;Object.defineProperty(target,'on'+name,{configurable:true,get:()=>event=>{fn(event);handler?.(event);},set:value=>{handler=value;}});}
export async function recoveryDeadlineCase(indexedDB,kind,boundary,deadline='ttl'){
 const base=new ScopeRepository({indexedDB,databaseName:'recoverydeadline_'+crypto.randomUUID()}),workspace=new WorkspaceRepository({baseRepository:base,evidenceGate:syntheticEvidenceGate});
 let service,restoreTransaction;try{
 const db=await base.open();let time=0,sequence=0;const timers=new Map(),elapsedNow=()=>time,schedule=fn=>{const id=++sequence;timers.set(id,fn);return id;},cancel=id=>timers.delete(id);
 const ui={async withScope({sender,grantId,mountId},fn){assert(sender.documentId==='ui'&&grantId==='grant'&&mountId==='mount','scope authority');return fn({scope,scopeGrantId:'sg',isCurrent:()=>true,parentFrame:{documentId:'parent'}});}};
 const request=(type,extra={})=>service.handle({v:1,type,grantId:'grant',mountId:'mount',...extra},{documentId:'ui'});
 let action;
 if(kind.startsWith('backup')){
  let bundle;
  if(kind==='backup-retention'){
   assert((await workspace.initializePartitioned(scope,seed())).ok,'partition seed');assert((await workspace.migrateSharedDirectory(scope,{operationId:'migrate',expectedRevision:1})).ok,'shared migration');
   assert((await workspace.command(scope,{operationId:'title',expectedRevision:2,command:{type:'SET_TITLE',refId:'R',title:'Human title'}})).ok,'human title');bundle=await workspace.exportBackup(scope);
  }else if(kind==='backup-ref')bundle=createBackup(seed());
  else{assert((await workspace.command(scope,{operationId:'human',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'human',name:'Human asset'}})).ok,'human seed');bundle=await workspace.exportBackup(scope);}
  service=createHostBackupService({ui,workspaceRepository:workspace,elapsedNow,schedule,cancel,makeId:()=> 'id'+(++sequence)});
  const bytes=new TextEncoder().encode(JSON.stringify(bundle)),upload=await request('HOST_UI_BACKUP_UPLOAD',{byteLength:bytes.length});assert(upload.ok,'upload');
  for(let index=0;index<upload.chunkCount;index++)assert((await request('HOST_UI_BACKUP_CHUNK',{transferId:upload.transferId,index,data:encodeBackupChunk(bytes.subarray(index*BACKUP_CHUNK_BYTES,(index+1)*BACKUP_CHUNK_BYTES))})).ok,'chunk');
  const plan=await request('HOST_UI_BACKUP_PREVIEW',{transferId:upload.transferId});assert(plan.ok,'backup plan');action=()=>request('HOST_UI_BACKUP_RESTORE',{transferId:upload.transferId,planId:plan.planId,operationId:'restore'});
 }else{
  let native,evidence;
  if(kind==='native'||kind==='evidence'){
   const now='2026-10-13T12:00:00Z',validUntil='2026-10-14T00:00:00Z',observationGate=()=>({channel:'synthetic',sourceId:'fixture',generation:'first'});
   native=new NativeRepository({baseRepository:base,observationGate,clock:()=>now});evidence=new FreeEvidenceRepository({baseRepository:base,observationGate,clock:()=>now});
   assert((await native.apply(scope,{operationId:'native_seed',expectedRevision:0,batch:{scopeKey:scope.key,sourceRevision:1,observedAt:now,validUntil,projects:[],refs:[{id:'R',nativeTitle:'Native chat',nativeUrl:'https://fixture.test/c/R',availability:'available'}],membership:[{id:'R',state:'NONE',projectId:null}],inventory:{projects:'complete',conversations:'complete',cursor:null}}})).ok,'native seed');
   const witness={sourceId:'fixture',generation:'first',sourceRevision:1,observedAt:now};assert((await evidence.apply(scope,{operationId:'evidence_seed',expectedRevision:0,batch:{sources:[{id:'fixture',generation:'first',sourceRevision:1,observedAt:now,validUntil,channel:'synthetic'}],events:[{...witness,id:'send',conversationId:'R',messageId:'m',branchId:'b',actorVerified:true,actorScopeKey:scope.key,role:'user',kind:'new-send',sendState:'committed',precision:'second',sentAt:now}],hints:[],coverage:[]}})).ok,'evidence seed');
   assert((await native.migrateVersionIndex(scope,{operationId:'native_migrate',expectedRevision:1})).ok,'native migration');assert((await evidence.migrateRefDirectory(scope,{operationId:'evidence_migrate',expectedRevision:1})).ok,'evidence migration');
   await damage(db,'native_states',kind==='native'?scope.key:freeEvidenceKey(scope.key));
  }else{
   if(kind==='partitioned'||kind==='shared'){assert((await workspace.initializePartitioned(scope,seed())).ok,'partition seed');if(kind==='shared')assert((await workspace.migrateSharedDirectory(scope,{operationId:'migrate',expectedRevision:1})).ok,'shared migration');}
   const revision=(await workspace.read(scope)).state.revision;assert((await workspace.command(scope,{operationId:'human',expectedRevision:revision,command:{type:'CREATE_WORKSPACE',id:'human',name:'Human asset'}})).ok,'human seed');
   if(kind==='workspace')assert((await workspace.command(scope,{operationId:'second',expectedRevision:1,command:{type:'CREATE_WORKSPACE',id:'second',name:'Second human'}})).ok,'checkpoint');
   await damage(db,'b23_states',scope.key);
  }
  const readService={async freeRecoveryStatus(s,o){return native?{native:await freeRecoveryStatus(native,s,'native',o),evidence:await freeRecoveryStatus(evidence,s,'evidence',o)}:{native:healthy,evidence:healthy};},freeRecover(s,r,o){return (r.kind==='native'?native:evidence).recover(s,r,o);}};
  service=createHostRecoveryService({ui,workspaceRepository:workspace,readService,elapsedNow,schedule,cancel,makeId:()=> 'id'+(++sequence)});
  const plan=await request('HOST_UI_RECOVERY_STATUS'),target=kind==='native'||kind==='evidence'?kind:'workspace';assert(plan.ok&&plan.plans[target].recoverable,'recovery plan '+JSON.stringify(plan));action=()=>request('HOST_UI_RECOVER',{kind:target,planId:plan.plans[target].planId,operationId:'repair'});
 }
 const ttl=kind.startsWith('backup')?120000:20000;time=deadline==='ttl'?ttl-2:0;const cutoff=deadline==='ttl'?ttl:6000,before=await snapshot(db);let reached=0,idleDuring;
 const original=db.transaction.bind(db),expire=tx=>{reached++;idleDuring=service.isIdle();if(boundary==='aborted')tx.abort();else time=boundary==='before'?cutoff-1:cutoff;};
 db.transaction=(stores,mode)=>{const tx=original(stores,mode);if(mode==='readwrite'){
  if(boundary==='committed')beforeEvent(tx,'complete',()=>expire(tx));
  else{const objectStore=tx.objectStore.bind(tx),wrapped=new WeakSet();tx.objectStore=name=>{const store=objectStore(name);if(wrapped.has(store))return store;wrapped.add(store);for(const method of ['put','add','delete']){const write=store[method].bind(store);store[method]=value=>{const q=write(value),p=value?.payload;const selected=kind==='backup-ref'?name==='refs'&&method==='put':kind==='backup-retention'?name==='b23_states'&&method==='delete'&&String(value).includes('ref-partition'):name.endsWith('operations')&&(p?.type==='RESTORE_BACKUP'||p?.type==='RECOVER'||p?.kind==='RECOVER_NATIVE'||p?.kind==='RECOVER_FREE_EVIDENCE');if(selected)beforeEvent(q,'success',()=>expire(tx));return q;};}return store;};}
 }return tx;};restoreTransaction=()=>{db.transaction=original;};
 const result=await action();restoreTransaction();restoreTransaction=null;const after=await snapshot(db);
 assert(reached===1,'exact boundary reached once: '+reached);assert(idleDuring===false,'pending persistence remains tracked');assert(result.ok===(boundary==='before'),'owner result '+JSON.stringify(result));
 assert((before===after)===(boundary==='expired'||boundary==='aborted'),'whole database rollback/commit truth');assert(timers.size===0,'timers cleaned');assert(service.isIdle(),'settled owner idle');
 return {kind,boundary,deadline,status:'PASS',reached,timersDelivered:0};
 }finally{restoreTransaction?.();service?.stop();base.close();}
}
