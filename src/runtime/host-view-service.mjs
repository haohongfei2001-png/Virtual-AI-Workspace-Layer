import {locateFreeProject} from './free-project-location.mjs';
import {validateFrameResumeView,validateResumeQuery} from '../host/frame-resume-state.mjs';
import {prepareHostAutoTimePolicy,hostAutoTimePolicyFresh} from './host-auto-time-policy.mjs';
import {localDay} from '../navigation/projection.mjs';
import {FREE_HORIZONS,initialFreeTimePolicy,setFreeHorizon,coolFreeTimePolicy,enableFreeAutoTimePolicy,relocateFreeSegment} from '../data/free-time-policy.mjs';
import {projectFreeWorkingSet} from './free-working-set-projection.mjs';
import {projectFreeSearch} from './free-search-projection.mjs';
import {createURLPolicy} from '../host/url-policy.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {createFreeViewOwner} from './free-view-owner.mjs';
import {projectFreeFrame,freeFrameRowDTO} from './free-frame-projection.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
/** One privileged replica per mount, shared by its two granted UI documents.
 * Preparation is polled in bounded RPCs; a pending read is never an empty view. */
export function createHostViewService({ui,readService,workspaceRepository=null,prepareNavigation=null,nativeCandidatesEnabled=false,presentSurface=null,clock=()=>new Date().toISOString(),maxViews=32,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(typeof ui?.withScope!=='function'||!readService||!Number.isInteger(maxViews)||maxViews<1||maxViews>128)throw Error('invalid-host-view-service');
 const views=new Map(),resumes=new Map();
 const resumeKey=(context,role=context.role)=>JSON.stringify([context.parentFrame.tabId,context.parentFrame.documentId,context.parentFrame.actualURL,context.scope.key,role]);
 function resumeFor(context,role=context.role){
  const time=elapsedNow();for(const [key,value]of resumes)if(time<value.at||time-value.at>=1800000||value.tabId===context.parentFrame.tabId&&value.documentId===context.parentFrame.documentId&&value.scopeKey!==context.scope.key)resumes.delete(key);
  return resumes.get(resumeKey(context,role));
 }
 function rememberResume(context,query,session,view){
  const key=resumeKey(context),prior=resumeFor(context),validatedQuery=validateResumeQuery(query);
  if(!context.isCurrent())return;
  const record={tabId:context.parentFrame.tabId,documentId:context.parentFrame.documentId,scopeKey:context.scope.key,at:elapsedNow(),query:validatedQuery,session:structuredClone(session),view:view??(prior&&JSON.stringify(prior.query)===JSON.stringify(validatedQuery)?prior.view:null)??null};
  resumes.delete(key);resumes.set(key,record);while(resumes.size>32)resumes.delete(resumes.keys().next().value);
 }
 async function resume(input,sender){
  let m,active=true;const started=elapsedNow();try{m=structuredClone(input);const write=m?.type==='HOST_UI_SAVE_VIEW';if(!['HOST_UI_RESUME','HOST_UI_SAVE_VIEW'].includes(m?.type)||!exactHostRecord(m,write?['v','type','grantId','mountId','view','expectedQuery']:['v','type','grantId','mountId'])||m.v!==1)throw Error('invalid-view-resume');if(write){m.view=validateFrameResumeView(m.view);m.expectedQuery=validateResumeQuery(m.expectedQuery);}
   return await withRequestDeadline(()=>ui.withScope({sender,grantId:m.grantId,mountId:m.mountId},context=>{
    if(!active||elapsedNow()-started<0||elapsedNow()-started>=6000)throw Error('expired-view-resume');
    const old=resumeFor(context);if(!context.isCurrent())throw Error('stale-view-resume');
    if(!write)return {ok:true,resume:old?{query:structuredClone(old.query),view:old.view?structuredClone(old.view):null}:null};
    const entry=views.get(m.mountId),current=entry?.owner.current();
    if(!old||JSON.stringify(m.expectedQuery)!==JSON.stringify(old.query)||!current||entry.pending||entry.error||entry.scopeKey!==context.scope.key||entry.scopeGrantId!==context.scopeGrantId||m.view.segment!==(old.query.segment??0))throw Error('stale-view-resume');
    rememberResume(context,old.query,current.snapshot.viewSession,m.view);return {ok:true};
   }),{now:elapsedNow,schedule,cancel});
  }catch{return {ok:false,reason:'view-resume-unavailable'};}finally{active=false;}
 }
 const reason=error=>/^[a-z0-9-]{1,80}$/.test(error?.message)?error.message:'free-view-unavailable';
 function remove(id){const entry=views.get(id);if(entry){entry.prepareGeneration=(entry.prepareGeneration??0)+1;cancel(entry.retryTimer);entry.owner.stop();views.delete(id);}}
 function begin(entry){
  cancel(entry.retryTimer);entry.retryTimer=null;entry.error=null;entry.pending=true;
  const generation=entry.prepareGeneration=(entry.prepareGeneration??0)+1,started=elapsedNow();let retries=0;
  const current=()=>entry.prepareGeneration===generation&&entry.isCurrent();
  const run=()=>{
   if(!current())return;
   entry.owner.refresh().then(()=>{if(!current())return;entry.pending=false;if(elapsedNow()-started>=30000)entry.error='read-budget-exhausted';},error=>{
    if(!current())return;
    if(['snapshot-revision-changed','stale-free-page'].includes(error?.message)&&retries<2&&elapsedNow()-started<29950){retries++;entry.retryTimer=schedule(run,50);return;}
    entry.pending=false;entry.error=reason(error);
   });
  };run();
 }
 async function handle(input,sender){
  let message;try{message=structuredClone(input);sender=structuredClone(sender);}catch{return {ok:false,reason:'invalid-ui-view'};}
  if(!exactHostRecord(message,['v','type','grantId','mountId','query',...(Object.hasOwn(message??{},'locateProjectId')?['locateProjectId']:[])])||message.v!==1||message.type!=='HOST_UI_VIEW'||!message.query||Object.getPrototypeOf(message.query)!==Object.prototype||Reflect.ownKeys(message.query).some(k=>!['segment','offset','limit','groupId','list','rowOffset','rowLimit','search','workingSet'].includes(k)))return {ok:false,reason:'invalid-ui-view'};
  if(Object.hasOwn(message,'locateProjectId')&&(message.query.search!==undefined||message.query.workingSet!==undefined))return {ok:false,reason:'invalid-ui-view'};
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
     owner:createFreeViewOwner({readService,scope:context.scope,guard:context.isCurrent,clock,elapsedNow,schedule,cancel,initialSession:(resumeFor(context,'workspace')?.query.segment??0)>0?resumeFor(context,'workspace').session:null})};
    views.set(message.mountId,entry);begin(entry);
   }
   if(entry.currentEntryPending&&context.role==='workspace'&&((message.query.segment??0)!==0||message.query.search!==undefined||message.query.workingSet!==undefined))entry.currentEntryEligible=false;
   if(entry.pending||entry.autoReading)return {ok:true,state:'preparing',retryAfterMs:50};
   if(entry.error)return {ok:false,reason:entry.error};
   const current=entry.owner.current();if(!current)throw Error('stale-free-view');
   const version=await readService.version(context.scope,{guard:()=>active&&context.isCurrent()});check();
   const value=current.snapshot;
   const elapsed=Date.parse(clock()),evaluated=Date.parse(value.evaluatedAt),freshnessChanged=[...(value.calibrationDeadlines??[]),...(value.activityFreshness?.deadlines??[])].some(deadline=>Date.parse(deadline)>evaluated&&Date.parse(deadline)<=elapsed);
   if(freshnessChanged||version.nativeRevision!==value.revision||version.revision!==value.workspaceRevision||version.evidenceRevision!==value.evidenceRevision||version.viewRevision!==value.viewRevision){begin(entry);return {ok:true,state:'preparing',retryAfterMs:50};}
   const {search,workingSet,...frameQuery}=message.query;
   const locating=Object.hasOwn(message,'locateProjectId');if(locating)validateResumeQuery(message.query);
   const location=locating?locateFreeProject(current,{projectId:message.locateProjectId,segment:frameQuery.segment??0,limit:frameQuery.limit??24}):null;
   const effectiveQuery=location?{...message.query,offset:location.offset}:message.query;
   const page=projectFreeFrame(current,{...frameQuery,...(location?{offset:location.offset}:{}),role:context.role});check();
   if(search!==undefined)page.search=projectFreeSearch(current,search);
   if(workingSet!==undefined)page.workingSet=projectFreeWorkingSet(current,workingSet);
   page.presentation=structuredClone(entry.presentation);
   const nativeUrl=context.parentFrame.actualURL,route=createURLPolicy({origin:new URL(nativeUrl).origin}).parse(nativeUrl);
   const selected=current.index.at(nativeUrl),ref=selected.ref??(route.kind==='conversation'?current.index.byId(route.conversationId):null);
   page.current={nativeUrl,refId:ref?.id??null,projectId:ref?.membership==='PROJECT'?ref.projectId:null};
   page.currentRef=ref?freeFrameRowDTO(ref):null;
   let navigation=[];
   if(prepareNavigation){
    const rows=new Map();for(const group of page.groups.items)for(const list of Object.values(group.lists))for(const row of list.items)rows.set(row.id,row);
    for(const list of Object.values(page.entries))for(const row of list.items)rows.set(row.id,row);
    for(const row of page.selection?.items??[])rows.set(row.id,row);
    for(const row of page.search?.items??[])rows.set(row.id,row);
    for(const row of page.workingSet?.items??[])rows.set(row.id,row);
    if(page.currentRef)rows.set(page.currentRef.id,page.currentRef);
    const projects=new Map(page.groups.items.map(group=>[group.id,group]));
    const targets=[...rows.values()].filter(row=>row.available!==false&&typeof row.nativeUrl==='string').map(row=>({refId:row.id,navigationURL:row.nativeUrl}));
    for(const group of projects.values())if(typeof group.nativeUrl==='string')targets.push({projectId:group.id,navigationURL:group.nativeUrl});
    if(targets.length>200)throw Error('free-frame-page-too-large');
    navigation=await prepareNavigation({parentFrame:context.parentFrame,binding:context.binding,targets});check();
    if(!Array.isArray(navigation)||navigation.length>200)throw Error('invalid-native-plans');
    const seen=new Set();for(const item of navigation){const project=Object.hasOwn(item??{},'projectId'),key=project?'projectId':'refId',entity=project?'project':'conversation',id=item?.[key],expected=(project?projects:rows).get(id),target=item?.plan?.target,identity=JSON.stringify([entity,id]);
     if(!expected||seen.has(identity)||!exactHostRecord(item,[key,'plan','targetKey'])||!['href','unavailable'].includes(item.plan?.mode)||(item.plan.mode==='href'&&(target?.kind!=='resolved'||target.entity!==entity||target.nativeId!==id||target.navigationURL!==expected.nativeUrl||!['same-tab','new-tab-preserve-current'].includes(item.plan.disposition))))throw Error('invalid-native-plans');
     seen.add(identity);
    }
   }
   const result={ok:true,state:'ready',page,navigation,...(locating?{location:{projectId:message.locateProjectId,found:location!==null}}:{}),...(nativeCandidatesEnabled?{nativeCandidates:true}:{})};
   if(new TextEncoder().encode(JSON.stringify(result)).length>65536)throw Error('free-frame-page-too-large');
   if(context.role==='workspace')entry.currentEntryEligible=page.segment===0&&search===undefined&&workingSet===undefined;
   check();if(!context.isCurrent())throw Error('stale-view-resume');if(!locating)rememberResume(context,effectiveQuery,current.snapshot.viewSession);
   return result;
  }),{now:elapsedNow,schedule,cancel});}catch(error){return {ok:false,reason:reason(error)};}finally{active=false;}
 }
 async function enterCurrent(input,sender){
  let message;try{message=structuredClone(input);sender=structuredClone(sender);}catch{return {ok:false,reason:'invalid-ui-current-entry'};}
  if(!exactHostRecord(message,['v','type','grantId','mountId','expectedRevision','viewSession'])||message.v!==1||message.type!=='HOST_UI_CURRENT_ENTRY'||!Number.isSafeInteger(message.expectedRevision)||message.expectedRevision<0||!exactHostRecord(message.viewSession,['H','T','Z','policyRevision']))return {ok:false,reason:'invalid-ui-current-entry'};
  let active=true;const started=elapsedNow(),abort=new AbortController();
  try{return await withRequestDeadline(()=>ui.withScope({sender,grantId:message.grantId,mountId:message.mountId},async context=>{
   if(!active||elapsedNow()-started>=6000)throw Error('ui-current-entry-expired');
   const entry=views.get(message.mountId);let current=entry?.owner.current();
   if(context.role!=='workspace'||!current||entry.pending||entry.scopeKey!==context.scope.key||entry.scopeGrantId!==context.scopeGrantId||!entry.currentEntryEligible)throw Error('free-current-entry-unavailable');
   if(entry.horizonPending||entry.workingSetPending||entry.currentEntryPending)throw Error('preference-change-in-progress');
   const old=current.snapshot.viewSession;
   if(current.snapshot.workspaceRevision!==message.expectedRevision||['H','T','Z','policyRevision'].some(key=>message.viewSession[key]!==old[key]))throw Error('revision-conflict');
   entry.currentEntryPending=true;
   const valid=()=>active&&elapsedNow()-started<6000&&context.isCurrent()&&views.get(message.mountId)===entry&&entry.owner.current()===current&&!entry.pending&&entry.currentEntryEligible;
   try{
    if(!presentSurface)throw Error('host-presentation-unavailable');
    const shown=await presentSurface({parentFrame:context.parentFrame,binding:context.binding,mode:'workspace'});
    if(!valid())throw Error('ui-current-entry-expired');
    if(shown?.ok!==true)throw Error('host-presentation-unavailable');
    const version=await readService.version(context.scope,{guard:valid});
    if(!valid())throw Error('ui-current-entry-expired');
    let snapshot=current.snapshot;
    if(version.nativeRevision!==snapshot.revision||version.revision!==snapshot.workspaceRevision||version.evidenceRevision!==snapshot.evidenceRevision||version.viewRevision!==snapshot.viewRevision)throw Error('snapshot-revision-changed');
    let policyCommit,autoChange;
    if(workspaceRepository&&snapshot.preferences?.freeTimePolicy?.value?.mode==='auto'){
     let fresh;entry.autoReading=true;try{fresh=await entry.owner.refresh({now:clock()});}finally{entry.autoReading=false;}
     if(!active||elapsedNow()-started>=6000||!context.isCurrent()||views.get(message.mountId)!==entry||entry.pending||!entry.currentEntryEligible||entry.owner.current()!==fresh)throw Error('ui-current-entry-expired');
     current=fresh;snapshot=fresh.snapshot;
     if(snapshot.workspaceRevision!==message.expectedRevision)throw Error('revision-conflict');
     const proposal=prepareHostAutoTimePolicy(snapshot,{now:clock(),timeZone:old.Z});
     if(proposal){
      const commitGuard=()=>valid()&&hostAutoTimePolicyFresh(proposal,{now:clock()});
      const result=await workspaceRepository.command(context.scope,{operationId:'auto_'+globalThis.crypto.randomUUID(),expectedRevision:proposal.expectedRevision,command:{type:'SET_PREFERENCE',id:'freeTimePolicy',value:proposal.policy}},{actor:'human',guard:commitGuard,signal:abort.signal,expectedActivityVersions:proposal.expectedActivityVersions});
      if(!result?.ok)throw Error(result?.reason??'horizon-write-unavailable');
      if(!valid())throw Error('ui-current-entry-expired');
      policyCommit={workspaceRevision:result.revision,policyRevision:proposal.policy.revision};
      if(proposal.policy.H!==proposal.previousPolicy.H){
       autoChange={id:globalThis.crypto.randomUUID(),previousH:proposal.previousPolicy.H,H:proposal.policy.H,policyRevision:proposal.policy.revision,workspaceRevision:result.revision,expiresAt:new Date(Date.parse(clock())+15000).toISOString()};
       entry.autoUndo={...autoChange,policy:proposal.policy,deadline:elapsedNow()+15000};
      }
      let committed;entry.autoReading=true;try{committed=await entry.owner.refresh({now:clock()});}finally{entry.autoReading=false;}
      if(!active||elapsedNow()-started>=6000||!context.isCurrent()||views.get(message.mountId)!==entry||entry.pending||!entry.currentEntryEligible||entry.owner.current()!==committed)throw Error('ui-current-entry-expired');
      current=committed;snapshot=committed.snapshot;
      if(snapshot.workspaceRevision!==result.revision)throw Error('revision-conflict');
      ui.notifyScope?.(context.scope.key);
     }
    }
    const viewSession=entry.owner.enterCurrentSession();
    const presentationChanged=entry.presentation.intent.kind!=='show-workspace';
    if(presentationChanged)entry.presentation={revision:entry.presentation.revision+1,intent:{kind:'show-workspace'}};
    if(viewSession!==old)begin(entry);
    if(viewSession!==old||presentationChanged)ui.notifyMount?.(message.mountId);
    return {ok:true,segment:0,viewSession,workspaceRevision:snapshot.workspaceRevision,...(policyCommit?{policyCommit}:{}),...(autoChange?{autoChange}:{})};
   }finally{entry.currentEntryPending=false;}
  }),{now:elapsedNow,schedule,cancel});}catch(error){return {ok:false,reason:reason(error)};}finally{active=false;abort.abort();}
 }
 async function undoAutoHorizon(input,sender){
  let message;try{message=structuredClone(input);sender=structuredClone(sender);}catch{return {ok:false,reason:'invalid-ui-auto-undo'};}
  if(!exactHostRecord(message,['v','type','grantId','mountId','operationId','expectedRevision','id'])||message.v!==1||message.type!=='HOST_UI_UNDO_AUTO_HORIZON'||typeof message.operationId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(message.operationId)||typeof message.id!=='string'||message.id.length<1||message.id.length>128||!Number.isSafeInteger(message.expectedRevision)||message.expectedRevision<0)return {ok:false,reason:'invalid-ui-auto-undo'};
  let active=true;const started=elapsedNow(),abort=new AbortController();
  try{return await withRequestDeadline(()=>ui.withScope({sender,grantId:message.grantId,mountId:message.mountId},async context=>{
   const entry=views.get(message.mountId),current=entry?.owner.current(),decision=entry?.autoUndo;
   if(!workspaceRepository||context.role!=='workspace'||!current||entry.pending||!entry.currentEntryEligible||entry.scopeKey!==context.scope.key||entry.scopeGrantId!==context.scopeGrantId||!decision||decision.id!==message.id||decision.workspaceRevision!==message.expectedRevision||current.snapshot.workspaceRevision!==message.expectedRevision)throw Error('auto-undo-unavailable');
   if(entry.horizonPending||entry.workingSetPending||entry.currentEntryPending)throw Error('preference-change-in-progress');
   const valid=()=>active&&elapsedNow()-started<6000&&elapsedNow()<decision.deadline&&Date.parse(clock())<Date.parse(decision.expiresAt)&&context.isCurrent()&&views.get(message.mountId)===entry&&entry.autoUndo===decision&&entry.currentEntryEligible&&!entry.pending;
   if(!valid())throw Error('auto-undo-expired');
   entry.horizonPending=true;
   try{
    const day=localDay(clock(),current.snapshot.viewSession.Z),policy=coolFreeTimePolicy(setFreeHorizon(decision.policy,decision.previousH,day),day);
    const result=await workspaceRepository.command(context.scope,{operationId:message.operationId,expectedRevision:message.expectedRevision,command:{type:'SET_PREFERENCE',id:'freeTimePolicy',value:policy}},{actor:'human',guard:valid,signal:abort.signal});
    if(!result?.ok)throw Error(result?.reason??'horizon-write-unavailable');
    if(!valid())throw Error('auto-undo-expired');
    entry.autoUndo=null;const viewSession=entry.owner.reconfigureSession({H:policy.H,policyRevision:policy.revision});
    begin(entry);ui.notifyScope?.(context.scope.key);return {ok:true,segment:0,viewSession,workspaceRevision:result.revision};
   }finally{entry.horizonPending=false;}
  }),{now:elapsedNow,schedule,cancel});}catch(error){return {ok:false,reason:reason(error)};}finally{active=false;abort.abort();}
 }
 async function setHorizon(input,sender){
  let message;try{message=structuredClone(input);sender=structuredClone(sender);}catch{return {ok:false,reason:'invalid-ui-horizon'};}
  if(!exactHostRecord(message,['v','type','grantId','mountId','operationId','expectedRevision','H','segment','anchorRefId'])||message.v!==1||message.type!=='HOST_UI_SET_HORIZON'||typeof message.operationId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(message.operationId)||!Number.isSafeInteger(message.expectedRevision)||message.expectedRevision<0||(message.H!=='auto'&&!FREE_HORIZONS.includes(message.H))||!Number.isSafeInteger(message.segment)||message.segment<0||message.segment>1000000||!(message.anchorRefId===null||typeof message.anchorRefId==='string'&&message.anchorRefId.length>0&&message.anchorRefId.length<=128))return {ok:false,reason:'invalid-ui-horizon'};
  let active=true;const started=elapsedNow(),abort=new AbortController();
  try{return await withRequestDeadline(()=>ui.withScope({sender,grantId:message.grantId,mountId:message.mountId},async context=>{
   const entry=views.get(message.mountId),current=entry?.owner.current();
   if(!workspaceRepository||!current||entry.scopeKey!==context.scope.key||entry.scopeGrantId!==context.scopeGrantId)throw Error('free-view-not-ready');
   if(entry.currentEntryPending)throw Error('preference-change-in-progress');
   if(entry.horizonPending)throw Error('horizon-change-in-progress');
   if(entry.workingSetPending)throw Error('preference-change-in-progress');
   if(current.snapshot.workspaceRevision!==message.expectedRevision)throw Error('revision-conflict');
   entry.horizonPending=true;entry.autoUndo=null;
   try{
    const old=current.snapshot.viewSession,anchor=message.anchorRefId===null?null:current.index.byId(message.anchorRefId);
    if(message.anchorRefId!==null&&!anchor)throw Error('horizon-anchor-unavailable');
    const candidateDay=anchor?(anchor.activityDecision??anchor.activity)?.candidateDay??null:old.T-old.H*message.segment;
    const day=localDay(clock(),old.Z),prior=current.snapshot.preferences?.freeTimePolicy?.value??{...initialFreeTimePolicy({day}),H:old.H,revision:old.policyRevision};
    const policy=message.H==='auto'?enableFreeAutoTimePolicy({...prior,H:old.H},day):setFreeHorizon(prior,message.H,day);
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
 async function setWorkingSet(input,sender){
  let message;try{message=structuredClone(input);sender=structuredClone(sender);}catch{return {ok:false,reason:'invalid-ui-working-set'};}
  if(!exactHostRecord(message,['v','type','grantId','mountId','operationId','expectedRevision','action','refId'])||message.v!==1||message.type!=='HOST_UI_WORKING_SET'||typeof message.operationId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(message.operationId)||!Number.isSafeInteger(message.expectedRevision)||message.expectedRevision<0||!['add','remove','move-up'].includes(message.action)||typeof message.refId!=='string'||message.refId.length<1||message.refId.length>128||['__proto__','constructor','prototype'].includes(message.refId))return {ok:false,reason:'invalid-ui-working-set'};
  let active=true;const started=elapsedNow(),abort=new AbortController();
  try{return await withRequestDeadline(()=>ui.withScope({sender,grantId:message.grantId,mountId:message.mountId},async context=>{
   const entry=views.get(message.mountId),current=entry?.owner.current();
   if(!workspaceRepository||!current||entry.scopeKey!==context.scope.key||entry.scopeGrantId!==context.scopeGrantId)throw Error('free-view-not-ready');
   if(entry.currentEntryPending)throw Error('preference-change-in-progress');
   if(entry.horizonPending)throw Error('horizon-change-in-progress');
   if(entry.workingSetPending)throw Error('preference-change-in-progress');
   if(current.snapshot.workspaceRevision!==message.expectedRevision)throw Error('revision-conflict');
   entry.workingSetPending=true;
   try{
    // Update the complete owner snapshot, never a frame's bounded visible page.
    const saved=current.snapshot.preferences?.workingSet?.value??{refs:[],current:null},refs=[...saved.refs];let selected=saved.current;
    const index=refs.indexOf(message.refId);
    if(message.action==='add'){
     const ref=current.index.byId(message.refId);
     if(!ref||ref.scope!==current.snapshot.scope||ref.available===false)throw Error('working-set-ref-unavailable');
     if(index<0)refs.push(message.refId);selected=message.refId;
    }else{
     if(index<0)throw Error('working-set-ref-not-saved');
     if(message.action==='remove'){refs.splice(index,1);if(selected===message.refId)selected=refs[0]??null;}
     else {if(index===0)throw Error('working-set-cannot-move');[refs[index-1],refs[index]]=[refs[index],refs[index-1]];}
    }
    if(refs.length>1000)throw Error('working-set-capacity');
    const valid=()=>active&&elapsedNow()-started<6000&&context.isCurrent()&&views.get(message.mountId)===entry;
    if(!valid())throw Error('ui-working-set-expired');
    const result=await workspaceRepository.command(context.scope,{operationId:message.operationId,expectedRevision:message.expectedRevision,command:{type:'SET_PREFERENCE',id:'workingSet',value:{refs,current:selected}}},{actor:'human',guard:valid,signal:abort.signal});
    if(!result?.ok)throw Error(result?.reason??'working-set-write-unavailable');
    if(!valid())throw Error('ui-working-set-expired');
    begin(entry);try{ui.notifyScope?.(context.scope.key);}catch{}
    return {ok:true,workspaceRevision:result.revision,workingSet:{total:refs.length,currentRefId:selected}};
   }finally{entry.workingSetPending=false;}
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
 // Private owner view; no full snapshot or body proof is sent to an iframe.
 function resolveSnippetView(context,mountId){
  const entry=views.get(mountId),current=entry?.owner.current();
  if(!entry||entry.pending||entry.error||!current||entry.scopeKey!==context.scope.key||entry.scopeGrantId!==context.scopeGrantId||!context.isCurrent())throw Error('free-view-not-ready');
  return {workspaceRevision:current.snapshot.workspaceRevision,preferences:current.snapshot.preferences,index:current.index,
   isCurrent:()=>context.isCurrent()&&views.get(mountId)===entry&&!entry.pending&&!entry.error&&entry.owner.current()===current};
 }
 function revokeDocument(id){for(const [key,entry]of views)if(entry.parentFrame.documentId===id)remove(key);}
 function revokeTab(tabId){for(const [key,value]of resumes)if(value.tabId===tabId)resumes.delete(key);for(const [key,entry]of views)if(entry.parentFrame.tabId===tabId)remove(key);}
 return Object.freeze({handle,resume,present,resolveSnippetView,enterCurrent,undoAutoHorizon,setHorizon,setWorkingSet,refreshScope(scopeKey){for(const entry of views.values())if(entry.scopeKey===scopeKey&&entry.isCurrent())begin(entry);},revokeDocument,revokeTab,revokeMount:remove,stop(){resumes.clear();for(const key of [...views.keys()])remove(key);}});
}
