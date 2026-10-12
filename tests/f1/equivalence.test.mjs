import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { persistentSeed } from '../../simulator/persistent-seed.mjs';
import { scopeOf,FIXTURE_NOW } from '../../simulator/data.mjs';
import { dataProjection } from '../../src/data/evidence.mjs';
/** Differential against the immutable accepted parent, plus the independent existing time/evidence contracts. */
test('F1 indexed projection is identical to accepted pre-optimization across evidence edge cases',async()=>{
 const dir=mkdtempSync('/tmp/vaiwl-f1-equivalence-');
 try{const original=execFileSync('git',['show','38ea47dbd85a51951c3b5dbd283d2b088288b3f4:src/data/evidence.mjs'],{encoding:'utf8'}),helper=pathToFileURL(new URL('../../src/navigation/projection.mjs',import.meta.url).pathname).href;
  writeFileSync(dir+'/baseline.mjs',original.replace('../navigation/projection.mjs',helper));const {dataProjection:baseline}=await import(pathToFileURL(dir+'/baseline.mjs'));
  const transformations=[s=>{},s=>s.sources.fixture_v1.revoked=true,s=>s.events.event_T0.revoked=true,s=>s.coverage.coverage_T0.revoked=true,s=>{s.events.conflict={...s.events.event_T0,id:'conflict',sentAt:'2026-10-09T08:00:00Z'};},s=>{s.events.undated={...s.events.event_T0,id:'undated',messageId:'undated',sentAt:null,precision:'unknown'};},s=>{s.coverage.coverage_T0.gaps=[{from:'2026-10-10T00:00:00Z',through:'2026-10-10T03:00:00Z'}];},s=>{for(const p of Object.values(s.placements))if(p.refId==='T0')p.excluded=true;}];
  for(const account of ['A','B'])for(const zone of ['Asia/Shanghai','America/New_York'])for(const transform of transformations){const state=persistentSeed(scopeOf(account),'https://vaiwl-hf.test');transform(state);assert.deepEqual(dataProjection(state,FIXTURE_NOW,zone),baseline(state,FIXTURE_NOW,zone));}
 }finally{rmSync(dir,{recursive:true});}
});
