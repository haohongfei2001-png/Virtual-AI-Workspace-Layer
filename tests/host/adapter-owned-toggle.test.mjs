import test from 'node:test';
import assert from 'node:assert/strict';
import {installTreeWalkerDouble} from './tree-walker-double.mjs';
import {createChatGPTAdapter} from '../../src/host/chatgpt-adapter.mjs';
import {LEGACY_SURFACE_PROFILE} from '../../src/host/surface-discovery.mjs';
const C='33333333-3333-4333-8333-333333333333';
// Production adapter/discovery; explicit local DOM doubles, not browser evidence.
function fixture(options={}){
 let masked=false,observer;const selectors=new Map(),listeners=new Map(),packets=[],passes=[];
 const document={location:{href:'https://chatgpt.com/c/'+C},documentElement:{dataset:{}},querySelectorAll:s=>selectors.get(s)??[],querySelector:()=>null,addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:t=>listeners.delete(t)};
 function node(tag='DIV',parent=null,attrs={},text=''){
  const n={tagName:tag,parentNode:parent,parentElement:parent,ownerDocument:document,isConnected:true,hidden:false,attrs,textContent:text,children:[],style:{display:'block',visibility:'visible'},getAttribute:k=>attrs[k]??null,hasAttribute:k=>Object.hasOwn(attrs,k),getClientRects:()=>[{}],getBoundingClientRect:()=>({x:220,y:70,width:700,height:400}),contains(other){for(let p=other;p;p=p.parentElement)if(p===n)return true;return false;},querySelectorAll:()=>n.children};parent?.children.push(n);return n;
 }
 const main=node('MAIN'),header=node('HEADER',main),heading=node('H1',header,{},'Current title'),reading=node('SECTION',main,{'data-conversation-id':C}),composer=node('FORM',main),slot=node('DIV',header),history=node('NAV');
 history.getBoundingClientRect=()=>({x:0,y:70,width:200,height:400});header.getBoundingClientRect=()=>({x:220,y:0,width:700,height:60});composer.getBoundingClientRect=()=>({x:220,y:480,width:700,height:90});slot.getBoundingClientRect=()=>({x:220,y:0,width:40,height:40});
 for(let i=0;i<800;i++){const id='11111111-1111-4111-8111-'+i.toString(16).padStart(12,'0');node('A',history,{href:'https://chatgpt.com/c/'+id},'Native '+i+'x'.repeat(180));}
 for(const [s,n]of [[LEGACY_SURFACE_PROFILE.regions.history,history],['main > header',header],['main > section[aria-label="Conversation"]',reading],['main > form#composer',composer],['main > header > .navigation-slot',slot],[LEGACY_SURFACE_PROFILE.currentConversationReading,reading],[LEGACY_SURFACE_PROFILE.currentConversationHeader,heading]])selectors.set(s,[n]);
 document.defaultView={crypto,getComputedStyle:n=>({...n.style,visibility:masked&&n===reading?'hidden':n.style.visibility}),MutationObserver:class{constructor(cb){observer=this;this.cb=cb;}observe(){}disconnect(){}},addEventListener(){},removeEventListener(){}};installTreeWalkerDouble(document);
 const profile={...LEGACY_SURFACE_PROFILE,currentBody:undefined},binding={documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(100000).toISOString()},isOwnedMask=n=>masked&&n===reading;
 const adapter=createChatGPTAdapter({document,profile,isOwnedMask,now:()=>0,...options});
 return {document,reading,history,heading,observer:()=>observer,listeners,profile,binding,isOwnedMask,adapter,packets,passes,mask:()=>masked=true,loseCurrent:()=>delete reading.attrs['data-conversation-id'],requestScan:()=>listeners.get('toggle')?.({type:'toggle'}),restoreCurrent:()=>reading.attrs['data-conversation-id']=C,start:(change,{eachPacket=false,onPass=()=>{}}={})=>adapter.start({binding,ingestionPass:async m=>{passes.push(m);onPass(m);return {ok:true};},emit:async p=>{packets.push(p);if(eachPacket||packets.length===1)change();return {state:'accepted',localSeq:p.localSeq,receiptId:'fixture'};}})};
}
const settle=async()=>{for(let i=0;i<300;i++)await new Promise(resolve=>setImmediate(resolve));};
const ids=f=>new Set(f.packets.flatMap(p=>p.payload.candidates).map(c=>c.target.nativeId));

const ack=p=>({state:'accepted',localSeq:p.localSeq,receiptId:'fixture'});
async function paused(t,options={}){
 const f=fixture(options);t.after(()=>f.adapter.stop());let release;
 await f.adapter.start({binding:f.binding,ingestionPass:async m=>{f.passes.push(m);return {ok:true};},emit:p=>{f.packets.push(p);return f.packets.length===1?new Promise(resolve=>release=()=>resolve(ack(p))):Promise.resolve(ack(p));}});
 await settle();assert.equal(f.packets.length,1);return {...f,release};
}
test('owned toggle during pending fragment keeps the finite producer pass and drains every native ID',async t=>{
 const owned={},f=await paused(t,{isOwnedSurface:node=>node===owned});
 f.listeners.get('toggle')({target:owned,newState:'open'});f.release();await settle();
 assert.equal(ids(f).size,801);assert.deepEqual(f.passes.map(p=>p.phase),['start','end'],'owned surface must not replace directory pass');
});
for(const mode of ['native','forged','throws','truthy'])test(mode+' toggle invalidates the native directory and observes a changed leading title',async t=>{
 const owned={},target=mode==='forged'?{dataset:{vaOwned:'forged'},closest:()=>owned}:{};
 const f=await paused(t,{isOwnedSurface:node=>{if(mode==='throws')throw Error('unavailable');if(mode==='truthy')return 'yes';return node===owned;}});
 f.history.children[0].textContent='Native renamed during toggle';assert.doesNotThrow(()=>f.listeners.get('toggle')({target,preserveProducerCursor:true,newState:'open'}));f.release();await settle();
 assert.equal(ids(f).size,801);assert.deepEqual(f.passes.map(p=>p.phase),['start','start','end']);
 assert(f.packets.some(p=>p.payload.candidates.some(c=>c.nativeTitle==='Native renamed during toggle')));
});
test('owned toggle cannot consume a pending real native mutation invalidation',async t=>{
 const owned={},f=await paused(t,{isOwnedSurface:node=>node===owned});f.history.children[0].textContent='Native changed before owned toggle';
 f.observer().cb([{type:'characterData',target:f.history.children[0]}]);f.listeners.get('toggle')({target:owned,newState:'closed'});f.release();await settle();
 assert.equal(ids(f).size,801);assert.deepEqual(f.passes.map(p=>p.phase),['start','start','end']);assert(f.packets.some(p=>p.payload.candidates.some(c=>c.nativeTitle==='Native changed before owned toggle')));
});
for(const method of ['loadedPages','loadedCandidatePages'])test('owned toggle invalidates external '+method+' without cancelling private producer',async t=>{
 const owned={},f=await paused(t,{isOwnedSurface:node=>node===owned}),stream=f.adapter[method](new AbortController().signal);
 assert.equal((await stream.next()).done,false);f.listeners.get('toggle')({target:owned,newState:'open'});
 await assert.rejects(stream.next(),/stale-host-loaded-read/);f.release();await settle();assert.equal(ids(f).size,801);assert.deepEqual(f.passes.map(p=>p.phase),['start','end']);
});
test('owned toggle still rechecks current native identity and restarts a stale current association',async t=>{
 const owned={},f=await paused(t,{isOwnedSurface:node=>node===owned});f.loseCurrent();f.listeners.get('toggle')({target:owned,newState:'closed'});f.release();await settle();
 assert.equal(ids(f).size,801);assert.deepEqual(f.passes.map(p=>p.phase),['start','start','end']);
});
test('owned toggle schedules a fresh configured body observation while retaining the directory pass',async t=>{
 const owned={},f=fixture({isOwnedSurface:node=>node===owned,profile:{...LEGACY_SURFACE_PROFILE,sendIntent:undefined}});t.after(()=>f.adapter.stop());let release;
 await f.adapter.start({binding:f.binding,ingestionPass:async m=>{f.passes.push(m);return {ok:true};},emit:p=>{f.packets.push(p);if(p.kind==='surface-delta'&&!release)return new Promise(resolve=>release=()=>resolve(ack(p)));return Promise.resolve(ack(p));}});
 await settle();assert.equal(typeof release,'function');assert.deepEqual(f.packets.filter(p=>p.kind==='current-observation')[0].payload.body.messageIds,[]);
 const message={parentNode:f.reading,parentElement:f.reading,ownerDocument:f.document,isConnected:true,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:k=>k==='data-message-id'?'fresh-native-message':null};f.reading.children.push(message);
 f.listeners.get('toggle')({target:owned,newState:'closed'});release();await settle();
 assert.deepEqual(f.packets.filter(p=>p.kind==='current-observation').at(-1).payload.body.messageIds,['fresh-native-message']);assert.deepEqual(f.passes.map(p=>p.phase),['start','end']);
});
