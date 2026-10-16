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
test('timeout aborts actual tracked readonly transaction and closes database; late cursor cannot continue',async t=>{
 const original=globalThis.indexedDB,cursorRequest={},events=new Map();let aborts=0,closes=0,continued=0;const tx={addEventListener:(type,fn)=>events.set(type,fn),objectStore:()=>({openKeyCursor:()=>cursorRequest}),abort(){aborts++;events.get('abort')?.();this.onabort?.();}};
 const db={objectStoreNames:{contains:()=>true},close(){closes++;},transaction(names,mode){assert.equal(mode,'readonly');return tx;}};
 globalThis.indexedDB={databases:async()=>[{name:'vaiwl-b1-v1',version:4}],open(){const r={result:db};queueMicrotask(()=>r.onsuccess());return r;}};t.after(()=>globalThis.indexedDB=original);
 const result=await auditHostScaleIndex(input);timeout(result);assert(aborts>=1);assert(closes>=1);const before=JSON.stringify(result);cursorRequest.result={key:'irrelevant',continue(){continued++;}};cursorRequest.onsuccess();await pause();assert.equal(continued,0);assert.equal(JSON.stringify(result),before);
});
test('default unbounded audit preserves existing partial exact-set oracle',async()=>{
 const result=await auditHostScaleIndex({size:1000,distribution:'project-mixed'},{version:async()=>7,page:async()=>({...page,total:1,nextOffset:1})});assert.equal(result.status,'FAIL_INDEX_CARDINALITY');assert.equal(result.distinctRefs,1);assert.equal(result.missingRefs,999);
});
