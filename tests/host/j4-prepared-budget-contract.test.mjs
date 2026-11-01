import test from 'node:test';
import {j4AfterEvidenceScenario} from './j4-package-journey.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runJ4EvidenceInterruption} from './j4-evidence-interruption.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {digest} from '../../src/data/hash.mjs';
const origin='http://127.0.0.1:43210',personal={provider:'chatgpt',accountId:'prepared_personal',organizationId:'context_A'},team={provider:'chatgpt',accountId:'prepared_team',organizationId:'context_B'};
// Execute the actual runner prefix and its actual page.evaluate callback against
// the production repository + MockIDB. Stop before any baseline native action.
async function fixture(t,{row='valid'}={}){
 const indexedDB=new MockIDBFactory(),base=new ScopeRepository({indexedDB}),db=await base.open(),key='host-read-budget:'+digest([personal.accountId,personal.organizationId,origin]);
 const payload={startedAt:Date.now()-31000,lastAt:Date.now()-30500,requests:12,attempts:[]};
 const original=row==='missing'?null:{key,payload,checksum:row==='corrupt'?'bad-checksum':digest(payload)};
 if(original)await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views','readwrite');tx.objectStore('b23_views').put(original);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const previous={indexedDB:Object.getOwnPropertyDescriptor(globalThis,'indexedDB'),chrome:Object.getOwnPropertyDescriptor(globalThis,'chrome')},open=ScopeRepository.prototype.open,transactions=[],reads=[],events=[],records=[];const wrapped=new WeakSet();
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:indexedDB});Object.defineProperty(globalThis,'chrome',{configurable:true,value:{runtime:{getURL:path=>new URL('../../'+path,import.meta.url).href}}});
 ScopeRepository.prototype.open=async function(...args){const connection=await open.apply(this,args);if(!wrapped.has(connection)){wrapped.add(connection);const transaction=connection.transaction.bind(connection);connection.transaction=(names,mode)=>{transactions.push({names,mode});assert.equal(mode,'readonly','prepared budget must never reset or write a budget');return transaction(names,mode);};}return connection;};
 t.after(()=>{ScopeRepository.prototype.open=open;for(const [name,descriptor]of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}base.close();});
 const boundary=Error('TEST_BASELINE_BOUNDARY');
 const args={a:{bringToFront:async()=>{events.push('baseline');throw boundary;}},b:{},id:'test',server:{origin},assets:async scope=>{assert.equal(scope,team);return {hash:'foreign-preserved'};},personal,team,inspector:async()=>({evaluate:async(fn,arg)=>{events.push('budget-read');reads.push(arg);return fn(arg);}}),record:(name,value)=>{events.push('record');records.push({name,value});}};
 return {args,boundary,original,transactions,reads,events,records,async stored(){return new Promise((resolve,reject)=>{const tx=db.transaction('b23_views','readonly'),q=tx.objectStore('b23_views').get(key);tx.oncomplete=()=>resolve(q.result??null);tx.onabort=()=>reject(tx.error);});}};
}
test('default J4 skips prepared budget reads and reaches unchanged baseline directly',async t=>{const f=await fixture(t);await assert.rejects(runJ4EvidenceInterruption(f.args),error=>error===f.boundary);assert.deepEqual(f.events,['baseline']);assert.deepEqual(f.records,[]);assert.deepEqual(f.transactions,[]);});
test('prepared variant reads checksum-valid exact scope budget twice without writing or repeating baseline preparation',async t=>{
 const f=await fixture(t);await assert.rejects(runJ4EvidenceInterruption({...f.args,preparedBudget:true}),error=>error===f.boundary);
 assert.deepEqual(f.events,['budget-read','budget-read','record','baseline']);assert.equal(f.transactions.length,2);assert(f.transactions.every(tx=>tx.names==='b23_views'&&tx.mode==='readonly'));
 assert.deepEqual(f.reads,[{scope:personal,origin},{scope:personal,origin}]);assert.deepEqual(await f.stored(),f.original,'natural expiry does not reset a fully spent budget');
 assert.equal(f.records.length,1);const {name,value}=f.records[0];assert.equal(name,'prepared-budget-variant-single-natural-expiry-before-baseline');assert.equal(value.scenario,'PREPARED_BUDGET_AFTER_EVIDENCE_NOT_DEFAULT_J4');assert.equal(value.budgetReset,false);assert.equal(value.waitedMs,0);assert.deepEqual(value.before,{startedAt:f.original.payload.startedAt,requests:12});assert.deepEqual(value.after,value.before);
});
for(const row of ['missing','corrupt'])test('prepared budget '+row+' record fails before baseline and never issues a success receipt',async t=>{const f=await fixture(t,{row});await assert.rejects(runJ4EvidenceInterruption({...f.args,preparedBudget:true}),/prepared-budget-missing-valid-record/);assert.deepEqual(f.events,['budget-read']);assert.deepEqual(f.records,[]);assert.equal(f.transactions.length,1);assert.deepEqual(await f.stored(),f.original);});
test('runner labels prepared afterEvidence separately and opt-in does not relabel default J4',async()=>{
 const source=await readFile(new URL('./j4-package-journey.mjs',import.meta.url),'utf8');
 const assignment=source.match(/report\.preparationScenario=([^;]+);/);assert(assignment);
 const readAssignment=new Function('afterEvidenceScenario','return '+assignment[1]),evaluate=({env})=>readAssignment(j4AfterEvidenceScenario(env));assert.equal(evaluate({env:{}}),'DEFAULT_J4');assert.equal(evaluate({env:{FREE_J4_AFTER_EVIDENCE:'0'}}),'DEFAULT_J4');assert.equal(evaluate({env:{FREE_J4_AFTER_EVIDENCE:'1'}}),'PREPARED_BUDGET_AFTER_EVIDENCE_NOT_DEFAULT_J4');
});
