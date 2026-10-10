import test from 'node:test';
import assert from 'node:assert/strict';
import { createBroker, LEASE_MS, REQUEST_MS } from '../../../experiments/r0/mv3/protocol.mjs';
import { createProbeClient } from '../../../experiments/r0/mv3/client.mjs';
const URL_A='http://127.0.0.1:38407/r0-mv3-fixture/A.html';
const URL_B='http://127.0.0.1:38407/r0-mv3-fixture/B.html';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(overrides={}) {
  let time=1000, url=URL_A, serial=0, nodes=0, mounted=0, removed=0;
  const timers=new Map(), history=[];
  const api=createBroker({extensionId:'extension-id',workerId:'worker-A',now:()=>time,makeId:()=> 'lease-'+ ++serial});
  const defaultSend=req=>api.handle(req,{id:'extension-id',tab:{id:1},frameId:0,documentId:'doc-A',documentLifecycle:'active',url});
  const args={clientId:'client-A',send:defaultSend,getURL:()=>url,now:()=>time,
    schedule:(fn,delay)=>{const id=++serial;timers.set(id,{fn,delay});history.push({id,fn,delay});return id;},
    cancel:id=>timers.delete(id),mount:()=>{nodes++;mounted++;return()=>{nodes--;removed++;};},...overrides};
  const client=createProbeClient(args);
  return {client,args,api,timers,history,send:defaultSend,time:v=>{time=v;},url:v=>{url=v;},
    counts:()=>({nodes,mounted,removed}),fire:id=>timers.get(id).fn()};
}
test('positive handshake mounts one synthetic mark; stop/dispose are idempotent',async()=>{
  const h=harness();assert.equal(await h.client.connect(),true);assert.equal(h.client.status().phase,'BOUND');
  assert.equal(h.counts().nodes,1);h.client.stop();h.client.stop();h.client.dispose();
  assert.equal(h.counts().removed,1);assert.equal(h.timers.size,0);assert.equal(await h.client.connect(),false);
});
test('connect timeout settles even if transport never replies; late response cannot mount',async()=>{
  let resolve;const h=harness({send:()=>new Promise(r=>{resolve=r;})});const p=h.client.connect();await settle();
  h.history.find(t=>t.delay===REQUEST_MS).fn();assert.equal(await p,false);
  resolve(h.send({v:1,type:'BIND',clientId:'client-A',requestId:1}));await settle();
  assert.equal(h.client.status().phase,'TIMED_OUT');assert.equal(h.counts().mounted,0);
});
test('stop settles pending connect and late success/rejection cannot resurrect content',async()=>{
  let resolve;const h=harness({send:()=>new Promise(r=>{resolve=r;})});const p=h.client.connect();await settle();h.client.stop();
  assert.equal(await p,false);resolve(h.send({v:1,type:'BIND',clientId:'client-A',requestId:1}));await settle();
  assert.equal(h.counts().nodes,0);assert.equal(h.timers.size,0);
});
test('out-of-order reply to prior local generation cannot remove the newer mount',async()=>{
  const pending=[];const h=harness({send:req=>new Promise(resolve=>pending.push({req,resolve}))});
  const a=h.client.connect();await settle();const old=h.send(pending[0].req);
  const b=h.client.connect();await settle();pending[1].resolve(h.send(pending[1].req));
  assert.equal(await b,true);pending[0].resolve(old);assert.equal(await a,false);
  assert.equal(h.counts().nodes,1);assert.equal(h.client.status().phase,'BOUND');
});
test('A-to-B-to-A route race rejects old reply even when URL returns to A',async()=>{
  const pending=[];const h=harness({send:req=>new Promise(resolve=>pending.push({req,resolve}))});
  const a=h.client.connect();await settle();const old=h.send(pending[0].req);
  h.url(URL_B);h.client.stop();h.url(URL_A);const b=h.client.connect();await settle();
  pending[1].resolve(h.send(pending[1].req));assert.equal(await b,true);
  pending[0].resolve(old);assert.equal(await a,false);assert.equal(h.counts().mounted,1);
});
test('route mismatch at reply delivery, malformed response and wrong request are refused',async()=>{
  for(const mode of ['route','malformed','wrong-request']){
    let release,req;const h=harness({send:r=>{req=r;return new Promise(resolve=>{release=resolve;});}});
    const p=h.client.connect();await settle();let reply=h.send(req);
    if(mode==='route')h.url(URL_B);if(mode==='malformed')reply={ok:true};
    if(mode==='wrong-request')reply={...reply,requestId:99};
    release(reply);assert.equal(await p,false);assert.equal(h.counts().nodes,0);
  }
});
test('send throw/reject and context reader failure settle false with no mount',async()=>{
  for(const overrides of [{send:()=>{throw Error('test');}},{send:()=>Promise.reject(Error('test'))},{getURL:()=>{throw Error('test');}}]){
    const h=harness(overrides);assert.equal(await h.client.connect(),false);assert.equal(h.timers.size,0);assert.equal(h.counts().nodes,0);
  }
});
test('active fake timer expiry removes only owned mark; stale cancelled expiry cannot clear new generation',async()=>{
  const h=harness();assert.equal(await h.client.connect(),true);const old=h.history.at(-1).fn;
  h.time(1100);assert.equal(await h.client.connect(),true);old();assert.equal(h.counts().nodes,1);
  h.time(1100+LEASE_MS);h.history.at(-1).fn();assert.equal(h.counts().nodes,0);assert.equal(h.client.status().phase,'EXPIRED');
});
test('early timer reschedules to original deadline rather than extending the lease',async()=>{
  const h=harness();await h.client.connect();h.time(1100);h.history.at(-1).fn();
  assert.equal(h.history.at(-1).delay,LEASE_MS-100);
  h.time(1000+LEASE_MS);h.history.at(-1).fn();assert.equal(h.client.status().phase,'EXPIRED');
});
test('scheduler failure and cancel failure refuse binding and latch cleanup failures',async()=>{
  const a=harness({schedule:()=>{throw Error('test');}});assert.equal(await a.client.connect(),false);
  const b=harness({cancel:()=>{throw Error('test');}});assert.equal(await b.client.connect(),false);
  assert.equal(b.client.status().cleanupErrors>0,true);assert.equal(await b.client.connect(),false);assert.equal(b.counts().nodes,0);
});
test('expiry scheduler failure removes a mounted marker',async()=>{
  let calls=0;const h=harness({schedule:()=>{if(++calls>1)throw Error('test');return 1;}});
  assert.equal(await h.client.connect(),false);assert.deepEqual(h.counts(),{nodes:0,mounted:1,removed:1});
});
test('mount crossing expiry removes own node and refuses bound state',async()=>{
  let h,removed=0;h=harness({mount:()=>{h.time(1000+LEASE_MS);return()=>{removed++;};}});
  assert.equal(await h.client.connect(),false);assert.equal(removed,1);assert.equal(h.client.status().phase,'STALE_DURING_MOUNT');
});
test('mount reentry cannot clear newer pending connection or leak the obsolete own node',async()=>{
  let h,next,once=true,removed=0;h=harness({mount:()=>{
    if(once){once=false;next=h.client.connect();}
    return()=>{removed++;};
  }});
  assert.equal(await h.client.connect(),false);assert.equal(await next,true);
  assert.equal(removed,1);assert.equal(h.client.status().phase,'BOUND');h.client.dispose();assert.equal(removed,2);
});
test('throwing own cleanup still cancels timers and prevents later mounts',async()=>{
  const h=harness({mount:()=>()=>{throw Error('test');}});
  assert.equal(await h.client.connect(),true);h.client.stop();assert.equal(h.timers.size,0);
  assert.equal(h.client.status().cleanupErrors,1);assert.equal(await h.client.connect(),false);
});
test('synchronous timeout callback does not send or leave timer handles',async()=>{
  let sent=0,cancelled=0;const h=harness({schedule:fn=>{fn();return 1;},cancel:()=>{cancelled++;},send:()=>{sent++;}});
  assert.equal(await h.client.connect(),false);assert.equal(sent,0);assert.equal(cancelled,1);
});
test('cleanup reentry owns a distinct generation; superseded outer connect cannot leak markers or timers',async()=>{
  let h,nested,once=true,nodes=0;
  h=harness({mount:()=>{nodes++;return()=>{nodes--;if(once){once=false;nested=h.client.connect();}};}});
  assert.equal(await h.client.connect(),true);
  assert.equal(await h.client.connect(),false);
  assert.equal(await nested,true);assert.equal(nodes,1);assert.equal(h.timers.size,1);
  h.client.dispose();assert.equal(nodes,0);assert.equal(h.timers.size,0);
});

