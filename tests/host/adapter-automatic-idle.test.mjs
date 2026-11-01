/** Automatic idle is local revocable readiness, never grant or teardown authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const fixtureURL=new URL('./adapter-idle-preparation.test.mjs',import.meta.url),source=await readFile(fixtureURL,'utf8'),boundary='// Offline DOM doubles';
assert.equal(source.split(boundary).length,2);
const fixtureSource=(source.slice(0,source.indexOf(boundary))+'\nexport {fixture,settle,deferred,bodyAck};').replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>"from '"+new URL(path,fixtureURL).href+"'");
const {fixture,settle,deferred,bodyAck}=await import('data:text/javascript;base64,'+Buffer.from(fixtureSource).toString('base64'));
async function ready(t,options={}){const f=fixture(options);t.after(()=>f.adapter.stop());await f.start();await settle();assert.ok(f.adapter.prepareIdle());return f;}
for(const risk of [{state:'unknown'},{state:'unsaved',flags:['composer']},{state:'unsaved',flags:['generation']}])test('automatic idle refuses '+JSON.stringify(risk),async t=>{
 const f=await ready(t,{inputRisk:()=>risk});assert.equal(f.adapter.prepareAutomaticIdle(),null);
});
test('unconfigured native risk cannot certify automatic idle',async t=>{
 const f=await ready(t);assert.equal(f.adapter.prepareAutomaticIdle(),null);
});
test('clear input yields only a frozen revocable token and risk is rechecked',async t=>{
 let risk={state:'clear'},authorizations=0;const f=await ready(t,{inputRisk:()=>risk,authorize:()=>{authorizations++;return true;}});
 const token=f.adapter.prepareAutomaticIdle();assert.ok(token);assert.equal(Object.isFrozen(token),true);assert.deepEqual(Object.keys(token),['isCurrent']);assert.equal(token.isCurrent(),true);
 risk={state:'unsaved',flags:['generation']};assert.equal(token.isCurrent(),false);assert.equal(f.adapter.prepareAutomaticIdle(),null);assert.equal(authorizations,0);assert.notEqual(f.observer().closed,true);
});
for(const selector of ['input','textarea','select','button','[contenteditable]','[role="textbox"]'])test('active native '+selector+' blocks automatic idle',async t=>{
 const f=await ready(t,{inputRisk:()=>({state:'clear'})}),token=f.adapter.prepareAutomaticIdle();assert.ok(token);
 const active={closest(query){assert(query.split(',').includes(selector));return this;}};f.document.activeElement=active;
 assert.equal(token.isCurrent(),false);assert.equal(f.adapter.prepareAutomaticIdle(),null);
});
test('native modal and throwing risk reader fail closed',async t=>{
 let throws=false;const f=await ready(t,{inputRisk:()=>{if(throws)throw Error('unavailable');return {state:'clear'};}}),token=f.adapter.prepareAutomaticIdle();assert.ok(token);
 f.document.querySelector=query=>{assert.equal(query,'dialog[open], [aria-modal="true"]');return {};};assert.equal(token.isCurrent(),false);assert.equal(f.adapter.prepareAutomaticIdle(),null);
 f.document.querySelector=()=>null;throws=true;assert.equal(token.isCurrent(),false);assert.equal(f.adapter.prepareAutomaticIdle(),null);
});
for(const change of ['queue','route','stop','expiry','renewal'])test('automatic token is invalidated by '+change,async t=>{
 const f=await ready(t,{inputRisk:()=>({state:'clear'})}),token=f.adapter.prepareAutomaticIdle();assert.ok(token);
 if(change==='queue')f.trigger();else if(change==='route')f.document.location.href='https://chatgpt.com/';else if(change==='stop')f.adapter.stop();else if(change==='expiry')f.setTime(100000);else assert.equal(f.adapter.updateBinding({...f.binding,expiresAt:new Date(20000).toISOString()}),true);
 assert.equal(token.isCurrent(),false);assert.equal(f.adapter.prepareAutomaticIdle(),null);await settle();assert.equal(token.isCurrent(),false);
 if(['queue','renewal'].includes(change))assert.ok(f.adapter.prepareAutomaticIdle());
});
test('idle hint waits for drain, carries no grant and does not require clear input',async t=>{
 const hold=deferred(),hints=[];let authorizations=0;const f=fixture({inputRisk:()=>({state:'unknown'}),authorize:()=>{authorizations++;return true;},onIdleHint:(...args)=>hints.push(args)});t.after(()=>f.adapter.stop());
 assert.equal(f.adapter.prepareAutomaticIdle(),null);await f.start(p=>{f.emitted.push(p);return hold.promise;});await settle();assert.equal(hints.length,0);assert.equal(f.adapter.prepareAutomaticIdle(),null);
 hold.resolve(bodyAck(f.emitted[0]));await settle();assert(hints.length>0);assert(hints.every(args=>args.length===0));assert.equal(f.adapter.prepareAutomaticIdle(),null);assert.equal(authorizations,0);assert.notEqual(f.observer().closed,true);
 const count=hints.length;f.adapter.stop();f.trigger();await settle();assert.equal(hints.length,count);
});
test('an automatic token observed unsafe cannot revive when risk becomes clear again',async t=>{
 let risk={state:'clear'};const f=await ready(t,{inputRisk:()=>risk}),token=f.adapter.prepareAutomaticIdle();assert.ok(token);assert.equal(token.isCurrent(),true);
 risk={state:'unsaved',flags:['generation']};assert.equal(token.isCurrent(),false);
 risk={state:'clear'};assert.equal(token.isCurrent(),false,'the rejected automatic preparation stays revoked');assert.ok(f.adapter.prepareAutomaticIdle(),'a separately prepared current token may be safe');
});
