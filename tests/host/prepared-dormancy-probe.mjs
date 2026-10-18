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
