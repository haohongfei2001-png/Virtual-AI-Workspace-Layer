import {createFreeReadService} from '../src/runtime/free-read-service.mjs';
import {FreeRuntimeService} from '../src/data/free-runtime-service.mjs';
import { FreeEvidenceRepository } from '../src/data/free-evidence-repository.mjs';
import { digest, stable } from '../src/data/hash.mjs';
import { ScopeRepository } from '../src/b1/scope-repository.mjs';
import { createDocumentBindingBroker } from '../src/b1/document-binding-broker.mjs';
import { WorkspaceRepository } from '../src/data/repository.mjs';
import { NativeRepository } from '../src/data/native-repository.mjs';
import { nativeSeed, syntheticNativeGate } from './native-seed.mjs';
import { routeInfo, syntheticURL, scopeOf, FIXTURE_NOW } from './data.mjs';
import { persistentSeed, syntheticEvidenceGate } from './persistent-seed.mjs';
/** Same B1 database in v2. Only extension origin is durable product storage.
 * Page-mode uses the same code in its labelled host-origin test harness.
 */
export function createFixtureService({indexedDB,extensionId,getFrame,makeId,calibrationSourceFor=null}){
  const repository=new ScopeRepository({indexedDB,databaseName:'vaiwl-hf-synthetic-v1'});
  const workspaces=new WorkspaceRepository({baseRepository:repository,evidenceGate:syntheticEvidenceGate});
  const native=new NativeRepository({baseRepository:repository,workspaceRepository:workspaces,observationGate:syntheticNativeGate,clock:()=>FIXTURE_NOW});
  const evidence=new FreeEvidenceRepository({baseRepository:repository,clock:()=>FIXTURE_NOW,observationGate:scope=>syntheticEvidenceGate(scope)==='synthetic'?{channel:'synthetic',sourceId:'free_fixture_sends',generation:'fixture_v1'}:null});
  const listeners=new Set();
  const runtime=new FreeRuntimeService({nativeRepository:native,evidenceRepository:evidence,referenceRepository:workspaces,sourceFor:calibrationSourceFor,publication:'invalidation',onChange:({bindingId})=>{for(const listener of listeners)try{listener({type:'HF_FREE_UPDATED',leaseId:bindingId});}catch{}},clock:()=>FIXTURE_NOW,timeZone:'Asia/Shanghai',onSnapshot:({bindingId,snapshot})=>{if(snapshot)for(const listener of listeners)try{listener({type:'HF_FREE_UPDATED',leaseId:bindingId});}catch{}}});
  const reads=createFreeReadService({repository,workspaces,native,evidence,clock:()=>FIXTURE_NOW,timeZone:'Asia/Shanghai',
    admitActivitySource:scope=>syntheticEvidenceGate(scope)==='synthetic',
    bootstrapNative:(scope,origin,options)=>native.apply(scope,{operationId:'native_fixture_bootstrap_v1',expectedRevision:0,batch:nativeSeed(scope,origin)},options),
    adaptSharedEvents:(scope,state)=>Object.fromEntries(Object.entries(state.events).map(([key,event])=>[key,{...event,actorVerified:syntheticEvidenceGate(scope)==='synthetic',actorScopeKey:state.scopeKey}]))});
  const {workspaceContext}=reads;
  let readDelay=0;const pending=new Map(),initialized=new Set();
  async function seed(scope,origin){
    // This map only coalesces in-flight work. The durable marker is an IDB receipt.
    const key=scope.accountId+':'+origin;if(initialized.has(key))return;
    if(!pending.has(key))pending.set(key,(async()=>{let existing;try{if(await workspaces.partitioned.manifest(scope)){initialized.add(key);return;}existing=await workspaces.read(scope);}catch(e){if(['corrupt-record','invalid-state','invalid-schema','invalid-user-event'].includes(e.message)){initialized.add(key);return;}throw e;}if(existing.state.revision){initialized.add(key);return;}
      const result=await workspaces.initialize(scope,persistentSeed(scope,origin));if(!result.ok&&result.reason!=='revision-conflict')throw Error(result.reason);initialized.add(key);
    })().finally(()=>pending.delete(key)));return pending.get(key);
  }
  const wait=async()=>{if(readDelay)await new Promise(r=>setTimeout(r,readDelay));};
  const broker=createDocumentBindingBroker({extensionId,getFrame,makeId,allowedURL:syntheticURL,leaseMs:20000,freeRuntime:runtime,
    resolveScope:async({currentFrame})=>{const info=routeInfo(currentFrame.url);if(!info||info.account==='unknown')return null;const scope=scopeOf(info.account);await seed(scope,info.origin);return scope;},
    repository:{get:(...a)=>repository.get(...a),upsert:x=>repository.upsert(x),list:async scope=>{await wait();const {state}=await workspaces.read(scope);return Object.values(state.refs).map(r=>({conversationId:r.id,nativeUrl:r.nativeUrl,projectId:r.projectId,revision:1}));}},
    workspaceRepository:{
      ...reads,
      fixtureObserve:async(scope,message,options,url)=>{
        if(syntheticEvidenceGate(scope)!=='synthetic')throw Error('not-synthetic-scope');
        const route=routeInfo(url);
        if(!route||route.account!==scope.accountId||route.kind!=='c'||route.id!==message.conversationId)throw Error('synthetic-send-route-mismatch');
        const {state}=await workspaceContext(scope,options,[message.conversationId]),{facts}=await native.page(scope,{ids:{projects:[],refs:[message.conversationId]}},options);
        const old=state.refs[message.conversationId], key=digest([message.conversationId,message.messageId]);
        const nativeUrl=new URL(`/hf/${scope.accountId}/c/${message.conversationId}`,url).href;
        const ref=old??{id:message.conversationId,nativeUrl,projectId:message.projectId,nativeTitle:message.nativeTitle,available:true};
        const event={id:'send_'+key,sourceId:'fixture_v1',conversationId:ref.id,messageId:message.messageId,branchId:'fixture_main',role:'user',kind:'new-send',sendState:'committed',
          sentAt:FIXTURE_NOW,precision:'millisecond',observedAt:FIXTURE_NOW};
        const existing=state.events[event.id];
        // A preference may load another ref's event into this partial state.
        // Only the same unrevoked immutable event is an idempotent replay.
        if(existing&&stable(existing)!==stable({...event,revoked:false}))throw Error('evidence-id-conflict');
        const stored=existing?{ok:true}:await workspaces.ingest(scope,{operationId:'fixture_send_'+key,expectedRevision:state.revision,batch:{schema:'vaiwl-internal-evidence-v1',refs:old?[]:[ref],sources:[],events:[event],coverage:[]}},options);
        if(!stored.ok)return stored;
        const activity=(await evidence.page(scope,{ids:[ref.id]},options)).evidence;
        if(!activity.hints['hint_'+key]){
          const sourceRevision=(activity.sources.free_fixture_sends?.sourceRevision??0)+1;
          const observed=await evidence.apply(scope,{operationId:'observe_'+key,expectedRevision:activity.revision,batch:{sources:[{id:'free_fixture_sends',channel:'synthetic',generation:'fixture_v1',sourceRevision,observedAt:FIXTURE_NOW,validUntil:'2026-10-12T04:00:00Z'}],events:[],coverage:[],hints:[{
            id:'hint_'+key,conversationId:ref.id,sourceId:'free_fixture_sends',generation:'fixture_v1',sourceRevision,observedAt:FIXTURE_NOW,validUntil:'2026-10-11T04:10:00Z',eventKey:key,hintType:'local-confirmed-send',candidateInterval:null,actorVerified:true,actorScopeKey:state.scopeKey}]}},options);
          if(!observed.ok)return observed;
        }
        if(facts.refs[ref.id]?.nativeTitle===message.nativeTitle&&facts.membership[ref.id]?.projectId===message.projectId&&facts.membership[ref.id]?.state===(message.projectId===null?'NONE':'PROJECT'))return {ok:true,observed:true,revision:facts.revision};
        const source=facts.sources.native_fixture_v1;
        return native.apply(scope,{operationId:'fixture_native_send_'+key,expectedRevision:facts.revision,batch:{scopeKey:state.scopeKey,
          sourceRevision:(source?.sourceRevision??0)+1,observedAt:FIXTURE_NOW,validUntil:'2026-10-12T04:00:00Z',projects:[],
          refs:[{id:ref.id,nativeUrl,nativeTitle:message.nativeTitle,availability:'available'}],
          membership:[{id:ref.id,state:message.projectId===null?'NONE':'PROJECT',projectId:message.projectId}],
          inventory:{projects:'partial',conversations:'partial',cursor:null}}},options);
      },
      snapshot:async(scope,now,timeZone,options,size=8)=>{await wait();const value=await workspaces.snapshot(scope,now,timeZone,options);
        // Visibility scale is a fixture control, never a deletion or truncated DB write.
        const visible=w=>w.owner!=='bootstrap'||w.seedIndex<size;
        value.themes=value.themes.filter(visible);value.groups=value.groups.filter(visible);return value;},
      command:(...args)=>workspaces.command(...args),undo:(...args)=>workspaces.undo(...args),history:(...args)=>workspaces.history(...args),saveView:(...args)=>workspaces.saveView(...args),exportBackup:(...args)=>workspaces.exportBackup(...args),previewRestore:(...args)=>workspaces.previewRestore(...args),restoreBackup:(...args)=>workspaces.restoreBackup(...args),recoveryStatus:(...args)=>workspaces.recoveryStatus(...args),recover:(...args)=>workspaces.recover(...args),storage:async()=>{try{const value=await navigator.storage.estimate();return {usage:value.usage??null,quota:value.quota??null,persisted:await navigator.storage.persisted()};}catch{return {usage:null,quota:null,persisted:null};}}
    }
  });
  return {broker,repository,workspaces,native,evidence,runtime,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},setDelay:ms=>readDelay=Math.min(3000,Math.max(0,Number(ms)||0)),close:()=>{runtime.stopAll();listeners.clear();repository.close();}};
}
