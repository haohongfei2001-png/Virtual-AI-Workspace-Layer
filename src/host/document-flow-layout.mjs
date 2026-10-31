import {hasNativeLayer,NATIVE_LAYER_SELECTOR} from './native-layer.mjs';
import {isEmptyViewportMarker,isNativeScrollRegion} from './native-return-gap.mjs';
import {nativeFlowFailureReasons,snapshotMainMountCheck} from './native-flow-diagnostic.mjs';
export {nativeFlowFailureReasons} from './native-flow-diagnostic.mjs';
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
const shadowHostTags=new Set(['ARTICLE','ASIDE','BLOCKQUOTE','DIV','FOOTER','H1','H2','H3','H4','H5','H6','HEADER','MAIN','NAV','P','SECTION','SPAN']);
// The observed viewport contract permits empty native markers. Only an
// already display:none marker is inert to grid layout: a visible zero-size
// element can create a new track/gap. Never style or relocate these nodes.
const inactiveMarker=(node,viewport,doc)=>isEmptyViewportMarker(node,viewport,doc)&&doc.defaultView.getComputedStyle(node).display==='none';

// Fixed refusal classes from the existing proof, never native values or text.
// Only this pre-mutation error may keep the initial layout watcher alive;
// arbitrary mount errors (including marker collisions) remain terminal.
export class NativeFlowPreflightError extends Error {
 constructor(reason){super(nativeFlowFailureReasons.includes(reason)?reason:'native-flow-check-failed');this.name='NativeFlowPreflightError';}
}

// Unknown native branches remain opaque. VAIWL owns only their placement as
// existing flow members, never their descendant identities, paint or controls.
// Actual controls are measured from the current DOM at layout/gesture time.
function retainedBoundary(member,doc,{viewport=false}={}){
 const node=member.node,win=doc.defaultView,s=win.getComputedStyle(node),box=rect(node);
 if(!node.isConnected||node.ownerDocument!==doc||(s.display==='none')!==member.hidden)return false;
 if(member.hidden)return true;
 // A selected native empty marker may occupy a real zero-height flow row
 // while already visibility:hidden. Keep that row/order (including its gap),
 // never treat it as display:none or change the native visibility. Its narrow
 // empty-marker contract must still hold on every active geometry check.
 const hiddenMarker=!!member.hiddenMarkerViewport;
 if(hiddenMarker&&(!isEmptyViewportMarker(node,member.hiddenMarkerViewport,doc)||s.visibility!=='hidden'||box.height!==0))return false;
 // Browser-maintained scroll extents expose actual overflowing text/content
 // without inspecting its nodes or imposing new clipping on the native tree.
 // Shadows do not change these extents. Existing native overflow clips remain
 // native-owned and may contain larger scrollable content.
 const tolerance=box.height===0?0:1;
 if(s.overflowX==='visible'&&node.scrollWidth>node.clientWidth+1||s.overflowY==='visible'&&node.scrollHeight>node.clientHeight+tolerance)return false;
 return Object.values(box).every(Number.isFinite)&&box.width>0&&box.height>=0&&
  ['static','relative'].includes(s.position)&&s.cssFloat==='none'&&(s.visibility==='visible'||hiddenMarker)&&
  (!viewport||box.x>=0&&box.y>=0&&box.x+box.width<=win.innerWidth+1&&box.y+box.height<=win.innerHeight+1);
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

// A closed-layout geometry snapshot, not an active native-control identity
// lock. Controls are freshly enumerated before presentation and native gestures.
function nativeInvisibleControl(node,style,protectedRegions){
 return !protectedRegions.includes(node)&&style.opacity==='0'&&style.pointerEvents==='none'&&node.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})===false;
}
const controlRegions=(node,regions)=>regions.filter(region=>region===node||region.contains(node));
const sameControlRegions=(before,after)=>Array.isArray(before)&&before.length===after.length&&before.every((region,i)=>region===after[i]);
function controlSnapshot({protectedRegions,document:doc,isOwnedSurface}) {
 const result=[],seen=new Set(),shadowCandidates=[],structuralSeen=new Set();
 // Light-tree structure only, once per layout proof. A previously ordinary
 // DIV can gain an open shadow root without a Mutation/Resize notification.
 // Cache potential hosts so the activity check only reads bounded references;
 // it never walks descendants or reads their text/paint on animation frames.
 const pending=[...protectedRegions];
 while(pending.length){
  const node=pending.pop();if(structuralSeen.has(node)||isOwnedSurface(node))continue;
  structuralSeen.add(node);if(structuralSeen.size>4096)return null;
  if(node.shadowRoot||node.localName?.includes('-'))return null;
  if(shadowHostTags.has(node.tagName))shadowCandidates.push(node);
  if(node.children.length+pending.length>4096)return null;
  for(const child of node.children)pending.push(child);
 }
 for(const region of protectedRegions)for(const node of [region,...region.querySelectorAll(controls)]){
  if(seen.has(node)||isOwnedSurface(node))continue;
  seen.add(node);if(result.length>=128)return null;
  const style=doc.defaultView.getComputedStyle(node);
  const nativeInvisible=nativeInvisibleControl(node,style,protectedRegions);
  result.push({node,parent:node.parentElement,regions:controlRegions(node,protectedRegions),nativeInvisible,visible:!nativeInvisible&&style.display!=='none'&&style.visibility==='visible'&&positive(rect(node)),diagnosticPainted:node.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})===true,diagnosticPointerNone:style.pointerEvents==='none',diagnosticOpacityZero:style.opacity==='0'});
 }
 result.shadowCandidates=shadowCandidates;return result;
}

// These native layout coordinates supply the conditional flow rules/baseline.
// Read them only in the restored native layout, never by disabling live CSS.
const layoutCoordinates = ({root,header,composer,headerInside,nativeControls=[]}) => {
 const box=rect(root),head=rect(header),form=rect(composer);
 if(!positive(box)||!positive(head)||!positive(form))return null;
 // Keep native controls that protrude above their composer in its flow track.
 // Only already enumerated visible descendants participate; the active hit and
 // viewport proof still decides whether the resulting layout is safe.
 let composerClearance=0;
 for(const {node,visible} of nativeControls)if(visible&&composer.contains(node)){
  const control=rect(node);if(!positive(control))return null;
  composerClearance=Math.max(composerClearance,Math.ceil(form.y-control.y));
 }
 if(!Number.isFinite(composerClearance)||composerClearance>root.ownerDocument.defaultView.innerHeight)return null;
 return {composerClearance,composerWidth:form.width,top:Math.max(0,headerInside?box.y:head.y+head.height,box.y),rootTop:box.y,rootLeft:box.x,rootPosition:root.ownerDocument.defaultView.getComputedStyle(root).position};
};

export function isSameNativeLayout(plan) {
 try {
  const current=controlSnapshot(plan);
  const next=current&&layoutCoordinates({...plan,nativeControls:current});
  return !!next&&Object.keys(next).every(key=>next[key]===plan[key])&&!!current&&current.length===plan.nativeControls.length&&current.every((value,i)=>value.node===plan.nativeControls[i].node&&value.parent===plan.nativeControls[i].parent&&sameControlRegions(plan.nativeControls[i].regions,value.regions)&&value.visible===plan.nativeControls[i].visible&&value.nativeInvisible===plan.nativeControls[i].nativeInvisible);
 }catch{return false;}
}

export function captureNativeBaseline({document:doc,inspection,isOwnedSurface=()=>false,onRefused=()=>{},onDiagnostic=null}={}) {
 const evidence={kind:'unknown',phase:'inspection',detail:'inspection',node:null,root:null,visited:0};
 const diagnose=reason=>{if(typeof onDiagnostic==='function')try{onDiagnostic(snapshotMainMountCheck({document:doc,inspection,reason,...evidence}));}catch{}};
 const refuse=(reason,detail=evidence.detail,node=evidence.node)=>{evidence.detail=detail;evidence.node=node;try{onRefused(reason);}catch{}diagnose(reason);return null;};
 try {
  if (!inspection?.ok) return refuse('native-flow-inspection');
  evidence.phase='regions';
  const {reading,header}=inspection,nativeComposer=inspection.composer,win=doc.defaultView;
  const composer=inspection.flowSeam?.version==='native-flow-seam-v1'?(inspection.flowSeam.composerMember??nativeComposer):nativeComposer;
  const nativeComposerChain=[],externalSeam=(inspection.flowSeam?.externalSeam??[]).map(value=>({...value,attrs:attrs(value.node)}));
  if(externalSeam.length>2||!sameExternalSeam({externalSeam,document:doc,isOwnedSurface}))return refuse('native-flow-root','wrapper-seam');
  if(composer!==nativeComposer){
   if(!plain(composer)||!composer.contains(nativeComposer)||composer.contains(reading)||nativeComposer.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})!==true||!retainedBoundary({node:composer,hidden:false},doc))return refuse('native-flow-regions','invalid-regions',composer);
   for(let n=nativeComposer;n!==composer;n=n.parentElement){if(!n||nativeComposerChain.length>=64)return refuse('native-flow-regions','invalid-regions',composer);nativeComposerChain.push({node:n,parent:n.parentElement});}
  }
  if (![reading,composer,header].every(n=>n?.isConnected&&n.ownerDocument===doc) || reading.contains(composer) || composer.contains(reading)) return refuse('native-flow-regions','invalid-regions');
  const protectedNodes=[...new Set([composer,...inspection.protectedRegions.filter(n=>n!==header).map(n=>n===nativeComposer?composer:n.tagName==='H1'&&plain(n.parentElement)&&!n.parentElement.contains(composer)&&!n.parentElement.contains(reading)?n.parentElement:n)])];
  const leaves=[reading,...protectedNodes];
  evidence.kind=protectedNodes.some(n=>n.getAttribute('role')==='tablist')?'project':inspection.homeLayoutNodes?'home':'conversation';evidence.phase='root';
  let root=inspection.readingViewport??reading.parentElement;
  while(root && (!leaves.every(n=>root.contains(n))||!positive(rect(root))))root=root.parentElement;
  // Only the explicit viewport may retain this native tab stop. It remains
  // the grid's real root box; nested focusable nodes are never flattened.
  const focusViewport=root===inspection.readingViewport&&isNativeScrollRegion(root,inspection.viewportFocus,doc)?root:null;
  evidence.root=root;evidence.node=root;
  if(!root||root===doc.body||root===doc.documentElement||!plain(root)&&!focusViewport)return refuse('native-flow-root',root?'root-unsupported':'root-unavailable',root);
  if(root!==inspection.readingViewport&&!(inspection.flowSeam?.version==='native-flow-seam-v1'&&inspection.flowSeam.roots?.includes(root)))return refuse('native-flow-root','wrapper-seam',root);
  evidence.phase='header';
  const headerInside=root.contains(header);
  if(headerInside){if(header.contains(reading)||header.contains(composer)||reading.contains(header)||composer.contains(header))return refuse('native-flow-header','header-overlap',header);protectedNodes.unshift(header);leaves.push(header);}
  const kind=protectedNodes.some(n=>n.getAttribute('role')==='tablist')?'project':inspection.homeLayoutNodes?'home':'conversation';evidence.kind=kind;evidence.phase='walk';
  const leafSet=new Set(leaves),shells=[],patchedShells=[],nativeContents=[],records=[],nativeChildren=new Map(),inactiveMarkers=[],retainedMembers=[];let count=0,failure=null;
  const declaredShells=new Set(inspection.flowSeam?.version==='native-flow-seam-v1'?inspection.flowSeam.shells:[]);
  const markerViewport=inspection.viewportMarkers==='empty-div-v1'?inspection.readingViewport:null;
  const isMarker=node=>!!markerViewport&&inactiveMarker(node,markerViewport,doc);
  const reject=(reason,detail,node,phase='walk')=>{if(!failure){failure=reason;Object.assign(evidence,{phase,detail,node});}return false;};
  function retain(node){
   const member={node,parent:node.parentElement,hidden:win.getComputedStyle(node).display==='none'};
   if(markerViewport&&win.getComputedStyle(node).visibility==='hidden'&&isEmptyViewportMarker(node,markerViewport,doc))member.hiddenMarkerViewport=markerViewport;
   if(!retainedBoundary(member,doc))return reject('native-flow-branch-paint','retained-box',node,'retained-paint');
   retainedMembers.push(member);return true;
  }
  function walk(node){
   if(++count>128)return reject('native-flow-capacity','node-capacity',node);
   if(!node.isConnected||node.ownerDocument!==doc)return reject('native-flow-regions','detached',node);
   if(leafSet.has(node)){records.push({node,parent:node.parentElement,attrs:attrs(node)});return true;}
   if(isMarker(node)){records.push({node,parent:node.parentElement,attrs:attrs(node)});inactiveMarkers.push(node);return true;}
   // A branch outside the landmark corridors owns its internal native layout.
   if(!leaves.some(leaf=>node.contains(leaf)))return retain(node);
   // Layout wrappers only. Unknown controls/text/branches cannot disappear
   // through display:contents, even if they happen to have no visible text.
   if(node!==focusViewport&&(!plain(node)||node.hasAttribute('role')&&node.getAttribute('role')!=='main'))return reject('native-flow-wrapper-control','wrapper-control',node);
   if([...node.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return reject('native-flow-wrapper-text','wrapper-text',node);
   const style=win.getComputedStyle(node);
   // A tag name alone is not a licence to remove a native layout box. Root
   // ownership is explicit; intermediate overrides require the package seam.
   if(node!==root&&style.display!=='contents'&&!declaredShells.has(node))return reject('native-flow-wrapper-paint','wrapper-seam',node);
   if(node!==root&&style.display==='contents')nativeContents.push(node);
   else if(node!==root)patchedShells.push(node);
   records.push({node,parent:node.parentElement,attrs:attrs(node)});
   if(style.display==='none'||style.visibility!=='visible'||style.opacity!=='1'||style.zoom!=='1')return reject('native-flow-wrapper-paint','wrapper-visibility',node);
   if(['transform','translate','rotate','scale','filter','backdropFilter','clipPath','maskImage'].some(k=>style[k]!=='none')||node!==root&&(style.contain!=='none'||style.scrollSnapType!=='none'||['auto','scroll'].includes(style.overflowX)||['auto','scroll'].includes(style.overflowY)))return reject('native-flow-wrapper-paint','wrapper-effect',node);
   if(['::before','::after'].some(p=>!['none','normal'].includes(win.getComputedStyle(node,p).content)))return reject('native-flow-wrapper-paint','wrapper-pseudo',node);
   const children=[...node.children].filter(n=>!isOwnedSurface(n));
   if(!children.length)return reject('native-flow-uncovered-branch','empty-wrapper',node);
   nativeChildren.set(node,children);shells.push(node);return children.every(walk);
  }
  const walked=walk(root);evidence.visited=count;
  if(!walked)return refuse(failure??'native-flow-uncovered-branch');
  const missing=leaves.find(n=>!records.some(r=>r.node===n));if(missing)return refuse('native-flow-uncovered-branch','leaf-uncovered',missing);
  if(composer!==nativeComposer)records.push({node:nativeComposer,parent:nativeComposer.parentElement,attrs:attrs(nativeComposer)});
  // Headers outside the flow root are never laid out by us, but remain part
  // of the native identity and occlusion proof. React may replace them alone.
  if(!headerInside)records.push({node:header,parent:header.parentElement,attrs:attrs(header)});
  const flowOrder=orderedFlowMembers([...(headerInside?[header]:[]),...protectedNodes.filter(n=>n!==header&&n!==composer),reading,composer],retainedMembers);
  evidence.phase='order';if(!flowOrder)return refuse('native-flow-branch-order','order',root);
  const protectedRegions=[...new Set([header,...protectedNodes,nativeComposer,...retainedMembers.map(m=>m.node)])];
  const nativeControls=controlSnapshot({protectedRegions,document:doc,isOwnedSurface});
  evidence.phase='controls';if(!nativeControls)return refuse('native-flow-protected-controls','protected-controls',root);
  const coordinates=layoutCoordinates({root,header,composer,headerInside,nativeControls});
  evidence.phase='geometry';if(!coordinates)return refuse('native-flow-geometry','geometry',root);
  const readingChain=[];for(let node=reading;node&&node!==doc.documentElement;node=node.parentElement){if(readingChain.length>=64)return refuse('native-flow-regions','reading-chain',node);readingChain.push({node,parent:node.parentElement});}
  evidence.phase='complete';evidence.detail='accepted';evidence.node=null;diagnose('none');
  return Object.freeze({kind,root,reading,composer,nativeComposer,nativeComposerChain,externalSeam,header,leaves,protectedNodes,protectedRegions,shells,patchedShells,nativeContents,records,nativeChildren,nativeControls,nativeShadowCandidates:nativeControls.shadowCandidates,inactiveMarkers,retainedMembers,flowOrder,markerViewport,focusViewport,readingChain,nativeReadingCurrent:inspection.nativeReadingCurrent,
   headerInside,document:doc,url:doc.location.href,regionEpoch:inspection.regionEpoch,isOwnedSurface,
   ...coordinates});
 }catch{evidence.phase='exception';return refuse('native-flow-check-failed','exception',null);}
}

// Structural guard for a new proof in the restored native layout. This alone
// cannot authorize presentation: controls still need a fresh bounded snapshot.
function sameExternalSeam(plan){
 return plan.externalSeam.every(({node,parent,child,contents,attrs:before})=>{
  if(!node.isConnected||node.ownerDocument!==plan.document||node.parentElement!==parent||node.children.length>16||!attrs(node).every((value,i)=>value===before[i]))return false;
  const children=[...node.children].filter(n=>!plan.isOwnedSurface(n));
  return children.length===1&&children[0]===child&&(!contents||plan.document.defaultView.getComputedStyle(node).display==='contents');
 });
}
export function isSameNativeStructure(plan,{allowPresentationChange=false,anchorsOnly=false}={}){
 try {
  if(!plan||plan.document.location.href!==plan.url||!sameExternalSeam(plan))return false;
  const anchors=plan.nativeComposerChain.every(({node,parent})=>node.isConnected&&node.ownerDocument===plan.document&&node.parentElement===parent)&&plan.records.every(({node,parent,attrs:before})=>node.isConnected&&node.ownerDocument===plan.document&&node.parentElement===parent&&attrs(node).every((value,i)=>allowPresentationChange&&i<2||value===before[i]))&&
   plan.nativeContents.every(node=>plan.document.defaultView.getComputedStyle(node).display==='contents')&&
   (!plan.focusViewport||isNativeScrollRegion(plan.focusViewport,'native-scroll-region',plan.document));
  if(!anchors||anchorsOnly)return anchors;
  return [...plan.nativeChildren].every(([node,children])=>{const actual=[...node.children].filter(n=>!plan.isOwnedSurface(n));return actual.length===children.length&&actual.every((n,i)=>n===children[i]);})&&
   plan.inactiveMarkers.every(node=>inactiveMarker(node,plan.markerViewport,plan.document))&&
   plan.retainedMembers.every(m=>m.node.isConnected&&m.node.ownerDocument===plan.document&&m.node.parentElement===m.parent&&(plan.document.defaultView.getComputedStyle(m.node).display==='none')===m.hidden);
 }catch{return false;}
}

export function isSameNativeRegions(plan,options){
 return isSameNativeStructure(plan,options);
}

// Presentation rollback can restore only the original nodes/route. It neither
// reads new native content nor needs a still-live data grant during revocation.
export function isNativeReadingIdentityCurrent(plan){
 try{return plan.document.location.href===plan.url&&plan.readingChain.every(({node,parent})=>node.isConnected&&node.ownerDocument===plan.document&&node.parentElement===parent);}catch{return false;}
}

// Native reading additionally requires a fresh adapter source proof and actual
// visibility. Opaque island mutations cannot authorize a different source.
export function isNativeReadingCurrent(plan){
 try{
  const doc=plan.document;
  if(!isNativeReadingIdentityCurrent(plan)||hasNativeLayer(doc)||!isSameNativeStructure(plan,{allowPresentationChange:true})||
    typeof plan.nativeReadingCurrent!=='function'||plan.nativeReadingCurrent()!==true)return false;
  for(const {node} of plan.readingChain){const s=doc.defaultView.getComputedStyle(node);if(node.hidden||node.inert||node.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility!=='visible')return false;}
  return true;
 }catch{return false;}
}

// A native gesture can be admitted only for this currently connected concrete
// target in a protected region. This creates no native-action handle or grant.
export function isNativeControlCurrent(plan,node){
 try{
  const doc=plan.document;if(!node?.isConnected||node.ownerDocument!==doc||plan.isOwnedSurface(node)||!plan.protectedRegions.some(region=>region===node||region.contains(node))||!node.matches(controls))return false;
  if(node.closest('[inert],[hidden],[aria-hidden="true"]'))return false;
  const s=doc.defaultView.getComputedStyle(node),r=rect(node);if(s.display==='none'||s.visibility!=='visible'||!positive(r))return false;
  const hit=doc.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&(hit===node||node.contains(hit));
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
${select('composer')}{grid-column:1!important;grid-row:${composerRow}!important;position:relative!important;inset:auto!important;transform:none!important;align-self:end!important;justify-self:center!important;width:min(calc(100% - 48px),${plan.composerWidth}px)!important;max-width:100%!important;margin:${plan.composerClearance}px 0 0!important}
${plan.flowOrder.map((_,i)=>`${select('row-'+i)}{grid-column:1!important;grid-row:${i+1}!important}`).join('\n')}
${select('title')},${select('tabs')}{margin:0 24px!important}
${active} #${workspaceId}{display:flex!important;visibility:visible!important;grid-column:1!important;grid-row:${workspaceRow}!important;min-width:0!important;min-height:96px!important;align-self:stretch!important}
@media(max-width:760px){${select('root')}{padding:${Math.max(0,plan.top-plan.rootTop)}px 0 16px!important;gap:12px!important}${select('composer')}{width:min(calc(100% - 18px),${plan.composerWidth}px)!important}${select('title')},${select('tabs')}{margin-inline:9px!important}}
`;
}

// Finite geometry/hit checks for already enumerated native controls. No DOM
// descendant walk, text ranges, paint/style whitelist or elapsed-time budget.
// A CSSOM rule can move an existing control without Mutation/Resize events.
export function validateCriticalLayout(plan,{workspace,nativeControls=[],nativeShadowCandidates=plan?.nativeShadowCandidates??[],onRefused=()=>{}}={}){
 const refuse=(reason,geometry=[])=>{try{onRefused(reason,geometry);}catch{}return false;};
 try{
  const doc=plan.document,win=doc.defaultView;
  if(!workspace?.isConnected||workspace.parentElement!==plan.root||!plan.composer.isConnected||!plan.header.isConnected||nativeControls.length>128)return refuse('structure');
  if(!sameExternalSeam(plan)||!plan.nativeComposerChain.every(({node,parent})=>node.isConnected&&node.ownerDocument===doc&&node.parentElement===parent))return refuse('external-seam');
  if(nativeShadowCandidates.length>4096||nativeShadowCandidates.some(node=>node.isConnected&&node.shadowRoot))return refuse('shadow-root');
  if(win.getComputedStyle(plan.root).position!==plan.rootPosition)return refuse('root-position');
  const board=rect(workspace),form=rect(plan.composer);
  if(!positive(board)||!positive(form))return refuse('workspace-composer-empty');
  if(board.width<160||board.height<96)return refuse('workspace-minimum');
  if(board.y<0||board.x<0||board.x+board.width>win.innerWidth+1||board.y+board.height>win.innerHeight+1)return refuse('workspace-viewport');
  if(form.y+form.height>win.innerHeight+1)return refuse('composer-viewport');
  if(overlaps(board,form))return refuse('workspace-composer-overlap');
  if(plan.composer!==plan.nativeComposer){
   const native=rect(plan.nativeComposer),s=win.getComputedStyle(plan.nativeComposer);
   if(!positive(native)||plan.nativeComposer.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})!==true||s.display==='none'||s.visibility!=='visible'||overlaps(board,native)||native.x<0||native.y<0||native.x+native.width>win.innerWidth+1||native.y+native.height>win.innerHeight+1)return refuse('native-composer-geometry');
  }
  for(const member of plan.retainedMembers){
   if(!retainedBoundary(member,doc,{viewport:true}))return refuse('retained-boundary');
   if(member.hidden)continue;
   const b=rect(member.node);
   if(overlaps(board,b)||plan.protectedRegions.some(other=>other!==member.node&&!other.contains(member.node)&&!member.node.contains(other)&&win.getComputedStyle(other).visibility==='visible'&&overlaps(b,rect(other))))return refuse('retained-overlap');
  }
  for(const node of nativeControls){
   // A detached old button is not a reason to revoke the workspace. Mutation
   // reconciliation supplies the replacement set; old action handles stay old.
   if(!node.isConnected||node.ownerDocument!==doc||!plan.protectedRegions.some(region=>region===node||region.contains(node)))continue;
   const r=rect(node),s=win.getComputedStyle(node);
   if(s.display==='none'||s.visibility!=='visible'||!positive(r))continue;
   // Only the original closed-native snapshot can establish this exception.
   // Keep the node in enumeration so becoming visible or changing identity or
   // parent immediately returns to the full native-control protection below.
   if(plan.nativeControls?.some(item=>item.node===node&&item.parent===node.parentElement&&item.nativeInvisible===true&&sameControlRegions(item.regions,controlRegions(node,plan.protectedRegions)))&&nativeInvisibleControl(node,s,plan.protectedRegions))continue;
   if(node.hidden||node.inert||overlaps(board,r))return refuse('control-overlap',[board.x,board.y,board.width,board.height,r.x,r.y,r.width,r.height,node===plan.header?1:plan.composer.contains(node)?2:3,node.hidden?1:0,node.inert?1:0].map(Math.round));
   if(node===plan.header&&s.pointerEvents==='none'&&!node.matches(controls))continue;
   if(r.x<0||r.y<0||r.x+r.width>win.innerWidth+1||r.y+r.height>win.innerHeight+1)return refuse('control-viewport');
   const hit=doc.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   if(!hit||!(node===hit||node.contains(hit))){
    // Same failed hit, before native layout restoration. Fixed numeric geometry
    // and classifications only: no native text, attribute values or identity.
    const h=hit?rect(hit):{x:0,y:0,width:0,height:0},hs=hit?win.getComputedStyle(hit):null;
    const region=node===plan.header?1:plan.header.contains(node)?2:node===plan.composer?3:plan.composer.contains(node)?4:5;
    const hitRegion=!hit?0:workspace===hit||workspace.contains(hit)?1:hit===plan.header?2:plan.header.contains(hit)?3:hit===plan.composer?4:plan.composer.contains(hit)?5:hit===plan.reading||plan.reading?.contains(hit)?6:7;
    const baseline=plan.nativeControls?.find(item=>item.node===node);
    const flags=(s.pointerEvents==='none'?1:0)|(node.matches(controls)?2:0)|(hit?.contains(node)?4:0)|(hs?.pointerEvents==='none'?8:0)|(s.position==='fixed'?16:0)|(s.position==='absolute'?32:0)|(hs?.position==='fixed'?64:0)|(hs?.position==='absolute'?128:0)|(node.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})===false?256:0)|(node.disabled===true?512:0)|(node.getAttribute('aria-disabled')==='true'?1024:0)|(s.opacity==='0'?2048:0)|(baseline?4096:0)|(baseline?.diagnosticPainted?8192:0)|(baseline?.diagnosticPointerNone?16384:0)|(baseline?.diagnosticOpacityZero?32768:0);
    return refuse('control-hit',[r.x,r.y,r.width,r.height,h.x,h.y,h.width,h.height,region,hitRegion,flags].map(Math.round));
   }
  }
  const exitButton=workspace.querySelector(':scope > button');
  if(exitButton&&win.getComputedStyle(workspace).visibility==='visible'){const r=rect(exitButton),hit=doc.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!positive(r)||!(hit===exitButton||exitButton.contains(hit)))return refuse('exit-hit');}
  return true;
 }catch{return refuse('exception');}
}

export function validateActiveLayout(plan,{workspace,style,styleText,exit,isOwnedSurface=plan?.isOwnedSurface,onControls=()=>{},onRefused=()=>{}}={}) {
 const refuse=(reason,geometry=[])=>{try{onRefused(reason,geometry);}catch{}return false;};
 try {
  const doc=plan.document;
  if(!isSameNativeRegions(plan)||!style?.isConnected||style.textContent!==styleText||!exit?.matches(':popover-open')||!workspace?.isConnected||workspace.parentElement!==plan.root||!isOwnedSurface(workspace)||hasNativeLayer(doc)||!workspace.querySelector('iframe'))return refuse('active-structure');
  // Only a layout event or explicit presentation request enumerates controls.
  // The activity watch uses this bounded set; it does not scan native subtrees.
  const snapshot=controlSnapshot(plan);if(!snapshot)return refuse('control-snapshot');
  const nativeControls=snapshot.map(({node})=>node),nativeShadowCandidates=snapshot.shadowCandidates;onControls(nativeControls,nativeShadowCandidates);
  return validateCriticalLayout(plan,{workspace,nativeControls,nativeShadowCandidates,onRefused});
 }catch{return refuse('exception');}
}

export const activeLayoutFailureReasons=Object.freeze(['structure','external-seam','shadow-root','root-position','workspace-composer-empty','workspace-minimum','workspace-viewport','composer-viewport','workspace-composer-overlap','native-composer-geometry','retained-boundary','retained-overlap','control-overlap','control-viewport','control-hit','exit-hit','exception','active-structure','control-snapshot','native-layer','native-regions','surface-integrity']);
