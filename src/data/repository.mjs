import { normalizedScope } from '../b1/identity.mjs';
import { B23_STORES } from './schema.mjs';
import { digest, stable } from './hash.mjs';
import { TABLES, emptyState, validateState, reduceCommand, changes, undoChanges, id, exact } from './state.mjs';
import { dataProjection } from './evidence.mjs';
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
    this.base=baseRepository;this.evidenceGate=evidenceGate;this.clock=clock;
  }
  async connection(){const db=await this.base.open();for(const name of B23_STORES)if(!db.objectStoreNames.contains(name))throw Error('b23-schema-missing');return db;}
  async read(scope,{guard=()=>true,signal=null}={}){
    const s=scopeChecked(scope),db=await this.connection();fence(guard,signal);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['b23_states','b23_views'],'readonly');let state,view=null,error=null,viewError=null;
      const r=tx.objectStore('b23_states').get(s.key);r.onsuccess=()=>{try{state=r.result?validateState(unpack(r.result),s.key):emptyState(s);}catch(e){error=e;tx.abort();}};
      // A corrupt view is not authority to discard intact Workspace assets. Preserve its bytes; report diagnostics.
      const v=tx.objectStore('b23_views').get(s.key);v.onsuccess=()=>{try{view=v.result?unpack(v.result):null;if(view)validateView(view.value);}catch{view=null;viewError='CORRUPT_VIEW';}};
      tx.oncomplete=()=>{try{fence(guard,signal);resolve({state,view,diagnostics:{view:viewError}});}catch(e){reject(e);}};tx.onabort=()=>reject(error??tx.error??Error('read-aborted'));
    });
  }
  async snapshot(scope,now,timeZone,options){const {state,view,diagnostics}=await this.read(scope,options);return {diagnostics,...dataProjection(state,now,timeZone),view:view?.value??null,viewRevision:view?.revision??0,objects:{workspaces:state.workspaces,placements:state.placements,identities:state.identities,sources:state.sources},preferences:state.preferences};}
  async command(scope,{operationId,expectedRevision,command},{actor='human',guard=()=>true,signal=null}={}){
    if(!['human','candidate'].includes(actor))throw Error('invalid-command-authority');
    return this.mutate(scope,{operationId,expectedRevision,fingerprint:{actor,command,expectedRevision},type:command.type,actor,guard,signal,apply:current=>reduceCommand(current,command,actor)});
  }
  allowEvidence(scope){if(typeof this.evidenceGate!=='function'||this.evidenceGate(scope)!=='synthetic')throw Error('untrusted-evidence-channel');}
  async ingest(scope,{operationId,expectedRevision,batch},options={}){
    const s=scopeChecked(scope);this.allowEvidence(s);
    return this.mutate(s,{operationId,expectedRevision,fingerprint:{batch,expectedRevision},type:'INGEST',actor:'evidence',...options,apply:current=>reduceCommand(current,{type:'INGEST',batch},'evidence')});
  }
  async initialize(scope,initial,options={}){
    const s=scopeChecked(scope);this.allowEvidence(s);validateState(initial,s.key);if(initial.revision!==1||initial.channel!=='synthetic')throw Error('invalid-bootstrap');
    return this.mutate(s,{operationId:'synthetic_bootstrap_v1',expectedRevision:0,fingerprint:{bootstrap:'v1',scope:s.key},type:'BOOTSTRAP',actor:'bootstrap',...options,apply:()=>structuredClone(initial)});
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
      const tx=db.transaction(['b23_states','b23_operations','b23_checkpoints','refs'],'readwrite');let outcome=null;
      const abort=reason=>{if(outcome?.ok!==false)outcome={ok:false,reason};try{tx.abort();}catch{}};
      const check=()=>{try{fence(guard,signal);return true;}catch(e){abort(e.message);return false;}};
      const onRevoke=()=>abort('stale-binding');signal?.addEventListener('abort',onRevoke,{once:true});
      const states=tx.objectStore('b23_states'),ops=tx.objectStore('b23_operations'),opKey=JSON.stringify([s.key,operationId]);
      const req=ops.get(opKey);
      req.onsuccess=()=>{
        if(!check())return;
        try{
          if(req.result){const prior=unpack(req.result);if(prior.invalidatedBy){outcome={ok:false,reason:'operation-invalidated-by-recovery'};return;}outcome=prior.fingerprint===hash?{ok:true,replayed:true,revision:prior.resultRevision,operationId}:{ok:false,reason:'operation-replay-conflict'};return;}
          const sr=states.get(s.key);sr.onsuccess=()=>{
            if(!check())return;
            try{
              const current=sr.result?validateState(unpack(sr.result),s.key):emptyState(s);
              if(current.revision!==expectedRevision){abort('revision-conflict');return;}
              const finish=prior=>{
                try{
                  if(!check())return;const next=apply(current,prior);validateState(next,s.key);
                  if(next.revision!==current.revision+1)throw Error('invalid-next-revision');
                  const patch=changes(current,next),log={id:operationId,scopeKey:s.key,type,actor,fingerprint:hash,baseRevision:current.revision,resultRevision:next.revision,recordedAt:this.clock(),patch:actor==='human'?patch:[],changedObjects:patch.length,undoneBy:null};
                  // All IDB requests stay within this transaction; no network or awaits.
                  for(const p of patch.filter(p=>p.table==='refs'&&p.after)){
                    const ref=p.after,key=this.base.key(s,ref.id),rr=tx.objectStore('refs').get(key);
                    rr.onsuccess=()=>{
                      try{if(!check())return;const old=rr.result;
                        if(old&&(old.nativeUrl!==ref.nativeUrl||old.projectId!==ref.projectId))throw Error('native-reference-conflict');
                        if(!old)tx.objectStore('refs').put({key,scopeKey:s.key,conversationId:ref.id,nativeUrl:ref.nativeUrl,projectId:ref.projectId,revision:1});
                      }catch(e){abort(e.message);}
                    };
                  }
                  if(!check())return;
                  if(current.revision)tx.objectStore('b23_checkpoints').put(record(s.key,current));
                  states.put(record(s.key,next));ops.put(record(opKey,log));
                  if(prior){prior.undoneBy=operationId;ops.put(record(JSON.stringify([s.key,targetOperationId]),prior));}
                  outcome={ok:true,replayed:false,revision:next.revision,operationId};
                }catch(e){abort(e.message);}
              };
              if(targetOperationId){const ur=ops.get(JSON.stringify([s.key,targetOperationId]));ur.onsuccess=()=>{try{if(!ur.result)throw Error('missing-operation');finish(unpack(ur.result));}catch(e){abort(e.message);}};}else finish(null);
            }catch(e){abort(e.message);}
          };
        }catch(e){abort(e.message);}
      };
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
  async recoveryStatus(scope){const s=scopeChecked(scope),db=await this.connection();return new Promise((resolve,reject)=>{
    const tx=db.transaction(['b23_states','b23_checkpoints'],'readonly');let stateRow,checkpoint;
    const a=tx.objectStore('b23_states').get(s.key),b=tx.objectStore('b23_checkpoints').get(s.key);a.onsuccess=()=>{stateRow=a.result};b.onsuccess=()=>{checkpoint=b.result};
    tx.oncomplete=()=>{try{validateState(unpack(stateRow),s.key);resolve({corrupt:false});}catch{try{const prior=validateState(unpack(checkpoint),s.key);resolve({corrupt:true,recoverable:true,damagedHash:digest(stateRow??null),checkpointRevision:prior.revision});}catch{resolve({corrupt:true,recoverable:false});}}};tx.onabort=()=>reject(tx.error);
  });}
  /** Explicit lossy recovery. A checkpoint is NOT authority to reactivate evidence
   * or replay old commands. All prior receipts become historical; sources are
   * revoked until separately ingested new evidence supplies fresh authority.
   */
  async recover(scope,{damagedHash,operationId},{guard=()=>true,signal=null}={}){
    const s=scopeChecked(scope);id(operationId);
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
          check();if(digest(r.result??null)!==damagedHash)throw Error('recovery-conflict');
          let corrupt=false;try{validateState(unpack(r.result),s.key);}catch{corrupt=true;}
          if(!corrupt)throw Error('intact-state-not-replaced');
          const p=tx.objectStore('b23_checkpoints').get(s.key);
          p.onsuccess=()=>{try{
            check();const state=structuredClone(validateState(unpack(p.result),s.key));
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
              for(const source of Object.values(state.sources))source.revoked=true;
              state.revision=highWater+1;validateState(state,s.key);
              for(const old of logs){old.log.invalidatedBy=operationId;ops.put(record(old.key,old.log));}
              check();states.put(record(s.key,state));check();
              const log={id:operationId,scopeKey:s.key,type:'RECOVER',actor:'human',fingerprint:damagedHash,
                baseRevision:highWater,resultRevision:state.revision,recordedAt:this.clock(),patch:[],changedObjects:0,undoneBy:null,
                checkpointRevision,evidenceInvalidated:true};
              ops.add(record(opKey,log));check();
              outcome={ok:true,replayed:false,revision:state.revision,operationId,checkpointRevision,evidenceInvalidated:true};
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
  exact(v,['segment','oldOpen','sidebarOpen','capacities','scroll','sidebarVisible']);
  if(!Number.isSafeInteger(v.segment)||v.segment<0||v.segment>10000||!Number.isFinite(v.scroll)||v.scroll<0||v.scroll>1e9||typeof v.sidebarVisible!=='boolean')throw Error('invalid-view');
  for(const k of ['oldOpen','sidebarOpen'])if(!Array.isArray(v[k])||v[k].length>20000||v[k].some(x=>typeof x!=='string'||x.length>260))throw Error('invalid-view');
  if(!Array.isArray(v.capacities)||v.capacities.length>20000||v.capacities.some(x=>!Array.isArray(x)||x.length!==2||typeof x[0]!=='string'||x[0].length>260||!Number.isSafeInteger(x[1])||x[1]<0||x[1]>20000))throw Error('invalid-view');return v;
}
