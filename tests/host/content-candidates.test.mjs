import test from 'node:test';import assert from 'node:assert/strict';
import {createContentCandidates} from '../../src/host/content-candidates.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){let time=1000,live=true,reading=true,serial=0,read=null,dispatch=null;const calls=[],issued=new WeakMap();let proposals=[];const adapter={readLoaded:async()=>read?read():proposals,planNavigation:target=>{const plan={mode:'native-control',planRevision:++serial};issued.set(plan,'key'+serial);return plan;},planKey:plan=>issued.get(plan),dispatchNative:async command=>{calls.push(command);assert.equal(owner.authorize(command),true);owner.beforeDispatch();return dispatch?dispatch(command):{state:'dispatched'};}};const owner=createContentCandidates({adapter,current:()=>live,showReading:()=>reading,now:()=>time});const project=(key='r1',name='Same')=>({entity:'project',renderKey:key,nativeTitle:name,titleState:'observed',target:{kind:'live-control',control:{id:key}}});const setRows=rows=>{proposals=[{kind:'surface-delta',payload:{candidates:rows}}];};setRows([project()]);const dto=row=>({candidate:{...row},actionId:'action1',uiGrantId:'grant1',mountId:'mount1',expiresAt:new Date(time+6000).toISOString()});return {owner,adapter,calls,project,setRows,dto,clock:n=>{time=n;},invalidate:()=>{live=false;},reading:v=>{reading=v;},read:f=>{read=f;},dispatch:f=>{dispatch=f;}};}
test('only previously issued local candidate can activate; names do not choose controls',async()=>{const f=fixture();assert.deepEqual(await f.owner.activate(f.dto({renderKey:'r1',targetKey:'key1',planRevision:1})),{state:'blocked'});f.setRows([f.project('a'),f.project('b')]);const rows=await f.owner.list();assert.equal(rows.length,2);assert.equal(rows[0].nativeTitle,rows[1].nativeTitle);assert.notEqual(rows[0].targetKey,rows[1].targetKey);assert.equal((await f.owner.activate(f.dto(rows[1]))).state,'dispatched');assert.equal(f.calls[0].targetKey,rows[1].targetKey);f.owner.stop();});
test('two frames listing the same render key retain both issued target plans',async()=>{const f=fixture(),first=(await f.owner.list())[0],second=(await f.owner.list())[0];assert.notEqual(first.targetKey,second.targetKey);assert.equal((await f.owner.activate(f.dto(first))).state,'dispatched');assert.equal((await f.owner.activate({...f.dto(second),actionId:'action2'})).state,'dispatched');});
test('empty and non-project proposals do not mint actionable entries',async()=>{const f=fixture();f.setRows([]);assert.deepEqual(await f.owner.list(),[]);f.setRows([{...f.project(),entity:'conversation'},{...f.project(),target:{kind:'resolved'}}]);assert.deepEqual(await f.owner.list(),[]);});
test('activation rejects forged fields, mismatched identity and expired or overlong deadlines',async()=>{const f=fixture(),row=(await f.owner.list())[0],base=f.dto(row);for(const patch of [{extra:true},{expiresAt:new Date(1000).toISOString()},{expiresAt:new Date(7001).toISOString()},{expiresAt:'bad'},{actionId:''},{candidate:{...base.candidate,targetKey:'fake'}},{candidate:{...base.candidate,renderKey:'fake'}},{candidate:{...base.candidate,planRevision:99}},{candidate:{...base.candidate,extra:true}}])assert.equal((await f.owner.activate({...base,...patch})).state,'blocked',JSON.stringify(patch));assert.equal(f.calls.length,0);});
test('authorize requires exact command and only its active six-second attempt',async()=>{const f=fixture(),row=(await f.owner.list())[0];let inside;f.dispatch(command=>{inside=command;assert.equal(f.owner.authorize({...command,extra:true}),false);assert.equal(f.owner.authorize({...command,actionId:'other'}),false);f.clock(7000);assert.equal(f.owner.authorize(command),false);return {state:'unconfirmed'};});assert.equal(f.owner.authorize({}),false);await f.owner.activate(f.dto(row));assert.equal(f.calls.length,1);assert.equal(f.owner.authorize(inside),false);});
test('pending dispatch is single-flight, stop or lost current cancels authorization',async()=>{for(const change of ['stop','route']){const f=fixture(),row=(await f.owner.list())[0],held=deferred();f.dispatch(()=>held.promise);const pending=f.owner.activate(f.dto(row));assert.equal((await f.owner.activate({...f.dto(row),actionId:'other'})).state,'blocked');const cmd=f.calls[0];if(change==='stop')f.owner.stop();else f.invalidate();assert.equal(f.owner.authorize(cmd),false);assert.throws(()=>f.owner.beforeDispatch(),/unavailable/);held.resolve({state:'unconfirmed'});await pending;assert.equal(f.calls.length,1);}});
test('failed native reading or dispatch does not retry or invent fallback',async()=>{for(const mode of ['reading','dispatch']){const f=fixture(),row=(await f.owner.list())[0];if(mode==='reading')f.reading(false);else f.dispatch(()=>{throw Error('lost-ack');});await assert.rejects(f.owner.activate(f.dto(row)));assert.equal(f.calls.length,1);assert.equal(f.owner.authorize(f.calls[0]),false);}});
test('late list after route invalidation or stop cannot issue plans',async()=>{for(const stop of [false,true]){const f=fixture(),held=deferred();f.read(()=>held.promise);const pending=f.owner.list();if(stop)f.owner.stop();else f.invalidate();held.resolve([{kind:'surface-delta',payload:{candidates:[f.project()]}}]);await assert.rejects(pending,/stale-content/);assert.equal(f.calls.length,0);}});

test('issued plan ledger is bounded to 256 without replacing same-render-key siblings prematurely',async()=>{const f=fixture(),first=(await f.owner.list())[0];let last;for(let i=0;i<256;i++)last=(await f.owner.list())[0];assert.equal((await f.owner.activate(f.dto(first))).state,'blocked');assert.equal((await f.owner.activate(f.dto(last))).state,'dispatched');});
test('unavailable plans remain displayable but never authorize activation',async()=>{const f=fixture();f.adapter.planNavigation=()=>({mode:'unavailable',reason:'input-risk-unresolved'});const row=(await f.owner.list())[0];assert.equal(row.available,false);assert.equal(row.targetKey,null);assert.equal((await f.owner.activate(f.dto(row))).state,'blocked');assert.equal(f.calls.length,0);});

for(const total of [33,65,256])test(`pagination reaches all ${total} same-name controls in native order and issues only page plans`,async()=>{
 const f=fixture();f.setRows(Array.from({length:total},(_,i)=>f.project(`r${i}`,'Same')));
 let issued=0;const original=f.adapter.planNavigation;f.adapter.planNavigation=target=>{issued++;return original(target);};
 const seen=[];let offset=0;do{const page=await f.owner.listPage(offset);assert.equal(page.total,total);assert.equal(page.offset,offset);assert.equal(page.items.length,Math.min(32,total-offset));assert.equal(issued,seen.length+page.items.length);seen.push(...page.items.map(row=>row.renderKey));offset=page.nextOffset;}while(offset!==null);
 assert.deepEqual(seen,Array.from({length:total},(_,i)=>`r${i}`));
 const last=await f.owner.listPage(224),expected=Math.floor((total-1)/32)*32;assert.equal(last.offset,expected);assert.equal(last.nextOffset,null);assert.equal(last.items.at(-1).renderKey,`r${total-1}`);
});
test('fresh shrinking inventory clamps page offset and empty inventory returns page zero',async()=>{
 const f=fixture();f.setRows(Array.from({length:256},(_,i)=>f.project(`r${i}`)));assert.equal((await f.owner.listPage(224)).offset,224);
 f.setRows(Array.from({length:33},(_,i)=>f.project(`r${i}`)));assert.deepEqual((await f.owner.listPage(224)).items.map(row=>row.renderKey),['r32']);
 f.setRows([]);assert.deepEqual(await f.owner.listPage(224),{items:[],total:0,offset:0,nextOffset:null});
});
test('offset validation precedes adapter reads',async()=>{
 const f=fixture();let reads=0;f.read(()=>{reads++;return [];});
 for(const offset of [-32,1,31,33,225,256,1.5,NaN,Infinity,null,'32',{},true])await assert.rejects(f.owner.listPage(offset),/invalid-candidate-offset/);
 assert.equal(reads,0);assert.deepEqual(await f.owner.listPage(),{items:[],total:0,offset:0,nextOffset:null});
});
test('duplicate render keys or oversized inventory reject before any page plans are minted',async()=>{
 for(const mode of ['duplicate','oversized']){const f=fixture();let plans=0;f.adapter.planNavigation=()=>{plans++;throw Error('should-not-plan');};
 const rows=Array.from({length:mode==='oversized'?257:65},(_,i)=>f.project(`r${i}`));if(mode==='duplicate')rows[64]=f.project('r0');f.setRows(rows);
 await assert.rejects(f.owner.listPage(0),/invalid-content-candidates/);assert.equal(plans,0);}
});
test('duplicate keys across surface proposals reject and non-controls do not affect total',async()=>{
 const f=fixture();f.read(()=>[{kind:'surface-delta',payload:{candidates:[f.project('a')]}},{kind:'surface-delta',payload:{candidates:[f.project('a')]}}]);await assert.rejects(f.owner.listPage(),/invalid-content-candidates/);
 f.read(()=>[{kind:'surface-delta',payload:{candidates:[{...f.project('a'),entity:'conversation'},f.project('b'),{...f.project('b'),target:{kind:'resolved'}}]}}]);const page=await f.owner.listPage();assert.equal(page.total,1);assert.deepEqual(page.items.map(row=>row.renderKey),['b']);
});
test('dual-frame different pages retain old issued plans without authorizing unissued or stale targets',async()=>{
 const f=fixture();f.setRows(Array.from({length:65},(_,i)=>f.project(`r${i}`)));const first=await f.owner.listPage(),tail=await f.owner.listPage(64);
 assert.equal((await f.owner.activate(f.dto(first.items[0]))).state,'dispatched');assert.equal((await f.owner.activate({...f.dto(tail.items[0]),actionId:'tailAction'})).state,'dispatched');
 assert.equal((await f.owner.activate(f.dto({...tail.items[0],renderKey:'r33'}))).state,'blocked');
 f.invalidate();assert.equal((await f.owner.activate(f.dto(first.items[0]))).state,'blocked');await assert.rejects(f.owner.listPage(32),/stale-content/);
});

test('257 observed candidates still reject when one candidate is already upgraded',async()=>{
 let plans=0;const rows=Array.from({length:257},(_,i)=>({entity:'project',renderKey:`r${i}`,target:{kind:'live-control'}}));const owner=createContentCandidates({adapter:{readLoaded:async()=>[{kind:'surface-delta',payload:{candidates:rows}}],planNavigation:()=>{plans++;throw Error('must-not-mint');}},current:()=>true,showReading:()=>true,isUpgraded:r=>r.renderKey==='r0'});await assert.rejects(owner.listPage(),/invalid-content-candidates/);assert.equal(plans,0);owner.stop();
});

for(const role of ['workspace','sidebar'])test('active '+role+' display is copied and available only for exact authorized command',async()=>{
 const f=fixture(),row=(await f.owner.list())[0],display={role,presentation:{offset:32,scrollTop:127,focused:true}},held=deferred();let command,stored;
 f.dispatch(c=>{command=c;stored=f.owner.displayFor(c);assert.deepEqual(stored,display);assert.ok(Object.isFrozen(stored)&&Object.isFrozen(stored.presentation));assert.deepEqual(Object.keys(c).sort(),['actionId','mountId','planRevision','targetKey','uiGrantId']);return held.promise;});
 assert.equal(f.owner.displayFor({}),null);const pending=f.owner.activate({...f.dto(row),display});display.presentation.scrollTop=999;display.role='other';assert.equal(stored.presentation.scrollTop,127);assert.equal(f.owner.displayFor({...command,actionId:'wrong'}),null);assert.equal(f.owner.displayFor({...command,display:stored}),null);held.resolve({state:'dispatched'});await pending;assert.equal(f.owner.displayFor(command),null);
});
test('legacy activation has no display; expiry and stop revoke active display',async()=>{
 for(const mode of ['legacy','expiry','stop']){const f=fixture(),row=(await f.owner.list())[0],held=deferred();let command;f.dispatch(c=>{command=c;return held.promise;});const pending=f.owner.activate({...f.dto(row),...(mode==='legacy'?{}:{display:{role:'workspace',presentation:{offset:0,scrollTop:0,focused:false}}})});if(mode==='expiry')f.clock(7000);if(mode==='stop')f.owner.stop();assert.equal(f.owner.displayFor(command),null);held.resolve({state:'unconfirmed'});await pending;}
});
test('invalid optional display fails before dispatch without changing legacy command contract',async()=>{
 const f=fixture(),row=(await f.owner.list())[0],p={offset:0,scrollTop:0,focused:false};for(const display of [null,{}, {role:'other',presentation:p},{role:'workspace',presentation:p,scope:'fake'},{role:'workspace',presentation:{...p,offset:1}},{role:'workspace',presentation:{...p,scrollTop:-1}},{role:'workspace',presentation:{...p,focused:'yes'}},{role:'workspace',presentation:{...p,title:'private'}}])assert.equal((await f.owner.activate({...f.dto(row),display})).state,'blocked');assert.equal(f.calls.length,0);
});
