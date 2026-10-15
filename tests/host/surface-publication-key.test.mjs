import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sha256} from '../../src/data/hash.mjs';
const source=readFileSync(new URL('../../src/host/chatgpt-adapter.mjs',import.meta.url),'utf8');
const declaration=source.split('\n').find(line=>line.startsWith('const publicationKey='));
assert(declaration,'actual adapter publication fingerprint declaration');
const key=vm.runInNewContext(`${declaration}\npublicationKey`,{sha256});
const fixture=()=>({routeEpoch:1,payload:{profileId:'profile',profileRevision:1,detachedHandles:[],candidates:[{renderKey:'conversation:C',nativeTitle:'Title',titleState:'exact',target:{kind:'resolved',entity:'conversation',nativeId:'C',navigationURL:'https://chatgpt.com/c/C',liveHandle:'handle-old'},evidence:{regionEpoch:1,fieldPaths:['title']}}],membershipClaims:[],coverage:{kind:'partial'}}});
test('resolved publication ignores only transient handle and never mutates wire proposal',()=>{const a=fixture(),b=structuredClone(a);b.payload.candidates[0].target.liveHandle='handle-new';const before=JSON.stringify(b);assert.equal(key(a),key(b));assert.equal(JSON.stringify(b),before);assert.equal(b.payload.candidates[0].target.liveHandle,'handle-new');});
for(const [name,change] of [
 ['route',x=>x.routeEpoch++],['profile',x=>x.payload.profileId='other'],['profile revision',x=>x.payload.profileRevision++],
 ['title',x=>x.payload.candidates[0].nativeTitle='Changed'],['title state',x=>x.payload.candidates[0].titleState='unknown'],
 ['render identity',x=>x.payload.candidates[0].renderKey='conversation:D'],['native identity',x=>x.payload.candidates[0].target.nativeId='D'],
 ['entity',x=>x.payload.candidates[0].target.entity='project'],['URL',x=>x.payload.candidates[0].target.navigationURL='https://chatgpt.com/c/D'],
 ['evidence epoch',x=>x.payload.candidates[0].evidence.regionEpoch++],['field evidence',x=>x.payload.candidates[0].evidence.fieldPaths=['url']],
 ['membership',x=>x.payload.membershipClaims=[{conversationId:'C',projectId:'P'}]],['coverage',x=>x.payload.coverage.kind='complete']
])test(`publication preserves ${name} changes`,()=>{const a=fixture(),b=structuredClone(a);change(b);assert.notEqual(key(a),key(b));});
test('IDless live-control handle remains publication identity',()=>{const a=fixture();a.payload.candidates[0].target={kind:'live-control',control:{id:'old',entity:'project'},navigationURL:null};const b=structuredClone(a);b.payload.candidates[0].target.control.id='new';assert.notEqual(key(a),key(b));});
test('detached handles retain explicit forced publication branch',()=>{assert.match(source,/if\(source\.payload\.detachedHandles\.length\|\|surfaceKey!==surfaceAccepted\.get\(surfacePageKey\)/);});
