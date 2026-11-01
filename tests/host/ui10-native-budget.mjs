/** Test preparation pacing only; never reserves, resets, or extends product budget. */
export function ui10NativeBudgetPace(row,now){
 if(!Number.isFinite(now))throw Error('invalid-ui10-budget-clock');
 if(row===null)return {waitMs:0,nextDue:now,remaining:12,reason:'EMPTY_WINDOW'};
 if(!row||row.protocol!=='vaiwl-host-read-budget/1'||!Number.isFinite(row.startedAt)||!Number.isFinite(row.lastAt)||row.lastAt<row.startedAt||now<row.lastAt||!Number.isInteger(row.requests)||row.requests<1||row.requests>12)throw Error('invalid-ui10-budget-observation');
 const expires=row.startedAt+30000;
 if(now>=expires)return {waitMs:0,nextDue:now,remaining:12,reason:'EXPIRED_WINDOW'};
 const remaining=12-row.requests;
 if(remaining>=3&&expires-now>6000)return {waitMs:0,nextDue:now,remaining,reason:'THREE_REQUEST_HEADROOM'};
 return {waitMs:expires-now+10,nextDue:expires+10,remaining,reason:remaining<3?'WAIT_CAPACITY':'WAIT_FULL_ADMISSION_WINDOW'};
}
/** Existing database only, readonly transactions; function serialized to exact frame. */
export async function readUi10NativeBudget({principalKey,contextKey,origin}){
 const {digest}=await import(chrome.runtime.getURL('src/data/hash.mjs'));
 const info=(await indexedDB.databases()).find(d=>d.name==='vaiwl-b1-v1');if(!info)return null;
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(info.name,info.version);q.onupgradeneeded=()=>{q.transaction.abort();reject(Error('ui10-budget-refuses-schema-upgrade'));};q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);});
 try{if(!db.objectStoreNames.contains('b23_views'))return null;const key='host-read-budget:'+digest([principalKey,contextKey,origin]);return await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views','readonly'),q=tx.objectStore('b23_views').get(key);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const saved=q.result;if(!saved){resolve(null);return;}if(saved.key!==key||saved.payload?.key!==key||saved.checksum!==digest(saved.payload)){reject(Error('invalid-ui10-budget-checksum'));return;}resolve(saved.payload);};});}finally{db.close();}
}
