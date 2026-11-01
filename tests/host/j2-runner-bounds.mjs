/** Test-runner deadlines only; no product budget, authority or clock changes. */
export async function j2Within(stage,task,timeoutMs=5000){
 if(typeof stage!=='string'||!stage||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw Error('invalid-j2-deadline');
 let timer;
 try{return await Promise.race([Promise.resolve().then(task),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('J2-deadline:'+stage)),timeoutMs);})]);}
 finally{clearTimeout(timer);}
}
export async function j2Poll(fn,timeout=25000,{interval=80,now=Date.now}={}){
 const end=now()+timeout;
 while(now()<end){
  try{const value=await j2Within('observation',fn,Math.max(1,end-now()));if(value)return value;}catch{}
  const remaining=end-now();if(remaining>0)await new Promise(resolve=>setTimeout(resolve,Math.min(interval,remaining)));
 }
 throw Error('J2-observation-timeout');
}
/** Serializable worker callback. Only an actual fetch rejection before our
 * abort is rejection evidence; a deadline is UNKNOWN, never a passing probe. */
export async function j2ExternalProbe(timeoutMs=1500){
 const controller=new AbortController();let timer,expired=false;
 try{return await Promise.race([
  Promise.resolve().then(()=>fetch('https://example.com/',{signal:controller.signal})).then(()=> 'REACHABLE',()=>expired?'TIMEOUT':'BLOCKED'),
  new Promise(resolve=>{timer=setTimeout(()=>{expired=true;controller.abort();resolve('TIMEOUT');},timeoutMs);}),
 ]);}finally{clearTimeout(timer);controller.abort();}
}
export function createJ2Progress({append,now=Date.now}){
 let sequence=Promise.resolve();
 return stage=>{
  if(typeof stage!=='string'||!/^[a-z0-9-]{1,80}$/.test(stage))throw Error('invalid-j2-progress-stage');
  const row=JSON.stringify({stage,at:now()})+'\n';
  sequence=sequence.catch(()=>{}).then(()=>j2Within('progress-write',()=>append(row),1500));
  return sequence;
 };
}
/** Evidence completion is separate from the eight functional assertions.
 * Secondary failures never replace the original journey error. */
export function j2EvidenceStatus(report){
 const errors=report.diagnosticErrors??[],result={status:report.status};
 if(errors.length)result.diagnosticsStatus='INCOMPLETE';
 if(report.status!=='PASS_OFFLINE_J2_JOURNEY')return result;
 const required=new Set(['source-hashes','context-close','server-close','server-snapshot','report-write']);
 if(report.sourceChangedDuringRun===true)result.status='SOURCE_CHANGED';
 else if(report.sourceChangedDuringRun!==false||errors.some(row=>required.has(row.stage)))result.status='INCOMPLETE_EVIDENCE';
 else if(errors.length)result.status='PASS_WITH_INCOMPLETE_DIAGNOSTICS';
 return result;
}
