import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {observeFaultBodyStream,BODY_STREAM_KIND} from './fault-body-stream-observer.mjs';

const extensionId='a'.repeat(32),origin='http://127.0.0.1:12345',path='/backend-api/conversation/33333333-3333-4333-8333-333333333333';
const body=JSON.stringify({protocol:'future-99',payload:{opaque:true}}),base64=s=>Buffer.from(s).toString('base64');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Transport extends EventEmitter {
 calls=[];commands=[];streamReply=null;readbackError=null;attach=null;
 async send(method,params={}) {
  this.calls.push({method,params});
  if(method==='Target.getTargets')return {targetInfos:[{type:'service_worker',url:`chrome-extension://${extensionId}/extension/worker.mjs`,targetId:'worker'}]};
  if(method==='Target.attachToTarget')return this.attach??{sessionId:'network'};
  if(method==='Target.detachFromTarget')return {};
  assert.equal(method,'Target.sendMessageToTarget');assert.equal(params.sessionId,'network');
  const command=JSON.parse(params.message);this.commands.push(command);
  if(command.method==='Network.enable')this.reply(command,{});
  else if(command.method==='Network.streamResourceContent')this.streamReply=()=>this.reply(command,{bufferedData:base64(this.prefix??body)});
  else if(command.method==='Network.getResponseBody')this.reply(command,this.readbackError?null:{body,base64Encoded:false},this.readbackError);
  else assert.fail('unexpected Network command');
  return {};
 }
 reply(command,result,error){this.emit('Target.receivedMessageFromTarget',{sessionId:'network',message:JSON.stringify({id:command.id,...(error?{error:{message:error}}:{result})})});}
 event(method,params,sessionId='network'){this.emit('Target.receivedMessageFromTarget',{sessionId,message:JSON.stringify({method,params})});}
 start(id='r'){this.event('Network.requestWillBeSent',{requestId:id,request:{method:'GET',url:origin+path}});}
 response(id='r',url=origin+path){this.event('Network.responseReceived',{requestId:id,response:{url,status:200}});}
 data(data,id='r',included=true){this.event('Network.dataReceived',{requestId:id,dataLength:Buffer.byteLength(data),...(included?{data:base64(data)}:{})});}
 end(id='r',failed=false){this.event(failed?'Network.loadingFailed':'Network.loadingFinished',{requestId:id,...(failed?{errorText:'net::ERR_ABORTED'}:{encodedDataLength:83})});}
}
async function collector(t){const transport=new Transport(),observer=await observeFaultBodyStream(transport,{extensionId,origin});t.after(()=>observer.finish());return {transport,observer};}

test('queued increments follow buffered prefix even when terminal precedes stream reply; readback uses exact request',async t=>{
 const {transport:p,observer}=await collector(t);p.prefix=body.slice(0,10);p.start();p.response();p.data(p.prefix,'r',false);p.data(body.slice(10));p.end();
 assert.equal(p.commands.filter(c=>c.method==='Network.getResponseBody').length,0);
 p.streamReply();const report=await observer.finish();
 assert.equal(report.kind,BODY_STREAM_KIND);assert.equal(report.status,'DIAGNOSTIC_ONLY');assert.equal(report.acceptance,'NOT_ESTABLISHED');assert.equal(report.captureComplete,true);
 assert.equal(report.rows[0].sameBody,true);assert.equal(report.rows[0].stream.bytes,Buffer.byteLength(body));assert.equal(report.rows[0].stream.protocolClass,'EXPECTED_UNKNOWN_PROTOCOL');
 assert.deepEqual(p.commands.map(c=>c.method),['Network.enable','Network.streamResourceContent','Network.getResponseBody']);assert.equal(p.commands[2].params.requestId,'r');
 assert.equal(p.listenerCount('Target.receivedMessageFromTarget'),0);assert.equal(p.listenerCount('Target.detachedFromTarget'),0);assert.equal(p.calls.filter(c=>c.method==='Target.detachFromTarget').length,1);
 report.events.push({bad:true});p.data('late');const again=await observer.finish();assert(!again.events.some(e=>e.bad));assert.equal(again.rows[0].sameBody,true);
 assert(!JSON.stringify(again).includes('opaque'));assert(!JSON.stringify(again).includes('headers'));assert(!JSON.stringify(again).includes('requestId'));
});

test('stream completion and getResponseBody cache failure remain separate observations',async t=>{
 const {transport:p,observer}=await collector(t);p.readbackError='No data found for resource with given identifier';p.start();p.response();p.data(body,'r',false);p.streamReply();p.end();
 const report=await observer.finish();assert.equal(report.rows[0].networkBodyComplete,true);assert.equal(report.rows[0].readback.state,'FAILED');assert.equal(report.rows[0].readback.reason,'RESOURCE_CONTENT_UNAVAILABLE');assert.equal(report.rows[0].sameBody,null);assert.equal(report.acceptance,'NOT_ESTABLISHED');
});

test('a failed network terminal never becomes complete even when both captures contain valid JSON',async t=>{
 const {transport:p,observer}=await collector(t);p.start();p.response();p.data(body,'r',false);p.streamReply();p.end('r',true);
 const r=await observer.finish();assert.equal(r.captureComplete,false);assert.equal(r.rows[0].terminal,'FAILED');assert.equal(r.rows[0].stream.json,'VALID');assert.equal(r.rows[0].readback.state,'AVAILABLE');assert.equal(r.rows[0].sameBody,null);assert.equal(r.rows[0].failure,'net::ERR_ABORTED');
});

for(const scenario of ['redirect','wrong-response','duplicate-response','unobserved-response'])test(scenario+' cannot read another response body',async t=>{
 const {transport:p,observer}=await collector(t);p.start();
 if(scenario==='redirect')p.event('Network.requestWillBeSent',{requestId:'r',redirectResponse:{status:302},request:{method:'GET',url:origin+'/different'}});
 else if(scenario==='wrong-response')p.response('r',origin+'/different');
 else if(scenario==='duplicate-response'){p.response();p.response();}
 p.end();const r=await observer.finish();assert.equal(p.commands.filter(c=>c.method==='Network.getResponseBody').length,0);assert.equal(r.captureComplete,false);
});

test('unrelated origin, method, session and worker requests are ignored',async t=>{
 const {transport:p,observer}=await collector(t);
 for(const request of [{method:'GET',url:'https://chatgpt.com'+path},{method:'POST',url:origin+path},{method:'GET',url:origin+'/other'}])p.event('Network.requestWillBeSent',{requestId:'ignored',request});
 p.event('Network.requestWillBeSent',{requestId:'ignored',request:{method:'GET',url:origin+path}},'other-session');
 p.response('ignored');p.end('ignored');assert.deepEqual((await observer.finish()).rows,[]);assert.deepEqual(p.commands.map(c=>c.method),['Network.enable']);
});

test('prefix plus late chunk is bounded and final report survives late reply',async t=>{
 const {transport:p,observer}=await collector(t);p.prefix='x'.repeat(4000);p.start();p.response();p.data(p.prefix,'r',false);p.streamReply();await tick();p.data('y'.repeat(200));
 const r=await observer.finish();assert.equal(r.terminalReason,'BODY_LIMIT');assert.equal(r.captureComplete,false);p.streamReply();p.end();assert.deepEqual(await observer.finish(),r);assert.equal(p.commands.filter(c=>c.method==='Network.getResponseBody').length,0);
});

for(const event of ['Target.detachedFromTarget','Target.targetDestroyed'])test(event+' stops capture without reattaching',async t=>{
 const {transport:p,observer}=await collector(t);p.start();p.response();p.emit(event,{sessionId:'network',targetId:'worker'});const r=await observer.finish();assert.match(r.terminalReason,/TARGET_/);assert.equal(r.captureComplete,false);p.streamReply();assert.deepEqual(await observer.finish(),r);assert.equal(p.calls.filter(c=>c.method==='Target.attachToTarget').length,1);
});

test('attach timeout detaches a late successful acquisition',async()=>{
 const p=new Transport();let release;p.attach=new Promise(resolve=>release=resolve);
 await assert.rejects(observeFaultBodyStream(p,{extensionId,origin}),/timeout/);release({sessionId:'late'});await tick();assert(p.calls.some(c=>c.method==='Target.detachFromTarget'&&c.params.sessionId==='late'));assert.equal(p.listenerCount('Target.receivedMessageFromTarget'),0);
});

test('only offline fixture and unique exact extension worker are eligible',async()=>{
 const p=new Transport();await assert.rejects(observeFaultBodyStream(p,{extensionId,origin:'https://chatgpt.com'}),/offline/);assert.equal(p.calls.length,0);
 p.send=async()=>({targetInfos:[{type:'page',url:`chrome-extension://${extensionId}/extension/worker.mjs`,targetId:'wrong'}]});await assert.rejects(observeFaultBodyStream(p,{extensionId,origin}),/unique-worker/);
});
