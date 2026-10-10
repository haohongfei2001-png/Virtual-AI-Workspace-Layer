import { project, initialView } from './projection.mjs';
const gridIcon='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/></svg>';
const css=`:host{font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--ink,#202123)}*{box-sizing:border-box}button,a{font:inherit;color:inherit}button{cursor:pointer;border:0;background:transparent}button:hover,a:hover{background:var(--hover,#eee)}button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid #3877ba;outline-offset:2px}button:disabled{opacity:.3;cursor:default}a{text-decoration:none}.toolbar{display:flex;align-items:center;gap:5px;color:var(--muted,#777);font-size:11px;padding:7px 4px}.toolbar strong{font-weight:500;margin-right:auto}.square{width:30px;height:30px;border-radius:8px;display:inline-grid;place-items:center}.themes{max-height:310px;overflow:auto;scrollbar-width:thin}.group{padding:3px 0}.theme-toggle{display:flex;gap:8px;align-items:center;padding:8px;border-radius:8px;width:100%;text-align:left;font-weight:550}.theme-glyph{width:19px;flex:none;color:var(--muted,#777)}.children{margin-left:18px;padding-left:5px;border-left:1px solid var(--line,#eee)}.row{display:block;padding:7px 9px;border-radius:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.row[aria-current=page]{background:var(--hover,#eee)}.row[aria-disabled=true]{opacity:.5}.old{display:grid;margin-left:3px;color:var(--muted,#777);text-align:left}.more{font-size:11px;color:var(--muted,#777);padding:6px 9px}.workspace{height:100%;overflow:auto;padding:30px 46px;background:var(--surface,#fff);scrollbar-width:thin}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:22px;align-items:start;padding-bottom:28px}.card{border:1px solid var(--line,#e6e6e6);border-radius:15px;padding:15px 12px 12px;background:var(--surface,#fff);min-width:0}.card h2{font-size:15px;margin:0 0 10px;padding:2px 8px;font-weight:550;display:flex;gap:9px;align-items:center}.card .row{font-size:13px;padding:8px 9px}.card .old{margin-left:8px}.arrows{position:sticky;top:0;float:right;margin-right:-38px;display:grid;gap:5px}.empty{color:var(--muted,#777);padding:55px 20px;text-align:center}.search{background:var(--surface,#fff);border:1px solid var(--line,#ddd);border-radius:14px;padding:18px;margin:10px;max-height:80%;overflow:auto}.search input{background:var(--bubble,#eee);color:inherit;border:1px solid var(--line,#ddd);border-radius:9px;padding:10px;width:100%}.search p{font-size:12px;color:var(--muted,#777)}@media(max-width:600px){.workspace{padding:16px 36px 20px 14px}.arrows{margin-right:-30px}.cards{gap:12px;grid-template-columns:1fr}}`;
function node(doc,tag,attrs={},text=''){const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);n.textContent=text;return n;}
/** Navigation owns only its roots and reversible view masking; never renders chat/composer. */
export function createNavigation({document:doc, adapter, onExit=()=>{}}) {
  const token='vaiwl-'+Math.random().toString(36).slice(2), views=new Map();let snapshot=null,view=null,groups=[],roots=null,stopped=false,mask=null,searchQuery=null,lastSelected=null;
  let status={state:'WAITING',reason:'no-verified-snapshot'},lastNativeFocus=null;
  const trackFocus=e=>{const n=e.composedPath()[0];if((n?.tagName==='TEXTAREA'||n?.tagName==='INPUT')&&!e.composedPath().some(x=>x?.hasAttribute?.('data-vaiwl-owned')))lastNativeFocus={node:n,start:n.selectionStart,end:n.selectionEnd};};
  doc.addEventListener('focusin',trackFocus);
  const captureFocus=()=>{const n=doc.activeElement;if(n===lastNativeFocus?.node){lastNativeFocus.start=n.selectionStart;lastNativeFocus.end=n.selectionEnd;}};
  const restoreFocus=()=>{const f=lastNativeFocus;if(f?.node.isConnected){f.node.focus({preventScroll:true});if(typeof f.start==='number'&&f.node.setSelectionRange)f.node.setSelectionRange(f.start,f.end);}};
  const button=(label,fn,text='',cls='square')=>{const b=node(doc,'button',{type:'button','aria-label':label,title:label,class:cls},text);b.addEventListener('click',fn);return b;};
  function own(tag='div'){const n=node(doc,tag,{'data-vaiwl-owned':token});const shadow=n.attachShadow({mode:'open'});shadow.append(node(doc,'style',{},css));return {n,shadow};}
  function restoreMask(){if(!mask)return;for(const[name,prior,expected]of mask.attrs){if(mask.node.getAttribute(name)===expected){if(prior===null)mask.node.removeAttribute(name);else mask.node.setAttribute(name,prior);}}mask=null;}
  function setMask(n,enabled){if(!enabled){restoreMask();return;}if(mask?.node===n)return;restoreMask();const attrs=[['data-vaiwl-mask',n.getAttribute('data-vaiwl-mask'),token],['inert',n.getAttribute('inert'),'']];for(const[k,,v]of attrs)n.setAttribute(k,v);mask={node:n,attrs};}
  function detach(){restoreMask();if(roots){roots.sidebar.n.remove();roots.workspace.n.remove();roots.back.remove();roots.maskStyle.remove();roots=null;}}
  function layout(){
    if(stopped||!snapshot)return;
    const host=adapter.inspect();
    if(!host.ok){detach();status={state:'NATIVE_ONLY',reason:host.reason};adapter.status(status);return;}
    if(roots&&(!roots.sidebar.n.isConnected||roots.host.history!==host.history||roots.host.header!==host.header)){detach();}
    if(!roots){
      const side=own(),workspace=own(),back=button('返回工作区',()=>showWorkspace());back.addEventListener('pointerdown',captureFocus);back.innerHTML=gridIcon;back.setAttribute('data-vaiwl-owned',token);back.setAttribute('data-vaiwl-return','');back.style.cssText='width:34px;height:34px;flex:none;display:inline-grid;place-items:center;border:0;border-radius:9px;background:transparent;color:inherit;cursor:pointer';
      host.history.before(side.n);doc.body.append(workspace.n);host.header.insertBefore(back,host.header.firstChild);
      workspace.n.style.cssText='position:fixed;z-index:10;display:none';
      const maskStyle=node(doc,'style',{'data-vaiwl-owned':token},`[data-vaiwl-mask="${token}"]{visibility:hidden!important}`);doc.head.append(maskStyle);
      roots={sidebar:side,workspace,back,maskStyle,host};render();
    }
    const suspended=adapter.hasNativeLayer();
    const show=view.mode==='workspace'&&!suspended;
    const r=host.reading.getBoundingClientRect();
    const style=`position:fixed;z-index:10;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;display:${show?'block':'none'}`;
    const wasVisible=roots.workspace.n.style.display==='block';
    if(roots.workspace.n.style.cssText!==style)roots.workspace.n.style.cssText=style;
    if(show&&!wasVisible&&roots.workspace.scroller)roots.workspace.scroller.scrollTop=view.scroll;
    roots.sidebar.n.style.visibility=suspended?'hidden':'';
    roots.back.hidden=view.mode==='workspace'||suspended;
    // The original conversation tree remains attached; only this reversible view mask changes.
    setMask(host.reading,show);
    status={state:suspended?'NATIVE_LAYER':'ACTIVE',mode:view.mode,scope:snapshot.scope};adapter.status(status);
  }
  function remember(){if(view?.mode==='workspace'&&roots?.workspace.scroller&&roots.workspace.n.style.display!=='none')view.scroll=roots.workspace.scroller.scrollTop;}
  function showWorkspace(){captureFocus();remember();view.mode='workspace';searchQuery=null;render();layout();}
  function openRef(ref,event){if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;remember();view.mode='reading';searchQuery=null;layout();const same=adapter.isCurrent(ref.nativeUrl);adapter.openNative(ref.nativeUrl,event);if(same)restoreFocus();}
  function row(ref){const a=node(doc,'a',{class:'row',href:ref.nativeUrl,'data-ref-id':ref.id,title:ref.displayTitle},ref.displayTitle??ref.nativeTitle);if(adapter.isCurrent(ref.nativeUrl))a.setAttribute('aria-current','page');if(ref.available===false)a.setAttribute('aria-disabled','true');a.addEventListener('click',e=>openRef(ref,e));return a;}
  function members(group,parent,side=false){const capKey=(side?'side:':'home:')+group.id,cap=view.capacities.get(capKey)??6;for(const r of group.current.slice(0,cap))parent.append(row(r));
    if(cap<group.current.length)parent.append(button('显示更多近期窗口',()=>{view.capacities.set(capKey,cap+12);render();},'显示更多','more'));
    const key=(side?'side:':'home:')+group.id;
    if(group.old.length){const b=button('展开旧窗口 '+group.name,()=>{remember();view.oldOpen.has(key)?view.oldOpen.delete(key):view.oldOpen.add(key);render();},view.oldOpen.has(key)?'▾':'▸','square old');b.setAttribute('aria-expanded',String(view.oldOpen.has(key)));parent.append(b);if(view.oldOpen.has(key))for(const r of group.old)parent.append(row(r));}
  }
  function findKnown(){view.mode='workspace';searchQuery='';render();layout();queueMicrotask(()=>roots?.workspace.shadow.querySelector('input')?.focus());}
  function render(){if(!roots||!view)return;
    const side=roots.sidebar.shadow;side.querySelector('section')?.remove();const panel=node(doc,'section');const tools=node(doc,'div',{class:'toolbar'});tools.append(node(doc,'strong',{},'主题'),button('查找主题与派生名称',findKnown,'⌕'),button('折叠主题导航',()=>{view.sidebarVisible=!view.sidebarVisible;render();},view.sidebarVisible?'−':'+'),button('退出测试增强',()=>{stop();onExit();},'×'));panel.append(tools);
    const list=node(doc,'nav',{class:'themes','aria-label':'VAIWL 主题导航'});list.hidden=!view.sidebarVisible;
    const selected=groups.find(g=>[...g.current,...g.old,...g.unknown].some(r=>adapter.isCurrent(r.nativeUrl)));
    if(selected&&lastSelected!==adapter.currentURL()){view.sidebarOpen.add(selected.id);lastSelected=adapter.currentURL();}
    const sideGroups=groups.filter(g=>g.segment===0||g===selected);
    for(const g of sideGroups){const block=node(doc,'section',{class:'group'});const toggle=button('侧栏主题 '+g.name,()=>{view.sidebarOpen.has(g.id)?view.sidebarOpen.delete(g.id):view.sidebarOpen.add(g.id);render();},'','theme-toggle');toggle.append(node(doc,'span',{class:'theme-glyph'},'◇'),node(doc,'span',{},g.name));toggle.setAttribute('aria-expanded',String(view.sidebarOpen.has(g.id)));block.append(toggle);
      if(view.sidebarOpen.has(g.id)){const children=node(doc,'div',{class:'children'});members(g,children,true);const exceptional=g.unknown.find(r=>adapter.isCurrent(r.nativeUrl));if(exceptional)children.append(row(exceptional));block.append(children);}list.append(block);}
    panel.append(list);side.append(panel);
    const shadow=roots.workspace.shadow;const prior=shadow.querySelector('.workspace');if(prior)prior.remove();const page=node(doc,'div',{class:'workspace','data-segment':String(view.segment)});roots.workspace.scroller=page;page.addEventListener('scroll',()=>{if(roots?.workspace.scroller===page&&view.mode==='workspace'&&roots.workspace.n.style.display!=='none')view.scroll=page.scrollTop;},{passive:true});
    if(searchQuery!==null){const search=node(doc,'section',{class:'search'}),input=node(doc,'input',{'aria-label':'派生查找输入',placeholder:'查找主题、派生名称与已知窗口'});input.value=searchQuery;search.append(input,node(doc,'p',{},'只搜索已知合成引用；未知时间和历史窗口仍可查找。原生搜索独立保留。'));
      const results=node(doc,'div');const update=()=>{searchQuery=input.value;results.replaceChildren();for(const r of snapshot.refs.filter(r=>(r.nativeTitle+r.displayTitle+r.id).includes(searchQuery)))results.append(row(r));};input.oninput=update;update();search.append(results,button('关闭派生查找',()=>{searchQuery=null;render();},'关闭','more'));page.append(search);
    }else{const arrows=node(doc,'div',{class:'arrows'});if(view.segment>0)arrows.append(button('较近的30日',()=>{view.segment--;view.scroll=0;render();},'↑'));const down=button('较早的30日',()=>{view.segment++;view.scroll=0;render();},'↓');down.disabled=view.segment>=Math.max(0,...groups.map(g=>g.segment??0));arrows.append(down);page.append(arrows);
      const cards=node(doc,'div',{class:'cards'});for(const g of groups.filter(g=>g.segment===view.segment)){const card=node(doc,'section',{class:'card','data-theme-id':g.id}),title=node(doc,'h2');title.append(node(doc,'span',{class:'theme-glyph'},'◇'),node(doc,'span',{},g.name));card.append(title);members(g,card);cards.append(card);}if(!cards.children.length)cards.append(node(doc,'div',{class:'empty'},'这个区间没有已确认活跃的主题。'));page.append(cards);}
    shadow.append(page);page.scrollTop=view.scroll;
  }
  function update(value,now,timeZone){if(stopped)return;snapshot=value;if(!views.has(value.scope))views.set(value.scope,initialView());view=views.get(value.scope);groups=project(value,now,timeZone);layout();render();layout();}
  function invalidate(reason='binding-invalidated'){remember();snapshot=null;detach();status={state:'WAITING',reason};adapter.status(status);}
  function stop(){if(stopped)return;stopped=true;invalidate('controlled-exit');doc.removeEventListener('focusin',trackFocus);restoreFocus();status={state:'STOPPED'};adapter.status(status);}
  return Object.freeze({update,layout,invalidate,stop,showWorkspace,status:()=>({...status}),view:()=>view,roots:()=>roots});
}
