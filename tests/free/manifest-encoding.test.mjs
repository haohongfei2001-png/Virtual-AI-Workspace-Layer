import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeOf} from '../../simulator/data.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {emptyNativeFacts,applyNativeObservations} from '../../src/data/native-facts.mjs';
import {emptyFreeEvidence,applyFreeEvidence} from '../../src/data/free-evidence.mjs';
import {saveNativePieces,validateNativeManifest,nativeRecoveryKey} from '../../src/data/native-partitions.mjs';
import {saveEvidencePieces,validateEvidenceManifest,freeEvidenceKey,evidenceRecoveryKey} from '../../src/data/free-evidence-partitions.mjs';
import {digest,stable} from '../../src/data/hash.mjs';
const scope=normalizedScope(scopeOf('A')),other=normalizedScope(scopeOf('B')),now='2026-10-13T00:00:00Z',until='2026-10-14T00:00:00Z';
function store(){const rows=new Map();return {rows,put:row=>rows.set(row.key,structuredClone(row)),delete:key=>rows.delete(key),get:()=>({result:undefined})};}
function nativePair(){const current=emptyNativeFacts(scope),batch={scopeKey:scope.key,sourceRevision:1,observedAt:now,validUntil:until,projects:[{id:'p',nativeName:'界😀é"\\'.repeat(20),nativeUrl:'https://fixture.test/project/p',availability:'available'}],refs:[],membership:[],inventory:{projects:'partial',conversations:'partial',cursor:'界😀é"\\'.repeat(200)}};return {current,batch,next:applyNativeObservations(current,batch,{scope,now,channel:'synthetic',sourceId:'source',generation:'first'})};}
function evidencePair(){const current=emptyFreeEvidence(scope),batch={sources:[{id:'source',generation:'first',channel:'synthetic',sourceRevision:1,observedAt:now,validUntil:until}],events:[],hints:[],coverage:[]};return {current,next:applyFreeEvidence(current,{type:'OBSERVE_FREE_EVIDENCE',batch},{scope,now,channel:'synthetic'})};}
function parity(rows,rootKey,shadowKey){const root=rows.get(rootKey),shadow=rows.get(shadowKey);assert(root&&shadow);assert.deepEqual(shadow,{...root,key:shadowKey});assert.equal(root.checksum,digest(root.payload));const reordered=Object.fromEntries(Object.entries(root.payload).reverse());assert.equal(digest(reordered),root.checksum);assert.equal(stable(root.payload).length,JSON.stringify(root.payload).length);assert.equal(stable(reordered).length,JSON.stringify(reordered).length);}
test('native root/recovery checksum parity preserves Unicode, escaping and insertion-order length semantics',()=>{
 const s=store(),{current,next,batch}=nativePair();saveNativePieces(s,scope,current,next,null,{batch});parity(s.rows,scope.key,nativeRecoveryKey(scope.key));assert(new TextEncoder().encode(stable(next)).length>stable(next).length,'existing limit remains JSON code units, not a newly introduced UTF-8 byte limit');
});
test('evidence root/recovery checksum parity is independent of object insertion order',()=>{
 const s=store(),{next}=evidencePair();saveEvidencePieces(s,scope,next);parity(s.rows,freeEvidenceKey(scope.key),evidenceRecoveryKey(scope.key));
});
for(const type of ['native','evidence'])test(`${type} private write encoder retains scope and source-schema validation`,()=>{
 if(type==='native'){const {current,next,batch}=nativePair();assert.throws(()=>saveNativePieces(store(),other,current,next,null,{batch}),/scope|manifest/);next.sources.source.channel='production';assert.throws(()=>saveNativePieces(store(),scope,current,next,null,{batch}),/source|channel|native/);}
 else{const {next}=evidencePair(),m=saveEvidencePieces(store(),scope,next);assert.throws(()=>validateEvidenceManifest(m,other),/manifest/);m.scopeKey=other.key;next.revision=2;assert.throws(()=>saveEvidencePieces(store(),scope,next,m,emptyFreeEvidence(scope)),/manifest/);next.sources.source.channel='production';assert.throws(()=>saveEvidencePieces(store(),scope,next),/source/);}
});
for(const type of ['native','evidence'])test(`${type} aggregate 128Mi bound remains enforced through save API`,()=>{
 if(type==='native'){const {current,next}=nativePair(),prior={format:'vaiwl-native-partitions-v1',scopeKey:scope.key,revision:1,sources:{},projects:{},refs:{},units:128*1024*1024+1,changes:[]};next.revision=2;assert.throws(()=>saveNativePieces(store(),scope,current,next,{manifest:prior,pieces:new Map()},{batch:{projects:[],refs:[],membership:[]}}),/manifest/);}
 else{const {next}=evidencePair();next.revision=2;const previous={format:'vaiwl-free-evidence-partitions-v1',scopeKey:scope.key,revision:1,sources:{},refVersions:{large:1},sizes:{large:128*1024*1024+1},indexVersions:{},counts:{events:0,hints:0,coverage:0}};assert.throws(()=>saveEvidencePieces(store(),scope,next,previous,emptyFreeEvidence(scope)),/too-large/);}
});
test('both public and private manifest paths retain the 16Mi record bound within valid row counts',()=>{
 // Two valid index maps exceed the record cap while remaining below 100k refs and 128Mi aggregate data.
 const keys=Object.fromEntries(Array.from({length:64000},(_,i)=>['id_'+String(i).padStart(6,'0')+'x'.repeat(118),1]));
 const native={format:'vaiwl-native-partitions-v1',scopeKey:scope.key,revision:1,sources:{},projects:keys,refs:keys,units:0,changes:[]};assert(JSON.stringify(native).length>16*1024*1024);assert.throws(()=>validateNativeManifest(native,scope),/too-large/);
 const n=emptyNativeFacts(scope);n.revision=2;const ns=store();assert.throws(()=>saveNativePieces(ns,scope,emptyNativeFacts(scope),n,{manifest:native,pieces:new Map()},{batch:{projects:[],refs:[],membership:[]}}),/too-large/);assert.equal(ns.rows.has(scope.key),false);assert.equal(ns.rows.has(nativeRecoveryKey(scope.key)),false);
 const evidence={format:'vaiwl-free-evidence-partitions-v1',scopeKey:scope.key,revision:1,sources:{},refVersions:keys,sizes:keys,indexVersions:{},counts:{events:0,hints:0,coverage:0}};assert.throws(()=>validateEvidenceManifest(evidence,scope),/too-large/);const e=emptyFreeEvidence(scope);e.revision=2;const es=store();assert.throws(()=>saveEvidencePieces(es,scope,e,evidence,emptyFreeEvidence(scope)),/too-large/);assert.equal(es.rows.has(freeEvidenceKey(scope.key)),false);assert.equal(es.rows.has(evidenceRecoveryKey(scope.key)),false);
});
