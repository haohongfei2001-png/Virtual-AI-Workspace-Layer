/** L-only causal probe. Real unchanged adapter/discovery/fragment modules and surfaceBatch converter.
 * DOM double implements inherited computed visibility, unlike the older unit fixture.
 * No browser, storage, grant, network, wall-time or full Host acceptance claim.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createChatGPTAdapter} from '../../src/host/chatgpt-adapter.mjs';
import {LEGACY_SURFACE_PROFILE as profile} from '../../src/host/surface-discovery.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {surfaceBatch} from '../../src/host/surface-batch.mjs';
import {hostScaleRows} from './fixtures/host-scale-world.mjs';
const P='g-p-00000000000000000000000000000001';
const origin='https://chatgpt.com';
const scope={verified:true,provider:'chatgpt',accountId:'a',organizationId:'b'};
const rows=[...hostScaleRows({size:1000,distribution:'single-project'})].slice(0,603);
function fixture({maskedInitially=false,maskOnSurface=0,inherit=true,nativeHidden=null,nativeHiddenIndex=300}={}){
 let masked=maskedInitially,visits=0,surfacePackets=0,sourceRevision=0,observer,waitResolve;
 let ended=new Promise(r=>waitResolve=r);
 const listeners=new Map(),events=[],packets=[],issues=[],projects=new Set();
 const binding={documentToken:'doc-'+randomUUID(),producerToken:'producer-'+randomUUID(),browserDocumentId:'browser-'+randomUUID(),routeEpoch:4,origin,expiresAt:new Date(20000).toISOString()};
 const doc={location:{href:origin+'/g/'+P+'/project'},documentElement:{dataset:{}},addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:t=>listeners.delete(t),querySelectorAll:s=>selectors.get(s)??[],querySelector:()=>null};
 function node(tag='DIV',text='',attrs={},parent=null){const n={tagName:tag,textContent:text,attrs,parentNode:parent,parentElement:parent,ownerDocument:doc,isConnected:true,children:[],style:{display:'block'},getAttribute(k){return this.attrs[k]??null;},hasAttribute(k){return Object.hasOwn(this.attrs,k);},getClientRects(){return [{}];},getBoundingClientRect(){return {x:0,y:0,width:100,height:100};},contains(other){for(let p=other;p;p=p.parentElement)if(p===this)return true;return false;},querySelectorAll(){const all=[];const visit=n=>{for(const c of n.children){all.push(c);visit(c);}};visit(this);return all;},matches(selector){return selector==='a[href],button'?this.tagName==='BUTTON'||this.tagName==='A'&&this.getAttribute('href')!==null:selector==='a[href]'?this.tagName==='A'&&this.getAttribute('href')!==null:false;}};if(parent)parent.children.push(n);return n;}
 const body=node('BODY'),aside=node('ASIDE','',{},body),main=node('MAIN','',{},body),header=node('HEADER','',{},main),h1=node('H1','Native project',{},header),reading=node('SECTION','',{},main),h2=node('H2','Native project',{},reading),memberRoot=node('NAV','',{'data-project-id':P},reading),projectRoot=node('SECTION','',{},aside),history=node('NAV','',{},aside);
 node('A','Native project',{href:'/g/'+P+'/project'},projectRoot);
 for(const row of rows){node('A',row.title,{href:'/c/'+row.id},memberRoot);node('A',row.title,{href:'/c/'+row.id},history);}
 if(nativeHidden){const n=memberRoot.children[nativeHiddenIndex];if(nativeHidden==='visibility-hidden')n.style.visibility='hidden';else if(nativeHidden==='display-none')n.style.display='none';else if(nativeHidden==='hidden')n.hidden=true;else if(nativeHidden==='aria-hidden')n.attrs['aria-hidden']='true';else if(nativeHidden==='visibility-collapse')n.style.visibility='collapse';else throw Error('invalid-negative-case');}
 const selectors=new Map([[profile.regions.projects,[projectRoot]],[profile.regions.history,[history]],[profile.regions.members,[memberRoot]],[profile.currentProjectTitle,[h2]],[profile.currentProjectHeader,[h1]],[profile.currentConversationReading,[reading]],[profile.currentBody.rootSelector,[reading]]]);
 function computed(n){let visibility=n.style.visibility;for(let p=n;!visibility&&p;p=p.parentElement){if(masked&&(p===reading||p===history)){visibility='hidden';break;}if(inherit&&p.style.visibility)visibility=p.style.visibility;if(!inherit)break;}return {display:n.style.display??'block',visibility:visibility??'visible'};}
 doc.defaultView={crypto:{randomUUID},getComputedStyle:computed,MutationObserver:class{constructor(cb){observer=this;this.cb=cb;}observe(){}disconnect(){}},addEventListener(){},removeEventListener(){}};
 doc.createTreeWalker=(root,what)=>{assert.equal(what,1);const all=root.querySelectorAll(),count=all.length;let i=0;return {nextNode(){const n=i<count?all[i++]:null;if(n)visits++;return n;}};};
 const urlPolicy=createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}});
 const ownedSurface={};let candidateReads=0;
 memberRoot.querySelector=selector=>memberRoot.children.find(n=>selector===`a[href$="${n.attrs.href}"]`)??null;
 const adapter=createChatGPTAdapter({document:doc,profile,urlPolicy,isOwnedSurface:n=>n===ownedSurface,priorityConversationId:()=>rows.at(-1).id,isOwnedMask:n=>masked&&(n===reading||n===history),now:()=>0,elapsedNow:()=>0,onObservationIssue:v=>issues.push(v)});
 function toggle(value){masked=value;listeners.get('toggle')?.({type:'toggle',target:ownedSurface,newState:value?'open':'closed'});}
 function admit(p){if(p.kind!=='surface-delta')return;const b=surfaceBatch(p,{scope,binding,profile,urlPolicy,sourceRevision:++sourceRevision,observedAt:'1970-01-01T00:00:00.000Z',validUntil:'1970-01-01T00:00:20.000Z',knownProjects:[...projects]});for(const x of b.projects)projects.add(x.id);}
 const facts=()=>({renderedMembers:memberRoot.children.length,surfacePackets,visits,issues:[...issues],masked,computed:{reading:computed(reading).visibility,members:computed(memberRoot).visibility,link:computed(memberRoot.children[0]).visibility},events:[...events]});
 return {get candidateReads(){return candidateReads;},doc,adapter,reading,memberRoot,history,packets,facts,toggle,
  async start(){await adapter.start({binding,ingestionPass:async e=>{events.push(e.phase);if(e.phase==='end')waitResolve();return {ok:true};},emit:async p=>{packets.push(p);admit(p);if(p.kind==='surface-delta'){surfacePackets++;if(surfacePackets===maskOnSurface){toggle(true);for await(const candidate of adapter.loadedCandidatePages()){candidateReads++;assert.equal(candidate.payload.membershipClaims.length,0);assert.equal(candidate.payload.candidates.length,0);}}}return {state:'accepted',localSeq:p.localSeq,receiptId:'L-ack'};}});},
  drain:()=>ended,
  async rescan(value){ended=new Promise(r=>waitResolve=r);toggle(value);await ended;},
  stop:()=>adapter.stop(),
 };
}

// L-only packet evidence: no repository state, UI reachability or durable membership claim.
const payload=p=>p.kind==='current-observation'?p.payload.surface:p.payload;
const claimIds=(packets,kind)=>new Set(packets.flatMap(p=>payload(p).membershipClaims).filter(c=>c.asserted===kind).map(c=>c.conversationId));
const sorted=values=>[...values].sort();
for(const hidden of [null,'visibility-hidden'])test('L priority tail + owned toggle emits bounded claims and fresh visible claims after unmask: '+(hidden??'all members'),{timeout:5000},async t=>{
 const f=fixture({maskOnSurface:1,nativeHidden:hidden});t.after(()=>f.stop());
 await f.start();await f.drain();
 const first=f.packets.find(p=>p.kind==='surface-delta');
 assert(first.payload.membershipClaims.some(c=>c.conversationId===rows.at(-1).id&&c.asserted==='PROJECT'),'actual tail is observed before owned mask');
 assert.equal(f.candidateReads,1);
 const discovered=new Set(f.packets.flatMap(p=>payload(p).candidates).filter(c=>c.entity==='conversation').map(c=>c.target.nativeId));
 assert.deepEqual(sorted(discovered),sorted(rows.map(r=>r.id)),'packet candidate union contains exact native IDs');
 // The first discovery page contains one Project, the prioritized tail and 254
 // ordinary members. Its pre-mask fragments may legitimately finish after toggle.
 const visiblePage=new Set([...rows.slice(0,254).map(r=>r.id),rows.at(-1).id]);
 const unseen=rows.filter(r=>!visiblePage.has(r.id)).map(r=>r.id);
 const later=f.packets.slice(f.packets.indexOf(first)+1),unknown=claimIds(later,'UNKNOWN');
 for(const id of unseen)assert(unknown.has(id),'later masked packets explicitly report UNKNOWN for '+id);
 const emittedProject=claimIds(f.packets,'PROJECT');
 assert.deepEqual(sorted(emittedProject),sorted(visiblePage),'masked packets cannot upgrade any member outside the visible initial page');
 assert.equal(f.facts().events.at(-1),'end');
 assert.deepEqual(f.facts().computed,{reading:'hidden',members:'hidden',link:'hidden'});
 const beforeUnmask=f.packets.length;
 await f.rescan(false);
 const fresh=f.packets.slice(beforeUnmask),expected=rows.filter((_,i)=>!hidden||i!==300).map(r=>r.id);
 assert.deepEqual(sorted(claimIds(fresh,'PROJECT')),sorted(expected),'only fresh post-unmask packets establish the expected member set');
 if(hidden)assert(claimIds(fresh,'UNKNOWN').has(rows[300].id),'native hidden member remains an explicit UNKNOWN proposal');
 for(const p of f.packets){assert.deepEqual(payload(p).coverageClaims,[]);for(const c of payload(p).membershipClaims)if(c.asserted==='PROJECT')assert.equal(c.projectId,P);}
 assert.equal(f.facts().events.at(-1),'end');assert.deepEqual(f.facts().issues,[]);
});
