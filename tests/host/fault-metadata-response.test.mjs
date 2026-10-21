import test from 'node:test';import assert from 'node:assert/strict';import {observeFaultMetadataResponse} from './fault-metadata-response.mjs';
function response(body,{method='GET',error=null}={}){return {request:()=>({method:()=>method}),body:async()=>{if(error)throw error;return Buffer.from(body);}};}
test('actual unknown body classification records method/body/parse provenance without raw payload',async()=>{const row={status:200};await observeFaultMetadataResponse(response('{"protocol":"future-99","payload":{"opaque":true}}'),row);assert.equal(row.unknownSchema,true);assert.equal(row.bodyRead,'COMPLETE');assert.equal(row.jsonParse,'VALID');assert.equal(row.method,'GET');assert(!JSON.stringify(row).includes('opaque'));});
for(const [label,body,options,status] of [['known','{"protocol":"current"}',{},200],['mapping','{"protocol":"future-99","mapping":null}',{},200],['nonget','{"protocol":"future-99"}',{method:'OPTIONS'},200],['non200','{"protocol":"future-99"}',{},429],['empty','',{},200],['corrupt','{"mapping":',{},200],['bodyUnavailable','',{error:new Error('private transport details')},200]])test('unknown rejects '+label,async()=>{const row={status};await observeFaultMetadataResponse(response(body,options),row);assert.equal(row.unknownSchema,false);assert(!JSON.stringify(row).includes('private transport details'));if(options.error){assert.equal(row.bodyRead,'FAILED');assert.equal(row.jsonParse,'NOT_RUN');assert.equal(row.invalidJSON,false);}if(label==='corrupt'){assert.equal(row.jsonParse,'INVALID_JSON');assert.equal(row.invalidJSON,true);}});
test('mixed worker response failure remains visible and cannot be admitted as all unknown',async()=>{const rows=[{worker:true,status:200},{worker:true,status:200}];await Promise.all([observeFaultMetadataResponse(response('{"protocol":"future-99"}'),rows[0]),observeFaultMetadataResponse(response('',{error:new Error()}),rows[1])]);assert.equal(rows.every(r=>r.unknownSchema),false);assert.equal(rows[1].bodyRead,'FAILED');});

import {createFaultMetadataRequestTracker,unknownCalibrationCohort,validUnknownCalibrationCohort} from './fault-metadata-response.mjs';
const good=()=>({method:'GET',worker:true,status:200,bodyRead:'COMPLETE',jsonParse:'VALID',protocolClass:'EXPECTED_UNKNOWN_PROTOCOL',mappingPresent:false,unknownSchema:true});
function trackedRequest(){return {url:()=> 'http://fixture.test/detail',method:()=> 'GET',serviceWorker:()=>({})};}
test('request started before action but response arriving later stays outside calibration cohort',()=>{
 const tracker=createFaultMetadataRequestTracker({origin:'http://fixture.test',path:'/detail'}),prior=trackedRequest(),target=trackedRequest();tracker.start(prior);const boundary=tracker.boundary();tracker.start(target);const end=tracker.boundary();
 Object.assign(tracker.row(target),good());Object.assign(tracker.row(prior),{status:200,bodyRead:'FAILED',requestFailure:'net::ERR_ABORTED'});
 assert.deepEqual(unknownCalibrationCohort(tracker.rows(),boundary,end).map(r=>r.requestStart),[2]);assert.equal(validUnknownCalibrationCohort(tracker.rows(),boundary,end),true);assert.equal(tracker.row(prior).unknownSchema,false);
});
for(const [name,mutation] of Object.entries({aborted:r=>{r.bodyRead='FAILED';r.requestFailure='net::ERR_ABORTED';},missingBody:r=>r.bodyRead='NO_RESPONSE',knownSchema:r=>r.protocolClass='OTHER_PROTOCOL',noStart:r=>delete r.requestStart,notGET:r=>r.method='OPTIONS'}))test('target calibration cohort rejects '+name,()=>{const row={...good(),requestStart:2};mutation(row);assert.equal(validUnknownCalibrationCohort([row],1,2),false);});
test('no target or solely prior known/aborted evidence cannot certify a calibration',()=>{assert.equal(validUnknownCalibrationCohort([{...good(),requestStart:1}],1,2),false);assert.equal(validUnknownCalibrationCohort([],0,0),false);});
test('one successful target cannot conceal another current target abort or missing body',()=>{assert.equal(validUnknownCalibrationCohort([{...good(),requestStart:2},{...good(),requestStart:3,bodyRead:'FAILED'}],1,3),false);});

for(const [message,expected] of [
 ['Protocol error (Network.getResponseBody): No resource with given identifier found','RESOURCE_ID_MISSING'],
 ['Protocol error (Network.getResponseBody): No data found for resource with given identifier','RESOURCE_CONTENT_UNAVAILABLE'],
 ['Protocol error (Network.getResponseBody): Request content was evicted from inspector cache','INSPECTOR_CACHE_EVICTED'],
 ['private unknown transport error','ResponseBodyUnavailable']
])test('body error classification distinguishes '+expected+' without inferring abort cause',async()=>{
 const row={worker:true,status:200,requestStart:1},r=response('',{error:Error(message)});r.request=()=>({method:()=> 'GET',failure:()=>({errorText:'net::ERR_ABORTED'})});
 await observeFaultMetadataResponse(r,row);assert.equal(row.bodyReadError,expected);assert.equal(row.requestFailure,'net::ERR_ABORTED');assert.equal(row.bodyRead,'FAILED');assert.equal(row.jsonParse,'NOT_RUN');assert.equal(row.unknownSchema,false);assert.equal(validUnknownCalibrationCohort([row],0,1),false);assert(!JSON.stringify(row).includes(message));
});
