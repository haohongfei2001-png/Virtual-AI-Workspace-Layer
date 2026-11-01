import {digest} from '../data/hash.mjs';
const protocol='vaiwl-host-read-budget/1',duration=30000,limit=12;
const identity=(value,prefix)=>typeof value==='string'&&new RegExp('^'+prefix+'_[0-9a-f]{64}$').test(value);
/** Non-authoritative high-water only. Reservations commit before network, and are
 * never refunded: a worker crash cannot make an already dispatched GET free.
 * Existing extension-origin DB/store; IDB serializes competing tabs/workers.
 * A later foreground read can start a new window; continuations cannot renew it.
 */
export function createSharedHostReadBudget({repository,now=Date.now}={}){
 if(typeof repository?.open!=='function'||typeof now!=='function')throw Error('invalid-host-read-budget');
 async function reserve({principalKey,contextKey,sourceDomain,attemptKey=null,windowStartedAt=null,signal}={}){
  if(!identity(principalKey,'principal')||!identity(contextKey,'context')||typeof sourceDomain!=='string'||new URL(sourceDomain).origin!==sourceDomain||attemptKey!==null&&(typeof attemptKey!=='string'||!attemptKey||attemptKey.length>1024)||windowStartedAt!==null&&!Number.isFinite(windowStartedAt))throw Error('invalid-host-read-budget-input');
  if(signal?.aborted)throw Error('session-aborted');
  const key='host-read-budget:'+digest([principalKey,contextKey,sourceDomain]),attempt=attemptKey===null?null:digest(attemptKey),db=await repository.open();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('b23_views','readwrite'),store=tx.objectStore('b23_views'),q=store.get(key);let result,failure;
   const fail=code=>{failure=Error(code);tx.abort();};
   q.onsuccess=()=>{try{
    if(signal?.aborted)return fail('session-aborted');
    const at=now();if(!Number.isFinite(at))return fail('read-budget-exhausted');
    const saved=q.result;if(saved&&(saved.key!==key||!saved.payload||saved.checksum!==digest(saved.payload)))return fail('invalid-host-read-budget-state');
    let row=saved?.payload;
    if(row&&(row.protocol!==protocol||!Number.isFinite(row.startedAt)||!Number.isFinite(row.lastAt)||row.lastAt<row.startedAt||!Number.isInteger(row.requests)||row.requests<1||row.requests>limit||!Array.isArray(row.attempts)||row.attempts.length>limit||row.attempts.some(a=>!a||! /^[0-9a-f]{64}$/.test(a.key)||!Number.isInteger(a.count)||a.count<1||a.count>3)))return fail('invalid-host-read-budget-state');
    if(row&&at<row.lastAt)return fail('read-budget-exhausted');
    if(windowStartedAt!==null&&(!row||row.startedAt!==windowStartedAt||at-row.startedAt>=duration))return fail('read-budget-exhausted');
    if(!row||at-row.startedAt>=duration)row={key,protocol,startedAt:at,lastAt:at,requests:0,attempts:[]};
    if(row.requests>=limit)return fail('read-budget-exhausted');
    if(attempt!==null){let item=row.attempts.find(a=>a.key===attempt);if(item?.count>=3)return fail('read-budget-retries-exhausted');if(item)item.count++;else row.attempts.push({key:attempt,count:1});}
    row.requests++;row.lastAt=at;store.put({key,payload:row,checksum:digest(row)});result=Object.freeze({windowStartedAt:row.startedAt});
   }catch{fail('invalid-host-read-budget-state');}};
   tx.oncomplete=()=>resolve(result);
   tx.onabort=()=>reject(failure??tx.error??Error('read-budget-storage-failed'));
   tx.onerror=()=>{};
  });
 }
 return Object.freeze({reserve});
}
