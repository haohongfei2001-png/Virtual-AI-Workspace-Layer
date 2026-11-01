import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEvidenceManifest} from '../../src/data/free-evidence-partitions.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {scopeOf} from '../../simulator/data.mjs';
const scope=normalizedScope(scopeOf('A')),bound=128*1024*1024;
function fixture(){return {format:'vaiwl-free-evidence-partitions-v1',scopeKey:scope.key,revision:2,sources:{},refVersions:{a:1,b:2},sizes:{a:10,b:20},indexVersions:{events_ab:1,hintEvents_ff:2},counts:{events:1,hints:0,coverage:0}};}
function rejects(change,reason){const value=fixture();change(value);assert.throws(()=>validateEvidenceManifest(value,scope),error=>error.message===reason);}
test('valid evidence manifest returns original identity, including exact aggregate boundary',()=>{
 const value=fixture();assert.equal(validateEvidenceManifest(value,scope),value);value.sizes={a:bound-1,b:1};assert.equal(validateEvidenceManifest(value,scope),value);value.sizes.b=2;assert.throws(()=>validateEvidenceManifest(value,scope),/free-evidence-too-large/);
});
for(const mode of ['missing','extra','same-count-other-key'])test(`sizes require exact reference membership: ${mode}`,()=>rejects(value=>{
 if(mode==='missing')delete value.sizes.b;else if(mode==='extra')value.sizes.c=1;else value.sizes={a:10,c:20};
},'invalid-free-evidence-sizes'));
for(const table of ['refVersions','sizes']){
 for(const invalid of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1',null])test(`${table} rejects invalid scalar ${String(invalid)}`,()=>rejects(value=>{value[table].a=invalid;},'invalid-free-evidence-piece-version'));
 for(const invalid of [null,[],1])test(`${table} rejects malformed map ${JSON.stringify(invalid)}`,()=>rejects(value=>{value[table]=invalid;},'free-evidence-capacity'));
 test(`${table} rejects malformed ID before corresponding value validation`,()=>rejects(value=>{value[table]={'bad key':0};},'invalid-id'));
 test(`${table} rejects more than 100k rows before row validation`,()=>rejects(value=>{value[table]=Object.fromEntries(Array.from({length:100001},(_,i)=>['r'+i,0]));},'free-evidence-capacity'));
}
test('reference version may not exceed manifest revision; sizes are independent positive lengths',()=>{
 rejects(value=>{value.refVersions.a=3;},'invalid-free-evidence-piece-version');const value=fixture();value.sizes.a=1000;assert.equal(validateEvidenceManifest(value,scope),value);
});
for(const change of [v=>v.scopeKey=normalizedScope(scopeOf('B')).key,v=>v.format='wrong',v=>v.revision=0,v=>v.revision=1.5])test('scope/format/revision fails before malformed source and maps',()=>rejects(value=>{change(value);value.sources=null;value.refVersions=null;},'invalid-free-evidence-manifest'));
for(const invalid of [null,[],{'events_gg':1},{'unknown_ab':1},{'events_AB':1},{'events_ab':0},{'events_ab':-1},{'events_ab':1.5},{'events_ab':3}])test(`index rejects invalid structure ${JSON.stringify(invalid)}`,()=>rejects(value=>{value.indexVersions=invalid;},'invalid-free-evidence-index-manifest'));
test('index capacity rejects 1025 entries before their invalid keys',()=>rejects(value=>{value.indexVersions=Object.fromEntries(Array.from({length:1025},(_,i)=>['wrong'+i,1]));},'invalid-free-evidence-index-manifest'));
for(const table of ['events','hints','coverage'])for(const invalid of [undefined,-1,1.5,100001])test(`counts ${table} rejects ${String(invalid)}`,()=>rejects(value=>{value.counts[table]=invalid;},'free-evidence-capacity'));
test('counts permit exact 100k and zero, but not missing object',()=>{
 const value=fixture();value.counts={events:100000,hints:0,coverage:100000};assert.equal(validateEvidenceManifest(value,scope),value);rejects(v=>{delete v.counts;},'free-evidence-capacity');
});
test('validation preserves source, ref, size, index, counts, membership, aggregate error precedence',()=>{
 rejects(v=>{v.sources=null;v.refVersions={'bad key':0};},'free-evidence-capacity');
 rejects(v=>{v.refVersions={'bad key':0};v.sizes=null;},'invalid-id');
 rejects(v=>{v.refVersions.a=0;v.sizes={'bad key':0};},'invalid-free-evidence-piece-version');
 rejects(v=>{v.sizes.a=0;v.indexVersions=null;},'invalid-free-evidence-piece-version');
 rejects(v=>{v.indexVersions=null;v.counts=null;},'invalid-free-evidence-index-manifest');
 rejects(v=>{v.counts=null;delete v.sizes.b;},'free-evidence-capacity');
 rejects(v=>{v.sizes={a:bound+1};},'invalid-free-evidence-sizes');
});
