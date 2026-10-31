/** Bounded presentation intent only: no rows, receipts or native action plans. */
const bad=()=>{throw Error('invalid-frame-row-windows');};
export const frameRowWindowKey=({groupId,list})=>JSON.stringify([groupId,list]);
export function validateFrameRowWindows(value){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>74||Reflect.ownKeys(value).length!==value.length+1)bad();
 const seen=new Set(),result=[];
 for(let i=0;i<value.length;i++){
  const item=Object.getOwnPropertyDescriptor(value,String(i));if(!item||!Object.hasOwn(item,'value')||!item.enumerable)bad();
  const raw=item.value;if(!raw||Object.getPrototypeOf(raw)!==Object.prototype)bad();
  const keys=Reflect.ownKeys(raw),required=['groupId','list','rowOffset','rowLimit'];
  if(keys.some(k=>![...required,'paged'].includes(k))||required.some(k=>!keys.includes(k)))bad();
  const copy={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(raw,k);if(!d||!Object.hasOwn(d,'value')||!d.enumerable)bad();copy[k]=d.value;}
  const {groupId,list,rowOffset,rowLimit}=copy;
  if(groupId!==null&&(typeof groupId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(groupId)||['__proto__','prototype','constructor'].includes(groupId))||!(groupId===null?['noProject','unknown']:['current','old','unknown']).includes(list)||!Number.isSafeInteger(rowOffset)||rowOffset<0||rowOffset>1000000||!(rowLimit===200||Number.isSafeInteger(rowLimit)&&rowLimit>=5&&rowLimit<=197&&(rowLimit-5)%12===0)||Object.hasOwn(copy,'paged')&&copy.paged!==true)bad();
  const key=frameRowWindowKey(copy);if(seen.has(key))bad();seen.add(key);result.push(copy);
 }
 return result;
}
