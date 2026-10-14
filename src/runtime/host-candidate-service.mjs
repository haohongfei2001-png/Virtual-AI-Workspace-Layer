import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
const renderKeyOK=v=>typeof v==='string'&&/^candidate:[A-Za-z0-9_-]{1,128}$/.test(v);
const fields=['renderKey','nativeTitle','titleState','available','reason','planRevision','targetKey'];
function candidate(value){
 if(!exactHostRecord(value,fields)||!renderKeyOK(value.renderKey)||!['exact','unavailable','over-limit'].includes(value.titleState)||(value.titleState==='exact'?typeof value.nativeTitle!=='string'||!value.nativeTitle.trim()||value.nativeTitle.length>200:value.nativeTitle!==null)||typeof value.available!=='boolean'||!(value.reason===null||typeof value.reason==='string'&&/^[a-z][a-z0-9-]{0,95}$/.test(value.reason)))throw Error('invalid-candidate');
 if(value.available?(!Number.isSafeInteger(value.planRevision)||value.planRevision<1||!tokenOK(value.targetKey)):(value.planRevision!==null||value.targetKey!==null))throw Error('invalid-candidate-plan');
 return Object.freeze({...value});
}
/** Ephemeral native controls only. A listing is never a canonical object or authority. */
export function createHostCandidateService({ui,bridge,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeId=()=>crypto.randomUUID()}={}){
 if(typeof ui?.withScope!=='function'||[bridge,elapsedNow,schedule,cancel,makeId].some(v=>typeof v!=='function'))throw Error('invalid-candidate-service');
 const lists=new Map(),attempts=new Set(),actions=new Map(),pendingActions=new Map();let stopped=false,order=0;
 const failure=()=>({ok:false,state:'blocked'});
 const liveList=e=>{const n=elapsedNow();return !stopped&&lists.get(e.key)===e&&Number.isFinite(n)&&n>=e.created&&n<e.until&&e.current()===true;};
 function stop(){stopped=true;lists.clear();actions.clear();pendingActions.clear();for(const a of attempts)a.active=false;attempts.clear();}
 function authorize(command,parentFrame){
  if(!exactHostRecord(command,['actionId','uiGrantId','mountId','planRevision','targetKey']))return false;
  const entry=pendingActions.get(command.actionId);if(!entry)return false;
  const expected=entry.context.parentFrame;
  if(!expected||!parentFrame||parentFrame.frameId!==0||expected.frameId!==0||['tabId','documentId','actualURL'].some(k=>parentFrame[k]!==expected[k])||Object.keys(entry.command).some(k=>command[k]!==entry.command[k]))return false;
  try{return entry.guard()===true;}catch{return false;}
 }
 async function handle(input,sender){
  if(stopped)return failure();let m;try{m=structuredClone(input);sender=structuredClone(sender);}catch{return failure();}
  const listing=m?.type==='HOST_UI_CANDIDATES';
  const requestedOffset=listing&&Object.hasOwn(m,'offset')?m.offset:0;
  if(listing&&(!Number.isSafeInteger(requestedOffset)||requestedOffset<0||requestedOffset>224||requestedOffset%32!==0))return failure();
  if(!exactHostRecord(m,['v','type','grantId','mountId',...(listing?(Object.hasOwn(m,'offset')?['offset']:[]):['renderKey','actionId'])])||m.v!==1||!tokenOK(m.grantId)||!tokenOK(m.mountId)||!listing&&(m.type!=='HOST_UI_ACTIVATE_CANDIDATE'||!renderKeyOK(m.renderKey)||!tokenOK(m.actionId)))return failure();
  const a={active:true,started:elapsedNow(),order:++order};attempts.add(a);
  const live=()=>{const time=elapsedNow();if(stopped||!Number.isFinite(time)||time<a.started||time-a.started>=6000)a.active=false;return a.active;};
  try{return await withRequestDeadline(()=>ui.withScope({sender,grantId:m.grantId,mountId:m.mountId},async context=>{
   const check=()=>{if(!live()||context.isCurrent()!==true)throw Error('candidate-expired');};check();
   for(const [key,e]of lists)if(!liveList(e))lists.delete(key);
   for(const [id,isCurrent]of actions){let valid=false;try{valid=isCurrent()===true;}catch{}if(!valid)actions.delete(id);}
   const key=JSON.stringify([context.scope.key,context.scopeGrantId,m.grantId,m.mountId,context.role]);
   if(listing){
    const prior=lists.get(key);if(prior&&prior.order>a.order)throw Error('stale-candidate-list');if(!prior&&lists.size>=64)throw Error('candidate-capacity');
    const e={key,order:a.order,created:elapsedNow(),until:elapsedNow()+30000,current:context.isCurrent,rows:new Map()};lists.set(key,e);
    const result=structuredClone(await bridge({context,uiGrantId:m.grantId,mountId:m.mountId,phase:'list',offset:requestedOffset}));check();if(!liveList(e))throw Error('stale-candidate-list');
    let page,values;
    if(Array.isArray(result)){if(requestedOffset!==0||result.length>32)throw Error('invalid-candidate-list');values=result;page={offset:0,total:result.length,nextOffset:null};}
    else{
     if(!exactHostRecord(result,['items','total','offset','nextOffset'])||!Array.isArray(result.items)||!Number.isSafeInteger(result.total)||result.total<0||result.total>256)throw Error('invalid-candidate-page');
     const offset=Math.min(requestedOffset,result.total?Math.floor((result.total-1)/32)*32:0),count=Math.min(32,result.total-offset),nextOffset=offset+count<result.total?offset+32:null;
     if(result.offset!==offset||result.nextOffset!==nextOffset||result.items.length!==count)throw Error('invalid-candidate-page');
     values=result.items;page={offset,total:result.total,nextOffset};
    }
    const items=[],rows=new Map();for(let i=0;i<values.length;i++){const row=candidate(values[i]);if(rows.has(row.renderKey))throw Error('duplicate-candidate');rows.set(row.renderKey,row);const {planRevision,targetKey,...item}=row;items.push(item);}
    e.rows=rows;return {ok:true,items,page};
   }
   const e=lists.get(key),row=e?.rows.get(m.renderKey);if(!e||!liveList(e)||!row?.available||actions.has(m.actionId)||actions.size>=1024)throw Error('candidate-unavailable');
   actions.set(m.actionId,context.isCurrent);
   const guard=()=>{if(!live()||context.isCurrent()!==true||!liveList(e)||e.rows.get(m.renderKey)!==row)a.active=false;return a.active;};
   if(!guard())throw Error('candidate-expired');
   const command=Object.freeze({actionId:m.actionId,uiGrantId:m.grantId,mountId:m.mountId,planRevision:row.planRevision,targetKey:row.targetKey}),pending={command,context,guard};pendingActions.set(m.actionId,pending);a.pending=pending;a.actionId=m.actionId;
   const result=await bridge({context,uiGrantId:m.grantId,mountId:m.mountId,phase:'activate',candidate:row,actionId:m.actionId,guard,remainingMs:6000-(elapsedNow()-a.started)});check();if(!guard())throw Error('candidate-expired');
   if(!['dispatched','already-current','blocked','unconfirmed'].includes(result?.state))throw Error('invalid-candidate-result');
   return {ok:true,state:result.state};
  }),{timeoutMs:6000,now:elapsedNow,schedule,cancel});}catch{return failure();}finally{a.active=false;attempts.delete(a);if(a.pending&&pendingActions.get(a.actionId)===a.pending)pendingActions.delete(a.actionId);}
 }
 return Object.freeze({handle,stop,authorize});
}
