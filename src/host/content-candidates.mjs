import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Isolated-document RAM plans. A worker command selects only a previously
 * issued plan; page names and positions never resolve a native control. */
export function createContentCandidates({adapter,current,showReading,now=Date.now}={}){
 if(!adapter||typeof current!=='function'||typeof showReading!=='function')throw Error('invalid-content-candidates');
 let stopped=false,active=null;const rows=new Map();
 const live=()=>!stopped&&current()===true;
 function authorize(command){return live()&&active!==null&&exactHostRecord(command,Object.keys(active.command))&&now()<active.expiresAt&&Object.keys(active.command).every(key=>command[key]===active.command[key]);}
 async function list(){
  if(!live())throw Error('stale-content-candidates');
  const proposals=await adapter.readLoaded(null);if(!live())throw Error('stale-content-candidates');
  const items=[];
  for(const p of proposals)for(const row of p.kind==='surface-delta'?p.payload.candidates:[]){
   if(row.entity!=='project'||row.target?.kind!=='live-control')continue;
   if(items.length>=32)break;
   const plan=adapter.planNavigation(row.target),targetKey=adapter.planKey(plan),available=plan.mode==='native-control'&&typeof targetKey==='string';
   const value=Object.freeze({renderKey:row.renderKey,nativeTitle:row.nativeTitle,titleState:row.titleState,available,reason:available?null:plan.reason??'native-control-unavailable',planRevision:available?plan.planRevision:null,targetKey:available?targetKey:null});
   items.push(value);if(available){rows.set(targetKey,value);while(rows.size>256)rows.delete(rows.keys().next().value);}
  }
  if(!live())throw Error('stale-content-candidates');return items;
 }
 async function activate(value){
  if(!live()||active||!exactHostRecord(value,['candidate','actionId','uiGrantId','mountId','expiresAt'])||!['actionId','uiGrantId','mountId'].every(k=>tokenOK(value[k]))||typeof value.expiresAt!=='string'||!exactHostRecord(value.candidate,['renderKey','nativeTitle','titleState','available','reason','planRevision','targetKey']))return {state:'blocked'};
  const expiresAt=Date.parse(value.expiresAt),row=rows.get(value.candidate?.targetKey);
  if(!row?.available||row.renderKey!==value.candidate.renderKey||row.targetKey!==value.candidate.targetKey||row.planRevision!==value.candidate.planRevision||!Number.isFinite(expiresAt)||expiresAt<=now()||expiresAt>now()+6000)return {state:'blocked'};
  const command=Object.freeze({actionId:value.actionId,uiGrantId:value.uiGrantId,mountId:value.mountId,planRevision:row.planRevision,targetKey:row.targetKey}),attempt={command,expiresAt};active=attempt;
  // The native action owner checks authorization/risk/node both before and
  // after yielding to native reading. A lost result must never retry a click.
  try{return await adapter.dispatchNative(command);}finally{if(active===attempt)active=null;}
 }
 function beforeDispatch(){if(!active||!authorize(active.command)||showReading()!==true)throw Error('native-reading-unavailable');}
 function stop(){stopped=true;active=null;rows.clear();}
 return Object.freeze({list,activate,authorize,beforeDispatch,stop});
}
