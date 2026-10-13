import {projectFreeSearch} from './free-search-projection.mjs';
import {createURLPolicy} from '../host/url-policy.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {createFreeViewOwner} from './free-view-owner.mjs';
import {projectFreeFrame} from './free-frame-projection.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
/** One privileged replica per mount, shared by its two granted UI documents.
 * Preparation is polled in bounded RPCs; a pending read is never an empty view. */
export function createHostViewService({ui,readService,prepareNavigation=null,presentSurface=null,clock=()=>new Date().toISOString(),maxViews=32,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(typeof ui?.withScope!=='function'||!readService||!Number.isInteger(maxViews)||maxViews<1||maxViews>128)throw Error('invalid-host-view-service');
 const views=new Map();
 const reason=error=>/^[a-z0-9-]{1,80}$/.test(error?.message)?error.message:'free-view-unavailable';
 function remove(id){const entry=views.get(id);if(entry){entry.owner.stop();views.delete(id);}}
 function begin(entry){
  entry.error=null;entry.pending=true;
  entry.owner.refresh().then(()=>{entry.pending=false;},error=>{entry.pending=false;entry.error=reason(error);});
 }
 async function handle(input,sender){
  let message;try{message=structuredClone(input);sender=structuredClone(sender);}catch{return {ok:false,reason:'invalid-ui-view'};}
  if(!exactHostRecord(message,['v','type','grantId','mountId','query'])||message.v!==1||message.type!=='HOST_UI_VIEW'||!message.query||Object.getPrototypeOf(message.query)!==Object.prototype||Reflect.ownKeys(message.query).some(k=>!['segment','offset','limit','groupId','list','rowOffset','rowLimit','search'].includes(k)))return {ok:false,reason:'invalid-ui-view'};
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
   const {search,...frameQuery}=message.query;
   const page=projectFreeFrame(current,{...frameQuery,role:context.role});check();
   if(search!==undefined)page.search=projectFreeSearch(current,search);
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
 return Object.freeze({handle,present,revokeDocument,revokeTab,revokeMount:remove,stop(){for(const key of [...views.keys()])remove(key);}});
}
