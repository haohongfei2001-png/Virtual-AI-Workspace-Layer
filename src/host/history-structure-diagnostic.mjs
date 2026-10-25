import {profileElement} from './native-surface-boundary.mjs';

export const HISTORY_DIAGNOSTIC_BATCH='vaiwl-history-structure-20261025-v1';
const marker='data-sidebar-chatgpt-conversation-key';
const tags=['DIV','SPAN','A','BUTTON','UL','OL','LI','STYLE','SCRIPT','OTHER'];
const roles=['list','listitem','group','presentation','none','absent','other'];
const phases=['preparation','mount','connected','other'];
const reasons=['complete','boundary-unavailable','boundary-changed','page-left','capacity','unavailable'];
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const int=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max;
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
