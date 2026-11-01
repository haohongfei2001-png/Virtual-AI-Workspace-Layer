import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root='/Users/hhf/Documents/GitHub/Virtual-AI-Workspace-Layer';
const load=p=>import(pathToFileURL(join(root,p)).href);
const {historicalSource,OLD_HOST_COMMIT}=await load('tests/host/historical-package.mjs');
const {createJointObservationFixture}=await load('tests/host/joint-observation-fixture.mjs');
const {MockIDBFactory}=await load('tests/b23/mock-idb.mjs');
const {WorkspaceRepository}=await load('src/data/repository.mjs');
const {j4AssetBackup}=await load('tests/host/fixtures/j4-assets.mjs');
const {digest}=await load('src/data/hash.mjs');
async function contents(base){const db=await base.open(),names=[...db.objectStoreNames];return new Promise((resolve,reject)=>{const tx=db.transaction(names),out={};for(const n of names){out[n]=[];const q=tx.objectStore(n).openCursor();q.onsuccess=()=>{const c=q.result;if(c){out[n].push({key:c.key,value:c.value});c.continue();}};}tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});}
const directory=await mkdtemp('/private/tmp/vaiwl-old-invalidate-'),archive=await historicalSource(root,OLD_HOST_COMMIT,join(directory,'source'));
const {NativeRepository}=await import(pathToFileURL(join(directory,'source/src/data/native-repository.mjs')).href);
const reports=[];
try{for(const afterEvidence of [false,true]){
 const h=await createJointObservationFixture({indexedDB:new MockIDBFactory()});
 try{
  h.disableDrain();await h.ingest(h.surface());
  const p=(await h.native.listContinuations(h.scope))[0];
  if(afterEvidence){const save=h.native.markContinuationComplete;h.native.markContinuationComplete=async()=>{throw Error('OFFLINE_COMPLETION_INTERRUPTED');};try{await h.recover();}finally{h.native.markContinuationComplete=save;}}
  const workspace=new WorkspaceRepository({baseRepository:h.base}),bundle=j4AssetBackup(h.scope,'https://host.test'),preview=await workspace.previewRestore(h.scope,bundle);
  const imported=await workspace.restoreBackup(h.scope,{operationId:'probe_manual_assets',expectedRevision:preview.expectedRevision,planHash:preview.planHash,bundle});
  if(!imported.ok)throw Error('fixture-asset-import-failed:'+JSON.stringify(imported));
  const manualBefore=(await workspace.read(h.scope)).state,before=await contents(h.base),nativeBefore=await h.native.read(h.scope);
  const input={operationId:'old_invalidate_probe',expectedRevision:nativeBefore.revision,sourceId:p.nativeWitness.sourceId};
  const result=await new NativeRepository({baseRepository:h.base}).invalidate(h.scope,input,{guard:()=>true});
  const after=await contents(h.base),nativeAfter=await h.native.read(h.scope),manualAfter=(await workspace.read(h.scope)).state;
  let oldReader;try{await new NativeRepository({baseRepository:h.base}).listContinuations(h.scope);oldReader='accepted';}catch(e){oldReader=e.message;}
  const pendingAfter=await h.native.listContinuations(h.scope),tableSummary=Object.fromEntries(Object.keys(before).map(n=>[n,{beforeRows:before[n].length,afterRows:after[n].length,beforeDigest:digest(before[n]),afterDigest:digest(after[n]),unchanged:digest(before[n])===digest(after[n])}]));
  reports.push({evidence:'DIAGNOSTIC_MOCK_IDB_NOT_ACCEPTANCE',afterEvidence,archive,input,result,oldReader,revisionBefore:nativeBefore.revision,revisionAfter:nativeAfter.revision,sourceRevoked:nativeAfter.sources[input.sourceId]?.revoked,pendingUnchanged:digest(pendingAfter)===digest([p]),tableSummary,manualAssets:{beforeDigest:digest(manualBefore),afterDigest:digest(manualAfter),unchanged:digest(manualBefore)===digest(manualAfter),identities:Object.keys(manualBefore.identities).length,workspaces:Object.keys(manualBefore.workspaces).length,placements:Object.keys(manualBefore.placements).length,workingSet:manualBefore.preferences.workingSet.value.refs.length,snippets:manualBefore.preferences.savedSnippets.value.length},currentRecovery:await h.recover()});
 }finally{h.close();}
}}
finally{await rm(directory,{recursive:true,force:true});}
await writeFile('/private/tmp/vaiwl-old-invalidate-probe.json',JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports,null,2));
