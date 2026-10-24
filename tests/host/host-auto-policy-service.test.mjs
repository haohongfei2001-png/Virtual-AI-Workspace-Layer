import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createFreeReadService} from '../../src/runtime/free-read-service.mjs';
import {createHostViewService} from '../../src/runtime/host-view-service.mjs';
import {initialFreeTimePolicy} from '../../src/data/free-time-policy.mjs';
import {localDay} from '../../src/navigation/projection.mjs';
const NOW='2026-10-14T12:00:00.000Z',DAY=localDay(NOW,'UTC'),SCOPE=normalizedScope({verified:true,provider:'chatgpt',accountId:'auto-fixture',organizationId:'personal'});
const drain=()=>new Promise(resolve=>setImmediate(resolve));
// Explicit synthetic facts and a UI authority double; no production-auth claim.
// Data reads, prepared projection, workspace CAS and activity fences are real.
async function fixture(t,{mode='auto',confirmed=true,unknown=false,incomplete=false}={}){
 let time=Date.parse(NOW),elapsed=0,current=true,present=async()=>({ok:true}),ops=0;
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'auto-policy-'+crypto.randomUUID()});
 const clock=()=>new Date(time).toISOString();
 const workspaces=new WorkspaceRepository({baseRepository:base,clock});
 const native=new NativeRepository({baseRepository:base,clock,observationGate:()=>({channel:'synthetic',sourceId:'native_fixture',generation:'one'})});
 const evidence=new FreeEvidenceRepository({baseRepository:base,clock,observationGate:()=>({channel:'synthetic',sourceId:'activity_fixture',generation:'one'})});
 const ids=Array.from({length:16},(_,i)=>String(i));
 const batch={scopeKey:SCOPE.key,sourceRevision:1,observedAt:NOW,validUntil:'2026-10-15T12:00:00.000Z',projects:ids.map(i=>({id:'p'+i,nativeName:'Native '+i,nativeUrl:`https://chatgpt.com/g/p${i}/project`,availability:'available',memberCount:1})),refs:ids.map(i=>({id:'c'+i,nativeTitle:'Conversation '+i,nativeUrl:`https://chatgpt.com/c/c${i}`,availability:'available'})),membership:ids.map(i=>({id:'c'+i,state:unknown&&i==='0'?'UNKNOWN':'PROJECT',projectId:unknown&&i==='0'?null:'p'+i})),inventory:{projects:incomplete?'partial':'complete',conversations:incomplete?'partial':'complete',cursor:null}};
 assert.equal((await native.apply(SCOPE,{operationId:'native-seed',expectedRevision:0,batch})).ok,true);
 const witness={sourceId:'activity_fixture',generation:'one',sourceRevision:1,observedAt:NOW};
 const events=ids.map(i=>({...witness,id:'event'+i,conversationId:'c'+i,messageId:'message'+i,branchId:'main',actorVerified:true,actorScopeKey:SCOPE.key,role:'user',kind:'new-send',sendState:'committed',precision:'millisecond',sentAt:new Date(time-(Number(i)<8?3:20)*86400000).toISOString()}));
 const evidenceBatch={sources:[{id:'activity_fixture',generation:'one',sourceRevision:1,observedAt:NOW,validUntil:batch.validUntil,channel:'synthetic'}],events,hints:[],coverage:events.map(e=>({...witness,id:'coverage'+e.id,conversationId:e.conversationId,from:e.sentAt,through:NOW,completeness:'complete',branches:'all',gaps:[]}))};
 assert.equal((await evidence.apply(SCOPE,{operationId:'activity-seed',expectedRevision:0,batch:evidenceBatch})).ok,true);
 const policy={...initialFreeTimePolicy({legacy:mode==='fixed',day:DAY-30}),...(confirmed?{recommendation:14,confirmations:2,lastEvaluatedDay:DAY-7}:{})};
 assert.equal((await workspaces.command(SCOPE,{operationId:'policy-seed',expectedRevision:(await workspaces.read(SCOPE)).state.revision,command:{type:'SET_PREFERENCE',id:'freeTimePolicy',value:policy}})).ok,true);
 const read=createFreeReadService({repository:base,workspaces,native,evidence,clock,admitActivitySource:(_s,source)=>source.channel==='synthetic'});
 const notices=[];
 const ui={async withScope({sender,grantId,mountId},work){if(!current||mountId!=='mount'||grantId!=='grant-'+sender.role||!['workspace','sidebar'].includes(sender.role))throw Error('ui-scope-changed');const result=await work({scope:SCOPE,scopeGrantId:'scope-grant',role:sender.role,parentFrame:{actualURL:'https://chatgpt.com/',tabId:1,frameId:0,documentId:'parent'},binding:{documentToken:'doc'},isCurrent:()=>current});if(!current)throw Error('ui-scope-changed');return result;},notifyMount:id=>notices.push(id),notifyScope:key=>notices.push(key)};
 const service=createHostViewService({ui,readService:read,workspaceRepository:workspaces,clock,elapsedNow:()=>elapsed,presentSurface:args=>present(args)});
 t.after(()=>{service.stop();base.close();});
 const envelope=(type,role='workspace')=>({v:1,type,grantId:'grant-'+role,mountId:'mount'});
 async function ready(query={}){for(let i=0;i<100;i++){const r=await service.handle({...envelope('HOST_UI_VIEW'),query},{role:'workspace'});if(r.state!=='preparing'){assert.equal(r.ok,true,JSON.stringify(r));return r.page;}await drain();}assert.fail('bounded preparation');}
 const enter=page=>service.enterCurrent({...envelope('HOST_UI_CURRENT_ENTRY'),expectedRevision:page.workspaceRevision,viewSession:page.viewSession},{role:'workspace'});
 const undo=(change,extra={},role='workspace')=>service.undoAutoHorizon({...envelope('HOST_UI_UNDO_AUTO_HORIZON',role),operationId:'undo-'+(++ops),expectedRevision:change.workspaceRevision,id:change.id,...extra},{role});
 const state=async()=>(await workspaces.read(SCOPE)).state;
 return {base,workspaces,native,evidence,read,service,notices,ready,enter,undo,state,scope:SCOPE,batch,evidenceBatch,setPresent:fn=>present=fn,deny:()=>current=false,advance:ms=>{time+=ms;elapsed+=ms;}};
}
test('MOCK_IDB explicit auto changes H only at current entry and persists one fenced policy decision',async t=>{
 const h=await fixture(t),page=await h.ready(),before=await h.state();assert.equal(page.viewSession.H,30);
 const response=await h.enter(page);assert.equal(response.ok,true,JSON.stringify(response));assert.equal(response.viewSession.H,14);
 assert.deepEqual(response.policyCommit,{workspaceRevision:before.revision+1,policyRevision:1});assert.equal(response.autoChange.previousH,30);assert.equal(response.autoChange.H,14);
 const after=await h.state();assert.equal(after.revision,before.revision+1);assert.equal(after.preferences.freeTimePolicy.value.H,14);
 assert.deepEqual(after.identities,before.identities);assert.deepEqual(after.placements,before.placements);
 const fresh=await h.ready();assert.equal(fresh.viewSession.H,14);assert.equal((await h.enter(fresh)).policyCommit,undefined,'same-day re-entry does not repeat evaluation');
});
test('MOCK_IDB unconfirmed density records progress without prematurely changing H',async t=>{
 const h=await fixture(t,{confirmed:false}),page=await h.ready(),r=await h.enter(page);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.viewSession.H,30);assert.equal(r.autoChange,undefined);assert.ok(r.policyCommit);
 const policy=(await h.state()).preferences.freeTimePolicy.value;assert.equal(policy.confirmations,1);assert.equal(policy.lastEvaluatedDay,DAY);assert.equal(policy.recommendation,14);
});
for(const options of [{mode:'fixed'},{unknown:true},{incomplete:true}])test('MOCK_IDB fixed or insufficient evidence never writes policy '+JSON.stringify(options),async t=>{
 const h=await fixture(t,options),page=await h.ready(),before=await h.state(),r=await h.enter(page);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.policyCommit,undefined);assert.equal(r.autoChange,undefined);assert.deepEqual(await h.state(),before);
});
test('MOCK_IDB explicit undo restores fixed old H with fourteen-day cooldown',async t=>{
 const h=await fixture(t),r=await h.enter(await h.ready());await h.ready();assert.ok(r.autoChange);
 const undo=await h.undo(r.autoChange);assert.equal(undo.ok,true,JSON.stringify(undo));const policy=(await h.state()).preferences.freeTimePolicy.value;assert.equal(policy.mode,'fixed');assert.equal(policy.H,30);assert.equal(policy.cooldownUntil,DAY+14);assert.equal(policy.recommendation,null);assert.equal(policy.confirmations,0);
 assert.equal((await h.undo(r.autoChange)).ok,false,'consumed action cannot undo twice');
});
for(const failure of ['expiry','revocation','sidebar','revision','history'])test('MOCK_IDB undo fails closed for '+failure,async t=>{
 const h=await fixture(t),r=await h.enter(await h.ready());await h.ready();const before=await h.state();assert.ok(r.autoChange);
 if(failure==='expiry')h.advance(15000);if(failure==='revocation')h.deny();if(failure==='history')await h.ready({segment:1});
 const result=await h.undo(r.autoChange,failure==='revision'?{expectedRevision:before.revision+1}:{},failure==='sidebar'?'sidebar':'workspace');assert.equal(result.ok,false);assert.deepEqual(await h.state(),before);
});
for(const changed of ['workspace','native','evidence'])test('MOCK_IDB concurrent '+changed+' write rejects stale entry atomically',async t=>{
 const h=await fixture(t),page=await h.ready();let release,entered=false;h.setPresent(async()=>{entered=true;await new Promise(r=>release=r);return {ok:true};});const pending=h.enter(page);while(!entered)await drain();
 if(changed==='workspace'){const s=await h.state();assert.equal((await h.workspaces.command(h.scope,{operationId:'other-human',expectedRevision:s.revision,command:{type:'SET_PREFERENCE',id:'workingSet',value:{refs:[],current:null}}})).ok,true);}
 if(changed==='native'){const revision=await h.native.version(h.scope);assert.equal((await h.native.apply(h.scope,{operationId:'other-native',expectedRevision:revision,batch:{...h.batch,sourceRevision:2}})).ok,true);}
 if(changed==='evidence'){const revision=await h.evidence.version(h.scope);assert.equal((await h.evidence.invalidate(h.scope,{operationId:'other-evidence',sourceId:'activity_fixture',expectedRevision:revision})).ok,true);}
 const before=await h.state();release();assert.equal((await pending).ok,false);assert.deepEqual(await h.state(),before);
});
test('MOCK_IDB current-entry pending excludes simultaneous manual horizon command',async t=>{
 const h=await fixture(t),page=await h.ready();let release,entered=false;h.setPresent(async()=>{entered=true;await new Promise(r=>release=r);return {ok:true};});const pending=h.enter(page);while(!entered)await drain();
 const manual=await h.service.setHorizon({v:1,type:'HOST_UI_SET_HORIZON',grantId:'grant-workspace',mountId:'mount',operationId:'manual',expectedRevision:page.workspaceRevision,H:60,segment:0,anchorRefId:null},{role:'workspace'});assert.equal(manual.ok,false);assert.equal(manual.reason,'preference-change-in-progress');release();assert.equal((await pending).ok,true);
});
for(const changed of ['native','evidence','deadline','revocation'])test('MOCK_IDB final commit fence rejects '+changed+' after complete read',async t=>{
 const h=await fixture(t),page=await h.ready(),before=await h.state(),command=h.workspaces.command.bind(h.workspaces);let fenced=false;
 h.workspaces.command=async(scope,request,options)=>{
  if(options?.expectedActivityVersions){fenced=true;
   if(changed==='native'){const revision=await h.native.version(h.scope);assert.equal((await h.native.apply(h.scope,{operationId:'last-native',expectedRevision:revision,batch:{...h.batch,sourceRevision:2}})).ok,true);}
   if(changed==='evidence'){const revision=await h.evidence.version(h.scope);assert.equal((await h.evidence.invalidate(h.scope,{operationId:'last-evidence',sourceId:'activity_fixture',expectedRevision:revision})).ok,true);}
   if(changed==='deadline')h.advance(6000);if(changed==='revocation')h.deny();
  }
  return command(scope,request,options);
 };
 const result=await h.enter(page);assert.equal(fenced,true,'real policy command must carry activity root preconditions');assert.equal(result.ok,false);assert.deepEqual(await h.state(),before);
});
