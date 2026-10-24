import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
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
import {assertTokenOnlyWork,assertStreamOutcome,assertBackpressureOutcome,assertDirectoryGapOutcome,SYS05_LIMITS} from './sys05-stream-oracle.mjs';
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
 return {presentation:{topLevelOpen:true,tokenTicks:8},workInstrumentation:true,before:{personal:{originalOldEvent:{messageId:'j4_original_old',sentAt:'2025-10-01T00:00:00.000Z',precision:'millisecond',actorVerified:true},activity:{basis:'provisional',reason:'historical-anchor-incomplete',segment:3}}},beforeUI:{recentCurrentRows:0},native:{accepts:1,title:'J4 native jointly renamed conversation',rows:[{id:'accepted-id',author:'user-host-fixture'}]},stream:{realDescendant:true,sameReading:true,jointBatch:true,startedAt:1,jointAt:2,finishedAt:20,ticks:800,mutations:6400,running:false,jointToken:12,tokensAtDurable:20,tokensAtVisibleTitle:30},personal:{activity:{basis:'provisional',reason:'observed-self-send',segment:0},ref:{nativeTitle:'J4 native jointly renamed conversation'},hints:[hint],refIds:[C],projectIds:['p'],budget:{checksumValid:true,requests:12,attemptCounts:[3]}},team:{ref:{nativeTitle:'Membership not loaded'},hints:[],budget:{checksumValid:true,requests:2,attemptCounts:[1]}},ui:{currentRef:C,activityPlacement:'RECENT_LIST_ABSENT_TO_VISIBLE_NOT_CURRENT_CONTEXT',exactTitle:true,ackLatencyMs:100,titleLatencyMs:100,evidenceToVisibleTitleMs:100},work:{active:{counters:{...counters},packets:[{kind:'current-observation',jointTitle:true,messageIds:3,state:'accepted'}]},peer:{counters:{...counters,accepted:0},packets:[]}},loadedDirectoryNodes:10};
}
test('narrow oracle explicitly cannot establish full SYS05, p95 or forced gap',()=>{const value=assertStreamOutcome(outcome());assert.equal(value.fullSYS05,'NOT_ESTABLISHED');assert.equal(value.p95,'NOT_RUN');assert.equal(value.backpressureAndGapFault,'NOT_RUN');});
const mutants={
 'closed top-level workspace':v=>v.presentation.topLevelOpen=false,'no continuing visible stream':v=>v.presentation.tokenTicks=0,
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
 const good={active:{bodyQueries:3,directoryVisits:0,directoryWalkers:0},peer:{bodyQueries:0,directoryVisits:0,directoryWalkers:0}};assertTokenOnlyWork(good);
 for(const [side,key]of [['active','bodyQueries'],['active','directoryVisits'],['active','directoryWalkers'],['peer','bodyQueries'],['peer','directoryVisits'],['peer','directoryWalkers']]){const v=structuredClone(good);v[side][key]=key==='bodyQueries'&&side==='active'?0:1;assert.throws(()=>assertTokenOnlyWork(v));}
});
test('token-only work rejects an unrelated-page directory walker even without node visits',()=>{
 const value={active:{bodyQueries:3,directoryVisits:0,directoryWalkers:0},peer:{bodyQueries:0,directoryVisits:0,directoryWalkers:1}};
 assert.throws(()=>assertTokenOnlyWork(value),{code:'ERR_ASSERTION',message:/^unrelated-page-directory-walker\b/});
 value.peer.directoryWalkers=0;assertTokenOnlyWork(value);
});
test('isolated-world wrappers preserve return objects, this, arguments and thrown errors; cleanup restores descriptors',async()=>{
 const node={},nodes=[node],root={matches:()=>true},calls=[];
 class TreeWalker{nextNode(...args){calls.push(['next',this,args]);return node;}}
 class Document{createTreeWalker(...args){calls.push(['create',this,args]);return new TreeWalker();}}
 class Element{querySelectorAll(...args){calls.push(['query',this,args]);return nodes;}}
 let promise=Promise.resolve({state:'accepted'});const runtime={sendMessage(...args){calls.push(['send',this,args]);if(args[0]==='throw')throw Error('native-original');return promise;}};
 const sandbox={Document,TreeWalker,Element,chrome:{runtime},crypto:webcrypto,TextEncoder,Date};const context=vm.createContext(sandbox),original=Object.getOwnPropertyDescriptor(Document.prototype,'createTreeWalker');
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

function backpressureOutcome(){
 const v=outcome(),hash='a'.repeat(64);v.native.rows[0].at=new Date(1000).toISOString();
 v.backpressure={armedAt:1000,heldAt:1050,releasedAt:1200,hits:1,closedEarly:false,request:{receivedAt:1020,acceptedAt:1000,path:'/backend-api/conversation/'+C,context:'account-host-personal',authenticated:true,status:200}};
 v.work.peer.packets=[{producer:1,localSeq:4,replySeq:4,payloadSha256:hash,at:1100,finishedAt:1150,state:'retry-after'},{producer:1,localSeq:4,replySeq:4,payloadSha256:hash,at:1210,finishedAt:1300,state:'accepted'}];
 v.peerRenameAt=1075;v.peerRenameApplied=true;v.work.peer.packets.forEach(p=>{p.peerRenameTitle=true;p.kind='surface-delta';});
 v.backpressureNativeActions={'sys05-peer-rename':1};v.peerBefore={team:{ref:{nativeTitle:'Ordinary conversation'}},personal:{ref:{nativeTitle:'Ordinary conversation'}}};
 v.peerAfter={team:{ref:{nativeTitle:'SYS05 peer native renamed conversation'}},personal:{ref:{nativeTitle:'Ordinary conversation'}}};return v;
}
test('real backpressure slice cannot claim overflow/gap or full SYS05',()=>{const result=assertBackpressureOutcome(backpressureOutcome());assert.equal(result.gapRecovery,'NOT_RUN');assert.equal(result.queueOverflow,'NOT_RUN');assert.equal(result.fullSYS05,'NOT_ESTABLISHED');});
for(const [name,mutate]of Object.entries({
 'pre-send request':v=>v.backpressure.request.receivedAt=999,'unauthenticated request':v=>v.backpressure.request.authenticated=false,'wrong context':v=>v.backpressure.request.context='account-host-team',
 'no hold':v=>v.backpressure=null,'double hold':v=>v.backpressure.hits=2,'early close':v=>v.backpressure.closedEarly=true,
 'wrong producer':v=>v.work.peer.packets[1].producer=2,'different payload':v=>v.work.peer.packets[1].payloadSha256='b'.repeat(64),
 'changed sequence':v=>v.work.peer.packets[1].localSeq=5,'wrong reply sequence':v=>v.work.peer.packets[0].replySeq=99,
 'release before retry':v=>v.backpressure.releasedAt=1120,'fake acceptance':v=>v.work.peer.packets[1].state='retry-after',
 'late acceptance':v=>v.work.peer.packets[1].finishedAt=7000,'wrong object':v=>v.peerAfter.team.ref.nativeTitle='Membership not loaded',
 'cross scope':v=>v.peerAfter.personal.ref.nativeTitle='SYS05 peer native renamed conversation',
 'unrelated recovery then new title':v=>{v.work.peer.packets.forEach(p=>p.peerRenameTitle=false);v.work.peer.packets.push({...v.work.peer.packets[1],localSeq:5,replySeq:5,peerRenameTitle:true});},
 'rename after retry':v=>v.peerRenameAt=1190,'different kind':v=>v.work.peer.packets[1].kind='current-object',
 'duplicate native rename':v=>v.backpressureNativeActions['sys05-peer-rename']=2,
}))test('backpressure rejects '+name,()=>{const value=backpressureOutcome();mutate(value);assert.throws(()=>assertBackpressureOutcome(value));});
test('controlled barrier holds only one authenticated post-send response and preserves native model',async()=>{
 const server=await createSys05StreamServer({backpressure:true});
 try{
  assert.equal((await fetch(server.origin+'/native/sys05/rename-peer',{method:'POST'})).status,401);
  const page=await fetch(server.origin+'/c/'+C),cookie=page.headers.get('set-cookie').split(';')[0];
  const session=await(await fetch(server.origin+'/api/auth/session',{headers:{cookie}})).json();
  const headers={cookie,authorization:'Bearer '+session.accessToken,'chatgpt-account-id':'account-host-personal'};
  server.holdNextRead();assert.throws(()=>server.holdNextRead(),/once-only/);
  await fetch(server.origin+'/backend-api/conversation/'+C,{headers});assert.equal(server.snapshot().backpressure.hits,0);
  await fetch(server.origin+'/native/j4/send',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({text:'fixture send',rename:true})});
  const pending=fetch(server.origin+'/backend-api/conversation/'+C,{headers});
  const end=Date.now()+1000;while(!server.snapshot().backpressure.heldAt&&Date.now()<end)await new Promise(r=>setTimeout(r,5));
  assert.equal(server.snapshot().backpressure.hits,1);
  const rename=await fetch(server.origin+'/native/sys05/rename-peer',{method:'POST',headers:{cookie}});assert.equal(rename.status,200);const renamed=await rename.json();
  const peer=await(await fetch(server.origin+'/backend-api/conversation/'+renamed.id,{headers})).json();assert.equal(peer.title,renamed.title);
  server.releaseRead();assert.equal((await pending).status,200);assert.throws(()=>server.releaseRead(),/no-held/);
  assert.equal((await fetch(server.origin+'/native/sys05/rename-peer',{method:'POST',headers:{cookie}})).status,409);
  await fetch(server.origin+'/backend-api/conversation/'+C,{headers});assert.equal(server.snapshot().backpressure.hits,1);assert.equal(server.snapshot().backpressure.closedEarly,false);
 }finally{await server.close();}
});

function gapOutcome(){
 const expected=Array.from({length:300},(_,i)=>({id:'88888888-8888-4888-8888-'+String(i+1).padStart(12,'0'),title:'Native '+i})),ids=expected.map(e=>e.id),base={refIds:[C],refTitles:{[C]:'Current'},projectIds:['p'],hints:[{eventKey:'original',firstObservedAt:'original'}]};
 const packet=(from,to,props)=>({producer:1,kind:'surface-delta',localSeq:from+1,payloadSha256:'a'.repeat(64),directoryIds:ids.slice(from,to),fault:null,forwarded:true,...props});
 const first=packet(0,50,{at:1000,finishedAt:1010,state:'accepted'}),failed=packet(50,100,{at:1020,finishedAt:1021,state:'unknown',forwarded:false,fault:'DROP_BEFORE_FORWARD'}),recovery=packet(50,300,{at:1100,finishedAt:1200,state:'accepted'});
 const w={renewals:[],gap:{dropped:1},counters:{unknown:1,traceDropped:0,observerErrors:0},packets:[first,failed]};
 return {directoryGapRequested:true,workInstrumentation:true,directoryGap:{kind:'ONE_PROPOSAL_NOT_DELIVERED_BEFORE_FORWARD',expected,before:base,faultWork:w,afterFault:{refTitles:{...base.refTitles,...Object.fromEntries(expected.slice(0,50).map(e=>[e.id,e.title]))},inventories:[{conversations:'partial'}]},actionAt:1050,completedAt:1300,elapsedMs:300,work:{...w,packets:[first,failed,recovery]},after:{...base,refIds:[C,...ids].sort(),refTitles:{...base.refTitles,...Object.fromEntries(expected.map(e=>[e.id,e.title]))}},peer:{refIds:[C]},actions:{'sys05-load-directory':1,'send-intent':1},draftPreserved:true,uniqueReturn:true,tail:{topLevelOpen:true,...expected.at(-1),href:'http://127.0.0.1/c/'+ids.at(-1)}}};
}
test('undelivered-fragment recovery oracle stays narrow and requires genuine gap',()=>{const r=assertDirectoryGapOutcome(gapOutcome());assert.equal(r.queueOverflow,'NOT_RUN');assert.equal(r.fullSYS05,'NOT_ESTABLISHED');});
for(const [name,mutate]of Object.entries({
 'renewal healed gap':v=>v.directoryGap.work.renewals.push({at:1040,finishedAt:1150,state:'ok'}),
 'pending renewal':v=>v.directoryGap.work.renewals.push({at:1000,finishedAt:null,state:'pending'}),
 'no renewal trace':v=>delete v.directoryGap.work.renewals,
 'hidden tail search':v=>v.directoryGap.tail.topLevelOpen=false,
 'no fault':v=>v.directoryGap.faultWork={packets:[]},'delivered instead':v=>v.directoryGap.faultWork.packets[1].forwarded=true,
 'no persistent first ACK':v=>v.directoryGap.afterFault.refTitles={},
 'already healed before return':v=>v.directoryGap.afterFault.refTitles=v.directoryGap.after.refTitles,
 'all tail emitted':v=>v.directoryGap.faultWork.packets.push({directoryIds:v.directoryGap.expected.map(e=>e.id),state:'retry-after'}),
 'no fresh recovery':v=>v.directoryGap.work.packets.pop(),'extra error':v=>v.directoryGap.work.counters.unknown=2,
 'wrong exact set':v=>v.directoryGap.after.refIds.push('extra'), 'wrong native title':v=>v.directoryGap.after.refTitles[v.directoryGap.expected[299].id]='wrong',
 'cross scope':v=>v.directoryGap.peer.refIds.push(v.directoryGap.expected[0].id),'false complete':v=>v.directoryGap.afterFault.inventories[0].conversations='complete',
 'late chain':v=>v.directoryGap.elapsedMs=6000,'draft lost':v=>v.directoryGap.draftPreserved=false,'wrong navigation':v=>v.directoryGap.tail.href='http://127.0.0.1/c/wrong',
 'ACK renewed':v=>v.directoryGap.after.hints=[{firstObservedAt:'renewed'}]
}))test('gap recovery rejects '+name,()=>{const value=gapOutcome();mutate(value);assert.throws(()=>assertDirectoryGapOutcome(value));});
test('explicit transport fault drops only second distinct directory proposal and never fabricates acceptance',async()=>{
 class Document{createTreeWalker(){}}class TreeWalker{nextNode(){}}class Element{querySelectorAll(){}}
 const calls=[],runtime={sendMessage(message){const p=Promise.resolve({state:'accepted',localSeq:message.localSeq});calls.push({message,p});return p;}};
 const sandbox={Document,TreeWalker,Element,chrome:{runtime},crypto:webcrypto,TextEncoder,Date},context=vm.createContext(sandbox);
 vm.runInContext(`(${installSys05Observer.toString()})({directoryGap:true})`,context);sandbox.__sys05Observer.armDirectoryGap();
 const proposal=seq=>({protocol:'vaiwl-host-observation/1',producerToken:'fixture-producer',kind:'surface-delta',localSeq:seq,payload:{candidates:[{target:{nativeId:'88888888-8888-4888-8888-000000000001'}}]}});
 const other={...proposal(99),protocol:'unrelated'};await runtime.sendMessage(other);assert.equal(sandbox.__sys05Observer.snapshot().gap.dropped,0);calls.length=0;
 const first=runtime.sendMessage(proposal(1));assert.equal(first,calls[0].p);await first;
 await runtime.sendMessage(proposal(1));assert.equal(calls.length,2,'retry is same first distinct packet');
 await assert.rejects(runtime.sendMessage(proposal(2)),/designated-proposal-not-delivered/);assert.equal(calls.length,2);
 const recovered=runtime.sendMessage(proposal(3));assert.equal(recovered,calls[2].p);await recovered;
 const snapshot=sandbox.__sys05Observer.snapshot();assert.equal(snapshot.gap.dropped,1);assert.equal(snapshot.counters.unknown,1);assert.equal(snapshot.packets.filter(p=>p.fault).length,1);assert.equal(snapshot.packets[2].forwarded,false);sandbox.__sys05Observer.close();
});

test('passive renewal trace preserves original promise and records pending overlap',async()=>{
 class Document{createTreeWalker(){}}class TreeWalker{nextNode(){}}class Element{querySelectorAll(){}}
 let release;const original=new Promise(r=>release=r),runtime={sendMessage:()=>original};
 const sandbox={Document,TreeWalker,Element,chrome:{runtime},crypto:webcrypto,TextEncoder,Date},context=vm.createContext(sandbox);
 vm.runInContext(`(${installSys05Observer.toString()})()`,context);
 assert.equal(runtime.sendMessage({type:'HOST_DOCUMENT_RENEW'}),original);
 assert.equal(sandbox.__sys05Observer.snapshot().renewals[0].state,'pending');
 release({ok:true});await original;const row=sandbox.__sys05Observer.snapshot().renewals[0];
 assert.equal(row.state,'ok');assert(row.finishedAt>=row.at);sandbox.__sys05Observer.close();
});

function lostAckOutcome(){
 const value=gapOutcome(),g=value.directoryGap,fault=g.faultWork.packets[1];
 value.lostAckRequested=true;g.kind='ONE_ACCEPTED_REPLY_NOT_DELIVERED';
 fault.forwarded=true;fault.fault='DROP_AFTER_ACCEPT';fault.ownerReply={state:'accepted',localSeq:fault.localSeq,at:fault.finishedAt};
 Object.assign(g.afterFault.refTitles,Object.fromEntries(g.expected.slice(50,100).map(e=>[e.id,e.title])));
 return value;
}
test('committed lost ACK needs durable new facts and independently missing unsent tail',()=>{
 const result=assertDirectoryGapOutcome(lostAckOutcome());
 assert.equal(result.gapRecovery,'PASS_NARROW_COMMITTED_LOST_ACK_RETURN_RESCAN');assert.equal(result.fullSYS05,'NOT_ESTABLISHED');
});
for(const [name,mutate] of Object.entries({
 'not actually forwarded':g=>g.faultWork.packets[1].forwarded=false,
 'fabricated acceptance':g=>g.faultWork.packets[1].ownerReply.state='duplicate',
 'owner retry':g=>g.faultWork.packets[1].ownerReply.state='retry-after',
 'wrong sequence':g=>g.faultWork.packets[1].ownerReply.localSeq++,
 'reply before request':g=>g.faultWork.packets[1].ownerReply.at=0,
 'reply after consumer failure':g=>g.faultWork.packets[1].ownerReply.at++,
 'partial commit':g=>delete g.afterFault.refTitles[g.expected[99].id],
 'wrong committed title':g=>g.afterFault.refTitles[g.expected[50].id]='wrong',
 'preexisting receipt facts':g=>g.before.refTitles[g.expected[50].id]=g.expected[50].title,
 'tail already healed':g=>g.afterFault.refTitles={...g.after.refTitles},
 'renewal instead of return':g=>g.work.renewals.push({at:1040,finishedAt:1200,state:'ok'}),
 'old ACK modified':g=>g.after.hints=[],
 'lost draft':g=>g.draftPreserved=false,
 'late return':g=>g.elapsedMs=6000,
}))test('committed lost ACK rejects '+name,()=>{const value=lostAckOutcome();mutate(value.directoryGap);assert.throws(()=>assertDirectoryGapOutcome(value));});

test('lost ACK waits for the selected real acceptance across retry, never switches packet or drops twice',async()=>{
 class Document{createTreeWalker(){}}class TreeWalker{nextNode(){}}class Element{querySelectorAll(){}}
 const calls=[],runtime={sendMessage(message){let resolve;const promise=new Promise(r=>resolve=r);calls.push({message,promise,resolve});return promise;}};
 const sandbox={Document,TreeWalker,Element,chrome:{runtime},crypto:webcrypto,TextEncoder,Date},context=vm.createContext(sandbox);
 vm.runInContext(`(${installSys05Observer.toString()})({directoryGap:true,lostAck:true})`,context);sandbox.__sys05Observer.armDirectoryGap();
 const proposal=seq=>({protocol:'vaiwl-host-observation/1',producerToken:'fixture',kind:'surface-delta',localSeq:seq,payload:{candidates:[{target:{nativeId:'88888888-8888-4888-8888-000000000001'}}]}});
 async function reply(seq,state,replySeq=seq){const p=runtime.sendMessage(proposal(seq)),call=calls.at(-1);call.resolve({state,localSeq:replySeq});return p;}
 await reply(1,'accepted');
 assert.equal((await reply(2,'retry-after')).state,'retry-after');
 await reply(3,'accepted');assert.equal(sandbox.__sys05Observer.snapshot().gap.dropped,0);
 assert.equal((await reply(2,'accepted',99)).localSeq,99);assert.equal(sandbox.__sys05Observer.snapshot().gap.dropped,0);
 const pending=runtime.sendMessage(proposal(2)),call=calls.at(-1);let settled=false;pending.then(()=>settled=true,()=>settled=true);await Promise.resolve();assert.equal(settled,false);assert.equal(calls.length,5);
 call.resolve({state:'accepted',localSeq:2});await assert.rejects(pending,/accepted-reply-lost/);
 await reply(2,'accepted');await reply(4,'accepted');
 const result=sandbox.__sys05Observer.snapshot(),fault=result.packets.filter(p=>p.fault);
 assert.equal(result.gap.dropped,1);assert.equal(result.counters.unknown,1);assert.equal(fault.length,1);assert.equal(fault[0].localSeq,2);assert.equal(fault[0].forwarded,true);assert.equal(fault[0].ownerReply.state,'accepted');assert.equal(fault[0].state,'unknown');assert.equal(calls.length,7);
 sandbox.__sys05Observer.close();
});
