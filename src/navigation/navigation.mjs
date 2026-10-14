import { freeNavigationSnapshot, freeListRows, assertPreparedFreeSnapshot } from './free-view.mjs';
import { currentIndex } from './current-index.mjs';
import { knownMatches } from './search.mjs';
import { defaultIcon, iconPaths, svgIcon } from './icons.mjs';
import { project, initialView } from './projection.mjs';
const gridIcon='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/></svg>';
import { css } from './styles.mjs';
function node(doc,tag,attrs={},text=''){const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);n.textContent=text;return n;}
/** Navigation owns only its roots and reversible view masking; never renders chat/composer. */
export function createNavigation({document:doc, adapter, onExit=()=>{}, onManage=null, onViewChange=()=>{},onCurrentWorkspaceEntry=()=>{},onCalibrationEntry=()=>{},surface=null,onPresentationRequest=()=>{},onDispatch=null,onProjectionRequest=null,onHorizonRequest=null,onWorkingSetRequest=null,onRecoveryRequest=null,onBackupRequest=null,onSnippetsRequest=null,onUndoTimePolicyRequest=null}) {
  const framed=surface!==null;
  if(framed&&(!['workspace','sidebar'].includes(surface.role)||surface.root?.ownerDocument!==doc))throw Error('invalid-navigation-surface');
  const token='vaiwl-'+Math.random().toString(36).slice(2), views=new Map();let snapshot=null,view=null,groups=[],roots=null,stopped=false,mask=null,searchQuery=null,searchTheme=null,searchCapacity=24,frameSearchOffset=0,frameSearchWaiting=false,frameWorkingSetOffset=0,frameWorkingSetWaiting=false,lastSelected=null,menu=null,selectionPending=false,pendingAnchor=null,anchorFeedback=null;
  let settingsOpen=false,timePolicyNotice=null,timePolicyNoticeTimer=null,lastTimePolicyNotice=null;
  let index=null,sidebarDirty=true,sidebarKey=null,frameProjection=null,projectionRequest=0,horizonPending=null,horizonError=null,workingSetPending=null,workingSetError=null;
  // Keep the original event target alive until its click, drop, or composition
  // completes. Coalesce updates instead of extending a debounce on each change.
  const pointers=new Set(),keys=new Set(),win=doc.defaultView??globalThis;
  let composing=false,dragging=false,pendingUpdate=null,pendingRender=false,updateTimer=null,pendingPresentation=null;
  const owned=e=>e.composedPath().some(n=>n?.getAttribute?.('data-vaiwl-owned')===token);
  const interacting=()=>pointers.size>0||keys.size>0||composing||dragging;
  const clearUpdateTimer=()=>{if(updateTimer!==null){win.clearTimeout(updateTimer);updateTimer=null;}};
  function flushUpdate(){
    clearUpdateTimer();if(interacting()||stopped)return;
    const presentation=pendingPresentation;pendingPresentation=null;
    const args=pendingUpdate;pendingUpdate=null;
    const paint=pendingRender;pendingRender=false;
    if(args){const [value,now,timeZone,preparedIndex,alreadyPrepared,currentEntry]=args;if(alreadyPrepared==='frame')applyFrameProjection(value,currentEntry);else if(alreadyPrepared)updatePreparedFree(value,now,timeZone,preparedIndex);else update(value,now,timeZone,preparedIndex);}
    if(presentation&&!stopped&&snapshot?.scope===presentation.scope)present(presentation.intent);
    else if(!args&&paint)render();
  }
  function requestRender(){if(stopped)return;if(interacting()||updateTimer!==null){pendingRender=true;finishInteraction();return;}render();}
  function clearTimePolicyNotice(paint=true){
    if(timePolicyNoticeTimer!==null){win.clearTimeout(timePolicyNoticeTimer);timePolicyNoticeTimer=null;}
    const existed=!!timePolicyNotice;timePolicyNotice=null;if(paint&&existed&&!stopped)requestRender();
  }
  function showTimePolicyNotice(value){
    if(stopped||!framed||surface.role!=='workspace'||!frameProjection||view?.mode!=='workspace'||typeof onUndoTimePolicyRequest!=='function')return false;
    if(!value||Object.keys(value).sort().join(',')!=='expiresAt,id'||typeof value.id!=='string'||!value.id.length||value.id.length>128||typeof value.expiresAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value.expiresAt))return false;
    const expires=Date.parse(value.expiresAt),remaining=expires-Date.now();if(!Number.isFinite(expires)||remaining<=0||remaining>15000)return false;
    // A repeated delivery never resets its deadline or enables an already used button.
    if(lastTimePolicyNotice?.id===value.id)return timePolicyNotice?.id===value.id;
    clearTimePolicyNotice(false);lastTimePolicyNotice={id:value.id,expires};
    timePolicyNotice={id:value.id,expires,scope:frameProjection.scope,busy:false,error:false};
    timePolicyNoticeTimer=win.setTimeout(()=>{timePolicyNoticeTimer=null;clearTimePolicyNotice();},remaining);requestRender();return true;
  }
  async function undoTimePolicy(notice){
    if(stopped||timePolicyNotice!==notice||notice.busy||notice.error||Date.now()>=notice.expires||frameProjection?.scope!==notice.scope||view?.mode!=='workspace')return;
    notice.busy=true;requestRender();
    try{const result=await onUndoTimePolicyRequest({id:notice.id});if(timePolicyNotice!==notice||stopped)return;if(result?.ok!==true)throw Error('unconfirmed');clearTimePolicyNotice();}
    catch{if(timePolicyNotice===notice&&!stopped){notice.error=true;notice.busy=false;requestRender();}}
  }
  function finishInteraction(){if(!interacting()&&(pendingUpdate||pendingRender||pendingPresentation)&&updateTimer===null)updateTimer=win.setTimeout(flushUpdate,0);}
  function resetInteraction(discard=false){pointers.clear();keys.clear();composing=false;dragging=false;if(discard){pendingUpdate=null;pendingRender=false;pendingPresentation=null;clearUpdateTimer();}else finishInteraction();}
  const interactionHandlers={
    pointerdown:e=>{if(owned(e))pointers.add(e.pointerId);},
    pointerup:e=>{pointers.delete(e.pointerId);finishInteraction();},
    pointercancel:e=>{pointers.delete(e.pointerId);finishInteraction();},
    lostpointercapture:e=>{pointers.delete(e.pointerId);finishInteraction();},
    keydown:e=>{if(owned(e)&&[' ','Enter'].includes(e.key))keys.add(e.key);},
    keyup:e=>{keys.delete(e.key);finishInteraction();},
    compositionstart:e=>{if(owned(e))composing=true;},
    compositionend:()=>{composing=false;finishInteraction();},
    dragstart:e=>{if(owned(e))dragging=true;},
    dragend:()=>{dragging=false;pointers.clear();finishInteraction();},
    drop:()=>{dragging=false;pointers.clear();finishInteraction();},
    visibilitychange:()=>{if(doc.visibilityState==='hidden')resetInteraction(true);}
  };
  for(const [type,handler]of Object.entries(interactionHandlers))doc.addEventListener(type,handler,true);
  const windowBlur=()=>resetInteraction();win.addEventListener?.('blur',windowBlur);
  const free=()=>snapshot?.viewMode==='free';
  const span=()=>snapshot?.policy?.h??snapshot?.viewSession?.H??30;
  const current=()=>{
    if(!frameProjection)return index?.at(adapter.currentURL())??{};
    const route=frameProjection.current;if(!route)return {};
    const selected=groups.find(g=>g.id===route.projectId);
    const lists=[...groups.flatMap(g=>['current','old','unknown'].map(k=>frameRows(g.id,k))),frameRows(null,'noProject'),frameRows(null,'unknown')];
    const ref=lists.flatMap(p=>p?.items??[]).find(r=>r.id===route.refId)??frameProjection.currentRef??undefined;
    return {ref,selected,independent:ref&&ref.projectId===null?ref:null,inGroup:g=>g.id===route.projectId?ref:null};
  };
  let status={state:'WAITING',reason:'no-verified-snapshot'},lastNativeFocus=null;
  const trackFocus=e=>{const n=e.composedPath()[0];if((n?.tagName==='TEXTAREA'||n?.tagName==='INPUT')&&!e.composedPath().some(x=>x?.hasAttribute?.('data-vaiwl-owned')))lastNativeFocus={node:n,start:n.selectionStart,end:n.selectionEnd};};
  if(!framed)doc.addEventListener('focusin',trackFocus);
  const captureFocus=()=>{const n=doc.activeElement;if(n===lastNativeFocus?.node){lastNativeFocus.start=n.selectionStart;lastNativeFocus.end=n.selectionEnd;}};
  const restoreFocus=()=>{const f=lastNativeFocus;if(f?.node.isConnected){f.node.focus({preventScroll:true});if(typeof f.start==='number'&&f.node.setSelectionRange)f.node.setSelectionRange(f.start,f.end);}};
  const button=(label,fn,text='',cls='square')=>{const b=node(doc,'button',{type:'button','aria-label':label,title:label,class:cls},text);b.dataset.focusKey=label;b.addEventListener('click',fn);return b;};
  function own(tag='div'){const n=node(doc,tag,{'data-vaiwl-owned':token});const shadow=n.attachShadow({mode:'open'});shadow.append(node(doc,'style',{},css));return {n,shadow};}
  function restoreMask(){if(!mask)return;for(const[name,prior,expected]of mask.attrs){if(mask.node.getAttribute(name)===expected){if(prior===null)mask.node.removeAttribute(name);else mask.node.setAttribute(name,prior);}}mask=null;}
  function setMask(n,enabled){if(!enabled){restoreMask();return;}if(mask?.node===n)return;restoreMask();const attrs=[['data-vaiwl-mask',n.getAttribute('data-vaiwl-mask'),token],['inert',n.getAttribute('inert'),'']];for(const[k,,v]of attrs)n.setAttribute(k,v);mask={node:n,attrs};}
  function detach(){sidebarDirty=true;sidebarKey=null;closeMenu(false);restoreMask();if(roots){roots.sidebar?.n.remove();roots.workspace?.n.remove();roots.back?.remove();roots.maskStyle?.remove();roots=null;}}
  function layout(){
    if(stopped||!snapshot)return;
    if(framed){
      if(!surface.root.isConnected){detach();status={state:'WAITING',reason:'frame-surface-detached'};adapter.status?.(status);return;}
      if(!roots){const pane=own();if(surface.role==='sidebar')pane.shadow.append(node(doc,'style',{},':host>section{height:100%;display:flex;flex-direction:column}.themes{max-height:none;min-height:0;flex:1}'));pane.n.style.cssText='display:block;width:100%;height:100%;min-height:0';surface.root.append(pane.n);roots={sidebar:surface.role==='sidebar'?pane:null,workspace:surface.role==='workspace'?pane:null};render();}
      const pane=roots[surface.role];pane.n.dataset.vaiwlCompact=String(snapshot.preferences?.compactRows?.value!==false);
      if(surface.role==='workspace')layoutCards();else locateCurrent();
      status={state:'ACTIVE',mode:view.mode,scope:snapshot.scope};adapter.status?.(status);return;
    }
    const host=adapter.inspect();
    if(!host.ok){detach();status={state:'NATIVE_ONLY',reason:host.reason};adapter.status(status);return;}
    if(roots&&(!roots.sidebar.n.isConnected||roots.host.history!==host.history||roots.host.header!==host.header)){detach();}
    if(!roots){
      const side=own(),workspace=own(),back=button('返回工作区',()=>showWorkspace());back.addEventListener('pointerdown',captureFocus);back.innerHTML=gridIcon;back.setAttribute('data-vaiwl-owned',token);back.setAttribute('data-vaiwl-return','');back.style.cssText='width:34px;height:34px;flex:none;display:inline-grid;place-items:center;border:0;border-radius:9px;background:transparent;color:inherit;cursor:pointer';
      (host.navigationSlot??host.history).before(side.n);doc.body.append(workspace.n);host.header.insertBefore(back,host.header.firstChild);
      workspace.n.style.cssText='position:fixed;z-index:10;display:none';
      const maskStyle=node(doc,'style',{'data-vaiwl-owned':token},`[data-vaiwl-mask="${token}"]{visibility:hidden!important}`);doc.head.append(maskStyle);
      roots={sidebar:side,workspace,back,maskStyle,host};render();
    }
    roots.sidebar.n.dataset.vaiwlCompact=String(snapshot.preferences?.compactRows?.value!==false);roots.workspace.n.dataset.vaiwlCompact=String(snapshot.preferences?.compactRows?.value!==false);
    const suspended=adapter.hasNativeLayer();
    const show=view.mode==='workspace'&&!suspended;
    const r=host.reading.getBoundingClientRect();
    const style=`position:fixed;z-index:10;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;display:${show?'block':'none'}`;
    const wasVisible=roots.workspace.n.style.display==='block';
    if(roots.workspace.n.style.cssText!==style)roots.workspace.n.style.cssText=style;
    if(show&&!wasVisible&&roots.workspace.scroller)roots.workspace.scroller.scrollTop=view.scroll;
    roots.sidebar.n.style.visibility=suspended?'hidden':'';if(!suspended)locateCurrent();
    roots.back.hidden=view.mode==='workspace'||suspended;
    // The original conversation tree remains attached; only this reversible view mask changes.
    setMask(host.reading,show);
    if(show)layoutCards();
    status={state:suspended?'NATIVE_LAYER':'ACTIVE',mode:view.mode,scope:snapshot.scope};adapter.status(status);
  }
  function locateCurrent(){
    const list=roots?.sidebar?.shadow.querySelector('.themes');
    if(!selectionPending||!list?.clientHeight||roots.sidebar.n.style.visibility==='hidden')return;
    const link=list.querySelector('[aria-current="page"]');if(!link)return;
    const box=link.getBoundingClientRect(),nav=list.getBoundingClientRect();
    if(box.top<nav.top||box.bottom>nav.bottom)list.scrollTop+=box.top-nav.top-(nav.height-box.height)/2;
    view.sidebarScroll=list.scrollTop;selectionPending=false;
  }
  // Keep DOM/keyboard order from the repository; expanding one card grows its
  // own column only. Native layout and nodes are untouched.
  function layoutCards(){
    const container=roots?.workspace?.scroller?.querySelector('.cards'),cards=container?[...container.querySelectorAll(':scope > .card')]:[];
    if(!cards.length||container.clientWidth<100)return;
    const scroller=roots.workspace.scroller,scroll=scroller.scrollTop;
    const gap=18,columns=Math.max(1,Math.min(3,cards.length,Math.floor((container.clientWidth+gap)/346))),width=(Math.min(container.clientWidth,columns*356+(columns-1)*gap)-gap*(columns-1))/columns;
    for(const card of cards){card.style.position='absolute';card.style.width=width+'px';}
    const heights=cards.map(card=>card.getBoundingClientRect().height),tops=Array(columns).fill(0);
    cards.forEach((card,i)=>{const column=i%columns;card.style.left=column*(width+gap)+'px';card.style.top=tops[column]+'px';tops[column]+=heights[i]+gap;});
    container.style.position='relative';container.style.display='block';container.style.height=Math.max(...tops)+'px';scroller.scrollTop=scroll;
  }
  function emitView(){if(view&&snapshot)onViewChange({segment:view.segment,oldOpen:[...view.oldOpen],sidebarOpen:[...view.sidebarOpen],capacities:[...view.capacities],scroll:view.scroll,sidebarVisible:view.sidebarVisible,...(free()&&snapshot.viewSession?{freeSession:snapshot.viewSession}:{})},snapshot.scope,...(framed?[{role:surface.role}]:[]));}
  function remember(){if(view&&roots)view.sidebarScroll=roots.sidebar?.shadow.querySelector('.themes')?.scrollTop??view.sidebarScroll??0;if(view?.mode==='workspace'&&roots?.workspace?.scroller&&roots.workspace.n.style.display!=='none')view.scroll=roots.workspace.scroller.scrollTop;}
  function calibrationEntry(){if(!free()||!roots)return;const objectIds=view.segment===0?['inventory']:[...new Set([...(roots.workspace?.shadow.querySelectorAll('[data-ref-id]')??[])].map(n=>n.dataset.refId))].slice(0,64);onCalibrationEntry({kind:view.segment===0?'foreground':'history',objectIds:objectIds.length?objectIds:['inventory']});}
  function showWorkspace(notify=true){if(!view)return;if(!framed)captureFocus();remember();const resetFrame=frameProjection&&(view.worksetOpen||searchQuery!==null);view.mode='workspace';view.worksetOpen=false;searchQuery=null;searchTheme=null;if(resetFrame){projectionRequest++;requestFrame();}render();layout();queueMicrotask(()=>roots?.workspace?.shadow.querySelector('.workspace')?.focus({preventScroll:true}));if(view.segment===0)onCurrentWorkspaceEntry();calibrationEntry();if(framed&&notify)onPresentationRequest({kind:'show-workspace'});}
  function enterReading(notify=true){if(!view)return;remember();clearTimePolicyNotice();view.mode='reading';searchQuery=null;searchTheme=null;layout();if(framed&&notify)onPresentationRequest({kind:'enter-reading'});}
  function openRef(ref,event){if(ref.available===false){event.preventDefault();return;}if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;remember();if(ref.anchor)pendingAnchor={scope:snapshot.scope,ref,anchor:ref.anchor};clearTimePolicyNotice();view.mode='reading';searchQuery=null;searchTheme=null;layout();const same=adapter.isCurrent(ref.nativeUrl);adapter.openNative(ref.nativeUrl,event);if(same){restoreFocus();locateAnchor();}}
  // Frame plans are supplied synchronously before activation. Never fetch a plan in a click handler.
  function bindPlannedLink(a,ref){
    let issued;try{issued=structuredClone(adapter.navigationPlan?.(ref));}catch{}
    const plan=issued?.plan;
    const safeHref=plan?.target?.kind==='resolved'?adapter.nativeHref?.(plan.target.navigationURL):null;
    const resolvedOK=plan?.target?.kind==='resolved'&&plan.target.entity==='conversation'&&plan.target.nativeId===ref.id&&safeHref;
    const delegation=['native-control','same-target'].includes(plan?.mode)&&typeof onDispatch==='function'&&['targetKey','uiGrantId','mountId'].every(key=>typeof issued?.[key]==='string'&&issued[key])&&Number.isSafeInteger(plan.planRevision);
    const valid=ref.available!==false&&!ref.anchor&&((plan?.mode==='href'&&resolvedOK&&['same-tab','new-tab-preserve-current'].includes(plan.disposition))||(delegation&&(resolvedOK||plan.target?.kind==='live-control')));
    if(!valid){a.setAttribute('aria-disabled','true');a.dataset.navigationReason=ref.anchor?'snippet-frame-controller-unavailable':'native-plan-unavailable';a.addEventListener('click',event=>event.preventDefault());return;}
    if(safeHref){a.href=safeHref;a.target=plan.mode==='href'&&plan.disposition==='same-tab'?'_top':'_blank';a.rel='noopener noreferrer';}
    else{a.setAttribute('role','button');a.tabIndex=0;}
    a.addEventListener('click',event=>{
      if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
      if(plan.mode==='href')return; // Browser default only; no duplicate RPC or fallback.
      event.preventDefault();enterReading();
      const dto={actionId:'ui_'+win.crypto.randomUUID().replaceAll('-',''),uiGrantId:issued.uiGrantId,mountId:issued.mountId,planRevision:plan.planRevision,targetKey:issued.targetKey};
      try{Promise.resolve(onDispatch(dto)).catch(()=>{});}catch{} // Unconfirmed dispatch is never retried.
    });
    if(!safeHref)a.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();a.click();}});
  }
  function projectCreateEntry(group){
    let plan,href;try{plan=structuredClone(adapter.projectNavigationPlan?.(group))?.plan;if(plan?.target?.kind==='resolved')href=adapter.nativeHref?.(plan.target.navigationURL);}catch{}
    if(group.available!==false&&typeof group.nativeUrl==='string'&&group.nativeUrl&&plan?.mode==='href'&&plan.disposition==='new-tab-preserve-current'&&plan.target?.kind==='resolved'&&plan.target.entity==='project'&&plan.target.nativeId===group.id&&plan.target.navigationURL===group.nativeUrl&&typeof href==='string'&&href===group.nativeUrl){
      const a=node(doc,'a',{class:'square','aria-label':'打开项目以新建聊天 '+group.name,title:'打开原生项目后，继续使用原生控件新建聊天'},'+');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.dataset.focusKey='project-create:'+group.id;return a;
    }
    const unavailable=button('在项目中新建聊天 '+group.name,()=>{},'+');unavailable.disabled=true;unavailable.dataset.navigationReason='native-create-plan-unavailable';return unavailable;
  }
  const windowGlyph=node(doc,'span',{class:'window-glyph','aria-hidden':'true'});windowGlyph.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.65"><path d="M4 5h16v12H9l-5 4z"/></svg>';
  function appendFreshness(parent,value){if(value.freshness==='last-known'||value.membershipFreshness==='last-known')parent.append(node(doc,'small',{class:'freshness-label','data-freshness':'last-known',title:'上次确认的信息',style:'flex:none;font-weight:400;color:var(--muted,#646464);margin-left:4px'},'上次确认'));}
  function row(ref,context=''){const a=node(doc,'a',{class:'row','data-ref-id':ref.id,title:ref.displayTitle});const text=node(doc,'span',{class:'window-title'},ref.displayTitle??ref.nativeTitle);a.append(windowGlyph.cloneNode(true),text);appendFreshness(a,ref);a.dataset.focusKey='ref:'+context+':'+ref.id;if(frameProjection?frameProjection.current?.refId===ref.id:(index?.matches(ref.nativeUrl,adapter.currentURL())??adapter.isCurrent(ref.nativeUrl)))a.setAttribute('aria-current','page');if(ref.available===false)a.setAttribute('aria-disabled','true');if(framed)bindPlannedLink(a,ref);else{const href=adapter.nativeHref?.(ref.nativeUrl);if(href)a.setAttribute('href',href);else a.setAttribute('aria-disabled','true');a.addEventListener('click',e=>{if(!href){e.preventDefault();return;}openRef(ref,e);});}return workingSetRow(a,ref,context);}
  function workingSetRow(link,ref,context){
    if(!frameProjection||surface.role!=='workspace'||typeof onWorkingSetRequest!=='function')return link;
    const saved=context==='workset';if(!saved&&(ref.available===false||typeof ref.nativeUrl!=='string'||!ref.nativeUrl))return link;
    const wrap=node(doc,'div',{class:'working-set-row',role:'group','aria-label':ref.displayTitle??ref.nativeTitle??'已保存的聊天',style:'display:flex;align-items:center;flex-wrap:wrap;gap:4px'});link.style.flex='1 1 140px';link.style.minWidth='0';wrap.append(link);
    for(const action of saved?['remove','move-up']:['add']){
      const label=action==='add'?'加入工作集':action==='remove'?'从工作集移除':'在工作集中前移';
      const control=button(label,()=>{void requestWorkingSet(action,ref.id);},label,'more');control.setAttribute('data-working-set-action',action);control.setAttribute('data-working-set-ref',ref.id);control.dataset.focusKey='workset:'+context+':'+action+':'+ref.id;
      const first=action==='move-up'&&frameProjection.workingSet?.offset===0&&frameProjection.workingSet.items[0]?.id===ref.id;control.disabled=!!workingSetPending||first;wrap.append(control);
    }return wrap;
  }
  async function requestWorkingSet(action,refId){
    if(!frameProjection||surface.role!=='workspace'||typeof onWorkingSetRequest!=='function'||workingSetPending||stopped)return;
    const attempt={scope:frameProjection.scope,offset:frameWorkingSetOffset};workingSetPending=attempt;workingSetError=null;if(view.worksetOpen)frameWorkingSetOffset=0;requestRender();
    try{const result=await onWorkingSetRequest({action,refId});if(workingSetPending!==attempt||stopped||frameProjection?.scope!==attempt.scope)return;if(result?.ok!==true)throw Error('working-set-unavailable');}
    catch{if(workingSetPending===attempt&&!stopped&&frameProjection?.scope===attempt.scope){workingSetError='工作集更新失败，请重试。';if(view.worksetOpen&&frameProjection.workingSet?.offset===attempt.offset)frameWorkingSetOffset=attempt.offset;}}
    finally{if(workingSetPending===attempt){workingSetPending=null;if(!stopped&&frameProjection?.scope===attempt.scope)requestRender();}}
  }
  const chevron='<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  const symbols={search:'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',up:'M6 15l6-6 6 6',down:'M6 9l6 6 6-6',more:'M5 12h.01 M12 12h.01 M19 12h.01',minus:'M5 12h14',plus:'M5 12h14 M12 5v14',close:'m6 6 12 12 M18 6 6 18'};
  function graphic(b,kind){if(kind==='more'){b.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>';return b;}b.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+symbols[kind]+'"/></svg>';return b;}
  function requestFrame(partial={},safeCurrentEntry=false){
    if(!frameProjection||typeof onProjectionRequest!=='function')return;
    const scope=frameProjection.scope,run=++projectionRequest;
    const query={role:surface.role,segment:view.segment,offset:frameProjection.groups.offset,limit:frameProjection.groups.limit,...partial};
    try{Promise.resolve(onProjectionRequest(query)).then(dto=>{if(dto&&run===projectionRequest&&!stopped&&frameProjection?.scope===scope&&dto.scope===scope)applyFrameProjection(dto,safeCurrentEntry?{scope,run}:null);}).catch(()=>{});}catch{}
  }
  async function requestHorizon(value){
    const H=value==='auto'?'auto':Number(value);if(!frameProjection||surface.role!=='workspace'||typeof onHorizonRequest!=='function'||horizonPending||H!=='auto'&&![7,14,30,60,90].includes(H))return;
    const attempt={scope:frameProjection.scope};horizonPending=attempt;horizonError=null;
    const args={H,segment:view.segment,anchorRefId:current()?.ref?.id??null};requestRender();
    try{const result=await onHorizonRequest(args);if(horizonPending!==attempt||stopped||frameProjection?.scope!==attempt.scope)return;if(result?.ok!==true)throw Error('horizon-unavailable');}
    catch{if(horizonPending===attempt&&!stopped&&frameProjection?.scope===attempt.scope)horizonError='时间范围更新失败，请重试。';}
    finally{if(horizonPending===attempt){horizonPending=null;if(!stopped&&frameProjection?.scope===attempt.scope)requestRender();}}
  }
  function appendCurrentContext(parent){
    const ref=current().ref;if(!ref||Array.from(parent.querySelectorAll('[data-ref-id]')).some(n=>n.getAttribute('data-ref-id')===ref.id))return;
    const section=node(doc,'section',{class:'current-context','aria-label':'当前聊天','data-current-membership':ref.membership});
    section.append(node(doc,'h2',{},'当前聊天'),row(ref,'current-context'));parent.append(section);
  }
  function requestFrameSearch(offset=0){frameSearchOffset=offset;frameSearchWaiting=true;requestFrame({search:{query:searchQuery,projectId:searchTheme,offset,limit:24}});}
  function closeFrameSearch(){searchQuery=null;searchTheme=null;frameSearchWaiting=false;projectionRequest++;render();requestFrame();onPresentationRequest({kind:'show-workspace'});}
  function requestFrameWorkingSet(offset=0){frameWorkingSetOffset=offset;frameWorkingSetWaiting=true;requestFrame({workingSet:{offset,limit:24}});}
  function closeFrameWorkingSet(){view.worksetOpen=false;frameWorkingSetWaiting=false;projectionRequest++;render();requestFrame();onPresentationRequest({kind:'show-workspace'});}
  function frameRows(groupId,list){const selected=frameProjection.selection;if(selected&&selected.groupId===groupId&&selected.list===list)return selected;return groupId===null?frameProjection.entries[list]:frameProjection.groups.items.find(g=>g.id===groupId)?.lists[list];}
  function moreFrame(page,groupId,list){requestFrame({...(groupId===null?{}:{groupId}),list,rowOffset:page.limit<200?page.offset:page.offset+page.limit,rowLimit:page.limit<200?Math.min(200,page.limit+12):200});}
  function frameMembers(group,parent,side){
    const key=(side?'side:':'home:')+group.id;
    for(const kind of ['current','old','unknown']){
      const page=frameRows(group.id,kind);if(!page||page.total===0)continue;let list=parent;
      if(kind==='old'){
        const open=view.oldOpen.has(key),toggle=button('展开旧窗口 '+group.name,()=>{view.oldOpen.has(key)?view.oldOpen.delete(key):view.oldOpen.add(key);render();if(view.oldOpen.has(key))requestFrame({groupId:group.id,list:'old',rowOffset:0,rowLimit:5});},'','square old');toggle.innerHTML=chevron;toggle.setAttribute('aria-expanded',String(open));parent.append(toggle);if(!open)continue;list=node(doc,'div',{class:'old-list'});parent.append(list);
      }
      for(const ref of page.items)list.append(row(ref,key));
      if(page.hasMore)list.append(button(kind==='old'?'显示更多旧窗口 '+group.name:kind==='unknown'?'显示更多待核对窗口':'显示更多近期窗口',()=>moreFrame(page,group.id,kind),page.limit<200?'显示更多':'下一页','more'));
      if(page.offset>0)list.append(button('返回前页 '+group.name,()=>requestFrame({groupId:group.id,list:kind,rowOffset:Math.max(0,page.offset-page.limit),rowLimit:page.limit}),'上一页','more'));
    }
  }
  function members(group,parent,side=false){
    if(frameProjection){frameMembers(group,parent,side);return;}
    const key=(side?'side:':'home:')+group.id,cap=view.capacities.get(key)??5;
    for(const r of group.current.slice(0,cap))parent.append(row(r,key));
    if(cap<group.current.length){const more=button('显示更多近期窗口',()=>{remember();view.capacities.set(key,cap+12);render();},'显示更多','more');more.dataset.focusKey='more:'+key;parent.append(more);}
    if(group.old.length){
      const b=button('展开旧窗口 '+group.name,()=>{remember();view.oldOpen.has(key)?view.oldOpen.delete(key):view.oldOpen.add(key);render();},'','square old');b.innerHTML=chevron;b.setAttribute('aria-expanded',String(view.oldOpen.has(key)));b.dataset.focusKey='old:'+key;b.setAttribute('aria-controls',token+'-'+key.replace(':','-')+'-old');parent.append(b);
      if(view.oldOpen.has(key)){const list=node(doc,'div',{class:'old-list',id:b.getAttribute('aria-controls')}),oldCap=view.capacities.get('old:'+key)??12;
        for(const r of group.old.slice(0,oldCap))list.append(row(r,key));
        if(oldCap<group.old.length)list.append(button('显示更多旧窗口 '+group.name,()=>{remember();view.capacities.set('old:'+key,oldCap+12);render();},'显示更多','more'));parent.append(list);
      }else parent.append(node(doc,'div',{class:'old-list',hidden:'',id:b.getAttribute('aria-controls')}));
    }
    if(free()&&group.unknown.length){const keyUnknown='unknown:'+key,limit=view.capacities.get(keyUnknown)??5;for(const r of group.unknown.slice(0,limit))parent.append(row(r,keyUnknown));if(group.unknown.length>limit)parent.append(button('显示更多待核对窗口',()=>{view.capacities.set(keyUnknown,limit+12);render();},'显示更多','more'));}
    if(side){const active=current().inGroup?.(group);if(active&&!parent.querySelector('[data-ref-id="'+active.id+'"]')){const context=node(doc,'div',{class:'current-context'});context.append(row(active,key));parent.append(context);}}
  }
  function appendFreeList(parent,kind,segment,side=false){
    if(frameProjection){const page=frameRows(null,kind),label=kind==='noProject'?'无项目聊天':'归属待核对',list=node(doc,'section',{class:'free-list '+(side?'':'search'),'data-free-list':kind,'aria-label':label});list.append(node(doc,'h2',{},label));for(const ref of page.items)list.append(row(ref,kind));if(page.total===0)list.append(node(doc,'p',{},frameProjection.entries[kind].inventoryTotal>0?'此区间没有记录；其他区间仍可达。':'暂无已知记录。'));if(page.hasMore)list.append(button('显示更多'+label,()=>moreFrame(page,null,kind),page.limit<200?'显示更多':'下一页','more'));if(page.offset>0)list.append(button('返回前页'+label,()=>requestFrame({list:kind,rowOffset:Math.max(0,page.offset-page.limit),rowLimit:page.limit}),'上一页','more'));parent.append(list);return;}
    const rows=freeListRows(snapshot,kind,segment);if(!rows.length)return;
    const key=(side?'side:':'home:')+kind,cap=view.capacities.get(key)??(side?5:12),label=kind==='noProject'?'无项目聊天':'归属待核对';
    const list=node(doc,'section',{class:'free-list '+(side?'':'search'),'data-free-list':kind,'aria-label':label});list.append(node(doc,'h2',{},label));
    for(const r of rows.slice(0,cap))list.append(row(r,key));
    if(rows.length>cap)list.append(button('显示更多'+label,()=>{remember();view.capacities.set(key,cap+12);render();},'显示更多','more'));
    parent.append(list);
  }
  function themeGlyph(g){const n=node(doc,'span',{class:'theme-glyph','aria-hidden':'true'}),kind=g.owner==='bootstrap'&&g.icon==='◇'?defaultIcon(g.name):g.icon;n.dataset.icon=kind??'collection';if(iconPaths[kind])n.innerHTML=svgIcon(kind);else n.textContent=kind??'◇';return n;}
  function locateAnchor(){if(!pendingAnchor||!snapshot||!roots)return;if(pendingAnchor.scope!==snapshot.scope){pendingAnchor=null;return;}if(!adapter.isCurrent(pendingAnchor.ref.nativeUrl))return;const result=adapter.restoreSnippet?.(pendingAnchor.ref,pendingAnchor.anchor);pendingAnchor=null;anchorFeedback=result?.ok?null:'无法唯一定位已保存片段。消息可能已变化，请使用原生搜索。';if(anchorFeedback){roots.sidebar.shadow.querySelector('.anchor-feedback')?.remove();roots.sidebar.shadow.append(node(doc,'p',{class:'anchor-feedback',role:'status'},anchorFeedback));}}
  function showWorkingSet(notify=true){if(!view)return;if(frameProjection&&surface.role==='sidebar'){if(notify)onPresentationRequest({kind:'show-working-set'});return;}remember();view.mode='workspace';view.worksetOpen=true;searchQuery=null;searchTheme=null;frameWorkingSetOffset=0;frameWorkingSetWaiting=!!frameProjection;render();layout();if(frameProjection)requestFrameWorkingSet();if(framed&&notify)onPresentationRequest({kind:'show-working-set'});}
  function findKnown(theme=null,notify=true){if(!view)return;if(frameProjection&&surface.role==='sidebar'){if(notify)onPresentationRequest({kind:'search-known',themeId:theme});return;}remember();view.mode='workspace';view.worksetOpen=false;searchQuery='';searchTheme=theme;searchCapacity=24;frameSearchOffset=0;frameSearchWaiting=!!frameProjection;render();layout();queueMicrotask(()=>roots?.workspace?.shadow.querySelector('input')?.focus());if(frameProjection)requestFrameSearch();if(framed&&notify)onPresentationRequest({kind:'search-known',themeId:theme});}
  function closeMenu(focus=true){if(!menu)return;const prior=menu;menu=null;prior.n.remove();prior.trigger.setAttribute('aria-expanded','false');doc.removeEventListener('pointerdown',prior.outside,true);if(focus&&prior.trigger.isConnected)prior.trigger.focus({preventScroll:true});}
  function themeActions(g,head){const trigger=graphic(button('主题操作 '+g.name,()=>{
      if(menu?.trigger===trigger){closeMenu();return;}closeMenu(false);const popup=node(doc,'div',{class:'menu',role:'menu','aria-label':'主题操作 '+g.name});
      const item=(label,fn)=>{const b=button(label,()=>{closeMenu(false);fn();},label,'');b.setAttribute('role','menuitem');popup.append(b);};
      if(onManage&&!free())item('编辑主题',()=>onManage({workspaceId:g.id}));item('查找此主题',()=>findKnown(g.id));
      popup.addEventListener('keydown',e=>{const items=[...popup.querySelectorAll('button')],i=items.indexOf(doc.activeElement?.shadowRoot?.activeElement??popup.getRootNode().activeElement);if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu();}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();}});
      const outside=e=>{if(!e.composedPath().includes(popup)&&!e.composedPath().includes(trigger))closeMenu(false);};menu={n:popup,trigger,outside};trigger.setAttribute('aria-expanded','true');head.append(popup);doc.addEventListener('pointerdown',outside,true);popup.querySelector('button')?.focus();
    },'','square card-actions'),'more');trigger.dataset.focusKey='actions:'+g.id;trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');head.append(trigger);}
  function focusState(){for(const root of [roots?.sidebar,roots?.workspace]){const n=root?.shadow?.activeElement;if(n?.dataset.focusKey)return {root,key:n.dataset.focusKey,start:n.selectionStart,end:n.selectionEnd};}return null;}
  function restoreOwnedFocus(f){if(!f)return;const key=f.key==='关闭设置'&&!settingsOpen?'workspace-settings':f.key;const n=[...f.root.shadow.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===key);if(n){n.focus({preventScroll:true});if(n.setSelectionRange&&typeof f.start==='number')n.setSelectionRange(f.start,f.end);}else{(f.root.shadow.querySelector('[aria-label="较早的30日"]')??f.root.shadow.querySelector('.workspace'))?.focus({preventScroll:true});}}
  function render(){if(!roots||!view)return;const focused=focusState();view.sidebarScroll=roots.sidebar?.shadow.querySelector('.themes')?.scrollTop??view.sidebarScroll??0;closeMenu(false);
    const selected=current().selected;
    if(selected&&lastSelected!==adapter.currentURL()){view.sidebarOpen.add(selected.id);lastSelected=adapter.currentURL();selectionPending=true;}
    // Snapshot updates always invalidate closures; local history changes keep the
    // unchanged sidebar DOM, scroll and focus instead of rebuilding every card.
    const nextSidebarKey=JSON.stringify([snapshot.scope,adapter.currentURL(),view.sidebarVisible,[...view.sidebarOpen],[...view.oldOpen].filter(k=>k.startsWith('side:')),[...view.capacities].filter(([k])=>k.startsWith('side:')||k.includes(':side:'))]);
    const side=roots.sidebar?.shadow;
    if(side&&(sidebarDirty||sidebarKey!==nextSidebarKey||!side.querySelector('section'))){
    side.querySelector('section')?.remove();const panel=node(doc,'section');const tools=node(doc,'div',{class:'toolbar'});tools.append(node(doc,'strong',{},free()?'项目':'主题'),graphic(button(free()?'查找已知项目与聊天':'查找主题与派生名称',()=>findKnown()),'search'),graphic(button('折叠主题导航',()=>{remember();view.sidebarVisible=!view.sidebarVisible;render();}),view.sidebarVisible?'minus':'plus'),graphic(button('退出测试增强',()=>{stop();onExit();}),'close'));if(onManage)tools.append(graphic(button('管理工作空间',()=>onManage()),'more'));const workset=button('当前工作集',()=>showWorkingSet());workset.innerHTML=svgIcon('collection');tools.append(workset);if(frameProjection&&typeof onSnippetsRequest==='function')tools.append(button('已保存片段',()=>{if(!stopped&&frameProjection)onSnippetsRequest();}));panel.append(tools);
    const list=node(doc,'nav',{class:'themes','aria-label':'VAIWL 主题导航'});list.hidden=!view.sidebarVisible;
    const sideGroups=frameProjection?groups:groups.filter(g=>g.segment===0||(free()&&g.segment===null)||g===selected);
    for(const g of sideGroups){const block=node(doc,'section',{class:'group'});const toggle=button('侧栏主题 '+g.name,()=>{view.sidebarOpen.has(g.id)?view.sidebarOpen.delete(g.id):view.sidebarOpen.add(g.id);render();if(frameProjection&&view.sidebarOpen.has(g.id))requestFrame({groupId:g.id,list:'current',rowOffset:0,rowLimit:5});},'','theme-toggle');toggle.dataset.focusKey='theme:'+g.id;toggle.append(themeGlyph(g),node(doc,'span',{class:'theme-name',title:g.name},g.name));appendFreshness(toggle,g);if(g.freshness==='last-known')toggle.setAttribute('aria-label','侧栏主题 '+g.name+'，上次确认');const disclosure=node(doc,'span',{class:'theme-disclosure','aria-hidden':'true'});disclosure.innerHTML=chevron;toggle.append(disclosure);toggle.setAttribute('aria-expanded',String(view.sidebarOpen.has(g.id)));block.append(toggle);
      if(view.sidebarOpen.has(g.id)){const children=node(doc,'div',{class:'children'});members(g,children,true);block.append(children);}list.append(block);}
    if(frameProjection){if(frameProjection.groups.offset>0)list.append(button('返回前页项目',()=>requestFrame({offset:Math.max(0,frameProjection.groups.offset-frameProjection.groups.limit)}),'上一页项目','more'));if(frameProjection.groups.hasMore)list.append(button('显示更多项目',()=>requestFrame({offset:frameProjection.groups.offset+frameProjection.groups.limit}),'显示更多项目','more'));}
    const independent=current().independent;if(independent&&!frameProjection){const context=node(doc,'div',{class:'current-context'});context.append(row(independent));list.append(context);}if(free()){appendFreeList(list,'noProject',0,true);appendFreeList(list,'unknown',0,true);}if(frameProjection)appendCurrentContext(list);panel.append(list);side.append(panel);list.scrollTop=view.sidebarScroll??0;sidebarKey=nextSidebarKey;sidebarDirty=false;locateCurrent();
    }
    if(!roots.workspace){restoreOwnedFocus(focused);emitView();return;}
    const shadow=roots.workspace.shadow;const prior=shadow.querySelector('.workspace');if(prior)prior.remove();const page=node(doc,'div',{class:'workspace',tabindex:'-1','aria-label':'主题工作区','data-segment':String(view.segment)});roots.workspace.scroller=page;page.addEventListener('scroll',()=>{if(roots?.workspace?.scroller===page&&view.mode==='workspace'&&roots.workspace.n.style.display!=='none'){view.scroll=page.scrollTop;emitView();}},{passive:true});
    const currentSlot=frameProjection&&searchQuery===null&&!view.worksetOpen?node(doc,'div',{}):null;if(currentSlot)page.append(currentSlot);
    if(frameProjection&&surface.role==='workspace'){
      const settingsScope=frameProjection.scope,settingsLive=()=>!stopped&&frameProjection?.scope===settingsScope;
      const trigger=graphic(button('工作空间设置',()=>{if(!settingsLive())return;settingsOpen=!settingsOpen;requestRender();}),'more');trigger.setAttribute('aria-expanded',String(settingsOpen));trigger.dataset.focusKey='workspace-settings';page.append(trigger);
      if(settingsOpen){
        const settings=node(doc,'section',{'aria-label':'工作空间设置',class:'toolbar'});settings.append(node(doc,'strong',{},'工作空间设置'));
        if(typeof onHorizonRequest==='function'){
          const label=node(doc,'label',{},'时间范围 '),select=node(doc,'select',{'aria-label':'工作空间时间范围','data-focus-key':'free-horizon'}),policy=frameProjection.timePolicy;
          select.append(node(doc,'option',{value:'auto'},'自动'));
          for(const H of [7,14,30,60,90])select.append(node(doc,'option',{value:String(H)},H+'天'));
          select.value=policy?.mode==='auto'?'auto':String(policy?.H??frameProjection.viewSession.H);select.disabled=!!horizonPending;select.onchange=()=>{if(settingsLive()&&settingsOpen)void requestHorizon(select.value);};label.append(select);settings.append(label,node(doc,'span',{},'当前范围：'+String(frameProjection.viewSession.H)+'天'));
          if(horizonPending||horizonError)settings.append(node(doc,'span',{role:'status'},horizonPending?'正在更新时间范围…':horizonError));
        }
        if(typeof onSnippetsRequest==='function')settings.append(button('已保存片段',()=>{if(settingsLive()&&settingsOpen)onSnippetsRequest();}));
        if(typeof onBackupRequest==='function')settings.append(button('备份与导入',()=>{if(settingsLive()&&settingsOpen)onBackupRequest();}));
        if(typeof onRecoveryRequest==='function')settings.append(button('本地数据恢复',()=>{if(settingsLive()&&settingsOpen)onRecoveryRequest();}));
        settings.append(button('关闭设置',()=>{if(!settingsLive())return;settingsOpen=false;requestRender();}));page.append(settings);
      }
    }
    if(timePolicyNotice&&Date.now()<timePolicyNotice.expires&&view.mode==='workspace'){const notice=timePolicyNotice,section=node(doc,'div',{class:'toolbar',role:'status','aria-label':'自动时间范围调整'});section.append(node(doc,'span',{},notice.error?'撤销结果未确认，可在设置中手动选择范围。':'已根据已核验项目调整时间范围。'));if(!notice.error){const undo=button('撤销自动时间范围调整',()=>void undoTimePolicy(notice),'撤销');undo.disabled=notice.busy;undo.dataset.focusKey='undo-time-policy';section.append(undo);}page.append(section);}
    if(frameProjection&&workingSetError)page.append(node(doc,'p',{role:'alert'},workingSetError));
    if(frameProjection&&searchQuery!==null){
      const section=node(doc,'section',{class:'search'}),top=node(doc,'div',{class:'search-top'}),theme=groups.find(g=>g.id===searchTheme);
      top.append(node(doc,'strong',{},theme?.name??'查找已知项目与聊天'),graphic(button('关闭派生查找',closeFrameSearch),'close'));section.append(top);
      const input=node(doc,'input',{'aria-label':'已知聊天查找输入',placeholder:'输入项目或聊天名称','data-focus-key':'search-input',type:'search',maxlength:'200'});input.value=searchQuery;
      const results=node(doc,'div',{class:'search-results'});
      const display=()=>{results.replaceChildren();const found=frameProjection.search;
        if(frameSearchWaiting||!found||found.query!==searchQuery||found.projectId!==searchTheme||found.offset!==frameSearchOffset){results.append(node(doc,'p',{role:'status'},'正在查找已知记录…'));return;}
        for(const ref of found.items)results.append(row(ref,'search'));
        if(!found.total)results.append(node(doc,'p',{role:'status'},'未找到已知记录。可以继续使用原生搜索。'));
        if(found.hasMore)results.append(button('显示更多查找结果',()=>{requestFrameSearch(found.offset+found.limit);render();},'显示更多','more'));
        if(found.offset>0)results.append(button('返回前页查找结果',()=>{requestFrameSearch(Math.max(0,found.offset-found.limit));render();},'上一页','more'));
      };
      input.oninput=()=>{searchQuery=input.value.slice(0,200);input.value=searchQuery;requestFrameSearch();display();};
      section.append(input,node(doc,'p',{},'仅查找已知项目与聊天。原生搜索独立保留。'),results);display();page.append(section);
    }else if(frameProjection&&view.worksetOpen){
      const section=node(doc,'section',{class:'search working-set','aria-label':'当前工作集'}),found=frameProjection.workingSet;
      section.append(node(doc,'strong',{},'当前工作集'),button('返回主题视图',closeFrameWorkingSet,'返回主题','more'),node(doc,'p',{},'按已保存的人工顺序显示窗口引用。草稿由原生页面保留。'));
      if(frameWorkingSetWaiting||!found||found.offset!==frameWorkingSetOffset)section.append(node(doc,'p',{role:'status'},'正在读取当前工作集…'));
      else{
        for(const ref of found.items){const link=row(ref,'workset');if(ref.id===found.currentRefId)(link.querySelector('a')??link).setAttribute('data-working-set-current','true');section.append(link);}
        if(!found.total)section.append(node(doc,'p',{role:'status'},'当前工作集尚未保存窗口。'));
        if(found.hasMore)section.append(button('显示更多工作集窗口',()=>{requestFrameWorkingSet(found.offset+found.limit);render();},'显示更多','more'));
        if(found.offset>0)section.append(button('返回前页工作集窗口',()=>{requestFrameWorkingSet(Math.max(0,found.offset-found.limit));render();},'上一页','more'));
      }page.append(section);
    }else if(searchQuery!==null){
      const search=node(doc,'section',{class:'search'}),top=node(doc,'div',{class:'search-top'}),theme=groups.find(g=>g.id===searchTheme);
      top.append(node(doc,'strong',{},theme?.name??(free()?'查找已知项目与聊天':'查找主题与派生名称')),graphic(button('关闭派生查找',()=>{searchQuery=null;searchTheme=null;render();queueMicrotask(()=>roots?.workspace?.shadow.querySelector('.workspace')?.focus({preventScroll:true}));}),'close'));search.append(top);
      const input=node(doc,'input',{'aria-label':free()?'已知聊天查找输入':'派生查找输入',placeholder:'输入主题或窗口名称','data-focus-key':'search-input',type:'search'});input.value=searchQuery;
      search.append(input,node(doc,'p',{},'仅查找已知主题与窗口，包含时间尚未确认的记录。原生搜索独立保留。'));
      const results=node(doc,'div',{class:'search-results'});
      const update=()=>{searchQuery=input.value;results.replaceChildren();const found=knownMatches(snapshot,searchQuery,searchTheme);
        for(const r of found.slice(0,searchCapacity)){const link=row(r,r.anchor?'snippet:'+r.anchor.id:'search');if(r.anchor){link.dataset.snippetId=r.anchor.id;link.setAttribute('aria-label','定位片段 '+r.displayTitle);link.append(node(doc,'span',{class:'snippet-preview'},r.anchor.text));}results.append(link);}
        if(!found.length)results.append(node(doc,'div',{class:'no-results',role:'status'},'未找到已知记录。可以继续使用原生搜索。'));
        if(found.length>searchCapacity)results.append(button('显示更多查找结果',()=>{searchCapacity+=24;update();},'显示更多','more'));
      };input.oninput=()=>{searchCapacity=24;update();};update();search.append(results);page.append(search);
    }else if(view.worksetOpen){
      const workset=node(doc,'section',{class:'search working-set','aria-label':'当前工作集'}),top=node(doc,'div',{class:'search-top'});top.append(node(doc,'strong',{},'当前工作集'),button('返回主题视图',()=>{view.worksetOpen=false;render();},'返回主题','more'));workset.append(top,node(doc,'p',{},'只保存窗口引用与人工顺序，点击后打开。草稿与任务运行状态由原生页面保留。'));const saved=snapshot.preferences?.workingSet?.value??{refs:[],current:null};for(const id of saved.refs){const ref=index.byId(id);if(ref)workset.append(row(ref,'workset'));else workset.append(node(doc,'p',{class:'failed-ref'},'暂时无法打开的引用 '+id));}if(!saved.refs.length)workset.append(node(doc,'p',{},'还没有窗口。可在工作空间管理中加入窗口。'));if(onManage)workset.append(button('编辑当前工作集',()=>onManage(), '整理工作集','more'));page.append(workset);
    }else{
      const arrows=node(doc,'div',{class:'arrows','aria-label':'主题区间导航'});
      if(view.segment>0)arrows.append(graphic(button('较近的'+span()+'日',()=>{if(frameProjection){requestFrame({segment:view.segment-1,offset:0},view.segment===1);return;}view.segment--;view.scroll=0;render();if(view.segment===0)onCurrentWorkspaceEntry();calibrationEntry();}),'up'));
      const down=graphic(button('较早的'+span()+'日',()=>{if(frameProjection){requestFrame({segment:view.segment+1,offset:0});return;}view.segment++;view.scroll=0;render();calibrationEntry();}),'down');down.disabled=frameProjection?!frameProjection.navigation.hasOlder:view.segment>=Math.max(groups.reduce((max,g)=>Math.max(max,g.segment??0),0),free()?snapshot.refs.reduce((max,r)=>Math.max(max,(r.activityDecision??r.activity)?.segment??0),0):0);arrows.append(down);page.append(arrows);
      const cards=node(doc,'div',{class:'cards'});
      for(const g of (frameProjection?groups:groups.filter(g=>g.segment===view.segment||(free()&&g.segment===null&&view.segment===0)))){
        const card=node(doc,'section',{class:'card','data-theme-id':g.id}),head=node(doc,'div',{class:'card-head'}),title=node(doc,'h2'),list=node(doc,'div',{class:'members'});
        title.append(themeGlyph(g),node(doc,'span',{class:'theme-name',title:g.name},g.name));appendFreshness(title,g);head.append(title);if(framed&&free())head.append(projectCreateEntry(g));if(!framed&&free()&&adapter.projectCreateHref?.(g)){const a=node(doc,'a',{href:adapter.projectCreateHref(g),class:'square','aria-label':'在项目中新建聊天 '+g.name,title:'在项目中新建聊天 '+g.name},'+');a.addEventListener('click',e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){clearTimePolicyNotice();view.mode='reading';layout();adapter.openNative(a.href,e);}});head.append(a);}themeActions(g,head);card.append(head);members(g,list);card.append(list);cards.append(card);
      }
      if(!frameProjection&&!cards.children.length&&(!free()||!freeListRows(snapshot,'noProject',view.segment).length&&!freeListRows(snapshot,'unknown',view.segment).length)){const empty=node(doc,'div',{class:'empty'});empty.innerHTML=gridIcon;empty.append(node(doc,'strong',{},'这里还没有活跃主题'),node(doc,'p',{},'可切换区间，或查找已有窗口。'),button('查找已知主题与窗口',()=>findKnown(),'查找窗口','more'));cards.append(empty);}page.append(cards);if(frameProjection){if(frameProjection.groups.offset>0)page.append(button('返回前页项目',()=>requestFrame({offset:Math.max(0,frameProjection.groups.offset-frameProjection.groups.limit)}),'上一页项目','more'));if(frameProjection.groups.hasMore)page.append(button('显示更多项目',()=>requestFrame({offset:frameProjection.groups.offset+frameProjection.groups.limit}),'显示更多项目','more'));}if(free()){appendFreeList(page,'noProject',view.segment);appendFreeList(page,'unknown',view.segment);}
    }
    if(currentSlot){const ref=current().ref;if(ref&&!Array.from(page.querySelectorAll('[data-ref-id]')).some(n=>n.getAttribute('data-ref-id')===ref.id))appendCurrentContext(currentSlot);else currentSlot.remove();}
    shadow.append(page);layoutCards();page.scrollTop=view.scroll;restoreOwnedFocus(focused);emitView();
  }
  function applyUpdate(value,now,timeZone,preparedIndex=null,alreadyPrepared=false){
    if(stopped)return;
    if(snapshot?.scope===value.scope&&(interacting()||updateTimer!==null)){pendingUpdate=[value,now,timeZone,preparedIndex,alreadyPrepared];return;}
    if(snapshot?.scope!==value.scope)settingsOpen=false;frameProjection=null;projectionRequest++;resetInteraction(true);sidebarDirty=true;remember();const priorSession=snapshot?.scope===value.scope?snapshot?.viewSession:null;if(value.viewMode==='free'&&!alreadyPrepared)value=freeNavigationSnapshot(value);snapshot=value;
    if(!views.has(value.scope)){
      const initial=initialView(),v=value.view;
      if(v)Object.assign(initial,{segment:v.segment,oldOpen:new Set(v.oldOpen),sidebarOpen:new Set(v.sidebarOpen),capacities:new Map(v.capacities),scroll:v.scroll,sidebarVisible:v.sidebarVisible});
      views.set(value.scope,initial);
    }
    view=views.get(value.scope);if(priorSession&&value.viewSession&&priorSession.H!==value.viewSession.H){const anchorDay=priorSession.T-view.segment*priorSession.H;view.segment=Math.max(0,Math.floor((value.viewSession.T-anchorDay)/value.viewSession.H));}groups=value.groups??project(value,now,timeZone);index=preparedIndex??currentIndex(value,groups);
    if(value.preferences?.sidebarVisible)view.sidebarVisible=value.preferences.sidebarVisible.value;
    layout();render();layout();locateAnchor();
  }
  function updateFrameProjection(dto){return applyFrameProjection(dto);}
  function applyFrameProjection(dto,currentEntry=null){
    if(currentEntry&&(currentEntry.run!==projectionRequest||frameProjection?.scope!==currentEntry.scope))return;
    if(stopped)return;if(!framed||dto?.protocol!=='vaiwl-free-frame/1'||dto.role!==surface.role||dto.completeSnapshot!==false||typeof dto.scope!=='string'||!dto.navigation||!Number.isSafeInteger(dto.segment)||dto.segment<0)throw Error('invalid-frame-projection');
    const policy=dto.timePolicy;if(policy!==undefined&&(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).sort().join(',')!=='H,mode,revision'||!['fixed','auto'].includes(policy.mode)||![7,14,30,60,90].includes(policy.H)||!Number.isSafeInteger(policy.revision)||policy.revision<0))throw Error('invalid-frame-time-policy');
    const c=dto.current;
    if(c!==undefined&&(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).sort().join(',')!=='nativeUrl,projectId,refId'||typeof c.nativeUrl!=='string'||!c.nativeUrl.length||c.nativeUrl.length>2048||!['refId','projectId'].every(k=>c[k]===null||typeof c[k]==='string'&&c[k].length>0&&c[k].length<=128&&!/[\s\x00-\x1f]/.test(c[k]))))throw Error('invalid-frame-current');
    const cr=dto.currentRef;
    if(cr!==undefined&&cr!==null&&(!cr||typeof cr!=='object'||Array.isArray(cr)||!c||cr.id!==c.refId||typeof cr.id!=='string'||typeof cr.displayTitle!=='string'||!(cr.nativeTitle===null||typeof cr.nativeTitle==='string')||!(cr.nativeUrl===null||typeof cr.nativeUrl==='string')||typeof cr.available!=='boolean'||!['PROJECT','NONE','UNKNOWN'].includes(cr.membership)||!(cr.projectId===null||typeof cr.projectId==='string')||(cr.membership==='PROJECT')!==(typeof cr.projectId==='string')||!(cr.segment===null||Number.isSafeInteger(cr.segment)&&cr.segment>=0)))throw Error('invalid-frame-current-ref');
    const pageOK=p=>p&&Array.isArray(p.items)&&Number.isSafeInteger(p.total)&&Number.isSafeInteger(p.offset)&&Number.isSafeInteger(p.limit)&&p.total>=0&&p.offset>=0&&p.limit>0&&p.limit<=200&&p.items.length<=p.limit&&typeof p.hasMore==='boolean'&&p.hasMore===(p.offset+p.items.length<p.total);
    if(!Number.isSafeInteger(dto.navigation.maxSegment)||dto.navigation.maxSegment<0||dto.navigation.hasNewer!==(dto.segment>0)||dto.navigation.hasOlder!==(dto.segment<dto.navigation.maxSegment)||!pageOK(dto.groups)||dto.groups.limit>24||!['noProject','unknown'].every(k=>pageOK(dto.entries?.[k]))||dto.groups.items.some(g=>!['current','old','unknown'].every(k=>pageOK(g.lists?.[k])))||dto.selection&&!pageOK(dto.selection)||new TextEncoder().encode(JSON.stringify(dto)).length>65536)throw Error('invalid-frame-projection');
    if(dto.search!==undefined&&(!pageOK(dto.search)||dto.search.limit>24||typeof dto.search.query!=='string'||dto.search.query.length>200||!(dto.search.projectId===null||typeof dto.search.projectId==='string'&&dto.search.projectId.length>0&&dto.search.projectId.length<=128)))throw Error('invalid-frame-search');
    if(dto.workingSet!==undefined&&(!pageOK(dto.workingSet)||dto.workingSet.limit>24||!(dto.workingSet.currentRefId===null||typeof dto.workingSet.currentRefId==='string'&&dto.workingSet.currentRefId.length>0&&dto.workingSet.currentRefId.length<=128)))throw Error('invalid-frame-working-set');
    if(dto.search!==undefined&&dto.workingSet!==undefined)throw Error('conflicting-frame-lists');
    if(snapshot?.scope===dto.scope&&dto.workingSet&&(!view.worksetOpen||searchQuery!==null||dto.workingSet.offset!==frameWorkingSetOffset))return;
    if(snapshot?.scope===dto.scope&&dto.search&&(searchQuery===null||dto.search.query!==searchQuery||dto.search.projectId!==searchTheme||dto.search.offset!==frameSearchOffset))return;
    if(snapshot?.scope===dto.scope&&(interacting()||updateTimer!==null)){pendingUpdate=[dto,null,null,null,'frame',currentEntry];return;}
    const scopeChanged=snapshot?.scope!==dto.scope;const copy=structuredClone(dto);resetInteraction(true);sidebarDirty=true;remember();
    if(snapshot?.scope!==copy.scope){horizonPending=null;horizonError=null;detach();searchQuery=null;searchTheme=null;projectionRequest++;}
    if(copy.segment!==0||copy.search||copy.workingSet)clearTimePolicyNotice(false);
    if(scopeChanged){clearTimePolicyNotice(false);lastTimePolicyNotice=null;settingsOpen=false;workingSetPending=null;workingSetError=null;}projectionRequest++;frameProjection=copy;if(copy.search)frameSearchWaiting=false;if(copy.workingSet)frameWorkingSetWaiting=false;
    // Presentation-only metadata. This intentionally has no complete refs/index
    // and never enters the prepared Free snapshot or full-snapshot update path.
    snapshot={scope:copy.scope,viewMode:'free',viewSession:copy.viewSession,preferences:{}};
    if(!views.has(copy.scope))views.set(copy.scope,initialView());view=views.get(copy.scope);view.segment=copy.segment;if(scopeChanged){view.worksetOpen=!!copy.workingSet;if(copy.workingSet)frameWorkingSetOffset=copy.workingSet.offset;if(copy.search){searchQuery=copy.search.query;searchTheme=copy.search.projectId;frameSearchOffset=copy.search.offset;}}
    groups=copy.groups.items.map(g=>({...g,current:g.lists.current.items,old:g.lists.old.items,unknown:g.lists.unknown.items}));index=null;
    layout();render();layout();
    if(currentEntry&&!stopped&&frameProjection?.scope===currentEntry.scope&&view.segment===0&&view.mode==='workspace')onCurrentWorkspaceEntry();
  }
  function update(value,now,timeZone,preparedIndex=null){if(value?.protocol==='vaiwl-free-frame/1')throw Error('frame-projection-requires-explicit-consumer');return applyUpdate(value,now,timeZone,preparedIndex);}
  function updatePreparedFree(value,now,timeZone,preparedIndex=null){assertPreparedFreeSnapshot(value);return applyUpdate(value,now,timeZone,preparedIndex,true);}
  function invalidate(reason='binding-invalidated'){clearTimePolicyNotice(false);lastTimePolicyNotice=null;settingsOpen=false;workingSetPending=null;workingSetError=null;horizonPending=null;horizonError=null;resetInteraction(true);remember();snapshot=null;index=null;frameProjection=null;projectionRequest++;detach();status={state:'WAITING',reason};adapter.status(status);}
  function stop(){if(stopped)return;stopped=true;invalidate('controlled-exit');doc.removeEventListener('focusin',trackFocus);for(const[type,handler]of Object.entries(interactionHandlers))doc.removeEventListener(type,handler,true);win.removeEventListener?.('blur',windowBlur);if(!framed)restoreFocus();status={state:'STOPPED'};adapter.status(status);}
  function present(intent){
    if(stopped||!snapshot||!['show-workspace','enter-reading','search-known','show-working-set'].includes(intent?.kind))return false;
    if(interacting()||updateTimer!==null){pendingPresentation={scope:snapshot.scope,intent:{kind:intent.kind,...(intent.kind==='search-known'?{themeId:intent.themeId??null}:{})}};finishInteraction();return true;}
    if(intent?.kind==='show-workspace')showWorkspace(false);else if(intent?.kind==='enter-reading')enterReading(false);else if(intent?.kind==='search-known')findKnown(intent.themeId??null,false);else if(intent?.kind==='show-working-set')showWorkingSet(false);else return false;return true;}
  return Object.freeze({showTimePolicyNotice,clearTimePolicyNotice,present,updateFrameProjection,update,updatePreparedFree,layout,invalidate,stop,showWorkspace,enterReading,currentRef:()=>current().ref,status:()=>({...status}),view:()=>view,roots:()=>roots});
}
