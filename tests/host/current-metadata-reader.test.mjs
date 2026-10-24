import test from 'node:test';
import assert from 'node:assert/strict';
import {createCurrentMetadataReader} from '../../src/runtime/current-metadata-reader.mjs';
import {digest} from '../../src/data/hash.mjs';
import {parseConversationMetadata} from '../../src/host/conversation-metadata.mjs';
const C='11111111-1111-1111-1111-111111111111',principal='principal_'+'a'.repeat(64),account='context_'+'b'.repeat(64),time=Date.parse('2026-10-14T00:00:00Z');
function fixture(options={}){const {ack=false,history=false,...readerOptions}=options;let current=true,calls=0,hold=null;const abort=new AbortController(),scope={accountId:principal,organizationId:account};
 const context={scope,conversationId:C,messageIds:['m1'],bodyEpoch:3,providerProfile:'fixture_session',providerTransport:'worker-fixed-fetch',guard:()=>current,signal:abort.signal};
 const metadata=parseConversationMetadata({conversationId:C,principalId:'SELF',payload:JSON.stringify({id:C,mapping:{n1:{id:'n1',parent:null,message:{id:'m1',author:{role:'user',id:'SELF'},create_time:time/1000,content:{parts:['PRIVATE BODY']}}},n2:{id:'n2',parent:'n1',message:{id:'m2',author:{role:'assistant'},create_time:time/1000}}}})});
 const response={principalKey:principal,contextKey:account,expiresAt:new Date(time+60000).toISOString(),providerProfile:'fixture_session',transport:'worker-fixed-fetch',metadata};let request;
 const provider={async readCurrentConversation(input){calls++;request=input;if(hold)await hold;return response;}};
 if(ack)provider.acceptanceFor=result=>result===response?{profile:{id:'offline_ack',revision:1,providerProfile:'fixture_session',ack:{kind:'authenticated-message-readback',acceptedStates:['fixture-accepted']}},conversationId:C,principalKey:principal,contextKey:account,expiresAt:response.expiresAt,providerProfile:'fixture_session',transport:'worker-fixed-fetch',messages:[{messageId:'m1',mappingNodeId:'n1',role:'user',authorPrincipalKey:principal,lineage:structuredClone(metadata.messages[0].lineage),acceptanceState:'fixture-accepted'}]}:null;
 if(history)provider.historyFor=result=>result===response?{conversationId:C,principalKey:principal,contextKey:account,expiresAt:response.expiresAt,providerProfile:'fixture_session',transport:'worker-fixed-fetch',messages:[{messageId:'m1',branchId:'lineage_'+metadata.messages[0].lineage.fingerprint}]}:null;
 const observations={async withCurrent(proof,work){assert(['proof','other'].includes(proof));if(!current)throw Error('stale-body-proof');const result=await work(context);if(!current)throw Error('stale-body-proof');return result;}};
 const reader=createCurrentMetadataReader({observations,provider,enabled:true,now:()=>time,...readerOptions});
 return {reader,provider,observations,context,response,metadata,get calls(){return calls;},get request(){return request;},revoke(){current=false;abort.abort();},hold(){let resolve;hold=new Promise(r=>resolve=r);return resolve;}};
}
test('private read binds exact scope identity and current C, filters unseen IDs and never copies body',async()=>{const f=fixture(),value=await f.reader.read('proof');assert.deepEqual(Object.keys(value),['state','conversationId','bodyEpoch','metadata']);assert.equal(value.bodyEpoch,3);assert.deepEqual(value.metadata.messages.map(m=>m.messageId),['m1']);assert.equal(value.metadata.messages[0].selfMatchCandidate,true);assert.equal(value.metadata.coverage,'observed-only');assert.equal(f.request.expectedPrincipalKey,principal);assert.equal(f.request.expectedContextKey,account);assert.equal(f.request.conversationId,C);assert(!JSON.stringify(value).includes('PRIVATE BODY'));assert(!JSON.stringify(value).includes(principal));assert(!('sentAt'in value.metadata.messages[0]));assert(!('ackWitness'in value.metadata.messages[0]));});
test('default disabled performs no owner or provider read',async()=>{const reader=createCurrentMetadataReader({observations:{withCurrent(){assert.fail('owner called');}},provider:{readCurrentConversation(){assert.fail('provider called');}}});await assert.rejects(reader.read('proof'),/disabled/);});
test('empty current body never fetches, remains observed-only',async()=>{const f=fixture();f.context.messageIds=[];const result=await f.reader.read('proof');assert.equal(f.calls,0);assert.deepEqual(result.metadata.messages,[]);assert.equal(result.metadata.coverage,'observed-only');});
test('same proof singleflight, other proof busy without retry',async()=>{const f=fixture(),release=f.hold(),a=f.reader.read('proof'),b=f.reader.read('proof');assert.equal(a,b);await assert.rejects(f.reader.read('other'),/busy/);await Promise.resolve();release();await a;assert.equal(f.calls,1);});
for(const field of ['principalKey','contextKey','providerProfile','transport','expiresAt','conversationId','protocol'])test('rejects mismatched or expired '+field,async()=>{const f=fixture();if(field==='conversationId'||field==='protocol')f.metadata[field]='wrong';else f.response[field]=field==='expiresAt'?new Date(time).toISOString():'wrong';await assert.rejects(f.reader.read('proof'),/invalid-current-metadata/);});
for(const action of ['stop','revoke'])test(action+' rejects inflight and late response',async()=>{const f=fixture(),release=f.hold(),pending=f.reader.read('proof');await Promise.resolve();await Promise.resolve();if(action==='stop')f.reader.stop();else f.revoke();await assert.rejects(pending);release();await assert.rejects(f.reader.read('proof'));assert.equal(f.calls,1);});
test('partial gaps survive filtering, no invented completeness',async()=>{const f=fixture();f.metadata.state='partial';f.metadata.gaps=[{reason:'missing-parent',nodeId:'n2'}];const r=await f.reader.read('proof');assert.equal(r.state,'partial');assert.deepEqual(r.metadata.gaps,f.metadata.gaps);assert.equal(r.metadata.coverage,'observed-only');});
test('provider injected raw extra metadata field is rejected',async()=>{const f=fixture();f.metadata.messages[0].body='not allowed';await assert.rejects(f.reader.read('proof'),/invalid-current-metadata/);});
test('bounded output rejects oversized observed lineage instead of returning a truncated complete batch',async()=>{const f=fixture(),messages=[];for(let i=0;i<256;i++){const node='n'+i,ancestors=Array.from({length:31},(_,j)=>'x'.repeat(120)+j);messages.push({...f.metadata.messages[0],messageId:'m'+i,mappingNodeId:node,lineage:{kind:'derived',nodeIds:[...ancestors,node],fingerprint:digest([C,[...ancestors,node]])}});}f.metadata.messages=messages;f.context.messageIds=messages.map(m=>m.messageId);await assert.rejects(f.reader.read('proof'),/invalid-current-metadata/);});
test('no repository or mutation API is accepted or called; successful reads stay candidates',async()=>{const f=fixture();assert.deepEqual(Object.keys(f.reader).sort(),['isIdle','read','readCalibration','stop','withReadback'].sort());const r=await f.reader.read('proof');assert.equal(r.state,'candidate');assert.equal(r.metadata.protocol,'vaiwl-conversation-metadata-candidate/1');assert(!('actorVerified'in r.metadata.messages[0]));});

test('disabled composition permits legacy provider with read only; enabled requires current reader',async()=>{const options={observations:{withCurrent(){assert.fail('owner called');}},provider:{read(){assert.fail('identity called');}}};await assert.rejects(createCurrentMetadataReader(options).read('proof'),/disabled/);assert.throws(()=>createCurrentMetadataReader({...options,enabled:true}),/invalid-current-metadata-reader/);});
for(const kind of ['messages','gaps','lineage','currentIds'])test('rejects '+kind+' array accessors without evaluating them',async()=>{const f=fixture(),array=kind==='messages'?f.metadata.messages:kind==='gaps'?f.metadata.gaps:kind==='lineage'?f.metadata.messages[0].lineage.nodeIds:f.context.messageIds;if(!array.length)array.push({reason:'missing-parent'});Object.defineProperty(array,'0',{get(){assert.fail('accessor executed');},enumerable:true});await assert.rejects(f.reader.read('proof'),/invalid-current-metadata/);});
for(const kind of ['sparse','decorated'])test('rejects '+kind+' metadata arrays',async()=>{const f=fixture();if(kind==='sparse')delete f.metadata.messages[0];else f.metadata.messages.toJSON=()=>assert.fail('toJSON executed');await assert.rejects(f.reader.read('proof'),/invalid-current-metadata/);});
test('missing current message IDs downgrade to explicit partial gap, never an empty successful baseline',async()=>{const f=fixture();f.context.messageIds=['missing'];const result=await f.reader.read('proof');assert.equal(result.state,'partial');assert.deepEqual(result.metadata.gaps,[{reason:'current-message-missing'}]);assert.deepEqual(result.metadata.messages,[]);});
test('missing current ID with full gap budget fails closed',async()=>{const f=fixture();f.context.messageIds=['missing'];f.metadata.state='partial';f.metadata.gaps=Array.from({length:256},()=>({reason:'missing-parent'}));await assert.rejects(f.reader.read('proof'),/invalid-current-metadata/);});
for(const [raw,precision]of [[123,'second'],[null,'millisecond'],['2026-10-14','second'],['2026-10-14T00:00:00Z','millisecond']])test('rejects inconsistent raw time and precision '+String(raw),async()=>{const f=fixture();Object.assign(f.metadata.messages[0],{rawCreateTime:raw,precisionCandidate:precision});await assert.rejects(f.reader.read('proof'),/invalid-current-metadata/);});
test('rejects lineage fingerprint mismatch and false self-role claim',async()=>{for(const change of [m=>m.lineage.fingerprint='0'.repeat(64),m=>m.role='assistant']){const f=fixture();change(f.metadata.messages[0]);await assert.rejects(f.reader.read('proof'),/invalid-current-metadata/);}});
test('singleflight output is deeply frozen and detached from provider response',async()=>{const f=fixture(),result=await f.reader.read('proof');assert(Object.isFrozen(result.metadata.messages[0].lineage.nodeIds));f.metadata.messages[0].authorId='changed';assert.equal(result.metadata.messages[0].authorId,'SELF');assert.throws(()=>result.metadata.messages.push({}),TypeError);});
test('replacing current guard and signal during flight cannot authorize a stale result',async()=>{const f=fixture(),release=f.hold(),pending=f.reader.read('proof');await Promise.resolve();await Promise.resolve();f.revoke();f.context.guard=()=>true;f.context.signal=new AbortController().signal;release();await assert.rejects(pending);});

test('private readback callback binds exact result, proof, body and observed message',async()=>{
 const f=fixture({ack:true}),value=await f.reader.read('proof');const result=await f.reader.withReadback(value,'proof','m1',({readback,profile,guard})=>{assert.equal(readback.proofId,'proof');assert.equal(readback.bodyEpoch,3);assert.equal(readback.message.messageId,'m1');assert.equal(profile.id,'offline_ack');guard();assert(Object.isFrozen(readback.message.lineage.nodeIds));return 'ok';});assert.equal(result,'ok');
 for(const [v,p,m]of [[structuredClone(value),'proof','m1'],[value,'other','m1'],[value,'proof','m2']])await assert.rejects(f.reader.withReadback(v,p,m,()=>assert.fail('invalid callback')));
});
for(const kind of ['body','account','principal','profile','transport','conversation','message','revoke','stop'])test('readback rejects '+kind+' change before callback',async()=>{
 const f=fixture({ack:true}),value=await f.reader.read('proof');if(kind==='body')f.context.bodyEpoch++;if(kind==='account')f.context.scope.organizationId='other';if(kind==='principal')f.context.scope.accountId='other';if(kind==='profile')f.context.providerProfile='other';if(kind==='transport')f.context.providerTransport='other';if(kind==='conversation')f.context.conversationId='other';if(kind==='message')f.context.messageIds=[];if(kind==='revoke')f.revoke();if(kind==='stop')f.reader.stop();await assert.rejects(f.reader.withReadback(value,'proof','m1',()=>assert.fail('invalid callback')));
});
test('readback callback rechecks guard after asynchronous work',async()=>{const f=fixture({ack:true}),value=await f.reader.read('proof');await assert.rejects(f.reader.withReadback(value,'proof','m1',async()=>{await Promise.resolve();f.revoke();return 'invalid';}));});
test('unconfigured and partial results have no ACK association',async()=>{for(const ack of [false,true]){const f=fixture({ack});if(ack){f.metadata.state='partial';f.metadata.gaps=[{reason:'missing-parent'}];}const value=await f.reader.read('proof');await assert.rejects(f.reader.withReadback(value,'proof','m1',()=>assert.fail('invalid callback')));}});

test('expired reader association cannot revive after clock rollback',async()=>{let wall=time;const f=fixture({ack:true,now:()=>wall}),value=await f.reader.read('proof');wall+=60000;await assert.rejects(f.reader.withReadback(value,'proof','m1',()=>assert.fail('expired callback')));wall=time;await assert.rejects(f.reader.withReadback(value,'proof','m1',()=>assert.fail('revived callback')));});

test('readback reacquires owner proof after the read attempt guard expires',async()=>{
 const f=fixture({ack:true});let attempts=0;f.observations.withCurrent=async(proof,work)=>{assert.equal(proof,'proof');attempts++;let active=true;const controller=new AbortController();try{return await work({...f.context,signal:controller.signal,guard:()=>active});}finally{active=false;controller.abort();}};
 const value=await f.reader.read('proof');await f.reader.withReadback(value,'proof','m1',({guard})=>guard());assert.equal(attempts,2);
});
for(const field of ['documentToken','producerToken','routeEpoch'])test('readback refuses changed owner binding '+field,async()=>{const f=fixture({ack:true});f.context[field]=field==='routeEpoch'?1:'original';const value=await f.reader.read('proof');f.context[field]=field==='routeEpoch'?2:'changed';await assert.rejects(f.reader.withReadback(value,'proof','m1',()=>assert.fail('changed binding')));});

test('complete authenticated metadata without accepted message reports pending ACK only',async()=>{const f=fixture({ack:true}),original=f.provider.acceptanceFor;f.provider.acceptanceFor=result=>({...original(result),messages:[]});const reader=createCurrentMetadataReader({observations:f.observations,provider:f.provider,enabled:true,now:()=>time}),value=await reader.read('proof');await assert.rejects(reader.withReadback(value,'proof','m1',()=>assert.fail('missing ACK')),/pending-send-ack/);});


const calibrationOptions=()=>({isCurrent:()=>true,signal:new AbortController().signal});
const settleCalibration=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
test('private calibration reads history once without a budget window or ACK readback authority',async()=>{
 const historical=[],f=fixture({ack:true,history:true,onHistorical:async input=>{input.guard();historical.push(input.history);}});
 try{const result=await f.reader.readCalibration('proof',calibrationOptions());assert.equal(f.calls,1);assert.equal(Object.hasOwn(f.request,'budgetWindow'),false);assert.equal(historical.length,1);assert.deepEqual(historical[0].messages.map(m=>m.messageId),['m1']);assert.equal(result.metadata.coverage,'observed-only');assert(!JSON.stringify(result).includes('PRIVATE BODY'));await assert.rejects(f.reader.withReadback(result,'proof','m1',()=>assert.fail('calibration cannot authorize ACK')));}
 finally{f.reader.stop();}
});
for(const options of [{},{isCurrent:()=>true},{signal:new AbortController().signal},{isCurrent:true,signal:new AbortController().signal},{isCurrent:()=>true,signal:{}}])test('calibration rejects incomplete guard/signal contract '+Object.keys(options).join(','),async()=>{
 const f=fixture();try{await assert.rejects(f.reader.readCalibration('proof',options));assert.equal(f.calls,0);}finally{f.reader.stop();}
});
for(const proof of ['proof','other'])test('calibration cannot join or preempt active foreground proof '+proof,async()=>{
 const f=fixture(),release=f.hold(),foreground=f.reader.read('proof');try{await settleCalibration();const signal=f.request.signal;await assert.rejects(f.reader.readCalibration(proof,calibrationOptions()),/busy/);assert.equal(signal.aborted,false);assert.equal(f.calls,1);release();assert.equal((await foreground).state,'candidate');}finally{release();f.reader.stop();}
});
test('second calibration does not join an existing low-priority read',async()=>{
 const f=fixture(),release=f.hold(),first=f.reader.readCalibration('proof',calibrationOptions());try{await settleCalibration();await assert.rejects(f.reader.readCalibration('proof',calibrationOptions()),/busy/);assert.equal(f.calls,1);release();await first;}finally{release();f.reader.stop();}
});
for(const proof of ['proof','other'])test('foreground '+proof+' aborts low-priority read and starts its own provider call',async()=>{
 const historical=[],f=fixture({history:true,onHistorical:async input=>{input.guard();historical.push(input.history);}}),release=f.hold();
 const low=f.reader.readCalibration('proof',calibrationOptions()),rejected=assert.rejects(low);
 try{await settleCalibration();const signal=f.request.signal;const foreground=f.reader.read(proof);await settleCalibration();assert.equal(signal.aborted,true);assert.equal(f.calls,2);await rejected;release();assert.equal((await foreground).state,'candidate');await settleCalibration();assert.equal(historical.length,1,'only current foreground result may reach history');}finally{release();f.reader.stop();}
});
for(const mode of ['guard','signal','owner','stop'])test('calibration '+mode+' cancellation before late provider result cannot publish history',async()=>{
 let current=true,historical=0;const controller=new AbortController(),f=fixture({history:true,onHistorical:async()=>{historical++;}}),release=f.hold();const pending=f.reader.readCalibration('proof',{isCurrent:()=>current,signal:controller.signal}),rejected=assert.rejects(pending);
 try{await settleCalibration();if(mode==='guard')current=false;else if(mode==='signal')controller.abort();else if(mode==='owner')f.revoke();else f.reader.stop();if(mode==='signal')assert.equal(f.request.signal.aborted,true);release();await rejected;await settleCalibration();assert.equal(historical,0);assert.equal(f.calls,1);}finally{release();f.reader.stop();}
});
for(const mode of ['guard','signal','owner','stop'])test('calibration '+mode+' cancellation while historical callback awaits invalidates its write guard',async()=>{
 let current=true,entered=false,release;const held=new Promise(resolve=>release=resolve),controller=new AbortController();let writes=0,callbackContext;
 const f=fixture({history:true,onHistorical:async input=>{entered=true;callbackContext=input.context;assert.equal(input.context.guard(),true);assert.equal(input.context.signal.aborted,false);await held;input.context.guard();input.guard();writes++;}});
 const pending=f.reader.readCalibration('proof',{isCurrent:()=>current,signal:controller.signal}),rejected=assert.rejects(pending);
 try{await settleCalibration();assert.equal(entered,true);if(mode==='guard')current=false;else if(mode==='signal')controller.abort();else if(mode==='owner')f.revoke();else f.reader.stop();assert.throws(()=>callbackContext.guard());if(mode!=='guard')assert.equal(callbackContext.signal.aborted,true);release();await rejected;assert.equal(writes,0);}finally{release();f.reader.stop();}
});
test('calibration provider failure makes one attempt and frees the foreground slot',async()=>{
 const error=Error('fixture provider failure');let calls=0;const f=fixture();const provider={readCurrentConversation:async()=>{calls++;throw error;}};
 const reader=createCurrentMetadataReader({observations:f.observations,provider,enabled:true,now:()=>time});
 try{await assert.rejects(reader.readCalibration('proof',calibrationOptions()),e=>e===error);await settleCalibration();assert.equal(calls,1);await assert.rejects(reader.read('proof'),e=>e===error);assert.equal(calls,2);}finally{reader.stop();f.reader.stop();}
});

test('flat list partial identity stays observed-only through reader and cannot yield ACK',async()=>{
 const f=fixture({ack:true});f.metadata.state='partial';f.metadata.gaps=[{reason:'lineage-unavailable'}];for(const m of f.metadata.messages){m.mappingNodeId=null;m.lineage=null;}
 const value=await f.reader.read('proof');assert.deepEqual(value.metadata.messages.map(m=>m.messageId),['m1']);assert.equal(value.state,'partial');assert.equal(value.metadata.messages[0].mappingNodeId,null);
 await assert.rejects(f.reader.withReadback(value,'proof','m1',()=>assert.fail('invented ACK')),/unavailable-send-readback/);
});
for(const kind of ['candidate','missing-gap','invented-lineage'])test('null mapping node rejects '+kind,async()=>{
 const f=fixture();f.metadata.state='partial';f.metadata.gaps=[{reason:'lineage-unavailable'}];f.metadata.messages[0].mappingNodeId=null;
 if(kind!=='invented-lineage')f.metadata.messages[0].lineage=null;
 if(kind==='candidate')f.metadata.state='candidate';if(kind==='missing-gap')f.metadata.gaps=[];
 await assert.rejects(f.reader.read('proof'),/invalid-current-metadata/);
});
