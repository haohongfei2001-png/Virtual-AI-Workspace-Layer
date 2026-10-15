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
test('scheduling-only strict message rejects forged shape, sender and profile without activating scope',async()=>{
 const h=fixture();for(const patch of [{scopeKey:'scope_a'},{bodyProofId:'body'},{seq:1},{v:2},{routeEpoch:0},{passSeq:0},{passSeq:1.5},{profileId:'unknown'},{profileVersion:2},{phase:'complete'},{documentToken:'wrong'},{producerToken:'wrong'}])assert.equal((await h.owner.handle({...h.message(),...patch},h.sender(1))).ok,false,JSON.stringify(patch));
 for(const patch of [{id:'page'},{frameId:1},{documentId:'different'},{url:'https://chatgpt.com/c/other'},{tab:{id:1,incognito:true}}])assert.equal((await h.owner.handle(h.message(),{...h.sender(1),...patch})).ok,false);
 assert.equal(h.owner.isPending('scope_a'),false);assert.equal((await h.send()).ok,true);for(const scope of ['',null,undefined,'foreign'])assert.equal(h.owner.isPending(scope),false);assert.equal(h.owner.isPending('scope_a'),true);
});
test('one ending producer cannot release another same-scope pass; other scope is independent',async()=>{
 const h=fixture();for(const tab of [1,2,3])assert.equal((await h.send('start',1,tab)).ok,true);
 await h.send('end',1,1);assert.equal(h.owner.isPending('scope_a'),true);await h.send('cancel',1,2);assert.equal(h.owner.isPending('scope_a'),false);assert.equal(h.owner.isPending('scope_b'),true);await h.send('end',1,3);assert.equal(h.owner.isPending('scope_b'),false);
});
test('end or cancel without start installs tombstone; replayed or late starts cannot reopen it',async()=>{
 for(const ending of ['end','cancel']){const h=fixture();assert.equal((await h.send(ending)).ok,true);assert.equal((await h.send()).ok,false);assert.equal(h.owner.isPending('scope_a'),false);assert.equal((await h.send('start',2)).ok,true);assert.equal((await h.send(ending,1)).ok,false);assert.equal(h.owner.isPending('scope_a'),true);}
});
test('asynchronously validated late start cannot overtake same-pass end or newer start',async()=>{
 for(const ending of ['end','newer']){const h=fixture();let release,calls=0;h.setFrameRead(tab=>++calls===1?new Promise(resolve=>release=()=>resolve(h.frames.get(tab))):h.frames.get(tab));const late=h.send();await drain();assert(release);assert.equal((await h.send(ending==='end'?'end':'start',ending==='end'?1:2)).ok,true);release();assert.equal((await late).ok,false);assert.equal(h.owner.isPending('scope_a'),ending==='newer');}
});
test('repeated start and renewal-like authority refresh never extend the original thirty seconds',async()=>{
 const h=fixture();await h.send();await h.advance(29999);h.grants.set(1,{...h.grants.get(1),expiresAt:new Date(120000).toISOString()});assert.equal((await h.send()).ok,true);assert.equal(h.owner.isPending('scope_a'),true);await h.advance(1);assert.equal(h.owner.isPending('scope_a'),false);assert.equal((await h.send()).ok,false);await h.send('end');assert.equal((await h.send()).ok,false);
});
for(const change of ['document','route','producer','grant','scope-epoch','scope','profile-object','profile-version','revoke','stop','elapsed-rollback','wall-rollback'])test('active pass releases immediately and cannot revive after '+change,async()=>{
 const h=fixture();await h.send();await h.advance(10);assert.equal(h.owner.isPending('scope_a'),true);
 if(change==='document')h.frames.get(1).documentId='replacement';else if(change==='route')h.frames.get(1).url+='x';else if(change==='producer')h.lost.add(1);else if(change==='grant')h.grants.get(1).id='new';else if(change==='scope-epoch')h.grants.get(1).scopeEpoch++;else if(change==='scope')h.grants.get(1).scopeKey='new';else if(change==='profile-object')h.profiles.set('surface',{id:'surface',revision:1});else if(change==='profile-version')h.profiles.get('surface').revision++;else if(change==='revoke')h.owner.invalidateDocument('document_1');else if(change==='stop')h.owner.stop();else if(change==='elapsed-rollback')await h.advance(-1,{wall:false});else {await h.advance(-1);await h.advance(1,{wall:false});}
 assert.equal(h.owner.isPending('scope_a'),false);assert.equal(h.owner.isPending('new'),false);
});
test('revocation while start awaits browser frame fences its late result',async()=>{
 const h=fixture();let release;h.setFrameRead(tab=>new Promise(resolve=>release=()=>resolve(h.frames.get(tab))));const pending=h.send();await drain();h.owner.invalidateTab(1);release();assert.equal((await pending).ok,false);assert.equal(h.owner.isPending('scope_a'),false);
});
test('missing browser result stays within six-second RPC, late completion cannot activate pass',async()=>{
 const h=fixture();let release;h.setFrameRead(tab=>new Promise(resolve=>release=()=>resolve(h.frames.get(tab))));const pending=h.send();await drain();await h.advance(6000);assert.equal((await pending).ok,false);release();await drain();assert.equal(h.owner.isPending('scope_a'),false);
});
test('bounded producer tombstones cannot be evicted by repeated starts, lost producer permits reuse',async()=>{
 const h=fixture({maxProducers:1});await h.send();await h.send('end');assert.equal((await h.send('start',1,2)).ok,false);assert.equal((await h.send()).ok,false);h.lost.add(1);assert.equal((await h.send('start',1,2)).ok,true);
});
