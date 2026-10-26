import test from 'node:test';import assert from 'node:assert/strict';import {createNativeActions} from '../../src/host/native-actions.mjs';import {createURLPolicy} from '../../src/host/url-policy.mjs';
const C='11111111-2222-4333-8444-555555555555',D='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',handle={id:'h',documentToken:'doc',routeEpoch:1,regionEpoch:1,controlKind:'conversation'};
function fixture(options={}){let clicks=0,time=0,url='https://chatgpt.com/c/'+C,risk={state:'clear',flags:[]},proof=null,authorized=true,connected=true;const node={get isConnected(){return connected;},click(){clicks++;options.click?.();}};let currentNode=node;const actions=createNativeActions({discovery:{getNode:()=>currentNode},urlPolicy:createURLPolicy(),currentURL:()=>url,inputRisk:()=>risk,bodyProof:()=>proof,authorize:options.authorize??(()=>authorized),beforeDispatch:options.beforeDispatch??(()=>{}),onNativeDispatch:options.onNativeDispatch??(()=>{}),onNativeDispatchCancelled:options.onNativeDispatchCancelled??(()=>{}),now:()=>time});const target=(id=D,liveHandle={...handle})=>({kind:'resolved',entity:'conversation',nativeId:id,navigationURL:'https://chatgpt.com/c/'+id,liveHandle});const plan=(t=target())=>actions.planNavigation(t,risk),command=p=>({actionId:'action',uiGrantId:'grant',mountId:'mount',planRevision:p.planRevision,targetKey:actions.planKey(p)});return {actions,target,plan,command,node,get clicks(){return clicks;},setRisk:r=>risk=r,setURL:u=>url=u,setProof:p=>proof=p,revoke:()=>authorized=false,detach:()=>{connected=false;currentNode=null;},replace:()=>currentNode={...node},advance:n=>time+=n,clock:n=>{time=n;}};}
test('authorized owner plan clicks original control once and replay cannot redispatch',async()=>{const f=fixture(),p=f.plan(),dto=f.command(p);assert.equal(p.mode,'native-control');assert.equal((await f.actions.dispatchNative(dto)).state,'dispatched');assert.equal((await f.actions.dispatchNative(dto)).reason,'action-already-used');assert.equal(f.clicks,1);});
test('default authorization denies any dispatch',async()=>{const a=createNativeActions({discovery:{getNode:()=>null},urlPolicy:createURLPolicy(),currentURL:()=> 'https://chatgpt.com/',inputRisk:()=>({state:'clear',flags:[]})}),p=a.planNavigation({kind:'resolved',entity:'conversation',nativeId:C,navigationURL:'https://chatgpt.com/c/'+C,liveHandle:null});assert.equal((await a.dispatchNative({actionId:'a',uiGrantId:'g',mountId:'m',targetKey:a.planKey(p),planRevision:p.planRevision})).reason,'unauthorized-navigation');});
test('same URL alone cannot certify current body; matching proof yields same-target',async()=>{const f=fixture(),unproven=f.plan(f.target(C));assert.equal(unproven.mode,'native-control');f.setProof({conversationId:C,bodyProofId:'proof'});const p=f.plan(f.target(C));assert.equal(p.mode,'same-target');assert.equal((await f.actions.dispatchNative(f.command(p))).state,'already-current');assert.equal(f.clicks,0);});
for(const state of ['clear','unsaved','unknown'])test('href '+state+' stays browser-owned without programmatic dispatch',async()=>{const f=fixture();f.setRisk({state,flags:state==='clear'?[]:['composer']});const p=f.plan(f.target(D,null));assert.equal(p.mode,'href');assert.equal(p.disposition,state==='clear'?'same-tab':'new-tab-preserve-current');assert.equal(p.target.navigationURL,'https://chatgpt.com/c/'+D);assert.equal((await f.actions.dispatchNative(f.command(p))).reason,'renderer-default-required');assert.equal(f.clicks,0);});
for(const mutation of ['risk','route','detached','replacement','expiry'])test(mutation+' changes revoke issued native plan',async()=>{const f=fixture(),p=f.plan();if(mutation==='risk')f.setRisk({state:'unsaved',flags:['composer']});if(mutation==='route')f.setURL('https://chatgpt.com/');if(mutation==='detached')f.detach();if(mutation==='replacement')f.replace();if(mutation==='expiry')f.advance(30000);assert.equal((await f.actions.dispatchNative(f.command(p))).reason,'stale-navigation-plan');assert.equal(f.clicks,0);});
test('beforeDispatch release is followed by handle and authorization checks',async()=>{let f;f=fixture({beforeDispatch:()=>{f.detach();}});const p=f.plan();assert.equal((await f.actions.dispatchNative(f.command(p))).reason,'stale-navigation-plan');assert.equal(f.clicks,0);let g;g=fixture({beforeDispatch:()=>g.revoke()});assert.equal((await g.actions.dispatchNative(g.command(g.plan()))).reason,'unauthorized-navigation');assert.equal(g.clicks,0);});
test('parallel same action ID dispatch at most once while authorize awaits',async()=>{let release;const f=fixture({authorize:()=>new Promise(r=>release=r)}),p=f.plan(),dto=f.command(p),first=f.actions.dispatchNative(dto);assert.equal((await f.actions.dispatchNative(dto)).reason,'action-already-used');release(true);await Promise.resolve();await Promise.resolve();await Promise.resolve();release(true);assert.equal((await first).state,'dispatched');assert.equal(f.clicks,1);});
test('click exception is unconfirmed and never fallback or retried',async()=>{const f=fixture({click:()=>{throw Error('unknown result');}}),p=f.plan(),dto=f.command(p);assert.equal((await f.actions.dispatchNative(dto)).state,'unconfirmed');assert.equal((await f.actions.dispatchNative(dto)).reason,'action-already-used');assert.equal(f.clicks,1);});
test('raw URL, selector, forged plan and wrong target identity cannot authorize actions',async()=>{const f=fixture(),p=f.plan(),dto=f.command(p);assert.equal(f.actions.planKey({...p}),null);assert.equal((await f.actions.dispatchNative({...dto,url:'https://evil.test'})).reason,'invalid-navigation-command');assert.equal((await f.actions.dispatchNative({...dto,targetKey:'forged'})).reason,'unknown-navigation-plan');assert.equal(f.plan({...f.target(),nativeId:C}).mode,'unavailable');assert.equal(f.clicks,0);});
test('IDless live handle is actionable but does not create persistent identity',async()=>{const f=fixture(),p=f.plan({kind:'live-control',control:handle,navigationURL:null});assert.equal(p.mode,'native-control');assert.equal(Object.hasOwn(p.target,'nativeId'),false);assert.equal((await f.actions.dispatchNative(f.command(p))).state,'dispatched');});
test('issued target and risk snapshots cannot be mutated through caller references',async()=>{const f=fixture(),target=f.target(),risk={state:'clear',flags:[]},p=f.actions.planNavigation(target,risk);target.nativeId=C;target.liveHandle.routeEpoch=99;risk.flags.push('composer');assert.equal(p.target.nativeId,D);assert.equal(p.control.routeEpoch,1);assert.equal((await f.actions.dispatchNative(f.command(p))).state,'dispatched');});
test('changed body proof invalidates same-target even when URL is unchanged',async()=>{const f=fixture();f.setProof({conversationId:C,bodyProofId:'old'});const p=f.plan(f.target(C));f.setProof({conversationId:C,bodyProofId:'new'});assert.equal((await f.actions.dispatchNative(f.command(p))).reason,'stale-navigation-plan');assert.equal(f.clicks,0);});
test('owner grant authorization can deny copied command on another mount',async()=>{const f=fixture({authorize:command=>command.mountId==='expected'}),p=f.plan();assert.equal((await f.actions.dispatchNative(f.command(p))).reason,'unauthorized-navigation');assert.equal(f.clicks,0);});
test('bounded plan eviction rejects old certificate rather than redispatching',async()=>{const f=fixture(),old=f.plan(),dto=f.command(old);for(let i=0;i<256;i++)f.plan();assert.equal(f.actions.planKey(old),null);assert.equal((await f.actions.dispatchNative(dto)).reason,'unknown-navigation-plan');assert.equal(f.clicks,0);});

for(const state of ['unsaved','unknown'])for(const flags of [[],['composer'],['attachment'],['upload'],['generation'],['voice'],['canvas']])test('resolved live control with '+state+' '+flags.join(',')+' becomes real href preserving current content',async()=>{const f=fixture();f.setRisk({state,flags});const p=f.plan();assert.equal(p.mode,'href');assert.equal(p.disposition,'new-tab-preserve-current');assert.equal(p.target.navigationURL,'https://chatgpt.com/c/'+D);assert.equal((await f.actions.dispatchNative(f.command(p))).reason,'renderer-default-required');assert.equal(f.clicks,0);});
for(const state of ['unsaved','unknown'])test('IDless '+state+' control stays unavailable without invented URL',async()=>{const f=fixture();f.setRisk({state,flags:['composer']});const p=f.plan({kind:'live-control',control:{...handle,controlKind:'new-chat'},navigationURL:null});assert.equal(p.mode,'unavailable');assert.equal(p.reason,'input-risk-unresolved');assert.equal(f.actions.planKey(p),null);assert.equal(f.clicks,0);});
for(const flag of ['composer','attachment','upload','generation','voice','canvas'])test('contradictory clear risk with '+flag+' cannot issue any navigation plan',()=>{const f=fixture();f.setRisk({state:'clear',flags:[flag]});f.setProof({conversationId:C,bodyProofId:'proof'});for(const target of [f.target(),f.target(D,null),f.target(C),{kind:'live-control',control:handle,navigationURL:null}])assert.equal(f.plan(target).mode,'unavailable');assert.equal(f.clicks,0);});
for(const state of ['unsaved','unknown'])test('verified same-target with '+state+' risk remains already-current without navigation',async()=>{const f=fixture();f.setRisk({state,flags:['composer']});f.setProof({conversationId:C,bodyProofId:'proof'});const p=f.plan(f.target(C));assert.equal(p.mode,'same-target');assert.equal((await f.actions.dispatchNative(f.command(p))).state,'already-current');assert.equal(f.clicks,0);});
test('risk becoming unsafe during beforeDispatch prevents control click and never falls back to href',async()=>{let f;f=fixture({beforeDispatch:()=>f.setRisk({state:'unknown',flags:['upload']})});const p=f.plan(),dto=f.command(p);assert.equal((await f.actions.dispatchNative(dto)).reason,'stale-navigation-plan');assert.equal((await f.actions.dispatchNative(dto)).reason,'action-already-used');assert.equal(f.clicks,0);});

test('synchronous native dispatch hook sees exact verified node and immutable owner plan just before click',async()=>{
 const order=[];let f,event;f=fixture({authorize:()=>{order.push('authorize');return true;},beforeDispatch:()=>order.push('release'),onNativeDispatch:value=>{event=value;order.push('hook');assert.equal(f.clicks,0);queueMicrotask(()=>order.push('microtask'));},click:()=>order.push('click')});
 const plan=f.plan(),command=f.command(plan);assert.equal((await f.actions.dispatchNative(command)).state,'dispatched');
 assert.equal(event.node,f.node);assert.equal(event.plan,plan);assert.deepEqual(event.command,command);assert.equal(event.actionId,command.actionId);assert.equal(event.originalURL,'https://chatgpt.com/c/'+C);assert.ok(Object.isFrozen(event)&&Object.isFrozen(event.command)&&Object.isFrozen(event.plan));assert.deepEqual(order,['authorize','release','authorize','hook','click','microtask']);
 assert.equal((await f.actions.dispatchNative(command)).reason,'action-already-used');
});
test('hook failure or async hook cannot click or replay',async()=>{
 for(const hook of [()=>{throw Error('hook-failed');},()=>Promise.reject(Error('async-hook'))]){const f=fixture({onNativeDispatch:hook}),command=f.command(f.plan());assert.equal((await f.actions.dispatchNative(command)).state,'unconfirmed');assert.equal(f.clicks,0);assert.equal((await f.actions.dispatchNative(command)).reason,'action-already-used');}
});
test('hook is absent from href, already-current, unauthorized and stale dispatch paths',async()=>{
 for(const mode of ['href','same','unauthorized','stale']){let calls=0;const f=fixture({onNativeDispatch:()=>calls++});if(mode==='same')f.setProof({conversationId:C,bodyProofId:'proof'});const plan=f.plan(mode==='href'?f.target(D,null):mode==='same'?f.target(C):f.target());if(mode==='unauthorized')f.revoke();if(mode==='stale')f.detach();await f.actions.dispatchNative(f.command(plan));assert.equal(calls,0);assert.equal(f.clicks,0);}
});
test('hook cannot leave a detached node eligible for click',async()=>{let f;f=fixture({onNativeDispatch:()=>f.detach()});assert.equal((await f.actions.dispatchNative(f.command(f.plan()))).state,'blocked');assert.equal(f.clicks,0);});

test('synchronous hook risk or route changes revoke dispatch before click',async()=>{
 for(const mode of ['risk','route']){let f;f=fixture({onNativeDispatch:()=>mode==='risk'?f.setRisk({state:'unsaved',flags:['composer']}):f.setURL('https://chatgpt.com/')});const command=f.command(f.plan());assert.equal((await f.actions.dispatchNative(command)).reason,'stale-navigation-plan');assert.equal(f.clicks,0);assert.equal((await f.actions.dispatchNative(command)).reason,'action-already-used');}
});

test('cancel hook receives identical issued event exactly once for every post-hook failure',async()=>{
 for(const mode of ['hook','async','invalid','click']){let f,event,cancelled=[];f=fixture({onNativeDispatch:value=>{event=value;if(mode==='hook')throw Error('hook');if(mode==='async')return Promise.reject(Error('async'));if(mode==='invalid')f.detach();},onNativeDispatchCancelled:value=>{cancelled.push(value);throw Error('cleanup');},click:()=>{if(mode==='click')throw Error('click');}});const command=f.command(f.plan()),result=await f.actions.dispatchNative(command);assert.equal(result.state,mode==='invalid'?'blocked':'unconfirmed');assert.deepEqual(cancelled,[event]);assert.equal((await f.actions.dispatchNative(command)).reason,'action-already-used');assert.equal(cancelled.length,1);assert.equal(f.clicks,mode==='click'?1:0);}
});
test('successful native click and failures before dispatch hook never cancel',async()=>{
 for(const deny of [false,true]){let hooks=0,cancels=0;const f=fixture({onNativeDispatch:()=>hooks++,onNativeDispatchCancelled:()=>cancels++});if(deny)f.revoke();await f.actions.dispatchNative(f.command(f.plan()));assert.equal(hooks,deny?0:1);assert.equal(cancels,0);}
});

for(const stage of ['authorize-first','authorize-second','beforeDispatch','hook'])for(const elapsed of [5999,6000])test(`dispatch original six-second deadline at ${stage}: ${elapsed} ms`,async()=>{
 let f,authorizations=0,event=null;const cancelled=[];
 f=fixture({authorize:async()=>{authorizations++;if(stage===(authorizations===1?'authorize-first':'authorize-second'))f.advance(elapsed);return true;},beforeDispatch:async()=>{if(stage==='beforeDispatch')f.advance(elapsed);},onNativeDispatch:value=>{event=value;if(stage==='hook')f.advance(elapsed);},onNativeDispatchCancelled:value=>cancelled.push(value)});
 const command=f.command(f.plan()),result=await f.actions.dispatchNative(command);
 assert.equal(result.state,elapsed===5999?'dispatched':'blocked');assert.equal(f.clicks,elapsed===5999?1:0);
 if(stage==='beforeDispatch'&&elapsed===6000)assert.equal(authorizations,1,'expired release must not request another authorization');
 assert.deepEqual(cancelled,elapsed===6000&&stage==='hook'?[event]:[]);
 assert.equal((await f.actions.dispatchNative(command)).reason,'action-already-used');assert.equal(cancelled.length,elapsed===6000&&stage==='hook'?1:0);
});

test('dispatch deadline is cumulative across release and both authorization awaits',async()=>{
 let f,calls=0,hooks=0;f=fixture({authorize:async()=>{calls++;f.advance(2000);return true;},beforeDispatch:async()=>f.advance(2000),onNativeDispatch:()=>hooks++});const command=f.command(f.plan());
 assert.equal((await f.actions.dispatchNative(command)).state,'blocked');assert.equal(calls,2);assert.equal(f.clicks,0);assert.equal(hooks,0);assert.equal((await f.actions.dispatchNative(command)).reason,'action-already-used');
});

for(const value of [-1,NaN,Infinity,-Infinity])test('invalid or backwards plan-age clock revokes issued plan: '+String(value),async()=>{
 const f=fixture(),command=f.command(f.plan());f.clock(value);assert.equal((await f.actions.dispatchNative(command)).state,'blocked');assert.equal(f.clicks,0);f.clock(1);assert.equal((await f.actions.dispatchNative(command)).reason,'action-already-used');
});

for(const value of [NaN,Infinity,-Infinity])test('nonfinite plan issuance cannot mint usable certificate: '+String(value),()=>{
 const f=fixture();f.clock(value);const plan=f.plan();assert.equal(plan.mode,'unavailable');assert.equal(f.actions.planKey(plan),null);assert.equal(f.clicks,0);
});

for(const elapsed of [29999,30000])test('plan lifetime remains independently bounded at '+elapsed+' ms',async()=>{
 const f=fixture(),command=f.command(f.plan());f.advance(elapsed);assert.equal((await f.actions.dispatchNative(command)).state,elapsed===29999?'dispatched':'blocked');assert.equal(f.clicks,elapsed===29999?1:0);
});

for(const value of [999,NaN,Infinity])test('dispatch backwards/nonfinite time after hook cancels exactly once: '+String(value),async()=>{
 let f,event;const cancelled=[];f=fixture({onNativeDispatch:dispatchEvent=>{event=dispatchEvent;f.clock(value);},onNativeDispatchCancelled:value=>cancelled.push(value)});const plan=f.plan();f.clock(1000);const command=f.command(plan);
 assert.equal((await f.actions.dispatchNative(command)).state,'blocked');assert.equal(f.clicks,0);assert.deepEqual(cancelled,[event]);f.clock(1001);assert.equal((await f.actions.dispatchNative(command)).reason,'action-already-used');assert.equal(cancelled.length,1);
});

test('planning a 17-row inventory probes only the current conversation and revalidates at dispatch',async()=>{
 let probes=0,proof={conversationId:C,bodyProofId:'fresh'};
 const actions=createNativeActions({discovery:{getNode:()=>null},urlPolicy:createURLPolicy(),currentURL:()=> 'https://chatgpt.com/c/'+C,inputRisk:()=>({state:'unknown',flags:[]}),bodyProof:()=>{probes++;return proof;},authorize:()=>true});
 const target=nativeId=>({kind:'resolved',entity:'conversation',nativeId,navigationURL:'https://chatgpt.com/c/'+nativeId,liveHandle:null});
 for(let i=0;i<16;i++){const other=String(i).padStart(8,'0')+'-bbbb-4ccc-8ddd-eeeeeeeeeeee';assert.equal(actions.planNavigation(target(other)).mode,'href');}
 assert.equal(probes,0);const current=actions.planNavigation(target(C));assert.equal(current.mode,'same-target');assert.equal(probes,1);
 proof=null;assert.equal((await actions.dispatchNative({actionId:'a',uiGrantId:'g',mountId:'m',targetKey:actions.planKey(current),planRevision:current.planRevision})).reason,'stale-navigation-plan');assert.equal(probes,2);
});


test('native presentation release spans final authorization and runs once on success or rejection',async()=>{
 for(const ending of ['click','deny','detach','throw']){
  let f,held=false,releases=0,auths=0;
  f=fixture({beforeDispatch:()=>{held=true;return ()=>{held=false;releases++;};},authorize:()=>{if(++auths===2){assert.equal(held,true);if(ending==='deny')return false;if(ending==='detach')f.detach();if(ending==='throw')throw Error('authority unavailable');}return true;},click:()=>assert.equal(held,true)});
  const result=await f.actions.dispatchNative(f.command(f.plan()));
  assert.equal(result.state,ending==='click'?'dispatched':ending==='throw'?'unconfirmed':'blocked');
  assert.equal(releases,1);assert.equal(held,false);assert.equal(f.clicks,ending==='click'?1:0);
 }
});
