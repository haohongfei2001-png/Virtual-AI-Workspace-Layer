import {canonicalRef,normalizedScope,tokenOK} from '../b1/identity.mjs';
import {digest} from './hash.mjs';
import {validateState} from './state.mjs';
import {isPartitioned,isSharedDirectory} from './partitioned.mjs';
import {knownAnchorCursorKey} from './known-anchor-key.mjs';

export {knownAnchorCursorKey};
const pack=(key,payload)=>({key,payload,checksum:digest(payload)});
function cursorOf(row,scope){
  if(!row)return {lastId:null,done:false};
  const p=row.payload;
  if(row.key!==knownAnchorCursorKey(scope.key)||row.checksum!==digest(p)||!p||
    ![4,6].includes(Object.keys(p).length)||p.schema!==1||p.scopeKey!==scope.key||
    !(p.lastId===null||tokenOK(p.lastId))||typeof p.done!=='boolean')throw Error('corrupt-anchor-cursor');
  if(Object.keys(p).length===6&&(typeof p.refIdsDigest!=='string'||!/^[0-9a-f]{64}$/.test(p.refIdsDigest)||!Number.isSafeInteger(p.b1Count)||p.b1Count<0))throw Error('corrupt-anchor-cursor');
  return p;
}

/** Repair knowledge of identities only. Never imports native facts or authority. */
export async function reconcileKnownReferences(owner,scope,{limit=128,guard=()=>true,signal=null}={}){
  const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');
  if(!Number.isSafeInteger(limit)||limit<1||limit>5000)throw Error('invalid-anchor-batch-limit');
  const db=await owner.connection();
  return new Promise(resolve=>{
    const tx=db.transaction(['refs','b23_states','b23_operations','b23_checkpoints'],'readwrite');
    const states=tx.objectStore('b23_states'),markerKey=knownAnchorCursorKey(s.key);
    let result=null,root=null,cursor=null,known=null,knownIds=null,refIdsDigest=null,b1Count=null;
    const check=()=>{if(signal?.aborted||guard()!==true)throw Error('stale-binding');};
    const fail=error=>{result={ok:false,reason:error.message??'anchor-backfill-aborted'};try{tx.abort();}catch{}};
    const revoked=()=>fail(Error('stale-binding'));signal?.addEventListener('abort',revoked,{once:true});
    const scan=()=>{
      try{
        check();if(cursor.done){result={ok:true,processed:0,added:0,done:true};return;}
        const rows=[],lastKey=cursor.lastId===null?null:owner.base.key(s,cursor.lastId);
        let lastId=cursor.lastId;
        const finish=done=>{
          const save=({added=0}={})=>{try{
            const nextDigest=added?digest([...knownIds,...missing.map(row=>row.id)].sort()):refIdsDigest;
            check();states.put(pack(markerKey,{schema:1,scopeKey:s.key,lastId,done,refIdsDigest:nextDigest,b1Count}));
            result={ok:true,processed:rows.length,added,done};
          }catch(e){fail(e);}};
          const missing=rows.filter(row=>!Object.hasOwn(known,row.id));
          // The verified manifest already proves identity membership. Existing
          // anchors need no per-reference piece reads or shared-state writes.
          if(!missing.length){save();return;}
          const operationId='anchor_backfill_'+digest([s.key,cursor.lastId,lastId,root?.revision??0]);
          owner.registerNativeReferences(tx,s,missing,operationId,check,save,fail);
        };
        const request=tx.objectStore('refs').index('scopeKey').openCursor(s.key);
        request.onsuccess=()=>{try{
          check();const entry=request.result;if(!entry){finish(true);return;}
          // The index key is constant within one scope. Jump by primary key,
          // then skip the inclusive saved row; never rescan every earlier page.
          if(lastKey!==null&&entry.primaryKey<lastKey){entry.continuePrimaryKey(s.key,lastKey);return;}
          if(lastKey!==null&&entry.primaryKey===lastKey){entry.continue();return;}
          if(rows.length===limit){finish(false);return;}
          const r=entry.value,ref=canonicalRef(r);
          if(!ref||r.scopeKey!==s.key||entry.key!==s.key||r.key!==owner.base.key(s,r.conversationId)||
            entry.primaryKey!==r.key||!Number.isSafeInteger(r.revision)||r.revision<1)throw Error('corrupt-known-anchor');
          rows.push({id:ref.conversationId,nativeUrl:ref.nativeUrl,projectId:ref.projectId,nativeTitle:'名称暂不可用',availability:'unavailable'});
          lastId=ref.conversationId;entry.continue();
        }catch(e){fail(e);}};
      }catch(e){fail(e);}
    };
    const prepareScan=()=>{
      const count=tx.objectStore('refs').index('scopeKey').count(s.key);
      count.onsuccess=()=>{try{
        check();b1Count=count.result;known=isPartitioned(root)?root.refVersions:root?.refs??{};
        knownIds=Object.keys(known).sort();refIdsDigest=digest(knownIds);
        // Older same-schema writers do not invalidate this new marker. Compare
        // identity witnesses even for completed and partially completed scans.
        // A legacy marker without witnesses is safe only as a restart request.
        if(cursor.refIdsDigest!==refIdsDigest||cursor.b1Count!==b1Count)cursor={lastId:null,done:false};
        scan();
      }catch(e){fail(e);}};
    };
    try{
      check();const marker=states.get(markerKey);
      marker.onsuccess=()=>{try{
        check();cursor=cursorOf(marker.result,s);const read=states.get(s.key);
        read.onsuccess=()=>{try{
          check();const row=read.result;
          if(row){
            if(isSharedDirectory(row.payload)){owner.partitioned.readManifest(tx,row,s,value=>{root=value;prepareScan();},fail);return;}
            if(isPartitioned(row.payload))root=owner.partitioned.verifiedManifest(row,s.key);
            else {if(row.checksum!==digest(row.payload))throw Error('corrupt-record');root=validateState(row.payload,s.key);}
            prepareScan();return;
          }
          // A vanished shared root is never a license to recreate human data.
          if(cursor.lastId!==null)throw Error('corrupt-record');
          let remaining=2;const checked=q=>{try{check();if(q.result)throw Error('corrupt-record');if(!--remaining)prepareScan();}catch(e){fail(e);}};
          const cp=tx.objectStore('b23_checkpoints').get(s.key),history=tx.objectStore('b23_operations').index('scopeKey').openCursor(s.key);
          cp.onsuccess=()=>checked(cp);history.onsuccess=()=>checked(history);
        }catch(e){fail(e);}};
      }catch(e){fail(e);}};
    }catch(e){fail(e);}
    tx.oncomplete=()=>{signal?.removeEventListener('abort',revoked);try{check();resolve(result);}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
    tx.onabort=()=>{signal?.removeEventListener('abort',revoked);resolve(result?.ok===false?result:{ok:false,reason:tx.error?.name??'anchor-backfill-aborted'});};
    tx.onerror=()=>{};
  });
}
