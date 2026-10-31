/** Capture strict JSON data in one pass without invoking toJSON or iterators.
 * Each property is observed once, including accessors. Unlike structuredClone,
 * this cannot erase an unsupported prototype before the original validators run.
 */
export function captureJSONSnapshot(value){
 const copies=new WeakMap(),active=new WeakSet();
 const capture=value=>{
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))throw Error('non-json-value');return value;}
  if(typeof value!=='object')throw Error('non-json-value');
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
  if(prototype!==null&&prototype!==(array?Array.prototype:Object.prototype))throw Error('non-json-object');
  if(active.has(value))throw Error('non-json-value');
  if(copies.has(value))return copies.get(value);
  const length=array?value.length:0,copy=array?new Array(length):Object.create(prototype);copies.set(value,copy);active.add(value);
  const field=key=>Object.defineProperty(copy,key,{value:capture(value[key]),enumerable:true,writable:true,configurable:true});
  if(array){for(let index=0;index<length;index++){if(!Object.hasOwn(value,index))throw Error('non-json-value');field(index);}}
  else for(const key of Object.keys(value))field(key);
  active.delete(value);return copy;
 };
 return capture(value);
}
