import {FreeRuntimeService} from '../src/data/free-runtime-service.mjs';
import {freeRecoveryStatus} from '../src/data/free-recovery-status.mjs';
import { FreeEvidenceRepository } from '../src/data/free-evidence-repository.mjs';
import { freeProjection } from '../src/data/free-projection.mjs';
import { digest } from '../src/data/hash.mjs';
import { projectFreeActivity } from '../src/data/free-activity.mjs';
import { createFreeViewSession } from '../src/data/free-time-policy.mjs';
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
  const runtime=new FreeRuntimeService({nativeRepository:native,evidenceRepository:evidence,sourceFor:calibrationSourceFor,clock:()=>FIXTURE_NOW,timeZone:'Asia/Shanghai'});
  const activityVersionCache=new Map();
  function activityVersions(context,stored){
    const {state,refVersions}=context,key=state.scopeKey,revision=`${state.revision}:${stored.revision}`;
    if(activityVersionCache.get(key)?.revision===revision)return activityVersionCache.get(key).value;
    const rows=new Map();
    const add=(table,row)=>{if(!rows.has(row.conversationId))rows.set(row.conversationId,[]);rows.get(row.conversationId).push([table,row]);};
    if(!refVersions)for(const table of ['events','coverage'])for(const row of Object.values(state[table]))add('shared-'+table,row);
    for(const table of ['events','hints','coverage'])for(const row of Object.values(stored[table]??{}))add(table,row);
    const value=Object.fromEntries([...new Set([...Object.keys(refVersions??state.refs),...rows.keys(),...Object.keys(stored.manifest?.refVersions??{})])].map(id=>[id,`${refVersions?.[id]??0}:${stored.manifest?.refVersions[id]??0}:${rows.has(id)?digest(rows.get(id)):''}`]));
    if(activityVersionCache.size>=8&&!activityVersionCache.has(key))activityVersionCache.delete(activityVersionCache.keys().next().value);
    activityVersionCache.set(key,{revision,value});return value;
  }
  function activitySourceRevision(state,stored){
    return digest(Object.entries({...state.sources,...stored.sources}).map(([id,s])=>({id,revoked:s.revoked,generation:s.generation??null,channel:s.channel,validUntil:s.validUntil??null,trustLevel:s.trustLevel??null})));
  }
  async function workspaceContext(scope,options,ids=null){
    const large=await workspaces.partitionHeader(scope,options);
    if(!large)return workspaces.read(scope,options);
    const state=await workspaces.partitioned.partial(scope,ids??[],options);
    return {state,view:large.view,diagnostics:large.diagnostics,refVersions:large.manifest.refVersions};
  }
  async function ensureNative(scope,options,origin){
    let root=await native.header(scope,options);
    if(!root.revision){const result=await native.apply(scope,{operationId:'native_fixture_bootstrap_v1',expectedRevision:0,batch:nativeSeed(scope,origin)},options);if(!result.ok&&result.reason!=='revision-conflict')throw Error(result.reason);root=await native.header(scope,options);}
    return root;
  }
  function activityEvidence(scope,state,stored){
    const events=Object.fromEntries(Object.entries(state.events).map(([key,event])=>[key,{...event,actorVerified:syntheticEvidenceGate(scope)==='synthetic',actorScopeKey:state.scopeKey}]));
    return {scopeKey:state.scopeKey,events:{...events,...stored.events},hints:stored.hints,coverage:{...state.coverage,...stored.coverage},sources:{...state.sources,...stored.sources},evidenceRevision:`${state.revision}:${stored.revision}`};
  }
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
      freeRecoveryStatus:async(scope,options)=>({native:await freeRecoveryStatus(native,scope,'native',options),evidence:await freeRecoveryStatus(evidence,scope,'evidence',options)}),
      freeRecover:(scope,request,options)=>(request.kind==='native'?native:evidence).recover(scope,request,options),
      freeHeader:async(scope,options,now=FIXTURE_NOW,timeZone='Asia/Shanghai',viewSession=null,url)=>{
        const root=await ensureNative(scope,options,new URL(url).origin),context=await workspaceContext(scope,options),stored=await evidence.header(scope,options);
        const {state,view,diagnostics}=context,policy=state.preferences.freeTimePolicy?.value;
        const activeSources=Object.values(root.manifest?.sources??{}).filter(source=>!source.revoked&&Date.parse(source.validUntil)>Date.parse(FIXTURE_NOW));
        const refs=Object.fromEntries(Object.keys(context.refVersions??state.refs).map(key=>[key,0]));
        const session=viewSession??(view?.value?.segment>0?view.value.freeSession:null)??createFreeViewSession({now,timeZone,H:policy?.H??30,policyRevision:policy?.revision??0});
        return {scope:state.scopeKey,revision:root.revision,membershipWitnessRevision:digest(Object.values(root.manifest?.sources??{}).map(({id,sourceRevision})=>({id,sourceRevision}))),visibilityRevision:digest(Object.values(root.manifest?.sources??{}).map(({id,revoked,generation,channel,validUntil})=>({id,revoked,generation,channel,validUntil}))),evaluatedAt:now,inventoryComplete:activeSources.length>0&&activeSources.every(source=>source.inventory.projects==='complete'&&source.inventory.conversations==='complete'),activitySourceRevision:activitySourceRevision(state,stored),manifest:{projectVersions:root.manifest?.projects??{},refVersions:{...refs,...root.manifest?.refs},activityVersions:activityVersions(context,stored)},
          preferences:state.preferences,view:view?.value??null,viewRevision:view?.revision??0,workspaceRevision:state.revision,diagnostics,viewSession:session,evidenceRevision:`${state.revision}:${stored.revision}`};
      },
      freePage:async(scope,query,options)=>{
        const page=await native.page(scope,query,options),context=await workspaceContext(scope,options,query.ids?.refs??page.selectedRefs),stored=(await evidence.page(scope,{ids:query.ids?.refs??page.selectedRefs},options)).evidence;
        const {state}=context,knownState={scopeKey:state.scopeKey,refs:Object.fromEntries((query.ids?.refs??page.selectedRefs).filter(key=>state.refs[key]).map(key=>[key,state.refs[key]]))};
        const snapshot=freeProjection(page.facts,{scope,now:FIXTURE_NOW,knownState});
        const projected=projectFreeActivity(snapshot,activityEvidence(scope,state,stored),query.viewSession,query.now);
        const refSet=new Set(projected.refs.map(row=>row.id)),projectSet=new Set(projected.projects.map(row=>row.id));
        return {scope:snapshot.scope,revision:page.revision,projects:projected.projects.map(({id,key,scope,nativeName,name,nativeUrl,nativeAliases,memberCount,membershipWitness,membershipWitnessCurrent,membershipComplete})=>({id,key,scope,nativeName,name,nativeUrl,nativeAliases,memberCount,membershipWitness,membershipWitnessCurrent,members:[],...(membershipComplete===undefined?{}:{membershipComplete})})),refs:projected.refs,
          selectedProjects:page.selectedProjects,selectedRefs:page.selectedRefs,omittedRefs:page.selectedRefs.filter(key=>!refSet.has(key)),omittedProjects:page.selectedProjects.filter(key=>!projectSet.has(key)),
          offset:page.offset,total:page.total,nextOffset:page.nextOffset,workspaceRevision:state.revision,evidenceRevision:`${state.revision}:${stored.revision}`};
      },
      fixtureObserve:async(scope,message,options,url)=>{
        if(syntheticEvidenceGate(scope)!=='synthetic')throw Error('not-synthetic-scope');
        const route=routeInfo(url);
        if(!route||route.account!==scope.accountId||route.kind!=='c'||route.id!==message.conversationId)throw Error('synthetic-send-route-mismatch');
        const {state}=await workspaces.read(scope,options), facts=await native.read(scope,options);
        const old=state.refs[message.conversationId], key=digest([message.conversationId,message.messageId]);
        const nativeUrl=new URL(`/hf/${scope.accountId}/c/${message.conversationId}`,url).href;
        const ref=old??{id:message.conversationId,nativeUrl,projectId:message.projectId,nativeTitle:message.nativeTitle,available:true};
        const stored=state.events['send_'+key]?{ok:true}:await workspaces.ingest(scope,{operationId:'fixture_send_'+key,expectedRevision:state.revision,batch:{schema:'vaiwl-internal-evidence-v1',refs:old?[]:[ref],sources:[],events:[{
          id:'send_'+key,sourceId:'fixture_v1',conversationId:ref.id,messageId:message.messageId,branchId:'fixture_main',role:'user',kind:'new-send',sendState:'committed',
          sentAt:FIXTURE_NOW,precision:'millisecond',observedAt:FIXTURE_NOW}],coverage:[]}},options);
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
      freeSnapshot:async(scope,options,now=FIXTURE_NOW,timeZone='Asia/Shanghai',viewSession=null)=>{
        const facts=await native.read(scope,options);
        const {state,view,diagnostics}=await workspaces.read(scope,options);
        if(facts.revision===0){
          const origin=new URL(Object.values(state.refs)[0].nativeUrl).origin;
          const result=await native.apply(scope,{operationId:'native_fixture_bootstrap_v1',expectedRevision:0,batch:nativeSeed(scope,origin)},options);
          if(!result.ok&&result.reason!=='revision-conflict')throw Error(result.reason);
        }
        const snapshot=await native.snapshot(scope,{...options,knownState:state});
        const policy=state.preferences.freeTimePolicy?.value;
        const session=viewSession??(view?.value?.segment>0?view.value.freeSession:null)??createFreeViewSession({now,timeZone,H:policy?.H??30,policyRevision:policy?.revision??0});
        // Explicit controlled fixture authorship only. This cannot certify a production account.
        const stored=await evidence.read(scope,options);
        return {...projectFreeActivity(snapshot,activityEvidence(scope,state,stored),session,now),
          preferences:state.preferences,view:view?.value??null,viewRevision:view?.revision??0,workspaceRevision:state.revision,diagnostics};
      },
      version:async(scope,options)=>{const nativeRevision=await native.version(scope,options),stored=await evidence.header(scope,options);const large=await workspaces.partitionHeader(scope,options);if(large)return {nativeRevision,evidenceRevision:`${large.manifest.revision}:${stored.revision}`,revision:large.manifest.revision,viewRevision:large.view?.revision??0,viewDiagnostic:large.diagnostics.view};const {state,view,diagnostics}=await workspaces.read(scope,options);return {nativeRevision,evidenceRevision:`${state.revision}:${stored.revision}`,revision:state.revision,viewRevision:view?.revision??0,viewDiagnostic:diagnostics.view};},
      partitionHeader:(...args)=>workspaces.partitionHeader(...args),partitionPage:(...args)=>workspaces.partitionPage(...args),
      snapshot:async(scope,now,timeZone,options,size=8)=>{await wait();const value=await workspaces.snapshot(scope,now,timeZone,options);
        // Visibility scale is a fixture control, never a deletion or truncated DB write.
        const visible=w=>w.owner!=='bootstrap'||w.seedIndex<size;
        value.themes=value.themes.filter(visible);value.groups=value.groups.filter(visible);return value;},
      command:(...args)=>workspaces.command(...args),undo:(...args)=>workspaces.undo(...args),history:(...args)=>workspaces.history(...args),saveView:(...args)=>workspaces.saveView(...args),exportBackup:(...args)=>workspaces.exportBackup(...args),previewRestore:(...args)=>workspaces.previewRestore(...args),restoreBackup:(...args)=>workspaces.restoreBackup(...args),recoveryStatus:(...args)=>workspaces.recoveryStatus(...args),recover:(...args)=>workspaces.recover(...args),storage:async()=>{try{const value=await navigator.storage.estimate();return {usage:value.usage??null,quota:value.quota??null,persisted:await navigator.storage.persisted()};}catch{return {usage:null,quota:null,persisted:null};}}
    }
  });
  return {broker,repository,workspaces,native,evidence,runtime,setDelay:ms=>readDelay=Math.min(3000,Math.max(0,Number(ms)||0)),close:()=>{runtime.stopAll();repository.close();}};
}
