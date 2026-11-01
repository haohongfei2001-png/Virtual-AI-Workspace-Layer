import test from 'node:test';
import assert from 'node:assert/strict';
import {createContentCandidates} from '../../src/host/content-candidates.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const row=i=>({entity:'project',renderKey:`r${i}`,nativeTitle:`Project ${i}`,titleState:'observed',target:{kind:'live-control',control:{id:`r${i}`,documentToken:'doc',routeEpoch:0,regionEpoch:0,controlKind:'project'}}});
const packet=rows=>({kind:'surface-delta',payload:{candidates:rows}});
function fixture({count=4096,stream=null,streaming=true,failRetain=false,planThrows=false,transaction=null}={}){
 let time=1000,reads=0,plans=0,commits=0,begins=0;const base=new Map(),leases=new Map(),retains=[],releases=[],planned=[],keys=new WeakMap();
 const remember=rows=>{for(const r of rows){base.set(r.target.control.id,r.target.control);while(base.size>2048)base.delete(base.keys().next().value);}};
 const adapter={async *loadedPages(){reads++;const source=stream?stream(reads):(async function*(){for(let start=0;start<count;start+=256)yield packet(Array.from({length:Math.min(256,count-start)},(_,i)=>row(start+i)));})();for await(const p of source){remember(p.payload.candidates);yield p;}},retainLoadedHandles(owner,handles,deadline){assert(handles.length<=(transaction?98:64));assert.equal(new Set(handles.map(h=>h.id)).size,handles.length);retains.push({owner,ids:handles.map(h=>h.id),deadline});if(failRetain)return false;leases.set(owner,{ids:new Set(handles.map(h=>h.id)),deadline});return true;},releaseLoadedHandles(owner){releases.push(owner);leases.delete(owner);},planNavigation(target){const id=target.control.id;planned.push(id);if(planThrows)throw Error('plan-failed');const retained=[...leases.values()].some(l=>l.deadline>time&&l.ids.has(id));const plan={mode:base.has(id)||retained?'native-control':'unavailable',planRevision:++plans};keys.set(plan,`p${plans}`);return plan;},planKey:p=>keys.get(p)};
 const owner=createContentCandidates({adapter,current:()=>true,showReading:()=>true,streaming,elapsedNow:()=>time,beginScan:streaming?()=>{begins++;const custom=transaction?.({has:id=>base.has(id)||[...leases.values()].some(l=>l.deadline>time&&l.ids.has(id))});return {...(custom??{visit:()=>false}),commit:()=>{custom?.commit?.();commits++;}};}:null});
 return {owner,adapter,leases,retains,releases,planned,clock:n=>time=n,counts:()=>({reads,plans,commits,begins})};
}
test('first page remains available after discovery evicts more than 2048 ordinary handles',async()=>{
 const f=fixture();const page=await f.owner.listPage(0);assert.equal(page.total,4096);assert.deepEqual(page.items.map(r=>r.renderKey),Array.from({length:32},(_,i)=>`r${i}`));assert(page.items.every(r=>r.available));assert(f.retains.length>1);assert(f.retains.every(r=>r.deadline===7000));assert(f.retains.at(-1).ids.includes('r0'));assert(f.retains.at(-1).ids.includes('r4095'));assert.equal(f.leases.size,0);assert.equal(f.releases.length,1);assert.equal(f.counts().commits,1);
});
for(const offset of [4064,999999968])test(`tail page and clamped offset ${offset} retain exactly required final rows`,async()=>{
 const f=fixture();const page=await f.owner.listPage(offset);assert.equal(page.offset,4064);assert.equal(page.nextOffset,null);assert.equal(page.items.length,32);assert(page.items.every(r=>r.available));assert.deepEqual(f.planned,Array.from({length:32},(_,i)=>`r${4064+i}`));assert.equal(f.retains.at(-1).ids.length,32);assert.equal(f.leases.size,0);
});
test('shared same-offset scan keeps handles until every consumer has issued its own plans',async()=>{
 const f=fixture(),[a,b]=await Promise.all([f.owner.listPage(0),f.owner.listPage(0)]);assert.equal(f.counts().reads,1);assert(a.items.every(r=>r.available));assert(b.items.every(r=>r.available));assert.notEqual(a.items[0].targetKey,b.items[0].targetKey);assert.equal(f.leases.size,0);
});
for(const failure of ['scan','timeout','stop','capacity','plan'])test(`candidate ${failure} releases its bounded lease`,async()=>{
 const entered=deferred(),resume=deferred();const f=fixture({failRetain:failure==='capacity',planThrows:failure==='plan',stream:async function*(){yield packet(Array.from({length:256},(_,i)=>row(i)));entered.resolve();await resume.promise;if(failure==='scan')throw Error('scan-failed');yield packet([row(256)]);}});
 const pending=f.owner.listPage(),rejected=assert.rejects(pending);if(failure==='capacity'){await rejected;}else{await entered.promise;assert.equal(f.leases.size,1);if(failure==='timeout')f.clock(7000);if(failure==='stop')f.owner.stop();resume.resolve();await rejected;}
 assert.equal(f.leases.size,0);assert.equal(f.releases.length,1);assert.equal(f.counts().commits,failure==='plan'?1:0);if(failure!=='plan')assert.equal(f.counts().plans,0);
});
test('queued page retention uses request-start deadline and does not renew at dequeue',async()=>{
 const first=deferred(),resumeFirst=deferred(),second=deferred(),resumeSecond=deferred();const f=fixture({stream:async function*(read){yield packet([row(0)]);if(read===1){first.resolve();await resumeFirst.promise;}else{second.resolve();await resumeSecond.promise;}}});
 const a=f.owner.listPage(0),b=f.owner.listPage(32),rejected=assert.rejects(b,/stale-content-candidates/);await first.promise;f.clock(6999);resumeFirst.resolve();await a;await second.promise;assert(f.retains.every(r=>r.deadline===7000));f.clock(7000);resumeSecond.resolve();await rejected;assert.equal(f.leases.size,0);assert.equal(f.releases.length,2);assert.equal(f.counts().commits,1);
});
test('legacy nonstream candidate path remains compatible without lease calls',async()=>{
 const f=fixture({streaming:false,count:64});const page=await f.owner.listPage(32);assert.equal(page.items.length,32);assert(page.items.every(r=>r.available));assert.equal(page.offset,32);assert.deepEqual(f.retains,[]);assert.deepEqual(f.releases,[]);assert.equal(f.counts().begins,0);
});
test('stop immediately releases a paused scan lease and resumed cleanup cannot release twice',async()=>{
 const entered=deferred(),resume=deferred();const f=fixture({stream:async function*(){yield packet(Array.from({length:256},(_,i)=>row(i)));entered.resolve();await resume.promise;yield packet([row(256)]);}});
 const pending=f.owner.listPage(),rejected=assert.rejects(pending,/stale-content-candidates/);await entered.promise;assert.equal(f.leases.size,1);assert.equal(f.releases.length,0);
 f.owner.stop();assert.equal(f.leases.size,0,'release is synchronous even while generator remains suspended');assert.equal(f.releases.length,1);assert.equal(f.counts().commits,0);assert.equal(f.counts().plans,0);f.owner.stop();assert.equal(f.releases.length,1);
 resume.resolve();await rejected;assert.equal(f.releases.length,1,'scan finally is idempotent after stop');assert.equal(f.leases.size,0);await assert.rejects(f.owner.listPage(),/stale-content-candidates/);
});

test('excluded identity witnesses remain retained through 4096 handles until identity commit',async()=>{
 let witness=null,checked=false;const f=fixture({transaction:({has})=>({visit:value=>{if(value.renderKey==='r0'){witness=value.target.control;return true;}return false;},retainedHandles:()=>witness?[witness]:[],commit:()=>{assert(witness);assert.equal(has(witness.id),true);checked=true;}})});
 const page=await f.owner.listPage();assert.equal(checked,true);assert.equal(page.total,4095);assert.equal(page.items[0].renderKey,'r1');assert(page.items.every(r=>r.available));assert(f.retains.at(-1).ids.includes('r0'));assert(f.retains.every(r=>r.deadline===7000));assert.equal(f.leases.size,0);assert.equal(f.counts().commits,1);
});
test('identity witness overlapping requested window is retained only once per owner',async()=>{
 let witness=null;const f=fixture({transaction:()=>({visit:value=>{if(value.renderKey==='r0')witness=value.target.control;return false;},retainedHandles:()=>witness?[witness]:[]})});await f.owner.listPage();assert(f.retains.every(r=>r.ids.filter(id=>id==='r0').length===1));assert(f.retains.every(r=>r.ids.length<=64));assert.equal(new Set(f.retains.map(r=>r.owner)).size,1);assert.equal(f.releases.length,1);
});
for(const [name,result] of [['over-capacity',Array.from({length:35},(_,i)=>row(i).target.control)],['null',null],['undefined',undefined],['object',{}],['invalid-handle',[null]],['non-array-iterable',new Set()]])test(`invalid retained identity ${name} fails without commit and releases`,async()=>{
 const f=fixture({transaction:()=>({visit:()=>false,retainedHandles:()=>result})});await assert.rejects(f.owner.listPage());assert.equal(f.counts().commits,0);assert.equal(f.counts().plans,0);assert.equal(f.leases.size,0);assert.equal(f.releases.length,1);
});
test('34 excluded witnesses plus requested and tail windows remain within the 98-handle owner bound',async()=>{
 const witnesses=[];const f=fixture({count:4098,transaction:({has})=>({visit:value=>{if(Number(value.renderKey.slice(1))<34){witnesses.push(value.target.control);return true;}return false;},retainedHandles:()=>witnesses,commit:()=>{assert.equal(witnesses.length,34);assert(witnesses.every(h=>has(h.id)));}})});
 const page=await f.owner.listPage();assert.equal(page.total,4064);assert.equal(page.items[0].renderKey,'r34');assert(page.items.every(r=>r.available));assert.equal(Math.max(...f.retains.map(r=>r.ids.length)),98);assert.equal(f.leases.size,0);assert(f.retains.every(r=>r.deadline===7000));
});
