/** Reducer/repository subcase only: terminal is transport metadata, never a coverage proof. */
import {surfaceBatch} from '../../src/host/surface-batch.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
export async function runNonAtomicTerminal(indexedDB){
 const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'terminal_fixture',organizationId:'personal'}),now='2026-10-21T00:00:00Z',databaseName='non_atomic_terminal_'+Math.random().toString(36).slice(2),binding={documentToken:'doc',producerToken:'producer',routeEpoch:1},profile={id:'terminal_fixture',revision:1};
 const windows=[{ids:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'],terminal:false},{ids:['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'],terminal:true}],snapshots=[];
 let base;
 const open=()=>{base=new ScopeRepository({indexedDB,databaseName});return new NativeRepository({baseRepository:base,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'terminal_source',generation:'one'})});};
 let repo=open();
 try{for(const [index,window] of windows.entries()){
  const evidence={profileId:profile.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:index+1,fieldPaths:['history','href'],receiptId:null};
  const proposal={protocol:'vaiwl-host-observation/1',...binding,localSeq:index+1,profileId:profile.id,profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:window.ids.map(id=>({renderKey:'conversation:'+id,entity:'conversation',nativeTitle:index?'Changed '+id:'Initial '+id,titleState:'exact',target:{kind:'resolved',entity:'conversation',nativeId:id,navigationURL:'https://chatgpt.com/c/'+id,liveHandle:null},evidence})),membershipClaims:[],coverageClaims:[],detachedHandles:[]}};
  const batch=surfaceBatch(proposal,{scope,binding,profile,urlPolicy:createURLPolicy(),sourceRevision:index+1,observedAt:now,validUntil:'2026-10-22T00:00:00Z'}),before=await repo.read(scope),result=await repo.apply(scope,{operationId:'terminal_'+index,expectedRevision:before.revision,batch});
  if(!result.ok)throw Error(JSON.stringify(result));
  const facts=await repo.read(scope);snapshots.push({terminal:window.terminal,snapshotVersion:null,windowIds:window.ids,batchInventory:batch.inventory,ids:Object.keys(facts.refs).sort(),titles:Object.fromEntries(Object.entries(facts.refs).map(([id,row])=>[id,row.nativeTitle])),inventories:Object.values(facts.sources).map(s=>s.inventory)});
 }
 const before=await repo.read(scope);base.close();repo=open();const reopened=await repo.read(scope);
 return {boundary:'SURFACE_REDUCER_AND_REPOSITORY_NOT_NATIVE_PAGINATION_OR_MV3',scan:'exhausted-observed-non-atomic',snapshots,reopenIdentical:JSON.stringify(before)===JSON.stringify(reopened),reopenedIds:Object.keys(reopened.refs).sort()};
 }finally{base?.close();}
}
