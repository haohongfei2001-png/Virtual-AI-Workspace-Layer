import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instrumentIdleWorkSource} from './idle-work-trace.mjs';
import {createHostBindingService as plainService} from '../../src/runtime/host-binding-service.mjs';
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
