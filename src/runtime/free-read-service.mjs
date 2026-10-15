import {localDay} from '../navigation/projection.mjs';
import {NATIVE_PARTITION_FORMAT} from '../data/native-partitions.mjs';
import {headerState} from '../data/partitioned.mjs';
import {freeRecoveryStatus} from '../data/free-recovery-status.mjs';
import {freeProjection} from '../data/free-projection.mjs';
import {digest} from '../data/hash.mjs';
import {projectFreeActivity} from '../data/free-activity.mjs';
import {createFreeViewSession} from '../data/free-time-policy.mjs';
/** Shared existing read pipeline. Production has no seed and never certifies shared authorship. */
export function createFreeReadService({repository,workspaces,native,evidence,clock=()=>new Date().toISOString(),timeZone:defaultTimeZone='UTC',bootstrapNative=null,adaptSharedEvents=null,admitActivitySource=()=>false,initializeTimePolicy=false}={}){
  const deadlines=(...tables)=>[...new Set(tables.flatMap(table=>Object.values(table??{})).filter(row=>!row.revoked&&row.validUntil).map(row=>row.validUntil))];
  const activityVersionCache=new Map();
  function activityVersions(context,stored){
    const {state,refVersions}=context,key=state.scopeKey,revision=`${state.revision}:${stored.revision}`;
    if(activityVersionCache.get(key)?.revision===revision)return activityVersionCache.get(key).value;
    const rows=new Map();
    const add=(table,row)=>{if(!rows.has(row.conversationId))rows.set(row.conversationId,[]);rows.get(row.conversationId).push([table,row]);};
    if(!refVersions)for(const table of ['events','coverage'])for(const row of Object.values(state[table]))add('shared-'+table,row);
    for(const table of ['events','hints','coverage'])for(const row of Object.values(stored[table]??{}))add(table,row);
    const value={};
    const addVersion=id=>{if(!Object.hasOwn(value,id))value[id]=`${refVersions?.[id]??0}:${stored.manifest?.refVersions[id]??0}:${rows.has(id)?digest(rows.get(id)):''}`;};
    for(const id of Object.keys(refVersions??state.refs))addVersion(id);
    for(const id of rows.keys())addVersion(id);
    for(const id of Object.keys(stored.manifest?.refVersions??{}))addVersion(id);
    if(activityVersionCache.size>=8&&!activityVersionCache.has(key))activityVersionCache.delete(activityVersionCache.keys().next().value);
    activityVersionCache.set(key,{revision,value});return value;
  }
  const preparing=(scope,stage)=>({preparing:{scope:repository.scopeOrThrow(scope).key,stage}});
  async function ensureEvidence(scope,options,staged=false){
    let stored=await evidence.header(scope,{...options,includeStorageFormat:true});
    if(stored.storageFormat==='vaiwl-free-evidence-partitions-v1'||stored.storageFormat==='vaiwl-free-evidence-directory-v1'&&!stored.indexIntegrityBound){
      if(staged&&typeof evidence.prepareRefDirectory==='function'){
        const preparation=await evidence.prepareRefDirectory(scope,{expectedRevision:stored.revision},options);
        if(!preparation.ok)throw Error(preparation.reason==='revision-conflict'?'snapshot-revision-changed':preparation.reason);
        if(preparation.prepared)return preparing(scope,'evidence-directory-build');
      }
      const result=await evidence.migrateRefDirectory(scope,{operationId:'evidence_index_integrity_v1',expectedRevision:stored.revision},options);
      if(!result.ok&&result.reason!=='revision-conflict')throw Error(result.reason);
      if(staged)return preparing(scope,'evidence-directory');
      // One bounded attempt. A concurrent writer can win; the next HEADER
      // retries if still legacy. No request replay or source renewal.
      stored=await evidence.header(scope,{...options,includeStorageFormat:true});
    }
    return stored;
  }
  function activitySourceRevision(state,stored){
    return digest(Object.entries({...state.sources,...stored.sources}).map(([id,s])=>({id,revoked:s.revoked,generation:s.generation??null,channel:s.channel,validUntil:s.validUntil??null,trustLevel:s.trustLevel??null})));
  }
  async function workspaceContext(scope,options,ids=null,staged=false){
    if(ids!==null){
      const context=await workspaces.partitioned.partialContext(scope,ids,{...options,boundedDirectory:true});
      return context?{state:context.state,refVersions:context.refVersions??context.manifest.refVersions}:workspaces.read(scope,options);
    }
    const info=await workspaces.partitioned.storageInfo(scope,options);
    if(info?.format==='vaiwl-partitioned-v1'){
      const migration=await workspaces.migrateSharedDirectory(scope,{operationId:'shared_ref_directory_v1',expectedRevision:info.revision},options);
      // One attempt per HEADER. A CAS loser reads the winner; only another
      // HEADER may retry, with no source renewal or command replay.
      if(!migration.ok&&migration.reason!=='revision-conflict')throw Error(migration.reason);
      if(staged)return preparing(scope,'shared-directory');
    }
    const large=await workspaces.partitionHeader(scope,options);
    if(!large)return workspaces.read(scope,options);
    return {state:headerState(large.manifest),view:large.view,diagnostics:large.diagnostics,refVersions:large.manifest.refVersions};
  }
  async function ensureNative(scope,options,origin,staged=false){
    let root=await native.header(scope,options);
    if(!root.revision&&bootstrapNative){const result=await bootstrapNative(scope,origin,options);if(!result.ok&&result.reason!=='revision-conflict')throw Error(result.reason);if(staged)return preparing(scope,'native-bootstrap');root=await native.header(scope,options);}
    if(root.storageFormat===NATIVE_PARTITION_FORMAT){
      if(staged&&typeof native.prepareVersionIndex==='function'){
        const preparation=await native.prepareVersionIndex(scope,{expectedRevision:root.revision},options);
        if(!preparation.ok)throw Error(preparation.reason==='revision-conflict'?'snapshot-revision-changed':preparation.reason);
        if(preparation.prepared)return preparing(scope,'native-index-build');
      }
      const result=await native.migrateVersionIndex(scope,{operationId:'native_version_index_v1',expectedRevision:root.revision},options);
      // A concurrent writer wins normally. Re-read once; a later HEADER can
      // retry migration if it still sees the legacy format. Never loop here.
      if(!result.ok&&result.reason!=='revision-conflict')throw Error(result.reason);
      if(staged)return preparing(scope,'native-index');
      root=await native.header(scope,options);
    }
    return root;
  }
  function activityEvidence(scope,state,stored){
    const events=adaptSharedEvents?adaptSharedEvents(scope,state):Object.fromEntries(Object.entries(state.events).map(([key,event])=>[key,{...event,actorVerified:false,actorScopeKey:state.scopeKey}]));
    // Existing evidence codecs accept synthetic records. Persistence and a valid
    // checksum are not production admission; retain every historical row while
    // exposing only sources explicitly admitted by this privileged composition.
    // Admission is bound to a store and its own source before combining rows.
    // A restored shared row cannot borrow a same-ID evidence source's authority.
    const admitted=(table,store)=>Object.fromEntries(Object.entries(table??{}).filter(([,source])=>admitActivitySource(scope,source,{store})===true));
    const sharedSources=admitted(state.sources,'shared'),storedSources=admitted(stored.sources,'evidence');
    // Independently admitted but inconsistent same-ID sources are ambiguous.
    // Refuse their activity only; neither persisted store is changed.
    for(const id of Object.keys(sharedSources))if(Object.hasOwn(storedSources,id)&&digest(sharedSources[id])!==digest(storedSources[id])){delete sharedSources[id];delete storedSources[id];}
    const rows=(table,sources)=>Object.fromEntries(Object.entries(table??{}).filter(([,row])=>Object.hasOwn(sources,row.sourceId)));
    const sources={...sharedSources,...storedSources};
    // Preserve legacy shared event diagnostics, but never lend them authorship
    // via a same-ID stored source (including an optional shared adapter).
    const sharedEvents=Object.fromEntries(Object.entries(events).map(([id,row])=>[id,Object.hasOwn(sharedSources,row.sourceId)?row:{...row,actorVerified:false,actorScopeKey:state.scopeKey}]));
    return {scopeKey:state.scopeKey,events:{...sharedEvents,...rows(stored.events,storedSources)},hints:rows(stored.hints,storedSources),coverage:{...rows(state.coverage,sharedSources),...rows(stored.coverage,storedSources)},sources,evidenceRevision:`${state.revision}:${stored.revision}`};
  }
  return Object.freeze({workspaceContext,activityEvidence,
      freeRecoveryStatus:async(scope,options)=>({native:await freeRecoveryStatus(native,scope,'native',options),evidence:await freeRecoveryStatus(evidence,scope,'evidence',options)}),
      freeRecover:(scope,request,options)=>(request.kind==='native'?native:evidence).recover(scope,request,options),
      freeHeader:async(scope,options,now=clock(),timeZone=defaultTimeZone,viewSession=null,url,staged=false)=>{
        const root=await ensureNative(scope,options,url?new URL(url).origin:null,staged);
        if(root.preparing)return root;
        // Bootstrap can write shared anchors, so it must finish first. The two
        // remaining owner reads are independent; settle both even if one fails.
        let context,stored;
        if(staged){
          // Each continuation completes at most one existing atomic migration.
          // No partial inventory is ever published as a usable header.
          context=await workspaceContext(scope,options,null,true);if(context.preparing)return context;
          stored=await ensureEvidence(scope,options,true);if(stored.preparing)return stored;
        }else{
          const reads=await Promise.allSettled([workspaceContext(scope,options),ensureEvidence(scope,options)]);
          for(const result of reads)if(result.status==='rejected')throw result.reason;
          context=reads[0].value;stored=reads[1].value;
        }
        const {state,view,diagnostics}=context;
        if(initializeTimePolicy){
          const result=await workspaces.initializeFreeTimePolicy(scope,{expectedRevision:state.revision,day:localDay(now,timeZone)},options);
          if(!result.ok)throw Error(result.reason==='revision-conflict'?'snapshot-revision-changed':result.reason);
          if(result.initialized)return preparing(scope,'free-policy');
        }
        const policy=state.preferences.freeTimePolicy?.value;
        const activeSources=Object.values(root.manifest?.sources??{}).filter(source=>!source.revoked&&Date.parse(source.validUntil)>Date.parse(now));
        const refs={};for(const key of Object.keys(context.refVersions??state.refs))refs[key]=0;
        for(const [key,version] of Object.entries(root.manifest?.refs??{}))refs[key]=version;
        const session=viewSession??(view?.value?.segment>0?view.value.freeSession:null)??createFreeViewSession({now,timeZone,H:policy?.H??30,policyRevision:policy?.revision??0});
        return {calibrationDeadlines:deadlines(root.manifest?.sources,state.sources,stored.sources),scope:state.scopeKey,revision:root.revision,membershipWitnessRevision:digest(Object.values(root.manifest?.sources??{}).map(({id,sourceRevision})=>({id,sourceRevision}))),visibilityRevision:digest(Object.values(root.manifest?.sources??{}).map(({id,revoked,generation,channel,validUntil})=>({id,revoked,generation,channel,validUntil}))),evaluatedAt:now,inventoryComplete:activeSources.length>0&&activeSources.every(source=>source.inventory.projects==='complete'&&source.inventory.conversations==='complete'),activitySourceRevision:activitySourceRevision(state,stored),manifest:{projectVersions:root.manifest?.projects??{},refVersions:refs,activityVersions:activityVersions(context,stored)},
          preferences:state.preferences,view:view?.value??null,viewRevision:view?.revision??0,workspaceRevision:state.revision,diagnostics,viewSession:session,evidenceRevision:`${state.revision}:${stored.revision}`};
      },
      freePage:async(scope,query,options)=>{
        const page=await native.page(scope,query,options),ids=query.ids?.refs??page.selectedRefs;
        const reads=await Promise.allSettled([workspaceContext(scope,options,ids),evidence.page(scope,{ids},options)]);
        for(const result of reads)if(result.status==='rejected')throw result.reason;
        const context=reads[0].value,stored=reads[1].value.evidence;
        const {state}=context,knownState={scopeKey:state.scopeKey,refs:Object.fromEntries((query.ids?.refs??page.selectedRefs).filter(key=>state.refs[key]).map(key=>[key,state.refs[key]]))};
        const snapshot=freeProjection(page.facts,{scope,now:query.now,knownState});
        const projected=projectFreeActivity(snapshot,activityEvidence(scope,state,stored),query.viewSession,query.now);
        const refSet=new Set(projected.refs.map(row=>row.id)),projectSet=new Set(projected.projects.map(row=>row.id));
        return {calibrationDeadlines:deadlines(page.facts.sources,page.facts.projects,page.facts.refs,page.facts.membership,stored.sources,stored.hints,stored.events,stored.coverage,state.sources,state.events,state.coverage),scope:snapshot.scope,revision:page.revision,projects:projected.projects.map(({id,key,scope,nativeName,name,nativeUrl,nativeAliases,freshness,memberCount,membershipWitness,membershipWitnessCurrent,membershipComplete})=>({id,key,scope,nativeName,name,nativeUrl,nativeAliases,freshness,memberCount,membershipWitness,membershipWitnessCurrent,members:[],...(membershipComplete===undefined?{}:{membershipComplete})})),refs:projected.refs,
          selectedProjects:page.selectedProjects,selectedRefs:page.selectedRefs,omittedRefs:page.selectedRefs.filter(key=>!refSet.has(key)),omittedProjects:page.selectedProjects.filter(key=>!projectSet.has(key)),
          offset:page.offset,total:page.total,nextOffset:page.nextOffset,workspaceRevision:state.revision,evidenceRevision:`${state.revision}:${stored.revision}`};
      },
      freeSnapshot:async(scope,options,now=clock(),timeZone=defaultTimeZone,viewSession=null)=>{
        const {state,view,diagnostics}=await workspaces.read(scope,options);
        if(bootstrapNative){const ref=Object.values(state.refs)[0];await ensureNative(scope,options,ref?new URL(ref.nativeUrl).origin:null);}
        const facts=await native.read(scope,options);
        const snapshot=freeProjection(facts,{scope,now,knownState:state});
        const policy=state.preferences.freeTimePolicy?.value;
        const session=viewSession??(view?.value?.segment>0?view.value.freeSession:null)??createFreeViewSession({now,timeZone,H:policy?.H??30,policyRevision:policy?.revision??0});
        const stored=await evidence.read(scope,options);
        return {...projectFreeActivity(snapshot,activityEvidence(scope,state,stored),session,now),
          preferences:state.preferences,view:view?.value??null,viewRevision:view?.revision??0,workspaceRevision:state.revision,diagnostics};
      },
      version:async(scope,options)=>{
        const reads=await Promise.allSettled([native.version(scope,options),evidence.version(scope,options),workspaces.partitionVersion(scope,options)]);
        for(const result of reads)if(result.status==='rejected')throw result.reason;
        const nativeRevision=reads[0].value,stored={revision:reads[1].value},large=reads[2].value;
        if(large)return {nativeRevision,evidenceRevision:`${large.revision}:${stored.revision}`,revision:large.revision,viewRevision:large.view?.revision??0,viewDiagnostic:large.diagnostics.view};const {state,view,diagnostics}=await workspaces.read(scope,options);return {nativeRevision,evidenceRevision:`${state.revision}:${stored.revision}`,revision:state.revision,viewRevision:view?.revision??0,viewDiagnostic:diagnostics.view};},
      partitionHeader:(...args)=>workspaces.partitionHeader(...args),partitionPage:(...args)=>workspaces.partitionPage(...args),
  });
}
