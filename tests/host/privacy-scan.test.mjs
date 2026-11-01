import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivacyScanner} from './privacy-scan.mjs';
const sentinels={token:'secret-token-1',cookie:'secret-cookie-2',body:'secret-body-3',draft:'secret-draft-4'};
test('all labels found in raw nested keys, values, maps and binary without exporting content',()=>{
 const scan=createPrivacyScanner(sentinels),raw={nested:[{[sentinels.token]:new Map([[sentinels.cookie,new Set([sentinels.body])]])}],binary:new TextEncoder().encode(sentinels.draft)};raw.cycle=raw;
 const result=scan.scan(raw);assert.deepEqual(result.hits,{token:1,cookie:1,body:1,draft:1});assert.equal(result.unsupported,0);for(const value of Object.values(sentinels))assert(!JSON.stringify(result).includes(value));
});
test('clean raw values scan non-vacuously; accessors fail coverage without executing getters',()=>{const scan=createPrivacyScanner(sentinels);let invoked=false;const value={safe:['native title',new Date()]};Object.defineProperty(value,'getter',{get(){invoked=true;return sentinels.token;}});const result=scan.scan(value);assert(result.strings>0);assert.equal(result.unsupported,1);assert.equal(invoked,false);assert.deepEqual(result.hits,{token:0,cookie:0,body:0,draft:0});});
test('each mutation independently detected and scanner survives serialization',()=>{const factory=(0,eval)(`(${createPrivacyScanner.toString()})`);for(const key of Object.keys(sentinels)){const scanner=factory(sentinels);assert.equal(scanner.scan({payload:sentinels[key]}).hits[key],1);}});
