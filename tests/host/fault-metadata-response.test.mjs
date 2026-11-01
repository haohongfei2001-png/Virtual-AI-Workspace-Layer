import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {observeFaultMetadataResponse} from './fault-metadata-response.mjs';
function response(body,{method='GET',error=null}={}){return {request:()=>({method:()=>method}),body:async()=>{if(error)throw error;return Buffer.from(body);}};}
test('actual unknown body classification records method/body/parse provenance without raw payload',async()=>{const row={status:200};await observeFaultMetadataResponse(response('{"protocol":"future-99","payload":{"opaque":true}}'),row);assert.equal(row.unknownSchema,true);assert.equal(row.bodyRead,'COMPLETE');assert.equal(row.jsonParse,'VALID');assert.equal(row.method,'GET');assert(!JSON.stringify(row).includes('opaque'));});
for(const [label,body,options,status] of [['known','{"protocol":"current"}',{},200],['mapping','{"protocol":"future-99","mapping":null}',{},200],['nonget','{"protocol":"future-99"}',{method:'OPTIONS'},200],['non200','{"protocol":"future-99"}',{},429],['empty','',{},200],['corrupt','{"mapping":',{},200],['bodyUnavailable','',{error:new Error('private transport details')},200]])test('unknown rejects '+label,async()=>{const row={status};await observeFaultMetadataResponse(response(body,options),row);assert.equal(row.unknownSchema,false);assert(!JSON.stringify(row).includes('private transport details'));if(options.error){assert.equal(row.bodyRead,'FAILED');assert.equal(row.jsonParse,'NOT_RUN');assert.equal(row.invalidJSON,false);}if(label==='corrupt'){assert.equal(row.jsonParse,'INVALID_JSON');assert.equal(row.invalidJSON,true);}});
test('mixed worker response failure remains visible and cannot be admitted as all unknown',async()=>{const rows=[{worker:true,status:200},{worker:true,status:200}];await Promise.all([observeFaultMetadataResponse(response('{"protocol":"future-99"}'),rows[0]),observeFaultMetadataResponse(response('',{error:new Error()}),rows[1])]);assert.equal(rows.every(r=>r.unknownSchema),false);assert.equal(rows[1].bodyRead,'FAILED');});

import {createFaultMetadataRequestTracker,unknownActionWindowCohort,validUnknownActionWindowCohort} from './fault-metadata-response.mjs';
const good=()=>({method:'GET',worker:true,status:200,bodyRead:'COMPLETE',jsonParse:'VALID',protocolClass:'EXPECTED_UNKNOWN_PROTOCOL',mappingPresent:false,unknownSchema:true});
function trackedRequest(){return {url:()=> 'http://fixture.test/detail',method:()=> 'GET',serviceWorker:()=>({})};}
test('request started before action but response arriving later stays outside calibration cohort',()=>{
 const tracker=createFaultMetadataRequestTracker({origin:'http://fixture.test',path:'/detail'}),prior=trackedRequest(),target=trackedRequest();tracker.start(prior);const boundary=tracker.boundary();tracker.start(target);const end=tracker.boundary();
 Object.assign(tracker.row(target),good());Object.assign(tracker.row(prior),{status:200,bodyRead:'FAILED',requestFailure:'net::ERR_ABORTED'});
 assert.deepEqual(unknownActionWindowCohort(tracker.rows(),boundary,end).map(r=>r.requestStart),[2]);assert.equal(validUnknownActionWindowCohort(tracker.rows(),boundary,end),true);assert.equal(tracker.row(prior).unknownSchema,false);
});
for(const [name,mutation] of Object.entries({aborted:r=>{r.bodyRead='FAILED';r.requestFailure='net::ERR_ABORTED';},missingBody:r=>r.bodyRead='NO_RESPONSE',knownSchema:r=>r.protocolClass='OTHER_PROTOCOL',noStart:r=>delete r.requestStart,notGET:r=>r.method='OPTIONS'}))test('target action window rejects '+name,()=>{const row={...good(),requestStart:2};mutation(row);assert.equal(validUnknownActionWindowCohort([row],1,2),false);});
test('no target or solely prior known/aborted evidence cannot certify this action window',()=>{assert.equal(validUnknownActionWindowCohort([{...good(),requestStart:1}],1,2),false);assert.equal(validUnknownActionWindowCohort([],0,0),false);});
test('one successful target cannot conceal another current target abort or missing body',()=>{assert.equal(validUnknownActionWindowCohort([{...good(),requestStart:2},{...good(),requestStart:3,bodyRead:'FAILED'}],1,3),false);});

for(const [message,expected] of [
 ['Protocol error (Network.getResponseBody): No resource with given identifier found','RESOURCE_ID_MISSING'],
 ['Protocol error (Network.getResponseBody): No data found for resource with given identifier','RESOURCE_CONTENT_UNAVAILABLE'],
 ['Protocol error (Network.getResponseBody): Request content was evicted from inspector cache','INSPECTOR_CACHE_EVICTED'],
 ['private unknown transport error','ResponseBodyUnavailable']
])test('body error classification distinguishes '+expected+' without inferring abort cause',async()=>{
 const row={worker:true,status:200,requestStart:1},r=response('',{error:Error(message)});r.request=()=>({method:()=> 'GET',failure:()=>({errorText:'net::ERR_ABORTED'})});
 await observeFaultMetadataResponse(r,row);assert.equal(row.bodyReadError,expected);assert.equal(row.requestFailure,'net::ERR_ABORTED');assert.equal(row.bodyRead,'FAILED');assert.equal(row.jsonParse,'NOT_RUN');assert.equal(row.unknownSchema,false);assert.equal(validUnknownActionWindowCohort([row],0,1),false);assert(!JSON.stringify(row).includes(message));
});

test('passive lifecycle recorder bounds fields and keeps terminal times after its event cap',async()=>{
 const source=await readFile(new URL('./fault-package-matrix-browser.mjs',import.meta.url),'utf8'),definition=source.match(/function recordMetadataLifecycle\([\s\S]*?\n}/)?.[0];assert(definition);
 let now=100;const record=new Function('performance',definition+';return recordMetadataLifecycle;')({now:()=>++now}),timeline={start:100,observed:0,dropped:0,events:[]};
 const row={requestStart:3,worker:true,status:200,bodyRead:'FAILED',bodyReadError:'RESOURCE_ID_MISSING',requestFailure:'net::ERR_ABORTED',privateField:'MUST_NOT_CAPTURE',get body(){throw Error('must not read body');}};
 record(timeline,'body-terminal',row);assert.deepEqual(timeline.events[0],{sequence:1,stage:'body-terminal',elapsedMs:1,requestStart:3,worker:true,status:200,boundary:null,bodyRead:'FAILED',errorCategory:'RESOURCE_ID_MISSING',requestFailure:'net::ERR_ABORTED'});
 record(timeline,'requestfailed',row,{requestFailure:'private transport message'});assert.equal(timeline.events[1].requestFailure,'NONE_OR_UNCLASSIFIED');
 record(timeline,'body-terminal',row,{observerRejected:true});assert.equal(timeline.events[2].errorCategory,'OBSERVER_REJECTED');
 for(let i=0;i<29;i++)record(timeline,'response',row);
 for(const stage of ['calibration-before','calibration-terminal','worker-close'])record(timeline,stage,null,{boundary:3});
 assert.equal(timeline.observed,35);assert.equal(timeline.events.length,32);assert.equal(timeline.dropped,3);assert.deepEqual([timeline.calibrationBeforeElapsedMs,timeline.calibrationTerminalElapsedMs,timeline.workerClosedElapsedMs],[33,34,35]);
 assert.equal(row.requestFailure,'net::ERR_ABORTED');assert(!JSON.stringify(timeline).includes('MUST_NOT_CAPTURE'));assert(!JSON.stringify(timeline).includes('private transport message'));
});

test('formal lifecycle request listener ignores requests outside the tracked metadata path',async()=>{
 const source=await readFile(new URL('./fault-package-matrix-browser.mjs',import.meta.url),'utf8'),setup=source.match(/^  const metadataTracker=.*$/m)?.[0];assert(setup);
 const listeners={},events=[],context={on:(name,listener)=>{listeners[name]=listener;}};
 new Function('createFaultMetadataRequestTracker','server','C','fault','context','recordMetadataLifecycle','metadataLifecycle','trace',setup)(createFaultMetadataRequestTracker,{origin:'http://fixture.test'},'conversation','unknown-protocol',context,(_timeline,stage,row)=>events.push({stage,requestStart:row.requestStart}),{},null);
 const request=path=>({url:()=> 'http://fixture.test'+path,method:()=> 'GET',serviceWorker:()=>({})});listeners.request(request('/unrelated'));assert.deepEqual(events,[]);
 listeners.request(request('/backend-api/conversation/conversation'));assert.deepEqual(events,[{stage:'request-start',requestStart:1}]);
});
