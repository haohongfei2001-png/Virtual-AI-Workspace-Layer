/** Real entry coordinator/shared budget/repository over the existing MockIDBFactory.
 * Explicit authority and network-reader doubles; not browser or historical event certification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {createSharedHostReadBudget} from '../../src/runtime/shared-host-read-budget.mjs';
import {createHostEntryCalibration} from '../../src/runtime/host-entry-calibration.mjs';
import {digest} from '../../src/data/hash.mjs';
const request={v:1,type:'HOST_UI_CALIBRATION_ENTRY',grantId:'grant',mountId:'mount',kind:'foreground'},unavailable={ok:false,state:'unavailable'},checked={ok:true,state:'checked-current'};
const scope={principalKey:'principal_'+digest('entry-principal'),contextKey:'context_'+digest('entry-context'),sourceDomain:'http://127.0.0.1:3912'};
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
async function fixture(t){
 let time=100000,sequence=0,authorized=true,proof='old-proof',hold=null,authCalls=0,readerCalls=0;const indexedDB=new MockIDBFactory(),timers=new Map(),network=[],options=[],repositories=[];
 const makeBudget=()=>{const repository=new ScopeRepository({indexedDB});repositories.push(repository);return {repository,budget:createSharedHostReadBudget({repository,now:()=>time})};};
 const first=makeBudget();let firstTicket;for(let i=0;i<12;i++)firstTicket=await first.budget.reserve({...scope,attemptKey:'initial-'+i});first.repository.close();
 // New repository/owner sees the durable old budget. No direct row seeding/editing.
 const {repository,budget}=makeBudget(),context={role:'workspace',isCurrent:()=>authorized};
 const owner=createHostEntryCalibration({ui:{withScope:async(_args,work)=>{authCalls++;if(!authorized)throw Error('revoked');return work(context);}},observations:{currentProofForParent:()=>proof},reader:{async readCalibration(current,guards){readerCalls++;options.push({current,...guards});if(hold)await hold;if(!guards.isCurrent()||guards.signal.aborted)throw Error('stale-calibration-entry');let ticket;for(let i=0;i<3;i++){ticket=await budget.reserve({...scope,signal:guards.signal,...(ticket??{}),attemptKey:i===0?'conversation:current':null});if(!guards.isCurrent()||guards.signal.aborted)throw Error('stale-calibration-entry');network.push({proof:current,request:i,windowStartedAt:ticket.windowStartedAt});}return {}; }},elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 t.after(()=>{owner.stop();for(const repo of repositories)repo.close();});
 const rows=async()=>{const db=await repository.open();return structuredClone([...db.meta.stores.get('b23_views').rows.values()].filter(v=>v.key.startsWith('host-read-budget:')));};
 return {owner,budget,network,options,timers,rows,firstTicket,get readerCalls(){return readerCalls;},get authCalls(){return authCalls;},setProof:value=>proof=value,revoke:()=>authorized=false,hold(){let release;hold=new Promise(r=>release=r);return release;},async advance(ms){time+=ms;for(const [id,timer]of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}await tick();}};
}
for(const kind of ['foreground','history'])test('persisted exhausted window defers '+kind+'; only genuine new entry after expiry reads with fresh proof',async t=>{
 const f=await fixture(t),before=await f.rows();assert.equal(before[0].payload.requests,12);
 assert.deepEqual(await f.owner.handle({...request,kind},{}),unavailable);assert.equal(f.network.length,0);assert.deepEqual(await f.rows(),before);assert.equal(f.timers.size,0);
 await f.advance(29999);assert.deepEqual(await f.owner.handle({...request,kind},{}),unavailable);assert.equal(f.network.length,0);assert.deepEqual(await f.rows(),before);
 const calls=f.readerCalls,auth=f.authCalls;await f.advance(1);assert.equal(f.readerCalls,calls);assert.equal(f.authCalls,auth);assert.equal(f.network.length,0);assert.deepEqual(await f.rows(),before,'time passage does not reset stored budget');
 f.setProof('new-current-proof');assert.deepEqual(await f.owner.handle({...request,kind},{}),checked);assert.equal(f.network.length,3);assert(f.network.every(row=>row.proof==='new-current-proof'&&row.windowStartedAt===130000));const after=await f.rows();assert.equal(after.length,1);assert.equal(after[0].payload.requests,3);assert.equal(after[0].payload.startedAt,130000);assert.equal(f.timers.size,0);
 await assert.rejects(f.budget.reserve({...scope,...f.firstTicket}),/read-budget-exhausted/);assert.deepEqual(await f.rows(),after,'old pinned continuation cannot consume fresh window');
});
for(const invalid of ['revoked','proof-absent','stopped'])test('expired window does not revive '+invalid+' authority or old proof',async t=>{
 const f=await fixture(t);assert.deepEqual(await f.owner.handle(request,{}),unavailable);const before=await f.rows();await f.advance(30000);if(invalid==='revoked')f.revoke();if(invalid==='proof-absent')f.setProof(null);if(invalid==='stopped')f.owner.stop();assert.deepEqual(await f.owner.handle(request,{}),unavailable);assert.equal(f.network.length,0);assert.deepEqual(await f.rows(),before);
});
for(const invalid of ['proof-replaced','six-second-expiry','revoked'])test('held old entry cannot resume across '+invalid+' even when durable budget window expires',async t=>{
 const f=await fixture(t),release=f.hold(),pending=f.owner.handle(request,{});await tick();assert.equal(f.readerCalls,1);if(invalid==='proof-replaced')f.setProof('replacement-proof');if(invalid==='revoked')f.revoke();await f.advance(30000);assert.deepEqual(await pending,unavailable);const before=await f.rows();release();await tick();assert.equal(f.network.length,0);assert.deepEqual(await f.rows(),before);assert.equal(f.options[0].signal.aborted,true);assert.equal(f.options[0].isCurrent(),false);assert.equal(f.timers.size,0);
});
