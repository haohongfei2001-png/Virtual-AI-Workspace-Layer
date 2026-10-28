import {hasNativeLayer,NATIVE_LAYER_SELECTOR} from './native-layer.mjs';
import {isEmptyViewportMarker,isNativeScrollRegion} from './native-return-gap.mjs';
/** Presentation-only document flow contract. Never supplies scope or data authority.
 * Native nodes stay in their original parent chain. Owned rules are reversible;
 * active proof measures the displayed layout, never a temporarily disabled one.
 */
const rect = node => { const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
const positive = r => r && Object.values(r).every(Number.isFinite) && r.width > 0 && r.height > 0;
const overlaps = (a,b) => a.x < b.x+b.width && b.x < a.x+a.width && a.y < b.y+b.height && b.y < a.y+a.height;
const attrs = node => ['class','style','hidden','aria-hidden','role','tabindex','contenteditable','inert'].map(key=>node.getAttribute(key));
const plain = node => ['DIV','MAIN','SECTION'].includes(node.tagName) && !node.shadowRoot && !node.matches('[tabindex],[contenteditable],[inert],[hidden],[aria-hidden="true"],a,button,input,textarea,select');
const controls = 'a[href],button,input,textarea,select,[tabindex],[contenteditable]:not([contenteditable="false"]),[role]:not([role="none"]):not([role="presentation"])';
const htmlNamespace='http://www.w3.org/1999/xhtml',svgNamespace='http://www.w3.org/2000/svg';
// Only directly embedded, static inline graphics. Referenced trees (<use>,
// including local references), foreign content and animation are not covered
// by childNodes or by the native member's identity proof.
const inlineGraphics=new Set(['g','path','rect','circle','ellipse','line','polyline','polygon','title','desc']);
// The observed viewport contract permits empty native markers. Only an
// already display:none marker is inert to grid layout: a visible zero-size
// element can create a new track/gap. Never style or relocate these nodes.
const inactiveMarker=(node,viewport,doc)=>isEmptyViewportMarker(node,viewport,doc)&&doc.defaultView.getComputedStyle(node).display==='none';

// Fixed refusal classes from the existing proof, never native values or text.
// Only this pre-mutation error may keep the initial layout watcher alive;
// arbitrary mount errors (including marker collisions) remain terminal.
export const nativeFlowFailureReasons=Object.freeze(['inspection','regions','root','header','capacity','wrapper-control','wrapper-text','wrapper-paint','uncovered-branch','branch-paint','branch-order','protected-controls','geometry','check-failed'].map(reason=>'native-flow-'+reason));
export class NativeFlowPreflightError extends Error {
 constructor(reason){super(nativeFlowFailureReasons.includes(reason)?reason:'native-flow-check-failed');this.name='NativeFlowPreflightError';}
}

// A home landmark proof is not an assertion that welcome + composer exhaust
// their parent. Keep additional native content as an opaque flow member. No
// text values, action semantics or data authority are inferred from this scan.
// Every painted box must remain inside that member; unsupported painting is
// refused instead of being hidden or treated as another title/reading region.
function retainedPaint(member,doc,{viewport=false,budget={started:doc.defaultView.performance.now(),nodes:0,rectangles:0}}={}){
 const win=doc.defaultView,root=member.node,box=rect(root);
 const inside=r=>Object.values(r).every(Number.isFinite)&&(!positive(r)||r.x>=box.x-0.5&&r.y>=box.y-0.5&&r.x+r.width<=box.x+box.width+0.5&&r.y+r.height<=box.y+box.height+0.5);
 const hidden=win.getComputedStyle(root).display==='none';
 if(hidden!==member.hidden||!hidden&&(!positive(box)||viewport&&(box.x<0||box.y<0||box.x+box.width>win.innerWidth+1||box.y+box.height>win.innerHeight+1)))return false;
 const range=doc.createRange();
 function walk(node,absent,graphic=null){
  if(++budget.nodes>128||win.performance.now()-budget.started>25)return false;
  if(node.nodeType===3){if(absent||graphic)return true;range.selectNodeContents(node);for(const r of range.getClientRects())if(++budget.rectangles>256||win.performance.now()-budget.started>25||!inside({x:r.x,y:r.y,width:r.width,height:r.height}))return false;return true;}
  if(node.nodeType!==1)return true;
  if(node.shadowRoot||node.localName.includes('-'))return false;
  const svg=node.namespaceURI===svgNamespace;
  if(svg){
   if(graphic){if(!inlineGraphics.has(node.localName))return false;}
   else {if(node===root||node.localName!=='svg'||node.parentElement?.namespaceURI!==htmlNamespace)return false;graphic=node;}
  }else if(graphic||node.namespaceURI!==htmlNamespace||node.matches('iframe,object,embed,canvas,video,audio'))return false;
  const s=win.getComputedStyle(node);absent||=s.display==='none';
  if(!absent){
   if(!['static','relative'].includes(s.position)||s.cssFloat!=='none'||s.visibility!=='visible'||s.opacity!=='1'||s.zoom!=='1'||s.animationName!=='none'||s.display==='list-item'||s.webkitTextStrokeWidth!=='0px'||s.textDecorationLine!=='none'||node===root&&!['block','flow-root','flex','grid','inline-block'].includes(s.display)||['transform','translate','rotate','scale','filter','backdropFilter','clipPath','maskImage','offsetPath','boxShadow','textShadow','borderImageSource'].some(k=>s[k]!=='none'))return false;
   if(['::before','::after'].some(p=>!['none','normal'].includes(win.getComputedStyle(node,p).content)))return false;
   if(svg&&(['markerStart','markerMid','markerEnd'].some(k=>s[k]!=='none')||[s.fill,s.stroke].some(value=>/url\(/i.test(value))))return false;
   const b=!svg||node===graphic?rect(node):null;
   // The real SVG viewport clips all allowed descendants, even oversized
   // paths/strokes. `clip` is not equivalent: overflow-clip-margin can extend
   // its paint. Root effects and outline still need the surrounding HTML proof.
   if(node===graphic&&(s.display==='contents'||s.overflowX!=='hidden'||s.overflowY!=='hidden'||!positive(b)))return false;
   if((!svg||node===graphic)&&!inside(b))return false;
   if(!['none','hidden'].includes(s.outlineStyle)&&s.outlineWidth!=='0px'){
    if(svg&&node!==graphic)return false;
    const outset=Math.max(0,Number.parseFloat(s.outlineWidth)+Number.parseFloat(s.outlineOffset));
    if(!Number.isFinite(outset)||!inside({x:b.x-outset,y:b.y-outset,width:b.width+2*outset,height:b.height+2*outset}))return false;
   }
  }
  return [...node.childNodes].every(child=>walk(child,absent,graphic));
 }
 return walk(root,hidden)&&win.performance.now()-budget.started<=25;
}

// Keep the existing landmark order, and also preserve each retained member's
// relation to every native landmark. An incompatible native order is refused,
// never guessed (for example a member between a relocated composer and tabs).
function orderedFlowMembers(base,members){
 const order=[...base];
 for(const {node,hidden} of members){
  if(hidden)continue;
  let first=0,last=order.length;
  for(let i=0;i<order.length;i++){const relation=node.compareDocumentPosition(order[i]);if(relation&2)first=Math.max(first,i+1);else if(relation&4)last=Math.min(last,i);else return null;}
  if(first>last)return null;order.splice(last,0,node);
 }
 return order;
}

// Identity and native visibility are separate. Native editor/tool transitions
// may retain an inactive node; it is still protected against replacement, but
// must not be forced visible by the extension. Only a closed-layout re-proof
// may change this visibility baseline.
function controlSnapshot({protectedRegions,document:doc,isOwnedSurface}) {
 const result=[],seen=new Set();
 for(const region of protectedRegions)for(const node of [region,...region.querySelectorAll(controls)]){
  if(seen.has(node)||isOwnedSurface(node))continue;
  seen.add(node);if(result.length>=128)return null;
  const style=doc.defaultView.getComputedStyle(node);
  result.push({node,parent:node.parentElement,visible:style.display!=='none'&&style.visibility==='visible'&&positive(rect(node))});
 }
 return result;
}

// These native layout coordinates supply the conditional flow rules/baseline.
// Read them only in the restored native layout, never by disabling live CSS.
const layoutCoordinates = ({root,header,composer,headerInside}) => {
 const box=rect(root),head=rect(header),form=rect(composer);
 if(!positive(box)||!positive(head)||!positive(form))return null;
 return {composerWidth:form.width,top:Math.max(0,headerInside?box.y:head.y+head.height,box.y),rootTop:box.y,rootLeft:box.x,rootPosition:root.ownerDocument.defaultView.getComputedStyle(root).position};
};

export function isSameNativeLayout(plan) {
 try {
  const next=layoutCoordinates(plan);
  const current=controlSnapshot(plan);
  return !!next&&Object.keys(next).every(key=>next[key]===plan[key])&&!!current&&current.length===plan.nativeControls.length&&current.every((value,i)=>value.node===plan.nativeControls[i].node&&value.parent===plan.nativeControls[i].parent&&value.visible===plan.nativeControls[i].visible);
 }catch{return false;}
}

export function captureNativeBaseline({document:doc,inspection,isOwnedSurface=()=>false,onRefused=()=>{}}={}) {
 const refuse=reason=>{try{onRefused(reason);}catch{}return null;};
 try {
  if (!inspection?.ok) return refuse('native-flow-inspection');
  const {reading,composer,header}=inspection,win=doc.defaultView;
  if (![reading,composer,header].every(n=>n?.isConnected&&n.ownerDocument===doc) || reading.contains(composer) || composer.contains(reading)) return refuse('native-flow-regions');
  const protectedNodes=[...new Set([composer,...inspection.protectedRegions.filter(n=>n!==header).map(n=>n.tagName==='H1'&&plain(n.parentElement)&&!n.parentElement.contains(composer)&&!n.parentElement.contains(reading)?n.parentElement:n)])];
  const leaves=[reading,...protectedNodes];
  let root=inspection.readingViewport??reading.parentElement;
  while(root && (!leaves.every(n=>root.contains(n))||!positive(rect(root))))root=root.parentElement;
  // Only the explicit viewport may retain this native tab stop. It remains
  // the grid's real root box; nested focusable nodes are never flattened.
  const focusViewport=root===inspection.readingViewport&&isNativeScrollRegion(root,inspection.viewportFocus,doc)?root:null;
  if(!root||root===doc.body||root===doc.documentElement||!plain(root)&&!focusViewport)return refuse('native-flow-root');
  const headerInside=root.contains(header);
  if(headerInside){if(header.contains(reading)||header.contains(composer)||reading.contains(header)||composer.contains(header))return refuse('native-flow-header');protectedNodes.unshift(header);leaves.push(header);}
  const kind=protectedNodes.some(n=>n.getAttribute('role')==='tablist')?'project':inspection.homeLayoutNodes?'home':'conversation';
  const leafSet=new Set(leaves),shells=[],records=[],nativeChildren=new Map(),inactiveMarkers=[],retainedMembers=[];let count=0,failure=null,retainedBudget=null;
  const markerViewport=inspection.viewportMarkers==='empty-div-v1'?inspection.readingViewport:null;
  const isMarker=node=>!!markerViewport&&inactiveMarker(node,markerViewport,doc);
  const reject=reason=>{failure??=reason;return false;};
  function retain(node){
   const member={node,hidden:win.getComputedStyle(node).display==='none'};
   retainedBudget??={started:win.performance.now(),nodes:0,rectangles:0};
   if(!retainedPaint(member,doc,{budget:retainedBudget}))return reject('native-flow-branch-paint');
   // Exact nodes/order, including text nodes but never their values. A later
   // native replacement needs a new proof; it cannot inherit these markers.
   function record(branch,first=false){
    if(!first){if(++count>128)return reject('native-flow-capacity');if(branch.nodeType===1)records.push({node:branch,parent:branch.parentElement,attrs:attrs(branch)});}
    if(branch.nodeType!==1)return true;
    nativeChildren.set(branch,[...branch.childNodes]);return [...branch.childNodes].every(child=>record(child));
   }
   if(!record(node,true))return false;retainedMembers.push(member);return true;
  }
  function walk(node){
   if(++count>128)return reject('native-flow-capacity');
   if(!node.isConnected||node.ownerDocument!==doc)return reject('native-flow-regions');
   records.push({node,parent:node.parentElement,attrs:attrs(node)});
   if(leafSet.has(node))return true;
   if(isMarker(node)){inactiveMarkers.push(node);return true;}
   // Scope this addition to the already inspected home layout. Conversation
   // reading/viewport policies and Project controls retain their own contracts.
   if(!leaves.some(leaf=>node.contains(leaf)))return kind==='home'?retain(node):reject('native-flow-uncovered-branch');
   // Layout wrappers only. Unknown controls/text/branches cannot disappear
   // through display:contents, even if they happen to have no visible text.
   if(node!==focusViewport&&(!plain(node)||node.hasAttribute('role')&&node.getAttribute('role')!=='main'))return reject('native-flow-wrapper-control');
   if([...node.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return reject('native-flow-wrapper-text');
   const style=win.getComputedStyle(node);
   if(style.display==='none'||style.visibility!=='visible'||style.opacity!=='1'||style.zoom!=='1'||['transform','translate','rotate','scale','filter','backdropFilter','clipPath','maskImage'].some(k=>style[k]!=='none')||['::before','::after'].some(p=>!['none','normal'].includes(win.getComputedStyle(node,p).content)))return reject('native-flow-wrapper-paint');
   const children=[...node.children].filter(n=>!isOwnedSurface(n));
   if(!children.length)return reject('native-flow-uncovered-branch');
   nativeChildren.set(node,children);shells.push(node);return children.every(walk);
  }
  if(!walk(root)||!leaves.every(n=>records.some(r=>r.node===n)))return refuse(failure??'native-flow-uncovered-branch');
  // Headers outside the flow root are never laid out by us, but remain part
  // of the native identity and occlusion proof. React may replace them alone.
  if(!headerInside)records.push({node:header,parent:header.parentElement,attrs:attrs(header)});
  const flowOrder=orderedFlowMembers([...(headerInside?[header]:[]),...protectedNodes.filter(n=>n!==header&&n!==composer),reading,composer],retainedMembers);
  if(!flowOrder)return refuse('native-flow-branch-order');
  const protectedRegions=[...new Set([header,...protectedNodes,...retainedMembers.map(m=>m.node)])];
  const nativeControls=controlSnapshot({protectedRegions,document:doc,isOwnedSurface});
  if(!nativeControls)return refuse('native-flow-protected-controls');
  const coordinates=layoutCoordinates({root,header,composer,headerInside});
  if(!coordinates)return refuse('native-flow-geometry');
  return Object.freeze({kind,root,reading,composer,header,leaves,protectedNodes,protectedRegions,shells,records,nativeChildren,nativeControls,inactiveMarkers,retainedMembers,flowOrder,markerViewport,focusViewport,
   headerInside,document:doc,url:doc.location.href,regionEpoch:inspection.regionEpoch,isOwnedSurface,
   ...coordinates});
 }catch{return refuse('native-flow-check-failed');}
}

export function isSameNativeRegions(plan,{allowPresentationChange=false}={}){
 try {
  if(!plan||plan.document.location.href!==plan.url)return false;
  return plan.records.every(({node,parent,attrs:before})=>node.isConnected&&node.ownerDocument===plan.document&&node.parentElement===parent&&attrs(node).every((value,i)=>allowPresentationChange&&i<2||value===before[i]))&&
   [...plan.nativeChildren].every(([node,children])=>{const retained=plan.retainedMembers.some(m=>m.node===node||m.node.contains(node)),actual=[...(retained?node.childNodes:node.children)].filter(n=>!plan.isOwnedSurface(n));return actual.length===children.length&&actual.every((n,i)=>n===children[i]);})&&
   plan.nativeControls.every(({node,parent})=>node.isConnected&&node.parentElement===parent)&&
   plan.inactiveMarkers.every(node=>inactiveMarker(node,plan.markerViewport,plan.document))&&
   plan.retainedMembers.every(m=>(plan.document.defaultView.getComputedStyle(m.node).display==='none')===m.hidden)&&
   (!plan.focusViewport||isNativeScrollRegion(plan.focusViewport,'native-scroll-region',plan.document));
 }catch{return false;}
}

/** Owned attributes are tokens only. Rules exist only while the empty exit
 * switch is open. Removing it/our stylesheet restores native presentation. */
export function flowLayoutRules(plan,{id,exitId,workspaceId}) {
 const active=`body:has(#${exitId}:popover-open):not(:has(${NATIVE_LAYER_SELECTOR}))`;
 // :active ends before the native pointerup/click handlers. Keep only the
 // proved geometry until the trusted gesture's deferred release, while the
 // separate active selector still conceals private content for native layers.
 const geometry=`:is(${active},body:has(#${exitId}:popover-open[data-va-gesture="${id}"]))`;
 const select=(name)=>`${geometry} [data-va-flow-${name}="${id}"]`;
 const workspaceRow=plan.flowOrder.indexOf(plan.reading)+1,composerRow=plan.flowOrder.indexOf(plan.composer)+1;
 const rows=plan.flowOrder.map(node=>node===plan.reading?'minmax(96px,1fr)':'auto').join(' ');
 // Follow the existing containing block horizontally, including native NAV
 // collapse. A captured viewport-left cap can remain safely but visibly too
 // narrow. Fixed/absolute roots do not get their percent width from that same
 // flow parent; keep their viewport-left bound. Actual viewport/occlusion proof
 // is still required for both, including positioning changes while open.
 const maxWidth=['static','relative'].includes(plan.rootPosition)?'100%':`calc(100dvw - ${plan.rootLeft}px)`;
 // Keep native outer margins: rootTop already includes that displacement.
 // Zeroing them moves an ordinary flow root underneath the native titlebar,
 // making a previously clear return gap overlap the workspace after mounting.
 return `${select('root')}{display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:${rows}!important;box-sizing:border-box!important;min-height:0!important;height:calc(100dvh - ${plan.rootTop}px)!important;max-height:none!important;width:100%!important;max-width:${maxWidth}!important;padding:${Math.max(0,plan.top-plan.rootTop)}px 0 24px!important;gap:16px!important;overflow:auto!important;align-content:stretch!important;align-items:stretch!important}
${select('shell')}{display:contents!important}
${select('reading')}{grid-column:1!important;grid-row:${workspaceRow}!important;visibility:hidden!important;interactivity:inert!important;min-height:0!important;height:0!important;overflow:clip!important;margin:0!important;padding:0!important}
${select('composer')}{grid-column:1!important;grid-row:${composerRow}!important;position:relative!important;inset:auto!important;transform:none!important;align-self:end!important;justify-self:center!important;width:min(calc(100% - 48px),${plan.composerWidth}px)!important;max-width:100%!important;margin:0!important}
${plan.flowOrder.map((_,i)=>`${select('row-'+i)}{grid-column:1!important;grid-row:${i+1}!important}`).join('\n')}
${select('title')},${select('tabs')}{margin:0 24px!important}
${active} #${workspaceId}{display:flex!important;visibility:visible!important;grid-column:1!important;grid-row:${workspaceRow}!important;min-width:0!important;min-height:96px!important;align-self:stretch!important}
@media(max-width:760px){${select('root')}{padding:${Math.max(0,plan.top-plan.rootTop)}px 0 16px!important;gap:12px!important}${select('composer')}{width:min(calc(100% - 18px),${plan.composerWidth}px)!important}${select('title')},${select('tabs')}{margin-inline:9px!important}}
`;
}

export function validateActiveLayout(plan,{workspace,style,styleText,exit,isOwnedSurface=plan?.isOwnedSurface}={}) {
 try {
  const doc=plan.document,win=doc.defaultView;
  if(!isSameNativeRegions(plan)||!style?.isConnected||style.textContent!==styleText||!exit?.matches(':popover-open')||!workspace?.isConnected||workspace.parentElement!==plan.root||!isOwnedSurface(workspace)||hasNativeLayer(doc))return false;
  if(win.getComputedStyle(plan.root).position!==plan.rootPosition)return false;
  const frame=workspace.querySelector('iframe'),board=rect(workspace),form=rect(plan.composer);
  if(!frame||!positive(board)||!positive(form)||board.width<160||board.height<96||board.y<0||board.x<0||board.x+board.width>win.innerWidth+1||board.y+board.height>win.innerHeight+1||form.y+form.height>win.innerHeight+1||overlaps(board,form))return false;
  const retainedBudget={started:win.performance.now(),nodes:0,rectangles:0};
  for(const member of plan.retainedMembers){
   if(!retainedPaint(member,doc,{viewport:true,budget:retainedBudget}))return false;
   if(member.hidden)continue;
   const b=rect(member.node);
   if(overlaps(board,b)||plan.protectedRegions.some(other=>other!==member.node&&!other.contains(member.node)&&!member.node.contains(other)&&win.getComputedStyle(other).visibility==='visible'&&overlaps(b,rect(other))))return false;
  }
  // Re-enumerate current protected controls: native tools may arrive after
  // mount. The baseline identity check above remains mandatory for old nodes.
  const current=new Set(plan.nativeControls.filter(({visible})=>visible).map(({node})=>node));
  let checked=0;
  for(const region of plan.protectedRegions)for(const node of [region,...region.querySelectorAll(controls)]){
   if(isOwnedSurface(node))continue;
   if(++checked>128)return false;
   const s=win.getComputedStyle(node),r=rect(node);
   if(s.display!=='none'&&s.visibility==='visible'&&positive(r))current.add(node);
  }
  for(const node of current){
   const r=rect(node),s=win.getComputedStyle(node);
   if(!positive(r)||s.visibility!=='visible'||s.display==='none'||node.hidden||node.inert||overlaps(board,r))return false;
   // Observed titlebar shells can intentionally pass pointers through. Their
   // bounds still cannot overlap the workspace; actual controls below retain
   // individual hit checks, including controls arriving after mount.
   if(node===plan.header&&s.pointerEvents==='none'&&!node.matches(controls))continue;
   if(r.x<0||r.y<0||r.x+r.width>win.innerWidth+1||r.y+r.height>win.innerHeight+1)return false;
   const hit=doc.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   if(!hit||!(node===hit||node.contains(hit)))return false;
  }
  return true;
 }catch{return false;}
}
