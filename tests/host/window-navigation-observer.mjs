// Test-only observation of the isolated synthetic extension frames. This adds
// diagnostics, not readiness checks, navigation gestures, waits or retries.
export function installWindowNavigationObserver(){
 if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.sendMessage)return;
 let observationId=0,requestId=0;
 const documentId=crypto.randomUUID(),stamp=()=>({documentId,observationId:++observationId,observedAt:performance.now()});
 const emit=entry=>{try{void Promise.resolve(globalThis.observeWindowReturn(entry)).catch(()=>{});}catch{}};
 for(const kind of ['pointerdown','click'])document.addEventListener(kind,event=>{
  const node=event.composedPath().find(value=>value?.matches?.('.search-results a[data-ref-id]'));if(!node)return;
  const entry={...stamp(),type:kind==='click'?'SEARCH_LINK_CLICK':'SEARCH_LINK_POINTERDOWN',delegated:node.hasAttribute('data-native-plan-control'),ariaDisabled:node.getAttribute('aria-disabled'),target:node.getAttribute('target'),connected:node.isConnected,button:event.button,modified:event.metaKey||event.ctrlKey||event.shiftKey||event.altKey};
  if(kind==='click')setTimeout(()=>emit({...entry,defaultPrevented:event.defaultPrevented}),0);else emit(entry);
 },true);
 const send=chrome.runtime.sendMessage.bind(chrome.runtime);
 chrome.runtime.sendMessage=function(...args){
  const m=args[0],tracked=['HOST_UI_VIEW','HOST_UI_RESUME','HOST_UI_SAVE_VIEW','HOST_UI_DISPATCH_CURRENT','HOST_UI_DISPATCH_NATIVE','HOST_UI_CANCEL_NAVIGATION','HOST_UI_PRESENT'].includes(m?.type);
  const request=m?.type==='HOST_UI_VIEW'?{requestId:++requestId,requestStartedAt:performance.now()}:null;
  if(request)emit({...stamp(),type:'HOST_UI_VIEW_REQUESTED',...request,query:m.query});
  const pending=send(...args);
  if(tracked&&pending?.then)pending.then(r=>{
   try{const p=r?.page;emit({...stamp(),...(request?{...request,requestCompletedAt:performance.now()}:{}),type:m.type,actionId:m.actionId,targetKey:m.targetKey,query:m.query,expectedQuery:m.expectedQuery,capacities:m.view?.capacities,scroll:m.view?.scroll,ok:r?.ok,state:r?.state,reason:r?.reason,presentation:p?.presentation??r?.presentation,resume:r?.resume,counts:p?{search:!!p.search,workingSet:!!p.workingSet,groups:p.groups?.items.map(g=>({id:g.id,unknown:g.lists.unknown.items.length})),unknown:p.entries?.unknown.items.length,selection:p.selection?{groupId:p.selection.groupId,list:p.selection.list,limit:p.selection.limit}:null}:null});}catch{}
  },()=>{});
  return pending;
 };
}

export function createWindowNavigationTraceRecorder(report){
 const frames=new WeakMap();let nextFrameId=0;
 return ({frame},entry)=>{
  if(report.trace.length>=400){report.traceDropped++;return;}
  if(!frames.has(frame))frames.set(frame,++nextFrameId);
  report.trace.push({...entry,phase:report.phase,frame:frame.url(),frameId:frames.get(frame)});
 };
}
