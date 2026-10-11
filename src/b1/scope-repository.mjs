import { DATABASE_VERSION, upgradeDatabase } from '../data/schema.mjs';
import { canonicalRef, normalizedScope, tokenOK } from './identity.mjs';

/** Real extension-origin IndexedDB; no page-origin storage or synthetic in-memory fallback.
 * Atomic CAS and operation deduplication are scoped by the *trusted resolver's* scope.
 */
export class ScopeRepository {
  constructor({indexedDB, databaseName='vaiwl-b1-v1'}={}) {
    if (!indexedDB?.open || !tokenOK(databaseName)) throw Error('indexeddb-unavailable');
    this.idb=indexedDB;this.name=databaseName;
    this.connection=null;
  }
  async open() {
    if(this.connection)return this.connection;
    if(this.opening)return this.opening;
    this.opening=new Promise((resolve,reject)=>{
      const req=this.idb.open(this.name,DATABASE_VERSION);
      let cancelled=false;
      req.onupgradeneeded=event=>{
        try{upgradeDatabase(req.result,req.transaction,event.oldVersion);}
        catch{req.transaction.abort();}
      };
      req.onerror=()=>reject(req.error||Error('idb-open-error'));
      req.onblocked=()=>{cancelled=true;reject(Error('idb-open-blocked'));};
      req.onsuccess=()=>{
        const db=req.result;
        if(cancelled){db.close();return;}
        db.onversionchange=()=>{db.close();if(this.connection===db)this.connection=null;};
        this.connection=db;resolve(db);
      };
    }).finally(()=>{this.opening=null});
    return this.opening;
  }
  close(){this.connection?.close();this.connection=null;}
  scopeOrThrow(scope){
    const n=normalizedScope(scope);
    if(!n)throw Error('unverified-scope');
    return n;
  }
  key(scope,id){if(!tokenOK(id))throw Error('invalid-ref');return JSON.stringify([scope.key,id]);}
  async get(scope,conversationId){
    const s=this.scopeOrThrow(scope),key=this.key(s,conversationId),db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('refs','readonly'),req=tx.objectStore('refs').get(key);
      req.onsuccess=()=>resolve(req.result?Object.freeze({...req.result}):null);
      req.onerror=()=>reject(req.error||Error('idb-read-error'));
      tx.onabort=()=>reject(tx.error||Error('idb-read-abort'));
    });
  }
  async list(scope,{limit=50}={}){
    const s=this.scopeOrThrow(scope);
    if(!Number.isInteger(limit)||limit<1||limit>250)throw Error('invalid-limit');
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const out=[],tx=db.transaction('refs','readonly');
      const req=tx.objectStore('refs').index('scopeKey').openCursor(IDBKeyRange.only(s.key));
      req.onsuccess=()=>{const c=req.result;if(!c||out.length>=limit)return resolve(out);
        out.push(Object.freeze({...c.value}));c.continue();};
      req.onerror=()=>reject(req.error||Error('idb-list-error'));
      tx.onabort=()=>reject(tx.error||Error('idb-list-abort'));
    });
  }
  /**
   * B1 stores only immutable native reference identity + observed URL/Project,
   * not chat text/title, tokens, model answers, or host session state.
   * An operationId replay with DIFFERENT parameters is rejected (not deduped).
   * beforeCommit is a synchronous binding/current-document fence, not an async wait.
   */
  async upsert({scope,ref,operationId,expectedRevision,beforeCommit=()=>true}={}){
    const s=this.scopeOrThrow(scope),r=canonicalRef(ref);
    if(!r||!tokenOK(operationId)||!Number.isSafeInteger(expectedRevision)||
       expectedRevision<0||typeof beforeCommit!=='function')throw Error('invalid-upsert');
    const db=await this.open();
    const key=this.key(s,r.conversationId),opKey=JSON.stringify([s.key,operationId]);
    const fingerprint=JSON.stringify([r.conversationId,r.nativeUrl,r.projectId,expectedRevision]);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['refs','operations'],'readwrite'),
        refs=tx.objectStore('refs'),ops=tx.objectStore('operations');
      let answer=null,finalized=false;
      const fail=reason=>{if(finalized)return;finalized=true;answer={ok:false,reason};tx.abort();};
      const existingOp=ops.get(opKey);
      existingOp.onsuccess=()=>{
        if(!beforeCommit())return fail('stale-binding');
        const o=existingOp.result;
        if(o){answer=o.fingerprint===fingerprint?{...o.result,replayed:true}:{ok:false,reason:'operation-replay-conflict'};return;}
        const lookup=refs.get(key);
        lookup.onsuccess=()=>{
          if(!beforeCommit())return fail('stale-binding');
          const old=lookup.result;
          if((old?.revision||0)!==expectedRevision)return fail('revision-conflict');
          const value={key,scopeKey:s.key,conversationId:r.conversationId,nativeUrl:r.nativeUrl,
            projectId:r.projectId,revision:expectedRevision+1};
          const result={ok:true,record:{...value},replayed:false};
          refs.put(value);
          ops.put({key:opKey,scopeKey:s.key,fingerprint,result});
          answer=result;
        };
      };
      tx.oncomplete=()=>resolve(answer);
      tx.onabort=()=>{if(answer&&!answer.ok)return resolve(answer);reject(tx.error||Error('idb-transaction-abort'));};
      tx.onerror=()=>{}; // onabort is the single failure path
    });
  }
}
