import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostSendCandidates} from '../../src/runtime/host-send-candidates.mjs';
import {parseConversationMetadata} from '../../src/host/conversation-metadata.mjs';
// L owner composition: reader/authority doubles; no network-budget or persistence claim.
function metadata(count=1){const mapping={};for(let i=1;i<=count;i++)mapping['n'+i]={id:'n'+i,parent:i===1?null:'n'+(i-1),message:{id:'m'+i,author:{role:'user',id:'self'}}};return parseConversationMetadata({conversationId:'C',principalId:'self',payload:JSON.stringify({id:'C',mapping})});}
function fixture(){
 let time=1000,proof='p1',valid=true,failure=true,count=1,hold=null;const reads=[],outputs=[];
 const state={scope:{key:'scope'},documentToken:'doc',producerToken:'producer',routeEpoch:1,bodyEpoch:1,conversationId:'C'};
 const observations={isCurrentProof:p=>valid&&p===proof,isCurrentProducer:p=>valid&&p===state.producerToken,async withCurrent(p,work){if(!valid||p!==proof)throw Error('stale-proof');const controller=new AbortController(),signature=JSON.stringify(state),guard=()=>valid&&p===proof&&signature===JSON.stringify(state)&&!controller.signal.aborted;try{const result=await work({...state,scope:{...state.scope},signal:controller.signal,guard});if(!guard())throw Error('stale-proof');return result;}finally{controller.abort();}}};
 const owner=createHostSendCandidates({enabled:true,observations,now:()=>time,onCandidate:c=>outputs.push(c),reader:{async read(p){reads.push({proof:p,time});if(hold)await hold;if(failure)throw Error('reader-transport-failure');const data=metadata(count);return {state:data.state,conversationId:'C',bodyEpoch:state.bodyEpoch,metadata:data};}}});
 return {owner,reads,outputs,state,observe:()=>owner.observe(proof),intent:id=>owner.intent(proof,{intentId:id,kind:'send',isComposing:false}),setTime:v=>time=v,setFailure:v=>failure=v,setCount:v=>count=v,next(){proof='p'+(Number(proof.slice(1))+1);},revoke(){valid=false;},hold(){let release;hold=new Promise(r=>release=r);return ()=>{hold=null;release();};}};
}
const attempt=f=>f.observe().catch(error=>{assert.match(error.message,/reader-transport-failure/);return null;});
test('reader rejection preserves same-proof one-second cooldown',async t=>{
 const f=fixture();t.after(()=>f.owner.stop());await assert.rejects(f.observe(),/reader-transport-failure/);
 for(let i=0;i<5;i++)await attempt(f);assert.equal(f.reads.length,1,'a thrown read must not reset cooldown');
 f.setTime(1999);await attempt(f);assert.equal(f.reads.length,1);f.setTime(2000);await attempt(f);assert.equal(f.reads.length,2);
 assert.equal(await f.intent('no_baseline'),null);assert.deepEqual(f.outputs,[]);
});
test('three thrown reads exhaust the same proof while a genuinely new proof has its own budget',async t=>{
 const f=fixture();t.after(()=>f.owner.stop());for(const time of [1000,2000,3000]){f.setTime(time);await attempt(f);}assert.equal(f.reads.length,3);
 for(const time of [4000,5000,6000]){f.setTime(time);await attempt(f);}assert.equal(f.reads.length,3,'exceptions cannot replenish the three-attempt budget');
 f.setFailure(false);f.next();assert.deepEqual(await f.observe(),[]);assert.equal(f.reads.length,4);assert.equal((await f.intent('fresh')).stage,'intent');
});
test('failed append retires prior baseline and intent; later complete read establishes only a fresh baseline',async t=>{
 const f=fixture();t.after(()=>f.owner.stop());f.setFailure(false);await f.observe();assert.equal((await f.intent('old_intent')).stage,'intent');
 f.next();f.setCount(2);f.setFailure(true);await assert.rejects(f.observe(),/reader-transport-failure/);assert.equal(await f.intent('during_failure'),null);
 f.setFailure(false);f.setTime(2000);assert.deepEqual(await f.observe(),[]);assert.deepEqual(f.outputs,[],'old intent cannot attach to postfailure metadata');
 assert.equal((await f.intent('new_intent')).stage,'intent');f.next();f.setCount(3);const candidates=await f.observe();assert.equal(candidates.length,1);assert.equal(candidates[0].intentId,'new_intent');assert.equal(candidates[0].messageId,'m3');
});
test('concurrent retry after failure stays singleflight and revoked completion grants no baseline',async t=>{
 const f=fixture();t.after(()=>f.owner.stop());await attempt(f);f.setTime(2000);f.setFailure(false);const release=f.hold(),a=f.observe(),b=f.observe();assert.equal(a,b);const rejected=assert.rejects(a,/stale/);
 for(let i=0;i<10;i++)await Promise.resolve();assert.equal(f.reads.length,2);f.revoke();release();await rejected;assert.deepEqual(f.outputs,[]);await assert.rejects(f.intent('late'),/stale/);
});
test('reader failure cannot erase used intent IDs when the same binding later establishes a fresh baseline',async t=>{
 const f=fixture();t.after(()=>f.owner.stop());f.setFailure(false);await f.observe();assert.equal((await f.intent('already_used')).stage,'intent');
 f.next();f.setCount(2);f.setFailure(true);await assert.rejects(f.observe(),/reader-transport-failure/);
 f.setTime(2000);f.setFailure(false);assert.deepEqual(await f.observe(),[]);
 assert.equal(await f.intent('already_used'),null,'failure clears pending correlation but must retain replay ledger');
 assert.equal((await f.intent('genuinely_new')).stage,'intent');f.next();f.setCount(3);const result=await f.observe();assert.equal(result.length,1);assert.equal(result[0].intentId,'genuinely_new');assert.equal(result[0].messageId,'m3');
});
for(const trigger of ['intent','observation','idle','pendingIntent','settle'])for(const signature of ['producerToken','bodyEpoch'])test('clock rollback via '+trigger+' seals only the old binding until real '+signature+' changes',async t=>{
 const f=fixture();t.after(()=>f.owner.stop());f.setFailure(false);await f.observe();assert.equal((await f.intent('used_before_clock_failure')).stage,'intent');assert.equal(f.owner.isIdle(),false);
 f.setTime(999);
 if(trigger==='intent')await assert.rejects(f.intent('during_rollback'),/send-clock-invalid/);
 else if(trigger==='observation'){f.next();await assert.rejects(f.observe(),/send-clock-invalid/);}
 else if(trigger==='idle')assert.equal(f.owner.isIdle(),true,'idle detects invalid clock and seals lost binding');
 else if(trigger==='pendingIntent')await assert.rejects(f.owner.pendingIntent('p1','used_before_clock_failure'),/send-clock-invalid/);
 else await assert.rejects(f.owner.settle('p1',{intentId:'used_before_clock_failure',stage:'failed'}),/send-clock-invalid/);
 assert.equal(f.owner.isIdle(),true,'sealed causal state must not permanently block local idle');
 const reads=f.reads.length;f.setTime(5000);
 assert.equal(await f.intent('used_before_clock_failure'),null);assert.equal(await f.intent('new_but_old_binding'),null);
 await f.observe();f.next();await f.observe();
 assert.equal(f.reads.length,reads,'clock recovery and fresh proof alone cannot revive sealed binding');
 assert.equal(await f.intent('used_before_clock_failure'),null);assert.deepEqual(f.outputs,[]);assert.equal(f.owner.isIdle(),true);
 if(signature==='producerToken')f.state.producerToken='genuinely_new_producer';else f.state.bodyEpoch++;
 assert.deepEqual(await f.observe(),[],'real signature change creates an independent baseline');assert.equal(f.reads.length,reads+1);
 assert.equal((await f.intent('fresh_after_binding_change')).stage,'intent');f.next();f.setCount(2);
 const result=await f.observe();assert.equal(result.length,1);assert.equal(result[0].intentId,'fresh_after_binding_change');assert.equal(result[0].messageId,'m2');
});
