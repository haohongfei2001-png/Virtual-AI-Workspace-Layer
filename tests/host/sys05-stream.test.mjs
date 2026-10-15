import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import vm from 'node:vm';
import {createSys05StreamServer,addSys05NativeStream,sys05AckOnlyMetadata,sys05UpstreamURL} from './fixtures/sys05-stream-server.mjs';
import {parseConversationMetadata} from '../../src/host/conversation-metadata.mjs';
import {extractConversationAcceptance} from '../../src/host/conversation-acceptance.mjs';
import {createCurrentMetadataReader} from '../../src/runtime/current-metadata-reader.mjs';
import {createSendCorrelator} from '../../src/host/send-correlator.mjs';
import {projectFreeActivity} from '../../src/data/free-activity.mjs';
import {createFreeViewSession} from '../../src/data/free-time-policy.mjs';
import {OFFLINE_HISTORY_PROFILE,extractHistoricalSends} from '../../src/runtime/historical-send-profile.mjs';
import {digest} from '../../src/data/hash.mjs';
import {installSys05Observer} from './sys05-stream-observer.mjs';
import {assertTokenOnlyWork,assertStreamOutcome,SYS05_LIMITS} from './sys05-stream-oracle.mjs';
import {runSys05} from './sys05-stream-package-journey.mjs';
const C='44444444-4444-4444-8444-444444444444';
test('candidate defaults to NOT_RUN and never imports or launches browser',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sys05-plan-')),file=join(dir,'report.json'),result=await runSys05(file);
 assert.equal(result.S,'NOT_RUN');assert.equal(result.status,'NOT_RUN');assert.equal(result.fullSYS05,'NOT_ESTABLISHED');assert.deepEqual(JSON.parse(await readFile(file)),result);
});
test('unchanged J4 native POST/authenticated metadata/title behind loopback façade',async()=>{
 const server=await createSys05StreamServer();
 try{
  const denied=await fetch(server.origin+'/api/auth/session');assert.equal(denied.status,401);
  const page=await fetch(server.origin+'/c/'+C),cookie=page.headers.get('set-cookie').split(';')[0];
  const session=await (await fetch(server.origin+'/api/auth/session',{headers:{cookie}})).json();
  const headers={cookie,authorization:'Bearer '+session.accessToken};
  const roster=await (await fetch(server.origin+'/backend-api/accounts/check/v4-2023-04-27',{headers})).json();assert.deepEqual(roster.account_order,['account-host-personal','account-host-team']);
  const post=await fetch(server.origin+'/native/j4/send',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({text:'SYS05 local native fixture request',rename:true})});assert.equal(post.status,200);const accepted=await post.json();
  assert.equal(accepted.title,'J4 native jointly renamed conversation');assert.equal(server.snapshot().interruption.accepts,1);
  const detail=await (await fetch(server.origin+'/backend-api/conversation/'+C,{headers})).json();assert.equal(detail.title,accepted.title);assert.equal(detail.mapping[accepted.message.messageId].message.status,'fixture-accepted');assert.equal(detail.mapping[accepted.message.messageId].message.author.id,'user-host-fixture');assert(!('original_send' in detail.mapping[accepted.message.messageId].message));assert(!('create_time' in detail.mapping[accepted.message.messageId].message));assert(detail.mapping.j4_original_old.message.original_send);
  assert.equal((await fetch(server.origin+'/backend-api/conversation/'+C,{headers:{cookie,authorization:'Bearer invalid'}})).status,401);
  const source=await (await fetch(server.origin+'/native.mjs',{headers:{cookie}})).text();assert(source.includes('globalThis.sys05NativeStream?.jointTick();if(reply.title){'));assert(source.includes("fetch('/native/j4/send'"));
  assert.equal((await fetch(server.origin+'/tests/host/sys05-stream-oracle.mjs',{headers:{cookie}})).status,404);
  const snapshot=server.snapshot();assert(!JSON.stringify(snapshot).includes(session.accessToken));assert(snapshot.sys05Reads.some(r=>r.authenticated&&r.status===200));assert.equal(snapshot.readTraceDropped,0);
 }finally{await server.close();}
});
test('fixture insertion fails closed if original native joint boundary drifts',()=>{
 assert.throws(()=>addSys05NativeStream('no expected handler'),/boundary-changed/);assert.throws(()=>addSys05NativeStream('if(reply.title){if(reply.title){'),/boundary-changed/);
});
function outcome(){
 const hint={messageId:'accepted-id',conversationId:C,firstObservedAt:'2026-01-01T00:00:00Z',hasAckWitness:true,hasSentAt:false};
 const counters={accepted:1,traceDropped:0,observerErrors:0,unknown:0,maxBytes:600,maxCandidates:2,maxMessageIds:3,directoryVisits:10};
 return {workInstrumentation:true,before:{personal:{originalOldEvent:{messageId:'j4_original_old',sentAt:'2025-10-01T00:00:00.000Z',precision:'millisecond',actorVerified:true},activity:{basis:'provisional',reason:'historical-anchor-incomplete',segment:3}}},beforeUI:{recentCurrentRows:0},native:{accepts:1,title:'J4 native jointly renamed conversation',rows:[{id:'accepted-id',author:'user-host-fixture'}]},stream:{realDescendant:true,sameReading:true,jointBatch:true,startedAt:1,jointAt:2,finishedAt:20,ticks:800,mutations:6400,running:false,jointToken:12,tokensAtDurable:20,tokensAtVisibleTitle:30},personal:{activity:{basis:'provisional',reason:'observed-self-send',segment:0},ref:{nativeTitle:'J4 native jointly renamed conversation'},hints:[hint],refIds:[C],projectIds:['p'],budget:{checksumValid:true,requests:12,attemptCounts:[3]}},team:{ref:{nativeTitle:'Membership not loaded'},hints:[],budget:{checksumValid:true,requests:2,attemptCounts:[1]}},ui:{currentRef:C,activityPlacement:'RECENT_LIST_ABSENT_TO_VISIBLE_NOT_CURRENT_CONTEXT',exactTitle:true,ackLatencyMs:100,titleLatencyMs:100,evidenceToVisibleTitleMs:100},work:{active:{counters:{...counters},packets:[{kind:'current-observation',jointTitle:true,messageIds:3,state:'accepted'}]},peer:{counters:{...counters,accepted:0},packets:[]}},loadedDirectoryNodes:10};
}
test('narrow oracle explicitly cannot establish full SYS05, p95 or forced gap',()=>{const value=assertStreamOutcome(outcome());assert.equal(value.fullSYS05,'NOT_ESTABLISHED');assert.equal(value.p95,'NOT_RUN');assert.equal(value.backpressureAndGapFault,'NOT_RUN');});
const mutants={
 'lost ACK':v=>v.personal.hints=[], 'duplicate ACK':v=>v.personal.hints.push({...v.personal.hints[0]}),
 'wrong self':v=>v.native.rows[0].author='other', 'cross scope ACK':v=>v.team.hints.push({...v.personal.hints[0]}),
 'cross scope title':v=>v.team.ref.nativeTitle=v.native.title, 'stopped tokens at durable':v=>v.stream.tokensAtDurable=v.stream.jointToken,
 'stopped tokens at UI':v=>v.stream.tokensAtVisibleTitle=v.stream.tokensAtDurable, 'fake containment':v=>v.stream.realDescendant=false,
 'separate mutation queue':v=>v.stream.jointBatch=false,'nonjoint observation':v=>v.work.active.packets[0].jointTitle=false,
 'native title absent':v=>v.personal.ref.nativeTitle='stale','UI missing':v=>v.ui.exactTitle=false,
 'extra native send':v=>v.native.accepts=2,'packet overflow':v=>v.work.active.counters.maxBytes=65537,
 'candidate overflow':v=>v.work.active.counters.maxCandidates=257,'message overflow':v=>v.work.active.counters.maxMessageIds=257,
 'read budget relaxed':v=>v.personal.budget.requests=13,'retry relaxed':v=>v.personal.budget.attemptCounts=[4],
 'original F1 relaxed':v=>{v.workInstrumentation=false;v.ui.evidenceToVisibleTitleMs=1000;},
 'lost packet telemetry':v=>v.work.active.counters.traceDropped=1,'observer error':v=>v.work.active.counters.observerErrors=1,
 'token loss':v=>v.stream.mutations--,
 'no supported inventory':v=>v.personal.refIds=[],'pending ACK response':v=>v.work.active.packets[0].state='pending',
};
for(const [name,mutate]of Object.entries(mutants))test('falsifies '+name,()=>{const value=outcome();mutate(value);assert.throws(()=>assertStreamOutcome(value));});
test('token-only local-work controls fail on directory or unrelated page scanning',()=>{
 const good={active:{bodyQueries:3,directoryVisits:0,directoryWalkers:0},peer:{bodyQueries:0,directoryVisits:0}};assertTokenOnlyWork(good);
 for(const [side,key]of [['active','bodyQueries'],['active','directoryVisits'],['active','directoryWalkers'],['peer','bodyQueries'],['peer','directoryVisits']]){const v=structuredClone(good);v[side][key]=key==='bodyQueries'&&side==='active'?0:1;assert.throws(()=>assertTokenOnlyWork(v));}
});
test('isolated-world wrappers preserve return objects, this, arguments and thrown errors; cleanup restores descriptors',async()=>{
 const node={},nodes=[node],root={matches:()=>true},calls=[];
 class TreeWalker{nextNode(...args){calls.push(['next',this,args]);return node;}}
 class Document{createTreeWalker(...args){calls.push(['create',this,args]);return new TreeWalker();}}
 class Element{querySelectorAll(...args){calls.push(['query',this,args]);return nodes;}}
 let promise=Promise.resolve({state:'accepted'});const runtime={sendMessage(...args){calls.push(['send',this,args]);if(args[0]==='throw')throw Error('native-original');return promise;}};
 const sandbox={Document,TreeWalker,Element,chrome:{runtime},TextEncoder,Date};const context=vm.createContext(sandbox),original=Object.getOwnPropertyDescriptor(Document.prototype,'createTreeWalker');
 const result=vm.runInContext(`(${installSys05Observer.toString()})()`,context);assert.equal(result.packageModified,false);
 const doc=new Document(),walker=doc.createTreeWalker(root,1);assert(walker instanceof TreeWalker);assert.equal(walker.nextNode(),node);
 const element=new Element();element.id='reading';assert.equal(element.querySelectorAll('[data-message-id]'),nodes);
 const message={protocol:'vaiwl-host-observation/2',kind:'current-observation',localSeq:1,payload:{body:{messageIds:['a','b','c']},surface:{candidates:[{entity:'conversation',nativeTitle:'J4 native jointly renamed conversation',target:{nativeId:C}}]}}};assert.equal(runtime.sendMessage(message),promise);await promise;await Promise.resolve();assert.throws(()=>runtime.sendMessage('throw'),/native-original/);
 const stats=sandbox.__sys05Observer.snapshot();assert.equal(stats.counters.directoryVisits,1);assert.equal(stats.counters.bodyQueries,1);assert.equal(stats.counters.accepted,1);assert(stats.packets[0].jointTitle);assert.equal(calls.find(c=>c[0]==='send')[1],runtime);
 promise=Promise.resolve({state:'retry-after'});assert.equal(runtime.sendMessage({...message,localSeq:2}),promise);await promise;await Promise.resolve();let next=sandbox.__sys05Observer.snapshot();assert.equal(next.counters.retryAfter,1);assert.equal(next.counters.unknown,0);assert.equal(next.packets[1].state,'retry-after');
 promise=Promise.resolve({state:'future-unrecognized'});runtime.sendMessage({...message,localSeq:3});await promise;await Promise.resolve();next=sandbox.__sys05Observer.snapshot();assert.equal(next.counters.unknown,1);
 sandbox.__sys05Observer.close();assert.deepEqual(Object.getOwnPropertyDescriptor(Document.prototype,'createTreeWalker'),original);
});
test('original bounded parameter values remain explicit',()=>assert.deepEqual(SYS05_LIMITS,{evidenceToUiMs:1000,rpcMs:6000,readWindowMs:30000,requestsPerWindow:12,attempts:3,packetBytes:65536,candidatesPerPacket:256,messageIdsPerPacket:256}));

test('uninstrumented correctness requires original F1; diagnostics never claim performance acceptance',()=>{const v=outcome();v.workInstrumentation=false;v.work={status:'NOT_RUN'};assert.equal(assertStreamOutcome(v).F1,'PASS_CONSERVATIVE_SINGLE_SAMPLE_NOT_P95');v.workInstrumentation=true;v.work=outcome().work;v.ui.evidenceToVisibleTitleMs=2000;assert.equal(assertStreamOutcome(v).F1,'DIAGNOSTIC_ONLY_NOT_ACCEPTED');});

test('metadata ACK-only transform preserves original older row and cannot fabricate new facts',()=>{const value={conversation_id:C,mapping:{j4_original_old:{message:{id:'j4_original_old',original_send:{sent_at:'old'},create_time:1}},new:{message:{id:'new',author:{id:'self'},status:'fixture-accepted',original_send:{sent_at:'new'},create_time:2}}}};const result=sys05AckOnlyMetadata(value);assert.deepEqual(result.mapping.j4_original_old,value.mapping.j4_original_old);assert.deepEqual(result.mapping.new.message,{id:'new',author:{id:'self'},status:'fixture-accepted'});assert.equal(value.mapping.new.message.create_time,2);assert.throws(()=>sys05AckOnlyMetadata({}),/profile-drift/);});
for(const [name,mutate]of [['preexisting recent row',v=>v.beforeUI.recentCurrentRows=1],['no old prestate',v=>v.before.personal.activity.segment=0],['exact instead of ACK-only',v=>v.personal.activity.basis='exact'],['wrong UI current ref',v=>v.ui.currentRef='other'],['current-context fallback',v=>v.ui.activityPlacement='CURRENT_CONTEXT']])test('falsifies '+name,()=>{const v=outcome();mutate(v);assert.throws(()=>assertStreamOutcome(v));});

test('missing real persistent budget cannot pass',()=>{const v=outcome();v.personal.budget=null;assert.throws(()=>assertStreamOutcome(v));});

test('fixture façade cannot select an arbitrary upstream host',()=>{
 assert.equal(sys05UpstreamURL('/native/route?path=%2Fc%2F123','http://127.0.0.1:34567').origin,'http://127.0.0.1:34567');
 for(const path of ['http://example.com/','//example.com/','/\\example.com/','/x\nHost: evil','relative'])assert.throws(()=>sys05UpstreamURL(path,'http://127.0.0.1:34567'));
 assert.throws(()=>sys05UpstreamURL('/native/route','https://example.com'));
});
test('modern runner retains packaged exact-origin policy without historical proxy or network overrides',async()=>{
 const source=await readFile(new URL('./sys05-stream-package-journey.mjs',import.meta.url),'utf8');
 for(const forbidden of ['createHistoricalNetworkGuard','historical-network-guard','launchNativeVisibilityBrowser','--proxy-server','--disable-quic','--force-webrtc','historicalNetworkGuard'])assert(!source.includes(forbidden),forbidden);
 assert(source.includes("assert.deepEqual(permissions.host_permissions,['http://127.0.0.1/*'])"));assert(source.includes("connect-src ${server.origin}"));assert(source.includes("url.origin===server.origin||url.protocol==='chrome-extension:'"));
});

test('actual decoder/readback and correlator accept modeled assistant plus one real POST, reject missing assistant regression',async()=>{
 const server=await createSys05StreamServer();let reader;
 try{
  const page=await fetch(server.origin+'/c/'+C),cookie=page.headers.get('set-cookie').split(';')[0],session=await (await fetch(server.origin+'/api/auth/session',{headers:{cookie}})).json(),headers={cookie,authorization:'Bearer '+session.accessToken};
  const principalKey='principal_'+digest(['chatgpt-principal-v1','user-host-fixture']),contextKey='context_'+digest(['chatgpt-context-v1','user-host-fixture','account-host-team']),scopeKey=JSON.stringify(['chatgpt',principalKey,contextKey]);
  const profile={id:'loopback-existing-send-ack',revision:1,providerProfile:'chatgpt-session-v1',ack:{kind:'authenticated-message-readback',acceptedStates:['fixture-accepted']}};
  const context={documentToken:'doc',producerToken:'producer',routeEpoch:1,bodyEpoch:1,conversationId:C,messageIds:['j4_original_old','sys05-assistant'],scope:{key:scopeKey,accountId:principalKey,organizationId:contextKey},providerProfile:profile.providerProfile,providerTransport:'worker-fixed-fetch',guard:()=>true,signal:new AbortController().signal};
  const acceptance=new WeakMap();let dropAssistant=false;
  const provider={async readCurrentConversation(){const payload=await (await fetch(server.origin+'/backend-api/conversation/'+C,{headers})).json();if(dropAssistant)delete payload.mapping['sys05-assistant'];const raw=JSON.stringify(payload),metadata=parseConversationMetadata({conversationId:C,principalId:'user-host-fixture',payload:raw}),expiresAt=new Date(Date.now()+60000).toISOString(),result={principalKey,contextKey,expiresAt,providerProfile:profile.providerProfile,transport:'worker-fixed-fetch',metadata};acceptance.set(result,{profile,conversationId:C,principalKey,contextKey,expiresAt,providerProfile:profile.providerProfile,transport:'worker-fixed-fetch',messages:extractConversationAcceptance({conversationId:C,principalId:'user-host-fixture',profile,payload:raw})});return result;},acceptanceFor:result=>acceptance.get(result)};
  reader=createCurrentMetadataReader({observations:{withCurrent:async(_proof,work)=>work(context)},provider,enabled:true});
  const initial=await reader.read('proof');assert.equal(initial.state,'candidate');assert.deepEqual(initial.metadata.gaps,[]);const assistant=initial.metadata.messages.find(m=>m.messageId==='sys05-assistant');assert.equal(assistant.role,'assistant');assert.equal(assistant.authorId,null);assert.equal(assistant.rawCreateTime,null);assert.equal(assistant.selfMatchCandidate,false);
  const correlator=createSendCorrelator();correlator.bind({scopeKey,documentToken:'doc',producerToken:'producer',routeEpoch:1,bodyEpoch:1,conversationId:C});assert.deepEqual(correlator.observe(initial.metadata),[]);assert(correlator.intent({intentId:'real-native-intent',kind:'send',isComposing:false}));
  const posted=await (await fetch(server.origin+'/native/j4/send',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({text:'Real fixture send',rename:true})})).json();context.messageIds.push(posted.message.messageId);
  const after=await reader.read('proof');assert.equal(after.state,'candidate');assert.deepEqual(after.metadata.gaps,[]);const candidates=correlator.observe(after.metadata);assert.equal(candidates.length,1);assert.equal(candidates[0].messageId,posted.message.messageId);
  await reader.withReadback(after,'proof',posted.message.messageId,({readback,guard})=>{guard();assert.equal(readback.message.role,'user');assert.equal(readback.message.acceptanceState,'fixture-accepted');assert.deepEqual(readback.message.lineage.nodeIds,['j4_original_old','sys05-assistant',posted.message.messageId]);});
  await assert.rejects(reader.withReadback(after,'proof','sys05-assistant',()=>assert.fail('assistant cannot ACK')),/pending-send-ack/);
  dropAssistant=true;const missing=await reader.read('proof');assert.equal(missing.state,'partial');assert(missing.metadata.gaps.some(g=>g.reason==='current-message-missing'));await assert.rejects(reader.withReadback(missing,'proof',posted.message.messageId,()=>assert.fail('partial cannot ACK')),/unavailable-send-readback/);
 }finally{reader?.stop();await server.close();}
});

test('actual production projection keeps exact old event provisional without coverage',()=>{
 const now='2026-10-15T12:00:00.000Z',old='2026-07-17T12:00:00.000Z',scopeKey='fixture-scope',payload=sys05AckOnlyMetadata({conversation_id:C,history_semantics:OFFLINE_HISTORY_PROFILE.semantics,mapping:{j4_original_old:{id:'j4_original_old',parent:null,message:{id:'j4_original_old',author:{id:'user-host-fixture',role:'user'},original_send:{author_id:'user-host-fixture',conversation_id:C,kind:'new-send',state:'committed',precision:'millisecond',sent_at:old}}}}});
 const [event]=extractHistoricalSends({conversationId:C,payload:JSON.stringify(payload),principalId:'user-host-fixture',profile:OFFLINE_HISTORY_PROFILE});assert.equal(event.sentAt,old);assert.equal(event.precision,'millisecond');
 const source={id:'source',generation:'generation',sourceRevision:1,observedAt:now,validUntil:'2026-10-15T12:01:00.000Z',channel:'host-evidence',codecVersion:2,revoked:false},row={...event,id:'old',sourceId:'source',generation:'generation',sourceRevision:1,observedAt:now,actorVerified:true,actorScopeKey:scopeKey,revoked:false},evidence={scopeKey,sources:{source},events:{old:row},hints:{},coverage:{}};
 const projected=projectFreeActivity({scope:scopeKey,refs:[{id:C,scope:scopeKey}],projects:[],unknown:[{id:C}],noProject:[]},evidence,createFreeViewSession({now,timeZone:'UTC',H:30}),now).refs[0].activityDecision;
 assert.equal(projected.basis,'provisional');assert.equal(projected.reason,'historical-anchor-incomplete');assert.equal(projected.segment,3);assert.equal(projected.candidateTime,old);assert.deepEqual(evidence.coverage,{});
});
