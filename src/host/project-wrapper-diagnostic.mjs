import {validMainMountCheck} from './native-flow-diagnostic.mjs';

// This batch has no relationship to either spent home or Mac Project batch.
export const PROJECT_WRAPPER_DIAGNOSTIC_BATCH='vaiwl-project-first-wrapper-refusal-20261102-v1';
export const WRAPPER_DETAILS=Object.freeze(['wrapper-seam','wrapper-visibility','wrapper-effect','wrapper-pseudo']);
const exact=(v,keys)=>v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value'));
const dense=(v,n)=>Array.isArray(v)&&v.length<=n&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,''+i)).every(d=>d&&Object.hasOwn(d,'value'));
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const tags=['DIV','MAIN','SECTION','HEADER','FOOTER','NAV','FORM','OTHER'];
const enums=Object.freeze({display:['none','contents','block','flex','grid','inline','inline-block','inline-flex','flow-root','other'],visibility:['visible','hidden','collapse','other'],opacity:['one','zero','other'],zoom:['one','other'],overflowX:['visible','hidden','clip','auto','scroll','other'],overflowY:['visible','hidden','clip','auto','scroll','other'],position:['static','relative','absolute','fixed','sticky','other'],transform:['none','present'],translate:['none','present'],rotate:['none','present'],scale:['none','present'],filter:['none','present'],backdropFilter:['none','present'],clipPath:['none','present'],maskImage:['none','present'],contain:['none','present'],scrollSnapType:['none','present'],before:['none','normal','present'],after:['none','normal','present']});
const terminalStates=['NO_MATCH','FAILED','EXPIRED','INVALIDATED'];
const terminal=state=>({schema:'project-wrapper-first-refusal-v1',state,reason:'none',detail:'none',phase:'none',limit:'unavailable',baseline:null,nodes:[]});
export function isProjectDiagnosticURL(value){try{const u=new URL(value);return (u.origin==='https://chatgpt.com'||u.protocol==='http:'&&u.hostname==='127.0.0.1')&&!u.search&&!u.hash&&/^\/g\/g-p-[0-9a-f]{32}\/project$/.test(u.pathname);}catch{return false;}}
export function validProjectWrapperReport(v){try{
 if(!exact(v,['schema','state','reason','detail','phase','limit','baseline','nodes'])||v.schema!=='project-wrapper-first-refusal-v1'||!dense(v.nodes,3))return false;
 if(terminalStates.includes(v.state))return v.reason==='none'&&v.detail==='none'&&v.phase==='none'&&v.limit==='unavailable'&&v.baseline===null&&v.nodes.length===0;
 if(!['COMPLETE','PARTIAL'].includes(v.state)||v.reason!=='native-flow-wrapper-paint'||!WRAPPER_DETAILS.includes(v.detail)||v.phase!=='walk'||!['none','baseline','time','unavailable'].includes(v.limit)||(v.state==='COMPLETE')!==(v.limit==='none'))return false;
 if(v.baseline!==null&&(!validMainMountCheck(v.baseline)||v.baseline.reason!==v.reason||v.baseline.detail!==v.detail||v.baseline.phase!==v.phase||v.baseline.kind!=='project'))return false;
 if(v.state==='COMPLETE'&&(!v.baseline||v.baseline.coverage!=='complete'||v.nodes.length===0))return false;
 return v.nodes.every((n,i)=>dense(n,6)&&n.length===6&&n[0]===i&&tags.includes(n[1])&&typeof n[2]==='boolean'&&typeof n[3]==='boolean'&&dense(n[4],4)&&n[4].length===4&&n[4].every((x,j)=>int(x,j<2?-65536:0,65536))&&exact(n[5],Object.keys(enums))&&Object.entries(enums).every(([k,values])=>values.includes(n[5][k])));
}catch{return false;}}

/** Only the rejected node and at most two direct parents. No selectors,
 * siblings, descendants, text, attributes, input values or network access.
 * All CSS strings (including url()/generated content) become fixed categories.
 * The original snapshot keeps its 16/24/8 limits; this shares its 8ms window. */
export function snapshotProjectWrapperRefusal(report,context){
 const c=context;
 if(c?.reason!=='native-flow-wrapper-paint'||c.phase!=='walk'||!WRAPPER_DETAILS.includes(c.detail)||c.kind!=='project'||c.inspection?.ok!==true)return terminal('NO_MATCH');
 const baseline=validMainMountCheck(report)&&report.kind==='project'&&report.reason===c.reason&&report.detail===c.detail&&report.phase===c.phase?structuredClone(report):null;
 const result={schema:'project-wrapper-first-refusal-v1',state:'PARTIAL',reason:c.reason,detail:c.detail,phase:c.phase,limit:baseline?.coverage==='complete'?'none':'baseline',baseline,nodes:[]};
 const mark=limit=>{if(result.limit==='none'||limit==='time')result.limit=limit;};
 try{
  const win=c.document.defaultView,within=()=>{const delta=win.performance.now()-c.startedAt;if(!Number.isFinite(delta)||delta<0||delta>=8){mark('time');return false;}return true;};
  let node=c.node;
  for(let distance=0;node&&distance<3;distance++){
   if(!within())break;
   if(node.nodeType!==1||!node.isConnected||node.ownerDocument!==c.document){mark('unavailable');break;}
   const style=win.getComputedStyle(node),safe={};
   for(const [key,values] of Object.entries(enums)){
    if(!within())break;
    if(key==='before'||key==='after'){const value=win.getComputedStyle(node,'::'+key).content;safe[key]=value==='none'||value==='normal'?value:'present';}
    else {const value=style[key];safe[key]=key==='opacity'?value==='1'?'one':value==='0'?'zero':'other':key==='zoom'?value==='1'?'one':'other':values[1]==='present'?value==='none'?'none':'present':values.includes(value)?value:'other';}
   }
   if(!within()||Object.keys(safe).length!==Object.keys(enums).length)break;
   const r=node.getBoundingClientRect(),box=[r.x,r.y,r.width,r.height];
   if(!within())break;
   if(!box.every((v,i)=>Number.isFinite(v)&&Math.abs(v)<=65536&&(i<2||v>=0))){mark('unavailable');break;}
   const tag=tags.includes(node.tagName)?node.tagName:'OTHER';
   const shells=c.flowSeamShells;if(shells!==undefined&&(!Array.isArray(shells)||shells.length>128)){mark('unavailable');break;}
   result.nodes.push([distance,tag,node===c.root,shells?.includes(node)===true,box.map(Math.round),safe]);
   if(distance<2)node=node.parentElement;
  }
  if(!result.nodes.length&&result.limit==='none')mark('unavailable');
  within();
 }catch{mark('unavailable');}
 result.state=result.limit==='none'?'COMPLETE':'PARTIAL';
 return validProjectWrapperReport(result)?result:terminal('FAILED');
}

/** One opt-in diagnostic build, one content document, one first Host generation.
 * Waiting performs no native inspection. A capability is RAM-only; durable
 * consumption happens at the extension-origin private UI before authorize(). */
export function createProjectWrapperDiagnosticSlot({document:doc,enabled=false,now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeId=()=>crypto.randomUUID()}={}){
 const url=doc.location.href;let used=false,state='OFF',owner=null,current=null,signal=null,resolveWait=null,resolveResult=null,timer=null,nonce=null,wallEnd=0,elapsedEnd=0,lastWall=0,lastElapsed=0,saved=null;
 const window=doc.defaultView;
 const clean=()=>{cancel(timer);timer=null;signal?.removeEventListener('abort',invalidate);window.removeEventListener('pagehide',invalidate);window.removeEventListener('popstate',invalidate);window.removeEventListener('hashchange',invalidate);window.navigation?.removeEventListener('navigate',invalidate);};
 const deliver=()=>{const settle=resolveResult;resolveResult=null;settle?.(saved?structuredClone(saved):null);};
 function finish(value){state=value;saved=terminal(value);nonce=null;clean();const settle=resolveWait;resolveWait=null;settle?.(false);owner=null;current=null;signal=null;deliver();}
 function invalidate(){finish('INVALIDATED');}
 const valid=()=>{
  if(!owner||!current?.()||signal?.aborted||doc.location.href!==url){if(owner)invalidate();return false;}
  const wall=now(),elapsed=elapsedNow();
  if(!Number.isFinite(wall)||!Number.isFinite(elapsed)||wall<lastWall||elapsed<lastElapsed||wall>=wallEnd||elapsed>=elapsedEnd){finish('EXPIRED');return false;}
  lastWall=wall;lastElapsed=elapsed;return true;
 };
 function deadline(ms){cancel(timer);lastWall=now();lastElapsed=elapsedNow();wallEnd=lastWall+ms;elapsedEnd=lastElapsed+ms;timer=schedule(()=>finish('EXPIRED'),ms);}
 return Object.freeze({
  wait({generation,isCurrent,abortSignal}){
   if(!enabled||used||!isProjectDiagnosticURL(url)||doc.location.href!==url||!window.navigation?.addEventListener)return Promise.resolve(false);
   used=true;owner=generation;current=isCurrent;signal=abortSignal;state='WAITING';nonce=makeId();deadline(60000);
   signal.addEventListener('abort',invalidate,{once:true});for(const event of ['pagehide','popstate','hashchange'])window.addEventListener(event,invalidate,{once:true});window.navigation.addEventListener('navigate',invalidate,{once:true});
   return new Promise(resolve=>{resolveWait=resolve;if(!valid())resolve(false);});
  },
  ticket(){return state==='WAITING'&&valid()?{nonce}:null;},
  authorize(value){
   if(state!=='WAITING'||!exact(value,['nonce'])||value.nonce!==nonce||!valid())return false;
   state='ARMED';nonce=null;deadline(30000);const settle=resolveWait;resolveWait=null;settle?.(true);return true;
  },
  take(generation,inspection){
   if(state!=='ARMED'||generation!==owner||!valid())return null;
   // Consume before the original preflight/snapshot. Every first decision,
   // including accepted/other refusal, terminates the attempt permanently.
   state='TAKEN';let called=false;
   return (report,context)=>{
    if(called)return;called=true;
    if(state!=='TAKEN'||!valid())return;
    try{saved=context?.document===doc&&context.inspection===inspection?snapshotProjectWrapperRefusal(report,context):terminal('FAILED');}catch{saved=terminal('FAILED');}
    state='DONE';
    deliver();
   };
  },
  read(){if(owner&&!valid())return saved?structuredClone(saved):null;return saved?structuredClone(saved):null;},
  result(){if(saved)return Promise.resolve(structuredClone(saved));if(!['ARMED','TAKEN'].includes(state)||resolveResult)return Promise.resolve(null);return new Promise(resolve=>{resolveResult=resolve;});},
  invalidate
 });
}
