import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDataset, wilsonInterval, evaluateFindability} from '../../src/pro/organize/evaluation.mjs';

// These rows test the arithmetic/gates. They are fabricated test inputs, NOT an
// evaluated natural dataset, quality approval or a report suitable for release.
function arithmeticRows(count = 1000, provenance = 'natural-consented') {
  return Array.from({length: count}, (_, i) => ({id: 'math_fixture_' + i, lane: ['existing-topic', 'new-topic', 'related', 'derived-title'][i % 4],
    split: 'final', provenance, decision: 'automatic', eligible: true, correct: true, directlyAccepted: true,
    userGroup: 'user_' + i, objectGroup: 'object_' + i, seriesGroup: 'series_' + i, timePartition: 'partition_' + i,
    annotators: ['annotator_one', 'annotator_two'], annotationAgreement: true, costMicros: 1, latencyMs: 20}));
}
const binding = {modelVersion: 'math-fixture-only', promptVersion: 'p1', outputSchemaVersion: 'vaiwl-pro-model-output/1'};
const evaluate = rows => evaluateDataset({samples: rows, eligibleCohortIds: rows.map(row => row.id), modelBinding: binding, mandatoryCounterexamplesPassed: true});

test('confidence interval and sample floor prevent tiny perfect subsets from enabling auto', () => {
  assert.ok(wilsonInterval(1, 1).low < 0.3); assert.ok(wilsonInterval(200, 200).low >= 0.98);
  const report = evaluate(arithmeticRows(100)); assert.ok(Object.values(report.lanes).every(lane => lane.qualified === false));
  const eligible = evaluate(arithmeticRows()); assert.ok(Object.values(eligible.lanes).every(lane => lane.qualified === true));
  assert.equal(eligible.status, 'evaluated-unapproved'); assert.equal('approvedByOwner' in eligible, false);
});

test('synthetic engineering fixtures never count as Chinese model quality', () => {
  const report = evaluate(arithmeticRows(1200, 'synthetic'));
  assert.equal(report.naturalSampleCount, 0); assert.equal(report.syntheticSampleCount, 1200);
  assert.equal(report.status, 'synthetic-only-not-quality-evidence'); assert.ok(Object.values(report.lanes).every(lane => !lane.qualified));
});

test('split leakage, disagreement, failed counterexamples, and missing eligible denominator close gate', () => {
  let rows = arithmeticRows(); rows[0].split = 'development'; rows[1].userGroup = rows[0].userGroup;
  assert.equal(evaluate(rows).leakage, true); assert.ok(Object.values(evaluate(rows).lanes).every(lane => !lane.qualified));
  rows = arithmeticRows(); rows[0].annotationAgreement = false; assert.equal(evaluate(rows).cohortComplete, false);
  const failed = evaluateDataset({samples: arithmeticRows(), eligibleCohortIds: arithmeticRows().map(r => r.id), modelBinding: binding, mandatoryCounterexamplesPassed: false});
  assert.ok(Object.values(failed.lanes).every(lane => !lane.qualified));
  const missing = evaluateDataset({samples: arithmeticRows(), eligibleCohortIds: ['not_present'], modelBinding: binding, mandatoryCounterexamplesPassed: true});
  assert.equal(missing.cohortComplete, false);
});

test('NEW_TOPIC precision is independent and bad new-topic decisions cannot borrow existing lane quality', () => {
  const rows = arithmeticRows(); for (const row of rows) if (row.lane === 'new-topic') row.correct = false;
  const report = evaluate(rows); assert.equal(report.lanes['new-topic'].qualified, false); assert.equal(report.lanes['existing-topic'].qualified, true);
});

test('findability requires task/participant floor, 20 percent median reduction and no error increase', () => {
  const base = {nativeTimesMs: Array(60).fill(1000), proTimesMs: Array(60).fill(750), nativeErrors: 2, proErrors: 2, participantCount: 12};
  assert.equal(evaluateFindability(base).targetMet, true); assert.equal(evaluateFindability({...base, proErrors: 3}).targetMet, false);
  assert.equal(evaluateFindability({...base, participantCount: 11}).targetMet, false);
});
