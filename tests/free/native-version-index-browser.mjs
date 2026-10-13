/** Storage primitive only: not yet the runtime repository format or a send benchmark. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const files=['src/data/native-version-index.mjs','src/data/native-partitions.mjs','src/data/hash.mjs','src/data/schema.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')]))),sourceHashes=await hashes();
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
const result=await page.evaluate(async()=>{
 const {ScopeRepository}=await import('/src/b1/scope-repository.mjs'),{scopeOf}=await import('/simulator/data.mjs'),{emptyNativeFacts}=await import('/src/data/native-facts.mjs'),{nativeRecord,nativeUnpack,NATIVE_PARTITION_FORMAT}=await import('/src/data/native-partitions.mjs'),index=await import('/src/data/native-version-index.mjs');
 const scope=scopeOf('A'),scopeKey=emptyNativeFacts(scope).scopeKey,base=new ScopeRepository({indexedDB,databaseName:'index-primitive-synthetic'}),db=await base.open(),checks=[];
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const manifest={format:NATIVE_PARTITION_FORMAT,scopeKey,revision:1,sources:{},projects:{P:1},refs:Object.fromEntries(Array.from({length:100000},(_,i)=>['R'+i,1])),units:20000000,changes:[]};
 const began=performance.now(),initial=index.buildNativeVersionIndex(manifest,scope),buildMs=performance.now()-began;
 const persist=(built,abort=false)=>new Promise((resolve,reject)=>{const tx=db.transaction(['native_states','native_operations'],'readwrite');for(const row of built.records)tx.objectStore('native_states').put(row);tx.objectStore('native_states').put(nativeRecord(scopeKey,built.root));tx.objectStore('native_operations').put(nativeRecord(scopeKey,{revision:built.root.revision}));tx.oncomplete=()=>resolve(true);tx.onabort=()=>abort?resolve(false):reject(tx.error);if(abort)tx.abort();});
 const read=()=>new Promise((resolve,reject)=>{const tx=db.transaction(['native_states','native_operations']);let root,marker,records=[];const q=tx.objectStore('native_states').openCursor();q.onsuccess=()=>{const c=q.result;if(!c)return;if(c.key===scopeKey)root=nativeUnpack(c.value);else records.push(c.value);c.continue();};const m=tx.objectStore('native_operations').get(scopeKey);m.onsuccess=()=>{marker=nativeUnpack(m.result);};tx.oncomplete=()=>resolve({root,records,marker});tx.onabort=()=>reject(tx.error);});
 await persist(initial);const first=await read(),roundTrip=index.materializeNativeVersionIndex(first.root,scope,first.records);assert(JSON.stringify(roundTrip)===JSON.stringify(manifest),'100k-full-order-roundtrip');checks.push('100k-real-idb-roundtrip');
 const bucket=index.nativeIndexBucket('R99999'),pointer=first.root.refs[bucket],physical=index.nativeIndexKey(scopeKey,'refs',bucket,pointer.revision),touched=first.records.filter(r=>r.key===physical),start=performance.now(),updated=index.updateNativeVersionIndex(first.root,scope,2,{projects:{},refs:{R99999:2}},touched),updateMs=performance.now()-start;
 assert(updated.records.length===1,'one-bucket-write');assert(Object.keys(updated.records[0].payload.versions).length<1000,'representative-bucket-bounded');
 assert(await persist(updated,true)===false,'abort');const rolled=await read();assert(JSON.stringify(rolled)===JSON.stringify(first),'atomic-abort-preserves-root-pieces-marker');checks.push('atomic-abort-root-pieces-marker');
 await persist(updated);const final=await read(),wanted=new Set(['projects','refs'].flatMap(kind=>Object.entries(final.root[kind]).map(([b,p])=>index.nativeIndexKey(scopeKey,kind,b,p.revision)))),currentRecords=final.records.filter(r=>wanted.has(r.key)),current=index.materializeNativeVersionIndex(final.root,scope,currentRecords);
 assert(current.refs.R99999===2&&Object.keys(current.refs).length===100000,'updated-final');assert(Object.keys(current.refs).every((id,i)=>id==='R'+i),'order');assert(final.marker.revision===2,'marker');checks.push('one-bucket-update');
 assert(JSON.stringify(index.materializeNativeVersionIndex(first.root,scope,first.records))===JSON.stringify(manifest),'prior-checkpoint-retained');checks.push('prior-pieces-retained');
 let overflow=false;try{index.updateNativeVersionIndex(final.root,scope,3,{projects:{},refs:{additional:3}},currentRecords.filter(r=>r.payload.kind==='refs'&&r.payload.bucket===index.nativeIndexBucket('additional')));}catch(e){overflow=e.message==='native-index-capacity';}assert(overflow,'100001-capacity');checks.push('capacity-100001-rejected');
 base.close();return {checks,refs:100000,buckets:initial.records.length,updatedBuckets:updated.records.length,updatedBucketRows:Object.keys(updated.records[0].payload.versions).length,buildMs,updateComputeMs:updateMs};
});assert.deepEqual(await hashes(),sourceHashes);const report={evidence:'REAL_IDB_NATIVE_INDEX_PRIMITIVE_NOT_RUNTIME_INTEGRATED',browser:browser.version(),sourceHashes,result};await writeFile(process.argv[2]??'/private/tmp/free-native-version-index.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
