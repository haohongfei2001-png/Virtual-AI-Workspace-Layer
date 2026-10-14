import {recoverSharedDirectory} from './shared-directory-recovery.mjs';
import {sharedMutationManifest,saveSharedDirectoryMutation} from './shared-directory-writer.mjs';
import {SHARED_DIRECTORY_FORMAT,validateSharedDirectoryRoot} from './shared-ref-directory.mjs';
import {createSharedDirectoryReader} from './shared-directory-reader.mjs';
import {VerifiedRecordCache} from './verified-record-cache.mjs';
import { createBackup, recoverAssets } from './backup.mjs';
import { TABLES, emptyState, validateState, id, exact } from './state.mjs';
import { stable, digest } from './hash.mjs';
import { normalizedScope } from '../b1/identity.mjs';
import {knownAnchorCursorKey} from './known-anchor-key.mjs';
import {manifest_PARTITION_FORMAT,manifest_PAGE_SIZE,manifest_partitionKey,manifest_partitionRecord,manifest_partitionUnpack,manifest_partitionUnpackMeasured,manifest_isPartitioned,manifest_headerState,manifest_checkManifest,manifest_checkManifestAsync,manifest_manifestRecord} from './partition-manifest.mjs';
export const PARTITION_FORMAT=manifest_PARTITION_FORMAT;
export const PAGE_SIZE=manifest_PAGE_SIZE;
export const partitionKey=manifest_partitionKey;
export const partitionRecord=manifest_partitionRecord;
export const partitionUnpack=manifest_partitionUnpack;
export const isPartitioned=manifest_isPartitioned;
export const headerState=manifest_headerState;
export const checkManifest=manifest_checkManifest;
export const checkManifestAsync=manifest_checkManifestAsync;
export const manifestRecord=manifest_manifestRecord;
const MAX_REFS=100000;
export const isSharedDirectory=p=>p?.format===SHARED_DIRECTORY_FORMAT;
const isReadablePartition=p=>isPartitioned(p)||isSharedDirectory(p);
const locatorKey=(scope,table,key)=>JSON.stringify([scope,'evidence-ref',table,key]);
const fence=o=>{if(o.signal?.aborted||o.guard&&o.guard()!==true)throw Error('stale-binding');};
function preferenceRefs(p){return [...(p.workingSet?.value.refs??[]),...(p.savedSnippets?.value??[]).map(x=>x.refId)];}
function addPiece(s,b){if(b.ref)s.refs[b.refId]=b.ref;if(b.identity)s.identities[b.refId]=b.identity;for(const t of ['events','coverage','placements'])for(const row of b[t])s[t][row.id]=row;}
function makePiece(s,refId){return {scopeKey:s.scopeKey,refId,revision:s.revision,ref:s.refs[refId],identity:s.identities[refId]??null,events:Object.values(s.events).filter(e=>e.conversationId===refId),coverage:Object.values(s.coverage).filter(c=>c.conversationId===refId),placements:Object.values(s.placements).filter(p=>p.refId===refId)};}
function checkPiece(m,b,refId){
 exact(b,['scopeKey','refId','revision','ref','identity','events','coverage','placements']);
 if(b.scopeKey!==m.scopeKey||b.refId!==refId||b.revision!==m.refVersions[refId]||b.ref?.id!==refId)throw Error('invalid-partition-reference');
 const s=headerState(m,{});s.workspaces={};s.sources={};for(const p of b.placements)s.workspaces[p.workspaceId]=m.workspaces[p.workspaceId];for(const r of [...b.events,...b.coverage])s.sources[r.sourceId]=m.sources[r.sourceId];addPiece(s,b);validateState(s,m.scopeKey);return b;
}
function affected(patch){const refs=new Set();for(const p of patch){if(['refs','identities'].includes(p.table))refs.add(p.key);else if(p.table==='placements')refs.add((p.after??p.before).refId);else if(['events','coverage'].includes(p.table))refs.add((p.after??p.before).conversationId);}return [...refs];}
/** Storage adaptation inside the SAME v2 stores; commands still use the existing reducer/CAS/receipts.
 * Ref pieces are immutable and referenced by a checksummed revision manifest. A checkpoint never
 * points at overwritten pieces. No page can observe staged initialization or mixed revisions.
 */
export class PartitionedState {
 #manifestCache=new VerifiedRecordCache();
 #directoryCache=new VerifiedRecordCache();
 // Full inventory reads preserve the legacy manifest interface.
 readManifest(tx,row,scope,done,fail){try{
  if(!isSharedDirectory(row?.payload)){done(this.verifiedManifest(row,scope.key));return;}
  const root=this.verifiedDirectory(row,scope);
  createSharedDirectoryReader(tx.objectStore('b23_states'),root,scope,fail).all(done);
 }catch(error){fail(error);}}

 verifiedDirectory(row,scope){if(row?.key!==scope.key)throw Error('shared-directory-key-mismatch');return this.#directoryCache.read(row,scope.key,(payload,record)=>{partitionUnpack(record);validateSharedDirectoryRoot(payload,scope);});}
 verifiedManifest(row,scopeKey){return this.#manifestCache.read(row,scopeKey,(payload,record)=>{partitionUnpack(record);checkManifest(payload,scopeKey);});}
 constructor(owner){this.owner=owner;}
 // Revision metadata only: does not certify unloaded directory inventory.
 async version(scope,options={}){return (await this.storageInfo(scope,options))?.revision??null;}
 async storageInfo(scope,options={}){const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');const db=await this.owner.connection();fence(options);return new Promise((resolve,reject)=>{
  const tx=db.transaction('b23_states'),q=tx.objectStore('b23_states').get(s.key);let result=null,error;
  q.onsuccess=()=>{try{const p=q.result?.payload;if(isSharedDirectory(p))result={revision:this.verifiedDirectory(q.result,s).revision,format:p.format};else if(isPartitioned(p))result={revision:this.verifiedManifest(q.result,s.key).revision,format:p.format};}catch(e){error=e;tx.abort();}};
  tx.oncomplete=()=>{try{fence(options);resolve(result);}catch(e){reject(e);}};tx.onabort=()=>reject(error??tx.error??Error('read-aborted'));
 });}
 async manifest(scope,options={}){const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');const db=await this.owner.connection();fence(options);return new Promise((resolve,reject)=>{const tx=db.transaction('b23_states'),r=tx.objectStore('b23_states').get(s.key);let result,error;const fail=e=>{error??=e;try{tx.abort();}catch{}};r.onsuccess=()=>{if(isReadablePartition(r.result?.payload))this.readManifest(tx,r.result,s,value=>result=value,fail);else result=null;};tx.oncomplete=()=>{try{fence(options);resolve(result);}catch(e){reject(e);}};tx.onabort=()=>reject(error??tx.error??Error('read-aborted'));});}
 loadPieces(tx,m,ids,done,fail,measureUnits=false){const pieces=new Map(),wanted=[...new Set(ids)].filter(k=>Object.hasOwn(m.refVersions,k));if(!wanted.length){done(pieces,0);return;}let left=wanted.length,units=0;for(const refId of wanted){const r=tx.objectStore('b23_states').get(partitionKey(m.scopeKey,refId,m.refVersions[refId],m.generation));r.onsuccess=()=>{try{const measured=measureUnits?manifest_partitionUnpackMeasured(r.result):null;pieces.set(refId,checkPiece(m,measured?measured.payload:partitionUnpack(r.result),refId));if(measured)units+=measured.units;if(!--left)done(pieces,units);}catch(e){fail(e);}};}}
 loadMutation(tx,m,params,prior,done,fail,pieceLoader=this.loadPieces.bind(this)){
  const c=params.fingerprint?.command,ids=new Set(preferenceRefs(m.preferences));
  if(c?.refId)ids.add(c.refId);
  if(c?.type==='SET_PREFERENCE'){if(c.id==='workingSet')for(const x of c.value?.refs??[])ids.add(x);if(c.id==='savedSnippets')for(const x of c.value??[])ids.add(x.refId);}
  for(const p of prior?.patch??[]){for(const x of affected([p]))ids.add(x);if(p.table==='preferences'){for(const v of [p.before,p.after])if(v)for(const x of preferenceRefs({[p.key]:v}))ids.add(x);}}
  const batch=params.fingerprint?.batch;for(const r of batch?.refs??[])ids.add(r.id);for(const r of [...(batch?.events??[]),...(batch?.coverage??[])])ids.add(r.conversationId);
  const bundle=params.fingerprint?.backup;for(const x of Object.keys(bundle?.payload?.refs??{}))ids.add(x);
  const finish=()=>pieceLoader(tx,m,ids,pieces=>{try{const state=headerState(m);for(const b of pieces.values())addPiece(state,b);validateState(state,m.scopeKey);done(state,{manifest:m,pieces});}catch(e){fail(e);}},fail);
  // Resolve globally unique evidence IDs before invoking the original reducer. A batch
  // that reuses an ID in another partition must see its old row and conflict.
  const lookups=[...(batch?.events??[]).map(x=>({table:'events',id:x.id})),...(batch?.coverage??[]).map(x=>({table:'coverage',id:x.id}))];
  if(c?.type==='REVOKE_EVIDENCE')lookups.push({table:c.table,id:c.id,required:true});
  if(!lookups.length){finish();return;}let waiting=lookups.length;
  for(const x of lookups){id(x.id);const q=tx.objectStore('b23_states').get(locatorKey(m.scopeKey,x.table,x.id));q.onsuccess=()=>{try{if(q.result||x.required){const p=partitionUnpack(q.result);if(p.scopeKey!==m.scopeKey||p.table!==x.table||p.id!==x.id)throw Error('invalid-evidence-locator');ids.add(p.refId);}if(!--waiting)finish();}catch(e){fail(e);}};}

 }
 // All directory and reference reads belong to the owner mutation transaction.
 loadSharedMutation(tx,root,scope,params,prior,done,fail){try{
  const reader=createSharedDirectoryReader(tx.objectStore('b23_states'),root,scope,fail);
  const load=(transaction,manifest,ids,ready,reject)=>reader.lookupMany(ids,()=>{try{
   const bounded=sharedMutationManifest(root,scope,ids,[...reader.records.values()]);
   this.loadPieces(transaction,bounded,ids,ready,reject);
  }catch(error){reject(error);}});
  this.loadMutation(tx,root,params,prior,(state,storage)=>done(state,{...storage,directoryRecords:[...reader.records.values()]}),fail,load);
 }catch(error){fail(error);}}
 saveSharedMutation(tx,storage,scope,current,next,patch,actor='human'){
  return saveSharedDirectoryMutation(tx,storage.manifest,scope,storage,current,next,patch,actor,this.saveMutation.bind(this));
 }
 saveMutation(tx,storage,current,next,patch,actor='human'){
  const m=storage.manifest,n={...m,revision:next.revision,channel:next.channel,sources:next.sources,workspaces:next.workspaces,preferences:next.preferences,refVersions:{...m.refVersions}};
  const ids=affected(patch),store=tx.objectStore('b23_states');
  for(const refId of ids){const old=storage.pieces.get(refId);if(old)n.units-=stable(old).length;
   if(!next.refs[refId]){delete n.refVersions[refId];continue;}
   const b=makePiece(next,refId);n.refVersions[refId]=next.revision;n.units+=stable(b).length;store.put(partitionRecord(partitionKey(n.scopeKey,refId,next.revision,n.generation),b));
   for(const table of ['events','coverage'])for(const row of b[table])store.put(partitionRecord(locatorKey(n.scopeKey,table,row.id),{scopeKey:n.scopeKey,table,id:row.id,refId}));
  }
  n.humanRefs=[...new Set([...m.humanRefs,...(actor==='human'?ids:[])])].filter(k=>Object.hasOwn(n.refVersions,k));n.changes=[...m.changes,{revision:n.revision,refs:ids}].slice(-64);
  // The transaction owner preserves its verified old envelope before mutation;
  // recovery instead checkpoints the newly recovered root after this returns.
  const rootRecord=manifestRecord(n.scopeKey,n);store.put(rootRecord);return n;
 }
 async page(scope,{revision=null,offset=0,ids=null},options={}){
  const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');if(!Number.isSafeInteger(offset)||offset<0||offset>MAX_REFS||ids&&(!Array.isArray(ids)||ids.length>PAGE_SIZE))throw Error('invalid-partition-page');
  const db=await this.owner.connection();fence(options);
  return new Promise((resolve,reject)=>{const tx=db.transaction(['b23_states','b23_views']),store=tx.objectStore('b23_states');let result,error;
   const fail=e=>{error=e;try{tx.abort();}catch{}};
   const r=store.get(s.key);r.onsuccess=()=>{try{this.readManifest(tx,r.result,s,m=>{try{if(revision!==null&&revision!==m.revision)throw Error('snapshot-revision-changed');const keys=Object.keys(m.refVersions),selected=ids??keys.slice(offset,offset+PAGE_SIZE);selected.forEach(id);this.loadPieces(tx,m,selected,pieces=>{result={scope:s.key,revision:m.revision,offset,total:keys.length,pieces:[...pieces.values()],nextOffset:offset+selected.length,manifest:offset===0&&!ids?m:undefined};},fail);}catch(e){fail(e);}},fail);}catch(e){fail(e);}};
   tx.oncomplete=()=>{try{fence(options);const wire={...result,manifest:undefined};if(new TextEncoder().encode(JSON.stringify(wire)).length>16*1024*1024)throw Error('partition-page-too-large');resolve(result);}catch(e){reject(e);}};tx.onabort=()=>reject(error??tx.error??Error('read-aborted'));
  });
 }
 async readAll(scope,options={}){const first=await this.page(scope,{},options),s=headerState(first.manifest);for(const b of first.pieces)addPiece(s,b);for(let offset=PAGE_SIZE;offset<first.total;offset+=PAGE_SIZE){const p=await this.page(scope,{revision:first.revision,offset},options);for(const b of p.pieces)addPiece(s,b);}const view=await this.owner.viewOnly(scope,options);return {state:s,...view};}
 async partial(scope,ids,options={}){const context=await this.partialContext(scope,ids,options);if(!context)throw Error('invalid-partition-manifest');return context.state;}
 async partialContext(scope,ids,options={}){const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');const db=await this.owner.connection();fence(options);return new Promise((resolve,reject)=>{const tx=db.transaction('b23_states');let result,error;const fail=e=>{error=e;try{tx.abort();}catch{}};const q=tx.objectStore('b23_states').get(s.key);q.onsuccess=()=>{try{if(!isReadablePartition(q.result?.payload)){if(q.result)partitionUnpack(q.result);result=null;return;}if(isSharedDirectory(q.result.payload)&&options.boundedDirectory===true){const root=this.verifiedDirectory(q.result,s);this.loadSharedMutation(tx,root,s,{}, {patch:ids.map(key=>({table:'refs',key}))},(state,storage)=>{result={state,refVersions:Object.fromEntries([...storage.pieces].map(([id,piece])=>[id,piece.revision])),inventoryComplete:false};},fail);return;}this.readManifest(tx,q.result,s,m=>this.loadMutation(tx,m,{}, {patch:ids.map(key=>({table:'refs',key}))},state=>result={state,manifest:m},fail),fail);}catch(e){fail(e);}};tx.oncomplete=()=>{try{fence(options);resolve(result);}catch(e){reject(e);}};tx.onabort=()=>reject(error??tx.error);});}
 async exportBackup(scope,options={}){const m=await this.manifest(scope,options),state=await this.partial(scope,m.humanRefs,options);return createBackup(state);}
 async checkpoint(scope,options={}){const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');const db=await this.owner.connection();fence(options);return new Promise((resolve,reject)=>{const tx=db.transaction('b23_checkpoints'),q=tx.objectStore('b23_checkpoints').get(s.key);let value,error;q.onsuccess=()=>{try{value=isSharedDirectory(q.result?.payload)?this.verifiedDirectory(q.result,s):isPartitioned(q.result?.payload)?checkManifest(partitionUnpack(q.result),s.key):null;}catch(e){error=e;tx.abort();}};tx.oncomplete=()=>{try{fence(options);resolve(value);}catch(e){reject(e);}};tx.onabort=()=>reject(error??tx.error);});}
 plan(tx,scopeKey,checkpoint,logs,done,fail){try{checkManifest(checkpoint,scopeKey);const later=logs.filter(l=>l.resultRevision>checkpoint.revision),patch=later.filter(l=>l.actor==='human').flatMap(l=>l.patch??[]);this.loadMutation(tx,checkpoint,{}, {patch},(state,storage)=>{try{const result=recoverAssets(state,logs,scopeKey);done({...result,storage,patch:TABLES.flatMap(table=>{const a=state[table],b=result.state[table];return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(key=>stable(a[key]??null)!==stable(b[key]??null)).map(key=>({table,key,before:a[key]??null,after:b[key]??null}));})});}catch(e){fail(e);}},fail);}catch(e){fail(e);}}
 async recovery(scope,{operationId=null,damagedHash=null}={},options={}){if(isSharedDirectory(await this.checkpoint(scope,options)))return recoverSharedDirectory(this.owner,scope,{operationId,damagedHash},options);const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');if(operationId)id(operationId);const db=await this.owner.connection();fence(options);return new Promise((resolve,reject)=>{const stores=['b23_states','b23_checkpoints','b23_operations'],tx=db.transaction(stores,operationId?'readwrite':'readonly');let result,error,stateRow,checkpoint;const logs=[];const fail=e=>{error=e;if(operationId)result={ok:false,reason:e.message};try{tx.abort();}catch{}};const revoked=()=>fail(Error('stale-binding'));options.signal?.addEventListener('abort',revoked,{once:true});const a=tx.objectStore('b23_states').get(s.key),b=tx.objectStore('b23_checkpoints').get(s.key);a.onsuccess=()=>stateRow=a.result;b.onsuccess=()=>{try{checkpoint=checkManifest(partitionUnpack(b.result),s.key);}catch(e){fail(e);}};const cursor=tx.objectStore('b23_operations').index('scopeKey').openCursor(s.key);cursor.onsuccess=()=>{try{fence(options);const c=cursor.result;if(c){logs.push({key:c.primaryKey,log:partitionUnpack(c.value)});c.continue();return;}
   if(isSharedDirectory(stateRow?.payload)||isSharedDirectory(checkpoint))throw Error('shared-directory-recovery-not-enabled');
   const fingerprint=digest(stateRow??null);const prior=operationId?logs.find(x=>x.log.id===operationId)?.log:null;if(prior){result=prior.type==='RECOVER'&&prior.fingerprint===damagedHash&&!prior.invalidatedBy?{ok:true,replayed:true,revision:prior.resultRevision,operationId}:{ok:false,reason:'operation-replay-conflict'};return;}
   let corrupt=false;try{checkManifest(partitionUnpack(stateRow),s.key);}catch{corrupt=true;}if(!corrupt){if(operationId)throw Error('intact-state-not-replaced');result={corrupt:false};return;}if(operationId&&fingerprint!==damagedHash)throw Error('recovery-conflict');
   this.plan(tx,s.key,checkpoint,logs.map(x=>x.log),plan=>{try{fence(options);if(!operationId){result={corrupt:true,recoverable:true,damagedHash:fingerprint,checkpointRevision:checkpoint.revision,restoredHumanChanges:plan.restoredHumanChanges,recoveryRevision:plan.state.revision,evidenceInvalidated:true};return;}
    const next=this.saveMutation(tx,plan.storage,null,plan.state,plan.patch,'human');tx.objectStore('b23_states').delete(knownAnchorCursorKey(s.key));tx.objectStore('b23_checkpoints').put(partitionRecord(s.key,next));for(const old of logs){old.log.invalidatedBy=operationId;tx.objectStore('b23_operations').put(partitionRecord(old.key,old.log));}
    const log={id:operationId,scopeKey:s.key,type:'RECOVER',actor:'human',fingerprint:damagedHash,baseRevision:plan.highWater,resultRevision:plan.state.revision,recordedAt:this.owner.clock(),patch:[],changedObjects:0,undoneBy:null,checkpointRevision:checkpoint.revision,restoredHumanChanges:plan.restoredHumanChanges,evidenceInvalidated:true};tx.objectStore('b23_operations').add(partitionRecord(JSON.stringify([s.key,operationId]),log));fence(options);result={ok:true,replayed:false,revision:plan.state.revision,operationId,checkpointRevision:checkpoint.revision,restoredHumanChanges:plan.restoredHumanChanges,evidenceInvalidated:true};
   }catch(e){fail(e);}},e=>{if(!operationId){result={corrupt:true,recoverable:false,reason:e.message};}else fail(e);});
  }catch(e){fail(e);}};
  tx.oncomplete=()=>{options.signal?.removeEventListener('abort',revoked);try{fence(options);resolve(result);}catch(e){if(operationId)resolve({ok:false,reason:'stale-after-commit',committed:true});else reject(e);}};tx.onabort=()=>{options.signal?.removeEventListener('abort',revoked);if(operationId)resolve(result?.ok===false?result:{ok:false,reason:error?.message??tx.error?.name??'recovery-aborted'});else if(result?.recoverable===false)resolve(result);else reject(error??tx.error);};tx.onerror=()=>{};
 });}
 async migrate(scope,options={}){const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');const existing=await this.manifest(s,options);if(existing)return {ok:true,migrated:false,revision:existing.revision};const {state}=await this.owner.read(s,options);if(!state.revision)throw Error('empty-state-not-migrated');return this.initialize(s,state,options,{checksum:digest(state)});}
 async initialize(scope,initial,options={},expected=null){
  const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');this.owner.allowEvidence(s);if(initial.schema!==2||initial.scopeKey!==s.key||(!expected&&initial.revision!==1)||!['none','synthetic'].includes(initial.channel))throw Error('invalid-bootstrap');
  const refs=Object.keys(initial.refs);if(refs.length>MAX_REFS)throw Error('partition-capacity');
  const m={format:PARTITION_FORMAT,generation:'g_'+crypto.randomUUID().replaceAll('-',''),scopeKey:s.key,revision:initial.revision,channel:initial.channel,sources:initial.sources,workspaces:initial.workspaces,preferences:initial.preferences,refVersions:Object.fromEntries(refs.map(k=>[k,initial.revision])),humanRefs:[...new Set([...Object.values(initial.identities).filter(n=>n.owner==='human').map(n=>n.id),...Object.values(initial.placements).filter(p=>p.owner==='human').map(p=>p.refId)])],units:0,changes:[]};checkManifest(m,s.key);
  const pieces=new Map(refs.map(refId=>[refId,{scopeKey:s.key,refId,revision:initial.revision,ref:initial.refs[refId],identity:initial.identities[refId]??null,events:[],coverage:[],placements:[]}]))
  for(const t of ['events','coverage','placements'])for(const [key,row] of Object.entries(initial[t])){if(row.id!==key)throw Error('invalid-state-row');const refId=t==='placements'?row.refId:row.conversationId,b=pieces.get(refId);if(!b)throw Error('orphan-partition-row');b[t].push(row);}
  for(const key of Object.keys(initial.identities))if(!pieces.has(key))throw Error('orphan-title');
  // Validate bounded batches with the exact legacy contracts BEFORE any write.
  for(let i=0;i<refs.length;i+=PAGE_SIZE){const partial=headerState(m,{});for(const refId of refs.slice(i,i+PAGE_SIZE)){const b=pieces.get(refId);addPiece(partial,b);m.units+=stable(b).length;}validateState(partial,s.key);}
  checkManifest(m,s.key);const db=await this.owner.connection();fence(options);
  const already=await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states'),q=tx.objectStore('b23_states').get(s.key);let row;q.onsuccess=()=>row=q.result;tx.oncomplete=()=>resolve(row);tx.onabort=()=>reject(tx.error);});
  fence(options);if(expected?(!already||already.checksum!==expected.checksum):!!already)return {ok:false,reason:'revision-conflict'};
  // Staged pieces have no published manifest; live reads cannot reach them.
  for(let i=0;i<refs.length;i+=PAGE_SIZE)await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite'),store=tx.objectStore('b23_states');let error;try{fence(options);for(const refId of refs.slice(i,i+PAGE_SIZE))store.put(partitionRecord(partitionKey(s.key,refId,initial.revision,m.generation),pieces.get(refId)));}catch(e){error=e;tx.abort();}tx.oncomplete=()=>{try{fence(options);resolve();}catch(e){reject(e);}};tx.onabort=()=>reject(error??tx.error);});
  const outcome=await new Promise(resolve=>{const tx=db.transaction(['b23_states','b23_operations','b23_checkpoints','refs'],'readwrite');let result;const abort=reason=>{result={ok:false,reason};try{tx.abort();}catch{}};const revoked=()=>abort('stale-binding');options.signal?.addEventListener('abort',revoked,{once:true});const r=tx.objectStore('b23_states').get(s.key);r.onsuccess=()=>{try{fence(options);if(expected?(!r.result||r.result.checksum!==expected.checksum||digest(r.result.payload)!==expected.checksum):!!r.result){abort('revision-conflict');return;}
    for(const refId of refs){const ref=initial.refs[refId],key=this.owner.base.key(s,refId),q=tx.objectStore('refs').get(key);q.onsuccess=()=>{try{fence(options);if(q.result&&(q.result.nativeUrl!==ref.nativeUrl||q.result.projectId!==ref.projectId))throw Error('native-reference-conflict');if(!q.result)tx.objectStore('refs').put({key,scopeKey:s.key,conversationId:refId,nativeUrl:ref.nativeUrl,projectId:ref.projectId,revision:1});}catch(e){abort(e.message);}};}
    for(const b of pieces.values())for(const table of ['events','coverage'])for(const row of b[table])tx.objectStore('b23_states').put(partitionRecord(locatorKey(s.key,table,row.id),{scopeKey:s.key,table,id:row.id,refId:b.refId}));
    tx.objectStore('b23_states').put(partitionRecord(s.key,m));if(expected){tx.objectStore('b23_checkpoints').put(partitionRecord(s.key,m));result={ok:true,migrated:true,revision:m.revision};return;}const op='synthetic_bootstrap_v1',key=JSON.stringify([s.key,op]);tx.objectStore('b23_operations').put(partitionRecord(key,{id:op,scopeKey:s.key,type:'BOOTSTRAP',actor:'bootstrap',fingerprint:digest({bootstrap:'v1',scope:s.key}),baseRevision:0,resultRevision:1,recordedAt:this.owner.clock(),patch:[],changedObjects:refs.length,undoneBy:null}));result={ok:true,replayed:false,revision:1,operationId:op};
   }catch(e){abort(e.message);}};tx.oncomplete=()=>{options.signal?.removeEventListener('abort',revoked);try{fence(options);resolve(result);}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};tx.onabort=()=>{options.signal?.removeEventListener('abort',revoked);resolve(result?.ok===false?result:{ok:false,reason:tx.error?.name??'write-aborted'});};tx.onerror=()=>{};});return outcome;
 }
}
