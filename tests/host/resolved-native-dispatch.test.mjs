import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostCurrentNavigation} from '../../src/runtime/host-current-navigation.mjs';
import {createFrameNativePlans} from '../../src/host/frame-native-plans.mjs';
import {createNativeActions} from '../../src/host/native-actions.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const id='33333333-3333-4333-8333-333333333333',url='https://chatgpt.com/c/'+id;
function runtime(urlPolicy=null){
 let time=100,live=true,calls=0,proofCalls=0,bridge=async({command})=>({state:'dispatched',actionId:command.actionId});
 const context={scope:{key:'scope'},scopeGrantId:'scope_grant',role:'workspace',binding:{documentToken:'doc',producerToken:'producer',routeEpoch:1},parentFrame:{tabId:1,frameId:0,documentId:'browser_doc',actualURL:'https://chatgpt.com/'},isCurrent:()=>live};
 const control={id:'control',documentToken:'doc',routeEpoch:1,regionEpoch:1,controlKind:'conversation'};
 const row={refId:id,targetKey:'target',plan:{mode:'native-control',target:{kind:'resolved',entity:'conversation',nativeId:id,navigationURL:url,liveHandle:control},control,planRevision:1}};
 const service=createHostCurrentNavigation({urlPolicy,ui:{withScope:async(args,fn)=>{if(args.grantId!=='grant'||args.mountId!=='mount'||args.sender!=='owned')throw Error('denied');return fn(context);}},observations:{withCurrent:()=>{proofCalls++;throw Error('native must not request body proof');}},bridge:async args=>{calls++;return bridge(args);},elapsedNow:()=>time});
 const register=(rows=[row])=>service.register({context,grantId:'grant',mountId:'mount',navigation:rows});
 const handle=(patch={},sender='owned')=>service.handle({v:1,type:'HOST_UI_DISPATCH_NATIVE',grantId:'grant',mountId:'mount',actionId:'action',planRevision:1,targetKey:'target',...patch},sender);
 return {context,row,service,register,handle,setTime:v=>time=v,setLive:v=>live=v,setBridge:v=>bridge=v,counts:()=>({calls,proofCalls})};
}
test('resolved native dispatch uses issued UI owner and native mode without current-body authority',async()=>{
 const f=runtime();f.register();f.setBridge(async({context,command,mode,guard,remainingMs})=>{assert.equal(mode,'native-control');assert.equal(remainingMs,6000);assert.equal(guard(),true);assert.equal(f.service.authorize(command,context.parentFrame),true);for(const patch of [{tabId:9},{frameId:9},{documentId:'other'},{actualURL:url}])assert.equal(f.service.authorize(command,{...context.parentFrame,...patch}),false);return {state:'dispatched',actionId:command.actionId};});
 assert.deepEqual(await f.handle(),{ok:true,state:'dispatched'});assert.deepEqual(f.counts(),{calls:1,proofCalls:0});assert.equal((await f.handle()).ok,false);assert.equal(f.counts().calls,1);
});
test('native registration rejects target, handle, document, route, kind and shape substitutions',()=>{
 const mutations=[r=>r.plan.target.nativeId='other',r=>r.plan.target.navigationURL='https://evil.test/c/'+id,r=>r.plan.target.liveHandle={...r.plan.control,id:'other'},r=>r.plan.control.documentToken='other',r=>r.plan.control.routeEpoch=2,r=>r.plan.control.controlKind='project',r=>r.plan.mode='href',r=>r.plan.control.extra=true,r=>r.plan.control[Symbol('extra')]=true,r=>r.plan.target.kind='live-control',r=>r.projectId=r.refId];
 for(const mutate of mutations){const f=runtime(),r=structuredClone(f.row);mutate(r);assert.throws(()=>f.register([r]));}
});
test('native owner rejects wrong channel, UI, scope, revision and target before bridging',async()=>{
 for(const patch of [{type:'HOST_UI_DISPATCH_CURRENT'},{grantId:'other'},{mountId:'other'},{planRevision:2},{targetKey:'other'},{extra:true}]){const f=runtime();f.register();assert.equal((await f.handle(patch)).ok,false);assert.equal(f.counts().calls,0);}
 const f=runtime();f.register();assert.equal((await f.handle({},'wrong')).ok,false);f.context.scope={key:'other'};assert.equal((await f.handle()).ok,false);assert.equal(f.counts().calls,0);
});
test('changed binding and parent route before native attempt are blocked',async()=>{
 for(const change of [f=>f.context.binding.routeEpoch++,f=>f.context.binding.documentToken='other',f=>f.context.parentFrame.actualURL=url,f=>f.setLive(false),f=>f.setTime(30100)]){const f=runtime();f.register();change(f);assert.equal((await f.handle()).ok,false);assert.equal(f.counts().calls,0);}
});
test('lost, unknown or cross-mode native acknowledgement is unconfirmed and cannot replay',async()=>{
 for(const response of [undefined,{state:'unknown'},{state:'already-current'},{state:'dispatched',actionId:'other'},{state:'dispatched',extra:true},new Error('lost')]){const f=runtime();f.register();f.setBridge(async()=>{if(response instanceof Error)throw response;return response;});assert.deepEqual(await f.handle(),{ok:true,state:'unconfirmed'});assert.equal((await f.handle()).ok,false);assert.deepEqual(f.counts(),{calls:1,proofCalls:0});}
});
test('pending native duplicate cannot dispatch and late acknowledgement is unconfirmed',async()=>{
 const f=runtime();f.register();let release,entered;const ready=new Promise(r=>entered=r);f.setBridge(()=>{entered();return new Promise(r=>release=r);});const first=f.handle();await ready;assert.equal((await f.handle()).ok,false);f.setTime(6100);release({state:'dispatched'});assert.deepEqual(await first,{ok:true,state:'unconfirmed'});assert.equal(f.counts().calls,1);
});
for(const change of ['replace','scope','stop'])test(`native ${change} while dispatched yields unconfirmed`,async()=>{const f=runtime();f.register();f.setBridge(async({guard})=>{if(change==='replace')f.register();if(change==='scope')f.setLive(false);if(change==='stop')f.service.stop();assert.equal(guard(),false);return {state:'dispatched'};});assert.deepEqual(await f.handle(),{ok:true,state:'unconfirmed'});});
function content(entity='conversation'){
 let time=100,wall=1800000000000,here='https://chatgpt.com/',binding='binding',intent=0,clicks=0,shows=0,lookups=0,helper;
 const hooks={click(){},before(){},ack(){}};
 const nativeId=entity==='conversation'?id:'project_a',navigationURL=entity==='conversation'?url:'https://chatgpt.com/g/project_a/project';
 const control={id:'control',documentToken:'doc',routeEpoch:1,regionEpoch:1,controlKind:entity};
 const node={isConnected:true,click(){clicks++;hooks.click();}};
 const actions=createNativeActions({discovery:{getNode:h=>h.id===control.id&&node.isConnected?node:null},urlPolicy:createURLPolicy({profile:{projectId:({container})=>container}}),currentURL:()=>here,bodyProof:()=>null,inputRisk:()=>({state:'clear',flags:[]}),authorize:c=>helper.authorize(c),beforeDispatch:p=>{hooks.before();helper.beforeDispatch(p);},now:()=>time});
 const adapter={...actions,currentURL:()=>here,resolveLoadedTargets:targets=>{lookups++;assert.deepEqual(targets,[{entity,nativeId,navigationURL}]);return [control];},dispatchNative:async c=>{const result=await actions.dispatchNative(c);hooks.ack();return result;}};
 helper=createFrameNativePlans({adapter,bindingCurrent:()=>binding,showNativeReading:()=>{shows++;intent++;return true;},captureIntent:()=>{const captured=intent;return ()=>captured===intent;},now:()=>wall,elapsedNow:()=>time});
 const row=helper.plan({targets:[{[entity==='project'?'projectId':'refId']:nativeId,navigationURL}]})[0];
 const command={actionId:'action',uiGrantId:'grant',mountId:'mount',planRevision:row.plan.planRevision,targetKey:row.targetKey};
 return {helper,row,command,node,hooks,activate:()=>helper.activate({command,expiresAt:new Date(wall+6000).toISOString()}),advance:n=>{time+=n;wall+=n;},route:()=>here=url,binding:()=>binding='other',intent:()=>intent++,counts:()=>({clicks,shows,lookups})};
}
for(const entity of ['conversation','project'])test(`real NativeActions + frame plans click resolved ${entity} once without body proof`,async()=>{const f=content(entity);assert.equal(f.row.plan.mode,'native-control');assert.equal((await f.activate()).state,'dispatched');assert.deepEqual(f.counts(),{clicks:1,shows:1,lookups:1});assert.equal((await f.activate()).state,'blocked');assert.equal(f.counts().clicks,1);assert.equal(f.helper.authorize(f.command),false);});
for(const stage of ['route','binding','deadline'])test(`native click followed by ${stage} change is unconfirmed with no replay`,async()=>{const f=content();f.hooks.click=()=>stage==='deadline'?f.advance(6000):f[stage]();assert.equal((await f.activate()).state,'unconfirmed');assert.equal(f.counts().clicks,1);assert.equal((await f.activate()).state,'blocked');assert.equal(f.counts().clicks,1);});
test('native unknown click outcome stays unconfirmed, no repeated click',async()=>{const f=content();f.hooks.click=()=>{throw Error('native handler lost acknowledgement');};assert.equal((await f.activate()).state,'unconfirmed');assert.equal((await f.activate()).state,'blocked');assert.equal(f.counts().clicks,1);});
test('intent invalidation before native reading cannot be refreshed into authority',async()=>{const f=content();f.hooks.before=()=>f.intent();assert.equal((await f.activate()).state,'unconfirmed');assert.deepEqual(f.counts(),{clicks:0,shows:0,lookups:1});});
test('detached native target and thirty-second expiry cannot click',async()=>{for(const change of [f=>f.node.isConnected=false,f=>f.advance(30000)]){const f=content();change(f);assert.equal((await f.activate()).state,'blocked');assert.equal(f.counts().clicks,0);}});
test('owner rechecks captured route and binding after native dispatch begins',async()=>{
 for(const change of [f=>f.context.binding.routeEpoch++,f=>f.context.binding.documentToken='other',f=>f.context.parentFrame.actualURL=url]){const f=runtime();f.register();f.setBridge(async()=>{change(f);return {state:'dispatched'};});assert.deepEqual(await f.handle(),{ok:true,state:'unconfirmed'});assert.equal((await f.handle()).ok,false);assert.equal(f.counts().calls,1);}
});

test('qualified Project owner uses exact native identity while default profile stays failclosed',async()=>{
 const policy=createURLPolicy({profile:{projectId:({container})=>container==='project_a'?'project_a':null}});
 const projectRow=f=>{const control={...f.row.plan.control,controlKind:'project'};return {projectId:'project_a',targetKey:'target',plan:{mode:'native-control',target:{kind:'resolved',entity:'project',nativeId:'project_a',navigationURL:'https://chatgpt.com/g/project_a/project',liveHandle:control},control,planRevision:1}};};
 const plain=runtime();assert.throws(()=>plain.register([projectRow(plain)]));assert.equal(plain.counts().calls,0);
 const qualified=runtime(policy);qualified.register([projectRow(qualified)]);assert.deepEqual(await qualified.handle(),{ok:true,state:'dispatched'});assert.deepEqual(qualified.counts(),{calls:1,proofCalls:0});
 for(const replacement of ['https://chatgpt.com/g/project_b/project','https://evil.test/g/project_a/project']){const f=runtime(policy),row=projectRow(f);row.plan.target.navigationURL=replacement;assert.throws(()=>f.register([row]));}
});
test('current conversation with loaded native handle normalizes to body-certified same-target',async()=>{
 const handle={id:'control',documentToken:'doc',routeEpoch:1,regionEpoch:1,controlKind:'conversation'};let helper,clicks=0,reading=0;
 const actions=createNativeActions({discovery:{getNode:()=>({isConnected:true,click:()=>clicks++})},urlPolicy:createURLPolicy(),currentURL:()=>url,bodyProof:()=>({conversationId:id,bodyProofId:'proof'}),inputRisk:()=>({state:'clear',flags:[]}),authorize:command=>helper.authorize(command)});
 helper=createFrameNativePlans({adapter:{...actions,currentURL:()=>url,resolveLoadedTargets:()=>[handle]},bindingCurrent:()=>'binding',showReading:()=>{reading++;return true;}});
 const row=helper.plan({targets:[{refId:id,navigationURL:url}]})[0];assert.equal(row.plan.mode,'same-target');assert.equal(row.plan.target.liveHandle,null);assert.equal(row.plan.bodyProofId,'proof');
 const result=await helper.activate({command:{actionId:'action',uiGrantId:'grant',mountId:'mount',planRevision:row.plan.planRevision,targetKey:row.targetKey},expiresAt:new Date(Date.now()+5900).toISOString()});assert.equal(result.state,'already-current');assert.equal(reading,1);assert.equal(clicks,0);
});
