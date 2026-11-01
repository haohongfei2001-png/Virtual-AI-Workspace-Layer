/** A delayed timer must not turn an overdue response into a successful request. */
export async function withRequestDeadline(work,{timeoutMs=6000,now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
  if(typeof work!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw Error('invalid-request-deadline');
  const started=now();let timer;
  try{
    const deadline=new Promise((_,reject)=>{timer=schedule(()=>reject(Error('request-timeout')),timeoutMs);});
    const result=await Promise.race([work(),deadline]);
    if(now()-started>=timeoutMs)throw Error('request-timeout');
    return result;
  }finally{cancel(timer);}
}
