import {createHash} from 'node:crypto';

export const BODY_STREAM_KIND='DIAGNOSTIC_ONLY_FAULT_BODY_STREAM';
const PATH='/backend-api/conversation/33333333-3333-4333-8333-333333333333';
const LIMIT=4096,REQUEST_LIMIT=3,EVENT_LIMIT=256;
const bounded=async task=>{let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('body-stream-timeout')),1500);})]);}finally{clearTimeout(timer);}};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function bytes(value){
 if(typeof value!=='string'||value.length>4*Math.ceil(LIMIT/3)||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw Error('INVALID_OR_OVERSIZE_BYTES');
 const data=Buffer.from(value,'base64');if(data.length>LIMIT)throw Error('BODY_LIMIT');return data;
}
function classify(data){
 const result={bytes:data.length,sha256:hash(data),json:'INVALID',protocolClass:'UNAVAILABLE',mappingPresent:null};
 try{const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));result.json='VALID';result.protocolClass=body?.protocol==='future-99'?'EXPECTED_UNKNOWN_PROTOCOL':typeof body?.protocol==='string'?'OTHER_PROTOCOL':'NO_PROTOCOL';result.mappingPresent=!!body&&typeof body==='object'&&Object.hasOwn(body,'mapping');}catch{}
 return result;
}
function errorClass(error){const message=String(error?.message??'');return /No resource with given identifier found/i.test(message)?'RESOURCE_ID_MISSING':/No data found for resource with given identifier/i.test(message)?'RESOURCE_CONTENT_UNAVAILABLE':/Request content was evicted from inspector cache/i.test(message)?'INSPECTOR_CACHE_EVICTED':/timeout/i.test(message)?'TIMEOUT':'UNAVAILABLE';}

/** Offline only. A second, non-intercepting Network session observes the same
 * immutable package. It neither replaces Playwright's formal oracle nor adds a
 * request. Raw bytes/headers are never returned. No Fetch/Runtime domain use. */
export async function observeFaultBodyStream(parent,{extensionId,origin}){
 if(!/^[a-p]{32}$/.test(extensionId??'')||!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origin??'')||new URL(origin).port>65535)throw Error('offline-body-stream-only');
 const targetURL=`chrome-extension://${extensionId}/extension/worker.mjs`,targets=await bounded(parent.send('Target.getTargets')),matching=targets.targetInfos.filter(t=>t.type==='service_worker'&&t.url===targetURL);
 if(matching.length!==1)throw Error('body-stream-unique-worker-required');
 const targetId=matching[0].targetId,attach=parent.send('Target.attachToTarget',{targetId,flatten:false});let sessionId;
 try{({sessionId}=await bounded(attach));}catch(error){void attach.then(result=>bounded(parent.send('Target.detachFromTarget',{sessionId:result.sessionId}))).catch(()=>{});throw error;}
 const requests=new Map(),pending=new Map(),tasks=new Set(),events=[];let serial=0,ordinal=0,dropped=0,closed=false,ready=false,terminalReason=null,closeTask,finishTask,snapshot;
 const fail=reason=>{terminalReason??=reason;void close();};
 const emit=(row,stage,extra={})=>{if(closed)return;if(events.length===EVENT_LIMIT){dropped++;fail('EVENT_LIMIT');return;}events.push({order:events.length+1,request:row?.ordinal??null,stage,...extra});};
 const send=(method,params={})=>{
  if(closed||!['Network.enable','Network.streamResourceContent','Network.getResponseBody'].includes(method))return Promise.reject(Error('body-stream-closed-or-forbidden'));
  const id=++serial;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('body-stream-timeout'));},1500);pending.set(id,{resolve,reject,timer});parent.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(error=>{const p=pending.get(id);if(p){pending.delete(id);clearTimeout(p.timer);reject(error);}});});
 };
 const track=task=>{tasks.add(task);void task.then(()=>tasks.delete(task),()=>{tasks.delete(task);fail('CAPTURE_FAILED');});};
 function add(row,data){if(row.bytes+data.length+(row.buffered?.length??0)>LIMIT){row.streamError='BODY_LIMIT';fail('BODY_LIMIT');return;}row.bytes+=data.length;row.chunks.push(data);}
 function stream(row){
  row.streamPromise=send('Network.streamResourceContent',{requestId:row.id}).then(result=>{if(closed||row.streamError)return;row.buffered=bytes(result.bufferedData);if(row.buffered.length+row.bytes>LIMIT){row.streamError='BODY_LIMIT';fail('BODY_LIMIT');return;}emit(row,'stream-ready');},error=>{if(closed)return;row.streamError=errorClass(error);emit(row,'stream-error',{reason:row.streamError});}).catch(()=>{if(closed)return;row.streamError='INVALID_OR_OVERSIZE_BYTES';fail(row.streamError);});track(row.streamPromise);
 }
 function terminal(row,method,p){
  if(row.terminal){row.streamError='DUPLICATE_TERMINAL';return;}row.terminal=method==='Network.loadingFinished'?'FINISHED':'FAILED';
  row.failure=typeof p.errorText==='string'&&/^net::ERR_[A-Z_]+$/.test(p.errorText)?p.errorText:null;
  emit(row,row.terminal,{failure:row.failure});
  if(!row.readAllowed)return;
  track((async()=>{try{await row.streamPromise;if(closed)return;const result=await send('Network.getResponseBody',{requestId:row.id});if(closed)return;const body=result.base64Encoded?bytes(result.body):typeof result.body==='string'&&result.body.length<=LIMIT?Buffer.from(result.body):null;if(!body||body.length>LIMIT)throw Error('BODY_LIMIT');row.readback={state:'AVAILABLE',...classify(body)};body.fill(0);}catch(error){if(closed)return;row.readback={state:'FAILED',reason:error?.message==='BODY_LIMIT'?'BODY_LIMIT':errorClass(error)};}emit(row,'readback',{state:row.readback?.state??'UNAVAILABLE'});})());
 }
 function receive(event){
  if(closed||event.sessionId!==sessionId||typeof event.message!=='string')return;
  if(event.message.length>65536){fail('MESSAGE_LIMIT');return;}
  let m;try{m=JSON.parse(event.message);}catch{fail('INVALID_MESSAGE');return;}
  if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message??'unavailable')):p.resolve(m.result);return;}
  const p=m.params??{};
  if(m.method==='Inspector.detached'){fail('TARGET_DETACHED');return;}
  if(m.method==='Inspector.targetCrashed'){fail('TARGET_CRASHED');return;}
  if(m.method==='Network.requestWillBeSent'){
   if(requests.has(p.requestId)){requests.get(p.requestId).streamError='REDIRECT_OR_REUSED_REQUEST';fail('REDIRECT_OR_REUSED_REQUEST');return;}
   if(p.request?.url!==origin+PATH||p.request?.method!=='GET')return;
   if(p.redirectResponse){fail('REDIRECT_OR_REUSED_REQUEST');return;}
   if(typeof p.requestId!=='string'||p.requestId.length>256){fail('INVALID_REQUEST_ID');return;}
   if(++ordinal>REQUEST_LIMIT){fail('REQUEST_LIMIT');return;}
   const row={id:p.requestId,ordinal,bytes:0,dataLength:0,chunks:[],buffered:null,streamError:null,terminal:null,readback:null};requests.set(p.requestId,row);emit(row,'request');return;
  }
  const row=requests.get(p.requestId);if(!row)return;
  if(row.terminal&&['Network.responseReceived','Network.dataReceived'].includes(m.method)){row.streamError='EVENT_AFTER_TERMINAL';fail(row.streamError);return;}
  if(m.method==='Network.responseReceived'){
   if(row.response){row.streamError='DUPLICATE_RESPONSE';fail(row.streamError);return;}row.response=true;row.status=Number.isInteger(p.response?.status)?p.response.status:null;
   if(p.response?.url!==origin+PATH||row.status!==200){row.streamError='UNEXPECTED_RESPONSE';fail(row.streamError);return;}
   row.readAllowed=true;
   emit(row,'response',{status:row.status});stream(row);
  }else if(m.method==='Network.dataReceived'){
   if(!Number.isSafeInteger(p.dataLength)||p.dataLength<0||row.dataLength+p.dataLength>LIMIT){row.streamError='BODY_LIMIT';fail('BODY_LIMIT');return;}
   row.dataLength+=p.dataLength;if(p.data!==undefined&&!row.streamError){try{const chunk=bytes(p.data);if(chunk.length!==p.dataLength){row.streamError='CHUNK_LENGTH_MISMATCH';fail(row.streamError);}else add(row,chunk);}catch{row.streamError='INVALID_OR_OVERSIZE_BYTES';fail(row.streamError);}}emit(row,'data',{bytes:p.dataLength});
  }else if(['Network.loadingFinished','Network.loadingFailed'].includes(m.method))terminal(row,m.method,p);
 }
 parent.on('Target.receivedMessageFromTarget',receive);
 const detached=event=>{if(event.sessionId===sessionId)fail('TARGET_DETACHED');};
 const destroyed=event=>{if(event.targetId===targetId)fail('TARGET_DESTROYED');};
 const crashed=event=>{if(event.targetId===targetId)fail('TARGET_CRASHED');};
 parent.on('Target.detachedFromTarget',detached);parent.on('Target.targetDestroyed',destroyed);parent.on('Target.targetCrashed',crashed);
 const deadline=setTimeout(()=>fail('OBSERVER_DEADLINE'),15000);
 function close(){
  if(closed)return closeTask;closed=true;clearTimeout(deadline);
  parent.off('Target.receivedMessageFromTarget',receive);parent.off('Target.detachedFromTarget',detached);parent.off('Target.targetDestroyed',destroyed);parent.off('Target.targetCrashed',crashed);
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('body-stream-closed'));}pending.clear();
  const rows=[...requests.values()].map(row=>{const body=row.buffered&&!row.streamError?Buffer.concat([row.buffered,...row.chunks]):null,complete=ready&&!terminalReason&&!!body&&row.terminal==='FINISHED'&&body.length===row.dataLength;
   const streamSummary=body?classify(body):null,result={request:row.ordinal,status:row.status??null,terminal:row.terminal??'NOT_OBSERVED',failure:row.failure??null,streamError:row.streamError,receivedDataBytes:row.dataLength,stream:streamSummary,networkBodyComplete:complete,readback:row.readback??{state:'NOT_OBSERVED'},sameBody:complete&&row.readback?.state==='AVAILABLE'?streamSummary.sha256===row.readback.sha256:null};body?.fill(0);row.buffered?.fill(0);for(const data of row.chunks)data.fill(0);row.chunks=[];row.buffered=null;return result;});requests.clear();
  snapshot={kind:BODY_STREAM_KIND,status:'DIAGNOSTIC_ONLY',acceptance:'NOT_ESTABLISHED',target:{type:'service_worker',exactExtensionWorker:true,networkEnabled:ready},limits:{requests:REQUEST_LIMIT,bodyBytes:LIMIT,totalBodyBytes:LIMIT*REQUEST_LIMIT,events:EVENT_LIMIT,deadlineMs:15000},terminalReason,dropped,events,rows,playwrightCorrelation:'REQUEST_ORDER_ONLY_NOT_EXACT_REQUEST_ID',note:'Same-session stream/readback compares exact request IDs. Network completion does not prove production reader EOF. Additional observation can affect timing; never supersedes the formal Playwright oracle.'};
  closeTask=bounded(parent.send('Target.detachFromTarget',{sessionId})).catch(()=>{snapshot.terminalReason??='DETACH_FAILED';for(const row of snapshot.rows)row.networkBodyComplete=false;});return closeTask;
 }
 try{await send('Network.enable');if(closed)throw Error('body-stream-closed');ready=true;}catch(error){await close();throw error;}
 return {async finish(){
  if(!finishTask)finishTask=(async()=>{
   // loadingFinished can add a readback while a stream response is pending.
   // Drain successive task sets under ONE original 1500ms settling deadline.
   try{await bounded((async()=>{
    while(!closed&&tasks.size)await Promise.all([...tasks]);
    // Empty-to-closed is synchronous. Otherwise a terminal event could append
    // a readback between this last check and the outer await continuation.
    void close();
   })());}catch{terminalReason??='SETTLE_TIMEOUT';}
   await close();return {...snapshot,captureComplete:!snapshot.terminalReason&&snapshot.dropped===0&&snapshot.rows.length>0&&snapshot.rows.every(row=>row.networkBodyComplete)};
  })();
  return structuredClone(await finishTask);
 }};
}
