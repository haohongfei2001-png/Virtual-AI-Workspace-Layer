import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {A} from '../b23/contracts.mjs';
import {evidenceHeader,evidenceRecord,evidencePieceKey,validateEvidenceManifest} from '../../src/data/free-evidence-partitions.mjs';
import {validateFreeEvidence} from '../../src/data/free-evidence.mjs';
import {auditEvidencePartitions} from '../../src/data/evidence-partition-audit.mjs';
const scope=normalizedScope(A),now='2026-10-13T12:00:00Z',until='2026-10-14T00:00:00Z',tables=['events','hints','coverage'];
function fixture(count=5001){
 const witness={sourceId:'audit_fixture',generation:'one',sourceRevision:1,observedAt:now,revoked:false};
 const manifest={format:'vaiwl-free-evidence-partitions-v1',scopeKey:scope.key,revision:1,sources:{audit_fixture:{id:'audit_fixture',generation:'one',sourceRevision:1,observedAt:now,validUntil:until,channel:'synthetic',revoked:false}},refVersions:{},sizes:{},indexVersions:{},counts:{events:count,hints:count,coverage:count}},rows=new Map(),facts=evidenceHeader(manifest,scope);
 for(let i=0;i<count;i++){const ref='R'+i,event={...witness,id:'E'+i,conversationId:ref,messageId:'M'+i,branchId:'branch',actorVerified:true,actorScopeKey:scope.key,role:'user',kind:'new-send',sendState:'committed',precision:'second',sentAt:now},hint={...witness,id:'H'+i,conversationId:ref,eventKey:'K'+i,hintType:'local-confirmed-send',validUntil:until,candidateInterval:null,actorVerified:true,actorScopeKey:scope.key},coverage={...witness,id:'C'+i,conversationId:ref,from:now,through:now,completeness:'complete',branches:'all',gaps:[]};
  const piece={scopeKey:scope.key,ref,revision:1,events:{[event.id]:event},hints:{[hint.id]:hint},coverage:{[coverage.id]:coverage}};manifest.refVersions[ref]=1;manifest.sizes[ref]=JSON.stringify(piece).length;rows.set(evidencePieceKey(scope.key,ref,1),evidenceRecord(evidencePieceKey(scope.key,ref,1),piece));for(const table of tables)Object.assign(facts[table],piece[table]);
 }
 validateEvidenceManifest(manifest,scope);validateFreeEvidence(facts,scope);return {manifest,rows,facts,count};
}
function mutateTail(f,fn){const key=evidencePieceKey(scope.key,'R5000',1),piece=structuredClone(f.rows.get(key).payload);fn(piece);f.manifest.sizes.R5000=JSON.stringify(piece).length;f.rows.set(key,evidenceRecord(key,piece));}
async function run(f,{cancelAtTail=false}={}){let reads=0,doneCalls=0,failCalls=0,authorized=true;const store={get(key){reads++;if(cancelAtTail&&key===evidencePieceKey(scope.key,'R5000',1))authorized=false;const request={};queueMicrotask(()=>{request.result=structuredClone(f.rows.get(key));request.onsuccess();});return request;}};const result=await new Promise(resolve=>auditEvidencePartitions(store,f.manifest,scope,()=>{if(!authorized)throw Error('stale-binding');},stats=>{doneCalls++;resolve({stats});},error=>{failCalls++;resolve({error});}));await Promise.resolve();return {...result,reads,doneCalls,failCalls};}
test('5001-ref audit equals full evidence JSON oracle and counts all three tables',async()=>{const f=fixture(),before=structuredClone(f.manifest),r=await run(f);assert.equal(r.error,undefined);assert.equal(r.doneCalls,1);assert.equal(r.failCalls,0);assert.equal(r.reads,5001);assert.equal(r.stats.refCount,5001);assert.equal(r.stats.evidenceJSONLength,JSON.stringify(f.facts).length);assert.deepEqual(r.stats.counts,f.manifest.counts);assert.deepEqual(f.manifest,before);});
test('empty evidence audit preserves source metadata size with no piece reads',async()=>{const f=fixture(0),r=await run(f);assert.equal(r.error,undefined);assert.equal(r.stats.evidenceJSONLength,JSON.stringify(f.facts).length);assert.deepEqual(r.stats.counts,{events:0,hints:0,coverage:0});assert.equal(r.reads,0);});
test('last piece checksum corruption cannot complete full audit',async()=>{const f=fixture(),row=f.rows.get(evidencePieceKey(scope.key,'R5000',1));row.checksum='0'.repeat(64);const r=await run(f);assert.match(r.error.message,/corrupt/);assert.equal(r.reads,5001);assert.equal(r.doneCalls,0);assert.equal(r.failCalls,1);});
for(const table of tables)test('global duplicate '+table+' ID across batch boundary is rejected',async()=>{const f=fixture();mutateTail(f,p=>{const row=Object.values(p[table])[0],first=Object.keys(f.facts[table])[0];p[table]={[first]:{...row,id:first}};});const r=await run(f);assert(r.error,'global ID collision must not be accepted');assert.equal(r.doneCalls,0);assert.equal(r.failCalls,1);assert.equal(r.reads,5001);});
test('distinct hint IDs sharing source and eventKey across batches are rejected',async()=>{const f=fixture();mutateTail(f,p=>{p.hints.H5000.eventKey='K0';});const r=await run(f);assert.match(r.error.message,/duplicate.*hint|hint.*duplicate/);assert.equal(r.doneCalls,0);assert.equal(r.failCalls,1);assert.equal(r.reads,5001);});
test('manifest total count must match actual validated rows',async()=>{const f=fixture();f.manifest.counts.events--;const r=await run(f);assert(r.error);assert.equal(r.doneCalls,0);assert.equal(r.failCalls,1);});
test('second batch authority loss prevents completed audit',async()=>{const f=fixture(),r=await run(f,{cancelAtTail:true});assert.equal(r.error.message,'stale-binding');assert.equal(r.reads,5001);assert.equal(r.doneCalls,0);assert.equal(r.failCalls,1);});

test('empty inventory cannot satisfy nonzero manifest counts',async()=>{const f=fixture(0);f.manifest.counts.hints=1;const r=await run(f);assert(r.error);assert.equal(r.reads,0);assert.equal(r.doneCalls,0);assert.equal(r.failCalls,1);});
test('one ref with multiple rows counts rows rather than references',async()=>{const f=fixture(1),key=evidencePieceKey(scope.key,'R0',1),piece=f.rows.get(key).payload;for(const table of tables){const row=Object.values(piece[table])[0],id=row.id+'_second';piece[table][id]={...row,id,...(table==='hints'?{eventKey:'other_event'}:{})};f.facts[table][id]=piece[table][id];f.manifest.counts[table]++;}f.manifest.sizes.R0=JSON.stringify(piece).length;f.rows.set(key,evidenceRecord(key,piece));validateFreeEvidence(f.facts,scope);const r=await run(f);assert.equal(r.error,undefined);assert.equal(r.stats.refCount,1);assert.deepEqual(r.stats.counts,{events:2,hints:2,coverage:2});assert.equal(r.stats.evidenceJSONLength,JSON.stringify(f.facts).length);});
test('throwing completion callback fails exactly once',()=>{const f=fixture(0);let done=0,failed=0;auditEvidencePartitions({get(){throw Error('unexpected-read');}},f.manifest,scope,()=>{},()=>{done++;throw Error('consumer-failure');},error=>{failed++;assert.equal(error.message,'consumer-failure');});assert.equal(done,1);assert.equal(failed,1);});
test('legal piece-size manifest and legal batches cannot hide global evidence overflow from sources',async t=>{
 const f=fixture(0),limit=128*1024*1024,count=6000;
 const source=f.manifest.sources.audit_fixture;
 for(let i=0;i<20000-1;i++){const id='source_'+i;f.manifest.sources[id]={...source,id};}
 const gap={from:now,through:now},ref='R5999';
 const make=(id,gaps)=>({scopeKey:scope.key,ref:id,revision:1,events:{},hints:{},coverage:{['C'+id]:{id:'C'+id,sourceId:'audit_fixture',generation:'one',sourceRevision:1,observedAt:now,revoked:false,conversationId:id,from:now,through:now,completeness:'partial',branches:'observed',gaps}}});
 // Choose one legal common gap count just below the piece-sum ceiling. Source
 // metadata is not in those piece sizes, but must count in the full evidence.
 let gapCount=0;while(JSON.stringify(make(ref,Array(gapCount+1).fill(gap))).length*count<=limit)gapCount++;
 assert(gapCount<=1000);const gaps=Array(gapCount).fill(gap),facts=evidenceHeader(f.manifest,scope),first=evidenceHeader(f.manifest,scope),last=evidenceHeader(f.manifest,scope);
 for(let i=0;i<count;i++){const id='R'+i,piece=make(id,gaps),row=piece.coverage['C'+id];f.manifest.refVersions[id]=1;f.manifest.sizes[id]=JSON.stringify(piece).length;facts.coverage[row.id]=row;(i<5000?first:last).coverage[row.id]=row;}
 f.manifest.counts={events:0,hints:0,coverage:count};validateEvidenceManifest(f.manifest,scope);
 assert(Object.values(f.manifest.sizes).reduce((a,b)=>a+b,0)<=limit);
 const fullJSONLength=JSON.stringify(facts).length;assert(fullJSONLength>limit,'independent whole-state JSON must exceed limit');t.diagnostic(JSON.stringify({pieceSizeSum:Object.values(f.manifest.sizes).reduce((a,b)=>a+b,0),fullJSONLength,firstBatchJSONLength:JSON.stringify(first).length,lastBatchJSONLength:JSON.stringify(last).length,limit,refs:count,sources:Object.keys(f.manifest.sources).length,gapCount}));
 assert.throws(()=>validateFreeEvidence(facts,scope),/free-evidence-too-large/);
 validateFreeEvidence(first,scope);validateFreeEvidence(last,scope);
 let reads=0,successes=0,failures=0;const store={get(key){reads++;const [,kind,id]=JSON.parse(key);assert.equal(kind,'free-evidence-piece');const request={};queueMicrotask(()=>{request.result=evidenceRecord(key,make(id,gaps));request.onsuccess();});return request;}};
 const error=await new Promise(resolve=>auditEvidencePartitions(store,f.manifest,scope,()=>{},()=>{successes++;resolve(null);},error=>{failures++;resolve(error);}));
 assert.equal(error?.message,'free-evidence-too-large');assert.equal(reads,count);assert.equal(successes,0);assert.equal(failures,1);
});
