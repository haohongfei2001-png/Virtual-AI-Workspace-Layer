import test from 'node:test';
import assert from 'node:assert/strict';
import inspector from 'node:inspector';
import {collectJ3FailureClosures} from './j3-failure-closures.mjs';
import {createNoReceiptContextRecovery} from '../../src/runtime/context-recovery/no-receipt-recovery.mjs';
import {createClock,flush} from '../runtime/context-recovery/fixture.mjs';

const expectedURL='http://127.0.0.1:3210/c/11111111-1111-4111-8111-111111111111';
async function collect(options={}){
 const session=new inspector.Session();session.connect();let detached=false;
 try{return await collectJ3FailureClosures({send:(method,params)=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result))),detach:async()=>{detached=true;session.disconnect();}},{expectedURL,...options});}
 finally{if(!detached)session.disconnect();}
}

test('actual recovery policy retains distinct terminal history without invoking owner or granting scope',async t=>{
 const clock=createClock(),frame={tabId:8,frameId:0,documentId:'PRIVATE_DOCUMENT',documentLifecycle:'active',incognito:false,actualURL:expectedURL};
 const receipt={id:'PRIVATE_RECEIPT',selectionEpoch:4},attemptOwner={};
 let mode='missing',grant=null,live=true,calls=0,inspecting=false;
 const called=()=>{if(inspecting)calls++;};
 const authority={peek(){called();return grant&&live?{state:'verified',grant}:{state:'unverified'};},invalidate(){called();grant=null;}};
 const observer={async verify(){called();if(mode==='timeout')return new Promise(()=>{});return mode==='missing'?null:receipt;},isCurrent(){called();return live;}};
 const owner=createNoReceiptContextRecovery({profile:{id:'fixture',browserRequestContext:true,singlePersonalDefault:false},authority,contextObserver:observer,now:clock.now,elapsedNow:clock.elapsedNow,schedule:clock.schedule,cancel:clock.cancel});
 globalThis.__j3RecoveryPolicy=owner;t.after(()=>{owner.stop();delete globalThis.__j3RecoveryPolicy;});
 const run=()=>owner.run(frame,{attemptOwner,isCurrent:()=>true,remainingMs:()=>6000,authorize:async()=>{
  called();if(mode==='blocked')return {state:'unverified',reason:'scope-provider-unavailable'};
  grant={id:'PRIVATE_GRANT',expiresAt:new Date(clock.now()+60000).toISOString(),context:{kind:'browser-request-context',requestReceiptId:receipt.id,selectionEpoch:receipt.selectionEpoch,documentId:frame.documentId}};
  return {state:'verified',grant};
 }});
 async function check(state,reason,{waiting,delivery=false}={}){
  inspecting=true;let report;try{report=await collect();}finally{inspecting=false;}
  assert.equal(report.error,undefined);
  const policy=report.functions.map(row=>row.recoveryPolicy).find(p=>p?.rows.some(row=>row.state===state&&row.reason===reason));
  assert(policy,JSON.stringify(report));
  assert.equal(policy.historyOnly,true);assert.equal(policy.currentAuthority,'NOT_ESTABLISHED');
  assert.equal(policy.targetDocumentMatch,null);assert.equal(policy.targetGenerationMatch,null);
  const row=policy.rows.find(row=>row.state===state&&row.reason===reason);
  assert.equal(row.routeMatches,true);assert.equal(row.flightPresent,false);assert.equal(row.deliveryPresent,delivery);
  if(waiting!==undefined)assert.equal(row.waiting,waiting);
  assert.equal(calls,0);assert(!JSON.stringify(report).includes('PRIVATE_'));assert(!JSON.stringify(report).includes(expectedURL));
 }
 assert.equal((await run()).state,'ambiguous');await check('WAITING_NATIVE','current-context-unproven',{waiting:true});
 mode='blocked';assert.equal((await run()).state,'unverified');await check('BLOCKED','scope-provider-unavailable',{waiting:true});
 // A genuine invalidation clears the earlier attempt; no diagnostic invokes it.
 owner.invalidate(frame);mode='timeout';const pending=run();await flush();await clock.advance(6000);
 assert.equal((await pending).state,'unverified');await clock.advance(15000);
 await check('CANCELLED','context-recovery-deadline',{waiting:true});
 // A new receipt is supplied by this explicit synthetic observer edge.
 mode='verified';owner.invalidate(frame);
 // The prior attempt object is still spent: construct a new observed receipt.
 observer.verify=async()=>{called();return {...receipt};};
 assert.equal((await run()).state,'verified');
 live=false; // History remains SCOPE_VERIFIED, but current authority is absent.
 await check('SCOPE_VERIFIED',null,{waiting:true,delivery:true});
 owner.invalidate(frame);await check('CANCELLED','context-recovery-invalidated',{waiting:true});
});

test('recovery history projection keeps getters unknown, same-route slots separate and a hard row bound',async()=>{
 let calls=0;
 globalThis.__j3RecoveryProjection=(()=>{
  const ordinary={state:'SCOPE_VERIFIED',reason:null,waiting:false,generation:2,frame:{actualURL:expectedURL,documentId:'PRIVATE_DOC'},flight:{generation:1},delivery:{generation:2,grant:'PRIVATE_GRANT'}};
  const trap={};for(const key of ['state','reason','waiting','frame','flight','delivery','generation'])Object.defineProperty(trap,key,{get(){calls++;throw Error('PRIVATE_GETTER');}});
  const slots=new Map([['PRIVATE_FIRST',ordinary],['PRIVATE_SECOND',{...ordinary,frame:{actualURL:expectedURL,documentId:'PRIVATE_OTHER_DOC'}}],['PRIVATE_TRAP',trap],['PRIVATE_UNKNOWN',{state:'PRIVATE_STATE',reason:'PRIVATE_REASON',frame:{actualURL:expectedURL+'/other'}}],...Array.from({length:130},(_,i)=>['PRIVATE_'+i,ordinary])]);
  return function run(){calls++;throw Error('invalid-context-recovery-call context-recovery-superseded '+slots.size);};
 })();
 try{
  const report=await collect(),policy=report.functions.map(row=>row.recoveryPolicy).find(p=>p?.size===134);
  assert(policy,JSON.stringify(report));assert.equal(policy.rows.length,128);assert.equal(policy.truncated,true);
  assert.equal(policy.rows[0].routeMatches,true);assert.equal(policy.rows[1].routeMatches,true);
  assert.equal(policy.rows[0].internalFlightGenerationMatches,false);assert.equal(policy.rows[0].internalDeliveryGenerationMatches,true);
  assert.deepEqual(policy.rows[2],{state:null,reason:null,waiting:null,flightPresent:null,deliveryPresent:null,routeMatches:null,internalFlightGenerationMatches:null,internalDeliveryGenerationMatches:null});
  assert.equal(policy.rows[3].state,null);assert.equal(policy.rows[3].reason,null);assert.equal(policy.rows[3].routeMatches,false);
  assert.equal(policy.targetDocumentMatch,null);assert.equal(policy.targetGenerationMatch,null);assert.equal(calls,0);
  assert(!JSON.stringify(report).includes('PRIVATE_'));assert(!JSON.stringify(report).includes(expectedURL));
 }finally{delete globalThis.__j3RecoveryProjection;}
});

test('reaching the existing eight-function limit discloses potentially omitted policies',async()=>{
 globalThis.__j3ManyPolicies=Array.from({length:9},()=>{
  const slots=new Map();
  return function run(){throw Error('invalid-context-recovery-call context-recovery-superseded '+slots.size);};
 });
 try{const report=await collect();assert.equal(report.error,undefined);assert.equal(report.functions.length,8);assert.equal(report.truncated,true);}
 finally{delete globalThis.__j3ManyPolicies;}
});
