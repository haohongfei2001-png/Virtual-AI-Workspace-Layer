import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostIngestionPassOwner} from '../../src/runtime/host-ingestion-pass-owner.mjs';
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture({maxProducers=128}={}){
 let time=0,elapsed=0,next=0,frameRead=null;const timers=new Map(),lost=new Set(),frames=new Map(),grants=new Map(),profiles=new Map([['surface',{id:'surface',revision:1}]]);
 for(let tab=1;tab<=3;tab++){frames.set(tab,{documentId:'document_'+tab,url:'https://chatgpt.com/c/'+tab,documentLifecycle:'active'});grants.set(tab,{id:'grant_'+tab,scopeEpoch:1,scopeKey:tab<3?'scope_a':'scope_b'});}
 const sender=tab=>({id:'extension',tab:{id:tab,incognito:false},frameId:0,documentId:'document_'+tab,documentLifecycle:'active',url:'https://chatgpt.com/c/'+tab});
 const message=(phase='start',passSeq=1,tab=1)=>({v:1,type:'HOST_INGESTION_PASS',documentToken:'doc_'+tab,producerToken:'producer_'+tab,routeEpoch:tab,profileId:'surface',profileVersion:1,passSeq,phase});
 const bound=(m,s)=>s?.id==='extension'&&s?.frameId===0&&s?.documentLifecycle==='active'&&!s?.tab?.incognito&&!lost.has(s.tab.id)&&m.documentToken==='doc_'+s.tab.id&&m.producerToken==='producer_'+s.tab.id&&m.routeEpoch===s.tab.id&&s.documentId===frames.get(s.tab.id)?.documentId&&s.url===frames.get(s.tab.id)?.url;
 const owner=createHostIngestionPassOwner({maxProducers,profiles,handshake:{verify:async(m,s)=>bound(m,s),isBound:bound,matchesFrame:(m,s,f)=>bound(m,s)&&f?.documentId===s.documentId&&f?.url===s.url&&f.documentLifecycle==='active'},authority:{peek:frame=>grants.has(frame.tabId)?{state:'verified',grant:grants.get(frame.tabId)}:{state:'unknown'},scopeFor:frame=>grants.has(frame.tabId)?{key:grants.get(frame.tabId).scopeKey}:null},getFrame:async({tabId})=>frameRead?frameRead(tabId):frames.get(tabId),now:()=>time,elapsedNow:()=>elapsed,schedule:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:elapsed+ms});return id;},cancel:id=>timers.delete(id)});
 return {owner,profiles,grants,frames,lost,message,sender,send:(phase='start',seq=1,tab=1)=>owner.handle(message(phase,seq,tab),sender(tab)),setFrameRead:value=>frameRead=value,async advance(ms,{wall=true}={}){elapsed+=ms;if(wall)time+=ms;for(const [id,timer]of [...timers])if(timer.at<=elapsed&&timers.delete(id))timer.fn();await drain();}};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
for(const outcome of ['resolve','reject'])test('ingestion deadline preserves underlying frame wait '+outcome,async()=>{
 const f=fixture(),g=deferred();f.setFrameRead(()=>g.promise);const p=f.send();await drain();assert.equal(f.owner.isIdle(),false);await f.advance(6000);assert.equal((await p).ok,false);f.owner.invalidateDocument('document_1');assert.equal(f.owner.isIdle(),false);g[outcome](outcome==='resolve'?f.frames.get(1):Error('late'));await drain();assert.equal(f.owner.isIdle(),true);
});
test('expired scheduling hint releases idle without another pending reader or deleting tombstone',async()=>{
 const f=fixture();assert.equal(f.owner.isIdle(),true);assert.equal((await f.send()).ok,true);assert.equal(f.owner.isIdle(),false);await f.advance(29999);assert.equal(f.owner.isIdle(),false);await f.advance(1);assert.equal(f.owner.isIdle(),true);assert.equal((await f.send()).ok,false);assert.equal(f.owner.isIdle(),true);assert.equal((await f.send('start',2)).ok,true);f.owner.invalidateTab(1);assert.equal(f.owner.isIdle(),true);assert.equal((await f.send('start',3)).ok,true);await f.send('end',3);assert.equal(f.owner.isIdle(),true);f.owner.stop();assert.equal(f.owner.isIdle(),false);
});
test('stopped ingestion never reports idle after pending work settles',async()=>{const f=fixture(),g=deferred();f.setFrameRead(()=>g.promise);const p=f.send();await drain();f.owner.stop();assert.equal(f.owner.isIdle(),false);g.resolve(f.frames.get(1));await p;assert.equal(f.owner.isIdle(),false);});

for(const change of ['grant','scope','profile','lost-binding','elapsed-rollback'])test('idle retires invalid scheduling hint without isPending query: '+change,async()=>{
 const f=fixture();await f.send();await f.advance(10);assert.equal(f.owner.isIdle(),false);
 if(change==='grant')f.grants.get(1).id='replacement';
 else if(change==='scope')f.grants.get(1).scopeKey='replacement';
 else if(change==='profile')f.profiles.set('surface',{id:'surface',revision:1});
 else if(change==='lost-binding')f.lost.add(1);
 else await f.advance(-1,{wall:false});
 assert.equal(f.owner.isIdle(),true);
});
test('one expired hint cannot hide another live pass or an underlying timed-out request',async()=>{
 const f=fixture();await f.send();await f.advance(20000);await f.send('start',1,2);await f.advance(10000);
 assert.equal(f.owner.isIdle(),false);await f.send('end',1,2);assert.equal(f.owner.isIdle(),true);
 const held=deferred();f.setFrameRead(()=>held.promise);const pending=f.send('start',2);await drain();
 await f.advance(6000);assert.equal((await pending).ok,false);assert.equal(f.owner.isIdle(),false);
 held.resolve(f.frames.get(1));await drain();assert.equal(f.owner.isIdle(),true);assert.equal((await f.send()).ok,false);
});
