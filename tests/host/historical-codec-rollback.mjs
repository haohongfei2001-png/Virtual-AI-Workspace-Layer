import assert from 'node:assert/strict';
import {j4AssetBackup,J4_REF} from './fixtures/j4-assets.mjs';

// Only called in the disposable installed extension's private page. Every
// import resolves to that currently loaded package, including the archived one.
// These synthetic repository gates do not register a production Host issuer.
export async function codecFixtureOperation({action,scope,origin,bundle,indexed=false,revision,method}){
 const [{ScopeRepository},{WorkspaceRepository},{NativeRepository},{digest}]=await Promise.all([
  import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),
  import(chrome.runtime.getURL('src/data/repository.mjs')),
  import(chrome.runtime.getURL('src/data/native-repository.mjs')),
  import(chrome.runtime.getURL('src/data/hash.mjs')),
 ]);
 const base=new ScopeRepository({indexedDB}),workspaces=new WorkspaceRepository({baseRepository:base}),admissions=new WeakMap();
 const now='2026-10-22T00:00:00Z',ref='33333333-3333-4333-8333-333333333333';let sourceId='codec-fixture-current';
 const native=new NativeRepository({baseRepository:base,workspaceRepository:workspaces,clock:()=>now,
  observationGate:()=>({channel:'synthetic',sourceId,generation:'codec-one'}),
  lifecycleGate:(normalized,request)=>admissions.get(request)?.scopeKey===normalized.key?admissions.get(request):null});
 const batch=next=>({scopeKey:base.scopeOrThrow(scope).key,sourceRevision:next+1,observedAt:now,validUntil:'2026-10-23T00:00:00Z',projects:[],
  refs:[ref,'codec-survivor'].map(id=>({id,nativeTitle:'Synthetic codec fixture',nativeUrl:origin+'/c/'+id,availability:'available'})),
  membership:[ref,'codec-survivor'].map(id=>({id,state:'UNKNOWN',projectId:null})),inventory:{projects:'partial',conversations:'partial',cursor:null}});
 const need=result=>{if(!result?.ok)throw Error('codec-fixture-setup:'+JSON.stringify(result));return result;};
 try{
  const version=(await base.open()).version;
  if(action==='seed'){
   sourceId='codec-fixture-retired';
   const preview=await workspaces.previewRestore(scope,bundle);
   need(await workspaces.restoreBackup(scope,{operationId:'codec-human-assets',expectedRevision:preview.expectedRevision,bundle,planHash:preview.planHash}));
   need(await native.apply(scope,{operationId:'codec-seed',expectedRevision:0,batch:batch(0)}));
   if(indexed)need(await native.migrateVersionIndex(scope,{operationId:'codec-index',expectedRevision:1}));
   // The same old writer has actually succeeded before seeing the new codec.
   const initial=await native.version(scope);
   need(await native.invalidate(scope,{operationId:'codec-old-valid-invalidate',expectedRevision:initial,sourceId},{guard:()=>true}));
   sourceId='codec-fixture-current'; // A revoked source ID is never revived.
   need(await native.apply(scope,{operationId:'codec-old-valid-apply',expectedRevision:initial+1,batch:batch(initial+1)}));
   return {version,header:await native.header(scope)};
  }
  if(action==='fence'){
   const facts=await native.read(scope),request={operationId:'codec-delete',expectedRevision:facts.revision,change:{kind:'refs',id:ref,state:'deletion-confirmed',expectedVersion:0,fenceId:null,fenceVersion:null,resultFingerprint:digest('codec-fixture-delete'),profileId:'fixture-codec-only',profileVersion:1}};
   admissions.set(request,{scopeKey:base.scopeOrThrow(scope).key,purpose:'native-lifecycle',guard:()=>true});
   need(await native.applyLifecycle(scope,request));
   return {version,header:await native.header(scope),fence:(await native.read(scope)).refLifecycle[ref]};
  }
  if(action==='attempt'){
   const run={read:()=>native.read(scope),header:()=>native.header(scope),
    apply:()=>native.apply(scope,{operationId:'codec-rejected-apply',expectedRevision:revision,batch:batch(revision)}),
    invalidate:()=>native.invalidate(scope,{operationId:'codec-rejected-invalidate',expectedRevision:revision,sourceId},{guard:()=>true})}[method];
   if(!run)throw Error('unknown-codec-attempt');
   try{return {version,outcome:'returned',value:await run()};}
   catch(error){return {version,outcome:'threw',name:error.name,reason:error.message};}
  }
  if(action==='restored'){
   const state=(await workspaces.read(scope)).state,facts=await native.read(scope),projection=await native.snapshot(scope,{knownState:state});
   return {version,header:await native.header(scope),fence:facts.refLifecycle[ref],projectedIds:projection.refs.map(row=>row.id)};
  }
  throw Error('unknown-codec-action');
 }finally{base.close();}
}

export function assertOldCodecRefusal(method,result){
 assert.equal(result.version,4,'same schema must open; VersionError is not a codec refusal');
 if(method==='read'||method==='header')assert.deepEqual(result,{version:4,outcome:'threw',name:'Error',reason:'invalid-native-schema'});
 else assert.deepEqual(result,{version:4,outcome:'returned',value:{ok:false,reason:'invalid-native-schema'}});
}

export function assertManualStoresRetained(before,after){
 for(const name of before.stores.filter(name=>!['native_states','native_operations'].includes(name)))
  assert.deepEqual(after.rows[name],before.rows[name],`lifecycle fence changed shared store ${name}`);
}

export async function runHistoricalCodecRollback({report,old,current,origin,scope,indexScope,openProbe,closeProbe,evaluate,rawSnapshot,inspect,verifyLoadedOwners,replaceAndLoad,hash}){
 const paths=['src/data/native-facts.mjs','src/data/native-partitions.mjs','src/data/native-version-index.mjs'];
 const cases=[{name:'partition',scope,indexed:false},{name:'index',scope:indexScope,indexed:true}];
 const call=(item,action,extra={})=>evaluate(codecFixtureOperation,{action,scope:item.scope,origin,indexed:item.indexed,...extra});
 const rowsHash=value=>hash(JSON.stringify(value.rows));
 const verify=async(pkg,modern)=>{
  const owners=await verifyLoadedOwners(pkg.unpacked,4,modern?[...paths,'src/data/native-lifecycle.mjs']:paths);
  const manifest=await evaluate(async()=>await(await fetch(chrome.runtime.getURL('build-manifest.json'))).text());
  assert.equal(hash(manifest),modern?report.currentBuild.manifest:report.oldBuild.manifest);
  return owners;
 };
 await openProbe();report.loadedInitialOwners=await verify(old,false);
 for(const item of cases){const seed=await call(item,'seed',{bundle:j4AssetBackup(item.scope,origin)});assert.equal(seed.version,4);assert.equal(seed.header.storageFormat,item.indexed?'vaiwl-native-version-index-v1':'vaiwl-native-partitions-v1');}
 const assets=await inspect(),beforeUpgrade=await rawSnapshot();
 assert.equal(assets.version,4);for(const key of ['identities','snippets','workspaces','placements','workingSet','humanRefs'])assert.equal(assets[key],1);
 assert.deepEqual(beforeUpgrade.stores,['b23_checkpoints','b23_operations','b23_states','b23_views','native_operations','native_states','operations','refs']);
 report.steps.push({name:'actual-old-schema4-package-positive-writes-and-manual-assets',status:'PASS',assets,rowsHash:rowsHash(beforeUpgrade)});
 await closeProbe();report.upgradeRuntime=await replaceAndLoad(current.unpacked);await openProbe();report.loadedUpgradeOwners=await verify(current,true);
 assert.deepEqual(await rawSnapshot(),beforeUpgrade);
 for(const item of cases){item.confirmed=await call(item,'fence');assert.equal(item.confirmed.header.storageFormat,item.indexed?'vaiwl-native-version-index-v2':'vaiwl-native-partitions-v2');assert.equal(item.confirmed.fence.state,'deletion-confirmed');}
 assert.deepEqual(await inspect(),assets);const protectedRows=await rawSnapshot();assertManualStoresRetained(beforeUpgrade,protectedRows);
 report.steps.push({name:'current-package-persists-two-synthetic-lifecycle-fences',status:'PASS',formats:cases.map(item=>item.confirmed.header.storageFormat),rowsHash:rowsHash(protectedRows)});
 await closeProbe();report.downgradeRuntime=await replaceAndLoad(old.unpacked);await openProbe();report.loadedDowngradeOwners=await verify(old,false);
 assert.deepEqual(await inspect(),assets);assert.deepEqual(await rawSnapshot(),protectedRows);
 for(const item of cases)for(const method of ['read','header','apply','invalidate']){
  const refusal=await call(item,'attempt',{method,revision:item.confirmed.header.revision});assertOldCodecRefusal(method,refusal);
  assert.deepEqual(await rawSnapshot(),protectedRows,`${item.name}/${method} changed original store rows`);
  report.steps.push({name:`old-installed-${item.name}-${method}-refuses-new-codec`,status:'PASS',refusal,rowsHash:rowsHash(protectedRows)});
 }
 await closeProbe();report.restoreRuntime=await replaceAndLoad(current.unpacked);await openProbe();report.loadedRestoredOwners=await verify(current,true);
 assert.deepEqual(await rawSnapshot(),protectedRows);assert.deepEqual(await inspect(),assets);
 for(const item of cases){const restored=await call(item,'restored');assert.equal(restored.version,4);assert.deepEqual(restored.fence,item.confirmed.fence);assert.deepEqual(restored.header,item.confirmed.header);assert(!restored.projectedIds.includes(J4_REF));assert(restored.projectedIds.includes('codec-survivor'));}
 assert.deepEqual(await rawSnapshot(),protectedRows);
 report.steps.push({name:'current-reupgrade-retains-exact-fences-projection-and-human-assets',status:'PASS',rowsHash:rowsHash(protectedRows),assets});
 await closeProbe();
}
