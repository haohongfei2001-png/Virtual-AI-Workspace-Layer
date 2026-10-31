import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instrumentIdleWorkSource} from './idle-work-trace.mjs';
import {createHostBindingService as plainService} from '../../src/runtime/host-binding-service.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
// Reuse the actual owner/repository integration fixture and its three original
// control cases. Only the second run's module source has passive tracing added.
import {fixture} from './ui-idle-preflight.test.mjs';

const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
async function source(path,kind,uiURL){
 const base=new URL(path,import.meta.url),original=await readFile(base,'utf8');
 return instrumentIdleWorkSource(original,kind).replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>`from '${path==='./host-ui-owner.mjs'&&uiURL?uiURL:new URL(path,base).href}'`);
}
const uiURL=moduleURL(await source('../../src/runtime/host-ui-owner.mjs','ui'));
const {createHostBindingService}=await import(moduleURL(await source('../../src/runtime/host-binding-service.mjs','service',uiURL)));
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};

test('passive trace preserves an actual idle-snapshot/new-work/CHECK refusal and usable grant',async t=>{
 const outcomes=[];
 for(const createService of [undefined,createHostBindingService]){
  globalThis.__vaiwlFixtureIdleWork=[];
  const f=await fixture(t,createService);assert.equal(f.service.isIdle(),true);
  let release,entered=false;
  const held=f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},async context=>{entered=true;await new Promise(r=>release=r);return context.isCurrent();});
  await drain();assert(entered);
  let check;
  try{check=await f.service.handle({v:1,type:'HOST_UI_IDLE_CHECK',...f.parent.packet,mountId:'mount'},f.parent.sender);}
  finally{release();}
  outcomes.push({check,held:await held,current:await f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},c=>c.isCurrent()),idle:f.service.isIdle()});
 }
 assert.deepEqual(outcomes[1],outcomes[0]);
 assert.deepEqual(outcomes[1],{check:{ok:false,reason:'ui-release-busy'},held:true,current:true,idle:true});
 const rows=globalThis.__vaiwlFixtureIdleWork;
 assert(rows.some(r=>r.stage==='work-start'&&r.label==='HOST_UI_CONFIRM'&&r.realm==='parent'));
 assert(rows.some(r=>r.stage==='work-start'&&r.label==='HOST_UI_IDLE_CHECK'&&r.realm==='parent'));
 assert(rows.some(r=>r.stage==='ui-close-guard'&&r.result===false&&r.activeWork===2&&r.inFlight===1&&r.pending===0));
 delete globalThis.__vaiwlFixtureIdleWork;
});

test('trace is bounded and does not retain unknown message labels, payloads or sender IDs',async t=>{
 globalThis.__vaiwlFixtureIdleWork=[];
 const f=await fixture(t,createHostBindingService);
 for(let i=0;i<150;i++)await f.service.handle({type:'PRIVATE_TYPE',payload:'PRIVATE_BODY'},{documentId:'PRIVATE_ID',url:'PRIVATE_URL'});
 const rows=globalThis.__vaiwlFixtureIdleWork;
 assert.equal(rows.length,256);assert(rows.some(r=>r.label==='OTHER'&&r.realm==='unknown'));
 assert(!JSON.stringify(rows).includes('PRIVATE_'));
 for(const type of ['HOST_UI_RENEW','HOST_UI_STATUS']){
  await f.service.handle({type},f.ui);
  assert(globalThis.__vaiwlFixtureIdleWork.some(r=>r.stage==='work-start'&&r.label===type&&r.realm==='frame'));
 }
 delete globalThis.__vaiwlFixtureIdleWork;
});

test('source drift and unsupported instrumentation fail closed',()=>{
 assert.throws(()=>instrumentIdleWorkSource('','service'),/idle-trace-anchor/);
 assert.throws(()=>instrumentIdleWorkSource('','ui'),/idle-trace-anchor/);
 assert.throws(()=>instrumentIdleWorkSource('','other'),/invalid-idle-trace-kind/);
});

test('removed or reordered snippet owner is source drift, never a best-effort trace match',async()=>{
 const original=await readFile(new URL('../../src/runtime/host-binding-service.mjs',import.meta.url),'utf8');
 for(const replacement of [',recovery,views]',',recovery,views,snippets]']){
  const changed=original.replace(',recovery,snippets,views]',replacement);assert.notEqual(changed,original);
  assert.throws(()=>instrumentIdleWorkSource(changed,'service'),/idle-trace-anchor:service/);
 }
});


test('context owner busy tracing preserves CHECK and RELEASE decisions without shifting owner names',async t=>{
 const outcomes=[];
 for(const createService of [plainService,createHostBindingService]){
  let busy=false;globalThis.__vaiwlFixtureIdleWork=[];
  const f=await fixture(t,options=>createService({...options,contextObserver:{isIdle:()=>!busy}}));
  busy=true;assert.equal(f.service.isIdle(),false);
  const packet=type=>({v:1,type,...f.parent.packet,mountId:'mount'});
  const check=await f.service.handle(packet('HOST_UI_IDLE_CHECK'),f.parent.sender);
  const release=await f.service.handle(packet('HOST_UI_IDLE_RELEASE'),f.parent.sender);
  const retained=await f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},c=>c.isCurrent());
  busy=false;
  outcomes.push({check,release,retained,idle:f.service.isIdle(),final:await f.service.handle(packet('HOST_UI_IDLE_RELEASE'),f.parent.sender)});
 }
 assert.deepEqual(outcomes[1],outcomes[0]);
 assert.equal(outcomes[1].check.ok,false);assert.equal(outcomes[1].release.ok,false);
 assert.equal(outcomes[1].retained,true);assert.equal(outcomes[1].idle,true);assert.equal(outcomes[1].final.ok,true);
 const blocked=globalThis.__vaiwlFixtureIdleWork.filter(row=>row.stage==='owner-busy');
 assert(blocked.length>0);assert(blocked.every(row=>row.owner==='contextObserver'));
 delete globalThis.__vaiwlFixtureIdleWork;
});

test('actual snippet cleanup and subsequent view preparation retain plain decisions and exact owner names',async t=>{
 const outcomes=[],C='33333333-3333-4333-8333-333333333333';
 for(const createService of [plainService,createHostBindingService]){
  globalThis.__vaiwlFixtureIdleWork=[];
  let releaseSelection,releaseHeader,enteredHeader,holdHeader=false;
  const selection=new Promise(resolve=>releaseSelection=resolve),header=new Promise(resolve=>releaseHeader=resolve),entered=new Promise(resolve=>enteredHeader=resolve);
  t.after(()=>{releaseSelection({ok:true});releaseHeader();});
  const anchor={refId:C,messageId:'fixture_message',branchId:'fixture_branch',text:'explicit synthetic selection',bodyHash:'e'.repeat(64)};
  const f=await fixture(t,options=>{
   const workspaces=new WorkspaceRepository({baseRepository:options.repository}),partitionHeader=workspaces.partitionHeader.bind(workspaces);
   workspaces.partitionHeader=async(...args)=>{if(holdHeader){enteredHeader();await header;}return partitionHeader(...args);};
   return createService({...options,workspaceRepository:workspaces,freeEvidenceRepository:new FreeEvidenceRepository({baseRepository:options.repository}),selectionBridge:async({phase})=>phase==='release'?selection:phase==='capture'?{selectionId:'fixture_selection',anchor}:{ok:true,anchor}});
  });
  assert.equal((await f.service.handle(f.proposal(),f.parent.sender)).state,'accepted');
  const view=async()=>{let reply;for(let i=0;i<30;i++){reply=await f.service.handle({v:1,type:'HOST_UI_VIEW',grantId:f.grant.id,mountId:'mount',query:{}},f.ui);if(reply.state!=='preparing')break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(reply.state,'ready',JSON.stringify(reply));return reply.page;};
  const initial=await view();f.flushHints();await drain();assert.equal(f.service.isIdle(),true);
  const saved=await f.service.handle({v:1,type:'HOST_UI_SNIPPET',grantId:f.grant.id,mountId:'mount',operationId:'save_trace_parity',expectedRevision:initial.workspaceRevision,action:'save',id:C},f.ui);assert.equal(saved.ok,true,JSON.stringify(saved));
  await view();f.flushHints();await drain();
  const packet=type=>({v:1,type,...f.parent.packet,mountId:'mount'}),phases=[];
  const blocked=async owner=>{
   globalThis.__vaiwlFixtureIdleWork=[];const idle=f.service.isIdle();
   const check=await f.service.handle(packet('HOST_UI_IDLE_CHECK'),f.parent.sender),release=await f.service.handle(packet('HOST_UI_IDLE_RELEASE'),f.parent.sender);
   const retained=await f.service.ui.withScope({sender:f.ui,grantId:f.grant.id,mountId:'mount'},context=>context.isCurrent());
   assert.equal(idle,false);assert.equal(check.ok,false);assert.equal(release.ok,false);assert.equal(retained,true);
   if(createService===createHostBindingService){const rows=globalThis.__vaiwlFixtureIdleWork.filter(row=>row.stage==='owner-busy');assert(rows.some(row=>row.excludeUi===false));assert(rows.some(row=>row.excludeUi===true));assert(rows.every(row=>row.owner===owner),JSON.stringify(rows));}
   phases.push({owner,idle,check,release,retained});
  };
  await blocked('snippets');releaseSelection({ok:true});await drain();assert.equal(f.service.isIdle(),true);
  holdHeader=true;f.service.views.refreshScope(initial.scope);
  let timer;try{await Promise.race([entered,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('view-preparation-not-entered')),1000);})]);}finally{clearTimeout(timer);}
  await blocked('views');holdHeader=false;releaseHeader();await view();f.flushHints();await drain();assert.equal(f.service.isIdle(),true);
  outcomes.push({phases,final:await f.service.handle(packet('HOST_UI_IDLE_RELEASE'),f.parent.sender)});
 }
 assert.deepEqual(outcomes[1],outcomes[0]);assert.equal(outcomes[1].final.ok,true);delete globalThis.__vaiwlFixtureIdleWork;
});
