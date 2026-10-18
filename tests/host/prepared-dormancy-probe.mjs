/** Offline driver only: sample and start in one JS turn, never retry a close.
 * null means no attempt was made. Refusal is a terminal result. Keep the same
 * Promise across lost/late CDP observations so polling cannot issue a new close.
 */
export function createPreparedDormancyProbe(session){
 let attempted=null;
 return async function attempt(){
  if(attempted)return attempted;
  const prepared=session.prepareIdle();
  if(!prepared?.isCurrent?.())return null;
  attempted=(async()=>{try{return {prepared:true,entered:await session.enterDormant()===true};}catch{return {prepared:true,entered:false};}})();
  return attempted;
 };
}

/** Worker readiness is a passive prerequisite, never a substitute for CHECK.
 * All observations and the one existing attempt share the caller's deadline.
 */
export function createWorkerPreparedDormancyProbe({workerIdle,attempt}){
 let pending=null,terminal=null;
 return function probe(){
  if(terminal)return terminal;if(pending)return pending;
  const current=Promise.resolve().then(workerIdle).then(ready=>ready===true?attempt():null);pending=current;
  current.then(result=>{if(result!==null)terminal=current;if(pending===current)pending=null;},()=>{terminal=current;if(pending===current)pending=null;});
  return current;
 };
}

/** Preserve a terminal probe exception through a generic observer that catches
 * transient reads. No new timer or second attempt is introduced. */
export async function observeWorkerPreparedDormancy(poll,probe){
 const result=await poll(()=>Promise.resolve().then(probe).then(value=>value===null?null:{value},error=>({error})));
 if(Object.hasOwn(result,'error'))throw result.error;
 return result.value;
}
