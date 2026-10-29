import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createFreeReadService} from '../../src/runtime/free-read-service.mjs';
import {createHostViewService} from '../../src/runtime/host-view-service.mjs';
const NOW='2026-10-14T12:00:00.000Z',id='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',url='https://chatgpt.com/c/'+id;
const SCOPE=normalizedScope({verified:true,provider:'chatgpt',accountId:'current-view-fixture',organizationId:'personal'});
const drain=()=>new Promise(resolve=>setImmediate(resolve));
const currentPlan=()=>({refId:id,targetKey:'current_target',plan:{mode:'same-target',planRevision:1,bodyProofId:'body_proof',target:{kind:'resolved',entity:'conversation',nativeId:id,navigationURL:url,liveHandle:null}}});
// Synthetic repository facts and an explicit UI-authority double. Real read owner,
// projection and host-view validation; this is not live account or MV3 evidence.
async function fixture(t,{clock=()=>NOW,onRegister=()=>{}}={}){
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'current-view-'+crypto.randomUUID()});
 const workspaces=new WorkspaceRepository({baseRepository:base,clock}),native=new NativeRepository({baseRepository:base,clock,observationGate:()=>({channel:'synthetic',sourceId:'fixture',generation:'one'})}),evidence=new FreeEvidenceRepository({baseRepository:base,clock});
 assert.equal((await native.apply(SCOPE,{operationId:'seed',expectedRevision:0,batch:{scopeKey:SCOPE.key,sourceRevision:1,observedAt:NOW,validUntil:'2026-10-15T12:00:00.000Z',projects:[],refs:[id,other].map(id=>({id,nativeTitle:'Conversation',nativeUrl:'https://chatgpt.com/c/'+id,availability:'available'})),membership:[id,other].map(id=>({id,state:'UNKNOWN',projectId:null})),inventory:{projects:'complete',conversations:'complete',cursor:null}}})).ok,true);
 const readService=createFreeReadService({repository:base,workspaces,native,evidence,clock});
 let live=true,prepare=async()=>[currentPlan()];const registrations=[];
 const context={scope:SCOPE,scopeGrantId:'scope_grant',role:'workspace',binding:{documentToken:'document',producerToken:'producer',routeEpoch:1},parentFrame:{tabId:1,frameId:0,documentId:'parent',actualURL:url},isCurrent:()=>live};
 const service=createHostViewService({ui:{withScope:async(_args,fn)=>fn(context)},readService,clock,prepareNavigation:args=>prepare(args),registerCurrentNavigation:args=>{registrations.push(args);onRegister(args);}});
 t.after(()=>{service.stop();base.close();});
 const view=()=>service.handle({v:1,type:'HOST_UI_VIEW',grantId:'ui_grant',mountId:'mount',query:{}},{});
 async function ready(){for(let i=0;i<100;i++){const r=await view();if(r.state!=='preparing')return r;await drain();}assert.fail('bounded view preparation');}
 const plans=result=>service.navigationPlans({v:1,type:'HOST_UI_NAVIGATION_PLANS',grantId:'ui_grant',mountId:'mount',deliveryId:result.deliveryId},{});
 return {ready,plans,registrations,context,prepare:fn=>prepare=fn,revoke:()=>live=false};
}
test('MOCK_IDB same-target bounded projection registers only validated current plan with owner context',async t=>{
 const f=await fixture(t),result=await f.ready();assert.equal(result.state,'ready',JSON.stringify(result));assert.equal(result.page.current.refId,id);assert.deepEqual(result.navigation,[]);assert.deepEqual(f.registrations.map(x=>x.navigation),[[]]);assert.deepEqual((await f.plans(result)).navigation,[currentPlan()]);assert.equal(f.registrations.length,2);
 const registration=f.registrations[1];assert.equal(registration.context,f.context);assert.equal(registration.grantId,'ui_grant');assert.equal(registration.mountId,'mount');assert.deepEqual(registration.navigation,[currentPlan()]);assert.equal(result.binding,undefined);
 f.prepare(async()=>[]);const next=await f.ready();assert.equal(next.state,'ready');assert.deepEqual((await f.plans(next)).navigation,[]);assert.deepEqual(f.registrations.at(-1).navigation,[],'empty page registration clears obsolete worker capability');
});
for(const mode of ['other-current','project','foreign-url','body-proof','extra-plan','live-handle','revision','duplicate'])test('MOCK_IDB same-target '+mode+' cannot register an action or suppress valid data',async t=>{
 const f=await fixture(t);f.prepare(async()=>{const r=currentPlan();if(mode==='other-current'){r.refId=other;r.plan.target.nativeId=other;r.plan.target.navigationURL='https://chatgpt.com/c/'+other;}if(mode==='project'){r.projectId=r.refId;delete r.refId;r.plan.target.entity='project';}if(mode==='foreign-url')r.plan.target.navigationURL='https://evil.test/c/'+id;if(mode==='body-proof')r.plan.bodyProofId='';if(mode==='extra-plan')r.plan.forged=true;if(mode==='live-handle')r.plan.target.liveHandle={id:'forged'};if(mode==='revision')r.plan.planRevision=0;return mode==='duplicate'?[r,r]:[r];});
 const result=await f.ready();assert.equal(result.state,'ready');assert.equal(result.page.current.refId,id);const action=await f.plans(result);assert.equal(action.ok,false);assert.equal(action.reason,'navigation-unavailable');assert.equal(action.navigation,undefined);assert(f.registrations.every(x=>x.navigation.length===0));
});
test('MOCK_IDB revoked context after native preparation cannot publish or register same-target',async t=>{
 const f=await fixture(t);f.prepare(async()=>{f.revoke();return [currentPlan()];});const view=await f.ready();assert.equal(view.state,'ready');const r=await f.plans(view);assert.equal(r.ok,false);assert(f.registrations.every(x=>x.navigation.length===0));
});
test('MOCK_IDB freshness crossing during VIEW delivery retains the original reevaluation deadline',async t=>{
 let time=Date.parse(NOW),crossTo=null;
 const f=await fixture(t,{clock:()=>new Date(time).toISOString(),onRegister:()=>{if(crossTo!==null){time=crossTo;crossTo=null;}}});
 const first=await f.ready(),deadline=Date.parse(first.refreshAt);assert(Number.isFinite(deadline)&&deadline>time);
 time=deadline-1;crossTo=deadline+1;
 const delayed=await f.ready();assert.equal(delayed.state,'ready');assert.equal(delayed.refreshAt,first.refreshAt,'do not discard a deadline that crossed after snapshot evaluation');
 assert(Date.parse(delayed.refreshAt)<time,'the client can now discard and reprepare this elapsed response');
 const next=await f.ready();assert.equal(next.state,'ready');assert.equal(next.refreshAt,null);assert.equal(next.page.entries.unknown.items.length,2);
 // This legacy synthetic source has no Host admission for last-known metadata.
 assert(next.page.entries.unknown.items.every(row=>row.freshness==='unknown'),'expired synthetic facts must not become current or gain Host admission');
});
