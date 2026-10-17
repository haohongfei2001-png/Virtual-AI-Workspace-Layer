/** Diagnostic sampling of EXISTING synthetic-fixture targets. The flattened-wire
 * transport belongs to the caller and must stay open until every finished settles.
 * Native-page discovery is connection-scoped and ends when the caller closes it. */
export async function startHostScaleCPUProfile({transport,extensionId,sampleMs=10000,commandTimeoutMs=1500,clockAlignment=false}={}){
 if(!/^[a-p]{32}$/.test(extensionId??''))throw Error('invalid-worker-cpu-profile-options');
 return startProfile({transport,sampleMs,commandTimeoutMs,clockAlignment,kind:'WORKER',matches:t=>t.type==='service_worker'&&t.url===`chrome-extension://${extensionId}/extension/worker.mjs`});
}
/** Only the caller's exact existing page at this runner's fixed synthetic project
 * path is eligible. No navigation, new target, broad URL match or fallback. */
export async function startHostScalePageCPUProfile({transport,targetId,expectedURL,sampleMs=10000,commandTimeoutMs=1500,clockAlignment=false}={}){
 const urlMatch=typeof expectedURL==='string'&&/^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/g\/g-p-00000000000000000000000000000001\/project$/.exec(expectedURL);
 if(typeof targetId!=='string'||targetId.length<1||targetId.length>128||/[^A-Za-z0-9_-]/.test(targetId)||!urlMatch||urlMatch[0]!==expectedURL||Number(urlMatch[1])>65535)throw Error('invalid-page-cpu-profile-options');
 return startProfile({transport,sampleMs,commandTimeoutMs,clockAlignment,kind:'NATIVE_PAGE',matches:t=>t?.targetId===targetId&&t.type==='page'&&t.url===expectedURL,identity:{targetId,url:expectedURL}});
}
async function startProfile({transport,sampleMs,commandTimeoutMs,clockAlignment,kind,matches:matchesTarget,identity}){
 const report={kind:`DIAGNOSTIC_ONLY_HOST_SCALE_${kind}_CPU`,acceptance:'NOT_ESTABLISHED',status:'UNAVAILABLE',requestedSampleMs:sampleMs,...identity?{target:identity}:{}};
 if(typeof clockAlignment!=='boolean'||!Number.isInteger(sampleMs)||sampleMs<1||sampleMs>10000||!Number.isInteger(commandTimeoutMs)||commandTimeoutMs<1||commandTimeoutMs>1500||!['send','on','off'].every(k=>typeof transport?.[k]==='function'))throw Error(`invalid-${identity?'page':'worker'}-cpu-profile-options`);
 // These are runner-side CDP command bounds, not the actual sampling start/stop
 // instant. CDP profile microseconds retain their original unmapped clock.
 if(clockAlignment)report.clockCorrelation={kind:'RUNNER_CDP_COMMAND_BOUNDS_NOT_ACTUAL_SAMPLE_INSTANTS',profileClock:'UNMAPPED_CDP_MICROSECONDS'};
 const clock=()=>{const wallTimeMs=Date.now(),monotonicMs=performance.now(),timeOriginMs=performance.timeOrigin;return {wallTimeMs,monotonicMs,timeOriginMs,epochMs:timeOriginMs+monotonicMs};};
 let sessionId,targetId,sequence=0,broken=false,closing=false,started=false,startAttempted=false,sampleTimer,ending,resolveFinished,startedAt;
 const pending=new Map(),finished=new Promise(resolve=>{resolveFinished=resolve;});
 const bounded=async(task,ms=commandTimeoutMs)=>{let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('command-timeout')),ms);})]);}finally{clearTimeout(timer);}};
 const fail=reason=>{broken=true;report.reason??=reason;for(const p of pending.values())p.reject(Error(reason));pending.clear();};
 const receive=e=>{if(e.sessionId!==sessionId)return;let m;try{m=JSON.parse(e.message);}catch{fail('invalid-transport-message');return;}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error('profiler-command-failed')):p.resolve(m.result);};
 const changed=e=>{if(identity&&!closing&&e.targetInfo?.targetId===targetId&&!matchesTarget(e.targetInfo)){fail('target-identity-changed');void finish();}};
 const verifyIdentity=async()=>{const r=await bounded(transport.send('Target.getTargetInfo',{targetId}));if(!matchesTarget(r?.targetInfo))throw Error('target-identity-changed');};
 const detached=e=>{if(!closing&&e.sessionId===sessionId){fail('target-lost');void finish();}},destroyed=e=>{if(!closing&&e.targetId===targetId){fail('target-lost');void finish();}},closed=()=>{if(!closing){fail('transport-closed');void finish();}};
 const send=async(method,params={},cleanup=false)=>{if(broken&&!cleanup)throw Error('target-lost');const id=++sequence;try{return await bounded(new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});Promise.resolve().then(()=>transport.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})})).catch(()=>{pending.delete(id);reject(Error('profiler-command-failed'));});}));}finally{pending.delete(id);}};
 async function finish(){
  if(ending)return ending;
  ending=(async()=>{clearTimeout(sampleTimer);
   try{if((started||startAttempted)&&!['target-lost','transport-closed'].includes(report.reason)){if(clockAlignment)report.clockCorrelation.stopRequested=clock();const result=await send('Profiler.stop',{},true),stoppedAt=performance.now();if(clockAlignment)report.clockCorrelation.stopAcknowledged=clock();if(!started||broken)throw Error('incomplete-sampling');if(identity){await verifyIdentity();if(broken)throw Error('incomplete-sampling');}const p=result?.profile;if(!p||!Array.isArray(p.nodes)||p.nodes.length>100000||!Array.isArray(p.samples)||p.samples.length>100000||!Array.isArray(p.timeDeltas)||p.timeDeltas.length!==p.samples.length)throw Error('invalid-cpu-profile');report.profile=p;report.status='CAPTURED';report.observedSampleMs=Math.max(0,stoppedAt-startedAt);}else report.reason??='sampling-not-started';}
   catch{report.status='UNAVAILABLE';report.reason??='profile-stop-unavailable';}
   finally{
    closing=true;if(sessionId)try{await bounded(transport.send('Target.detachFromTarget',{sessionId}));}catch{report.status='UNAVAILABLE';report.reason??='detach-unavailable';}
    if(identity)transport.off('Target.targetInfoChanged',changed);transport.off('Target.receivedMessageFromTarget',receive);transport.off('Target.detachedFromTarget',detached);transport.off('Target.targetDestroyed',destroyed);transport.off('transportClosed',closed);for(const p of pending.values())p.reject(Error('inspection-closed'));pending.clear();resolveFinished(report);
   }return report;})();return ending;
 }
 if(identity)transport.on('Target.targetInfoChanged',changed);transport.on('Target.receivedMessageFromTarget',receive);transport.on('Target.detachedFromTarget',detached);transport.on('Target.targetDestroyed',destroyed);transport.on('transportClosed',closed);
 const until=performance.now()+Math.min(4500,commandTimeoutMs*3),setup=task=>bounded(task,Math.max(1,Math.min(commandTimeoutMs,until-performance.now())));
 try{
  // Target info notifications require discovery. Keep the worker type eligible
  // because getTargets inherits this connection's discovery filter when omitted.
  // This only observes targets; it never auto-attaches or creates/navigates one.
  if(identity){await setup(transport.send('Target.setDiscoverTargets',{discover:true,filter:[{type:'page'},{type:'service_worker'},{exclude:true}]}));if(ending||broken)throw Error('setup-deadline');}
  const result=await setup(transport.send('Target.getTargets'));
  if(ending||broken)throw Error('setup-deadline');const matches=result.targetInfos?.filter(matchesTarget);
  if(matches?.length!==1||typeof matches[0].targetId!=='string')throw Error(identity?'exact-existing-page-required':'unique-existing-worker-required');targetId=matches[0].targetId;
  const attach=Promise.resolve(transport.send('Target.attachToTarget',{targetId,flatten:true}));let attached;
  try{attached=await setup(attach);}catch(error){void attach.then(r=>r?.sessionId?bounded(transport.send('Target.detachFromTarget',{sessionId:r.sessionId})):null).catch(()=>{});throw error;}
  if(ending||broken){if(attached?.sessionId)try{await bounded(transport.send('Target.detachFromTarget',{sessionId:attached.sessionId}));}catch{}throw Error('setup-deadline');}
  sessionId=attached?.sessionId;if(typeof sessionId!=='string'||!sessionId)throw Error('invalid-session');
  if(identity)await setup(verifyIdentity());
  for(const [method,params]of [['Profiler.enable',{}],['Profiler.setSamplingInterval',{interval:1000}],['Profiler.start',{}]]){if(performance.now()>=until||ending)throw Error('setup-deadline');if(method==='Profiler.start'){startAttempted=true;if(clockAlignment)report.clockCorrelation.startRequested=clock();}await setup(send(method,params));if(method==='Profiler.start'&&clockAlignment)report.clockCorrelation.startAcknowledged=clock();}
  if(ending||broken)throw Error('setup-deadline');started=true;startedAt=performance.now();sampleTimer=setTimeout(()=>{void finish();},sampleMs);
 }catch(error){fail(['unique-existing-worker-required','exact-existing-page-required','target-identity-changed','invalid-session','setup-deadline'].includes(error.message)?error.message:'setup-unavailable');await finish();}
 return Object.freeze({finish,finished});
}
