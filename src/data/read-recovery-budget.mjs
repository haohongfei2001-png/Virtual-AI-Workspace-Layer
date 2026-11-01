/** One foreground read/recovery lifetime, including its internal retries. */
export function createReadRecoveryBudget({durationMs=30000,now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,onExpire=()=>{}}={}){
 if(!Number.isFinite(durationMs)||durationMs<=0||[now,schedule,cancel,onExpire].some(fn=>typeof fn!=='function'))throw Error('invalid-read-recovery-budget');
 let deadline=null,timer=null,expired=false,epoch=0;
 const expire=()=>{
  if(expired)return;
  expired=true;
  if(timer!==null)cancel(timer);
  timer=null;onExpire();
 };
 const remaining=()=>{
  if(expired)return 0;
  if(deadline===null)return Infinity;
  const left=deadline-now();
  if(left<=0){expire();return 0;}
  return left;
 };
 const arm=()=>{
  const ticket=epoch;
  timer=schedule(()=>{
   if(ticket!==epoch||expired)return;
   timer=null;
   const left=remaining();
   if(left>0&&left!==Infinity)arm();
  },Math.max(1,deadline-now()));
 };
 const reset=()=>{epoch++;if(timer!==null)cancel(timer);timer=null;deadline=null;expired=false;};
 return {
  begin(){if(remaining()===0)return false;if(deadline===null){deadline=now()+durationMs;arm();}return true;},
  remaining,
  check(){if(remaining()===0)throw Error('read-budget-exhausted');},
  reset,complete:reset,
  get expired(){return expired;}
 };
}
