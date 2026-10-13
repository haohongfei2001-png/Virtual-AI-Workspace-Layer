import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Content-owner preparation only. Neither this helper nor its DTO clicks a node. */
export function createFrameNativePlans({adapter,bindingCurrent}={}){
 if(typeof bindingCurrent!=='function'||!['planNavigation','planKey','currentURL'].every(k=>typeof adapter?.[k]==='function'))throw Error('invalid-frame-native-plans');
 return Object.freeze({plan(input){
  if(!exactHostRecord(input,['targets'])||!Array.isArray(input.targets)||input.targets.length>200)throw Error('invalid-frame-native-targets');
  const targets=[],seen=new Map();
  for(const item of input.targets){
   if(!exactHostRecord(item,['refId','navigationURL'])||!tokenOK(item.refId)||['__proto__','prototype','constructor'].includes(item.refId)||typeof item.navigationURL!=='string'||item.navigationURL.length>2048)throw Error('invalid-frame-native-target');
   if(seen.has(item.refId))throw Error(seen.get(item.refId)===item.navigationURL?'duplicate-frame-native-target':'conflicting-frame-native-target');
   seen.set(item.refId,item.navigationURL);targets.push({refId:item.refId,navigationURL:item.navigationURL});
  }
  if(new TextEncoder().encode(JSON.stringify(targets)).length>65536)throw Error('frame-native-targets-too-large');
  const binding=bindingCurrent(),url=adapter.currentURL();
  const check=()=>{if(typeof binding!=='string'||!binding||binding.length>256||bindingCurrent()!==binding||adapter.currentURL()!==url)throw Error('stale-frame-native-plans');};check();
  const result=targets.map(({refId,navigationURL})=>{
   check();const plan=adapter.planNavigation({kind:'resolved',entity:'conversation',nativeId:refId,navigationURL,liveHandle:null});check();
   const targetKey=adapter.planKey(plan);check();return {refId,plan,targetKey};
  });
  if(new TextEncoder().encode(JSON.stringify(result)).length>65536)throw Error('frame-native-plans-too-large');check();return result;
 }});
}
