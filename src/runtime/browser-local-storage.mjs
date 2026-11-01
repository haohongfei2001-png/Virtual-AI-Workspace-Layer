import {normalizedScope} from '../b1/identity.mjs';
/** Route explicitly local scopes to existing persistent repositories or the
 * RAM adapter. Neither branch can be used to read a strict server namespace. */
export function browserLocalStorage(memory,persistent){
 return new Proxy({}, {get(_target,name){
  if(Object.hasOwn(_target,name))return _target[name];
  if(typeof memory?.[name]!=='function'&&typeof persistent?.[name]!=='function')return undefined;
  return (scope,...args)=>{
   const s=normalizedScope(scope);if(s?.kind!=='browser-local')throw Error('not-a-browser-local-scope');
   const target=s.storage==='personal'?persistent:memory;
   if(typeof target?.[name]!=='function')throw Error('local-storage-operation-unavailable');
   return target[name](s,...args);
  };
 }});
}
