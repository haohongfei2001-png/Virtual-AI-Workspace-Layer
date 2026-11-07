/** L-only actual discovery -> wire splitter -> observation owner -> Native/Shared
 * repositories. DOM, identity, wall clock and IDB are explicit synthetic doubles. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MockIDBFactory} from '../../b23/mock-idb.mjs';
import {ScopeRepository} from '../../../src/b1/scope-repository.mjs';
import {normalizedScope} from '../../../src/b1/identity.mjs';
import {WorkspaceRepository} from '../../../src/data/repository.mjs';
import {NativeRepository} from '../../../src/data/native-repository.mjs';
import {nativeWitnessActive} from '../../../src/data/native-facts.mjs';
import {createHostObservationOwner} from '../../../src/runtime/host-observation-owner.mjs';
import {createSurfaceDiscovery,LEGACY_SURFACE_PROFILE} from '../../../src/host/surface-discovery.mjs';
import {splitSurfacePayload} from '../../../src/host/surface-fragments.mjs';
import {createURLPolicy} from '../../../src/host/url-policy.mjs';
import {hostScaleRows} from '../fixtures/host-scale-world.mjs';

const origin='https://chatgpt.com',P='g-p-00000000000000000000000000000001';
const fields={projects:['nativeName','nativeUrl','availability'],refs:['nativeTitle','nativeUrl','availability'],membership:['state','projectId']};
export async function fixture({count=1000,longTitles=true,record=true}={}){
 assert(Number.isInteger(count)&&count>0&&count<=1000);
 const rows=[...hostScaleRows({size:1000,distribution:'single-project',longTitles})].slice(0,count);
 const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'ingestion_fixture',organizationId:'personal'});
 const urlPolicy=createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}}),profile={...LEGACY_SURFACE_PROFILE,urlPolicy};
 const binding={documentToken:'document',producerToken:'producer',routeEpoch:1};let wall=1000,bound=true,seq=0;
 const grant={id:'grant',scopeEpoch:1,expiresAt:new Date(wall+60000).toISOString()},sender={tab:{id:1,incognito:false},frameId:0,documentId:'document'};
 const doc={location:{href:origin+'/'},defaultView:{crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000000'},getComputedStyle:n=>n.style}};
 function node(tag='DIV',text='',attrs={},parent=null){const n={tagName:tag,textContent:text,attrs,parentNode:parent,parentElement:parent,ownerDocument:doc,isConnected:true,children:[],style:{display:'block',visibility:'visible'},getAttribute(k){return this.attrs[k]??null;},getClientRects(){return [{}];},contains(other){for(let p=other;p;p=p.parentElement)if(p===this)return true;return false;},querySelectorAll(){return this.children;},matches(s){return s==='a[href]'?this.tagName==='A'&&this.attrs.href!==undefined:s==='a[href],button'?(this.tagName==='A'&&this.attrs.href!==undefined)||this.tagName==='BUTTON':false;}};if(parent)parent.children.push(n);return n;}
 const reading=node(),members=node('NAV','',{'data-project-id':P},reading),heading=node('H2','原生项目 0',{},reading),header=node('H1','原生项目 0'),projects=node(),history=node();
 node('A','原生项目 0',{href:'/g/'+P+'/project'},projects);
 for(const row of rows){node('A',row.title,{href:'/c/'+row.id},members);node('A',row.title,{href:'/c/'+row.id},history);}
 const selectors=new Map([[profile.regions.projects,[projects]],[profile.regions.history,[history]],[profile.regions.members,[]],[profile.currentProjectTitle,[]],[profile.currentProjectHeader,[]]]);
 doc.querySelectorAll=s=>selectors.get(s)??[];
 const metrics={historyVisits:0,memberVisits:0};
 doc.createTreeWalker=(root,what)=>{assert.equal(what,1);const values=[...root.children];let i=0;return {nextNode(){const value=values[i++]??null;if(value){if(root===history)metrics.historyVisits++;if(root===members)metrics.memberVisits++;}return value;}};};
 const discovery=createSurfaceDiscovery({document:doc,binding,urlPolicy,profile});
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'ingestion_'+randomUUID()}),workspace=new WorkspaceRepository({baseRepository:base});
 const owner=createHostObservationOwner({handshake:{verify:async()=>bound,isBound:()=>bound,matchesFrame:()=>bound},authority:{peek:()=>bound?{state:'verified',grant}:{state:'unverified'},scopeFor:()=>bound?scope:null},getFrame:async()=>({documentId:'document',url:doc.location.href,documentLifecycle:'active'}),profiles:new Map([[profile.id,profile]]),now:()=>wall});
 const native=new NativeRepository({baseRepository:base,workspaceRepository:workspace,hostObservationGate:owner.gate,prepareInitialHostIndex:true,clock:()=>new Date(wall).toISOString()});
 const db=await base.open(),transaction=db.transaction.bind(db);let transactions=[];
 if(record)db.transaction=(names,mode='readonly',...rest)=>{transactions.push({names:typeof names==='string'?[names]:[...names],mode});return transaction(names,mode,...rest);};
 const methods={page:native.page.bind(native),apply:native.apply.bind(native),version:native.version.bind(native)};
 let capture=null,current=null;const events=[];
 if(record)native.page=async(...args)=>{const result=await methods.page(...args);if(current){capture=result;current.pageCalls++;}return result;};
 if(record)native.version=async(...args)=>{const result=await methods.version(...args);if(current)current.versionCalls++;return result;};
 if(record)native.apply=async(...args)=>{
  const [s,request]=args,admission=owner.gate(s,request);assert(current&&capture&&admission,'recorder only observes actual owner apply');assert.equal(request.expectedRevision,capture.revision);
  const reasons={};
  for(const [table,keys] of Object.entries(fields))for(const row of request.batch[table]){
   const old=capture.facts[table][row.id];let kind=!old?'new':keys.some(k=>row[k]!==old[k])?'semantic-change':old.sourceId!==admission.sourceId||old.generation!==admission.generation?'source-revalidation':!nativeWitnessActive(old,capture.facts,new Date(wall).toISOString())?'inactive-witness':'unchanged-active';
   reasons[table+':'+kind]=(reasons[table+':'+kind]??0)+1;
  }
  const source=capture.facts.sources[admission.sourceId];reasons.source=!source?'absent':nativeWitnessActive({...source,sourceId:admission.sourceId},capture.facts,new Date(wall).toISOString())?'active':'inactive';
  const result=await methods.apply(...args);current.applies.push({expectedRevision:request.expectedRevision,revision:result.revision,ok:result.ok,reasons});return result;
 };
 async function send(payload,label='observation'){
  assert.equal(current,null);const start=transactions.length;
  const proposal={protocol:'vaiwl-host-observation/1',...binding,routeEpoch:doc.location.href===origin+'/'?1:2,localSeq:++seq,profileId:profile.id,profileVersion:profile.revision,bodyProofId:null,kind:'surface-delta',payload};
  current={label,bytes:new TextEncoder().encode(JSON.stringify(proposal)).length,candidates:payload.candidates.length,claims:payload.membershipClaims.length,pageCalls:0,versionCalls:0,applies:[]};capture=null;
  try{const result=await owner.ingest(proposal,sender,native);current.result=result.state;current.transactions=transactions.slice(start);events.push(current);return result;}finally{current=null;capture=null;}
 }
 function* proposals(){let cursor=null,first=true;do{const result=discovery.scanPage(cursor);cursor=result.cursor;const source={protocol:'vaiwl-host-observation/1',...binding,routeEpoch:doc.location.href===origin+'/'?1:2,localSeq:seq+1,profileId:profile.id,profileVersion:profile.revision,bodyProofId:null,kind:'surface-delta',payload:result.payload};if(result.payload.candidates.length||result.payload.membershipClaims.length||result.payload.detachedHandles.length||first)yield* splitSurfacePayload(result.payload,source);first=false;}while(cursor);}

 return {scope,native,workspace,owner,events,metrics,rows,history,members,heading,header,
  async publish(label='scan',limit=Infinity){const start=events.length;for(const payload of proposals()){const result=await send(payload,label);assert.equal(result.state,'accepted',JSON.stringify(result));if(events.length-start>=limit)break;}return {sent:events.length-start};},
  send,proposals,read:()=>native.read(scope),
  project(){doc.location.href=origin+'/g/'+P+'/project';selectors.set(profile.regions.members,[members]);selectors.set(profile.currentProjectTitle,[heading]);selectors.set(profile.currentProjectHeader,[header]);},
  advance(ms){wall+=ms;grant.expiresAt=new Date(wall+60000).toISOString();},revoke(){bound=false;},
  async revokeSource(){const before=await native.read(scope),source=Object.values(before.sources).find(s=>!s.revoked);assert.equal((await native.invalidate(scope,{operationId:'revoke_'+seq,expectedRevision:before.revision,sourceId:source.id})).ok,true);},
  close(){discovery.stop();owner.stop();db.transaction=transaction;base.close();},
 };
}
export function summarize(events){const reasons={},applies=events.flatMap(e=>e.applies),tx=events.flatMap(e=>e.transactions);for(const a of applies)for(const [k,v]of Object.entries(a.reasons))if(typeof v==='number')reasons[k]=(reasons[k]??0)+v;return {packets:events.length,applyCalls:applies.length,successfulApplies:applies.filter(a=>a.ok).length,readwriteTransactions:tx.filter(t=>t.mode==='readwrite').length,readonlyTransactions:tx.filter(t=>t.mode==='readonly').length,versionFences:events.reduce((n,e)=>n+e.versionCalls,0),bytes:events.reduce((n,e)=>n+e.bytes,0),reasons};}
