/** Real observation owner; handshake/frame and immutable scope renewal are explicit unit doubles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostObservationOwner} from '../../src/runtime/host-observation-owner.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
const url='https://chatgpt.com/c/C';
async function fixture(t,transport){
 const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'self',organizationId:'personal'});
 let serial=0,grant=Object.freeze({id:'grant',scopeEpoch:1,principal:Object.freeze({id:'receipt_0',providerProfile:'session_v1',transport}),expiresAt:new Date(61000).toISOString()});
 const profile={id:'surface',revision:1,currentBody:{rootSelector:'main',conversationIdAttribute:'data-id',messageSelector:'article',messageIdAttribute:'data-id'},urlPolicy:{parse:()=>({kind:'conversation',conversationId:'C',navigationURL:url})}};
 const owner=createHostObservationOwner({handshake:{verify:async()=>true,isBound:()=>true,matchesFrame:()=>true},authority:{peek:()=>({state:'verified',grant}),scopeFor:()=>scope},getFrame:async()=>({url,documentId:'doc'}),profiles:new Map([[profile.id,profile]]),now:()=>1000,makeId:()=> 'proof'});t.after(()=>owner.stop());
 const proposal={protocol:'vaiwl-host-observation/1',documentToken:'document',producerToken:'producer',routeEpoch:1,localSeq:1,profileId:'surface',profileVersion:1,bodyProofId:null,kind:'current-object',payload:{conversationId:'C',messageIds:['m'],association:'explicit-body-id',regionEpoch:1,evidence:{profileId:'surface',profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['current-body-explicit-id','current-body-message-ids'],receiptId:null}}};
 assert.equal((await owner.ingest(proposal,{tab:{id:1}},{})).state,'accepted');
 return {owner,renew(next=grant.principal.transport,providerProfile='session_v1'){grant=Object.freeze({...grant,principal:Object.freeze({...grant.principal,id:'receipt_'+ ++serial,transport:next,providerProfile})});}};
}
for(const from of ['isolated-fixed-fetch','worker-fixed-fetch'])test(from+' in-flight read rejects transport renewal, next read uses new provenance',async t=>{
 const f=await fixture(t,from),to=from==='isolated-fixed-fetch'?'worker-fixed-fetch':'isolated-fixed-fetch';let seen,guardAfter;
 await assert.rejects(f.owner.withCurrent('proof',async context=>{seen=context;assert.equal(context.providerTransport,from);assert.equal(context.guard(),true);f.renew(to);await Promise.resolve();guardAfter=context.guard();return 'stale-work';}),/stale-body-proof/);
 assert.equal(guardAfter,false);assert.equal(seen.providerTransport,from,'captured object remains immutable');assert(Object.isFrozen(seen));
 assert.equal(await f.owner.withCurrent('proof',context=>{assert.equal(context.guard(),true);return context.providerTransport;}),to);
});
for(const transport of ['isolated-fixed-fetch','worker-fixed-fetch'])test(transport+' same-source receipt renewal preserves in-flight work',async t=>{
 const f=await fixture(t,transport);assert.equal(await f.owner.withCurrent('proof',async context=>{f.renew();await Promise.resolve();assert.equal(context.guard(),true);return context.providerTransport;}),transport);
});
test('in-flight provider-profile change rejects even if grant and scope are preserved',async t=>{
 const f=await fixture(t,'worker-fixed-fetch');let guardAfter;await assert.rejects(f.owner.withCurrent('proof',async context=>{f.renew('worker-fixed-fetch','other');await Promise.resolve();guardAfter=context.guard();return 'stale-work';}),/stale-body-proof/);assert.equal(guardAfter,false);
});
