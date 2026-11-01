import test from 'node:test';
import assert from 'node:assert/strict';
import {createContentCandidates} from '../../src/host/content-candidates.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const row=i=>({entity:'project',renderKey:`r${i}`,nativeTitle:`Project ${i}`,titleState:'observed',target:{kind:'live-control',control:{id:`r${i}`}}});
const packet=candidates=>({kind:'surface-delta',payload:{candidates}});
function fixture({count=65,exclude=()=>false,stream=null}={}){
 let time=1000,elapsed=1000,reads=0,begins=0,commits=0,visits=0,plans=0,maxPacket=0;
 const events=[],keys=new WeakMap();
 const adapter={loadedPages:()=>{const read=++reads;events.push(`read:${read}`);return stream?stream(read): (async function*(){for(let start=0;start<count;start+=256){const rows=Array.from({length:Math.min(256,count-start)},(_,i)=>row(start+i));maxPacket=Math.max(maxPacket,rows.length);yield packet(rows);}})();},planNavigation:()=>{const plan={mode:'native-control',planRevision:++plans};keys.set(plan,`plan${plans}`);return plan;},planKey:plan=>keys.get(plan)};
 const owner=createContentCandidates({adapter,current:()=>true,showReading:()=>true,streaming:true,now:()=>time,elapsedNow:()=>elapsed,beginScan:()=>{const id=++begins;events.push(`begin:${id}`);return {visit:value=>{visits++;return exclude(value);},commit:()=>{commits++;events.push(`commit:${id}`);}};},isUpgraded:()=>{throw Error('streaming must use transaction filter');},onScan:()=>{throw Error('streaming must use transaction commit');}});
 return {owner,events,clock:value=>{time=value;elapsed=value;},wallClock:value=>{time=value;},elapsedClock:value=>{elapsed=value;},counts:()=>({reads,begins,commits,visits,plans,maxPacket})};
}

test('100000 generated rows use bounded packets and filtered pages preserve native order and clamp oversized offset',async()=>{
 const f=fixture({count:100000,exclude:value=>Number(value.renderKey.slice(1))%3===0});
 const expected=Array.from({length:100000},(_,i)=>i).filter(i=>i%3!==0);
 for(const requested of [0,32768,999999968]){
  const page=await f.owner.listPage(requested),offset=Math.min(requested,Math.floor((expected.length-1)/32)*32);
  assert.equal(page.total,expected.length);assert.equal(page.offset,offset);
  assert.deepEqual(page.items.map(value=>value.renderKey),expected.slice(offset,offset+32).map(i=>`r${i}`));
  assert.equal(page.nextOffset,offset+32<expected.length?offset+32:null);
 }
 assert.deepEqual(f.counts(),{reads:3,begins:3,commits:3,visits:300000,plans:74,maxPacket:256});f.owner.stop();
});

test('same offset shares a scan while each frame receives independent plans; different offsets serialize commits',async()=>{
 const entered=deferred(),release=deferred();const f=fixture({stream:async function*(read){yield packet(Array.from({length:65},(_,i)=>row(i)));if(read===1){entered.resolve();await release.promise;}}});
 const first=f.owner.listPage(),same=f.owner.listPage(),tail=f.owner.listPage(64);await entered.promise;
 assert.equal(f.counts().reads,1);assert.equal(f.counts().begins,1);assert.equal(f.counts().commits,0);
 release.resolve();const [a,b,c]=await Promise.all([first,same,tail]);
 assert.deepEqual(a.items.map(v=>v.renderKey),b.items.map(v=>v.renderKey));
 assert(a.items.every((v,i)=>v.targetKey!==b.items[i].targetKey));assert.equal(c.items[0].renderKey,'r64');
 assert.deepEqual(f.events,['begin:1','read:1','commit:1','begin:2','read:2','commit:2']);assert.equal(f.counts().plans,65);f.owner.stop();
});

test('four distinct in-flight offsets are bounded; shared offset does not consume another slot',async()=>{
 const entered=deferred(),release=deferred();const f=fixture({stream:async function*(read){if(read===1){entered.resolve();await release.promise;}yield packet(Array.from({length:129},(_,i)=>row(i)));}});
 const pending=[0,32,64,96].map(offset=>f.owner.listPage(offset)),shared=f.owner.listPage(32);await entered.promise;
 await assert.rejects(f.owner.listPage(128),/candidate-page-capacity/);assert.equal(f.counts().begins,1);
 release.resolve();const pages=await Promise.all([...pending,shared]);assert.equal(f.counts().reads,4);assert.equal(f.counts().commits,4);
 assert.notEqual(pages[1].items[0].targetKey,pages[4].items[0].targetKey);
 assert.equal((await f.owner.listPage(128)).items[0].renderKey,'r128');assert.equal(f.counts().commits,5);f.owner.stop();
});

test('queued page keeps its original six-second deadline instead of renewing on dequeue',async()=>{
 const firstEntered=deferred(),firstRelease=deferred(),secondEntered=deferred(),secondRelease=deferred();
 const f=fixture({stream:async function*(read){yield packet([row(0)]);if(read===1){firstEntered.resolve();await firstRelease.promise;}if(read===2){secondEntered.resolve();await secondRelease.promise;}}});
 const first=f.owner.listPage(),queued=f.owner.listPage(32);const rejection=assert.rejects(queued,/stale-content-candidates/);
 await firstEntered.promise;f.clock(6999);firstRelease.resolve();await first;await secondEntered.promise;
 f.clock(7000);secondRelease.resolve();await rejection;
 assert.equal(f.counts().begins,2);assert.equal(f.counts().commits,1);assert.equal(f.counts().plans,1);
 assert.equal((await f.owner.listPage(32)).total,1,'a new request has a new deadline');f.owner.stop();
});

for(const failure of ['stop','duplicate-tail','nonboolean-visit'])test(`streaming ${failure} never commits partial scan or issues plans`,async()=>{
 const visited=deferred(),release=deferred();
 const f=fixture({exclude:value=>failure==='nonboolean-visit'&&value.renderKey==='r256'?undefined:false,stream:async function*(){yield packet(Array.from({length:256},(_,i)=>row(i)));visited.resolve();await release.promise;yield packet([row(failure==='duplicate-tail'?0:256)]);}});
 const pending=f.owner.listPage(),rejection=assert.rejects(pending,failure==='stop'?/stale-content-candidates/:failure==='duplicate-tail'?/invalid-content-candidates/:/invalid-candidate-scan/);
 await visited.promise;if(failure==='stop')f.owner.stop();release.resolve();await rejection;
 assert.equal(f.counts().commits,0);assert.equal(f.counts().plans,0);assert.equal(f.counts().visits,failure==='nonboolean-visit'?257:256);f.owner.stop();
});

test('empty or fully filtered streaming inventory clamps to zero without creating plans',async()=>{
 for(const count of [0,1000]){const f=fixture({count,exclude:()=>true});assert.deepEqual(await f.owner.listPage(2048),{items:[],total:0,offset:0,nextOffset:null});assert.equal(f.counts().commits,1);assert.equal(f.counts().plans,0);f.owner.stop();}
});

 test('wall clock rollback cannot extend queued monotonic deadline or commit identity',async()=>{
 const entered=deferred(),release=deferred();
 const f=fixture({stream:async function*(){yield packet([row(0)]);entered.resolve();await release.promise;}});
 const first=f.owner.listPage(),queued=f.owner.listPage(32);
 const failures=[first,queued].map(p=>assert.rejects(p,/stale-content-candidates/));
 await entered.promise;f.clock(5000);f.wallClock(2000);f.elapsedClock(7000);release.resolve();await Promise.all(failures);
 assert.equal(f.counts().begins,1);assert.equal(f.counts().commits,0);assert.equal(f.counts().plans,0);f.owner.stop();
});
