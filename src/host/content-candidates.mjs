import {createCandidatePageWindow} from './candidate-page-window.mjs';
import {validateCandidatePresentation} from './candidate-presentation.mjs';
import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Isolated-document RAM plans. A worker command selects only a previously
 * issued plan; page names and positions never resolve a native control. */
export function createContentCandidates({adapter,current,showReading,isUpgraded=()=>false,onScan=()=>{},beginScan=null,streaming=false,now=Date.now,elapsedNow=()=>performance.now()}={}){
 if(typeof elapsedNow!=='function'||typeof streaming!=='boolean'||streaming&&typeof beginScan!=='function')throw Error('invalid-content-candidates');
 if(beginScan!==null&&typeof beginScan!=='function')throw Error('invalid-content-candidates');
 if(!adapter||typeof current!=='function'||typeof showReading!=='function')throw Error('invalid-content-candidates');
 let stopped=false,active=null,pendingScan=null;const rows=new Map(),pendingPages=new Map(),leases=new Set();let streamTail=Promise.resolve();
 const live=()=>!stopped&&current()===true;
 function authorize(command){return live()&&active!==null&&exactHostRecord(command,Object.keys(active.command))&&now()<active.expiresAt&&Object.keys(active.command).every(key=>command[key]===active.command[key]);}
 async function scan(offset=null,requestedAt=null){
  const check=()=>{if(!live())throw Error('stale-content-candidates');if(requestedAt!==null){const elapsed=elapsedNow()-requestedAt;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=6000)throw Error('stale-content-candidates');}};
  check();const window=offset===null?null:createCandidatePageWindow(offset),owner=window?'candidate-window_'+crypto.randomUUID():null,deadline=window?(requestedAt??elapsedNow())+6000:null;let transferred=false;
  let released=false;const release=()=>{if(released)return;released=true;leases.delete(release);if(owner)adapter.releaseLoadedHandles?.(owner);};if(owner)leases.add(release);
  try{
  const transaction=beginScan?.();
  if(beginScan&&(!transaction||typeof transaction.visit!=='function'||typeof transaction.commit!=='function'))throw Error('invalid-candidate-scan');
  const proposals=typeof adapter.loadedPages==='function'?adapter.loadedPages():await adapter.readLoaded(null);check();
  let candidates=[];const keys=new Set();
  for await(const p of proposals){check();if(p.kind==='surface-delta'&&(!Array.isArray(p.payload?.candidates)||p.payload.candidates.length>256))throw Error('invalid-content-candidates');for(const row of p.kind==='surface-delta'?p.payload.candidates:[]){
   if(row.entity!=='project'||row.target?.kind!=='live-control')continue;
   if(typeof row.renderKey!=='string'||!row.renderKey||keys.has(row.renderKey))throw Error('invalid-content-candidates');
   keys.add(row.renderKey);const {entity,renderKey,nativeTitle,titleState,target}=row;const value={entity,renderKey,nativeTitle,titleState,target};const excluded=transaction?.visit(value);if(window){if(typeof excluded!=='boolean')throw Error('invalid-candidate-scan');if(!excluded)window.add(value);}else candidates.push(value);
  }
   if(window&&typeof adapter.retainLoadedHandles==='function'){
    const identities=transaction?.retainedHandles===undefined?[]:transaction.retainedHandles();
    if(!Array.isArray(identities)||identities.length>34||identities.some(handle=>!handle||typeof handle.id!=='string'))throw Error('invalid-candidate-retention');
    const handles=new Map([...window.retained().map(row=>row.target.control),...identities].map(handle=>[handle.id,handle]));
    if(adapter.retainLoadedHandles(owner,[...handles.values()],deadline)!==true)throw Error('candidate-handle-capacity');
   }
  }
  check();
  if(transaction)transaction.commit();else onScan(candidates);
  check();if(window){transferred=true;return {...window.finish(),release};}
  candidates=candidates.filter(row=>!isUpgraded(row));
  check();return candidates;
  }finally{if(!transferred)release();}
 }
 function sharedScan(){
  if(!pendingScan){const pending=scan().finally(()=>{if(pendingScan===pending)pendingScan=null;});pendingScan=pending;}
  return pendingScan;
 }
 function streamPage(offset){
  let shared=pendingPages.get(offset);
  if(!shared){
   // Queuing and joining keep the first request's deadline and one scan lease.
   if(pendingPages.size>=4)return Promise.reject(Error('candidate-page-capacity'));
   const requestedAt=elapsedNow();if(!Number.isFinite(requestedAt))return Promise.reject(Error('stale-content-candidates'));
   shared={consumers:0,promise:null};
   const pending=streamTail.then(()=>scan(offset,requestedAt)).finally(()=>{if(pendingPages.get(offset)===shared)pendingPages.delete(offset);});
   shared.promise=pending;pendingPages.set(offset,shared);streamTail=pending.catch(()=>{});
  }
  shared.consumers++;
  return shared.promise.then(page=>{let released=false;return {...page,release(){if(released)return;released=true;if(--shared.consumers===0)page.release();}};});
 }

 async function listPage(offset=0){
  if(!Number.isSafeInteger(offset)||offset<0||offset%32!==0)throw Error('invalid-candidate-offset');
  if(!live())throw Error('stale-content-candidates');
  let selected,total,release=()=>{};
  try{
  if(streaming){const page=await streamPage(offset);selected=page.items;total=page.total;offset=page.offset;release=page.release;}
  else{const candidates=await sharedScan();total=candidates.length;offset=Math.min(offset,Math.max(0,Math.floor((total-1)/32)*32));selected=candidates.slice(offset,offset+32);}
  if(!live())throw Error('stale-content-candidates');
  const items=[];
  for(const row of selected){
   const plan=adapter.planNavigation(row.target),targetKey=adapter.planKey(plan),available=plan.mode==='native-control'&&typeof targetKey==='string';
   const value=Object.freeze({renderKey:row.renderKey,nativeTitle:row.nativeTitle,titleState:row.titleState,available,reason:available?null:plan.reason??'native-control-unavailable',planRevision:available?plan.planRevision:null,targetKey:available?targetKey:null});
   items.push(value);if(available){rows.set(targetKey,value);while(rows.size>256)rows.delete(rows.keys().next().value);}
  }
  if(!live())throw Error('stale-content-candidates');return {items,total,offset,nextOffset:offset+items.length<total?offset+32:null};
  }finally{release();}
 }
 async function list(){return (await listPage(0)).items;}
 async function activate(value){
  if(!live()||active||!exactHostRecord(value,['candidate','actionId','uiGrantId','mountId','expiresAt',...(value&&Object.hasOwn(value,'display')?['display']:[])])||!['actionId','uiGrantId','mountId'].every(k=>tokenOK(value[k]))||typeof value.expiresAt!=='string'||!exactHostRecord(value.candidate,['renderKey','nativeTitle','titleState','available','reason','planRevision','targetKey']))return {state:'blocked'};
  let display=null;
  if(Object.hasOwn(value,'display'))try{if(!exactHostRecord(value.display,['role','presentation'])||!['workspace','sidebar'].includes(value.display.role))return {state:'blocked'};display=Object.freeze({role:value.display.role,presentation:Object.freeze({...validateCandidatePresentation(value.display.presentation)})});}catch{return {state:'blocked'};}
  const expiresAt=Date.parse(value.expiresAt),row=rows.get(value.candidate?.targetKey);
  if(!row?.available||row.renderKey!==value.candidate.renderKey||row.targetKey!==value.candidate.targetKey||row.planRevision!==value.candidate.planRevision||!Number.isFinite(expiresAt)||expiresAt<=now()||expiresAt>now()+6000)return {state:'blocked'};
  const command=Object.freeze({actionId:value.actionId,uiGrantId:value.uiGrantId,mountId:value.mountId,planRevision:row.planRevision,targetKey:row.targetKey}),attempt={command,expiresAt,display};active=attempt;
  // The native action owner checks authorization/risk/node both before and
  // after yielding to native reading. A lost result must never retry a click.
  try{return await adapter.dispatchNative(command);}finally{if(active===attempt)active=null;}
 }
 function displayFor(command){return authorize(command)?active.display:null;}
 function beforeDispatch(){if(!active||!authorize(active.command)||showReading()!==true)throw Error('native-reading-unavailable');}
 function stop(){stopped=true;active=null;rows.clear();for(const release of leases)release();}
 return Object.freeze({list,listPage,activate,authorize,displayFor,beforeDispatch,stop});
}
