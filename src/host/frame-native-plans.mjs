import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Content-owner preparation only. Neither this helper nor its DTO clicks a node. */
export function createFrameNativePlans({adapter,bindingCurrent}={}){
 if(typeof bindingCurrent!=='function'||!['planNavigation','planKey','currentURL'].every(k=>typeof adapter?.[k]==='function'))throw Error('invalid-frame-native-plans');
 return Object.freeze({plan(input){
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
  const result=targets.map(target=>{
   const field=Object.hasOwn(target,'projectId')?'projectId':'refId',entity=field==='projectId'?'project':'conversation',nativeId=target[field],{navigationURL}=target;
   check();const plan=adapter.planNavigation({kind:'resolved',entity,nativeId,navigationURL,liveHandle:null});check();
   const targetKey=adapter.planKey(plan);check();return {[field]:nativeId,plan,targetKey};
  });
  if(new TextEncoder().encode(JSON.stringify(result)).length>65536)throw Error('frame-native-plans-too-large');check();return result;
 }});
}
