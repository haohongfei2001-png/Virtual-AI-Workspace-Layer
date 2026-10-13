/** Real IDB storage primitives only; not repository migration or activity certification. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const files=['src/data/evidence-ref-directory.mjs','src/data/free-evidence-partitions.mjs','src/data/free-evidence.mjs','src/data/hash.mjs','src/data/schema.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')]))),sourceHashes=await hashes();
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
const result=await page.evaluate(async()=>{
 const {ScopeRepository}=await import('/src/b1/scope-repository.mjs'),{scopeOf}=await import('/simulator/data.mjs'),{normalizedScope}=await import('/src/b1/identity.mjs'),{evidenceRecord,unpackEvidence,freeEvidenceKey}=await import('/src/data/free-evidence-partitions.mjs'),index=await import('/src/data/evidence-ref-directory.mjs');
 const scope=normalizedScope(scopeOf('A')),rootKey=freeEvidenceKey(scope.key),base=new ScopeRepository({indexedDB,databaseName:'evidence-directory-primitive-synthetic'}),db=await base.open(),checks=[];
 const check=(v,m)=>{if(!v)throw Error(m);},eq=(a,b,m)=>check(JSON.stringify(a)===JSON.stringify(b),m);
 const refs=Array.from({length:100000},(_,i)=>'R'+i),manifest={format:'vaiwl-free-evidence-partitions-v1',scopeKey:scope.key,revision:1,sources:{},refVersions:Object.fromEntries(refs.map(ref=>[ref,1])),indexVersions:{},counts:{events:0,hints:0,coverage:0},sizes:Object.fromEntries(refs.map((ref,i)=>[ref,200+i%31]))};
 const initial=index.buildEvidenceRefDirectory(manifest,scope);
 const persist=(built,abort=false)=>new Promise((resolve,reject)=>{const tx=db.transaction(['native_states','native_operations'],'readwrite');for(const row of built.records)tx.objectStore('native_states').put(row);tx.objectStore('native_states').put(evidenceRecord(rootKey,built.root));tx.objectStore('native_operations').put(evidenceRecord(rootKey,{revision:built.root.revision}));tx.oncomplete=()=>resolve(true);tx.onabort=()=>abort?resolve(false):reject(tx.error);if(abort)tx.abort();});
 const read=()=>new Promise((resolve,reject)=>{const tx=db.transaction(['native_states','native_operations']),q=tx.objectStore('native_states').getAll(),m=tx.objectStore('native_operations').get(rootKey);tx.oncomplete=()=>resolve({root:unpackEvidence(q.result.find(r=>r.key===rootKey)),records:q.result.filter(r=>r.key!==rootKey),marker:unpackEvidence(m.result)});tx.onabort=()=>reject(tx.error);});
 await persist(initial);const first=await read();eq(index.materializeEvidenceRefDirectory(first.root,scope,first.records),manifest,'100k version-size-order roundtrip');checks.push('100k-real-idb-version-size-order-roundtrip');
 const bucket=index.evidenceRefBucket('R99999'),physical=index.evidenceRefDirectoryKey(scope.key,bucket,first.root.directory[bucket].revision),updated=index.updateEvidenceRefDirectory(first.root,scope,2,{R99999:{version:2,size:455}},first.records.filter(r=>r.key===physical));check(updated.records.length===1,'one touched bucket');
 check(await persist(updated,true)===false,'abort');eq(await read(),first,'aborted pieces root marker');checks.push('atomic-abort-preserves-pieces-root-marker');
 await persist(updated);const final=await read(),wanted=new Set(Object.entries(final.root.directory).map(([b,p])=>index.evidenceRefDirectoryKey(scope.key,b,p.revision))),currentRecords=final.records.filter(r=>wanted.has(r.key)),current=index.materializeEvidenceRefDirectory(final.root,scope,currentRecords);
 check(current.refVersions.R99999===2&&current.sizes.R99999===455,'version and size paired');eq(Object.keys(current.refVersions),refs,'order retained');check(final.marker.revision===2,'marker');checks.push('one-bucket-update-version-size-binding');
 eq(index.materializeEvidenceRefDirectory(first.root,scope,first.records),manifest,'prior bytes retained');checks.push('prior-directory-retained');
 let rejected=false;try{index.updateEvidenceRefDirectory(final.root,scope,3,{overflow:{version:3,size:200}},currentRecords.filter(r=>r.payload.bucket===index.evidenceRefBucket('overflow')));}catch(e){rejected=e.message==='evidence-directory-capacity';}check(rejected,'100001 refused');checks.push('100001-capacity-rejected');
 base.close();return {checks,refs:100000,buckets:initial.records.length,updatedBuckets:updated.records.length,updatedBucketRows:Object.keys(updated.records[0].payload.versions).length};
});assert.deepEqual(await hashes(),sourceHashes);await writeFile(process.argv[2]??'/private/tmp/free-evidence-directory.json',JSON.stringify({evidence:'REAL_IDB_EVIDENCE_DIRECTORY_PRIMITIVE_NOT_RUNTIME_MIGRATION',browser:browser.version(),sourceHashes,result},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
