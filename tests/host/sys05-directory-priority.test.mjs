import test from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {assertDirectoryPriorityOutcome} from './sys05-stream-oracle.mjs';
import {addSys05PeerAssistant,sys05PeerAssistantMetadata} from './fixtures/sys05-stream-server.mjs';
import {runSys05} from './sys05-stream-package-journey.mjs';
const C='44444444-4444-4444-8444-444444444444',PEER='33333333-3333-4333-8333-333333333333';
function evidence(){
 const expected=Array.from({length:300},(_,i)=>({id:'88888888-8888-4888-8888-'+String(i+1).padStart(12,'0'),title:'Native '+(i+1)}));
 const refTitles={[C]:'J4 native jointly renamed conversation',[PEER]:'Peer',...Object.fromEntries(expected.map(e=>[e.id,e.title]))};
 return {directoryPriorityRequested:true,workInstrumentation:true,directoryPriority:{peerTrigger:'NATIVE_RENAME_AND_ASSISTANT_APPEND',peerAssistantUpdated:true,
  hold:{hits:1,closedEarly:false,armedAt:10,heldAt:30,releasedAt:80,request:{path:'/backend-api/conversation/'+PEER,context:'account-host-team',authenticated:true,status:200,receivedAt:20,peerRenameAt:15}},
  retry:{state:'retry-after',directoryIds:[expected[0].id],replySeq:2,localSeq:2,payloadSha256:'a'.repeat(64),at:35,finishedAt:40,producer:1},
  intent:{kind:'send-candidate',producer:1,at:60,localSeq:3},sent:{id:'actual-native-id',at:new Date(50).toISOString()},
  completedAt:120,elapsedMs:110,expected,before:{refIds:[C,PEER].sort(),refTitles:{[C]:'Old title',[PEER]:'Peer'}},
  after:{refIds:Object.keys(refTitles).sort(),refTitles,hints:[{messageId:'actual-native-id',hasAckWitness:true,hasSentAt:false}]},
  work:{packets:[{directoryIds:expected.map(e=>e.id),state:'accepted',producer:1,at:90,localSeq:4,replySeq:4},{kind:'send-candidate',producer:1,localSeq:3,replySeq:3,state:'accepted',directoryIds:[]}],counters:{traceDropped:0,observerErrors:0},gap:{dropped:0},renewals:[]},
  peer:{refIds:[C,PEER],hints:[]},actions:{'sys05-peer-rename':1,'sys05-load-directory':1,'send-intent':1}
 }};
}
test('same-document priority oracle retains full SYS05 and overflow as unproven',()=>{
 const result=assertDirectoryPriorityOutcome(evidence());assert.equal(result.directoryPriorityVerdict,'PASS_NARROW_SAME_DOCUMENT_SEND_PRIORITY');assert.equal(result.fullSYS05,'NOT_ESTABLISHED');assert.equal(result.queueOverflow,'NOT_RUN');
});
for(const [name,change]of Object.entries({
 'read not authenticated':p=>p.hold.request.authenticated=false,
 'wrong scope':p=>p.hold.request.context='account-host-personal',
 'read before rename':p=>p.hold.request.peerRenameAt=25,
 'held response aborted':p=>p.hold.closedEarly=true,
 'directory never refused':p=>p.retry.state='accepted',
 'directory refused after send':p=>p.retry.finishedAt=55,
 'intent waits for barrier release':p=>p.intent.at=81,
 'different producer':p=>p.intent.producer=2,
 'directory wins priority':p=>p.work.packets[0].at=59,
 'rebind instead of resume':p=>p.work.packets[0].producer=2,
 'deadline relaxed':p=>p.elapsedMs=6000,
 'renewal repaired directory':p=>p.work.renewals.push({at:65,finishedAt:null}),
 'missing tail':p=>delete p.after.refTitles[p.expected.at(-1).id],
 'extra stale item':p=>p.after.refIds.push('stale'),
 'old current title overwrites send':p=>p.after.refTitles[C]='Old title',
 'lost durable ACK':p=>p.after.hints=[],
 'duplicate ACK':p=>p.after.hints.push({...p.after.hints[0]}),
 'false server time':p=>p.after.hints[0].hasSentAt=true,
 'cross scope directory':p=>p.peer.refIds.push(p.expected[0].id),
 'cross scope ACK':p=>p.peer.hints.push({...p.after.hints[0]}),
 'rejected prioritized intent':p=>p.work.packets[1].state='rejected',
 'renewal already in flight':p=>p.work.renewals.push({at:5,finishedAt:15}),
 'extra send':p=>p.actions['send-intent']=2,
 'injected transport failure':p=>p.work.gap.dropped=1,
 'lost trace':p=>p.work.counters.traceDropped=1
}))test('priority oracle rejects '+name,()=>{const v=evidence();change(v.directoryPriority);assert.throws(()=>assertDirectoryPriorityOutcome(v));});
test('priority scenario cannot silently compose with the existing fault scenarios',async()=>{
 for(const option of ['backpressure','directoryGap','lostAck'])await assert.rejects(runSys05('/unused',{directoryPriority:true,[option]:true}),/isolated-scenario/);
});

test('peer assistant is an explicit fixture-only insertion at one native completion',()=>{const marker="  button.dataset.applied='true';";assert.throws(()=>addSys05PeerAssistant('missing'),/boundary-changed/);assert.throws(()=>addSys05PeerAssistant(marker+marker),/boundary-changed/);const source=addSys05PeerAssistant(marker);assert(source.includes("document.querySelector('#reading').append(article)"));assert(source.endsWith(marker));assert(!source.includes('chrome.')&&!source.includes('fetch('));});

test('native peer update retains original metadata and cannot create self-send acceptance',()=>{
 const source={conversation_id:PEER,title:'Peer',current_node:'prior',mapping:{prior:{id:'prior',parent:null,children:[],message:{id:'prior',author:{role:'assistant'}}}}};
 const before=structuredClone(source),value=sys05PeerAssistantMetadata(source);assert.deepEqual(source,before);
 assert.equal(value.current_node,'sys05-peer-assistant');assert.equal(value.mapping['sys05-peer-assistant'].parent,'prior');
 assert.deepEqual(value.mapping['sys05-peer-assistant'].message.author,{role:'assistant'});
 assert.deepEqual(Object.keys(value.mapping['sys05-peer-assistant'].message).sort(),['author','content','id']);
 assert.deepEqual(value.mapping.prior.message,source.mapping.prior.message);assert.equal(value.title,source.title);
 assert.throws(()=>sys05PeerAssistantMetadata({...source,conversation_id:C}),/profile-drift/);
});

test('directory fixture availability does not arm or claim the separate loss fault',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sys05-priority-options-'));const result=await runSys05(join(dir,'report.json'),{directoryPriority:true});
 assert.equal(result.directoryPriorityRequested,true);assert.equal(result.directoryGapRequested,false);assert.equal(result.backpressureRequested,false);assert.equal(result.status,'NOT_RUN');
});
