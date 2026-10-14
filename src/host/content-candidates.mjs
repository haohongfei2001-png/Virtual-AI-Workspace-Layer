import {validateCandidatePresentation} from './candidate-presentation.mjs';
import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Isolated-document RAM plans. A worker command selects only a previously
 * issued plan; page names and positions never resolve a native control. */
export function createContentCandidates({adapter,current,showReading,isUpgraded=()=>false,onScan=()=>{},now=Date.now}={}){
 if(!adapter||typeof current!=='function'||typeof showReading!=='function')throw Error('invalid-content-candidates');
 let stopped=false,active=null,pendingScan=null;const rows=new Map();
 const live=()=>!stopped&&current()===true;
 function authorize(command){return live()&&active!==null&&exactHostRecord(command,Object.keys(active.command))&&now()<active.expiresAt&&Object.keys(active.command).every(key=>command[key]===active.command[key]);}
 async function scan(){
  if(!live())throw Error('stale-content-candidates');
  const proposals=typeof adapter.loadedPages==='function'?adapter.loadedPages():await adapter.readLoaded(null);if(!live())throw Error('stale-content-candidates');
  let candidates=[];const keys=new Set();
  for await(const p of proposals){if(!live())throw Error('stale-content-candidates');if(p.kind==='surface-delta'&&(!Array.isArray(p.payload?.candidates)||p.payload.candidates.length>256))throw Error('invalid-content-candidates');for(const row of p.kind==='surface-delta'?p.payload.candidates:[]){
   if(row.entity!=='project'||row.target?.kind!=='live-control')continue;
   if(typeof row.renderKey!=='string'||!row.renderKey||keys.has(row.renderKey))throw Error('invalid-content-candidates');
   keys.add(row.renderKey);const {entity,renderKey,nativeTitle,titleState,target}=row;candidates.push({entity,renderKey,nativeTitle,titleState,target});
  }
  }
  if(!live())throw Error('stale-content-candidates');
  onScan(candidates);candidates=candidates.filter(row=>!isUpgraded(row));
  if(!live())throw Error('stale-content-candidates');return candidates;
 }
 function sharedScan(){
  if(!pendingScan){const pending=scan().finally(()=>{if(pendingScan===pending)pendingScan=null;});pendingScan=pending;}
  return pendingScan;
 }
 async function listPage(offset=0){
  if(!Number.isSafeInteger(offset)||offset<0||offset%32!==0)throw Error('invalid-candidate-offset');
  if(!live())throw Error('stale-content-candidates');
  const candidates=await sharedScan();if(!live())throw Error('stale-content-candidates');
  const total=candidates.length;offset=Math.min(offset,Math.max(0,Math.floor((total-1)/32)*32));
  const items=[];
  for(const row of candidates.slice(offset,offset+32)){
   const plan=adapter.planNavigation(row.target),targetKey=adapter.planKey(plan),available=plan.mode==='native-control'&&typeof targetKey==='string';
   const value=Object.freeze({renderKey:row.renderKey,nativeTitle:row.nativeTitle,titleState:row.titleState,available,reason:available?null:plan.reason??'native-control-unavailable',planRevision:available?plan.planRevision:null,targetKey:available?targetKey:null});
   items.push(value);if(available){rows.set(targetKey,value);while(rows.size>256)rows.delete(rows.keys().next().value);}
  }
  if(!live())throw Error('stale-content-candidates');return {items,total,offset,nextOffset:offset+items.length<total?offset+32:null};
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
 function stop(){stopped=true;active=null;rows.clear();}
 return Object.freeze({list,listPage,activate,authorize,displayFor,beforeDispatch,stop});
}
