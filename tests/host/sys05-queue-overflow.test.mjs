import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assertQueueOverflowOutcome} from './sys05-stream-oracle.mjs';
import {installSys05Observer} from './sys05-stream-observer.mjs';
import {runSys05} from './sys05-stream-package-journey.mjs';
import {createSys05StreamServer} from './fixtures/sys05-stream-server.mjs';
const C='44444444-4444-4444-8444-444444444444',P='33333333-3333-4333-8333-333333333333';
function evidence(){
 const expected=Array.from({length:300},(_,i)=>({id:'88888888-8888-4888-8888-'+String(i+1).padStart(12,'0'),title:'SYS05 directory '+(i+1)}));
 const old={messageId:'prior',eventKey:'old-key',firstObservedAt:'2026-01-01T00:00:00Z',hasAckWitness:true,hasSentAt:false};
 const before={refIds:[P,C].sort(),refTitles:{[P]:'Peer',[C]:'Membership not loaded'},projectIds:['project'],hints:[old]};
 const afterGap={...structuredClone(before),refIds:[...before.refIds,...expected.map(e=>e.id)].sort(),refTitles:{...before.refTitles,...Object.fromEntries(expected.map(e=>[e.id,e.title]))}};
 const packet={producer:1,localSeq:1,replySeq:1,state:'accepted',directoryIds:[],at:20,finishedAt:30};
 return {queueOverflowRequested:true,workInstrumentation:true,queueOverflowActions:{'send-intent':34,'sys05-load-directory':1},queueOverflowEvidence:{before,afterGap,expected,peer:{refIds:[P]},buttonEnabled:true,gestureCount:33,acceptsBeforeRelease:0,startedAt:1,completedAt:100,elapsedMs:99,work:{overflow:{enabled:true,armedAt:2,heldAt:3,releasedAt:10,producer:1,localSeq:1,closedEarly:false},packets:[{...packet,kind:'surface-delta',directoryIds:[expected[0].id],at:2,finishedAt:11},{...packet,kind:'send-gap',localSeq:2,replySeq:2,at:12,finishedAt:13},{...packet,kind:'current-observation',localSeq:3,replySeq:3,at:14}],counters:{traceDropped:0,observerErrors:0,unknown:0},gap:{dropped:0},renewals:[]}},native:{accepts:1,rows:[{id:'fresh'}]},personal:{...structuredClone(afterGap),refTitles:{...afterGap.refTitles,[C]:'J4 native jointly renamed conversation'},hints:[old,{messageId:'fresh',hasAckWitness:true,hasSentAt:false,firstObservedAt:'2026-02-01T00:00:00Z'}]},team:{hints:[]}};
}
test('overflow oracle permits only narrow fixture claim',()=>assert.equal(assertQueueOverflowOutcome(evidence()).fullSYS05,'NOT_ESTABLISHED'));
const mutants={
 'no instrumentation':v=>v.workInstrumentation=false,
 'disabled button':v=>v.queueOverflowEvidence.buttonEnabled=false,
 '32 gestures':v=>v.queueOverflowEvidence.gestureCount=32,
 'accepted empty send':v=>v.queueOverflowEvidence.acceptsBeforeRelease=1,
 'closed early':v=>v.queueOverflowEvidence.work.overflow.closedEarly=true,
 'no actual hold':v=>v.queueOverflowEvidence.work.overflow.heldAt=null,
 'deadline extended':v=>v.queueOverflowEvidence.elapsedMs=6000,
 'missing held acceptance':v=>v.queueOverflowEvidence.work.packets.shift(),
 'no gap':v=>v.queueOverflowEvidence.work.packets.splice(1,1),
 'duplicate gap':v=>v.queueOverflowEvidence.work.packets.push({...v.queueOverflowEvidence.work.packets[1]}),
 'wrong producer':v=>v.queueOverflowEvidence.work.packets[1].producer=2,
 'wrong ACK sequence':v=>v.queueOverflowEvidence.work.packets[1].replySeq=9,
 'no fresh rescan':v=>v.queueOverflowEvidence.work.packets.pop(),
 'escaped intent':v=>v.queueOverflowEvidence.work.packets.push({kind:'send-candidate',at:9}),
 'truncated trace':v=>v.queueOverflowEvidence.work.counters.traceDropped=1,
 'transport fault':v=>v.queueOverflowEvidence.work.gap.dropped=1,
 'renewal masquerade':v=>v.queueOverflowEvidence.work.renewals.push({at:5,finishedAt:40}),
 'missing directory row':v=>v.queueOverflowEvidence.afterGap.refIds.pop(),
 'peer leak':v=>v.queueOverflowEvidence.peer.refIds.push(v.queueOverflowEvidence.expected[0].id),
 'automatic resend':v=>v.queueOverflowActions['send-intent']=35,
 'preexisting title damage':v=>v.queueOverflowEvidence.afterGap.refTitles[P]='damaged',
 'gap project damage':v=>v.queueOverflowEvidence.afterGap.projectIds=[],
 'gap old ACK damage':v=>v.queueOverflowEvidence.afterGap.hints[0].eventKey='new',
 'final project damage':v=>v.personal.projectIds=[],
 'final old ACK time damage':v=>v.personal.hints[0]={...v.personal.hints[0],firstObservedAt:'new'},
 'final peer title damage':v=>v.personal.refTitles[P]='damaged',
 'final directory title damage':v=>v.personal.refTitles[v.queueOverflowEvidence.expected[0].id]='damaged',
 'final directory identity loss':v=>v.personal.refIds.pop(),
};
for(const [name,mutate]of Object.entries(mutants))test('overflow rejects '+name,()=>{const v=evidence();mutate(v);assert.throws(()=>assertQueueOverflowOutcome(v));});
function observer(){
 class Document{createTreeWalker(){return {};}}class TreeWalker{nextNode(){return null;}}class Element{querySelectorAll(){return [];}}
 let calls=0,reply={state:'accepted',localSeq:1};const runtime={sendMessage(){calls++;return Promise.resolve(reply);}};
 const box={Document,TreeWalker,Element,chrome:{runtime},crypto:webcrypto,TextEncoder,Date};vm.createContext(box);vm.runInContext(`(${installSys05Observer.toString()})({queueOverflow:true})`,box);
 const message={protocol:'vaiwl-host-observation/2',producerToken:'test',kind:'surface-delta',localSeq:1,payload:{candidates:[{target:{nativeId:'88888888-8888-4888-8888-000000000001'}}]}};
 return {box,runtime,message,calls:()=>calls,setReply:r=>reply=r,reply:()=>reply};
}
test('barrier forwards once and releases unchanged genuine acceptance',async()=>{const s=observer();s.box.__sys05Observer.armQueueOverflow();let done=false;const p=s.runtime.sendMessage(s.message).then(r=>{done=true;return r;});await Promise.resolve();assert.equal(done,false);assert.equal(s.calls(),1);s.box.__sys05Observer.releaseQueueOverflow();assert.equal(await p,s.reply());s.box.__sys05Observer.close();});
test('barrier does not convert retry or rejection to acceptance',async()=>{const s=observer();s.box.__sys05Observer.armQueueOverflow();for(const state of ['retry-after','rejected']){s.setReply({state,localSeq:1});assert.equal(await s.runtime.sendMessage(s.message),s.reply());assert.equal(s.box.__sys05Observer.snapshot().overflow.heldAt,null);}s.box.__sys05Observer.close();});
test('barrier leaves unrelated packets untouched',async()=>{const s=observer();s.box.__sys05Observer.armQueueOverflow();assert.equal(await s.runtime.sendMessage({...s.message,kind:'current-observation'}),s.reply());assert.equal(s.box.__sys05Observer.snapshot().overflow.heldAt,null);s.box.__sys05Observer.close();});
test('close releases outstanding reply and marks early close',async()=>{const s=observer();const o=s.box.__sys05Observer;o.armQueueOverflow();const p=s.runtime.sendMessage(s.message);await Promise.resolve();o.close();assert.equal(await p,s.reply());assert.equal(o.snapshot().overflow.closedEarly,true);});
test('overflow plan does not start browser and conflicts fail closed',async()=>{const dir=await mkdtemp(join(tmpdir(),'sys05-overflow-'));const r=await runSys05(join(dir,'plan.json'),{queueOverflow:true});assert.equal(r.status,'NOT_RUN');assert.equal(r.queueOverflowRequested,true);assert.equal(r.directoryGapRequested,false);for(const key of ['backpressure','directoryGap','lostAck','directoryPriority'])await assert.rejects(runSys05(join(dir,'conflict.json'),{queueOverflow:true,[key]:true}),/isolated-scenario/);});
test('real native fixture rejects empty POST without accepting a message',async()=>{const s=await createSys05StreamServer();try{const page=await fetch(s.origin+'/c/'+C),cookie=page.headers.get('set-cookie').split(';')[0];const r=await fetch(s.origin+'/native/j4/send',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({text:'',rename:false})});assert.equal(r.status,400);assert.equal(s.snapshot().interruption.accepts,0);}finally{await s.close();}});
