import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {j4AfterEvidenceScenario,j4CodecScenario,j4BeforeNativeCommitScenario,j4Status} from './j4-package-journey.mjs';
const flag='FREE_J4_UNPREPARED_AFTER_EVIDENCE_CODEC';
const selectors=[j4AfterEvidenceScenario,j4CodecScenario,j4BeforeNativeCommitScenario];
const conflicts=['FREE_J4_UNPREPARED_AFTER_EVIDENCE','FREE_J4_AFTER_EVIDENCE','FREE_J4_BEFORE_NATIVE_COMMIT','FREE_J4_CODEC_ROUNDTRIP','FREE_J4_CODEC_BEFORE_EVIDENCE','FREE_J4_SCOPE_TRACE','FREE_J4_READ_BUDGET_TRACE','FREE_J4_LIFECYCLE_ORDER_TRACE','FREE_J4_NATURAL_ENTRY_RECOVERY','FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY'];
test('standalone codec slice selects after-evidence and no baseline budget preparation',()=>{
 const env=Object.freeze({[flag]:'1'}),scenario=j4AfterEvidenceScenario(env);
 assert.deepEqual(scenario,{afterEvidence:true,preparedBudget:false,scenario:'UNPREPARED_AFTER_EVIDENCE_CODEC'});
 assert.equal(Object.isFrozen(scenario),true);assert.equal(j4CodecScenario(env),'AFTER_EVIDENCE');assert.equal(j4BeforeNativeCommitScenario(env),false);
 assert.equal(j4Status([{status:'PASS'}]),'PARTIAL_J4_NOT_ACCEPTED');
});
for(const key of conflicts)test('new codec slice rejects simultaneous '+key+' in every selector',()=>{
 for(const select of selectors)assert.throws(()=>select({[flag]:'1',[key]:'1'}),/unprepared-after-evidence-codec-requires-exclusive-journey/);
});
for(const value of [undefined,'','0','true',true,1])test('inactive codec flag preserves all old scenario meanings: '+String(value),()=>{
 for(const prior of [{},{FREE_J4_AFTER_EVIDENCE:'1'},{FREE_J4_UNPREPARED_AFTER_EVIDENCE:'1'},{FREE_J4_CODEC_BEFORE_EVIDENCE:'1'},{FREE_J4_BEFORE_NATIVE_COMMIT:'1'},{FREE_J4_AFTER_EVIDENCE:'1',FREE_J4_CODEC_ROUNDTRIP:'1'}])for(const select of selectors)assert.deepEqual(select({...prior,[flag]:value}),select(prior));
 assert.throws(()=>j4CodecScenario({[flag]:value,FREE_J4_CODEC_ROUNDTRIP:'1'}),/requires-after-evidence/);
});
test('inactive conflicts neither prepare budget nor drop the codec roundtrip',()=>{
 const env=Object.fromEntries(conflicts.map(key=>[key,'0']));env[flag]='1';
 assert.equal(j4AfterEvidenceScenario(env).preparedBudget,false);assert.equal(j4AfterEvidenceScenario(env).afterEvidence,true);assert.equal(j4CodecScenario(env),'AFTER_EVIDENCE');
});
test('actual journey passes selectors to existing interruption and archived codec consumers',async()=>{
 const source=await readFile(new URL('./j4-package-journey.mjs',import.meta.url),'utf8');
 assert(source.includes('const afterEvidenceScenario=j4AfterEvidenceScenario(process.env);'));
 assert(source.includes('const codecScenario=j4CodecScenario(process.env);'));
 const evidence=source.match(/await runJ4EvidenceInterruption\(\{([^\n]+)\}\);/),joint=source.match(/await runJ4JointInterruption\(\{([^\n]+)\}\);/);
 assert(evidence);assert(joint);assert(evidence[1].includes('preparedBudget:afterEvidenceScenario.preparedBudget'));
 assert(joint[1].includes('afterEvidence:afterEvidenceScenario.afterEvidence'));
 assert(joint[1].includes('codecRoundTrip:codecScenario?({pending,committedReceipt,afterEvidence})=>probeJ4HistoricalCodec('));
 assert(source.includes('report.preparationScenario=afterEvidenceScenario.scenario;'));assert(source.includes('report.codecScenario=codecScenario;'));
});
