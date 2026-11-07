import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {auditHostScaleIndex} from '../../host/fixtures/host-scale-audit.mjs';
import {A,B,setup,pages,cleanup,readRow,writeRow,scopeKey,refId,nativeRecord} from './fixture.mjs';
after(cleanup);
const indexReads=h=>h.reads.filter(row=>row.store==='native_states'&&row.key.includes('native-version-index')).length;
const factReads=h=>h.reads.filter(row=>row.store==='native_states'&&row.key.includes('native-piece')).length;
const runAudit=h=>auditHostScaleIndex({size:1000,distribution:'single-project',requireProjectMembership:true,limit:500}, {version:()=>h.native.version(A),page:options=>h.native.page(A,options)});
test('actual repository pages are byte-for-byte equal while full-manifest reconstruction disappears',async t=>{
 const baseline=await setup('baseline'),candidate=await setup('candidate');
 try{const a=await pages(baseline),b=await pages(candidate);assert.deepEqual(b,a);assert.equal(JSON.stringify(b),JSON.stringify(a));assert.equal(a.length,5);assert.equal(baseline.api.cost.materializeCalls,5);assert.equal(baseline.api.cost.materializedRows,545);assert.equal(candidate.api.cost.materializeCalls,0);assert.equal(candidate.api.cost.materializedRows,0);assert.equal(indexReads(candidate),indexReads(baseline));assert.equal(factReads(candidate),factReads(baseline));assert.equal(indexReads(candidate)%a.length,0);t.diagnostic(JSON.stringify({pages:a.length,rowsPerPage:109,baseline:{...baseline.api.cost},candidate:{...candidate.api.cost},indexReadsPerVariant:indexReads(candidate),factReadsPerVariant:factReads(candidate)}));}finally{baseline.close();candidate.close();}
});
test('the unchanged complete audit passes twice; every second-pass index and fact read remains fresh',async t=>{
 const h=await setup('candidate',1000);try{const one=await runAudit(h),reads1=indexReads(h),facts1=factReads(h);assert.equal(one.status,'PASS_INDEX_AUDIT_ONLY');assert.equal(one.pages,3);assert.equal(one.projectMembership,1000);assert.equal(one.unknownMembership,0);const two=await runAudit(h);assert.deepEqual(two,one);assert.equal(indexReads(h),reads1*2);assert.equal(factReads(h),facts1*2);assert.equal(h.api.cost.materializeCalls,0);t.diagnostic(JSON.stringify({audits:2,pages:two.pages,refs:two.distinctRefs,revision:two.revision,indexReads:indexReads(h),factReads:factReads(h)}));}finally{h.close();}
});
test('after a complete pass a corrupted late member cannot be masked by an earlier page or audit',async()=>{
 const h=await setup('candidate',1000);try{assert.equal((await runAudit(h)).status,'PASS_INDEX_AUDIT_ONLY');const key=JSON.stringify([scopeKey,'native-piece','refs',refId(999),1]);await writeRow(h,key,row=>({...row,checksum:'0'.repeat(64)}));const bad=await runAudit(h);assert.equal(bad.status,'FAIL_INDEX_AUDIT');assert.match(bad.error,/corrupt-native-record/);}finally{h.close();}
});
test('warm pagination never reuses a changed index bucket outside the selected page',async()=>{
 const h=await setup();try{await h.native.page(A,{revision:2,limit:1});const root=(await readRow(h,scopeKey)).payload;const indexKey=h.reads.find(row=>row.key.includes('native-version-index')&&row.key.includes('refs')).key;await writeRow(h,indexKey,row=>({...row,checksum:'0'.repeat(64)}));await assert.rejects(h.native.page(A,{revision:2,limit:1}),/corrupt-native-record/);assert.equal(root.revision,2);}finally{h.close();}
});
test('source revocation preserves known facts but rejects old-revision pages and exposes revoked source on fresh read',async()=>{
 const h=await setup();try{const old=await pages(h);assert.equal((await h.native.invalidate(A,{operationId:'revoke',expectedRevision:2,sourceId:'audit_fixture'})).ok,true);await assert.rejects(h.native.page(A,{revision:2,limit:1}),/snapshot-revision-changed/);const fresh=await pages(h,{revision:3});assert.equal(fresh[0].facts.sources.audit_fixture.revoked,true);assert.deepEqual(fresh.flatMap(page=>page.selectedRefs),old.flatMap(page=>page.selectedRefs));}finally{h.close();}
});
test('scope changes do not reuse IDs from the previous scope',async()=>{const h=await setup();try{await pages(h);const page=await h.native.page(B,{limit:25});assert.equal(page.total,0);assert.deepEqual(page.selectedRefs,[]);assert.deepEqual(page.selectedProjects,[]);}finally{h.close();}});
for(const at of ['bucket','fact'])for(const method of ['guard','signal'])test('authorization loss during '+at+' callback rejects old page: '+method,async()=>{
 const h=await setup();const original=h.db.transaction.bind(h.db);let allowed=true,hit=false;const controller=new AbortController();try{
  h.db.transaction=(...args)=>{const tx=original(...args),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name),get=store.get.bind(store);store.get=key=>{const req=get(key);if(!hit&&key.includes(at==='bucket'?'native-version-index':'native-piece')){let callback;Object.defineProperty(req,'onsuccess',{get:()=>callback,set:fn=>{callback=event=>{hit=true;allowed=false;if(method==='signal')controller.abort();fn(event);};}});}return req;};return store;};return tx;};
  await assert.rejects(h.native.page(A,{revision:2,limit:25},{guard:()=>method==='guard'?allowed:true,signal:controller.signal}),/stale-binding/);assert.equal(hit,true);
 }finally{h.close();}
});
test('new revisions with retention cannot resurrect an old page, and fresh pages match the baseline owner',async()=>{
 const a=await setup('baseline'),b=await setup('candidate');try{for(const h of [a,b]){await pages(h);for(let rev=3;rev<=5;rev++){const request=structuredClone(h.request);request.operationId='update_'+rev;request.expectedRevision=rev-1;request.batch.sourceRevision=rev;request.batch.projects=[];request.batch.refs=request.batch.refs.slice(0,1);request.batch.refs[0].nativeTitle='fresh '+rev;request.batch.membership=request.batch.membership.slice(0,1);assert.equal((await h.native.apply(A,request)).ok,true);}await assert.rejects(h.native.page(A,{revision:2,limit:25}),/snapshot-revision-changed/);assert.equal(await readRow(h,JSON.stringify([scopeKey,'native-piece','refs',refId(0),1])),undefined);}assert.deepEqual(await pages(b,{revision:5}),await pages(a,{revision:5}));}finally{a.close();b.close();}
});
