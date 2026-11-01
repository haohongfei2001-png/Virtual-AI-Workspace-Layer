import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,rows,P,scope as rawScope} from './fixtures/priority-owned-mask.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {createHostObservationOwner} from '../../src/runtime/host-observation-owner.mjs';
import {loadFreePages} from '../../src/data/free-page-loader.mjs';
import {freeProjection} from '../../src/data/free-projection.mjs';
import {freeNavigationSnapshot} from '../../src/navigation/free-view.mjs';
import {createFreeFrameClient} from '../../src/host/free-frame-client.mjs';
import {projectFreeFrame} from '../../src/runtime/free-frame-projection.mjs';
// L: actual owner/repository/converter/pagination over MockIDB. Browser identity
// and scope are explicit offline doubles; this is not rendered UI or real IDB D.
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
function frameClientFixture(role='workspace'){
 const nativePending=[];let time=1000,id=0,navOptions,views=0;const timers=new Map(),listeners=new Set(),messageListeners=new Set(),historicalMessages=[],parentMessages=[],calls=[],pages=[],states=[],presented=[],restoredViews=[];let factories=0,stops=0,invalidations=0,recoveryOptions,recoveryOpens=0,recoveryStops=0,backupOptions,backupOpens=0,backupStops=0,backupInvalidations=0,snippetOptions,snippetOpens=0,snippetStops=0,snippetInvalidations=0;
 const element=()=>({children:[],setAttribute(){},append(n){n.parent=this;this.children.push(n);},replaceChildren(){this.children=[];},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}});
 const body=element(),privateRoot=element();body.append(privateRoot);
 const document={body,createElement:element,defaultView:{parent:{postMessage(message,origin){parentMessages.push({message,origin});}}}};
 const grant=()=>({id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role,expiresAt:new Date(time+20000).toISOString()});
 const page=()=>({protocol:'vaiwl-free-frame/1',role,scope:'A',completeSnapshot:false,groups:{items:[]},entries:{noProject:{items:[]},unknown:{items:[]}},selection:null});
 let view=async()=>({ok:true,state:'ready',page:page(),navigation:[]});
 const runtime={connect:()=>({onMessage:{addListener:fn=>{messageListeners.add(fn);historicalMessages.push(fn);},removeListener:fn=>messageListeners.delete(fn)},onDisconnect:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},disconnect(){}}),sendMessage:async m=>{calls.push(m);if(m.type==='HOST_UI_VIEW'){views++;return view(m);}return {ok:true,grant:grant()};}};
 const client=createFreeFrameClient({document,privateRoot,runtime,role,parentOrigin:'https://chatgpt.com',onState:s=>states.push(s),now:()=>time,elapsedNow:()=>time,makeNonce:()=> 'nonce',schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),snippetsFactory:options=>{snippetOptions=options;return {open(){snippetOpens++;},stop(){snippetStops++;},invalidate(){snippetInvalidations++;}};},backupFactory:options=>{backupOptions=options;return {open(){backupOpens++;},stop(){backupStops++;},invalidate(){backupInvalidations++;}};},recoveryFactory:options=>{recoveryOptions=options;return {open(){recoveryOpens++;},stop(){recoveryStops++;}};},navigationFactory:options=>{factories++;navOptions=options;return {setNativeNavigationPending:value=>nativePending.push(value),restoreFrameView:value=>restoredViews.push(value),invalidate(){invalidations++;},present:intent=>presented.push(intent),updateFrameProjection:p=>pages.push(p),stop:()=>{stops++;}};}});
 return {nativePending,parentMessages,restoredViews,jump(ms){time+=ms;},runtime,grant,presented,messageListeners,historicalMessages,emit:m=>{for(const fn of [...messageListeners])fn(m);},client,calls,pages,states,body,privateRoot,page,setView:fn=>{view=fn;},get snippets(){return snippetOptions;},get snippetOpens(){return snippetOpens;},get snippetStops(){return snippetStops;},get snippetInvalidations(){return snippetInvalidations;},get backup(){return backupOptions;},get backupOpens(){return backupOpens;},get backupStops(){return backupStops;},get backupInvalidations(){return backupInvalidations;},get recovery(){return recoveryOptions;},get recoveryOpens(){return recoveryOpens;},get recoveryStops(){return recoveryStops;},get invalidations(){return invalidations;},get nav(){return navOptions;},get factories(){return factories;},get stops(){return stops;},get views(){return views;},disconnect:()=>{for(const fn of [...listeners])fn();},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time&&timers.has(key)){timers.delete(key);t.fn();}await drain();}};
}

const sorted=values=>[...values].sort(),now='1970-01-01T00:00:00.000Z';
const scope=normalizedScope(rawScope),expectedProject=new Set([...rows.slice(0,254).map(r=>r.id),rows.at(-1).id]);
async function verifyStoredAndPages(native){
 const facts=await native.read(scope);assert.deepEqual(sorted(Object.keys(facts.refs)),sorted(rows.map(r=>r.id)));
 const snapshot=freeNavigationSnapshot(freeProjection(facts,{scope,now}));
 assert.equal(snapshot.refs.length,603);assert.equal(snapshot.groups.length,1);assert.equal(snapshot.groups[0].id,P);
 assert.deepEqual(sorted(snapshot.groups[0].members),sorted(expectedProject));
 assert.deepEqual(sorted(snapshot.unknown.map(r=>r.id)),sorted(rows.filter(r=>!expectedProject.has(r.id)).map(r=>r.id)));
 assert(snapshot.refs.every(r=>r.nativeTitle===rows.find(row=>row.id===r.id).title));
 const current={snapshot};
 for(const rowLimit of [5,17])for(const groupId of [P,null]){
  const value=projectFreeFrame(current,{role:'workspace',groupId,list:'unknown',rowLimit});
  assert.equal(value.selection.items.length,rowLimit);assert.equal(value.selection.total,groupId?255:348);assert.equal(value.selection.hasMore,true);
  assert(value.selection.items.every(r=>groupId?r.membership==='PROJECT'&&r.projectId===P:r.membership==='UNKNOWN'&&r.projectId===null));
 }
 for(const groupId of [P,null]){
  const found=[];for(let offset=0;;offset+=17){const page=projectFreeFrame(current,{role:'workspace',groupId,list:'unknown',rowOffset:offset,rowLimit:17}).selection;found.push(...page.items.map(r=>r.id));if(!page.hasMore)break;assert(offset<1000);}
  assert.deepEqual(sorted(found),sorted(groupId?expectedProject:rows.filter(r=>!expectedProject.has(r.id)).map(r=>r.id)));assert.equal(new Set(found).size,found.length);
 }
 // Production adaptive page loader reads genuine repository pages, with a
 // pinned revision. It does not receive synthetic accumulated packet facts.
 const requests=[];for(let i=0;i<rows.length;i+=200)requests.push({projects:[P],refs:rows.slice(i,i+200).map(r=>r.id)});
 const pages=await loadFreePages({requests,load:async ids=>({ok:true,page:await native.page(scope,{revision:facts.revision,ids})})});
 assert.deepEqual(sorted(pages.flatMap(p=>Object.keys(p.facts.refs))),sorted(rows.map(r=>r.id)));assert(pages.every(p=>p.revision===facts.revision));
 return facts;
}
test('L owned-mask continuation persists all native refs and exposes exact PROJECT/UNKNOWN frame pages across reopen', {timeout:15000},async t=>{
 const indexedDB=new MockIDBFactory(),databaseName='owned_mask_persistent',base=new ScopeRepository({indexedDB,databaseName});let owner,native;
 const f=fixture({maskOnSurface:1,onPacket:async packet=>{const ack=await owner.ingest(packet,sender,native);assert(['accepted','duplicate'].includes(ack.state),JSON.stringify(ack));return ack;}});
 const sender={tab:{id:1,incognito:false},frameId:0,documentId:f.binding.browserDocumentId};
 const grant={id:'offline_grant',scopeEpoch:1,expiresAt:f.binding.expiresAt,principal:{providerProfile:'offline',transport:'worker-fixed-fetch'}};
 owner=createHostObservationOwner({handshake:{verify:async()=>true,isBound:()=>true,matchesFrame:()=>true},authority:{peek:()=>({state:'verified',grant}),scopeFor:()=>scope},getFrame:async()=>({documentId:f.binding.browserDocumentId,url:f.doc.location.href,documentLifecycle:'active'}),profiles:new Map([[f.profile.id,{...f.profile,urlPolicy:f.urlPolicy}]]),now:()=>0});
 native=new NativeRepository({baseRepository:base,hostObservationGate:owner.gate,clock:()=>now});
 t.after(()=>{f.stop();owner.stop();base.close();});
 await f.start();await f.drain();assert.deepEqual(f.facts().issues,[]);const first=await verifyStoredAndPages(native);
 // A later fully masked scan emits UNKNOWN for previously observed members;
 // actual persistent reducer semantics must retain their stronger PROJECT fact.
 await f.rescan(true);assert.deepEqual(f.facts().issues,[]);const later=await verifyStoredAndPages(native);
 for(const id of expectedProject)assert.deepEqual(later.membership[id],first.membership[id]);
 assert.deepEqual(await native.read(scope),later,'read-only reread must not renew witnesses');
 f.stop();owner.stop();base.close();
 const reopenedBase=new ScopeRepository({indexedDB,databaseName});t.after(()=>reopenedBase.close());const reopened=new NativeRepository({baseRepository:reopenedBase,clock:()=>now});
 assert.deepEqual(await verifyStoredAndPages(reopened),later,'same database survives owner and repository replacement');
 await t.test('real frame client shrinks initial 200-row long-title requests and traverses all persisted history',async()=>{
  const snapshot=freeNavigationSnapshot(freeProjection(later,{scope,now}));
  assert.throws(()=>projectFreeFrame({snapshot},{role:'workspace',groupId:P,list:'unknown',rowLimit:200}),/free-frame-page-too-large/,'raw page size protection remains intact');
  const ui=frameClientFixture(),requests=[];
  ui.setView(async message=>{requests.push(structuredClone(message.query));try{return {ok:true,state:'ready',page:projectFreeFrame({snapshot},{role:'workspace',...message.query}),navigation:[]};}catch(error){assert.equal(error.message,'free-frame-page-too-large');return {ok:false,reason:error.message};}});
  try{await ui.client.start();await drain();assert(ui.nav);assert.equal(ui.pages.length,1);
   const all=[];
   for(const groupId of [P,null]){
    const ids=[];let offset=0;
    while(true){const begin=requests.length,page=await ui.nav.onProjectionRequest({role:'workspace',segment:0,offset:0,limit:8,groupId,list:'unknown',rowOffset:offset,rowLimit:200});assert(page,'automatic bounded split must return a page');
     const attempts=requests.slice(begin);assert.equal(attempts[0].rowLimit,200);assert(attempts.length<=9);assert.equal(attempts.at(-1).rowOffset,offset);
     assert(page.selection.items.length>0);ids.push(...page.selection.items.map(r=>r.id));offset+=page.selection.items.length;if(!page.selection.hasMore)break;assert(offset<604);
    }
    assert.deepEqual(sorted(ids),sorted(groupId?expectedProject:rows.filter(r=>!expectedProject.has(r.id)).map(r=>r.id)));assert.equal(new Set(ids).size,ids.length);all.push(...ids);
   }
   assert.deepEqual(sorted(all),sorted(rows.map(r=>r.id)));assert(requests.some(q=>q.rowLimit===5),'real client size fallback was exercised');
  }finally{ui.client.stop();}
 });
});
