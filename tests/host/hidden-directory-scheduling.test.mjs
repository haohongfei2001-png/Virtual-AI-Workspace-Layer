/** Scheduling contract with existing production adapter/discovery and DOM doubles.
 * No browser throughput claim and no authority/ingestion deadline replacement. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHostIngestionPassOwner} from '../../src/runtime/host-ingestion-pass-owner.mjs';
async function harness(file,boundary,names){const url=new URL(file,import.meta.url),text=await readFile(url,'utf8');assert.equal(text.split(boundary).length,2);const code=(text.slice(0,text.indexOf(boundary))+'\nexport {'+names+'};').replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>"from '"+new URL(path,url).href+"'");return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
const {fixture,settle}=await harness('./adapter-owned-toggle.test.mjs',"test('owned toggle during",'fixture,settle');
const {sendFixture,bodyAck}=await harness('./adapter-idle-preparation.test.mjs',"// Offline DOM doubles",'sendFixture,bodyAck');
const ack=p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'});
async function heldDirectory(t){let clock=0;const f=fixture({now:()=>clock,elapsedNow:()=>clock});t.after(()=>f.adapter.stop());f.document.visibilityState='visible';let release;
 await f.adapter.start({binding:{...f.binding,expiresAt:new Date(20000).toISOString()},ingestionPass:async m=>{f.passes.push({...m,at:clock});return {ok:true};},emit:p=>{f.packets.push(p);return f.packets.length===1?new Promise(resolve=>release=()=>resolve(ack(p))):Promise.resolve(ack(p));}});await settle();assert.equal(f.packets.length,1);
 return {...f,release,setTime:value=>clock=value,visibility(value){f.document.visibilityState=value;f.listeners.get('visibilitychange')?.({type:'visibilitychange'});}};
}
const directory=f=>f.packets.filter(p=>p.kind==='surface-delta');
test('hidden directory stops after already in-flight packet and resumes original finite pass',async t=>{
 const f=await heldDirectory(t);f.visibility('hidden');f.release();await settle();assert.equal(directory(f).length,1,'hidden continuation must not emit more directory packets');assert.equal(f.adapter.prepareIdle(),null,'paused is not drained');assert.deepEqual(f.passes.map(p=>p.phase),['start']);
 f.setTime(19000);f.adapter.updateBinding({...f.binding,expiresAt:new Date(39000).toISOString()});await settle();f.setTime(29000);f.visibility('visible');await settle();const ids=new Set(directory(f).flatMap(p=>p.payload.candidates).map(c=>c.target.nativeId));assert.equal(ids.size,801);assert.deepEqual(f.passes.map(p=>p.phase),['start','end']);assert.equal(f.passes[0].passSeq,f.passes[1].passSeq);assert.equal(f.passes[0].at,0,'visibility must not issue a new pass or reset its start');
});
test('repeated hidden notifications and same-binding renewal never restart paused pass',async t=>{
 const f=await heldDirectory(t);f.visibility('hidden');f.release();await settle();for(let i=0;i<4;i++){f.setTime(1000+i);f.visibility('hidden');f.adapter.updateBinding({...f.binding,expiresAt:new Date(21000+i).toISOString()});}await settle();assert.equal(directory(f).length,1);assert.deepEqual(f.passes.map(p=>p.phase),['start']);f.visibility('visible');await settle();assert.deepEqual(f.passes.map(p=>p.phase),['start','end']);
});
test('stop while directory paused cannot revive from an old visibility callback',async t=>{
 const f=await heldDirectory(t);f.visibility('hidden');f.release();await settle();const callback=f.listeners.get('visibilitychange');f.adapter.stop();const count=f.packets.length;f.document.visibilityState='visible';callback?.({type:'visibilitychange'});await settle();assert.equal(f.packets.length,count);assert(!f.passes.some(p=>p.phase==='end'));assert.equal(f.passes.filter(p=>p.phase==='start').length,1);
});
test('expired binding cannot emit paused directory fragments on visibility restoration',async t=>{
 const f=await heldDirectory(t);f.visibility('hidden');f.release();await settle();const count=f.packets.length;f.setTime(100001);f.visibility('visible');await settle();assert.equal(f.packets.length,count);assert.equal(f.passes.filter(p=>p.phase==='start').length,1);
});
test('hidden state does not suppress current-body updates or a valid native send intent',async t=>{
 const f=sendFixture();t.after(()=>f.adapter.stop());f.document.visibilityState='hidden';await f.start(async p=>{f.emitted.push(p);return bodyAck(p);});await settle();assert(f.emitted.some(p=>p.kind==='current-observation'));assert.equal(f.emitted.filter(p=>p.kind==='surface-delta').length,0);
 f.reading.children.push(f.makeMessage('M2'));f.trigger();await settle();assert.deepEqual(f.emitted.filter(p=>p.kind==='current-observation').at(-1).payload.body.messageIds,['M1','M2']);f.click();await settle();assert.equal(f.emitted.filter(p=>p.kind==='send-candidate').length,1);assert.equal(f.emitted.filter(p=>p.kind==='surface-delta').length,0);
});

test('visibility restoration after thirty seconds cannot renew the actual scheduling owner deadline',async t=>{
 let clock=0;const f=fixture({now:()=>clock,elapsedNow:()=>clock});
 const sender={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'browser',documentLifecycle:'active',url:f.document.location.href};
 const frame={documentId:'browser',url:sender.url,documentLifecycle:'active'};
 const bound=(m,s)=>s.id===sender.id&&s.tab?.id===1&&s.frameId===0&&s.documentId===frame.documentId&&s.url===frame.url&&m.documentToken===f.binding.documentToken&&m.producerToken===f.binding.producerToken&&m.routeEpoch===f.binding.routeEpoch;
 const owner=createHostIngestionPassOwner({profiles:new Map([[f.profile.id,f.profile]]),now:()=>clock,elapsedNow:()=>clock,
  handshake:{verify:async(m,s)=>bound(m,s),isBound:bound,matchesFrame:(m,s,current)=>bound(m,s)&&current===frame},
  authority:{peek:()=>({state:'verified',grant:{id:'grant',scopeEpoch:1}}),scopeFor:()=>({key:'scope'})},getFrame:async()=>frame});
 t.after(()=>{f.adapter.stop();owner.stop();});let release;
 f.document.visibilityState='visible';
 await f.adapter.start({binding:{...f.binding,expiresAt:new Date(20000).toISOString()},ingestionPass:m=>{
  f.passes.push(m);return owner.handle({v:1,type:'HOST_INGESTION_PASS',documentToken:f.binding.documentToken,producerToken:f.binding.producerToken,routeEpoch:f.binding.routeEpoch,...m},sender);
 },emit:p=>{f.packets.push(p);return f.packets.length===1?new Promise(resolve=>release=()=>resolve(ack(p))):Promise.resolve(ack(p));}});
 await settle();assert.equal(owner.isPending('scope'),true);assert.equal(typeof release,'function');
 f.document.visibilityState='hidden';f.listeners.get('visibilitychange')();release();await settle();assert.equal(directory(f).length,1);
 clock=19000;f.adapter.updateBinding({...f.binding,expiresAt:new Date(39000).toISOString()});await settle();
 clock=29999;assert.equal(owner.isPending('scope'),true);
 clock=30000;assert.equal(owner.isPending('scope'),false,'original owner deadline expires while hidden');
 f.document.visibilityState='visible';f.listeners.get('visibilitychange')();await settle();
 assert.equal(owner.isPending('scope'),false,'visible continuation must not register a replacement pass');
 assert.deepEqual(f.passes.map(p=>p.phase),['start','end']);assert.equal(f.passes[0].passSeq,f.passes[1].passSeq);
 assert.equal(new Set(directory(f).flatMap(p=>p.payload.candidates).map(c=>c.target.nativeId)).size,801,'remaining passive observations retain their valid renewed binding');
});
