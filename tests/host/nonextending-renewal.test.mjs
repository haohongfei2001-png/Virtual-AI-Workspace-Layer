import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
const drain=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
const source=readFileSync(new URL('./surface-controller.test.mjs',import.meta.url),'utf8');
const boundary="\ntest('owner registration and both UiGrant ACKs gate initial dual-surface show'";
assert.equal(source.split(boundary).length,2,'fixture extraction has one exact boundary');
const fixture=new Function('assert','createSurfaceController',source.slice(0,source.indexOf(boundary)).replace(/^import .*;\n/gm,'')+'\nreturn fixture;')(assert,createSurfaceController);
// Real controller scheduling and ScopeAuthority provider admission, isolated DOM/IPC doubles.
async function chain(t,{extended=false,shortened=false,c2=false}={}){
 let wall=c2?41000:1000,reads=0,renewals=0,ids=0;const timeline=[];
 const receipt=Object.freeze({id:'native-request',contextId:'personal',selectionEpoch:1,wall:1000});
 const identity=()=>({principalId:'fixture-user',expiresAt:new Date(c2?141000:shortened&&reads>1?16000:extended?wall+20000:21000).toISOString(),contexts:[{id:'personal',kind:'personal'}],providerProfile:'fixture',transport:'worker-fixed-fetch'});
 const authority=createScopeAuthority({provider:{read:async()=>{reads++;return identity();}},profile:{id:'fixture',singlePersonalDefault:!c2,...(c2?{browserRequestContext:true}:{})},...(c2?{contextObserver:{verify:async()=>receipt,isCurrent:(_frame,value)=>value===receipt&&wall<receipt.wall+60000}}:{}),now:()=>wall,elapsedNow:()=>wall,makeId:()=> 'proof'+(++ids)});
 const frame={tabId:1,frameId:0,documentId:'document',documentLifecycle:'active',incognito:false,actualURL:'https://chatgpt.com/'};
 const initial=await authority.refresh(frame,'bind');assert.equal(initial.state,'verified');const f=fixture();
 if(c2){assert.equal(Date.parse(initial.grant.expiresAt),receipt.wall+60000);assert(Date.parse(identity().expiresAt)>Date.parse(initial.grant.expiresAt));f.tick(40000);f.binding.expiresAt=initial.grant.expiresAt;const confirm=f.bridge.confirmParent;f.bridge.confirmParent=async value=>{const ack=await confirm(value);ack.grant.expiresAt=initial.grant.expiresAt;return ack;};}
 f.bridge.renewSession=async()=>{
  renewals++;const resolution=await authority.revalidate(frame);assert.equal(resolution.state,'verified');
  const ack=f.renewAck(),expiry=resolution.grant.expiresAt;ack.binding.expiresAt=expiry;for(const grant of ack.grants)grant.expiresAt=expiry;
  timeline.push({at:wall,expiry:Date.parse(expiry),reads,renewals});return ack;
 };
 t.after(()=>{f.controller.stop();authority.invalidateAll();});await f.controller.start({});await f.both();
 return {...f,advance:async ms=>{wall+=ms;f.tick(ms);await drain();},reads:()=>reads,renewals:()=>renewals,timeline,wall:()=>wall};
}
test('successful unchanged absolute expiry cannot cause geometric provider retries',async t=>{
 const f=await chain(t);await f.advance(10000);assert.equal(f.renewals(),1);assert.equal(f.reads(),2);
 for(const ms of [5000,2500,1250,625,312.5,156.25])await f.advance(ms);
 assert.equal(f.renewals(),1,'no new renewal after success failed to advance the absolute expiry: '+JSON.stringify(f.timeline));
 assert.equal(f.reads(),2,'local timer scheduling must not amplify authenticated provider reads');
 assert.equal(f.controller.localStatus(),'ready');assert.equal(f.calls.dispose,0);
 await f.advance(21000-f.wall());assert.equal(f.controller.localStatus(),'unavailable');assert.equal(f.calls.dispose,1);assert.equal(f.calls.terminations.at(-1).reason,'ui-grant-expired');assert.equal(f.renewals(),1);
});
test('unchanged expiry withdraws at the original deadline without waiting for another network request',async t=>{
 const f=await chain(t);await f.advance(10000);await f.advance(10000);
 assert.equal(f.wall(),21000);assert.equal(f.controller.localStatus(),'unavailable');assert.equal(f.calls.dispose,1);assert.equal(f.calls.terminations.at(-1).reason,'ui-grant-expired');assert.equal(f.renewals(),1);assert.equal(f.reads(),2);
});
test('genuinely extended expiry continues normal bounded renewal cadence',async t=>{
 const f=await chain(t,{extended:true});for(let i=1;i<=4;i++){
  await f.advance(10000);assert.equal(f.renewals(),i);assert.equal(f.reads(),i+1);assert.equal(f.controller.localStatus(),'ready');assert.equal(f.calls.dispose,0);assert.equal(f.timeline.at(-1).expiry,f.wall()+20000);
 }
 assert.deepEqual(f.timeline.map(row=>row.at),[11000,21000,31000,41000]);
});

test('successful shorter expiry withdraws at the new earlier deadline without additional renewal',async t=>{
 const f=await chain(t,{shortened:true});await f.advance(10000);assert.equal(f.timeline[0].expiry,16000);assert.equal(f.renewals(),1);
 await f.advance(2500);assert.equal(f.controller.localStatus(),'ready');assert.equal(f.renewals(),1);await f.advance(2499);assert.equal(f.controller.localStatus(),'ready');
 await f.advance(1);assert.equal(f.wall(),16000);assert.equal(f.controller.localStatus(),'unavailable');assert.equal(f.calls.terminations.at(-1).reason,'ui-grant-expired');assert.equal(f.calls.dispose,1);assert.equal(f.reads(),2);
});
test('C2 receipt absolute 60-second cap does not amplify provider reads despite long-lived session',async t=>{
 const f=await chain(t,{c2:true});await f.advance(10000);assert.equal(f.timeline[0].expiry,61000);assert.equal(f.reads(),2);
 for(const ms of [5000,2500,1250,625,312.5,156.25])await f.advance(ms);
 assert.equal(f.renewals(),1);assert.equal(f.reads(),2);assert.equal(f.controller.localStatus(),'ready');
 await f.advance(61000-f.wall());assert.equal(f.controller.localStatus(),'unavailable');assert.equal(f.calls.dispose,1);assert.equal(f.calls.terminations.at(-1).reason,'ui-grant-expired');assert.equal(f.reads(),2);
});
