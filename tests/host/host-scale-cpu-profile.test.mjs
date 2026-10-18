import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {startHostScaleCPUProfile,startHostScalePageCPUProfile} from './host-scale-cpu-profile.mjs';
const extensionId='a'.repeat(32),url=`chrome-extension://${extensionId}/extension/worker.mjs`;
function fixture({targets=[{targetId:'worker',type:'service_worker',url}],hang=null,fail=null,lateAttach=false}={}){
 const t=new EventEmitter(),calls=[];t.send=async(method,params)=>{calls.push({method,params});if(method===hang)return new Promise(()=>{});if(method===fail)throw Error('failure');if(method==='Target.getTargets')return {targetInfos:targets};if(method==='Target.attachToTarget'){if(lateAttach)await new Promise(r=>setTimeout(r,30));return {sessionId:'owned'};}
 if(method==='Target.sendMessageToTarget'){const m=JSON.parse(params.message);if(m.method===hang)return;if(m.method===fail){t.emit('Target.receivedMessageFromTarget',{sessionId:'owned',message:JSON.stringify({id:m.id,error:{code:-1}})});return;}t.emit('Target.receivedMessageFromTarget',{sessionId:'wrong',message:JSON.stringify({id:m.id,error:{code:-1}})});t.emit('Target.receivedMessageFromTarget',{sessionId:'owned',message:JSON.stringify({id:m.id,result:m.method==='Profiler.stop'?{profile:{nodes:[{id:1,callFrame:{functionName:'test'}}],samples:[1],timeDeltas:[1000],startTime:0,endTime:1000}}:{}})});}return {};};
 return {transport:t,calls,options:{transport:t,extensionId,sampleMs:5,commandTimeoutMs:10}};
}
const methods=f=>f.calls.flatMap(c=>c.method==='Target.sendMessageToTarget'?[JSON.parse(c.params.message).method]:[c.method]);
const cleaned=f=>{for(const event of ['Target.receivedMessageFromTarget','Target.detachedFromTarget','Target.targetDestroyed','transportClosed'])assert.equal(f.transport.listenerCount(event),0);};
test('automatic bounded sample uses exact existing worker and flattened Profiler-only session',async()=>{const f=fixture(),h=await startHostScaleCPUProfile(f.options),r=await h.finished;assert.equal(r.status,'CAPTURED');assert.equal(r.kind,'DIAGNOSTIC_ONLY_HOST_SCALE_WORKER_CPU');assert.equal(r.acceptance,'NOT_ESTABLISHED');assert.equal(r.profile.samples.length,1);assert.deepEqual(f.calls.find(c=>c.method==='Target.attachToTarget').params,{targetId:'worker',flatten:true});assert.deepEqual(methods(f),['Target.getTargets','Target.attachToTarget','Profiler.enable','Profiler.setSamplingInterval','Profiler.start','Profiler.stop','Target.detachFromTarget']);assert.equal(await h.finish(),r);cleaned(f);});
test('finish stops early once, ignores foreign events and never closes caller transport',async()=>{const f=fixture(),h=await startHostScaleCPUProfile({...f.options,sampleMs:10000});f.transport.emit('Target.detachedFromTarget',{sessionId:'other'});const [a,b]=await Promise.all([h.finish(),h.finish()]);assert.equal(a,b);assert.equal(a.status,'CAPTURED');assert.equal(methods(f).filter(x=>x==='Profiler.stop').length,1);cleaned(f);});
for(const targets of [[],[{targetId:'wrong',type:'page',url}],[{targetId:'w',type:'service_worker',url:url+'x'}],[{targetId:'w1',type:'service_worker',url},{targetId:'w2',type:'service_worker',url}]])test('ambiguous or absent target never attaches or starts',async()=>{const f=fixture({targets}),h=await startHostScaleCPUProfile(f.options);assert.equal((await h.finished).status,'UNAVAILABLE');assert.deepEqual(methods(f),['Target.getTargets']);cleaned(f);});
for(const event of ['Target.detachedFromTarget','Target.targetDestroyed','transportClosed'])test('lost target '+event+' yields unavailable without replacement',async()=>{const f=fixture(),h=await startHostScaleCPUProfile({...f.options,sampleMs:10000});f.transport.emit(event,{sessionId:'owned',targetId:'worker'});assert.equal((await h.finished).status,'UNAVAILABLE');assert.equal(f.calls.filter(c=>c.method==='Target.getTargets').length,1);cleaned(f);});
for(const hang of ['Target.getTargets','Profiler.enable','Profiler.start','Profiler.stop','Target.detachFromTarget'])test('bounded timeout '+hang+' still terminates',async()=>{const f=fixture({hang}),h=await startHostScaleCPUProfile(f.options),r=await h.finished;assert.equal(r.status,'UNAVAILABLE');cleaned(f);if(hang!=='Target.getTargets')assert(methods(f).includes('Target.detachFromTarget'));});
test('late attach is detached and never receives profiler commands',async()=>{const f=fixture({lateAttach:true}),h=await startHostScaleCPUProfile(f.options);assert.equal((await h.finished).status,'UNAVAILABLE');await new Promise(r=>setTimeout(r,40));assert.deepEqual(methods(f),['Target.getTargets','Target.attachToTarget','Target.detachFromTarget']);cleaned(f);});
test('setup rejection cleans the exact session',async()=>{const f=fixture({fail:'Profiler.enable'}),h=await startHostScaleCPUProfile(f.options);assert.equal((await h.finished).status,'UNAVAILABLE');assert.equal(f.calls.at(-1).params.sessionId,'owned');cleaned(f);});
test('invalid identity and extended sample budget reject before any transport command',async()=>{const f=fixture();for(const patch of [{extensionId:'foreign'},{sampleMs:10001},{commandTimeoutMs:1501}])await assert.rejects(startHostScaleCPUProfile({...f.options,...patch}),/invalid/);assert.equal(f.calls.length,0);});
test('normal detach notification does not turn successful sample into target loss',async()=>{const f=fixture(),send=f.transport.send;f.transport.send=async(method,params)=>{const r=await send(method,params);if(method==='Target.detachFromTarget')f.transport.emit('Target.detachedFromTarget',{sessionId:'owned'});return r;};const h=await startHostScaleCPUProfile(f.options),r=await h.finished;assert.equal(r.status,'CAPTURED');assert.equal(r.reason,undefined);cleaned(f);});
for(const phase of ['Target.getTargets','Target.attachToTarget'])test('transport closes while setup awaits '+phase+' cannot leak late session',async()=>{
 const f=fixture(),send=f.transport.send;let release,entered;const waiting=new Promise(r=>{entered=r;});f.transport.send=async(method,params)=>{if(method===phase){entered();await new Promise(r=>{release=r;});}return send(method,params);};
 const start=startHostScaleCPUProfile(f.options);await waiting;f.transport.emit('transportClosed');release();const h=await start,r=await h.finished;assert.equal(r.status,'UNAVAILABLE');assert(!methods(f).some(x=>x.startsWith('Profiler.')));if(phase==='Target.getTargets')assert(!methods(f).includes('Target.attachToTarget'));else assert.equal(methods(f).filter(x=>x==='Target.detachFromTarget').length,1);cleaned(f);
});

const nativeURL='http://127.0.0.1:43123/g/g-p-00000000000000000000000000000001/project';
const nativeTarget={targetId:'native-page',type:'page',url:nativeURL};
function pageFixture({targets=[nativeTarget],targetInfo=nativeTarget,...options}={}){
 const f=fixture({targets,...options}),send=f.transport.send;
 f.transport.send=async(method,params)=>{
  if(method==='Target.getTargetInfo'){
   f.calls.push({method,params});if(options.hang===method)return new Promise(()=>{});if(options.fail===method)throw Error('failure');
   return {targetInfo:typeof targetInfo==='function'?targetInfo():targetInfo};
  }
  return send(method,params);
 };
 return {...f,options:{transport:f.transport,targetId:nativeTarget.targetId,expectedURL:nativeURL,sampleMs:10000,commandTimeoutMs:10}};
}
const pageCleaned=f=>{cleaned(f);assert.equal(f.transport.listenerCount('Target.targetInfoChanged'),0);};
test('native CPU uses only exact existing page and verifies identity after attach and after stop',async()=>{
 const f=pageFixture({targets:[{targetId:'other-page',type:'page',url:nativeURL},nativeTarget]}),h=await startHostScalePageCPUProfile(f.options),r=await h.finish();
 assert.equal(r.status,'CAPTURED');assert.equal(r.kind,'DIAGNOSTIC_ONLY_HOST_SCALE_NATIVE_PAGE_CPU');assert.equal(r.acceptance,'NOT_ESTABLISHED');assert.deepEqual(r.target,{targetId:'native-page',url:nativeURL});
 assert.deepEqual(f.calls.find(c=>c.method==='Target.attachToTarget').params,{targetId:'native-page',flatten:true});
 assert.deepEqual(methods(f),['Target.setDiscoverTargets','Target.getTargets','Target.attachToTarget','Target.getTargetInfo','Profiler.enable','Profiler.setSamplingInterval','Profiler.start','Profiler.stop','Target.getTargetInfo','Target.detachFromTarget']);
 assert.equal(await h.finished,r);pageCleaned(f);
});
for(const targets of [[],[{...nativeTarget,targetId:'foreign'}],[{...nativeTarget,type:'service_worker'}],[{...nativeTarget,url:nativeURL+'?x'}],[nativeTarget,nativeTarget]])test('native CPU rejects absent, wrong or duplicate exact identity before attach '+JSON.stringify(targets),async()=>{
 const f=pageFixture({targets}),h=await startHostScalePageCPUProfile(f.options),r=await h.finished;
 assert.equal(r.status,'UNAVAILABLE');assert.equal(r.reason,'exact-existing-page-required');assert.deepEqual(methods(f),['Target.setDiscoverTargets','Target.getTargets']);pageCleaned(f);
});
for(const targetInfo of [undefined,{...nativeTarget,targetId:'replaced'},{...nativeTarget,type:'iframe'},{...nativeTarget,url:nativeURL.replace('43123','43124')},{...nativeTarget,url:'https://chatgpt.com/'}])test('native CPU rechecks actual target identity before enabling Profiler '+JSON.stringify(targetInfo),async()=>{
 const f=pageFixture({targetInfo:()=>targetInfo}),h=await startHostScalePageCPUProfile(f.options),r=await h.finished;
 assert.equal(r.status,'UNAVAILABLE');assert.equal(r.reason,'target-identity-changed');assert(!methods(f).some(x=>x.startsWith('Profiler.')));assert.equal(f.calls.at(-1).params.sessionId,'owned');pageCleaned(f);
});
test('native CPU rejects unannounced navigation at final identity verification',async()=>{
 let target=nativeTarget;const f=pageFixture({targetInfo:()=>target}),h=await startHostScalePageCPUProfile(f.options);target={...nativeTarget,url:nativeURL+'#other'};
 const r=await h.finish();assert.equal(r.status,'UNAVAILABLE');assert.equal(r.profile,undefined);assert(methods(f).includes('Profiler.stop'));pageCleaned(f);
});
test('native target info change invalidates sampling without following the replacement page',async()=>{
 const f=pageFixture(),h=await startHostScalePageCPUProfile(f.options);
 f.transport.emit('Target.targetInfoChanged',{targetInfo:{...nativeTarget,targetId:'foreign',url:'https://chatgpt.com/'}});
 f.transport.emit('Target.targetInfoChanged',{targetInfo:nativeTarget});
 f.transport.emit('Target.targetInfoChanged',{targetInfo:{...nativeTarget,url:'https://chatgpt.com/'}});
 const r=await h.finished;assert.equal(r.status,'UNAVAILABLE');assert.equal(r.reason,'target-identity-changed');assert.equal(r.profile,undefined);assert.equal(methods(f).filter(x=>x==='Target.attachToTarget').length,1);pageCleaned(f);
});
for(const event of ['Target.detachedFromTarget','Target.targetDestroyed','transportClosed'])test('native target loss terminates bounded sampling '+event,async()=>{
 const f=pageFixture(),h=await startHostScalePageCPUProfile(f.options);f.transport.emit(event,{sessionId:'owned',targetId:'native-page'});
 const r=await h.finished;assert.equal(r.status,'UNAVAILABLE');assert.equal(r.profile,undefined);assert.equal(methods(f).filter(x=>x==='Target.attachToTarget').length,1);pageCleaned(f);
});
for(const hang of ['Target.setDiscoverTargets','Target.getTargets','Target.attachToTarget','Target.getTargetInfo','Profiler.enable','Profiler.setSamplingInterval','Profiler.start','Profiler.stop','Target.detachFromTarget'])test('native command timeout cleans all listeners '+hang,async()=>{
 const f=pageFixture({hang}),h=await startHostScalePageCPUProfile(f.options),r=await h.finish();assert.equal(r.status,'UNAVAILABLE');pageCleaned(f);
});
test('late native attach is detached with no profiler enable or fallback target',async()=>{
 const f=pageFixture({lateAttach:true}),h=await startHostScalePageCPUProfile(f.options);assert.equal((await h.finished).status,'UNAVAILABLE');
 await new Promise(r=>setTimeout(r,40));assert.deepEqual(methods(f),['Target.setDiscoverTargets','Target.getTargets','Target.attachToTarget','Target.detachFromTarget']);pageCleaned(f);
});
for(const phase of ['Target.setDiscoverTargets','Target.getTargets','Target.attachToTarget','Target.getTargetInfo'])test('native transport closure during '+phase+' cannot profile a late target',async()=>{
 const f=pageFixture(),send=f.transport.send;let release,entered;const waiting=new Promise(r=>{entered=r;});
 f.transport.send=async(method,params)=>{if(method===phase){entered();await new Promise(r=>{release=r;});}return send(method,params);};
 const start=startHostScalePageCPUProfile(f.options);await waiting;f.transport.emit('transportClosed');release();const h=await start,r=await h.finished;
 assert.equal(r.status,'UNAVAILABLE');assert(!methods(f).some(x=>x.startsWith('Profiler.')));pageCleaned(f);
});
test('invalid native options reject before any transport command',async()=>{
 const f=pageFixture();
 const urls=[null,undefined,'',nativeURL+'\n',nativeURL+'/',nativeURL+'?query',nativeURL+'#hash',nativeURL.replace('http:','https:'),nativeURL.replace('127.0.0.1','localhost'),nativeURL.replace('127.0.0.1','127.1'),nativeURL.replace('127.0.0.1','[::1]'),nativeURL.replace('127.0.0.1','user@127.0.0.1'),nativeURL.replace(':43123',':0'),nativeURL.replace(':43123',':65536'),nativeURL.replace(':43123',':043123'),nativeURL.replace(':43123',''),nativeURL.replace('/g/','/g/../g/'),nativeURL.replace('/project','/%70roject'),nativeURL.replace('00001/project','00002/project')];
 for(const expectedURL of urls)await assert.rejects(startHostScalePageCPUProfile({...f.options,expectedURL}),/invalid-page/);
 for(const patch of [{targetId:''},{targetId:undefined},{targetId:{}},{targetId:'a'.repeat(129)},{targetId:'native-page\n'},{targetId:'native/page'},{sampleMs:0},{sampleMs:10001},{sampleMs:1.5},{commandTimeoutMs:0},{commandTimeoutMs:1501},{commandTimeoutMs:NaN},{transport:{}}])await assert.rejects(startHostScalePageCPUProfile({...f.options,...patch}),/invalid-page/);
 assert.equal(f.calls.length,0);pageCleaned(f);
});
test('native target loss during final identity check cannot turn into CAPTURED',async()=>{
 const f=pageFixture(),send=f.transport.send;let checks=0;
 f.transport.send=async(method,params)=>{if(method==='Target.getTargetInfo'&&++checks===2)f.transport.emit('transportClosed');return send(method,params);};
 const h=await startHostScalePageCPUProfile(f.options),r=await h.finish();assert.equal(r.status,'UNAVAILABLE');assert.equal(r.reason,'transport-closed');assert.equal(r.profile,undefined);pageCleaned(f);
});
test('native final identity check has the same bounded command deadline and cleans up',async()=>{
 const f=pageFixture(),send=f.transport.send;let checks=0;
 f.transport.send=async(method,params)=>method==='Target.getTargetInfo'&&++checks===2?new Promise(()=>{}):send(method,params);
 const h=await startHostScalePageCPUProfile(f.options),r=await h.finish();assert.equal(r.status,'UNAVAILABLE');assert.equal(r.profile,undefined);assert.equal(f.calls.at(-1).method,'Target.detachFromTarget');pageCleaned(f);
});
test('native detach failure rejects capture and normal detach events do not reject it',async()=>{
 for(const fails of [false,true]){
  const f=pageFixture(),send=f.transport.send;
  f.transport.send=async(method,params)=>{if(method==='Target.detachFromTarget'){f.transport.emit('Target.detachedFromTarget',{sessionId:'owned'});if(fails)throw Error('detach failed');}return send(method,params);};
  const h=await startHostScalePageCPUProfile(f.options),r=await h.finish();assert.equal(r.status,fails?'UNAVAILABLE':'CAPTURED');assert.equal(r.reason,fails?'detach-unavailable':undefined);pageCleaned(f);
 }
});
test('native bounded automatic sample stops once and ignores events after listener cleanup',async()=>{
 const f=pageFixture(),h=await startHostScalePageCPUProfile({...f.options,sampleMs:5}),r=await h.finished;assert.equal(r.status,'CAPTURED');
 f.transport.emit('Target.targetInfoChanged',{targetInfo:{...nativeTarget,url:'https://chatgpt.com/'}});f.transport.emit('transportClosed');assert.equal(r.status,'CAPTURED');
 assert.equal(await h.finish(),r);assert.equal(methods(f).filter(x=>x==='Profiler.stop').length,1);pageCleaned(f);
});
test('parallel worker and native sessions isolate colliding command IDs and cleanup independently',async()=>{
 const transport=new EventEmitter(),calls=[],profile=session=>({nodes:[{id:1,callFrame:{functionName:session}}],samples:[1],timeDeltas:[1000]});
 transport.send=async(method,params)=>{
  calls.push({method,params});
  if(method==='Target.getTargets')return {targetInfos:[{targetId:'worker',type:'service_worker',url},nativeTarget]};
  if(method==='Target.attachToTarget')return {sessionId:'session-'+params.targetId};
  if(method==='Target.getTargetInfo')return {targetInfo:nativeTarget};
  if(method==='Target.sendMessageToTarget'){
   const m=JSON.parse(params.message);await Promise.resolve();
   transport.emit('Target.receivedMessageFromTarget',{sessionId:params.sessionId,message:JSON.stringify({id:m.id,result:m.method==='Profiler.stop'?{profile:profile(params.sessionId)}:{}})});
  }
  return {};
 };
 const [worker,page]=await Promise.all([startHostScaleCPUProfile({transport,extensionId,sampleMs:10000,commandTimeoutMs:20}),startHostScalePageCPUProfile({transport,targetId:nativeTarget.targetId,expectedURL:nativeURL,sampleMs:10000,commandTimeoutMs:20})]);
 assert.equal(transport.listenerCount('Target.receivedMessageFromTarget'),2);
 const w=await worker.finish();assert.equal(w.status,'CAPTURED');assert.equal(w.profile.nodes[0].callFrame.functionName,'session-worker');assert.equal(transport.listenerCount('Target.receivedMessageFromTarget'),1);
 assert(!calls.some(c=>c.method==='Target.detachFromTarget'&&c.params.sessionId==='session-native-page'));
 const p=await page.finish();assert.equal(p.status,'CAPTURED');assert.equal(p.profile.nodes[0].callFrame.functionName,'session-native-page');pageCleaned({transport});
 assert.equal(calls.filter(c=>c.method==='Target.attachToTarget').length,2);
 assert(calls.every(c=>['Target.setDiscoverTargets','Target.getTargets','Target.attachToTarget','Target.getTargetInfo','Target.sendMessageToTarget','Target.detachFromTarget'].includes(c.method)));
});
test('opt-in CPU clocks are runner command bounds, never a fabricated CDP epoch',async()=>{
 const f=pageFixture(),h=await startHostScalePageCPUProfile({...f.options,clockAlignment:true}),r=await h.finish(),c=r.clockCorrelation;
 assert.equal(r.status,'CAPTURED');assert.equal(c.kind,'RUNNER_CDP_COMMAND_BOUNDS_NOT_ACTUAL_SAMPLE_INSTANTS');assert.equal(c.profileClock,'UNMAPPED_CDP_MICROSECONDS');
 const clocks=['startRequested','startAcknowledged','stopRequested','stopAcknowledged'].map(key=>c[key]);
 for(const value of clocks){for(const k of ['wallTimeMs','monotonicMs','timeOriginMs','epochMs'])assert(Number.isFinite(value[k]));assert.equal(value.epochMs,value.timeOriginMs+value.monotonicMs);}
 for(let i=1;i<clocks.length;i++)assert(clocks[i].monotonicMs>=clocks[i-1].monotonicMs);
 assert.equal(r.profile.startTime,0);assert.equal(r.profile.endTime,1000);assert.equal(r.clockCorrelation.sampleStartEpochMs,undefined);
 assert(!methods(f).some(x=>x.startsWith('Runtime.')));pageCleaned(f);
 const plain=fixture(),p=await startHostScaleCPUProfile(plain.options);assert.equal((await p.finished).clockCorrelation,undefined);
});
test('CPU wall clock jumps remain raw observations and do not change local sample elapsed time',async()=>{
 const realNow=Date.now;let wall=1000;Date.now=()=>wall--;
 try{
  const f=fixture(),h=await startHostScaleCPUProfile({...f.options,clockAlignment:true}),r=await h.finish(),c=r.clockCorrelation;
  assert.equal(r.status,'CAPTURED');assert(c.stopAcknowledged.wallTimeMs<c.startRequested.wallTimeMs);assert(c.stopAcknowledged.epochMs>=c.startRequested.epochMs);assert(r.observedSampleMs>=0);cleaned(f);
 }finally{Date.now=realNow;}
});
test('failed start retains only observed command bounds and cannot certify a sample',async()=>{
 const f=fixture({fail:'Profiler.start'}),h=await startHostScaleCPUProfile({...f.options,clockAlignment:true}),r=await h.finished;
 assert.equal(r.status,'UNAVAILABLE');assert(r.clockCorrelation.startRequested);assert.equal(r.clockCorrelation.startAcknowledged,undefined);assert.equal(r.profile,undefined);cleaned(f);
});
test('clock opt-in must be boolean and cannot weaken native identity checks',async()=>{
 const worker=fixture(),page=pageFixture();for(const clockAlignment of [1,'true',null,{}]){
  await assert.rejects(startHostScaleCPUProfile({...worker.options,clockAlignment}),/invalid-worker/);
  await assert.rejects(startHostScalePageCPUProfile({...page.options,clockAlignment}),/invalid-page/);
 }
 await assert.rejects(startHostScalePageCPUProfile({...page.options,clockAlignment:true,expectedURL:'https://chatgpt.com/'}),/invalid-page/);
 assert.equal(worker.calls.length,0);assert.equal(page.calls.length,0);
});
// Protocol-aware transport: getTargets inherits the active discovery filter;
// info notifications only follow targetCreated while discovery is enabled.
// Contract: https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Target.pdl
function discoveryProtocolFixture(){
 const transport=new EventEmitter(),calls=[],targets=new Map([nativeTarget,{targetId:'worker',type:'service_worker',url},{targetId:'iframe',type:'iframe',url:nativeURL},{targetId:'browser',type:'browser',url:''},{targetId:'tab',type:'tab',url:nativeURL}].map(t=>[t.targetId,{...t}])),created=new Set();
 let discovery=false,filter=[],closed=false,notifications=0;
 const included=(t,rules)=>{const rule=rules.find(r=>r.type===undefined||r.type===t.type);return !!rule&&rule.exclude!==true;};
 transport.send=async(method,params={})=>{
  calls.push({method,params});if(closed)throw Error('transport-closed');
  if(method==='Target.setDiscoverTargets'){
   discovery=params.discover;filter=params.filter??[];created.clear();
   if(discovery)for(const t of targets.values())if(included(t,filter)){created.add(t.targetId);transport.emit('Target.targetCreated',{targetInfo:{...t}});}
   return {};
  }
  if(method==='Target.getTargets')return {targetInfos:[...targets.values()].filter(t=>included(t,params.filter??(discovery?filter:[{type:'browser',exclude:true},{type:'tab',exclude:true},{}]))).map(t=>({...t}))};
  if(method==='Target.getTargetInfo')return {targetInfo:{...targets.get(params.targetId)}};
  if(method==='Target.attachToTarget')return {sessionId:'owned-'+params.targetId};
  if(method==='Target.sendMessageToTarget'){
   const m=JSON.parse(params.message),profile={nodes:[{id:1,callFrame:{functionName:params.sessionId}}],samples:[1],timeDeltas:[1000]};
   transport.emit('Target.receivedMessageFromTarget',{sessionId:params.sessionId,message:JSON.stringify({id:m.id,result:m.method==='Profiler.stop'?{profile}:{}})});
  }
  return {};
 };
 transport.close=()=>{closed=true;discovery=false;created.clear();transport.emit('transportClosed');};
 return {transport,calls,options:{transport,targetId:nativeTarget.targetId,expectedURL:nativeURL,sampleMs:10000,commandTimeoutMs:20},discovery:()=>discovery,filter:()=>filter,created:()=>[...created],notifications:()=>notifications,
  navigate:(targetId,url)=>{const target=targets.get(targetId);target.url=url;if(discovery&&created.has(targetId)&&included(target,filter)){notifications++;transport.emit('Target.targetInfoChanged',{targetInfo:{...target}});}}};
}
test('native helper itself enables discovery so a mid-sample away-and-back cannot escape final URL checks',async()=>{
 const f=discoveryProtocolFixture();f.navigate('native-page','http://127.0.0.1:43123/other');f.navigate('native-page',nativeURL);assert.equal(f.notifications(),0,'no discovery means no target notifications');
 const h=await startHostScalePageCPUProfile(f.options);assert.equal(f.calls[0].method,'Target.setDiscoverTargets');assert.equal(f.discovery(),true);assert.deepEqual(f.filter(),[{type:'page'},{type:'service_worker'},{exclude:true}]);assert.deepEqual(f.created().sort(),['native-page','worker']);
 f.navigate('native-page','http://127.0.0.1:43123/other');f.navigate('native-page',nativeURL);assert.equal(f.notifications(),2);
 const r=await h.finished;assert.equal(r.status,'UNAVAILABLE');assert.equal(r.reason,'target-identity-changed');assert.equal(r.profile,undefined);assert.equal(f.calls.filter(c=>c.method==='Target.attachToTarget').length,1);pageCleaned(f);f.transport.close();assert.equal(f.discovery(),false);
});
test('page discovery filter preserves a subsequently started default worker profiler on the same connection',async()=>{
 const f=discoveryProtocolFixture(),page=await startHostScalePageCPUProfile(f.options),at=f.calls.length,worker=await startHostScaleCPUProfile({transport:f.transport,extensionId,sampleMs:10000,commandTimeoutMs:20});
 assert.equal(f.calls[at].method,'Target.getTargets');assert.deepEqual(f.calls[at].params,{});assert(!f.calls.slice(at).some(c=>c.method==='Target.setDiscoverTargets'));
 assert.equal((await worker.finish()).status,'CAPTURED');assert.equal(f.discovery(),true);assert.equal((await page.finish()).status,'CAPTURED');pageCleaned(f);f.transport.close();assert.equal(f.discovery(),false);
 assert(!f.calls.some(c=>['Target.setAutoAttach','Target.createTarget','Page.navigate'].includes(c.method)));
});
test('discovery command rejection cannot fall back to endpoint-only identity checks',async()=>{
 const f=pageFixture({fail:'Target.setDiscoverTargets'}),h=await startHostScalePageCPUProfile(f.options),r=await h.finished;
 assert.equal(r.status,'UNAVAILABLE');assert.deepEqual(methods(f),['Target.setDiscoverTargets']);pageCleaned(f);
});
test('late discovery response after bounded setup and owner close cannot attach or revive a target',async()=>{
 const f=discoveryProtocolFixture(),send=f.transport.send;let release,entered;const waiting=new Promise(r=>{entered=r;});
 f.transport.send=async(method,params)=>{if(method==='Target.setDiscoverTargets'){entered();await new Promise(r=>{release=r;});}return send(method,params);};
 const pending=startHostScalePageCPUProfile({...f.options,commandTimeoutMs:5});await waiting;const h=await pending,r=await h.finished;assert.equal(r.status,'UNAVAILABLE');pageCleaned(f);
 f.transport.close();release();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.discovery(),false);assert(!f.calls.some(c=>['Target.getTargets','Target.attachToTarget','Target.sendMessageToTarget'].includes(c.method)));assert.equal(r.status,'UNAVAILABLE');
});

for(const phase of ['Target.setDiscoverTargets','Target.getTargets','Target.attachToTarget','Target.getTargetInfo','Profiler.enable','Profiler.setSamplingInterval','Profiler.start'])test('setup diagnostics identify bounded failure without retaining raw transport error '+phase,async()=>{
 for(const mode of ['hang','fail']){
  const f=pageFixture({[mode]:phase}),h=await startHostScalePageCPUProfile(f.options),r=await h.finished;
  assert.equal(r.status,'UNAVAILABLE');assert.equal(r.reason,'setup-unavailable');assert.equal(r.setupFailureStage,phase);
  assert.equal(r.setupFailureKind,mode==='hang'?'command-timeout':phase.startsWith('Profiler.')?'profiler-command-failed':'setup-rejected');
  assert.equal(r.profile,undefined);assert(!JSON.stringify(r).includes('failure'));pageCleaned(f);
 }
});
test('successful capture has no invented setup failure',async()=>{
 const f=pageFixture(),h=await startHostScalePageCPUProfile(f.options),r=await h.finish();
 assert.equal(r.status,'CAPTURED');assert.equal(r.setupFailureStage,undefined);assert.equal(r.setupFailureKind,undefined);pageCleaned(f);
});
