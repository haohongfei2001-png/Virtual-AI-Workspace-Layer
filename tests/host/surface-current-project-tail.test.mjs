import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSurfaceDiscovery,LEGACY_SURFACE_PROFILE as profile} from '../../src/host/surface-discovery.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';

// L-only finite DOM traversal; no browser or authorization claim.
function fixture({masked=false,owned=true,limit=2}={}){
 const doc={location:{href:'https://chatgpt.com/g/p1/project'}};
 function node(tag='DIV',text='',attrs={},parent=null){
  const n={tagName:tag,textContent:text,attrs,parentNode:parent,parentElement:parent,ownerDocument:doc,isConnected:true,children:[],style:{},hidden:false,
   getAttribute(k){return attrs[k]??null;},hasAttribute(k){return Object.hasOwn(attrs,k);},getClientRects(){return [{}];},
   contains(other){for(let p=other;p;p=p.parentElement)if(p===n)return true;return false;},
   matches(s){return s==='a[href]'?tag==='A'&&attrs.href!==undefined:s==='a[href],button'&&(tag==='BUTTON'||tag==='A'&&attrs.href!==undefined);}
  };if(parent)parent.children.push(n);return n;
 }
 const body=node('BODY'),main=node('MAIN','',{},body),header=node('HEADER','',{},main),h1=node('H1','Native project',{},header),reading=node('SECTION','',{},main),heading=node('H2','Native project',{},reading),members=node('NAV','',{'data-project-id':'p1'},reading),wrapper=node('DIV','',{},members),link=node('A','Fresh member',{href:'/c/c1'},wrapper),projects=node('SECTION','',{},body),history=node('NAV','',{},body);
 for(let i=2;i<=6;i++)node('A','Member '+i,{href:'/c/c'+i},wrapper);for(let i=1;i<=6;i++)node('A','History '+i,{href:'/c/c'+i},history);
 const map=new Map([[profile.regions.projects,[projects]],[profile.regions.history,[history]],[profile.regions.members,[members]],[profile.currentProjectTitle,[heading]],[profile.currentProjectHeader,[h1]]]);doc.querySelectorAll=s=>map.get(s)??[];
 function computed(n){let visibility;for(let p=n;p;p=p.parentElement){if(masked&&p===reading){visibility='hidden';break;}if(p.style.visibility){visibility=p.style.visibility;break;}}return {display:n.style.display??'block',visibility:visibility??'visible'};}
 doc.defaultView={crypto:{randomUUID},getComputedStyle:computed};
 doc.createTreeWalker=root=>{const all=[];function visit(n){for(const c of n.children){all.push(c);visit(c);}}visit(root);let i=0;return {nextNode:()=>all[i++]??null};};
 const discovery=createSurfaceDiscovery({document:doc,binding:{documentToken:'doc',routeEpoch:1},profile:{...profile,maxCandidates:limit},urlPolicy:createURLPolicy({profile:{projectId:({container})=>container,conversationId:id=>id}}),isOwnedMask:n=>owned&&masked&&n===reading});
 return {doc,discovery,reading,heading,header:h1,members,wrapper,link,main,computed};
}
function pass(f,start=null){const pages=[];let cursor=start;for(let i=0;i<40;i++){const page=f.discovery.scanPage(cursor);pages.push(page.payload);cursor=page.cursor;if(!cursor)return pages;}assert.fail('finite pass stalled');}
const canonical=p=>p.candidates.filter(c=>c.entity==='project'&&c.evidence.fieldPaths.includes('current-project-route'));
for(const limit of [1,2,256])test('finite pass omits redundant Project-only tail with maxCandidates '+limit,()=>{
 const f=fixture({limit});try{
  const pages=pass(f);assert.equal(canonical(pages[0]).length,1);
  assert(pages.slice(1).every(p=>!canonical(p).length||p.candidates.length>1||p.membershipClaims.length),'continuation cannot contain only repeated parent');
  if(limit>1)assert(pages.filter(p=>p.membershipClaims.length).every(p=>canonical(p).length===1),'member pages retain parent admission');
  assert(pages.every(p=>p.candidates.length<=limit));
  const refs=pages.flatMap(p=>p.candidates).filter(c=>c.entity==='conversation');assert.deepEqual(refs.map(c=>c.target.nativeId),['c1','c2','c3','c4','c5','c6']);
  assert.equal(pages.flatMap(p=>p.membershipClaims).filter(c=>c.asserted==='PROJECT'&&c.projectId==='p1').length,6);
  if(limit<6)assert(pages.slice(1).some(p=>p.membershipClaims.length),'later member pages retain explicit Project claims');
 }finally{f.discovery.stop();}
});
test('fresh finite pass publishes real current Project rename again',()=>{
 const f=fixture({limit:2});try{const first=pass(f);assert.equal(canonical(first[0])[0].nativeTitle,'Native project');f.heading.textContent=f.header.textContent='Renamed native project';const next=pass(f);assert.equal(canonical(next[0])[0].nativeTitle,'Renamed native project');assert(next.flatMap(canonical).every(c=>c.nativeTitle==='Renamed native project'));}finally{f.discovery.stop();}
});
test('route change rejects prior cursor and fresh pass publishes new canonical Project',()=>{
 const f=fixture({limit:1});try{const old=f.discovery.scanPage();assert(old.cursor);f.doc.location.href='https://chatgpt.com/g/p2/project';f.members.attrs['data-project-id']='p2';assert.throws(()=>f.discovery.scanPage(old.cursor),/stale-surface-cursor/);const next=pass(f);assert.equal(canonical(next[0])[0].target.nativeId,'p2');assert.equal(next.reduce((n,p)=>n+canonical(p).length,0),1);}finally{f.discovery.stop();}
});

// The existing fixture runs the actual adapter + discovery + surface reducer.
import {runMemberVisibilityProbe} from './fixtures/host-scale-member-mask-double.mjs';
test('adapter drains deduplicated history tail without empty or Project-only RPC',async()=>{
 const f=await runMemberVisibilityProbe({});try{
  assert.equal(f.facts().membership,1000);assert.equal(f.facts().unknown,0);
  const surfaces=f.packets.filter(p=>p.kind==='surface-delta').map(p=>p.payload);
  assert(surfaces.every(p=>p.candidates.length||p.membershipClaims.length||p.detachedHandles.length),'empty tail pages must not emit RPC');
  assert(surfaces.some(p=>canonical(p).length),'first page retains canonical Project');
  for(const p of surfaces.filter(p=>canonical(p).length)){
   const ids=p.candidates.filter(c=>c.entity==='conversation').map(c=>Number.parseInt(c.target.nativeId.split('-').at(-1),16));
   assert(ids.length>0,'no redundant Project-only tail RPC');
   assert(p.membershipClaims.length>0,'member fragments may retain canonical parent');
  }
  assert.equal(f.facts().events.filter(e=>e==='end').length,1,'finite pass terminates exactly once');
 }finally{f.stop();}
});

test('rejected first fragment leaves later member pages self-contained but pass cancelled',async()=>{
 const f=await runMemberVisibilityProbe({});f.stop();const packets=[],events=[];
 try{
  await f.adapter.start({binding:{documentToken:'retry-doc',producerToken:'retry-producer',browserDocumentId:'retry-browser',routeEpoch:4,origin:'https://chatgpt.com',expiresAt:new Date(20000).toISOString()},ingestionPass:async m=>{events.push(m.phase);return {ok:true};},emit:async p=>{packets.push(p);return {state:packets.length===1?'rejected':'accepted',localSeq:p.localSeq,receiptId:'test-ack'};}});
  for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve));
  assert(packets.length>1,'independent later pages are still observed');
  assert.deepEqual(events,['start','cancel'],'failed pass never claims successful completion');
  for(const p of packets.slice(1).filter(p=>p.kind==='surface-delta'&&p.payload.membershipClaims.length)){
   const ids=new Set(canonical(p.payload).map(c=>c.target.nativeId));
   assert(p.payload.membershipClaims.filter(c=>c.asserted==='PROJECT').every(c=>ids.has(c.projectId)),'later member fragments retain native parent evidence');
  }
 }finally{f.stop();}
});
