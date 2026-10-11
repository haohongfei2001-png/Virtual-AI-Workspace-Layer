import { ScopeRepository } from '../src/b1/scope-repository.mjs';
import { createDocumentBindingBroker } from '../src/b1/document-binding-broker.mjs';
import { WorkspaceRepository } from '../src/data/repository.mjs';
import { routeInfo, syntheticURL, scopeOf } from './data.mjs';
import { persistentSeed, syntheticEvidenceGate } from './persistent-seed.mjs';
/** Same B1 database in v2. Only extension origin is durable product storage.
 * Page-mode uses the same code in its labelled host-origin test harness.
 */
export function createFixtureService({indexedDB,extensionId,getFrame,makeId}){
  const repository=new ScopeRepository({indexedDB,databaseName:'vaiwl-hf-synthetic-v1'});
  const workspaces=new WorkspaceRepository({baseRepository:repository,evidenceGate:syntheticEvidenceGate});
  let readDelay=0;const pending=new Map(),initialized=new Set();
  async function seed(scope,origin){
    // This map only coalesces in-flight work. The durable marker is an IDB receipt.
    const key=scope.accountId+':'+origin;if(initialized.has(key))return;
    if(!pending.has(key))pending.set(key,(async()=>{let existing;try{existing=await workspaces.read(scope);}catch(e){if(['corrupt-record','invalid-state','invalid-schema','invalid-user-event'].includes(e.message)){initialized.add(key);return;}throw e;}if(existing.state.revision){initialized.add(key);return;}
      const result=await workspaces.initialize(scope,persistentSeed(scope,origin));if(!result.ok&&result.reason!=='revision-conflict')throw Error(result.reason);initialized.add(key);
    })().finally(()=>pending.delete(key)));return pending.get(key);
  }
  const wait=async()=>{if(readDelay)await new Promise(r=>setTimeout(r,readDelay));};
  const broker=createDocumentBindingBroker({extensionId,getFrame,makeId,allowedURL:syntheticURL,leaseMs:20000,
    resolveScope:async({currentFrame})=>{const info=routeInfo(currentFrame.url);if(!info||info.account==='unknown')return null;const scope=scopeOf(info.account);await seed(scope,info.origin);return scope;},
    repository:{get:(...a)=>repository.get(...a),upsert:x=>repository.upsert(x),list:async scope=>{await wait();const {state}=await workspaces.read(scope);return Object.values(state.refs).map(r=>({conversationId:r.id,nativeUrl:r.nativeUrl,projectId:r.projectId,revision:1}));}},
    workspaceRepository:{
      version:async(scope,options)=>{const {state,view,diagnostics}=await workspaces.read(scope,options);return {revision:state.revision,viewRevision:view?.revision??0,viewDiagnostic:diagnostics.view};},
      snapshot:async(scope,now,timeZone,options,size=8)=>{await wait();const value=await workspaces.snapshot(scope,now,timeZone,options);
        // Visibility scale is a fixture control, never a deletion or truncated DB write.
        const visible=w=>w.owner!=='bootstrap'||w.seedIndex<size;
        value.themes=value.themes.filter(visible);value.groups=value.groups.filter(visible);return value;},
      command:(...args)=>workspaces.command(...args),undo:(...args)=>workspaces.undo(...args),history:(...args)=>workspaces.history(...args),saveView:(...args)=>workspaces.saveView(...args),exportBackup:(...args)=>workspaces.exportBackup(...args),previewRestore:(...args)=>workspaces.previewRestore(...args),restoreBackup:(...args)=>workspaces.restoreBackup(...args),recoveryStatus:(...args)=>workspaces.recoveryStatus(...args),recover:(...args)=>workspaces.recover(...args),storage:async()=>{try{const value=await navigator.storage.estimate();return {usage:value.usage??null,quota:value.quota??null,persisted:await navigator.storage.persisted()};}catch{return {usage:null,quota:null,persisted:null};}}
    }
  });
  return {broker,repository,workspaces,setDelay:ms=>readDelay=Math.min(3000,Math.max(0,Number(ms)||0)),close:()=>repository.close()};
}
