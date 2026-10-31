/** UNIT authority/IDB doubles, real Free read pipeline and production Pro owner.
 * These are not live ChatGPT, browser durability or real account evidence.
 * No fixture Pro owner or serialized grant is composed into the tested owner.
 */
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../../b23/mock-idb.mjs';
import {ScopeRepository} from '../../../src/b1/scope-repository.mjs';
import {normalizedScope} from '../../../src/b1/identity.mjs';
import {NativeRepository} from '../../../src/data/native-repository.mjs';
import {WorkspaceRepository} from '../../../src/data/repository.mjs';
import {FreeEvidenceRepository} from '../../../src/data/free-evidence-repository.mjs';
import {emptyState,reduceCommand} from '../../../src/data/state.mjs';
import {createBackup} from '../../../src/data/backup.mjs';
import {createFreeReadService} from '../../../src/runtime/free-read-service.mjs';
import {createFreeViewOwner} from '../../../src/runtime/free-view-owner.mjs';
import {createProductionProService} from '../../../src/pro/integration/production-owner.mjs';
import {createSameDatabaseStore} from '../../../src/pro/integration/same-db-store.mjs';
import {proRootKey,proRecoveryKey} from '../../../src/pro/integration/storage-registry.mjs';

const NOW=Date.parse('2026-10-31T12:00:00.000Z');
const REF='11111111-1111-4111-8111-111111111111',UNKNOWN='22222222-2222-4222-8222-222222222222';
const unavailable={ok:false,reason:'pro-request-unavailable'};
const drain=async()=>{for(let i=0;i<150;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
export async function productionFixture(t,extra={}){
  const indexedDB=new MockIDBFactory(),scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'unit_A',organizationId:'personal'});
  const base=new ScopeRepository({indexedDB,databaseName:'production_owner_'+crypto.randomUUID()});
  let wall=NOW,current=true,gateAt=Infinity,opens=0;const blocked=deferred();
  const native=new NativeRepository({baseRepository:base,clock:()=>new Date(wall).toISOString(),observationGate:()=>({channel:'synthetic',sourceId:'unit_native',generation:'one'})});
  const seed=await native.apply(scope,{operationId:'unit_seed',expectedRevision:0,batch:{scopeKey:scope.key,sourceRevision:1,observedAt:new Date(wall).toISOString(),validUntil:new Date(wall+60000).toISOString(),projects:[],refs:[REF,UNKNOWN].map((id,i)=>({id,nativeTitle:i?'Unknown membership':'Positive none',nativeUrl:'https://chatgpt.com/c/'+id,availability:'available'})),membership:[{id:REF,state:'NONE',projectId:null},{id:UNKNOWN,state:'UNKNOWN',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}});
  assert.equal(seed.ok,true,seed.reason);
  const workspaces=new WorkspaceRepository({baseRepository:base,clock:()=>new Date(wall).toISOString()}),evidence=new FreeEvidenceRepository({baseRepository:base});
  const readService=createFreeReadService({repository:base,workspaces,native,evidence,clock:()=>new Date(wall).toISOString()});
  const viewOwner=createFreeViewOwner({readService,scope,guard:()=>current,clock:()=>new Date(wall).toISOString()});
  await viewOwner.refresh();
  const c={scope,scopeGrantId:'scope_A',role:'workspace',binding:'binding_A',parentFrame:{tabId:1,documentId:'parent_A',actualURL:'https://chatgpt.com/'},isCurrent:()=>current};
  const notifications=[];
  const ui={withScope:async(args,work)=>{if(args.grantId!=='grant_A'||args.mountId!=='mount_A'||args.sender.documentId!=='ui_A'||args.sender.tab.id!==1||!current)throw Error('unit-authority-denied');return work(c);},notifyScope:key=>{notifications.push(key);}};
  const repository={open:async()=>{if(++opens===gateAt)await blocked.promise;return base.open();}};
  const service=createProductionProService({ui,repository,workspaceRepository:workspaces,readService,views:{resolveProView(){const currentView=viewOwner.current();return {current:currentView,isCurrent:()=>viewOwner.current()===currentView};}},now:()=>wall,...extra});
  const sender={id:'extension_unit',documentId:'ui_A',frameId:2,tab:{id:1},url:'chrome-extension://extension_unit/workspace.html'};
  const request=(action,payload,extra={})=>service.handle({v:1,type:'HOST_UI_PRO',grantId:'grant_A',mountId:'mount_A',action,payload,...extra},sender);
  const page=()=>request('view',{op:'page',mode:'pro-default-none',selectedProjectIds:[],segment:0,offset:0,limit:8,rowLimit:5});
  const mode=value=>request('background',{op:'mode',mode:value,selectedProjectIds:[]});
  const readStore=createSameDatabaseStore({connection:()=>base.open(),enabled:true,verifyGrant:()=>({kind:'verified-scope',key:scope.key,serverIdentity:'established',persistence:'same-idb'}),verifyInputFence(){throw Error('read-only-test-helper');}});
  t.after(()=>{service.stop();viewOwner.stop();base.close();});
  return {service,base,native,workspaces,readService,viewOwner,scope,c,indexedDB,notifications,request,page,mode,raw:()=>readStore.read({}),
    async ready(){assert.equal((await mode('pro-default-none')).ok,true);const result=await page();assert.equal(result.ok,true,JSON.stringify(result));return result.value.versions;},
    wall:value=>wall=value,revoke(){current=false;},gateNextCommit(){gateAt=opens+2;return {release:()=>blocked.resolve(),wait:async()=>{await drain();assert.equal(opens,gateAt);}};}};
}
export {NOW,REF,UNKNOWN};
