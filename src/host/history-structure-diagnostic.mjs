import {profileElement} from './native-surface-boundary.mjs';

export const HISTORY_DIAGNOSTIC_BATCH='vaiwl-history-structure-20261025-v1';
const marker='data-sidebar-chatgpt-conversation-key';
const tags=['DIV','SPAN','A','BUTTON','UL','OL','LI','STYLE','SCRIPT','OTHER'];
const roles=['list','listitem','group','presentation','none','absent','other'];
const phases=['preparation','mount','connected','other'];
const reasons=['complete','boundary-unavailable','boundary-changed','page-left','capacity','unavailable'];
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const int=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max;
const sidebarTags=['NAV','ASIDE','DIV','SECTION','UL','OL','LI','A','BUTTON','SPAN','H1','H2','H3','SVG','INPUT','TEXTAREA','FORM','MAIN','SCRIPT','STYLE','OTHER'];
const sidebarRoles=['navigation','list','listitem','group','button','link','menu','menuitem','dialog','absent','other'];
const sidebarReasons=['complete','boundary-unavailable','capacity','budget','unavailable'];
// Rows: parent index, sibling position, tag/role enums, presence bits, child
// count, rounded viewport rect, visibility/overflow bits, omitted subtree.
// Presence bits never contain attribute values: conversation marker, sidebar
// section, href, expanded, controls, tabindex, editable, owned.
const sidebarRow=r=>Array.isArray(r)&&r.length===9&&Number.isInteger(r[0])&&r[0]>=-1&&r[0]<256&&int(r[1],65536)&&sidebarTags.includes(r[2])&&sidebarRoles.includes(r[3])&&int(r[4],255)&&int(r[5],65536)&&Array.isArray(r[6])&&r[6].length===4&&r[6].every(n=>Number.isInteger(n)&&Math.abs(n)<=65536)&&int(r[7],31)&&typeof r[8]==='boolean';
export function validSidebarStructure(v){
 return exact(v,['schema','reason','ancestors','rows'])&&v.schema==='sidebar-structure-v1'&&sidebarReasons.includes(v.reason)&&Array.isArray(v.ancestors)&&v.ancestors.length<=8&&v.ancestors.every(r=>sidebarRow(r)&&r[0]===-1&&r[8])&&Array.isArray(v.rows)&&v.rows.length<=256&&v.rows.every((r,i)=>sidebarRow(r)&&(i===0?r[0]===-1:r[0]>=0&&r[0]<i));
}
// The captured navigation has two sibling section branches under a shared
// wrapper. Start there when that exact relation to the existing history target
// holds, so outer shell wrappers cannot consume the diagnostic depth budget.
// This chooses observation scope only; it grants no mask/action capability.
function sidebarSectionBoundary(boundary,history){
 const section=history?.closest('[data-app-action-sidebar-section]');
 if(!section||!boundary.contains(section))return boundary;
 const sectionInSingleBranch=node=>{
  for(let depth=0;node&&depth<4;depth++){
   if(node.matches('[data-app-action-sidebar-section]'))return node;
   if(node.children.length!==1)return null;node=node.firstElementChild;
  }return null;
 };
 let node=section;
 for(let depth=0;node&&node!==boundary&&depth<8;depth++,node=node.parentElement){
  const parent=node.parentElement;if(!parent||!boundary.contains(parent))break;
  if(parent.children.length!==2)continue;
  const sections=[...parent.children].map(sectionInSingleBranch);
  if(sections.includes(section)&&sections.every(Boolean)&&sections[0]!==sections[1])return parent;
 }
 return boundary;
}
/** One snapshot only when the existing private status popup requests layout.
 * No observers, storage, raw attributes, text, URL reads or DOM mutations.
 * This describes a boundary; it NEVER authorizes masking or membership. */
export function readSidebarStructure({document,profile}){
 const report={schema:'sidebar-structure-v1',reason:'boundary-unavailable',ancestors:[],rows:[]};
 try{
  const win=document.defaultView,start=win.performance.now();
  const boundary=profileElement(document,profile,profile.regions.projects);
  if(!boundary||boundary.closest('main,[contenteditable],[data-app-action-timeline-scroll]'))return report;
  const selector=profile.nativeLayout?.historyList??profile.nativeHomeLayout?.historyList;
  const history=selector?profileElement(document,profile,selector):null;
  const root=sidebarSectionBoundary(boundary,history);
  const number=n=>Number.isFinite(n)?Math.max(-65536,Math.min(65536,Math.round(n))):0;
  const fields=(node,parent,position,omit)=>{
   const style=win.getComputedStyle(node),rect=node.getBoundingClientRect(),role=node.getAttribute('role');
   let flags=0;for(const [i,attr]of [marker,'data-app-action-sidebar-section','href','aria-expanded','aria-controls','tabindex','contenteditable'].entries())if(node.hasAttribute(attr))flags|=1<<i;
   if(node.hasAttribute('data-va-owned')||node.hasAttribute('data-vaiwl-owned'))flags|=128;
   const hidden=node.hidden||node.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0';
   const paint=(hidden?1:0)|(!node.getClientRects().length?2:0)|(['hidden','clip','auto','scroll'].includes(style.overflowX)?4:0)|(['hidden','clip','auto','scroll'].includes(style.overflowY)?8:0)|(style.clipPath&&style.clipPath!=='none'?16:0);
   return [parent,Math.min(position,65536),sidebarTags.includes(node.tagName.toUpperCase())?node.tagName.toUpperCase():'OTHER',role===null?'absent':sidebarRoles.includes(role)?role:'other',flags,Math.min(node.children.length,65536),[rect.x,rect.y,rect.width,rect.height].map(number),paint,omit];
  };
  let ancestor=root.parentElement;
  for(;ancestor&&report.ancestors.length<8;ancestor=ancestor.parentElement){report.ancestors.push(fields(ancestor,-1,0,true));if(root!==boundary&&ancestor===boundary){ancestor=null;break;}}
  const stack=[{node:root,parent:-1,position:0,depth:0}];report.reason=ancestor?'capacity':'complete';
  while(stack.length){
   if(report.rows.length>=256){report.reason='capacity';break;}
   if(win.performance.now()-start>25){report.reason='budget';break;}
   const {node,parent,position,depth}=stack.pop();
   const omit=node.matches('svg,input,textarea,main,script,style,iframe,[contenteditable],[data-app-action-timeline-scroll],[data-thread-scroll-footer],[data-va-owned],[data-vaiwl-owned]')||depth>=16;
   const index=report.rows.length;report.rows.push(fields(node,parent,position,omit));
   if(depth>=16&&node.children.length)report.reason='capacity';
   if(omit)continue;
   // Never allocate an unbounded array, even for an unexpected native tree.
   const limit=Math.min(node.children.length,257);
   if(node.children.length>limit)report.reason='capacity';
   for(let i=limit-1;i>=0;i--)stack.push({node:node.children[i],parent:index,position:i,depth:depth+1});
  }
  return report;
 }catch{return {...report,reason:'unavailable'};}
}
const phase=state=>typeof state==='string'&&state.startsWith('layout-')?'preparation':typeof state==='string'&&state.startsWith('surface-')?'mount':['ready','reading','suspended'].includes(state)?'connected':'other';
export function validHistoryStructureReport(v){
 return exact(v,['schema','reason','truncated','events','elapsedMs','snapshots','operations'])&&v.schema==='history-structure-v1'&&reasons.includes(v.reason)&&typeof v.truncated==='boolean'&&int(v.events,256)&&int(v.elapsedMs,60000)&&Array.isArray(v.operations)&&v.operations.length<=64&&v.operations.every(o=>exact(o,['at','kind','target','removed','added'])&&int(o.at,6000)&&['children','marker','role'].includes(o.kind)&&int(o.target,1024)&&[o.removed,o.added].every(a=>Array.isArray(a)&&a.length<=256&&a.every(n=>int(n,1024))))&&Array.isArray(v.snapshots)&&v.snapshots.length<=16&&v.snapshots.every(s=>exact(s,['at','phase','roots','list','listCount','changes','rows'])&&int(s.at,6000)&&phases.includes(s.phase)&&Array.isArray(s.roots)&&s.roots.length===2&&s.roots.every(x=>int(x,1024))&&int(s.list,1024)&&int(s.listCount,33)&&Array.isArray(s.changes)&&s.changes.length===3&&s.changes.every(x=>int(x,256))&&Array.isArray(s.rows)&&s.rows.length<=256&&s.rows.every(r=>Array.isArray(r)&&r.length===5&&int(r[0],1024)&&r[0]>0&&tags.includes(r[1])&&roles.includes(r[2])&&typeof r[3]==='boolean'&&int(r[4],257)));
}

/** Explicit one-shot, navigation-only diagnostic. Node numbers are allocated in
 * this closure, never derived from native IDs. No text, href, marker values,
 * credentials, response bodies, DOM mutation or authority operations. */
export function createHistoryStructureDiagnostic({document,profile,readState,durationMs=6000}){
 let attempt=null;
 return ()=>attempt??=(async()=>{
  const win=document.defaultView,identities=new WeakMap();let next=0,observer,timer,events=0,ended=false;
  const snapshots=[],operations=[],started=win.performance.now(),duration=Math.min(6000,Math.max(1,durationMs));
  const identity=node=>{if(!node)return 0;if(!identities.has(node)){if(next>=1024)throw Error('capacity');identities.set(node,++next);}return identities.get(node);};
  let source=null,root=null,list=null,finish;
  const result=new Promise(resolve=>{finish=(reason,truncated=false)=>{if(ended)return;ended=true;observer?.disconnect();win.clearTimeout(timer);for(const name of ['pagehide','popstate','hashchange'])win.removeEventListener(name,leave);const elapsedMs=Math.min(60000,Math.max(0,Math.floor(win.performance.now()-started)));resolve({schema:'history-structure-v1',reason,truncated,events,elapsedMs,snapshots,operations});};});
  const leave=()=>finish('page-left');
  const finishChecked=(truncated=false)=>{
   try{
    if(document.location.pathname!=='/'||document.location.search!==''||document.location.hash!=='')return finish('page-left',truncated);
    if(!source?.isConnected||!root?.isConnected||profileElement(document,profile,profile.regions.history,{kind:'home'})!==source||profileElement(document,profile,profile.nativeHomeLayout.historyList,{kind:'home'})!==root)return finish('boundary-changed',truncated);
    finish('complete',truncated);
   }catch{finish('unavailable',truncated);}
  };
  const snapshot=changes=>{
   if(ended)return;
   const elapsed=win.performance.now()-started;
   if(!Number.isFinite(elapsed)||elapsed<0)return finish('unavailable');
   if(elapsed>=duration)return finishChecked();
   try{
    if(document.location.pathname!=='/'||document.location.search!==''||document.location.hash!=='')return finish('page-left');
    const currentSource=profileElement(document,profile,profile.regions.history,{kind:'home'}),currentRoot=profileElement(document,profile,profile.nativeHomeLayout.historyList,{kind:'home'});
    if(!currentSource||!currentRoot||!currentSource.contains(currentRoot))return finish('boundary-unavailable');
    if(source&&currentSource!==source)return finish('boundary-changed');
    source=currentSource;root=currentRoot;
    const lists=root.matches('[role="list"]')?[root]:root.querySelectorAll('[role="list"]');
    list=lists.length===1?lists[0]:null;
    const children=list?.children??[];
    if(children.length>256)return finish('capacity',true);
    const rows=[];
    for(const child of children){
     const role=child.getAttribute('role');
     rows.push([identity(child),tags.includes(child.tagName)?child.tagName:'OTHER',role===null?'absent':roles.includes(role)?role:'other',child.hasAttribute(marker),Math.min(257,child.querySelectorAll('['+marker+']').length)]);
    }
    const item={at:Math.min(6000,Math.floor(elapsed)),phase:phase(readState()),roots:[identity(source),identity(root)],list:identity(list),listCount:Math.min(33,lists.length),changes,rows};
    const previous=snapshots.at(-1);
    if(previous&&JSON.stringify({...previous,at:0,changes:null})===JSON.stringify({...item,at:0,changes:null})&&changes.every(n=>n===0))return;
    if(snapshots.length>=16)return finish('capacity',true);
    snapshots.push(item);
   }catch{return finish('unavailable');}
  };
  snapshot([0,0,0]);
  if(!ended){
   observer=new win.MutationObserver(records=>{
    if(win.performance.now()-started>=duration){finishChecked(records.length>0);return;}
    // Attribute values/old values and characterData are never requested/read.
    const changes=[0,0,0];
    for(const record of records){
     if(!(record.target===source||record.target===root||root.contains(record.target)||record.target.contains?.(root)||[...record.removedNodes??[]].some(n=>n===root||n.contains?.(root))))continue;
     if(++events>256){events=256;finish('capacity',true);return;}
     if(record.type==='childList')changes[0]++;else if(record.attributeName===marker)changes[1]++;else changes[2]++;
     // MutationRecord order is retained even when several operations occur in
     // one callback. Only direct row operations; no subtree text or values.
     if(record.target===list||record.target.parentElement===list){
      if(operations.length>=64||record.addedNodes.length>256||record.removedNodes.length>256){finish('capacity',true);return;}
      try{operations.push({at:Math.min(6000,Math.floor(win.performance.now()-started)),kind:record.type==='childList'?'children':record.attributeName===marker?'marker':'role',target:identity(record.target),removed:[...record.removedNodes].map(identity),added:[...record.addedNodes].map(identity)});}catch{finish('capacity',true);return;}
     }
    }
    if(changes.some(Boolean))snapshot(changes);
   });
   observer.observe(source,{subtree:true,childList:true,attributes:true,attributeFilter:[marker,'role']});
   for(const name of ['pagehide','popstate','hashchange'])win.addEventListener(name,leave);
   timer=win.setTimeout(()=>finishChecked(),duration);
  }
  return result;
 })();
}

/** Private extension popup only. Durable spend precedes dispatch, including
 * unknown outcomes. Web Locks serialize multiple popup instances. */
export async function runHistoryDiagnosticOnce({chrome,locks}){
 if(!locks?.request)return {state:'unavailable'};
 return locks.request(HISTORY_DIAGNOSTIC_BATCH,async()=>{
  const old=(await chrome.storage.local.get(HISTORY_DIAGNOSTIC_BATCH))[HISTORY_DIAGNOSTIC_BATCH];
  if(old!==undefined)return {state:'spent',report:validHistoryStructureReport(old?.report)?old.report:null};
  const rows=await chrome.tabs.query({active:true,currentWindow:true});
  if(!Array.isArray(rows)||rows.length!==1||!Number.isSafeInteger(rows[0]?.id)||rows[0].id<0||rows[0].incognito!==false)return {state:'unavailable'};
  await chrome.storage.local.set({[HISTORY_DIAGNOSTIC_BATCH]:{spent:true}});
  let timer;
  try{
   const reply=await Promise.race([chrome.tabs.sendMessage(rows[0].id,{v:1,type:'HOST_LOCAL_HISTORY_STRUCTURE'},{frameId:0}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),7500);})]);
   const report=exact(reply,['v','report'])&&reply.v===1&&validHistoryStructureReport(reply.report)?reply.report:null;
   if(report)await chrome.storage.local.set({[HISTORY_DIAGNOSTIC_BATCH]:{spent:true,report}});
   return {state:report?'complete':'outcome-unknown',report};
  }catch{return {state:'outcome-unknown',report:null};}finally{clearTimeout(timer);}
 });
}
