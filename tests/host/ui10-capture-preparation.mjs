import assert from 'node:assert/strict';
/** Only known panel status/counts, never snippet text. Serialized into the frame. */
export function observeUi10Snippets({requireReady=true}={}){
 const panel=document.querySelector('[data-vaiwl-snippets]');if(!panel)return requireReady?false:{present:false};
 const text=panel.textContent??'',match=text.match(/共 (\d+) 个片段/),total=match?Number(match[1]):null,rows=panel.querySelectorAll('[data-snippet-row]').length;
 const state={present:true,busy:panel.getAttribute('aria-busy')!=='false',alert:panel.querySelector('[role="alert"]')!==null,loading:text.includes('正在读取片段'),empty:text.includes('暂无已保存片段。'),total,rows};
 const ready=!state.busy&&!state.alert&&!state.loading&&((total===0&&rows===0&&state.empty)||(Number.isInteger(total)&&total>0&&rows>0&&rows<=total));return requireReady?(ready?state:false):state;
}
export async function waitForUi10Snippets(frame){try{const handle=await frame.waitForFunction(observeUi10Snippets,undefined,{timeout:6000});try{return await handle.jsonValue();}finally{await handle.dispose();}}catch(error){try{error.ui10SnippetDiagnostics=await frame.evaluate(observeUi10Snippets,{requireReady:false});}catch{}throw error;}}
/** Screenshot preparation only, not a scroll-restoration test. No DOM/style edits. */
export async function observeUi10CaptureLayout({view,normalize=false}){
 const currentRoot=()=>[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'))?.shadowRoot,previousWorkspace=currentRoot()?.querySelector('.workspace'),docScroll=document.scrollingElement;
 const rect=n=>n?.getBoundingClientRect().toJSON()??null,scroll=n=>n?{scrollTop:n.scrollTop,scrollLeft:n.scrollLeft,scrollHeight:n.scrollHeight,scrollWidth:n.scrollWidth,clientHeight:n.clientHeight,clientWidth:n.clientWidth,rect:rect(n)}:null;
 const before={workspace:scroll(previousWorkspace),document:scroll(docScroll)};
 if(normalize){previousWorkspace?.scrollTo({top:0,left:0,behavior:'instant'});docScroll?.scrollTo({top:0,left:0,behavior:'instant'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
 // A normal owner projection may replace .workspace during the existing RAFs.
 // Measure its current controls and scrollport together, never mix node lifetimes.
 const root=currentRoot(),workspace=root?.querySelector('.workspace');
 const snippets=document.querySelector('[data-vaiwl-snippets]');
 const region=view==='snippets'?snippets:view==='H-settings'?root?.querySelector('[aria-label="工作空间设置"]'):view==='working-set'?root?.querySelector('[aria-label="当前工作集"]'):view==='search'?root?.querySelector('.search'):root?.querySelector('.card');
 const nodes=view==='snippets'?[snippets?.querySelector('h2')]:view==='H-settings'?[region?.querySelector('strong'),region?.querySelector('select')]:view==='working-set'?[region?.querySelector('strong')]:view==='search'?[region?.querySelector('input')]:[region?.querySelector('h2')];
 const w=workspace?.getBoundingClientRect(),clip=view==='snippets'||!workspace?{left:0,top:0,right:innerWidth,bottom:innerHeight}:{left:Math.max(0,w.left+workspace.clientLeft),top:Math.max(0,w.top+workspace.clientTop),right:Math.min(innerWidth,w.left+workspace.clientLeft+workspace.clientWidth),bottom:Math.min(innerHeight,w.top+workspace.clientTop+workspace.clientHeight)};
 return {view,preparation:normalize?'SCROLL_TO_START_FOR_CAPTURE_ONLY':'OBSERVATION_ONLY',scrollRestorationEvidence:false,before,after:{workspace:scroll(workspace),document:scroll(docScroll)},workspaceIdentity:{changed:previousWorkspace!==workspace,previousConnected:previousWorkspace?.isConnected??null,currentConnected:workspace?.isConnected??null},viewport:{width:innerWidth,height:innerHeight},clip,region:rect(region),firstCard:rect(root?.querySelector('.card')),targets:nodes.map(n=>({present:!!n,rect:rect(n),visible:!!n&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility==='visible'}))};
}
export function assertUi10CaptureLayout(state){assert(state.region,'capture region required');assert(state.targets.length>0);for(const target of state.targets){const r=target.rect,c=state.clip;assert(target.present&&target.visible&&r?.width>0&&r?.height>0,'capture key control required');assert(r.left>=c.left-1&&r.top>=c.top-1&&r.right<=c.right+1&&r.bottom<=c.bottom+1,'capture key control must fit visible scrollport');}return state;}

/** Parent-document coordinates, including frame borders and clipping ancestors. */
export function observeUi10OuterCapture(node){
 const r=node.getBoundingClientRect(),style=getComputedStyle(node),pageViewport={width:innerWidth,height:innerHeight};let visible=node.isConnected&&r.width>0&&r.height>0;
 let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};const ancestors=[];
 for(let n=node;n;n=n.parentElement??n.getRootNode?.().host){const s=getComputedStyle(n),b=n.getBoundingClientRect();if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0)visible=false;
  if(s.transform&&s.transform!=='none'){const m=new DOMMatrixReadOnly(s.transform);if(m.b!==0||m.c!==0||!m.is2D)visible=false;}
  if(n!==node&&(/auto|scroll|hidden|clip/.test(s.overflowX)||/auto|scroll|hidden|clip/.test(s.overflowY))){const sx=n.offsetWidth?b.width/n.offsetWidth:1,sy=n.offsetHeight?b.height/n.offsetHeight:1,c={left:b.left+n.clientLeft*sx,top:b.top+n.clientTop*sy,right:b.left+(n.clientLeft+n.clientWidth)*sx,bottom:b.top+(n.clientTop+n.clientHeight)*sy};if(/auto|scroll|hidden|clip/.test(s.overflowX)){clip.left=Math.max(clip.left,c.left);clip.right=Math.min(clip.right,c.right);}if(/auto|scroll|hidden|clip/.test(s.overflowY)){clip.top=Math.max(clip.top,c.top);clip.bottom=Math.min(clip.bottom,c.bottom);}ancestors.push({rect:b.toJSON(),scrollTop:n.scrollTop,scrollLeft:n.scrollLeft,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,overflowX:s.overflowX,overflowY:s.overflowY});}
 }
 const scaleX=node.offsetWidth?r.width/node.offsetWidth:1,scaleY=node.offsetHeight?r.height/node.offsetHeight:1,pl=parseFloat(style.paddingLeft)||0,pt=parseFloat(style.paddingTop)||0,pr=parseFloat(style.paddingRight)||0,pb=parseFloat(style.paddingBottom)||0;
 const content={left:r.left+(node.clientLeft+pl)*scaleX,top:r.top+(node.clientTop+pt)*scaleY,right:r.left+(node.clientLeft+node.clientWidth-pr)*scaleX,bottom:r.top+(node.clientTop+node.clientHeight-pb)*scaleY};
 return {visible,pageViewport,rect:r.toJSON(),clip,content,scaleX,scaleY,ancestors};
}
export function assertUi10OuterCapture(state,outer,{reading=false}={}){
 assert(outer?.visible&&outer.rect?.width>0&&outer.rect?.height>0,'capture frame/return must be visible');
 const clip=reading?outer.clip:{left:Math.max(outer.clip.left,outer.content.left),top:Math.max(outer.clip.top,outer.content.top),right:Math.min(outer.clip.right,outer.content.right),bottom:Math.min(outer.clip.bottom,outer.content.bottom)};
 const targets=reading?[outer.rect]:state.targets.map(({rect:r})=>({left:outer.content.left+r.left*outer.scaleX,top:outer.content.top+r.top*outer.scaleY,right:outer.content.left+r.right*outer.scaleX,bottom:outer.content.top+r.bottom*outer.scaleY}));
 for(const r of targets)assert(r.left>=clip.left-1&&r.top>=clip.top-1&&r.right<=clip.right+1&&r.bottom<=clip.bottom+1,'capture key target clipped by parent page or ancestor');return {clip,targets};
}
export async function prepareUi10Capture(frame,view,page){
 const reading=view==='reading-unique-return',state=await frame.evaluate(observeUi10CaptureLayout,{view,normalize:!reading});let element;
 try{if(!reading)assertUi10CaptureLayout(state);element=reading?await page.getByRole('button',{name:'返回工作空间',exact:true}).elementHandle():await frame.frameElement();assert(element,'capture outer element missing');state.outer=await element.evaluate(observeUi10OuterCapture);state.pageTargets=assertUi10OuterCapture(state,state.outer,{reading});return state;}
 catch(error){error.ui10CaptureDiagnostics=state;throw error;}finally{await element?.dispose();}
}
