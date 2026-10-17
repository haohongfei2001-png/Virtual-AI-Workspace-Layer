import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostEntryCalibration} from '../../src/runtime/host-entry-calibration.mjs';
const request={v:1,type:'HOST_UI_CALIBRATION_ENTRY',grantId:'grant',mountId:'mount',kind:'foreground'};
const unavailable={ok:false,state:'unavailable'};
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(){
 let time=0,next=0,current=true,proof='private-current-proof',reads=0,auth=0,held=null,readOptions,readProof,fail=false;const timers=new Map(),context={role:'workspace',isCurrent:()=>current},senders=[];
 const ui={async withScope(args,work){auth++;senders.push(args);if(!current)throw Error('revoked');return work(context);}};
 const observations={currentProofForParent:c=>{assert.equal(c,context);return proof;}};
 const reader={async readCalibration(p,options){reads++;readProof=p;readOptions=options;if(held)await held;if(fail)throw Error('PRIVATE_PROVIDER_ERROR');return {metadata:'PRIVATE_METADATA',proofId:p,principal:'PRIVATE_PRINCIPAL'};}};
 const owner=createHostEntryCalibration({ui,observations,reader,elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 return {owner,context,senders,get reads(){return reads;},get auth(){return auth;},get options(){return readOptions;},get proofUsed(){return readProof;},setProof:p=>proof=p,revoke:()=>current=false,setFailure:()=>fail=true,hold(){let release;held=new Promise(r=>release=r);return release;},async advance(ms){time+=ms;for(const [id,timer]of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}await settle();}};
}
for(const kind of ['foreground','history'])test('entry '+kind+' acquires current private proof and returns fixed public summary only',async()=>{
 const f=fixture(),sender={documentId:'ui-doc'};try{assert.deepEqual(await f.owner.handle({...request,kind},sender),{ok:true,state:'checked-current'});assert.equal(f.reads,1);assert.equal(f.auth,1);assert.equal(f.proofUsed,'private-current-proof');assert.deepEqual(Object.keys(f.options).sort(),['isCurrent','signal']);assert.equal(f.senders[0].sender,sender);assert.equal(f.options.signal.aborted,true);assert.equal(f.options.isCurrent(),false);}finally{f.owner.stop();}
});
for(const patch of [{proofId:'forged'},{conversationId:'forged'},{scopeKey:'forged'},{isCurrent:true},{budgetWindow:0},{signal:{}},{v:2},{type:'HOST_UI_VIEW'},{kind:'other'},{grantId:''},{mountId:''}])test('strict entry rejects '+JSON.stringify(patch)+' before scope/provider access',async()=>{
 const f=fixture();try{assert.deepEqual(await f.owner.handle({...request,...patch},{}),unavailable);assert.equal(f.reads,0);assert.equal(f.auth,0);}finally{f.owner.stop();}
});
test('busy entry across surfaces is neither joined nor allowed to preempt current calibration',async()=>{
 const f=fixture(),release=f.hold(),first=f.owner.handle(request,{role:'workspace'});try{await settle();assert.equal(f.reads,1);const options=f.options;assert.deepEqual(await f.owner.handle({...request,grantId:'sidebar-grant',kind:'history'},{role:'sidebar'}),unavailable);assert.equal(f.reads,1);assert.equal(f.auth,1);assert.equal(options.signal.aborted,false);release();assert.deepEqual(await first,{ok:true,state:'checked-current'});}finally{release();f.owner.stop();}
});
test('missing current body proof never falls back to supplied target or previous proof',async()=>{
 const f=fixture();try{f.setProof(null);assert.deepEqual(await f.owner.handle(request,{}),unavailable);assert.equal(f.reads,0);f.setProof('new-private-proof');assert.deepEqual(await f.owner.handle(request,{}),{ok:true,state:'checked-current'});assert.equal(f.proofUsed,'new-private-proof');}finally{f.owner.stop();}
});
for(const change of ['revoke','proof','stop','clock-rollback'])test('entry guard rejects '+change+' during in-flight read and late metadata stays private',async()=>{
 const f=fixture(),release=f.hold(),pending=f.owner.handle(request,{});try{await settle();assert.equal(f.options.isCurrent(),true);if(change==='revoke')f.revoke();else if(change==='proof')f.setProof('different-private-proof');else if(change==='stop')f.owner.stop();else await f.advance(-1);assert.equal(f.options.isCurrent(),false);if(change==='stop')assert.equal(f.options.signal.aborted,true);release();assert.deepEqual(await pending,unavailable);assert.equal(f.options.signal.aborted,true);assert.equal(f.reads,1);}finally{release();f.owner.stop();}
});
test('six-second deadline aborts signal and late response cannot change failure or retry',async()=>{
 const f=fixture(),release=f.hold(),pending=f.owner.handle(request,{});try{await settle();await f.advance(5999);assert.equal(f.options.isCurrent(),true);await f.advance(1);const result=await pending;assert.deepEqual(result,unavailable);assert.equal(f.options.signal.aborted,true);assert.equal(f.options.isCurrent(),false);release();await settle();assert.deepEqual(result,unavailable);assert.equal(f.reads,1);}finally{release();f.owner.stop();}
});
test('provider failure is sanitized and performs no automatic retry',async()=>{
 const f=fixture();f.setFailure();try{assert.deepEqual(await f.owner.handle(request,{}),unavailable);await f.advance(6000);assert.equal(f.reads,1);assert.equal(f.options.signal.aborted,true);}finally{f.owner.stop();}
});
test('stopped coordinator never reacquires scope or reads again',async()=>{const f=fixture();f.owner.stop();assert.deepEqual(await f.owner.handle(request,{}),unavailable);assert.equal(f.auth,0);assert.equal(f.reads,0);});

test('trusted sidebar context cannot trigger calibration even after workspace entry completes',async()=>{
 const f=fixture();try{assert.deepEqual(await f.owner.handle(request,{}),{ok:true,state:'checked-current'});assert.equal(f.reads,1);f.context.role='sidebar';assert.deepEqual(await f.owner.handle({...request,kind:'history'},{}),unavailable);assert.equal(f.reads,1);assert.equal(f.auth,2);}finally{f.owner.stop();}
});
