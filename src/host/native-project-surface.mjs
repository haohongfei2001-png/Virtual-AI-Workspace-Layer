import {nativeReturnGapRect} from './native-return-gap.mjs';
import {sidebarPresentationFits,nativeHistoryPresentation} from './native-history-list.mjs';

const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
const finite=r=>Object.values(r).every(Number.isFinite);
const overlap=(a,b)=>a.width>0&&a.height>0&&a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
const px=value=>/^-?\d+(?:\.\d+)?px$/.test(value)?Number.parseFloat(value):NaN;
const noText=node=>![...node.childNodes].some(n=>n.nodeType===3&&n.length>0);
const plain=node=>node?.tagName==='DIV'&&!node.matches('[tabindex],[contenteditable],a,button,input,select,textarea')&&!node.shadowRoot;
// Only pixel-valued ancestor insets and border boxes are supported. Prove a
// conservative interior instead of equating one CSS serialization to safety.
// Percentages, polygons, URLs, elliptical radii and other clips stay rejected.
const shellClipGeometry=(node,value)=>{
 if(value==='border-box'){
  const style=node.ownerDocument.defaultView.getComputedStyle(node);
  const radii=['borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius'].flatMap(key=>style[key].trim().split(/\s+/).map(px));
  if(radii.length<4||radii.length>8||radii.some(n=>!Number.isFinite(n)||n<0||n>128))return null;
  const clip={...box(node),radius:Math.max(...radii)};
  return finite(clip)&&clip.width>2*clip.radius&&clip.height>2*clip.radius?clip:null;
 }
 const match=/^inset\(([^()]+)\)$/.exec(value);if(!match)return null;
 const parts=match[1].split(' round ');if(parts.length>2)return null;
 const lengths=text=>{const values=text.trim().split(/\s+/).map(px);return values.length>=1&&values.length<=4&&values.every(Number.isFinite)?values:null;};
 const insets=lengths(parts[0]),radii=parts[1]?lengths(parts[1]):[0];
 if(!insets||!radii||insets.some(n=>Math.abs(n)>128)||radii.some(n=>n<0||n>128))return null;
 const [top,right=top,bottom=top,left=right]=insets,b=box(node),radius=Math.max(...radii);
 const clip={x:b.x+left,y:b.y+top,width:b.width-left-right,height:b.height-top-bottom,radius};
 return finite(clip)&&clip.width>2*radius&&clip.height>2*radius?clip:null;
};
// The union of the central strips excludes all rounded corners. Using the
// largest radius remains conservative for asymmetric or CSS-normalized radii.
const insideShellClip=(clip,r)=>{const right=clip.x+clip.width,bottom=clip.y+clip.height,d=clip.radius;return finite(r)&&r.x>=clip.x&&r.y>=clip.y&&r.x+r.width<=right&&r.y+r.height<=bottom&&(r.x>=clip.x+d&&r.x+r.width<=right-d||r.y>=clip.y+d&&r.y+r.height<=bottom-d);};

export function projectClipDiagnostic(value){
 if(value===''||value===undefined||value===null)return {projectClip:value===''?'empty':'unavailable'};
 if(['border-box','padding-box','content-box','margin-box','fill-box','stroke-box','view-box'].includes(value))return {projectClip:value};
 const safe=typeof value==='string'&&value.length<=160&&value.startsWith('inset(')&&/^[0-9. %()+*/-]*$/.test(value.replace(/inset|round|calc|px|vw|vh|em/g,''));
 return {projectClip:safe?value:['inset','rect','xywh','circle','ellipse','polygon','path','url','shape'].find(kind=>typeof value==='string'&&value.startsWith(kind+'('))??'other'};
}

export const projectSurfaceFailureReasons=Object.freeze(['profile','history','main','wrappers','tabs-panel','composer-title','rows','hit-root','ancestors','geometry','geometry-effects','geometry-clip-shape','geometry-clip-interior','geometry-overflow','geometry-viewport','geometry-rect','geometry-overlap','return-slot','paint']);

// Project home has the composer ABOVE the conversation panel. This is a
// presentation proof only; route/title/DOM never establish scope or membership.
export function inspectNativeProjectSurface({document,profile,urlPolicy,history,header,slot,button=null,isOwnedMask=()=>false,geometry=true,historyPresentation=null,onFailure=()=>{}}){
 let stage='profile',passed=false,clipShape=null;
 try{
  if(profile.nativeProjectLayout!=='panel-after-composer')return null;
  stage='history';
  historyPresentation??=nativeHistoryPresentation({document,source:history?.closest(profile.regions.history),root:history,urlPolicy,isOwnedMask});

  const win=document.defaultView,style=node=>win.getComputedStyle(node);
  const visible=node=>{
   if(!node?.isConnected||node.ownerDocument!==document||!node.getClientRects().length)return false;
   let depth=0,masked=false;for(let p=node;p;p=p.parentElement){
    if(++depth>64||p.hidden||p.inert||p.getAttribute('aria-hidden')==='true')return false;
    if(isOwnedMask(p))masked=true;
    const s=style(p);if(s.display==='none'||s.visibility==='collapse'||s.visibility==='hidden'&&!masked||s.opacity==='0')return false;
   }return true;
  };
  const unique=(root,selector)=>{const all=root.querySelectorAll(selector);if(all.length>8)return null;const found=[...all].filter(visible);return found.length===1?found[0]:null;};
  stage='main';
  const main=unique(document,profile.projectListBoundary);
  if(!main||main.closest('[contenteditable],dialog,[data-va-owned]')||!plain(main))return null;
  // Locate native semantic regions, not a fixed number of decorative wrappers.
  // Any extra native controls still participate in the geometry/paint proof.
  stage='tabs-panel';
  const reading=unique(main,'[role="tabpanel"]'),tabs=unique(main,'[role="tablist"]');
  if(!reading||reading.tagName!=='DIV'||reading.hasAttribute('contenteditable')||reading.shadowRoot||reading.hasAttribute('tabindex')&&reading.getAttribute('tabindex')!=='0'||!tabs||tabs.tagName!=='DIV'||tabs.hasAttribute('contenteditable')||tabs.shadowRoot||![null,'0','-1'].includes(tabs.getAttribute('tabindex')))return null;
  stage='composer-title';
  const composer=unique(main,'form[data-chatgpt-composer]'),titleControl=unique(main,'h1 > button'),title=titleControl?.parentElement;
  if(!composer||!title||!visible(title)||!visible(tabs)||!visible(reading)||reading.querySelector('form,input,textarea,select,[contenteditable]'))return null;
  stage='wrappers';
  let viewport=reading.parentElement;
  for(let depth=0;viewport&&viewport!==main&&!['auto','scroll'].includes(style(viewport).overflowY);depth++){if(depth>=64)return null;viewport=viewport.parentElement;}
  if(!viewport||viewport===main||!plain(viewport)||!viewport.contains(composer)||!viewport.contains(title)||!viewport.contains(tabs))return null;
  stage='hit-root';
  const hitRoot=main.closest(profile.nativeLayout.returnHitRoot);
  if(!hitRoot||unique(document,profile.nativeLayout.returnHitRoot)!==hitRoot||!visible(viewport))return null;
  // Wrappers up to the hit background are layout only. Siblings (including the
  // native footer) must independently clear the workspace in the walk below.
  stage='ancestors';
  const chain=[];
  for(let p=reading.parentElement;p;p=p.parentElement){
   if(chain.length>=64||!plain(p))return null;
   chain.push(p);if(p===hitRoot)break;
  }
  if(!chain.includes(hitRoot)||!chain.includes(main))return null;
  const protectedRegions=[header,title,composer,tabs];
  const regions={history,header,reading,composer,navigationSlot:slot,readingViewport:viewport,protectedRegions,historyMaskRoots:historyPresentation?.maskRoots??[],preserveNativeSidebar:!sidebarPresentationFits(historyPresentation?.rect),returnHitRoot:hitRoot,proofNodes:[header,reading,composer,title,tabs,...chain]};
  // Controller continuity may compare identities while a native modal blocks
  // hit testing. This result has no presentation rectangles or mount approval.
  if(!geometry){passed=true;return regions;}
  stage='geometry';
  const v=box(viewport),p=box(reading),t=box(tabs),c=box(composer),h=box(header);
  // client dimensions are valid only without a transformed ancestor. Clip
  // containers above this viewport may not silently cut its admitted rectangle.
  const clips=[],provenClipNodes=new Set();let depth=0;for(let n=viewport;n;n=n.parentElement){
   if(++depth>64)return null;const s=style(n),b=box(n);
   stage='geometry-effects';
   if(['transform','translate','rotate','scale','filter','backdropFilter','offsetPath','maskImage'].some(k=>s[k]!=='none')||s.zoom!=='1')return null;
   if(s.clipPath!=='none'){stage='geometry-clip-shape';clipShape=projectClipDiagnostic(s.clipPath);const clip=shellClipGeometry(n,s.clipPath);if(!clip)return null;stage='geometry-clip-interior';if(!insideShellClip(clip,v))return null;clips.push(clip);provenClipNodes.add(n);}
   stage='geometry-overflow';
   if(n!==viewport&&s.display!=='contents'&&(['auto','scroll','hidden','clip'].includes(s.overflowX)&&(v.x<b.x+n.clientLeft||v.x+v.width>b.x+n.clientLeft+n.clientWidth)||['auto','scroll','hidden','clip'].includes(s.overflowY)&&(v.y<b.y+n.clientTop||v.y+v.height>b.y+n.clientTop+n.clientHeight)))return null;
  }
  stage='geometry-viewport';
  const visual=win.visualViewport;if(visual&&(visual.scale!==1||visual.offsetLeft!==0||visual.offsetTop!==0))return null;
  const x=Math.max(0,p.x,v.x+viewport.clientLeft),y=Math.max(0,p.y,v.y+viewport.clientTop,h.y+h.height);
  const right=Math.min(win.innerWidth,p.x+p.width,v.x+viewport.clientLeft+viewport.clientWidth),bottom=Math.min(win.innerHeight,v.y+viewport.clientTop+viewport.clientHeight);
  const readingRect={x,y,width:right-x,height:bottom-y};let sidebarRect=historyPresentation?.rect??null;
  stage='geometry-rect';

  if(![v,p,t,c,h,readingRect].every(finite)||readingRect.width<=0||readingRect.height<=0)return null;
  stage='geometry-overlap';
  if(p.y<t.y+t.height||p.y<c.y+c.height||protectedRegions.some(n=>overlap(box(n),readingRect)))return null;
  if(sidebarRect&&(!finite(sidebarRect)||protectedRegions.some(n=>overlap(box(n),sidebarRect))||overlap(readingRect,sidebarRect)))sidebarRect=null;
  stage='return-slot';
  const returnSlot=nativeReturnGapRect({document,header,slot,hitRoot,button,headerLayout:'transparent-containers',excluded:[history,title,composer,tabs].filter(Boolean),excludedRects:[readingRect]});
  const safeReturn=returnSlot&&!clips.some(n=>!insideShellClip(n,returnSlot))?returnSlot:null;
  // Geometry-only bounded walk: never read draft, row preview or text content.
  // Structural ancestors may surround the area, but must be layout containers.
  // The identified composer body's box shadow is decorative and does not
  // enlarge input/hit targets. Its value is not a page-layout identity.
  stage='paint';
  const ancestors=new Set(chain),walker=document.createTreeWalker(hitRoot,5);let node=hitRoot,count=0,rectangles=0;
  do{
   if(++count>2048)return null;
   const inPanel=node===reading||reading.contains(node),structural=ancestors.has(node);
   const clear=r=>finite(r)&&(!safeReturn||!overlap(r,safeReturn))&&(inPanel||structural||!overlap(r,readingRect));
   if(node.nodeType===1){
    const s=style(node);
    if(node.shadowRoot||node.localName.includes('-')||['transform','translate','rotate','scale','filter','backdropFilter','offsetPath','maskImage'].some(k=>s[k]!=='none')||s.clipPath!=='none'&&!provenClipNodes.has(node)||s.zoom!=='1')return null;
    const decoration=node.tagName==='DIV'&&composer.querySelectorAll('[data-composer-body]').length===1&&composer.querySelector('[data-composer-body]')===node;
    if(s.boxShadow!=='none'&&!decoration||s.textShadow!=='none')return null;
    if(!['none','hidden'].includes(s.outlineStyle)&&s.outlineWidth!=='0px'){
     const n=box(node),outset=Math.max(0,px(s.outlineWidth)+px(s.outlineOffset));
     if(structural||!Number.isFinite(outset)||!clear({x:n.x-outset,y:n.y-outset,width:n.width+2*outset,height:n.height+2*outset}))return null;
    }
    if(structural&&(!plain(node)||node!==main&&node.hasAttribute('role')))return null;
    if(s.display==='none')continue;
    if(!structural&&!clear(box(node)))return null;
    for(const pseudo of ['::before','::after']){
     const ps=win.getComputedStyle(node,pseudo);if(['none','normal'].includes(ps.content))continue;
     // Empty button decorations and a clipped native placeholder can be proven
     // by their actual absolute box, including negative inline hit-area insets.
     const placeholder=node.tagName==='P'&&composer.contains(node)&&node.closest('[contenteditable="true"][role="textbox"]')&&ps.overflowX==='hidden'&&ps.overflowY==='hidden';
     if(structural||ps.content!=='""'&&!placeholder||s.position==='static'||ps.position!=='absolute'||ps.boxSizing!=='border-box'||['transform','translate','rotate','scale','boxShadow','textShadow','filter','backdropFilter','offsetPath','borderImageSource'].some(k=>ps[k]!=='none')||!['none','hidden'].includes(ps.outlineStyle)||ps.zoom!=='1'||['marginLeft','marginTop','marginRight','marginBottom'].some(k=>!Number.isFinite(px(ps[k]))))return null;
     const n=box(node),r={x:n.x+px(s.borderLeftWidth)+px(ps.left)+px(ps.marginLeft),y:n.y+px(s.borderTopWidth)+px(ps.top)+px(ps.marginTop),width:px(ps.width),height:px(ps.height)};
     if(!clear(r))return null;
    }
   }else{
    const range=document.createRange();range.selectNodeContents(node);
    for(const r of range.getClientRects()){if(++rectangles>2048||!clear({x:r.x,y:r.y,width:r.width,height:r.height}))return null;}
   }
  }while(node=walker.nextNode());
  passed=true;return {...regions,readingRect,sidebarRect,returnSlot:safeReturn};
 }catch{return null;}finally{if(!passed)try{onFailure(stage,stage==='geometry-clip-shape'?clipShape:null);}catch{}}
}
