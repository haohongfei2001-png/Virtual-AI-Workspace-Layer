import { freeNavigationSnapshot, freeListRows, assertPreparedFreeSnapshot } from './free-view.mjs';
import { currentIndex } from './current-index.mjs';
import { knownMatches } from './search.mjs';
import { defaultIcon, iconPaths, svgIcon } from './icons.mjs';
import { project, initialView } from './projection.mjs';
const gridIcon='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/></svg>';
import { css } from './styles.mjs';
function node(doc,tag,attrs={},text=''){const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);n.textContent=text;return n;}
/** Navigation owns only its roots and reversible view masking; never renders chat/composer. */
export function createNavigation({document:doc, adapter, onExit=()=>{}, onManage=null, onViewChange=()=>{},onCurrentWorkspaceEntry=()=>{},onCalibrationEntry=()=>{}}) {
  const token='vaiwl-'+Math.random().toString(36).slice(2), views=new Map();let snapshot=null,view=null,groups=[],roots=null,stopped=false,mask=null,searchQuery=null,searchTheme=null,searchCapacity=24,lastSelected=null,menu=null,selectionPending=false,pendingAnchor=null,anchorFeedback=null;
  let index=null,sidebarDirty=true,sidebarKey=null;
  // Keep the original event target alive until its click, drop, or composition
  // completes. Coalesce updates instead of extending a debounce on each change.
  const pointers=new Set(),keys=new Set(),win=doc.defaultView??globalThis;
  let composing=false,dragging=false,pendingUpdate=null,updateTimer=null;
  const owned=e=>e.composedPath().some(n=>n?.getAttribute?.('data-vaiwl-owned')===token);
  const interacting=()=>pointers.size>0||keys.size>0||composing||dragging;
  const clearUpdateTimer=()=>{if(updateTimer!==null){win.clearTimeout(updateTimer);updateTimer=null;}};
  function flushUpdate(){clearUpdateTimer();if(!pendingUpdate||interacting()||stopped)return;const args=pendingUpdate;pendingUpdate=null;const [value,now,timeZone,preparedIndex,alreadyPrepared]=args;if(alreadyPrepared)updatePreparedFree(value,now,timeZone,preparedIndex);else update(value,now,timeZone,preparedIndex);}
  function finishInteraction(){if(!interacting()&&pendingUpdate&&updateTimer===null)updateTimer=win.setTimeout(flushUpdate,0);}
  function resetInteraction(discard=false){pointers.clear();keys.clear();composing=false;dragging=false;if(discard){pendingUpdate=null;clearUpdateTimer();}else finishInteraction();}
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
  const current=()=>index?.at(adapter.currentURL())??{};
  let status={state:'WAITING',reason:'no-verified-snapshot'},lastNativeFocus=null;
  const trackFocus=e=>{const n=e.composedPath()[0];if((n?.tagName==='TEXTAREA'||n?.tagName==='INPUT')&&!e.composedPath().some(x=>x?.hasAttribute?.('data-vaiwl-owned')))lastNativeFocus={node:n,start:n.selectionStart,end:n.selectionEnd};};
  doc.addEventListener('focusin',trackFocus);
  const captureFocus=()=>{const n=doc.activeElement;if(n===lastNativeFocus?.node){lastNativeFocus.start=n.selectionStart;lastNativeFocus.end=n.selectionEnd;}};
  const restoreFocus=()=>{const f=lastNativeFocus;if(f?.node.isConnected){f.node.focus({preventScroll:true});if(typeof f.start==='number'&&f.node.setSelectionRange)f.node.setSelectionRange(f.start,f.end);}};
  const button=(label,fn,text='',cls='square')=>{const b=node(doc,'button',{type:'button','aria-label':label,title:label,class:cls},text);b.dataset.focusKey=label;b.addEventListener('click',fn);return b;};
  function own(tag='div'){const n=node(doc,tag,{'data-vaiwl-owned':token});const shadow=n.attachShadow({mode:'open'});shadow.append(node(doc,'style',{},css));return {n,shadow};}
  function restoreMask(){if(!mask)return;for(const[name,prior,expected]of mask.attrs){if(mask.node.getAttribute(name)===expected){if(prior===null)mask.node.removeAttribute(name);else mask.node.setAttribute(name,prior);}}mask=null;}
  function setMask(n,enabled){if(!enabled){restoreMask();return;}if(mask?.node===n)return;restoreMask();const attrs=[['data-vaiwl-mask',n.getAttribute('data-vaiwl-mask'),token],['inert',n.getAttribute('inert'),'']];for(const[k,,v]of attrs)n.setAttribute(k,v);mask={node:n,attrs};}
  function detach(){sidebarDirty=true;sidebarKey=null;closeMenu(false);restoreMask();if(roots){roots.sidebar.n.remove();roots.workspace.n.remove();roots.back.remove();roots.maskStyle.remove();roots=null;}}
  function layout(){
    if(stopped||!snapshot)return;
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
    const list=roots?.sidebar.shadow.querySelector('.themes');
    if(!selectionPending||!list?.clientHeight||roots.sidebar.n.style.visibility==='hidden')return;
    const link=list.querySelector('[aria-current="page"]');if(!link)return;
    const box=link.getBoundingClientRect(),nav=list.getBoundingClientRect();
    if(box.top<nav.top||box.bottom>nav.bottom)list.scrollTop+=box.top-nav.top-(nav.height-box.height)/2;
    view.sidebarScroll=list.scrollTop;selectionPending=false;
  }
  // Keep DOM/keyboard order from the repository; expanding one card grows its
  // own column only. Native layout and nodes are untouched.
  function layoutCards(){
    const container=roots?.workspace.scroller?.querySelector('.cards'),cards=container?[...container.querySelectorAll(':scope > .card')]:[];
    if(!cards.length||container.clientWidth<100)return;
    const scroller=roots.workspace.scroller,scroll=scroller.scrollTop;
    const gap=18,columns=Math.max(1,Math.min(3,cards.length,Math.floor((container.clientWidth+gap)/346))),width=(Math.min(container.clientWidth,columns*356+(columns-1)*gap)-gap*(columns-1))/columns;
    for(const card of cards){card.style.position='absolute';card.style.width=width+'px';}
    const heights=cards.map(card=>card.getBoundingClientRect().height),tops=Array(columns).fill(0);
    cards.forEach((card,i)=>{const column=i%columns;card.style.left=column*(width+gap)+'px';card.style.top=tops[column]+'px';tops[column]+=heights[i]+gap;});
    container.style.position='relative';container.style.display='block';container.style.height=Math.max(...tops)+'px';scroller.scrollTop=scroll;
  }
  function emitView(){if(view&&snapshot)onViewChange({segment:view.segment,oldOpen:[...view.oldOpen],sidebarOpen:[...view.sidebarOpen],capacities:[...view.capacities],scroll:view.scroll,sidebarVisible:view.sidebarVisible,...(free()&&snapshot.viewSession?{freeSession:snapshot.viewSession}:{})},snapshot.scope);}
  function remember(){if(view&&roots)view.sidebarScroll=roots.sidebar.shadow.querySelector('.themes')?.scrollTop??view.sidebarScroll??0;if(view?.mode==='workspace'&&roots?.workspace.scroller&&roots.workspace.n.style.display!=='none')view.scroll=roots.workspace.scroller.scrollTop;}
  function calibrationEntry(){if(!free()||!roots)return;const objectIds=view.segment===0?['inventory']:[...new Set([...roots.workspace.shadow.querySelectorAll('[data-ref-id]')].map(n=>n.dataset.refId))].slice(0,64);onCalibrationEntry({kind:view.segment===0?'foreground':'history',objectIds:objectIds.length?objectIds:['inventory']});}
  function showWorkspace(){captureFocus();remember();view.mode='workspace';searchQuery=null;searchTheme=null;render();layout();queueMicrotask(()=>roots?.workspace.shadow.querySelector('.workspace')?.focus({preventScroll:true}));if(view.segment===0)onCurrentWorkspaceEntry();calibrationEntry();}
  function enterReading(){if(!view)return;remember();view.mode='reading';searchQuery=null;searchTheme=null;layout();}
  function openRef(ref,event){if(ref.available===false){event.preventDefault();return;}if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;remember();if(ref.anchor)pendingAnchor={scope:snapshot.scope,ref,anchor:ref.anchor};view.mode='reading';searchQuery=null;searchTheme=null;layout();const same=adapter.isCurrent(ref.nativeUrl);adapter.openNative(ref.nativeUrl,event);if(same){restoreFocus();locateAnchor();}}
  const windowGlyph=node(doc,'span',{class:'window-glyph','aria-hidden':'true'});windowGlyph.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.65"><path d="M4 5h16v12H9l-5 4z"/></svg>';
  function row(ref,context=''){const a=node(doc,'a',{class:'row',href:adapter.nativeHref?.(ref.nativeUrl)??ref.nativeUrl,'data-ref-id':ref.id,title:ref.displayTitle});const text=node(doc,'span',{class:'window-title'},ref.displayTitle??ref.nativeTitle);a.append(windowGlyph.cloneNode(true),text);a.dataset.focusKey='ref:'+context+':'+ref.id;if(index?.matches(ref.nativeUrl,adapter.currentURL())??adapter.isCurrent(ref.nativeUrl))a.setAttribute('aria-current','page');if(ref.available===false)a.setAttribute('aria-disabled','true');a.addEventListener('click',e=>openRef(ref,e));return a;}
  const chevron='<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  const symbols={search:'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',up:'M6 15l6-6 6 6',down:'M6 9l6 6 6-6',more:'M5 12h.01 M12 12h.01 M19 12h.01',minus:'M5 12h14',plus:'M5 12h14 M12 5v14',close:'m6 6 12 12 M18 6 6 18'};
  function graphic(b,kind){if(kind==='more'){b.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>';return b;}b.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+symbols[kind]+'"/></svg>';return b;}
  function members(group,parent,side=false){
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
    const rows=freeListRows(snapshot,kind,segment);if(!rows.length)return;
    const key=(side?'side:':'home:')+kind,cap=view.capacities.get(key)??(side?5:12),label=kind==='noProject'?'无项目聊天':'归属待核对';
    const list=node(doc,'section',{class:'free-list '+(side?'':'search'),'data-free-list':kind,'aria-label':label});list.append(node(doc,'h2',{},label));
    for(const r of rows.slice(0,cap))list.append(row(r,key));
    if(rows.length>cap)list.append(button('显示更多'+label,()=>{remember();view.capacities.set(key,cap+12);render();},'显示更多','more'));
    parent.append(list);
  }
  function themeGlyph(g){const n=node(doc,'span',{class:'theme-glyph','aria-hidden':'true'}),kind=g.owner==='bootstrap'&&g.icon==='◇'?defaultIcon(g.name):g.icon;n.dataset.icon=kind??'collection';if(iconPaths[kind])n.innerHTML=svgIcon(kind);else n.textContent=kind??'◇';return n;}
  function locateAnchor(){if(!pendingAnchor||!snapshot||!roots)return;if(pendingAnchor.scope!==snapshot.scope){pendingAnchor=null;return;}if(!adapter.isCurrent(pendingAnchor.ref.nativeUrl))return;const result=adapter.restoreSnippet?.(pendingAnchor.ref,pendingAnchor.anchor);pendingAnchor=null;anchorFeedback=result?.ok?null:'无法唯一定位已保存片段。消息可能已变化，请使用原生搜索。';if(anchorFeedback){roots.sidebar.shadow.querySelector('.anchor-feedback')?.remove();roots.sidebar.shadow.append(node(doc,'p',{class:'anchor-feedback',role:'status'},anchorFeedback));}}
  function showWorkingSet(){remember();view.mode='workspace';view.worksetOpen=true;searchQuery=null;searchTheme=null;render();layout();}
  function findKnown(theme=null){remember();view.mode='workspace';searchQuery='';searchTheme=theme;searchCapacity=24;render();layout();queueMicrotask(()=>roots?.workspace.shadow.querySelector('input')?.focus());}
  function closeMenu(focus=true){if(!menu)return;const prior=menu;menu=null;prior.n.remove();prior.trigger.setAttribute('aria-expanded','false');doc.removeEventListener('pointerdown',prior.outside,true);if(focus&&prior.trigger.isConnected)prior.trigger.focus({preventScroll:true});}
  function themeActions(g,head){const trigger=graphic(button('主题操作 '+g.name,()=>{
      if(menu?.trigger===trigger){closeMenu();return;}closeMenu(false);const popup=node(doc,'div',{class:'menu',role:'menu','aria-label':'主题操作 '+g.name});
      const item=(label,fn)=>{const b=button(label,()=>{closeMenu(false);fn();},label,'');b.setAttribute('role','menuitem');popup.append(b);};
      if(onManage&&!free())item('编辑主题',()=>onManage({workspaceId:g.id}));item('查找此主题',()=>findKnown(g.id));
      popup.addEventListener('keydown',e=>{const items=[...popup.querySelectorAll('button')],i=items.indexOf(doc.activeElement?.shadowRoot?.activeElement??popup.getRootNode().activeElement);if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu();}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();}});
      const outside=e=>{if(!e.composedPath().includes(popup)&&!e.composedPath().includes(trigger))closeMenu(false);};menu={n:popup,trigger,outside};trigger.setAttribute('aria-expanded','true');head.append(popup);doc.addEventListener('pointerdown',outside,true);popup.querySelector('button')?.focus();
    },'','square card-actions'),'more');trigger.dataset.focusKey='actions:'+g.id;trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');head.append(trigger);}
  function focusState(){for(const root of [roots?.sidebar,roots?.workspace]){const n=root?.shadow.activeElement;if(n?.dataset.focusKey)return {root,key:n.dataset.focusKey,start:n.selectionStart,end:n.selectionEnd};}return null;}
  function restoreOwnedFocus(f){if(!f)return;const n=[...f.root.shadow.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===f.key);if(n){n.focus({preventScroll:true});if(n.setSelectionRange&&typeof f.start==='number')n.setSelectionRange(f.start,f.end);}else{(f.root.shadow.querySelector('[aria-label="较早的30日"]')??f.root.shadow.querySelector('.workspace'))?.focus({preventScroll:true});}}
  function render(){if(!roots||!view)return;const focused=focusState();view.sidebarScroll=roots.sidebar.shadow.querySelector('.themes')?.scrollTop??view.sidebarScroll??0;closeMenu(false);
    const selected=current().selected;
    if(selected&&lastSelected!==adapter.currentURL()){view.sidebarOpen.add(selected.id);lastSelected=adapter.currentURL();selectionPending=true;}
    // Snapshot updates always invalidate closures; local history changes keep the
    // unchanged sidebar DOM, scroll and focus instead of rebuilding every card.
    const nextSidebarKey=JSON.stringify([snapshot.scope,adapter.currentURL(),view.sidebarVisible,[...view.sidebarOpen],[...view.oldOpen].filter(k=>k.startsWith('side:')),[...view.capacities].filter(([k])=>k.startsWith('side:')||k.includes(':side:'))]);
    const side=roots.sidebar.shadow;
    if(sidebarDirty||sidebarKey!==nextSidebarKey||!side.querySelector('section')){
    side.querySelector('section')?.remove();const panel=node(doc,'section');const tools=node(doc,'div',{class:'toolbar'});tools.append(node(doc,'strong',{},free()?'项目':'主题'),graphic(button(free()?'查找已知项目与聊天':'查找主题与派生名称',()=>findKnown()),'search'),graphic(button('折叠主题导航',()=>{remember();view.sidebarVisible=!view.sidebarVisible;render();}),view.sidebarVisible?'minus':'plus'),graphic(button('退出测试增强',()=>{stop();onExit();}),'close'));if(onManage)tools.append(graphic(button('管理工作空间',()=>onManage()),'more'));const workset=button('当前工作集',()=>showWorkingSet());workset.innerHTML=svgIcon('collection');tools.append(workset);panel.append(tools);
    const list=node(doc,'nav',{class:'themes','aria-label':'VAIWL 主题导航'});list.hidden=!view.sidebarVisible;
    const sideGroups=groups.filter(g=>g.segment===0||(free()&&g.segment===null)||g===selected);
    for(const g of sideGroups){const block=node(doc,'section',{class:'group'});const toggle=button('侧栏主题 '+g.name,()=>{view.sidebarOpen.has(g.id)?view.sidebarOpen.delete(g.id):view.sidebarOpen.add(g.id);render();},'','theme-toggle');toggle.dataset.focusKey='theme:'+g.id;toggle.append(themeGlyph(g),node(doc,'span',{class:'theme-name',title:g.name},g.name));const disclosure=node(doc,'span',{class:'theme-disclosure','aria-hidden':'true'});disclosure.innerHTML=chevron;toggle.append(disclosure);toggle.setAttribute('aria-expanded',String(view.sidebarOpen.has(g.id)));block.append(toggle);
      if(view.sidebarOpen.has(g.id)){const children=node(doc,'div',{class:'children'});members(g,children,true);block.append(children);}list.append(block);}
    const independent=current().independent;if(independent){const context=node(doc,'div',{class:'current-context'});context.append(row(independent));list.append(context);}if(free()){appendFreeList(list,'noProject',0,true);appendFreeList(list,'unknown',0,true);}panel.append(list);side.append(panel);list.scrollTop=view.sidebarScroll??0;sidebarKey=nextSidebarKey;sidebarDirty=false;locateCurrent();
    }
    const shadow=roots.workspace.shadow;const prior=shadow.querySelector('.workspace');if(prior)prior.remove();const page=node(doc,'div',{class:'workspace',tabindex:'-1','aria-label':'主题工作区','data-segment':String(view.segment)});roots.workspace.scroller=page;page.addEventListener('scroll',()=>{if(roots?.workspace.scroller===page&&view.mode==='workspace'&&roots.workspace.n.style.display!=='none'){view.scroll=page.scrollTop;emitView();}},{passive:true});
    if(searchQuery!==null){
      const search=node(doc,'section',{class:'search'}),top=node(doc,'div',{class:'search-top'}),theme=groups.find(g=>g.id===searchTheme);
      top.append(node(doc,'strong',{},theme?.name??(free()?'查找已知项目与聊天':'查找主题与派生名称')),graphic(button('关闭派生查找',()=>{searchQuery=null;searchTheme=null;render();queueMicrotask(()=>roots?.workspace.shadow.querySelector('.workspace')?.focus({preventScroll:true}));}),'close'));search.append(top);
      const input=node(doc,'input',{'aria-label':free()?'已知聊天查找输入':'派生查找输入',placeholder:'输入主题或窗口名称','data-focus-key':'search-input',type:'search'});input.value=searchQuery;
      search.append(input,node(doc,'p',{},'仅查找已知主题与窗口，包含时间尚未确认的记录。原生搜索独立保留。'));
      const results=node(doc,'div',{class:'search-results'});
      const update=()=>{searchQuery=input.value;results.replaceChildren();const found=knownMatches(snapshot,searchQuery,searchTheme);
        for(const r of found.slice(0,searchCapacity)){const link=row(r,r.anchor?'snippet:'+r.anchor.id:'search');if(r.anchor){link.dataset.snippetId=r.anchor.id;link.setAttribute('aria-label','定位片段 '+r.displayTitle);link.append(node(doc,'span',{class:'snippet-preview'},r.anchor.text));}results.append(link);}
        if(!found.length)results.append(node(doc,'div',{class:'no-results',role:'status'},'未找到已知记录。可以继续使用原生搜索。'));
        if(found.length>searchCapacity)results.append(button('显示更多查找结果',()=>{searchCapacity+=24;update();},'显示更多','more'));
      };input.oninput=()=>{searchCapacity=24;update();};update();search.append(results);page.append(search);
    }else if(view.worksetOpen){
      const workset=node(doc,'section',{class:'search working-set','aria-label':'当前工作集'}),top=node(doc,'div',{class:'search-top'});top.append(node(doc,'strong',{},'当前工作集'),button('返回主题视图',()=>{view.worksetOpen=false;render();},'返回主题','more'));workset.append(top,node(doc,'p',{},'只保存窗口引用与人工顺序，点击后打开。草稿与任务运行状态由原生页面保留。'));const saved=snapshot.preferences?.workingSet?.value??{refs:[],current:null};for(const id of saved.refs){const ref=snapshot.refs.find(r=>r.id===id);if(ref)workset.append(row(ref,'workset'));else workset.append(node(doc,'p',{class:'failed-ref'},'暂时无法打开的引用 '+id));}if(!saved.refs.length)workset.append(node(doc,'p',{},'还没有窗口。可在工作空间管理中加入窗口。'));if(onManage)workset.append(button('编辑当前工作集',()=>onManage(), '整理工作集','more'));page.append(workset);
    }else{
      const arrows=node(doc,'div',{class:'arrows','aria-label':'主题区间导航'});
      if(view.segment>0)arrows.append(graphic(button('较近的'+span()+'日',()=>{view.segment--;view.scroll=0;render();if(view.segment===0)onCurrentWorkspaceEntry();calibrationEntry();}),'up'));
      const down=graphic(button('较早的'+span()+'日',()=>{view.segment++;view.scroll=0;render();calibrationEntry();}),'down');down.disabled=view.segment>=Math.max(groups.reduce((max,g)=>Math.max(max,g.segment??0),0),free()?snapshot.refs.reduce((max,r)=>Math.max(max,(r.activityDecision??r.activity)?.segment??0),0):0);arrows.append(down);page.append(arrows);
      const cards=node(doc,'div',{class:'cards'});
      for(const g of groups.filter(g=>g.segment===view.segment||(free()&&g.segment===null&&view.segment===0))){
        const card=node(doc,'section',{class:'card','data-theme-id':g.id}),head=node(doc,'div',{class:'card-head'}),title=node(doc,'h2'),list=node(doc,'div',{class:'members'});
        title.append(themeGlyph(g),node(doc,'span',{class:'theme-name',title:g.name},g.name));head.append(title);if(free()&&adapter.projectCreateHref?.(g)){const a=node(doc,'a',{href:adapter.projectCreateHref(g),class:'square','aria-label':'在项目中新建聊天 '+g.name,title:'在项目中新建聊天 '+g.name},'+');a.addEventListener('click',e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){view.mode='reading';layout();adapter.openNative(a.href,e);}});head.append(a);}themeActions(g,head);card.append(head);members(g,list);card.append(list);cards.append(card);
      }
      if(!cards.children.length&&(!free()||!freeListRows(snapshot,'noProject',view.segment).length&&!freeListRows(snapshot,'unknown',view.segment).length)){const empty=node(doc,'div',{class:'empty'});empty.innerHTML=gridIcon;empty.append(node(doc,'strong',{},'这里还没有活跃主题'),node(doc,'p',{},'可切换区间，或查找已有窗口。'),button('查找已知主题与窗口',()=>findKnown(),'查找窗口','more'));cards.append(empty);}page.append(cards);if(free()){appendFreeList(page,'noProject',view.segment);appendFreeList(page,'unknown',view.segment);}
    }
    shadow.append(page);layoutCards();page.scrollTop=view.scroll;restoreOwnedFocus(focused);emitView();
  }
  function applyUpdate(value,now,timeZone,preparedIndex=null,alreadyPrepared=false){
    if(stopped)return;
    if(snapshot?.scope===value.scope&&(interacting()||updateTimer!==null)){pendingUpdate=[value,now,timeZone,preparedIndex,alreadyPrepared];return;}
    resetInteraction(true);sidebarDirty=true;remember();const priorSession=snapshot?.scope===value.scope?snapshot?.viewSession:null;if(value.viewMode==='free'&&!alreadyPrepared)value=freeNavigationSnapshot(value);snapshot=value;
    if(!views.has(value.scope)){
      const initial=initialView(),v=value.view;
      if(v)Object.assign(initial,{segment:v.segment,oldOpen:new Set(v.oldOpen),sidebarOpen:new Set(v.sidebarOpen),capacities:new Map(v.capacities),scroll:v.scroll,sidebarVisible:v.sidebarVisible});
      views.set(value.scope,initial);
    }
    view=views.get(value.scope);if(priorSession&&value.viewSession&&priorSession.H!==value.viewSession.H){const anchorDay=priorSession.T-view.segment*priorSession.H;view.segment=Math.max(0,Math.floor((value.viewSession.T-anchorDay)/value.viewSession.H));}groups=value.groups??project(value,now,timeZone);index=preparedIndex??currentIndex(value,groups);
    if(value.preferences?.sidebarVisible)view.sidebarVisible=value.preferences.sidebarVisible.value;
    layout();render();layout();locateAnchor();
  }
  function update(value,now,timeZone,preparedIndex=null){return applyUpdate(value,now,timeZone,preparedIndex);}
  function updatePreparedFree(value,now,timeZone,preparedIndex=null){assertPreparedFreeSnapshot(value);return applyUpdate(value,now,timeZone,preparedIndex,true);}
  function invalidate(reason='binding-invalidated'){resetInteraction(true);remember();snapshot=null;index=null;detach();status={state:'WAITING',reason};adapter.status(status);}
  function stop(){if(stopped)return;stopped=true;invalidate('controlled-exit');doc.removeEventListener('focusin',trackFocus);for(const[type,handler]of Object.entries(interactionHandlers))doc.removeEventListener(type,handler,true);win.removeEventListener?.('blur',windowBlur);restoreFocus();status={state:'STOPPED'};adapter.status(status);}
  return Object.freeze({update,updatePreparedFree,layout,invalidate,stop,showWorkspace,enterReading,currentRef:()=>current().ref,status:()=>({...status}),view:()=>view,roots:()=>roots});
}
