/** Offline fixture wait only; never changes the production 30-second budget. */
export async function waitForBudgetExpiry(startedAt,{
 now=Date.now,
 sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 monotonicNow=()=>performance.now(),
}={}){
 const wall=now(),begin=monotonicNow();
 if(!Number.isFinite(startedAt)||!Number.isFinite(wall)||!Number.isFinite(begin)||startedAt>wall+1000)throw Error('invalid-budget-start');
 const expires=startedAt+30000;
 if(!Number.isFinite(expires))throw Error('invalid-budget-start');
 if(wall>expires)return 0;
 const allowance=Math.min(31001,Math.max(0,expires-wall+1)+1000);
 let previous=begin;
 // A defensive ceiling also rejects clocks/sleep implementations that never advance.
 for(let attempts=0;attempts<10000;attempts++){
  const tick=monotonicNow(),current=now(),elapsed=tick-begin;
  if(!Number.isFinite(tick)||tick<previous||!Number.isFinite(current))throw Error('invalid-budget-clock');
  previous=tick;
  if(elapsed>allowance)throw Error('budget-expiry-deadline');
  if(current>expires)return elapsed;
  if(elapsed>=allowance)throw Error('budget-expiry-deadline');
  await sleep(Math.min(1000,Math.max(1,expires-current+1),allowance-elapsed));
 }
 throw Error('budget-expiry-clock-stalled');
}
