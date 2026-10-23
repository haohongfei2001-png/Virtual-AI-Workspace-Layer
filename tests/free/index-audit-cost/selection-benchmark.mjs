/** Pure freshly-validated-snapshot compute diagnostic. No browser/CI acceptance. */
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildNativeVersionIndex,materializeNativeVersionIndex,snapshotNativeIndexRoot,snapshotNativeIndexPiece} from '../../../src/data/native-version-index.mjs';
import {NATIVE_PARTITION_FORMAT} from '../../../src/data/native-partitions.mjs';
import {A,scopeKey,refId,projectId,variant,cleanup} from './fixture.mjs';
const count=10000,manifest={format:NATIVE_PARTITION_FORMAT,scopeKey,revision:234,sources:{},projects:{[projectId]:1},refs:Object.fromEntries(Array.from({length:count},(_,i)=>[refId(i),1])),units:count*500,changes:[]};
const built=buildNativeVersionIndex(manifest,A),root=snapshotNativeIndexRoot(built.root,A),records=built.records.map(row=>snapshotNativeIndexPiece(row,root,row.payload.kind,row.payload.bucket));
const baseline=options=>{const all=materializeNativeVersionIndex(root,A,records),projects=Object.keys(all.projects),refs=Object.keys(all.refs);return {projects:projects.slice(options.offset,options.offset+options.limit),refs:refs.slice(Math.max(0,options.offset-projects.length),Math.max(0,options.offset+options.limit-projects.length))};};
const integrated=await variant('candidate'),candidateRoot=integrated.index.snapshotNativeIndexRoot(built.root,A),candidateRecords=built.records.map(row=>integrated.index.snapshotNativeIndexPiece(row,candidateRoot,row.payload.kind,row.payload.bucket));
const candidate=options=>integrated.selectNativeIndexPage(candidateRoot,A,candidateRecords,options),options=Array.from({length:21},(_,i)=>({offset:i*500,limit:500})),expected=options.map(baseline);
for(const option of options)assert.deepEqual(candidate(option),baseline(option));
const samples=[];for(let pair=0;pair<3;pair++)for(const [name,fn] of pair%2?[['candidate',candidate],['baseline',baseline]]:[['baseline',baseline],['candidate',candidate]]){const start=performance.now();const results=[];for(let audit=0;audit<2;audit++)results.push(options.map(fn));const elapsedMs=performance.now()-start;assert.deepEqual(results,[expected,expected]);samples.push({pair,variant:name,pages:42,elapsedMs});}
const median=name=>samples.filter(row=>row.variant===name).map(row=>row.elapsedMs).sort((a,b)=>a-b)[1],report={kind:'PURE_SELECTION_COMPUTE_NOT_BROWSER_OR_AUDIT_ACCEPTANCE',node:process.version,count,buckets:records.length,scope:'Already freshly verified immutable snapshots; IDB, bucket byte validation, fact reads, broker and UI are outside timed work. Both paths independently visit every bucket and global ordinal on every page. No cross-page cache.',samples,medianMs:{baseline:median('baseline'),candidate:median('candidate')},selectionDigest:createHash('sha256').update(JSON.stringify(expected)).digest('hex'),fullInventoryMapEntriesConstructed:{baseline:42*(count+1),candidate:0},globalOrdinalsVisitedPerVariant:42*(count+1)};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

cleanup();
