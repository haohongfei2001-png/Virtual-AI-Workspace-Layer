/** Portable SYS02 cases. Caller supplies IndexedDB; explicit offline owner
 * authority is provided by the existing joint fixture. Transaction abort is
 * injected after a successful put, not a physical quota/crash simulation. */
import {createJointObservationFixture} from './joint-observation-fixture.mjs';
import {freeRecoveryStatus} from '../../src/data/free-recovery-status.mjs';
import {freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {digest} from '../../src/data/hash.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {j4AssetBackup,J4_REF} from './fixtures/j4-assets.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const equal=(a,b,message)=>check(digest(a)===digest(b),message);
async function row(h,store,key){const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store),request=tx.objectStore(store).get(key);tx.oncomplete=()=>resolve(request.result??null);tx.onabort=()=>reject(tx.error);});}
async function abortNextWrite(h){
 const db=await h.base.open(),original=db.transaction.bind(db);let fired=0;
 db.transaction=(...args)=>{const tx=original(...args);if(args[1]!=='readwrite'||fired)return tx;const objectStore=tx.objectStore.bind(tx);
  tx.objectStore=name=>{const store=objectStore(name),put=store.put.bind(store);store.put=value=>{const request=put(value);if(!fired){fired++;db.transaction=original;const abort=()=>tx.abort();if(request.addEventListener)request.addEventListener('success',abort,{once:true});else request.onsuccess=abort;}return request;};return store;};return tx;
 };
 return {fired:()=>fired,restore:()=>{db.transaction=original;}};
}
async function corruptEvidenceChecksum(h){const db=await h.base.open(),key=freeEvidenceKey(h.scope.key),before=await row(h,'native_states',key);check(before,'root exists before fault');await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states');store.put({...before,checksum:'completion-repair-checksum-fault'});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});const after=await row(h,'native_states',key);equal(after.payload,before.payload,'fault must not alter evidence payload');check(after.checksum!==before.checksum,'fault must change checksum');}
const manualAssets=state=>({refs:{[J4_REF]:state.refs[J4_REF]},workspaces:state.workspaces,placements:state.placements,identities:state.identities,workingSet:state.preferences.workingSet,savedSnippets:state.preferences.savedSnippets});
const assetCounts=assets=>({humanRefs:Object.keys(assets.refs).length,workspaces:Object.keys(assets.workspaces).length,displayIdentities:Object.keys(assets.identities).length,placements:Object.keys(assets.placements).length,workingSetRefs:assets.workingSet.value.refs.length,savedSnippets:assets.savedSnippets.value.length});
async function restoreManualAssets(workspace,scope,label){
 // Reuse the existing schema-valid J4 asset bundle via real preview + restore.
 // It carries human metadata only: no synthetic or native evidence authority.
 const bundle=j4AssetBackup(scope,'https://host.test'),preview=await workspace.previewRestore(scope,bundle);
 check(preview.evidenceImported===false,'manual backup cannot import authority');
 check((await workspace.restoreBackup(scope,{operationId:'completion_assets_'+label,bundle,...preview})).ok,'manual backup restored '+label);
 let state=(await workspace.read(scope)).state;
 check((await workspace.command(scope,{operationId:'completion_title_'+label,expectedRevision:state.revision,command:{type:'SET_TITLE',refId:J4_REF,title:'Private title for '+label}})).ok,'scope-distinct human title');
 state=(await workspace.read(scope)).state;
 check(state.identities[J4_REF].owner==='human'&&state.identities[J4_REF].locked===true,'locked DisplayIdentity exists');
 check(Object.values(state.placements).some(p=>p.refId===J4_REF&&p.owner==='human'&&p.locked&&!p.excluded),'locked human Placement exists');
 equal(state.preferences.workingSet.value,{refs:[J4_REF],current:J4_REF},'working set has retained human ref');
 check(state.preferences.savedSnippets.value.length===1&&state.preferences.savedSnippets.value[0].refId===J4_REF,'anchored saved snippet exists');
 check(state.refs[J4_REF].nativeUrl==='https://host.test/c/'+J4_REF,'legacy human reference retained');
 for(const table of ['sources','events','coverage'])equal(state[table],{},'manual assets do not create '+table);
 return manualAssets(state);
}
export function createSys02CompletionRepairCases(indexedDB){
 return [false,true].map(repair=>({name:'SYS02 completion abort then '+(repair?'Evidence repair retires pending despite durable receipt':'ordinary restart completes exactly once'),async run(){
  const cleanup=[];const h=await createJointObservationFixture({indexedDB,after:fn=>cleanup.push(fn)});let injection;
  try{
   const second=await createJointObservationFixture({indexedDB,databaseName:h.base.name,principalId:'other-self',contextId:'other-personal',after:fn=>cleanup.push(fn)}),other=second.scope;
   check(other.key!==h.scope.key&&second.base.name===h.base.name,'different scopes share actual database');
   check((await second.ingest(second.surface('Foreign scope native title'))).state==='accepted','foreign native and ACK committed by real owners');
   check((await second.recover()).state==='idle','foreign continuation already drained');
   const workspace=new WorkspaceRepository({baseRepository:h.base});
   const originalManual=await restoreManualAssets(workspace,h.scope,'scope_A');
   const otherManual=await restoreManualAssets(workspace,other,'scope_B');
   check(originalManual.identities[J4_REF].title!==otherManual.identities[J4_REF].title,'scope-distinct values cannot mask cross-scope replacement');
   const workspaceBefore=await workspace.read(h.scope);
   // Same shared repository and schema as the actual owner fixture.
   check((await workspace.command(h.scope,{operationId:'completion_human_asset',expectedRevision:workspaceBefore.state.revision,command:{type:'CREATE_WORKSPACE',id:'human_workspace',name:'Human preserved workspace'}})).ok,'human asset setup');
   const humanWorkspace=(await workspace.read(h.scope)).state.workspaces.human_workspace;
   const manualBefore=manualAssets((await workspace.read(h.scope)).state);
   const otherBefore={native:await h.native.read(other),evidence:await h.free.read(other),workspace:(await workspace.read(other)).state};
   check(Object.keys(otherBefore.native.refs).length>0&&otherBefore.native.refs.C.nativeTitle==='Foreign scope native title','foreign native refs are nonempty and distinct');
   check(otherBefore.evidence.revision>0&&Object.keys(otherBefore.evidence.hints).length===1,'foreign ACK evidence genuinely committed');
   check(Object.values(otherBefore.evidence.hints)[0].actorScopeKey===other.key,'foreign ACK belongs to foreign actor scope');
   h.disableDrain();check((await h.ingest(h.surface())).state==='accepted','joint observation accepted');
   const pending=await h.native.listContinuations(h.scope);check(pending.length===1&&pending[0].state==='pending-evidence','genuine pending v2 exists');const original=pending[0];
   const complete=h.native.markContinuationComplete.bind(h.native);
   h.native.markContinuationComplete=async(...args)=>{injection=await abortNextWrite(h);return complete(...args);};
   const cut=await h.recover();check(cut.state==='pending','completion cut remains pending');check(injection?.fired()===1,'actual write abort must fire');injection.restore();h.native.markContinuationComplete=complete;
   equal(await h.native.listContinuations(h.scope),pending,'completion abort preserves original continuation');
   const committed=await h.free.read(h.scope),nativeBefore=await h.native.read(h.scope),assets=(await workspace.read(h.scope)).state;
   equal(assets.workspaces.human_workspace,humanWorkspace,'native ingest preserves human workspace');
   equal(manualAssets(assets),manualBefore,'native ingest and completion abort preserve all manual asset classes');
   check(committed.revision===1,'Evidence committed before completion interruption');check(Object.keys(committed.hints).length===1,'one committed ACK anchor');
   for(const [key,value]of Object.entries(original.evidence.batch.hints[0]))equal(Object.values(committed.hints)[0][key],value,'original anchor field committed: '+key);
   const receiptKey=JSON.stringify([freeEvidenceKey(h.scope.key),original.evidence.operationId]),receipt=await row(h,'native_operations',receiptKey);
   check(receipt?.payload.kind==='OBSERVE_HOST_CONTINUATION','real continuation receipt persisted');check(receipt.checksum===digest(receipt.payload),'receipt checksum valid');
   let restored=committed;
   if(repair){await corruptEvidenceChecksum(h);const status=await freeRecoveryStatus(h.free,h.scope,'evidence');check(status.recoverable===true,'checksum repair is available');check((await h.free.recover(h.scope,{operationId:'completion_evidence_repair',damagedHash:status.damagedHash})).ok,'actual Evidence repair succeeds');restored=await h.free.read(h.scope);check(restored.sources[original.admission.sourceId].revoked===true,'repair revokes the committed ACK source');for(const table of ['events','hints','coverage'])equal(restored[table],committed[table],'repair retains old '+table+' bytes');}
   equal(await h.native.read(h.scope),nativeBefore,'repair does not change native witness');equal(await row(h,'native_operations',receiptKey),receipt,'repair preserves prior receipt bytes');equal(await h.native.listContinuations(h.scope),pending,'repair cannot complete pending');
   equal(manualAssets((await workspace.read(h.scope)).state),manualBefore,'repair preserves manual assets before restart');
   equal({native:await h.native.read(other),evidence:await h.free.read(other),workspace:(await workspace.read(other)).state},otherBefore,'repair preserves populated foreign scope before restart');
   h.base.close();const resumed=await h.recover();check(resumed.state===(repair?'needs-revalidation':'complete'),'fresh owner terminal result');if(repair)check(resumed.reason==='source-revoked','retirement identifies revoked ACK source, not changed native witness');
   equal(await h.free.read(h.scope),restored,'receipt cannot replay or mutate Evidence');equal(await h.native.read(h.scope),nativeBefore,'completion bookkeeping leaves native facts intact');
   const operation=await row(h,'native_operations',JSON.stringify([h.scope.key,original.operationId])),terminal=operation.payload.continuation;
   check(terminal.state===(repair?'needs-revalidation':'complete'),'durable terminal state');for(const key of ['operationId','payloadDigest','nativeWitness','admission'])equal(terminal[key],original[key],'terminal preserves '+key);check(terminal.evidence===undefined,'terminal retires replay payload');
   if(repair){check(terminal.reason==='source-revoked','durable retirement reason');equal(terminal.targets,['C'],'target remains reachable for revalidation');}
   check((await h.recover()).state==='idle','second drain does not replay terminal');equal(await h.free.read(h.scope),restored,'repeat drain unchanged');equal(await row(h,'native_operations',receiptKey),receipt,'old receipt not rewritten');
   equal((await workspace.read(h.scope)).state,assets,'human asset state unchanged');equal(manualAssets((await workspace.read(h.scope)).state),manualBefore,'manual asset bytes remain exact after restart and repeat drain');equal({native:await h.native.read(other),evidence:await h.free.read(other),workspace:(await workspace.read(other)).state},otherBefore,'populated other scope isolated');
   return {status:'PASS',repair,manualAssetClasses:['human-ref','workspace','display-identity','placement','working-set','saved-snippet'],manualAssets:{counts:assetCounts(manualBefore),contentHash:digest(manualBefore),unchanged:true},foreignScope:{status:'POPULATED_NATIVE_EVIDENCE_AND_HUMAN_ASSETS',counts:assetCounts(otherManual),stateHash:digest(otherBefore),unchanged:true,nativeAndEvidencePopulated:true,nativeRefs:Object.keys(otherBefore.native.refs).length,ackHints:Object.keys(otherBefore.evidence.hints).length},transactionAbortCount:injection.fired(),terminal:terminal.state,reason:terminal.reason??null,authority:'EXPLICIT_OFFLINE_FIXTURE',physicalCrash:'NOT_TESTED'};
  }finally{injection?.restore();for(const fn of cleanup.reverse())await fn();}
 }}));
}
