import {FREE_INSTALLATION_KEY,freePolicyInitializationKey,isFreshInstallationRecord,freePolicyInitializationRecord,validFreePolicyInitializationRecord} from './free-policy-initialization.mjs';
import {initialFreeTimePolicy} from './free-time-policy.mjs';
import {activityVersionPrecondition,checkActivityVersionFence} from './activity-version-fence.mjs';
import {prepareSharedDirectoryRetention} from './shared-directory-retention.mjs';
import {migrateSharedDirectory} from './shared-directory-migration.mjs';
import { PartitionedState, isPartitioned, isSharedDirectory } from './partitioned.mjs';
import { createBackup, previewBackup, recoverAssets } from './backup.mjs';
import { normalizedScope } from '../b1/identity.mjs';
import { B23_STORES } from './schema.mjs';
import { digest, stable } from './hash.mjs';
import { TABLES, emptyState, validateState, reduceCommand, changes, undoChanges, id, exact } from './state.mjs';
import { dataProjection } from './evidence.mjs';
import {reconcileKnownReferences} from './known-anchor-backfill.mjs';
import {knownAnchorCursorKey} from './known-anchor-key.mjs';
const scopeChecked=s=>{const n=normalizedScope(s);if(!n)throw Error('unverified-scope');return n;};
const record=(key,payload)=>({key,payload,checksum:digest(payload)});
function unpack(row){if(!row||typeof row.checksum!=='string'||digest(row.payload)!==row.checksum)throw Error('corrupt-record');return row.payload;}
const fence=(guard,signal)=>{if(signal?.aborted||guard()!==true)throw Error('stale-binding');};
/** Durable B2/B3 facade over the EXISTING B1 connection. Never owns a database name.
 * Synthetic ingestion must be explicitly supplied by a privileged test provider.
 * An imported field such as trusted:true or source:'synthetic' grants nothing.
 */
export class WorkspaceRepository {
  constructor({baseRepository,evidenceGate=null,clock=()=>new Date().toISOString()}={}){
    if(!baseRepository?.open||!baseRepository?.scopeOrThrow)throw Error('b1-repository-required');
    this.base=baseRepository;this.evidenceGate=evidenceGate;this.clock=clock;this.partitioned=new PartitionedState(this);
  }
  async connection(){const db=await this.base.open();for(const name of B23_STORES)if(!db.objectStoreNames.contains(name))throw Error('b23-schema-missing');return db;}
  async read(scope,{guard=()=>true,signal=null}={}){
    const s=scopeChecked(scope),db=await this.connection();fence(guard,signal);
    if(await this.partitioned.manifest(s,{guard,signal}))return this.partitioned.readAll(s,{guard,signal});
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['b23_states','b23_views','b23_checkpoints','b23_operations'],'readonly');let state,view=null,error=null,viewError=null;
      const r=tx.objectStore('b23_states').get(s.key);r.onsuccess=()=>{try{state=r.result?validateState(unpack(r.result),s.key):emptyState(s);
        // A missing root is fresh storage only if it has neither scoped workspace
        // history nor a checkpoint. Never hide existing human assets as empty.
        if(!r.result){const checkpoint=tx.objectStore('b23_checkpoints').get(s.key),history=tx.objectStore('b23_operations').index('scopeKey').openCursor(s.key);const existing=q=>{if(q.result){error=Error('corrupt-record');try{tx.abort();}catch{}}};checkpoint.onsuccess=()=>existing(checkpoint);history.onsuccess=()=>existing(history);}
      }catch(e){error=e;tx.abort();}};
      // A corrupt view is not authority to discard intact Workspace assets. Preserve its bytes; report diagnostics.
      const v=tx.objectStore('b23_views').get(s.key);v.onsuccess=()=>{try{view=v.result?unpack(v.result):null;if(view)validateView(view.value);}catch{view=null;viewError='CORRUPT_VIEW';}};
      tx.oncomplete=()=>{try{fence(guard,signal);resolve({state,view,diagnostics:{view:viewError}});}catch(e){reject(e);}};tx.onabort=()=>reject(error??tx.error??Error('read-aborted'));
    });
  }
  async viewOnly(scope,{guard=()=>true,signal=null}={}){const s=scopeChecked(scope),db=await this.connection();fence(guard,signal);return new Promise((resolve,reject)=>{const tx=db.transaction('b23_views'),q=tx.objectStore('b23_views').get(s.key);let view=null,diagnostic=null;q.onsuccess=()=>{try{view=q.result?unpack(q.result):null;if(view)validateView(view.value);}catch{view=null;diagnostic='CORRUPT_VIEW';}};tx.oncomplete=()=>{try{fence(guard,signal);resolve({view,diagnostics:{view:diagnostic}});}catch(e){reject(e);}};tx.onabort=()=>reject(tx.error??Error('read-aborted'));});}
  async partitionVersion(scope,options={}){const revision=await this.partitioned.version(scope,options);return revision===null?null:{revision,...await this.viewOnly(scope,options)};}
  async partitionHeader(scope,options={}){const manifest=await this.partitioned.manifest(scope,options);if(!manifest)return null;return {manifest,...await this.viewOnly(scope,options)};}
  async partitionPage(scope,query,options={}){const {manifest,...page}=await this.partitioned.page(scope,query,options);return page;}
  async snapshot(scope,now,timeZone,options){const {state,view,diagnostics}=await this.read(scope,options);return {diagnostics,...dataProjection(state,now,timeZone),view:view?.value??null,viewRevision:view?.revision??0,objects:{workspaces:state.workspaces,placements:state.placements,identities:state.identities,sources:state.sources},preferences:state.preferences};}
  async command(scope,{operationId,expectedRevision,command},{actor='human',guard=()=>true,signal=null,expectedActivityVersions}={}){
    if(!['human','candidate'].includes(actor))throw Error('invalid-command-authority');
    command=structuredClone(command);
    const versions=expectedActivityVersions===undefined?null:activityVersionPrecondition(expectedActivityVersions);
    if(versions&&(actor!=='human'||command?.type!=='SET_PREFERENCE'||command.id!=='freeTimePolicy'))throw Error('invalid-activity-fenced-command');
    const fingerprint={actor,command,expectedRevision,...(versions?{expectedActivityVersions:versions}:{})};
    return this.mutate(scope,{operationId,expectedRevision,fingerprint,type:command.type,actor,guard,signal,...(versions?{expectedActivityVersions:versions}:{}),apply:current=>reduceCommand(current,command,actor)});
  }
  allowEvidence(scope){if(typeof this.evidenceGate!=='function'||this.evidenceGate(scope)!=='synthetic')throw Error('untrusted-evidence-channel');}
  async ingest(scope,{operationId,expectedRevision,batch},options={}){
    const s=scopeChecked(scope);this.allowEvidence(s);
    return this.mutate(s,{operationId,expectedRevision,fingerprint:{batch,expectedRevision},type:'INGEST',actor:'evidence',...options,apply:current=>reduceCommand(current,{type:'INGEST',batch},'evidence')});
  }
  async migrateSharedDirectory(scope,request,options={}){return migrateSharedDirectory(this,scope,request,options);}
  async migratePartitioned(scope,options={}){return this.partitioned.migrate(scope,options);}
  async initializePartitioned(scope,initial,options={}){return this.partitioned.initialize(scope,initial,options);}
  async reconcileKnownReferences(scope,options={}){return reconcileKnownReferences(this,scope,options);}
  async initialize(scope,initial,options={}){
    const s=scopeChecked(scope);this.allowEvidence(s);validateState(initial,s.key);if(initial.revision!==1||initial.channel!=='synthetic')throw Error('invalid-bootstrap');
    return this.mutate(s,{operationId:'synthetic_bootstrap_v1',expectedRevision:0,fingerprint:{bootstrap:'v1',scope:s.key},type:'BOOTSTRAP',actor:'bootstrap',...options,apply:()=>structuredClone(initial)});
  }
  async initializeFreeTimePolicy(scope,{expectedRevision,day},{guard=()=>true,signal=null}={}){
    if(!Number.isSafeInteger(day))throw Error('invalid-free-policy-day');
    return this.mutate(scope,{operationId:'free_policy_initialization_v1',expectedRevision,fingerprint:{initialization:'free-policy-v1',day,expectedRevision},type:'INITIALIZE_FREE_POLICY',actor:'bootstrap',guard,signal,initializeFreePolicy:{day}});
  }
  async undo(scope,{operationId,expectedRevision,targetOperationId},options={}){
    id(targetOperationId);
    return this.mutate(scope,{operationId,expectedRevision,fingerprint:{undo:targetOperationId,expectedRevision},type:'UNDO',actor:'human',...options,targetOperationId,apply:(current,op)=>undoChanges(current,op)});
  }
  async mutate(scope,params){
    const s=scopeChecked(scope),{operationId,expectedRevision,type,actor,apply,targetOperationId,guard=()=>true,signal=null}=params;
    id(operationId);if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('invalid-revision');
    const hash=digest(params.fingerprint),db=await this.connection();fence(guard,signal);
    return new Promise(resolve=>{
      const tx=db.transaction(['b23_states','b23_operations','b23_checkpoints','refs',...(params.expectedActivityVersions?['native_states','native_operations']:[]),...(params.initializeFreePolicy?['b23_views']:[])],'readwrite');let outcome=null;
      const abort=reason=>{if(outcome?.ok!==false)outcome={ok:false,reason};try{tx.abort();}catch{}};
      const check=()=>{try{fence(guard,signal);return true;}catch(e){abort(e.message);return false;}};
      const onRevoke=()=>abort('stale-binding');signal?.addEventListener('abort',onRevoke,{once:true});
      const states=tx.objectStore('b23_states'),ops=tx.objectStore('b23_operations'),opKey=JSON.stringify([s.key,operationId]);
      let freshInstallation=false;
      const start=()=>{const req=ops.get(opKey);
      req.onsuccess=()=>{
        if(!check())return;
        try{
          if(req.result){const prior=unpack(req.result);if(prior.invalidatedBy){outcome={ok:false,reason:'operation-invalidated-by-recovery'};return;}outcome=prior.fingerprint===hash?{ok:true,replayed:true,revision:prior.resultRevision,operationId}:{ok:false,reason:'operation-replay-conflict'};return;}
          const loadWorkspace=()=>{const sr=states.get(s.key);sr.onsuccess=()=>{
            if(!check())return;
            try{
              const payload=sr.result?(isSharedDirectory(sr.result.payload)?this.partitioned.verifiedDirectory(sr.result,s):isPartitioned(sr.result.payload)?this.partitioned.verifiedManifest(sr.result,s.key):unpack(sr.result)):null;
              if(params.initializeFreePolicy&&!sr.result){
                const checkpoint=tx.objectStore('b23_checkpoints').get(s.key),history=ops.index('scopeKey').openCursor(s.key);
                for(const request of [checkpoint,history])request.onsuccess=()=>{if(check()&&request.result)abort('corrupt-record');};
              }
              // IDB clones the verified envelope before reducers or guards can
              // mutate shared header objects. Failed mutations abort this write.
              const retire=isSharedDirectory(payload)?prepareSharedDirectoryRetention(tx,s,payload,()=>{if(!check())throw Error('stale-binding');},e=>abort(e.message)):null;
              const enter=(current,storage=null,loadedPrior=null)=>{
              if(current.revision!==expectedRevision){abort('revision-conflict');return;}
              const initialization=params.initializeFreePolicy;
              if(initialization){
                if(!check())return;
                const existing=Object.hasOwn(current.preferences,'freeTimePolicy');
                tx.objectStore('b23_views').put(freePolicyInitializationRecord(s.key,existing?'existing':freshInstallation?'auto':'fixed'));
                if(existing){if(check())outcome={ok:true,initialized:false,revision:current.revision};return;}
              }
              if(isPartitioned(payload)||isSharedDirectory(payload))tx.objectStore('b23_checkpoints').put(sr.result);
              const finish=prior=>{
                try{
                  if(!check())return;const next=initialization?reduceCommand(current,{type:'SET_PREFERENCE',id:'freeTimePolicy',value:initialFreeTimePolicy({legacy:!freshInstallation,day:initialization.day})},'bootstrap'):apply(current,prior);validateState(next,s.key);
                  if(next.revision!==current.revision+1)throw Error('invalid-next-revision');
                  const patch=changes(current,next),log={id:operationId,scopeKey:s.key,type,actor,fingerprint:hash,baseRevision:current.revision,resultRevision:next.revision,recordedAt:this.clock(),patch:actor==='human'?patch:[],changedObjects:patch.length,undoneBy:null};
                  // All IDB requests stay within this transaction; no network or awaits.
                  for(const p of patch.filter(p=>p.table==='refs'&&p.after)){
                    const ref=p.after,key=this.base.key(s,ref.id),rr=tx.objectStore('refs').get(key);
                    rr.onsuccess=()=>{
                      try{if(!check())return;const old=rr.result;
                        if(old&&(old.nativeUrl!==ref.nativeUrl||old.projectId!==ref.projectId))throw Error('native-reference-conflict');
                        if(!old){const refWrite=tx.objectStore('refs').put({key,scopeKey:s.key,conversationId:ref.id,nativeUrl:ref.nativeUrl,projectId:ref.projectId,revision:1});if(type==='RESTORE_BACKUP')refWrite.onsuccess=()=>{check();};}
                      }catch(e){abort(e.message);}
                    };
                  }
                  if(!check())return;
                  if(storage){if(isSharedDirectory(storage.manifest))retire(this.partitioned.saveSharedMutation(tx,storage,s,current,next,patch,actor));else this.partitioned.saveMutation(tx,storage,current,next,patch,actor);}
                  else{if(current.revision)tx.objectStore('b23_checkpoints').put(record(s.key,current));states.put(record(s.key,next));}
                  if(!check())return;
                  const receiptWrite=ops.put(record(opKey,log));if(type==='RESTORE_BACKUP')receiptWrite.onsuccess=()=>{check();};
                  if(prior){prior.undoneBy=operationId;ops.put(record(JSON.stringify([s.key,targetOperationId]),prior));}
                  if(!check())return;
                  outcome={ok:true,replayed:false,revision:next.revision,operationId,...(initialization?{initialized:true}:{})};
                }catch(e){abort(e.message);}
              };
              if(storage)finish(loadedPrior);else if(targetOperationId){const ur=ops.get(JSON.stringify([s.key,targetOperationId]));ur.onsuccess=()=>{try{if(!ur.result)throw Error('missing-operation');finish(unpack(ur.result));}catch(e){abort(e.message);}};}else finish(null);
              };
              if(isPartitioned(payload)||isSharedDirectory(payload)){const load=prior=>{const ready=(current,storage)=>{if(check())enter(current,storage,prior);},fail=e=>abort(e.message);if(isSharedDirectory(payload))this.partitioned.loadSharedMutation(tx,payload,s,params,prior,ready,fail);else this.partitioned.loadMutation(tx,payload,params,prior,ready,fail);};if(targetOperationId){const q=ops.get(JSON.stringify([s.key,targetOperationId]));q.onsuccess=()=>{try{if(!q.result)throw Error('missing-operation');load(unpack(q.result));}catch(e){abort(e.message);}};}else load(null);}
              else enter(payload?validateState(payload,s.key):emptyState(s));
            }catch(e){abort(e.message);}
          };};
          if(params.expectedActivityVersions)checkActivityVersionFence(tx,s,params.expectedActivityVersions,check,loadWorkspace,abort);else loadWorkspace();
        }catch(e){abort(e.message);}
      };
      };
      if(params.initializeFreePolicy){
        const store=tx.objectStore('b23_views'),marker=store.get(freePolicyInitializationKey(s.key));
        marker.onsuccess=()=>{try{
          if(!check())return;
          if(marker.result){outcome={ok:true,initialized:false,...(!validFreePolicyInitializationRecord(marker.result,s.key)?{diagnostic:'invalid-free-policy-initialization'}:{})};return;}
          const provenance=store.get(FREE_INSTALLATION_KEY);provenance.onsuccess=()=>{try{if(check()){freshInstallation=isFreshInstallationRecord(provenance.result);start();}}catch(error){abort(error.message);}};
        }catch(error){abort(error.message);}};
      }else start();
      tx.oncomplete=()=>{signal?.removeEventListener('abort',onRevoke);try{fence(guard,signal);resolve(outcome);}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
      tx.onabort=()=>{signal?.removeEventListener('abort',onRevoke);resolve(outcome?.ok===false?outcome:{ok:false,reason:tx.error?.name??'write-aborted'});};
      tx.onerror=()=>{};
    });
  }
  async history(scope){
    const s=scopeChecked(scope),db=await this.connection();return new Promise((resolve,reject)=>{
      const tx=db.transaction('b23_operations','readonly'),req=tx.objectStore('b23_operations').index('scopeKey').openCursor(s.key),logs=[];let error;
      req.onsuccess=()=>{try{const c=req.result;if(!c)return;const p=unpack(c.value);if(p.scopeKey===s.key)logs.push({id:p.id,type:p.type,actor:p.actor,revision:p.resultRevision,undoneBy:p.undoneBy,invalidatedBy:p.invalidatedBy??null});c.continue();}catch(e){error=e;tx.abort();}};
      tx.oncomplete=()=>resolve(logs.sort((a,b)=>b.revision-a.revision));tx.onabort=()=>reject(error??tx.error??Error('history-abort'));
    });
  }
  async saveView(scope,value,expectedRevision,{guard=()=>true,signal=null}={}){
    const s=scopeChecked(scope);validateView(value);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('invalid-revision');
    const db=await this.connection();fence(guard,signal);
    return new Promise(resolve=>{
      const tx=db.transaction('b23_views','readwrite'),store=tx.objectStore('b23_views');let result;
      const abort=reason=>{result={ok:false,reason};try{tx.abort();}catch{}};
      const revoked=()=>abort('stale-binding');signal?.addEventListener('abort',revoked,{once:true});
      const r=store.get(s.key);
      r.onsuccess=()=>{try{
        fence(guard,signal);const old=r.result?unpack(r.result):null;
        if((old?.revision??0)!==expectedRevision)throw Error('view-conflict');
        const revision=expectedRevision+1;
        store.put(record(s.key,{revision,value:structuredClone(value)}));
        fence(guard,signal);result={ok:true,revision};
      }catch(e){abort(e.message);}};
      tx.oncomplete=()=>{signal?.removeEventListener('abort',revoked);try{fence(guard,signal);resolve(result);}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
      tx.onabort=()=>{signal?.removeEventListener('abort',revoked);resolve(result?.ok===false?result:{ok:false,reason:tx.error?.name??'view-write-aborted'});};
      tx.onerror=()=>{};
    });
  }
  /** Enlist newly discovered native references in the caller's existing IDB transaction.
   * This adds shared reference anchors only; Pro identities and placements are never rewritten.
   */
  registerNativeReferences(tx, scope, nativeRefs, operationId, check, done, fail, {migrateLegacy=false,preferDirectory=false}={}) {
    const s=scopeChecked(scope),store=tx.objectStore('b23_states');
    const request=store.get(s.key);
    request.onsuccess=()=>{try{
      check();const payload=request.result?(isSharedDirectory(request.result.payload)?this.partitioned.verifiedDirectory(request.result,s):isPartitioned(request.result.payload)?this.partitioned.verifiedManifest(request.result,s.key):unpack(request.result)):null;
      const apply=(current,storage=null)=>{try{
        check();
        const added=nativeRefs.filter(ref=>!Object.hasOwn(current.refs,ref.id));
        if(!added.length){done({added:0});return;}
        // Real Host ingestion must not repeatedly clone the accumulated legacy
        // inventory. Abort this atomic attempt before a verified storage migration.
        if(migrateLegacy&&!storage&&(preferDirectory&&current.revision>0||Object.keys(current.refs).length+nativeRefs.length>15000))throw Error('native-shared-migration-required');
        const retire=isSharedDirectory(storage?.manifest)?prepareSharedDirectoryRetention(tx,s,storage.manifest,check,fail):null;
        if(storage)tx.objectStore('b23_checkpoints').put(request.result);
        const next=structuredClone(current);
        for(const ref of added)next.refs[ref.id]={id:ref.id,nativeUrl:ref.nativeUrl,projectId:ref.projectId,nativeTitle:ref.nativeTitle??'名称暂不可用',available:ref.availability==='available'};
        next.revision++;validateState(next,s.key);
        const patch=changes(current,next),key=JSON.stringify([s.key,operationId]);
        const duplicate=tx.objectStore('b23_operations').get(key);
        duplicate.onsuccess=()=>{try{
          check();if(duplicate.result)throw Error('native-shared-operation-conflict');
          for(const ref of added){const key=this.base.key(s,ref.id),r=tx.objectStore('refs').get(key);r.onsuccess=()=>{try{check();if(r.result&&(r.result.nativeUrl!==ref.nativeUrl||r.result.projectId!==ref.projectId))throw Error('native-reference-conflict');if(!r.result)tx.objectStore('refs').put({key,scopeKey:s.key,conversationId:ref.id,nativeUrl:ref.nativeUrl,projectId:ref.projectId,revision:1});}catch(error){fail(error);}};}
          if(storage){if(isSharedDirectory(storage.manifest))retire(this.partitioned.saveSharedMutation(tx,storage,s,current,next,patch,'evidence'));else this.partitioned.saveMutation(tx,storage,current,next,patch,'evidence');}
          else{if(current.revision)tx.objectStore('b23_checkpoints').put(record(s.key,current));store.put(record(s.key,next));}
          tx.objectStore('b23_operations').put(record(key,{id:operationId,scopeKey:s.key,type:'NATIVE_REFERENCES',actor:'evidence',fingerprint:digest(added),baseRevision:current.revision,resultRevision:next.revision,recordedAt:this.clock(),patch:[],changedObjects:added.length,undoneBy:null}));
          check();done({added:added.length});
        }catch(error){fail(error);}};
      }catch(error){fail(error);}};
      if(isSharedDirectory(payload)){this.partitioned.loadSharedMutation(tx,payload,s,{fingerprint:{batch:{refs:nativeRefs}}},null,apply,fail);}
      else if(isPartitioned(payload)){this.partitioned.loadMutation(tx,payload,{fingerprint:{batch:{refs:nativeRefs}}},null,apply,fail);}
      else if(payload)apply(validateState(payload,s.key));
      else{
        // A missing root cannot erase prior human history. Check inside the same
        // native/shared transaction before treating this scope as fresh storage.
        let pending=2;
        for(const probe of [tx.objectStore('b23_checkpoints').get(s.key),tx.objectStore('b23_operations').index('scopeKey').openCursor(s.key)])probe.onsuccess=()=>{try{check();if(probe.result)throw Error('corrupt-record');if(!--pending)apply(emptyState(s));}catch(error){fail(error);}};
      }
    }catch(error){fail(error);}};
  }

  async exportBackup(scope,options={}){if(await this.partitioned.manifest(scope,options))return this.partitioned.exportBackup(scope,options);const {state}=await this.read(scope,options);return createBackup(state);}
  async previewRestore(scope,bundle,options={}){const s=scopeChecked(scope),large=await this.partitioned.manifest(s,options),{state}=large?{state:await this.partitioned.partial(s,Object.keys(bundle?.payload?.refs??{}),options)}:await this.read(s,options),plan=previewBackup(state,bundle,s);return {summary:plan.summary,planHash:plan.planHash,expectedRevision:plan.expectedRevision,evidenceImported:false};}
  async restoreBackup(scope,{operationId,expectedRevision,bundle,planHash},options={}){
    const s=scopeChecked(scope);
    return this.mutate(s,{operationId,expectedRevision,fingerprint:{backup:bundle,planHash,expectedRevision},type:'RESTORE_BACKUP',actor:'human',...options,apply:current=>{const plan=previewBackup(current,bundle,s);if(plan.planHash!==planHash)throw Error('restore-preview-changed');return plan.next;}});
  }
  async recoveryStatus(scope,{guard=()=>true,signal=null}={}){if(await this.partitioned.checkpoint(scope,{guard,signal}))return this.partitioned.recovery(scope,{}, {guard,signal});const s=scopeChecked(scope),db=await this.connection();fence(guard,signal);return new Promise((resolve,reject)=>{
    const tx=db.transaction(['b23_states','b23_checkpoints','b23_operations'],'readonly');let stateRow,checkpoint,error;const logs=[];
    const a=tx.objectStore('b23_states').get(s.key),b=tx.objectStore('b23_checkpoints').get(s.key);a.onsuccess=()=>{stateRow=a.result};b.onsuccess=()=>{checkpoint=b.result};
    const c=tx.objectStore('b23_operations').index('scopeKey').openCursor(s.key);c.onsuccess=()=>{try{const row=c.result;if(row){logs.push(unpack(row.value));row.continue();}}catch(e){error=e;tx.abort();}};
    tx.oncomplete=()=>{try{fence(guard,signal);if(isSharedDirectory(stateRow?.payload))throw Error('shared-directory-recovery-not-enabled');let intact=true;try{validateState(unpack(stateRow),s.key);}catch{intact=false;}if(intact){resolve({corrupt:false});return;}
      try{const prior=validateState(unpack(checkpoint),s.key),plan=recoverAssets(prior,logs,s.key);resolve({corrupt:true,recoverable:true,damagedHash:digest(stateRow??null),checkpointRevision:prior.revision,restoredHumanChanges:plan.restoredHumanChanges,recoveryRevision:plan.state.revision,evidenceInvalidated:true});}catch(e){resolve({corrupt:true,recoverable:false,reason:e.message});}
    }catch(e){reject(e);}};tx.onabort=()=>reject(error??tx.error);
  });}
  /** Explicit asset recovery from a checkpoint plus validated human patches.
   * Missing/corrupt/conflicting journal entries fail closed. A checkpoint is NOT authority to reactivate evidence
   * or replay old commands. All prior receipts become historical; sources are
   * revoked until separately ingested new evidence supplies fresh authority.
   */
  async recover(scope,{damagedHash,operationId},{guard=()=>true,signal=null}={}){
    const s=scopeChecked(scope);id(operationId);
    if(await this.partitioned.checkpoint(s,{guard,signal}))return this.partitioned.recovery(s,{operationId,damagedHash},{guard,signal});
    const db=await this.connection();fence(guard,signal);
    return new Promise(resolve=>{
      const tx=db.transaction(['b23_states','b23_checkpoints','b23_operations'],'readwrite');
      const states=tx.objectStore('b23_states'),ops=tx.objectStore('b23_operations');let outcome;
      const abort=reason=>{outcome={ok:false,reason};try{tx.abort();}catch{}};
      const revoked=()=>abort('stale-binding');signal?.addEventListener('abort',revoked,{once:true});
      const check=()=>fence(guard,signal),opKey=JSON.stringify([s.key,operationId]);
      const duplicate=ops.get(opKey);
      duplicate.onsuccess=()=>{try{
        check();
        if(duplicate.result){
          const prior=unpack(duplicate.result);
          outcome=prior.type==='RECOVER'&&prior.fingerprint===damagedHash&&!prior.invalidatedBy
            ?{ok:true,replayed:true,revision:prior.resultRevision,operationId}
            :{ok:false,reason:'operation-replay-conflict'};return;
        }
        const r=states.get(s.key);
        r.onsuccess=()=>{try{
          check();if(isSharedDirectory(r.result?.payload))throw Error('shared-directory-recovery-not-enabled');if(digest(r.result??null)!==damagedHash)throw Error('recovery-conflict');
          let corrupt=false;try{validateState(unpack(r.result),s.key);}catch{corrupt=true;}
          if(!corrupt)throw Error('intact-state-not-replaced');
          const p=tx.objectStore('b23_checkpoints').get(s.key);
          p.onsuccess=()=>{try{
            check();let state=structuredClone(validateState(unpack(p.result),s.key));
            const checkpointRevision=state.revision,logs=[];let highWater=checkpointRevision;
            // Never trust the corrupted state revision for CAS monotonicity.
            // Validate the scoped journal before recovering; damaged journals
            // require separate maintenance instead of inventing a revision.
            const cursor=ops.index('scopeKey').openCursor(s.key);
            cursor.onsuccess=()=>{try{
              check();const c=cursor.result;
              if(c){
                const log=unpack(c.value);
                if(log.scopeKey!==s.key||!Number.isSafeInteger(log.resultRevision)||log.resultRevision<1)throw Error('corrupt-operation-history');
                highWater=Math.max(highWater,log.resultRevision);logs.push({key:c.primaryKey,log});c.continue();return;
              }
              if(highWater>=Number.MAX_SAFE_INTEGER)throw Error('revision-exhausted');
              const recovered=recoverAssets(state,logs.map(x=>x.log),s.key);state=recovered.state;
              for(const old of logs){old.log.invalidatedBy=operationId;ops.put(record(old.key,old.log));}
              check();states.put(record(s.key,state));states.delete(knownAnchorCursorKey(s.key));tx.objectStore('b23_checkpoints').put(record(s.key,state));check();
              const log={id:operationId,scopeKey:s.key,type:'RECOVER',actor:'human',fingerprint:damagedHash,
                baseRevision:highWater,resultRevision:state.revision,recordedAt:this.clock(),patch:[],changedObjects:0,undoneBy:null,
                checkpointRevision,restoredHumanChanges:recovered.restoredHumanChanges,evidenceInvalidated:true};
              const receiptWrite=ops.add(record(opKey,log));receiptWrite.onsuccess=()=>{try{check();}catch(e){abort(e.message);}};check();
              outcome={ok:true,replayed:false,revision:state.revision,operationId,checkpointRevision,restoredHumanChanges:recovered.restoredHumanChanges,evidenceInvalidated:true};
            }catch(e){abort(e.message);}};
          }catch(e){abort(e.message);}};
        }catch(e){abort(e.message);}};
      }catch(e){abort(e.message);}};
      tx.oncomplete=()=>{signal?.removeEventListener('abort',revoked);try{check();resolve(outcome);}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
      tx.onabort=()=>{signal?.removeEventListener('abort',revoked);resolve(outcome?.ok===false?outcome:{ok:false,reason:tx.error?.name??'recovery-aborted'});};
      tx.onerror=()=>{};
    });
  }
}
export function validateView(v){
  exact(v,['segment','oldOpen','sidebarOpen','capacities','scroll','sidebarVisible'],['freeSession','sidebarScroll','sidebarChoices']);
  if(v.sidebarScroll!==undefined&&(!Number.isFinite(v.sidebarScroll)||v.sidebarScroll<0||v.sidebarScroll>1e8))throw Error('invalid-view');
  if(v.sidebarChoices!==undefined&&(!Array.isArray(v.sidebarChoices)||v.sidebarChoices.length>256||new Set(v.sidebarChoices.map(p=>p?.[0])).size!==v.sidebarChoices.length||v.sidebarChoices.some(p=>!Array.isArray(p)||p.length!==2||typeof p[0]!=='string'||!p[0].length||p[0].length>512||/[\u0000-\u001f\u007f]/.test(p[0])||typeof p[1]!=='boolean')))throw Error('invalid-view');
  if(v.freeSession!==undefined){
    const s=v.freeSession;exact(s,['H','T','Z','policyRevision']);
    if(![7,14,30,60,90].includes(s.H)||!Number.isSafeInteger(s.T)||Math.abs(s.T)>=1000000||typeof s.Z!=='string'||s.Z.length>=100||!Number.isSafeInteger(s.policyRevision)||s.policyRevision<0)throw Error('invalid-free-session');
    try{new Intl.DateTimeFormat('en',{timeZone:s.Z}).format(0);}catch{throw Error('invalid-free-session');}
  }
  if(!Number.isSafeInteger(v.segment)||v.segment<0||v.segment>10000||!Number.isFinite(v.scroll)||v.scroll<0||v.scroll>1e9||typeof v.sidebarVisible!=='boolean')throw Error('invalid-view');
  for(const k of ['oldOpen','sidebarOpen'])if(!Array.isArray(v[k])||v[k].length>20000||v[k].some(x=>typeof x!=='string'||x.length>260))throw Error('invalid-view');
  if(!Array.isArray(v.capacities)||v.capacities.length>20000||v.capacities.some(x=>!Array.isArray(x)||x.length!==2||typeof x[0]!=='string'||x[0].length>530||!Number.isSafeInteger(x[1])||x[1]<0||x[1]>20000))throw Error('invalid-view');return v;
}
