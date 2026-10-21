import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {partialCheckpoints,partialPageIds,partialUnion,assertPartialObserved,assertPartialPaging} from './partial-paging-oracle.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {samplePartialPaging} from './partial-paging-sample.mjs';
test('independent PARTIAL overlap oracle preserves missing 50 and deduplicates 25',()=>{assert.equal(partialPageIds(25).length,25);assert.equal(partialUnion(25).length,50);assert.equal(partialUnion(50).length,75);assert.equal(partialUnion(50,{searched:true}).length,76);assert(!partialUnion(50).some(id=>id.endsWith('000000000050')));assertPartialPaging(samplePartialPaging());});
for(const [name,mutate] of Object.entries({hiddenFrame:r=>r.unmountTransition.workspaceReentered=false,unacceptedRename:r=>r.afterUnmount.titles[partialUnion(50).at(-1)]='Archive conversation 1000',title:r=>r.pages[0].observed.titles[r.pages[0].observed.ids[0]]='Wrong identity title',workerFetch:r=>r.serverRequestOffsets.push(75),duplicate:r=>r.pages[0].observed.ids.push(r.pages[0].observed.ids[0]),lostOld:r=>r.pages[1].observed.ids.shift(),unexposed:r=>r.afterSearch.ids.push('unseen'),scope:r=>r.afterUnmount.scopeKey='wrong',crossScope:r=>r.afterUnmount.foreignIds=['leak'],none:r=>r.afterUnmount.rawMemberships[r.afterUnmount.ids[0]]='NONE',project:r=>r.afterUnmount.rawMemberships[r.afterUnmount.ids[0]]='PROJECT',projectedNone:r=>r.afterUnmount.projectedMemberships[r.afterUnmount.ids[0]]='NONE',missingProjected:r=>delete r.afterUnmount.projectedMemberships[r.afterUnmount.ids[0]],complete:r=>r.afterUnmount.inventories=['complete'],draft:r=>r.afterSearch.draftPreserved=false,offset:r=>r.pages[1].offset=75,limit:r=>r.pages[0].limit=1000,window:r=>r.pages[0].windowed=false,context:r=>r.pages[0].context='other',method:r=>r.pages[0].method='POST',hiddenFetch:r=>r.requestOffsets.push(75),missingPage:r=>r.pages.pop()}))test('PARTIAL evidence rejects '+name,()=>{const r=samplePartialPaging();mutate(r);assert.throws(()=>assertPartialPaging(r));});
test('runner uses actual wheel and native response, keeps all original checkpoints',async()=>{const s=await readFile(new URL('./partial-package-mv3-browser.mjs',import.meta.url),'utf8');for(const n of partialCheckpoints)assert(s.includes(n));assert(s.includes('page.mouse.wheel'));assert(s.includes('page.waitForResponse'));assert(!s.includes("dispatchEvent(new Event('scroll'))"));assert(!s.includes('repo.apply('));});
test('PARTIAL window option is restricted and default fixture still appends',async()=>{
 await assert.rejects(()=>createVariantHostFixtureServer({profile:'MODERN',partialWindowed:true}),/invalid-partial-windowed/);
 for(const partialWindowed of [false,true]){const server=await createVariantHostFixtureServer({profile:'PARTIAL',variant:'conflict',partialWindowed});try{
  const home=await fetch(server.url),cookie=home.headers.get('set-cookie').split(';')[0];
  for(const offset of [25,50]){const response=await fetch(`${server.origin}/backend-api/conversations?offset=${offset}&limit=25`,{headers:{cookie,'Chatgpt-Account-Id':'account-host-personal'}}),data=await response.json();assert.equal(response.status,200);assert.equal(data.windowed,partialWindowed);assert.equal(data.total,1000);assert.equal(data.next_offset,offset+25);assert.deepEqual(data.items.map(x=>x.id),partialPageIds(offset));assert(data.items.every(x=>!('project'in x)));}
  const search=await fetch(`${server.origin}/backend-api/conversations?query=Archive%20conversation%20999`,{headers:{cookie}});assert.equal((await search.json()).windowed,false);
 }finally{await server.close();}}
});

test('PARTIAL unmount regression requires surrender and title admission before real return and exact UI assertion',async()=>{
 const source=await readFile(new URL('./partial-package-mv3-browser.mjs',import.meta.url),'utf8'),remove=source.indexOf("nav.querySelectorAll('a').forEach(a=>a.remove())"),closed=source.indexOf("document.querySelectorAll('[data-va-owned]:popover-open').length===0",remove),rename=source.indexOf("node.textContent='Archive conversation 1000 refreshed'",closed),admit=source.indexOf('await waitObserved(50,{refreshed:true})',rename),back=source.indexOf('await nativeReturn.click();frame=await workspace()',admit),ui=source.indexOf("name:'Archive conversation 1000 refreshed',exact:true",back);
 assert(remove>=0&&closed>remove&&rename>closed&&admit>rename&&back>admit&&ui>back);
 const mount=await readFile(new URL('../../src/navigation/mount-surface.mjs',import.meta.url),'utf8');assert(mount.includes('surrenderChanged(records)'));assert(mount.includes('if(affected){surrender(m);changed=true;}'));
 const discovery=await readFile(new URL('../../src/host/surface-discovery.mjs',import.meta.url),'utf8');assert(discovery.includes("reading.getAttribute(profile.currentConversationIdAttribute)===route.conversationId"));assert(discovery.includes("evidence('current-conversation-route','current-conversation-header','current-conversation-reading-id')"));
});

test('unobserved membership is absent in storage but UNKNOWN for every production-projected ref',()=>{const r=samplePartialPaging();assert.deepEqual(r.afterUnmount.rawMemberships,{});assertPartialPaging(r);r.afterUnmount.rawMemberships[r.afterUnmount.ids[0]]='UNKNOWN';assertPartialPaging(r);r.afterUnmount.rawMemberships.orphan='UNKNOWN';assert.throws(()=>assertPartialPaging(r),/orphan/);});

test('actual surface reducer omits UNKNOWN records while actual Free projection preserves all 26 UNKNOWN refs',async()=>{
 const {surfaceBatch}=await import('../../src/host/surface-batch.mjs'),{createURLPolicy}=await import('../../src/host/url-policy.mjs'),{emptyNativeFacts,applyNativeObservations}=await import('../../src/data/native-facts.mjs'),{freeProjection}=await import('../../src/data/free-projection.mjs'),{partialScope}=await import('./partial-paging-oracle.mjs');
 const ids=partialUnion(0),now='2026-10-21T00:00:00.000Z',binding={documentToken:'doc',producerToken:'producer',routeEpoch:1},profile={id:'partial-test',revision:1};
 const evidence=()=>({profileId:profile.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null});
 const proposal={protocol:'vaiwl-host-observation/1',...binding,localSeq:1,profileId:profile.id,profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:ids.map(id=>({renderKey:'conversation:'+id,entity:'conversation',nativeTitle:'Observed title',titleState:'exact',target:{kind:'resolved',entity:'conversation',nativeId:id,navigationURL:'https://chatgpt.com/c/'+id,liveHandle:null},evidence:evidence()})),membershipClaims:ids.map(id=>({conversationId:id,asserted:'UNKNOWN',projectId:null,reason:'membership-not-observed',evidence:evidence()})),coverageClaims:[],detachedHandles:[]}};
 const batch=surfaceBatch(proposal,{scope:partialScope,binding,profile,urlPolicy:createURLPolicy(),sourceRevision:1,observedAt:now,validUntil:'2026-10-21T00:01:00.000Z'});
 assert.equal(batch.refs.length,26);assert.deepEqual(batch.membership,[]);
 // Pure unit construction, not injected into the browser or a privileged RPC.
 const facts=applyNativeObservations(emptyNativeFacts(partialScope),batch,{scope:partialScope,channel:'synthetic',sourceId:'unit_observation',generation:'one',now});
 assert.deepEqual(facts.membership,{});const projection=freeProjection(facts,{scope:partialScope,now});assert.deepEqual(projection.refs.map(r=>r.id).sort(),ids);assert(projection.refs.every(r=>r.membership==='UNKNOWN'));assert.deepEqual(projection.noProject,[]);
 // Raw-state rejection remains independent of projection TTL/readability.
 const report=samplePartialPaging();report.afterUnmount.rawMemberships[ids[0]]='NONE';assert.throws(()=>assertPartialPaging(report),/must not persist NONE/);
});
