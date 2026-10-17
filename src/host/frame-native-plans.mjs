import {isResolvedControlNavigationPlan} from './current-navigation-plan.mjs';
import {exactHostRecord} from './contract.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Content-owner preparation only. Neither this helper nor its DTO clicks a node. */
export function createFrameNativePlans({adapter,bindingCurrent,showReading=()=>false,showNativeReading=()=>false,captureIntent=()=>()=>true,now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(typeof bindingCurrent!=='function'||!['planNavigation','planKey','currentURL'].every(k=>typeof adapter?.[k]==='function'))throw Error('invalid-frame-native-plans');
 const issuedCurrent=new Map(),pending=new Map();
 const commandFields=['actionId','uiGrantId','mountId','planRevision','targetKey'];
 const validCommand=value=>exactHostRecord(value,commandFields)&&['actionId','uiGrantId','mountId','targetKey'].every(k=>tokenOK(value[k]))&&Number.isSafeInteger(value.planRevision)&&value.planRevision>0;
 function authorize(command){const p=pending.get(command?.actionId);return validCommand(command)&&!!p&&commandFields.every(k=>command[k]===p.command[k])&&p.current();}
 function beforeDispatch(plan){
  const attempt=[...pending.values()].find(p=>p.plan===plan);if(!attempt||plan.mode!=='native-control')return false;
  if(!attempt.current()||showNativeReading()!==true)throw Error('native-reading-unavailable');
  attempt.capture();if(!attempt.current())throw Error('native-intent-changed');return true;
 }
 async function activate({command,expiresAt}={}){
  const failed={state:'blocked'};if(!validCommand(command)||pending.has(command.actionId)||pending.size>=16||typeof adapter.dispatchNative!=='function')return failed;
  const entry=issuedCurrent.get(command.targetKey),started=elapsedNow(),remaining=Date.parse(expiresAt)-now();
  if(!entry||entry.plan.planRevision!==command.planRevision||!Number.isFinite(remaining)||remaining<=0||remaining>6000)return failed;
  let active=true,intentCurrent=captureIntent();const current=()=>{const age=elapsedNow()-entry.at,elapsed=elapsedNow()-started;return active&&typeof intentCurrent==='function'&&intentCurrent()===true&&issuedCurrent.get(command.targetKey)===entry&&bindingCurrent()===entry.binding&&adapter.currentURL()===entry.url&&Number.isFinite(age)&&age>=0&&age<30000&&Number.isFinite(elapsed)&&elapsed>=0&&elapsed<remaining&&Date.parse(expiresAt)>now();};
  if(!current())return failed;const attempt={command:Object.freeze({...command}),current,plan:entry.plan,capture:()=>{intentCurrent=captureIntent();}};pending.set(command.actionId,attempt);
  try{return await withRequestDeadline(async()=>{
   const result=await adapter.dispatchNative(attempt.command);if(!current())return entry.plan.mode==='native-control'?{state:'unconfirmed'}:failed;
   if(result?.state==='already-current'&&entry.plan.mode==='same-target')return showReading()===true?result:failed;
   if(result?.state==='dispatched'&&entry.plan.mode==='native-control')return result;
   return ['blocked','unconfirmed'].includes(result?.state)?{state:result.state}:failed;
  },{timeoutMs:remaining,now:elapsedNow,schedule,cancel});}catch{return {state:'unconfirmed'};}finally{active=false;if(pending.get(command.actionId)===attempt)pending.delete(command.actionId);}
 }
 return Object.freeze({authorize,activate,beforeDispatch,plan(input){
  if(!exactHostRecord(input,['targets'])||!Array.isArray(input.targets)||input.targets.length>200)throw Error('invalid-frame-native-targets');
  const targets=[],seen=new Map();
  for(const item of input.targets){
   const project=exactHostRecord(item,['projectId','navigationURL']),conversation=exactHostRecord(item,['refId','navigationURL']);
   if(!project&&!conversation)throw Error('invalid-frame-native-target');
   const field=project?'projectId':'refId',nativeId=item[field];
   if(!tokenOK(nativeId)||['__proto__','prototype','constructor'].includes(nativeId)||typeof item.navigationURL!=='string'||item.navigationURL.length>2048)throw Error('invalid-frame-native-target');
   const key=JSON.stringify([field,nativeId]);
   if(seen.has(key))throw Error(seen.get(key)===item.navigationURL?'duplicate-frame-native-target':'conflicting-frame-native-target');
   seen.set(key,item.navigationURL);targets.push({[field]:nativeId,navigationURL:item.navigationURL});
  }
  if(new TextEncoder().encode(JSON.stringify(targets)).length>65536)throw Error('frame-native-targets-too-large');
  const binding=bindingCurrent(),url=adapter.currentURL();
  const check=()=>{if(typeof binding!=='string'||!binding||binding.length>256||bindingCurrent()!==binding||adapter.currentURL()!==url)throw Error('stale-frame-native-plans');};check();
  const lookups=targets.map(target=>({entity:Object.hasOwn(target,'projectId')?'project':'conversation',nativeId:target.projectId??target.refId,navigationURL:target.navigationURL}));
  const handles=typeof adapter.resolveLoadedTargets==='function'?adapter.resolveLoadedTargets(lookups):targets.map(()=>null);check();
  if(!Array.isArray(handles)||handles.length!==targets.length)throw Error('invalid-resolved-native-handles');
  const result=targets.map((target,index)=>{
   const field=Object.hasOwn(target,'projectId')?'projectId':'refId',entity=field==='projectId'?'project':'conversation',nativeId=target[field],{navigationURL}=target;
   check();const issued=adapter.planNavigation({kind:'resolved',entity,nativeId,navigationURL,liveHandle:handles[index]});check();
   const targetKey=adapter.planKey(issued);
   if((issued.mode==='same-target'||isResolvedControlNavigationPlan(issued))&&tokenOK(targetKey)){if(issuedCurrent.size>=256)issuedCurrent.delete(issuedCurrent.keys().next().value);issuedCurrent.set(targetKey,{plan:issued,binding,url,at:elapsedNow()});}
   // Frame anchors cannot recheck a later draft at default browser navigation.
   // Their issued href always preserves the current page, even when empty now.
   const plan=issued.mode==='href'?{...issued,disposition:'new-tab-preserve-current'}:issued;
   check();return {[field]:nativeId,plan,targetKey};
  });
  if(new TextEncoder().encode(JSON.stringify(result)).length>65536)throw Error('frame-native-plans-too-large');check();return result;
 }});
}
