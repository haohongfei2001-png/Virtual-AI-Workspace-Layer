import test from 'node:test';import assert from 'node:assert/strict';
import {createContentCandidates} from '../../src/host/content-candidates.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const row=i=>({entity:'project',renderKey:`candidate-${i}`,nativeTitle:`Native ${i}`,titleState:'observed',target:{kind:'live-control',control:{id:`handle-${i}`,documentToken:'doc',routeEpoch:1,regionEpoch:1,controlKind:'project'}}});
const packet=rows=>({kind:'surface-delta',payload:{candidates:rows}});
function fixture({kind='candidate',stream=null,streaming=true}={}){
 let clock=1000,reads=0,legacy=0,full=0,commits=0,plans=0,visits=0;const leases=new Map(),retains=[],releases=[],keys=new WeakMap();
 const source=()=>{reads++;return stream?stream(reads):(async function*(){yield packet([row(0),row(1)]);})();};
 const adapter={loadedCandidatePages:source,loadedPages(){legacy++;if(kind!=='pages')throw Error('general-loadedPages-forbidden');return source();},async readLoaded(){full++;if(kind!=='read')throw Error('readLoaded-forbidden');return [packet([row(0),row(1)])];},retainLoadedHandles(owner,handles,deadline){leases.set(owner,handles);retains.push({owner,ids:handles.map(h=>h.id),deadline});return true;},releaseLoadedHandles(owner){releases.push(owner);leases.delete(owner);},planNavigation(){const p={mode:'native-control',planRevision:++plans};keys.set(p,'plan-'+plans);return p;},planKey:p=>keys.get(p)};
 if(kind!=='candidate')delete adapter.loadedCandidatePages;if(kind==='read')delete adapter.loadedPages;
 const owner=createContentCandidates({adapter,current:()=>true,showReading:()=>true,streaming,elapsedNow:()=>clock,...(streaming?{beginScan:()=>({visit:()=>{visits++;return false;},commit:()=>commits++})}:{})});
 return {owner,adapter,leases,retains,releases,clock:t=>clock=t,stats:()=>({reads,legacy,full,commits,plans,visits})};
}
for(const streaming of [true,false])test(`candidate-only iterator has strict priority in streaming=${streaming}`,async()=>{
 const f=fixture({streaming});const p=await f.owner.listPage();assert.deepEqual(p.items.map(r=>r.renderKey),['candidate-0','candidate-1']);assert(p.items.every(r=>r.available));assert.deepEqual(f.stats(),{reads:1,legacy:0,full:0,commits:streaming?1:0,plans:2,visits:streaming?2:0});assert.equal(f.leases.size,0);assert.equal(f.releases.length,streaming?1:0);
});
for(const kind of ['pages','read'])test(`legacy ${kind} remains available only when candidate-only API absent`,async()=>{const f=fixture({kind});assert.equal((await f.owner.listPage()).total,2);assert.equal(f.stats().legacy,kind==='pages'?1:0);assert.equal(f.stats().full,kind==='read'?1:0);});
for(const failure of ['sync','async','late','duplicate','oversize'])test(`candidate-only ${failure} failure never silently retries a full scan`,async()=>{
 const f=fixture({stream:failure==='sync'?()=>{throw Error('candidate-failed');}:async function*(){if(failure==='async')throw Error('candidate-failed');yield packet([row(0)]);if(failure==='late')throw Error('candidate-failed');yield packet(failure==='duplicate'?[row(0)]:Array.from({length:257},(_,i)=>row(i+1)));}});
 await assert.rejects(f.owner.listPage(),failure==='duplicate'||failure==='oversize'?/invalid-content-candidates/:/candidate-failed/);assert.equal(f.stats().legacy,0);assert.equal(f.stats().full,0);assert.equal(f.stats().commits,0);assert.equal(f.stats().plans,0);assert.equal(f.leases.size,0);assert.equal(f.releases.length,1);
});
test('candidate-only duplicate keys across distant packets still reject even when requested window is full',async()=>{
 const f=fixture({stream:async function*(){for(let start=0;start<1024;start+=256)yield packet(Array.from({length:256},(_,i)=>row(start+i)));yield packet([row(0)]);}});await assert.rejects(f.owner.listPage(),/invalid-content-candidates/);assert.equal(f.stats().visits,1024);assert.equal(f.stats().commits,0);assert.equal(f.stats().plans,0);assert.equal(f.leases.size,0);assert.equal(f.releases.length,1);
});
for(const failure of ['stop','deadline'])test(`candidate-only paused ${failure} preserves six-second check and releases its one lease`,async()=>{
 const entered=deferred(),resume=deferred();const f=fixture({stream:async function*(){yield packet([row(0)]);entered.resolve();await resume.promise;yield packet([row(1)]);}});
 const pending=f.owner.listPage(),rejected=assert.rejects(pending,/stale-content-candidates/);await entered.promise;assert.equal(f.leases.size,1);assert.equal(f.retains[0].deadline,7000);
 if(failure==='stop'){f.owner.stop();assert.equal(f.leases.size,0);assert.equal(f.releases.length,1);}else f.clock(7000);
 resume.resolve();await rejected;assert.equal(f.leases.size,0);assert.equal(f.releases.length,1);assert.equal(f.stats().commits,0);assert.equal(f.stats().plans,0);assert.equal(f.stats().legacy,0);assert.equal(f.stats().full,0);
});
test('candidate-only shared and queued pages retain original request deadlines and release once per scan',async()=>{
 const entered=deferred(),resume=deferred(),queued=deferred(),finish=deferred();const f=fixture({stream:async function*(read){yield packet([row(0)]);if(read===1){entered.resolve();await resume.promise;}else{queued.resolve();await finish.promise;}}});
 const first=f.owner.listPage(0),shared=f.owner.listPage(0),second=f.owner.listPage(32),rejected=assert.rejects(second,/stale-content-candidates/);await entered.promise;assert.equal(f.stats().reads,1);f.clock(6999);resume.resolve();const [a,b]=await Promise.all([first,shared]);assert.notEqual(a.items[0].targetKey,b.items[0].targetKey);await queued.promise;assert(f.retains.every(r=>r.deadline===7000));f.clock(7000);finish.resolve();await rejected;assert.equal(f.releases.length,2);assert.equal(f.leases.size,0);assert.equal(f.stats().commits,1);assert.equal(f.stats().legacy,0);assert.equal(f.stats().full,0);
});
