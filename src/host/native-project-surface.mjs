import {nativeReturnGapRect} from './native-return-gap.mjs';

const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
const finite=r=>Object.values(r).every(Number.isFinite);
const overlap=(a,b)=>a.width>0&&a.height>0&&a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
const px=value=>/^-?\d+(?:\.\d+)?px$/.test(value)?Number.parseFloat(value):NaN;
const noText=node=>![...node.childNodes].some(n=>n.nodeType===3&&n.length>0);
const plain=node=>node?.tagName==='DIV'&&!node.matches('[tabindex],[contenteditable],a,button,input,select,textarea')&&!node.shadowRoot;
// Observed composer decoration only: it is not an input, text or hit target.
// All other shadows still require a new presentation proof.
const composerShadow='rgba(0, 0, 0, 0.04) 0px 0px 0px 1px, rgba(0, 0, 0, 0.04) 0px 2px 8px 0px, rgba(0, 0, 0, 0.024) 0px 4px 80px 8px';
const shellClip='inset(0px 0px 0px -16px round 16px)';
// Conservative interior of the observed rounded shell. Either central strip
// excludes every curved corner; do not approximate an arbitrary CSS clip path.
const insideShellClip=(node,r)=>{const b=box(node),right=b.x+b.width,bottom=b.y+b.height;return finite(b)&&finite(r)&&b.width>32&&b.height>32&&r.x>=b.x-16&&r.y>=b.y&&r.x+r.width<=right&&r.y+r.height<=bottom&&(r.x>=b.x&&r.x+r.width<=right-16||r.y>=b.y+16&&r.y+r.height<=bottom-16);};

// Project home has the composer ABOVE the conversation panel. This is a
// presentation proof only; route/title/DOM never establish scope or membership.
export function inspectNativeProjectSurface({document,profile,urlPolicy,history,header,slot,button=null,isOwnedMask=()=>false,geometry=true}){
 try{
  if(profile.nativeProjectLayout!=='panel-after-composer')return null;
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
  const main=unique(document,profile.projectListBoundary);
  if(!main||main.closest('[contenteditable],dialog,[data-va-owned]')||!plain(main)||main.children.length!==1||!noText(main))return null;
  const drop=main.firstElementChild,viewport=drop.firstElementChild,content=viewport?.firstElementChild;
  if(!drop.hasAttribute('data-chatgpt-project-conversation-drop-target')||![drop,viewport,content].every(plain)||drop.children.length!==1||viewport.children.length!==1||content.children.length!==3||![drop,viewport,content].every(noText)||!['auto','scroll'].includes(style(viewport).overflowY))return null;
  const [title,composerBranch,list]=content.children,[tabsBranch,reading]=list.children;
  const tabs=tabsBranch?.getAttribute('role')==='tablist'?tabsBranch:unique(tabsBranch,'[role="tablist"]');
  if(![title,composerBranch,list].every(plain)||tabsBranch!==tabs&&!plain(tabsBranch)||tabs?.tagName!=='DIV'||tabs.hasAttribute('contenteditable')||tabs.shadowRoot||![null,'0','-1'].includes(tabs.getAttribute('tabindex'))||reading?.tagName!=='DIV'||reading.hasAttribute('contenteditable')||reading.shadowRoot||reading.hasAttribute('tabindex')&&reading.getAttribute('tabindex')!=='0'||list.children.length!==2||!noText(list)||reading.getAttribute('role')!=='tabpanel')return null;
  // tabindex is native on the selected panel. Never remove it or mask tabs.
  const composer=unique(composerBranch,'form[data-chatgpt-composer]');
  if(!composer||!unique(title,'h1 > button')||!visible(title)||!visible(tabs)||!visible(reading)||reading.querySelector('form,input,textarea,select,[contenteditable]'))return null;
  const section=reading.firstElementChild,ol=section?.firstElementChild;
  if(reading.children.length!==1||section?.tagName!=='SECTION'||section.children.length!==1||ol?.tagName!=='OL'||![reading,section,ol].every(noText)||[...ol.children].some(n=>n.tagName!=='LI'||urlPolicy?.parse(n.querySelector(':scope > a[href]')?.getAttribute('href')).kind!=='conversation'))return null;
  const hitRoot=main.closest(profile.nativeLayout.returnHitRoot);
  if(!hitRoot||unique(document,profile.nativeLayout.returnHitRoot)!==hitRoot||!visible(viewport))return null;
  // Wrappers up to the hit background are layout only. Siblings (including the
  // native footer) must independently clear the workspace in the walk below.
  const chain=[main,drop,viewport,content,list];
  for(let p=main.parentElement;p;p=p.parentElement){
   if(chain.length>=64||!plain(p)||!noText(p))return null;
   chain.push(p);if(p===hitRoot)break;
  }
  if(!chain.includes(hitRoot))return null;
  const protectedRegions=[header,title,composer,...new Set([tabsBranch,tabs])];
  const regions={history,header,reading,composer,navigationSlot:slot,readingViewport:viewport,protectedRegions,returnHitRoot:hitRoot,proofNodes:[history,header,reading,composer,slot,title,tabsBranch,tabs,composerBranch,...chain]};
  // Controller continuity may compare identities while a native modal blocks
  // hit testing. This result has no presentation rectangles or mount approval.
  if(!geometry)return regions;
  const v=box(viewport),p=box(reading),t=box(tabs),c=box(composer),h=box(header);
  // client dimensions are valid only without a transformed ancestor. Clip
  // containers above this viewport may not silently cut its admitted rectangle.
  const clips=[];let depth=0;for(let n=viewport;n;n=n.parentElement){
   if(++depth>64)return null;const s=style(n),b=box(n);
   if(['transform','translate','rotate','scale','filter','backdropFilter','offsetPath','maskImage'].some(k=>s[k]!=='none')||s.zoom!=='1')return null;
   if(s.clipPath!=='none'){if(!n.matches('main[data-app-shell-main-surface]')||s.clipPath!==shellClip||!insideShellClip(n,v))return null;clips.push(n);}
   if(n!==viewport&&s.display!=='contents'&&(['auto','scroll','hidden','clip'].includes(s.overflowX)&&(v.x<b.x+n.clientLeft||v.x+v.width>b.x+n.clientLeft+n.clientWidth)||['auto','scroll','hidden','clip'].includes(s.overflowY)&&(v.y<b.y+n.clientTop||v.y+v.height>b.y+n.clientTop+n.clientHeight)))return null;
  }
  const visual=win.visualViewport;if(visual&&(visual.scale!==1||visual.offsetLeft!==0||visual.offsetTop!==0))return null;
  const x=Math.max(0,p.x,v.x+viewport.clientLeft),y=Math.max(0,p.y,v.y+viewport.clientTop,h.y+h.height);
  const right=Math.min(win.innerWidth,p.x+p.width,v.x+viewport.clientLeft+viewport.clientWidth),bottom=Math.min(win.innerHeight,v.y+viewport.clientTop+viewport.clientHeight);
  const readingRect={x,y,width:right-x,height:bottom-y},sidebarRect=box(history);
  if(![v,p,t,c,h,readingRect,sidebarRect].every(finite)||readingRect.width<=0||readingRect.height<=0||p.y<t.y+t.height||p.y<c.y+c.height||protectedRegions.some(n=>overlap(box(n),readingRect)||overlap(box(n),sidebarRect))||overlap(readingRect,sidebarRect))return null;
  const returnSlot=nativeReturnGapRect({document,header,slot,hitRoot,button,headerLayout:'transparent-containers',excluded:[history,title,composer,tabs],excludedRects:[readingRect]});
  if(!returnSlot||clips.some(n=>!insideShellClip(n,returnSlot)))return null;
  // Geometry-only bounded walk: never read draft, row preview or text content.
  // Structural ancestors may surround the area, but must be layout containers.
  // The one observed composer shadow is decorative and does not enlarge input
  // or hit targets; all other native content/paint must clear the owned area.
  const ancestors=new Set(chain),walker=document.createTreeWalker(hitRoot,5);let node=hitRoot,count=0,rectangles=0;
  do{
   if(++count>2048)return null;
   const inPanel=node===reading||reading.contains(node),structural=ancestors.has(node);
   const clear=r=>finite(r)&&!overlap(r,returnSlot)&&(inPanel||structural||!overlap(r,readingRect));
   if(node.nodeType===1){
    const s=style(node);
    if(node.shadowRoot||node.localName.includes('-')||['transform','translate','rotate','scale','filter','backdropFilter','offsetPath','clipPath','maskImage'].some(k=>s[k]!=='none')||s.zoom!=='1')return null;
    const decoration=s.boxShadow===composerShadow&&node.tagName==='DIV'&&composer.querySelectorAll('[data-composer-body]').length===1&&composer.querySelector('[data-composer-body]')===node;
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
  return {...regions,readingRect,sidebarRect,returnSlot};
 }catch{return null;}
}
