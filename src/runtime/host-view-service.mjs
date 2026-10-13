import {FREE_HORIZONS,initialFreeTimePolicy,setFreeHorizon,relocateFreeSegment} from '../data/free-time-policy.mjs';
import {projectFreeWorkingSet} from './free-working-set-projection.mjs';
import {projectFreeSearch} from './free-search-projection.mjs';
import {createURLPolicy} from '../host/url-policy.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {createFreeViewOwner} from './free-view-owner.mjs';
import {projectFreeFrame} from './free-frame-projection.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
/** One privileged replica per mount, shared by its two granted UI documents.
 * Preparation is polled in bounded RPCs; a pending read is never an empty view. */
export function createHostViewService({ui,readService,workspaceRepository=null,prepareNavigation=null,presentSurface=null,clock=()=>new Date().toISOString(),maxViews=32,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(typeof ui?.withScope!=='function'||!readService||!Number.isInteger(maxViews)||maxViews<1||maxViews>128)throw Error('invalid-host-view-service');
 const views=new Map();
 const reason=error=>/^[a-z0-9-]{1,80}$/.test(error?.message)?error.message:'free-view-unavailable';
 function remove(id){const entry=views.get(id);if(entry){entry.owner.stop();views.delete(id);}}
 function begin(entry){
  entry.error=null;entry.pending=true;const generation=entry.prepareGeneration=(entry.prepareGeneration??0)+1;
  entry.owner.refresh().then(()=>{if(entry.prepareGeneration===generation)entry.pending=false;},error=>{if(entry.prepareGeneration===generation){entry.pending=false;entry.error=reason(error);}});
 }
 async function handle(input,sender){
  let message;try{message=structuredClone(input);sender=structuredClone(sender);}catch{return {ok:false,reason:'invalid-ui-view'};}
  if(!exactHostRecord(message,['v','type','grantId','mountId','query'])||message.v!==1||message.type!=='HOST_UI_VIEW'||!message.query||Object.getPrototypeOf(message.query)!==Object.prototype||Reflect.ownKeys(message.query).some(k=>!['segment','offset','limit','groupId','list','rowOffset','rowLimit','search','workingSet'].includes(k)))return {ok:false,reason:'invalid-ui-view'};
  if(message.query.search!==undefined&&message.query.workingSet!==undefined)return {ok:false,reason:'invalid-ui-view'};
  let active=true;const started=elapsedNow();
  const check=()=>{if(!active||elapsedNow()-started>=6000)throw Error('ui-view-expired');};
  try{return await withRequestDeadline(()=>ui.withScope({sender,grantId:message.grantId,mountId:message.mountId},async context=>{
   check();for(const [id,entry]of views)if(!entry.isCurrent())remove(id);
   let entry=views.get(message.mountId);
   if(entry&&(entry.scopeKey!==context.scope.key||entry.scopeGrantId!==context.scopeGrantId)){remove(message.mountId);entry=null;}
   if(!entry){
    if(views.size>=maxViews)throw Error('free-view-capacity');
    entry={scopeKey:context.scope.key,scopeGrantId:context.scopeGrantId,parentFrame:context.parentFrame,isCurrent:context.isCurrent,pending:false,error:null,presentation:{revision:0,intent:{kind:'show-workspace'}},
     owner:createFreeViewOwner({readService,scope:context.scope,guard:context.isCurrent,clock,elapsedNow,schedule,cancel})};
    views.set(message.mountId,entry);begin(entry);
   }
   if(entry.pending)return {ok:true,state:'preparing',retryAfterMs:50};
   if(entry.error)return {ok:false,reason:entry.error};
   const current=entry.owner.current();if(!current)throw Error('stale-free-view');
   const version=await readService.version(context.scope,{guard:()=>active&&context.isCurrent()});check();
   const value=current.snapshot;
   const elapsed=Date.parse(clock()),evaluated=Date.parse(value.evaluatedAt),freshnessChanged=(value.calibrationDeadlines??[]).some(deadline=>Date.parse(deadline)>evaluated&&Date.parse(deadline)<=elapsed);
   if(freshnessChanged||version.nativeRevision!==value.revision||version.revision!==value.workspaceRevision||version.evidenceRevision!==value.evidenceRevision||version.viewRevision!==value.viewRevision){begin(entry);return {ok:true,state:'preparing',retryAfterMs:50};}
   const {search,workingSet,...frameQuery}=message.query;
   const page=projectFreeFrame(current,{...frameQuery,role:context.role});check();
   if(search!==undefined)page.search=projectFreeSearch(current,search);
   if(workingSet!==undefined)page.workingSet=projectFreeWorkingSet(current,workingSet);
   page.presentation=structuredClone(entry.presentation);
   const nativeUrl=context.parentFrame.actualURL,route=createURLPolicy({origin:new URL(nativeUrl).origin}).parse(nativeUrl);
   const selected=current.index.at(nativeUrl),ref=selected.ref??(route.kind==='conversation'?current.index.byId(route.conversationId):null);
   page.current={nativeUrl,refId:ref?.id??null,projectId:ref?.membership==='PROJECT'?ref.projectId:null};
   let navigation=[];
   if(prepareNavigation){
    const rows=new Map();for(const group of page.groups.items)for(const list of Object.values(group.lists))for(const row of list.items)rows.set(row.id,row);
    for(const list of Object.values(page.entries))for(const row of list.items)rows.set(row.id,row);
    for(const row of page.selection?.items??[])rows.set(row.id,row);
    for(const row of page.search?.items??[])rows.set(row.id,row);
    for(const row of page.workingSet?.items??[])rows.set(row.id,row);
    const targets=[...rows.values()].filter(row=>row.available!==false&&typeof row.nativeUrl==='string').map(row=>({refId:row.id,navigationURL:row.nativeUrl}));
    if(targets.length>200)throw Error('free-frame-page-too-large');
    navigation=await prepareNavigation({parentFrame:context.parentFrame,binding:context.binding,targets});check();
    if(!Array.isArray(navigation)||navigation.length>200)throw Error('invalid-native-plans');
    const seen=new Set();for(const item of navigation){const expected=rows.get(item?.refId),target=item?.plan?.target;
     if(!expected||seen.has(item.refId)||!exactHostRecord(item,['refId','plan','targetKey'])||!['href','unavailable'].includes(item.plan?.mode)||(item.plan.mode==='href'&&(target?.kind!=='resolved'||target.entity!=='conversation'||target.nativeId!==item.refId||target.navigationURL!==expected.nativeUrl||!['same-tab','new-tab-preserve-current'].includes(item.plan.disposition))))throw Error('invalid-native-plans');
     seen.add(item.refId);
    }
   }
   const result={ok:true,state:'ready',page,navigation};
   if(new TextEncoder().encode(JSON.stringify(result)).length>65536)throw Error('free-frame-page-too-large');return result;
  }),{now:elapsedNow,schedule,cancel});}catch(error){return {ok:false,reason:reason(error)};}finally{active=false;}
 }
 async function setHorizon(input,sender){
  let message;try{message=structuredClone(input);sender=structuredClone(sender);}catch{return {ok:false,reason:'invalid-ui-horizon'};}
  if(!exactHostRecord(message,['v','type','grantId','mountId','operationId','expectedRevision','H','segment','anchorRefId'])||message.v!==1||message.type!=='HOST_UI_SET_HORIZON'||typeof message.operationId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(message.operationId)||!Number.isSafeInteger(message.expectedRevision)||message.expectedRevision<0||!FREE_HORIZONS.includes(message.H)||!Number.isSafeInteger(message.segment)||message.segment<0||message.segment>1000000||!(message.anchorRefId===null||typeof message.anchorRefId==='string'&&message.anchorRefId.length>0&&message.anchorRefId.length<=128))return {ok:false,reason:'invalid-ui-horizon'};
  let active=true;const started=elapsedNow(),abort=new AbortController();
  try{return await withRequestDeadline(()=>ui.withScope({sender,grantId:message.grantId,mountId:message.mountId},async context=>{
   const entry=views.get(message.mountId),current=entry?.owner.current();
   if(!workspaceRepository||!current||entry.scopeKey!==context.scope.key||entry.scopeGrantId!==context.scopeGrantId)throw Error('free-view-not-ready');
   if(entry.horizonPending)throw Error('horizon-change-in-progress');
   if(current.snapshot.workspaceRevision!==message.expectedRevision)throw Error('revision-conflict');
   entry.horizonPending=true;
   try{
    const old=current.snapshot.viewSession,anchor=message.anchorRefId===null?null:current.index.byId(message.anchorRefId);
    if(message.anchorRefId!==null&&!anchor)throw Error('horizon-anchor-unavailable');
    const candidateDay=anchor?(anchor.activityDecision??anchor.activity)?.candidateDay??null:old.T-old.H*message.segment;
    const policy=setFreeHorizon(current.snapshot.preferences?.freeTimePolicy?.value??initialFreeTimePolicy({day:old.T}),message.H,old.T);
    const valid=()=>active&&elapsedNow()-started<6000&&context.isCurrent()&&views.get(message.mountId)===entry;
    if(!valid())throw Error('ui-horizon-expired');
    const result=await workspaceRepository.command(context.scope,{operationId:message.operationId,expectedRevision:message.expectedRevision,command:{type:'SET_PREFERENCE',id:'freeTimePolicy',value:policy}},{actor:'human',guard:valid,signal:abort.signal});
    if(!result?.ok)throw Error(result?.reason??'horizon-write-unavailable');
    if(!valid())throw Error('ui-horizon-expired');
    const viewSession=entry.owner.reconfigureSession({H:policy.H,policyRevision:policy.revision});
    const segment=Math.min(1000000,relocateFreeSegment({candidateDay},viewSession));
    begin(entry);ui.notifyScope?.(context.scope.key);
    return {ok:true,segment,viewSession,workspaceRevision:result.revision};
   }finally{entry.horizonPending=false;}
  }),{now:elapsedNow,schedule,cancel});}catch(error){return {ok:false,reason:reason(error)};}finally{active=false;abort.abort();}
 }
 async function present(input,sender){
  let message;try{message=structuredClone(input);sender=structuredClone(sender);}catch{return {ok:false,reason:'invalid-ui-presentation'};}
  const intent=message?.intent,kind=intent?.kind;
  if(!exactHostRecord(message,['v','type','grantId','mountId','intent'])||message.v!==1||message.type!=='HOST_UI_PRESENT'||!exactHostRecord(intent,kind==='search-known'?['kind','themeId']:['kind'])||!['show-workspace','enter-reading','search-known','show-working-set'].includes(kind)||kind==='search-known'&&intent.themeId!==null&&(typeof intent.themeId!=='string'||intent.themeId.length<1||intent.themeId.length>128))return {ok:false,reason:'invalid-ui-presentation'};
  let active=true;try{return await withRequestDeadline(()=>ui.withScope({sender,grantId:message.grantId,mountId:message.mountId},async context=>{
   const entry=views.get(message.mountId),current=entry?.owner.current();
   if(!entry||!current||entry.scopeKey!==context.scope.key||entry.scopeGrantId!==context.scopeGrantId)throw Error('free-view-not-ready');
   if(kind==='search-known'&&intent.themeId!==null&&!current.snapshot.groups.some(group=>group.id===intent.themeId))throw Error('free-search-project-unavailable');
   if(!presentSurface)throw Error('host-presentation-unavailable');
   const shown=await presentSurface({parentFrame:context.parentFrame,binding:context.binding,mode:kind==='enter-reading'?'reading':'workspace'});
   if(!active||!context.isCurrent()||views.get(message.mountId)!==entry)throw Error('ui-presentation-expired');
   if(shown?.ok!==true)throw Error('host-presentation-unavailable');
   if(JSON.stringify(entry.presentation.intent)!==JSON.stringify(intent))entry.presentation={revision:entry.presentation.revision+1,intent};
   ui.notifyMount?.(message.mountId);return {ok:true,presentation:structuredClone(entry.presentation)};
  }),{now:elapsedNow,schedule,cancel});}catch(error){return {ok:false,reason:reason(error)};}finally{active=false;}
 }
 function revokeDocument(id){for(const [key,entry]of views)if(entry.parentFrame.documentId===id)remove(key);}
 function revokeTab(tabId){for(const [key,entry]of views)if(entry.parentFrame.tabId===tabId)remove(key);}
 return Object.freeze({handle,present,setHorizon,revokeDocument,revokeTab,revokeMount:remove,stop(){for(const key of [...views.keys()])remove(key);}});
}
