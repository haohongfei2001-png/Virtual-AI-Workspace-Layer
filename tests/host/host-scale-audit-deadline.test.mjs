import test from 'node:test';
import assert from 'node:assert/strict';
import {auditHostScaleIndex} from './fixtures/host-scale-audit.mjs';
const input={size:1000,distribution:'project-mixed',timeoutMs:10},pause=()=>new Promise(r=>setImmediate(r));
const held=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)};};
const timeout=r=>{assert.equal(r.status,'FAIL_INDEX_AUDIT');assert.equal(r.error,'audit-deadline');};
const page={revision:7,total:1000,offset:0,nextOffset:1,selectedRefs:['60000000-0000-4000-8000-000000000000'],selectedProjects:[],facts:{refs:{'60000000-0000-4000-8000-000000000000':{}},projects:{}}};
for(const stage of ['version','page','final-version'])test('bounded audit stops unresolved '+stage+' and late resolution cannot mutate returned result or continue paging',async()=>{
 const h=held();let versions=0,pages=0;
 const readers={version:()=>{versions++;return stage==='version'||stage==='final-version'&&versions===2?h.promise:Promise.resolve(7);},page:()=>{pages++;return stage==='page'?h.promise:Promise.resolve({...page,total:1,nextOffset:1});}};
 const result=await auditHostScaleIndex(input,readers);timeout(result);const before=JSON.stringify(result),calls={versions,pages};h.resolve(stage==='page'?page:7);await pause();await pause();assert.equal(JSON.stringify(result),before);assert.deepEqual({versions,pages},calls);
});
for(const value of [0,-1,NaN,Infinity,30001,'10'])test('invalid timeout '+String(value)+' rejects before any read',async()=>{let reads=0;await assert.rejects(auditHostScaleIndex({...input,timeoutMs:value},{version:async()=>reads++}),/invalid-host-scale-audit-timeout/);assert.equal(reads,0);});
test('late database discovery cannot start an open request',async t=>{
 const original=globalThis.indexedDB,h=held();let opens=0;globalThis.indexedDB={databases:()=>h.promise,open(){opens++;}};t.after(()=>globalThis.indexedDB=original);
 const result=await auditHostScaleIndex(input);timeout(result);h.resolve([{name:'vaiwl-b1-v1',version:4}]);await pause();assert.equal(opens,0);
});
test('late database open closes the returned handle without issuing transactions',async t=>{
 const original=globalThis.indexedDB,request={};let closes=0,transactions=0;globalThis.indexedDB={databases:async()=>[{name:'vaiwl-b1-v1',version:4}],open:()=>request};t.after(()=>globalThis.indexedDB=original);
 const result=await auditHostScaleIndex(input);timeout(result);const before=JSON.stringify(result);request.result={close(){closes++;},transaction(){transactions++;}};request.onsuccess();await pause();assert.equal(closes,1);assert.equal(transactions,0);assert.equal(JSON.stringify(result),before);
});
test('timeout aborts actual tracked readonly transaction and closes database; late batch cannot continue',async t=>{
 const original=globalThis.indexedDB,batchRequest={},events=new Map();let aborts=0,closes=0,continued=0;const tx={addEventListener:(type,fn)=>events.set(type,fn),objectStore:()=>({getAllKeys:()=>{continued++;return batchRequest;},get:()=>assert.fail('late root read')}),abort(){aborts++;events.get('abort')?.();this.onabort?.();}};
 const db={objectStoreNames:{contains:()=>true},close(){closes++;},transaction(names,mode){assert.equal(mode,'readonly');return tx;}};
 globalThis.indexedDB={databases:async()=>[{name:'vaiwl-b1-v1',version:4}],open(){const r={result:db};queueMicrotask(()=>r.onsuccess());return r;}};t.after(()=>globalThis.indexedDB=original);
 const result=await auditHostScaleIndex(input);timeout(result);assert(aborts>=1);assert(closes>=1);const before=JSON.stringify(result);batchRequest.result=Array.from({length:512},()=>JSON.stringify(['chatgpt','late','scope']));batchRequest.onsuccess();await pause();assert.equal(continued,1);assert.equal(JSON.stringify(result),before);
});
test('default unbounded audit preserves existing partial exact-set oracle',async()=>{
 const result=await auditHostScaleIndex({size:1000,distribution:'project-mixed'},{version:async()=>7,page:async()=>({...page,total:1,nextOffset:1})});assert.equal(result.status,'FAIL_INDEX_CARDINALITY');assert.equal(result.distinctRefs,1);assert.equal(result.missingRefs,999);
});

/** IDB request scheduling double: only transaction completion publishes roots. */
function scanFixture(t,keys,{failure=null,roots=new Set()}={}){
 const original=globalThis.indexedDB,rangeOriginal=globalThis.IDBKeyRange,calls={batches:[],gets:[],aborts:0,transactions:0};let pending=0,done=false;
 const listeners=new Map(),tx={addEventListener:(type,fn)=>listeners.set(type,fn),objectStore:()=>store,abort(){if(done)return;done=true;calls.aborts++;listeners.get('abort')?.();this.onabort?.();}};
 const schedule=(value,kind)=>{const request={};pending++;queueMicrotask(()=>{
  if(done)return;
  if(failure===kind){tx.error=Error('designated-'+kind+'-failure');tx.abort();return;}
  request.result=value;request.onsuccess?.();pending--;
  setImmediate(()=>{if(!done&&pending===0){done=true;listeners.get('complete')?.();tx.oncomplete?.();}});
 });return request;};
 const store={getAllKeys(range,count){assert.equal(count,512);calls.batches.push(range);const offset=range?keys.indexOf(range.lower)+1:0;assert(offset>=0);return schedule(keys.slice(offset,offset+count),'batch');},get(key){calls.gets.push(key);return schedule({payload:{scopeKey:roots.has(key)?key:'different'}},'root');}};
 const db={objectStoreNames:{contains:()=>true},close(){},transaction(name,mode){assert.equal(name,'native_states');assert.equal(mode,'readonly');calls.transactions++;return tx;}};
 globalThis.IDBKeyRange={lowerBound:(lower,open)=>{assert.equal(open,true);return {lower,open};}};
 globalThis.indexedDB={databases:async()=>[{name:'vaiwl-b1-v1',version:4}],open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}};
 t.after(()=>{globalThis.indexedDB=original;globalThis.IDBKeyRange=rangeOriginal;});return calls;
}
for(const count of [511,512,513,1024])test('scope discovery scans complete '+count+' key boundary without sample reduction',async t=>{
 const keys=Array.from({length:count},(_,i)=>'non-root-'+i),calls=scanFixture(t,keys);
 const result=await auditHostScaleIndex({...input,timeoutMs:1000});assert.equal(result.status,'NOT_RUN_INDEX_ABSENT');assert.equal(calls.transactions,1);assert.equal(calls.batches.length,Math.floor(count/512)+1);assert.equal(calls.gets.length,0);
 for(let i=1;i<calls.batches.length;i++)assert.equal(calls.batches[i].lower,keys[i*512-1]);
});
test('later batch second scope is read and rejected as ambiguous, with independent key closures',async t=>{
 const a=JSON.stringify(['chatgpt','first','scope']),b=JSON.stringify(['chatgpt','last','scope']),keys=[a,...Array.from({length:511},(_,i)=>'non-root-'+i),b];
 const calls=scanFixture(t,keys,{roots:new Set([a,b])});const result=await auditHostScaleIndex({...input,timeoutMs:1000});
 assert.equal(result.status,'FAIL_AMBIGUOUS_SCOPE');assert.deepEqual(calls.gets,[a,b]);assert.equal(calls.batches.length,2);assert.equal(calls.transactions,1);
});
test('batch continuation preserves the original nonstring IDB key identity',async t=>{
 const last=new Date(1234),keys=[...Array.from({length:511},(_,i)=>i),last,'trailing'],calls=scanFixture(t,keys);
 assert.equal((await auditHostScaleIndex({...input,timeoutMs:1000})).status,'NOT_RUN_INDEX_ABSENT');assert.equal(calls.batches[1].lower,last);
});
for(const failure of ['batch','root'])test('scope discovery '+failure+' request error cannot publish partial scope selection',async t=>{
 const a=JSON.stringify(['chatgpt','first','scope']),calls=scanFixture(t,[a],{failure,roots:new Set([a])});const result=await auditHostScaleIndex({...input,timeoutMs:1000});
 assert.equal(result.status,'FAIL_INDEX_AUDIT');assert.equal(result.error,'designated-'+failure+'-failure');assert.equal(calls.aborts,1);
});
