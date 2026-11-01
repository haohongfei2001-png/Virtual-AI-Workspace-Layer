import test from 'node:test';
import assert from 'node:assert/strict';
import {j4AfterEvidenceScenario} from './j4-package-journey.mjs';
const flag='FREE_J4_UNPREPARED_AFTER_EVIDENCE';
const defaults={afterEvidence:false,preparedBudget:false,scenario:'DEFAULT_J4'};
test('default J4 still uses before-evidence interruption without preparation',()=>{
 assert.deepEqual(j4AfterEvidenceScenario(),defaults);
 assert.deepEqual(j4AfterEvidenceScenario({}),defaults);
});
test('original after-evidence flag retains its explicitly prepared budget behavior',()=>{
 assert.deepEqual(j4AfterEvidenceScenario({FREE_J4_AFTER_EVIDENCE:'1'}),{afterEvidence:true,preparedBudget:true,scenario:'PREPARED_BUDGET_AFTER_EVIDENCE_NOT_DEFAULT_J4'});
});
test('explicit unprepared after-evidence mode changes only interruption boundary',()=>{
 const env={[flag]:'1'};
 assert.deepEqual(j4AfterEvidenceScenario(env),{afterEvidence:true,preparedBudget:false,scenario:'UNPREPARED_AFTER_EVIDENCE'});
 assert.deepEqual(env,{[flag]:'1'});
});
for(const value of [undefined,'','0','true',true,1])test('only string one enables the new boundary: '+String(value),()=>{
 assert.deepEqual(j4AfterEvidenceScenario({[flag]:value}),defaults);
});
const conflicts=['FREE_J4_AFTER_EVIDENCE','FREE_J4_BEFORE_NATIVE_COMMIT','FREE_J4_CODEC_ROUNDTRIP','FREE_J4_CODEC_BEFORE_EVIDENCE','FREE_J4_SCOPE_TRACE','FREE_J4_READ_BUDGET_TRACE','FREE_J4_LIFECYCLE_ORDER_TRACE','FREE_J4_NATURAL_ENTRY_RECOVERY','FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY'];
for(const other of conflicts)test('unprepared after-evidence rejects '+other,()=>{
 assert.throws(()=>j4AfterEvidenceScenario({[flag]:'1',[other]:'1'}));
});
test('inactive conflicting flags do not silently select a different preparation mode',()=>{
 const env=Object.fromEntries(conflicts.map(key=>[key,'0']));env[flag]='1';
 assert.deepEqual(j4AfterEvidenceScenario(env),{afterEvidence:true,preparedBudget:false,scenario:'UNPREPARED_AFTER_EVIDENCE'});
});
test('historical after-evidence codec selection retains original prepared semantics',()=>{
 assert.deepEqual(j4AfterEvidenceScenario({FREE_J4_AFTER_EVIDENCE:'1',FREE_J4_CODEC_ROUNDTRIP:'1'}),{afterEvidence:true,preparedBudget:true,scenario:'PREPARED_BUDGET_AFTER_EVIDENCE_NOT_DEFAULT_J4'});
});
