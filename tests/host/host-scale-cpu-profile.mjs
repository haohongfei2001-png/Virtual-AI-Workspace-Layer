/** Diagnostic sampling of one EXISTING worker. transport is connectJ4Debugger's
 * flattened-wire adapter, not a Playwright CDPSession. Caller owns transport.close(). */
export async function startHostScaleCPUProfile({transport,extensionId,sampleMs=10000,commandTimeoutMs=1500}={}){
 const report={kind:'DIAGNOSTIC_ONLY_HOST_SCALE_WORKER_CPU',acceptance:'NOT_ESTABLISHED',status:'UNAVAILABLE',requestedSampleMs:sampleMs};
 if(!/^[a-p]{32}$/.test(extensionId??'')||!Number.isInteger(sampleMs)||sampleMs<1||sampleMs>10000||!Number.isInteger(commandTimeoutMs)||commandTimeoutMs<1||commandTimeoutMs>1500||!['send','on','off'].every(k=>typeof transport?.[k]==='function'))throw Error('invalid-worker-cpu-profile-options');
 let sessionId,targetId,sequence=0,broken=false,closing=false,started=false,startAttempted=false,sampleTimer,ending,resolveFinished,startedAt;
 const pending=new Map(),finished=new Promise(resolve=>{resolveFinished=resolve;});
 const bounded=async(task,ms=commandTimeoutMs)=>{let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('command-timeout')),ms);})]);}finally{clearTimeout(timer);}};
 const fail=reason=>{broken=true;report.reason??=reason;for(const p of pending.values())p.reject(Error(reason));pending.clear();};
 const receive=e=>{if(e.sessionId!==sessionId)return;let m;try{m=JSON.parse(e.message);}catch{fail('invalid-transport-message');return;}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error('profiler-command-failed')):p.resolve(m.result);};
 const detached=e=>{if(!closing&&e.sessionId===sessionId){fail('target-lost');void finish();}},destroyed=e=>{if(!closing&&e.targetId===targetId){fail('target-lost');void finish();}},closed=()=>{if(!closing){fail('transport-closed');void finish();}};
 const send=async(method,params={},cleanup=false)=>{if(broken&&!cleanup)throw Error('target-lost');const id=++sequence;try{return await bounded(new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});Promise.resolve().then(()=>transport.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})})).catch(()=>{pending.delete(id);reject(Error('profiler-command-failed'));});}));}finally{pending.delete(id);}};
 async function finish(){
  if(ending)return ending;
  ending=(async()=>{clearTimeout(sampleTimer);
   try{if((started||startAttempted)&&!['target-lost','transport-closed'].includes(report.reason)){const result=await send('Profiler.stop',{},true);if(!started||broken)throw Error('incomplete-sampling');const p=result?.profile;if(!p||!Array.isArray(p.nodes)||p.nodes.length>100000||!Array.isArray(p.samples)||p.samples.length>100000||!Array.isArray(p.timeDeltas)||p.timeDeltas.length!==p.samples.length)throw Error('invalid-cpu-profile');report.profile=p;report.status='CAPTURED';report.observedSampleMs=Math.max(0,performance.now()-startedAt);}else report.reason??='sampling-not-started';}
   catch{report.status='UNAVAILABLE';report.reason??='profile-stop-unavailable';}
   finally{
    closing=true;if(sessionId)try{await bounded(transport.send('Target.detachFromTarget',{sessionId}));}catch{report.status='UNAVAILABLE';report.reason??='detach-unavailable';}
    transport.off('Target.receivedMessageFromTarget',receive);transport.off('Target.detachedFromTarget',detached);transport.off('Target.targetDestroyed',destroyed);transport.off('transportClosed',closed);for(const p of pending.values())p.reject(Error('inspection-closed'));pending.clear();resolveFinished(report);
   }return report;})();return ending;
 }
 transport.on('Target.receivedMessageFromTarget',receive);transport.on('Target.detachedFromTarget',detached);transport.on('Target.targetDestroyed',destroyed);transport.on('transportClosed',closed);
 const until=performance.now()+Math.min(4500,commandTimeoutMs*3),setup=task=>bounded(task,Math.max(1,Math.min(commandTimeoutMs,until-performance.now())));
 try{
  const result=await setup(transport.send('Target.getTargets'));
  if(ending||broken)throw Error('setup-deadline');const matches=result.targetInfos?.filter(t=>t.type==='service_worker'&&t.url===`chrome-extension://${extensionId}/extension/worker.mjs`);
  if(matches?.length!==1||typeof matches[0].targetId!=='string')throw Error('unique-existing-worker-required');targetId=matches[0].targetId;
  const attach=Promise.resolve(transport.send('Target.attachToTarget',{targetId,flatten:true}));let attached;
  try{attached=await setup(attach);}catch(error){void attach.then(r=>r?.sessionId?bounded(transport.send('Target.detachFromTarget',{sessionId:r.sessionId})):null).catch(()=>{});throw error;}
  if(ending||broken){if(attached?.sessionId)try{await bounded(transport.send('Target.detachFromTarget',{sessionId:attached.sessionId}));}catch{}throw Error('setup-deadline');}
  sessionId=attached?.sessionId;if(typeof sessionId!=='string'||!sessionId)throw Error('invalid-session');
  for(const [method,params]of [['Profiler.enable',{}],['Profiler.setSamplingInterval',{interval:1000}],['Profiler.start',{}]]){if(performance.now()>=until||ending)throw Error('setup-deadline');if(method==='Profiler.start')startAttempted=true;await setup(send(method,params));}
  if(ending||broken)throw Error('setup-deadline');started=true;startedAt=performance.now();sampleTimer=setTimeout(()=>{void finish();},sampleMs);
 }catch(error){fail(['unique-existing-worker-required','invalid-session','setup-deadline'].includes(error.message)?error.message:'setup-unavailable');await finish();}
 return Object.freeze({finish,finished});
}
